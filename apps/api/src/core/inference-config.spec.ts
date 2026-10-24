import { describe, expect, it } from 'vitest';
import { inferenceConfig } from './inference-config';

describe('inference backend selection', () => {
  it('preserves existing OpenRouter settings by default', () => {
    expect(inferenceConfig({MUBIT_BASE_URL: 'http://localhost:4099/v1', EXTRACTOR_MODEL: 'custom/model'})).toMatchObject({
      inferenceBackend: 'openrouter', mubitBaseUrl: 'http://localhost:4099/v1', extractorModel: 'custom/model', agentModel: 'openai/gpt-6-luna',
    });
  });
  it('switches to native routes without stale OpenRouter settings overriding them', () => {
    expect(inferenceConfig({INFERENCE_BACKEND: 'mubit', MUBIT_BASE_URL: 'http://old-router/v1', EXTRACTOR_MODEL: 'qwen/old', AGENT_MODEL: 'openai/old'})).toMatchObject({
      inferenceBackend: 'mubit', mubitBaseUrl: 'https://api.mubit.ai/openai/v1', mubitGeminiBaseUrl: 'https://api.mubit.ai/gemini',
      extractorModel: 'gemini-3.5-flash-lite', agentModel: 'gpt-6-luna', feedbackModel: 'gpt-6-luna',
    });
  });
  it.each(['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gpt-6-luna'])('supports native model %s', model => {
    expect(inferenceConfig({INFERENCE_BACKEND: 'mubit', MUBIT_EXTRACTOR_MODEL: model}).extractorModel).toBe(model);
  });
  it('fails early on invalid backend or provider-qualified native models', () => {
    expect(() => inferenceConfig({INFERENCE_BACKEND: 'typo'})).toThrow('INFERENCE_BACKEND');
    expect(() => inferenceConfig({INFERENCE_BACKEND: 'mubit', MUBIT_EXTRACTOR_MODEL: 'google/gemini-3.8-flash'})).toThrow('bare');
  });
});
