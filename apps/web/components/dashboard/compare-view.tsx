'use client';

import { useQuery } from '@tanstack/react-query';
import { formatValue } from '@desk/shared';
import { api } from '@/lib/api';
import { CellValue, Change } from './cell-value';

export function CompareView({ metric, tickers, periodEnd }: { metric: string; tickers: string[]; periodEnd: string | null }) {
  const { data, error, isLoading } = useQuery({
    queryKey: ['compare', metric, tickers, periodEnd],
    queryFn: () => api.compare(metric, tickers, periodEnd),
  });
  if (isLoading) return <div className="border-line bg-panel h-64 animate-pulse rounded-xl border" />;
  if (error || !data) return <p className="text-down text-sm">Could not load the comparison: {String(error)}</p>;
  const max = Math.max(...data.rows.map((r) => Math.abs(r.value.value ?? 0)), 1);

  return (
    <div className="border-line bg-panel rounded-xl border p-5">
      <h2 className="mb-1 text-lg font-semibold">{data.label}</h2>
      <p className="text-muted mb-5 text-sm">Each company on its latest reported quarter, against the same quarter a year earlier.</p>
      <div className="space-y-4">
        {data.rows.map((r) => (
          <div key={r.ticker}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
              <span>
                <span className="font-semibold">{r.ticker}</span> <span className="text-muted">{r.quarter}</span>
              </span>
              <span className="flex items-baseline gap-3">
                <CellValue cell={r.value} unit={data.unit} />
                <Change value={r.yoy} />
              </span>
            </div>
            <div className="bg-ink h-2.5 overflow-hidden rounded-full">
              <div className="bg-accent h-full rounded-full" style={{ width: `${(Math.abs(r.value.value ?? 0) / max) * 100}%` }} />
            </div>
            <p className="text-muted mt-1 text-xs">Year earlier: {formatValue(r.yearAgo.value, data.unit)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
