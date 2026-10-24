import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { METRICS, type MetricKey, type QuarterValue, type ViewSpec } from '@desk/shared';
import { DbService } from '../db/db.service';
import { views } from '../db/schema';
import { EdgarService } from '../edgar/edgar.service';
import { fiscalLabel, quarterName } from '../edgar/fiscal';
import { XbrlService } from '../xbrl/xbrl.service';

export const OVERVIEW_METRICS: MetricKey[] = [
  'revenue',
  'gross_profit',
  'operating_income',
  'net_income',
  'eps_diluted',
  'diluted_shares',
  'operating_cash_flow',
  'capex',
];

export interface Cell {
  value: number | null;
  method: QuarterValue['method'];
  approximate: boolean;
  restated: boolean;
  accessions: string[];
  note: string | null;
}

export interface OverviewRow {
  key: string;
  label: string;
  unit: string;
  kind: 'value' | 'margin';
  cells: Cell[];
}

export interface QuarterOverview {
  ticker: string;
  name: string;
  quarters: { periodEnd: string; quarter: string }[];
  rows: OverviewRow[];
}

export interface CompareRow {
  ticker: string;
  name: string;
  periodEnd: string;
  quarter: string;
  value: Cell;
  yearAgo: Cell;
  /** Change against the same quarter a year earlier, as a fraction (0.12 = +12%). */
  yoy: number | null;
}

export interface Comparison {
  metric: MetricKey;
  label: string;
  unit: string;
  rows: CompareRow[];
}

const MARGINS: { key: string; label: string; numerator: MetricKey }[] = [
  { key: 'gross_margin', label: 'Gross margin', numerator: 'gross_profit' },
  { key: 'operating_margin', label: 'Operating margin', numerator: 'operating_income' },
  { key: 'net_margin', label: 'Net margin', numerator: 'net_income' },
];

/**
 * The numbers behind the dashboard views, and the view the agent last chose.
 * All arithmetic happens here (margins, growth), never in the LLM.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly dbs: DbService,
    private readonly edgar: EdgarService,
    private readonly xbrl: XbrlService,
  ) {}

  /** Saves the view the agent chose. The chat stream tells the open page. */
  async show(projectId: string, spec: ViewSpec): Promise<void> {
    await this.dbs.db.insert(views).values({ id: randomUUID(), projectId, spec });
  }

  async current(projectId: string): Promise<ViewSpec | null> {
    const [row] = await this.dbs.db
      .select()
      .from(views)
      .where(eq(views.projectId, projectId))
      .orderBy(desc(views.createdAt))
      .limit(1);
    return row?.spec ?? null;
  }

  async quarterOverview(ticker: string, periods: string[]): Promise<QuarterOverview> {
    const sorted = [...periods].sort();
    const result = await this.xbrl.getMetrics({ ticker, metrics: OVERVIEW_METRICS, periodEnds: sorted });
    const byKey = new Map<string, QuarterValue>(result.values.map((v) => [`${v.metric}|${v.periodEnd}`, v]));
    const cell = (metric: MetricKey, periodEnd: string): Cell => toCell(byKey.get(`${metric}|${periodEnd}`));

    const rows: OverviewRow[] = OVERVIEW_METRICS.map((metric) => ({
      key: metric,
      label: METRICS[metric].label,
      unit: METRICS[metric].unit,
      kind: 'value',
      cells: sorted.map((p) => cell(metric, p)),
    }));
    for (const m of MARGINS) {
      rows.push({
        key: m.key,
        label: m.label,
        unit: 'percent',
        kind: 'margin',
        cells: sorted.map((p) => ratio(cell(m.numerator, p), cell('revenue', p))),
      });
    }
    return { ticker: result.company.ticker, name: result.company.name, quarters: result.periods, rows };
  }

  /** One metric across companies, each on its latest quarter (or the quarter ending `periodEnd`). */
  async compare(metric: MetricKey, tickers: string[], periodEnd: string | null): Promise<Comparison> {
    const rows = await Promise.all(
      tickers.map(async (ticker): Promise<CompareRow> => {
        const found = await this.edgar.findFilings({ ticker, forms: ['10-Q', '10-K'], lastNQuarters: 8, fiscalYear: null });
        const ends = found.filings.map((f) => f.periodEnd).sort().reverse();
        const end = periodEnd ?? ends[0];
        if (!end) throw new Error(`No quarterly filings for ${ticker}`);
        const yearAgo = ends.find((e) => e < end && Math.abs(daysApart(e, end) - 364) <= 14) ?? null;
        const metrics = await this.xbrl.getMetrics({ ticker, metrics: [metric], periodEnds: yearAgo ? [end, yearAgo] : [end] });
        const value = toCell(metrics.values.find((v) => v.periodEnd === end));
        const prior = toCell(yearAgo ? metrics.values.find((v) => v.periodEnd === yearAgo) : undefined);
        return {
          ticker: found.company.ticker,
          name: found.company.name,
          periodEnd: end,
          quarter: quarterName(fiscalLabel(end, found.company.fiscalYearEnd)),
          value,
          yearAgo: prior,
          yoy: value.value !== null && prior.value ? (value.value - prior.value) / Math.abs(prior.value) : null,
        };
      }),
    );
    return { metric, label: METRICS[metric].label, unit: METRICS[metric].unit, rows };
  }
}

function toCell(v: QuarterValue | undefined): Cell {
  return {
    value: v?.value ?? null,
    method: v?.method ?? null,
    approximate: v?.approximate ?? false,
    restated: v?.restated ?? false,
    accessions: v?.accessions ?? [],
    note: v?.note ?? null,
  };
}

function ratio(numerator: Cell, denominator: Cell): Cell {
  const ok = numerator.value !== null && denominator.value;
  return {
    value: ok ? numerator.value! / denominator.value! : null,
    method: ok ? 'computed' : null,
    approximate: false,
    restated: numerator.restated || denominator.restated,
    accessions: [...new Set([...numerator.accessions, ...denominator.accessions])],
    note: null,
  };
}

const daysApart = (a: string, b: string) =>
  Math.round((Date.parse(b) - Date.parse(a)) / (24 * 60 * 60 * 1000));
