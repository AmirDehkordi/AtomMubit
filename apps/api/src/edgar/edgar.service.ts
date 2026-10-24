import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { FilingRef, ToolArgs } from '@desk/shared';
import { DbService } from '../db/db.service';
import { companies, filings } from '../db/schema';
import { EdgarClient, EdgarError, FOREVER, HOUR } from './edgar.client';
import { fiscalLabel, fiscalPeriodFor, isNextQuarter, quarterName, releaseLabel } from './fiscal';

const TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json';
const SUBMISSIONS_URL = (cik: number) =>
  `https://data.sec.gov/submissions/CIK${String(cik).padStart(10, '0')}.json`;
const SUBMISSIONS_PAGE_URL = (name: string) => `https://data.sec.gov/submissions/${name}`;

export interface Company {
  cik: number;
  ticker: string;
  name: string;
  /** MM-DD as the SEC gives it without the dash, e.g. "0125". */
  fiscalYearEnd: string;
}

export interface FoundFiling extends FilingRef {
  /** "Q2 FY2027"; a 10-K shows as "Q4 FY2026"; an 8-K shows the quarter its release reports on. */
  quarter: string;
  /** 8-K items, e.g. ["2.02", "9.01"]. Empty for 10-Q and 10-K. */
  items: string[];
}

export interface FindFilingsResult {
  company: Company;
  filings: FoundFiling[];
  /** Gaps, missing quarters, and other things the agent should tell the user. */
  warnings: string[];
}

interface FilingColumns {
  accessionNumber: string[];
  filingDate: string[];
  reportDate: string[];
  form: string[];
  primaryDocument: string[];
  items: string[];
}

interface Submissions {
  cik: string;
  name: string;
  tickers: string[];
  fiscalYearEnd: string | null;
  filings: { recent: FilingColumns; files: { name: string; filingTo: string }[] };
}

interface Row {
  accession: string;
  filedAt: string;
  reportDate: string;
  form: string;
  primaryDocument: string;
  items: string[];
}

const DEFAULT_QUARTERS = 4;
const QUARTERLY_FORMS = new Set(['10-Q', '10-K']);

@Injectable()
export class EdgarService {
  private tickers: Map<string, { cik: number; name: string }> | null = null;

  constructor(
    private readonly edgar: EdgarClient,
    private readonly dbs: DbService,
  ) {}

  /** Ticker → company, from the SEC's ticker list and the company's submissions. */
  async company(ticker: string): Promise<Company> {
    const entry = (await this.tickerMap()).get(normalizeTicker(ticker));
    if (!entry) throw new EdgarError(`No SEC registrant found for ticker "${ticker}"`, 404);
    const subs = await this.submissions(entry.cik);
    if (!subs.fiscalYearEnd) throw new EdgarError(`${ticker} has no fiscal year end on file`, null);
    const company: Company = {
      cik: entry.cik,
      ticker: normalizeTicker(ticker),
      name: subs.name,
      fiscalYearEnd: subs.fiscalYearEnd,
    };
    await this.dbs.db
      .insert(companies)
      .values({ ...company, fiscalYearEnd: dashed(company.fiscalYearEnd) })
      .onConflictDoUpdate({
        target: companies.cik,
        set: { ticker: company.ticker, name: company.name, fiscalYearEnd: dashed(company.fiscalYearEnd) },
      });
    return company;
  }

  /**
   * The find_filings tool. 10-Q and 10-K: the latest N quarters (a 10-K stands for Q4), or every
   * quarter of one fiscal year. 8-K: earnings releases only (Item 2.02). Amendments are skipped.
   */
  async findFilings(args: ToolArgs<'find_filings'>): Promise<FindFilingsResult> {
    const company = await this.company(args.ticker);
    const forms = args.forms.length ? args.forms : ['10-Q', '10-K'];
    const wantQuarterly = forms.filter((f) => QUARTERLY_FORMS.has(f));
    const wantReleases = forms.includes('8-K');
    const lastN = args.lastNQuarters ?? (args.fiscalYear === null ? DEFAULT_QUARTERS : null);

    const rows = await this.filingRows(company.cik, (all) => {
      const quarterly = pickQuarterly(all, wantQuarterly, company, lastN, args.fiscalYear);
      return lastN === null || quarterly.length >= lastN;
    });

    const warnings: string[] = [];
    const quarterly = pickQuarterly(rows, wantQuarterly, company, lastN, args.fiscalYear);
    const releases = wantReleases
      ? pickReleases(rows, company, lastN ?? DEFAULT_QUARTERS, args.fiscalYear)
      : [];

    if (wantQuarterly.length && lastN !== null && quarterly.length < lastN) {
      warnings.push(`Only ${quarterly.length} of ${lastN} quarters are on file for ${company.ticker}.`);
    }
    const ordered = [...quarterly].sort((a, b) => a.reportDate.localeCompare(b.reportDate));
    for (let i = 1; i < ordered.length; i++) {
      const prev = ordered[i - 1]!;
      const next = ordered[i]!;
      if (!isNextQuarter(prev.reportDate, next.reportDate)) {
        warnings.push(`Gap between the quarters ending ${prev.reportDate} and ${next.reportDate}.`);
      }
    }

    const found = [...quarterly, ...releases].map((r) => toFound(r, company));
    await this.saveFilings(found);
    return { company, filings: found, warnings };
  }

