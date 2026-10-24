import { cn } from '@/lib/cn';

const HUES: Record<string, string> = {
  NVDA: 'from-[#76b900] to-[#3d7a00]',
  MSFT: 'from-[#00a4ef] to-[#7fba00]',
  AAPL: 'from-[#a1a1aa] to-[#52525b]',
  GOOGL: 'from-[#4285f4] to-[#34a853]',
  AMD: 'from-[#ed1c24] to-[#8b0000]',
  AMZN: 'from-[#ff9900] to-[#b36b00]',
  META: 'from-[#0081fb] to-[#0052a3]',
};

/** A company's ticker as a small gradient tile. */
export function Monogram({ ticker, size = 'md' }: { ticker: string; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center rounded-xl bg-gradient-to-br font-bold tracking-tight text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]',
        HUES[ticker] ?? 'from-accent to-accent-2',
        size === 'sm' && 'size-6 rounded-lg text-[9px]',
        size === 'md' && 'size-9 text-[11px]',
        size === 'lg' && 'size-11 text-xs',
      )}
      aria-hidden
    >
      {ticker.slice(0, 4)}
    </span>
  );
}
