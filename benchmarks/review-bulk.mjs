/** Offline audit of preserved bulk results. No credentials, network or inference calls. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { scoreCase, summarize } from './development-scoring.mjs';

const dirs = process.argv.slice(2);
if (!dirs.length) dirs.push('benchmarks/results/mubit-bulk-3000', 'benchmarks/results/mubit-bulk-2026-10-25');
const allCases = [], allCalls = [], runs = [];
for (const dir of dirs) {
  const report = JSON.parse(await readFile(`${dir}/summary.json`, 'utf8'));
  const fixtureBytes = await readFile(`${dir}/fixture.json`);
  assert.equal(createHash('sha256').update(fixtureBytes).digest('hex'), report.fixtureSha256);
  const fixtures = new Map(JSON.parse(fixtureBytes).cases.map(c => [c.id, c]));
  const events = (await readFile(`${dir}/calls.jsonl`, 'utf8')).trim().split('\n').map(JSON.parse);
  const starts = events.filter(c => c.event === 'started'), calls = events.filter(c => c.event === 'finished');
  assert.equal(starts.length, fixtures.size);
  assert.equal(calls.length, fixtures.size);
  for (const entries of [starts, calls]) assert.deepEqual(new Set(entries.map(c => c.caseId)), new Set(fixtures.keys()));
  const cases = [], groups = {}, fields = {}, mismatch = {}, quoteFailures = {};
  let wrongFieldsWithSupportedCandidate = 0, missingExpected = 0, missingCorrect = 0;
  for await (const line of createInterface({ input: createReadStream(`${dir}/cases.jsonl`), crlfDelay: Infinity })) {
    const c = JSON.parse(line), fixture = fixtures.get(c.id);
    assert.ok(fixture);
    assert.deepEqual(scoreCase(fixture, c.result), c.score);
    cases.push(c);
    const g = groups[c.category] ??= { cases: 0, correct: 0, verified: 0, errors: 0 };
    g.cases++; g.correct += Number(c.score.modelCorrect); g.verified += Number(c.score.verifiedCorrect); g.errors += Number(!!c.error);
    for (const f of c.score.fields) {
      const tally = fields[f.key] ??= { expected: 0, correct: 0, verified: 0 };
      tally.expected++; tally.correct += Number(f.modelCorrect); tally.verified += Number(f.verifiedCorrect);
      if (f.expected.missing) { missingExpected++; missingCorrect += Number(f.modelCorrect); }
      if (!f.modelCorrect) {
        if (c.error) { mismatch.requestError = (mismatch.requestError ?? 0) + 1; continue; }
        // Exclude application-generated missing fallbacks from numeric error attribution.
        const numeric = f.actual.filter(a => a.value !== null || a.range !== null);
        for (const attr of ['value', 'currency', 'unit', 'scale', 'basis']) {
          if (numeric.some(a => a[attr] !== f.expected[attr])) mismatch[attr] = (mismatch[attr] ?? 0) + 1;
        }
        for (const [attr, expected] of [['start', 'periodStart'], ['end', 'periodEnd'], ['months', 'months']]) {
          if (expected in f.expected && numeric.some(a => a.period?.[attr] !== f.expected[expected])) {
            mismatch[`period.${attr}`] = (mismatch[`period.${attr}`] ?? 0) + 1;
          }
        }
        if (!numeric.length) mismatch.noNumericCandidate = (mismatch.noNumericCandidate ?? 0) + 1;
        if (c.result?.facts.some(a => a.fact.key === f.key && a.supported)) wrongFieldsWithSupportedCandidate++;
      } else if (!f.verifiedCorrect) {
        const entries = c.result.facts.filter(a => a.fact.key === f.key && !a.supported && a.fact.value !== null);
        const reason = entries.some(a => a.span === null) ? 'missingExactSourceSpan' : 'other';
        quoteFailures[reason] = (quoteFailures[reason] ?? 0) + 1;
      }
    }
  }
  assert.equal(cases.length, fixtures.size);
  assert.equal(new Set(cases.map(c => c.id)).size, cases.length);
  const summary = summarize(cases, calls, fixtures.size);
  assert.deepEqual(summary, report.summary);
  const times = calls.filter(c => c.ok).map(c => c.latencyMs).sort((a, b) => a - b);
  const wallSeconds = (Date.parse(report.finishedAt) - Date.parse(report.startedAt)) / 1000;
  runs.push({ dir, summary, wallSeconds, requestsPerMinute: calls.length / wallSeconds * 60,
    meanSuccessfulCallMs: times.reduce((a, b) => a + b, 0) / times.length,
    p99SuccessfulCallMs: times[Math.ceil(times.length * .99) - 1],
    failedCallLatenciesMs: calls.filter(c => !c.ok).map(c => c.latencyMs),
    groups, fields, mismatch, quoteFailures, wrongFieldsWithSupportedCandidate, missingExpected, missingCorrect });
  allCases.push(...cases); allCalls.push(...calls);
}
assert.equal(new Set(allCases.map(c => c.id)).size, allCases.length);
assert.equal(new Set(allCases.map(c => c.contentSha256)).size, allCases.length);
const receipts = allCalls.filter(c => c.ok).map(c => c.requestId);
assert.ok(receipts.every(id => typeof id === 'string' && id.startsWith('mreq_')));
assert.equal(new Set(receipts).size, receipts.length);
console.log(JSON.stringify({ runs, pooled: summarize(allCases, allCalls, allCases.length),
  uniqueCases: allCases.length, uniqueContentHashes: allCases.length, distinctSuccessfulReceipts: receipts.length }, null, 2));
