import {createHash} from 'node:crypto';
export const fingerprint = content => createHash('sha256').update(content).digest('hex');
export function validateDevelopmentFixture(fixture, maxCalls) {
  if (!Number.isInteger(maxCalls) || maxCalls < 1 || maxCalls > 200) throw Error('--max-calls must be 1–200');
  if (fixture.split !== 'development') throw Error('Only development fixtures may be recorded; holdout is blocked');
  if (!Array.isArray(fixture.cases) || !fixture.cases.length || fixture.cases.length > 100) throw Error('Expected 1–100 development examples');
  const ids = new Set(), hashes = new Set();
  for (const c of fixture.cases) {
    if (!/^[a-z0-9-]+$/.test(c.id) || ids.has(c.id) || typeof c.content !== 'string' || !c.content.trim() || c.content.length > 2000 || !['text','html'].includes(c.format)) throw Error('Invalid fixture identity/content');
    const hash = fingerprint(c.content);
    if (hashes.has(hash)) throw Error('Duplicate source content');
    ids.add(c.id); hashes.add(hash);
    if (!c.content.includes('SYNTHETIC') && !(c.provenance?.kind === 'sec-companyfacts-rendered' && /^https:\/\/data\.sec\.gov\//.test(c.provenance.url))) throw Error('Missing source provenance');
    if (!c.fields?.length || c.gold?.length !== c.fields.length || new Set(c.fields).size !== c.fields.length || new Set(c.gold.map(g=>g.key)).size !== c.fields.length || c.gold.some(g=>!c.fields.includes(g.key) || g.missing !== (g.value === null) || (!g.missing && !Number.isFinite(g.value)))) throw Error('Invalid gold fields');
  }
}
