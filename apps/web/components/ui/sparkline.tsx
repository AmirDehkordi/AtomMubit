import { useId } from 'react';

const W = 88;
const H = 32;
const PAD = 5;

/**
 * A tiny trend line with a soft fill, for KPI cards.
 * Amounts are drawn from zero and margins in a fixed 10pp window, so small moves stay small.
 */
export function Sparkline({ values, kind = 'amount', className }: { values: (number | null)[]; kind?: 'amount' | 'margin'; className?: string }) {
  const id = useId();
  const points = values.map((v, i) => ({ i, v })).filter((p): p is { i: number; v: number } => p.v !== null);
  if (points.length < 2) return null;
  const min = Math.min(...points.map((p) => p.v));
  const max = Math.max(...points.map((p) => p.v));
  const mean = points.reduce((a, p) => a + p.v, 0) / points.length;
  const lo = kind === 'margin' ? Math.min(mean - 0.05, min) : Math.min(0, min);
  const hi = kind === 'margin' ? Math.max(mean + 0.05, max) : Math.max(0, max);
  const span = hi - lo || 1;
  const x = (i: number) => PAD + (i / (values.length - 1)) * (W - PAD * 2);
  const y = (v: number) => H - 2 - ((v - lo) / span) * (H - PAD - 2);
  const line = points.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const first = points[0]!;
  const last = points[points.length - 1]!;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className={className} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {kind === 'amount' && <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="var(--color-line)" strokeWidth={1} />}
      <path d={`${line} L${x(last.i)},${H} L${x(first.i)},${H} Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke="var(--color-accent)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(last.i)} cy={y(last.v)} r={4} fill="var(--color-accent)" stroke="var(--color-panel)" strokeWidth={2} />
    </svg>
  );
}
