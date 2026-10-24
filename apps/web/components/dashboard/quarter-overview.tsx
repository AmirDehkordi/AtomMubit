'use client';

import { useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'motion/react';
import { Fragment } from 'react';
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatValue } from '@desk/shared';
import { api, type Cell, type QuarterOverview as Overview } from '@/lib/api';
import { cn } from '@/lib/cn';
import { AXIS, CURSOR_FILL, QuarterTick, axisTick, latestLabel } from '../ui/chart-axis';
import { ChartTooltip } from '../ui/chart-tooltip';
import { Delta, NEUTRAL_METRICS } from '../ui/delta';
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
  const prior = data.quarters[last - 1]?.quarter ?? 'prior quarter';

  return (
    <div className="space-y-4">
      <p className="text-muted text-xs">Change vs {prior}</p>
      <div className="grid grid-cols-1 gap-3 @md:grid-cols-2 @4xl:grid-cols-4">
        {KPIS.map((key, i) => {
          const r = row(key);
          if (!r) return null;
          const margin = r.kind === 'margin';
          const now = r.cells[last]!;
          const change = delta(now, r.cells[last - 1], margin);
          const start = r.cells.find((c) => c.value !== null);
          return (
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: i * 0.06, ease }}
              className="surface relative overflow-hidden rounded-2xl p-5"
            >
              <p className="sr-only">{summary(r.label, r.unit, now, start, change, margin, prior, data.quarters[0]?.quarter)}</p>
              <div aria-hidden>
                <div className="flex items-center justify-between">
                  <p className="text-muted text-[12px] font-medium">{r.label}</p>
                  <Delta value={change} points={margin} />
                </div>
                <p className="mt-3 text-[26px] leading-none font-semibold tracking-[-0.03em] @5xl:text-[30px]">
                  {now.value === null ? '—' : <AnimatedNumber value={now.value} format={(v) => formatValue(v, r.unit)} />}
                </p>
                <div className="mt-4 flex items-end justify-between gap-2">
                  {start?.value != null && (
                    <span className="text-subtle truncate text-[11px] tabular-nums" title={`In ${data.quarters[0]?.quarter ?? 'the first quarter'}`}>
                      from {formatValue(start.value, r.unit)}
                    </span>
                  )}
                  <Sparkline values={r.cells.map((c) => c.value)} kind={margin ? 'margin' : 'amount'} className="ml-auto h-8 w-[88px] shrink-0" />
                </div>
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
                          <Delta
                            value={delta(r.cells[last]!, r.cells[last - 1], r.kind === 'margin')}
                            points={r.kind === 'margin'}
                            neutral={NEUTRAL_METRICS.has(k)}
                          />
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
  const reduce = useReducedMotion();
  const revenue = data.rows.find((r) => r.key === 'revenue')!;
  const net = data.rows.find((r) => r.key === 'net_income')!;
  const last = data.quarters.length - 1;
  const points = data.quarters.map((q, i) => ({
    quarter: q.quarter,
    Revenue: revenue.cells[i]?.value ?? 0,
    'Net income': net.cells[i]?.value ?? 0,
  }));
  const index = (quarter: string) => data.quarters.findIndex((q) => q.quarter === quarter);
  const derived = new Set(revenue.cells.flatMap((c, i) => (c.method === 'derived' ? [i] : [])));
  const series: Record<string, Cell[]> = { Revenue: revenue.cells, 'Net income': net.cells };
  const format = (v: number) => formatValue(v, 'USD');
  const first = revenue.cells[0]?.value ?? null;
  const latest = revenue.cells[last]?.value ?? null;
  const desc =
    first !== null && latest !== null
      ? `Revenue went from ${format(first)} in ${data.quarters[0]?.quarter} to ${format(latest)} in ${data.quarters[last]?.quarter}. Net income went from ${formatValue(net.cells[0]?.value ?? null, 'USD')} to ${formatValue(net.cells[last]?.value ?? null, 'USD')}. The table below has every value.`
      : 'The table below has every value.';
  return (
    <div className="surface rounded-2xl p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[13px] font-semibold">Revenue and net income</p>
        <div className="text-muted flex gap-4 text-[11px]">
          <span className="flex items-center gap-1.5">
            <span className="bg-accent size-2.5 rounded-[2px]" /> Revenue
          </span>
          <span className="flex items-center gap-1.5">
            <span className="bg-series-2 size-2.5 rounded-[2px]" /> Net income
          </span>
        </div>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={points}
            barGap={4}
            margin={{ top: 20, right: 4, left: 0, bottom: 0 }}
            title={`Revenue and net income, ${data.quarters.length} quarters`}
            desc={desc}
          >
            <CartesianGrid vertical={false} stroke="var(--color-line)" />
            <XAxis dataKey="quarter" {...AXIS} tick={(p) => <QuarterTick {...p} last={last} derived={derived} />} />
            <YAxis tickFormatter={axisTick('USD')} width={56} {...AXIS} />
            <ReferenceLine y={0} stroke="var(--color-baseline)" />
            <Tooltip
              cursor={{ fill: CURSOR_FILL }}
              content={
                <ChartTooltip
                  format={format}
                  heading={(q) => (derived.has(index(q)) ? `${q} · derived` : q)}
                  change={(name, q) => {
                    const i = index(q);
                    const cells = series[name];
                    return i > 0 && cells ? { value: delta(cells[i]!, cells[i - 1], false) } : null;
                  }}
                  footer={(q) => {
                    const i = index(q);
                    const r = revenue.cells[i]?.value;
                    const n = net.cells[i]?.value;
                    return r && n !== null && n !== undefined ? `Net margin ${((n / r) * 100).toFixed(1)}%` : null;
                  }}
                />
              }
            />
            <Bar
              dataKey="Revenue"
              fill="var(--color-accent)"
              radius={[4, 4, 0, 0]}
              maxBarSize={36}
              isAnimationActive={!reduce}
              animationDuration={800}
              label={latestLabel(last, 'USD')}
            />
            <Bar
              dataKey="Net income"
              fill="var(--color-series-2)"
              radius={[4, 4, 0, 0]}
              maxBarSize={36}
              isAnimationActive={!reduce}
              animationDuration={800}
              animationBegin={120}
              label={latestLabel(last, 'USD')}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** What a screen reader hears for a KPI card, in place of the number, chip and sparkline. */
function summary(label: string, unit: string, now: Cell, start: Cell | undefined, change: number | null, points: boolean, prior: string, first?: string) {
  if (now.value === null) return `${label}: not reported.`;
  const parts = [`${label} ${formatValue(now.value, unit)}`];
  if (change !== null && Number.isFinite(change)) {
    const flat = Math.round(change * 1000) === 0;
    const amount = `${Math.abs(change * 100).toFixed(1)}${points ? ' points' : '%'}`;
    parts.push(flat ? `unchanged vs ${prior}` : `${change > 0 ? 'up' : 'down'} ${amount} vs ${prior}`);
  }
  if (start?.value != null && start !== now && first) parts.push(`${formatValue(start.value, unit)} in ${first}`);
  return `${parts.join(', ')}.`;
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
