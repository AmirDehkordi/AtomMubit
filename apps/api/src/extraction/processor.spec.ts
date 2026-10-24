import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { eq, sql } from 'drizzle-orm';
import { resolve } from 'node:path';
import type { ExtractionFactV2 } from '@desk/shared';
import type { Db, DbService } from '../db/db.service';
import * as schema from '../db/schema';
import { extractionRuns, policyVersions, projects, sourceDocuments, workJobs } from '../db/schema';
import { JobsService } from '../jobs/jobs.service';
import type { DocumentsService } from '../edgar/documents.service';
import type { EdgarService } from '../edgar/edgar.service';
import type { MubitService } from '../mubit/mubit.service';
import type { WorkflowService } from '../workflows/workflow.service';
import type { XbrlService } from '../xbrl/xbrl.service';
import { ExtractionService, type Specification } from './extraction.service';
import { ProcessorService } from './processor.service';
import type { SectionCallInput } from './engine';
const text = 'USD in millions except per share data. Three months ended July 26, 2026.\nRevenue 100\nNet income 20\nDiluted EPS 2';
function facts(): ExtractionFactV2[] {
  return [['revenue','Revenue',100,'USD','millions'],['net_income','Net income',20,'USD','millions'],['eps_diluted','Diluted EPS',2,'USD/share','units']].map(([key,label,value,unit,scale]) => ({
    key: key as string,label:label as string,basis:'GAAP',currency:'USD',period:{start:null,end:'2026-07-26',months:3,fiscalYear:2027,fiscalPeriod:'Q2'},
    value:value as number,range:null,unit:unit as string,scale:scale as 'millions'|'units',qualifier:null,missingReason:null,quote:`${label} ${value}`,
  }));
}

