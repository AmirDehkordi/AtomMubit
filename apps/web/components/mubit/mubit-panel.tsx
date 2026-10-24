'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check, ChevronRight, ExternalLink, Pencil, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { ADAPTER_STATES, MUBIT_CONSOLE_URL, api, type AdapterState, type MubitStatus, type RecordedTurn } from '@/lib/api';
import { cn } from '@/lib/cn';
import { companyName } from '@/lib/company';
import { MubitMark } from './mubit-mark';

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

/**
 * The only place the analyst sees Mubit: a quiet "Powered by Mubit" label. It opens what Mubit is
 * learning from. Everything else on screen is MuTick.
 */
/** Shared by the Mubit and New buttons in the chat toolbar, so the two read as a pair. */
export const toolbarButton =
  'border-line text-text hover:bg-raised grid size-8 shrink-0 place-items-center rounded-lg border transition-colors hover:border-[color-mix(in_oklab,var(--color-text)_20%,transparent)]';

export function MubitButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="What Mubit is learning from"
        aria-label="What Mubit is learning from"
        className={cn(toolbarButton, className)}
      >
        <MubitMark className="size-4" />
      </button>
      <AnimatePresence>{open && <MubitPanel onClose={() => setOpen(false)} />}</AnimatePresence>
    </>
  );
}

/** On the start screen, under the prompts: look at the real material, close it, then start working. */
export function MubitLearningLink() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="group text-muted hover:text-text mx-auto mt-8 flex items-center gap-1.5 text-sm transition-colors"
      >
        See what Mubit is learning from
        <ArrowRight className="text-accent size-3.5 transition-transform group-hover:translate-x-0.5" />
      </button>
      <AnimatePresence>{open && <MubitPanel onClose={() => setOpen(false)} />}</AnimatePresence>
    </>
  );
}

