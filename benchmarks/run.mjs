#!/usr/bin/env node
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const args = new Set(process.argv.slice(2));
const flagValue = (flag) => { const i = process.argv.indexOf(flag); return i < 0 ? undefined : process.argv[i + 1]; };
const fixturePath = resolve(flagValue('--fixture') ?? 'benchmarks/fixtures/smoke.json');
const reportPath = resolve(flagValue('--report') ?? `benchmarks/results/${new Date().toISOString().replaceAll(':', '-')}.json`);
const paid = args.has('--paid');
const fixtureBytes = await readFile(fixturePath);
const fixture = JSON.parse(fixtureBytes.toString('utf8'));
if (typeof fixture.id !== 'string' || typeof fixture.model !== 'string' || typeof fixture.provider !== 'string' || typeof fixture.input !== 'string' || !fixture.schema || !Array.isArray(fixture.gold)) throw new Error('Fixture must include id, model, provider, input, schema, and gold facts.');

if (fixture.split === 'test' || fixture.split === 'holdout') {
  if (!paid || process.env.MUBIT_UNRECORDED_CONFIRMED !== '1') throw new Error('Holdout execution requires --paid and MUBIT_UNRECORDED_CONFIRMED=1.');
}
if (paid && !args.has('--confirm-paid')) throw new Error('Paid calls require explicit --confirm-paid.');
if (paid && (!process.env.OPENROUTER_API_KEY || !process.env.MUBIT_API_KEY)) throw new Error('Set OPENROUTER_API_KEY and MUBIT_API_KEY for paired paid calls.');
const budget = Number(flagValue('--max-cost-usd') ?? 0);
const rates = {
  direct: { input: envNumber('BENCH_DIRECT_INPUT_USD_PER_MILLION'), cacheRead: envNumber('BENCH_DIRECT_CACHE_READ_USD_PER_MILLION'), cacheWrite: envNumber('BENCH_DIRECT_CACHE_WRITE_USD_PER_MILLION'), output: envNumber('BENCH_DIRECT_OUTPUT_USD_PER_MILLION'), fee: 0 },
  mubit: { input: envNumber('BENCH_MUBIT_INPUT_USD_PER_MILLION'), cacheRead: envNumber('BENCH_MUBIT_CACHE_READ_USD_PER_MILLION'), cacheWrite: envNumber('BENCH_MUBIT_CACHE_WRITE_USD_PER_MILLION'), output: envNumber('BENCH_MUBIT_OUTPUT_USD_PER_MILLION'), fee: envNumber('BENCH_MUBIT_FEE_USD_PER_CALL') },
};
const outputCap = Number(flagValue('--max-output-tokens') ?? 512);
const repetitions = Number(flagValue('--repetitions') ?? 5);
const seed = Number(flagValue('--seed') ?? 42);
if (paid && (!Number.isFinite(budget) || budget <= 0)) throw new Error('Paid calls require positive --max-cost-usd.');
if (paid && Object.values(rates).some((r) => !Number.isFinite(r.input) || !Number.isFinite(r.cacheRead) || !Number.isFinite(r.cacheWrite) || !Number.isFinite(r.output) || !Number.isFinite(r.fee))) throw new Error('Paid calls require per-arm input, cached-input, cache-write and output rates plus BENCH_MUBIT_FEE_USD_PER_CALL. Use zero only for a verified zero-rate category or fee.');
if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 100) throw new Error('--repetitions must be an integer from 1 through 100.');
if (!Number.isInteger(seed)) throw new Error('--seed must be an integer.');
if (!Number.isInteger(outputCap) || outputCap < 16 || outputCap > 128_000) throw new Error('--max-output-tokens must be an integer from 16 through 128000.');
if (paid && Object.values(rates).some((r) => Object.values(r).some((v) => !Number.isFinite(v) || v < 0))) throw new Error('Configured spend rates and fees must be finite non-negative numbers.');

