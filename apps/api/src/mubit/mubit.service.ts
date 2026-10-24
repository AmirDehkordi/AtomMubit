import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import OpenAI from 'openai';
import type { Response, ResponseCreateParamsNonStreaming, ResponseInputItem } from 'openai/resources/responses/responses';
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions';
import { config } from '../core/config';
import { DbService } from '../db/db.service';
import { inferenceAttempts, llmCalls } from '../db/schema';
import { assertTransportFrozen } from '../agent/frozen';
import { executeGemini } from './gemini-transport';

export type MubitTask = 'desk_agent' | 'section_extractor' | 'feedback_evaluator';
export interface MubitCall {
  task: MubitTask | 'unrecorded';
  promptCacheKey: string;
  runId?: string | null;
  requestId?: string;
}
export interface MubitResult { response: Response; requestId: string | null }
export interface JsonCall<T = unknown> {
  task: 'desk_agent' | 'section_extractor' | 'feedback_evaluator' | 'unrecorded';
  route?: 'openrouter' | 'mubit';
  sessionKey: string;
  requestId?: string;
  runId?: string | null;
  system: string;
  input: string;
  jsonSchema: { name: string; schema: Record<string, unknown> };
  model?: string;
  maxOutputTokens?: number;
  validation?: 'strict' | 'caller';
}
export interface JsonResult<T> {
  value: T;
  requestId: string | null;
  usage: { input: number | null; output: number | null };
  valid: boolean;
  validationError: 'json_parse' | 'schema' | 'truncated' | null;
}
export const DEFAULT_JSON_MAX_OUTPUT_TOKENS = 8_000;

/**
 * Production inference gateway for OpenRouter, native OpenAI, and native Gemini
 * through Mubit. The desk agent retains its internal Responses contract.
 * This adapter intentionally translates the supported subset in both
 * directions and disables SDK retries so attempts remain observable.
 */
@Injectable()
export class MubitService {
  private readonly logger = new Logger(MubitService.name);
  private readonly client = new OpenAI({ apiKey: config.mubitApiKey || 'missing', baseURL: config.mubitBaseUrl, maxRetries: 0, timeout: 120_000 });
  private readonly directClient = new OpenAI({ apiKey: config.openrouterApiKey || 'missing', baseURL: config.openrouterBaseUrl, maxRetries: 0, timeout: 120_000 });

  constructor(private readonly dbs: DbService) { assertTransportFrozen(); }
  get configured(): boolean { return Boolean(config.mubitApiKey); }

  private productionCompletion(body: any, headers: Record<string, string>) {
    if (config.inferenceBackend === 'openrouter') return this.client.chat.completions.create(body, {headers}).withResponse();
    const { ['x-openrouter-metadata']: _ignored, ...nativeHeaders } = headers;
    if (body.model.startsWith('gemini-')) {
      return executeGemini({baseURL: config.mubitGeminiBaseUrl, apiKey: config.mubitApiKey, body, headers: nativeHeaders});
    }
    return this.client.chat.completions.create(nativeOpenAIRequest(body), {headers: nativeHeaders}).withResponse();
  }

  async respond(params: ResponseCreateParamsNonStreaming, call: MubitCall): Promise<MubitResult> {
    if (!this.configured) throw new Error('MUBIT_API_KEY is not set (apps/api/.env).');
    const model = typeof params.model === 'string' ? params.model : config.agentModel;
    let requestId = call.requestId ?? randomUUID();
    const started = performance.now();
    let inputTokens: number | null = null;
    let outputTokens: number | null = null;
    let usageDetails: Record<string, unknown> = {};
    let serving: { provider?: string | null; model?: string | null } = {};
    const headers: Record<string, string> = {
      'x-middleware-request-id': requestId,
      'x-openrouter-metadata': 'enabled',
      ...(!['desk_agent', 'section_extractor'].includes(call.task) ? { 'x-middleware-record': 'off' } : {}),
    };
    try {
      const result = await this.productionCompletion(toChatCompletion(params, call.promptCacheKey), headers);
      const reqId = result.response.headers.get('x-middleware-request-id') ?? result.response.headers.get('x-openrouter-request-id') ?? requestId;
      requestId = reqId;
      inputTokens = result.data.usage?.prompt_tokens ?? null;
      outputTokens = result.data.usage?.completion_tokens ?? null;
      usageDetails = tokenDetails(result.data.usage);
      serving = { provider: safeProvider((result.data as any).provider) ?? safeProvider((result.data as any).openrouter_metadata?.provider_name) ?? safeProvider(result.response.headers.get('x-openrouter-provider')), model: safeModel(result.data.model) };
      const response = fromChatCompletion(result.data, params) as Response;
      await this.log(call, model, performance.now() - started, reqId, inputTokens, outputTokens, null, 'mubit', usageDetails, serving);
      return { response, requestId: reqId };
    } catch (err) {
      const reqId = errorRequestId(err) ?? requestId;
      await this.log(call, model, performance.now() - started, reqId, inputTokens, outputTokens, safeError(err), 'mubit', usageDetails, serving);
      throw err;
    }
  }

