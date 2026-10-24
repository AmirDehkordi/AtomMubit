'use client';

import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatValue } from '@desk/shared';
import { api, type Cell, type QuarterOverview as Overview } from '@/lib/api';
import { CellValue, Change } from './cell-value';

const KPIS = ['revenue', 'net_income', 'gross_margin', 'operating_margin'];

export function QuarterOverview({ ticker, periods }: { ticker: string; periods: string[] }) {
  const { data, error, isLoading } = useQuery({
    queryKey: ['overview', ticker, periods],
    queryFn: () => api.overview(ticker, periods),
  });
  if (isLoading) return <Skeleton />;
  if (error || !data) return <p className="text-down text-sm">Could not load figures: {String(error)}</p>;

  const last = data.quarters.length - 1;
  const row = (key: string) => data.rows.find((r) => r.key === key)!;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {KPIS.map((key) => {
          const r = row(key);
          const now = r.cells[last]!;
          const before = r.cells[last - 1];
          return (
            <div key={key} className="border-line bg-panel rounded-xl border p-4">
              <p className="text-muted text-xs tracking-wide uppercase">{r.label}</p>
              <p className="mt-2 text-2xl font-semibold">
                <CellValue cell={now} unit={r.unit} />
              </p>
              <p className="mt-1 text-xs">
                <Change value={delta(now, before, r.kind === 'margin')} points={r.kind === 'margin'} />
                <span className="text-muted"> vs {data.quarters[last - 1]?.quarter ?? 'prior'}</span>
              </p>
            </div>
          );
        })}
      </div>

      <Chart data={data} />

      <div className="border-line bg-panel overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-line text-muted border-b text-xs">
              <th className="px-4 py-3 text-left font-medium">Metric</th>
              {data.quarters.map((q) => (
                <th key={q.periodEnd} className="px-4 py-3 text-right font-medium">
                  <div className="text-text">{q.quarter}</div>
                  <div>ended {q.periodEnd}</div>
                </th>
              ))}
              <th className="px-4 py-3 text-right font-medium">Q/Q</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.key} className="border-line/60 border-b last:border-0">
                <td className="px-4 py-2.5">{r.label}</td>
                {r.cells.map((c, i) => (
                  <td key={i} className="px-4 py-2.5 text-right">
                    <CellValue cell={c} unit={r.unit} />
                  </td>
                ))}
                <td className="px-4 py-2.5 text-right">
                  <Change value={delta(r.cells[last]!, r.cells[last - 1], r.kind === 'margin')} points={r.kind === 'margin'} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-muted border-line border-t px-4 py-2 text-xs">
          From the SEC&apos;s XBRL data. D = derived (Q4 = full year − nine months), C = computed, ~ = approximate, R =
          restated later.
        </p>
      </div>
    </div>
  );
}

function Chart({ data }: { data: Overview }) {
  const revenue = data.rows.find((r) => r.key === 'revenue')!;
  const net = data.rows.find((r) => r.key === 'net_income')!;
  const points = data.quarters.map((q, i) => ({
    quarter: q.quarter,
    Revenue: revenue.cells[i]?.value ?? 0,
    'Net income': net.cells[i]?.value ?? 0,
  }));
  return (
    <div className="border-line bg-panel h-64 rounded-xl border p-4">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} barGap={4}>
          <CartesianGrid vertical={false} stroke="var(--color-line)" />
          <XAxis dataKey="quarter" tick={{ fill: 'var(--color-muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis
            tickFormatter={(v: number) => formatValue(v, 'USD')}
            tick={{ fill: 'var(--color-muted)', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={70}
          />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            contentStyle={{ background: 'var(--color-panel)', border: '1px solid var(--color-line)', borderRadius: 8 }}
            formatter={(v) => formatValue(Number(v), 'USD')}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="Revenue" fill="var(--color-accent)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="Net income" fill="var(--color-up)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
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
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {KPIS.map((k) => (
          <div key={k} className="border-line bg-panel h-28 animate-pulse rounded-xl border" />
        ))}
      </div>
      <div className="border-line bg-panel h-64 animate-pulse rounded-xl border" />
    </div>
  );
}
