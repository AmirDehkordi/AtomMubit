import { z } from 'zod';
import { strictJsonSchema } from '@desk/shared';
import { MubitService } from '../mubit/mubit.service';
import { config } from '../core/config';
/** Structured intent mode of the desk planner: no second conversation or tool loop. */
export const ExtractionIntent = z.strictObject({
  tickers: z.array(z.string().regex(/^[A-Z0-9.-]{1,12}$/)).max(5),
  fields: z.array(z.string().min(1).max(100)).min(1).max(20),
  fiscalYear: z.number().int().min(1990).max(2100).nullable(),
  lastNQuarters: z.number().int().min(1).max(4),
  clarification: z.string().nullable(),
});
export const INTENT_SYSTEM = `You are Earnings Desk's intent planner in extraction-only mode. Resolve the user's request into tickers, financial field keys, and requested fiscal year or last N quarters (default 4). Core field keys are revenue, net_income, eps_diluted. Extra fields are permitted. Resolve relative dates against asOf. Never invent a ticker for ambiguous company names. Return a clarification question when the company/period/request is ambiguous. When explicit document IDs are provided tickers may be empty. This mode only plans; it cannot retrieve, calculate, or claim extracted results. Apply supplied house rules. Return the exact JSON schema.`;
export async function planExtraction(model: MubitService, requestId: string, context: Record<string, unknown>) {
  const response = await model.completeJson({ task: 'desk_agent', sessionKey: requestId, requestId,
    model: config.agentModel, system: INTENT_SYSTEM, input: JSON.stringify(context),
    jsonSchema: { name: 'extraction_intent_v2', schema: strictJsonSchema(ExtractionIntent) } });
  return ExtractionIntent.parse(response.value);
}
