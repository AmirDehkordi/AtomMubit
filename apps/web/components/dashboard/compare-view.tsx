'use client';

import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { formatValue } from '@desk/shared';
import { api } from '@/lib/api';
import { Delta } from '../ui/delta';
import { Monogram } from '../ui/monogram';
import { CellValue } from './cell-value';

const ease = [0.22, 1, 0.36, 1] as const;

export function CompareView({ metric, tickers, periodEnd }: { metric: string; tickers: string[]; periodEnd: string | null }) {
  const { data, error, isLoading } = useQuery({
    queryKey: ['compare', metric, tickers, periodEnd],
    queryFn: () => api.compare(metric, tickers, periodEnd),
  });
  if (isLoading) return <div className="surface h-72 animate-pulse rounded-3xl" />;
  if (error || !data) return <p className="text-down text-sm">Could not load the comparison: {String(error)}</p>;
  const max = Math.max(...data.rows.map((r) => Math.abs(r.value.value ?? 0)), 1);
  const leader = [...data.rows].sort((a, b) => (b.value.value ?? -Infinity) - (a.value.value ?? -Infinity))[0];
  const points = data.unit === 'percent';

  return (
    <div className="surface relative overflow-hidden rounded-3xl p-7">
      <div className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--color-accent)_14%,transparent),transparent)]" />
      <div className="relative">
        <p className="text-muted text-xs font-medium tracking-wide">Comparison</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-[-0.02em]">{data.label}</h2>
        <p className="text-subtle mt-1 text-[13px]">
          Each company on its latest reported quarter, against the same quarter a year earlier.
          {leader && (
            <>
              {' '}
              <span className="text-muted">Highest: {leader.ticker}.</span>
            </>
          )}
        </p>
        <div className="mt-7 space-y-5">
          {data.rows.map((r, i) => (
            <div key={r.ticker} className="flex items-center gap-4">
              <Monogram ticker={r.ticker} />
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <span className="text-[13px]">
                    <span className="font-semibold">{r.ticker}</span>{' '}
                    <span className="text-subtle font-mono text-[11px]">{r.quarter}</span>
                  </span>
                  <span className="flex items-center gap-2.5">
                    <span className="text-[15px] font-semibold">
                      <CellValue cell={r.value} unit={data.unit} />
                    </span>
                    <Delta value={r.yoy} points={points} />
                  </span>
                </div>
                <div className="bg-ink h-2.5 overflow-hidden rounded-full">
                  <motion.div
                    className="from-accent to-accent-2 h-full rounded-full bg-gradient-to-r"
                    initial={{ width: 0 }}
                    animate={{ width: `${(Math.abs(r.value.value ?? 0) / max) * 100}%` }}
                    transition={{ duration: 0.8, delay: i * 0.08, ease }}
                  />
                </div>
                <p className="text-subtle mt-1.5 text-[11px]">Year earlier {formatValue(r.yearAgo.value, data.unit)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
