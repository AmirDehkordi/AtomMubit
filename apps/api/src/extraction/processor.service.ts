import { Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { DEFAULT_EXTRACTION_FIELDS, MetricKey } from '@desk/shared';
import { config } from '../core/config';
import { DbService } from '../db/db.service';
import { blocks, checks, extractionRequests, extractionRuns, filings, monitoringWatchlist, projects, sections, sourceDocuments } from '../db/schema';
import { JobsService, enqueue, type Job } from '../jobs/jobs.service';
import { DocumentsService } from '../edgar/documents.service';
import { EdgarService } from '../edgar/edgar.service';
import { CONCEPTS } from '../xbrl/concepts';
import { XbrlService } from '../xbrl/xbrl.service';
import { MubitService } from '../mubit/mubit.service';
import { planExtraction } from '../agent/extraction-intent';
import { WorkflowService } from '../workflows/workflow.service';
import { EXTRACTION_TASK_VERSION } from './policy';
import { ExtractionEngine, type EngineInput, type EngineResult } from './engine';
import { ExtractionService, digest, event, json, teamId, type Specification } from './extraction.service';

@Injectable()
export class ProcessorService {
  constructor(private readonly dbs: DbService, private readonly jobs: JobsService, private readonly extraction: ExtractionService,
    private readonly documents: DocumentsService, private readonly edgar: EdgarService, private readonly model: MubitService,
    private readonly workflows: WorkflowService, private readonly xbrl: XbrlService) {}

  async checkPlannerLesson(feedbackId: string, lesson: string, ticker: string | null) {
    const requests = await this.dbs.db.select().from(extractionRequests).where(and(eq(extractionRequests.teamId,teamId()),eq(extractionRequests.state,'completed'))).orderBy(desc(extractionRequests.createdAt)).limit(20);
    const examples = requests.filter(r=>r.plan?.intent && (!ticker || ((r.plan.intent as {tickers:string[]}).tickers ?? []).includes(ticker))).slice(0,2);
    const rules = await this.extraction.plannerRules();
    const failures:string[]=[];
    for(const request of examples) {
      const previous = request.plan!.intent as Awaited<ReturnType<typeof planExtraction>>;
      const next = await planExtraction(this.model,`${feedbackId}:${request.id}`,{request:request.text,documentIds:request.plan?.documentIds??[],asOf:request.createdAt.toISOString(),rules:{...rules,scopedRules:[...rules.scopedRules,{ticker,lesson,target:'planner',version:'candidate'}]}});
      const signature = (p:typeof previous)=>digest([[...p.tickers].sort(),[...p.fields].sort(),p.fiscalYear,p.lastNQuarters,p.clarification]);
      if(signature(previous)!==signature(next))failures.push(request.id);
    }
    return {examples:examples.length,failures};
  }
  async ingest(job: Job) {
    const p = job.payload as {accession: string; projectId: string; requestId?: string; fields?: string[]};
    const document = await this.documents.job(p.accession, p.projectId);
    await this.extraction.registerFiling(document, p.requestId, p.fields);
    await this.addWatchlist(p.projectId,document.company.ticker);
  }

  async plan(job: Job) {
    const id = String(job.payload.requestId);
    const [request] = await this.dbs.db.select().from(extractionRequests).where(eq(extractionRequests.id, id));
    if (!request || !['queued', 'running'].includes(request.state)) return;
    const documents = z.array(z.string()).parse(request.plan?.documentIds ?? []);
    const parents: (typeof extractionRequests.$inferSelect)[] = [];
    let parentId = request.parentId;
    while(parentId && parents.length < 10) {
      const [parent] = await this.dbs.db.select().from(extractionRequests).where(and(eq(extractionRequests.id,parentId),eq(extractionRequests.projectId,request.projectId)));
      if(!parent) break; parents.unshift(parent); parentId=parent.parentId;
    }
    const bundle = await this.extraction.plannerRules();
    // Retain interpreted intent: relative dates and model choices are resolved once per request.
    const stored = request.plan?.intent;
    const intent = stored as Awaited<ReturnType<typeof planExtraction>> | undefined ?? await planExtraction(this.model, id, {
      request: request.text, parent: parents.map(p => ({request: p.text, question: p.question})),
      documentIds: documents, asOf: (parents[0]?.createdAt ?? request.createdAt).toISOString(), rules: bundle,
    });
    await this.jobs.withLease(job, async tx => {
      await tx.update(extractionRequests).set({ state: intent.clarification || (!intent.tickers.length && !documents.length) ? 'needs_clarification' : 'running',
        question: intent.clarification ?? (!intent.tickers.length && !documents.length ? 'Which company or uploaded document should I extract?' : null),
        plan: json({ documentIds: documents, intent }) }).where(eq(extractionRequests.id, id));
      await event(tx, request.projectId, 'request_planned', { requestId: id, intent });
    });
    if (intent.clarification || (!intent.tickers.length && !documents.length)) return;
    for (const ticker of intent.tickers) {
      let found;
      try { found = await this.edgar.findFilings({ ticker, forms: ['10-Q', '10-K', '8-K'], lastNQuarters: intent.lastNQuarters, fiscalYear: intent.fiscalYear }); }
      catch (error) {
        if ((error as {status?: number}).status === 404) {
          await this.jobs.withLease(job, async tx => {
            await tx.update(extractionRequests).set({ state: 'needs_clarification', question: `I could not resolve ${ticker} in SEC EDGAR. Which ticker did you mean?` }).where(eq(extractionRequests.id, id));
          });
          return;
        }
        throw error;
      }
      await this.addWatchlist(request.projectId, found.company.ticker);
      for (const filing of found.filings) await this.extraction.submitFiling(filing.accession, request.projectId, id, intent.fields);
    }
    for (const documentId of documents) {
      const [document] = await this.dbs.db.select().from(sourceDocuments).where(eq(sourceDocuments.id, documentId));
      const spec = await this.extraction.specification(document?.ticker, intent.fields);
      await this.jobs.withLease(job, async tx => { await this.extraction.queueDocument(tx, request.projectId, documentId, spec, id); });
    }
  }
  async addWatchlist(projectId: string, ticker: string) {
    const id = digest([teamId(), projectId, ticker]);
    await this.dbs.db.transaction(async tx => {
      await tx.insert(monitoringWatchlist).values({ id, teamId: teamId(), projectId, ticker }).onConflictDoNothing();
      await enqueue(tx, `discover:initial:${id}`, 'discover', {watchlistId: id});
    });
  }
  async discover(job: Job) {
    const id = String(job.payload.watchlistId);
    const [member] = await this.dbs.db.select().from(monitoringWatchlist).where(eq(monitoringWatchlist.id, id));
    if (!member) return;
    const found = await this.edgar.findFilings({ ticker: member.ticker, forms: ['10-Q', '10-K', '8-K'], lastNQuarters: 4, fiscalYear: null });
    for (const filing of found.filings) await this.extraction.submitFiling(filing.accession, member.projectId);
    await this.jobs.withLease(job, async tx => {
      await tx.update(monitoringWatchlist).set({lastCheckedAt: new Date(), error: null}).where(eq(monitoringWatchlist.id, id));
      await event(tx, member.projectId, 'discovered', {ticker: member.ticker, count: found.filings.length, warnings: found.warnings});
    });
  }
  async schedule() {
    if (!process.env.SEC_USER_AGENT?.trim()) return; // Local uploads work without SEC credentials.
    const id = `monitoring-${teamId()}`;
    await this.dbs.db.insert(projects).values({ id, teamId: teamId(), title: 'Automatic SEC monitoring' }).onConflictDoNothing();
    for (const ticker of (process.env.WATCHLIST_TICKERS || 'AAPL,MSFT,NVDA,WMT,JPM').split(',').map(t=>t.trim().toUpperCase()).filter(t=>/^[A-Z0-9.-]{1,12}$/.test(t))) await this.addWatchlist(id, ticker);
    const members = await this.dbs.db.select().from(monitoringWatchlist).where(eq(monitoringWatchlist.teamId, teamId()));
    const bucket = Math.floor(Date.now() / (5 * 60_000));
    await this.dbs.db.transaction(async tx => {
      for (const member of members) await enqueue(tx, `discover:${member.id}:${bucket}`, 'discover', {watchlistId: member.id});
    });
  }
  async engine(input: EngineInput, options?: {job?: Job; checkpoint?: Record<string, unknown>}) {
    const engine = new ExtractionEngine({
      concurrency: 2,
      callJson: async call => {
        const key = digest(call);
        const previous = options?.checkpoint?.[key] as {output: unknown; requestId: string | null} | undefined;
        if (previous) return previous;
        const result = await this.workflows.run('section_extractor', input.runId, call);
        if (options?.job) await this.jobs.withLease(options.job, async tx => {
          await tx.update(extractionRuns).set({output: sql`jsonb_set(coalesce(${extractionRuns.output}, '{"checkpoint":{}}'::jsonb), array['checkpoint', ${key}], ${JSON.stringify(result)}::jsonb, true)`}).where(eq(extractionRuns.id, input.runId));
        });
        return result;
      },
      referenceFact: async fact => {
        const metric = MetricKey.safeParse(fact.key);
        // Quarterly reported XBRL only; derived Q4/EPS and YTD references cannot validate a printed observation.
        if (!metric.success || fact.period?.months !== 3 || fact.basis !== 'GAAP' || !input.company?.ticker) return null;
        try {
          const company = await this.edgar.company(input.company.ticker);
          const reference = await this.xbrl.quarterValue(company.cik, metric.data, fact.period.end);
          if (reference.value === null || reference.approximate || reference.method !== 'reported') return null;
          const sourceUnit = CONCEPTS[metric.data].unit;
          return {value: reference.value, currency: sourceUnit.startsWith('USD') ? 'USD' : '', unit: sourceUnit === 'USD/shares' ? 'USD/share' : sourceUnit, basis: 'GAAP', periodEnd: fact.period.end, months: 3, method: 'reported'};
        } catch { return null; } // The check explicitly remains unknown; extraction does not fabricate a pass.
      },
      onSection: options?.job ? async ({section, blocks, facts}) => {
        await this.jobs.withLease(options.job!, async tx => {
          const [run] = await tx.select().from(extractionRuns).where(eq(extractionRuns.id, input.runId));
          if (run) await event(tx, run.projectId, 'section_completed', { sectionId: section.id, blocks: blocks.length, facts: facts.length }, input.runId);
        });
      } : undefined,
    });
    return engine.run(input);
  }
  async extract(job: Job) {
    const runId = String(job.payload.runId);
    const [run] = await this.dbs.db.select().from(extractionRuns).where(eq(extractionRuns.id, runId));
    if (!run || ['completed', 'needs_review'].includes(run.state)) return;
    const [document] = await this.dbs.db.select().from(sourceDocuments).where(eq(sourceDocuments.id, run.documentId));
    if (!document) throw new Error('Source document missing');
    const spec = run.specification as Specification;
    if (spec.taskFingerprint !== EXTRACTION_TASK_VERSION) throw new Error('Pinned extraction task changed; enqueue a new revision.');
    if ((spec.inferenceBackend ?? 'openrouter') !== config.inferenceBackend) throw new Error('Pinned inference backend changed; submit a new extraction revision.');
    if (spec.model !== config.extractorModel) throw new Error('Pinned model changed; enqueue a new revision rather than mutating this run');
    await this.jobs.withLease(job, async tx => {
      await tx.update(extractionRuns).set({state:'running', error: null}).where(eq(extractionRuns.id, runId));
      await event(tx, run.projectId, 'running', {documentId: document.id}, runId);
      if (document.accession) await tx.update(filings).set({status: 'reading'}).where(eq(filings.accession, document.accession));
    });
    const result = await this.engine(this.engineInput(runId, document, spec), {job, checkpoint: run.output?.checkpoint as Record<string, unknown> | undefined});
    const needsReview = result.missingFields.length > 0 || result.facts.some(f => f.status === 'review' && !f.fact.missingReason) || result.blocks.some(b => b.status === 'review') || result.attempts.some(a => a.attempt === 1 && a.error);
    await this.jobs.withLease(job, async tx => {
      // Serialize accepted selection by document, and never let an older rule bundle replace a newer one.
      await tx.select().from(sourceDocuments).where(eq(sourceDocuments.id, document.id)).for('update');
      const [newer] = await tx.select().from(extractionRuns).where(and(eq(extractionRuns.documentId, document.id), eq(extractionRuns.projectId, run.projectId), eq(extractionRuns.accepted, true), sql`${extractionRuns.specification}->'fields' = ${JSON.stringify(spec.fields)}::jsonb`)).orderBy(desc(extractionRuns.ruleVersion), desc(extractionRuns.createdAt)).limit(1);
      const accept = !needsReview && (!newer || run.ruleVersion > newer.ruleVersion || (run.ruleVersion === newer.ruleVersion && run.createdAt >= newer.createdAt));
      if (accept) await tx.update(extractionRuns).set({accepted:false}).where(and(eq(extractionRuns.documentId, document.id), eq(extractionRuns.projectId, run.projectId),sql`${extractionRuns.specification}->'fields' = ${JSON.stringify(spec.fields)}::jsonb`));
      await tx.update(extractionRuns).set({state: needsReview ? 'needs_review' : 'completed', output: json(result), accepted: accept, completedAt: new Date()}).where(eq(extractionRuns.id, runId));
      if (document.accession) {
        for (const section of result.sections) await tx.insert(sections).values({id:section.id, accession:document.accession, item: section.item, title: section.title, kind: section.kind, ordinal: section.ordinal, text: section.text, charCount: section.charCount}).onConflictDoNothing();
        for (const block of result.blocks) {
          await tx.insert(blocks).values({id:block.id, sectionId:block.sectionId, accession:document.accession, type:block.type, key:block.key, label:block.label, periodEnd:block.period?.end, months:block.period?.months, value:block.value, unit:block.unit, scale:block.scale, text:block.text, quote:block.quote, spanStart:block.span?.start, spanEnd:block.span?.end, status:block.status, mubitRequestId:block.requestId}).onConflictDoNothing();
          for (const [i, check] of block.checks.entries()) await tx.insert(checks).values({id:`${block.id}:check:${i}`, blockId:block.id, verifier:check.verifier, passed:check.outcome === 'pass', detail:`${check.outcome}: ${check.detail}`}).onConflictDoNothing();
        }
        await tx.update(filings).set({status: 'ready'}).where(eq(filings.accession, document.accession));
      }
      await event(tx, run.projectId, 'extraction_completed', {state: needsReview ? 'needs_review' : 'completed', accepted: accept, documentId: document.id, accession: document.accession}, runId);
    });
  }
  engineInput(runId: string, document: typeof sourceDocuments.$inferSelect, spec: Specification): EngineInput {
    return {runId, documentId:document.id, content:document.content, format: document.format === 'html' ? 'html' : 'text', sourceUrl:document.sourceUrl ?? undefined,
      company:document.metadata.company as EngineInput['company'], filing: document.metadata.filing as EngineInput['filing'], requestedFields:spec.fields, rules:spec.rules};
  }
}
