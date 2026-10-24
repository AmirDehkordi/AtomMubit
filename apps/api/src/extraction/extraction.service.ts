import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { and, desc, eq, gt, inArray, or, sql } from 'drizzle-orm';
import { DEFAULT_EXTRACTION_FIELDS, type ExtractionJob, type RereadRequest } from '@desk/shared';
import { config } from '../core/config';
import { DbService, type Db } from '../db/db.service';
import { blocks, extractionEvents, extractionFeedback, extractionRequests, extractionRuns, monitoringWatchlist, policyVersions, projectDocuments, projectFilings, projects, requestRuns, rules as deskRules, sections, serviceLocks, sourceDocuments, workJobs } from '../db/schema';
import { enqueue, type Transaction } from '../jobs/jobs.service';
import { STARTER_RULES, EXTRACTION_TASK_VERSION } from './policy';
import { prepareUpload } from './upload';

export const teamId = () => process.env.TEAM_ID?.trim() || 'internal';
export const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
export type Specification = { fields: string[]; rules: string[]; workflowVersion: string; schemaVersion: string; model: string; taskFingerprint: string; correctionId?: string };
export async function event(tx: Transaction, projectId: string, type: string, data: Record<string, unknown>, runId: string | null = null) {
  await tx.insert(extractionEvents).values({ teamId: teamId(), projectId, type, data, runId });
}

