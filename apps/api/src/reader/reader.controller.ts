import { BadRequestException, Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { asc, eq, inArray, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { blocks, checks, companies, filings, sections } from '../db/schema';
import { fiscalLabel, quarterName, releaseLabel } from '../edgar/fiscal';

/** What the filing reader shows: a filing's sections, a section's text with its blocks, and block lookups. */
@Controller()
export class ReaderController {
  constructor(private readonly dbs: DbService) {}

  // GET /filings/:accession/sections: the filing's outline, with block counts per section
  @Get('filings/:accession/sections')
  async sections(@Param('accession') accession: string) {
    const [row] = await this.dbs.db
      .select()
      .from(filings)
      .innerJoin(companies, eq(filings.cik, companies.cik))
      .where(eq(filings.accession, accession));
    if (!row) throw new NotFoundException(`No filing ${accession}`);
    const { filings: f, companies: c } = row;
    const fye = c.fiscalYearEnd.replace('-', '');
    const outline = await this.dbs.db
      .select({
        id: sections.id,
        item: sections.item,
        title: sections.title,
        kind: sections.kind,
        ordinal: sections.ordinal,
        charCount: sections.charCount,
        // Qualified by hand: inside the subquery a bare "id" would mean blocks.id.
        blocks: sql<number>`(select count(*)::int from blocks b where b.section_id = "sections"."id")`,
        review: sql<number>`(select count(*)::int from blocks b where b.section_id = "sections"."id" and b.status = 'review')`,
      })
      .from(sections)
      .where(eq(sections.accession, accession))
      .orderBy(asc(sections.ordinal));
    return {
      filing: {
        accession,
        ticker: c.ticker,
        form: f.form,
        periodEnd: f.periodEnd,
        quarter: quarterName(f.form === '8-K' ? releaseLabel(f.periodEnd, fye) : fiscalLabel(f.periodEnd, fye)),
        url: f.url,
        status: f.status,
      },
      sections: outline,
    };
  }

  // GET /sections/:id: the section's text and every block extracted from it, with checks
  @Get('sections/:id')
  async section(@Param('id') id: string) {
    const [section] = await this.dbs.db.select().from(sections).where(eq(sections.id, id));
    if (!section) throw new NotFoundException(`No section ${id}`);
    const rows = await this.dbs.db.select().from(blocks).where(eq(blocks.sectionId, id)).orderBy(asc(blocks.spanStart));
    return { section, blocks: await this.withChecks(rows) };
  }

  // GET /blocks?ids=a,b: blocks by id (citation chips use this to open the right section)
  @Get('blocks')
  async blocks(@Query('ids') ids?: string) {
    const list = (ids ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (!list.length || list.length > 50) throw new BadRequestException('Pass 1–50 block ids');
    const rows = await this.dbs.db.select().from(blocks).where(inArray(blocks.id, list));
    return this.withChecks(rows);
  }

  private async withChecks(rows: (typeof blocks.$inferSelect)[]) {
    if (!rows.length) return [];
    const all = await this.dbs.db
      .select()
      .from(checks)
      .where(inArray(checks.blockId, rows.map((b) => b.id)));
    return rows.map(({ tsv: _tsv, ...b }) => ({
      ...b,
      checks: all.filter((c) => c.blockId === b.id).map(({ verifier, passed, detail }) => ({ verifier, passed, detail })),
    }));
  }
}
