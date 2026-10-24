import { formatValue } from '@desk/shared';
import type { Cell } from '@/lib/api';
import { cn } from '@/lib/cn';

const BADGES: Record<string, { letter: string; title: string }> = {
  derived: { letter: 'D', title: 'Derived: year-to-date minus the previous year-to-date (Q4 = full year − nine months)' },
  computed: { letter: 'C', title: 'Computed from other reported figures' },
};

/** A value with small badges saying how it was obtained. */
export function CellValue({ cell, unit, className }: { cell: Cell; unit: string; className?: string }) {
  const badge = cell.method ? BADGES[cell.method] : undefined;
  const title = [cell.note, badge?.title, cell.approximate && 'Approximate', cell.restated && 'Restated in a later filing']
    .filter(Boolean)
    .join(' · ');
  return (
    <span className={cn('inline-flex items-center justify-end gap-1 tabular-nums', className)} title={title || undefined}>
      {cell.approximate && <span className="text-muted">~</span>}
      {formatValue(cell.value, unit)}
      {badge && unit !== 'percent' && (
        <span className="border-line text-muted rounded border px-1 text-[10px] leading-4">{badge.letter}</span>
      )}
      {cell.restated && <span className="text-accent text-[10px]">R</span>}
    </span>
  );
}

export function Change({ value, points }: { value: number | null; points?: boolean }) {
  if (value === null || !Number.isFinite(value)) return <span className="text-muted">—</span>;
  const up = value >= 0;
  const text = points ? `${up ? '+' : ''}${(value * 100).toFixed(1)}pp` : `${up ? '+' : ''}${(value * 100).toFixed(1)}%`;
  return <span className={cn('tabular-nums', up ? 'text-up' : 'text-down')}>{text}</span>;
}