  /** JSON-schema constrained one-shot call for extraction and feedback tasks. */
  async completeJson<T>(args: JsonCall): Promise<JsonResult<T>> {
    const route = args.route ?? 'mubit';
    const call: MubitCall = { task: args.task, promptCacheKey: args.sessionKey, runId: args.runId, requestId: args.requestId };
    const maxOutputTokens = args.maxOutputTokens ?? DEFAULT_JSON_MAX_OUTPUT_TOKENS;
    if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 16 || maxOutputTokens > 128_000) throw new Error('maxOutputTokens must be an integer from 16 through 128000.');
    if (route === 'mubit' && !this.configured) throw new Error('MUBIT_API_KEY is not set (apps/api/.env).');
    if (route === 'openrouter' && !config.openrouterApiKey) throw new Error('OPENROUTER_API_KEY is not set (apps/api/.env).');
    let requestId = call.requestId ?? randomUUID();
    const start = performance.now();
    let inputTokens: number | null = null;
    let outputTokens: number | null = null;
    let usageDetails: Record<string, unknown> = {};
    let serving: { provider?: string | null; model?: string | null } = {};
    try {
      const body = {
        model: args.model ?? config.extractorModel,
        messages: [{ role: 'system', content: args.system }, { role: 'user', content: args.input }],
        response_format: { type: 'json_schema', json_schema: { name: args.jsonSchema.name, strict: true, schema: args.jsonSchema.schema } },
        max_tokens: maxOutputTokens,
        provider: { require_parameters: true, allow_fallbacks: false },
        session_id: stableSessionId(args.sessionKey),
      };
      const headers = { 'x-middleware-request-id': requestId, 'x-openrouter-metadata': 'enabled', ...(!['desk_agent', 'section_extractor'].includes(call.task) ? { 'x-middleware-record': 'off' } : {}) };
      const {data, response} = await (route === 'mubit' ? this.productionCompletion(body, headers) : this.directClient.chat.completions.create(body as any, {headers: {'x-openrouter-metadata': 'enabled'}}).withResponse());
      const reqId = response.headers.get('x-middleware-request-id') ?? response.headers.get('x-openrouter-request-id') ?? requestId;
      requestId = reqId;
      inputTokens = data.usage?.prompt_tokens ?? null;
      outputTokens = data.usage?.completion_tokens ?? null;
      usageDetails = tokenDetails(data.usage);
      serving = { provider: safeProvider((data as any).provider) ?? safeProvider((data as any).openrouter_metadata?.provider_name) ?? safeProvider(response.headers.get('x-openrouter-provider')), model: safeModel(data.model) };
      const decoded = decodeJsonOutput<T>(data.choices[0]?.message.content, args.jsonSchema.schema, data.choices[0]?.finish_reason, args.validation ?? 'strict');
      const { value, validationError } = decoded;
      const errorCode = validationError ? `InferenceContractError: ${validationError}` : null;
      await this.log(call, args.model ?? config.extractorModel, performance.now() - start, reqId, inputTokens, outputTokens, errorCode, route, { ...usageDetails, schemaValid: validationError === null, validationError }, serving);
      return { value, requestId: reqId, usage: { input: inputTokens, output: outputTokens }, valid: decoded.valid, validationError };
    } catch (err) {
      await this.log(call, args.model ?? config.extractorModel, performance.now() - start, errorRequestId(err) ?? requestId, inputTokens, outputTokens, safeError(err), route, usageDetails, serving);
      throw err;
    }
  }

  private async log(call: MubitCall, model: string, latency: number, requestId: string | null, input: number | null, output: number | null, error: string | null, route: 'mubit' | 'openrouter', usageDetails: Record<string, unknown> = {}, serving: { provider?: string | null; model?: string | null } = {}): Promise<void> {
    try {
      const task = call.task;
      await this.dbs.db.insert(inferenceAttempts).values({ id: randomUUID(), teamId: config.teamId, runId: call.runId ?? null, task, route, model, requestId, provider: serving.provider ?? null, latencyMs: latency, tokensIn: input, tokensOut: output, costUsd: null, ok: error === null, error, details: { inferenceBackend: route === 'mubit' ? config.inferenceBackend : 'direct-openrouter', sessionKey: call.promptCacheKey, requestedProvider: model.includes('/') ? model.split('/')[0] : null, servedModel: serving.model ?? null, ...usageDetails } });
      // Keep legacy desk call analytics during transition; rich route/task telemetry is in inference_attempts.
      if (route === 'mubit' && (task === 'desk_agent' || task === 'section_extractor' || task === 'unrecorded')) {
        await this.dbs.db.insert(llmCalls).values({ id: randomUUID(), task, mubitRequestId: requestId, recorded: task !== 'unrecorded', promptCacheKey: call.promptCacheKey, model, latencyMs: Math.round(latency), tokensIn: input, tokensOut: output, ok: error === null, error });
      }
    } catch (err) { this.logger.warn(`Could not log inference attempt (${requestId ?? 'no request id'}): ${err instanceof Error ? err.name : 'database error'}`); }
  }
}

