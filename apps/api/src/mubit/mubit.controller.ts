import { Controller, Get, Query } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { llmCalls } from '../db/schema';

/** Our own count of LLM calls per Mubit task, for the replay script and the demo. */
@Controller('mubit')
export class MubitController {
  constructor(private readonly dbs: DbService) {}

  // GET /mubit/stats?since=2026-10-25T00:00:00Z (default: since 00:00 UTC today, when Mubit's review budget resets)
  @Get('stats')
  async stats(@Query('since') since?: string) {
    const from = since ? new Date(since) : startOfUtcDay();
    const tasks = await this.dbs.db
      .select({
        task: llmCalls.task,
        calls: sql<number>`count(*)::int`,
        callsSince: sql<number>`(count(*) filter (where ${llmCalls.createdAt} >= ${from.toISOString()}))::int`,
        failed: sql<number>`(count(*) filter (where not ${llmCalls.ok}))::int`,
        sessions: sql<number>`count(distinct ${llmCalls.promptCacheKey})::int`,
      })
      .from(llmCalls)
      .groupBy(llmCalls.task)
      .orderBy(llmCalls.task);
    return { since: from.toISOString(), tasks };
  }
}

function startOfUtcDay(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