describe('real extraction processor acceptance and restart integration', () => {
  let client:PGlite; let db:PgliteDatabase<typeof schema>; let dbs:DbService; let extraction:ExtractionService; let jobs:JobsService; let processor:ProcessorService;
  const workflow = vi.fn();
  const edgar = {company:vi.fn(async()=>({cik:1,ticker:'NVDA'}))} as unknown as EdgarService;
  const xbrl = {quarterValue:vi.fn(async()=>({value:null,method:null,approximate:false}))} as unknown as XbrlService;
  const makeProcessor = () => new ProcessorService(dbs,jobs,extraction,{} as DocumentsService,edgar,{} as MubitService,{run:workflow} as unknown as WorkflowService,xbrl);
  beforeAll(async()=>{
    vi.stubEnv('TEAM_ID','internal'); client=new PGlite(); db=drizzle(client,{schema});
    await migrate(db,{migrationsFolder:resolve(__dirname,'../../drizzle')});
    dbs={db:db as unknown as Db} as DbService; extraction=new ExtractionService(dbs); jobs=new JobsService(dbs); processor=makeProcessor();
  },60_000);
  beforeEach(async()=>{
    await db.execute(sql`TRUNCATE projects, source_documents, extraction_runs, extraction_requests, extraction_feedback, work_jobs, extraction_events, policy_versions RESTART IDENTITY CASCADE`);
    await db.insert(projects).values({id:'desk',teamId:'internal',title:'Desk'});
    workflow.mockReset(); workflow.mockResolvedValue({output:{schemaVersion:'2',blocks:[],facts:facts()},requestId:'offline-model'});
  });
  afterAll(async()=>{await client?.close();vi.unstubAllEnvs();});
  async function upload(content=text, name='earnings.txt') {
    await extraction.upload('desk',name,Buffer.from(content));
    return (await db.select().from(extractionRuns))[0]!;
  }
  async function finishNext() {
    const job=(await jobs.claim())!; await processor.extract(job); await jobs.complete(job);
    return (await db.select().from(extractionRuns).where(eq(extractionRuns.id,String(job.payload.runId))))[0]!;
  }
  it('accepts a source-supported complete default extraction using the real engine',async()=>{
    await upload(); const run=await finishNext();
    expect(run.state).toBe('completed');expect(run.accepted).toBe(true);expect(workflow).toHaveBeenCalledTimes(1);
    expect(run.output?.missingFields).toEqual([]);
  });
  it('never accepts a result missing requested defaults',async()=>{
    workflow.mockResolvedValue({output:{schemaVersion:'2',blocks:[],facts:[facts()[0]]},requestId:'offline-model'});
    await upload();const run=await finishNext();expect(run.state).toBe('needs_review');expect(run.accepted).toBe(false);
    expect(run.output?.missingFields).toEqual(['eps_diluted','net_income']);
  });
  it('an older rule revision completing later cannot replace a newer accepted revision',async()=>{
    const old=await upload();
    await db.insert(policyVersions).values({id:'policy-1',teamId:'internal',version:1,ticker:null,lesson:'Preserve the printed reporting period.',target:'extractor'});
    const bundle=await extraction.specification();
    const next=await dbs.db.transaction(tx=>extraction.queueDocument(tx,'desk',old.documentId,bundle));
    const oldJob=(await jobs.claim())!, newJob=(await jobs.claim())!;
    expect(oldJob.payload.runId).toBe(old.id);expect(newJob.payload.runId).toBe(next.id);
    await processor.extract(newJob);await jobs.complete(newJob);
    await processor.extract(oldJob);await jobs.complete(oldJob);
    const runs=await db.select().from(extractionRuns);
    expect(runs.find(r=>r.id===next.id)?.accepted).toBe(true);expect(runs.find(r=>r.id===old.id)?.accepted).toBe(false);
    expect(runs.every(r=>r.state==='completed')).toBe(true);
  });
  it('different requested field sets retain independent accepted selections',async()=>{
    const first=await upload();await finishNext();
    const bundle=await extraction.specification(undefined,['revenue']);
    const next=await dbs.db.transaction(tx=>extraction.queueDocument(tx,'desk',first.documentId,bundle));
    await finishNext();
    const accepted=(await db.select().from(extractionRuns)).filter(r=>r.accepted);
    expect(accepted.map(r=>r.id).sort()).toEqual([first.id,next.id].sort());
  });
  it('reuses a durable section checkpoint after lease recovery without repeating the model call',async()=>{
    const run=await upload();const firstJob=(await jobs.claim())!;
    const document=(await db.select().from(sourceDocuments).where(eq(sourceDocuments.id,run.documentId)))[0]!;
    const input=processor.engineInput(run.id,document,run.specification as Specification);
    await processor.engine(input,{job:firstJob});
    const checkpoint=(await db.select().from(extractionRuns).where(eq(extractionRuns.id,run.id)))[0]!.output?.checkpoint;
    expect(Object.keys(checkpoint as object)).toHaveLength(1);expect(workflow).toHaveBeenCalledTimes(1);
    await db.update(workJobs).set({leaseUntil:new Date(Date.now()-1000)}).where(eq(workJobs.id,firstJob.id));
    const recovered=(await jobs.claim())!;expect(recovered.attempts).toBe(2);
    await makeProcessor().extract(recovered);await jobs.complete(recovered);
    expect(workflow).toHaveBeenCalledTimes(1);
    expect((await db.select().from(extractionRuns))[0]?.accepted).toBe(true);
  });
  it('per-section explicit missing observations do not block globally supported requested facts',async()=>{
    const html=`<h2>Financial statements</h2><p>${text}</p><h2>Additional information</h2><p>No financial observations here.</p>`;
    workflow.mockImplementation(async(_task:string,_runId:string,input:SectionCallInput)=>({requestId:'offline-model',output:{schemaVersion:'2',blocks:[],facts:
      input.section.title==='Additional information' ? facts().map(f=>({...f,value:null,scale:null,unit:null,period:null,currency:null,quote:'',missingReason:'Not stated in this section'})) : facts()}}));
    await upload(html,'earnings.html');const run=await finishNext();expect(workflow).toHaveBeenCalledTimes(2);
    expect(run.state).toBe('completed');expect(run.accepted).toBe(true);expect(run.output?.missingFields).toEqual([]);
  });
});
