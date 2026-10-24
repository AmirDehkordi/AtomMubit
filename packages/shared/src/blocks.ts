import { z } from 'zod';

// The section_extractor task's output. Everything in ExtractorOutput is part of
// that Mubit task's fingerprint (via its JSON schema): change it only on purpose.
// Fields are nullable rather than optional because OpenAI strict mode needs
// every property to be required.

export const BLOCK_TYPES = ['metric', 'table', 'statement', 'guidance', 'risk', 'segment'] as const;
export const UNITS = ['USD', 'USD/share', 'shares', 'percent'] as const;
export const SCALES = ['units', 'thousands', 'millions', 'billions'] as const;

export const ExtractedBlock = z.strictObject({
  type: z.enum(BLOCK_TYPES),
  key: z.string().nullable(),
  label: z.string(),
  period: z
    .strictObject({
      end: z.string(),
      months: z.number().int().describe('Length of the period in months: 3, 6, 9 or 12'),
    })
    .nullable(),
  value: z.number().nullable(),
  unit: z.enum(UNITS).nullable(),
  scale: z.enum(SCALES).nullable(),
  text: z.string().nullable(),
  quote: z.string(),
});
export type ExtractedBlock = z.infer<typeof ExtractedBlock>;

export const ExtractorOutput = z.strictObject({
  blocks: z.array(ExtractedBlock),
});
export type ExtractorOutput = z.infer<typeof ExtractorOutput>;

/** What the extractor receives as its user message (JSON). */
export const ExtractorInput = z.object({
  company: z.object({ ticker: z.string(), name: z.string(), fiscalYearEnd: z.string() }),
  filing: z.object({
    form: z.string(),
    fiscalYear: z.number().int(),
    fiscalPeriod: z.string(),
    periodEnd: z.string(),
  }),
  section: z.object({
    id: z.string(),
    item: z.string(),
    title: z.string(),
    kind: z.enum(['text', 'table']),
  }),
  rules: z.array(z.string()),
  content: z.string(),
});
export type ExtractorInput = z.infer<typeof ExtractorInput>;

export const VERIFIERS = ['schema', 'quote', 'period', 'xbrl', 'arithmetic'] as const;
export const Verifier = z.enum(VERIFIERS);
export type Verifier = z.infer<typeof Verifier>;

export const BLOCK_STATUSES = ['verified', 'fixed', 'review', 'unchecked'] as const;
export const BlockStatus = z.enum(BLOCK_STATUSES);
export type BlockStatus = z.infer<typeof BlockStatus>;

export const Check = z.object({
  verifier: Verifier,
  passed: z.boolean(),
  detail: z.string(),
});
export type Check = z.infer<typeof Check>;

/** A stored block: the extractor's output plus where it came from and how it was checked. */
export const Block = ExtractedBlock.extend({
  id: z.string(),
  accession: z.string(),
  sectionId: z.string(),
  span: z.object({ start: z.number().int(), end: z.number().int() }).nullable(),
  status: BlockStatus,
  checks: z.array(Check),
});
export type Block = z.infer<typeof Block>;
