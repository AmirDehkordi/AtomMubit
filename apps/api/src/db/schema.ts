import { sql } from 'drizzle-orm';
import {
  boolean,
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  bigserial,
} from 'drizzle-orm/pg-core';
import type { BlockStatus, FilingStatus, ToolName, ViewSpec } from '@desk/shared';

const tsvector = customType<{ data: string }>({ dataType: () => 'tsvector' });

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const projects = pgTable('projects', {
  id: text('id').primaryKey(),
  teamId: text('team_id').notNull().default('internal'),
  title: text('title').notNull(),
  createdAt: createdAt(),
});

export const companies = pgTable('companies', {
  cik: integer('cik').primaryKey(),
  ticker: text('ticker').notNull().unique(),
  name: text('name').notNull(),
  /** MM-DD, from the SEC submissions API (e.g. 01-25 for NVIDIA). */
  fiscalYearEnd: text('fiscal_year_end').notNull(),
});

export const filings = pgTable(
  'filings',
  {
    accession: text('accession').primaryKey(),
    cik: integer('cik')
      .notNull()
      .references(() => companies.cik),
    projectId: text('project_id').references(() => projects.id),
    form: text('form').notNull(),
    periodEnd: text('period_end').notNull(),
    fiscalYear: integer('fiscal_year').notNull(),
    fiscalPeriod: text('fiscal_period').notNull(),
    filedAt: text('filed_at').notNull(),
    url: text('url').notNull(),
    status: text('status').$type<FilingStatus>().notNull().default('found'),
  },
  (t) => [index('filings_project_idx').on(t.projectId), index('filings_cik_idx').on(t.cik)],
);

export const sections = pgTable(
  'sections',
  {
    id: text('id').primaryKey(),
    accession: text('accession')
      .notNull()
      .references(() => filings.accession),
    item: text('item').notNull(),
    title: text('title').notNull(),
    kind: text('kind').$type<'text' | 'table'>().notNull(),
    ordinal: integer('ordinal').notNull(),
    text: text('text').notNull(),
    charCount: integer('char_count').notNull(),
  },
  (t) => [index('sections_accession_idx').on(t.accession)],
);

export const blocks = pgTable(
  'blocks',
  {
    id: text('id').primaryKey(),
    sectionId: text('section_id')
      .notNull()
      .references(() => sections.id),
    accession: text('accession').notNull(),
    type: text('type').notNull(),
    key: text('key'),
    label: text('label').notNull(),
    periodEnd: text('period_end'),
    months: integer('months'),
    value: doublePrecision('value'),
    unit: text('unit'),
    scale: text('scale'),
    text: text('text'),
    quote: text('quote').notNull(),
    spanStart: integer('span_start'),
    spanEnd: integer('span_end'),
    status: text('status').$type<BlockStatus>().notNull().default('unchecked'),
    /** The extractor call that produced this block (x-middleware-request-id). */
    mubitRequestId: text('mubit_request_id'),
    tsv: tsvector('tsv').generatedAlwaysAs(
      sql`to_tsvector('english', coalesce(label, '') || ' ' || coalesce(text, '') || ' ' || quote)`,
    ),
    createdAt: createdAt(),
  },
  (t) => [
    index('blocks_section_idx').on(t.sectionId),
    index('blocks_accession_key_idx').on(t.accession, t.key),
    index('blocks_tsv_idx').using('gin', t.tsv),
  ],
);

export const checks = pgTable(
  'checks',
  {
    id: text('id').primaryKey(),
    blockId: text('block_id')
      .notNull()
      .references(() => blocks.id),
    verifier: text('verifier').notNull(),
    passed: boolean('passed').notNull(),
    detail: text('detail').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('checks_block_idx').on(t.blockId)],
);

/** XBRL facts from the SEC companyfacts API: the answer key for verified numbers. */
export const facts = pgTable(
  'facts',
  {
    /** cik|concept|unit|periodStart|periodEnd|accession; instant facts have no start. */
    id: text('id').primaryKey(),
    cik: integer('cik').notNull(),
    concept: text('concept').notNull(),
    unit: text('unit').notNull(),
    periodStart: text('period_start'),
    periodEnd: text('period_end').notNull(),
    value: doublePrecision('value').notNull(),
    fy: integer('fy'),
    fp: text('fp'),
    form: text('form'),
    accession: text('accession').notNull(),
  },
  (t) => [
    index('facts_lookup_idx').on(t.cik, t.concept, t.periodEnd),
  ],
);

