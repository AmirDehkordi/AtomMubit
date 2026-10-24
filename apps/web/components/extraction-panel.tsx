'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { API_URL } from '@/lib/api';

type Fact = {
  id: string;
  status: 'verified' | 'fixed' | 'review';
  supported: boolean;
  fact: { key: string; label: string; value: number | null; range: { low: number; high: number } | null; unit: string | null; currency: string | null; scale: string | null; period: { start: string | null; end: string; months: number } | null; missingReason: string | null; quote: string };
  normalized: { value: number | null; currency: string; scale: string; unit: string } | null;
  span: { start: number; end: number; offsetUnit: string } | null;
  checks: Array<{ verifier: string; outcome: string; detail: string }>;
};
type Run = { id: string; state: string; documentId?: string | null; output?: { facts?: Fact[]; missingFields?: string[]; blocks?: Array<{ title?: string; text?: string; quote?: string }> } | null; error?: string | null };
type ExtractionRequest = { id: string; parentId?: string | null; state?: string; status?: string; text?: string; question?: string | null; error?: string | null; plan?: Record<string, unknown> | null };
type Feedback = { id: string; state?: string; status?: string; text?: string; decision?: { reason?: string; ruleVersion?: number | null; decision?: string } | null };
type DataResponse = { requests?: ExtractionRequest[]; runs?: Run[]; feedback?: Feedback[]; events?: Array<{ id?: string; type?: string; message?: string; createdAt?: string }>; nextCursor?: number };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, init);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

function isActive(data: DataResponse) {
  const states = [
    ...(data.runs ?? []).map((item) => item.state),
    ...(data.requests ?? []).map((item) => item.state ?? item.status ?? ''),
    ...(data.feedback ?? []).map((item) => item.state ?? item.status ?? ''),
  ];
  return states.some((state) => ['queued', 'running', 'processing', 'evaluating'].includes(state));
}

