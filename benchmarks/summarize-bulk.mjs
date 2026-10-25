/** Read existing bulk results only; never send model requests. */
import {readFile,writeFile} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createInterface} from 'node:readline';
import {resolve,join} from 'node:path';
const dir=resolve(process.argv[2]??'benchmarks/results/mubit-bulk-3000');
const r=JSON.parse(await readFile(join(dir,'summary.json'),'utf8'));
const corpus=JSON.parse(await readFile(join(dir,'corpus-summary.json'),'utf8'));
const groups=new Map(),failures=new Map();
for(const c of r.cases){const key=c.category??'unknown',g=groups.get(key)??{n:0,correct:0,verified:0,errors:0};g.n++;g.correct+=Number(c.score.modelCorrect);g.verified+=Number(c.score.verifiedCorrect);g.errors+=Number(!!c.error);groups.set(key,g);}
for await(const line of createInterface({input:createReadStream(join(dir,'cases.jsonl')),crlfDelay:Infinity})){
 const c=JSON.parse(line),reasons=new Set((c.result?.checks??[]).filter(x=>x.check.outcome==='fail').map(x=>x.check.detail));
 for(const reason of reasons)failures.set(reason,(failures.get(reason)??0)+1);
}
const s=r.summary,pct=(n,d)=>(100*n/d).toFixed(2)+'%';
const successfulIds=r.calls.filter(c=>c.ok).map(c=>c.requestId);
const idsValid=successfulIds.every(id=>typeof id==='string'&&id.startsWith('mreq_'))&&new Set(successfulIds).size===successfulIds.length;
const lines=['# Mubit 3,000-request development batch','',`Started: ${r.startedAt}. Finished: ${r.finishedAt}.`,
`Status: ${r.stopReason??'Completed'}. Model: \`${r.model}\`; backend: \`${r.backend}\`.`,
'',`Corpus: ${corpus.publicSecCases} SEC XBRL excerpts and ${corpus.syntheticCases} synthetic variants across 20 scenario templates. These are ${corpus.total} unique inputs, not ${corpus.total} independent document structures. Reserved holdout companies were excluded.`,
'', '| Measurement | Result |','| --- | --- |',
`| Examples completed | ${s.completedCases}/${s.plannedCases} |`,
`| Outgoing requests | ${s.modelCalls}/${r.maxCalls} |`,
`| Successful requests | ${s.successfulCalls} |`,
`| Request errors | ${s.modelCalls-s.successfulCalls} |`,
`| All scored fields correct | ${s.modelCorrectCases}/${s.completedCases} (${pct(s.modelCorrectCases,s.completedCases)}) |`,
`| All scored fields correct and source-verified | ${s.verifiedCorrectCases}/${s.completedCases} (${pct(s.verifiedCorrectCases,s.completedCases)}) |`,
`| Field agreement | ${s.modelCorrectFields}/${s.expectedFields} (${pct(s.modelCorrectFields,s.expectedFields)}) |`,
`| Source-verified field agreement | ${s.verifiedCorrectFields}/${s.expectedFields} (${pct(s.verifiedCorrectFields,s.expectedFields)}) |`,
`| Successful call p50 / p95 | ${s.p50CallLatencyMs} / ${s.p95CallLatencyMs} ms |`,
`| Reported input / output tokens | ${s.reportedInputTokens} / ${s.reportedOutputTokens} |`,
`| Usage complete | ${s.usageComplete} |`,
`| Distinct mreq_ receipts for every successful call | ${idsValid} |`,
'| Billed cost | Unknown |','| Mubit kept examples / trained adapter / routing | Not verified |',
'', 'One call per example, no repair attempts, no SDK or application transport retries. Up to eight concurrent requests. Call latency includes client/telemetry overhead, so it is not pure provider latency. Provider-internal activity and billing are not measured.',
'', '## By scenario','', '| Scenario | Cases | All fields correct | Source-verified fields correct | Request errors |','| --- | ---: | ---: | ---: | ---: |'];
for(const [name,g] of groups)lines.push(`| ${name} | ${g.n} | ${g.correct} | ${g.verified} | ${g.errors} |`);
lines.push('', '## Failed source checks','', 'Counts are examples with a failed check; a case can have multiple reasons. These checks include display blocks, while the score above covers requested facts.');
for(const [reason,count] of [...failures].sort((a,b)=>b[1]-a[1]))lines.push(`- ${count}: ${reason}`);
lines.push('', '## Limits and reproducibility','',
'This batch is recorded development traffic, not a held-out accuracy benchmark and not a direct-provider/Mubit comparison. Gold and source excerpts derive from the same structured values. Public SEC data is reformatted XBRL rather than original filing prose; synthetic cases reuse templates. The scorer checks requested values, currencies, units, scales, basis, explicit date boundaries, duration and missing-value handling. It does not score every fiscal label, explanation, extra fact, or legacy display block. More requests do not establish model training or improved adapter accuracy.',
'',`Fixture SHA-256: \`${r.fixtureSha256}\`. Task fingerprint: \`${r.taskFingerprint}\`. Runtime rules SHA-256: \`${r.rulesSha256}\`.`,
'', 'Local artifacts: fixture.json, corpus-summary.json, metadata.json, calls.jsonl, cases.jsonl, summary.json and the telemetry database in the run directory. Calls are journaled before dispatch; the original results are preserved without selective retries.',
'', 'The last console evidence supplied before this batch showed reviewing status and zero kept examples. Only Mubit can confirm subsequent review, training or routing. A low kept count is not evidence of low extraction accuracy, and successful calls are not proof of acceptance.');
await writeFile(join(dir,'report.md'),lines.join('\n')+'\n');
console.log(JSON.stringify({report:join(dir,'report.md'),summary:s,distinctSuccessfulReceipts:idsValid}));
