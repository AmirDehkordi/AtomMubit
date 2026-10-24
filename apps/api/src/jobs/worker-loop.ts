import { and, eq, inArray, sql } from 'drizzle-orm';
import { config } from '../core/config';
import { DbService } from '../db/db.service';
import { extractionFeedback, extractionRequests, extractionRuns, filings, monitoringWatchlist, requestRuns, sourceDocuments, workJobs } from '../db/schema';
import { JobsService, MAX_ATTEMPTS, type Job, type Transaction } from './jobs.service';
import { ProcessorService } from '../extraction/processor.service';
import { FeedbackService } from '../feedback/feedback.service';
import { event } from '../extraction/extraction.service';

export class WorkerLoop {
  private stopping = false;
  constructor(private readonly dbs:DbService,private readonly jobs:JobsService,private readonly processor:ProcessorService,private readonly feedback:FeedbackService) {}
  stop() { this.stopping = true; }
  async run() {
    const sleep = () => new Promise(resolve=>setTimeout(resolve,1000));
    const maintenance = async()=>{
      let lastSchedule=0;
      while(!this.stopping) {
        try {
          if(Date.now()-lastSchedule>30_000){await this.processor.schedule();lastSchedule=Date.now();}
          await this.jobs.expireExhausted((expired,tx)=>this.terminalFailure(expired,'Worker lease expired after maximum attempts',tx));
          await this.reconcileRequests();
        } catch(error){console.error('Worker maintenance failed:',error instanceof Error?error.name:'unknown');}
        await sleep();
      }
    };
    const lane = async(kinds:string[])=>{
      while(!this.stopping) {
        try {
          const available = kinds.filter(kind=>{
            if(['discover','ingest'].includes(kind))return true;
            if(!config.mubitApiKey)return false;
            if(kind==='plan'||(process.env.WORKFLOW_MODE||'direct')==='direct')return true;
            return !!process.env.LANGFLOW_API_KEY && !!(kind==='feedback'?process.env.LANGFLOW_FEEDBACK_FLOW_ID:process.env.LANGFLOW_EXTRACTION_FLOW_ID);
          });
          const job=available.length?await this.jobs.claim(available):null;
          if(job)await this.process(job);else await sleep();
        }
        catch(error){console.error('Worker claim failed:',error instanceof Error?error.name:'unknown');await sleep();}
      }
    };
    // Discovery cannot be delayed behind a long filing or a historical replay.
    await Promise.all([maintenance(),lane(['discover']),lane(['plan','ingest']),lane(['extract','feedback']),lane(['extract','feedback'])]);
  }
  async process(job:Job) {
    const heartbeat = setInterval(()=>{void this.jobs.heartbeat(job).catch(()=>undefined);},30_000);
    try {
      switch (job.kind) {
        case 'ingest': await this.processor.ingest(job); break;
        case 'plan': await this.processor.plan(job); break;
        case 'discover': await this.processor.discover(job); break;
        case 'extract': await this.processor.extract(job); break;
        case 'feedback': await this.feedback.process(job); break;
        default: throw new Error('Unknown job kind');
      }
      await this.jobs.complete(job);
    } catch (error) {
      const upstreamStatus=(error as {status?:number})?.status;
      const message = typeof upstreamStatus==='number' ? `Upstream request failed (${upstreamStatus})` : error instanceof Error ? error.message.slice(0,500) : 'Job failed';
      try {
        await this.jobs.withLease(job,async tx=>{
          await tx.update(workJobs).set({state:job.attempts>=MAX_ATTEMPTS?'failed':'queued',error:message,leaseToken:null,leaseUntil:null,availableAt:new Date(Date.now()+1000*2**job.attempts)}).where(eq(workJobs.id,job.id));
          if(job.attempts>=MAX_ATTEMPTS) await this.terminalFailure(job,message,tx);
        });
      } catch { /* Lost leases are handled by the new owner; stale workers cannot publish failure. */ }

    } finally { clearInterval(heartbeat); }
  }
  private async terminalFailure(job:Job,message:string, transaction?:Transaction) {
    const update = async (tx:Transaction)=>{
      if (job.payload.runId) {
        const [run] = await tx.update(extractionRuns).set({state:'failed',error:message}).where(and(eq(extractionRuns.id,String(job.payload.runId)),inArray(extractionRuns.state,['queued','running']))).returning();
        if(run) {
          // The filing stops showing "reading": the desk shows it failed (and why) instead of spinning.
          const [document] = await tx.select({accession:sourceDocuments.accession}).from(sourceDocuments).where(eq(sourceDocuments.id,run.documentId));
          if(document?.accession) await tx.update(filings).set({status:'failed'}).where(eq(filings.accession,document.accession));
          await event(tx,run.projectId,'failed',{error:message,accession:document?.accession ?? null},run.id);
        }
      }
      if(job.payload.requestId) await tx.update(extractionRequests).set({state:'failed',error:message}).where(eq(extractionRequests.id,String(job.payload.requestId)));
      if(job.payload.feedbackId) await tx.update(extractionFeedback).set({state:'failed',decision:{reason:message}}).where(eq(extractionFeedback.id,String(job.payload.feedbackId)));
      if(job.payload.watchlistId) await tx.update(monitoringWatchlist).set({error:message}).where(eq(monitoringWatchlist.id,String(job.payload.watchlistId)));
    };
    if(transaction) await update(transaction); else await this.dbs.db.transaction(update);
  }
  async reconcileRequests() {
    const requests = await this.dbs.db.select().from(extractionRequests).where(inArray(extractionRequests.state,['queued','running']));
    for(const request of requests) await this.dbs.db.transaction(async tx=>{
      const [pending] = await tx.select().from(workJobs).where(and(inArray(workJobs.state,['queued','running']),sql`${workJobs.payload}->>'requestId' = ${request.id}`)).limit(1);
      if(pending) return;
      const runs = await tx.select({state:extractionRuns.state}).from(requestRuns).innerJoin(extractionRuns,eq(extractionRuns.id,requestRuns.runId)).where(eq(requestRuns.requestId,request.id));
      if(runs.some(r=>['queued','running'].includes(r.state))) return;
      const state = runs.some(r=>r.state==='failed') ? 'failed' : !runs.length || runs.some(r=>r.state==='needs_review') ? 'needs_review' : 'completed';
      const changed = await tx.update(extractionRequests).set({state,error:!runs.length?'No documents matched the resolved request.':null}).where(and(eq(extractionRequests.id,request.id),inArray(extractionRequests.state,['queued','running']))).returning();
      if(changed.length) await event(tx,request.projectId,'request_completed',{requestId:request.id,state});
    });
  }
}
