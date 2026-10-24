'use client';

import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatValue } from '@desk/shared';
import { api } from '@/lib/api';
import { CellValue, Change } from './cell-value';

/** One metric over the desk's quarters: the latest value, a trend chart and each quarter's change. */
export function MetricDetail({ ticker, metric, periods }: { ticker: string; metric: string; periods: string[] }) {
  const { data, error, isLoading } = useQuery({
    queryKey: ['metric', ticker, metric, periods],
    queryFn: () => api.metric(ticker, metric, periods),
  });
  if (isLoading) return <div className="border-line bg-panel h-80 animate-pulse rounded-xl border" />;
  if (error || !data?.rows[0]) return <p className="text-down text-sm">Could not load {metric}: {String(error)}</p>;

  const row = data.rows[0];
  const margin = row.kind === 'margin';
  const last = row.cells.length - 1;
  const delta = (i: number) => {
    const now = row.cells[i]?.value ?? null;
    const before = i > 0 ? (row.cells[i - 1]?.value ?? null) : null;
    if (now === null || before === null) return null;
    return margin ? now - before : before === 0 ? null : (now - before) / Math.abs(before);
  };
  const points = data.quarters.map((q, i) => ({ quarter: q.quarter, value: row.cells[i]?.value ?? null }));
  const format = (v: number) => formatValue(v, row.unit);
  const axis = { tick: { fill: 'var(--color-muted)', fontSize: 12 }, axisLine: false, tickLine: false } as const;
  const tooltip = {
    cursor: { fill: 'rgba(255,255,255,0.04)' },
    contentStyle: { background: 'var(--color-panel)', border: '1px solid var(--color-line)', borderRadius: 8 },
    formatter: (v: unknown) => format(Number(v)),
  };

  return (
    <div className="space-y-6">
      <div className="border-line bg-panel rounded-2xl border p-5">
        <p className="text-muted text-xs tracking-wide uppercase">
          {data.ticker} · {row.label}
        </p>
        <p className="mt-2 text-3xl font-semibold">
          <CellValue cell={row.cells[last]!} unit={row.unit} />
        </p>
        <p className="mt-1 text-sm">
          <Change value={delta(last)} points={margin} />
          <span className="text-muted"> vs {data.quarters[last - 1]?.quarter ?? 'prior quarter'}</span>
        </p>
        <div className="mt-6 h-64">
          <ResponsiveContainer width="100%" height="100%">
            {margin ? (
              <LineChart data={points}>
                <CartesianGrid vertical={false} stroke="var(--color-line)" />
                <XAxis dataKey="quarter" {...axis} />
                <YAxis tickFormatter={format} domain={['auto', 'auto']} width={60} {...axis} />
                <Tooltip {...tooltip} />
                <Line dataKey="value" stroke="var(--color-accent)" strokeWidth={2.5} dot={{ r: 4, fill: 'var(--color-accent)' }} isAnimationActive={false} />
              </LineChart>
            ) : (
              <BarChart data={points}>
                <CartesianGrid vertical={false} stroke="var(--color-line)" />
                <XAxis dataKey="quarter" {...axis} />
                <YAxis tickFormatter={format} width={70} {...axis} />
                <Tooltip {...tooltip} />
                <Bar dataKey="value" fill="var(--color-accent)" radius={[4, 4, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {data.quarters.map((q, i) => (
          <div key={q.periodEnd} className="border-line bg-panel rounded-2xl border p-4">
            <p className="text-sm font-medium">{q.quarter}</p>
            <p className="text-muted text-xs">ended {q.periodEnd}</p>
            <p className="mt-2 text-lg font-semibold">
              <CellValue cell={row.cells[i]!} unit={row.unit} />
            </p>
            <p className="text-xs">
              {i > 0 ? <Change value={delta(i)} points={margin} /> : <span className="text-muted">first quarter shown</span>}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
