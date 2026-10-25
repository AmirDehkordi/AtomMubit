'use client';

import { Check, ChevronRight, Copy } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { cn } from '@/lib/cn';
import { MubitMark } from './mubit-mark';

/**
 * Under each answer: the Mubit calls it took. Every one is recorded for the desk_agent task, so using
 * the desk is what trains its own model. Opens to show each call's request id (as in the Mubit console).
 */
export function MubitReceipt({ calls }: { calls: { requestId: string | null; ms: number }[] }) {
  const [open, setOpen] = useState(false);
  if (!calls.length) return null;
  const seconds = calls.reduce((s, c) => s + c.ms, 0) / 1000;
  return (
    <div className="text-subtle text-xs">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="hover:text-muted inline-flex items-center gap-1.5 transition-colors"
      >
        <MubitMark className="text-accent size-3" />
        <span>
          Answered through Mubit · {calls.length} {calls.length === 1 ? 'call' : 'calls'} recorded for training
          {seconds >= 0.1 && (
            <>
              {' · '}
              <span className="tabular-nums">{seconds.toFixed(1)}s</span>
            </>
          )}
        </span>
        <ChevronRight className={cn('size-3 transition-transform', open && 'rotate-90')} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <p className="mt-2 mb-1.5 max-w-md">
              Each call is recorded for Mubit. Mubit keeps some as examples and trains a small model MuTick owns to answer
              the same way.
            </p>
            <ul className="space-y-1">
              {calls.map((c, i) => (
                <CallRow key={`${c.requestId}-${i}`} requestId={c.requestId} ms={c.ms} />
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CallRow({ requestId, ms }: { requestId: string | null; ms: number }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!requestId) return;
    try {
      await navigator.clipboard.writeText(requestId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* Clipboard refused: the id is still selectable. */
    }
  };
  return (
    <li className="flex items-center gap-2">
      <span className="truncate font-mono select-all">{requestId ?? 'no request id'}</span>
      {ms >= 100 && <span className="tabular-nums">{(ms / 1000).toFixed(1)}s</span>}
      {requestId && (
        <button onClick={copy} className="hover:text-text" aria-label="Copy the request id">
          {copied ? <Check className="text-up size-3" /> : <Copy className="size-3" />}
        </button>
      )}
    </li>
  );
}
