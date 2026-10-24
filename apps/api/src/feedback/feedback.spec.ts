import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { eq, sql } from 'drizzle-orm';
import { resolve } from 'node:path';
import type { Db, DbService } from '../db/db.service';
import * as schema from '../db/schema';
import { extractionFeedback, extractionRuns, policyVersions, projects, sourceDocuments, workJobs } from '../db/schema';
import { JobsService } from '../jobs/jobs.service';
import { ExtractionService, type Specification } from '../extraction/extraction.service';
import type { ProcessorService } from '../extraction/processor.service';
import type { WorkflowService } from '../workflows/workflow.service';
import type { EngineFact, EngineResult } from '../extraction/engine';
import { FeedbackService, regressionErrors } from './feedback.service';

function observation(id = 'revenue', end = '2026-07-26', months: 3 | 12 = 3): EngineFact {
  return { id, sectionId: 'section', attemptId: 'attempt', requestId: 'model', status: 'verified', supported: true, normalized: null,
    span: { start: 0, end: 11, offsetUnit: 'utf16' }, checks: [], fact: { key: 'revenue', label: 'Revenue', basis: 'GAAP', currency: 'USD',
      period: { start: null, end, months, fiscalYear: 2027, fiscalPeriod: months === 12 ? 'FY' : 'Q2' }, value: 100, range: null,
      unit: 'USD', scale: 'millions', qualifier: null, missingReason: null, quote: 'Revenue 100' } };
}
const result = (facts: EngineFact[] = [observation()]): EngineResult => ({ facts, sections: [], blocks: [], attempts: [], checks: [], missingFields: [] });
const preference = { decision: 'apply', reason: 'Clear reporting preference', kind: 'preference', target: 'both', scope: 'company', lesson: 'Keep annual observations labeled as 12 months.', factKey: null, evidence: null };

describe('feedback regression gate', () => {
  it('rejects loss or value changes of an uncorrected supported observation', () => {
    const old = result();
    expect(regressionErrors(old, result([]), null)).toEqual(['revenue']);
    const changed = structuredClone(old); changed.facts[0]!.fact.value = 200;
    expect(regressionErrors(old, changed, null)).toEqual(['revenue']);
    expect(regressionErrors(old, changed, 'revenue')).toEqual([]);
  });
  it('a correction cannot silently drop another period of the same metric', () => {
    const previous = observation('prior', '2025-07-26');
    expect(regressionErrors(result([observation(), previous]), result(), 'revenue')).toEqual(['prior']);
  });
});

