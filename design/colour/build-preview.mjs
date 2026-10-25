// Builds preview.html from palettes.json. Run: node palettes.mjs && node build-preview.mjs
// preview.html?p=<id>&v=desk|start&bare=1 shows one frame at 1440x900 (used for screenshots).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const palettes = JSON.parse(readFileSync(join(here, 'palettes.json'), 'utf8'));

// Illustrative NVIDIA quarters (rounded; for colour review only).
const Q = ['Q3 FY25', 'Q4 FY25', 'Q1 FY26', 'Q2 FY26', 'Q3 FY26'];
const END = ['2024-10-27', '2025-01-26', '2025-04-27', '2025-07-27', '2025-10-26'];
const REV = [35.1, 39.3, 44.1, 46.7, 57.0];
const NI = [19.3, 22.1, 18.8, 26.4, 31.9];
const ROWS = [
  ['Income statement'],
  ['Revenue', ['$35.1B', '$39.3B', '$44.1B', '$46.7B', '$57.0B'], 22.0],
  ['Gross profit', ['$26.2B', '$28.7B', '$26.7B', '$33.9B', '$41.8B'], 23.6],
  ['Operating income', ['$21.9B', '$24.0B', '$21.6B', '$28.4B', '$36.0B'], 26.6],
  ['Net income', ['$19.3B', '$22.1B', '$18.8B', '$26.4B', '$31.9B'], 20.8],
  ['Diluted shares', ['24.77B', '24.71B', '24.61B', '24.53B', '24.46B'], -0.3],
  ['Margins'],
  ['Gross margin', ['74.6%', '73.0%', '60.5%', '72.4%', '73.4%'], 1.0, 'pp'],
];
const KPIS = [
  ['Revenue', '$57.0B', 22.0, '%', REV],
  ['Net income', '$31.9B', 20.8, '%', NI],
  ['Gross margin', '73.4%', 1.0, 'pp', [74.6, 73.0, 60.5, 72.4, 73.4]],
  ['Operating margin', '63.2%', -0.4, 'pp', [62.3, 61.1, 49.1, 63.6, 63.2]],
];

const arrowUp = '<svg viewBox="0 0 24 24" class="ic"><path d="M7 17 17 7M8 7h9v9"/></svg>';
const arrowDown = '<svg viewBox="0 0 24 24" class="ic"><path d="M7 7l10 10M17 8v9H8"/></svg>';
const delta = (v, unit) =>
  `<span class="delta ${v >= 0 ? 'is-up' : 'is-down'}">${v >= 0 ? arrowUp : arrowDown}${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}${unit}</span>`;

const mark = `<svg viewBox="0 0 16 16" class="mark"><mask id="MID"><rect width="16" height="16" fill="white"/><path d="M4.6 8.3l2.3 2.3 4.5-4.9" fill="none" stroke="black" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></mask><circle cx="8" cy="8" r="7.5" fill="currentColor" mask="url(#MID)"/></svg>`;
const mubitIcon = '<svg viewBox="0 0 24 24" class="ic"><path d="M4 18V7l4 6 4-6 4 6 4-6v11"/></svg>';
const plusIcon = '<svg viewBox="0 0 24 24" class="ic"><path d="M12 5v14M5 12h14"/></svg>';
const sendIcon = '<svg viewBox="0 0 24 24" class="ic"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
const shield = '<svg viewBox="0 0 24 24" class="ic up"><path d="M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6z"/><path d="m9 12 2 2 4-4"/></svg>';
const check = '<svg viewBox="0 0 24 24" class="ic up"><circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/></svg>';

