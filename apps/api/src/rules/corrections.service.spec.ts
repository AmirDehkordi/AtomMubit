import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { firstValueFrom, filter, timeout } from 'rxjs';
import { HealthController } from '../health.controller';
import { eq, sql } from 'drizzle-orm';
import { resolve } from 'node:path';
import * as schema from '../db/schema';
import { DbService, type Db } from '../db/db.service';
import { EventsService } from '../core/events.service';
import { ExtractionService } from '../extraction/extraction.service';
import { CorrectionsService } from './corrections.service';
import { RulesService } from './rules.service';

describe('confirmed desk corrections use durable extraction', () => {
  let client: PGlite; let db: PgliteDatabase<typeof schema>;
  let extraction: ExtractionService; let corrections: CorrectionsService; let rules: RulesService;
  const projectId = 'desk';
  beforeAll(async () => {
    client = new PGlite(); db = drizzle(client, {schema});
    await migrate(db, {migrationsFolder: resolve(__dirname, '../../drizzle')});
    const dbs = {db: db as unknown as Db} as DbService;
    extraction = new ExtractionService(dbs); rules = new RulesService(dbs);
    corrections = new CorrectionsService(dbs, rules, new EventsService(), extraction);
  }, 60_000);
  afterAll(async () => { await client?.close(); });
  beforeEach(async () => {
    vi.restoreAllMocks();
    await db.execute(sql`TRUNCATE projects, companies, rules, source_documents, work_jobs, extraction_events, policy_versions, service_locks RESTART IDENTITY CASCADE`);
    await db.insert(schema.projects).values({id: projectId, title: 'Desk'});
    await db.insert(schema.companies).values({cik: 1, ticker: 'TEST', name: 'Test', fiscalYearEnd: '12-31'});
    for (const accession of ['filing-a', 'filing-b']) {
      await db.insert(schema.filings).values({accession, cik: 1, form: '10-Q', periodEnd: '2026-06-30', fiscalYear: 2026, fiscalPeriod: 'Q2', filedAt: '2026-07-31', url: `https://example.com/${accession}`});
      await db.insert(schema.projectFilings).values({projectId, accession});
      await db.insert(schema.sections).values({id: `${accession}-section`, accession, item: '1', title: 'Revenue', kind: 'table', ordinal: 0, text: 'Revenue 100', charCount: 11});
      await db.insert(schema.blocks).values({id: `${accession}-block`, sectionId: `${accession}-section`, accession, type: 'metric', key: 'revenue', label: 'Revenue', value: 100, quote: 'Revenue 100', status: 'verified'});
      await extraction.registerFiling({accession, projectId, company: {cik: 1, ticker: 'TEST', name: 'Test', fiscalYearEnd: '12-31'}, filing: {form: '10-Q', periodEnd: '2026-06-30', fiscalYear: 2026, fiscalPeriod: 'Q2', quarter: 'Q2 FY2026', filedAt: '2026-07-31'}, documents: [{type: '10-Q', url: `https://example.com/${accession}`, html: '<p>Revenue 100</p>'}]}, undefined, ['revenue']);
    }
    await db.update(schema.extractionRuns).set({state: 'completed', accepted: true, output: {facts: [{value: 100}]}});
    await db.update(schema.workJobs).set({state: 'completed'});
  });

  it('pins confirmed rule text in fresh queued runs across affected filings and preserves old accepted outputs', async () => {
    const oldRuns = await db.select().from(schema.extractionRuns);
    const proposal = await corrections.propose({blockId: 'filing-a-block', projectId, note: 'Use the total, not a segment', ruleCode: null, ruleText: 'Revenue must be the consolidated total.'});
    expect(proposal.affected).toHaveLength(2);
    const applied = await corrections.apply(proposal.correction.id);
    expect(applied.correction.status).toBe('applied');
    const statusEvents = await db.select().from(schema.extractionEvents).where(eq(schema.extractionEvents.type, 'block'));
    expect(statusEvents.map(e => e.data.id).sort()).toEqual(['filing-a-block', 'filing-b-block']);
    const stream = await new HealthController(extraction.dbs).stream(projectId);
    const status = await firstValueFrom(stream.pipe(filter(e => typeof e.data === 'object' && e.data !== null && 'type' in e.data && e.data.type === 'block'), timeout(2000)));
    expect(status.data).toMatchObject({type: 'block', status: 'unchecked'});

    const all = await db.select().from(schema.extractionRuns);
    const fresh = all.filter(r => !oldRuns.some(old => old.id === r.id));
    expect(fresh).toHaveLength(2);
    for (const run of fresh) {
      expect(run.state).toBe('queued'); expect(run.accepted).toBe(false);
      expect(run.ruleVersion).toBe(1);
      expect(run.specification.fields).toEqual(['revenue']);
      expect(run.specification.rules).toContain(`${proposal.rule.code}: Revenue must be the consolidated total.`);
      expect(run.specification.correctionId).toBe(proposal.correction.id);
    }
    for (const old of oldRuns) expect(all.find(r => r.id === old.id)).toEqual(old);
    const queued = (await db.select().from(schema.workJobs)).filter(j => j.state === 'queued');
    expect(queued.map(j => j.payload.runId).sort()).toEqual(fresh.map(r => r.id).sort());
    await corrections.apply(proposal.correction.id);
    const restarted = new ExtractionService(extraction.dbs);
    await restarted.rereadSections({projectId, sectionIds: proposal.correction.rereadSections, correctionId: proposal.correction.id, ruleCode: proposal.rule.code});
    expect(await db.select().from(schema.extractionRuns)).toHaveLength(4);
    expect(await db.select().from(schema.workJobs)).toHaveLength(4);
    expect((await db.select().from(schema.blocks)).every(b => b.status === 'verified')).toBe(true);
  });

  it('leaves a confirmation retryable if durable enqueue fails', async () => {
    const proposal = await corrections.propose({blockId: 'filing-a-block', projectId, note: 'Wrong column', ruleCode: null, ruleText: 'Read the quarter column.'});
    const enqueue = vi.spyOn(extraction, 'queueDocument').mockRejectedValueOnce(new Error('Database unavailable'));
    await expect(corrections.apply(proposal.correction.id)).rejects.toThrow('Database unavailable');
    const [row] = await db.select().from(schema.corrections).where(eq(schema.corrections.id, proposal.correction.id));
    expect(row?.status).toBe('proposed'); expect(row?.appliedAt).toBeNull();
    expect(await db.select().from(schema.policyVersions)).toHaveLength(0);
    expect(await db.select().from(schema.extractionRuns)).toHaveLength(2);
    enqueue.mockRestore();
    await corrections.apply(proposal.correction.id);
    expect(await db.select().from(schema.extractionRuns)).toHaveLength(4);
  });

  it('an additional correction against an already active rule queues fresh higher-version runs', async () => {
    const first = await corrections.propose({blockId: 'filing-a-block', projectId, note: 'Wrong total', ruleCode: null, ruleText: 'Use consolidated revenue.'});
    await corrections.apply(first.correction.id);
    const second = await corrections.propose({blockId: 'filing-a-block', projectId, note: 'Still wrong total', ruleCode: first.rule.code, ruleText: null});
    await corrections.apply(second.correction.id);
    const newest = (await db.select().from(schema.extractionRuns)).filter(r => r.specification.correctionId === second.correction.id);
    expect(newest).toHaveLength(2);
    expect(newest.every(r => r.ruleVersion === 2)).toBe(true);
    expect(await db.select().from(schema.extractionRuns)).toHaveLength(6);
    expect(await db.select().from(schema.policyVersions)).toHaveLength(2);
  });

  it('does not queue sections belonging to another desk', async () => {
    await db.insert(schema.projects).values({id: 'other', title: 'Other desk'});
    await db.insert(schema.rules).values({id: 'rule', code: 'R1', text: 'Use consolidated revenue', source: 'user'});
    await expect(extraction.rereadSections({projectId: 'other', sectionIds: ['filing-a-section'], correctionId: 'foreign', ruleCode: 'R1'})).rejects.toMatchObject({status: 404});
    expect(await db.select().from(schema.extractionRuns)).toHaveLength(2);
  });
});