/** OpenRouter routing controls are not valid native OpenAI parameters. */
export function nativeOpenAIRequest(body: any) {
  const {provider, session_id, max_tokens, ...request} = body;
  return {...request,
    ...(session_id ? {metadata: {...request.metadata, session_id}} : {}),
    ...(max_tokens !== undefined ? {max_completion_tokens: max_tokens} : {}),
  };
}

export function toChatCompletion(params: ResponseCreateParamsNonStreaming, sessionKey?: string) {
  const p = params as ResponseCreateParamsNonStreaming & { temperature?: number; top_p?: number; stop?: string | string[] };
  if ((p as any).stream || (p as any).background || (p as any).previous_response_id || (p as any).prompt || (p as any).store) {
    throw new Error('The Mubit Chat Completions transport does not support stateful, stored, background, or streaming Responses requests.');
  }
  const messages: ChatCompletionMessageParam[] = [];
  if (p.instructions) messages.push({ role: 'system', content: p.instructions });
  const input = typeof p.input === 'string' ? [{ role: 'user', content: p.input } as ResponseInputItem] : p.input as ResponseInputItem[];
  for (let index = 0; index < input.length; index++) {
    const item = input[index];
    const i = item as any;
    if (i.type === 'function_call') {
      // New runAgent history stores parallel call items first, then results.
      // Legacy alternating call/result history still maps to one-call batches.
      const calls: any[] = [i];
      let cursor = index + 1;
      while (cursor < input.length && (input[cursor] as any).type === 'function_call') calls.push(input[cursor++] as any);
      const outputs: any[] = [];
      while (cursor < input.length && (input[cursor] as any).type === 'function_call_output') outputs.push(input[cursor++] as any);
      messages.push({ role: 'assistant', content: null, tool_calls: calls.map((c) => ({ id: c.call_id, type: 'function' as const, function: { name: c.name, arguments: c.arguments } })) });
      for (const result of outputs) messages.push({ role: 'tool', tool_call_id: result.call_id, content: typeof result.output === 'string' ? result.output : JSON.stringify(result.output) });
      index = cursor - 1;
      continue;
    }
    if (i.type === 'function_call_output') { messages.push({ role: 'tool', tool_call_id: i.call_id, content: typeof i.output === 'string' ? i.output : JSON.stringify(i.output) }); continue; }
    if (i.role === 'assistant' && i.content != null) { messages.push({ role: 'assistant', content: contentText(i.content) }); continue; }
    if (['user', 'system', 'developer'].includes(i.role)) { messages.push({ role: i.role === 'developer' ? 'system' : i.role, content: contentText(i.content) } as ChatCompletionMessageParam); continue; }
    if (i.type && ['reasoning', 'item_reference'].includes(i.type)) continue;
    throw new Error(`Unsupported Responses input item for Chat Completions translation: ${i.type ?? i.role ?? 'unknown'}.`);
  }
  const tools: ChatCompletionTool[] | undefined = p.tools?.map((t: any) => {
    if (t.type !== 'function') throw new Error(`Unsupported Responses tool for Chat Completions translation: ${t.type}.`);
    return { type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters, strict: t.strict } };
  });
  const requestedChoice = p.tool_choice as any;
  const toolChoice = requestedChoice === 'auto' || requestedChoice === 'none' || requestedChoice === 'required'
    ? requestedChoice
    : requestedChoice?.type === 'function' ? { type: 'function', function: { name: requestedChoice.name } } : 'auto';
  const responseFormat = (p as any).text?.format;
  const translatedFormat = responseFormat?.type === 'json_schema' ? { type: 'json_schema', json_schema: { name: responseFormat.name, strict: responseFormat.strict ?? true, schema: responseFormat.schema } }
    : responseFormat?.type === 'json_object' ? { type: 'json_object' } : undefined;
  if (responseFormat && !translatedFormat) throw new Error(`Unsupported Responses output format: ${responseFormat.type}.`);
  return {
    model: p.model ?? config.agentModel,
    messages,
    provider: { require_parameters: true, allow_fallbacks: false },
    ...(sessionKey ? { session_id: stableSessionId(sessionKey) } : {}),
    ...(tools?.length ? { tools, tool_choice: toolChoice } : {}),
    ...(p.max_output_tokens != null ? { max_tokens: p.max_output_tokens } : {}),
    ...(p.temperature != null ? { temperature: p.temperature } : {}),
    ...(p.top_p != null ? { top_p: p.top_p } : {}),
    ...(p.stop != null ? { stop: p.stop } : {}),
    ...(p.reasoning?.effort ? { reasoning_effort: p.reasoning.effort } : {}),
    ...(translatedFormat ? { response_format: translatedFormat } : {}),
    ...((p as any).parallel_tool_calls != null ? { parallel_tool_calls: (p as any).parallel_tool_calls } : {}),
  };
}

