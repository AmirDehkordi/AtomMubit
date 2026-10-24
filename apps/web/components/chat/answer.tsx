'use client';

import { FileText, Quote } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api, type DeskFiling } from '@/lib/api';
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
  const sources = sourcesOf(text);
  const number = (kind: string, id: string) => sources.findIndex((s) => s.kind === kind && s.id === id) + 1;
  // Repeated markers in a row ("[[f:a]] [[f:b]] [[f:a]]") collapse to one each.
  const withLinks = text
    .replace(/(\[\[(?:f|b):[^\]]+\]\]\s*)+/g, (run) => {
      const ids = [...new Set([...run.matchAll(CITATION)].map((m) => `${m[1]}:${m[2]}`))];
      return ids.map((k) => `[${k}](cite:${k})`).join('') + (run.endsWith(' ') ? ' ' : '');
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
                const [, kind, id] = href.split(':');
                return <Marker n={number(kind!, id!)} kind={kind as 'f' | 'b'} id={id ?? ''} filings={filings} />;
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
      {showSources && sources.length > 0 && <Sources sources={sources} filings={filings} />}
    </div>
  );
}

function openSource(kind: 'f' | 'b', id: string, filings: DeskFiling[]) {
  if (kind === 'b') {
    void api
      .blocks([id])
      .then(([block]) => {
        if (block) useDesk.getState().showView({ view: 'filing_reader', accession: block.accession, sectionId: block.sectionId, highlight: [id] });
      })
      .catch(() => undefined);
    return;
  }
  if (filings.some((f) => f.accession === id)) {
    useDesk.getState().showView({ view: 'filing_reader', accession: id, sectionId: null, highlight: [] });
  } else {
    window.open(`https://www.sec.gov/edgar/search/#/q=%22${id}%22`, '_blank', 'noreferrer');
  }
}

function label(kind: 'f' | 'b', id: string, filings: DeskFiling[]): string {
  if (kind === 'b') return 'Passage';
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

function Sources({ sources, filings }: { sources: { kind: 'f' | 'b'; id: string }[]; filings: DeskFiling[] }) {
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {sources.map((s, i) => (
        <button
          key={`${s.kind}:${s.id}`}
          onClick={() => openSource(s.kind, s.id, filings)}
          className="border-line bg-panel text-muted hover:text-text hover:border-[color-mix(in_oklab,var(--color-text)_20%,transparent)] inline-flex items-center gap-2 rounded-lg border py-1 pr-2.5 pl-1 text-[12px] transition-colors"
        >
          <span className="bg-raised grid size-5 place-items-center rounded-md text-[10px] font-semibold">{i + 1}</span>
          {s.kind === 'b' ? <Quote className="size-3" /> : <FileText className="size-3" />}
          {label(s.kind, s.id, filings)}
        </button>
      ))}
    </div>
  );
}