export function ExtractionPanel({ projectId }: { projectId: string }) {
  const [data, setData] = useState<DataResponse>({});
  const [prompt, setPrompt] = useState('');
  const [ticker, setTicker] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [feedbackRun, setFeedbackRun] = useState('');
  const [feedbackText, setFeedbackText] = useState('');
  const [answerRequest, setAnswerRequest] = useState('');
  const [clarificationAnswer, setClarificationAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollController = useRef<AbortController | null>(null);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const result = await request<DataResponse>(`/v1/data?projectId=${encodeURIComponent(projectId)}`, { signal });
    setData(result);
    return result;
  }, [projectId]);

  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    pollController.current = controller;
    const poll = async () => {
      try {
        const result = await refresh(controller.signal);
        if (!disposed) timer.current = setTimeout(poll, isActive(result) ? 2500 : 10_000);
      } catch (err) {
        if (!disposed && !(err instanceof DOMException && err.name === 'AbortError')) setError(err instanceof Error ? err.message : 'Could not load extraction data.');
      }
    };
    void poll();
    return () => {
      disposed = true;
      controller.abort();
      pollController.current?.abort();
      if (timer.current) clearTimeout(timer.current);
      if (pollController.current === controller) pollController.current = null;
    };
  }, [refresh]);

  const runAction = async (action: () => Promise<{ id?: string; requestId?: string; runId?: string; documentId?: string; feedbackId?: string }>, label: string) => {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await action();
      const reference = result.id ?? result.requestId ?? result.runId ?? result.documentId ?? result.feedbackId;
      setNotice(`${label}${reference ? ` · ${reference}` : ''}`);
      await refresh();
      if (timer.current) clearTimeout(timer.current);
      pollController.current?.abort();
      const controller = new AbortController();
      pollController.current = controller;
      const poll = async () => {
        try {
          const next = await refresh(controller.signal);
          if (!controller.signal.aborted) timer.current = setTimeout(() => void poll(), isActive(next) ? 2500 : 10_000);
        } catch (err) {
          if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Could not refresh extraction status.');
        }
      };
      timer.current = setTimeout(() => void poll(), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The request failed.');
    } finally { setBusy(false); }
  };

  const submitRequest = (text = prompt, parentRequestId?: string) => runAction(async () => request<{ id?: string; requestId?: string; runId?: string }>('/v1/extractions', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projectId, request: text, ...(parentRequestId ? { parentRequestId } : {}) }),
  }), 'Extraction request submitted');

  const submitClarification = (requestId: string) => {
    const answer = clarificationAnswer.trim();
    if (!answer) return;
    const documentIds = data.requests?.find((item) => item.id === requestId)?.plan?.documentIds;
    void runAction(async () => request<{ requestId?: string }>('/v1/extractions', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId, request: answer, parentRequestId: requestId, ...(Array.isArray(documentIds) ? { documentIds } : {}) }),
    }), 'Clarification submitted').then(() => { setAnswerRequest(''); setClarificationAnswer(''); });
  };

  const upload = () => runAction(async () => {
    if (!file) throw new Error('Choose an HTML, text, or text-based PDF file first.');
    const extension = file.name.toLowerCase().split('.').pop();
    if (!['html', 'htm', 'txt', 'pdf'].includes(extension ?? '')) throw new Error('Supported file types are HTML, TXT, and text-based PDF. Scanned PDF OCR is not supported.');
    const body = new FormData(); body.append('file', file); body.append('projectId', projectId);
    if (ticker.trim()) body.append('ticker', ticker.trim().toUpperCase());
    return request<{ id?: string; requestId?: string; runId?: string; documentId?: string }>('/v1/files', { method: 'POST', body });
  }, 'Document uploaded');

  const submitFeedback = () => runAction(async () => request<{ id?: string; requestId?: string; runId?: string; feedbackId?: string }>('/v1/feedback', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projectId, runId: feedbackRun, text: feedbackText }),
  }), 'Feedback submitted');

  return (
    <section className="border-line border-b px-4 py-3">
      <details>
        <summary className="cursor-pointer select-none text-sm font-medium">Document extraction <span className="text-muted ml-1 text-xs">{data.requests?.length ?? 0} requests · {data.runs?.length ?? 0} runs</span></summary>
        <div className="mt-3 space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <input aria-label="Company ticker" value={ticker} onChange={(e) => setTicker(e.target.value)} placeholder="Ticker (optional)" className="border-line bg-panel min-w-0 rounded border px-2 py-2 text-xs" />
            <label className="border-line bg-panel flex cursor-pointer items-center overflow-hidden rounded border px-2 py-2 text-xs">
              <span className="text-muted truncate">{file?.name ?? 'Choose HTML / TXT / PDF'}</span>
              <input aria-label="Upload source document" type="file" accept=".html,.htm,.txt,.pdf,text/html,text/plain,application/pdf" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
          </div>
          <button disabled={busy || !file} onClick={() => void upload()} className="border-line hover:bg-panel rounded border px-3 py-2 text-xs disabled:opacity-50">Upload and extract</button>
          <textarea aria-label="Extraction request" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Ask for facts, e.g. extract revenue and diluted EPS for the latest quarter" rows={2} className="border-line bg-panel w-full resize-y rounded border px-3 py-2 text-xs" />
          <button disabled={busy || !prompt.trim()} onClick={() => void submitRequest()} className="bg-accent rounded px-3 py-2 text-xs font-medium text-black disabled:opacity-50">Submit extraction request</button>
          <p className="text-muted text-[11px]">PDF support is for text-based documents. Scanned PDFs need OCR and are reported as unsupported.</p>
          {(notice || error) && <p role="status" className={error ? 'text-down break-words text-xs' : 'text-up break-words text-xs'}>{error || notice}</p>}

          <div className="space-y-2">
            {(data.requests ?? []).map((item) => {
              const state = item.state ?? item.status ?? 'submitted';
              const alreadyAnswered = (data.requests ?? []).some((candidate) => candidate.parentId === item.id);
              return <article key={item.id} className="border-line bg-panel rounded border p-3">
                <div className="flex justify-between gap-2 text-xs"><span>Request {item.id.slice(0, 8)}</span><span className="text-muted">{state}</span></div>
                {item.text && <p className="mt-1 text-xs">{item.text}</p>}
                {item.error && <p className="text-down mt-1 break-words text-xs">{item.error}</p>}
                {state === 'needs_clarification' && item.question && <div className="mt-2">
                  <p className="text-accent text-xs">{item.question}</p>
                  {alreadyAnswered ? <p className="text-muted mt-2 text-xs">A clarification response is already being processed.</p> : <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); submitClarification(item.id); }}>
                    <input aria-label="Clarification answer" value={answerRequest === item.id ? clarificationAnswer : ''} onFocus={() => setAnswerRequest(item.id)} onChange={(e) => { setAnswerRequest(item.id); setClarificationAnswer(e.target.value); }} placeholder="Answer the clarification" className="border-line bg-ink min-w-0 flex-1 rounded border px-2 py-2 text-xs" />
                    <button disabled={busy || answerRequest !== item.id || !clarificationAnswer.trim()} className="border-line rounded border px-2 py-1 text-xs disabled:opacity-50">Send</button>
                  </form>}
                </div>}
              </article>;
            })}
            {(data.feedback ?? []).map((item) => <article key={item.id} className="border-line bg-panel rounded border p-3 text-xs">
              <div className="flex justify-between gap-2"><span>Feedback {item.id.slice(0, 8)}</span><span className="text-muted">{item.state ?? item.status ?? 'submitted'}</span></div>
              {item.text && <p className="mt-1">{item.text}</p>}
              {item.decision?.reason && <p className="text-muted mt-1">{item.decision.reason}</p>}
              {item.decision?.ruleVersion != null && <p className="text-muted mt-1">Rule version {item.decision.ruleVersion}</p>}
            </article>)}
            {(data.runs ?? []).map((run) => (
              <article key={run.id} className="border-line bg-panel rounded border p-3">
                <div className="flex items-center justify-between gap-2"><strong className="text-xs">Run {run.id.slice(0, 8)}</strong><span className="text-muted text-[11px]">{run.state}</span></div>
                {run.error && <p className="text-down mt-2 break-words text-xs">{run.error}</p>}
                {!!run.output?.facts?.length && <ul className="mt-2 space-y-2">
                  {run.output.facts.map((entry) => {
                    const fact = entry.fact;
                    const printedValue = fact.value == null && fact.range
                      ? `${fact.range.low.toLocaleString()}–${fact.range.high.toLocaleString()}`
                      : fact.value?.toLocaleString() ?? 'Missing';
                    const printed = `${fact.currency ? `${fact.currency} ` : ''}${printedValue}${fact.unit ? ` ${fact.unit}` : ''}${fact.scale && fact.scale !== 'units' ? ` (${fact.scale})` : ''}`;
                    return <li key={entry.id} className="border-line border-t pt-2">
                      <div className="flex justify-between gap-2"><span>{fact.label || fact.key}</span><span className="font-medium">{printed}</span></div>
                      <div className="text-muted mt-1 text-[11px]">{entry.supported ? entry.status : 'Needs review · unsupported'}{fact.period ? ` · ${fact.period.months} months to ${fact.period.end}` : ''}</div>
                      {entry.normalized?.value != null && <p className="text-muted mt-1 text-xs">Normalized: {entry.normalized.currency} {entry.normalized.value.toLocaleString()} {entry.normalized.scale}</p>}
                      {fact.missingReason && <p className="text-muted mt-1 text-xs">{fact.missingReason}</p>}
                      {fact.quote && <blockquote className="text-muted mt-1 border-l-2 border-line pl-2 text-xs">“{fact.quote}”</blockquote>}
                      {entry.span && <p className="text-muted mt-1 text-[10px]">Evidence offsets: {entry.span.start}–{entry.span.end} ({entry.span.offsetUnit})</p>}
                      {!entry.supported && entry.checks.length > 0 && <ul className="text-muted mt-1 list-disc pl-4 text-[10px]">{entry.checks.filter((check) => check.outcome !== 'pass').map((check, i) => <li key={`${check.verifier}-${i}`}>{check.verifier}: {check.detail}</li>)}</ul>}
                    </li>;
                  })}
                </ul>}
                {run.output?.missingFields?.length ? <p className="text-muted mt-2 text-xs">Missing fields: {run.output.missingFields.join(', ')}</p> : null}
                <details className="text-muted mt-2"><summary className="cursor-pointer text-xs">Provide feedback on this run</summary>
                  <textarea value={feedbackRun === run.id ? feedbackText : ''} onFocus={() => setFeedbackRun(run.id)} onChange={(e) => { setFeedbackRun(run.id); setFeedbackText(e.target.value); }} rows={2} placeholder="What should be corrected?" className="border-line bg-ink mt-2 w-full rounded border px-2 py-2 text-xs" />
                  <button disabled={busy || feedbackRun !== run.id || !feedbackText.trim()} onClick={() => void submitFeedback()} className="border-line mt-2 rounded border px-2 py-1 text-xs disabled:opacity-50">Send feedback</button>
                </details>
              </article>
            ))}
            {!(data.runs?.length) && <p className="text-muted text-xs">No extraction runs yet.</p>}
          </div>
        </div>
      </details>
    </section>
  );
}