function contentText(content: any): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((part) => {
    if (!['input_text', 'output_text', 'text'].includes(part.type)) throw new Error(`Unsupported Responses content part for Chat Completions translation: ${part.type ?? 'unknown'}.`);
    return part.text ?? '';
  }).join('');
}

function stableSessionId(sessionKey: string): string {
  return createHash('sha256').update(sessionKey).digest('hex');
}

export function fromChatCompletion(data: any, params: ResponseCreateParamsNonStreaming): Record<string, any> {
  const choice = data.choices[0];
  if (!choice) throw new Error('Inference returned no choices.');
  if (choice.finish_reason === 'length') throw new Error('Inference response was truncated by its output limit.');
  if (choice.finish_reason === 'content_filter') throw new Error('Inference response was blocked by the provider content filter.');
  const output: any[] = [];
  const msg = choice.message;
  const text = msg.content ?? msg.refusal ?? '';
  if (text) output.push({ id: `msg_${randomUUID()}`, type: 'message', role: 'assistant', status: 'completed', content: [msg.refusal ? { type: 'refusal', refusal: msg.refusal } : { type: 'output_text', text, annotations: [] }] });
  for (const tool of msg.tool_calls ?? []) {
    if (tool.type !== 'function') continue;
    output.push({ id: `fc_${tool.id}`, type: 'function_call', status: 'completed', call_id: tool.id, name: tool.function.name, arguments: tool.function.arguments });
  }
  if (output.length === 0) throw new Error('Inference returned neither assistant text nor tool calls.');
  const usage = data.usage;
  return { id: data.id, object: 'response', created_at: data.created, status: 'completed', error: null, incomplete_details: null, instructions: (params as any).instructions ?? null, max_output_tokens: (params as any).max_output_tokens ?? null, model: data.model, output, output_text: text, parallel_tool_calls: true, reasoning: null, store: false, temperature: null, tool_choice: 'auto', tools: [], top_p: null, truncation: 'disabled', usage: usage ? { input_tokens: usage.prompt_tokens, output_tokens: usage.completion_tokens, total_tokens: usage.total_tokens, input_tokens_details: { cached_tokens: usage.prompt_tokens_details?.cached_tokens ?? 0 }, output_tokens_details: { reasoning_tokens: usage.completion_tokens_details?.reasoning_tokens ?? 0 } } : null, metadata: null };
}

