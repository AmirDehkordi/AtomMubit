'use client';

import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useId } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell as BarCell, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatValue } from '@desk/shared';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { ChartTooltip } from '../ui/chart-tooltip';
import { Delta } from '../ui/delta';
import { AnimatedNumber } from './animated-number';

const ease = [0.22, 1, 0.36, 1] as const;

/** One metric over the desk's quarters: the latest value, its trend, and each quarter's change. */
export function MetricDetail({ ticker, metric, periods }: { ticker: string; metric: string; periods: string[] }) {
  const gradient = useId();
  const { data, error, isLoading } = useQuery({
    queryKey: ['metric', ticker, metric, periods],
    queryFn: () => api.metric(ticker, metric, periods),
  });
  if (isLoading) return <div className="surface h-[420px] animate-pulse rounded-3xl" />;
  if (error || !data?.rows[0]) return <p className="text-down text-sm">Could not load {metric}: {String(error)}</p>;

  const row = data.rows[0];
  const margin = row.kind === 'margin';
  const values = row.cells.map((c) => c.value);
  const last = values.length - 1;
  const change = (i: number) => {
    const now = values[i] ?? null;
    const before = i > 0 ? (values[i - 1] ?? null) : null;
    if (now === null || before === null) return null;
    return margin ? now - before : before === 0 ? null : (now - before) / Math.abs(before);
  };
  const first = values[0] ?? null;
  const overall =
    first !== null && values[last] !== null && values[last] !== undefined
      ? margin
        ? values[last]! - first
        : first === 0
          ? null
          : (values[last]! - first) / Math.abs(first)
      : null;
  const format = (v: number) => formatValue(v, row.unit);
  const points = data.quarters.map((q, i) => ({ quarter: q.quarter, value: values[i] ?? null }));
  const known = points.filter((p): p is { quarter: string; value: number } => p.value !== null);
  const peak = known.reduce((a, b) => (b.value > a.value ? b : a), known[0]!);
  const low = known.reduce((a, b) => (b.value < a.value ? b : a), known[0]!);
  const axis = { tick: { fill: 'var(--color-subtle)', fontSize: 11 }, axisLine: false, tickLine: false } as const;

  return (
    <div className="space-y-4">
      <div className="surface relative overflow-hidden rounded-3xl p-7">
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-muted text-xs font-medium tracking-wide">
              {data.ticker} <span className="text-subtle">·</span> {row.label}
            </p>
            <p className="mt-2 text-[52px] leading-none font-semibold tracking-[-0.04em]">
              {values[last] === null || values[last] === undefined ? '—' : <AnimatedNumber value={values[last]!} format={format} />}
            </p>
            <div className="mt-3 flex items-center gap-2 text-[13px]">
              <Delta value={change(last)} points={margin} />
              <span className="text-subtle">vs {data.quarters[last - 1]?.quarter ?? 'prior quarter'}</span>
            </div>
          </div>
          <dl className="flex gap-6 text-right">
            <Stat label={`Since ${data.quarters[0]?.quarter ?? ''}`}>
              <Delta value={overall} points={margin} />
            </Stat>
            <Stat label="Peak">
              <span className="text-[15px] font-semibold tabular-nums">{peak ? format(peak.value) : '—'}</span>
              <span className="text-subtle block text-[11px]">{peak?.quarter}</span>
            </Stat>
            <Stat label="Low">
              <span className="text-[15px] font-semibold tabular-nums">{low ? format(low.value) : '—'}</span>
              <span className="text-subtle block text-[11px]">{low?.quarter}</span>
            </Stat>
          </dl>
        </div>

        <div className="relative mt-8 h-72">
          <ResponsiveContainer width="100%" height="100%">
            {margin ? (
              <AreaChart data={points} margin={{ top: 16, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--color-line)" strokeDasharray="3 6" />
                <XAxis dataKey="quarter" {...axis} dy={8} />
                <YAxis tickFormatter={format} domain={['dataMin - 0.03', 'dataMax + 0.03']} width={56} {...axis} />
                <Tooltip cursor={{ stroke: 'var(--color-line)' }} content={<ChartTooltip format={format} />} />
                <Area
                  dataKey="value"
                  name={row.label}
                  type="monotone"
                  stroke="var(--color-accent)"
                  strokeWidth={2.5}
                  fill={`url(#${gradient})`}
                  isAnimationActive={false}
                  dot={{ r: 3.5, fill: 'var(--color-ink)', stroke: 'var(--color-accent)', strokeWidth: 2 }}
                  activeDot={{ r: 5, fill: 'var(--color-accent)', stroke: 'var(--color-ink)', strokeWidth: 2 }}
                />
                {known.length > 0 && (
                  <ReferenceDot
                    x={known[known.length - 1]!.quarter}
                    y={known[known.length - 1]!.value}
                    r={9}
                    fill="var(--color-accent)"
                    fillOpacity={0.18}
                    stroke="none"
                  />
                )}
              </AreaChart>
            ) : (
              <BarChart data={points} margin={{ top: 16, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={1} />
                    <stop offset="100%" stopColor="var(--color-accent-2)" stopOpacity={0.9} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--color-line)" strokeDasharray="3 6" />
                <XAxis dataKey="quarter" {...axis} dy={8} />
                <YAxis tickFormatter={format} width={64} {...axis} />
                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }} content={<ChartTooltip format={format} />} />
                <Bar dataKey="value" name={row.label} radius={[10, 10, 4, 4]} maxBarSize={72} animationDuration={800}>
                  {points.map((p, i) => (
                    <BarCell key={p.quarter} fill={`url(#${gradient})`} fillOpacity={i === last ? 1 : 0.45} />
                  ))}
                </Bar>
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {data.quarters.map((q, i) => (
          <motion.div
            key={q.periodEnd}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.05 * i, ease }}
            className={cn('surface rounded-2xl p-4', i === last && 'ring-accent/40 ring-1')}
          >
            <div className="flex items-baseline justify-between">
              <p className="text-[13px] font-semibold">{q.quarter}</p>
              {i === last && <span className="text-accent text-[10px] font-semibold tracking-wider uppercase">Latest</span>}
            </div>
            <p className="text-subtle font-mono text-[11px]">ended {q.periodEnd}</p>
            <p className="mt-3 text-xl font-semibold tracking-tight tabular-nums">{values[i] === null ? '—' : format(values[i]!)}</p>
            <div className="mt-1.5">{i > 0 ? <Delta value={change(i)} points={margin} /> : <span className="text-subtle text-[11px]">baseline</span>}</div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-subtle mb-1 text-[11px]">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
