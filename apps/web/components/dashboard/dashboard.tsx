'use client';

import { CheckCircle2, ExternalLink, Loader2 } from 'lucide-react';
import { useDesk } from '@/lib/desk-store';
import type { ViewSpec } from '@desk/shared';
import type { DeskFiling } from '@/lib/api';
import { CompareView } from './compare-view';
import { FilingReader } from './filing-reader';
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
              <span
                key={f.accession}
                className="border-line bg-panel hover:border-accent group inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition-colors"
              >
                <button
                  className="inline-flex items-center gap-2"
                  title="Open in the reader"
                  onClick={() => useDesk.getState().showView({ view: 'filing_reader', accession: f.accession, sectionId: null, highlight: [] })}
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
                </button>
                <a href={f.url} target="_blank" rel="noreferrer" title="Original on SEC" aria-label="Original on SEC">
                  <ExternalLink className="text-muted hover:text-text size-3 opacity-0 transition-opacity group-hover:opacity-100" />
                </a>
              </span>
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
    case 'filing_reader':
      return <FilingReader accession={view.accession} sectionId={view.sectionId} highlight={view.highlight} />;
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
