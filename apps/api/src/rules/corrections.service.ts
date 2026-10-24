import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import type { ExtractionApi } from '@desk/shared';
import { EXTRACTION_API } from '../core/extraction.token';
import { EventsService } from '../core/events.service';
import { DbService } from '../db/db.service';
import { blocks, corrections, projectFilings, rules, sections } from '../db/schema';
import { RulesService } from './rules.service';

export interface CorrectionInput {
  blockId: string;
  /** The desk the person is on (a filing can be on several). */
  projectId: string | null;
  /** What the person said was wrong. */
  note: string;
  /** Point at an existing rule (e.g. "R3")… */
  ruleCode: string | null;
  /** …or propose a new one. */
  ruleText: string | null;
}

/**
 * Corrections: a person flags a block, the desk proposes a rule, and once the
 * person confirms, the rule is active and the affected sections are re-read.
 * Affected sections: the block's section, plus sections with the same item and
 * kind in the project's other filings (the same mistake is likely there too).
 */
@Injectable()
export class CorrectionsService {
  private readonly logger = new Logger(CorrectionsService.name);

  constructor(
    private readonly dbs: DbService,
    private readonly rulesService: RulesService,
    private readonly events: EventsService,
    @Inject(EXTRACTION_API) private readonly extraction: ExtractionApi,
  ) {}

  async propose(input: CorrectionInput) {
    const note = input.note.trim();
    if (!note) throw new BadRequestException('Say what is wrong');
    const [found] = await this.dbs.db
      .select({ block: blocks, section: sections })
      .from(blocks)
      .innerJoin(sections, eq(blocks.sectionId, sections.id))
      .where(eq(blocks.id, input.blockId));
    if (!found) throw new NotFoundException(`No block ${input.blockId}`);
    const desks = await this.dbs.db
      .select({ projectId: projectFilings.projectId })
      .from(projectFilings)
      .where(eq(projectFilings.accession, found.block.accession));
    const projectId =
      input.projectId && desks.some((d) => d.projectId === input.projectId) ? input.projectId : (desks[0]?.projectId ?? null);
    const row = { ...found, projectId };

    let rule: typeof rules.$inferSelect | null = input.ruleCode ? await this.rulesService.byCode(input.ruleCode) : null;
    if (input.ruleCode && !rule) throw new BadRequestException(`No rule ${input.ruleCode}`);
    if (!rule) {
      const text = input.ruleText?.trim();
      if (!text) throw new BadRequestException('Pick a rule or write one');
      rule = await this.rulesService.propose(text);
    }

    const affected = await this.affectedSections(row.section, row.projectId);
    const correction = {
      id: randomUUID(),
      blockId: row.block.id,
      accession: row.block.accession,
      sectionId: row.section.id,
      projectId: row.projectId,
      note,
      ruleId: rule.id,
      rereadSections: affected.map((s) => s.id),
    };
    await this.dbs.db.insert(corrections).values(correction);
    return { correction: { ...correction, status: 'proposed' as const }, rule, affected };
  }

  /** Confirms the rule and asks the extractor to re-read the affected sections. */
  async apply(id: string) {
    const [row] = await this.dbs.db
      .select({ correction: corrections, rule: rules })
      .from(corrections)
      .innerJoin(rules, eq(corrections.ruleId, rules.id))
      .where(eq(corrections.id, id));
    if (!row) throw new NotFoundException(`No correction ${id}`);
    if (row.correction.status !== 'proposed') return { ...row, alreadyDone: true };

    await this.rulesService.activate(row.rule.id);
    await this.dbs.db
      .update(corrections)
      .set({ status: 'applied', appliedAt: new Date() })
      .where(eq(corrections.id, id));
    const sectionIds = row.correction.rereadSections;
    if (row.correction.projectId) {
      for (const blockId of await this.blockIds(sectionIds)) {
        this.events.emit(row.correction.projectId, { type: 'block', id: blockId, status: 'unchecked' });
      }
      // Not awaited: re-reading streams its progress.
      this.extraction
        .rereadSections({ projectId: row.correction.projectId, sectionIds, correctionId: id, ruleCode: row.rule.code })
        .catch((err) => this.logger.warn(`Re-read for correction ${id} failed: ${String(err)}`));
    }
    return { correction: { ...row.correction, status: 'applied' as const }, rule: { ...row.rule, active: true }, sectionIds };
  }

  /** Cancels a proposal that was never applied: it and a rule proposed only for it are removed. */
  async dismiss(id: string): Promise<void> {
    const [row] = await this.dbs.db.select().from(corrections).where(eq(corrections.id, id));
    if (!row) throw new NotFoundException(`No correction ${id}`);
    if (row.status === 'applied') throw new BadRequestException('An applied correction cannot be cancelled');
    await this.dbs.db.delete(corrections).where(eq(corrections.id, id));
    const [stillUsed] = await this.dbs.db.select({ id: corrections.id }).from(corrections).where(eq(corrections.ruleId, row.ruleId)).limit(1);
    if (!stillUsed) {
      await this.dbs.db.delete(rules).where(and(eq(rules.id, row.ruleId), eq(rules.active, false), eq(rules.source, 'user')));
    }
  }

  forBlocks(blockIds: string[]) {
    if (!blockIds.length) return Promise.resolve([]);
    return this.dbs.db
      .select({ correction: corrections, ruleCode: rules.code })
      .from(corrections)
      .innerJoin(rules, eq(corrections.ruleId, rules.id))
      .where(inArray(corrections.blockId, blockIds));
  }

  private async affectedSections(section: typeof sections.$inferSelect, projectId: string | null) {
    if (!projectId) return [{ id: section.id, accession: section.accession, item: section.item, title: section.title }];
    const rows = await this.dbs.db
      .select({ id: sections.id, accession: sections.accession, item: sections.item, title: sections.title })
      .from(sections)
      .innerJoin(projectFilings, eq(sections.accession, projectFilings.accession))
      .where(and(eq(projectFilings.projectId, projectId), eq(sections.item, section.item), eq(sections.kind, section.kind)));
    return rows.some((r) => r.id === section.id) ? rows : [section, ...rows];
  }

  private async blockIds(sectionIds: string[]): Promise<string[]> {
    if (!sectionIds.length) return [];
    const rows = await this.dbs.db.select({ id: blocks.id }).from(blocks).where(inArray(blocks.sectionId, sectionIds));
    return rows.map((r) => r.id);
  }
}
