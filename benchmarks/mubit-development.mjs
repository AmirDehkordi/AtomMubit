/** Recorded synthetic development batch; never a held-out or paired benchmark. */
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {scoreCase,summarize} from './development-scoring.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const argv=process.argv.slice(2), sending=argv.includes('--send');
const option=(name,fallback)=>argv.includes(name)?argv[argv.indexOf(name)+1]:fallback;
const maxCalls=Number(option('--max-calls','50'));
if(!Number.isInteger(maxCalls)||maxCalls<1||maxCalls>50)throw Error('--max-calls must be 1–50');
const fixture=JSON.parse(await readFile(join(root,'benchmarks/fixtures/mubit-development.json'),'utf8'));
if(fixture.split!=='development'||fixture.cases.length!==25)throw Error('Expected 25 development examples');
const ids=new Set();
for(const c of fixture.cases){
 if(ids.has(c.id)||!/^syn-\d{2}$/.test(c.id)||!c.content.includes('SYNTHETIC')||c.content.length>2000)throw Error('Invalid fixture identity/content');ids.add(c.id);
 if(c.fields.length!==3||c.gold.length!==3||new Set(c.gold.map(g=>g.key)).size!==3||c.gold.some(g=>!c.fields.includes(g.key)||g.missing!==(g.value===null)))throw Error('Invalid gold fields');
}
const reportDir=resolve(option('--output',join(root,'benchmarks/results',`mubit-development-${new Date().toISOString().replace(/[:.]/g,'-')}`)));
await mkdir(reportDir,{recursive:true});
await mkdir(join(reportDir,'samples'),{recursive:true});
for(const c of fixture.cases)await writeFile(join(reportDir,'samples',c.id+(c.format==='html'?'.html':'.txt')),c.content+'\n');
if(!sending){console.log(JSON.stringify({mode:'prepare-only',examples:fixture.cases.length,samples:join(reportDir,'samples'),maxCalls}));process.exit(0);}
await access(join(root,'apps/api/dist/extraction/engine.js'));
process.chdir(join(root,'apps/api'));
// Dedicated telemetry database: no application queue, discovery, or retry workers.
process.env.DATA_DIR=join(reportDir,'telemetry');process.env.DATABASE_URL='';process.env.RUN_MIGRATIONS='1';process.env.MIGRATIONS_DIR=join(root,'apps/api/drizzle');
const require=createRequire(join(root,'apps/api/package.json'));
require('reflect-metadata');
const {config}=require('./dist/core/config.js');
if(!config.mubitApiKey)throw Error('MUBIT_API_KEY is required');
const {DbService}=require('./dist/db/db.service.js');
const {MubitService}=require('./dist/mubit/mubit.service.js');
const {WorkflowService}=require('./dist/workflows/workflow.service.js');
const {ExtractionEngine}=require('./dist/extraction/engine.js');
const {prepareSections}=require('./dist/extraction/preparation.js');
const {STARTER_RULES,EXTRACTION_TASK_VERSION}=require('./dist/extraction/policy.js');
for(const c of fixture.cases)if(prepareSections({runId:c.id,documentId:c.id,content:c.content,format:c.format}).length!==1)throw Error('Each example must have one section to bound repair calls');
const db=new DbService();await db.onModuleInit();
const calls=[], cases=[];let activeCase;let stopReason=null;
const model=new MubitService(db), complete=model.completeJson.bind(model);
model.completeJson=async args=>{
 if(calls.length>=maxCalls){const error=new Error('Call cap reached');error.status=429;throw error;}
 const record={caseId:activeCase,latencyMs:null,requestId:null,inputTokens:null,outputTokens:null,ok:false,error:null};
 calls.push(record);const start=performance.now();
 try{const r=await complete({...args,maxOutputTokens:3000});Object.assign(record,{requestId:r.requestId,inputTokens:r.usage.input,outputTokens:r.usage.output,ok:true});return r;}
 catch(error){record.error=typeof error.status==='number'?`HTTP ${error.status}`:error.name;throw error;}
 finally{record.latencyMs=Math.round(performance.now()-start);}
};
const workflow=new WorkflowService(model);
const report={label:'Synthetic recorded development batch; not held-out accuracy or evidence of training',startedAt:new Date().toISOString(),backend:config.inferenceBackend,model:config.extractorModel,taskFingerprint:EXTRACTION_TASK_VERSION,maxCalls,maxOutputTokensPerCall:3000,recording:'default section_extractor recording; kept/training status unverified',cases,calls};
async function save(){report.summary=summarize(cases,calls,fixture.cases.length);report.stopReason=stopReason;await writeFile(join(reportDir,'report.json'),JSON.stringify(report,null,2));}
try{
 for(const example of fixture.cases){
  if(calls.length>=maxCalls){stopReason='Call cap reached';break;}
  activeCase=example.id;const start=performance.now();let result=null,error=null;
  try{result=await new ExtractionEngine({concurrency:1,callJson:input=>workflow.modelCall('section_extractor',`${report.startedAt}:${example.id}`,input)}).run({runId:`development:${report.startedAt}:${example.id}`,documentId:example.id,content:example.content,format:example.format,requestedFields:example.fields,rules:STARTER_RULES});}
  catch(e){error=typeof e.status==='number'?`HTTP ${e.status}`:e.name;if([401,402,403,429].includes(e.status))stopReason=error;}
  const score=scoreCase(example,result);cases.push({id:example.id,title:example.title,latencyMs:Math.round(performance.now()-start),error,score,result});
  await save();console.log(JSON.stringify({case:example.id,modelCorrect:score.modelCorrect,verifiedCorrect:score.verifiedCorrect,calls:calls.length,error}));
  if(stopReason)break;
 }
}finally{report.finishedAt=new Date().toISOString();await save();await db.onModuleDestroy();}
const s=report.summary,pct=(n,d)=>d?`${(100*n/d).toFixed(1)}%`:'n/a';
const lines=['# Mubit synthetic development batch','',`Model: ${report.model}; backend: ${report.backend}.`, '',
`Completed ${s.completedCases}/${s.plannedCases} examples using ${s.modelCalls}/${maxCalls} allowed calls.`,
`Model field agreement: ${s.modelCorrectFields}/${s.expectedFields} (${pct(s.modelCorrectFields,s.expectedFields)}). Source-verified field agreement: ${s.verifiedCorrectFields}/${s.expectedFields} (${pct(s.verifiedCorrectFields,s.expectedFields)}).`,
`Whole examples: ${s.modelCorrectCases} model-correct; ${s.verifiedCorrectCases} source-verified.`,
`Successful call latency p50: ${s.p50CallLatencyMs} ms; p95: ${s.p95CallLatencyMs} ms (includes client and telemetry overhead).`,
`Reported tokens: ${s.reportedInputTokens} input, ${s.reportedOutputTokens} output. Usage complete: ${s.usageComplete}. Billed cost: unknown.`,
'', 'Field agreement checks value, currency, unit, scale, basis, period end, duration and explicit missing-value handling; it does not score fiscal-year labels or period-start equality. Source validation separately checks claimed starts and evidence.',
'', 'Calls use normal section_extractor recording. This does not confirm that Mubit kept examples, trained an adapter, or improved a model. These generated synthetic development cases are not a held-out financial benchmark. Gold answers are used only by the local scorer and are never added to prompts.',
'', '| Case | Model fields | Source verified | Notes |','| --- | --- | --- | --- |'];
for(const c of cases)lines.push(`| ${c.id}: ${c.title} | ${c.score.fields.filter(f=>f.modelCorrect).length}/3 | ${c.score.fields.filter(f=>f.verifiedCorrect).length}/3 | ${c.error??c.score.fields.filter(f=>f.reason).map(f=>`${f.key}: ${f.reason}`).join('; ')} |`);
if(stopReason)lines.push('',`Stopped: ${stopReason}`);
await writeFile(join(reportDir,'report.md'),lines.join('\n')+'\n');
console.log(JSON.stringify({report:join(reportDir,'report.md'),summary:s,stopReason}));
