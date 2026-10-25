// Builds preview.html from the .svg files in this folder, so the SVGs stay the source of truth.
// Run: node design/logo/build.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const options = [
  { file: '00-current.svg', name: 'Current', note: 'Baseline: filled circle, tick cut out.' },
  { file: '01-mu-tick.svg', name: '1 · Mu tick', note: 'A μ whose right stroke leaves the bowl as a tick.' },
  { file: '02-ticked-box.svg', name: '2 · Ticked box', note: 'A hand tick that runs out past the corner of its box.' },
  { file: '03-bar-tick.svg', name: '3 · Bar tick', note: 'Four bars whose tops trace a tick.' },
  { file: '04-m-tick.svg', name: '4 · M tick', note: 'An M whose middle is a tick.' },
  { file: '05-data-point.svg', name: '5 · Data point', note: 'A tick that ends on a data point.' },
  { file: '06-totals-rule.svg', name: '6 · Totals rule', note: 'A tick over the double rule under a checked total.' },
];

const mubit =
  '<svg viewBox="116 116 399 399" fill="currentColor" aria-hidden="true"><path d="M126.705 293.486L116 282.781L152.751 267.44L126.705 293.486ZM136.363 303.144L130.217 296.998L164.808 262.406L185.91 253.597L136.363 303.144ZM146.022 312.804L139.876 306.657L197.971 248.563L219.073 239.753L146.022 312.804ZM155.682 322.463L149.534 316.316L231.13 234.72L252.234 225.91L155.682 322.463ZM165.34 332.121L159.194 325.975L264.291 220.877L285.394 212.068L165.34 332.121ZM174.999 341.78L168.852 335.633L297.451 207.035L318.553 198.225L174.999 341.78ZM184.658 351.439L178.511 345.292L330.61 193.192L351.714 184.382L184.658 351.439ZM194.316 361.097L188.17 354.951L363.772 179.349L384.874 170.54L194.316 361.097ZM203.975 370.757L197.829 364.61L396.933 165.506L418.035 156.697L203.975 370.757ZM213.634 380.415L207.487 374.269L430.093 151.663L451.195 142.854L213.634 380.415ZM493.398 167.97L247.293 414.075L217.146 383.927L463.252 137.822L515.001 116.22L493.398 167.97ZM479.556 201.129L256.952 423.733L250.806 417.587L488.364 180.03L479.556 201.129ZM465.713 234.29L266.611 433.392L260.465 427.246L474.522 213.189L465.713 234.29ZM451.872 267.449L276.269 443.051L270.123 436.904L460.68 246.347L451.872 267.449ZM438.028 300.61L285.929 452.71L279.782 446.563L446.838 279.506L438.028 300.61ZM424.186 333.77L295.587 462.368L289.441 456.222L432.995 312.668L424.186 333.77ZM410.344 366.928L305.246 472.027L299.1 465.881L419.152 345.829L410.344 366.928ZM396.5 400.091L314.905 481.686L308.758 475.54L405.31 378.989L396.5 400.091ZM382.658 433.25L324.563 491.345L318.417 485.198L391.467 412.148L382.658 433.25ZM368.814 466.412L334.223 501.004L328.075 494.857L377.625 445.307L368.814 466.412ZM348.439 515.22L337.735 504.516L363.781 478.47L348.439 515.22Z"/></svg>';
const plus =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14M12 5v14"/></svg>';

