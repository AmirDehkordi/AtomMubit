// Plays pretend users so Mubit sees enough desk_agent calls to train on.
// Questions come from templates over a list of large US companies (no LLM is
// used to write them). Each conversation is marked `replay`, so add_filings
// doesn't start real extraction. Every agent call is recorded by Mubit.
//
//   node scripts/replay-questions.mjs [--count 120] [--concurrency 4] [--api http://localhost:4000]
//
// Say so in the demo: this is a replay of public data.

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, a, i, all) => (a.startsWith('--') ? [...pairs, [a.slice(2), all[i + 1]]] : pairs), []),
);
const API = args.api ?? process.env.API_URL ?? 'http://localhost:4000';
const COUNT = Number(args.count ?? 120);
const CONCURRENCY = Number(args.concurrency ?? 4);

const COMPANIES = [
  ['NVDA', 'NVIDIA'], ['MSFT', 'Microsoft'], ['AAPL', 'Apple'], ['GOOGL', 'Alphabet'], ['AMZN', 'Amazon'],
  ['META', 'Meta'], ['AVGO', 'Broadcom'], ['ORCL', 'Oracle'], ['ADBE', 'Adobe'], ['CRM', 'Salesforce'],
  ['AMD', 'AMD'], ['INTC', 'Intel'], ['QCOM', 'Qualcomm'], ['TXN', 'Texas Instruments'], ['CSCO', 'Cisco'],
  ['NFLX', 'Netflix'], ['COST', 'Costco'], ['WMT', 'Walmart'], ['NKE', 'Nike'], ['PG', 'Procter & Gamble'],
  ['KO', 'Coca-Cola'], ['PEP', 'PepsiCo'], ['ETN', 'Eaton'], ['CAT', 'Caterpillar'], ['DE', 'Deere'],
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
];

const MULTI = [
  (a) => [`Get ${a[1]}'s last four quarters`, 'Add all', 'How did operating income move?'],
  (a) => [`Pull up ${a[0]}'s most recent 10-Q and 10-K filings`, 'Add all', 'What was free cash flow like?'],
  (a) => [`I want to look at ${a[1]}`, 'Add all'],
];

let seed = 7;
const rand = (n) => {
  seed = (seed * 1103515245 + 12345) % 2 ** 31;
  return seed % n;
};

function conversations(count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = COMPANIES[rand(COMPANIES.length)];
    let b = COMPANIES[rand(COMPANIES.length)];
    if (b === a) b = COMPANIES[(COMPANIES.indexOf(a) + 1) % COMPANIES.length];
    out.push(i % 3 === 0 ? MULTI[rand(MULTI.length)](a) : [SINGLE[rand(SINGLE.length)](a, b)]);
  }
  return out;
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

const queue = conversations(COUNT);
let done = 0;
let failed = 0;
let toolCalls = 0;
let consecutiveFailures = 0;
const started = Date.now();

async function worker() {
  while (queue.length && consecutiveFailures < 5) {
    const questions = queue.shift();
    try {
      toolCalls += await run(questions);
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

console.log(`Replaying ${COUNT} conversations against ${API} (${CONCURRENCY} at a time)`);
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(consecutiveFailures >= 5 ? '\nStopped after 5 failures in a row.' : '\nFinished.');