const attempts = [];
const mock = !paid;
const mockOutput = { facts: fixture.gold };
const clients = {};
if (paid) {
  const require = createRequire(resolve(dirname(fileURLToPath(import.meta.url)), '../apps/api/package.json'));
  const { default: OpenAI } = require('openai');
  clients.direct = new OpenAI({ apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: 'https://openrouter.ai/api/v1', maxRetries: 0, timeout: 120000 });
  clients.mubit = new OpenAI({ apiKey: process.env.MUBIT_API_KEY,
    baseURL: 'https://api.mubit.ai/compat/openrouter/v1', maxRetries: 0, timeout: 120000 });
}
const systemPrompt = 'Extract only explicitly supported facts. Keep exact evidence quotes. Return the required JSON.';
const requestHash = createHash('sha256').update(JSON.stringify({ model: fixture.model, provider: fixture.provider, systemPrompt, input: fixture.input, schema: fixture.schema, outputCap })).digest('hex');
const byteInputCap = Buffer.byteLength(systemPrompt, 'utf8') + Buffer.byteLength(fixture.input, 'utf8') + Buffer.byteLength(JSON.stringify(fixture.schema), 'utf8') + 1024;
const estimatedCost = Object.fromEntries(Object.entries(rates).map(([arm, r]) => [arm,
  Number.isFinite(r.input) && Number.isFinite(r.cacheRead) && Number.isFinite(r.cacheWrite) && Number.isFinite(r.output)
    ? byteInputCap * Math.max(r.input, r.cacheRead, r.cacheWrite) / 1e6 + outputCap * r.output / 1e6 + r.fee : null]));
let stopReason = null;
let randomState = (seed >>> 0) || 1;
const random = () => { randomState = (1664525 * randomState + 1013904223) >>> 0; return randomState / 0x100000000; };
pairLoop: for (let repetition = 0; repetition < repetitions; repetition++) {
  const order = random() < 0.5 ? ['direct', 'mubit'] : ['mubit', 'direct'];
  if (paid) {
    const spentOrReserved = attempts.reduce((sum, a) => sum + (a.estimatedCostUsd ?? a.budgetReservationUsd ?? 0), 0);
    if (spentOrReserved + estimatedCost.direct + estimatedCost.mubit > budget) { stopReason = 'budget_cap_before_paired_repetition'; break; }
  }
  for (const arm of order) {
    const exposure = attempts.reduce((sum, a) => sum + (a.estimatedCostUsd ?? a.budgetReservationUsd ?? 0), 0);
    if (paid && exposure + estimatedCost[arm] > budget) { stopReason = 'budget_cap_before_call'; break pairLoop; }
    const rate = rates[arm];
    const started = performance.now();
    let result = mock ? mockOutput : null; let usage = null; let providerRequestId = null; let servedModel = null; let servedProvider = null; let error = null;
    try {
      if (paid) {
        const isMubit = arm === 'mubit';
        const sessionId = `bench-${fixture.id}-${arm}-r${repetition}`;
        const client = clients[arm];
        const response = await client.chat.completions.create({
          model: fixture.model,
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: fixture.input }],
          session_id: sessionId,
          response_format: { type: 'json_schema', json_schema: { name: 'benchmark_result', strict: true, schema: fixture.schema } },
          max_tokens: outputCap,
          usage: { include: true },
          provider: { order: [fixture.provider], require_parameters: true, allow_fallbacks: false },
        }, { headers: isMubit ? { 'x-middleware-record': 'off', 'x-middleware-request-id': `bench-${fixture.id}-r${repetition}-${arm}-${Date.now()}`, 'x-openrouter-metadata': 'enabled' } : { 'x-openrouter-metadata': 'enabled' } });
        providerRequestId = response.id;
        servedModel = typeof response.model === 'string' ? response.model : null;
        servedProvider = typeof response.provider === 'string' ? response.provider : typeof response.openrouter_metadata?.provider_name === 'string' ? response.openrouter_metadata.provider_name : null;
        const rawUsage = response.usage;
        usage = rawUsage ? {
          input: rawUsage.prompt_tokens ?? null,
          cachedInput: rawUsage.prompt_tokens_details?.cached_tokens ?? null,
          cacheWrite: rawUsage.prompt_tokens_details?.cache_write_tokens ?? null,
          output: rawUsage.completion_tokens ?? null,
          reasoningOutput: rawUsage.completion_tokens_details?.reasoning_tokens ?? null,
        } : null;
        result = JSON.parse(response.choices[0]?.message.content ?? 'null');
        if (!matchesSchema(result, fixture.schema)) throw new Error('invalid structured response');
      }
    } catch (e) { error = Number.isInteger(e?.status) ? `HTTP ${e.status}` : safeError(e); }
    const latencyMs = mock ? null : performance.now() - started;
    if (!error && !matchesSchema(result, fixture.schema)) error = 'SchemaValidationError';
    const score = scoreFacts(fixture.gold, error ? [] : result?.facts ?? []);
    const uncachedInput = usage && usage.input != null && usage.cachedInput != null && usage.cacheWrite != null
      ? usage.input - usage.cachedInput - usage.cacheWrite : null;
    const actualCost = usage && uncachedInput != null && uncachedInput >= 0 && usage.output != null
      ? (uncachedInput * rate.input + usage.cachedInput * rate.cacheRead + usage.cacheWrite * rate.cacheWrite + usage.output * rate.output) / 1e6 + rate.fee : null;
    const sessionId = `bench-${fixture.id}-${arm}-r${repetition}`;
    attempts.push({ fixtureId: fixture.id, fixtureSha256: createHash('sha256').update(fixtureBytes).digest('hex'), requestHash: createHash('sha256').update(`${requestHash}:${sessionId}`).digest('hex'), repetition, split: fixture.split, arm, model: fixture.model, provider: fixture.provider, servedModel, servedProvider,
      requestId: providerRequestId, latencyMs, ok: !error, error, usage,
      estimatedCostUsd: actualCost, budgetReservationUsd: estimatedCost[arm], billedCostUsd: null,
      costStatus: actualCost == null ? 'unknown' : 'configured_rate_estimate_not_billed', score });
  }
}

