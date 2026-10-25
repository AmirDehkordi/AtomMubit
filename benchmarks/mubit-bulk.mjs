/** Explicitly authorized, one-call-per-example recorded development run. */
import {readFile,writeFile,appendFile,mkdir,rename} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {fingerprint,validateDevelopmentFixture} from './development-fixture.mjs';
import {scoreCase,summarize} from './development-scoring.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2),option=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const fixturePath=resolve(option('--fixture','benchmarks/results/mubit-bulk-3000/fixture.json'));
const output=resolve(option('--output','benchmarks/results/mubit-bulk-3000'));
const raw=await readFile(fixturePath,'utf8'),fixture=JSON.parse(raw);
const maxCalls=Number(option('--max-calls','3000')),concurrency=Number(option('--concurrency','8'));
if(!Number.isInteger(maxCalls)||maxCalls<1||maxCalls>3000)throw Error('Call limit must be 1–3000');
if(!Number.isInteger(concurrency)||concurrency<1||concurrency>8)throw Error('Concurrency must be 1–8');
if(!fixture.cases?.length||fixture.cases.length>maxCalls)throw Error('Every case requires one budgeted call');
const ids=new Set(),hashes=new Set();
for(let i=0;i<fixture.cases.length;i+=100)validateDevelopmentFixture({...fixture,cases:fixture.cases.slice(i,i+100)},100);
for(const c of fixture.cases){const hash=fingerprint(c.content);if(ids.has(c.id)||hashes.has(hash))throw Error('Duplicate example');ids.add(c.id);hashes.add(hash);}
await mkdir(output,{recursive:true});
if(!args.includes('--send')){console.log(JSON.stringify({mode:'prepare-only',cases:fixture.cases.length,maxCalls,concurrency}));process.exit(0);}
await writeFile(join(output,'send.lock'),new Date().toISOString(),{flag:'wx'});
process.chdir(join(root,'apps/api'));
process.env.DATA_DIR=join(output,'telemetry');process.env.DATABASE_URL='';process.env.RUN_MIGRATIONS='1';process.env.MIGRATIONS_DIR=join(root,'apps/api/drizzle');
const require=createRequire(join(root,'apps/api/package.json'));require('reflect-metadata');
const {config}=require('./dist/core/config.js'),{DbService}=require('./dist/db/db.service.js');
const {MubitService}=require('./dist/mubit/mubit.service.js'),{WorkflowService}=require('./dist/workflows/workflow.service.js');
const {ExtractionEngine}=require('./dist/extraction/engine.js'),{prepareSections}=require('./dist/extraction/preparation.js');
const {STARTER_RULES,EXTRACTION_TASK_VERSION}=require('./dist/extraction/policy.js');
if(!config.mubitApiKey)throw Error('MUBIT_API_KEY required');
for(const c of fixture.cases)if(prepareSections({runId:c.id,documentId:c.id,content:c.content,format:c.format}).length!==1)throw Error('Each example must produce exactly one section');
const db=new DbService();await db.onModuleInit();
const model=new MubitService(db),complete=model.completeJson.bind(model),workflow=new WorkflowService(model);
const calls=[],cases=[];let cursor=0,stopReason=null,journal=Promise.resolve(),lastProgress=0;
const startedAt=new Date().toISOString();
const metadata={startedAt,fixturePath,fixtureSha256:fingerprint(raw),model:config.extractorModel,backend:config.inferenceBackend,taskFingerprint:EXTRACTION_TASK_VERSION,rulesSha256:fingerprint(JSON.stringify(STARTER_RULES)),maxCalls,concurrency,repairs:0,transportRetries:false,label:'Recorded development traffic; kept/training/routing status not measured'};
await writeFile(join(output,'metadata.json'),JSON.stringify(metadata,null,2));
function append(file,value){const line=JSON.stringify(value)+'\n';journal=journal.then(()=>appendFile(join(output,file),line));return journal;}
model.completeJson=async request=>{
 if(stopReason||calls.length>=maxCalls){const error=new Error(stopReason??'Call cap reached');error.name='BatchStopped';throw error;}
 const call={caseId:request.runId.split(':').at(-1),ordinal:calls.length+1,latencyMs:null,requestId:null,inputTokens:null,outputTokens:null,ok:false,error:null};
 calls.push(call);await append('calls.jsonl',{event:'started',...call});
 const start=performance.now();
 try{const r=await complete({...request,maxOutputTokens:3000,retryTransientErrors:false});Object.assign(call,{ok:true,requestId:r.requestId,inputTokens:r.usage.input,outputTokens:r.usage.output});return r;}
 catch(error){call.error=typeof error.status==='number'?`HTTP ${error.status}`:error.name;if([401,402,403,429].includes(error.status))stopReason=call.error;throw error;}
 finally{call.latencyMs=Math.round(performance.now()-start);await append('calls.jsonl',{event:'finished',...call});}
};
const stop=()=>{stopReason='Interrupted; no further calls started';};process.on('SIGINT',stop);process.on('SIGTERM',stop);
let snapshots=Promise.resolve();
async function progress(force=false){
 if(!force&&Date.now()-lastProgress<10000)return;lastProgress=Date.now();
 const summary=summarize(cases,calls,fixture.cases.length),snapshot={...metadata,summary,stopReason,updatedAt:new Date().toISOString()};
 snapshots=snapshots.then(async()=>{await writeFile(join(output,'progress.tmp'),JSON.stringify(snapshot,null,2));await rename(join(output,'progress.tmp'),join(output,'progress.json'));});
 await snapshots;console.log(JSON.stringify({completed:summary.completedCases,calls:summary.modelCalls,successful:summary.successfulCalls,correct:summary.modelCorrectCases,verified:summary.verifiedCorrectCases,stopReason}));
}
try{
 await Promise.all(Array.from({length:concurrency},async()=>{
  while(!stopReason&&cursor<fixture.cases.length){
   const example=fixture.cases[cursor++],start=performance.now();let result=null,error=null;
   try{result=await new ExtractionEngine({concurrency:1,maxAttempts:1,callJson:input=>workflow.modelCall('section_extractor',`bulk:${startedAt}:${example.id}`,input)}).run({runId:`bulk:${startedAt}:${example.id}`,documentId:example.id,content:example.content,format:example.format,sourceUrl:example.provenance?.url,requestedFields:example.fields,rules:STARTER_RULES});}
   catch(e){error=typeof e.status==='number'?`HTTP ${e.status}`:e.name;}
   const score=scoreCase(example,result),record={id:example.id,title:example.title,category:example.category,contentSha256:fingerprint(example.content),latencyMs:Math.round(performance.now()-start),error,score,result};
   await append('cases.jsonl',record);cases.push({id:record.id,category:record.category,error,score});await progress();
  }
 }));
}finally{
 await journal;await progress(true);
 await writeFile(join(output,'summary.json'),JSON.stringify({...metadata,finishedAt:new Date().toISOString(),stopReason,summary:summarize(cases,calls,fixture.cases.length),calls,cases},null,2));
 await db.onModuleDestroy();
}
