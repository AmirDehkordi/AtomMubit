import { Injectable, type OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import type { ResponseInputItem } from 'openai/resources/responses/responses';
import type { StreamEvent } from '@desk/shared';
import { config } from '../core/config';
import { DbService } from '../db/db.service';
import { messages, projects } from '../db/schema';
import { MubitService } from '../mubit/mubit.service';
import { ProjectsService } from '../projects/projects.service';
import { ExtractionService } from '../extraction/extraction.service';
import { AGENT_MODEL, SYSTEM_PROMPT, TOOLS, assertAgentFrozen } from './frozen';
import { runAgent } from './run-agent';
import { STEP_LABELS, ToolsService } from './tools.service';
import type { ToolName } from '@desk/shared';

/** Past turns sent as history. Older turns are dropped to keep calls small. */
const HISTORY_TURNS = 6;
const MAX_OUTPUT_TOKENS = 4000;

@Injectable()
export class AgentService implements OnModuleInit {
  constructor(
    private readonly dbs: DbService,
    private readonly mubit: MubitService,
    private readonly tools: ToolsService,
    private readonly projects: ProjectsService,
    private readonly extraction: ExtractionService,
  ) {}

  onModuleInit(): void {
    assertAgentFrozen();
  }

  /** Runs one user message through the desk_agent and streams what happens. */
  async chat(conversationId: string, text: string, emit: (e: StreamEvent) => void): Promise<void> {
    const conversation = await this.projects.conversation(conversationId);
    const history = await this.history(conversationId);
    const lessons = await this.extraction.plannerRules();
    history.unshift({role:'user',content:JSON.stringify({houseRules:lessons})});
    await this.save(conversationId, 'user', text);
    if (history.length === 1) await this.titleFromQuestion(conversation.projectId, text);

    const ctx = { projectId: conversation.projectId, conversationId, replay: conversation.replay };
    // Each model call's Mubit request id, sent with 'done' so the answer can show its receipt.
    // The call itself (model, instructions, tools) is unchanged, so the Mubit task stays the same.
    const mubitCalls: { requestId: string | null; ms: number }[] = [];
    const turn = await runAgent(history, text, {
      respond: async (input) => {
        const started = Date.now();
        const result = await this.mubit.respond(
          {
            model: AGENT_MODEL,
            instructions: SYSTEM_PROMPT,
            tools: TOOLS,
            input,
            reasoning: { effort: config.agentReasoningEffort },
            max_output_tokens: MAX_OUTPUT_TOKENS,
          },
          { task: 'desk_agent', promptCacheKey: conversationId },
        );
        mubitCalls.push({ requestId: result.requestId, ms: Date.now() - started });
        return result.response;
      },
      runTool: (name, args) => this.tools.run(name, args, ctx),
      stepLabel: (name) => STEP_LABELS[name as ToolName] ?? name,
      emit,
    });

    if (turn.text) emit({ type: 'text', delta: turn.text });
    const id = await this.save(conversationId, 'assistant', turn.text, turn);
    emit({ type: 'done', messageId: id, mubitCalls });
  }

  private async history(conversationId: string): Promise<ResponseInputItem[]> {
    const rows = await this.dbs.db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.createdAt));
    const recent = rows.slice(-HISTORY_TURNS * 2);
    return recent.flatMap((m): ResponseInputItem[] => {
      if (m.role === 'user') return [{ role: 'user', content: m.content }];
      const content = m.content || m.choice?.question || '';
      return [
        ...(m.items as ResponseInputItem[]),
        ...(content ? [{ role: 'assistant' as const, content }] : []),
      ];
    });
  }

  private async save(
    conversationId: string,
    role: 'user' | 'assistant',
    content: string,
    turn?: Awaited<ReturnType<typeof runAgent>>,
  ): Promise<string> {
    const id = randomUUID();
    await this.dbs.db.insert(messages).values({
      id,
      conversationId,
      role,
      content,
      toolTrace: turn?.trace ?? [],
      items: turn?.items ?? [],
      choice: turn?.choice ?? null,
    });
    return id;
  }

  private async titleFromQuestion(projectId: string, text: string): Promise<void> {
    const title = text.length > 60 ? `${text.slice(0, 57)}…` : text;
    await this.dbs.db.update(projects).set({ title }).where(eq(projects.id, projectId));
  }
}
