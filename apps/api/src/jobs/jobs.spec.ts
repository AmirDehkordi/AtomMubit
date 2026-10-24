import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { eq, sql } from 'drizzle-orm';
import { resolve } from 'node:path';
import { DbService, type Db } from '../db/db.service';
import * as schema from '../db/schema';
import { extractionEvents, workJobs } from '../db/schema';
import { enqueue, JobsService, MAX_ATTEMPTS } from './jobs.service';

describe('durable jobs against migrated PostgreSQL', () => {
  let client: PGlite; let db: PgliteDatabase<typeof schema>; let service: JobsService;
  beforeAll(async () => {
    client = new PGlite(); db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../drizzle') });
    service = new JobsService({ db: db as unknown as Db } as DbService);
  }, 60_000);
  beforeEach(async () => { await db.execute(sql`TRUNCATE work_jobs, extraction_events RESTART IDENTITY CASCADE`); });
  afterAll(async () => { await client?.close(); });

  it('concurrent workers claim each queued job once and duplicate enqueue converges', async () => {
    await enqueue(db as unknown as Db, 'one', 'extract', { runId: 'run-1' });
    await enqueue(db as unknown as Db, 'one', 'extract', { runId: 'run-1' });
    const claimed = await Promise.all([service.claim(), service.claim(), service.claim()]);
    const jobs = claimed.filter((job) => job !== null);
    expect(jobs).toHaveLength(1); expect(jobs[0]?.attempts).toBe(1); expect(jobs[0]?.leaseToken).toBeTruthy();
    expect(await db.select().from(workJobs)).toHaveLength(1);
  });

  it('recovers an expired lease and fences stale commits and heartbeats', async () => {
    await enqueue(db as unknown as Db, 'recover', 'extract', {});
    const first = (await service.claim())!;
    await db.update(workJobs).set({ leaseUntil: new Date(Date.now() - 1000) }).where(eq(workJobs.id, first.id));
    // A newly constructed service models another process recovering the durable row.
    const restarted = new JobsService({ db: db as unknown as Db } as DbService);
    const recovered = (await restarted.claim())!;
    expect(recovered.id).toBe(first.id); expect(recovered.leaseToken).not.toBe(first.leaseToken); expect(recovered.attempts).toBe(2);
    await expect(service.withLease(first, async tx => {
      await tx.insert(extractionEvents).values({ teamId: 'internal', projectId: 'p', type: 'stale', data: {} });
    })).rejects.toThrow('Worker lease lost');
    await expect(service.complete(first)).rejects.toThrow('Worker lease lost');
    expect(await service.heartbeat(first)).toBe(false);
    expect(await db.select().from(extractionEvents)).toHaveLength(0);
    await restarted.withLease(recovered, async tx => {
      await tx.insert(extractionEvents).values({ teamId: 'internal', projectId: 'p', type: 'accepted', data: { recovered: true } });
    });
    await restarted.complete(recovered);
    expect((await db.select().from(workJobs))[0]?.state).toBe('completed');
    expect((await db.select().from(extractionEvents))[0]?.type).toBe('accepted');
  });

  it('rejects commits after expiry even before another worker claims', async () => {
    await enqueue(db as unknown as Db, 'expired', 'extract', {});
    const job = (await service.claim())!;
    await db.update(workJobs).set({ leaseUntil: new Date(Date.now() - 1000) }).where(eq(workJobs.id, job.id));
    await expect(service.withLease(job, async () => 'write')).rejects.toThrow('Worker lease lost');
  });

  it('does not allow a heartbeat to revive an already expired lease', async () => {
    await enqueue(db as unknown as Db, 'expired-heartbeat', 'extract', {});
    const job = (await service.claim())!;
    await db.update(workJobs).set({ leaseUntil: new Date(Date.now() - 1000) }).where(eq(workJobs.id, job.id));
    expect(await service.heartbeat(job)).toBe(false);
    expect((await db.select().from(workJobs))[0]!.leaseUntil!.getTime()).toBeLessThan(Date.now());
  });

  it('reschedules transient failure with a delay and increasing attempt count', async () => {
    await enqueue(db as unknown as Db, 'retry', 'extract', {});
    const first = (await service.claim())!;
    await service.fail(first, 'temporary provider failure');
    const queued = (await db.select().from(workJobs))[0]!;
    expect(queued.state).toBe('queued'); expect(queued.leaseToken).toBeNull(); expect(queued.error).toContain('temporary');
    expect(queued.availableAt.getTime()).toBeGreaterThan(Date.now()); expect(await service.claim()).toBeNull();
    await db.update(workJobs).set({ availableAt: new Date(Date.now() - 1000) }).where(eq(workJobs.id, first.id));
    expect((await service.claim())?.attempts).toBe(2);
  });

  it('terminates exhausted expired leases instead of abandoning a running job forever', async () => {
    await enqueue(db as unknown as Db, 'exhausted', 'extract', {});
    await db.update(workJobs).set({ attempts: MAX_ATTEMPTS - 1 }).where(eq(workJobs.key, 'exhausted'));
    const final = (await service.claim())!;
    await db.update(workJobs).set({ leaseUntil: new Date(Date.now() - 1000) }).where(eq(workJobs.id, final.id));
    const expired = await service.expireExhausted();
    expect(expired).toHaveLength(1); expect(expired[0]?.state).toBe('failed'); expect(expired[0]?.leaseToken).toBeNull();
    expect(await service.claim()).toBeNull();
  });
});
