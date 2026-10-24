// Benchmark: the same questions to gpt-6-luna on its own and to the MuTick agent,
// scored automatically. Expected numbers come from the desk's own SEC XBRL endpoints;
// text answers must cite a passage and mention the key fact; advice and forecasts must
// be declined.
//
//   node scripts/benchmark.mjs [--api http://localhost:4000]
//   node scripts/benchmark.mjs --rescore      (re-score the saved answers, no model calls)
//
// Needs the API running with MUBIT_API_KEY. Baseline calls go through Mubit with
// x-middleware-record: off (no task, no training). Agent calls are ordinary desk_agent
// calls in a replay conversation (no extraction). Results: docs/benchmark/latest.{json,md}

import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import OpenAI from 'openai';
import shared from '@desk/shared';

const { formatValue } = shared;
const args = Object.fromEntries(
  process.argv.slice(2).reduce((p, a, i, all) => (a.startsWith('--') ? [...p, [a.slice(2), all[i + 1]]] : p), []),
);
const API = args.api ?? 'http://localhost:4000';
const MODEL = process.env.AGENT_MODEL || 'gpt-6-luna';
const mubit = new OpenAI({ apiKey: process.env.MUBIT_API_KEY, baseURL: process.env.MUBIT_BASE_URL || 'https://api.mubit.ai/openai/v1' });

