import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import OpenAI from 'openai';
import type { Response, ResponseCreateParamsNonStreaming } from 'openai/resources/responses/responses';
import { config } from '../core/config';
import { DbService } from '../db/db.service';
import { llmCalls } from '../db/schema';

/** The Mubit tasks this product trains. Anything else is sent unrecorded. */
export type MubitTask = 'desk_agent' | 'section_extractor';

export interface MubitCall {
  /** Which task the call belongs to, or 'unrecorded' for replay generation and evals. */
  task: MubitTask | 'unrecorded';
  /** Mubit's session: it holds back test cases per session (conversation id, accession). */
  promptCacheKey: string;
}

export interface MubitResult {
  response: Response;
  /** x-middleware-request-id: points at this call in the Mubit console. */
  requestId: string | null;
}

/**
 * The one way to call an LLM. Every call goes through Mubit on the Responses API.
 *
 * - Recorded calls (task set) are what Mubit groups into tasks and trains on.
 *   Their model, instructions, tools and output format must never change; see
 *   each task's frozen.ts.
 * - Unrecorded calls carry `x-middleware-record: off`: no task, no training.
 *   Never use that for calls an adapter should one day answer.
 * - `store` and `metadata` are never sent (refused on the starter credit);
 *   `prompt_cache_key` is how Mubit learns the session.
 * - Each call is logged in llm_calls with its Mubit request id.
 */
@Injectable()
export class MubitService {
  private readonly logger = new Logger(MubitService.name);
  private readonly client = new OpenAI({
    apiKey: config.mubitApiKey || 'missing',
    baseURL: config.mubitBaseUrl,
    maxRetries: 2,
    timeout: 120_000,
  });

  constructor(private readonly dbs: DbService) {}

  get configured(): boolean {
    return Boolean(config.mubitApiKey);
  }

  async respond(params: ResponseCreateParamsNonStreaming, call: MubitCall): Promise<MubitResult> {
    if (!this.configured) throw new Error('MUBIT_API_KEY is not set (apps/api/.env).');
    const headers = call.task === 'unrecorded' ? { 'x-middleware-record': 'off' } : undefined;
    const started = Date.now();
    try {
      const { data, response } = await this.client.responses
        .create({ ...params, prompt_cache_key: call.promptCacheKey }, { headers })
        .withResponse();
      const requestId = response.headers.get('x-middleware-request-id');
      await this.log(call, params.model ?? '', Date.now() - started, requestId, data, null);
      return { response: data, requestId };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.log(call, params.model ?? '', Date.now() - started, null, null, message);
      throw err;
    }
  }

  private async log(
    call: MubitCall,
    model: string,
    latencyMs: number,
    requestId: string | null,
    data: Response | null,
    error: string | null,
  ): Promise<void> {
    try {
      await this.dbs.db.insert(llmCalls).values({
        id: randomUUID(),
        task: call.task,
        mubitRequestId: requestId,
        recorded: call.task !== 'unrecorded',
        promptCacheKey: call.promptCacheKey,
        model,
        latencyMs,
        tokensIn: data?.usage?.input_tokens ?? null,
        tokensOut: data?.usage?.output_tokens ?? null,
        ok: error === null,
        error,
      });
    } catch (err) {
      this.logger.warn(`Could not log LLM call: ${String(err)}`);
    }
  }
}