/** Small local validator for the JSON Schema subset used by OpenRouter strict mode. */
export function validateJsonSchema(value: unknown, schema: Record<string, any>, path = '$', root: Record<string, any> = schema): string[] {
  const issues: string[] = [];
  const supported = new Set(['$ref', '$defs', '$schema', 'definitions', 'title', 'description', 'default', 'examples', 'type', 'enum', 'const', 'anyOf', 'oneOf', 'allOf', 'not', 'properties', 'required', 'additionalProperties', 'items', 'minItems', 'maxItems', 'uniqueItems', 'minProperties', 'maxProperties', 'minLength', 'maxLength', 'pattern', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'format']);
  if (Object.keys(schema).some((key) => !supported.has(key))) return [path];
  if (schema.$ref) {
    const target = resolveSchemaRef(root, schema.$ref);
    if (!target) return [path];
    issues.push(...validateJsonSchema(value, target, path, root));
  }
  if (Array.isArray(schema.anyOf) && !schema.anyOf.some((part: Record<string, any>) => validateJsonSchema(value, part, path, root).length === 0)) issues.push(path);
  if (Array.isArray(schema.oneOf) && schema.oneOf.filter((part: Record<string, any>) => validateJsonSchema(value, part, path, root).length === 0).length !== 1) issues.push(path);
  if (Array.isArray(schema.allOf)) for (const part of schema.allOf) issues.push(...validateJsonSchema(value, part, path, root));
  if (schema.not && validateJsonSchema(value, schema.not, path, root).length === 0) issues.push(path);
  if (schema.type && !(Array.isArray(schema.type) ? schema.type : [schema.type]).some((type: string) => matchesJsonType(value, type))) issues.push(path);
  if (schema.enum && !schema.enum.some((v: unknown) => JSON.stringify(v) === JSON.stringify(value))) issues.push(path);
  if ('const' in schema && JSON.stringify(schema.const) !== JSON.stringify(value)) issues.push(path);
  if (matchesJsonType(value, 'object') && (schema.type === 'object' || schema.properties || schema.required || schema.additionalProperties !== undefined || schema.minProperties !== undefined || schema.maxProperties !== undefined)) {
    const obj = value as Record<string, unknown>;
    for (const key of schema.required ?? []) if (!(key in obj)) issues.push(`${path}.${key}`);
    if (schema.minProperties != null && Object.keys(obj).length < schema.minProperties || schema.maxProperties != null && Object.keys(obj).length > schema.maxProperties) issues.push(path);
    for (const [key, child] of Object.entries(obj)) {
      if (!(key in (schema.properties ?? {}))) {
        if (schema.additionalProperties === false) issues.push(`${path}.${key}`);
        else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') issues.push(...validateJsonSchema(child, schema.additionalProperties, `${path}.${key}`, root));
      }
      else issues.push(...validateJsonSchema(child, schema.properties[key], `${path}.${key}`, root));
    }
  }
  if (Array.isArray(value) && (schema.type === 'array' || schema.items || schema.minItems != null || schema.maxItems != null)) {
    if (schema.minItems != null && value.length < schema.minItems) issues.push(path);
    if (schema.maxItems != null && value.length > schema.maxItems) issues.push(path);
    if (schema.uniqueItems && new Set(value.map(canonicalJson)).size !== value.length) issues.push(path);
    if (schema.items) value.forEach((v, i) => issues.push(...validateJsonSchema(v, schema.items, `${path}[${i}]`, root)));
  }
  if (typeof value === 'string') {
    const length = Array.from(value).length;
    if (schema.minLength != null && length < schema.minLength || schema.maxLength != null && length > schema.maxLength) issues.push(path);
    if (schema.pattern) { try { if (!new RegExp(schema.pattern).test(value)) issues.push(path); } catch { issues.push(path); } }
    if (schema.format === 'date' && !isDateOnly(value)
      || schema.format === 'date-time' && Number.isNaN(Date.parse(value))) issues.push(path);
    if (schema.format && !['date', 'date-time'].includes(schema.format)) issues.push(path);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (schema.minimum != null && value < schema.minimum || schema.maximum != null && value > schema.maximum || schema.exclusiveMinimum != null && value <= schema.exclusiveMinimum || schema.exclusiveMaximum != null && value >= schema.exclusiveMaximum || schema.multipleOf != null && Math.abs(value / schema.multipleOf - Math.round(value / schema.multipleOf)) > 1e-9) issues.push(path);
  }
  return issues;
}

