import { z } from 'zod';
import { BlockStatus } from './blocks';
import { FilingStatus } from './filings';
import { ViewSpec } from './views';

// Server-sent events. Chat turns stream step/text/choice/view/done; the
// background stream carries extraction progress and block status changes.

export const StreamEvent = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('step'),
    id: z.string(),
    tool: z.string(),
    label: z.string(),
    state: z.enum(['running', 'done', 'failed']),
    summary: z.string().nullable(),
  }),
  z.object({type:z.literal('extraction_progress'),id:z.number().int(),projectId:z.string(),runId:z.string().nullable(),eventType:z.string(),data:z.record(z.string(),z.unknown())}),
  z.object({ type: z.literal('text'), delta: z.string() }),
  z.object({
    type: z.literal('choice'),
    id: z.string(),
    question: z.string(),
    options: z.array(z.string()),
  }),
  z.object({ type: z.literal('view'), spec: ViewSpec }),
  z.object({ type: z.literal('done'), messageId: z.string() }),
  z.object({ type: z.literal('error'), message: z.string() }),
  z.object({
    type: z.literal('extraction'),
    accession: z.string(),
    status: FilingStatus,
    sectionsDone: z.number().int(),
    sectionsTotal: z.number().int(),
    fixed: z.number().int(),
    review: z.number().int(),
  }),
  z.object({
    type: z.literal('block'),
    id: z.string(),
    status: BlockStatus,
  }),
]);
export type StreamEvent = z.infer<typeof StreamEvent>;