const summary = Object.fromEntries(['direct', 'mubit'].map((arm) => {
  const rows = attempts.filter((a) => a.arm === arm);
  const success = rows.filter((a) => a.ok);
  return [arm, { attempts: rows.length, success: success.length, errors: rows.length - success.length,
    latencyP50Ms: quantile(success.map((a) => a.latencyMs), .5), latencyP95Ms: quantile(success.map((a) => a.latencyMs), .95),
    errorLatencyP50Ms: quantile(rows.filter((a) => !a.ok).map((a) => a.latencyMs), .5),
    strictFactAccuracy: mean(rows.map((a) => a.score.factAccuracy)), evidenceAccuracy: mean(rows.map((a) => a.score.evidenceAccuracy)),
    factPrecision: mean(rows.map((a) => a.score.factPrecision)), unsupportedClaims: rows.reduce((s, a) => s + a.score.unsupportedClaims, 0),
    totalEstimatedCostUsd: rows.some((a) => a.estimatedCostUsd == null) ? null : rows.reduce((s, a) => s + a.estimatedCostUsd, 0), billedCostUsd: null,
    costStatus: rows.every((a) => a.estimatedCostUsd != null) ? 'configured_rate_estimate_not_billed' : 'unknown' }];
}));
const paired = Array.from({ length: repetitions }, (_, repetition) => {
  const direct = attempts.find((a) => a.repetition === repetition && a.arm === 'direct');
  const mubit = attempts.find((a) => a.repetition === repetition && a.arm === 'mubit');
  return direct && mubit ? { repetition, latencyDiffMs: direct.latencyMs != null && mubit.latencyMs != null ? mubit.latencyMs - direct.latencyMs : null,
    strictFactAccuracyDiff: mubit.score.factAccuracy - direct.score.factAccuracy, evidenceAccuracyDiff: mubit.score.evidenceAccuracy - direct.score.evidenceAccuracy,
    estimatedCostDiffUsd: mubit.estimatedCostUsd != null && direct.estimatedCostUsd != null ? mubit.estimatedCostUsd - direct.estimatedCostUsd : null } : null;
}).filter(Boolean);
const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), mode: mock ? 'offline_fake' : 'paid_live', complete: attempts.length === repetitions * 2, incompleteReason: stopReason, repetitions, randomSeed: seed, requestHash, fixture: { id: fixture.id, split: fixture.split, path: fixturePath, sha256: createHash('sha256').update(fixtureBytes).digest('hex') }, budgetUsd: paid ? budget : null, attempts, paired, summary,
  caveats: ['Synthetic smoke fixture; not a reviewed financial benchmark.', 'Repeated calls measure variability, not independent financial examples.', 'Configured rate estimates are not billed costs; include and verify Mubit platform fees before interpreting cost comparisons.', 'No run establishes provider identity beyond the requested route/model/provider.'] };
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ report: reportPath, mode: report.mode, summary }, null, 2));

