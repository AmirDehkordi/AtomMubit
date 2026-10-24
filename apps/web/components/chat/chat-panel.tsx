'use client';

import { AlertTriangle, ArrowUpRight, Check, FileText, Loader2, Plus, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef } from 'react';
import type { DeskFiling } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useActiveView, useDesk, type ChatMessage, type Step } from '@/lib/desk-store';
import { suggestions } from '@/lib/suggestions';
import { BrandMark } from '../brand';
import { Answer } from './answer';
import { Composer } from './composer';

const ease = [0.22, 1, 0.36, 1] as const;

export function ChatPanel({ filings }: { filings: DeskFiling[] }) {
  const messages = useDesk((s) => s.messages);
  const sending = useDesk((s) => s.sending);
  const send = useDesk((s) => s.send);
  const view = useActiveView();
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  const last = messages[messages.length - 1];
  const lastQuestion = [...messages].reverse().find((m) => m.role === 'user')?.text ?? '';
  const latestQuarter = filings.length ? filings[filings.length - 1]!.quarter : null;
  const next = useMemo(
    () => (last && last.role === 'assistant' && !last.pending && !last.choice ? suggestions(view, lastQuestion, latestQuarter) : []),
    [last, view, lastQuestion, latestQuarter],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-6 pb-4">
        <div className="space-y-6">
          {messages.map((m, i) => (
            <Message key={m.id} message={m} filings={filings} onChoose={send} live={i >= messages.length - 2} />
          ))}
        </div>
        <AnimatePresence>
          {next.length > 0 && !sending && (
            <motion.div
              key={last?.id}
              className="mt-6 pl-10"
              initial="hidden"
              animate="show"
              exit={{ opacity: 0 }}
              variants={{ show: { transition: { staggerChildren: 0.06, delayChildren: 0.35 } } }}
            >
              <p className="text-subtle mb-2 text-[11px] font-medium tracking-wider uppercase">Ask next</p>
              <div className="flex flex-col items-start gap-1.5">
                {next.map((q) => (
                  <motion.button
                    key={q}
                    variants={{ hidden: { opacity: 0, x: -6 }, show: { opacity: 1, x: 0 } }}
                    transition={{ duration: 0.35, ease }}
                    onClick={() => send(q)}
                    className="group border-line bg-panel hover:border-accent/40 hover:bg-raised flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-[13px] transition-colors"
                  >
                    <span>{q}</span>
                    <ArrowUpRight className="text-subtle group-hover:text-accent size-3.5 shrink-0 transition-colors" />
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={end} />
      </div>
      <div className="px-5 pb-5">
        <Composer onSend={send} disabled={sending} placeholder="Ask about the filings…" autoFocus />
      </div>
    </div>
  );
}

function Message({
  message,
  filings,
  onChoose,
  live,
}: {
  message: ChatMessage;
  filings: DeskFiling[];
  onChoose: (text: string) => void;
  live: boolean;
}) {
  if (message.role === 'user') {
    return (
      <motion.div
        initial={live ? { opacity: 0, y: 8, scale: 0.98 } : false}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease }}
        className="flex justify-end"
      >
        <div className="border-accent/20 max-w-[85%] rounded-2xl rounded-br-md border bg-[color-mix(in_oklab,var(--color-accent)_9%,var(--color-panel))] px-4 py-2.5 text-[15px]">
          {message.text}
        </div>
      </motion.div>
    );
  }

  const thinking = message.pending && !message.steps.length && !message.text;
  const found = message.steps.find((s) => s.display?.kind === 'filings')?.display;

  return (
    <motion.div initial={live ? { opacity: 0 } : false} animate={{ opacity: 1 }} className="flex gap-3">
      <BrandMark className="mt-0.5 size-7" />
      <div className="min-w-0 flex-1 space-y-3">
        {message.steps.length > 0 && <Timeline steps={message.steps} live={live} />}
        {thinking && (
          <div className="flex h-7 items-center gap-2 text-sm">
            <span className="shimmer-text font-medium">Thinking</span>
            <span className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="bg-accent size-1 rounded-full"
                  animate={{ opacity: [0.2, 1, 0.2] }}
                  transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.15 }}
                />
              ))}
            </span>
          </div>
        )}
        {message.text && <Answer text={message.text} filings={filings} animate={live} />}
        {message.choice && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease, delay: 0.1 }}
            className="border-line bg-panel overflow-hidden rounded-2xl border"
          >
            <p className="px-4 pt-3.5 pb-3 text-[15px] leading-relaxed">{message.choice.question}</p>
            {found && <FilingCards filings={found.filings} />}
            <div className="border-line flex flex-wrap gap-2 border-t px-4 py-3">
              {message.choice.options.map((option, i) => (
                <motion.button
                  key={option}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => onChoose(option)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium transition-all',
                    i === 0
                      ? 'from-accent to-accent-2 text-ink bg-gradient-to-br shadow-[0_6px_20px_-8px_var(--color-accent)] hover:brightness-110'
                      : 'border-line text-muted hover:text-text hover:border-accent/40 border',
                  )}
                >
                  {i === 0 && <Plus className="size-4" strokeWidth={2.5} />}
                  {option}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
        {message.error && (
          <div className="border-down/30 bg-down/5 text-down flex items-start gap-2 rounded-xl border px-3 py-2 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {message.error}
          </div>
        )}
      </div>
    </motion.div>
  );
}

