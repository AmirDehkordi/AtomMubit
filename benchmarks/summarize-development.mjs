/** Offline reporting only: never imports an inference client. */
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {scoreCase} from './development-scoring.mjs';
const dir=resolve(process.argv[2]??'benchmarks/results/mubit-expanded-2026-10-24');
const report=JSON.parse(await readFile(join(dir,'report.json'),'utf8'));
const fixture=JSON.parse(await readFile(report.fixturePath,'utf8'));
const groups=new Map(),failures=new Map();let firstCorrect=0,firstFields=0,repairs=0;
for(const c of report.cases){
 const example=fixture.cases.find(e=>e.id===c.id),first=c.result?.attempts?.[0];
 const score=scoreCase(example,{facts:(first?.output?.facts??[]).map(fact=>({fact,sectionId:first.sectionId,supported:false}))});
 firstCorrect+=Number(score.modelCorrect);firstFields+=score.fields.filter(f=>f.modelCorrect).length;
 repairs+=Math.max(0,(c.result?.attempts?.length??0)-1);
 const category=c.category??'original-synthetic';
 const group=groups.get(category)??{count:0,model:0,verified:0};
 group.count++;group.model+=Number(c.score.modelCorrect);group.verified+=Number(c.score.verifiedCorrect);groups.set(category,group);
 const reasons=new Set((c.result?.checks??[]).filter(c=>c.check.outcome==='fail').map(c=>c.check.detail));
 for(const reason of reasons)failures.set(reason,(failures.get(reason)??0)+1);
}
const s=report.summary;
const times=report.cases.map(c=>c.latencyMs).sort((a,b)=>a-b),pct=(values,p)=>values.length?values[Math.ceil(values.length*p)-1]:null;
const state=report.stopReason?`Partial; ${report.stopReason}`:report.finishedAt?'Finished':'Partial; run has no completion marker';
const lines=['# Expanded Mubit extraction development report','',`Status: **${state}**.`,
 `Started ${report.startedAt}. Model: \`${report.model}\`; backend: \`${report.backend}\`.`,
 '',`Corpus: ${fixture.description}`,
 '', '| Measurement | Result |','| --- | --- |',
 `| Completed examples | ${s.completedCases} / ${s.plannedCases} |`,
 `| Confirmed calls in saved case results | ${s.modelCalls} / ${report.maxCalls} maximum |`,
 `| Successful calls | ${s.successfulCalls} |`,
 `| Completed repair attempts | ${repairs} |`,
 `| First-attempt field agreement | ${firstFields} / ${s.expectedFields} |`,
 `| Final field agreement | ${s.modelCorrectFields} / ${s.expectedFields} |`,
 `| Final source-verified field agreement | ${s.verifiedCorrectFields} / ${s.expectedFields} |`,
 `| First-attempt correct whole examples | ${firstCorrect} / ${s.completedCases} |`,
 `| Final correct whole examples | ${s.modelCorrectCases} / ${s.completedCases} |`,
 `| Final source-verified whole examples | ${s.verifiedCorrectCases} / ${s.completedCases} |`,
 `| Call latency p50 / p95 | ${s.p50CallLatencyMs} / ${s.p95CallLatencyMs} ms |`,
 `| Example latency p50 / p95, including repairs | ${pct(times,.5)} / ${pct(times,.95)} ms |`,
 `| Reported input / output tokens | ${s.reportedInputTokens} / ${s.reportedOutputTokens} |`,
 `| Usage complete for saved calls | ${s.usageComplete} |`,
 '| Billed cost | Unknown |','| Mubit kept examples / training / routing | Not measured by this runner |',
 '', 'Latency includes client and local telemetry overhead. Example latency includes repair calls. Partial reports omit any in-flight call not yet saved; do not treat their call count as an exact billing count.',
 '', '## Results by scenario', '', '| Scenario | Examples completed | Final correct | Source verified |','| --- | --- | --- | --- |'];
for(const [category,g] of groups)lines.push(`| ${category} | ${g.count} | ${g.model} | ${g.verified} |`);
lines.push('', '## Source validation failures', '', 'Counts below are examples with each failed check, including legacy display blocks. One example can have multiple failures.');
for(const [reason,count] of failures)lines.push(`- ${count}: ${reason}`);
lines.push('', '## Interpretation and reproducibility', '',
 'This is recorded development traffic, not a paired direct-provider versus Mubit benchmark. Expected answers and excerpts share their input data; SEC excerpts are reformatted XBRL, not original filings. Synthetic cases include repeated templates. Scores check value, currency, unit, scale, GAAP basis, duration, period end, explicit period start when specified, and model abstention for missing values; fiscal labels are not scored. These results cannot establish production accuracy or adapter improvement.',
 '', 'Eight AMZN/GOOGL excerpts remain unsent in `benchmarks/fixtures/extraction-holdout-candidates.json`. Those companies and accessions are absent from this development batch, but templates overlap. Independent review and original filing coverage are still required for a credible benchmark.',
 '', `Fixture SHA-256: \`${report.fixtureSha256}\`. Task fingerprint: \`${report.taskFingerprint}\`.`,
 '', 'Per-case model outputs, evidence checks, request IDs and local telemetry are retained in the ignored run directory. Gold labels are only used for local scoring.',
 '', 'Mubit records calls by default but trains only on examples its reviewer keeps. A successful request is not evidence of acceptance. Check the task review/history details and request/reply storage before sending more traffic solely to increase kept examples. See [Mubit adapter lifecycle](https://docs.mubit.ai/guides/first-adapter) and [request recording](https://docs.mubit.ai/guides/connect-gemini).');
await writeFile(join(dir,'analysis.md'),lines.join('\n')+'\n');
await writeFile(join(dir,'request-receipts.json'),JSON.stringify({startedAt:report.startedAt,model:report.model,calls:report.calls},null,2)+'\n');
console.log(JSON.stringify({report:join(dir,'analysis.md'),completed:s.completedCases,calls:s.modelCalls}));
