import { Injectable } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { extractionFeedback, extractionRuns, policyVersions, serviceLocks, sourceDocuments } from '../db/schema';
import { JobsService, type Job } from '../jobs/jobs.service';
import { WorkflowService, FeedbackDecision } from '../workflows/workflow.service';
import { ExtractionService, digest, event, json, teamId, type Specification } from '../extraction/extraction.service';
import { ProcessorService } from '../extraction/processor.service';
import { STARTER_RULES } from '../extraction/policy';
import { cleanHtml } from '../extraction/preparation';
import type { EngineResult } from '../extraction/engine';

/** Supported observations must survive a candidate rule unless explicitly being corrected. */
export function regressionErrors(before: EngineResult, after: EngineResult, correctedKey: string | null) {
  // PostgreSQL JSONB reorders object keys. Compare explicit field tuples rather
  // than JSON.stringify(period/range), or identical replay facts look changed.
  const context = (entry: EngineResult['facts'][number]) => {
    const f = entry.fact, p = f.period;
    return digest([f.key, p ? [p.start,p.end,p.months,p.fiscalYear,p.fiscalPeriod] : null, f.basis,f.currency,f.unit]);
  };
  const amount = (entry: EngineResult['facts'][number]) => {
    const f = entry.fact;
    return digest([f.value,f.range ? [f.range.low,f.range.high] : null,f.scale]);
  };
  return before.facts.filter(f => f.supported).filter(old => !after.facts.some(next => next.supported &&
    context(next) === context(old) && (old.fact.key === correctedKey || amount(next) === amount(old)))).map(f => f.id);
}

