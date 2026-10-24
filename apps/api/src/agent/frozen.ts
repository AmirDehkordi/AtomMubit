import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FunctionTool } from 'openai/resources/responses/responses';
import { TOOL_ARGS, TOOL_NAMES, strictJsonSchema, type ToolName } from '@desk/shared';
import { config } from '../core/config';

// The desk_agent Mubit task. Mubit groups calls into one task by model + system
// prompt + tools + output format, so everything in this file is part of that
// fingerprint: one changed word starts a new task and resets its examples.
// Change it only on purpose, then delete data/desk_agent.lock.

export const AGENT_MODEL = config.agentModel;

export const SYSTEM_PROMPT = `You are the analyst at Earnings Desk, a research desk for US public companies built on their SEC filings. You talk with one user in a chat. Beside the chat is a dashboard that you control with show_on_dashboard.

How you work:
- Numbers come only from tool results. Never compute, estimate or recall a figure yourself, not even a margin or a growth rate. The tools format values and give changes; margins (gross_margin, operating_margin, net_margin) are metrics you request like any other.
- Label quarters on the company's own fiscal year exactly as the tools do (for example "Q2 FY2027"), and give the quarter with every number.
- To work with a company's filings, call find_filings. If the user asked to add or load them, call add_filings straight away. Otherwise call ask_user with the options "Add all" and "Pick", and stop. When the user answers "Add all", add every filing you found; for "Pick", ask which ones.
- After add_filings, call show_on_dashboard with a quarter_overview of those quarters, then answer in two or three sentences.
- For a question about one company's numbers, call get_metrics; for several companies, call compare. Show the matching view (metric_detail for one metric over time, quarter_overview for the overall picture, compare across companies), then answer.
- For questions about what the filings say (what drove results, guidance, risks), call search_blocks, then get_blocks for the passages you use. If nothing has been read yet, say so.
- If a tool says it is not available yet, tell the user plainly.
- Decline forecasts, investment advice, and companies without SEC filings.

How you answer:
- Lead with the answer in one or two sentences, then at most a few short bullets. No headings.
- Cite as you go: [[f:<accession>]] after a number from a filing, [[b:<block id>]] after anything from a passage.
- Use the values exactly as the tools format them.`;

const DESCRIPTIONS: Record<ToolName, string> = {
  find_filings:
    "Find a company's 10-Q and 10-K filings (the latest N quarters, or every quarter of one fiscal year; a 10-K stands for Q4) or its 8-K earnings releases. Returns accession numbers, fiscal quarter labels and period end dates.",
  ask_user:
    'Show the user a question with two to four answer buttons, then stop. Their answer arrives as their next message.',
  add_filings:
    "Add found filings to the user's desk by accession number. The desk starts reading them in the background.",
  get_metrics:
    "Quarterly figures for one company from the SEC's XBRL data, formatted, with the change against the previous quarter requested and how each value was obtained.",
  search_blocks:
    'Full-text search over passages the desk has read from added filings: statements, guidance, risks, tables and figures. Returns block ids and short snippets.',
  get_blocks: 'The full text of up to eight passages by block id.',
  compare:
    "One metric across companies, each on its latest quarter (or the quarter ending periodEnd), with the change against the same quarter a year earlier.",
  show_on_dashboard: 'Show a view on the dashboard beside the chat.',
  get_insider_activity: 'Insider buying and selling (Form 4) over the last N days.',
  diff_risk_factors: "Risk factors added and removed between a company's two latest 10-Ks.",
};

export const TOOLS: FunctionTool[] = TOOL_NAMES.map((name) => ({
  type: 'function',
  name,
  description: DESCRIPTIONS[name],
  parameters: strictJsonSchema(TOOL_ARGS[name]),
  strict: true,
}));

export const TASK_FINGERPRINT = createHash('sha256')
  // OpenRouter's explicit `openai/` provider prefix qualifies the same frozen
  // model ID that the previous Mubit integration recorded without a prefix.
  // Normalize this alias so the existing desk_agent.lock is preserved.
  .update(JSON.stringify({ model: AGENT_MODEL.replace(/^openai\//, ''), system: SYSTEM_PROMPT, tools: TOOLS }))
  .digest('hex')
  .slice(0, 16);

/** Refuses to start if the task definition changed since it was first locked. */
export function assertAgentFrozen(): void {
  const lockPath = join(config.dataDir, 'desk_agent.lock');
  mkdirSync(config.dataDir, { recursive: true });
  if (!existsSync(lockPath)) {
    writeFileSync(lockPath, TASK_FINGERPRINT + '\n');
    return;
  }
  const locked = readFileSync(lockPath, 'utf8').trim();
  if (locked !== TASK_FINGERPRINT && process.env.ALLOW_TASK_CHANGE !== '1') {
    throw new Error(
      `The desk_agent task changed (lock ${locked}, now ${TASK_FINGERPRINT}). ` +
        'This would start a new Mubit task and reset its examples. Revert the change, ' +
        'or delete data/desk_agent.lock (or set ALLOW_TASK_CHANGE=1) if you mean it.',
    );
  }
}

/** Transport changes are versioned independently from the frozen task. This
 * migration leaves data/desk_agent.lock byte-for-byte intact. */
export const TRANSPORT_FINGERPRINT = createHash('sha256')
  .update(JSON.stringify({ version: 2, protocol: 'responses-to-chat-completions', retries: 0, baseURL: config.mubitBaseUrl }))
  .digest('hex').slice(0, 16);

export function assertTransportFrozen(): void {
  const lockPath = join(config.dataDir, 'mubit_transport.lock');
  mkdirSync(config.dataDir, { recursive: true });
  if (!existsSync(lockPath)) { writeFileSync(lockPath, TRANSPORT_FINGERPRINT + '\n'); return; }
  const locked = readFileSync(lockPath, 'utf8').trim();
  if (locked !== TRANSPORT_FINGERPRINT && process.env.ALLOW_TRANSPORT_CHANGE !== '1') {
    throw new Error(`The Mubit transport changed (lock ${locked}, now ${TRANSPORT_FINGERPRINT}). Set ALLOW_TRANSPORT_CHANGE=1 to intentionally migrate the transport version.`);
  }
}
