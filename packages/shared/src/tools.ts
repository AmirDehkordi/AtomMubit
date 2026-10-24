import { z } from 'zod';
import { Form } from './filings';
import { BLOCK_TYPES } from './blocks';
import { MetricKey } from './metrics';
import { ViewSpec } from './views';

// The desk_agent task's fixed tool list. The full list is sent on every agent
// call and is part of that Mubit task's fingerprint: adding or changing a tool
// starts a new task. Tools that aren't built yet still stay in the list and
// answer "not available yet".

export const TOOL_ARGS = {
  find_filings: z.strictObject({
    ticker: z.string(),
    forms: z.array(Form),
    lastNQuarters: z.number().int().min(1).max(12).nullable(),
    fiscalYear: z.number().int().nullable(),
  }),
  ask_user: z.strictObject({
    question: z.string(),
    options: z.array(z.string()).min(2).max(4),
  }),
  add_filings: z.strictObject({
    accessions: z.array(z.string()).min(1).max(8),
  }),
  get_metrics: z.strictObject({
    ticker: z.string(),
    metrics: z.array(MetricKey).min(1),
    periodEnds: z.array(z.string()).max(12).describe('Quarter end dates (YYYY-MM-DD)'),
  }),
  search_blocks: z.strictObject({
    query: z.string(),
    ticker: z.string().nullable(),
    periodEnd: z.string().nullable(),
    types: z.array(z.enum(BLOCK_TYPES)),
  }),
  get_blocks: z.strictObject({
    ids: z.array(z.string()).min(1).max(8),
  }),
  compare: z.strictObject({
    metric: z.string(),
    tickers: z.array(z.string()).min(2).max(8),
    periodEnd: z.string().nullable(),
  }),
  show_on_dashboard: z.strictObject({ spec: ViewSpec }),
  get_insider_activity: z.strictObject({
    ticker: z.string(),
    days: z.number().int().min(1).max(365),
  }),
  diff_risk_factors: z.strictObject({ ticker: z.string() }),
} as const;

export type ToolName = keyof typeof TOOL_ARGS;
export type ToolArgs<N extends ToolName> = z.infer<(typeof TOOL_ARGS)[N]>;
export const TOOL_NAMES = Object.keys(TOOL_ARGS) as ToolName[];
