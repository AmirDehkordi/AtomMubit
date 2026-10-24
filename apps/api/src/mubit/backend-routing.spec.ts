import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({chat: vi.fn(), gemini: vi.fn(), inserts: vi.fn()}));
vi.mock('openai', () => ({default: class { chat = {completions: {create: mocks.chat}}; }}));
vi.mock('./gemini-transport', () => ({executeGemini: mocks.gemini}));
vi.mock('../agent/frozen', () => ({assertTransportFrozen: vi.fn()}));
vi.mock('../core/config', () => ({config: {
  inferenceBackend: 'mubit', mubitApiKey: 'test-key', mubitBaseUrl: 'http://native-openai/v1',
  mubitGeminiBaseUrl: 'http://native-gemini', openrouterApiKey: 'router-key', openrouterBaseUrl: 'http://router/v1',
  extractorModel: 'gemini-3.5-flash-lite', agentModel: 'gpt-6-luna', teamId: 'internal',
}}));
import { config } from '../core/config';
import { MubitService } from './mubit.service';
import type { DbService } from '../db/db.service';
const output = () => ({data: {id:'test', model:'test', choices:[{finish_reason:'stop', message:{role:'assistant',content:'{"ok":true}'}}], usage:{prompt_tokens:1,completion_tokens:1}}, response: new Response('{}')});
const args = {task:'section_extractor' as const, sessionKey:'run', system:'Extract', input:'Source', jsonSchema:{name:'result',schema:{type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false}}};
const service = () => new MubitService({db:{insert:()=>({values:mocks.inserts})}} as unknown as DbService);
beforeEach(() => {
  vi.clearAllMocks(); (config as any).inferenceBackend = 'mubit';
  mocks.chat.mockReturnValue({withResponse:async()=>output()}); mocks.gemini.mockImplementation(async()=>output());
});
describe('backend transport routing', () => {
  it('routes Gemini extraction to native Gemini with Mubit credentials', async () => {
    expect((await service().completeJson(args)).value).toEqual({ok:true});
    expect(mocks.chat).not.toHaveBeenCalled();
    expect(mocks.gemini).toHaveBeenCalledWith(expect.objectContaining({baseURL:'http://native-gemini',apiKey:'test-key',body:expect.objectContaining({model:'gemini-3.5-flash-lite'})}));
    expect(mocks.gemini.mock.calls[0]![0].headers).not.toHaveProperty('x-openrouter-metadata');
  });
  it('routes GPT structured calls to native OpenAI without OpenRouter-only fields', async () => {
    await service().completeJson({...args,model:'gpt-6-luna'});
    const [body, options] = mocks.chat.mock.calls[0]!;
    expect(body).toMatchObject({model:'gpt-6-luna',max_completion_tokens:8000,metadata:{session_id:expect.any(String)}});
    expect(body).not.toHaveProperty('provider'); expect(body).not.toHaveProperty('session_id'); expect(body).not.toHaveProperty('max_tokens');
    expect(options.headers).not.toHaveProperty('x-openrouter-metadata');
  });
  it('routes planner tool calls through the selected native transport', async () => {
    await service().respond({model:'gemini-3.8-flash',input:'Hello',tools:[]} as any,{task:'desk_agent',promptCacheKey:'chat'});
    expect(mocks.gemini).toHaveBeenCalledTimes(1); expect(mocks.chat).not.toHaveBeenCalled();
  });
  it('retains OpenRouter provider constraints in OpenRouter mode', async () => {
    (config as any).inferenceBackend = 'openrouter';
    await service().completeJson({...args,model:'qwen/example'});
    expect(mocks.gemini).not.toHaveBeenCalled();
    expect(mocks.chat.mock.calls[0]![0]).toMatchObject({provider:{require_parameters:true,allow_fallbacks:false},session_id:expect.any(String),max_tokens:8000});
  });
  it('keeps explicitly selected direct OpenRouter evaluations independent of production mode', async () => {
    await service().completeJson({...args,route:'openrouter',model:'qwen/example'});
    expect(mocks.gemini).not.toHaveBeenCalled(); expect(mocks.chat.mock.calls[0]![0]).toHaveProperty('provider');
  });
});
