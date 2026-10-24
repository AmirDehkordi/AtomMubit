import 'dotenv/config';
import { join } from 'node:path';

const env = (name: string, fallback = ''): string => process.env[name]?.trim() || fallback;

export const config = {
  port: Number(env('PORT', '4000')),
  webOrigin: env('WEB_ORIGIN', 'http://localhost:3100'),
  dataDir: join(process.cwd(), 'data'),
  migrationsDir: join(process.cwd(), 'drizzle'),
  databaseUrl: env('DATABASE_URL'),
  mubitApiKey: env('MUBIT_API_KEY'),
  mubitBaseUrl: env('MUBIT_BASE_URL', 'https://api.mubit.ai/openai/v1'),
  agentModel: env('AGENT_MODEL', 'gpt-6-luna'),
  extractorModel: env('EXTRACTOR_MODEL', 'gpt-6-luna'),
  /** Reasoning effort for the agent (gpt-6-luna is a reasoning model): low keeps the chat quick. */
  agentReasoningEffort: env('AGENT_REASONING_EFFORT', 'low') as 'minimal' | 'low' | 'medium' | 'high',
  secUserAgent: env('SEC_USER_AGENT'),
} as const;
