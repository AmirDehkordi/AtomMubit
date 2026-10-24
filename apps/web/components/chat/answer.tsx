'use client';

import { FileText, Quote } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { DeskFiling } from '@/lib/api';

const CITATION = /\[\[(f|b):([^\]]+)\]\]/g;

/** Markdown answer with [[f:accession]] and [[b:block]] citations rendered as chips. */
export function Answer({ text, filings }: { text: string; filings: DeskFiling[] }) {
  const withLinks = text.replace(CITATION, (_m, kind: string, id: string) => `[${kind}:${id}](cite:${kind}:${id})`);
  return (
    <div className="answer text-[15px] leading-relaxed">
      <ReactMarkdown
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

function Citation({ kind, id, filings }: { kind: 'f' | 'b'; id: string; filings: DeskFiling[] }) {
  if (kind === 'b') {
    return (
      <span className="border-line text-muted mx-0.5 inline-flex items-center gap-1 rounded-md border px-1.5 py-px align-middle text-xs">
        <Quote className="size-3" /> passage
      </span>
    );
  }
  const filing = filings.find((f) => f.accession === id);
  const href = filing?.url ?? `https://www.sec.gov/edgar/search/#/q=%22${id}%22`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={id}
      className="border-line text-muted hover:border-accent hover:text-text mx-0.5 inline-flex items-center gap-1 rounded-md border px-1.5 py-px align-middle text-xs transition-colors"
    >
      <FileText className="size-3" />
      {filing ? `${filing.form} ${filing.quarter}` : 'SEC filing'}
    </a>
  );
}