export function decodeJsonOutput<T>(content: unknown, schema: Record<string, any>, finishReason: unknown, mode: 'strict' | 'caller' = 'strict'): { value: T; valid: boolean; validationError: JsonResult<T>['validationError'] } {
  const raw = typeof content === 'string' ? content : '';
  let value: T;
  let validationError: JsonResult<T>['validationError'] = finishReason === 'length' ? 'truncated' : null;
  try { value = JSON.parse(raw) as T; }
  catch {
    if (mode === 'strict') throw new InferenceContractError('json_parse', 'Inference returned invalid JSON.');
    value = raw as T;
    validationError ??= 'json_parse';
  }
  if (validationError === null && validateJsonSchema(value, schema).length) validationError = 'schema';
  if (validationError && mode === 'strict') throw new InferenceContractError(validationError, `Inference response failed ${validationError} validation.`);
  return { value, valid: validationError === null, validationError };
}

function isDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function matchesJsonType(value: unknown, type: string): boolean {
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  if (type === 'array') return Array.isArray(value);
  if (type === 'integer') return typeof value === 'number' && Number.isInteger(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (type === 'null') return value === null;
  return typeof value === type;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  return JSON.stringify(value);
}

function resolveSchemaRef(root: Record<string, any>, ref: string): Record<string, any> | null {
  if (!ref.startsWith('#/')) return null;
  let current: any = root;
  for (const token of ref.slice(2).split('/').map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'))) {
    if (!current || typeof current !== 'object' || !(token in current)) return null;
    current = current[token];
  }
  return current && typeof current === 'object' ? current : null;
}

function safeError(err: unknown): string {
  // SDK/provider messages can echo request content or headers. Persist only a
  // stable class and status code; never store message/body/credentials.
  if (err && typeof err === 'object') {
    if (err instanceof InferenceContractError) return `InferenceContractError: ${err.code}`;
    const e = err as { status?: number; constructor?: { name?: string } };
    const kind = /^[A-Za-z0-9]+Error$/.test(e.constructor?.name ?? '') ? e.constructor!.name! : 'InferenceError';
    return `${kind}${Number.isInteger(e.status) ? ` (${e.status})` : ''}`;
  }
  return 'InferenceError';
}

function safeProvider(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z0-9._/-]{1,128}$/.test(value) ? value : null;
}

function safeModel(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z0-9._:/-]{1,200}$/.test(value) ? value : null;
}

class InferenceContractError extends Error {
  constructor(readonly code: 'json_parse' | 'schema' | 'truncated', message: string) { super(message); this.name = 'InferenceContractError'; }
}

function tokenDetails(usage: any): Record<string, unknown> {
  return {
    cachedInputTokens: usage?.prompt_tokens_details?.cached_tokens ?? null,
    cacheWriteTokens: usage?.prompt_tokens_details?.cache_write_tokens ?? null,
    reasoningOutputTokens: usage?.completion_tokens_details?.reasoning_tokens ?? null,
  };
}

function errorRequestId(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null;
  const headers = (err as { headers?: Headers | Record<string, string> }).headers;
  if (!headers) return null;
  if (typeof (headers as Headers).get === 'function') return (headers as Headers).get('x-middleware-request-id') ?? (headers as Headers).get('x-openrouter-request-id');
  const record = headers as Record<string, string>;
  return record['x-middleware-request-id'] ?? record['x-openrouter-request-id'] ?? null;
}
