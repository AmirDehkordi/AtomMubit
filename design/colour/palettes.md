# MuTick palette options

There are three options plus today's palette for reference. Each one is a complete set of the app's tokens (`ink` … `down`) plus two new ones: `series-2` (the second chart series) and `glow` (the colour at the top of the start-screen wash). All are dark mode.

The source of truth is `palettes.mjs`. It defines each colour in OKLCH, converts it to hex and runs every check below. Run `node palettes.mjs` to reproduce the numbers, then `node build-preview.mjs && sh shoot.sh` to rebuild the preview and screenshots.

**Shared across A, B and C** (the finance contract, so it doesn't change between options):

- **Up `#6ad6b0`, down `#e87556`.** Up is a blue-leaning green and down is a vermilion red, set apart in lightness so they still separate for colour-blind users. Under simulated deuteranopia they are ΔE 12.8 apart, against 6.8 today. The ↗/↘ arrows and the +/− sign stay.
- **`series-2` is a neutral grey, not `up`.** Today the net income bars use the "up" green, so green means two things on one screen. Moving the second series to a grey keeps green for "went up" only.
- **Neutrals have one hue and almost no chroma** (0.003–0.010), stepped by lightness: ink, then panel (+0.03), raised (+0.04), line (+0.06). Panels feel the same distance apart in every option.
- **`subtle` now passes AA** (5.35 on panel, up from 3.12). Today it fails for the small uppercase labels and axis ticks it's used on.

---

## A · Ink (recommended)

> Warm graphite greys and one ink-blue accent: the colour of a pen tick on a printout.

The neutrals move off today's cold blue-black onto a slightly warm graphite, like paper in a dim room. The accent is a soft, desaturated ink blue rather than a glowing amber. It still reads clearly as "the interactive or selected thing", but it no longer shouts. Blue is also the hue that colour-blind readers see most reliably, and it can't be mistaken for up (green) or down (red). The story fits the product: an analyst ticks a checked number with a pen.

```css
--color-ink: #12100f;      /* oklch(0.175 0.004 75) */
--color-panel: #181715;    /* oklch(0.205 0.004 75) */
--color-raised: #21201d;   /* oklch(0.243 0.005 75) */
--color-line: #302d2b;     /* oklch(0.300 0.006 75) */
--color-muted: #b4b0ac;    /* oklch(0.760 0.007 75) */
--color-subtle: #8f8c88;   /* oklch(0.640 0.007 75) */
--color-text: #f0eeeb;     /* oklch(0.950 0.004 75) */
--color-accent: #86b6e5;   /* oklch(0.760 0.085 248) */
--color-accent-2: #4e77a5; /* oklch(0.560 0.085 252), only the bottom of the revenue bar */
--color-up: #6ad6b0;       /* oklch(0.800 0.115 168) */
--color-down: #e87556;     /* oklch(0.690 0.150 36) */
--color-series-2: #97918a; /* oklch(0.660 0.012 75) */
--color-glow: #202f3f;     /* oklch(0.300 0.035 248), top of the start-screen wash */
```

| Check (WCAG 2.x, on `panel`) | Ratio | AA |
|---|---|---|
| text | 15.47 | ✓ |
| muted | 8.31 | ✓ |
| subtle | 5.35 | ✓ |
| accent (links, active tab, latest column header) | 8.39 | ✓ |
| up / down | 10.12 / 6.07 | ✓ |
| up / down on their own 12% chip | 7.96 / 5.16 | ✓ |
| `ink` text on an `accent` button | 8.89 | ✓ |
| up vs down ΔE: normal, deutan, protan, tritan | 26.7 / 12.8 / 21.9 / 33.1 | today: 30.5 / 6.8 / 18.3 / 35.3 |

## B · Brass

> Keeps a warm accent, but as aged brass on warm stone instead of bright amber on black.

This option changes the least. It keeps today's warm identity and fixes the parts that read as AI: chroma drops from about 0.15 to 0.085, the hue moves from orange-amber toward brass, and the orange `accent-2` becomes a darker brass. The two-hue gradient becomes a tonal one. The risk is that warm accents next to a green and red data palette compete a little more than blue does, and brass bars can look beige at small sizes.

```css
--color-ink: #110f0d;      /* oklch(0.170 0.006 70) */
--color-panel: #181613;    /* oklch(0.200 0.006 70) */
--color-raised: #211e1b;   /* oklch(0.238 0.007 70) */
--color-line: #2f2c28;     /* oklch(0.295 0.008 70) */
--color-muted: #b5b0aa;    /* oklch(0.760 0.010 75) */
--color-subtle: #908b86;   /* oklch(0.640 0.010 70) */
--color-text: #efece7;     /* oklch(0.945 0.008 85) */
--color-accent: #d9b97e;   /* oklch(0.800 0.085 82) */
--color-accent-2: #a57e4f; /* oklch(0.620 0.080 70) */
--color-up: #6ad6b0;
--color-down: #e87556;
--color-series-2: #958e86; /* oklch(0.650 0.014 70) */
--color-glow: #35291b;     /* oklch(0.290 0.030 70) */
```

| Check | Ratio |
|---|---|
| text / muted / subtle | 15.32 / 8.39 / 5.35 |
| accent | 9.62 |
| up / down, and on their chips | 10.20 / 6.11, 8.06 / 5.21 |
| ink on accent | 10.19 |
| up vs down ΔE for deuteranopia | 12.8 |

## C · Mono

> Near-monochrome cool greys. Colour is kept for data only: up, down and the revenue series.

This is the quietest option and the closest match to the new grey logo and toolbar. The accent is a pale steel (chroma 0.025), barely a colour, so selected and interactive states read through brightness, the way Vercel and Linear do it. The only real colour on screen is green and red. It's the most "serious tool" of the three, but also the most likely to feel cold, and the revenue bars lose some presence.

```css
--color-ink: #0d0e10;      /* oklch(0.165 0.003 255) */
--color-panel: #141516;    /* oklch(0.195 0.003 255) */
--color-raised: #1c1e1f;   /* oklch(0.233 0.004 255) */
--color-line: #2a2b2e;     /* oklch(0.290 0.005 255) */
--color-muted: #aeb1b5;    /* oklch(0.760 0.006 255) */
--color-subtle: #8a8c90;   /* oklch(0.640 0.006 255) */
--color-text: #eff0f2;     /* oklch(0.955 0.003 255) */
--color-accent: #bcced9;   /* oklch(0.840 0.025 235) */
--color-accent-2: #7c8891; /* oklch(0.620 0.020 240) */
--color-up: #6ad6b0;
--color-down: #e87556;
--color-series-2: #777b7f; /* oklch(0.580 0.008 255) */
--color-glow: #23272c;     /* oklch(0.270 0.012 255) */
```

| Check | Ratio |
|---|---|
| text / muted / subtle | 16.03 / 8.49 / 5.43 |
| accent | 11.29 |
| up / down, and on their chips | 10.32 / 6.19, 8.20 / 5.28 |
| ink on accent | 11.93 |
| up vs down ΔE for deuteranopia | 12.8 |

---

## Gradient rules (the same for every option)

Light comes **from above**. Every gradient is **tonal** (one hue, lightness only), and none of them animate.

| Where | Gradient | Token |
|---|---|---|
| **Start-screen backdrop** (the one hero gradient) | A wide elliptical wash from just above the top edge: `glow`, fading to `ink` by about 70% of the height, with a tiled noise overlay at 5% to stop banding. It replaces the amber blob, its pulse animation and the grid. | `--gradient-hero` |
| **Composer and floating chat card border** | A 1px edge: `text` mixed 22% into `line` at the top, falling to `line`, then a little darker at the bottom. It brightens on focus. | `--gradient-edge` |
| **Revenue bars** (overview and metric detail) | Vertical, `accent` to `accent-2` (same hue, darker). | in the recharts `<linearGradient>` |
| **Net income bars** | `series-2`, fading 30% toward `panel`. | same |
| **`.surface` cards** | Keep the existing top highlight (raised → panel). It already lights from above. | unchanged |
| **Sparkline fill** | Keep the accent fade to transparent under the line. | unchanged |

**Never use a gradient on:** headline text (the second line of the hero becomes `text-muted`), buttons, chips, KPI numbers, the company tile, the table, icons or the logo. Also never use a gradient with two hues, a blurred blob, or a glow behind the dashboard header.