  /** One filing by accession number, from the database (it must have been found first). */
  async filing(accession: string) {
    const [row] = await this.dbs.db.select().from(filings).where(sql`${filings.accession} = ${accession}`);
    return row ?? null;
  }

  private async saveFilings(found: FoundFiling[]): Promise<void> {
    if (!found.length) return;
    await this.dbs.db
      .insert(filings)
      .values(
        found.map((f) => ({
          accession: f.accession,
          cik: f.cik,
          form: f.form,
          periodEnd: f.periodEnd,
          fiscalYear: f.fiscalYear,
          fiscalPeriod: f.fiscalPeriod,
          filedAt: f.filedAt,
          url: f.url,
        })),
      )
      .onConflictDoNothing();
  }

  /** Recent filings first; older pages are fetched only until `enough` is satisfied. */
  private async filingRows(cik: number, enough: (rows: Row[]) => boolean): Promise<Row[]> {
    const subs = await this.submissions(cik);
    const rows = columnsToRows(subs.filings.recent);
    for (const page of subs.filings.files) {
      if (enough(rows)) break;
      const older = await this.edgar.json<FilingColumns>(SUBMISSIONS_PAGE_URL(page.name), FOREVER);
      rows.push(...columnsToRows(older));
    }
    return rows;
  }

  private submissions(cik: number): Promise<Submissions> {
    return this.edgar.json<Submissions>(SUBMISSIONS_URL(cik), 5 * 60 * 1000);
  }

  private async tickerMap() {
    if (this.tickers) return this.tickers;
    const raw = await this.edgar.json<Record<string, { cik_str: number; ticker: string; title: string }>>(
      TICKERS_URL,
      24 * HOUR,
    );
    this.tickers = new Map(
      Object.values(raw).map((t) => [normalizeTicker(t.ticker), { cik: t.cik_str, name: t.title }]),
    );
    return this.tickers;
  }
}

function pickQuarterly(
  rows: Row[],
  forms: string[],
  company: Company,
  lastN: number | null,
  fiscalYear: number | null,
): Row[] {
  if (!forms.length) return [];
  const byPeriod = new Map<string, Row>();
  for (const r of rows) {
    if (!forms.includes(r.form) || !r.reportDate) continue;
    const existing = byPeriod.get(r.reportDate);
    // Keep the original filing for each period (the earliest filed).
    if (!existing || r.filedAt < existing.filedAt) byPeriod.set(r.reportDate, r);
  }
  let picked = [...byPeriod.values()].sort((a, b) => b.reportDate.localeCompare(a.reportDate));
  if (fiscalYear !== null) {
    picked = picked.filter((r) => fiscalLabel(r.reportDate, company.fiscalYearEnd).fiscalYear === fiscalYear);
  }
  return lastN === null ? picked : picked.slice(0, lastN);
}

function pickReleases(rows: Row[], company: Company, lastN: number, fiscalYear: number | null): Row[] {
  let picked = rows
    .filter((r) => r.form === '8-K' && r.items.includes('2.02'))
    .sort((a, b) => b.filedAt.localeCompare(a.filedAt));
  if (fiscalYear !== null) {
    picked = picked.filter((r) => releaseLabel(releaseDate(r), company.fiscalYearEnd).fiscalYear === fiscalYear);
  }
  return picked.slice(0, lastN);
}

function toFound(r: Row, company: Company): FoundFiling {
  const isRelease = r.form === '8-K';
  const periodEnd = isRelease ? releaseDate(r) : r.reportDate;
  const label = isRelease
    ? releaseLabel(periodEnd, company.fiscalYearEnd)
    : fiscalLabel(periodEnd, company.fiscalYearEnd);
  return {
    accession: r.accession,
    cik: company.cik,
    ticker: company.ticker,
    form: r.form as FilingRef['form'],
    periodEnd,
    fiscalYear: label.fiscalYear,
    fiscalPeriod: fiscalPeriodFor(r.form, label),
    filedAt: r.filedAt,
    url: documentUrl(company.cik, r.accession, r.primaryDocument),
    status: 'found',
    quarter: quarterName(label),
    items: r.items,
  };
}

function columnsToRows(c: FilingColumns): Row[] {
  return c.accessionNumber.map((accession, i) => ({
    accession,
    filedAt: c.filingDate[i] ?? '',
    reportDate: c.reportDate[i] ?? '',
    form: c.form[i] ?? '',
    primaryDocument: c.primaryDocument[i] ?? '',
    items: (c.items[i] ?? '').split(',').filter(Boolean),
  }));
}

/** An 8-K's report date is the event date; fall back to the filing date. */
const releaseDate = (r: Row) => r.reportDate || r.filedAt;

export function documentUrl(cik: number, accession: string, primaryDocument: string): string {
  return `https://www.sec.gov/Archives/edgar/data/${cik}/${accession.replace(/-/g, '')}/${primaryDocument}`;
}

const normalizeTicker = (t: string) => t.trim().toUpperCase().replace(/\./g, '-');
const dashed = (mmdd: string) => `${mmdd.slice(0, 2)}-${mmdd.slice(2, 4)}`;