/** How the desk feeds Mubit: calls per task, today's review budget, and what the console shows. */
function MubitPanel({ onClose }: { onClose: () => void }) {
  const { data, error } = useQuery({ queryKey: ['mubit'], queryFn: api.mubitStatus, refetchInterval: 10_000 });
  const rules = useQuery({ queryKey: ['rules'], queryFn: api.rules, refetchInterval: 10_000 });
  const recorded = useQuery({ queryKey: ['mubit-recorded'], queryFn: api.mubitRecorded, refetchInterval: 10_000 });
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
            <h2 className="flex items-center gap-2 font-semibold">
              <MubitMark className="size-4" /> What Mubit is learning from
            </h2>
            <p className="text-muted max-w-sm text-xs">
              Every AI call MuTick makes goes through Mubit. It keeps the good answers and trains a small model of MuTick&apos;s
              own from them.
            </p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-text" aria-label="Close">
            <X className="size-4" />
          </button>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {error && <p className="text-down text-sm">Could not load: {String(error)}</p>}
          <Section title="Recorded for training">
            <Recorded turns={recorded.data} error={recorded.error} />
          </Section>
          {data && (
            <Section title="How far it has got">
              <div className="space-y-3">
                {data.tasks.map((t) => (
                  <TaskCard key={t.task} task={t} status={data} />
                ))}
              </div>
            </Section>
          )}
          {active.length > 0 && (
            <Section title={`Desk rules (${active.length})`}>
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
            </Section>
          )}
        </div>
        <footer className="border-line space-y-2 border-t px-5 py-3">
          <p className="text-subtle text-xs">
            Mubit keeps the best of these calls and trains on them. Which ones it kept, and the kept count, come from the Mubit
            console.
          </p>
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

/** A panel section whose title opens and closes it. */
function Section({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="text-muted hover:text-text flex w-full items-center gap-1.5 py-1 text-xs tracking-wide uppercase transition-colors"
      >
        <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
        {title}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="pt-2">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

/** The real conversations the chat sent through Mubit, newest first, shown the way the chat showed them. */
function Recorded({ turns, error }: { turns?: RecordedTurn[]; error: unknown }) {
  if (error) return <p className="text-down text-sm">Could not load: {String(error)}</p>;
  if (!turns) return <p className="text-subtle text-sm">Loading…</p>;
  if (!turns.length) return <p className="text-subtle text-sm">Nothing yet. Ask MuTick a question and it shows up here.</p>;
  // Turns come newest first; group them by conversation, keeping that order between conversations.
  const groups: RecordedTurn[][] = [];
  for (const t of turns) {
    const g = groups.find((x) => x[0]!.conversationId === t.conversationId);
    if (g) g.push(t);
    else groups.push([t]);
  }
  return (
    <div className="space-y-2">
      {groups.map((g) => (
        <Conversation key={g[0]!.conversationId} turns={[...g].reverse()} />
      ))}
    </div>
  );
}

function Conversation({ turns }: { turns: RecordedTurn[] }) {
  const [open, setOpen] = useState(false);
  const asked = turns.filter((t) => !t.choiceReply).length;
  return (
    <div className="bg-panel rounded-xl">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="hover:bg-raised/60 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left transition-colors"
      >
        <ChevronRight className={cn('text-subtle size-3.5 shrink-0 transition-transform', open && 'rotate-90')} />
        <span className="truncate text-sm font-medium">{deskName(turns[0]!.desk)}</span>
        <span className="text-subtle shrink-0 text-xs tabular-nums">{time(turns[turns.length - 1]!.at)}</span>
        {turns.some((t) => t.replay) && <span className="text-subtle shrink-0 text-xs">· replayed</span>}
        {/* A conversation cut off by the list's limit can start mid-way, with only a button press left. */}
        {asked > 0 && (
          <span className="text-subtle ml-auto shrink-0 text-xs">
            {asked} question{asked === 1 ? '' : 's'}
          </span>
        )}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-3 px-3 pt-1 pb-3">
              {turns.map((t, i) => (
                <Turn key={`${t.at}-${i}`} turn={t} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Turn({ turn }: { turn: RecordedTurn }) {
  const [ids, setIds] = useState(false);
  const calls = turn.requestIds.length;
  return (
    <div className="space-y-1.5">
      {turn.choiceReply ? (
        <p className="text-muted flex items-center gap-1.5 text-xs">
          <Check className="text-up size-3.5" /> {turn.question}
        </p>
      ) : (
        <div className="flex justify-end">
          <p className="bg-raised max-w-[85%] rounded-[18px] px-3.5 py-2 text-sm leading-relaxed">{turn.question}</p>
        </div>
      )}
      <p className="text-text/85 line-clamp-2 text-sm leading-relaxed">{turn.answer.replace(/\s*\[\[[^\]]*\]\]/g, '')}</p>
      <button
        onClick={() => setIds((v) => !v)}
        aria-expanded={ids}
        disabled={!calls}
        className="text-subtle hover:text-muted inline-flex items-center gap-1 text-[11px] transition-colors disabled:hover:text-subtle"
      >
        <MubitMark className="size-3" /> Recorded · {calls} call{calls === 1 ? '' : 's'}
        {calls > 0 && <ChevronRight className={cn('size-3 transition-transform', ids && 'rotate-90')} />}
      </button>
      {ids && (
        <ul className="text-subtle space-y-0.5 font-mono text-[11px]">
          {turn.requestIds.map((id) => (
            <li key={id} className="truncate select-all">
              {id}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** "NVDA · Q3 FY2026 → Q2 FY2027" → "NVIDIA". Anything else is shown as it is. */
function deskName(title: string): string {
  const head = title.split(' · ')[0] ?? title;
  return /^[A-Z.]{1,6}$/.test(head) ? companyName(head) : head;
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

      <LearningPath task={task} status={status} />

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

/** Where the task is on the way to a model of the desk's own. Steps light up as they're reached. */
function LearningPath({ task, status }: { task: MubitStatus['tasks'][number]; status: MubitStatus }) {
  const c = task.console;
  const state = c?.adapterState ?? null;
  const trained = state !== null && !['collecting', 'reviewing', 'prompt_only'].includes(state);
  const serving = state === 'rollout' || state === 'live';
  const reviewed = Math.min(task.callsToday, status.reviewLimit);
  const steps: { label: string; value: string; done: boolean; hint?: string }[] = [
    { label: 'Calls recorded', value: task.calls.toLocaleString(), done: task.calls > 0 },
    { label: 'Sent for review', value: `${reviewed} today`, done: reviewed > 0, hint: `Mubit reviews up to ${status.reviewLimit} a day` },
    {
      label: 'Examples kept',
      value: c?.kept != null ? `${c.kept} of ${status.firstTrainingAt}` : '—',
      done: (c?.kept ?? 0) > 0,
      hint: c?.kept == null ? 'From the Mubit console' : `${status.firstTrainingAt} train the first model`,
    },
    {
      label: 'Own model trained',
      value: trained ? `${c?.adapterVersion ?? 'v1'} · ${STATE_LABELS[state!]}` : '—',
      done: trained,
      hint: trained && c?.quality != null ? `${(c.quality * 100).toFixed(1)}% match` : undefined,
    },
    { label: 'Answers calls', value: serving ? STATE_LABELS[state!] : '—', done: serving, hint: serving ? undefined : 'After it passes Mubit\'s test' },
  ];
  const next = steps.findIndex((st) => !st.done);
  return (
    <ol className="mt-3" aria-label="Progress toward the desk's own model">
      {steps.map((st, i) => (
        <li key={st.label} className="relative flex gap-3 pb-3 last:pb-0">
          {/* The line down to the next step */}
          {i < steps.length - 1 && (
            <span aria-hidden className={cn('absolute top-5 bottom-0 left-2 w-px -translate-x-1/2', st.done ? 'bg-accent/60' : 'bg-line')} />
          )}
          <span
            aria-hidden
            className={cn(
              'relative mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border text-[9px] font-semibold',
              st.done ? 'border-accent bg-accent text-ink' : i === next ? 'border-accent bg-ink text-accent' : 'border-line bg-ink text-subtle',
            )}
          >
            {st.done ? '✓' : i + 1}
          </span>
          <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3 text-xs">
            <div className="min-w-0">
              <p className={st.done || i === next ? 'text-text' : 'text-subtle'}>{st.label}</p>
              {st.hint && <p className="text-subtle text-[11px]">{st.hint}</p>}
            </div>
            <p className={cn('shrink-0 tabular-nums', st.done ? 'text-accent' : 'text-subtle')}>{st.value}</p>
          </div>
          <span className="sr-only">{st.done ? 'Reached' : i === next ? 'Next' : 'Not yet'}</span>
        </li>
      ))}
    </ol>
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
