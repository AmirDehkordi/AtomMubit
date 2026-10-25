'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';

// Single-colour logos from Simple Icons, loaded at runtime and drawn in the muted grey
// (#b4b0ac). Nothing is stored in the repo. Tickers without a logo there show their ticker.
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

/** A company as a small neutral tile: its logo in grey, or its ticker when there is none. */
export function Monogram({ ticker, size = 'md' }: { ticker: string; size?: 'sm' | 'md' | 'lg' }) {
  const [failed, setFailed] = useState(false);
  const slug = LOGOS[ticker];
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
      {slug && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`https://cdn.simpleicons.org/${slug}/b4b0ac`}
          alt=""
          onError={() => setFailed(true)}
          className={cn(size === 'sm' ? 'size-3.5' : size === 'md' ? 'size-[18px]' : 'size-[22px]')}
        />
      ) : (
        ticker.slice(0, 4)
      )}
    </span>
  );
}
