import { cn } from '@/lib/cn';

/** A company's ticker as a small neutral tile. Company brand colours aren't ours to use. */
export function Monogram({ ticker, size = 'md' }: { ticker: string; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span
      className={cn(
        'border-line bg-raised text-muted grid shrink-0 place-items-center rounded-xl border font-bold tracking-tight shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]',
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
