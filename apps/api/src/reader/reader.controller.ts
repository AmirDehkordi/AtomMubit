import { BadRequestException, Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { asc, eq, inArray, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { blocks, checks, companies, corrections, filings, rules, sections } from '../db/schema';
import { fiscalLabel, quarterName, releaseLabel } from '../edgar/fiscal';
import { FilingTextService } from '../edgar/filing-text.service';

/** What the filing reader shows: a filing's sections, a section's text with its blocks, and block lookups. */
@Controller()
export class ReaderController {
  constructor(
    private readonly dbs: DbService,
    private readonly filingText: FilingTextService,
  ) {}

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
    const blockIds = list.filter((id) => !id.startsWith('p:'));
    const rows = blockIds.length ? await this.dbs.db.select().from(blocks).where(inArray(blocks.id, blockIds)) : [];
    // Passages straight from the filing text (before extraction): no section, a link to the document instead.
    const passages = (await this.filingText.passages(list.filter((id) => id.startsWith('p:')))).map((p) => ({
      id: p.id,
      accession: p.accession,
      sectionId: null,
      label: `${p.ticker} ${p.form} · ${p.quarter}`,
      quote: p.text,
      url: p.url,
    }));
    return [...(await this.withChecks(rows)), ...passages];
  }

  private async withChecks(rows: (typeof blocks.$inferSelect)[]) {
    if (!rows.length) return [];
    const ids = rows.map((b) => b.id);
    const all = await this.dbs.db.select().from(checks).where(inArray(checks.blockId, ids));
    const fixes = await this.dbs.db
      .select({ id: corrections.id, blockId: corrections.blockId, note: corrections.note, status: corrections.status, ruleCode: rules.code, ruleText: rules.text })
      .from(corrections)
      .innerJoin(rules, eq(corrections.ruleId, rules.id))
      .where(inArray(corrections.blockId, ids));
    return rows.map(({ tsv: _tsv, ...b }) => ({
      ...b,
      checks: all.filter((c) => c.blockId === b.id).map(({ verifier, passed, detail }) => ({ verifier, passed, detail })),
      corrections: fixes.filter((c) => c.blockId === b.id && c.status !== 'dismissed').map(({ blockId: _b, ...c }) => c),
    }));
  }
}
