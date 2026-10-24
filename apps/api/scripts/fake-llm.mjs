// A local scripted stand-in for Mubit/OpenRouter Chat Completions, for
// rehearsing the desk without a provider key or credit. It walks the agent's
// "last four quarters" tool flow and returns conservative structured outputs
// for the extraction/intent/feedback work. It is not a real model or evaluator.
// A legacy Responses endpoint remains available for older local callers.
//
//   node scripts/fake-llm.mjs            (port 4099)
//   MUBIT_BASE_URL=http://localhost:4099/v1 MUBIT_API_KEY=fake pnpm dev

import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.FAKE_LLM_PORT ?? 4099);
const TICKERS = { nvidia: 'NVDA', nvda: 'NVDA', microsoft: 'MSFT', msft: 'MSFT', apple: 'AAPL', aapl: 'AAPL', alphabet: 'GOOGL', google: 'GOOGL', googl: 'GOOGL' };
const CORE_FIELDS = ['revenue', 'net_income', 'eps_diluted'];

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

function messageText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((part) => part?.text ?? '').join('');
}

function fromChatMessages(messages = []) {
  const input = [];
  for (const message of messages) {
    if (message.role === 'assistant') {
      const text = messageText(message.content);
      if (text) input.push({ role: 'assistant', content: text });
      for (const tool of message.tool_calls ?? []) {
        if (tool.type !== 'function') continue;
        input.push({ type: 'function_call', call_id: tool.id, name: tool.function.name, arguments: tool.function.arguments });
      }
    } else if (message.role === 'tool') {
      input.push({ type: 'function_call_output', call_id: message.tool_call_id, output: message.content });
    } else if (message.role === 'user') {
      input.push({ role: 'user', content: messageText(message.content) });
    }
  }
  return input;
}

function parseJson(text) {
  try { return JSON.parse(messageText(text)); } catch { return {}; }
}

function extractionIntent(context) {
  const request = String(context?.request ?? '').toLowerCase();
  const tickers = [...new Set(Object.entries(TICKERS).filter(([alias]) => request.includes(alias)).map(([, ticker]) => ticker))].slice(0, 5);
  const fields = [];
  if (/revenue|sales/.test(request)) fields.push('revenue');
  if (/net income|profit/.test(request)) fields.push('net_income');
  if (/eps|earnings per share|diluted earnings/.test(request)) fields.push('eps_diluted');
  if (/operating income/.test(request)) fields.push('operating_income');
  if (!fields.length) fields.push(...CORE_FIELDS);
  const year = request.match(/\b(?:fy\s*)?(20\d{2})\b/i)?.[1];
  const n = request.match(/(?:last|latest)\s+(\d+)\s+quarters?/i)?.[1];
  return {
    tickers,
    fields: [...new Set(fields)],
    fiscalYear: year ? Number(year) : null,
    lastNQuarters: n ? Math.max(1, Math.min(4, Number(n))) : 4,
    clarification: tickers.length || context?.documentIds?.length ? null : 'Which company or uploaded document should I extract?',
  };
}

function fakeStructuredResult(name, inputText) {
  const input = parseJson(inputText);
  if (name === 'extraction_intent_v2') return extractionIntent(input);
  if (name === 'section_extraction_v2') {
    const requested = Array.isArray(input.requestedFields) && input.requestedFields.length ? input.requestedFields : CORE_FIELDS;
    return {
      schemaVersion: '2',
      blocks: [],
      // The fake has no source-aware extraction. Explicit unknown/null values
      // are safer than plausible fabricated zeroes or financial values.
      facts: requested.map((key) => ({ key, label: key, basis: 'unknown', currency: null, period: null, value: null, range: null, unit: null, scale: null, qualifier: null,
        missingReason: 'The local fake has no source-aware extractor; no value was generated.', quote: '' })),
    };
  }
  if (name === 'feedback_evaluation_v2') return {
    decision: 'defer', reason: 'The local fake cannot verify the requested change against source evidence.',
    kind: 'correction', target: 'extractor', scope: 'team', lesson: null, factKey: null, evidence: null,
  };
  return { error: `Unsupported fake JSON schema: ${name}` };
}

function toChatCompletion(output, model) {
  const text = output.filter((item) => item.type === 'message').map((item) => item.content?.map((part) => part.text ?? '').join('') ?? '').join('');
  const toolCalls = output.filter((item) => item.type === 'function_call').map((item) => ({
    id: item.call_id, type: 'function', function: { name: item.name, arguments: item.arguments },
  }));
  return {
    id: `chatcmpl_${randomUUID()}`, object: 'chat.completion', created: Math.floor(Date.now() / 1000), model,
    choices: [{ index: 0, message: { role: 'assistant', content: toolCalls.length ? null : text, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) }, finish_reason: toolCalls.length ? 'tool_calls' : 'stop' }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0,
      prompt_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 }, completion_tokens_details: { reasoning_tokens: 0 } },
  };
}

async function bodyJson(req) {
  let body = '';
  for await (const chunk of req) body += chunk;
  return JSON.parse(body);
}

createServer(async (req, res) => {
  if (req.method !== 'POST' || !req.url?.match(/\/(chat\/completions|responses)$/)) {
    res.writeHead(404).end();
    return;
  }
  let params;
  try { params = await bodyJson(req); }
  catch { res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { message: 'Invalid JSON request body' } })); return; }
  const isChat = req.url.endsWith('/chat/completions');
  const jsonName = params.response_format?.type === 'json_schema' ? params.response_format.json_schema?.name : null;
  const output = jsonName ? [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(fakeStructuredResult(jsonName, params.messages?.at(-1)?.content)) }] }]
    : decide(isChat ? fromChatMessages(params.messages) : params.input ?? []);
  res.writeHead(200, { 'content-type': 'application/json', 'x-middleware-request-id': `mreq_fake${randomUUID().replace(/-/g, '')}` });
  res.end(JSON.stringify(isChat ? toChatCompletion(output, params.model) : {
      id: `resp_${randomUUID()}`,
      object: 'response',
      created_at: Math.floor(Date.now() / 1000),
      status: 'completed',
      model: params.model,
      output,
      usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
    }));
}).listen(PORT, () => console.log(`Fake model on http://localhost:${PORT}/v1`));
