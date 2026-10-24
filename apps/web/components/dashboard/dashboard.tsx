'use client';

import { AlertTriangle, BarChart3, ExternalLink, FileText, GitCompare, LayoutGrid, Pin, ShieldCheck, TrendingUp, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { DESK_METRIC_KEYS, metricInfo, type DeskMetricKey, type ViewSpec } from '@desk/shared';
import type { DeskFiling } from '@/lib/api';
import { cn } from '@/lib/cn';
import { companyName } from '@/lib/company';
import { useDesk, type DeskTab } from '@/lib/desk-store';
import { Monogram } from '../ui/monogram';
import { CompareView } from './compare-view';
import { FilingReader } from './filing-reader';
import { MetricDetail } from './metric-detail';
import { QuarterOverview } from './quarter-overview';
import { SourceChip } from '../chat/answer';

const ease = [0.22, 1, 0.36, 1] as const;

export function Dashboard({ filings, title, projectId }: { filings: DeskFiling[]; title: string; projectId: string }) {
  const tabs = useDesk((s) => s.tabs);
  const activeTab = useDesk((s) => s.activeTab);
  const active = tabs.find((t) => t.id === activeTab) ?? tabs[0];
  const ticker = filings[0]?.ticker ?? (active?.spec && 'ticker' in active.spec ? active.spec.ticker : null);
  const oneCompany = filings.length > 0 && filings.every((f) => f.ticker === filings[0]!.ticker);
  const heading = oneCompany ? companyName(filings[0]!.ticker, filings[0]!.company) : ticker && title.startsWith(`${ticker} · `) ? title.slice(ticker.length + 3) : title;
  const period = oneCompany ? [filings[0]!.quarter, filings[filings.length - 1]!.quarter].filter((q, i, a) => a.indexOf(q) === i).join(' – ') : null;
  const failed = filings.filter((f) => f.status === 'failed').length;

  return (
    <div className="@container relative flex h-full flex-col">
      <header className="relative px-5 pt-4 pb-4 @3xl:px-8">
        <div className="flex items-center gap-3">
          {ticker && <Monogram ticker={ticker} size="md" />}
          <div className="min-w-0 flex-1">
            <motion.h1
              key={heading}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease }}
              className="truncate text-[17px] leading-tight font-semibold tracking-[-0.01em]"
            >
              {heading}
            </motion.h1>
            {filings.length > 0 && (
              <p className="text-muted mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                {period && (
                  <>
                    <span className="text-text">{period}</span>
                    <span className="text-subtle">·</span>
                  </>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="text-up size-3.5" /> Checked against SEC XBRL
                </span>
                {failed > 0 && (
                  <>
                    <span className="text-subtle">·</span>
                    <span className="text-down inline-flex items-center gap-1.5">
                      <AlertTriangle className="size-3" /> {failed} couldn&apos;t be read
                    </span>
                  </>
                )}
              </p>
            )}
          </div>
        </div>
        {filings.length > 0 && <FilingStrip filings={filings} />}
        <TabBar tabs={tabs} active={active?.id ?? null} filings={filings} />
      </header>
      <div className="relative min-h-0 flex-1 overflow-y-auto px-5 pt-2 pb-8 @3xl:px-8">
        <AnimatePresence mode="wait">
          {active && (
            <motion.div
              key={active.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.28, ease }}
            >
              <View view={active.spec} projectId={projectId} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/** The desk's filings as numbered sources, the same chips and numbers the chat cites with. */
function FilingStrip({ filings }: { filings: DeskFiling[] }) {
  const show = useDesk((s) => s.showView);
  const several = new Set(filings.map((f) => f.ticker)).size > 1;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-1.5">
      <span className="text-subtle mr-1 text-xs">Sources</span>
      {filings.map((f, i) => (
        <SourceChip
          key={f.accession}
          n={i + 1}
          icon={f.status === 'failed' ? AlertTriangle : FileText}
          iconClassName={f.status === 'failed' ? 'text-down' : undefined}
          label={`${several ? `${f.ticker} ` : ''}${f.form} · ${f.quarter}`}
          title={f.status === 'ready' ? 'Open in the reader' : f.status === 'failed' ? "Couldn't be read" : 'Still reading this filing'}
          busy={f.status !== 'ready' && f.status !== 'failed'}
          onClick={() => show({ view: 'filing_reader', accession: f.accession, sectionId: null, highlight: [] })}
        >
          <a
            href={f.url}
            target="_blank"
            rel="noreferrer"
            title="Original on SEC"
            aria-label="Original on SEC"
            className="-ml-1.5 pr-2 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
          >
            <ExternalLink className="text-subtle hover:text-text size-3" />
          </a>
        </SourceChip>
      ))}
    </div>
  );
}

function TabBar({ tabs, active, filings }: { tabs: DeskTab[]; active: string | null; filings: DeskFiling[] }) {
  const focus = useDesk((s) => s.focusTab);
  const close = useDesk((s) => s.closeTab);
  if (tabs.length < 2) return null;
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

function View({ view, projectId }: { view: ViewSpec; projectId: string }) {
  switch (view.view) {
    case 'quarter_overview':
      return <QuarterOverview ticker={view.ticker} periods={view.periods} />;
    case 'metric_detail':
      return <MetricDetail ticker={view.ticker} metric={view.metric} periods={view.periods} />;
    case 'filing_reader':
      return <FilingReader accession={view.accession} sectionId={view.sectionId} highlight={view.highlight} projectId={projectId} />;
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
