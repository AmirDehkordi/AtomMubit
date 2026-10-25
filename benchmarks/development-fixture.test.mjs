import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateDevelopmentFixture,fingerprint} from './development-fixture.mjs';
const expanded=JSON.parse(await readFile(new URL('./fixtures/mubit-development-expanded.json',import.meta.url)));
const holdout=JSON.parse(await readFile(new URL('./fixtures/extraction-holdout-candidates.json',import.meta.url)));
test('accepts 100 unique development cases and refuses overspending or holdout recording',()=>{
 assert.doesNotThrow(()=>validateDevelopmentFixture(expanded,200));
 for(const cap of [201,0,-1,NaN,2.5])assert.throws(()=>validateDevelopmentFixture(expanded,cap));
 assert.throws(()=>validateDevelopmentFixture(holdout,200),/holdout/);
 const duplicate=structuredClone(expanded);duplicate.cases[1].content=duplicate.cases[0].content;
 assert.throws(()=>validateDevelopmentFixture(duplicate,200),/Duplicate/);
});
test('keeps holdout companies and source documents out of development and pins SEC observations',()=>{
 const sourceHashes=new Set(expanded.cases.map(c=>fingerprint(c.content)));
 const accessions=new Set(expanded.cases.map(c=>c.provenance?.accession).filter(Boolean));
 for(const example of holdout.cases){assert.equal(sourceHashes.has(fingerprint(example.content)),false);assert.equal(accessions.has(example.provenance.accession),false);}
 for(const example of [...expanded.cases,...holdout.cases].filter(c=>c.provenance)){
  for(const g of example.gold){const observed=example.provenance.observations[g.key];assert.equal(g.value,observed.val);assert.equal(g.periodStart,observed.start);assert.equal(g.periodEnd,observed.end);assert.equal(observed.accn,example.provenance.accession);}
 }
 assert.equal(expanded.cases.filter(c=>c.provenance).length,20);
 assert.equal(holdout.cases.length,8);
});
