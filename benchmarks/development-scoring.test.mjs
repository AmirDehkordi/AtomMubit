import test from 'node:test';
import assert from 'node:assert/strict';
import {scoreCase,summarize} from './development-scoring.mjs';
const gold={key:'revenue',value:125,currency:'USD',unit:'USD',scale:'millions',basis:'GAAP',periodEnd:'2026-06-30',months:3,missing:false};
const example={fields:['revenue'],gold:[gold]};
const fact={key:'revenue',value:125,range:null,currency:'USD',unit:'USD',scale:'millions',basis:'GAAP',period:{end:'2026-06-30',months:3},missingReason:null};
const entry={fact,supported:true,sectionId:'source'};
test('distinguishes correct model fields from independently checked source support',()=>{
 assert.equal(scoreCase(example,{facts:[entry]}).verifiedCorrect,true);
 const score=scoreCase(example,{facts:[{...entry,supported:false}]});assert.equal(score.modelCorrect,true);assert.equal(score.verifiedCorrect,false);
});
test('rejects contradictions, scale mistakes and period mistakes despite one matching observation',()=>{
 for(const patch of [{value:999},{scale:'billions'},{period:{end:'2026-09-30',months:3}}])assert.equal(scoreCase(example,{facts:[entry,{...entry,fact:{...fact,...patch}}]}).modelCorrect,false);
});
test('does not credit application fallback as model abstention or ignore fabricated missing values',()=>{
 const missing={fields:['revenue'],gold:[{...gold,value:null,missing:true}]};
 const absent={...entry,fact:{...fact,value:null,missingReason:'Not disclosed'}};
 assert.equal(scoreCase(missing,{facts:[absent]}).modelCorrect,true);
 assert.equal(scoreCase(missing,{facts:[{...absent,sectionId:null}]}).modelCorrect,false);
 assert.equal(scoreCase(missing,{facts:[absent,entry]}).modelCorrect,false);
});
test('preserves unknown cost and distinguishes incomplete usage from zero',()=>{
 const score=scoreCase(example,{facts:[entry]});
 const s=summarize([{score}],[{ok:true,latencyMs:100,inputTokens:10,outputTokens:5},{ok:false,latencyMs:5,inputTokens:null,outputTokens:null}],25);
 assert.equal(s.usageComplete,false);assert.equal(s.billedCostUsd,null);assert.equal(s.successfulCalls,1);assert.equal(s.modelCalls,2);assert.equal(s.p95CallLatencyMs,100);assert.equal(s.plannedCases,25);
});
