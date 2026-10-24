'use client';

import { BarChart3, CheckCircle2, ExternalLink, FileText, GitCompare, LayoutGrid, Loader2, Pin, TrendingUp, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { DESK_METRIC_KEYS, metricInfo, type DeskMetricKey, type ViewSpec } from '@desk/shared';
import type { DeskFiling } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useDesk, type DeskTab } from '@/lib/desk-store';
import { CompareView } from './compare-view';
import { FilingReader } from './filing-reader';
import { MetricDetail } from './metric-detail';
import { QuarterOverview } from './quarter-overview';

const ease = [0.22, 1, 0.36, 1] as const;

export function Dashboard({ filings, title }: { filings: DeskFiling[]; title: string }) {
  const tabs = useDesk((s) => s.tabs);
  const activeTab = useDesk((s) => s.activeTab);
  const active = tabs.find((t) => t.id === activeTab) ?? tabs[0];

  return (
    <div className="flex h-full flex-col">
      <header className="border-line border-b px-7 pt-6">
        <motion.h1
          key={title}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease }}
          className="text-[22px] font-semibold tracking-tight"
        >
          {title}
        </motion.h1>
        {filings.length > 0 && <FilingStrip filings={filings} />}
        <TabBar tabs={tabs} active={active?.id ?? null} filings={filings} />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-7 py-6">
        <AnimatePresence mode="wait">
          {active && (
            <motion.div
              key={active.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.3, ease }}
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
    <motion.div
      className="mt-3 flex flex-wrap gap-2"
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: 0.05 } } }}
    >
      {filings.map((f) => (
        <motion.span
          key={f.accession}
          variants={{ hidden: { opacity: 0, y: 4 }, show: { opacity: 1, y: 0 } }}
          className="border-line bg-panel hover:border-accent/40 group inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition-colors"
        >
          <button
            className="inline-flex items-center gap-2"
            title="Open in the reader"
            onClick={() => show({ view: 'filing_reader', accession: f.accession, sectionId: null, highlight: [] })}
          >
            {f.status === 'ready' ? (
              <CheckCircle2 className="text-up size-3.5" />
            ) : (
              <Loader2 className="text-accent size-3.5 animate-spin" />
            )}
            <span className="font-medium">
              {f.ticker} {f.form}
            </span>
            <span className="text-muted font-mono text-[11px]">{f.quarter}</span>
          </button>
          <a href={f.url} target="_blank" rel="noreferrer" title="Original on SEC" aria-label="Original on SEC">
            <ExternalLink className="text-subtle hover:text-text size-3 opacity-0 transition-opacity group-hover:opacity-100" />
          </a>
        </motion.span>
      ))}
    </motion.div>
  );
}

function TabBar({ tabs, active, filings }: { tabs: DeskTab[]; active: string | null; filings: DeskFiling[] }) {
  const focus = useDesk((s) => s.focusTab);
  const close = useDesk((s) => s.closeTab);
  return (
    <nav className="-mb-px mt-4 flex gap-1 overflow-x-auto" aria-label="Dashboard tabs">
      <AnimatePresence initial={false}>
        {tabs.map((t) => {
          const { icon: Icon, label } = describe(t.spec, filings);
          const isActive = t.id === active;
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.25, ease }}
              className="relative"
            >
              <button
                onClick={() => focus(t.id)}
                className={cn(
                  'group flex items-center gap-2 rounded-t-lg px-3 py-2.5 text-[13px] whitespace-nowrap transition-colors',
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
              {isActive && (
                <motion.span
                  layoutId="tab-underline"
                  className="from-accent to-accent-2 absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-gradient-to-r"
                  transition={{ duration: 0.3, ease }}
                />
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
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
        <div className="border-line bg-panel text-muted rounded-2xl border p-10 text-center text-sm">
          The {view.view.replace(/_/g, ' ')} view is coming next.
        </div>
      );
  }
}