describe('feedback policy activation against migrated PostgreSQL', () => {
  let client: PGlite; let db: PgliteDatabase<typeof schema>; let extraction: ExtractionService; let jobs: JobsService; let feedback: FeedbackService;
  const candidate = vi.fn(); const workflow = vi.fn(); const snapshots = new Map<string, EngineResult>();
  let spec: Specification;
  beforeAll(async () => {
    vi.stubEnv('TEAM_ID', 'internal'); client = new PGlite(); db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../drizzle') });
    const dbs = { db: db as unknown as Db } as DbService;
    extraction = new ExtractionService(dbs); jobs = new JobsService(dbs);
    const processor = { checkPlannerLesson: async()=>({examples:1,failures:[]}), engine: candidate, engineInput: (runId: string, document: {id: string}, specification: Specification) => ({runId, documentId: document.id, rules: specification.rules}) } as unknown as ProcessorService;
    feedback = new FeedbackService(dbs, jobs, extraction, processor, { run: workflow } as unknown as WorkflowService);
  }, 60_000);
  beforeEach(async () => {
    await db.execute(sql`TRUNCATE projects, source_documents, extraction_runs, extraction_feedback, work_jobs, extraction_events, policy_versions, service_locks, rules RESTART IDENTITY CASCADE`);
    workflow.mockReset(); candidate.mockReset(); snapshots.clear();
    workflow.mockResolvedValue({ output: preference, requestId: 'evaluation' });
    candidate.mockImplementation(async (input: {documentId: string}) => structuredClone(snapshots.get(input.documentId) ?? result()));
    await db.insert(projects).values([{id:'desk',teamId:'internal',title:'Desk'}, {id:'foreign',teamId:'another-team',title:'Foreign'}]);
    spec = (await extraction.specification('NVDA')).spec;
    await seed('current', 'NVDA', result());
  });
  afterAll(async () => { await client?.close(); vi.unstubAllEnvs(); });
  async function seed(id: string, ticker: string, output: EngineResult, teamId = 'internal') {
    snapshots.set(id, output);
    await db.insert(sourceDocuments).values({id,teamId,ticker,name:`${id}.txt`,format:'text',checksum:id,content:'Revenue 100',metadata:{}});
    await db.insert(extractionRuns).values({id:`run-${id}`,identity:`identity-${id}`,teamId,projectId:teamId === 'internal' ? 'desk' : 'foreign',documentId:id,state:'completed',accepted:true,specification:spec,output:output as unknown as Record<string, unknown>});
  }
  async function process(text = 'Keep the annual reporting period explicit') {
    const receipt = await extraction.submitFeedback({projectId:'desk',runId:'run-current',text}, 'feedback-key');
    const job = (await jobs.claim())!; await feedback.process(job);
    return { receipt, job, row: (await db.select().from(extractionFeedback).where(eq(extractionFeedback.id, receipt.feedbackId)))[0]! };
  }
  it('defers a factual correction whose evidence is absent, without a replay or rule', async () => {
    workflow.mockResolvedValue({output:{...preference,kind:'correction',factKey:'revenue',evidence:'Invented evidence'},requestId:'evaluation'});
    const {row} = await process('The revenue number is wrong');
    expect(row.state).toBe('deferred'); expect(row.decision?.reason).toContain('exact evidence'); expect(candidate).not.toHaveBeenCalled();
    expect(await db.select().from(policyVersions)).toHaveLength(0);
  });
  it('defers a candidate that loses supported facts and preserves the accepted revision', async () => {
    candidate.mockResolvedValue(result([]));
    const {row} = await process();
    expect(row.state).toBe('deferred'); expect(row.decision?.reason).toContain('lost previously supported');
    expect(await db.select().from(policyVersions)).toHaveLength(0);
    expect((await db.select().from(extractionRuns))[0]?.accepted).toBe(true);
  });
  it('activates a scoped company preference, reprocesses annual sources and preserves prior accepted results', async () => {
    await seed('annual', 'NVDA', result([observation('annual-revenue','2026-01-25',12)]));
    await seed('other-company','MSFT',result()); await seed('foreign-company','NVDA',result(),'another-team');
    const {job,row} = await process();
    expect(row.state).toBe('applied');
    const [policy] = await db.select().from(policyVersions);
    expect(policy?.ticker).toBe('NVDA'); expect(policy?.target).toBe('both'); expect(policy?.version).toBe(1);
    const runs = await db.select().from(extractionRuns);
    const queued = runs.filter(r=>r.state==='queued');
    expect(queued.map(r=>r.documentId).sort()).toEqual(['annual','current']);
    expect(queued.every(r=>r.ruleVersion===1 && !r.accepted)).toBe(true);
    expect(runs.filter(r=>r.state==='completed').every(r=>r.accepted)).toBe(true);
    // Reprocessing is bounded and does not create its own feedback or activate again.
    await feedback.process(job);
    expect(workflow).toHaveBeenCalledTimes(1); expect(await db.select().from(extractionFeedback)).toHaveLength(1);
    expect(await db.select().from(policyVersions)).toHaveLength(1);
    expect((await db.select().from(workJobs)).filter(j=>j.kind==='extract')).toHaveLength(2);
  });
  it('keeps confirmed desk rules alongside evaluated policy lessons in requeued runs', async () => {
    await db.insert(schema.rules).values({id: 'desk-rule', code: 'R10', text: 'Use consolidated totals.', source: 'user', active: true});
    const {row} = await process();
    expect(row.state).toBe('applied');
    const queued = (await db.select().from(extractionRuns)).filter(r => r.state === 'queued');
    expect(queued).toHaveLength(1);
    expect(queued[0]!.specification.rules).toContain('R10: Use consolidated totals.');
    expect(queued[0]!.specification.rules).toContain(preference.lesson);
  });
  it('defers a rule that regresses a peer development document', async () => {
    await seed('peer','NVDA',result());
    candidate.mockImplementation(async (input:{documentId:string})=>input.documentId==='peer'?result([]):result());
    const {row}=await process(); expect(row.state).toBe('deferred'); expect(row.decision?.reason).toContain('another development example');
    expect(await db.select().from(policyVersions)).toHaveLength(0);
  });
  it('extractor-only lessons are excluded from planner runtime context', async () => {
    await db.insert(policyVersions).values({id:'extractor-policy',teamId:'internal',version:1,ticker:'NVDA',lesson:'Use the printed table scale.',target:'extractor'});
    expect((await extraction.plannerRules()).scopedRules).toHaveLength(0);
    expect((await extraction.specification('NVDA')).spec.rules).toContain('Use the printed table scale.');
  });
  it('planner-only lessons are excluded from extraction runtime context', async () => {
    await db.insert(policyVersions).values({id:'planner-policy',teamId:'internal',version:1,ticker:'NVDA',lesson:'Clarify an ambiguous company name.',target:'planner'});
    expect((await extraction.plannerRules()).scopedRules).toEqual([expect.objectContaining({ticker:'NVDA',lesson:'Clarify an ambiguous company name.'})]);
    expect((await extraction.specification('NVDA')).spec.rules).not.toContain('Clarify an ambiguous company name.');
  });
  it('persists an evaluator rejection without starting candidate extraction', async () => {
    workflow.mockResolvedValue({output:{...preference,decision:'reject',reason:'Contradicts source'},requestId:'evaluation'});
    const {row}=await process(); expect(row.state).toBe('rejected'); expect(candidate).not.toHaveBeenCalled();
  });
});
