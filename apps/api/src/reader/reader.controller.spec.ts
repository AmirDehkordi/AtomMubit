import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { resolve } from 'node:path';
import { eq, sql } from 'drizzle-orm';
import * as schema from '../db/schema';
import type { Db, DbService } from '../db/db.service';
import { ReaderController } from './reader.controller';

describe('reader revision and project isolation', () => {
  let client: PGlite; let db: PgliteDatabase<typeof schema>; let reader: ReaderController;
  beforeAll(async () => {
    client = new PGlite(); db = drizzle(client, {schema});
    await migrate(db, {migrationsFolder: resolve(__dirname, '../../drizzle')});
    reader = new ReaderController({db: db as unknown as Db} as DbService);
  }, 60_000);
  afterAll(async () => { await client?.close(); });
  beforeEach(async () => {
    await db.execute(sql`TRUNCATE projects, companies, source_documents RESTART IDENTITY CASCADE`);
    await db.insert(schema.projects).values([{id: 'a', title: 'A'}, {id: 'b', title: 'B'}, {id: 'empty', title: 'Empty'}, {id: 'foreign', title: 'Foreign', teamId: 'another-team'}]);
    await db.insert(schema.companies).values({cik: 1, ticker: 'TEST', name: 'Test', fiscalYearEnd: '12-31'});
    await db.insert(schema.filings).values({accession: 'filing', cik: 1, form: '10-Q', periodEnd: '2026-06-30', fiscalYear: 2026, fiscalPeriod: 'Q2', filedAt: '2026-07-31', url: 'https://example.com'});
    await db.insert(schema.projectFilings).values(['a','b','foreign'].map(projectId => ({projectId, accession: 'filing'})));
    await db.insert(schema.sourceDocuments).values({id: 'doc', teamId: 'internal', accession: 'filing', name: 'Filing', format: 'text', checksum: 'checksum', content: 'Revenue 100'});
    for (const [id, projectId, accepted, state] of [
      ['old-a', 'a', false, 'completed'], ['accepted-a', 'a', true, 'completed'],
      ['rejected-a', 'a', false, 'needs_review'], ['accepted-b', 'b', true, 'completed'],
    ] as const) {
      await db.insert(schema.extractionRuns).values({id, identity: id, teamId: 'internal', projectId, documentId: 'doc', accepted, state, specification: {fields: ['revenue']}});
      await section(`${id}:doc:0`);
    }
    await section('legacy-section');
  });
  async function section(id: string) {
    await db.insert(schema.sections).values({id, accession: 'filing', item: '1', title: 'Revenue', kind: 'text', ordinal: 0, text: 'Revenue 100', charCount: 11});
    await db.insert(schema.blocks).values({id: `${id}-block`, sectionId: id, accession: 'filing', type: 'metric', label: 'Revenue', quote: 'Revenue 100', status: 'verified'});
  }
  it('scopes an outline to accepted revisions and unversioned legacy sections', async () => {
    const a = await reader.sections('filing', 'a');
    expect(a.sections.map(s => s.id).sort()).toEqual(['accepted-a:doc:0', 'legacy-section']);
    expect(a.sections.every(s => s.blocks === 1)).toBe(true);
    const b = await reader.sections('filing', 'b');
    expect(b.sections.map(s => s.id).sort()).toEqual(['accepted-b:doc:0', 'legacy-section']);
  });
  it('does not promote review or historical sections when there is no accepted run', async () => {
    await db.update(schema.extractionRuns).set({accepted: false}).where(eq(schema.extractionRuns.projectId, 'a'));
    expect((await reader.sections('filing', 'a')).sections.map(s => s.id)).toEqual(['legacy-section']);
  });
  it('keeps historical citations readable within their original project', async () => {
    const historical = await reader.section('old-a:doc:0', 'a');
    expect(historical.section.id).toBe('old-a:doc:0'); expect(historical.blocks).toHaveLength(1);
    await expect(reader.section('old-a:doc:0', 'b')).rejects.toMatchObject({status: 404});
    expect((await reader.section('legacy-section', 'b')).section.id).toBe('legacy-section');
  });
  it('rejects unrelated and foreign-team project access for outlines and direct sections', async () => {
    for (const project of ['empty', 'foreign']) {
      await expect(reader.sections('filing', project)).rejects.toMatchObject({status: 404});
      await expect(reader.section('legacy-section', project)).rejects.toMatchObject({status: 404});
    }
  });
  it('keeps unscoped legacy readers working without leaking project revision outlines', async () => {
    expect((await reader.sections('filing')).sections.map(s => s.id)).toEqual(['legacy-section']);
    expect((await reader.section('legacy-section')).section.id).toBe('legacy-section');
  });
});
