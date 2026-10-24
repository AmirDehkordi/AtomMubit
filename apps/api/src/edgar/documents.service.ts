import { Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { ExtractionJob, FilingDocument } from '@desk/shared';
import { DbService } from '../db/db.service';
import { companies, filings } from '../db/schema';
import { EdgarClient, FOREVER } from './edgar.client';
import { fiscalLabel, quarterName, releaseLabel } from './fiscal';

/** Exhibits of an earnings 8-K worth reading: the press release and, when present, CFO commentary. */
const RELEASE_EXHIBITS = ['EX-99.1', 'EX-99.2'];

/**
 * Raw filing documents for the extraction module. 10-Q and 10-K: the primary
 * document. 8-K: its press-release exhibits (the primary document is only a
 * cover page). Documents are cached on disk forever; filings never change.
 */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly edgar: EdgarClient,
    private readonly dbs: DbService,
  ) {}

  /** The full extraction job for a filing that find_filings has saved. */
  async job(accession: string, projectId: string): Promise<ExtractionJob> {
    const [row] = await this.dbs.db
      .select()
      .from(filings)
      .innerJoin(companies, eq(filings.cik, companies.cik))
      .where(eq(filings.accession, accession));
    if (!row) throw new NotFoundException(`Filing ${accession} has not been found yet. Call find_filings first.`);
    const { filings: f, companies: c } = row;
    const fye = c.fiscalYearEnd.replace('-', '');
    const label = f.form === '8-K' ? releaseLabel(f.periodEnd, fye) : fiscalLabel(f.periodEnd, fye);
    return {
      accession,
      projectId,
      company: { cik: c.cik, ticker: c.ticker, name: c.name, fiscalYearEnd: c.fiscalYearEnd },
      filing: {
        form: f.form,
        periodEnd: f.periodEnd,
        fiscalYear: f.fiscalYear,
        fiscalPeriod: f.fiscalPeriod,
        quarter: quarterName(label),
        filedAt: f.filedAt,
      },
      documents: await this.documents(f.form, f.cik, accession, f.url),
    };
  }

  private async documents(form: string, cik: number, accession: string, primaryUrl: string): Promise<FilingDocument[]> {
    if (form !== '8-K') {
      return [{ type: form, url: primaryUrl, html: await this.edgar.text(primaryUrl, FOREVER) }];
    }
    const exhibits = await this.exhibits(cik, accession);
    const wanted = RELEASE_EXHIBITS.flatMap((type) => exhibits.filter((e) => e.type === type));
    if (!wanted.length) throw new NotFoundException(`No press release exhibit in 8-K ${accession}`);
    return Promise.all(wanted.map(async (e) => ({ ...e, html: await this.edgar.text(e.url, FOREVER) })));
  }

  /** Documents listed on the filing's index page, with their SEC document types. */
  private async exhibits(cik: number, accession: string): Promise<{ type: string; url: string }[]> {
    const folder = `https://www.sec.gov/Archives/edgar/data/${cik}/${accession.replace(/-/g, '')}`;
    const index = await this.edgar.text(`${folder}/${accession}-index.htm`, FOREVER);
    const out: { type: string; url: string }[] = [];
    for (const row of index.split(/<tr[\s>]/i).slice(1)) {
      const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]!.replace(/<[^>]+>/g, '').trim());
      const href = /href="(\/Archives\/[^"]+)"/i.exec(row)?.[1];
      const type = cells[3];
      if (href && type) out.push({ type, url: `https://www.sec.gov${href}` });
    }
    return out;
  }
}
