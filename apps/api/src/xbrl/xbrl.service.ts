import { Injectable, Logger } from '@nestjs/common';
import { METRICS, type MetricKey, type QuarterValue } from '@desk/shared';
import { DbService } from '../db/db.service';
import { facts as factsTable } from '../db/schema';
import { EdgarClient, HOUR } from '../edgar/edgar.client';
import { EdgarService, type Company } from '../edgar/edgar.service';
import { fiscalLabel, quarterName } from '../edgar/fiscal';
import { ALL_CONCEPTS, CONCEPTS } from './concepts';
import { quarterFromFacts, type Fact } from './quarter-math';

const COMPANY_FACTS_URL = (cik: number) =>
  `https://data.sec.gov/api/xbrl/companyfacts/CIK${String(cik).padStart(10, '0')}.json`;
const FRESH_MS = 6 * HOUR;
const INSERT_BATCH = 500;

interface CompanyFactsJson {
  facts: Record<string, Record<string, { units: Record<string, RawFact[]> }>>;
}
interface RawFact {
  start?: string;
  end: string;
  val: number;
  accn: string;
  fy?: number;
  fp?: string;
  form: string;
  filed: string;
}

/** concept → unit → facts */
type FactIndex = Map<string, Map<string, Fact[]>>;

export interface MetricsResult {
  company: Company;
  periods: { periodEnd: string; quarter: string }[];
  values: QuarterValue[];
}

/**
 * Reported numbers from the SEC's XBRL data (companyfacts). This is the answer
 * key: the dashboard's headline numbers come from here, and the extraction
 * team's xbrl verifier compares extracted values against `quarterValue`.
 */
@Injectable()
export class XbrlService {
  private readonly logger = new Logger(XbrlService.name);
  private readonly cache = new Map<number, { at: number; index: FactIndex }>();

  constructor(
    private readonly edgar: EdgarClient,
    private readonly edgarService: EdgarService,
    private readonly dbs: DbService,
  ) {}

  /** Reported metrics for quarters. Values are in raw units (USD, USD per share, shares). */
  async getMetrics(args: { ticker: string; metrics: MetricKey[]; periodEnds: string[] }): Promise<MetricsResult> {
    const company = await this.edgarService.company(args.ticker);
    const index = await this.index(company.cik);
    const values = args.metrics.flatMap((metric) =>
      args.periodEnds.map((periodEnd) => resolveMetric(index, metric, periodEnd)),
    );
    const periods = args.periodEnds.map((periodEnd) => ({
      periodEnd,
      quarter: quarterName(fiscalLabel(periodEnd, company.fiscalYearEnd)),
    }));
    return { company, periods, values };
  }

  /** One metric for one quarter. Used by verifiers. */
  async quarterValue(cik: number, metric: MetricKey, periodEnd: string): Promise<QuarterValue> {
    return resolveMetric(await this.index(cik), metric, periodEnd);
  }

  private async index(cik: number): Promise<FactIndex> {
    const hit = this.cache.get(cik);
    if (hit && Date.now() - hit.at < FRESH_MS) return hit.index;
    const json = await this.edgar.json<CompanyFactsJson>(COMPANY_FACTS_URL(cik), FRESH_MS);
    const gaap = json.facts['us-gaap'] ?? {};
    const index: FactIndex = new Map();
    for (const concept of ALL_CONCEPTS) {
      const units = gaap[concept]?.units;
      if (!units) continue;
      index.set(
        concept,
        new Map(
          Object.entries(units).map(([unit, raw]) => [
            unit,
            raw.map((f) => ({
              start: f.start ?? null,
              end: f.end,
              val: f.val,
              accn: f.accn,
              form: f.form,
              filed: f.filed,
            })),
          ]),
        ),
      );
    }
    this.cache.set(cik, { at: Date.now(), index });
    await this.persist(cik, index);
    return index;
  }

  /** Copies the facts into the database so verifiers and SQL can use them. */
  private async persist(cik: number, index: FactIndex): Promise<void> {
    const rows = [...index].flatMap(([concept, units]) =>
      [...units].flatMap(([unit, list]) =>
        list.map((f) => ({
          id: [cik, concept, unit, f.start ?? '', f.end, f.accn].join('|'),
          cik,
          concept,
          unit,
          periodStart: f.start,
          periodEnd: f.end,
          value: f.val,
          form: f.form,
          accession: f.accn,
        })),
      ),
    );
    for (let i = 0; i < rows.length; i += INSERT_BATCH) {
      await this.dbs.db
        .insert(factsTable)
        .values(rows.slice(i, i + INSERT_BATCH))
        .onConflictDoNothing();
    }
    this.logger.log(`Stored ${rows.length} XBRL facts for CIK ${cik}`);
  }
}

function resolveMetric(index: FactIndex, metric: MetricKey, periodEnd: string): QuarterValue {
  const { concepts, unit } = CONCEPTS[metric];
  const empty: QuarterValue = {
    metric,
    periodEnd,
    value: null,
    unit,
    method: null,
    concepts: [],
    accessions: [],
    approximate: false,
    restated: false,
    note: 'Not in the XBRL data for this quarter',
  };

  for (const concept of concepts) {
    const list = index.get(concept)?.get(unit);
    if (!list) continue;
    const found = quarterFromFacts(list, periodEnd);
    if (!found) continue;
    if (found.method === 'derived' && METRICS[metric].kind === 'average') {
      // A weighted-average share count can't be derived by subtraction.
      return { ...empty, concepts: [concept], note: 'Only a full-year average is reported for this quarter' };
    }
    return {
      metric,
      periodEnd,
      value: found.value,
      unit,
      method: found.method,
      concepts: [concept],
      accessions: found.accessions,
      approximate: found.method === 'derived' && METRICS[metric].kind === 'per_share',
      restated: found.restated,
      note: found.note,
    };
  }

  if (metric === 'gross_profit') {
    const revenue = resolveMetric(index, 'revenue', periodEnd);
    const cost = resolveMetric(index, 'cost_of_revenue', periodEnd);
    if (revenue.value !== null && cost.value !== null) {
      return {
        ...empty,
        value: revenue.value - cost.value,
        method: 'computed',
        concepts: [...revenue.concepts, ...cost.concepts],
        accessions: [...new Set([...revenue.accessions, ...cost.accessions])],
        restated: revenue.restated || cost.restated,
        note: 'Revenue − cost of revenue',
      };
    }
  }
  return empty;
}
