import type {
  Response,
  ResponseInputItem,
  ResponseCreateParamsNonStreaming,
} from 'openai/resources/responses/responses';
import type { StreamEvent, ViewSpec } from '@desk/shared';
import type { ToolTraceEntry } from '../db/schema';
import type { ToolResult } from './tools.service';

export const MAX_TOOL_ROUNDS = 6;

export interface AgentDeps {
  /** One model call (through Mubit). */
  respond: (input: ResponseInputItem[]) => Promise<Response>;
  /** Runs one tool call. */
  runTool: (name: string, args: string) => Promise<ToolResult>;
  stepLabel: (name: string) => string;
  emit: (event: StreamEvent) => void;
}

export interface AgentTurn {
  text: string;
  /** This turn's function calls and outputs, kept as history for later turns. */
  items: ResponseInputItem[];
  trace: ToolTraceEntry[];
  choice: ToolResult['choice'] | null;
  views: ViewSpec[];
}

/**
 * One user turn: call the model, run the tools it asks for, feed the results
 * back, and repeat until it answers in text (or asks the user, or hits the
 * round limit). The same instructions and tools go with every call, so every
 * round is the same Mubit task.
 *
 * Reasoning items are not sent back; function calls are replayed without
 * their ids, which works without stored responses.
 */
export async function runAgent(history: ResponseInputItem[], userText: string, deps: AgentDeps): Promise<AgentTurn> {
  const turn: AgentTurn = { text: '', items: [], trace: [], choice: null, views: [] };
  const input: ResponseInputItem[] = [...history, { role: 'user', content: userText }];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await deps.respond(input);
    const calls = response.output.filter((o) => o.type === 'function_call');
    const text = response.output_text?.trim() ?? '';

    if (!calls.length) {
      turn.text = text;
      return turn;
    }

    const results = await Promise.all(
      calls.map(async (call) => {
        const stepId = call.call_id;
        deps.emit({ type: 'step', id: stepId, tool: call.name, label: deps.stepLabel(call.name), state: 'running', summary: null });
        const result = await deps.runTool(call.name, call.arguments);
        deps.emit({
          type: 'step',
          id: stepId,
          tool: call.name,
          label: deps.stepLabel(call.name),
          state: result.ok ? 'done' : 'failed',
          summary: result.summary,
        });
        return { call, result };
      }),
    );

    const callItems: ResponseInputItem[] = results.map(({ call }) => ({
      type: 'function_call', call_id: call.call_id, name: call.name, arguments: call.arguments,
    }));
    const outputItems: ResponseInputItem[] = results.map(({ call, result }) => ({
      type: 'function_call_output', call_id: call.call_id, output: result.output,
    }));
    // Keep each model round's parallel call batch explicit for the Chat
    // Completions compatibility transport: calls first, then matching outputs.
    input.push(...callItems, ...outputItems);
    turn.items.push(...callItems, ...outputItems);
    for (const { call, result } of results) {
      turn.trace.push({ tool: call.name as ToolTraceEntry['tool'], args: safeJson(call.arguments), summary: result.summary, ok: result.ok });
      if (result.view) {
        turn.views.push(result.view);
        deps.emit({ type: 'view', spec: result.view });
      }
      if (result.choice) turn.choice = result.choice;
    }

    if (turn.choice) {
      deps.emit({ type: 'choice', ...turn.choice });
      turn.text = text;
      return turn;
    }
  }

  turn.text = 'I took too many steps on that one. Could you narrow the question?';
  return turn;
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

export type AgentRequest = Omit<ResponseCreateParamsNonStreaming, 'input'>;
