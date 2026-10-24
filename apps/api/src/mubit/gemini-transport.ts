import { randomUUID } from 'node:crypto';

type Json = Record<string, any>;
const CALL_PREFIX = 'gemini_v1_';

export class GeminiTransportError extends Error {
  constructor(message: string, readonly status?: number, readonly headers?: Headers) {
    super(message);
    this.name = 'GeminiTransportError';
  }
}

/**
 * Native Gemini REST transport (https://docs.mubit.ai/guides/connect-gemini).
 * Tool IDs are opaque history envelopes: the first call carries the complete
 * original model parts, preserving thought signatures and parallel-call order
 * through the application's Responses/Chat Completions translation. Never
 * truncate or replace these IDs. Text-only final-response signatures cannot be
 * retained by that translation; Gemini does not require those signatures.
 */
export async function executeGemini(args: {
  baseURL: string;
  apiKey: string;
  body: Json;
  headers?: Record<string, string>;
}): Promise<{ data: Json; response: Response }> {
  const model = args.body.model;
  if (typeof model !== 'string' || !/^(?:models\/)?gemini-[A-Za-z0-9._-]+$/.test(model)) {
    throw new GeminiTransportError('Native Gemini transport requires a Gemini model ID.');
  }
  const nativeBody = toGeminiRequest(args.body);
  const base = new URL(args.baseURL);
  if (base.username || base.password || base.search || base.hash) throw new GeminiTransportError('Invalid Gemini base URL.');
  const path = base.pathname.replace(/\/$/, '').replace(/\/v1beta$/, '');
  base.pathname = `${path}/v1beta/models/${model.replace(/^models\//, '')}:generateContent`;
  const headers = new Headers(args.headers);
  // Only the configured Mubit key is sent, never a second provider credential.
  headers.delete('authorization');
  headers.delete('x-api-key');
  headers.set('x-goog-api-key', args.apiKey);
  headers.set('content-type', 'application/json');
  let response: Response;
  let data: Json;
  try {
    response = await fetch(base, { method: 'POST', headers, body: JSON.stringify(nativeBody), signal: AbortSignal.timeout(120_000), redirect: 'error' });
    if (!response.ok) {
      // Provider error bodies can echo credentials or request content.
      await response.body?.cancel();
      throw new GeminiTransportError(`Gemini inference failed (HTTP ${response.status}).`, response.status, response.headers);
    }
    data = await response.json() as Json;
  } catch (error) {
    if (error instanceof GeminiTransportError) throw error;
    const timeout = error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name);
    throw new GeminiTransportError(timeout ? 'Gemini inference timed out.' : 'Gemini inference request failed.');
  }
  return { data: fromGeminiResponse(data, model), response };
}

function textParts(content: unknown): Json[] {
  if (content == null) return [];
  if (typeof content === 'string') return content ? [{ text: content }] : [];
  if (!Array.isArray(content)) throw new GeminiTransportError('Unsupported Gemini message content.');
  return content.map((part: Json) => {
    if (part.type !== 'text' || typeof part.text !== 'string') throw new GeminiTransportError('Native Gemini transport supports text message content only.');
    return { text: part.text };
  });
}

function decodeCall(id: string): Json | null {
  if (!id.startsWith(CALL_PREFIX)) return null;
  try {
    const envelope = JSON.parse(Buffer.from(id.slice(CALL_PREFIX.length), 'base64url').toString('utf8'));
    if (!envelope.part?.functionCall || (envelope.parts && !Array.isArray(envelope.parts))) throw new Error();
    return envelope;
  } catch { throw new GeminiTransportError('Invalid Gemini tool history ID.'); }
}

function parseArguments(value: unknown): Json {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch { throw new GeminiTransportError('Gemini tool arguments must be a JSON object.'); }
}

