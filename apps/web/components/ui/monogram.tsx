'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';

// Single-colour logos from Simple Icons, loaded at runtime and drawn in the muted grey
// (#b4b0ac). Nothing is stored in the repo. Tickers without a logo there show their ticker,
// except the few drawn below.
const LOGOS: Record<string, string> = {
  NVDA: 'nvidia',
  AAPL: 'apple',
  AMD: 'amd',
  GOOGL: 'google',
  GOOG: 'google',
  META: 'meta',
  INTC: 'intel',
  NFLX: 'netflix',
  TSLA: 'tesla',
  AVGO: 'broadcom',
};

/** Marks the logo library doesn't carry, drawn here in the same grey. */
const DRAWN: Record<string, React.ReactNode> = {
  MSFT: (
    <svg viewBox="0 0 24 24" fill="#b4b0ac" aria-hidden>
      <rect x="2" y="2" width="9.5" height="9.5" />
      <rect x="12.5" y="2" width="9.5" height="9.5" />
      <rect x="2" y="12.5" width="9.5" height="9.5" />
      <rect x="12.5" y="12.5" width="9.5" height="9.5" />
    </svg>
  ),
};

/** A company as a small neutral tile: its logo in grey, or its ticker when there is none. */
export function Monogram({ ticker, size = 'md' }: { ticker: string; size?: 'sm' | 'md' | 'lg' }) {
  const [failed, setFailed] = useState(false);
  const slug = LOGOS[ticker];
  const drawn = DRAWN[ticker];
  const mark = cn(size === 'sm' ? 'size-3.5' : size === 'md' ? 'size-[18px]' : 'size-[22px]');
  return (
    <span
      title={ticker}
      className={cn(
        'border-line bg-raised text-muted grid shrink-0 place-items-center rounded-xl border font-bold tracking-tight shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]',
        size === 'sm' && 'size-6 rounded-lg text-[9px]',
        size === 'md' && 'size-9 text-[11px]',
        size === 'lg' && 'size-11 text-xs',
      )}
      aria-hidden
    >
      {drawn ? (
        <span className={mark}>{drawn}</span>
      ) : slug && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`https://cdn.simpleicons.org/${slug}/b4b0ac`}
          alt=""
          onError={() => setFailed(true)}
          className={mark}
        />
      ) : (
        ticker.slice(0, 4)
      )}
    </span>
  );
}
