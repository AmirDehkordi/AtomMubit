'use client';

import { AlertTriangle, Check, Loader2, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useRef } from 'react';
import type { DeskFiling } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useDesk, type ChatMessage } from '@/lib/desk-store';
import { Answer } from './answer';
import { Composer } from './composer';

export function ChatPanel({ filings, compact }: { filings: DeskFiling[]; compact: boolean }) {
  const messages = useDesk((s) => s.messages);
  const sending = useDesk((s) => s.sending);
  const send = useDesk((s) => s.send);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={cn('min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5', !compact && 'px-1')}>
        {messages.map((m) => (
          <Message key={m.id} message={m} filings={filings} onChoose={send} />
        ))}
        <div ref={end} />
      </div>
      <div className="px-4 pb-4">
        <Composer onSend={send} disabled={sending} placeholder="Ask about the filings…" autoFocus />
      </div>
    </div>
  );
}

function Message({
  message,
  filings,
  onChoose,
}: {
  message: ChatMessage;
  filings: DeskFiling[];
  onChoose: (text: string) => void;
}) {
  if (message.role === 'user') {
    return (
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end">
        <div className="bg-panel border-line max-w-[85%] rounded-2xl rounded-br-md border px-4 py-2.5 text-[15px]">
          {message.text}
        </div>
      </motion.div>
    );
  }
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
      {message.steps.length > 0 && (
        <ul className="space-y-1.5">
          {message.steps.map((s) => (
            <li key={s.id} className="text-muted flex items-center gap-2 text-sm">
              {s.state === 'running' && <Loader2 className="text-accent size-3.5 animate-spin" />}
              {s.state === 'done' && <Check className="text-up size-3.5" />}
              {s.state === 'failed' && <X className="text-down size-3.5" />}
              <span>{s.label}</span>
            </li>
          ))}
        </ul>
      )}
      {message.pending && !message.steps.length && !message.text && (
        <div className="text-muted flex items-center gap-2 text-sm">
          <Loader2 className="size-3.5 animate-spin" /> Thinking
        </div>
      )}
      {message.text && <Answer text={message.text} filings={filings} />}
      {message.choice && (
        <div className="border-line bg-panel rounded-xl border p-3">
          <p className="mb-3 text-[15px]">{message.choice.question}</p>
          <div className="flex flex-wrap gap-2">
            {message.choice.options.map((option, i) => (
              <button
                key={option}
                onClick={() => onChoose(option)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                  i === 0 ? 'bg-accent text-ink hover:brightness-110' : 'border-line hover:border-accent border',
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      )}
      {message.error && (
        <div className="text-down flex items-start gap-2 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {message.error}
        </div>
      )}
    </motion.div>
  );
}