export function toGeminiRequest(body: Json): Json {
  if (body.stream) throw new GeminiTransportError('Native Gemini transport does not support streaming.');
  if (body.parallel_tool_calls === false) throw new GeminiTransportError('Native Gemini transport cannot disable parallel tool calls.');
  if (!Array.isArray(body.messages)) throw new GeminiTransportError('Gemini request requires messages.');
  const contents: Json[] = [];
  const system: Json[] = [];
  const calls = new Map<string, Json>();
  for (const message of body.messages as Json[]) {
    if (message.role === 'system' || message.role === 'developer') { system.push(...textParts(message.content)); continue; }
    if (message.role === 'tool') {
      const call = calls.get(message.tool_call_id);
      if (!call) throw new GeminiTransportError('Gemini tool result has no matching function call.');
      let result: unknown = message.content;
      try { result = JSON.parse(message.content); } catch { /* Plain tool output is valid. */ }
      const part = { functionResponse: { name: call.name, ...(call.id ? { id: call.id } : {}), response: result && typeof result === 'object' && !Array.isArray(result) ? result : { result } } };
      const previous = contents.at(-1);
      if (previous?.role === 'user' && previous.parts.every((p: Json) => p.functionResponse)) previous.parts.push(part);
      else contents.push({ role: 'user', parts: [part] });
      continue;
    }
    if (message.role !== 'assistant' && message.role !== 'user') throw new GeminiTransportError('Unsupported Gemini message role.');
    let parts = textParts(message.content);
    const toolCalls = message.tool_calls ?? [];
    if (toolCalls.length) {
      const restored = decodeCall(toolCalls[0].id);
      if (restored?.parts) parts = restored.parts;
      for (const tool of toolCalls) {
        if (tool.type !== 'function') throw new GeminiTransportError('Unsupported Gemini tool call type.');
        const history = decodeCall(tool.id);
        const part = history?.part ?? { functionCall: { name: tool.function.name, args: parseArguments(tool.function.arguments) } };
        calls.set(tool.id, part.functionCall);
        if (!restored?.parts) parts.push(part);
      }
    }
    if (parts.length) contents.push({ role: message.role === 'assistant' ? 'model' : 'user', parts });
  }
  const config: Json = {};
  if (body.max_completion_tokens != null || body.max_tokens != null) config.maxOutputTokens = body.max_completion_tokens ?? body.max_tokens;
  if (body.temperature != null) config.temperature = body.temperature;
  if (body.top_p != null) config.topP = body.top_p;
  if (body.stop != null) config.stopSequences = Array.isArray(body.stop) ? body.stop : [body.stop];
  if (body.reasoning_effort) {
    const levels: Record<string, string> = { none: 'minimal', minimal: 'minimal', low: 'low', medium: 'medium', high: 'high', xhigh: 'high' };
    if (!levels[body.reasoning_effort]) throw new GeminiTransportError('Unsupported Gemini reasoning effort.');
    config.thinkingConfig = { thinkingLevel: levels[body.reasoning_effort] };
  }
  if (body.response_format?.type === 'json_schema') {
    config.responseMimeType = 'application/json';
    config.responseJsonSchema = body.response_format.json_schema.schema;
  } else if (body.response_format?.type === 'json_object') config.responseMimeType = 'application/json';
  else if (body.response_format && body.response_format.type !== 'text') throw new GeminiTransportError('Unsupported Gemini response format.');
  const request: Json = { contents, ...(system.length ? { systemInstruction: { parts: system } } : {}), ...(Object.keys(config).length ? { generationConfig: config } : {}) };
  if (body.tools?.length) {
    request.tools = [{ functionDeclarations: body.tools.map((tool: Json) => {
      if (tool.type !== 'function') throw new GeminiTransportError('Native Gemini supports function tools only.');
      return { name: tool.function.name, ...(tool.function.description ? { description: tool.function.description } : {}), ...(tool.function.parameters ? { parametersJsonSchema: tool.function.parameters } : {}) };
    }) }];
    const choice = body.tool_choice ?? 'auto';
    const mode = choice === 'auto' ? 'AUTO' : choice === 'none' ? 'NONE' : choice === 'required' || choice?.type === 'function' ? 'ANY' : null;
    if (!mode) throw new GeminiTransportError('Unsupported Gemini tool choice.');
    request.toolConfig = { functionCallingConfig: { mode, ...(choice?.type === 'function' ? { allowedFunctionNames: [choice.function.name] } : {}) } };
  }
  return request;
}

export function fromGeminiResponse(data: Json, model: string): Json {
  if (!data || typeof data !== 'object') throw new GeminiTransportError('Gemini returned an invalid response.');
  const candidates = data.candidates ?? [];
  if (!candidates.length) throw new GeminiTransportError(data.promptFeedback?.blockReason ? 'Gemini inference was blocked by the provider content filter.' : 'Gemini returned no candidates.');
  const choices = candidates.map((candidate: Json, index: number) => {
    const parts: Json[] = candidate.content?.parts ?? [];
    const nativeCalls = parts.filter((part) => part.functionCall);
    const toolCalls = nativeCalls.map((part, callIndex) => ({
      id: CALL_PREFIX + Buffer.from(JSON.stringify({ part, index: callIndex, ...(callIndex === 0 ? { parts } : {}) })).toString('base64url'),
      type: 'function', function: { name: part.functionCall.name, arguments: JSON.stringify(part.functionCall.args ?? {}) },
    }));
    const reason = candidate.finishReason;
    const finishReason = reason === 'MAX_TOKENS' ? 'length' : ['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'IMAGE_SAFETY'].includes(reason) ? 'content_filter' : reason === 'STOP' ? toolCalls.length ? 'tool_calls' : 'stop' : null;
    if (!finishReason) throw new GeminiTransportError('Gemini returned an unsuccessful finish reason.');
    return { index, finish_reason: finishReason, message: { role: 'assistant', content: parts.filter((part) => typeof part.text === 'string' && !part.thought).map((part) => part.text).join('') || null, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) } };
  });
  const usage = data.usageMetadata;
  return {
    id: data.responseId ?? `gemini_${randomUUID()}`, object: 'chat.completion', created: Math.floor(Date.now() / 1000), model: data.modelVersion ?? model, provider: 'google', choices,
    ...(usage ? { usage: {
      prompt_tokens: usage.promptTokenCount ?? 0,
      completion_tokens: (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
      total_tokens: usage.totalTokenCount ?? (usage.promptTokenCount ?? 0) + (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
      prompt_tokens_details: { cached_tokens: usage.cachedContentTokenCount ?? 0 },
      completion_tokens_details: { reasoning_tokens: usage.thoughtsTokenCount ?? 0 },
    } } : {}),
  };
}
