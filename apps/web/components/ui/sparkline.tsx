import { useId } from 'react';

/** A tiny trend line with a soft fill, for KPI cards. */
export function Sparkline({ values, className }: { values: (number | null)[]; className?: string }) {
  const id = useId();
  const points = values.map((v, i) => ({ i, v })).filter((p): p is { i: number; v: number } => p.v !== null);
  if (points.length < 2) return null;
  const w = 100;
  const h = 32;
  const min = Math.min(...points.map((p) => p.v));
  const max = Math.max(...points.map((p) => p.v));
  const span = max - min || 1;
  const x = (i: number) => (i / (values.length - 1)) * w;
  const y = (v: number) => h - 3 - ((v - min) / span) * (h - 6);
  const line = points.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const last = points[points.length - 1]!;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={className} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${x(last.i)},${h} L${x(points[0]!.i)},${h} Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke="var(--color-accent)" strokeWidth="1.75" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
      <circle cx={x(last.i)} cy={y(last.v)} r="2.5" fill="var(--color-accent)" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
