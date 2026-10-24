import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { z } from 'zod';
import { SectionExtractionV2, strictJsonSchema } from '@desk/shared';
import { MubitService } from '../mubit/mubit.service';
import { EXTRACTOR_SYSTEM, FEEDBACK_SYSTEM } from '../extraction/policy';
import { config } from '../core/config';
export const FeedbackDecision = z.strictObject({
  decision: z.enum(['apply', 'defer', 'reject']), reason: z.string(),
  kind: z.enum(['correction', 'preference']), target: z.enum(['planner', 'extractor', 'both']),
  scope: z.enum(['company', 'team']), lesson: z.string().nullable(),
  factKey: z.string().nullable(), evidence: z.string().nullable(),
});
export type WorkflowTask = 'section_extractor' | 'feedback_evaluator';
@Injectable()
export class WorkflowService {
  constructor(private readonly model: MubitService) {}
  /** Gateway and direct local mode share server-owned task definitions. */
  async modelCall(task: WorkflowTask, runId: string, input: unknown) {
    const schema = task === 'section_extractor' ? SectionExtractionV2 : FeedbackDecision;
    const response = await this.model.completeJson({ task, sessionKey: runId, runId,
      model: task === 'section_extractor' ? config.extractorModel : config.feedbackModel, validation: task === 'section_extractor' ? 'caller' : 'strict', system: task === 'section_extractor' ? EXTRACTOR_SYSTEM : FEEDBACK_SYSTEM,
      input: JSON.stringify(input), jsonSchema: { name: task === 'section_extractor' ? 'section_extraction_v2' : 'feedback_evaluation_v2', schema: strictJsonSchema(schema) } });
    // Engine owns schema-repair policy. Do not discard malformed-but-parseable output here.
    return { output: response.validationError === 'truncated' ? {error:'truncated',raw:response.value} : response.value, requestId: response.requestId };
  }
  async run(task: WorkflowTask, runId: string, input: unknown): Promise<{output: unknown; requestId: string | null}> {
    if ((process.env.WORKFLOW_MODE || 'direct') === 'direct') return this.modelCall(task, runId, input);
    if (process.env.WORKFLOW_MODE !== 'langflow') throw new Error('WORKFLOW_MODE must be direct or langflow');
    const flowId = task === 'section_extractor' ? process.env.LANGFLOW_EXTRACTION_FLOW_ID : process.env.LANGFLOW_FEEDBACK_FLOW_ID;
    if (!flowId || !process.env.LANGFLOW_API_KEY) throw new ServiceUnavailableException('Configure Langflow flow IDs and API key before running workflows');
    const base = (process.env.LANGFLOW_URL || 'http://localhost:7860').replace(/\/$/, '');
    const res = await fetch(`${base}/api/v1/run/${encodeURIComponent(flowId)}`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.LANGFLOW_API_KEY },
      body: JSON.stringify({ input_value: JSON.stringify({ task, runId, input }), input_type: 'chat', output_type: 'chat', session_id: runId }), signal: AbortSignal.timeout(150_000) });
    if (!res.ok) throw new Error(`Langflow request failed (${res.status})`);
    const data = await res.json() as {outputs?: {outputs?: {results?: {message?: {text?: string}}}[]}[]};
    const text = data.outputs?.flatMap(o => o.outputs ?? []).map(o => o.results?.message?.text).find(v => typeof v === 'string');
    if (!text) throw new Error('Langflow did not return a gateway result');
    const parsed = JSON.parse(text) as {output: unknown; requestId?: string};
    if (!Object.prototype.hasOwnProperty.call(parsed, 'output')) throw new Error('Invalid Langflow gateway result');
    return { output: parsed.output, requestId: parsed.requestId ?? null };
  }
}
