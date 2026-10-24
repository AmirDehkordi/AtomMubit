import { cn } from '@/lib/cn';

/** The desk's mark: a small amber tile with a rising bar. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'from-accent to-accent-2 text-ink grid size-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br shadow-[0_0_24px_-6px_var(--color-accent)]',
        className,
      )}
      aria-hidden
    >
      <svg viewBox="0 0 16 16" className="size-3.5" fill="currentColor">
        <rect x="2" y="9" width="3" height="5" rx="1" />
        <rect x="6.5" y="6" width="3" height="8" rx="1" />
        <rect x="11" y="2" width="3" height="12" rx="1" />
      </svg>
    </span>
  );
}
