import { Body, Controller, ForbiddenException, Headers, HttpCode, Post } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { and, eq, gt, sql } from 'drizzle-orm';
import { z } from 'zod';
import { DbService } from '../db/db.service';
import { extractionFeedback, extractionRuns, sourceDocuments, workJobs } from '../db/schema';
import { teamId } from '../extraction/extraction.service';
import { prepareSections } from '../extraction/preparation';
import { WorkflowService } from './workflow.service';
const Envelope = z.strictObject({task:z.enum(['section_extractor','feedback_evaluator']),runId:z.string().max(128),input:z.unknown()});
@Controller('internal')
export class GatewayController {
  constructor(private readonly dbs: DbService, private readonly workflows: WorkflowService) {}
  @Post('model') @HttpCode(200)
  async model(@Headers('authorization') auth: string | undefined, @Body() body: unknown) {
    const expected = process.env.MODEL_GATEWAY_TOKEN;
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!expected || Buffer.byteLength(token) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(token),Buffer.from(expected))) throw new ForbiddenException('Invalid model gateway credentials');
    const parsed = Envelope.safeParse(body);
    if (!parsed.success || Buffer.byteLength(JSON.stringify(body)) > 300_000) throw new ForbiddenException('Invalid workflow envelope');
    const {task,runId,input} = parsed.data;
    const [run] = await this.dbs.db.select().from(extractionRuns).where(and(eq(extractionRuns.id,runId),eq(extractionRuns.teamId,teamId()),eq(extractionRuns.state,'running')));
    const [feedback] = await this.dbs.db.select().from(extractionFeedback).where(and(eq(extractionFeedback.id,runId),eq(extractionFeedback.teamId,teamId()),eq(extractionFeedback.state,'evaluating')));
    const [job] = await this.dbs.db.select().from(workJobs).where(and(eq(workJobs.state,'running'),gt(workJobs.leaseUntil,new Date()),
      sql`(${workJobs.payload}->>'runId' = ${runId} or ${workJobs.payload}->>'feedbackId' = ${runId})`)).limit(1);
    if (!job || (!run && !feedback) || task === 'feedback_evaluator' && !feedback) throw new ForbiddenException('No active workflow lease');
    if (task === 'section_extractor') {
      const context = z.object({documentId:z.string(),section:z.object({id:z.string()}),content:z.string().max(30000)}).safeParse(input);
      if (!context.success || run && context.data.documentId !== run.documentId) throw new ForbiddenException('Invalid extraction source');
      const [document] = await this.dbs.db.select().from(sourceDocuments).where(and(eq(sourceDocuments.id,context.data.documentId),eq(sourceDocuments.teamId,teamId())));
      if (!document) throw new ForbiddenException('Source not found');
      const section = prepareSections({runId,documentId:document.id,content:document.content,format:document.format === 'html' ? 'html' : 'text',sourceUrl:document.sourceUrl ?? undefined}).find(s=>s.id === context.data.section.id);
      if (!section || section.text !== context.data.content) throw new ForbiddenException('Section does not match the persisted source');
    }
    return this.workflows.modelCall(task,runId,input);
  }
}
