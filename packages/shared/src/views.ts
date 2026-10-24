import { z } from 'zod';

// What the agent puts on the dashboard (show_on_dashboard). The agent only
// chooses a view and fills in its fields; the web app owns the layout.

const Ticker = z.string().describe('Ticker symbol, e.g. NVDA');
const PeriodEnds = z.array(z.string()).describe('Quarter end dates (YYYY-MM-DD), oldest first');

export const ViewSpec = z.discriminatedUnion('view', [
  z.strictObject({
    view: z.literal('quarter_overview'),
    ticker: Ticker,
    periods: PeriodEnds,
  }),
  z.strictObject({
    view: z.literal('metric_detail'),
    ticker: Ticker,
    metric: z.string().describe('Metric key, e.g. revenue or segment.data_center.revenue'),
    periods: PeriodEnds,
    highlight: z.array(z.string()).describe('Block IDs to highlight'),
  }),
  z.strictObject({
    view: z.literal('segment_breakdown'),
    ticker: Ticker,
    periods: PeriodEnds,
  }),
  z.strictObject({
    view: z.literal('filing_reader'),
    accession: z.string(),
    sectionId: z.string().nullable(),
    highlight: z.array(z.string()).describe('Block IDs to highlight'),
  }),
  z.strictObject({
    view: z.literal('compare'),
    metric: z.string(),
    tickers: z.array(Ticker),
    periodEnd: z.string().nullable().describe('Null for each company’s latest quarter'),
  }),
  z.strictObject({
    view: z.literal('guidance'),
    ticker: Ticker,
  }),
  z.strictObject({
    view: z.literal('risk_diff'),
    ticker: Ticker,
  }),
]);
export type ViewSpec = z.infer<typeof ViewSpec>;
export type ViewName = ViewSpec['view'];