/** The tools the desk used, as a small vertical timeline. Filings it found appear as cards (unless a choice card shows them). */
function Timeline({ steps, live }: { steps: Step[]; live: boolean }) {
  return (
    <ol className="relative space-y-2.5">
      <span className="bg-line absolute top-2 bottom-2 left-[7px] w-px" aria-hidden />
      <AnimatePresence initial={false}>
        {steps.map((s) => (
          <motion.li
            key={s.id}
            layout
            initial={live ? { opacity: 0, x: -6 } : false}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, ease }}
            className="relative flex items-start gap-3 text-[13px]"
          >
            <span
              className={cn(
                'bg-ink relative z-10 mt-0.5 grid size-[15px] shrink-0 place-items-center rounded-full border',
                s.state === 'running' && 'border-accent/60',
                s.state === 'done' && 'border-up/50 bg-up/10',
                s.state === 'failed' && 'border-down/50 bg-down/10',
              )}
            >
              {s.state === 'running' && <Loader2 className="text-accent size-2.5 animate-spin" />}
              {s.state === 'done' && <Check className="text-up size-2.5" strokeWidth={3} />}
              {s.state === 'failed' && <X className="text-down size-2.5" strokeWidth={3} />}
            </span>
            <span className={cn('leading-5', s.state === 'running' ? 'shimmer-text font-medium' : 'text-muted')}>{s.label}</span>
          </motion.li>
        ))}
      </AnimatePresence>
    </ol>
  );
}

function FilingCards({ filings }: { filings: { accession: string; form: string; quarter: string; periodEnd: string; filedAt: string }[] }) {
  return (
    <motion.div
      className="grid grid-cols-2 gap-2 px-4 pb-3.5"
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: 0.06, delayChildren: 0.15 } } }}
    >
      {filings.map((f) => (
        <motion.div
          key={f.accession}
          variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }}
          transition={{ duration: 0.35, ease }}
          className="border-line bg-raised rounded-xl border px-3 py-2.5"
        >
          <div className="flex items-center gap-2">
            <FileText className="text-accent size-3.5" />
            <span className="text-sm font-semibold">{f.form}</span>
            <span className="text-muted ml-auto font-mono text-[11px]">{f.quarter}</span>
          </div>
          <p className="text-subtle mt-1 font-mono text-[11px]">
            ended {f.periodEnd} · filed {f.filedAt}
          </p>
        </motion.div>
      ))}
    </motion.div>
  );
}
