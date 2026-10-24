'use client';

import { ArrowUpRight, BarChart3, FileSearch, GitCompare } from 'lucide-react';
import { motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useDesk } from '@/lib/desk-store';
import { BrandMark } from './brand';
import { Composer } from './chat/composer';
import { MubitButton } from './mubit/mubit-panel';

const EXAMPLES = [
  { icon: FileSearch, text: "Get NVIDIA's last four quarters" },
  { icon: GitCompare, text: 'Compare NVIDIA, Microsoft and Apple revenue' },
  { icon: BarChart3, text: "Load Microsoft's fiscal 2026 filings" },
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
      {/* Backdrop: a soft amber glow over a faint grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:linear-gradient(var(--color-line)_1px,transparent_1px),linear-gradient(90deg,var(--color-line)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]"
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute top-[-20%] left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--color-accent)_22%,transparent),transparent)] blur-2xl"
        animate={{ opacity: [0.6, 1, 0.6], scale: [1, 1.05, 1] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      />

      <header className="absolute top-0 right-0 left-0 flex items-center justify-between px-6 py-4">
        <span className="flex items-center gap-2.5 text-sm font-semibold">
          <BrandMark /> Earnings Desk
        </span>
        <MubitButton />
      </header>

      <motion.div
        className="relative w-full max-w-2xl"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease }}
      >
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1, ease }}
          className="border-line bg-panel/80 text-muted mx-auto mb-5 w-fit rounded-full border px-3 py-1 text-xs"
        >
          SEC EDGAR · XBRL-checked numbers · every call through Mubit
        </motion.p>
        <h1 className="mb-3 text-center text-[44px] leading-[1.05] font-semibold tracking-[-0.03em]">
          Read every earnings filing
          <br />
          <span className="from-accent to-accent-2 bg-gradient-to-r bg-clip-text text-transparent">like an analyst would.</span>
        </h1>
        <p className="text-muted mx-auto mb-9 max-w-lg text-center text-[15px] leading-relaxed">
          Ask about any US company. The desk finds the filings, checks the numbers against the SEC&apos;s data, and lays it
          all out beside the chat.
        </p>
        <Composer onSend={begin} disabled={busy} placeholder="Which company do you want to look at?" autoFocus large />
        {error && <p className="text-down mt-3 text-center text-sm">{error}</p>}
        <motion.div
          className="mt-5 flex flex-wrap justify-center gap-2"
          initial="hidden"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.07, delayChildren: 0.35 } } }}
        >
          {EXAMPLES.map(({ icon: Icon, text }) => (
            <motion.button
              key={text}
              variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }}
              disabled={busy}
              onClick={() => begin(text)}
              className="group border-line bg-panel/70 text-muted hover:text-text hover:border-accent/40 flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm backdrop-blur transition-colors"
            >
              <Icon className="text-subtle group-hover:text-accent size-4 transition-colors" />
              {text}
              <ArrowUpRight className="text-subtle size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
            </motion.button>
          ))}
        </motion.div>
      </motion.div>
    </main>
  );
}
