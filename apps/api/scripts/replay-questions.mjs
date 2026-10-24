import { readFile, writeFile } from 'node:fs/promises';

// Plays pretend users so Mubit sees enough desk_agent calls to train on.
// Questions come from templates over a list of large US companies (no LLM is
// used to write them). Each conversation is marked `replay`, so add_filings
// doesn't start real extraction. Every agent call is recorded by Mubit.
//
//   node scripts/replay-questions.mjs [--count 120] [--concurrency 4] [--api http://localhost:4000]
//                                     [--max-calls 230] [--wait-reset]
//
// Mubit's reviewer reads at most 200 new calls per task per day; the day resets
// at 00:00 UTC. --wait-reset sleeps until 00:02 UTC, and --max-calls stops
// starting conversations once this run has made that many desk_agent calls
// (counted by the API's /mubit/stats). Questions already sent on earlier runs
// (data/replayed-questions.json) are never sent again.
//
// Say so in the demo: this is a replay of public data.

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce(
      (pairs, a, i, all) =>
        a.startsWith('--') ? [...pairs, [a.slice(2), all[i + 1]?.startsWith('--') ? true : (all[i + 1] ?? true)]] : pairs,
      [],
    ),
);
const API = args.api ?? process.env.API_URL ?? 'http://localhost:4000';
const COUNT = Number(args.count ?? 120);
const CONCURRENCY = Number(args.concurrency ?? 4);
const MAX_CALLS = args['max-calls'] ? Number(args['max-calls']) : Infinity;
const WAIT_RESET = 'wait-reset' in args;
const SEEN_FILE = new URL('../data/replayed-questions.json', import.meta.url);

const COMPANIES = [
  ['NVDA', 'NVIDIA'], ['MSFT', 'Microsoft'], ['AAPL', 'Apple'], ['GOOGL', 'Alphabet'], ['AMZN', 'Amazon'],
  ['META', 'Meta'], ['AVGO', 'Broadcom'], ['ORCL', 'Oracle'], ['ADBE', 'Adobe'], ['CRM', 'Salesforce'],
  ['AMD', 'AMD'], ['INTC', 'Intel'], ['QCOM', 'Qualcomm'], ['TXN', 'Texas Instruments'], ['CSCO', 'Cisco'],
  ['NFLX', 'Netflix'], ['COST', 'Costco'], ['WMT', 'Walmart'], ['NKE', 'Nike'], ['PG', 'Procter & Gamble'],
  ['KO', 'Coca-Cola'], ['PEP', 'PepsiCo'], ['ETN', 'Eaton'], ['CAT', 'Caterpillar'], ['DE', 'Deere'],
  ['TSLA', 'Tesla'], ['UBER', 'Uber'], ['SBUX', 'Starbucks'], ['MCD', "McDonald's"], ['HD', 'Home Depot'],
  ['LOW', "Lowe's"], ['TGT', 'Target'], ['DIS', 'Disney'], ['IBM', 'IBM'], ['NOW', 'ServiceNow'],
  ['INTU', 'Intuit'], ['AMAT', 'Applied Materials'], ['MU', 'Micron'], ['LRCX', 'Lam Research'], ['PANW', 'Palo Alto Networks'],
  ['HON', 'Honeywell'], ['GE', 'GE Aerospace'], ['LMT', 'Lockheed Martin'], ['UNP', 'Union Pacific'], ['ABNB', 'Airbnb'],
];

const SINGLE = [
  (a) => `What was ${a[1]}'s revenue in its latest quarter?`,
  (a) => `How did ${a[1]}'s net income change over the last four quarters?`,
  (a) => `Show me ${a[0]}'s gross margin for the last four quarters`,
  (a) => `What is ${a[0]}'s diluted EPS for the last 4 quarters?`,
  (a) => `How much did ${a[1]} spend on capex in recent quarters?`,
  (a) => `What's ${a[1]}'s operating margin right now?`,
  (a) => `Load ${a[1]}'s fiscal 2025 filings`,
  (a) => `What did ${a[1]} say drove revenue last quarter?`,
  (a) => `Will ${a[1]} beat earnings next quarter?`,
  (a) => `Should I buy ${a[0]}?`,
  (a, b) => `Compare ${a[1]} and ${b[1]} revenue`,
  (a, b) => `Which grew revenue faster last quarter, ${a[0]} or ${b[0]}?`,
  (a, b) => `Net income: ${a[1]} vs ${b[1]}, latest quarter`,
  (a) => `What's ${a[1]}'s gross margin trend?`,
  (a) => `Is ${a[1]}'s net margin improving?`,
  (a) => `How much cash did ${a[1]} generate from operations last quarter?`,
  (a) => `What was ${a[0]}'s revenue growth versus the previous quarter?`,
  (a) => `Give me ${a[1]}'s R&D spend for the last four quarters`,
  (a) => `Did ${a[1]} restate any recent numbers?`,
  (a) => `What did ${a[1]} guide for next quarter?`,
  (a) => `What are the main risks ${a[1]} flags?`,
  (a, b) => `Which has the better operating margin, ${a[1]} or ${b[1]}?`,
  (a, b) => `Compare gross margins for ${a[0]} and ${b[0]}`,
  (a, b) => `Stack up ${a[1]} and ${b[1]} on capex`,
];

