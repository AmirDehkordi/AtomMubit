import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { and, eq, gt, inArray, lt, lte, or, sql } from 'drizzle-orm';
import { DbService, type Db } from '../db/db.service';
import { workJobs } from '../db/schema';

export type Transaction = Parameters<Parameters<Db['transaction']>[0]>[0];
export type Job = typeof workJobs.$inferSelect;
export const LEASE_MS = 180_000;
export const MAX_ATTEMPTS = 3;

export async function enqueue(tx: Transaction | Db, key: string, kind: string, payload: Record<string, unknown>) {
  await tx.insert(workJobs).values({ id: randomUUID(), key, kind, payload }).onConflictDoNothing();
}

@Injectable()
export class JobsService {
  constructor(private readonly dbs: DbService) {}

  async claim(kinds?: string[]): Promise<Job | null> {
    return this.dbs.db.transaction(async tx => {
      const [job] = await tx.select().from(workJobs).where(and(
        lt(workJobs.attempts, MAX_ATTEMPTS), kinds?.length ? inArray(workJobs.kind,kinds) : undefined,
        or(and(eq(workJobs.state, 'queued'), lte(workJobs.availableAt, new Date())),
          and(eq(workJobs.state, 'running'), lte(workJobs.leaseUntil, new Date()))),
      )).orderBy(workJobs.availableAt).limit(1).for('update', { skipLocked: true });
      if (!job) return null;
      const [leased] = await tx.update(workJobs).set({ state: 'running', attempts: job.attempts + 1,
        leaseToken: randomUUID(), leaseUntil: new Date(Date.now() + LEASE_MS) })
        .where(eq(workJobs.id, job.id)).returning();
      return leased!;
    });
  }

  async heartbeat(job: Job): Promise<boolean> {
    const rows = await this.dbs.db.update(workJobs).set({ leaseUntil: new Date(Date.now() + LEASE_MS) })
      .where(and(eq(workJobs.id, job.id), eq(workJobs.leaseToken, job.leaseToken!), eq(workJobs.state, 'running'), gt(workJobs.leaseUntil, new Date()))).returning({ id: workJobs.id });
    return rows.length > 0;
  }

  /** Every result commit is fenced by the lease token under the same row lock. */
  async withLease<T>(job: Job, action: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.dbs.db.transaction(async tx => {
      const [current] = await tx.select().from(workJobs).where(eq(workJobs.id, job.id)).for('update');
      if (!current || current.state !== 'running' || current.leaseToken !== job.leaseToken || !current.leaseUntil || current.leaseUntil.getTime() <= Date.now()) {
        throw new Error('Worker lease lost');
      }
      return action(tx);
    });
  }

  async complete(job: Job) {
    await this.withLease(job, async tx => {
      await tx.update(workJobs).set({ state: 'completed', leaseToken: null, leaseUntil: null, error: null }).where(eq(workJobs.id, job.id));
    });
  }

  async fail(job: Job, error: string) {
    await this.dbs.db.update(workJobs).set({ state: job.attempts >= MAX_ATTEMPTS ? 'failed' : 'queued',
      error: error.slice(0, 500), leaseToken: null, leaseUntil: null,
      availableAt: new Date(Date.now() + 1000 * 2 ** job.attempts) })
      .where(and(eq(workJobs.id, job.id), eq(workJobs.leaseToken, job.leaseToken!)));
  }

  async expireExhausted(onExpired?: (job: Job, tx: Transaction) => Promise<void>): Promise<Job[]> {
    return this.dbs.db.transaction(async tx=>{
      const expired = await tx.update(workJobs).set({state:'failed',error:'Worker lease expired after maximum attempts',leaseToken:null,leaseUntil:null})
        .where(and(eq(workJobs.state,'running'),sql`${workJobs.attempts} >= ${MAX_ATTEMPTS}`,lte(workJobs.leaseUntil,new Date()))).returning();
      for(const job of expired) await onExpired?.(job,tx);
      return expired;
    });
  }
}
