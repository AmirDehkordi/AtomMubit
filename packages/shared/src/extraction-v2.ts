import { z } from 'zod';
import { ExtractedBlock } from './blocks';

export const DEFAULT_EXTRACTION_FIELDS = ['revenue', 'net_income', 'eps_diluted'] as const;
export const FactPeriodV2 = z.strictObject({
  start: z.string().nullable(), end: z.string(), months: z.union([z.literal(3), z.literal(6), z.literal(9), z.literal(12)]),
  fiscalYear: z.number().int().nullable(), fiscalPeriod: z.string().nullable(),
});
export const ExtractionFactV2 = z.strictObject({
  key: z.string().min(1), label: z.string().min(1), basis: z.enum(['GAAP', 'non-GAAP', 'unknown']),
  currency: z.string().nullable(), period: FactPeriodV2.nullable(),
  value: z.number().nullable(), range: z.strictObject({ low: z.number(), high: z.number() }).nullable(),
  unit: z.string().nullable(), scale: z.enum(['units', 'thousands', 'millions', 'billions']).nullable(),
  qualifier: z.string().nullable(), missingReason: z.string().min(1).nullable(), quote: z.string(),
});
export type ExtractionFactV2 = z.infer<typeof ExtractionFactV2>;
export const SectionExtractionV2 = z.strictObject({
  schemaVersion: z.literal('2'), blocks: z.array(ExtractedBlock), facts: z.array(ExtractionFactV2),
});
export type SectionExtractionV2 = z.infer<typeof SectionExtractionV2>;
export type EvidenceSpanV2 = { start: number; end: number; offsetUnit: 'utf16' };
export type VerificationOutcomeV2 = 'pass' | 'fail' | 'unknown' | 'not-applicable';
export type FactCheckV2 = { verifier: 'schema' | 'quote' | 'period' | 'xbrl' | 'arithmetic'; outcome: VerificationOutcomeV2; detail: string };
