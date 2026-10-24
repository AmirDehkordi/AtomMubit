import { z } from 'zod';

export const FORMS = ['10-Q', '10-K', '8-K'] as const;
export const Form = z.enum(FORMS);
export type Form = z.infer<typeof Form>;

export const FISCAL_PERIODS = ['Q1', 'Q2', 'Q3', 'Q4', 'FY'] as const;
export const FiscalPeriod = z.enum(FISCAL_PERIODS);
export type FiscalPeriod = z.infer<typeof FiscalPeriod>;

export const FILING_STATUSES = ['found', 'queued', 'reading', 'ready', 'failed'] as const;
export const FilingStatus = z.enum(FILING_STATUSES);
export type FilingStatus = z.infer<typeof FilingStatus>;

/** A filing as the agent and the UI see it. `accession` is the SEC filing ID. */
export const FilingRef = z.object({
  accession: z.string(),
  cik: z.number().int(),
  ticker: z.string(),
  form: Form,
  periodEnd: z.string(),
  fiscalYear: z.number().int(),
  fiscalPeriod: FiscalPeriod,
  filedAt: z.string(),
  url: z.string(),
  status: FilingStatus,
});
export type FilingRef = z.infer<typeof FilingRef>;
