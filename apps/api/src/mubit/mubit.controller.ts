import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { DbService } from '../db/db.service';
import { ADAPTER_STATES, conversations, llmCalls, messages, mubitStatus, projects } from '../db/schema';

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
  /**
   * The latest questions and answers the chat sent through Mubit, each with the request ids of the
   * desk_agent calls that produced it. Read-only: what the panel shows as Mubit's training material.
   * Whether Mubit kept a call is only known in its console.
   */
  @Get('recorded')
  async recorded(@Query('limit') limit?: string) {
    const take = Math.min(Math.max(Number(limit) || 20, 1), 50);
    const rows = await this.dbs.db
      .select({
        id: messages.id,
        conversationId: messages.conversationId,
        role: messages.role,
        content: messages.content,
        choice: messages.choice,
        createdAt: messages.createdAt,
        replay: conversations.replay,
        desk: projects.title,
      })
      .from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .innerJoin(projects, eq(conversations.projectId, projects.id))
      .orderBy(desc(messages.createdAt))
      .limit(take * 4);
    // Oldest first, so each answer can be paired with the question just before it.
    const ordered = [...rows].reverse();
    const turns: {
      question: string;
      answer: string;
      askedAt: Date;
      answeredAt: Date;
      conversationId: string;
      desk: string;
      replay: boolean;
      choiceReply: boolean;
    }[] = [];
    for (let i = 1; i < ordered.length; i++) {
      const q = ordered[i - 1]!, a = ordered[i]!;
      if (q.role === 'user' && a.role === 'assistant' && q.conversationId === a.conversationId) {
        // A question that was a button press on the card before it (e.g. "Add all").
        const before = ordered[i - 2];
        const choiceReply = !!before && before.conversationId === q.conversationId && !!before.choice?.options.includes(q.content);
        // A turn that ended with a question card (e.g. "Add these filings?") has no text of its own.
        turns.push({
          question: q.content,
          answer: a.content || a.choice?.question || '',
          askedAt: q.createdAt,
          answeredAt: a.createdAt,
          conversationId: a.conversationId,
          desk: a.desk,
          replay: a.replay,
          choiceReply,
        });
      }
    }
    const latest = turns.slice(-take).reverse();
    const ids = [...new Set(latest.map((t) => t.conversationId))];
    const calls = ids.length
      ? await this.dbs.db
          .select({ key: llmCalls.promptCacheKey, requestId: llmCalls.mubitRequestId, createdAt: llmCalls.createdAt })
          .from(llmCalls)
          .where(and(eq(llmCalls.task, 'desk_agent'), eq(llmCalls.recorded, true), inArray(llmCalls.promptCacheKey, ids)))
      : [];
    return latest.map((t) => ({
      question: t.question,
      answer: t.answer.length > 400 ? `${t.answer.slice(0, 397)}…` : t.answer,
      at: t.answeredAt.toISOString(),
      conversationId: t.conversationId,
      desk: t.desk,
      replay: t.replay,
      choiceReply: t.choiceReply,
      requestIds: calls
        .filter((c) => c.key === t.conversationId && c.createdAt >= t.askedAt && c.createdAt <= t.answeredAt)
        .map((c) => c.requestId)
        .filter((r): r is string => !!r),
    }));
  }

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
