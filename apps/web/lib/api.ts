import type { MetricKey, StreamEvent, ViewSpec } from '@desk/shared';

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
  toolTrace: { tool: string; summary: string; ok: boolean }[];
  choice: { id: string; question: string; options: string[] } | null;
}

export interface ProjectData {
  project: { id: string; title: string };
  conversationId: string | null;
  messages: StoredMessage[];
  filings: DeskFiling[];
  view: ViewSpec | null;
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
