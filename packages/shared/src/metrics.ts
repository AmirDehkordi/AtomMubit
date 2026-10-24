import { z } from 'zod';

// Headline metrics with a known meaning. The XBRL layer reports them, the
// extractor tags blocks with the same keys, and the xbrl verifier compares the two.
// Segment metrics use free keys of the form `segment.<name>.<metric>`.

export const METRICS = {
  revenue: { label: 'Revenue', unit: 'USD', kind: 'flow' },
  cost_of_revenue: { label: 'Cost of revenue', unit: 'USD', kind: 'flow' },
  gross_profit: { label: 'Gross profit', unit: 'USD', kind: 'flow' },
  research_and_development: { label: 'Research and development', unit: 'USD', kind: 'flow' },
  operating_income: { label: 'Operating income', unit: 'USD', kind: 'flow' },
  net_income: { label: 'Net income', unit: 'USD', kind: 'flow' },
  eps_diluted: { label: 'Diluted EPS (GAAP)', unit: 'USD/share', kind: 'per_share' },
  eps_basic: { label: 'Basic EPS (GAAP)', unit: 'USD/share', kind: 'per_share' },
  diluted_shares: { label: 'Diluted weighted-average shares', unit: 'shares', kind: 'average' },
  operating_cash_flow: { label: 'Cash from operations', unit: 'USD', kind: 'flow' },
  capex: { label: 'Capital expenditure', unit: 'USD', kind: 'flow' },
} as const;

export type MetricKey = keyof typeof METRICS;
export const METRIC_KEYS = Object.keys(METRICS) as MetricKey[];
export const MetricKey = z.enum(METRIC_KEYS as [MetricKey, ...MetricKey[]]);

/**
 * How a quarterly value was obtained.
 * - reported: a three-month fact in the filings
 * - derived: year-to-date minus the previous year-to-date (Q4 = full year − nine months)
 * - computed: from other metrics (gross profit = revenue − cost of revenue)
 */
export const VALUE_METHODS = ['reported', 'derived', 'computed'] as const;
export type ValueMethod = (typeof VALUE_METHODS)[number];

export interface QuarterValue {
  metric: MetricKey;
  periodEnd: string;
  /** Raw units: USD, USD per share, or shares (not millions). Null when not available. */
  value: number | null;
  unit: string;
  method: ValueMethod | null;
  /** XBRL concept(s) used. */
  concepts: string[];
  /** Filings the value came from (accession numbers). */
  accessions: string[];
  /** True for per-share values derived by subtraction, which are close but not exact. */
  approximate: boolean;
  /** True when a later filing reported a different value for the same period. */
  restated: boolean;
  note: string | null;
}

/** Margins: a reported metric divided by revenue. Computed in code, never by the model. */
export const MARGINS = {
  gross_margin: { label: 'Gross margin', numerator: 'gross_profit' },
  operating_margin: { label: 'Operating margin', numerator: 'operating_income' },
  net_margin: { label: 'Net margin', numerator: 'net_income' },
} as const satisfies Record<string, { label: string; numerator: MetricKey }>;

export type MarginKey = keyof typeof MARGINS;
export const MARGIN_KEYS = Object.keys(MARGINS) as MarginKey[];

/** Anything the agent can ask for: a reported metric or a margin. */
export type DeskMetricKey = MetricKey | MarginKey;
export const DESK_METRIC_KEYS: DeskMetricKey[] = [...METRIC_KEYS, ...MARGIN_KEYS];
export const DeskMetricKey = z.enum(DESK_METRIC_KEYS as [DeskMetricKey, ...DeskMetricKey[]]);

export const isMargin = (key: string): key is MarginKey => key in MARGINS;

export function metricInfo(key: DeskMetricKey): { label: string; unit: string } {
  return isMargin(key) ? { label: MARGINS[key].label, unit: 'percent' } : METRICS[key];
}
