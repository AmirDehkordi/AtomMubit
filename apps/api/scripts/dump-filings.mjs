// Writes real extraction jobs to disk so the extraction module can be built
// against them: each filing's job.json (the ExtractionJob without HTML) and
// its raw HTML documents, exactly as the desk will pass them.
//
//   node scripts/dump-filings.mjs [--ticker NVDA] [--quarters 4] [--releases 2] [--out ../../samples] [--api http://localhost:4000]
//
// Output: <out>/<TICKER>/<accession>/job.json, <out>/<TICKER>/<accession>/<n>-<type>.html

import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, a, i, all) => (a.startsWith('--') ? [...pairs, [a.slice(2), all[i + 1]]] : pairs), []),
);
const API = args.api ?? process.env.API_URL ?? 'http://localhost:4000';
const TICKER = (args.ticker ?? 'NVDA').toUpperCase();
const QUARTERS = Number(args.quarters ?? 4);
const RELEASES = Number(args.releases ?? 2);
const OUT = resolve(args.out ?? '../../samples');

async function get(path, as = 'json') {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return as === 'json' ? res.json() : res.text();
}

const quarterly = await get(`/filings/find?ticker=${TICKER}&forms=10-Q,10-K&lastNQuarters=${QUARTERS}`);
const releases = RELEASES ? await get(`/filings/find?ticker=${TICKER}&forms=8-K&lastNQuarters=${RELEASES}`) : { filings: [] };

for (const f of [...quarterly.filings, ...releases.filings]) {
  const job = await get(`/filings/${f.accession}/job`);
  const dir = join(OUT, TICKER, f.accession);
  await mkdir(dir, { recursive: true });
  const documents = [];
  for (const [i, d] of job.documents.entries()) {
    const file = `${i}-${d.type}.html`;
    await writeFile(join(dir, file), await get(d.html, 'text'));
    documents.push({ type: d.type, url: d.url, file, chars: d.chars });
  }
  await writeFile(join(dir, 'job.json'), JSON.stringify({ ...job, projectId: 'sample', documents }, null, 2));
  console.log(`${f.form.padEnd(4)} ${job.filing.quarter.padEnd(10)} ${f.accession}  ${documents.map((d) => `${d.type} ${(d.chars / 1e6).toFixed(2)}M chars`).join(', ')}`);
}
console.log(`\nWrote to ${OUT}/${TICKER}`);
