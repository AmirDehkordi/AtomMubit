'use client';

import { FileText, Quote } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api, type DeskFiling } from '@/lib/api';
import { useDesk } from '@/lib/desk-store';

const CITATION = /\[\[(f|b):([^\]]+)\]\]/g;
/** Characters revealed per animation frame while an answer "types" in. */
const CHARS_PER_FRAME = 9;

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

/** Markdown answer with [[f:accession]] and [[b:block]] citations rendered as chips. */
export function Answer({ text, filings }: { text: string; filings: DeskFiling[] }) {
  const withLinks = text.replace(CITATION, (_m, kind: string, id: string) => `[${kind}:${id}](cite:${kind}:${id})`);
  return (
    <div className="answer text-[15px] leading-[1.7]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={(url) => url}
        components={{
          a: ({ href, children }) => {
            if (href?.startsWith('cite:')) {
              const [, kind, id] = href.split(':');
              return <Citation kind={kind as 'f' | 'b'} id={id ?? ''} filings={filings} />;
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
  );
}

const chip =
  'border-line bg-raised text-muted hover:text-text hover:border-[color-mix(in_oklab,var(--color-text)_25%,transparent)] mx-0.5 inline-flex items-center gap-1 rounded-md border px-1.5 py-px align-[1px] text-[11px] font-medium transition-colors';

function Citation({ kind, id, filings }: { kind: 'f' | 'b'; id: string; filings: DeskFiling[] }) {
  if (kind === 'b') {
    // Opens the filing reader on the cited passage.
    const open = async () => {
      const [block] = await api.blocks([id]).catch(() => []);
      if (!block) return;
      useDesk.getState().showView({ view: 'filing_reader', accession: block.accession, sectionId: block.sectionId, highlight: [id] });
    };
    return (
      <button onClick={open} title="Open the passage" className={chip}>
        <Quote className="size-3" /> passage
      </button>
    );
  }
  const filing = filings.find((f) => f.accession === id);
  const open = () => {
    if (filing) useDesk.getState().showView({ view: 'filing_reader', accession: id, sectionId: null, highlight: [] });
    else window.open(`https://www.sec.gov/edgar/search/#/q=%22${id}%22`, '_blank', 'noreferrer');
  };
  return (
    <button onClick={open} title={id} className={chip}>
      <FileText className="size-3" />
      {filing ? `${filing.form} ${filing.quarter}` : 'SEC filing'}
    </button>
  );
}
