'use client';

import { FileText, Quote } from 'lucide-react';
import { motion } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { api, type DeskFiling } from '@/lib/api';
import { useDesk } from '@/lib/desk-store';

const CITATION = /\[\[(f|b):([^\]]+)\]\]/g;

/** Markdown answer with [[f:accession]] and [[b:block]] citations rendered as chips. Fades in when it arrives. */
export function Answer({ text, filings, animate }: { text: string; filings: DeskFiling[]; animate: boolean }) {
  const withLinks = text.replace(CITATION, (_m, kind: string, id: string) => `[${kind}:${id}](cite:${kind}:${id})`);
  return (
    <motion.div
      className="answer text-[15px] leading-[1.7] text-[color-mix(in_oklab,var(--color-text)_88%,transparent)]"
      initial={animate ? { opacity: 0, y: 6, filter: 'blur(4px)' } : false}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
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
    </motion.div>
  );
}

const chip =
  'border-line bg-raised text-muted hover:border-accent/50 hover:text-text mx-0.5 inline-flex items-center gap-1 rounded-md border px-1.5 py-px align-[1px] text-[11px] font-medium transition-colors';

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
