'use client';

import { FileText, Loader2, Quote } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api, type DeskFiling } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useDesk } from '@/lib/desk-store';

const CITATION = /\[\[(f|b):([^\]]+)\]\]/g;
/** Characters revealed per animation frame while an answer "types" in. */
const CHARS_PER_FRAME = 4;

/** The answer as plain text (for copying): citations removed. */
export const plainAnswer = (text: string) => text.replace(CITATION, '').replace(/[ \t]+\n/g, '\n').trim();

/**
 * Reveals text progressively, like a streamed reply, then reports when it's done.
 * Partial citations ("[[f:00…") are held back until complete.
 */
export function useReveal(text: string, enabled: boolean, onDone?: () => void): string {
  const [shown, setShown] = useState(enabled ? 0 : text.length);
  const done = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  useEffect(() => {
    if (!enabled) {
      setShown(text.length);
      return;
    }
    done.current = false;
    let n = 0;
    let frame = 0;
    const tick = () => {
      n = Math.min(text.length, n + CHARS_PER_FRAME);
      setShown(n);
      if (n < text.length) {
        frame = requestAnimationFrame(tick);
      } else if (!done.current) {
        done.current = true;
        onDoneRef.current?.();
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [text, enabled]);
  if (shown >= text.length) return text;
  return text.slice(0, shown).replace(/\[\[[^\]]*\]?$/, '');
}

/** Every cited source in order of first mention. */
function sourcesOf(text: string): { kind: 'f' | 'b'; id: string }[] {
  const seen = new Map<string, { kind: 'f' | 'b'; id: string }>();
  for (const m of text.matchAll(CITATION)) {
    const key = `${m[1]}:${m[2]}`;
    if (!seen.has(key)) seen.set(key, { kind: m[1] as 'f' | 'b', id: m[2]! });
  }
  return [...seen.values()];
}

/**
 * Markdown answer. Citations become small numbered markers ([1], [2]) and, once the answer is
 * complete, a list of sources underneath, like a research assistant.
 */
export function Answer({ text, filings, showSources }: { text: string; filings: DeskFiling[]; showSources: boolean }) {
  // A filing on the desk keeps the number it has in the dashboard's Sources row, so [2] means the
  // same filing everywhere. Anything else (passages, other filings) is numbered after those.
  const cited = sourcesOf(text);
  const others = cited.filter((s) => !(s.kind === 'f' && filings.some((f) => f.accession === s.id)));
  const number = (kind: string, id: string) => {
    const onDesk = kind === 'f' ? filings.findIndex((f) => f.accession === id) : -1;
    return onDesk >= 0 ? onDesk + 1 : filings.length + others.findIndex((s) => s.kind === kind && s.id === id) + 1;
  };
  const sources = [...cited].sort((a, b) => number(a.kind, a.id) - number(b.kind, b.id));
  // Repeated markers in a row ("[[f:a]] [[f:b]] [[f:a]]") collapse to one each. Only spaces
  // between them are absorbed, never a newline, so a cited bullet doesn't swallow the next one.
  const withLinks = text
    .replace(/(\[\[(?:f|b):[^\]]+\]\][ \t]*)+/g, (run) => {
      const ids = [...new Set([...run.matchAll(CITATION)].map((m) => `${m[1]}:${m[2]}`))];
      return ids.map((k) => `[${k}](cite:${k})`).join('') + (/[ \t]$/.test(run) ? ' ' : '');
    });
  return (
    <div>
      <div className="answer text-[15px] leading-[1.75]">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          urlTransform={(url) => url}
          components={{
            a: ({ href, children }) => {
              if (href?.startsWith('cite:')) {
                // cite:<kind>:<id>, where the id itself may contain colons (p:<accession>:<n>)
                const kind = href.slice(5, 6) as 'f' | 'b';
                const id = href.slice(7);
                return <Marker n={number(kind, id)} kind={kind} id={id} filings={filings} />;
              }
              return (
                <a href={href} target="_blank" rel="noreferrer" className="text-accent underline-offset-2 hover:underline">
                  {children}
                </a>
              );
            },
          }}
        >
          {withLinks}
        </ReactMarkdown>
      </div>
      {showSources && sources.length > 0 && <Sources sources={sources} filings={filings} number={number} />}
    </div>
  );
}

function openSource(kind: 'f' | 'b', id: string, filings: DeskFiling[]) {
  if (kind === 'b') {
    // Open the tab now (a browser only allows it during the click), then point it at the passage.
    const tab = id.startsWith('p:') ? window.open('about:blank', '_blank') : null;
    void api
      .blocks([id])
      .then(([block]) => {
        if (!block) return tab?.close();
        if (block.sectionId) {
          useDesk.getState().showView({ view: 'filing_reader', accession: block.accession, sectionId: block.sectionId, highlight: [id] });
        } else if ('url' in block && tab) {
          // A text fragment scrolls the SEC document to the passage and highlights it.
          const words = block.quote.split('\n')[1] ?? block.quote;
          const fragment = encodeURIComponent(words.split(/\s+/).slice(0, 8).join(' '));
          tab.location.href = `${block.url}#:~:text=${fragment}`;
        }
      })
      .catch(() => tab?.close());
    return;
  }
  if (filings.some((f) => f.accession === id)) {
    useDesk.getState().showView({ view: 'filing_reader', accession: id, sectionId: null, highlight: [] });
  } else {
    window.open(`https://www.sec.gov/edgar/search/#/q=%22${id}%22`, '_blank', 'noreferrer');
  }
}

function label(kind: 'f' | 'b', id: string, filings: DeskFiling[]): string {
  if (kind === 'b') {
    const accession = /^p:(.+):\d+$/.exec(id)?.[1];
    if (!accession) return 'Passage';
    const f = filings.find((x) => x.accession === accession);
    return f ? `${f.ticker} ${f.form} · ${f.quarter} · text` : 'Earnings release · text';
  }
  const f = filings.find((x) => x.accession === id);
  return f ? `${f.ticker} ${f.form} · ${f.quarter}` : 'SEC filing';
}

function Marker({ n, kind, id, filings }: { n: number; kind: 'f' | 'b'; id: string; filings: DeskFiling[] }) {
  return (
    <button
      onClick={() => openSource(kind, id, filings)}
      title={label(kind, id, filings)}
      className="bg-raised text-muted hover:bg-accent hover:text-ink mx-[1px] inline-grid h-[17px] min-w-[17px] place-items-center rounded-[5px] px-1 align-[2px] text-[10px] font-semibold tabular-nums transition-colors"
    >
      {n}
    </button>
  );
}

function Sources({
  sources,
  filings,
  number,
}: {
  sources: { kind: 'f' | 'b'; id: string }[];
  filings: DeskFiling[];
  number: (kind: string, id: string) => number;
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {sources.map((s) => (
        <SourceChip
          key={`${s.kind}:${s.id}`}
          n={number(s.kind, s.id)}
          icon={s.kind === 'b' ? Quote : FileText}
          label={label(s.kind, s.id, filings)}
          onClick={() => openSource(s.kind, s.id, filings)}
        />
      ))}
    </div>
  );
}

/** One numbered source, used under answers and in the dashboard's Sources row so both read as citations. */
export function SourceChip({
  n,
  icon: Icon,
  label,
  onClick,
  title,
  iconClassName,
  busy = false,
  children,
}: {
  n: number;
  icon: typeof FileText;
  label: string;
  onClick: () => void;
  title?: string;
  iconClassName?: string;
  /** Still being read: the icon turns into a spinner. */
  busy?: boolean;
  /** Extra controls shown after the label, e.g. a link to the original. */
  children?: React.ReactNode;
}) {
  return (
    <span className="group bg-panel text-muted hover:text-text hover:bg-raised inline-flex items-center rounded-lg text-[12px] transition-colors">
      <button onClick={onClick} title={title} className="inline-flex items-center gap-2 py-1 pr-2.5 pl-1">
        <span className="bg-raised grid size-5 place-items-center rounded-md text-[10px] font-semibold tabular-nums transition-colors group-hover:bg-[color-mix(in_oklab,var(--color-text)_12%,transparent)]">
          {n}
        </span>
        {busy ? <Loader2 className="text-accent size-3 animate-spin" /> : <Icon className={cn('size-3', iconClassName)} />}
        {label}
      </button>
      {children}
    </span>
  );
}
