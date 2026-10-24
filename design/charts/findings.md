# MuTick charts: findings and refinements

Research only. Nothing in `apps/web` was changed. Mock-ups are in [`preview.html`](preview.html) and the screenshots in [`shots/`](shots/). To rebuild them, run `sh shoot.sh`.

**Constraint:** Amir wants the dashboard to stay familiar: KPI cards, then the chart, then the table, with the same chart types. Everything in the main list works inside that structure. Anything structural is in [Bigger ideas](#bigger-ideas-structural--not-for-this-weekend), labelled as such.

**Method:** the `dataviz` skill (form, then colour, then marks, then interaction, then accessibility). Colour was checked with its `validate_palette.js` against the Ink panel `#181715`. I also audited the live app at `localhost:3100` with the NVIDIA desk (Q3 FY2026 to Q2 FY2027) and the NVDA vs MSFT revenue compare. "Before" screenshots of the live app are `shots/before-live-*.png|jpg`.

---

## Top 5 to do first

About 55 minutes in total, and all low risk to familiarity.

| # | Change | Why it matters | Effort | Risk |
|---|---|---|---|---|
| **F1** | Darker grey for net-income bars (`#77716b`) | The two bars are nearly the same lightness, so they fail the normal-vision separation check | 2 min | low |
| **F2** | Honest sparkline scale for margins | Gross margin's +1.6pp drift is drawn as a cliff | 15 min | low |
| **F3** | Neutral chip when the change rounds to zero | "+0.0pp" shows green with an up arrow | 10 min | low |
| **F4** | Clean axis ticks ($25B, not $25.00B) and solid hairline grid | Ticks are noisy, and dashed lines read as projections | 10 min | low |
| **F5** | Direct labels on the latest quarter, bold latest axis label, "D" on the derived quarter | The newest quarter is the point of the chart, but nothing marks it | 20 min | low |

---

## What works now

- **The form is right for each question.** Grouped columns suit levels over time. The FT Visual Vocabulary lists column for a time series of amounts and ordered bar for ranking ([FT chart-doctor](https://github.com/Financial-Times/chart-doctor/tree/main/visual-vocabulary)). The single-metric view switches to a line or area for margins, which is also right: margins are a rate, not an amount.
- **Bars start at zero.** Datawrapper enforces this, because bar length encodes value ([Datawrapper](https://www.datawrapper.de/academy/why-our-column-and-bar-charts-start-at-zero)).
- **Changes are already in the right unit.** Margin changes are in percentage points (pp) and money changes in %. The KPI row also names its comparison period ("Change vs Q1 FY2027").
- **The latest column is emphasised in the table.** It has a tint and an accent header, which is the subtle highlight that table guidance recommends ([Schwabish via van der Laken](https://paulvanderlaken.com/2020/09/01/10-guidelines-to-better-table-design/)). Numbers are right-aligned with tabular figures.
- **There is a data-table twin.** The quarterly table under the chart holds every value. That is the WCAG-clean fallback Chartability asks for ([Chartability](https://chartability.github.io/POUR-CAF/)). It also relaxes the 3:1 rule for marks, because the data is available as text ([WCAG 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)).
- **Keyboard access mostly works.** Recharts 3's accessibility layer is on by default. The bar chart takes focus (one tab stop), and the arrow keys move the tooltip between quarters. I tested this live.
- **Provenance is visible.** The D, C, ~ and R badges, plus the footnote, are an annotation system already. Datawrapper recommends annotating outliers and context in the chart, not only in prose ([Datawrapper](https://www.datawrapper.de/blog/text-in-data-visualizations)).
- **Up and down are safe for colour-blind readers, with a second cue.** Up `#6ad6b0` vs down `#e87556` measures ΔE 26.7 for normal vision and 12.8 for deutan. Both chips also carry an arrow and a sign, so colour is never the only cue ([Chartability](https://chartability.github.io/POUR-CAF/)).

## What's weak, and why

1. **The two bar colours are too close.** Revenue `#86b6e5` vs net income `#97918a` is OKLab ΔE 14.0. That is below the floor of 15 for normal vision and fails the validator's hard check. Deutan is 13.2. They differ in hue but sit at almost the same lightness, so in greyscale, print, or at a glance they merge. Datawrapper's advice is to "vary lightness, not just hue" ([Datawrapper](https://www.datawrapper.de/academy/automatic-colorblind-check)).
2. **Sparklines exaggerate.** Each sparkline stretches its own min and max to fill 32px, so gross margin going from 73.4% to 74.9% to 75.0% draws as a near-vertical jump. Tufte's own discussion of sparklines flags per-series min-max scaling as misleading when readers compare cards. Few says to pick one scale rule and keep it ([Tufte](https://www.edwardtufte.com/notebook/sparkline-theory-and-practice-edward-tufte/), [Few, Scaling sparklines](https://www.perceptualedge.com/articles/visual_business_intelligence/best_practices_for_scaling_sparklines.pdf)).
3. **A zero change reads as good news.** `delta.tsx` treats `value >= 0` as up, so 0.0pp gets the green chip and up arrow. Tufte warns against "stoplight" colouring that implies judgement ([Tufte](https://www.edwardtufte.com/notebook/sparkline-theory-and-practice-edward-tufte/)).
4. **Ticks and gridlines are noisy.**
   - The y-axis reuses `formatValue`, so it prints "$100.00B", "$75.00B" and so on: two decimals on round numbers.
   - Gridlines are dashed (`3 6`). Dashing reads as "projection" or "threshold". Guidance is thin, solid and recessive gridlines ([Datawrapper](https://www.datawrapper.de/blog/automatically-label-values-in-line-charts), dataviz skill anti-patterns).
5. **Nothing points at the latest quarter in the chart.** The table emphasises it, but the chart doesn't, and the reader has to hover to get any number. Datawrapper: "remove the color key and directly label" ([Datawrapper](https://www.datawrapper.de/blog/text-in-data-visualizations)). The Economist style labels values directly and cuts clutter (secondary source only: [thinkinsights](https://thinkinsights.net/insights/data-visualization-economist)).
6. **Bars are heavy and decorated.**
   - The bars are 56px wide, with an accent-to-accent-2 gradient.
   - The base is rounded at 3px, so bars don't sit cleanly on the zero line.
   - The legend uses dots for bar series.
   - Gradients add ink that isn't data, and the darker gradient bottoms pull revenue towards the grey series.
7. **The tooltip only repeats the bar heights.** It shows the two values, but not what an analyst wants next: the change on the previous quarter, and net margin. Datawrapper suggests a small mini-table of related values with units ([Datawrapper tooltips](https://www.datawrapper.de/academy/i-want-to-change-how-my-data-appears-in-tooltips)).
8. **The chart has no accessible name.** The Recharts `<svg>` is `role="application"`, `tabindex="0"`, with no label. A screen reader announces "application" and nothing else. The sparklines are rightly `aria-hidden`, but the cards have no text version of the trend. WAI's pattern is a short name plus a longer description of trends ([W3C WAI complex images](https://www.w3.org/WAI/tutorials/images/complex/)).
9. **The compare view hides the year-ago comparison it describes.**
   - The subtitle says "against the same quarter a year earlier", but the year-ago figure is only small text.
   - Every bar is the same accent colour.
   - The full-width pill track looks like a progress bar towards 100%.
   - NVDA's "Q2 FY2027" and MSFT's "Q4 FY2026" look like different periods, although both ended in mid-2026.
10. **Up isn't always good.** Q/Q chips colour capex +52.4% green and diluted shares −0.4% red. For costs and share count, the "good" direction is reversed or neutral.
11. **The metric detail view repeats the overview's issues:**
    - dashed grid;
    - gradient bars with a 10px radius;
    - a 35% gradient area under a margin line whose y-axis doesn't start at zero (an area fill implies a quantity measured from zero);
    - a glow ring on the last point.
12. **Motion ignores reduced-motion settings.** Bars animate for 800ms, and the cards and numbers animate in. Nothing checks `prefers-reduced-motion`. I found no `useReducedMotion` or `MotionConfig` in `apps/web`.

---

## All improvements, prioritised

Effort is the time to build and check it. Risk is the risk to Amir's sense of familiarity. ★ marks the top 5.

| ID | Problem | Fix | File · component | Effort | Risk |
|---|---|---|---|---|---|
| ★ **F1** | Revenue and net-income bars are ΔE 14.0 apart, failing the normal-vision floor. | Set `--color-series-2: #77716b`. It is used only by this chart and its legend dot. That gives ΔE 22.9 normal, 22.0 deutan, and 3.7:1 on the panel. `#6f6a64` (ΔE 25.2, 3.35:1) separates the pair more strongly, if Shakoora prefers. | `app/globals.css` (token) | 2 min | low |
| ★ **F2** | Sparklines use per-card min-max, so small margin drifts look dramatic. | Add a `kind` prop to `Sparkline`. Margins use a fixed 10pp window centred on their mean. Money uses a zero baseline with a 1px line, or keep min-max for money if it looks too flat (Shakoora's call; see the mock). Optional: a muted "from $57.01B" start label bottom-left. | `components/ui/sparkline.tsx` · `Sparkline`; caller in `quarter-overview.tsx` | 15 min | low |
| ★ **F3** | 0.0pp is shown green with an up arrow. | In `Delta`, if `Math.round(value*1000) === 0`, render a neutral chip (`bg-subtle/14 text-muted`) with a `Minus` icon and "0.0pp". Do the same in `Change` in `cell-value.tsx`. | `components/ui/delta.tsx` · `Delta`; `components/dashboard/cell-value.tsx` · `Change` | 10 min | low |
| ★ **F4** | Ticks read "$100.00B", and gridlines are dashed. | Add a compact tick formatter (`$0`, `$25B`, `$1.2T`, whole numbers for round ticks). Drop `strokeDasharray` from `CartesianGrid`. Add a `ReferenceLine y={0}` in a slightly stronger grey (`#4a4642`). | `quarter-overview.tsx` · `Chart`; `metric-detail.tsx` (both charts) | 10 min | low |
| ★ **F5** | The latest quarter isn't marked in the chart. | Add a `<LabelList>` on both `<Bar>`s, rendering only for the last index (11px semibold, `fill: var(--color-text)`, one decimal). Add a custom XAxis `tick` that bolds the last label and appends the table's "D" badge for derived quarters (needs the cell's `method`). | `quarter-overview.tsx` · `Chart` | 20 min | low |
| F6 | Gradient bars, 56px wide, rounded at the base; the legend uses dots. | Use flat fills (`var(--color-accent)`, `var(--color-series-2)`), `radius={[4,4,0,0]}`, `maxBarSize={36}`, `barGap={4}`, and square swatches in the legend (`rounded-[2px]`). | `quarter-overview.tsx` · `Chart` | 10 min | low |
| F7 | The tooltip repeats bar heights only. | Lead each row with the value, then the name, then the Q/Q change. Add a footer with "Net margin 63.1%", and "· derived" in the header for D quarters. Use a short 10×2 stroke as the key instead of a dot. `ChartTooltip` gets an optional `extra(label)` render prop so other charts are unaffected. | `components/ui/chart-tooltip.tsx` · `ChartTooltip`; `quarter-overview.tsx` | 25 min | low |
| F8 | The chart has no accessible name (`role="application"`, unlabelled). | Pass `title="Revenue and net income, last four quarters"` and a `desc` one-line trend summary to `<BarChart>`. Recharts forwards these to the SVG. If the props don't reach the SVG, wrap the chart in `<figure aria-label>` instead. Do the same for the metric detail view. | `quarter-overview.tsx` · `Chart`; `metric-detail.tsx` | 5 min | low |
| F9 | The sparkline has a gradient wash, a small end dot, and stretched strokes. | Use a 2px line, no area or a 10% wash at most, and an end dot with r=4 and a 2px ring in the panel colour. Use real pixel coordinates instead of `preserveAspectRatio="none"` so the dot stays round. No min or max dots: four points don't need them. Tufte's extremes dots are for long series ([Tufte](https://www.edwardtufte.com/notebook/sparkline-theory-and-practice-edward-tufte/)). | `components/ui/sparkline.tsx` | 10 min | low |
| F10 | The compare view only states the year-ago value in text. | Add a 2px × 14px tick at `yearAgo/max` on each track, in `--color-muted` with a 2px panel ring. Add a legend line "▮ Latest quarter · ┃ Year earlier". Keep the "Year earlier $46.74B" text. | `components/dashboard/compare-view.tsx` · `CompareView` | 20 min | low |
| F11 | Every compare bar is accent, the track looks like a progress bar, and rows aren't sorted. | Make the desk's own ticker accent and peers `series-2`. Sort rows by value. Use an 8px bar with a square start and a 4px rounded end, on a 4px faint rail. | `compare-view.tsx` | 15 min | medium (colour meaning changes) |
| F12 | Screen readers get no trend from the KPI cards. | Add an `sr-only` sentence per card: "Revenue $96.22B, up 17.9% vs Q1 FY2027, rising since Q3 FY2026 from $57.01B". | `quarter-overview.tsx` (KPI map) | 10 min | low |
| F13 | Fiscal labels hide that the compared quarters cover the same months. | Under each ticker, show "Q2 FY2027 · ended 26 Jul 2026". `periodEnd` is already on each compare row. | `compare-view.tsx` | 10 min | low |
| F14 | Capex up shows green, and share count down shows red. | Add a `good: 'up' \| 'down' \| 'neutral'` field per metric key: capex and shares neutral. `Delta` uses neutral styling, keeping the arrow and sign, when `neutral`. | `delta.tsx`; `quarter-overview.tsx` (table Q/Q column) | 15 min | low |
| F15 | The metric detail view has a dashed grid, gradients, a 35% area on a non-zero axis, and a glow dot. | Apply F4 and F6 there too. For margins, use a line with at most a 10% wash, or no area at all. Remove the `ReferenceDot` glow. Make the end dot r=4 with a ring. | `components/dashboard/metric-detail.tsx` | 20 min | low |
| F16 | Animations ignore `prefers-reduced-motion`. | Wrap the app in `<MotionConfig reducedMotion="user">`, and pass `isAnimationActive={!reduced}` to Recharts bars. | `app/layout.tsx` or providers; chart files | 10 min | low |
| F17 | Axis text is 11px `subtle`. It passes contrast at 5.35:1, but Chartability asks for 12px or more. | Bump the tick `fontSize` to 12. | chart files | 2 min | low |
| F18 | The hover band is `rgba(255,255,255,.03)`, nearly invisible on Ink. | Use `color-mix(in oklab, var(--color-text) 5%, transparent)`, so the hovered quarter visibly lifts. | `quarter-overview.tsx`, `metric-detail.tsx` | 2 min | low |

**Suggested order after the top 5:** F6, F8 and F18 take 17 minutes together and make the chart look finished. Then F7, then F10 with F13 for the compare view. F14 is the one an analyst will notice first in the table.

---

## Research notes by topic

**Which chart for which question**
- *Level* (revenue, net income): columns from zero. Keep the grouped bars.
- *Change*: a chip with a sign and arrow, in pp for margins. Datawrapper suggests plotting differences or dots when differences look small, which supports the bigger idea of a growth line, not a change to the bars ([Datawrapper](https://www.datawrapper.de/academy/why-our-column-and-bar-charts-start-at-zero)). Koyfin lets users switch a growth series (YoY or QoQ) to bars ([Koyfin help](https://www.koyfin.com/help/how-to-look-at-growth-rates-on-koyfin/)).
- *Margins*: a line on a non-zero axis is fine. FT and Datawrapper both allow lines to skip zero. Avoid a filled area on a non-zero axis.
- *Company vs peers*: an ordered bar (FT). A year-ago vs now pair is a dumbbell or slope, which F10 approximates inside today's bar layout.
- No authoritative source was found for "margin changes in pp". It is standard practice in sell-side notes.

**Axes, gridlines and direct labels**
- Bars start at zero, and gridlines are thin and optional ([Datawrapper](https://www.datawrapper.de/academy/why-our-column-and-bar-charts-start-at-zero)).
- Remove the colour key where you can label directly ([Datawrapper](https://www.datawrapper.de/blog/text-in-data-visualizations)). With two series and a top-right legend Amir knows, keep the legend and add the latest values. The dataviz skill says the same: always keep a legend for two or more series, and add direct labels sparingly.

**Annotations and uncertainty**
- Give estimates or projections their own lighter or dashed series and explain the convention in the caption ([Flourish](https://flourish-kiln.helpscoutdocs.com/article/397-how-to-create-a-line-chart-with-projections)). FT uses fan charts for forecast ranges.
- MuTick's "derived" Q4 isn't uncertain; it's exact arithmetic. A "D" badge on the axis label (F5) is the honest mark. Save hatching for "~ approximate" values, if they ever reach a chart.
- Koyfin's earnings-history view uses markers: a grey dot for the estimate and a coloured dot for the actual, green for a beat and red for a miss, with wicks for the estimate range, plus a table underneath ([Koyfin](https://www.koyfin.com/help/earnings-history/)). TIKR mixes reported and consensus figures, with analyst counts on hover ([TIKR](https://support.tikr.com/hc/en-us/articles/39071375390235-How-do-I-use-TIKR-s-Estimates-feature)). Neither documents bar colours or latest-quarter emphasis. Bloomberg, Stripe and Linear docs were not reachable or don't cover this, so I make no claims about them.

**KPI cards and sparklines**
- Tufte: word-sized lines, a dot on the end value tied to a number on the page, and optionally a grey "normal" band ([Tufte](https://www.edwardtufte.com/notebook/sparkline-theory-and-practice-edward-tufte/)).
- Few: choose a scale rule and state it. Bandlines (shaded quartiles from a longer history) give context without min or max labels ([Few, bandlines](https://www.perceptualedge.com/articles/visual_business_intelligence/introducing_bandlines.pdf)).
- For four points: no baseline band and no min or max dots. Use an end dot and an honest scale (F2, F9).
- Stripe's public docs only describe tiles as "a number plus a badge vs the previous period" ([Stripe](https://docs.stripe.com/stripe-apps/analytics)), which is MuTick's pattern already.

**Tooltips**
- Value first, with units and the category, as a mini-table ([Datawrapper](https://www.datawrapper.de/blog/text-in-data-visualizations)).
- Keyboard focus shows the same content as hover ([Chartability](https://chartability.github.io/POUR-CAF/)). This already works in Recharts 3.
- Tooltips enhance and never gate: every value is also in the table.

**Table**
- Right-aligned tabular numbers, a subtle highlight on the latest column, no vertical rules (already done).
- Datawrapper's table heatmaps scale per column ([Datawrapper](https://www.datawrapper.de/academy/how-to-create-a-heatmap)). For mixed units, scale per row. A heat tint would change how the table reads, so it is in Bigger ideas.
- The quick win is F14: correct semantics for colours already there.

**Accessibility**
- WCAG 1.4.11: marks need 3:1 against the background unless the values are available as text or in a table ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)). All proposed marks clear 3:1 on the panel anyway: accent 8.4, `#77716b` 3.7, accent-2 3.8, muted tick 8.3.
- Never rely on colour alone. Chips already carry an arrow and a sign. Bars carry the legend, and with F5 the labels too.
- One tab stop per chart, arrow keys inside, a title plus a summary, and a data table ([Chartability](https://chartability.github.io/POUR-CAF/)). F8 and F12 close the gaps.
- Text of 12px or more (F17).

**Colour validation** (dataviz `validate_palette.js`, dark, surface `#181715`)

| Pair | Normal ΔE | Deutan ΔE | Verdict |
|---|---|---|---|
| accent `#86b6e5` · series-2 `#97918a` (today) | 14.0 | 13.2 | **FAIL** (normal-vision floor 15) |
| accent · `#77716b` | 22.9 | 22.0 | pass, 3.7:1 |
| accent · `#6f6a64` | 25.2 | 24.3 | pass, 3.35:1 |
| up `#6ad6b0` · down `#e87556` | 26.7 | 12.8 | pass |
| accent-2 → accent (latest emphasis ramp) | n/a | n/a | ordinal pass |

The validator also flags the light accent (L 0.76) and the greys (chroma below 0.10) as outside its generic *categorical* band. That is expected and accepted: MuTick's bars are an emphasis pair (one hue plus grey), not a categorical palette. The pass that matters is the separation between the pair. The mock uses `#77716b`; F1 lists `#6f6a64` as the stronger option.

---

## Bigger ideas (structural – not for this weekend)

These change what the dashboard shows or how it is laid out, so each needs Amir's agreement first.

1. **Consensus vs actual markers.** Add a grey estimate dot beside each revenue or EPS bar, with the beat or miss shown by sign and arrow. This is Koyfin's earnings-history pattern, but it needs a consensus data source.
2. **A growth line for each metric.** Add a small Q/Q or YoY % line under the bars, as a second chart (never a dual axis), or offer a "show growth" toggle like Koyfin's.
3. **Margins as their own small chart.** Show gross, operating and net margin as three lines on one pp axis beside the bars. Today margins appear only as cards and table rows.
4. **Heat tint in the table.** Add a per-row sequential tint (accent, light to dark) or tiny in-cell bars, Datawrapper style. This changes how the table reads, so it needs testing with Amir.
5. **Peer compare as a dumbbell or indexed chart.** Show year-ago to now as a dot pair per company, or index revenue to 100 at a common quarter for 3 or more peers. F10's tick is the in-place version.
6. **Longer history with bandlines.** With 8 to 12 quarters, sparklines could show Few's quartile band, and min and max dots would start to earn their place.
7. **A chart/table toggle and CSV export.** This would make the table twin explicit and downloadable, as Chartability and Highcharts recommend.