const get = async (path) => (await fetch(`${API}${path}`)).json();
async function chat(conversationId, text) {
  const started = Date.now();
  const res = await fetch(`${API}/chat/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  const body = await res.text();
  const events = body.split('\n\n').filter((f) => f.startsWith('data: ')).map((f) => JSON.parse(f.slice(6)));
  return {
    text: events.filter((e) => e.type === 'text').map((e) => e.delta).join(''),
    tools: events.filter((e) => e.type === 'step' && e.state !== 'running').map((e) => e.tool),
    error: events.find((e) => e.type === 'error')?.message ?? null,
    ms: Date.now() - started,
  };
}
async function baseline(question) {
  const started = Date.now();
  const r = await mubit.responses.create(
    {
      model: MODEL,
      instructions: "You are a financial analyst. Answer questions about US public companies' reported results concisely, with figures.",
      input: question,
      reasoning: { effort: 'low' },
      max_output_tokens: 2000,
    },
    { headers: { 'x-middleware-record': 'off' } },
  );
  return { text: r.output_text ?? '', tools: [], error: null, ms: Date.now() - started };
}

// --- Expected values, from the desk's own XBRL data -------------------------------------
const found = await get('/filings/find?ticker=NVDA&forms=10-Q,10-K&lastNQuarters=4');
const periods = found.filings.map((f) => f.periodEnd).sort();
const quarterOf = Object.fromEntries(found.filings.map((f) => [f.quarter, f.periodEnd]));
const overview = await get(`/views/quarter-overview?ticker=NVDA&periods=${periods.join(',')}`);
const value = (metric, quarter) => {
  const row = overview.rows.find((r) => r.key === metric);
  const i = overview.quarters.findIndex((q) => q.periodEnd === quarterOf[quarter]);
  return { v: row.cells[i].value, unit: row.unit };
};
const compare = await get('/views/compare?metric=revenue&tickers=NVDA,MSFT,AAPL');

/** Every reasonable way an answer might write a value. */
function variants({ v, unit }) {
  if (unit === 'percent') return [`${(v * 100).toFixed(1)}%`, `${Math.round(v * 100)}%`];
  if (unit === 'USD/share') return [`$${v.toFixed(2)}`];
  const b = v / 1e9;
  return [`$${b.toFixed(2)}B`, `$${b.toFixed(1)}B`, `$${b.toFixed(2)} billion`, `$${b.toFixed(1)} billion`, `${Math.round(v / 1e6).toLocaleString('en-US')} million`];
}
const has = (text, v) => variants(v).some((s) => text.replace(/\s+/g, ' ').includes(s));
const cites = (t) => /\[\[(f|b):/.test(t);
const citesText = (t) => /\[\[b:/.test(t);
const declines = (t) =>
  /(can(no|['’])t|cannot|not able|unable|won['’]t|don['’]t (provide|give|offer)|not (provide|give|offer)|isn['’]t something|not investment advice|no (investment )?advice)/i.test(t);

const QUESTIONS = [
  { kind: 'number', q: "What was NVIDIA's revenue in Q2 FY2027?", ok: (a) => has(a.text, value('revenue', 'Q2 FY2027')) },
  { kind: 'number', q: "What was NVIDIA's net income in Q4 FY2026?", ok: (a) => has(a.text, value('net_income', 'Q4 FY2026')) },
  { kind: 'number', q: "What was NVIDIA's diluted EPS in Q1 FY2027?", ok: (a) => has(a.text, value('eps_diluted', 'Q1 FY2027')) },
  { kind: 'number', q: "What was NVIDIA's gross margin in Q2 FY2027?", ok: (a) => has(a.text, value('gross_margin', 'Q2 FY2027')) },
  { kind: 'number', q: "What was NVIDIA's operating margin in Q4 FY2026?", ok: (a) => has(a.text, value('operating_margin', 'Q4 FY2026')) },
  { kind: 'number', q: 'How much cash did NVIDIA generate from operations in Q3 FY2026?', ok: (a) => has(a.text, value('operating_cash_flow', 'Q3 FY2026')) },
  {
    kind: 'number',
    q: 'Compare NVIDIA, Microsoft and Apple revenue in their latest reported quarters.',
    ok: (a) => compare.rows.every((r) => has(a.text, { v: r.value.value, unit: 'USD' })),
  },
  { kind: 'fiscal', q: 'Which NVIDIA fiscal quarter ended on 26 July 2026?', ok: (a) => /Q2 (of )?(FY|fiscal( year)? )2027/i.test(a.text) },
  { kind: 'text', q: "What drove NVIDIA's revenue growth in Q2 FY2027?", ok: (a) => /data center/i.test(a.text) && citesText(a.text), needsCite: true },
  { kind: 'text', q: 'What revenue outlook did NVIDIA give for the next quarter?', ok: (a) => /\$?108(\.0)?\s?(B|billion)/i.test(a.text) && citesText(a.text), needsCite: true },
  { kind: 'text', q: 'What did NVIDIA say about China in its latest results?', ok: (a) => /china/i.test(a.text) && citesText(a.text), needsCite: true },
  { kind: 'decline', q: 'Should I buy NVIDIA stock right now?', ok: (a) => declines(a.text) },
  { kind: 'decline', q: "What will NVIDIA's revenue be in fiscal 2029?", ok: (a) => declines(a.text) },
];

// --- Run (or re-score the saved answers) ----------------------------------------------------
const LATEST = new URL('../../../docs/benchmark/latest.json', import.meta.url);
const results = [];
let arms;
if (args.rescore !== undefined || process.argv.includes('--rescore')) {
  const saved = JSON.parse(await (await import('node:fs/promises')).readFile(LATEST, 'utf8'));
  arms = [...new Set(saved.results.map((r) => r.arm))].map((name) => ({ name }));
  for (const r of saved.results) {
    const item = QUESTIONS.find((q) => q.question === r.question || q.q === r.question);
    results.push({ ...r, pass: !r.error && Boolean(item?.ok({ text: r.answer, tools: r.tools })) });
  }
} else {
const desk = await (await fetch(`${API}/conversations`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ replay: true }) })).json();
await chat(desk.conversationId, "Get NVIDIA's last four quarters and add them all to the desk.");
const project = await get(`/projects/${desk.projectId}`);
if (!project.filings.length) await chat(desk.conversationId, 'Add all');

arms = [
  { name: `${MODEL} on its own`, ask: (q) => baseline(q) },
  { name: 'MuTick agent', ask: (q) => chat(desk.conversationId, q) },
];
for (const arm of arms) {
  for (const item of QUESTIONS) {
    let a;
    try {
      a = await arm.ask(item.q);
    } catch (err) {
      a = { text: '', tools: [], error: String(err), ms: 0 };
    }
    const pass = !a.error && item.ok(a);
    results.push({ arm: arm.name, kind: item.kind, question: item.q, pass, cited: cites(a.text), ms: a.ms, tools: a.tools, answer: a.text, error: a.error });
    process.stdout.write(`${pass ? '✓' : '✗'} [${arm.name}] ${item.q} (${(a.ms / 1000).toFixed(1)}s)\n`);
  }
}
}

// --- Summary -----------------------------------------------------------------------------
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};
const kinds = { number: 'Exact figures (7)', fiscal: 'Fiscal labelling (1)', text: 'From the filing text (3)', decline: 'Declines advice and forecasts (2)' };
const summary = arms.map((arm) => {
  const rs = results.filter((r) => r.arm === arm.name);
  const by = (k) => rs.filter((r) => r.kind === k);
  return {
    arm: arm.name,
    passed: rs.filter((r) => r.pass).length,
    total: rs.length,
    byKind: Object.fromEntries(Object.keys(kinds).map((k) => [k, `${by(k).filter((r) => r.pass).length} / ${by(k).length}`])),
    cited: rs.filter((r) => r.kind !== 'decline' && r.cited).length,
    citable: rs.filter((r) => r.kind !== 'decline').length,
    p50: median(rs.map((r) => r.ms)) / 1000,
  };
});

const date = new Date().toISOString().slice(0, 10);
const md = [
  `Benchmark run ${date}: ${QUESTIONS.length} questions about NVIDIA's last four quarters, scored automatically.`,
  '',
  `| Setup | Passed | ${Object.values(kinds).join(' | ')} | Answers with sources | p50 latency |`,
  `| :-- | --: | ${Object.keys(kinds).map(() => '--:').join(' | ')} | --: | --: |`,
  ...summary.map(
    (s) =>
      `| ${s.arm} | **${s.passed} / ${s.total}** | ${Object.keys(kinds).map((k) => s.byKind[k]).join(' | ')} | ${s.cited} / ${s.citable} | ${s.p50.toFixed(1)} s |`,
  ),
].join('\n');
await mkdir(new URL('../../../docs/benchmark/', import.meta.url), { recursive: true });
await writeFile(LATEST, JSON.stringify({ date, model: MODEL, summary, results }, null, 2));
await writeFile(new URL('../../../docs/benchmark/latest.md', import.meta.url), md + '\n');
console.log('\n' + md);
