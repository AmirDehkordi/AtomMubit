'use client';

import { CheckCircle2, ExternalLink, Loader2 } from 'lucide-react';
import type { ViewSpec } from '@desk/shared';
import type { DeskFiling } from '@/lib/api';
import { CompareView } from './compare-view';
import { MetricDetail } from './metric-detail';
import { QuarterOverview } from './quarter-overview';

export function Dashboard({ view, filings, title }: { view: ViewSpec; filings: DeskFiling[]; title: string }) {
  return (
    <div className="h-full overflow-y-auto px-6 py-5">
      <header className="mb-5">
        <h1 className="text-xl font-semibold">{title}</h1>
        {filings.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {filings.map((f) => (
              <a
                key={f.accession}
                href={f.url}
                target="_blank"
                rel="noreferrer"
                className="border-line bg-panel hover:border-accent group inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition-colors"
              >
                {f.status === 'ready' ? (
                  <CheckCircle2 className="text-up size-3.5" />
                ) : (
                  <Loader2 className="text-accent size-3.5 animate-spin" />
                )}
                <span className="font-medium">
                  {f.ticker} {f.form}
                </span>
                <span className="text-muted">{f.quarter}</span>
                <ExternalLink className="text-muted size-3 opacity-0 transition-opacity group-hover:opacity-100" />
              </a>
            ))}
          </div>
        )}
      </header>
      <View view={view} />
    </div>
  );
}

function View({ view }: { view: ViewSpec }) {
  switch (view.view) {
    case 'quarter_overview':
      return <QuarterOverview ticker={view.ticker} periods={view.periods} />;
    case 'metric_detail':
      return <MetricDetail ticker={view.ticker} metric={view.metric} periods={view.periods} />;
    case 'compare':
      return <CompareView metric={view.metric} tickers={view.tickers} periodEnd={view.periodEnd} />;
    default:
      return (
        <div className="border-line bg-panel text-muted rounded-xl border p-8 text-center text-sm">
          The {view.view.replace(/_/g, ' ')} view arrives with the filing reader.
        </div>
      );
  }
}
