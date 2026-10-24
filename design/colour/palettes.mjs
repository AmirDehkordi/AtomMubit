// Palette source of truth. Run: node palettes.mjs
// Defines each option in OKLCH, converts to sRGB hex, checks WCAG 2.x contrast
// and how far apart up/down stay under simulated colour-vision deficiency.
// Writes palettes.json (read by build-preview.mjs) and prints the tables used in palettes.md.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// ---- colour maths -------------------------------------------------------
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function oklchToLinear(L, C, h) {
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}
function linearToOklab([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
const clamp = (x) => Math.min(1, Math.max(0, x));
const hexToLinear = (hex) => [1, 3, 5].map((i) => toLinear(parseInt(hex.slice(i, i + 2), 16) / 255));
const linearToHex = (rgb) => '#' + rgb.map((c) => Math.round(clamp(toGamma(clamp(c))) * 255).toString(16).padStart(2, '0')).join('');
function oklch(str) {
  const [L, C, h] = str.split(/\s+/).map(Number);
  const lin = oklchToLinear(L, C, h);
  const inGamut = lin.every((c) => c >= -0.001 && c <= 1.001);
  return { hex: linearToHex(lin), inGamut };
}
const luminance = (hex) => {
  const [r, g, b] = hexToLinear(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
// Alpha-composite fg at `alpha` over bg, in sRGB (what the browser does for rgba fills).
const over = (fg, bg, alpha) => {
  const f = [1, 3, 5].map((i) => parseInt(fg.slice(i, i + 2), 16));
  const b = [1, 3, 5].map((i) => parseInt(bg.slice(i, i + 2), 16));
  return '#' + f.map((c, i) => Math.round(c * alpha + b[i] * (1 - alpha)).toString(16).padStart(2, '0')).join('');
};

// Machado, Oliveira & Fernandes (2009), severity 1.0, applied in linear RGB.
const CVD = {
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};
const simulate = (hex, m) => {
  const v = hexToLinear(hex);
  return m.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]).map(clamp);
};
// Distance in OKLab (×100 so ~2 is "just noticeable", 10+ is clearly different).
const deltaE = (p, q) => {
  const [a, b] = [linearToOklab(p), linearToOklab(q)];
  return 100 * Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
};

// ---- the options --------------------------------------------------------
// Neutrals share one hue and a tiny chroma so the greys feel tinted, not dead.
export const OPTIONS = [
  {
    id: 'current',
    name: 'Current',
    blurb: 'What ships today: blue-black, amber accent, amber→orange gradient.',
    hex: {
      ink: '#0a0b0e', panel: '#111318', raised: '#171a21', line: '#22262e',
      muted: '#8a91a0', subtle: '#5d6472', text: '#eceef3',
      accent: '#f2a541', 'accent-2': '#ff7a59', up: '#34c38f', down: '#ef6161',
      'series-2': '#34c38f',
    },
  },
  {
    id: 'ink',
    name: 'A · Ink',
    blurb: 'Warm graphite greys and one ink-blue accent: the colour of a pen tick on a printout.',
    oklch: {
      ink: '0.175 0.004 75',
      panel: '0.205 0.004 75',
      raised: '0.243 0.005 75',
      line: '0.300 0.006 75',
      subtle: '0.640 0.007 75',
      muted: '0.760 0.007 75',
      text: '0.950 0.004 75',
      accent: '0.760 0.085 248',
      'accent-2': '0.560 0.085 252',
      up: '0.800 0.115 168',
      down: '0.690 0.150 36',
      'series-2': '0.660 0.012 75',
      'glow': '0.300 0.035 248',
    },
  },
  {
    id: 'brass',
    name: 'B · Brass',
    blurb: 'Keeps a warm accent, but as aged brass on warm stone instead of bright amber on black.',
    oklch: {
      ink: '0.170 0.006 70',
      panel: '0.200 0.006 70',
      raised: '0.238 0.007 70',
      line: '0.295 0.008 70',
      subtle: '0.640 0.010 70',
      muted: '0.760 0.010 75',
      text: '0.945 0.008 85',
      accent: '0.800 0.085 82',
      'accent-2': '0.620 0.080 70',
      up: '0.800 0.115 168',
      down: '0.690 0.150 36',
      'series-2': '0.650 0.014 70',
      'glow': '0.290 0.030 70',
    },
  },
  {
    id: 'mono',
    name: 'C · Mono',
    blurb: 'Near-monochrome cool greys. Colour is kept for data only: up, down and the revenue series.',
    oklch: {
      ink: '0.165 0.003 255',
      panel: '0.195 0.003 255',
      raised: '0.233 0.004 255',
      line: '0.290 0.005 255',
      subtle: '0.640 0.006 255',
      muted: '0.760 0.006 255',
      text: '0.955 0.003 255',
      accent: '0.840 0.025 235',
      'accent-2': '0.620 0.020 240',
      up: '0.800 0.115 168',
      down: '0.690 0.150 36',
      'series-2': '0.580 0.008 255',
      'glow': '0.270 0.012 255',
    },
  },
];

// ---- build --------------------------------------------------------------
const rows = [];
for (const o of OPTIONS) {
  if (o.oklch) {
    o.hex = {};
    for (const [k, v] of Object.entries(o.oklch)) {
      const c = oklch(v);
      if (!c.inGamut) console.warn(`${o.id}.${k} is out of sRGB gamut and was clipped`);
      o.hex[k] = c.hex;
    }
  }
  const t = o.hex;
  const chipUp = over(t.up, t.panel, 0.12);
  const chipDown = over(t.down, t.panel, 0.12);
  o.checks = {
    'text / panel': contrast(t.text, t.panel),
    'muted / panel': contrast(t.muted, t.panel),
    'subtle / panel': contrast(t.subtle, t.panel),
    'accent / panel': contrast(t.accent, t.panel),
    'up / panel': contrast(t.up, t.panel),
    'down / panel': contrast(t.down, t.panel),
    'up / its chip': contrast(t.up, chipUp),
    'down / its chip': contrast(t.down, chipDown),
    'ink / accent (button)': contrast(t.ink, t.accent),
    'line / panel': contrast(t.line, t.panel),
  };
  const up = hexToLinear(t.up);
  const down = hexToLinear(t.down);
  o.cvd = {
    'normal vision': deltaE(up, down),
    ...Object.fromEntries(Object.entries(CVD).map(([n, m]) => [n, deltaE(simulate(t.up, m), simulate(t.down, m))])),
  };
  o.cvdHex = Object.fromEntries(Object.entries(CVD).map(([n, m]) => [n, [linearToHex(simulate(t.up, m)), linearToHex(simulate(t.down, m))]]));
  rows.push(o);
}

writeFileSync(join(here, 'palettes.json'), JSON.stringify(rows, null, 2));

const f = (n) => n.toFixed(2);
for (const o of rows) {
  console.log(`\n### ${o.name}`);
  console.log('| token | hex |' + (o.oklch ? ' oklch |' : ''));
  console.log('|---|---|' + (o.oklch ? '---|' : ''));
  for (const [k, v] of Object.entries(o.hex)) console.log(`| \`${k}\` | \`${v}\` |` + (o.oklch ? ` \`oklch(${o.oklch[k]})\` |` : ''));
  console.log('\n| pair | ratio |\n|---|---|');
  for (const [k, v] of Object.entries(o.checks)) console.log(`| ${k} | ${f(v)} |`);
  console.log('\n| up vs down, ΔE (OKLab ×100) | |\n|---|---|');
  for (const [k, v] of Object.entries(o.cvd)) console.log(`| ${k} | ${v.toFixed(1)} |`);
}