function sparkline(values, id) {
  const w = 100, h = 32;
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const x = (i) => (i / (values.length - 1)) * w;
  const y = (v) => h - 3 - ((v - min) / span) * (h - 6);
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="spark"><defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" style="stop-color:var(--accent);stop-opacity:.28"/><stop offset="100%" style="stop-color:var(--accent);stop-opacity:0"/></linearGradient></defs><path d="${line} L${w},${h} L0,${h} Z" fill="url(#${id})"/><path d="${line}" fill="none" style="stroke:var(--accent)" stroke-width="1.75" vector-effect="non-scaling-stroke" stroke-linecap="round"/></svg>`;
}

function chart(id) {
  const W = 880, H = 230, left = 56, bottom = 24, top = 6;
  const max = 60, plotH = H - bottom - top, plotW = W - left;
  const y = (v) => top + plotH - (v / max) * plotH;
  const group = plotW / Q.length, bw = 44, gap = 6;
  let s = `<svg viewBox="0 0 ${W} ${H}" class="chart"><defs>
    <linearGradient id="${id}-r" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" style="stop-color:var(--bar-1-top)"/><stop offset="100%" style="stop-color:var(--bar-1-bottom)"/></linearGradient>
    <linearGradient id="${id}-n" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" style="stop-color:var(--bar-2-top)"/><stop offset="100%" style="stop-color:var(--bar-2-bottom)"/></linearGradient></defs>`;
  for (const v of [0, 15, 30, 45, 60]) {
    s += `<line x1="${left}" x2="${W}" y1="${y(v)}" y2="${y(v)}" style="stroke:var(--line)" stroke-dasharray="3 6"/>`;
    s += `<text x="${left - 10}" y="${y(v) + 4}" text-anchor="end" class="axis">$${v}B</text>`;
  }
  const bar = (x, v, fill) => {
    const top_ = y(v), h = y(0) - top_, r = 7;
    return `<path d="M${x},${y(0)} V${top_ + r} Q${x},${top_} ${x + r},${top_} H${x + bw - r} Q${x + bw},${top_} ${x + bw},${top_ + r} V${y(0)} Z" fill="${fill}"/>`;
  };
  Q.forEach((q, i) => {
    const cx = left + group * i + group / 2;
    s += bar(cx - bw - gap / 2, REV[i], `url(#${id}-r)`);
    s += bar(cx + gap / 2, NI[i], `url(#${id}-n)`);
    s += `<text x="${cx}" y="${H - 4}" text-anchor="middle" class="axis">${q}</text>`;
  });
  return s + '</svg>';
}

function desk(p) {
  const kpis = KPIS.map(([label, value, d, unit, series], i) => `
    <div class="surface kpi">
      <div class="row"><p class="muted small">${label}</p>${delta(d, unit)}</div>
      <p class="kpi-value">${value}</p>
      <div class="row end">${sparkline(series, `${p.id}-s${i}`)}</div>
    </div>`).join('');
  const head = Q.map((q, i) => `<th class="${i === 4 ? 'latest' : ''}"><div class="${i === 4 ? 'accent' : ''}">${q}</div><div class="mono subtle tiny">${END[i]}</div></th>`).join('');
  const body = ROWS.map((r) =>
    r.length === 1
      ? `<tr><td colspan="7" class="group">${r[0]}</td></tr>`
      : `<tr><td class="muted">${r[0]}</td>${r[1].map((c, i) => `<td class="num ${i === 4 ? 'latest strong' : ''}">${c}</td>`).join('')}<td class="num">${delta(r[2], r[3] ?? '%')}</td></tr>`,
  ).join('');
  return `
  <div class="desk">
    <div class="dash">
      <header>
        <div class="title-row">
          <span class="mono-tile">NVDA</span>
          <div>
            <h1>NVIDIA</h1>
            <p class="muted period"><span class="text">Q3 FY25 – Q3 FY26</span><span class="subtle">·</span><span class="inline">${shield} Checked against SEC XBRL</span></p>
          </div>
        </div>
        <div class="strip">${Q.map((q) => `<span class="chip">${check}<b>10-Q</b><span class="mono muted">${q}</span></span>`).join('')}</div>
      </header>
      <p class="muted tiny-12">Change vs Q2 FY26</p>
      <div class="kpis">${kpis}</div>
      <div class="surface card-chart">
        <div class="row"><p class="strong small13">Revenue and net income</p>
          <div class="legend muted"><span><i style="background:var(--bar-1-top)"></i>Revenue</span><span><i style="background:var(--bar-2-top)"></i>Net income</span></div></div>
        ${chart(p.id + '-c')}
      </div>
      <div class="surface table-card">
        <table><thead><tr><th class="lbl">Metric</th>${head}<th class="lbl r">Q/Q</th></tr></thead><tbody>${body}</tbody></table>
      </div>
    </div>
    <aside class="chat edge">
      <div class="toolbar">
        <span class="brand">${mark.replaceAll('MID', p.id + '-m1')}MuTick</span>
        <span class="tools"><button class="sq" aria-label="Mubit">${mubitIcon}</button><button class="sq" aria-label="New">${plusIcon}</button></span>
      </div>
      <div class="thread">
        <div class="bubble">How did revenue move last quarter?</div>
        <div class="answer">
          <p>Revenue rose <strong>22.0%</strong> to <strong>$57.0B</strong> in Q3 FY26, a record quarter.</p>
          <ul><li>Data centre was $51.2B of it, up 25%.</li><li>Gross margin rose 1.0pp to 73.4%.</li><li>Net income grew a little slower, <span class="neg">−1.2pp</span> behind revenue.</li></ul>
          <p class="cite-row"><span class="cite">10-Q · Q3 FY26 · p.4</span><span class="subtle tiny">via Mubit · checked</span></p>
        </div>
        <p class="lbl ask">Ask next</p>
        <div class="next"><span>Compare with AMD</span><span>Show margins</span></div>
      </div>
      <div class="composer edge"><span class="subtle">Ask a follow-up…</span><span class="send">${sendIcon}</span></div>
    </aside>
  </div>`;
}

function start(p) {
  return `
  <div class="start">
    <div class="grain"></div>
    <header class="top"><span class="brand">${mark.replaceAll('MID', p.id + '-m2')}MuTick</span><button class="sq" aria-label="Mubit">${mubitIcon}</button></header>
    <div class="hero">
      <h1>Read every earnings filing<br><span class="hero-2">like an analyst would.</span></h1>
      <p class="muted lead">Ask about any US company. The desk finds the filings, checks the numbers against the SEC's data, and lays it all out beside the chat.</p>
      <div class="composer big edge"><span class="subtle">Which company do you want to look at?</span><span class="send">${sendIcon}</span></div>
      <div class="examples"><span>NVIDIA, last 4 quarters</span><span>NVIDIA vs Microsoft vs Apple</span><span>Microsoft FY2026</span></div>
    </div>
  </div>`;
}

// Per-palette variables. Gradient decisions live here so each option is honest about them.
function vars(p) {
  const t = p.hex;
  const current = p.id === 'current';
  const v = {
    ink: t.ink, panel: t.panel, raised: t.raised, line: t.line, muted: t.muted, subtle: t.subtle, text: t.text,
    accent: t.accent, 'accent-2': t['accent-2'], up: t.up, down: t.down,
    'bar-1-top': t.accent,
    'bar-1-bottom': current ? `color-mix(in oklab, ${t['accent-2']} 60%, transparent)` : `color-mix(in oklab, ${t['accent-2']} 85%, ${t.panel})`,
    'bar-2-top': t['series-2'],
    'bar-2-bottom': current ? `color-mix(in oklab, ${t.up} 45%, transparent)` : `color-mix(in oklab, ${t['series-2']} 70%, ${t.panel})`,
    // Light from one direction (above): a 1px edge that fades top → bottom.
    edge: current
      ? `linear-gradient(${t.line}, ${t.line})`
      : `linear-gradient(180deg, color-mix(in oklab, ${t.text} 22%, ${t.line}) 0%, ${t.line} 55%, color-mix(in oklab, ${t.line} 60%, ${t.ink}) 100%)`,
    'hero-bg': current
      ? `radial-gradient(410px 260px at 50% 4%, color-mix(in oklab, ${t.accent} 22%, transparent), transparent 70%), linear-gradient(color-mix(in oklab, ${t.line} 40%, ${t.ink}) 1px, transparent 1px) 0 0/48px 48px, linear-gradient(90deg, color-mix(in oklab, ${t.line} 40%, ${t.ink}) 1px, transparent 1px) 0 0/48px 48px, ${t.ink}`
      : `radial-gradient(140% 75% at 50% -12%, ${t.glow} 0%, color-mix(in oklab, ${t.glow} 40%, ${t.ink}) 38%, ${t.ink} 72%)`,
    'hero-2': current ? `linear-gradient(90deg, ${t.accent}, ${t['accent-2']})` : 'none',
    'hero-2-color': current ? 'transparent' : t.muted,
    'dash-wash': current ? `radial-gradient(ellipse at top left, color-mix(in oklab, ${t.accent} 9%, transparent), transparent 60%)` : 'none',
    tile: current ? 'linear-gradient(135deg, #76b900, #3d7a00)' : t.raised,
    'tile-text': current ? '#fff' : t.muted,
    grain: current ? '0' : '0.05',
  };
  return Object.entries(v).map(([k, x]) => `--${k}:${x};`).join('');
}

const fmt = (n) => n.toFixed(2);
const pass = (n, min) => `<span class="${n >= min ? 'ok' : 'bad'}">${fmt(n)}</span>`;
function info(p) {
  const c = p.checks;
  const swatches = ['ink', 'panel', 'raised', 'line', 'subtle', 'muted', 'text', 'accent', 'accent-2', 'series-2', 'up', 'down']
    .map((k) => `<div class="sw"><i style="background:${p.hex[k]}"></i><b>${k}</b><code>${p.hex[k]}</code></div>`).join('');
  return `<div class="info">
    <div class="swatches">${swatches}</div>
    <table class="checks"><tr><th>text</th><th>muted</th><th>subtle</th><th>accent</th><th>up</th><th>down</th><th>down chip</th><th>deutan ΔE</th></tr>
    <tr><td>${pass(c['text / panel'], 7)}</td><td>${pass(c['muted / panel'], 4.5)}</td><td>${pass(c['subtle / panel'], 4.5)}</td><td>${pass(c['accent / panel'], 4.5)}</td><td>${pass(c['up / panel'], 4.5)}</td><td>${pass(c['down / panel'], 4.5)}</td><td>${pass(c['down / its chip'], 4.5)}</td><td>${p.cvd.deuteranopia.toFixed(1)}</td></tr></table>
  </div>`;
}

const css = `
*{box-sizing:border-box;margin:0;padding:0}
:root{color-scheme:dark}
[hidden]{display:none!important}
body{background:#0b0b0c;color:#e8e8e8;font:14px/1.45 Inter,ui-sans-serif,system-ui,sans-serif;font-feature-settings:'cv11','ss01'}
.page{padding:24px 16px 64px;max-width:1520px;margin:0 auto}
.page>header{display:flex;flex-wrap:wrap;gap:12px 24px;align-items:center;justify-content:space-between;margin-bottom:20px}
.page h2{font-size:15px;font-weight:600}
.page .note{color:#9a9a9a;font-size:12px;max-width:640px}
.seg{display:inline-flex;gap:2px;padding:3px;border:1px solid #2a2a2c;border-radius:10px}
.seg button{background:none;border:0;color:#9a9a9a;font:inherit;font-size:12px;padding:5px 10px;border-radius:7px;cursor:pointer}
.seg button[aria-pressed=true]{background:#232325;color:#eee}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,720px),1fr));gap:28px 20px}
.option h3{font-size:13px;font-weight:600;margin-bottom:2px}
.option .blurb{color:#9a9a9a;font-size:12px;margin-bottom:10px}
.viewport{width:100%;aspect-ratio:1440/900;overflow:hidden;border-radius:10px;border:1px solid #2a2a2c;position:relative}
.frame{width:1440px;height:900px;transform-origin:0 0;position:absolute;top:0;left:0}
.info{margin-top:10px;display:grid;gap:8px}
.swatches{display:grid;grid-template-columns:repeat(auto-fill,minmax(108px,1fr));gap:4px 8px}
.sw{display:grid;grid-template-columns:14px 1fr;column-gap:6px;font-size:11px;align-items:center}
.sw i{grid-row:span 2;width:14px;height:24px;border-radius:3px;border:1px solid #ffffff1a}
.sw code{color:#8a8a8a;font-size:10px}
.checks{border-collapse:collapse;font-size:11px;width:100%}
.checks th{color:#8a8a8a;font-weight:500;text-align:left;padding:2px 6px 2px 0}
.checks td{padding:2px 6px 2px 0;font-variant-numeric:tabular-nums}
.ok{color:#8fd19e}.bad{color:#ff9a8a}
body.bare{background:#000}
body.bare .page{padding:0;max-width:none}
body.bare .page>header,body.bare .option h3,body.bare .option .blurb,body.bare .info{display:none}
body.bare .viewport{border:0;border-radius:0;width:1440px}

/* ---- the mock: everything below reads only palette variables ---- */
.frame{background:var(--ink);color:var(--text);font-size:14px}
.ic{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}
.ic.up{color:var(--up)}
.mark{width:18px;height:18px}
.muted{color:var(--muted)}.subtle{color:var(--subtle)}.text{color:var(--text)}.accent{color:var(--accent)}
.small{font-size:12px;font-weight:500}.small13{font-size:13px}.strong{font-weight:600}.tiny{font-size:10px}.tiny-12{font-size:12px;margin-bottom:12px}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.row{display:flex;align-items:center;justify-content:space-between}.row.end{justify-content:flex-end}
.surface{background:linear-gradient(180deg,color-mix(in oklab,var(--raised) 70%,transparent),var(--panel));border:1px solid var(--line);border-radius:16px;box-shadow:inset 0 1px 0 rgba(255,255,255,.04),0 1px 2px rgba(0,0,0,.3),0 12px 32px -18px rgba(0,0,0,.6)}
.edge{border:1px solid transparent;background:linear-gradient(var(--panel),var(--panel)) padding-box,var(--edge) border-box}
.delta{display:inline-flex;align-items:center;gap:2px;border-radius:999px;padding:2px 6px;font-size:11px;font-weight:600;font-variant-numeric:tabular-nums}
.delta .ic{width:12px;height:12px;stroke-width:2.5}
.delta.is-up{color:var(--up);background:color-mix(in oklab,var(--up) 12%,transparent)}
.delta.is-down{color:var(--down);background:color-mix(in oklab,var(--down) 12%,transparent)}
.neg{color:var(--down)}

.desk{position:relative;height:100%;display:flex}
.dash{position:relative;flex:1;padding:18px 448px 0 32px;overflow:hidden}
.dash::before{content:'';position:absolute;inset:0 0 auto 0;height:256px;background:var(--dash-wash);pointer-events:none}
.dash>*{position:relative}
.title-row{display:flex;gap:16px;align-items:flex-start}
.mono-tile{display:grid;place-items:center;width:44px;height:44px;border-radius:12px;background:var(--tile);color:var(--tile-text);font-size:12px;font-weight:700;letter-spacing:-.02em;box-shadow:inset 0 1px 0 rgba(255,255,255,.08);border:1px solid var(--line)}
.dash h1{font-size:22px;line-height:1.2;font-weight:600;letter-spacing:-.02em}
.period{display:flex;gap:8px;align-items:center;font-size:13px;margin-top:4px}
.inline{display:inline-flex;gap:6px;align-items:center}
.strip{display:flex;gap:6px;margin:16px 0 22px}
.chip{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);border-radius:999px;padding:4px 10px 4px 6px;font-size:11px;background:color-mix(in oklab,var(--panel) 80%,transparent)}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px}
.kpi{padding:20px}
.kpi-value{margin-top:12px;font-size:28px;line-height:1;font-weight:600;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.spark{width:80px;height:32px;margin-top:14px}
.card-chart{padding:20px;margin-bottom:16px}
.legend{display:flex;gap:16px;font-size:11px}.legend span{display:flex;align-items:center;gap:6px}.legend i{width:8px;height:8px;border-radius:99px}
.chart{width:100%;height:auto;margin-top:14px;display:block}
.axis{fill:var(--subtle);font-size:11px;font-family:inherit}
.table-card{overflow:hidden}
table{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums}
thead tr{border-bottom:1px solid var(--line)}
th{padding:12px 16px;text-align:right;font-weight:500}
th.lbl{color:var(--subtle);font-size:11px;letter-spacing:.06em;text-transform:uppercase;text-align:left;padding-left:20px}th.lbl.r{text-align:right}
td{padding:9px 16px}td:first-child{padding-left:20px}
td.num{text-align:right}
.latest{background:color-mix(in oklab,var(--accent) 6%,transparent)}
td.group{color:var(--subtle);font-size:10px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;padding-top:14px;padding-bottom:4px}

.chat{position:absolute;top:16px;right:16px;bottom:16px;width:400px;border-radius:20px;display:flex;flex-direction:column;box-shadow:0 24px 60px -24px rgba(0,0,0,.7),0 2px 6px rgba(0,0,0,.3)}
.toolbar{display:flex;justify-content:space-between;align-items:center;padding:12px 12px 12px 16px;border-bottom:1px solid var(--line)}
.brand{display:inline-flex;align-items:center;gap:8px;color:var(--muted);font-size:14px;font-weight:500}
.tools{display:flex;gap:6px}
.sq{display:grid;place-items:center;width:32px;height:32px;border-radius:8px;border:1px solid var(--line);background:transparent;color:var(--muted)}
.thread{flex:1;padding:22px 20px;display:flex;flex-direction:column;gap:20px;overflow:hidden}
.bubble{align-self:flex-end;max-width:85%;background:var(--raised);color:var(--text);padding:9px 14px;border-radius:16px 16px 4px 16px}
.answer{color:color-mix(in oklab,var(--text) 88%,var(--muted));line-height:1.6}
.answer strong{color:var(--text);font-weight:600}
.answer ul{list-style:none;margin-top:10px}
.answer li{position:relative;padding-left:16px}.answer li+li{margin-top:5px}
.answer li::before{content:'';position:absolute;left:3px;top:.65em;width:5px;height:5px;border-radius:99px;background:var(--accent)}
.cite-row{display:flex;gap:10px;align-items:center;margin-top:12px}
.cite{font-size:11px;border-radius:6px;padding:2px 7px;background:var(--raised);color:var(--muted)}
.lbl.ask{color:var(--subtle);font-size:11px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;margin-bottom:-12px}
.next{display:flex;gap:8px;flex-wrap:wrap}.next span{border:1px solid var(--line);color:var(--muted);border-radius:99px;padding:5px 12px;font-size:13px}
.composer{margin:0 12px 12px;border-radius:16px;padding:14px 12px 12px 16px;display:flex;justify-content:space-between;align-items:flex-end;min-height:88px}
.send{display:grid;place-items:center;width:32px;height:32px;border-radius:99px;background:var(--text);color:var(--ink)}
.send .ic{width:16px;height:16px;stroke-width:2.5}

.start{position:relative;height:100%;display:grid;place-items:center;background:var(--hero-bg);overflow:hidden}
.grain{position:absolute;inset:0;opacity:var(--grain);pointer-events:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .55 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}
.top{position:absolute;inset:0 0 auto 0;display:flex;justify-content:space-between;align-items:center;padding:16px 24px}
.hero{position:relative;width:672px}
.hero h1{text-align:center;font-size:44px;line-height:1.05;font-weight:600;letter-spacing:-.03em;margin-bottom:12px}
.hero-2{background:var(--hero-2);-webkit-background-clip:text;background-clip:text;color:var(--hero-2-color)}
.lead{text-align:center;font-size:15px;line-height:1.6;max-width:512px;margin:0 auto 36px}
.composer.big{margin:0;min-height:112px;font-size:15px;padding:18px 14px 14px 20px;box-shadow:0 20px 50px -30px rgba(0,0,0,.8)}
.examples{display:flex;justify-content:center;gap:8px;margin-top:20px}
.examples span{border:1px solid var(--line);background:color-mix(in oklab,var(--panel) 70%,transparent);color:var(--muted);border-radius:12px;padding:8px 14px;font-size:14px}
`;

const frames = (view) =>
  palettes.map((p) => `
  <section class="option" data-id="${p.id}">
    <h3>${p.name}</h3><p class="blurb">${p.blurb}</p>
    <div class="viewport"><div class="frame" style="${vars(p)}">${view === 'desk' ? desk(p) : start(p)}</div></div>
    ${info(p)}
  </section>`).join('');

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MuTick Colour Options</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${css}</style></head>
<body>
<div class="page">
  <header>
    <div><h2>MuTick colour options</h2><p class="note">Static mock. Same layout in every frame; only colour tokens and the gradient rules change. Figures are illustrative. Contrast is WCAG 2.x against <code>panel</code>; green numbers pass AA. "Deutan ΔE" is how far apart up and down stay for deuteranopia (higher is better; today is 6.8).</p></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <div class="seg" id="view"><button data-v="desk" aria-pressed="true">Desk</button><button data-v="start" aria-pressed="false">Start screen</button></div>
      <div class="seg" id="pick"><button data-p="all" aria-pressed="true">All</button>${palettes.map((p) => `<button data-p="${p.id}" aria-pressed="false">${p.name}</button>`).join('')}</div>
    </div>
  </header>
  <div class="grid" id="desk">${frames('desk')}</div>
  <div class="grid" id="start" hidden>${frames('start')}</div>
</div>
<script>
const q = new URLSearchParams(location.search);
let view = q.get('v') || 'desk', pick = q.get('p') || 'all';
if (q.get('bare')) document.body.classList.add('bare');
function fit() {
  document.querySelectorAll('.viewport').forEach((vp) => {
    const f = vp.firstElementChild; f.style.transform = 'scale(' + vp.clientWidth / 1440 + ')';
  });
}
function render() {
  for (const v of ['desk', 'start']) document.getElementById(v).hidden = v !== view;
  document.querySelectorAll('.option').forEach((o) => (o.hidden = pick !== 'all' && o.dataset.id !== pick));
  document.querySelectorAll('#view button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === view));
  document.querySelectorAll('#pick button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.p === pick));
  document.querySelectorAll('.grid').forEach((g) => (g.style.gridTemplateColumns = pick === 'all' ? '' : '1fr'));
  fit();
}
document.getElementById('view').onclick = (e) => { if (e.target.dataset.v) { view = e.target.dataset.v; render(); } };
document.getElementById('pick').onclick = (e) => { if (e.target.dataset.p) { pick = e.target.dataset.p; render(); } };
addEventListener('resize', fit);
render();
</script>
</body></html>`;

writeFileSync(join(here, 'preview.html'), html);
console.log('wrote preview.html', (html.length / 1024).toFixed(0) + ' KB');