function scoreFacts(gold, output) {
  if (!Array.isArray(output)) output = [];
  const used = new Set(); let correct = 0; let evidence = 0;
  for (const expected of gold) {
    const idx = output.findIndex((f, i) => !used.has(i) && f?.name === expected.name);
    if (idx < 0) continue;
    used.add(idx); const actual = output[idx];
    if (actual.value === expected.value && actual.evidence === expected.evidence) { correct++; evidence++; }
    else if (actual.evidence === expected.evidence) evidence++;
  }
  return { factAccuracy: gold.length ? correct / gold.length : null, evidenceAccuracy: gold.length ? evidence / gold.length : null,
    factPrecision: output.length ? correct / output.length : 0, unsupportedClaims: Math.max(0, output.length - correct), expectedFacts: gold.length, matchedFacts: used.size };
}
function matchesSchema(value, schema, root = schema) {
  const supported = new Set(['$ref', '$defs', '$schema', 'definitions', 'title', 'description', 'default', 'examples', 'type', 'enum', 'const', 'anyOf', 'oneOf', 'allOf', 'not', 'properties', 'required', 'additionalProperties', 'items', 'minItems', 'maxItems', 'uniqueItems', 'minProperties', 'maxProperties', 'minLength', 'maxLength', 'pattern', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'format']);
  if (Object.keys(schema).some((key) => !supported.has(key))) return false;
  if (schema.$ref) {
    let target = root;
    for (const part of schema.$ref.replace(/^#\//, '').split('/').map((x) => x.replaceAll('~1', '/').replaceAll('~0', '~'))) target = target?.[part];
    if (!target || !matchesSchema(value, target, root)) return false;
  }
  if (schema.anyOf && !schema.anyOf.some((s) => matchesSchema(value, s, root))) return false;
  if (schema.oneOf && schema.oneOf.filter((s) => matchesSchema(value, s, root)).length !== 1) return false;
  if (schema.allOf && !schema.allOf.every((s) => matchesSchema(value, s, root))) return false;
  if (schema.not && matchesSchema(value, schema.not, root)) return false;
  const types = schema.type ? Array.isArray(schema.type) ? schema.type : [schema.type] : null;
  if (types && !types.some((t) => matchesType(value, t))) return false;
  if (schema.enum && !schema.enum.some((x) => JSON.stringify(x) === JSON.stringify(value))) return false;
  if ('const' in schema && JSON.stringify(schema.const) !== JSON.stringify(value)) return false;
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const keys = Object.keys(value);
    if (!(schema.type === 'object' || schema.properties || schema.required || schema.additionalProperties !== undefined || schema.minProperties != null || schema.maxProperties != null)) return true;
    if (!(schema.minProperties == null || keys.length >= schema.minProperties) || !(schema.maxProperties == null || keys.length <= schema.maxProperties)) return false;
    if (!(schema.required ?? []).every((key) => key in value)) return false;
    return Object.entries(value).every(([key, child]) => key in (schema.properties ?? {}) ? matchesSchema(child, schema.properties[key], root)
      : schema.additionalProperties === true || schema.additionalProperties && typeof schema.additionalProperties === 'object' ? matchesSchema(child, schema.additionalProperties, root) : schema.additionalProperties !== false);
  }
  if (Array.isArray(value)) {
    if (!(schema.type === 'array' || schema.items || schema.minItems != null || schema.maxItems != null)) return true;
    return (schema.minItems == null || value.length >= schema.minItems) && (schema.maxItems == null || value.length <= schema.maxItems)
      && (!schema.uniqueItems || new Set(value.map((x) => JSON.stringify(x))).size === value.length)
      && (!schema.items || value.every((item) => matchesSchema(item, schema.items, root)));
  }
  if (typeof value === 'string') {
    const length = Array.from(value).length;
    return (schema.minLength == null || length >= schema.minLength) && (schema.maxLength == null || length <= schema.maxLength)
      && (!schema.pattern || new RegExp(schema.pattern).test(value))
      && (!schema.format || (schema.format === 'date' ? validDate(value) : schema.format === 'date-time' ? !Number.isNaN(Date.parse(value)) : false));
  }
  if (typeof value === 'number' && Number.isFinite(value)) return (schema.minimum == null || value >= schema.minimum)
    && (schema.maximum == null || value <= schema.maximum) && (schema.exclusiveMinimum == null || value > schema.exclusiveMinimum)
    && (schema.exclusiveMaximum == null || value < schema.exclusiveMaximum) && (schema.multipleOf == null || Math.abs(value / schema.multipleOf - Math.round(value / schema.multipleOf)) < 1e-9);
  if (schema.format) return false;
  return true;
}
function matchesType(value, type) {
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  if (type === 'array') return Array.isArray(value);
  if (type === 'integer') return typeof value === 'number' && Number.isInteger(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (type === 'null') return value === null;
  return typeof value === type;
}
function validDate(value) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const d = new Date(`${value}T00:00:00Z`); return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value; }
function safeError(error) { const name = error?.constructor?.name; return /^[A-Za-z0-9]+Error$/.test(name ?? '') ? name : 'Error'; }
function envNumber(name) { const raw = process.env[name]; return raw?.trim() ? Number(raw) : NaN; }
function quantile(values, p) { if (!values.length) return null; const s = [...values].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)]; }
function mean(values) { const v = values.filter(Number.isFinite); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; }
