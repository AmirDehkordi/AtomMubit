import { Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { companies, filings, projectFilings } from '../db/schema';
import { DocumentsService } from './documents.service';
import { EdgarService } from './edgar.service';
import { fiscalLabel, quarterName, releaseLabel } from './fiscal';
import { htmlToPassages, rankPassages } from './filing-text';

export interface Passage {
  /** p:<accession>:<index> — usable as a block id in citations. */
  id: string;
  accession: string;
  ticker: string;
  form: string;
  /** "Q2 FY2027"; for an earnings release, the quarter it reports. */
  quarter: string;
  periodEnd: string;
  documentType: string;
  url: string;
  text: string;
}

interface FilingText {
  accession: string;
  ticker: string;
  form: string;
  quarter: string;
  periodEnd: string;
  lines: { text: string; documentType: string; url: string }[];
}

const RELEASES_PER_TICKER = 2;

/**
 * Search over the filings' own text, for questions the structured numbers can't answer
 * (what drove results, guidance, risks) before the extraction module has read a filing.
 * The corpus for a desk is its filings plus each company's latest earnings releases (8-K
 * Exhibit 99.1/99.2), which is where guidance is given.
 */
@Injectable()
export class FilingTextService {
  private readonly logger = new Logger(FilingTextService.name);
  private readonly cache = new Map<string, Promise<FilingText>>();

  constructor(
    private readonly dbs: DbService,
    private readonly edgar: EdgarService,
    private readonly documents: DocumentsService,
  ) {}

  async search(projectId: string, query: string, opts: { ticker: string | null; periodEnd: string | null; limit: number }): Promise<Passage[]> {
    const corpus = await this.corpus(projectId, opts.ticker);
    const scoped = opts.periodEnd ? corpus.filter((f) => f.periodEnd === opts.periodEnd || f.form === '8-K') : corpus;
    const flat = scoped.flatMap((f) => f.lines.map((line, index) => ({ f, line, index })));
    const ranked = rankPassages(
      flat.map((x) => x.line.text),
      query,
      opts.limit * 3,
    );
    const out: Passage[] = [];
    const perFiling = new Map<string, number>();
    for (const r of ranked) {
      const { f, line, index } = flat[r.index]!;
      // Keep the results varied: at most three passages from one filing.
      const n = perFiling.get(f.accession) ?? 0;
      if (n >= 3) continue;
      perFiling.set(f.accession, n + 1);
      out.push(toPassage(f, line, index));
      if (out.length >= opts.limit) break;
    }
    return out;
  }

  /** Passages by id, each with the line before and after for context. */
  async passages(ids: string[]): Promise<Passage[]> {
    const out: Passage[] = [];
    for (const id of ids) {
      const m = /^p:(.+):(\d+)$/.exec(id);
      if (!m) continue;
      const f = await this.load(m[1]!).catch(() => null);
      const i = Number(m[2]);
      const line = f?.lines[i];
      if (!f || !line) continue;
      const context = [f.lines[i - 1], line, f.lines[i + 1]].filter((l) => l && l.url === line.url).map((l) => l!.text);
      out.push({ ...toPassage(f, line, i), text: context.join('\n') });
    }
    return out;
  }

  private async corpus(projectId: string, ticker: string | null): Promise<FilingText[]> {
    const rows = await this.dbs.db
      .select({ accession: filings.accession, ticker: companies.ticker })
      .from(projectFilings)
      .innerJoin(filings, eq(projectFilings.accession, filings.accession))
      .innerJoin(companies, eq(filings.cik, companies.cik))
      .where(eq(projectFilings.projectId, projectId));
    const tickers = [...new Set(rows.map((r) => r.ticker))].filter((t) => !ticker || t === ticker.toUpperCase());
    const accessions = rows.filter((r) => tickers.includes(r.ticker)).map((r) => r.accession);
    for (const t of tickers) {
      const releases = await this.edgar
        .findFilings({ ticker: t, forms: ['8-K'], lastNQuarters: RELEASES_PER_TICKER, fiscalYear: null })
        .catch(() => null);
      accessions.push(...(releases?.filings.map((f) => f.accession) ?? []));
    }
    const loaded = await Promise.all([...new Set(accessions)].map((a) => this.load(a).catch((err) => this.skip(a, err))));
    return loaded.filter((f): f is FilingText => f !== null);
  }

  private load(accession: string): Promise<FilingText> {
    let hit = this.cache.get(accession);
    if (!hit) {
      hit = this.read(accession);
      this.cache.set(accession, hit);
      hit.catch(() => this.cache.delete(accession));
    }
    return hit;
  }

  private async read(accession: string): Promise<FilingText> {
    const job = await this.documents.job(accession, 'search');
    const [row] = await this.dbs.db.select({ fye: companies.fiscalYearEnd }).from(companies).where(eq(companies.cik, job.company.cik));
    const fye = (row?.fye ?? job.company.fiscalYearEnd).replace('-', '');
    const label = job.filing.form === '8-K' ? releaseLabel(job.filing.periodEnd, fye) : fiscalLabel(job.filing.periodEnd, fye);
    return {
      accession,
      ticker: job.company.ticker,
      form: job.filing.form,
      quarter: quarterName(label),
      periodEnd: job.filing.periodEnd,
      lines: job.documents.flatMap((d) => htmlToPassages(d.html).map((text) => ({ text, documentType: d.type, url: d.url }))),
    };
  }

  private skip(accession: string, err: unknown): null {
    this.logger.warn(`Could not read ${accession}: ${String(err)}`);
    return null;
  }
}

function toPassage(f: FilingText, line: FilingText['lines'][number], index: number): Passage {
  return {
    id: `p:${f.accession}:${index}`,
    accession: f.accession,
    ticker: f.ticker,
    form: f.form,
    quarter: f.quarter,
    periodEnd: f.periodEnd,
    documentType: line.documentType,
    url: line.url,
    text: line.text,
  };
}

