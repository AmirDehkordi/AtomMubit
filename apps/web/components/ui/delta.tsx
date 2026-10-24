import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/cn';

/** A change as a small coloured pill: +17.9% or +0.6pp. */
export function Delta({ value, points, className }: { value: number | null; points?: boolean; className?: string }) {
  if (value === null || !Number.isFinite(value)) return <span className="text-subtle text-xs">—</span>;
  const up = value >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  const text = `${up ? '+' : ''}${(value * 100).toFixed(1)}${points ? 'pp' : '%'}`;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums',
        up ? 'bg-up/12 text-up' : 'bg-down/12 text-down',
        className,
      )}
    >
      <Icon className="size-3" strokeWidth={2.5} />
      {text}
    </span>
  );
}
