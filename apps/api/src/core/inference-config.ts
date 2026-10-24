/** Separate model profiles let one switch select a backend without stale model IDs. */
export function inferenceConfig(environment: Record<string, string | undefined>) {
  const env = (name: string, fallback: string) => environment[name]?.trim() || fallback;
  const backend = env('INFERENCE_BACKEND', 'mubit');
  if (backend !== 'openrouter' && backend !== 'mubit') throw new Error('INFERENCE_BACKEND must be openrouter or mubit');
  const native = backend === 'mubit';
  const agentModel = native ? env('MUBIT_AGENT_MODEL', 'gpt-6-luna') : env('AGENT_MODEL', 'openai/gpt-6-luna');
  const extractorModel = native ? env('MUBIT_EXTRACTOR_MODEL', 'gemini-3.5-flash-lite') : env('EXTRACTOR_MODEL', 'qwen/qwen3-30b-a3b-instruct-2507');
  const feedbackModel = native ? env('MUBIT_FEEDBACK_MODEL', 'gpt-6-luna') : env('FEEDBACK_MODEL', 'openai/gpt-6-luna');
  if (native && [agentModel, extractorModel, feedbackModel].some(model => !/^(gpt-|gemini-)[a-zA-Z0-9._-]+$/.test(model))) {
    throw new Error('Mubit native models must use bare gpt-* or gemini-* model IDs, without OpenRouter provider prefixes');
  }
  return {
    inferenceBackend: backend,
    mubitBaseUrl: native ? env('MUBIT_OPENAI_BASE_URL', 'https://api.mubit.ai/openai/v1') : env('MUBIT_BASE_URL', 'https://api.mubit.ai/compat/openrouter/v1'),
    mubitGeminiBaseUrl: env('MUBIT_GEMINI_BASE_URL', 'https://api.mubit.ai/gemini'),
    agentModel, extractorModel, feedbackModel,
  } as const;
}
