'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, ExternalLink, Pencil, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { ADAPTER_STATES, MUBIT_CONSOLE_URL, api, type AdapterState, type MubitStatus } from '@/lib/api';
import { cn } from '@/lib/cn';

const STATE_LABELS: Record<AdapterState, string> = {
  collecting: 'Collecting examples',
  reviewing: 'Reviewing examples',
  training: 'Training',
  testing: 'Testing',
  silent_test: 'Silent test',
  rollout: 'Partial rollout',
  live: 'Live',
  prompt_only: 'Prompt only',
};

/** Opens the Mubit panel. */
export function MubitButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cn(
          'border-line text-muted hover:text-text hover:border-accent/60 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-colors',
          className,
        )}
      >
        <Activity className="text-accent size-3.5" /> Mubit
      </button>
      <AnimatePresence>{open && <MubitPanel onClose={() => setOpen(false)} />}</AnimatePresence>
    </>
  );
}

/** How the desk feeds Mubit: calls per task, today's review budget, and what the console shows. */
function MubitPanel({ onClose }: { onClose: () => void }) {
  const { data, error } = useQuery({ queryKey: ['mubit'], queryFn: api.mubitStatus, refetchInterval: 10_000 });
  const rules = useQuery({ queryKey: ['rules'], queryFn: api.rules, refetchInterval: 10_000 });
  const active = (rules.data ?? []).filter((r) => r.active).sort((a, b) => Number(a.code.slice(1)) - Number(b.code.slice(1)));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <motion.div
        className="fixed inset-0 z-40 bg-black/50"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.aside
        className="border-line bg-ink fixed top-0 right-0 z-50 flex h-dvh w-full max-w-md flex-col border-l"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        <header className="border-line flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="font-semibold">Mubit</h2>
            <p className="text-muted text-xs">Every LLM call goes through Mubit, which trains a small model per task.</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-text" aria-label="Close">
            <X className="size-4" />
          </button>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {error && <p className="text-down text-sm">Could not load: {String(error)}</p>}
          {data?.tasks.map((t) => (
            <TaskCard key={t.task} task={t} status={data} />
          ))}
          {active.length > 0 && (
            <section>
              <h3 className="text-muted mb-1 text-xs tracking-wide uppercase">Desk rules ({active.length})</h3>
              <p className="text-muted mb-2 text-xs">Every section_extractor call carries these. Corrections add new ones.</p>
              <ul className="border-line divide-line divide-y rounded-xl border">
                {active.map((r) => (
                  <li key={r.id} className="flex gap-2 px-3 py-2 text-xs">
                    <span className="text-accent w-7 shrink-0 font-semibold">{r.code}</span>
                    <span className="flex-1">{r.text}</span>
                    {r.source !== 'seed' && (
                      <span className="border-line text-muted h-fit shrink-0 rounded border px-1 text-[10px]">
                        {r.source === 'user' ? 'from a correction' : 'from a check'}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {data && data.recent.length > 0 && (
            <section>
              <h3 className="text-muted mb-2 text-xs tracking-wide uppercase">Latest calls</h3>
              <ul className="border-line divide-line divide-y rounded-xl border">
                {data.recent.map((c, i) => (
                  <li key={`${c.requestId}-${i}`} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                    <span className="truncate font-mono" title={c.requestId ?? ''}>
                      {c.requestId ?? 'no request id'}
                    </span>
                    <span className="text-muted shrink-0">
                      {c.task === 'desk_agent' ? 'agent' : c.task === 'section_extractor' ? 'extractor' : c.task} ·{' '}
                      {(c.latencyMs / 1000).toFixed(1)}s · {time(c.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <footer className="border-line border-t px-5 py-3">
          <a
            href={MUBIT_CONSOLE_URL}
            target="_blank"
            rel="noreferrer"
            className="text-accent inline-flex items-center gap-1.5 text-sm hover:underline"
          >
            Open the Mubit console <ExternalLink className="size-3.5" />
          </a>
        </footer>
      </motion.aside>
    </>
  );
}

function TaskCard({ task, status }: { task: MubitStatus['tasks'][number]; status: MubitStatus }) {
  const [editing, setEditing] = useState(false);
  const budgetUsed = Math.min(task.callsToday, status.reviewLimit);
  const c = task.console;
  const kept = c?.kept ?? null;

  return (
    <section className="border-line bg-panel rounded-xl border p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-medium">{task.label}</h3>
        <span className="text-muted font-mono text-xs">{task.task}</span>
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Stat label="Calls recorded" value={task.calls.toLocaleString()} />
        <Stat label="Sessions" value={task.sessions.toLocaleString()} />
        <Stat label="Avg call" value={task.avgLatencyMs ? `${(task.avgLatencyMs / 1000).toFixed(1)}s` : '—'} />
      </dl>

      <div className="mt-4">
        <div className="mb-1 flex justify-between text-xs">
          <span className="text-muted">Today&apos;s review budget</span>
          <span>
            {budgetUsed} of {status.reviewLimit} used
            {task.callsToday > status.reviewLimit && <span className="text-muted"> · {task.callsToday.toLocaleString()} sent</span>}
          </span>
        </div>
        <Bar value={budgetUsed / status.reviewLimit} />
        <p className="text-muted mt-1 text-xs">
          Mubit reviews up to {status.reviewLimit} new calls per task a day. Resets in {until(status.resetAt)} (00:00 UTC).
        </p>
      </div>

      <div className="border-line mt-4 border-t pt-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-muted text-xs tracking-wide uppercase">From the Mubit console</span>
          <button onClick={() => setEditing((v) => !v)} className="text-muted hover:text-text inline-flex items-center gap-1 text-xs">
            <Pencil className="size-3" /> {editing ? 'Cancel' : 'Update'}
          </button>
        </div>
        {editing ? (
          <ConsoleForm task={task.task} current={c} onDone={() => setEditing(false)} />
        ) : c ? (
          <div className="space-y-2 text-sm">
            <div>
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-muted">Kept examples</span>
                <span>
                  {kept ?? '—'} {kept !== null && kept < status.firstTrainingAt && `of ${status.firstTrainingAt} for the first adapter`}
                </span>
              </div>
              <Bar value={kept === null ? 0 : Math.min(kept / status.firstTrainingAt, 1)} />
            </div>
            <p>
              {c.adapterVersion ? <span className="font-medium">{c.adapterVersion} · </span> : null}
              {c.adapterState ? STATE_LABELS[c.adapterState] : 'No adapter yet'}
              {c.quality !== null && <span className="text-muted"> · {(c.quality * 100).toFixed(1)}% match</span>}
            </p>
            {c.note && <p className="text-muted text-xs">{c.note}</p>}
            <p className="text-muted text-xs">Updated {time(c.updatedAt)}</p>
          </div>
        ) : (
          <p className="text-muted text-sm">Not recorded yet. Copy kept examples and adapter status from the console.</p>
        )}
      </div>
    </section>
  );
}

function ConsoleForm({
  task,
  current,
  onDone,
}: {
  task: string;
  current: MubitStatus['tasks'][number]['console'];
  onDone: () => void;
}) {
  const client = useQueryClient();
  const [kept, setKept] = useState(current?.kept?.toString() ?? '');
  const [version, setVersion] = useState(current?.adapterVersion ?? '');
  const [state, setState] = useState<AdapterState | ''>(current?.adapterState ?? '');
  const [quality, setQuality] = useState(current?.quality !== null && current?.quality !== undefined ? (current.quality * 100).toString() : '');
  const [note, setNote] = useState(current?.note ?? '');
  const save = useMutation({
    mutationFn: () =>
      api.saveConsoleStatus({
        task,
        kept: kept === '' ? null : Number(kept),
        adapterVersion: version || null,
        adapterState: state || null,
        quality: quality === '' ? null : Number(quality) / 100,
        note: note || null,
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['mubit'] });
      onDone();
    },
  });
  const field = 'border-line bg-ink focus:border-accent/60 w-full rounded-lg border px-2.5 py-1.5 text-sm outline-none';
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        <label className="text-muted text-xs">
          Kept examples
          <input className={field} inputMode="numeric" value={kept} onChange={(e) => setKept(e.target.value.replace(/\D/g, ''))} />
        </label>
        <label className="text-muted text-xs">
          Adapter version
          <input className={field} placeholder="v1" value={version} onChange={(e) => setVersion(e.target.value)} />
        </label>
        <label className="text-muted text-xs">
          State
          <select className={field} value={state} onChange={(e) => setState(e.target.value as AdapterState | '')}>
            <option value="">No adapter yet</option>
            {ADAPTER_STATES.map((s) => (
              <option key={s} value={s}>
                {STATE_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-muted text-xs">
          Quality (% match)
          <input className={field} inputMode="decimal" value={quality} onChange={(e) => setQuality(e.target.value.replace(/[^\d.]/g, ''))} />
        </label>
      </div>
      <label className="text-muted block text-xs">
        Note
        <input className={field} placeholder="e.g. Reviewer: 200 new, 31 kept" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      {save.error && <p className="text-down text-xs">{String(save.error)}</p>}
      <button type="submit" disabled={save.isPending} className="bg-accent text-ink rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50">
        Save
      </button>
    </form>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-ink rounded-lg px-2 py-2">
      <dd className="font-semibold tabular-nums">{value}</dd>
      <dt className="text-muted text-[11px]">{label}</dt>
    </div>
  );
}

function Bar({ value }: { value: number }) {
  return (
    <div className="bg-ink h-2 overflow-hidden rounded-full">
      <div className="bg-accent h-full rounded-full transition-all" style={{ width: `${Math.round(value * 100)}%` }} />
    </div>
  );
}

function time(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function until(iso: string): string {
  const ms = Math.max(0, new Date(iso).getTime() - Date.now());
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h ? `${h}h ${m}m` : `${m}m`;
}
