'use client';

import { ArrowUp } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';

const EXAMPLES = [
  "Get NVIDIA's last four quarters",
  'How did Microsoft’s cloud revenue grow this year?',
  'Compare Apple and Alphabet gross margins',
];

/** The first screen: one centred chat box. The split desk takes over once a project exists. */
export function EmptyDesk() {
  const [text, setText] = useState('');

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <motion.div
        layoutId="chat"
        className="w-full max-w-2xl"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="mb-2 text-center text-3xl font-semibold tracking-tight">Earnings Desk</h1>
        <p className="text-muted mb-8 text-center">
          Ask about any US company. The desk finds the SEC filings, reads them and shows its work.
        </p>
        <form
          className="border-line bg-panel focus-within:border-accent flex items-end gap-2 rounded-2xl border p-3 transition-colors"
          onSubmit={(e) => e.preventDefault()}
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            placeholder="Which company do you want to look at?"
            className="placeholder:text-muted flex-1 resize-none bg-transparent outline-none"
          />
          <button
            type="submit"
            disabled={!text.trim()}
            className="bg-accent text-ink grid size-9 place-items-center rounded-xl disabled:opacity-40"
            aria-label="Send"
          >
            <ArrowUp className="size-4" />
          </button>
        </form>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {EXAMPLES.map((q) => (
            <button
              key={q}
              onClick={() => setText(q)}
              className="border-line text-muted hover:text-text rounded-full border px-3 py-1.5 text-sm"
            >
              {q}
            </button>
          ))}
        </div>
      </motion.div>
    </main>
  );
}
