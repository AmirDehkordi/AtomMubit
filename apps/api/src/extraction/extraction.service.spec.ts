import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { eq, sql } from 'drizzle-orm';
import { resolve } from 'node:path';
import { DEFAULT_EXTRACTION_FIELDS } from '@desk/shared';
import { DbService, type Db } from '../db/db.service';
import * as schema from '../db/schema';
import { extractionEvents, extractionRequests, extractionRuns, projects, sourceDocuments, workJobs } from '../db/schema';
import { ExtractionService } from './extraction.service';
import { WorkerLoop } from '../jobs/worker-loop';
import type { JobsService } from '../jobs/jobs.service';
import type { ProcessorService } from './processor.service';
import type { FeedbackService } from '../feedback/feedback.service';

function asUpload(value: unknown): { documentId: string; runId: string; requestId: string } {
  expect(value).toMatchObject({ documentId: expect.any(String), runId: expect.any(String), requestId: expect.any(String) });
  return value as { documentId: string; runId: string; requestId: string };
}

describe('extraction submission and retrieval against migrated PostgreSQL', () => {
  let client: PGlite; let db: PgliteDatabase<typeof schema>; let service: ExtractionService;
  const projectA = 'project-a', projectB = 'project-b', foreignProject = 'foreign-project';
  const text = Buffer.from('Three months ended July 26, 2026. Revenue USD 96,221 million.');
  beforeAll(async () => {
    vi.stubEnv('TEAM_ID', 'internal');
    client = new PGlite(); db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../drizzle') });
    service = new ExtractionService({ db: db as unknown as Db } as DbService);
  }, 60_000);
  beforeEach(async () => {
    await db.execute(sql`TRUNCATE projects, source_documents, project_documents, extraction_requests, extraction_runs, work_jobs, extraction_events, extraction_feedback, policy_versions, monitoring_watchlist RESTART IDENTITY CASCADE`);
    await db.insert(projects).values([
      { id: projectA, teamId: 'internal', title: 'Desk A' }, { id: projectB, teamId: 'internal', title: 'Desk B' },
      { id: foreignProject, teamId: 'another-team', title: 'Private desk' },
    ]);
  });
  afterAll(async () => { await client?.close(); vi.unstubAllEnvs(); });

  it('repeating an extraction request reuses its receipt and durable planner job', async () => {
    const request = { projectId: projectA, request: 'Extract revenue and diluted GAAP EPS for NVDA.' };
    const [first, second] = await Promise.all([service.submitRequest(request, 'request-key'), service.submitRequest(request, 'request-key')]);
    expect(first.requestId).toBe(second.requestId);
    expect(await db.select().from(extractionRequests)).toHaveLength(1);
    expect(await db.select().from(workJobs)).toHaveLength(1);
    expect((await db.select().from(workJobs))[0]?.kind).toBe('plan');
    expect(await db.select().from(extractionRuns)).toHaveLength(0);
  });

  it('returns 409 when a request idempotency key is reused for different intent', async () => {
    await service.submitRequest({ projectId: projectA, request: 'Extract revenue' }, 'same-key');
    await expect(service.submitRequest({ projectId: projectA, request: 'Extract guidance' }, 'same-key')).rejects.toMatchObject({ status: 409 });
    expect(await db.select().from(extractionRequests)).toHaveLength(1);
    expect(await db.select().from(workJobs)).toHaveLength(1);
  });

  it('an upload automatically creates a source-linked default-schema run and job', async () => {
    const receipt = asUpload(await service.upload(projectA, 'earnings.txt', text, 'NVDA', 'upload-key'));
    const [run] = await db.select().from(extractionRuns);
    expect(run?.id).toBe(receipt.runId); expect(run?.state).toBe('queued');
    expect(run?.specification.fields).toEqual([...DEFAULT_EXTRACTION_FIELDS].sort());
    expect(run?.specification.schemaVersion).toBe('2');
    const [document] = await db.select().from(sourceDocuments);
    expect(document?.id).toBe(receipt.documentId); expect(document?.content).toBe(text.toString());
    expect(document?.format).toBe('text'); expect(document?.accession).toBeNull();
    expect(document?.rawBase64).toBe(text.toString('base64'));
    const [job] = await db.select().from(workJobs);
    expect(job?.kind).toBe('extract'); expect(job?.payload.runId).toBe(receipt.runId);
    const data = await service.data({ projectId: projectA, runId: receipt.runId as string });
    expect(data.runs).toHaveLength(1); expect(data.runs[0]?.document.id).toBe(document?.id);
  });

  it('duplicate concurrent uploads and a restarted service reuse one immutable run', async () => {
    const receipts = await Promise.all([service.upload(projectA, 'earnings.txt', text, undefined, 'duplicate'), service.upload(projectA, 'earnings.txt', text, undefined, 'duplicate')]);
    const restarted = new ExtractionService({ db: db as unknown as Db } as DbService);
    const third = await restarted.upload(projectA, 'earnings.txt', text, undefined, 'duplicate');
    expect(receipts[0]?.requestId).toBe(receipts[1]?.requestId); expect(third.requestId).toBe(receipts[0]?.requestId);
    expect(await db.select().from(sourceDocuments)).toHaveLength(1);
    expect(await db.select().from(extractionRequests)).toHaveLength(1);
    expect(await db.select().from(extractionRuns)).toHaveLength(1);
    expect(await db.select().from(workJobs)).toHaveLength(1);
  });

  it('links a reused run to a new request and reconciles both receipts without duplicating extraction', async () => {
    const uploaded = asUpload(await service.upload(projectA, 'earnings.txt', text, undefined, 'original'));
    const followup = await service.submitRequest({ projectId: projectA, request: 'Read the same core facts', documentIds: [uploaded.documentId] }, 'followup');
    const bundle = await service.specification();
    await service.dbs.db.transaction(async tx => { await service.queueDocument(tx, projectA, uploaded.documentId, bundle, followup.requestId); });
    const data = await service.data({ projectId: projectA, requestId: followup.requestId });
    expect(data.runs).toHaveLength(1); expect(data.runs[0]?.id).toBe(uploaded.runId);
    expect(await db.select().from(extractionRuns)).toHaveLength(1);
    await db.update(extractionRuns).set({ state: 'completed', accepted: true }).where(eq(extractionRuns.id, uploaded.runId));
    await db.update(workJobs).set({ state: 'completed' });
    const loop = new WorkerLoop(service.dbs, {} as JobsService, {} as ProcessorService, {} as FeedbackService);
    await loop.reconcileRequests();
    expect((await db.select().from(extractionRequests)).every(request => request.state === 'completed')).toBe(true);
    const count = (await db.select().from(extractionEvents)).length;
    await loop.reconcileRequests();
    expect(await db.select().from(extractionEvents)).toHaveLength(count);
  });

  it('returns 409 on changed upload bytes without partially inserting another source or run', async () => {
    await service.upload(projectA, 'earnings.txt', text, undefined, 'upload-key');
    await expect(service.upload(projectA, 'earnings.txt', Buffer.from('Different financial source'), undefined, 'upload-key')).rejects.toMatchObject({ status: 409 });
    expect(await db.select().from(sourceDocuments)).toHaveLength(1);
    expect(await db.select().from(extractionRequests)).toHaveLength(1);
    expect(await db.select().from(extractionRuns)).toHaveLength(1);
    expect(await db.select().from(workJobs)).toHaveLength(1);
  });

  it('scopes document access, requests, runs and events to the requested project', async () => {
    const receipt = asUpload(await service.upload(projectA, 'earnings.txt', text, undefined, 'scoped'));
    await expect(service.submitRequest({ projectId: projectB, request: 'Read that document', documentIds: [receipt.documentId as string] })).rejects.toMatchObject({ status: 404 });
    const b = await service.data({ projectId: projectB, runId: receipt.runId as string, requestId: receipt.requestId });
    expect(b.runs).toHaveLength(0); expect(b.requests).toHaveLength(0); expect(b.events).toHaveLength(0);
    await expect(service.data({ projectId: foreignProject })).rejects.toMatchObject({ status: 404 });
    await expect(service.upload(foreignProject, 'earnings.txt', text)).rejects.toMatchObject({ status: 404 });
    await expect(service.data({ projectId: 'missing-project' })).rejects.toMatchObject({ status: 404 });
  });

  it('the same upload key in another authorized project creates a separate run with shared source membership', async () => {
    const first = asUpload(await service.upload(projectA, 'earnings.txt', text, undefined, 'same'));
    const second = asUpload(await service.upload(projectB, 'earnings.txt', text, undefined, 'same'));
    expect(first.documentId).toBe(second.documentId); expect(first.runId).not.toBe(second.runId);
    expect(first.requestId).not.toBe(second.requestId); expect(await db.select().from(sourceDocuments)).toHaveLength(1);
    expect(await db.select().from(extractionRuns)).toHaveLength(2);
    expect((await service.data({ projectId: projectA })).runs).toHaveLength(1);
    expect((await service.data({ projectId: projectB })).runs).toHaveLength(1);
  });

  it('rejects invalid PDF, unsupported/binary/invalid UTF-8 uploads before queuing work', async () => {
    for (const [name, bytes] of [
      ['invalid.pdf', Buffer.from('This is not a PDF')], ['binary.txt', Buffer.from([0, 1, 2])],
      ['invalid.txt', Buffer.from([0xff, 0xfe])], ['unsupported.exe', text], ['empty.txt', Buffer.alloc(0)],
    ] as const) await expect(service.upload(projectA, name, bytes)).rejects.toMatchObject({ status: 400 });
    expect(await db.select().from(sourceDocuments)).toHaveLength(0);
    expect(await db.select().from(extractionRuns)).toHaveLength(0);
    expect(await db.select().from(workJobs)).toHaveLength(0);
  });

  it('persists progress events transactionally and replays from a durable cursor after service restart', async () => {
    const first = asUpload(await service.upload(projectA, 'earnings.txt', text, undefined, 'first'));
    const before = await service.data({ projectId: projectA });
    expect(before.events).toHaveLength(1); expect(before.events[0]?.type).toBe('queued');
    expect(before.events[0]?.runId).toBe(first.runId);
    await service.upload(projectA, 'next.txt', Buffer.from('Additional source text'), undefined, 'second');
    const restarted = new ExtractionService({ db: db as unknown as Db } as DbService);
    const replay = await restarted.data({ projectId: projectA, after: before.nextCursor });
    expect(replay.events).toHaveLength(1); expect(replay.events[0]?.id).toBeGreaterThan(before.nextCursor);
    expect(replay.nextCursor).toBe(replay.events[0]?.id);
    expect((await restarted.data({ projectId: projectA, after: replay.nextCursor })).events).toHaveLength(0);
    expect(await db.select().from(extractionEvents)).toHaveLength(2);
  });

  it('a failed upload transaction never exposes a queued event without its run', async () => {
    await service.upload(projectA, 'earnings.txt', text, undefined, 'conflict');
    await expect(service.upload(projectA, 'changed.txt', text, undefined, 'conflict')).rejects.toMatchObject({ status: 409 });
    const [events, runs] = await Promise.all([db.select().from(extractionEvents), db.select().from(extractionRuns)]);
    expect(events).toHaveLength(1); expect(runs).toHaveLength(1); expect(events[0]?.runId).toBe(runs[0]?.id);
  });
});
