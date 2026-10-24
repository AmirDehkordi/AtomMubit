import type { MetricKey, StepDisplay, StreamEvent, ViewSpec } from '@desk/shared';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface DeskFiling {
  accession: string;
  form: string;
  periodEnd: string;
  quarter: string;
  filedAt: string;
  url: string;
  status: string;
  ticker: string;
}

export interface StoredMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolTrace: { tool: string; summary: string; ok: boolean; display?: StepDisplay }[];
  choice: { id: string; question: string; options: string[] } | null;
}

export interface ProjectData {
  project: { id: string; title: string };
  conversationId: string | null;
  messages: StoredMessage[];
  filings: DeskFiling[];
  view: ViewSpec | null;
  /** Every view shown in this desk, oldest first: they become the dashboard tabs. */
  views: ViewSpec[];
}

export interface Cell {
  value: number | null;
  method: 'reported' | 'derived' | 'computed' | null;
  approximate: boolean;
  restated: boolean;
  accessions: string[];
  note: string | null;
}

export interface QuarterOverview {
  ticker: string;
  name: string;
  quarters: { periodEnd: string; quarter: string }[];
  rows: { key: string; label: string; unit: string; kind: 'value' | 'margin'; cells: Cell[] }[];
}

export interface Comparison {
  metric: MetricKey;
  label: string;
  unit: string;
  rows: { ticker: string; name: string; periodEnd: string; quarter: string; value: Cell; yearAgo: Cell; yoy: number | null }[];
}

export const ADAPTER_STATES = ['collecting', 'reviewing', 'training', 'testing', 'silent_test', 'rollout', 'live', 'prompt_only'] as const;
export type AdapterState = (typeof ADAPTER_STATES)[number];

export interface ConsoleStatus {
  task: string;
  kept: number | null;
  adapterVersion: string | null;
  adapterState: AdapterState | null;
  quality: number | null;
  note: string | null;
  updatedAt: string;
}

export interface MubitStatus {
  reviewLimit: number;
  firstTrainingAt: number;
  resetAt: string;
  tasks: {
    task: string;
    label: string;
    calls: number;
    callsToday: number;
    sessions: number;
    failed: number;
    avgLatencyMs: number | null;
    lastCallAt: string | null;
    console: ConsoleStatus | null;
  }[];
  recent: { task: string; requestId: string | null; latencyMs: number; ok: boolean; createdAt: string }[];
}

export const MUBIT_CONSOLE_URL = process.env.NEXT_PUBLIC_MUBIT_CONSOLE_URL ?? 'https://app.mubit.ai/';

export interface ReaderBlock {
  id: string;
  sectionId: string;
  accession: string;
  type: string;
  key: string | null;
  label: string;
  periodEnd: string | null;
  months: number | null;
  value: number | null;
  unit: string | null;
  scale: string | null;
  text: string | null;
  quote: string;
  spanStart: number | null;
  spanEnd: number | null;
  status: 'verified' | 'fixed' | 'review' | 'unchecked';
  checks: { verifier: string; passed: boolean; detail: string }[];
  corrections: { id: string; note: string; status: 'proposed' | 'applied'; ruleCode: string; ruleText: string }[];
}

export interface Rule {
  id: string;
  code: string;
  text: string;
  source: 'seed' | 'verifier' | 'user';
  active: boolean;
  createdAt: string;
}

export interface ProposedCorrection {
  correction: { id: string; blockId: string; status: 'proposed' };
  rule: Rule;
  affected: { id: string; accession: string; item: string; title: string }[];
}

async function post<T>(path: string, body: unknown = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

export interface FilingOutline {
  filing: { accession: string; ticker: string; form: string; periodEnd: string; quarter: string; url: string; status: string };
  sections: { id: string; item: string; title: string; kind: string; ordinal: number; charCount: number; blocks: number; review: number }[];
}

export interface SectionWithBlocks {
  section: { id: string; accession: string; item: string; title: string; kind: string; text: string };
  blocks: ReaderBlock[];
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

export const api = {
  createDesk: async (): Promise<{ projectId: string; conversationId: string }> => {
    const res = await fetch(`${API_URL}/conversations`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    if (!res.ok) throw new Error(`Could not start a desk (${res.status})`);
    return res.json();
  },
  outline: (accession: string) => get<FilingOutline>(`/filings/${accession}/sections`),
  section: (id: string) => get<SectionWithBlocks>(`/sections/${encodeURIComponent(id)}`),
  blocks: (ids: string[]) => get<ReaderBlock[]>(`/blocks?ids=${ids.map(encodeURIComponent).join(',')}`),
  rules: () => get<Rule[]>('/rules'),
  proposeCorrection: (input: { blockId: string; note: string; ruleCode: string | null; ruleText: string | null }) =>
    post<ProposedCorrection>('/corrections', input),
  applyCorrection: (id: string) => post<{ sectionIds: string[] }>(`/corrections/${id}/apply`),
  dismissCorrection: (id: string) => post<{ ok: true }>(`/corrections/${id}/dismiss`),
  mubitStatus: () => get<MubitStatus>('/mubit/status'),
  saveConsoleStatus: async (status: Omit<ConsoleStatus, 'updatedAt'>) => {
    const res = await fetch(`${API_URL}/mubit/console-status`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(status),
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    return res.json() as Promise<ConsoleStatus>;
  },
  project: (id: string) => get<ProjectData>(`/projects/${id}`),
  overview: (ticker: string, periods: string[]) =>
    get<QuarterOverview>(`/views/quarter-overview?ticker=${encodeURIComponent(ticker)}&periods=${periods.join(',')}`),
  metric: (ticker: string, metric: string, periods: string[]) =>
    get<QuarterOverview>(`/views/metric?ticker=${encodeURIComponent(ticker)}&metric=${metric}&periods=${periods.join(',')}`),
  compare: (metric: string, tickers: string[], periodEnd: string | null) =>
    get<Comparison>(`/views/compare?metric=${metric}&tickers=${tickers.join(',')}&periodEnd=${periodEnd ?? ''}`),
};

/** Sends one chat message and calls `onEvent` for each server-sent event until the turn ends. */
export async function streamChat(conversationId: string, text: string, onEvent: (e: StreamEvent) => void): Promise<void> {
  const res = await fetch(`${API_URL}/chat/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok || !res.body) throw new Error(`Chat failed (${res.status})`);
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let split: number;
    while ((split = buffer.indexOf('\n\n')) >= 0) {
      const frame = buffer.slice(0, split);
      buffer = buffer.slice(split + 2);
      const data = frame
        .split('\n')
        .filter((l) => l.startsWith('data: '))
        .map((l) => l.slice(6))
        .join('\n');
      if (data) onEvent(JSON.parse(data) as StreamEvent);
    }
  }
}