// Mask ids repeat each time a mark is inlined, so give every copy its own.
let copy = 0;
function mark(svg) {
  copy += 1;
  return svg
    .replace(/<\?xml[^>]*>\s*/, '')
    .replace(/id="([^"]+)"/g, `id="$1-${copy}"`)
    .replace(/url\(#([^)]+)\)/g, `url(#$1-${copy})`)
    .replace('<svg ', '<svg aria-hidden="true" ')
    .trim();
}

function swatch(svg, size, tone) {
  return `<span class="mark ${tone}" style="--s:${size}px">${mark(svg)}</span>`;
}

function toolbar(svg) {
  return `<div class="toolbar">
      <span class="label"><span class="slot">${mark(svg)}</span>MuTick</span>
      <span class="btn mubit">${mubit}</span>
      <span class="btn plus">${plus}</span>
    </div>`;
}

function card({ file, name, note }) {
  const svg = readFileSync(join(here, file), 'utf8');
  const sizes = [16, 24, 48];
  const row = (bg, tone) =>
    `<div class="row ${bg}">${sizes.map((s) => swatch(svg, s, tone)).join('')}</div>`;
  return `
  <article class="card">
    <header><h2>${name}</h2><code>${file}</code></header>
    <p>${note}</p>
    <div class="grid">
      ${row('on-ink', 'muted')}${row('on-ink', 'text')}
      ${row('on-panel', 'muted')}${row('on-panel', 'text')}
    </div>
    ${toolbar(svg)}
  </article>`;
}

function strip({ file, name }) {
  const svg = readFileSync(join(here, file), 'utf8');
  return `<div class="strip-row"><span class="strip-name">${name}</span>${toolbar(svg)}</div>`;
}

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MuTick logo options</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  :root {
    --ink: #0a0b0e; --panel: #111318; --raised: #171a21; --line: #22262e;
    --muted: #8a91a0; --subtle: #5d6472; --text: #eceef3;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--ink); color: var(--text); font: 14px/1.5 Inter, system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
  main { max-width: 1240px; margin: 0 auto; padding: 32px 16px 64px; }
  h1 { font-size: 18px; font-weight: 600; margin: 0 0 4px; }
  .lede { color: var(--muted); margin: 0 0 24px; }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 16px; }
  .card { background: var(--panel); border: 1px solid var(--line); border-radius: 16px; padding: 16px; }
  .card header { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
  h2 { font-size: 14px; font-weight: 600; margin: 0; }
  code { color: var(--subtle); font-size: 12px; }
  .card p { color: var(--muted); margin: 2px 0 12px; font-size: 13px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
  .row { display: flex; align-items: center; justify-content: space-around; height: 72px; }
  .on-ink { background: var(--ink); }
  .on-panel { background: var(--panel); border-top: 1px solid var(--line); }
  .mark { display: inline-grid; place-items: center; }
  .mark svg { width: var(--s); height: var(--s); display: block; }
  .muted { color: var(--muted); }
  .text { color: var(--text); }
  .toolbar { display: flex; align-items: center; gap: 8px; height: 56px; padding: 0 12px 0 16px; margin-top: 12px; background: var(--panel); border: 1px solid var(--line); border-radius: 12px; }
  .label { margin-right: auto; display: flex; align-items: center; gap: 8px; color: var(--muted); font-weight: 500; }
  .slot { display: grid; place-items: center; width: 24px; height: 24px; }
  .slot svg { width: 18px; height: 18px; display: block; }
  .btn { display: grid; place-items: center; width: 32px; height: 32px; border: 1px solid var(--line); border-radius: 8px; color: var(--text); }
  .btn.mubit svg { width: 16px; height: 16px; }
  .btn.plus svg { width: 16px; height: 16px; }
  .strip-title { margin-top: 40px; margin-bottom: 12px; }
  .strip { display: grid; gap: 8px; max-width: 520px; }
  .strip-row { display: grid; grid-template-columns: 120px 1fr; align-items: center; gap: 12px; }
  .strip-row .toolbar { margin-top: 0; }
  .strip-name { color: var(--muted); font-size: 13px; }
</style>
</head>
<body>
<main>
  <h1>MuTick logo options</h1>
  <p class="lede">Each mark at 16, 24 and 48px, in muted grey and off-white, on ink and panel. Below each, the chat toolbar at its real size (mark drawn at 18px, as in BrandMark).</p>
  <div class="cards">${options.map(card).join('')}
  </div>
  <h1 class="strip-title">Side by side in the toolbar</h1>
  <div class="strip">${options.map(strip).join('')}</div>
</main>
</body>
</html>
`;

writeFileSync(join(here, 'preview.html'), html);
console.log('wrote preview.html');
