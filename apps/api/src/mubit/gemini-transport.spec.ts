import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeGemini, fromGeminiResponse, toGeminiRequest } from './gemini-transport';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('native Gemini transport', () => {
  it('translates system instructions, tools, sampling and structured JSON without OpenRouter fields', () => {
    const schema = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false };
    const request = toGeminiRequest({
      model: 'gemini-3.8-flash', provider: { require_parameters: true }, session_id: 'session',
      messages: [{ role: 'system', content: 'System' }, { role: 'developer', content: 'Rules' }, { role: 'user', content: [{ type: 'text', text: 'Question' }] }],
      tools: [{ type: 'function', function: { name: 'lookup', description: 'Search', parameters: schema, strict: true } }],
      tool_choice: { type: 'function', function: { name: 'lookup' } },
      response_format: { type: 'json_schema', json_schema: { name: 'answer', strict: true, schema } },
      max_tokens: 900, temperature: 0.2, top_p: 0.9, stop: 'END', reasoning_effort: 'low',
    });
    expect(request).toEqual({
      systemInstruction: { parts: [{ text: 'System' }, { text: 'Rules' }] },
      contents: [{ role: 'user', parts: [{ text: 'Question' }] }],
      tools: [{ functionDeclarations: [{ name: 'lookup', description: 'Search', parametersJsonSchema: schema }] }],
      toolConfig: { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: ['lookup'] } },
      generationConfig: { maxOutputTokens: 900, temperature: 0.2, topP: 0.9, stopSequences: ['END'], thinkingConfig: { thinkingLevel: 'low' }, responseMimeType: 'application/json', responseJsonSchema: schema },
    });
  });

  it.each([['auto', 'AUTO'], ['none', 'NONE'], ['required', 'ANY']])('maps %s tool choice', (tool_choice, mode) => {
    expect(toGeminiRequest({ messages: [], tools: [{ type: 'function', function: { name: 'f' } }], tool_choice }).toolConfig).toEqual({ functionCallingConfig: { mode } });
  });

  it('round-trips signed native parts across parallel and sequential tool turns using only opaque call IDs', () => {
    const parts = [
      { text: 'hidden reasoning', thought: true, thoughtSignature: 'thought-prefix' },
      { functionCall: { name: 'lookup', args: { q: 'first' }, id: 'native-a' }, thoughtSignature: 'signed+/==' },
      { functionCall: { name: 'lookup', args: { q: 'second' }, id: 'native-b' } },
    ];
    const first = fromGeminiResponse({ candidates: [{ content: { parts }, finishReason: 'STOP' }] }, 'gemini-3.8-flash').choices[0].message;
    expect(first.content).toBeNull();
    expect(first.tool_calls).toHaveLength(2);
    expect(first.tool_calls[0].id).not.toBe(first.tool_calls[1].id);
    const nextParts = [{ functionCall: { name: 'finish', args: {} }, thoughtSignature: 'next-step' }];
    const second = fromGeminiResponse({ candidates: [{ content: { parts: nextParts }, finishReason: 'STOP' }] }, 'gemini-3.8-flash').choices[0].message;
    const native = toGeminiRequest({ messages: [
      { role: 'user', content: 'question' },
      // The real bridge retains these fields and strips all vendor extras.
      { role: 'assistant', content: null, tool_calls: first.tool_calls },
      { role: 'tool', tool_call_id: first.tool_calls[0].id, content: '{"ok":true}' },
      { role: 'tool', tool_call_id: first.tool_calls[1].id, content: 'plain result' },
      { role: 'assistant', content: null, tool_calls: second.tool_calls },
      { role: 'tool', tool_call_id: second.tool_calls[0].id, content: '[1,2]' },
    ] });
    expect(native.contents).toEqual([
      { role: 'user', parts: [{ text: 'question' }] },
      { role: 'model', parts },
      { role: 'user', parts: [
        { functionResponse: { name: 'lookup', id: 'native-a', response: { ok: true } } },
        { functionResponse: { name: 'lookup', id: 'native-b', response: { result: 'plain result' } } },
      ] },
      { role: 'model', parts: nextParts },
      { role: 'user', parts: [{ functionResponse: { name: 'finish', response: { result: [1, 2] } } }] },
    ]);
  });

  it('converts plain historical tool IDs without inventing thought signatures', () => {
    expect(toGeminiRequest({ messages: [
      { role: 'assistant', content: null, tool_calls: [{ id: 'old-call', type: 'function', function: { name: 'lookup', arguments: '{"q":"old"}' } }] },
      { role: 'tool', tool_call_id: 'old-call', content: 'null' },
    ] }).contents).toEqual([
      { role: 'model', parts: [{ functionCall: { name: 'lookup', args: { q: 'old' } } }] },
      { role: 'user', parts: [{ functionResponse: { name: 'lookup', response: { result: null } } }] },
    ]);
  });

  it('gives repeated parallel calls distinct stable IDs', () => {
    const data = { candidates: [{ finishReason: 'STOP', content: { parts: [
      { functionCall: { name: 'f', args: {} }, thoughtSignature: 'signed' },
      { functionCall: { name: 'f', args: {} } },
      { functionCall: { name: 'f', args: {} } },
    ] } }] };
    const ids = fromGeminiResponse(data, 'm').choices[0].message.tool_calls.map((call: any) => call.id);
    expect(new Set(ids).size).toBe(3);
    expect(fromGeminiResponse(data, 'm').choices[0].message.tool_calls.map((call: any) => call.id)).toEqual(ids);
  });

  it('converts visible text and usage including reasoning and cached input tokens', () => {
    const result = fromGeminiResponse({ responseId: 'response-1', modelVersion: 'gemini-3.8-flash', candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'private', thought: true }, { text: '{"ok":' }, { text: 'true}' }] } }], usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 7, thoughtsTokenCount: 3, totalTokenCount: 22, cachedContentTokenCount: 5 } }, 'requested-model');
    expect(result.choices[0]).toMatchObject({ finish_reason: 'stop', message: { content: '{"ok":true}' } });
    expect(result.usage).toEqual({ prompt_tokens: 12, completion_tokens: 10, total_tokens: 22, prompt_tokens_details: { cached_tokens: 5 }, completion_tokens_details: { reasoning_tokens: 3 } });
    expect(result.id).toBe('response-1');
  });

  it('preserves truncation and content filtering, and rejects missing/unsuccessful candidates', () => {
    const candidate = (finishReason: string) => ({ candidates: [{ finishReason, content: { parts: [{ text: 'partial' }] } }] });
    expect(fromGeminiResponse(candidate('MAX_TOKENS'), 'm').choices[0].finish_reason).toBe('length');
    expect(fromGeminiResponse(candidate('SAFETY'), 'm').choices[0].finish_reason).toBe('content_filter');
    expect(() => fromGeminiResponse(candidate('MALFORMED_FUNCTION_CALL'), 'm')).toThrow(/unsuccessful/);
    expect(() => fromGeminiResponse({ candidates: [] }, 'm')).toThrow(/no candidates/);
    expect(() => fromGeminiResponse({ promptFeedback: { blockReason: 'SAFETY' } }, 'm')).toThrow(/blocked/);
  });

  it.each(['https://api.mubit.ai/gemini', 'https://api.mubit.ai/gemini/v1beta/'])('sends one native request at %s with only the Mubit credential and keeps response headers', async (baseURL) => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const response = new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'ok' }] } }] }), { headers: { 'x-middleware-request-id': 'middleware-1' } });
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal('fetch', fetchMock);
    const result = await executeGemini({ baseURL, apiKey: 'mubit-test', body: { model: 'gemini-3.5-flash-lite', messages: [{ role: 'user', content: 'Hi' }] }, headers: { Authorization: 'Bearer provider-key', 'x-api-key': 'other-key', 'x-middleware-record': 'off' } });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://api.mubit.ai/gemini/v1beta/models/gemini-3.5-flash-lite:generateContent');
    expect(options.headers.get('x-goog-api-key')).toBe('mubit-test');
    expect(options.headers.has('authorization')).toBe(false);
    expect(options.headers.has('x-api-key')).toBe(false);
    expect(options.headers.get('x-middleware-record')).toBe('off');
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(timeout).toHaveBeenCalledWith(120_000);
    expect(options.redirect).toBe('error');
    expect(result.response.headers.get('x-middleware-request-id')).toBe('middleware-1');
    expect(result.data.choices[0].message.content).toBe('ok');
  });

  it('exposes safe HTTP status and request headers without leaking provider body or retrying', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"error":"echo secret-test"}', { status: 403, headers: { 'x-middleware-request-id': 'failed-1' } }));
    vi.stubGlobal('fetch', fetchMock);
    const failure = await executeGemini({ baseURL: 'https://api.mubit.ai/gemini', apiKey: 'secret-test', body: { model: 'gemini-3.8-flash', messages: [] } }).catch((error: unknown) => error);
    expect(failure).toMatchObject({ status: 403, message: 'Gemini inference failed (HTTP 403).' });
    expect((failure as { headers: Headers }).headers.get('x-middleware-request-id')).toBe('failed-1');
    expect(JSON.stringify(failure)).not.toContain('secret-test');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each(['TimeoutError', 'TypeError'])('sanitizes %s failures without retrying', async (name) => {
    const error = new Error('secret key in upstream failure');
    error.name = name;
    const fetchMock = vi.fn().mockRejectedValue(error);
    vi.stubGlobal('fetch', fetchMock);
    await expect(executeGemini({ baseURL: 'https://api.mubit.ai/gemini', apiKey: 'secret', body: { model: 'gemini-3.8-flash', messages: [] } })).rejects.toThrow(name === 'TimeoutError' ? 'Gemini inference timed out.' : 'Gemini inference request failed.');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('rejects unsupported inputs before making a network request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(executeGemini({ baseURL: 'https://api.mubit.ai/gemini', apiKey: 'test', body: { model: 'openai/gpt-6', messages: [] } })).rejects.toThrow(/Gemini model ID/);
    expect(() => toGeminiRequest({ stream: true, messages: [] })).toThrow(/streaming/);
    expect(() => toGeminiRequest({ messages: [{ role: 'tool', tool_call_id: 'missing', content: 'x' }] })).toThrow(/no matching/);
    expect(() => toGeminiRequest({ messages: [{ role: 'user', content: [{ type: 'image_url' }] }] })).toThrow(/text message/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
