'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { api, type ProposedCorrection, type ReaderBlock } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useDesk } from '@/lib/desk-store';

/** Common mistakes, each pointing at the house rule that covers it. */
const REASONS: { label: string; rule: string | null }[] = [
  { label: 'Took a year-to-date column', rule: 'R3' },
  { label: 'Used adjusted (non-GAAP) EPS', rule: 'R1' },
  { label: 'Wrong scale (thousands vs millions)', rule: 'R5' },
  { label: 'Sign is wrong', rule: 'R6' },
  { label: 'Not total revenue', rule: 'R2' },
  { label: 'Made up a number', rule: 'R8' },
  { label: 'Something else', rule: null },
];

/**
 * Flag → propose → confirm. Proposing stores the correction and shows the rule and
 * the sections it will re-read; nothing changes until the person confirms.
 */
export function CorrectionFlow({ block, onClose }: { block: ReaderBlock; onClose: () => void }) {
  const client = useQueryClient();
  const [reason, setReason] = useState<(typeof REASONS)[number] | null>(null);
  const [note, setNote] = useState('');
  const [ruleText, setRuleText] = useState('');
  const [proposal, setProposal] = useState<ProposedCorrection | null>(null);

  const propose = useMutation({
    mutationFn: () =>
      api.proposeCorrection({
        blockId: block.id,
        projectId: useDesk.getState().projectId,
        note: note.trim() || reason?.label || '',
        ruleCode: reason?.rule ?? null,
        ruleText: reason?.rule ? null : ruleText.trim(),
      }),
    onSuccess: setProposal,
  });
  const apply = useMutation({
    mutationFn: () => api.applyCorrection(proposal!.correction.id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['section'] });
      void client.invalidateQueries({ queryKey: ['rules'] });
      onClose();
    },
  });
  const cancel = async () => {
    if (proposal) await api.dismissCorrection(proposal.correction.id).catch(() => undefined);
    void client.invalidateQueries({ queryKey: ['rules'] });
    onClose();
  };

  const field = 'border-line bg-panel focus:border-accent/60 w-full rounded-lg border px-2.5 py-1.5 text-xs outline-none';

  if (proposal) {
    const isNew = proposal.rule.source === 'user' && !proposal.rule.active;
    return (
      <div className="border-accent/40 bg-ink space-y-2 rounded-lg border p-2.5 text-xs">
        <p className="text-muted">The desk will learn this rule:</p>
        <p>
          <span className="text-accent font-semibold">{proposal.rule.code}</span>
          {isNew && <span className="text-muted"> (new)</span>} {proposal.rule.text}
        </p>
        <p className="text-muted">
          …and re-read {proposal.affected.length} section{proposal.affected.length === 1 ? '' : 's'} with it:
        </p>
        <ul className="text-muted list-disc pl-4">
          {proposal.affected.slice(0, 4).map((s) => (
            <li key={s.id}>
              {s.item} {s.title}
            </li>
          ))}
          {proposal.affected.length > 4 && <li>and {proposal.affected.length - 4} more</li>}
        </ul>
        {apply.error && <p className="text-down">{String(apply.error)}</p>}
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => apply.mutate()}
            disabled={apply.isPending}
            className="bg-accent text-ink inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-medium disabled:opacity-50"
          >
            {apply.isPending ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />} Teach the desk
          </button>
          <button onClick={cancel} className="border-line rounded-lg border px-2.5 py-1.5">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="border-down/40 bg-ink space-y-2 rounded-lg border p-2.5 text-xs"
      onSubmit={(e) => {
        e.preventDefault();
        propose.mutate();
      }}
    >
      <p className="font-medium">What&apos;s wrong with “{block.label}”?</p>
      <div className="flex flex-wrap gap-1.5">
        {REASONS.map((r) => (
          <button
            type="button"
            key={r.label}
            onClick={() => setReason(r)}
            className={cn(
              'rounded-full border px-2 py-0.5 transition-colors',
              reason === r ? 'border-accent text-text' : 'border-line text-muted hover:text-text',
            )}
          >
            {reason === r && <Check className="mr-1 inline size-3" />}
            {r.label}
          </button>
        ))}
      </div>
      <textarea
        className={field}
        rows={2}
        placeholder="In your words (optional), e.g. this is the nine-month figure"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      {reason && !reason.rule && (
        <textarea
          className={field}
          rows={2}
          placeholder="The rule the desk should follow from now on"
          value={ruleText}
          onChange={(e) => setRuleText(e.target.value)}
        />
      )}
      {propose.error && <p className="text-down">{String(propose.error)}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!reason || (!reason.rule && !ruleText.trim()) || propose.isPending}
          className="bg-accent text-ink rounded-lg px-2.5 py-1.5 font-medium disabled:opacity-40"
        >
          Next
        </button>
        <button type="button" onClick={onClose} className="border-line rounded-lg border px-2.5 py-1.5">
          Cancel
        </button>
      </div>
    </form>
  );
}
