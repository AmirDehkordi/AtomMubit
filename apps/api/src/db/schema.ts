import { sql } from 'drizzle-orm';
import {
  boolean,
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import type { BlockStatus, FilingStatus, StepDisplay, ToolName, ViewSpec } from '@desk/shared';

const tsvector = customType<{ data: string }>({ dataType: () => 'tsvector' });

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const projects = pgTable('projects', {
  id: text('id').primaryKey(),
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
  /** UI-only detail for the step (never sent to the model). */
  display?: StepDisplay;
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

export const ADAPTER_STATES = ['collecting', 'reviewing', 'training', 'testing', 'silent_test', 'rollout', 'live', 'prompt_only'] as const;
export type AdapterState = (typeof ADAPTER_STATES)[number];

/**
 * What Mubit's console shows for a task (kept examples, adapter version and
 * state). Mubit has no API for this, so the team copies it in from the console.
 */
export const mubitStatus = pgTable('mubit_status', {
  task: text('task').primaryKey(),
  kept: integer('kept'),
  adapterVersion: text('adapter_version'),
  adapterState: text('adapter_state').$type<AdapterState>(),
  /** Share of held-out test cases matching the provider, 0–1. */
  quality: doublePrecision('quality'),
  note: text('note'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A person's correction of an extracted block. It proposes a desk rule; once
 * confirmed, the rule becomes active and the affected sections are re-read
 * with it (those re-read calls are the corrected examples Mubit learns from).
 */
export const corrections = pgTable(
  'corrections',
  {
    id: text('id').primaryKey(),
    blockId: text('block_id')
      .notNull()
      .references(() => blocks.id),
    accession: text('accession').notNull(),
    sectionId: text('section_id').notNull(),
    projectId: text('project_id'),
    note: text('note').notNull(),
    ruleId: text('rule_id')
      .notNull()
      .references(() => rules.id),
    status: text('status').$type<'proposed' | 'applied' | 'dismissed'>().notNull().default('proposed'),
    /** Sections re-read when the correction was applied. */
    rereadSections: jsonb('reread_sections').$type<string[]>().notNull().default([]),
    createdAt: createdAt(),
    appliedAt: timestamp('applied_at', { withTimezone: true }),
  },
  (t) => [index('corrections_block_idx').on(t.blockId)],
);

/** Which filings are on which desk. A filing can be on many desks. */
export const projectFilings = pgTable(
  'project_filings',
  {
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    accession: text('accession')
      .notNull()
      .references(() => filings.accession),
    addedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.accession] }), index('project_filings_accession_idx').on(t.accession)],
);
