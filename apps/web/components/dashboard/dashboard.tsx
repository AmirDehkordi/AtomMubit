'use client';

import { BarChart3, CheckCircle2, ExternalLink, FileText, GitCompare, LayoutGrid, Loader2, Pin, ShieldCheck, TrendingUp, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { DESK_METRIC_KEYS, metricInfo, type DeskMetricKey, type ViewSpec } from '@desk/shared';
import type { DeskFiling } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useDesk, type DeskTab } from '@/lib/desk-store';
import { Monogram } from '../ui/monogram';
import { CompareView } from './compare-view';
import { FilingReader } from './filing-reader';
import { MetricDetail } from './metric-detail';
import { QuarterOverview } from './quarter-overview';

const ease = [0.22, 1, 0.36, 1] as const;

export function Dashboard({ filings, title }: { filings: DeskFiling[]; title: string }) {
  const tabs = useDesk((s) => s.tabs);
  const activeTab = useDesk((s) => s.activeTab);
  const active = tabs.find((t) => t.id === activeTab) ?? tabs[0];
  const ticker = filings[0]?.ticker ?? (active?.spec && 'ticker' in active.spec ? active.spec.ticker : null);
  const reading = filings.filter((f) => f.status !== 'ready').length;

  return (
    <div className="relative flex h-full flex-col">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(ellipse_at_top_left,color-mix(in_oklab,var(--color-accent)_9%,transparent),transparent_60%)]" />
      <header className="relative px-8 pt-7 pb-4">
        <div className="flex items-start gap-4">
          {ticker && <Monogram ticker={ticker} size="lg" />}
          <div className="min-w-0 flex-1">
            <motion.h1
              key={title}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease }}
              className="truncate text-[22px] leading-tight font-semibold tracking-[-0.02em]"
            >
              {title}
            </motion.h1>
            <p className="text-muted mt-1 flex items-center gap-2 text-[13px]">
              {filings.length > 0 && (
                <>
                  <span>
                    {filings.length} filing{filings.length === 1 ? '' : 's'}
                  </span>
                  <span className="text-subtle">·</span>
                  <span className="inline-flex items-center gap-1.5">
                    <ShieldCheck className="text-up size-3.5" /> Numbers checked against SEC XBRL
                  </span>
                  {reading > 0 && (
                    <>
                      <span className="text-subtle">·</span>
                      <span className="text-accent inline-flex items-center gap-1.5">
                        <Loader2 className="size-3 animate-spin" /> reading {reading}
                      </span>
                    </>
                  )}
                </>
              )}
            </p>
          </div>
        </div>
        {filings.length > 0 && <FilingStrip filings={filings} />}
        <TabBar tabs={tabs} active={active?.id ?? null} filings={filings} />
      </header>
      <div className="relative min-h-0 flex-1 overflow-y-auto px-8 pt-2 pb-8">
        <AnimatePresence mode="wait">
          {active && (
            <motion.div
              key={active.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.28, ease }}
            >
              <View view={active.spec} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function FilingStrip({ filings }: { filings: DeskFiling[] }) {
  const show = useDesk((s) => s.showView);
  return (
    <div className="mt-4 flex flex-wrap gap-1.5">
      {filings.map((f) => (
        <span
          key={f.accession}
          className="border-line hover:border-[color-mix(in_oklab,var(--color-text)_20%,transparent)] group inline-flex items-center gap-1.5 rounded-full border bg-[color-mix(in_oklab,var(--color-panel)_80%,transparent)] py-1 pr-2 pl-1.5 text-[11px] transition-colors"
        >
          <button
            className="inline-flex items-center gap-1.5"
            title="Open in the reader"
            onClick={() => show({ view: 'filing_reader', accession: f.accession, sectionId: null, highlight: [] })}
          >
            {f.status === 'ready' ? (
              <CheckCircle2 className="text-up size-3.5" />
            ) : (
              <Loader2 className="text-accent size-3.5 animate-spin" />
            )}
            <span className="font-semibold">{f.form}</span>
            <span className="text-muted font-mono">{f.quarter}</span>
          </button>
          <a href={f.url} target="_blank" rel="noreferrer" title="Original on SEC" aria-label="Original on SEC">
            <ExternalLink className="text-subtle hover:text-text size-3 opacity-0 transition-opacity group-hover:opacity-100" />
          </a>
        </span>
      ))}
    </div>
  );
}

function TabBar({ tabs, active, filings }: { tabs: DeskTab[]; active: string | null; filings: DeskFiling[] }) {
  const focus = useDesk((s) => s.focusTab);
  const close = useDesk((s) => s.closeTab);
  if (!tabs.length) return null;
  return (
    <nav
      className="border-line mt-5 flex w-fit max-w-full gap-0.5 overflow-x-auto rounded-xl border bg-[color-mix(in_oklab,var(--color-panel)_85%,transparent)] p-1"
      aria-label="Dashboard tabs"
    >
      {tabs.map((t) => {
        const { icon: Icon, label } = describe(t.spec, filings);
        const isActive = t.id === active;
        return (
          <div key={t.id} className="relative shrink-0">
            {isActive && (
              <motion.span
                layoutId="tab-pill"
                className="bg-raised absolute inset-0 rounded-lg shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_1px_3px_rgba(0,0,0,0.4)]"
                transition={{ duration: 0.3, ease }}
              />
            )}
            <button
              onClick={() => focus(t.id)}
              className={cn(
                'group relative flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] whitespace-nowrap transition-colors',
                isActive ? 'text-text' : 'text-muted hover:text-text',
              )}
            >
              <Icon className={cn('size-3.5', isActive ? 'text-accent' : 'text-subtle')} />
              {label}
              {t.pinned ? (
                <Pin className="text-subtle size-3" aria-label="Pinned" />
              ) : (
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`Close ${label}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    close(t.id);
                  }}
                  className="text-subtle hover:text-text -mr-1 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <X className="size-3" />
                </span>
              )}
            </button>
          </div>
        );
      })}
    </nav>
  );
}

function describe(spec: ViewSpec, filings: DeskFiling[]): { icon: typeof LayoutGrid; label: string } {
  const metric = (m: string) =>
    (DESK_METRIC_KEYS as string[]).includes(m) ? metricInfo(m as DeskMetricKey).label : m.replace(/_/g, ' ');
  switch (spec.view) {
    case 'quarter_overview':
      return { icon: LayoutGrid, label: `${spec.ticker} overview` };
    case 'metric_detail':
      return { icon: TrendingUp, label: `${spec.ticker} ${metric(spec.metric).toLowerCase()}` };
    case 'compare':
      return { icon: GitCompare, label: `${metric(spec.metric)}: ${spec.tickers.join(' · ')}` };
    case 'filing_reader': {
      const f = filings.find((x) => x.accession === spec.accession);
      return { icon: FileText, label: f ? `${f.form} ${f.quarter}` : 'Filing' };
    }
    default:
      return { icon: BarChart3, label: spec.view.replace(/_/g, ' ') };
  }
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
        <div className="surface text-muted rounded-2xl p-10 text-center text-sm">
          The {view.view.replace(/_/g, ' ')} view is coming next.
        </div>
      );
  }
}
