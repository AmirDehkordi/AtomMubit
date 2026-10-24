import { describe, expect, it } from 'vitest';
import type { ResponseCreateParamsNonStreaming } from 'openai/resources/responses/responses';
import { DEFAULT_JSON_MAX_OUTPUT_TOKENS, decodeJsonOutput, fromChatCompletion, toChatCompletion, validateJsonSchema } from './mubit.service';

describe('Responses / Chat Completions compatibility', () => {
  it('translates instructions, parallel tools, token limits, and reasoning settings', () => {
    const request = toChatCompletion({
      model: 'openai/gpt-6-luna', instructions: 'Do the task', max_output_tokens: 700,
      reasoning: { effort: 'low' },
      tools: [
        { type: 'function', name: 'alpha', description: 'A', parameters: { type: 'object' }, strict: true },
        { type: 'function', name: 'beta', description: 'B', parameters: { type: 'object' }, strict: true },
      ],
      input: [{ role: 'user', content: [{ type: 'input_text', text: 'question' }] }],
    } as ResponseCreateParamsNonStreaming, 'stable-session');
    expect(request.messages[0]).toEqual({ role: 'system', content: 'Do the task' });
    expect(request.messages[1]).toEqual({ role: 'user', content: 'question' });
    expect(request.tools).toHaveLength(2);
    expect(request.max_tokens).toBe(700);
    expect(request.reasoning_effort).toBe('low');
    expect(request.provider).toEqual({ require_parameters: true, allow_fallbacks: false });
    expect(request.session_id).toMatch(/^[a-f0-9]{64}$/);
    expect(request).not.toHaveProperty('user');
  });

  it('groups a parallel Responses tool batch and its results for Chat Completions', () => {
    const request = toChatCompletion({
      model: 'openai/gpt-6-luna', input: [
        { type: 'function_call', call_id: 'call-a', name: 'alpha', arguments: '{"x":1}' },
        { type: 'function_call', call_id: 'call-b', name: 'beta', arguments: '{}' },
        { type: 'function_call_output', call_id: 'call-a', output: '{"ok":true}' },
        { type: 'function_call_output', call_id: 'call-b', output: 'done' },
      ],
    } as ResponseCreateParamsNonStreaming);
    expect(request.messages).toEqual([
      { role: 'assistant', content: null, tool_calls: [
        { id: 'call-a', type: 'function', function: { name: 'alpha', arguments: '{"x":1}' } },
        { id: 'call-b', type: 'function', function: { name: 'beta', arguments: '{}' } },
      ] },
      { role: 'tool', tool_call_id: 'call-a', content: '{"ok":true}' },
      { role: 'tool', tool_call_id: 'call-b', content: 'done' },
    ]);
  });

  it('preserves legacy alternating call/result history without merging distinct rounds', () => {
    const request = toChatCompletion({ model: 'openai/gpt-6-luna', input: [
      { type: 'function_call', call_id: 'old-a', name: 'alpha', arguments: '{}' },
      { type: 'function_call_output', call_id: 'old-a', output: 'first result' },
      { type: 'function_call', call_id: 'old-b', name: 'beta', arguments: '{}' },
      { type: 'function_call_output', call_id: 'old-b', output: 'second result' },
    ] } as ResponseCreateParamsNonStreaming);
    expect(request.messages.map((message: any) => message.role)).toEqual(['assistant', 'tool', 'assistant', 'tool']);
    expect((request.messages[0] as any).tool_calls).toHaveLength(1);
    expect((request.messages[2] as any).tool_calls).toHaveLength(1);
  });

  it('translates assistant text and parallel tool calls back into Responses output items', () => {
    const result = fromChatCompletion({
      id: 'chat-1', created: 10, model: 'openai/gpt-6-luna',
      choices: [{ message: { content: 'Done', tool_calls: [
        { id: 'one', type: 'function', function: { name: 'a', arguments: '{}' } },
        { id: 'two', type: 'function', function: { name: 'b', arguments: '{"n":2}' } },
      ] } }],
      usage: { prompt_tokens: 8, completion_tokens: 5, total_tokens: 13 },
    }, { model: 'openai/gpt-6-luna' } as ResponseCreateParamsNonStreaming);
    expect(result.output_text).toBe('Done');
    expect(result.output).toHaveLength(3);
    expect(result.output.slice(1).map((i: any) => i.call_id)).toEqual(['one', 'two']);
    expect(result.usage).toMatchObject({ input_tokens: 8, output_tokens: 5, total_tokens: 13 });
  });

  it('checks returned JSON against strict schema including nullable unions', () => {
    const schema = { type: 'object', properties: { value: { anyOf: [{ type: 'string' }, { type: 'null' }] } }, required: ['value'], additionalProperties: false };
    expect(validateJsonSchema({ value: null }, schema)).toEqual([]);
    expect(validateJsonSchema({ value: 42 }, schema)).toEqual(['$.value']);
    expect(validateJsonSchema({}, schema)).toEqual(['$.value']);
  });

  it('resolves local JSON Schema definitions when validating nested results', () => {
    const schema = { type: 'object', properties: { item: { $ref: '#/$defs/Item' } }, required: ['item'], additionalProperties: false,
      $defs: { Item: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'], additionalProperties: false } } };
    expect(validateJsonSchema({ item: { name: 'ok' } }, schema)).toEqual([]);
    expect(validateJsonSchema({ item: { name: 2 } }, schema)).toEqual(['$.item.name']);
  });

  it('applies constraints beside unions and fails closed on unsupported assertions', () => {
    expect(validateJsonSchema('x', { anyOf: [{ type: 'string' }, { type: 'null' }], minLength: 2 })).toEqual(['$']);
    expect(validateJsonSchema('anything', { type: 'string', format: 'email' })).toEqual(['$']);
  });

  it('lets the extraction caller handle invalid JSON/schema and truncated output for repair', () => {
    const schema = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false };
    expect(decodeJsonOutput('not json', schema, 'stop', 'caller')).toMatchObject({ value: 'not json', valid: false, validationError: 'json_parse' });
    expect(decodeJsonOutput('{"ok":"yes"}', schema, 'stop', 'caller')).toMatchObject({ value: { ok: 'yes' }, valid: false, validationError: 'schema' });
    expect(decodeJsonOutput('{"ok":true}', schema, 'length', 'caller')).toMatchObject({ value: { ok: true }, valid: false, validationError: 'truncated' });
    expect(() => decodeJsonOutput('not json', schema, 'stop', 'strict')).toThrow(/invalid JSON/);
    expect(DEFAULT_JSON_MAX_OUTPUT_TOKENS).toBe(8_000);
  });

  it('fails closed for stateful Responses-only features and truncated Chat Completions output', () => {
    expect(() => toChatCompletion({ model: 'x', previous_response_id: 'resp_1', input: [] } as any)).toThrow(/does not support stateful/);
    expect(() => fromChatCompletion({ choices: [{ finish_reason: 'length', message: {} }] }, { model: 'x' } as any)).toThrow(/truncated/);
  });
});
