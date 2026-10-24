# Plan: apply the new colour system

**Recommendation: option A · Ink.** Warm graphite greys, one soft ink-blue accent, green and red tuned for colour-blind users, and a single tonal gradient lit from above.

Files in this folder:

- `research.md`: findings and sources.
- `palettes.md`: all three options, their tokens, contrast checks and the gradient rules.
- `preview.html`: open it in a browser and use **Desk / Start screen** and the option buttons to compare.
- `shots/`: 1440×900 screenshots of each option, plus `compare-desk.png` and `compare-start.png`.
- `palettes.mjs`, `build-preview.mjs`, `shoot.sh`: regenerate everything above.

## Why A

1. **It drops the AI tells without going grey and lifeless.** The amber glow, the grid, the gradient headline and the two-hue amber→orange gradient all go. What replaces them is a single quiet wash and a 1px lit edge. C (Mono) does that too but loses warmth and gives the revenue bars little presence. B (Brass) keeps a warm accent, which still sits close to the old amber look.
2. **It suits finance.** A blue accent can't be confused with up or down, so on the dashboard green and red mean only up and down. Blue is also the hue colour-blind readers see best.
3. **It fits what's just been decided.** The grey logo and the bordered square toolbar buttons look at home on warm graphite, and the ink blue is a "checked with a pen" colour, which suits the tick mark.
4. **Accessibility improves on every pair.** `subtle` goes from 3.12 (fails) to 5.35. Up and down are almost twice as far apart for deuteranopia (ΔE 6.8 → 12.8), and every text pair passes AA (see `palettes.md`).

## Where the gradient goes, and where it doesn't

| Gradient | Not a gradient |
|---|---|
| Start-screen backdrop: one wide wash from the top, `glow` → `ink`, plus 5% grain. Static. | Headline text: the second line becomes plain `text-muted`. |
| 1px lit edge on the **composer** and the **floating chat card**. | Buttons, chips, delta pills, KPI numbers. |
| Revenue bars: `accent` → `accent-2` (same hue). Net income bars: `series-2` fading slightly. | The company tile (currently an NVIDIA-green gradient). |
| The `.surface` top highlight and sparkline fill stay as they are. | The dashboard header (remove the amber wash), comparison and metric cards (remove the corner glows). |

## Steps (about 45 minutes)

Line numbers are from `design-polish` as it is now. Another session is editing these files, so match on the quoted code rather than the line number.

### 1. Tokens and helpers in `apps/web/app/globals.css` (8 min)

Replace the colour lines in `@theme` with:

```css
  --color-ink: #12100f;
  --color-panel: #181715;
  --color-raised: #21201d;
  --color-line: #302d2b;
  --color-muted: #b4b0ac;
  --color-subtle: #8f8c88;
  --color-text: #f0eeeb;
  --color-accent: #86b6e5;
  --color-accent-2: #4e77a5;
  --color-up: #6ad6b0;
  --color-down: #e87556;
  --color-series-2: #97918a;
  --color-glow: #202f3f;
```

Then add this after the `.surface` block:

```css
/* The two gradients. Light comes from above; both stay in one hue. */
:root {
  --gradient-hero: radial-gradient(
    140% 75% at 50% -12%,
    var(--color-glow) 0%,
    color-mix(in oklab, var(--color-glow) 40%, var(--color-ink)) 38%,
    var(--color-ink) 72%
  );
  --gradient-edge: linear-gradient(
    180deg,
    color-mix(in oklab, var(--color-text) 22%, var(--color-line)) 0%,
    var(--color-line) 55%,
    color-mix(in oklab, var(--color-line) 60%, var(--color-ink)) 100%
  );
}

/* A 1px border lit from above. Use instead of border-line + bg-panel. */
.edge {
  border: 1px solid transparent;
  background:
    linear-gradient(var(--color-panel), var(--color-panel)) padding-box,
    var(--gradient-edge) border-box;
}
form.edge:focus-within {
  background:
    linear-gradient(var(--color-panel), var(--color-panel)) padding-box,
    linear-gradient(180deg, color-mix(in oklab, var(--color-text) 36%, var(--color-line)), color-mix(in oklab, var(--color-text) 14%, var(--color-line))) border-box;
}

/* Fine grain over the start-screen wash, so the long dark gradient doesn't band. */
.grain {
  opacity: 0.05;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .55 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}
```

`.edge` is deliberately unlayered, so it wins over Tailwind's `border-*` and `bg-*` utilities. Even so, remove `border-line bg-panel` where you add it, to keep the markup honest.

Reload the app now. Most of the change (greys, accent, up/down) happens with this step alone.

### 2. Start screen: `components/empty-desk.tsx` (8 min)