const MULTI = [
  (a) => [`Get ${a[1]}'s last four quarters`, 'Add all', 'How did operating income move?'],
  (a) => [`Pull up ${a[0]}'s most recent 10-Q and 10-K filings`, 'Add all', 'What was free cash flow like?'],
  (a) => [`I want to look at ${a[1]}`, 'Add all'],
  (a) => [`Load ${a[1]}'s last 4 quarters`, 'Add all', 'Show me the net margin trend'],
  (a) => [`Find ${a[0]}'s quarterly filings`, 'Pick', 'Just the latest two'],
];

let seed = Number(args.seed ?? Date.now() % 2 ** 31);
const rand = (n) => {
  seed = (seed * 1103515245 + 12345) % 2 ** 31;
  return seed % n;
};

function conversations(count, seen) {
  const out = [];
  for (let attempts = 0, i = 0; out.length < count && attempts < count * 50; attempts++, i++) {
    const a = COMPANIES[rand(COMPANIES.length)];
    let b = COMPANIES[rand(COMPANIES.length)];
    if (b === a) b = COMPANIES[(COMPANIES.indexOf(a) + 1) % COMPANIES.length];
    const questions = i % 3 === 0 ? MULTI[rand(MULTI.length)](a) : [SINGLE[rand(SINGLE.length)](a, b)];
    if (seen.has(questions[0])) continue;
    seen.add(questions[0]);
    out.push(questions);
  }
  return out;
}

async function loadSeen() {
  try {
    return new Set(JSON.parse(await readFile(SEEN_FILE, 'utf8')));
  } catch {
    return new Set();
  }
}

async function callsSince(since) {
  const res = await fetch(`${API}/mubit/stats?since=${since}`);
  const stats = await res.json();
  return stats.tasks.find((t) => t.task === 'desk_agent')?.callsSince ?? 0;
}

async function waitForReset() {
  const now = new Date();
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 2));
  const ms = target.getTime() - now.getTime();
  console.log(`Waiting ${Math.round(ms / 60000)} minutes, until ${target.toISOString()} (Mubit's review budget resets at 00:00 UTC)`);
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function turn(conversationId, text) {
  const res = await fetch(`${API}/chat/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const body = await res.text();
  const events = body.split('\n\n').filter((f) => f.startsWith('data: ')).map((f) => JSON.parse(f.slice(6)));
  const error = events.find((e) => e.type === 'error');
  if (error) throw new Error(error.message);
  return events.filter((e) => e.type === 'step' && e.state !== 'running').length;
}

async function run(questions) {
  const res = await fetch(`${API}/conversations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ replay: true }),
  });
  const { conversationId } = await res.json();
  let tools = 0;
  for (const q of questions) tools += await turn(conversationId, q);
  return tools;
}

if (WAIT_RESET) await waitForReset();
const startedAt = new Date().toISOString();
const seen = await loadSeen();
const queue = conversations(COUNT, seen);
await writeFile(SEEN_FILE, JSON.stringify([...seen]));
let done = 0;
let failed = 0;
let toolCalls = 0;
let consecutiveFailures = 0;
const started = Date.now();

let budgetReached = false;

async function worker() {
  while (queue.length && consecutiveFailures < 5 && !budgetReached) {
    if (MAX_CALLS !== Infinity && (await callsSince(startedAt)) >= MAX_CALLS) {
      budgetReached = true;
      break;
    }
    const questions = queue.shift();
    try {
      const calls = await run(questions);
      toolCalls += calls;
      consecutiveFailures = 0;
      done++;
    } catch (err) {
      failed++;
      consecutiveFailures++;
      console.error(`✗ ${questions[0]}: ${err.message}`);
    }
    process.stdout.write(`\r${done} done · ${failed} failed · ${toolCalls} tool calls · ${Math.round((Date.now() - started) / 1000)}s`);
  }
}

console.log(`Replaying up to ${queue.length} new conversations against ${API} (${CONCURRENCY} at a time${MAX_CALLS !== Infinity ? `, stopping at ${MAX_CALLS} agent calls` : ''})`);
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
const made = await callsSince(startedAt);
console.log(
  consecutiveFailures >= 5
    ? '\nStopped after 5 failures in a row.'
    : `\n${budgetReached ? 'Reached the call budget' : 'Finished'}: ${made} desk_agent calls this run.`,
);