@Injectable()
export class FeedbackService {
  constructor(private readonly dbs: DbService, private readonly jobs: JobsService, private readonly extraction: ExtractionService,
    private readonly processor: ProcessorService, private readonly workflows: WorkflowService) {}
  async process(job: Job) {
    const feedbackId = String(job.payload.feedbackId);
    const [feedback] = await this.dbs.db.select().from(extractionFeedback).where(eq(extractionFeedback.id, feedbackId));
    if (!feedback || ['applied', 'deferred', 'rejected'].includes(feedback.state)) return;
    if (feedback.teamId !== teamId()) throw new Error('Feedback belongs to another team');
    const [run] = await this.dbs.db.select().from(extractionRuns).where(eq(extractionRuns.id, feedback.runId));
    if (!run?.output) throw new Error('Feedback source run is missing');
    if (run.teamId !== feedback.teamId || run.projectId !== feedback.projectId) throw new Error('Feedback run scope does not match');
    const [document] = await this.dbs.db.select().from(sourceDocuments).where(eq(sourceDocuments.id, run.documentId));
    if (!document) throw new Error('Feedback source document missing');
    if (document.teamId !== feedback.teamId) throw new Error('Feedback source belongs to another team');
    const source = document.format === 'html' ? cleanHtml(document.content) : document.content;
    await this.jobs.withLease(job, async tx => { await tx.update(extractionFeedback).set({state:'evaluating'}).where(eq(extractionFeedback.id, feedbackId)); });
    const bundle = await this.extraction.specification(document.ticker, (run.specification as Specification).fields);
    const evaluation = await this.workflows.run('feedback_evaluator', feedbackId, {
      feedback: feedback.text, source: source.slice(0, 60000), extraction: {facts: (run.output.facts as unknown[] ?? []).slice(0,100), missingFields: run.output.missingFields},
      rules: bundle.spec.rules, company: document.ticker, sourceTruncated: source.length > 60000,
    });
    const decision = FeedbackDecision.parse(evaluation.output);
    let reason = decision.reason, apply = decision.decision === 'apply';
    if (apply && (!decision.lesson?.trim() || /[$€£]\s*\d|\b\d{2,}(?:\.\d+)?\b/.test(decision.lesson.replace(/\b(?:3|6|9|12)[ -]months?\b/gi, 'reporting duration')))) {
      apply = false; reason = 'A reusable rule is required; hardcoded numeric answers are not accepted as house rules.';
    }
    if (apply && decision.scope === 'company' && !document.ticker) { apply = false; reason = 'Company scope cannot be activated until the uploaded company is identified.'; }
    if (apply && decision.kind === 'correction' && (!decision.factKey || !decision.evidence?.trim() || !source.includes(decision.evidence))) {
      apply = false; reason = 'A factual correction needs a named fact and exact evidence from this document.';
    }
    const regression: {runId: string; lostFactIds: string[]}[] = [];
    let plannerReplay: {examples:number;failures:string[]} | null = null;
    if(apply && decision.target !== 'extractor') {
      plannerReplay = await this.processor.checkPlannerLesson(feedbackId,decision.lesson!,decision.scope==='company'?document.ticker:null);
      if(plannerReplay.failures.length || (decision.target==='planner' && !plannerReplay.examples)) {apply=false;reason='Planner regression evidence is missing or the candidate changed a previously accepted extraction intent.';}
    }
    if (apply && decision.target !== 'planner') {
      const targetSpec: Specification = {...bundle.spec, rules: [...bundle.spec.rules, decision.lesson!]};
      const candidate = await this.processor.engine(this.processor.engineInput(feedbackId, document, targetSpec));
      const lostFactIds = regressionErrors(run.output as unknown as EngineResult, candidate, decision.kind === 'correction' ? decision.factKey : null);
      regression.push({runId: run.id, lostFactIds});
      if (lostFactIds.length) { apply = false; reason = 'Candidate rule lost previously supported observations in the development replay.'; }
      if (decision.kind === 'correction' && !candidate.facts.some(f => f.supported && f.fact.key === decision.factKey && !!decision.evidence && (f.fact.quote.includes(decision.evidence) || decision.evidence.includes(f.fact.quote)))) {
        apply = false; reason = 'Development replay did not produce the corrected fact with the supplied evidence.';
      }
      // Bounded development replay on two other latest accepted source documents.
      const peers = await this.dbs.db.select({run: extractionRuns, document: sourceDocuments}).from(extractionRuns).innerJoin(sourceDocuments, eq(sourceDocuments.id, extractionRuns.documentId))
        .where(and(eq(extractionRuns.teamId, teamId()), eq(extractionRuns.accepted, true), sql`${extractionRuns.id} <> ${run.id}`, decision.scope === 'company' ? eq(sourceDocuments.ticker, document.ticker!) : undefined))
        .orderBy(desc(extractionRuns.createdAt)).limit(2);
      for (const peer of apply ? peers : []) {
        const previous = peer.run.output as unknown as EngineResult;
        const next = await this.processor.engine(this.processor.engineInput(feedbackId, peer.document, { ...peer.run.specification as Specification, rules: [...(peer.run.specification as Specification).rules, decision.lesson!] }));
        const lost = regressionErrors(previous, next, null); regression.push({runId:peer.run.id, lostFactIds:lost});
        if (lost.length) { apply = false; reason = 'Candidate rule regressed another development example.'; break; }
      }
    }
    await this.jobs.withLease(job, async tx => {
      const lockId = `policy:${teamId()}`;
      await tx.insert(serviceLocks).values({id:lockId}).onConflictDoNothing();
      await tx.select().from(serviceLocks).where(eq(serviceLocks.id, lockId)).for('update');
      const policies = await tx.select().from(policyVersions).where(eq(policyVersions.teamId, teamId())).orderBy(desc(policyVersions.version));
      const relevant = policies.filter(p => p.active && (!p.ticker || p.ticker === document.ticker));
      if (apply && Math.max(0, ...relevant.map(p => p.version)) !== bundle.version) { apply = false; reason = 'Applicable policy changed during evaluation; defer this stale proposal and resubmit against the latest policy.'; }
      let version: number | null = null;
      if (apply) {
        version = (policies[0]?.version ?? 0) + 1;
        await tx.insert(policyVersions).values({id:digest([teamId(), version]), teamId:teamId(), version, ticker:decision.scope === 'company' ? document.ticker : null, feedbackId, lesson:decision.lesson!, target:decision.target});
        // Select four latest actual reporting periods per company. The correction's source is always included.
        const affected = await tx.select({run:extractionRuns, document:sourceDocuments}).from(extractionRuns).innerJoin(sourceDocuments, eq(sourceDocuments.id, extractionRuns.documentId))
          .where(and(eq(extractionRuns.teamId, teamId()), sql`${extractionRuns.output} is not null`, decision.scope === 'company' ? eq(sourceDocuments.ticker, document.ticker!) : undefined))
          .orderBy(desc(extractionRuns.createdAt));
        const periods = new Map<string, Set<string>>();
        for (const entry of affected) {
          const key = entry.document.ticker ?? entry.document.id;
          const filing = entry.document.metadata.filing as { form?: string; periodEnd?: string } | undefined;
          const dates = filing?.form !== '8-K' && filing?.periodEnd
            ? [filing.periodEnd]
            : ((entry.run.output as unknown as EngineResult).facts ?? []).flatMap(f => f.supported && f.fact.period ? [f.fact.period.end] : []);
          const set = periods.get(key) ?? new Set<string>(); dates.forEach(d => set.add(d)); periods.set(key, set);
        }
        for (const [key, values] of periods) periods.set(key, new Set([...values].sort().reverse().slice(0,4)));
        const queued = new Set<string>();
        for (const entry of affected) {
          const identity = `${entry.run.projectId}:${entry.document.id}:${digest((entry.run.specification as Specification).fields)}`;
          if (queued.has(identity)) continue;
          const actual = (entry.run.output as unknown as EngineResult).facts ?? [];
          const filing = entry.document.metadata.filing as { form?: string; periodEnd?: string } | undefined;
          const selected = periods.get(entry.document.ticker ?? entry.document.id);
          const reporting = filing?.form !== '8-K' && filing?.periodEnd ? selected?.has(filing.periodEnd)
            : actual.some(f => f.supported && f.fact.period && selected?.has(f.fact.period.end));
          if (entry.document.id !== document.id && !reporting) continue;
          queued.add(identity);
          const applicable = policies.filter(p => p.active && p.target !== 'planner' && (!p.ticker || p.ticker === entry.document.ticker)).reverse().map(p=>p.lesson);
          const spec = entry.run.specification as Specification;
          await this.extraction.queueDocument(tx, entry.run.projectId, entry.document.id, {version, spec:{...spec, rules:[...STARTER_RULES,...applicable,...(decision.target==='planner'?[]:[decision.lesson!])]}});
        }
      }
      const state = apply ? 'applied' : decision.decision === 'reject' ? 'rejected' : 'deferred';
      await tx.update(extractionFeedback).set({state, decision:json({...decision, reason, ruleVersion:version, regression, plannerReplay, requestId:evaluation.requestId})}).where(eq(extractionFeedback.id, feedbackId));
      await event(tx, feedback.projectId, 'feedback_evaluated', {feedbackId,state,reason,ruleVersion:version}, run.id);
    });
  }
}
