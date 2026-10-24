import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Metrics where neither direction is good news (more capex, fewer shares), so their changes stay grey. */
export const NEUTRAL_METRICS: ReadonlySet<string> = new Set(['capex', 'diluted_shares']);

/** A change as a small coloured pill: +17.9% or +0.6pp. A change that rounds to zero reads as flat. */
export function Delta({ value, points, neutral, className }: { value: number | null; points?: boolean; neutral?: boolean; className?: string }) {
  if (value === null || !Number.isFinite(value)) return <span className="text-subtle text-xs">—</span>;
  const flat = Math.round(value * 1000) === 0;
  const up = value >= 0;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  const text = flat ? `0.0${points ? 'pp' : '%'}` : `${up ? '+' : ''}${(value * 100).toFixed(1)}${points ? 'pp' : '%'}`;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums',
        flat || neutral ? 'bg-subtle/14 text-muted' : up ? 'bg-up/12 text-up' : 'bg-down/12 text-down',
        className,
      )}
    >
      <Icon className="size-3" strokeWidth={2.5} />
      {text}
    </span>
  );
}
