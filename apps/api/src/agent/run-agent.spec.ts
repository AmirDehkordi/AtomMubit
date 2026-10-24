import { describe, expect, it } from 'vitest';
import type { Response } from 'openai/resources/responses/responses';
import type { StreamEvent } from '@desk/shared';
import { runAgent, MAX_TOOL_ROUNDS } from './run-agent';
import type { ToolResult } from './tools.service';

const call = (name: string, args: object, id = name) =>
  ({ type: 'function_call', call_id: id, name, arguments: JSON.stringify(args), id: `fc_${id}`, status: 'completed' }) as const;

const reply = (output: unknown[], text = ''): Response => ({ output, output_text: text }) as unknown as Response;

function deps(script: Response[], results: Record<string, ToolResult>) {
  const events: StreamEvent[] = [];
  const inputs: unknown[][] = [];
  return {
    events,
    inputs,
    deps: {
      respond: async (input: unknown[]) => {
        inputs.push(structuredClone(input));
        return script.shift()!;
      },
      runTool: async (name: string) => results[name]!,
      stepLabel: (name: string) => `label:${name}`,
      emit: (e: StreamEvent) => events.push(e),
    },
  };
}

const okResult = (summary: string, extra: Partial<ToolResult> = {}): ToolResult => ({
  output: JSON.stringify({ summary }),
  summary,
  ok: true,
  ...extra,
});

describe('runAgent', () => {
  it('runs tools until the model answers in text', async () => {
    const view = { view: 'quarter_overview', ticker: 'NVDA', periods: ['2026-07-26'] } as const;
    const { deps: d, events, inputs } = deps(
      [
        reply([call('add_filings', { accessions: ['a'] })]),
        reply([call('show_on_dashboard', { spec: view })]),
        reply([{ type: 'message' }], 'Added NVIDIA.'),
      ],
      { add_filings: okResult('Added 1 filing'), show_on_dashboard: okResult('Showing', { view }) },
    );
    const turn = await runAgent([], 'add them', d as never);

    expect(turn.text).toBe('Added NVIDIA.');
    expect(turn.trace.map((t) => t.tool)).toEqual(['add_filings', 'show_on_dashboard']);
    expect(turn.views).toEqual([view]);
    // Function calls go back without their ids, followed by their outputs.
    expect(inputs[1]!.slice(-2)).toEqual([
      { type: 'function_call', call_id: 'add_filings', name: 'add_filings', arguments: '{"accessions":["a"]}' },
      { type: 'function_call_output', call_id: 'add_filings', output: '{"summary":"Added 1 filing"}' },
    ]);
    expect(events.filter((e) => e.type === 'step').map((e) => (e as { state: string }).state)).toEqual([
      'running',
      'done',
      'running',
      'done',
    ]);
    expect(events.some((e) => e.type === 'view')).toBe(true);
  });

  it('stops after ask_user and emits the choice', async () => {
    const choice = { id: 'c1', question: 'Add these?', options: ['Add all', 'Pick'] };
    const { deps: d, events } = deps([reply([call('ask_user', { question: 'Add these?', options: choice.options })])], {
      ask_user: okResult('Add these?', { choice }),
    });
    const turn = await runAgent([], 'nvda quarters', d as never);
    expect(turn.choice).toEqual(choice);
    expect(events.at(-1)).toEqual({ type: 'choice', ...choice });
  });

  it('gives up after the round limit', async () => {
    const script = Array.from({ length: MAX_TOOL_ROUNDS }, (_, i) => reply([call('get_metrics', {}, `c${i}`)]));
    const { deps: d } = deps(script, { get_metrics: okResult('ok') });
    const turn = await runAgent([], 'loop', d as never);
    expect(turn.trace).toHaveLength(MAX_TOOL_ROUNDS);
    expect(turn.text).toMatch(/too many steps/);
  });
});
