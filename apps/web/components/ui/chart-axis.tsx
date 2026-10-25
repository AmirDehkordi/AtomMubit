import type { XAxisTickContentProps } from 'recharts';

/** Shared Recharts axis styling: 12px ticks, no axis or tick lines. */
export const AXIS = { tick: { fill: 'var(--color-subtle)', fontSize: 12 }, axisLine: false, tickLine: false } as const;

/** Hover band behind the quarter under the pointer. */
export const CURSOR_FILL = 'color-mix(in oklab, var(--color-text) 5%, transparent)';

/** Round axis ticks: $0, $25B, $1.2T, 74%. No trailing zeros. */
export function axisTick(unit: string) {
  const trim = (n: number) => String(Number(n.toFixed(1)));
  return (v: number) => {
    if (unit === 'percent') return `${trim(v * 100)}%`;
    if (unit === 'USD/share' || unit === 'USD/shares') return `$${v.toFixed(2)}`;
    const abs = Math.abs(v);
    const sign = v < 0 ? '-' : '';
    const money = unit === 'USD' ? '$' : '';
    if (abs === 0) return `${money}0`;
    if (abs >= 1e12) return `${sign}${money}${trim(abs / 1e12)}T`;
    if (abs >= 1e9) return `${sign}${money}${trim(abs / 1e9)}B`;
    if (abs >= 1e6) return `${sign}${money}${trim(abs / 1e6)}M`;
    if (abs >= 1e3) return `${sign}${money}${trim(abs / 1e3)}K`;
    return `${sign}${money}${trim(abs)}`;
  };
}

/** A direct label on a bar: one decimal, e.g. $96.2B. */
export function shortValue(v: number, unit: string) {
  if (unit === 'percent') return `${(v * 100).toFixed(1)}%`;
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  const money = unit === 'USD' ? '$' : '';
  if (abs >= 1e12) return `${sign}${money}${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}${money}${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}${money}${(abs / 1e6).toFixed(1)}M`;
  return `${sign}${money}${abs.toFixed(unit === 'USD/share' || unit === 'USD/shares' ? 2 : 0)}`;
}

/** A label above a bar, drawn only on the latest quarter. Pass as a Bar's `label`. */
export function latestLabel(last: number, unit: string) {
  return function LatestLabel(p: { x?: number | string; y?: number | string; width?: number | string; value?: number | string | boolean | null; index?: number }) {
    if (p.index !== last || typeof p.value !== 'number') return <g />;
    return (
      <text x={Number(p.x) + Number(p.width) / 2} y={Number(p.y) - 7} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--color-text)" className="tabular-nums">
        {shortValue(p.value, unit)}
      </text>
    );
  };
}

/** A quarter label on the x axis: the latest is bold, derived quarters get the table's "D" badge. */
export function QuarterTick({ x, y, payload, index, last, derived }: XAxisTickContentProps & { last: number; derived: ReadonlySet<number> }) {
  const latest = index === last;
  const label = String(payload.value);
  const badge = label.length * 3.4 + 5;
  return (
    <g transform={`translate(${x},${y})`}>
      <text dy={16} textAnchor="middle" fontSize={12} fill={latest ? 'var(--color-text)' : 'var(--color-subtle)'} fontWeight={latest ? 600 : 400}>
        {label}
      </text>
      {derived.has(index) && (
        <g transform={`translate(${badge},4)`}>
          <title>Derived: year-to-date minus the previous year-to-date</title>
          <rect width={12} height={15} rx={3} fill="none" stroke="var(--color-line)" />
          <text x={6} y={11.5} textAnchor="middle" fontSize={10} fill="var(--color-muted)">
            D
          </text>
        </g>
      )}
    </g>
  );
}
