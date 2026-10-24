'use client';

import { ArrowUpRight } from 'lucide-react';
import { motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useDesk } from '@/lib/desk-store';
import { BrandMark } from './brand';
import { Composer } from './chat/composer';
import { MubitButton, MubitLearningLink } from './mubit/mubit-panel';

/** Short labels on the buttons; the full question is what gets sent. */
const EXAMPLES = [
  { label: 'NVIDIA, last 4 quarters', text: "Get NVIDIA's last four quarters" },
  { label: 'NVIDIA vs Microsoft vs Apple', text: 'Compare NVIDIA, Microsoft and Apple revenue' },
  { label: 'Microsoft FY2026', text: "Load Microsoft's fiscal 2026 filings" },
];

const ease = [0.22, 1, 0.36, 1] as const;

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
    <main className="bg-ink relative grid min-h-dvh place-items-center overflow-hidden px-4">
      {/* Backdrop: one tonal wash from above, with grain */}
      <div aria-hidden className="pointer-events-none absolute inset-0 [background:var(--gradient-hero)]" />
      <div aria-hidden className="grain pointer-events-none absolute inset-0" />

      <header className="absolute top-0 right-0 left-0 flex items-center justify-between px-6 py-4">
        <span className="text-muted flex items-center gap-2 text-sm font-medium">
          <BrandMark className="size-6" /> MuTick
        </span>
        <MubitButton />
      </header>

      <motion.div
        className="relative w-full max-w-2xl"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease }}
      >
        <h1 className="mb-3 text-center text-[44px] leading-[1.05] font-semibold tracking-[-0.03em]">
          Read every earnings filing
          <br />
          <span className="text-muted">like an analyst would.</span>
        </h1>
        <p className="text-muted mx-auto mb-9 max-w-lg text-center text-[15px] leading-relaxed">
          Ask about any US company. The desk finds the filings, checks the numbers against the SEC&apos;s data, and lays it
          all out beside the chat.
        </p>
        <Composer onSend={begin} disabled={busy} placeholder="Which company do you want to look at?" autoFocus large />
        {error && <p className="text-down mt-3 text-center text-sm">{error}</p>}
        <motion.div
          className="mt-5 flex flex-wrap justify-center gap-2 sm:flex-nowrap"
          initial="hidden"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.07, delayChildren: 0.35 } } }}
        >
          {EXAMPLES.map(({ label, text }) => (
            <motion.button
              key={text}
              variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }}
              disabled={busy}
              onClick={() => begin(text)}
              title={text}
              className="group border-line bg-panel/70 text-muted hover:text-text hover:border-subtle/50 flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm whitespace-nowrap transition-colors"
            >
              {label}
              <ArrowUpRight className="text-subtle size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
            </motion.button>
          ))}
        </motion.div>
        <MubitLearningLink />
      </motion.div>
    </main>
  );
}