/** Standing desk rules. Every extractor call carries the active ones in its user message. */
export const rules = pgTable('rules', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(),
  text: text('text').notNull(),
  source: text('source').$type<'seed' | 'verifier' | 'user'>().notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
});

/** One row per LLM call through Mubit. */
export const llmCalls = pgTable(
  'llm_calls',
  {
    id: text('id').primaryKey(),
    task: text('task').$type<'desk_agent' | 'section_extractor' | 'unrecorded'>().notNull(),
    mubitRequestId: text('mubit_request_id'),
    recorded: boolean('recorded').notNull(),
    promptCacheKey: text('prompt_cache_key'),
    model: text('model').notNull(),
    latencyMs: integer('latency_ms').notNull(),
    tokensIn: integer('tokens_in'),
    tokensOut: integer('tokens_out'),
    ok: boolean('ok').notNull(),
    error: text('error'),
    createdAt: createdAt(),
  },
  (t) => [index('llm_calls_task_idx').on(t.task)],
);

export const conversations = pgTable('conversations', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id),
  /** Replayed questions (to give Mubit volume) don't start real extraction. */
  replay: boolean('replay').notNull().default(false),
  createdAt: createdAt(),
});

export interface ToolTraceEntry {
  tool: ToolName;
  args: unknown;
  summary: string;
  ok: boolean;
}

export const messages = pgTable(
  'messages',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id),
    role: text('role').$type<'user' | 'assistant'>().notNull(),
    content: text('content').notNull(),
    toolTrace: jsonb('tool_trace').$type<ToolTraceEntry[]>().notNull().default([]),
    /** The turn's tool calls and results as Responses API input items, replayed as history. */
    items: jsonb('items').$type<unknown[]>().notNull().default([]),
    /** An ask_user card shown at the end of the turn, if any. */
    choice: jsonb('choice').$type<{ id: string; question: string; options: string[] } | null>(),
    createdAt: createdAt(),
  },
  (t) => [index('messages_conversation_idx').on(t.conversationId)],
);

/** Dashboard history: every view the agent showed, newest last. */
export const views = pgTable(
  'views',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    spec: jsonb('spec').$type<ViewSpec>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('views_project_idx').on(t.projectId)],
);

/** Durable extraction v2 state. Legacy citations remain immutable. */
export const sourceDocuments = pgTable('source_documents', {
  id: text('id').primaryKey(), teamId: text('team_id').notNull(),
  accession: text('accession'), ticker: text('ticker'), name: text('name').notNull(),
  format: text('format').notNull(), checksum: text('checksum').notNull(),
  content: text('content').notNull(), rawBase64: text('raw_base64'),
  sourceUrl: text('source_url'), metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
}, t => [uniqueIndex('source_documents_identity').on(t.teamId, t.checksum, t.name, t.ticker)]);

export const projectDocuments = pgTable('project_documents', {
  id: text('id').primaryKey(), teamId: text('team_id').notNull(),
  projectId: text('project_id').notNull().references(() => projects.id),
  documentId: text('document_id').notNull().references(() => sourceDocuments.id),
}, t => [uniqueIndex('project_documents_membership').on(t.projectId, t.documentId)]);
export const projectFilings = pgTable('project_filings', {
  id: text('id').primaryKey(), teamId: text('team_id').notNull(),
  projectId: text('project_id').notNull().references(() => projects.id),
  accession: text('accession').notNull().references(() => filings.accession),
}, t => [uniqueIndex('project_filings_membership').on(t.projectId, t.accession)]);

