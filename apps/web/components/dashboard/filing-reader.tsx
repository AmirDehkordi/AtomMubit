'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ExternalLink, FileText, Wrench } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatValue } from '@desk/shared';
import { api, type ReaderBlock } from '@/lib/api';
import { cn } from '@/lib/cn';

const STATUS = {
  verified: { label: 'Verified', icon: CheckCircle2, mark: 'decoration-up', text: 'text-up' },
  fixed: { label: 'Fixed after a re-read', icon: Wrench, mark: 'decoration-accent', text: 'text-accent' },
  review: { label: 'Needs review', icon: AlertTriangle, mark: 'decoration-down', text: 'text-down' },
  unchecked: { label: 'Not checked', icon: FileText, mark: 'decoration-muted', text: 'text-muted' },
} as const;

/** A filing as the desk read it: its sections, the text, and every extracted block highlighted in place. */
export function FilingReader({
  accession,
  sectionId,
  highlight,
}: {
  accession: string;
  sectionId: string | null;
  highlight: string[];
}) {
  const outline = useQuery({ queryKey: ['outline', accession], queryFn: () => api.outline(accession) });
  const [chosen, setChosen] = useState<string | null>(sectionId);
  useEffect(() => setChosen(sectionId), [sectionId]);
  const current = chosen ?? outline.data?.sections[0]?.id ?? null;

  if (outline.isLoading) return <div className="border-line bg-panel h-96 animate-pulse rounded-xl border" />;
  if (outline.error || !outline.data) return <p className="text-down text-sm">Could not load the filing: {String(outline.error)}</p>;
  const { filing, sections } = outline.data;

  return (
    <div className="border-line bg-panel flex min-h-[32rem] overflow-hidden rounded-xl border">
      <nav className="border-line w-56 shrink-0 overflow-y-auto border-r p-3">
        <div className="mb-3 px-1">
          <p className="text-sm font-semibold">
            {filing.ticker} {filing.form}
          </p>
          <p className="text-muted text-xs">{filing.quarter}</p>
          <a href={filing.url} target="_blank" rel="noreferrer" className="text-accent mt-1 inline-flex items-center gap-1 text-xs hover:underline">
            Original on SEC <ExternalLink className="size-3" />
          </a>
        </div>
        {sections.length === 0 && <p className="text-muted px-1 text-xs">Nothing read yet.</p>}
        <ul className="space-y-0.5">
          {sections.map((s) => (
            <li key={s.id}>
              <button
                onClick={() => setChosen(s.id)}
                className={cn(
                  'w-full rounded-lg px-2 py-1.5 text-left text-xs transition-colors',
                  s.id === current ? 'bg-ink text-text' : 'text-muted hover:text-text',
                )}
              >
                <span className="block truncate">
                  <span className="text-muted">{s.item}</span> {s.title}
                </span>
                <span className="text-muted">
                  {s.blocks} block{s.blocks === 1 ? '' : 's'}
                  {s.review > 0 && <span className="text-down"> · {s.review} to review</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
      {current ? (
        <SectionView key={current} sectionId={current} highlight={highlight} />
      ) : (
        <div className="text-muted grid flex-1 place-items-center p-8 text-center text-sm">
          The desk hasn&apos;t read this filing yet. Its numbers on the overview come from the SEC&apos;s XBRL data.
        </div>
      )}
    </div>
  );
}

function SectionView({ sectionId, highlight }: { sectionId: string; highlight: string[] }) {
  const { data, error, isLoading } = useQuery({ queryKey: ['section', sectionId], queryFn: () => api.section(sectionId) });
  const [selected, setSelected] = useState<string | null>(highlight[0] ?? null);
  const textRef = useRef<HTMLDivElement>(null);
  const focus = useMemo(() => new Set(selected ? [selected, ...highlight] : highlight), [selected, highlight]);

  useEffect(() => {
    const id = selected ?? highlight[0];
    if (!id || !data) return;
    textRef.current?.querySelector(`[data-block="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [selected, highlight, data]);

  if (isLoading) return <div className="flex-1 animate-pulse" />;
  if (error || !data) return <p className="text-down flex-1 p-4 text-sm">Could not load the section: {String(error)}</p>;

  return (
    <>
      <div ref={textRef} className="min-w-0 flex-1 overflow-y-auto p-5">
        <h3 className="mb-3 font-semibold">
          <span className="text-muted">{data.section.item}</span> {data.section.title}
        </h3>
        <div className="text-[14px] leading-relaxed whitespace-pre-wrap">
          {segments(data.section.text, data.blocks).map((seg, i) =>
            seg.block ? (
              <mark
                key={i}
                data-block={seg.block.id}
                onClick={() => setSelected(seg.block!.id)}
                className={cn(
                  'text-text cursor-pointer rounded-sm bg-transparent underline decoration-2 underline-offset-4',
                  STATUS[seg.block.status].mark,
                  focus.has(seg.block.id) && 'bg-accent/25 ring-accent/60 ring-1',
                )}
              >
                {seg.text}
              </mark>
            ) : (
              <span key={i}>{seg.text}</span>
            ),
          )}
        </div>
      </div>
      <aside className="border-line w-72 shrink-0 overflow-y-auto border-l p-3">
        <p className="text-muted mb-2 px-1 text-xs tracking-wide uppercase">{data.blocks.length} extracted</p>
        <ul className="space-y-2">
          {data.blocks.map((b) => (
            <BlockCard key={b.id} block={b} active={focus.has(b.id)} onClick={() => setSelected(b.id)} />
          ))}
        </ul>
      </aside>
    </>
  );
}

function BlockCard({ block, active, onClick }: { block: ReaderBlock; active: boolean; onClick: () => void }) {
  const status = STATUS[block.status];
  const Icon = status.icon;
  const failed = block.checks.filter((c) => !c.passed);
  return (
    <li>
      <button
        onClick={onClick}
        className={cn(
          'bg-ink w-full rounded-lg border p-2.5 text-left text-xs transition-colors',
          active ? 'border-accent/60' : 'border-line hover:border-accent/30',
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-medium">{block.label}</span>
          <Icon className={cn('size-3.5 shrink-0', status.text)} aria-label={status.label} />
        </div>
        {block.value !== null && <p className="mt-1 text-sm font-semibold tabular-nums">{blockValue(block)}</p>}
        {block.text && <p className="text-muted mt-1 line-clamp-3">{block.text}</p>}
        <p className="text-muted mt-1">
          {block.type}
          {block.periodEnd && ` · ${block.months ?? '?'}m to ${block.periodEnd}`}
        </p>
        {failed.map((c) => (
          <p key={c.verifier} className="text-down mt-1">
            {c.verifier}: {c.detail}
          </p>
        ))}
      </button>
    </li>
  );
}

const SCALE: Record<string, number> = { units: 1, thousands: 1e3, millions: 1e6, billions: 1e9 };

function blockValue(b: ReaderBlock): string {
  if (b.value === null) return '';
  if (b.unit === 'percent') return `${b.value}%`;
  const raw = b.value * (b.unit === 'USD/share' ? 1 : (SCALE[b.scale ?? 'units'] ?? 1));
  return formatValue(raw, b.unit ?? '');
}

/** Splits the text into plain runs and runs covered by a block's span (overlapping spans are skipped). */
function segments(text: string, blocks: ReaderBlock[]): { text: string; block?: ReaderBlock }[] {
  const spans = blocks
    .filter((b) => b.spanStart !== null && b.spanEnd !== null && b.spanEnd > b.spanStart)
    .sort((a, b) => a.spanStart! - b.spanStart!);
  const out: { text: string; block?: ReaderBlock }[] = [];
  let at = 0;
  for (const b of spans) {
    if (b.spanStart! < at) continue;
    if (b.spanStart! > at) out.push({ text: text.slice(at, b.spanStart!) });
    out.push({ text: text.slice(b.spanStart!, b.spanEnd!), block: b });
    at = b.spanEnd!;
  }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
}
