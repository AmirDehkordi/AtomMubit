import 'dotenv/config';
import { join } from 'node:path';

const env = (name: string, fallback = ''): string => process.env[name]?.trim() || fallback;

export const config = {
  port: Number(env('PORT', '4000')),
  webOrigin: env('WEB_ORIGIN', 'http://localhost:3100'),
  dataDir: env('DATA_DIR', join(process.cwd(), 'data')),
  migrationsDir: env('MIGRATIONS_DIR', join(process.cwd(), 'drizzle')),
  databaseUrl: env('DATABASE_URL'),
  teamId: env('TEAM_ID', 'internal'),
  mubitApiKey: env('MUBIT_API_KEY'),
  mubitBaseUrl: env('MUBIT_BASE_URL', 'https://api.mubit.ai/compat/openrouter/v1'),
  openrouterApiKey: env('OPENROUTER_API_KEY'),
  openrouterBaseUrl: env('OPENROUTER_BASE_URL', 'https://openrouter.ai/api/v1'),
  agentModel: env('AGENT_MODEL', 'openai/gpt-6-luna'),
  /** Lower-cost structured extraction; quality must be measured on the benchmark corpus. */
  extractorModel: env('EXTRACTOR_MODEL', 'qwen/qwen3-30b-a3b-instruct-2507'),
  feedbackModel: env('FEEDBACK_MODEL', 'openai/gpt-6-luna'),
  /** Reasoning effort for the agent (gpt-6-luna is a reasoning model): low keeps the chat quick. */
  agentReasoningEffort: env('AGENT_REASONING_EFFORT', 'low') as 'minimal' | 'low' | 'medium' | 'high',
  secUserAgent: env('SEC_USER_AGENT'),
} as const;
