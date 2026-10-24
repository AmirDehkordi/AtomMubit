// A scripted stand-in for the model, for developing and rehearsing the desk
// without a Mubit key or credit. It speaks the Responses API and walks the
// "last four quarters" flow: find_filings → ask_user → add_filings →
// show_on_dashboard → answer. It is not the product's model.
//
//   node scripts/fake-llm.mjs            (port 4099)
//   MUBIT_BASE_URL=http://localhost:4099/v1 MUBIT_API_KEY=fake pnpm dev

import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.FAKE_LLM_PORT ?? 4099);
const TICKERS = { nvidia: 'NVDA', nvda: 'NVDA', microsoft: 'MSFT', msft: 'MSFT', apple: 'AAPL', aapl: 'AAPL', alphabet: 'GOOGL', google: 'GOOGL', googl: 'GOOGL' };

const call = (name, args) => ({
  type: 'function_call',
  id: `fc_${randomUUID().slice(0, 8)}`,
  call_id: `call_${randomUUID().slice(0, 8)}`,
  name,
  arguments: JSON.stringify(args),
  status: 'completed',
});
const say = (text) => ({
  type: 'message',
  id: `msg_${randomUUID().slice(0, 8)}`,
  role: 'assistant',
  status: 'completed',
  content: [{ type: 'output_text', text, annotations: [] }],
});

function lastOutput(input, name) {
  const callIds = input.filter((i) => i.type === 'function_call' && i.name === name).map((i) => i.call_id);
  const out = [...input].reverse().find((i) => i.type === 'function_call_output' && callIds.includes(i.call_id));
  return out ? JSON.parse(out.output) : null;
}

function decide(input) {
  const last = input.at(-1);
  if (last?.type === 'function_call_output') {
    const fc = input.find((i) => i.type === 'function_call' && i.call_id === last.call_id);
    const out = JSON.parse(last.output);
    if (out.error) return [say(`That didn't work: ${out.error}`)];
    switch (fc?.name) {
      case 'find_filings': {
        const qs = out.filings.map((f) => f.quarter).reverse();
        return [call('ask_user', { question: `I found ${out.filings.length} filings for ${out.company.name}, ${qs[0]} to ${qs.at(-1)}. Add them to the desk?`, options: ['Add all', 'Pick'] })];
      }
      case 'add_filings': {
        const periods = out.added.map((a) => a.periodEnd).sort();
        return [call('show_on_dashboard', { spec: { view: 'quarter_overview', ticker: out.added[0].ticker, periods } })];
      }
      case 'compare':
        return [call('show_on_dashboard', { spec: { view: 'compare', metric: 'revenue', tickers: out.companies.map((c) => c.ticker), periodEnd: null } })];
      case 'show_on_dashboard': {
        const metrics = lastOutput(input, 'compare');
        if (metrics) {
          const lines = metrics.companies.map((c) => `- **${c.ticker}** ${c.value} in ${c.quarter} (${c.changeVsYearAgo ?? 'n/a'} vs a year ago) [[f:${c.sources[0]}]]`);
          return [say(`Here is ${metrics.metric.toLowerCase()} side by side:\n${lines.join('\n')}`)];
        }
        const added = lastOutput(input, 'add_filings');
        return [say(`Added ${added?.added.length ?? 0} filings. The dashboard shows the four quarters from the SEC's XBRL data; the desk is reading the filings in the background.`)];
      }
      default:
        return [say('Done.')];
    }
  }
  const text = String(last?.content ?? '').toLowerCase();
  if (/add all|add them/.test(text)) {
    const found = lastOutput(input, 'find_filings');
    if (found) return [call('add_filings', { accessions: found.filings.map((f) => f.accession) })];
  }
  const tickers = [...new Set(Object.entries(TICKERS).filter(([k]) => text.includes(k)).map(([, v]) => v))];
  if (/compare/.test(text) && tickers.length >= 2) {
    return [call('compare', { metric: 'revenue', tickers, periodEnd: null })];
  }
  if (tickers.length) {
    return [call('find_filings', { ticker: tickers[0], forms: ['10-Q', '10-K'], lastNQuarters: 4, fiscalYear: null })];
  }
  return [say("I'm the scripted fake model. Try: \"Get NVIDIA's last four quarters\" or \"Compare NVIDIA and Microsoft revenue\".")];
}

createServer(async (req, res) => {
  if (req.method !== 'POST' || !req.url?.endsWith('/responses')) {
    res.writeHead(404).end();
    return;
  }
  let body = '';
  for await (const chunk of req) body += chunk;
  const params = JSON.parse(body);
  const output = decide(params.input ?? []);
  res.writeHead(200, { 'content-type': 'application/json', 'x-middleware-request-id': `mreq_fake${randomUUID().replace(/-/g, '')}` });
  res.end(
    JSON.stringify({
      id: `resp_${randomUUID()}`,
      object: 'response',
      created_at: Math.floor(Date.now() / 1000),
      status: 'completed',
      model: params.model,
      output,
      usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
    }),
  );
}).listen(PORT, () => console.log(`Fake model on http://localhost:${PORT}/v1`));
