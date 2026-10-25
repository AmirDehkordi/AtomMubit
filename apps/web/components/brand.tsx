import { cn } from '@/lib/cn';

/** The desk's mark: an M whose middle is a tick, the ✓ an analyst puts next to a number once it is checked. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn('text-muted grid size-7 shrink-0 place-items-center', className)} aria-hidden>
      <svg
        viewBox="0 0 24 24"
        className="size-[18px]"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 19v-8.5l5.5 5.5L20 5v14" />
      </svg>
    </span>
  );
}
