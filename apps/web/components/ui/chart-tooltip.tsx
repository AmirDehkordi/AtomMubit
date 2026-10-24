import { cn } from '@/lib/cn';

type Change = { value: number | null; points?: boolean; neutral?: boolean };

/** Recharts tooltip content: a small dark card. Values lead; each row can show its change on the prior quarter. */
export function ChartTooltip({
  active,
  payload,
  label,
  format,
  heading,
  change,
  footer,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string }[];
  label?: string;
  format: (v: number) => string;
  heading?: (label: string) => string;
  change?: (name: string, label: string) => Change | null;
  footer?: (label: string) => string | null;
}) {
  if (!active || !payload?.length) return null;
  const quarter = String(label ?? '');
  const note = footer?.(quarter);
  return (
    <div className="border-line min-w-40 rounded-xl border bg-[color-mix(in_oklab,var(--color-raised)_92%,transparent)] px-3 py-2 shadow-2xl backdrop-blur">
      <p className="text-muted mb-1 text-[11px] font-medium">{heading ? heading(quarter) : quarter}</p>
      {payload.map((p) => {
        const c = change?.(String(p.name), quarter);
        return (
          <p key={p.name} className="flex items-center gap-2 text-[13px] font-semibold tabular-nums">
            <span className="h-0.5 w-2.5 shrink-0 rounded-full" style={{ background: p.color }} />
            {format(Number(p.value))}
            {payload.length > 1 && <span className="text-muted font-normal">{p.name}</span>}
            {c && c.value !== null && Number.isFinite(c.value) && <ChangeText {...c} />}
          </p>
        );
      })}
      {note && <p className="border-line text-subtle mt-1.5 border-t pt-1.5 text-[11px] tabular-nums">{note}</p>}
    </div>
  );
}

function ChangeText({ value, points, neutral }: Change) {
  const v = value!;
  const flat = Math.round(v * 1000) === 0;
  const unit = points ? 'pp' : '%';
  return (
    <span className={cn('ml-auto pl-3 text-[11px] font-medium', flat || neutral ? 'text-muted' : v >= 0 ? 'text-up' : 'text-down')}>
      {flat ? `0.0${unit}` : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}${unit}`}
    </span>
  );
}