@Injectable()
export class ExtractionService {
  constructor(readonly dbs: DbService) {}
  async assertProject(projectId: string) {
    const [p] = await this.dbs.db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.teamId, teamId())));
    if (!p) throw new NotFoundException('Project not found');
    return p;
  }
  async rules(ticker?: string | null, version?: number, database: Pick<Db, 'select'> = this.dbs.db) {
    const rows = await database.select().from(policyVersions).where(and(eq(policyVersions.teamId, teamId()), eq(policyVersions.active, true),
      or(sql`${policyVersions.ticker} is null`, eq(policyVersions.ticker, ticker ?? '')),
      version === undefined ? undefined : sql`${policyVersions.version} <= ${version}`)).orderBy(policyVersions.version);
    const activeDeskRules = await database.select().from(deskRules).where(eq(deskRules.active, true)).orderBy(deskRules.code);
    return { version: rows.reduce((n, r) => Math.max(n, r.version), 0), rules: [...new Set([...STARTER_RULES, ...activeDeskRules.map(r => `${r.code}: ${r.text}`), ...rows.filter(r=>r.target !== 'planner').map(r => r.lesson)])] };
  }
  async plannerRules() {
    const policies = await this.dbs.db.select().from(policyVersions).where(and(eq(policyVersions.teamId,teamId()),eq(policyVersions.active,true),sql`${policyVersions.target} in ('planner','both')`));
    return {starterRules:STARTER_RULES, scopedRules:policies.map(p=>({ticker:p.ticker, target:p.target, lesson:p.lesson, version:p.version}))};
  }
  async specification(ticker?: string | null, fields: string[] = [...DEFAULT_EXTRACTION_FIELDS], database: Pick<Db, 'select'> = this.dbs.db) {
    const bundle = await this.rules(ticker, undefined, database);
    return { version: bundle.version, spec: { fields: [...new Set(fields)].sort(), rules: bundle.rules, workflowVersion: 'section-v2', taskFingerprint: EXTRACTION_TASK_VERSION, schemaVersion: '2', model: config.extractorModel } satisfies Specification };
  }
  async submitRequest(input: {projectId: string; request: string; parentRequestId?: string; documentIds?: string[]}, idempotencyKey?: string) {
    await this.assertProject(input.projectId);
    if (input.documentIds?.length) {
      const rows = await this.dbs.db.select().from(projectDocuments).where(and(eq(projectDocuments.projectId, input.projectId), inArray(projectDocuments.documentId, input.documentIds)));
      if (new Set(rows.map(r => r.documentId)).size !== new Set(input.documentIds).size) throw new NotFoundException('Document not in this project');
    }
    if (input.parentRequestId) {
      const [parent] = await this.dbs.db.select().from(extractionRequests).where(and(eq(extractionRequests.id, input.parentRequestId), eq(extractionRequests.projectId, input.projectId), eq(extractionRequests.state, 'needs_clarification')));
      if (!parent) throw new BadRequestException('Parent request is not awaiting clarification in this project');
      if(!input.documentIds?.length) input = {...input,documentIds: (parent.plan?.documentIds as string[] | undefined) ?? []};
    }
    const fingerprint = digest(input); const key = `${teamId()}:${input.projectId}:request:${idempotencyKey ?? randomUUID()}`;
    return this.dbs.db.transaction(async tx => {
      await tx.insert(extractionRequests).values({ id: randomUUID(), teamId: teamId(), projectId: input.projectId, key, fingerprint, text: input.request, parentId: input.parentRequestId, plan: { documentIds: input.documentIds ?? [] } }).onConflictDoNothing();
      const [row] = await tx.select().from(extractionRequests).where(eq(extractionRequests.key, key));
      if (row!.fingerprint !== fingerprint) throw new ConflictException('Idempotency key was already used for a different request');
      await enqueue(tx, `request:${row!.id}`, 'plan', { requestId: row!.id });
      return { requestId: row!.id, state: row!.state, location: `/v1/data?projectId=${input.projectId}&requestId=${row!.id}` };
    });
  }
  async upload(projectId: string, name: string, bytes: Buffer, ticker?: string, idempotencyKey?: string) {
    await this.assertProject(projectId);
    const prepared = await prepareUpload(name, bytes); const checksum = digest(bytes.toString('base64'));
    const documentId = digest([teamId(), checksum, name, ticker ?? null]);
    const bundle = await this.specification(ticker);
    return this.dbs.db.transaction(async tx => {
      // Upload receipt also pins the default rule bundle for repeated idempotency keys.
      const key = `${teamId()}:${projectId}:upload:${idempotencyKey ?? checksum}`;
      const fingerprint = digest([name, checksum, ticker ?? null]);
      const [old] = await tx.select().from(extractionRequests).where(eq(extractionRequests.key, key));
      if (old) {
        if (old.fingerprint !== fingerprint) throw new ConflictException('Idempotency key already used for another upload');
        return { ...old.plan, requestId: old.id, state: old.state, location: `/v1/data?projectId=${projectId}&requestId=${old.id}` };
      }
      await tx.insert(sourceDocuments).values({ id: documentId, teamId: teamId(), name, ticker: ticker ?? null, format: prepared.format, checksum, content: prepared.content, rawBase64: bytes.toString('base64'), metadata: { uploaded: true } }).onConflictDoNothing();
      const requestId = randomUUID();
      // Unique insert is performed before run creation so concurrent duplicate uploads converge.
      const inserted = await tx.insert(extractionRequests).values({ id: requestId, teamId: teamId(), projectId, key, fingerprint, text: `Upload ${name}`, state: 'running' }).onConflictDoNothing().returning();
      if (!inserted.length) {
        const [existing] = await tx.select().from(extractionRequests).where(eq(extractionRequests.key, key));
        if (existing!.fingerprint !== fingerprint) throw new ConflictException('Idempotency key already used for another upload');
        return { ...existing!.plan, requestId: existing!.id, state: existing!.state, location: `/v1/data?projectId=${projectId}&requestId=${existing!.id}` };
      }
      const run = await this.queueDocument(tx, projectId, documentId, bundle, requestId);
      const plan = { documentId, runId: run.id };
      await tx.update(extractionRequests).set({ plan }).where(eq(extractionRequests.id, requestId));
      return { ...plan, requestId, state: run.state, location: `/v1/data?projectId=${projectId}&runId=${run.id}` };
    });
  }
  async queueDocument(tx: Transaction, projectId: string, documentId: string, bundle: {version: number; spec: Specification}, requestId?: string) {
    await tx.insert(projectDocuments).values({ id: digest([projectId, documentId]), teamId: teamId(), projectId, documentId }).onConflictDoNothing();
    const identity = digest([teamId(), projectId, documentId, bundle.version, bundle.spec]);
    await tx.insert(extractionRuns).values({ id: randomUUID(), identity, teamId: teamId(), projectId, documentId, requestId, ruleVersion: bundle.version, specification: bundle.spec }).onConflictDoNothing();
    const [run] = await tx.select().from(extractionRuns).where(eq(extractionRuns.identity, identity));
    if (requestId) await tx.insert(requestRuns).values({id: digest([requestId,run!.id]),requestId,runId:run!.id}).onConflictDoNothing();
    await enqueue(tx, `extract:${run!.id}`, 'extract', { runId: run!.id });
    if (run!.state === 'failed') {
      const recovered = await tx.update(workJobs).set({state:'queued',attempts:0,error:null,availableAt:new Date()}).where(and(eq(workJobs.key,`extract:${run!.id}`),eq(workJobs.state,'failed'), requestId ? undefined : sql`${workJobs.availableAt} < now() - interval '15 minutes'`)).returning();
      if(recovered.length) await tx.update(extractionRuns).set({state:'queued',error:null}).where(eq(extractionRuns.id,run!.id));
    }
    await event(tx, projectId, 'queued', { documentId, state: run!.state }, run!.id);
    return run!;
  }
  async submitFiling(accession: string, projectId: string, requestId?: string, fields?: string[]) {
    await this.assertProject(projectId);
    await this.dbs.db.transaction(async tx => {
      await tx.insert(projectFilings).values({ id: digest([projectId, accession]), teamId: teamId(), projectId, accession }).onConflictDoNothing();
      const key = `ingest:${projectId}:${accession}:${requestId ?? 'monitor'}:${digest(fields ?? [])}`;
      await enqueue(tx, key, 'ingest', { accession, projectId, requestId, fields });
      // A later monitoring scan may recover a terminal transient failure after a 15-minute cooldown.
      await tx.update(workJobs).set({state:'queued', attempts:0, error:null, availableAt:new Date()}).where(and(eq(workJobs.key,key),eq(workJobs.state,'failed'),sql`${workJobs.availableAt} < now() - interval '15 minutes'`));
      await event(tx, projectId, 'ingestion_queued', { accession, requestId });
    });
    return { accession, state: 'queued' };
  }
  async rereadSections(request: RereadRequest): Promise<void> {
    await this.assertProject(request.projectId);
    if (!request.sectionIds.length) throw new BadRequestException('A correction needs affected sections');
    const affected = await this.dbs.db.select({ id: sections.id, accession: sections.accession }).from(sections)
      .innerJoin(projectFilings, eq(projectFilings.accession, sections.accession))
      .where(and(inArray(sections.id, request.sectionIds), eq(projectFilings.projectId, request.projectId)));
    if (new Set(affected.map(s => s.id)).size !== new Set(request.sectionIds).size) throw new NotFoundException('Correction sections are not in this project');
    const [rule] = await this.dbs.db.select().from(deskRules).where(and(eq(deskRules.code, request.ruleCode), eq(deskRules.active, true)));
    if (!rule) throw new BadRequestException('Correction rule must be active');
    const accessions = [...new Set(affected.map(s => s.accession))];
    const previous = await this.dbs.db.select({ run: extractionRuns, document: sourceDocuments }).from(extractionRuns)
      .innerJoin(sourceDocuments, eq(sourceDocuments.id, extractionRuns.documentId))
      .where(and(eq(extractionRuns.projectId, request.projectId), eq(extractionRuns.teamId, teamId()), inArray(sourceDocuments.accession, accessions)))
      .orderBy(desc(extractionRuns.createdAt));
    if (accessions.some(accession => !previous.some(r => r.document.accession === accession))) throw new BadRequestException('Correction source documents must be ingested before re-reading');
    // Re-read each document/field selection once. The correction ID forces a fresh run
    // even for an existing active rule, while retries reuse its durable identity.
    await this.dbs.db.transaction(async tx => {
      const lockId = `policy:${teamId()}`;
      await tx.insert(serviceLocks).values({id: lockId}).onConflictDoNothing();
      await tx.select().from(serviceLocks).where(eq(serviceLocks.id, lockId)).for('update');
      const policyId = digest([teamId(), 'desk-correction', request.correctionId]);
      const policies = await tx.select().from(policyVersions).where(eq(policyVersions.teamId, teamId())).orderBy(desc(policyVersions.version));
      if (!policies.some(p => p.id === policyId)) {
        await tx.insert(policyVersions).values({id: policyId, teamId: teamId(), version: (policies[0]?.version ?? 0) + 1, lesson: `${rule.code}: ${rule.text}`, target: 'extractor'});
      }
      const queued = new Set<string>();
      for (const {run, document} of previous) {
        const fields = (run.specification as Specification).fields;
        const key = digest([document.id, [...fields].sort()]);
        if (queued.has(key)) continue;
        queued.add(key);
        const bundle = await this.specification(document.ticker, fields, tx);
        await this.queueDocument(tx, request.projectId, document.id, {version: bundle.version, spec: {...bundle.spec, correctionId: request.correctionId}});
      }
      const affectedBlocks = await tx.select({id: blocks.id}).from(blocks).where(inArray(blocks.sectionId, request.sectionIds));
      for (const block of affectedBlocks) await event(tx, request.projectId, 'block', {id: block.id, status: 'unchecked'});
      await event(tx, request.projectId, 'correction_queued', {correctionId: request.correctionId, ruleCode: rule.code, sectionIds: request.sectionIds});
    });
  }
  async registerFiling(job: ExtractionJob, requestId?: string, fields?: string[]) {
    const bundle = await this.specification(job.company.ticker, fields);
    return this.dbs.db.transaction(async tx => {
      const runs = [];
      for (const source of job.documents) {
        const checksum = digest(source.html); const documentId = digest([teamId(), job.accession, source.url, checksum]);
        await tx.insert(sourceDocuments).values({ id: documentId, teamId: teamId(), name: `${job.accession} ${source.type}`, ticker: job.company.ticker, accession: job.accession, format: 'html', content: source.html, checksum, sourceUrl: source.url,
          metadata: json({ company: job.company, filing: { ...job.filing, periodEnd: job.filing.form === '8-K' ? '' : job.filing.periodEnd }, publicationDate: job.filing.filedAt, releaseDate: job.filing.form === '8-K' ? job.filing.periodEnd : null }) }).onConflictDoNothing();
        runs.push(await this.queueDocument(tx, job.projectId, documentId, bundle, requestId));
      }
      return runs;
    });
  }
  async submitFeedback(input: {projectId: string; runId: string; text: string}, idempotencyKey?: string) {
    await this.assertProject(input.projectId);
    const [run] = await this.dbs.db.select().from(extractionRuns).where(and(eq(extractionRuns.id, input.runId), eq(extractionRuns.projectId, input.projectId)));
    if (!run?.output) throw new BadRequestException('Feedback needs an extracted run in this project');
    return this.dbs.db.transaction(async tx => {
      const key = `${teamId()}:${input.projectId}:feedback:${idempotencyKey ?? randomUUID()}`, fingerprint = digest(input);
      await tx.insert(extractionFeedback).values({ id: randomUUID(), teamId: teamId(), projectId: input.projectId, runId: input.runId, key, fingerprint, text: input.text }).onConflictDoNothing();
      const [row] = await tx.select().from(extractionFeedback).where(eq(extractionFeedback.key, key));
      if (row!.fingerprint !== fingerprint) throw new ConflictException('Idempotency key already used for different feedback');
      await enqueue(tx, `feedback:${row!.id}`, 'feedback', { feedbackId: row!.id });
      return { feedbackId: row!.id, state: row!.state, location: `/v1/data?projectId=${input.projectId}&feedbackId=${row!.id}` };
    });
  }
  async data(query: {projectId: string; requestId?: string; runId?: string; documentId?: string; feedbackId?: string; ticker?: string; periodEnd?: string; after?: number}) {
    await this.assertProject(query.projectId);
    const scoped = and(eq(extractionRuns.projectId, query.projectId), eq(extractionRuns.teamId, teamId()),
      query.runId ? eq(extractionRuns.id, query.runId) : undefined, query.requestId ? sql`exists (select 1 from request_runs rr where rr.run_id = ${extractionRuns.id} and rr.request_id = ${query.requestId})` : undefined,
      query.documentId ? eq(extractionRuns.documentId, query.documentId) : undefined);
    const [requests, joined, feedback, events, watchlist] = await Promise.all([
      this.dbs.db.select().from(extractionRequests).where(and(eq(extractionRequests.projectId, query.projectId), query.requestId ? eq(extractionRequests.id, query.requestId) : undefined)).orderBy(desc(extractionRequests.createdAt)).limit(50),
      this.dbs.db.select({run: extractionRuns, document: {id: sourceDocuments.id, name: sourceDocuments.name, ticker: sourceDocuments.ticker, accession: sourceDocuments.accession, sourceUrl: sourceDocuments.sourceUrl}}).from(extractionRuns).innerJoin(sourceDocuments, eq(sourceDocuments.id, extractionRuns.documentId)).where(and(scoped,
        query.ticker ? eq(sourceDocuments.ticker, query.ticker.toUpperCase()) : undefined,
        query.periodEnd ? sql`exists (select 1 from jsonb_array_elements(coalesce(${extractionRuns.output}->'facts', '[]'::jsonb)) f where f->'fact'->'period'->>'end' = ${query.periodEnd})` : undefined)).orderBy(desc(extractionRuns.createdAt)).limit(50),
      this.dbs.db.select().from(extractionFeedback).where(and(eq(extractionFeedback.projectId, query.projectId), query.feedbackId ? eq(extractionFeedback.id, query.feedbackId) : undefined)).orderBy(desc(extractionFeedback.createdAt)).limit(50),
      this.dbs.db.select().from(extractionEvents).where(and(eq(extractionEvents.projectId, query.projectId), gt(extractionEvents.id, query.after ?? 0))).orderBy(extractionEvents.id).limit(200),
      this.dbs.db.select().from(monitoringWatchlist).where(eq(monitoringWatchlist.projectId, query.projectId)),
    ]);
    return { requests, runs: joined.map(({ run, document }) => ({ ...run, document })), feedback, events, watchlist, nextCursor: events.at(-1)?.id ?? query.after ?? 0 };
  }
}
