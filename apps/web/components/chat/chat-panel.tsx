'use client';

import { AlertTriangle, ArrowDown, Check, ChevronRight, Copy, FileText, Plus, RotateCcw, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { DeskFiling } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useActiveView, useDesk, type ChatMessage, type Step } from '@/lib/desk-store';
import { suggestions } from '@/lib/suggestions';
import { Answer, plainAnswer, useReveal } from './answer';
import { Composer } from './composer';
import { MubitReceipt } from '../mubit/mubit-receipt';

/** How far from the bottom (px) before the jump-to-latest button shows. */
const STICK_THRESHOLD = 120;
const fade = { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.25 } };

export function ChatPanel({ filings, wide }: { filings: DeskFiling[]; wide: boolean }) {
  const messages = useDesk((s) => s.messages);
  const sending = useDesk((s) => s.sending);
  const send = useDesk((s) => s.send);
  const stop = useDesk((s) => s.stop);
  const retry = useDesk((s) => s.retry);
  const view = useActiveView();

  const scroller = useRef<HTMLDivElement>(null);
  const turnRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState(0);
  const [atBottom, setAtBottom] = useState(true);
  // Answers that arrive in this visit "type" in once; restored ones render at once.
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());

  // The latest turn (your question and the reply) gets at least a screen of room, so when
  // you send, your question moves to the top and the reply fills the space below it
  // without pushing anything around.
  const lastUser = messages.map((m) => m.role).lastIndexOf('user');
  const earlier = lastUser > 0 ? messages.slice(0, lastUser) : lastUser === 0 ? [] : messages;
  const turn = lastUser >= 0 ? messages.slice(lastUser) : [];
  const live = turn.length > 0 && !turn[0]!.restored;
  // A button press on a card ("Add all") isn't shown as a bubble: the card above shows the answer.
  const pressed = (index: number) => {
    const m = messages[index];
    return m?.role === 'user' && !!messages[index - 1]?.choice?.options.includes(m.text);
  };
  // After a card's button press: did the reply actually add the filings?
  const added = (index: number) =>
    !!messages[index + 2]?.steps.some((s) => s.tool === 'add_filings' && s.state === 'done');

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setViewport(el.clientHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // A new question: bring it to the top of the chat.
  const userCount = messages.filter((m) => m.role === 'user').length;
  useLayoutEffect(() => {
    const el = scroller.current;
    const t = turnRef.current;
    if (!el || !t) return;
    if (live) el.scrollTo({ top: Math.max(0, t.offsetTop - 16), behavior: 'smooth' });
    else el.scrollTo({ top: el.scrollHeight });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userCount]);

  const toBottom = useCallback(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, []);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD);
  };

  const last = messages[messages.length - 1];
  const lastQuestion = [...messages].reverse().find((m) => m.role === 'user')?.text ?? '';
  const latestQuarter = filings.length ? filings[filings.length - 1]!.quarter : null;
  const lastSettled =
    last?.role === 'assistant' && !last.pending && !last.choice && !last.error && !last.stopped && (last.restored || revealed.has(last.id));
  const next = useMemo(
    () => (lastSettled ? suggestions(view, lastQuestion, latestQuarter) : []),
    [lastSettled, view, lastQuestion, latestQuarter],
  );

  const column = cn('mx-auto w-full px-5', wide ? 'max-w-[46rem]' : 'max-w-none');

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div
        ref={scroller}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto [mask-image:linear-gradient(to_bottom,transparent,black_32px)]"
      >
        <div className={cn(column, 'pt-6 pb-8')}>
          <div className="space-y-7">
            {earlier.map((m, i) => (
              <Message
                key={m.id}
                message={m}
                reply={messages.slice(i + 1).find((x) => x.role === 'user')?.text}
                pressed={pressed(i)}
                added={added(i)}
                filings={filings}
                isLast={false}
                animate={!m.restored}
                onRevealed={() => setRevealed((s) => new Set(s).add(m.id))}
                onChoose={send}
                onRetry={retry}
              />
            ))}
          </div>
          {turn.length > 0 && (
            <div
              ref={turnRef}
              className={cn('space-y-7', earlier.length > 0 && 'pt-7')}
              style={live && viewport ? { minHeight: viewport - 48 } : undefined}
            >
              {turn.map((m, i) => (
                <Message
                  key={m.id}
                  message={m}
                  pressed={pressed(lastUser + i)}
                  filings={filings}
                  isLast={i === turn.length - 1}
                  animate={!m.restored}
                  onRevealed={() => setRevealed((s) => new Set(s).add(m.id))}
                  onChoose={send}
                  onRetry={retry}
                />
              ))}
              {next.length > 0 && !sending && (
                <motion.div key={last?.id} {...fade} transition={{ duration: 0.4, delay: 0.1 }}>
                  <p className="text-subtle mb-2 text-[11px] font-medium tracking-wider uppercase">Ask next</p>
                  <div className="flex flex-wrap gap-2">
                    {next.map((q) => (
                      <button
                        key={q}
                        onClick={() => send(q)}
                        className="border-line text-muted hover:text-text hover:bg-raised rounded-full border px-3 py-1.5 text-left text-[13px] transition-colors"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {!atBottom && (
          <motion.button
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.15 }}
            onClick={toBottom}
            className="border-line bg-raised text-muted hover:text-text absolute bottom-[120px] left-1/2 z-10 grid size-8 -translate-x-1/2 place-items-center rounded-full border shadow-lg"
            aria-label="Jump to the latest message"
          >
            <ArrowDown className="size-4" />
          </motion.button>
        )}
      </AnimatePresence>

      <div className={cn(column, 'pb-5')}>
        <Composer onSend={send} onStop={stop} busy={sending} placeholder="Ask about the filings…" autoFocus />
      </div>
    </div>
  );
}

function Message({
  message,
  reply,
  pressed = false,
  added = false,
  filings,
  isLast,
  animate,
  onRevealed,
  onChoose,
  onRetry,
}: {
  message: ChatMessage;
  /** What you answered, once a choice has been answered. */
  reply?: string;
  /** A user message that was a button press on the card before it. */
  pressed?: boolean;
  /** The reply to this card's button press added the filings. */
  added?: boolean;
  filings: DeskFiling[];
  isLast: boolean;
  animate: boolean;
  onRevealed: () => void;
  onChoose: (text: string) => void;
  onRetry: () => void;
}) {
  const text = useReveal(message.text, animate && message.text.length > 0, onRevealed);
  const typing = text.length < message.text.length;

  if (message.role === 'user') {
    if (pressed) return null;
    return (
      <motion.div {...(animate ? fade : {})} className="flex justify-end">
        <div className="bg-raised max-w-[85%] rounded-[20px] px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">
          {message.text}
        </div>
      </motion.div>
    );
  }

  const found = message.steps.find((s) => s.display?.kind === 'filings')?.display;
  const thinking = message.pending && !message.text;

  return (
    <motion.div {...(animate ? fade : {})} className="group space-y-3">
      {(message.steps.length > 0 || thinking) && <Activity steps={message.steps} pending={message.pending} startedAt={message.startedAt} />}

      {text && (
        <div
          className="transition-[mask-image] duration-300"
          style={typing ? { maskImage: 'linear-gradient(to bottom, #000 calc(100% - 2.2em), rgba(0,0,0,0.15))' } : undefined}
        >
          <Answer text={text} filings={filings} showSources={!typing} />
        </div>
      )}

      {/* Answered by a button press: say what happened. A typed reply drops the card, as before. */}
      {message.choice && !typing && reply !== undefined && message.choice.options.includes(reply) && (
        <motion.div {...fade} className="border-line bg-panel text-muted flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm">
          {added && found ? (
            <>
              <Check className="text-up size-4 shrink-0" />
              {`${found.filings.length} filing${found.filings.length === 1 ? '' : 's'} added to the desk`}
            </>
          ) : (
            <>You chose: {reply}</>
          )}
        </motion.div>
      )}

      {message.choice && !typing && reply === undefined && (
        <motion.div {...fade} className="border-line bg-panel overflow-hidden rounded-2xl border">
          <p className="px-4 pt-3.5 pb-3 text-[15px] leading-relaxed">{message.choice.question}</p>
          {found && <FilingCards filings={found.filings} />}
          <div className="border-line flex flex-wrap gap-2 border-t px-4 py-3">
            {message.choice.options.map((option, i) => (
              <button
                key={option}
                onClick={() => onChoose(option)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors active:scale-[0.98]',
                  i === 0 ? 'bg-text text-ink hover:bg-white' : 'border-line text-muted hover:text-text hover:bg-raised border',
                )}
              >
                {i === 0 && <Plus className="size-4" strokeWidth={2.5} />}
                {option}
              </button>
            ))}
          </div>
        </motion.div>
      )}

      {message.stopped && <p className="text-subtle text-sm">Stopped.</p>}

      {message.error && (
        <div className="border-down/30 bg-down/5 text-down flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span className="flex-1">{message.error}</span>
          {isLast && (
            <button onClick={onRetry} className="text-text inline-flex items-center gap-1 text-xs font-medium hover:underline">
              <RotateCcw className="size-3" /> Retry
            </button>
          )}
        </div>
      )}

      {message.text && !message.pending && !typing && <Actions text={message.text} canRetry={isLast} onRetry={onRetry} visible={isLast} />}
      {!message.pending && !typing && message.mubitCalls && <MubitReceipt calls={message.mubitCalls} />}
    </motion.div>
  );
}

/** What the desk did: one live line while it works, then a collapsed "Used N tools" you can open. */
function Activity({ steps, pending, startedAt }: { steps: Step[]; pending: boolean; startedAt?: number }) {
  const [open, setOpen] = useState(false);
  const running = steps.find((s) => s.state === 'running');
  const failed = steps.filter((s) => s.state === 'failed').length;
  const elapsed = useElapsed(pending ? startedAt : undefined);

  if (pending) {
    return (
      <div className="flex h-6 items-center gap-2.5 text-[13px]">
        <span className="relative flex size-2">
          <span className="bg-accent absolute inline-flex size-full animate-ping rounded-full opacity-60" />
          <span className="bg-accent relative inline-flex size-2 rounded-full" />
        </span>
        <span className="shimmer-text font-medium">{running?.label ?? 'Thinking'}</span>
        {elapsed !== null && <span className="text-subtle tabular-nums">{elapsed}s</span>}
      </div>
    );
  }
  if (!steps.length) return null;

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-subtle hover:text-muted -ml-1 inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 text-[13px] transition-colors"
        aria-expanded={open}
      >
        <ChevronRight className={cn('size-3.5 transition-transform duration-200', open && 'rotate-90')} />
        Used {steps.length} tool{steps.length === 1 ? '' : 's'}
        {failed > 0 && <span className="text-down"> · {failed} failed</span>}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-line ml-[7px] overflow-hidden border-l pl-4"
          >
            {steps.map((s) => (
              <li key={s.id} className="text-muted flex items-center gap-2 py-1 text-[13px]">
                {s.state === 'failed' ? <X className="text-down size-3" /> : <Check className="text-up size-3" />}
                {s.label}
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

function Actions({ text, canRetry, onRetry, visible }: { text: string; canRetry: boolean; onRetry: () => void; visible: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(plainAnswer(text)).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const button = 'text-subtle hover:text-text hover:bg-raised grid size-7 place-items-center rounded-md transition-colors';
  return (
    <div className={cn('-ml-1.5 flex gap-0.5 transition-opacity', visible ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}>
      <button onClick={copy} className={button} title={copied ? 'Copied' : 'Copy'} aria-label="Copy the answer">
        {copied ? <Check className="text-up size-3.5" /> : <Copy className="size-3.5" />}
      </button>
      {canRetry && (
        <button onClick={onRetry} className={button} title="Ask again" aria-label="Ask again">
          <RotateCcw className="size-3.5" />
        </button>
      )}
    </div>
  );
}

function useElapsed(since: number | undefined): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!since) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [since]);
  if (!since) return null;
  const s = Math.floor((now - since) / 1000);
  return s >= 2 ? s : null;
}

function FilingCards({ filings }: { filings: { accession: string; form: string; quarter: string; periodEnd: string; filedAt: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 px-4 pb-3.5">
      {filings.map((f) => (
        <div key={f.accession} className="border-line bg-raised rounded-xl border px-3 py-2.5">
          <div className="flex items-center gap-2">
            <FileText className="text-accent size-3.5" />
            <span className="text-sm font-semibold">{f.form}</span>
            <span className="text-muted ml-auto font-mono text-[11px]">{f.quarter}</span>
          </div>
          <p className="text-subtle mt-1 font-mono text-[11px]">
            ended {f.periodEnd} · filed {f.filedAt}
          </p>
        </div>
      ))}
    </div>
  );
}