- **Lines 45–55:** delete both backdrop layers, the grid `<div>` and the pulsing amber `<motion.div>`. Replace them with:
  ```tsx
  {/* Backdrop: one tonal wash from above, with grain */}
  <div aria-hidden className="pointer-events-none absolute inset-0 [background:var(--gradient-hero)]" />
  <div aria-hidden className="grain pointer-events-none absolute inset-0" />
  ```
- **Line 72:** change `className="from-accent to-accent-2 bg-gradient-to-r bg-clip-text text-transparent"` to `className="text-muted"`.
- **Line 93 (example buttons):** remove `backdrop-blur`, and change `hover:border-accent/40` to `hover:border-subtle/50`. The chips stay neutral; the accent is for things that are selected or live.
- The big composer gets its edge in step 3.

### 3. Lit edge on the composer and chat card (5 min)

- **`components/chat/composer.tsx` line 49:** change `'border-line bg-panel rounded-[20px] border transition-…'` to `'edge rounded-[20px] transition-[box-shadow] duration-200'`, and remove the `focus-within:border-[…]` class on line 50. Keep the `focus-within:shadow-…` part. Focus is handled by `form.edge:focus-within`.
- **`app/p/[projectId]/page.tsx` line 79 (floating chat card):** change `border-line bg-panel … rounded-2xl border` to `edge … rounded-2xl`. Keep the shadow and the layout classes.
- The bordered square toolbar buttons and the borderless bubbles stay exactly as they are.

### 4. Dashboard header: `components/dashboard/dashboard.tsx` (2 min)

- **Line 30:** delete the `<div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(ellipse_at_top_left,…accent…)]" />`. Leave everything else in the header (title, period, filing strip, tabs) alone.

### 5. Chart series: `components/dashboard/quarter-overview.tsx` (5 min)

- **Line 151:** `stopColor="var(--color-accent-2)" stopOpacity={0.6}` becomes `stopColor="var(--color-accent-2)" stopOpacity={0.9}`. The gradient is now same-hue, so it doesn't need to fade to nothing.
- **Lines 154–155:** change `var(--color-up)` to `var(--color-series-2)` in both stops, and change the second `stopOpacity={0.45}` to `{0.7}`.
- **Line 141:** in the legend dot, change `bg-up` to `bg-series-2`.
- Keep the bar radius, sizes, grid, axes, KPI cards and table as they are. Only colours change.

### 6. Remove the leftover glows and two-hue fills (7 min)

- **`components/dashboard/metric-detail.tsx` line 55** and **`components/dashboard/compare-view.tsx` line 26:** delete the corner `radial-gradient(… accent …)` blob `<div>`s.
- **`metric-detail.tsx` line 125:** change `stopOpacity={0.55}` to `{0.9}`, for the same reason as step 5.
- **`compare-view.tsx` line 58:** change `from-accent to-accent-2 bg-gradient-to-r` to `bg-accent`. It's a horizontal bar, and a sideways gradient breaks the "light from above" rule.
- **`components/ui/monogram.tsx`:** make the tile neutral. Change the class to `border-line bg-raised text-muted border`, drop `bg-gradient-to-br`, `text-white` and the `HUES` lookup (or keep `HUES` unused for now), and set the inset highlight to `rgba(255,255,255,0.06)`. Company brand colours are the loudest thing in the header and are not ours. *If the team wants to keep a hint of company colour, a 2px left border in that colour is the most it should get.*

### 7. Check (10 min)

1. `pnpm -C apps/web exec tsc --noEmit` (or the repo's usual typecheck).
2. Grep for anything left behind. This should return nothing outside `globals.css`:
   ```bash
   grep -rnE "bg-clip-text|blur-2xl|from-accent|to-accent-2|radial-gradient\(closest-side" apps/web/components apps/web/app
   ```
3. Look at the start screen, an NVIDIA desk, a metric tab, a compare tab and the filing reader. The filing reader's "Fixed after a re-read" uses `accent` and will now be blue. That is intended: blue means checked or edited, and green and red stay up and down.
4. Compare against `design/colour/shots/desk-ink.png` and `start-ink.png`.

## Keep as it is

- Layout, spacing, chart type, KPI and table structure. Amir's dashboard stays familiar.
- The ↗/↘ arrows and the +/− signs on deltas. They are the non-colour cue for up and down.
- The grey logo, the grey "MuTick" label, the bordered square Mubit and + buttons, and the borderless chat bubbles.
- The `.surface` top highlight, the grey `.shimmer-text`, the sparkline fade and the chart tooltip.
- Primary buttons stay `bg-accent text-ink` (8.9:1), and the send button stays `bg-text text-ink`.

## Optional later (not in the hour)

- A **colour-blind setting** that swaps up and down to blue and orange, the way Bloomberg offers alternative schemes.
- If B or C wins instead, use its token block from `palettes.md` in step 1. Every other step is the same, because the gradient rules don't depend on the option.
