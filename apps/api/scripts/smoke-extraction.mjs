/** End-to-end local fake-model smoke: no SEC or external model requests. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const data = await mkdtemp(join(tmpdir(), 'earnings-smoke-'));
const source = 'Three months ended June 30, 2026. GAAP amounts in USD millions, except EPS in USD/share.\nRevenue was $1,000 million.\nNet income was $100 million.\nDiluted EPS was $1.00 per share.';
const facts = [ ['revenue','Revenue',1000,'USD','millions','Revenue was $1,000 million.'], ['net_income','Net income',100,'USD','millions','Net income was $100 million.'], ['eps_diluted','Diluted EPS',1,'USD/share','units','Diluted EPS was $1.00 per share.'] ].map(([key,label,value,unit,scale,quote])=>({key,label,value,unit,scale,quote,basis:'GAAP',currency:'USD',period:{start:null,end:'2026-06-30',months:3,fiscalYear:2026,fiscalPeriod:'Q2'},range:null,qualifier:null,missingReason:null}));
let calls=0;
const requestedModels=[];
const model=createServer(async(req,res)=>{
  try {
    let body='';for await(const chunk of req)body+=chunk;
    const request=JSON.parse(body); calls++; requestedModels.push(request.model);
    const name=request.response_format?.json_schema?.name;
    const output=name==='extraction_intent_v2'?{tickers:[],fields:['revenue','net_income','eps_diluted'],fiscalYear:null,lastNQuarters:4,clarification:null}:name==='feedback_evaluation_v2'?{decision:'defer',reason:'Synthetic smoke evaluator does not activate rules.',kind:'preference',target:'both',scope:'team',lesson:null,factKey:null,evidence:null}:{schemaVersion:'2',blocks:[],facts};
    res.writeHead(200,{'Content-Type':'application/json','x-middleware-request-id':`fake-${calls}`});
    res.end(JSON.stringify({id:`chatcmpl-${calls}`,object:'chat.completion',created:Math.floor(Date.now()/1000),model:request.model,choices:[{index:0,message:{role:'assistant',content:JSON.stringify(output)},finish_reason:'stop'}],usage:{prompt_tokens:100,completion_tokens:100,total_tokens:200}}));
  } catch {res.writeHead(400);res.end('{}');}
});
model.listen(0,'127.0.0.1');await once(model,'listening');
const modelPort=model.address().port;
const reservation=createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');const apiPort=reservation.address().port;await new Promise(r=>reservation.close(r));
const base=`http://127.0.0.1:${apiPort}`;let child;let logs='';
const workflowMode=process.argv.includes('--workflow');
const flow=createServer(async(req,res)=>{
  try {
    assert.equal(req.headers['x-api-key'],'fake-flow-key');
    let body='';for await(const chunk of req)body+=chunk;
    const envelope=JSON.parse(JSON.parse(body).input_value);
    const gateway=await fetch(`${base}/internal/model`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer fake-gateway-token'},body:JSON.stringify(envelope)});
    assert.equal(gateway.status,200,await (!gateway.ok?gateway.text():Promise.resolve('')));
    const output=await gateway.json();
    res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({outputs:[{outputs:[{results:{message:{text:JSON.stringify(output)}}}]}]}));
  }catch(error){res.writeHead(500);res.end(JSON.stringify({error:String(error)}));}
});
flow.listen(0,'127.0.0.1');await once(flow,'listening');const flowPort=flow.address().port;
async function start(worker){
  child=spawn(process.execPath,['dist/main.js'],{cwd:root,env:{...process.env,PORT:String(apiPort),DATA_DIR:data,DATABASE_URL:'',TEAM_ID:'internal',RUN_MIGRATIONS:'1',RUN_LOCAL_WORKER:worker?'1':'0',SEC_USER_AGENT:'',MUBIT_API_KEY:'fake-local',MUBIT_BASE_URL:`http://127.0.0.1:${modelPort}/v1`,OPENROUTER_API_KEY:'',WORKFLOW_MODE:workflowMode?'langflow':'direct',LANGFLOW_URL:`http://127.0.0.1:${flowPort}`,LANGFLOW_API_KEY:'fake-flow-key',LANGFLOW_EXTRACTION_FLOW_ID:'fake-extraction',LANGFLOW_FEEDBACK_FLOW_ID:'fake-feedback',MODEL_GATEWAY_TOKEN:'fake-gateway-token',AGENT_MODEL:'openai/gpt-6-luna',EXTRACTOR_MODEL:'qwen/qwen3-30b-a3b-instruct-2507',FEEDBACK_MODEL:'openai/gpt-6-luna'},stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',d=>{logs+=d});child.stderr.on('data',d=>{logs+=d});
  for(let i=0;i<120;i++){if(child.exitCode!==null)throw new Error(logs);try{if((await fetch(`${base}/health`)).ok)return;}catch{}await new Promise(r=>setTimeout(r,250));}throw new Error(`API did not start: ${logs}`);
}
async function stop(){if(!child||child.exitCode!==null)return;child.kill('SIGTERM');await Promise.race([once(child,'exit'),new Promise((_,reject)=>setTimeout(()=>{child.kill('SIGKILL');reject(new Error('API did not shut down'));},10000).unref())]);child=null;}
async function api(path,options){const res=await fetch(base+path,options);assert.ok(res.ok,`${path}: ${res.status} ${await (!res.ok?res.text():Promise.resolve(''))}`);return res.json();}
async function waitFor(fn){for(let i=0;i<100;i++){const value=await fn();if(value)return value;await new Promise(r=>setTimeout(r,200));}throw new Error(`Timed out: ${logs}`);}
try{
  await start(false);
  const {projectId}=await api('/conversations',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  async function upload(){const form=new FormData();form.append('projectId',projectId);form.append('file',new Blob([source],{type:'text/plain'}),'earnings.txt');return api('/v1/files',{method:'POST',headers:{'idempotency-key':'smoke-upload'},body:form});}
  const receipt=await upload();const duplicate=await upload();assert.equal(receipt.runId,duplicate.runId);assert.equal(calls,0);
  await stop();await start(true);
  const result=await waitFor(async()=>{const data=await api(`/v1/data?projectId=${projectId}&runId=${receipt.runId}`);return ['completed','needs_review','failed'].includes(data.runs[0]?.state)?data:null;});
  assert.equal(result.runs[0].state,'completed',JSON.stringify(result.runs[0]));assert.equal(result.runs[0].accepted,true);assert.equal(result.runs[0].output.facts.filter(f=>f.supported).length,3);assert.equal(calls,1);
  assert.ok(result.events.some(e=>e.type==='extraction_completed'));
  const request=await api('/v1/extractions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId,request:'Extract the core metrics from this document.',documentIds:[receipt.documentId]})});
  const reused=await waitFor(async()=>{const data=await api(`/v1/data?projectId=${projectId}&requestId=${request.requestId}`);return data.requests[0]?.state==='completed'?data:null;});
  assert.equal(reused.runs[0].id,receipt.runId);assert.equal(calls,2,'Reused extraction should only add an intent call');
  const feedback=await api('/v1/feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId,runId:receipt.runId,text:'Please show units explicitly.'})});
  await waitFor(async()=>{const data=await api(`/v1/data?projectId=${projectId}&feedbackId=${feedback.feedbackId}`);return data.feedback[0]?.state==='deferred';});
  assert.deepEqual(requestedModels,['qwen/qwen3-30b-a3b-instruct-2507','openai/gpt-6-luna','openai/gpt-6-luna']);
  console.log(JSON.stringify({status:'passed',mode:workflowMode?'local-fake-model-and-workflow':'local-fake-model',checks:['upload','idempotency','restart recovery','extraction/evidence','durable progress','intent run reuse','feedback evaluation'],modelCalls:calls}));
}finally{await stop();await new Promise(r=>model.close(r));await new Promise(r=>flow.close(r));await rm(data,{recursive:true,force:true});}
