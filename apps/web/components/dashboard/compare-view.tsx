'use client';

import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { formatValue } from '@desk/shared';
import { api } from '@/lib/api';
import { Delta, NEUTRAL_METRICS } from '../ui/delta';
import { Monogram } from '../ui/monogram';
import { CellValue } from './cell-value';

const ease = [0.22, 1, 0.36, 1] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-07-26" as "26 Jul 2026", without going through the viewer's time zone. */
function ended(periodEnd: string) {
  const [y, m, d] = periodEnd.split('-').map(Number);
  return y && m && d ? `${d} ${MONTHS[m - 1]} ${y}` : periodEnd;
}

/**
 * Companies side by side on their latest quarter, each against the same quarter a year earlier.
 * `subject` is the desk's own company, drawn in the accent; on a desk that only compares, all are.
 */
export function CompareView({
  metric,
  tickers,
  periodEnd,
  subject,
}: {
  metric: string;
  tickers: string[];
  periodEnd: string | null;
  subject?: string;
}) {
  const { data, error, isLoading } = useQuery({
    queryKey: ['compare', metric, tickers, periodEnd],
    queryFn: () => api.compare(metric, tickers, periodEnd),
  });
  if (isLoading) return <div className="surface h-72 animate-pulse rounded-3xl" />;
  if (error || !data) return <p className="text-down text-sm">Could not load the comparison: {String(error)}</p>;
  const max = Math.max(...data.rows.flatMap((r) => [Math.abs(r.value.value ?? 0), Math.abs(r.yearAgo.value ?? 0)]), 1);
  const rows = [...data.rows].sort((a, b) => (b.value.value ?? -Infinity) - (a.value.value ?? -Infinity));
  const points = data.unit === 'percent';
  // The question analysts ask of a comparison: who grew fastest, not who is biggest.
  const fastest = [...rows].filter((r) => r.yoy !== null).sort((a, b) => b.yoy! - a.yoy!)[0];
  const growth = (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}${points ? 'pp' : '%'}`;
  // Fiscal labels differ by company (Q2 FY2027, Q4 FY2026); the period ends show they line up.
  const ends = rows.map((r) => r.periodEnd).sort();
  const span = ends.length > 1 && ends[0] !== ends[ends.length - 1] ? `${ended(ends[0]!)} – ${ended(ends[ends.length - 1]!)}` : ends[0] ? ended(ends[0]) : null;
  const neutral = NEUTRAL_METRICS.has(metric);
  const share = (v: number | null) => `${(Math.abs(v ?? 0) / max) * 100}%`;

  return (
    <div className="surface relative overflow-hidden rounded-3xl p-7">
      <div className="relative">
        {subject && <h2 className="mb-1 text-[15px] font-semibold">{data.label}</h2>}
        <p className="text-subtle text-[13px]">
          Each company on its latest reported quarter, against the same quarter a year earlier.
          {span && ` All ended ${span}.`}
          {fastest && fastest.yoy !== null && (
            <>
              {' '}
              <span className="text-muted">
                Fastest Y/Y: {fastest.ticker} {growth(fastest.yoy)}.
              </span>
            </>
          )}
        </p>
        <div className="text-muted mt-4 flex gap-4 text-[11px]" aria-hidden>
          <span className="flex items-center gap-1.5">
            <span className="bg-accent size-2.5 rounded-[2px]" /> {subject ?? 'Latest quarter'}
          </span>
          {subject && rows.length > 1 && (
            <span className="flex items-center gap-1.5">
              <span className="bg-series-2 size-2.5 rounded-[2px]" /> Peers
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <span className="bg-muted h-2.5 w-0.5 rounded-full" /> Year earlier
          </span>
        </div>
        <div className="mt-6 space-y-5">
          {rows.map((r, i) => (
            <div key={r.ticker} className="flex items-center gap-4">
              <Monogram ticker={r.ticker} />
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-[13px]">
                    <span className="font-semibold">{r.ticker}</span>{' '}
                    <span className="text-subtle font-mono text-[11px]">
                      {r.quarter} · ended {ended(r.periodEnd)}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2.5">
                    <span className="text-[15px] font-semibold">
                      <CellValue cell={r.value} unit={data.unit} />
                    </span>
                    <Delta value={r.yoy} points={points} neutral={neutral} />
                  </span>
                </div>
                <div
                  className="relative h-3.5"
                  role="img"
                  aria-label={`${r.ticker} ${formatValue(r.value.value, data.unit)}, a year earlier ${formatValue(r.yearAgo.value, data.unit)}`}
                >
                  <div className="absolute inset-x-0 top-[5px] h-1 rounded-[2px] bg-[color-mix(in_oklab,var(--color-raised)_80%,var(--color-ink))]" />
                  <motion.div
                    className={`absolute top-[3px] left-0 h-2 rounded-r-[4px] ${!subject || r.ticker === subject ? 'bg-accent' : 'bg-series-2'}`}
                    initial={{ width: 0 }}
                    animate={{ width: share(r.value.value) }}
                    transition={{ duration: 0.8, delay: i * 0.08, ease }}
                  />
                  {r.yearAgo.value !== null && (
                    <motion.div
                      className="bg-muted absolute top-0 h-3.5 w-0.5 -translate-x-1/2 rounded-full shadow-[0_0_0_2px_var(--color-panel)]"
                      style={{ left: share(r.yearAgo.value) }}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.4, delay: 0.5 + i * 0.08 }}
                    />
                  )}
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
