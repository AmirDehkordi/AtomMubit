import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { asc, desc, eq } from 'drizzle-orm';
import {
  MARGINS,
  MARGIN_KEYS,
  isMargin,
  metricInfo,
  type DeskMetricKey,
  type MetricKey,
  type QuarterValue,
  type ViewSpec,
} from '@desk/shared';
import { DbService } from '../db/db.service';
import { views } from '../db/schema';
import { EdgarService } from '../edgar/edgar.service';
import { fiscalLabel, quarterName } from '../edgar/fiscal';
import { XbrlService } from '../xbrl/xbrl.service';

export const OVERVIEW_METRICS: DeskMetricKey[] = [
  'revenue',
  'gross_profit',
  'operating_income',
  'net_income',
  'eps_diluted',
  'diluted_shares',
  'operating_cash_flow',
  'capex',
  ...MARGIN_KEYS,
];

export interface Cell {
  value: number | null;
  method: QuarterValue['method'];
  approximate: boolean;
  restated: boolean;
  accessions: string[];
  note: string | null;
}

export interface SeriesRow {
  key: DeskMetricKey;
  label: string;
  unit: string;
  kind: 'value' | 'margin';
  cells: Cell[];
}

export interface Series {
  ticker: string;
  name: string;
  quarters: { periodEnd: string; quarter: string }[];
  rows: SeriesRow[];
}

export interface CompareRow {
  ticker: string;
  name: string;
  periodEnd: string;
  quarter: string;
  value: Cell;
  yearAgo: Cell;
  /** Change against the same quarter a year earlier: a fraction for values (0.12 = +12%), points for margins. */
  yoy: number | null;
}

export interface Comparison {
  metric: DeskMetricKey;
  label: string;
  unit: string;
  rows: CompareRow[];
}

/**
 * The numbers behind the dashboard views and the agent's metric tools, and the
 * view the agent last chose. All arithmetic happens here (margins, growth),
 * never in the LLM.
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

  /** Every view the agent showed in this project, oldest first. */
  async history(projectId: string): Promise<ViewSpec[]> {
    const rows = await this.dbs.db.select().from(views).where(eq(views.projectId, projectId)).orderBy(asc(views.createdAt));
    return rows.map((r) => r.spec);
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

  /** Metrics (reported values and margins) for one company over quarters, oldest first. */
  async series(ticker: string, metrics: DeskMetricKey[], periods: string[]): Promise<Series> {
    const sorted = [...new Set(periods)].sort();
    const base = new Set<MetricKey>();
    for (const m of metrics) {
      if (isMargin(m)) {
        base.add(MARGINS[m].numerator);
        base.add('revenue');
      } else base.add(m);
    }
    const result = await this.xbrl.getMetrics({ ticker, metrics: [...base], periodEnds: sorted });
    const byKey = new Map<string, QuarterValue>(result.values.map((v) => [`${v.metric}|${v.periodEnd}`, v]));
    const cell = (metric: MetricKey, periodEnd: string): Cell => toCell(byKey.get(`${metric}|${periodEnd}`));

    const rows = metrics.map((key): SeriesRow => {
      const { label, unit } = metricInfo(key);
      const cells = sorted.map((p) =>
        isMargin(key) ? ratio(cell(MARGINS[key].numerator, p), cell('revenue', p)) : cell(key, p),
      );
      return { key, label, unit, kind: isMargin(key) ? 'margin' : 'value', cells };
    });
    const quarters = result.periods.slice().sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
    return { ticker: result.company.ticker, name: result.company.name, quarters, rows };
  }

  quarterOverview(ticker: string, periods: string[]): Promise<Series> {
    return this.series(ticker, OVERVIEW_METRICS, periods);
  }

  /** One metric across companies, each on its latest quarter (or the quarter ending `periodEnd`). */
  async compare(metric: DeskMetricKey, tickers: string[], periodEnd: string | null): Promise<Comparison> {
    const rows = await Promise.all(
      tickers.map(async (ticker): Promise<CompareRow> => {
        const found = await this.edgar.findFilings({ ticker, forms: ['10-Q', '10-K'], lastNQuarters: 8, fiscalYear: null });
        const ends = found.filings.map((f) => f.periodEnd).sort().reverse();
        const end = periodEnd ?? ends[0];
        if (!end) throw new Error(`No quarterly filings for ${ticker}`);
        const yearAgo = ends.find((e) => e < end && Math.abs(daysApart(e, end) - 364) <= 14) ?? null;
        const series = await this.series(ticker, [metric], yearAgo ? [yearAgo, end] : [end]);
        const cells = series.rows[0]!.cells;
        const value = cells[cells.length - 1]!;
        const prior = yearAgo ? cells[0]! : toCell(undefined);
        return {
          ticker: found.company.ticker,
          name: found.company.name,
          periodEnd: end,
          quarter: quarterName(fiscalLabel(end, found.company.fiscalYearEnd)),
          value,
          yearAgo: prior,
          yoy: change(value.value, prior.value, isMargin(metric)),
        };
      }),
    );
    const { label, unit } = metricInfo(metric);
    return { metric, label, unit, rows };
  }
}

/** A fraction for values (0.12 = +12%), or the difference in points for margins. */
export function change(now: number | null, before: number | null, points: boolean): number | null {
  if (now === null || before === null) return null;
  if (points) return now - before;
  return before === 0 ? null : (now - before) / Math.abs(before);
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
    note: ok ? 'Computed from reported figures ÷ revenue' : null,
  };
}

const daysApart = (a: string, b: string) =>
  Math.round((Date.parse(b) - Date.parse(a)) / (24 * 60 * 60 * 1000));
