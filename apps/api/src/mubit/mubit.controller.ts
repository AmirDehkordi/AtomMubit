import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
import { desc, sql } from 'drizzle-orm';
import { z } from 'zod';
import { DbService } from '../db/db.service';
import { ADAPTER_STATES, llmCalls, mubitStatus } from '../db/schema';

/** Mubit's reviewer reads at most this many new calls per task per day (resets 00:00 UTC). */
export const REVIEW_LIMIT = 200;
/** Kept examples before Mubit trains a task's first adapter. */
export const FIRST_TRAINING_AT = 25;

const TASKS = [
  { task: 'desk_agent', label: 'Desk agent (chat)' },
  { task: 'section_extractor', label: 'Section extractor' },
] as const;

const ConsoleStatus = z.object({
  task: z.enum(['desk_agent', 'section_extractor']),
  kept: z.number().int().min(0).nullable(),
  adapterVersion: z.string().max(20).nullable(),
  adapterState: z.enum(ADAPTER_STATES).nullable(),
  quality: z.number().min(0).max(1).nullable(),
  note: z.string().max(280).nullable(),
});

/** Our own record of LLM calls per Mubit task, plus what the team copied in from Mubit's console. */
@Controller('mubit')
export class MubitController {
  constructor(private readonly dbs: DbService) {}

  // GET /mubit/stats?since=2026-10-25T00:00:00Z (default: since 00:00 UTC today, when Mubit's review budget resets)
  @Get('stats')
  async stats(@Query('since') since?: string) {
    const from = since ? new Date(since) : startOfUtcDay();
    return { since: from.toISOString(), tasks: await this.counts(from) };
  }

  /** Everything the Mubit panel shows. */
  @Get('status')
  async status() {
    const today = startOfUtcDay();
    const counts = await this.counts(today);
    const consoleRows = await this.dbs.db.select().from(mubitStatus);
    const recent = await this.dbs.db
      .select({
        task: llmCalls.task,
        requestId: llmCalls.mubitRequestId,
        latencyMs: llmCalls.latencyMs,
        ok: llmCalls.ok,
        createdAt: llmCalls.createdAt,
      })
      .from(llmCalls)
      .orderBy(desc(llmCalls.createdAt))
      .limit(8);
    return {
      reviewLimit: REVIEW_LIMIT,
      firstTrainingAt: FIRST_TRAINING_AT,
      resetAt: new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      tasks: TASKS.map(({ task, label }) => {
        const c = counts.find((r) => r.task === task);
        return {
          task,
          label,
          calls: c?.calls ?? 0,
          callsToday: c?.callsSince ?? 0,
          sessions: c?.sessions ?? 0,
          failed: c?.failed ?? 0,
          avgLatencyMs: c?.avgLatencyMs ?? null,
          lastCallAt: c?.lastCallAt ?? null,
          console: consoleRows.find((r) => r.task === task) ?? null,
        };
      }),
      recent,
    };
  }

  /** Records what Mubit's console shows for a task. */
  @Post('console-status')
  async saveConsoleStatus(@Body() body: unknown) {
    const parsed = ConsoleStatus.safeParse(body);
    if (!parsed.success) throw new BadRequestException(z.prettifyError(parsed.error));
    const row = { ...parsed.data, updatedAt: new Date() };
    await this.dbs.db.insert(mubitStatus).values(row).onConflictDoUpdate({ target: mubitStatus.task, set: row });
    return row;
  }

  private counts(from: Date) {
    return this.dbs.db
      .select({
        task: llmCalls.task,
        calls: sql<number>`count(*)::int`,
        callsSince: sql<number>`(count(*) filter (where ${llmCalls.createdAt} >= ${from.toISOString()}))::int`,
        failed: sql<number>`(count(*) filter (where not ${llmCalls.ok}))::int`,
        sessions: sql<number>`count(distinct ${llmCalls.promptCacheKey})::int`,
        avgLatencyMs: sql<number>`round(avg(${llmCalls.latencyMs}))::int`,
        lastCallAt: sql<string>`max(${llmCalls.createdAt})`,
      })
      .from(llmCalls)
      .groupBy(llmCalls.task)
      .orderBy(llmCalls.task);
  }
}

function startOfUtcDay(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
