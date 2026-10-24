'use client';

import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Fragment, useId } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatValue } from '@desk/shared';
import { api, type Cell, type QuarterOverview as Overview } from '@/lib/api';
import { cn } from '@/lib/cn';
import { ChartTooltip } from '../ui/chart-tooltip';
import { Delta } from '../ui/delta';
import { Sparkline } from '../ui/sparkline';
import { AnimatedNumber } from './animated-number';
import { CellValue } from './cell-value';

const KPIS = ['revenue', 'net_income', 'gross_margin', 'operating_margin'];
const GROUPS: { title: string; keys: string[] }[] = [
  { title: 'Income statement', keys: ['revenue', 'gross_profit', 'operating_income', 'net_income', 'eps_diluted', 'diluted_shares'] },
  { title: 'Cash flow', keys: ['operating_cash_flow', 'capex'] },
  { title: 'Margins', keys: ['gross_margin', 'operating_margin', 'net_margin'] },
];
const ease = [0.22, 1, 0.36, 1] as const;

export function QuarterOverview({ ticker, periods }: { ticker: string; periods: string[] }) {
  const { data, error, isLoading } = useQuery({
    queryKey: ['overview', ticker, periods],
    queryFn: () => api.overview(ticker, periods),
  });
  if (isLoading) return <Skeleton />;
  if (error || !data) return <p className="text-down text-sm">Could not load figures: {String(error)}</p>;

  const last = data.quarters.length - 1;
  const row = (key: string) => data.rows.find((r) => r.key === key);

  return (
    <div className="space-y-4">
      <p className="text-muted text-xs">Change vs {data.quarters[last - 1]?.quarter ?? 'prior quarter'}</p>
      <div className="grid grid-cols-1 gap-3 @md:grid-cols-2 @4xl:grid-cols-4">
        {KPIS.map((key, i) => {
          const r = row(key);
          if (!r) return null;
          const now = r.cells[last]!;
          return (
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: i * 0.06, ease }}
              className="surface relative overflow-hidden rounded-2xl p-5"
            >
              <div className="flex items-center justify-between">
                <p className="text-muted text-[12px] font-medium">{r.label}</p>
                <Delta value={delta(now, r.cells[last - 1], r.kind === 'margin')} points={r.kind === 'margin'} />
              </div>
              <p className="mt-3 text-[26px] leading-none font-semibold tracking-[-0.03em] @5xl:text-[30px]">
                {now.value === null ? '—' : <AnimatedNumber value={now.value} format={(v) => formatValue(v, r.unit)} />}
              </p>
              <div className="mt-4 flex justify-end">
                <Sparkline values={r.cells.map((c) => c.value)} className="h-8 w-20 shrink-0" />
              </div>
            </motion.div>
          );
        })}
      </div>

      <Chart data={data} />

      <div className="surface overflow-hidden rounded-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-line border-b">
                <th className="text-subtle px-5 py-3.5 text-left text-[11px] font-medium tracking-wider uppercase">Metric</th>
                {data.quarters.map((q, i) => (
                  <th key={q.periodEnd} className={cn('px-4 py-3 text-right font-medium', i === last && 'bg-accent/[0.06]')}>
                    <div className={i === last ? 'text-accent' : 'text-text'}>{q.quarter}</div>
                    <div className="text-subtle font-mono text-[10px] font-normal">{q.periodEnd}</div>
                  </th>
                ))}
                <th className="text-subtle px-5 py-3.5 text-right text-[11px] font-medium tracking-wider uppercase">Q/Q</th>
              </tr>
            </thead>
            <tbody>
              {GROUPS.map((g) => (
                <Fragment key={g.title}>
                  <tr>
                    <td colSpan={data.quarters.length + 2} className="text-subtle px-5 pt-4 pb-1.5 text-[10px] font-semibold tracking-[0.14em] uppercase">
                      {g.title}
                    </td>
                  </tr>
                  {g.keys.map((k) => {
                    const r = row(k);
                    if (!r) return null;
                    return (
                      <tr key={k} className="hover:bg-raised/50 transition-colors">
                        <td className="text-muted px-5 py-2.5">{r.label}</td>
                        {r.cells.map((c, i) => (
                          <td key={i} className={cn('px-4 py-2.5 text-right', i === last && 'bg-accent/[0.06] font-semibold')}>
                            <CellValue cell={c} unit={r.unit} />
                          </td>
                        ))}
                        <td className="px-5 py-2.5 text-right">
                          <Delta value={delta(r.cells[last]!, r.cells[last - 1], r.kind === 'margin')} points={r.kind === 'margin'} />
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-subtle border-line border-t px-5 py-2.5 text-[11px]">
          From the SEC&apos;s XBRL data · D derived (Q4 = full year − nine months) · C computed · ~ approximate · R restated later
        </p>
      </div>
    </div>
  );
}

function Chart({ data }: { data: Overview }) {
  const id = useId();
  const revenue = data.rows.find((r) => r.key === 'revenue')!;
  const net = data.rows.find((r) => r.key === 'net_income')!;
  const points = data.quarters.map((q, i) => ({
    quarter: q.quarter,
    Revenue: revenue.cells[i]?.value ?? 0,
    'Net income': net.cells[i]?.value ?? 0,
  }));
  const format = (v: number) => formatValue(v, 'USD');
  const axis = { tick: { fill: 'var(--color-subtle)', fontSize: 11 }, axisLine: false, tickLine: false } as const;
  return (
    <div className="surface rounded-2xl p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[13px] font-semibold">Revenue and net income</p>
        <div className="text-muted flex gap-4 text-[11px]">
          <span className="flex items-center gap-1.5">
            <span className="bg-accent size-2 rounded-full" /> Revenue
          </span>
          <span className="flex items-center gap-1.5">
            <span className="bg-series-2 size-2 rounded-full" /> Net income
          </span>
        </div>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={points} barGap={6} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`${id}-r`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--color-accent)" />
                <stop offset="100%" stopColor="var(--color-accent-2)" stopOpacity={0.9} />
              </linearGradient>
              <linearGradient id={`${id}-n`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--color-series-2)" />
                <stop offset="100%" stopColor="var(--color-series-2)" stopOpacity={0.7} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--color-line)" strokeDasharray="3 6" />
            <XAxis dataKey="quarter" {...axis} dy={8} />
            <YAxis tickFormatter={format} width={64} {...axis} />
            <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }} content={<ChartTooltip format={format} />} />
            <Bar dataKey="Revenue" fill={`url(#${id}-r)`} radius={[8, 8, 3, 3]} maxBarSize={56} animationDuration={800} />
            <Bar dataKey="Net income" fill={`url(#${id}-n)`} radius={[8, 8, 3, 3]} maxBarSize={56} animationDuration={800} animationBegin={120} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function delta(now: Cell, before: Cell | undefined, points: boolean): number | null {
  if (now.value === null || !before || before.value === null) return null;
  if (points) return now.value - before.value;
  return before.value === 0 ? null : (now.value - before.value) / Math.abs(before.value);
}

function Skeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 @md:grid-cols-2 @4xl:grid-cols-4">
        {KPIS.map((k) => (
          <div key={k} className="surface h-[136px] animate-pulse rounded-2xl" />
        ))}
      </div>
      <div className="surface h-80 animate-pulse rounded-2xl" />
    </div>
  );
}
