'use client';

import { motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useDesk } from '@/lib/desk-store';
import { Composer } from './chat/composer';
import { MubitButton } from './mubit/mubit-panel';

const EXAMPLES = [
  "Get NVIDIA's last four quarters",
  'Compare NVIDIA, Microsoft and Apple revenue',
  "Load Microsoft's fiscal 2026 filings",
];

/** The first screen: one centred chat box. Sending opens a desk. */
export function EmptyDesk() {
  const router = useRouter();
  const start = useDesk((s) => s.start);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const begin = async (question: string) => {
    setBusy(true);
    setError(null);
    try {
      const { projectId, conversationId } = await api.createDesk();
      start(projectId, conversationId, question);
      router.push(`/p/${projectId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <main className="relative grid min-h-dvh place-items-center px-4">
      <MubitButton className="absolute top-4 right-4" />
      <motion.div layoutId="chat" className="w-full max-w-2xl" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="mb-2 text-center text-3xl font-semibold tracking-tight">Earnings Desk</h1>
        <p className="text-muted mb-8 text-center">
          Ask about any US company. The desk finds the SEC filings, reads them and shows its work.
        </p>
        <Composer onSend={begin} disabled={busy} placeholder="Which company do you want to look at?" autoFocus />
        {error && <p className="text-down mt-3 text-center text-sm">{error}</p>}
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {EXAMPLES.map((q) => (
            <button
              key={q}
              disabled={busy}
              onClick={() => begin(q)}
              className="border-line text-muted hover:text-text hover:border-accent/60 rounded-full border px-3 py-1.5 text-sm transition-colors"
            >
              {q}
            </button>
          ))}
        </div>
      </motion.div>
    </main>
  );
}
