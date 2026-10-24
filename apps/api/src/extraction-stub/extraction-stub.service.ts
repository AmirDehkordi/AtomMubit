import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { ExtractionApi, ExtractionJob, ExtractionSummary } from '@desk/shared';
import { EventsService } from '../core/events.service';
import { DbService } from '../db/db.service';
import { filings } from '../db/schema';

/**
 * Stand-in until the real extraction module lands (docs/extraction-contract.md):
 * marks the filing ready without reading it, so the desk works on XBRL numbers alone.
 * The job it receives already carries the filing's raw HTML.
 */
@Injectable()
export class ExtractionStubService implements ExtractionApi {
  constructor(
    private readonly dbs: DbService,
    private readonly events: EventsService,
  ) {}

  async extractFiling({ accession, projectId }: ExtractionJob): Promise<ExtractionSummary> {
    await this.dbs.db.update(filings).set({ status: 'ready' }).where(eq(filings.accession, accession));
    const summary = { accession, sectionsTotal: 0, sectionsDone: 0, blocks: 0, verified: 0, fixed: 0, review: 0 };
    this.events.emit(projectId, {
      type: 'extraction',
      accession,
      status: 'ready',
      sectionsDone: 0,
      sectionsTotal: 0,
      fixed: 0,
      review: 0,
    });
    return summary;
  }
}
