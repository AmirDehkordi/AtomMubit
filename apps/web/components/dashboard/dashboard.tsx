'use client';

import { AlertTriangle, BarChart3, ChevronDown, ExternalLink, FileText, GitCompare, LayoutGrid, Loader2, Pin, ShieldCheck, TrendingUp, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
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

const ease = [0.22, 1, 0.36, 1] as const;

export function Dashboard({ filings, title, projectId }: { filings: DeskFiling[]; title: string; projectId: string }) {
  const tabs = useDesk((s) => s.tabs);
  const activeTab = useDesk((s) => s.activeTab);
  const active = tabs.find((t) => t.id === activeTab) ?? tabs[0];
  const ticker = filings[0]?.ticker ?? (active?.spec && 'ticker' in active.spec ? active.spec.ticker : null);
  const oneCompany = filings.length > 0 && filings.every((f) => f.ticker === filings[0]!.ticker);
  // A desk that only compares companies is titled by them, not by the question that opened it.
  const compare = !oneCompany && active?.spec.view === 'compare' ? active.spec : null;
  const heading = oneCompany
    ? companyName(filings[0]!.ticker, filings[0]!.company)
    : compare
      ? compare.tickers.map((t) => companyName(t)).join(' · ')
      : ticker && title.startsWith(`${ticker} · `)
        ? title.slice(ticker.length + 3)
        : title;
  const period = oneCompany ? [filings[0]!.quarter, filings[filings.length - 1]!.quarter].filter((q, i, a) => a.indexOf(q) === i).join(' – ') : null;

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
            {compare && (
              <p className="text-muted mt-0.5 text-xs">
                <span className="text-text">{metricLabel(compare.metric)}</span> · latest quarter vs a year earlier
              </p>
            )}
            {filings.length > 0 && (
              <div className="text-muted mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                {period && (
                  <>
                    <span className="text-text">{period}</span>
                    <span className="text-subtle">·</span>
                  </>
                )}
                <SourcesMenu filings={filings} />
              </div>
            )}
          </div>
        </div>
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
              <View view={active.spec} projectId={projectId} subject={oneCompany ? filings[0]!.ticker : undefined} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/**
 * The desk's filings behind one "4 sources" button under the title, with the XBRL check they were
 * read against. The button shows when any are still being read or couldn't be read.
 */
function SourcesMenu({ filings }: { filings: DeskFiling[] }) {
  const show = useDesk((s) => s.showView);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const several = new Set(filings.map((f) => f.ticker)).size > 1;
  const reading = filings.filter((f) => f.status !== 'ready' && f.status !== 'failed').length;
  const failed = filings.filter((f) => f.status === 'failed').length;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span ref={root} className="relative inline-flex">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="desk-sources"
        className={cn('hover:text-text inline-flex items-center gap-1.5 rounded-md px-1 -mx-1 transition-colors', open && 'text-text')}
      >
        <FileText className="size-3.5" />
        {filings.length} source{filings.length === 1 ? '' : 's'}
        {reading > 0 && (
          <span className="text-accent inline-flex items-center gap-1">
            · <Loader2 className="size-3 animate-spin" /> reading {reading}
          </span>
        )}
        {failed > 0 && <span className="text-down">· {failed} couldn&apos;t be read</span>}
        <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            id="desk-sources"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16, ease }}
            className="edge absolute top-full left-0 z-30 mt-2 w-[min(26rem,80vw)] rounded-xl p-1.5 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.7)]"
          >
            <p className="text-muted flex items-start gap-2 px-2 pt-1.5 pb-2 text-xs leading-relaxed">
              <ShieldCheck className="text-up mt-0.5 size-3.5 shrink-0" />
              Figures from SEC XBRL. Text quoted from these filings.
            </p>
            <ul>
              {filings.map((f) => (
                <li key={f.accession} className="group hover:bg-raised flex items-center gap-2.5 rounded-lg pr-1.5 transition-colors">
                  <button
                    onClick={() => {
                      setOpen(false);
                      show({ view: 'filing_reader', accession: f.accession, sectionId: null, highlight: [] });
                    }}
                    title={f.status === 'failed' ? "Couldn't be read" : 'Open in the reader'}
                    className="flex min-w-0 flex-1 items-center gap-2.5 py-2 pl-2.5 text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="text-text block text-[13px]">
                        {several && `${f.ticker} `}
                        {f.form} · {f.quarter}
                      </span>
                      <span className="text-subtle block text-[11px]">
                        ended {day(f.periodEnd)} · filed {day(f.filedAt)}
                      </span>
                    </span>
                    {f.status === 'failed' ? (
                      <AlertTriangle className="text-down size-3.5 shrink-0" aria-label="Couldn't be read" />
                    ) : f.status !== 'ready' ? (
                      <Loader2 className="text-accent size-3.5 shrink-0 animate-spin" aria-label="Still reading" />
                    ) : null}
                  </button>
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noreferrer"
                    title="Original on SEC"
                    aria-label={`${f.form} ${f.quarter} on SEC`}
                    className="text-subtle hover:text-text inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11px]"
                  >
                    SEC <ExternalLink className="size-3" />
                  </a>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}

/** "2025-10-26" → "26 Oct 2025". */
function day(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
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

function metricLabel(m: string): string {
  return (DESK_METRIC_KEYS as string[]).includes(m) ? metricInfo(m as DeskMetricKey).label : m.replace(/_/g, ' ');
}

function View({ view, projectId, subject }: { view: ViewSpec; projectId: string; subject?: string }) {
  switch (view.view) {
    case 'quarter_overview':
      return <QuarterOverview ticker={view.ticker} periods={view.periods} />;
    case 'metric_detail':
      return <MetricDetail ticker={view.ticker} metric={view.metric} periods={view.periods} />;
    case 'filing_reader':
      return <FilingReader accession={view.accession} sectionId={view.sectionId} highlight={view.highlight} projectId={projectId} />;
    case 'compare':
      return <CompareView metric={view.metric} tickers={view.tickers} periodEnd={view.periodEnd} subject={subject} />;
    default:
      return (
        <div className="surface text-muted rounded-2xl p-10 text-center text-sm">
          The {view.view.replace(/_/g, ' ')} view is coming next.
        </div>
      );
  }
}