export const extractionRequests = pgTable('extraction_requests', {
  id: text('id').primaryKey(), teamId: text('team_id').notNull(),
  projectId: text('project_id').notNull().references(() => projects.id),
  key: text('key').notNull().unique(), fingerprint: text('fingerprint').notNull(),
  text: text('text').notNull(), parentId: text('parent_id'),
  state: text('state').notNull().default('queued'), question: text('question'),
  plan: jsonb('plan').$type<Record<string, unknown>>(), error: text('error'), createdAt: createdAt(),
});
export const extractionRuns = pgTable('extraction_runs', {
  id: text('id').primaryKey(), teamId: text('team_id').notNull(),
  projectId: text('project_id').notNull().references(() => projects.id), requestId: text('request_id'),
  documentId: text('document_id').notNull().references(() => sourceDocuments.id),
  identity: text('identity').notNull().unique(), state: text('state').notNull().default('queued'),
  ruleVersion: integer('rule_version').notNull().default(0),
  specification: jsonb('specification').$type<Record<string, unknown>>().notNull().default({}),
  output: jsonb('output').$type<Record<string, unknown>>(), error: text('error'),
  accepted: boolean('accepted').notNull().default(false), createdAt: createdAt(), completedAt: timestamp('completed_at', { withTimezone: true }),
});
export const workJobs = pgTable('work_jobs', {
  id: text('id').primaryKey(), key: text('key').notNull().unique(), kind: text('kind').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  state: text('state').notNull().default('queued'), attempts: integer('attempts').notNull().default(0),
  availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
  leaseUntil: timestamp('lease_until', { withTimezone: true }), leaseToken: text('lease_token'),
  error: text('error'), createdAt: createdAt(),
}, t => [index('work_jobs_available').on(t.state, t.availableAt)]);
export const extractionEvents = pgTable('extraction_events', {
  id: bigserial('id', { mode: 'number' }).primaryKey(), teamId: text('team_id').notNull(),
  projectId: text('project_id').notNull(), runId: text('run_id'),
  type: text('type').notNull(), data: jsonb('data').$type<Record<string, unknown>>().notNull(), createdAt: createdAt(),
}, t => [index('extraction_events_project').on(t.projectId, t.id)]);
export const monitoringWatchlist = pgTable('monitoring_watchlist', {
  id: text('id').primaryKey(), teamId: text('team_id').notNull(), projectId: text('project_id').notNull(),
  ticker: text('ticker').notNull(), lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
  error: text('error'), createdAt: createdAt(),
}, t => [uniqueIndex('monitoring_watchlist_member').on(t.teamId, t.projectId, t.ticker)]);
export const policyVersions = pgTable('policy_versions', {
  id: text('id').primaryKey(), teamId: text('team_id').notNull(),
  version: integer('version').notNull(), ticker: text('ticker'),
  feedbackId: text('feedback_id'), lesson: text('lesson').notNull(),
  target: text('target').notNull(), active: boolean('active').notNull().default(true), createdAt: createdAt(),
}, t => [uniqueIndex('policy_versions_sequence').on(t.teamId, t.version)]);
export const extractionFeedback = pgTable('extraction_feedback', {
  id: text('id').primaryKey(), teamId: text('team_id').notNull(), projectId: text('project_id').notNull(),
  runId: text('run_id').notNull().references(() => extractionRuns.id), key: text('key').notNull().unique(),
  fingerprint: text('fingerprint').notNull(), text: text('text').notNull(),
  state: text('state').notNull().default('queued'), decision: jsonb('decision').$type<Record<string, unknown>>(),
  createdAt: createdAt(),
});
export const inferenceAttempts = pgTable('inference_attempts', {
  id: text('id').primaryKey(), teamId: text('team_id').notNull(), runId: text('run_id'),
  task: text('task').notNull(), route: text('route').notNull(), model: text('model').notNull(),
  requestId: text('request_id'), provider: text('provider'), latencyMs: doublePrecision('latency_ms').notNull(),
  tokensIn: integer('tokens_in'), tokensOut: integer('tokens_out'), costUsd: doublePrecision('cost_usd'),
  ok: boolean('ok').notNull(), error: text('error'), details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
});
/** Row locks reserve SEC request slots across API and worker processes. */
export const serviceLocks = pgTable('service_locks', {
  id: text('id').primaryKey(), nextAt: timestamp('next_at', { withTimezone: true }).notNull().defaultNow(),
});
export const requestRuns = pgTable('request_runs', {
  id: text('id').primaryKey(),
  requestId: text('request_id').notNull().references(() => extractionRequests.id),
  runId: text('run_id').notNull().references(() => extractionRuns.id),
}, t => [uniqueIndex('request_runs_membership').on(t.requestId, t.runId)]);
