/** Recharts tooltip content: a small dark card. */
export function ChartTooltip({
  active,
  payload,
  label,
  format,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string }[];
  label?: string;
  format: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="border-line rounded-xl border bg-[color-mix(in_oklab,var(--color-raised)_92%,transparent)] px-3 py-2 shadow-2xl backdrop-blur">
      <p className="text-muted mb-1 text-[11px] font-medium">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-[13px] font-semibold tabular-nums">
          <span className="size-2 rounded-full" style={{ background: p.color }} />
          {payload.length > 1 && <span className="text-muted font-normal">{p.name}</span>}
          {format(Number(p.value))}
        </p>
      ))}
    </div>
  );
}
