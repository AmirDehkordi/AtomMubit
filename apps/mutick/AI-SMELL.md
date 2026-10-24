# AI-smell review: Atom Earnings Desk

Scope: every screen at 1440x900 on port 5180. The walk was: Track NVIDIA from the start screen, fix diluted EPS, track Microsoft from the chat, switch Before and After, open Learning. I also read the copy in `src/components` (outside `ui/`), `src/api/mock`, `src/state/app.tsx` and `src/lib`.

`AUDIT.md` (v4) is done and not repeated here. Its dropped items (uppercase table headers, one accent colour, "e." in the Fundamentals header) stay dropped.

Severity: **high** means a reader takes away something false. **Medium** means it reads as generated or makes the next step unclear. **Low** means polish.

Screenshots: `ai-smell/before-*.png` and `ai-smell/after-*.png`, taken by the same headless-Chrome script at 1440x900 (full-height for long pages).

Files another session is redesigning (`ReviewCard.tsx`, `SourceExcerpt.tsx`, `ReleaseView.tsx`, `ChatPanel.tsx`, `src/components/chat/`, `src/api/client.ts`) were read but not edited. Their findings are in section 5.

---

## 1. Findings and proposed fixes

### Copy

| # | Where | Finding | Sev | Before | After |
|---|---|---|---|---|---|
| C1 | `start/StartScreen.tsx:21` | Slogan with a matched "every… every…" pair, in the passive. | medium | Track a company's earnings releases. Every number is checked, and every fix teaches the model. | Track a company's earnings releases. Checks flag the AI's mistakes, and Mubit learns from your fixes. |
| C2 | `start/StartScreen.tsx:36` | Helper text repeats the placeholder ("or upload an earnings release"), promises drag and drop that doesn't exist, and gives the document a third name ("press release"). | medium | or drop a press release with the clip | *(removed)* |
| C3 | `release/AttentionStrip.tsx:27` | Untrue. Revenue and net income are still waiting for the 10-Q, so not "everything else passed". "The checks caught these" repeats the title. | **high** | The checks caught these. Everything else on this release passed. | Everything else passed or is waiting for the 10-Q. *(or "Everything else passed." when nothing is waiting)* |
| C4 | `release/AttentionStrip.tsx:18` | Contradicts the summary right below it ("Checked 5 of 7 fields"). | **high** | All 7 numbers checked. Nothing needs you on this release. | Nothing needs you. 2 of 7 numbers are waiting for the 10-Q. *(or "All 7 numbers checked. Nothing needs you.")* |
| C5 | `state/app.tsx:109` | The Release check row already prints "Analyst · R1 GAAP EPS ·" before this message, so the analyst and the rule appear twice. | medium | Fixed by an analyst: $1.24 to $1.17 (rule R1). / Kept at Q3 2026 by an analyst (rule R4). | Changed from $1.24 to $1.17. / Kept at Q3 2026 despite the failed check. |
| C6 | `state/app.tsx:200` | The toast uses Mubit console words ("task", "toward v3") and doesn't say the fix was saved. | medium | Added to the Earnings numbers task · 13 of 84 new examples toward v3 · *NVDA Q2 FY2027 · Diluted EPS (GAAP) · R1* | Fix saved and sent to Mubit · *NVDA Q2 FY2027 · Diluted EPS (GAAP). Mubit has 13 of the 84 new examples it needs to train v3.* *("Value kept and sent to Mubit" for a kept value)* |
| C7 | `common/Panel.tsx:42` | Hedged and technical ("illustrative", "live pipeline"). It appears on every screen. | low | Sample data. Numbers are illustrative, not the companies' reported results, until the live pipeline is connected. | Sample data. These are not the companies' reported results. |
| C8 | `learning/LearningView.tsx:73` | Explains a control that sits in the top bar, then repeats it with a "Show after" link. | low | … after 142 corrections. The toggle in the top bar switches every release between the two. Show after | … after 142 corrections. Show after |
| C9 | `learning/LearningView.tsx:98` | One model has three names on this screen ("Frontier", "frontier model", "provider model"). "Copies it" is jargon. | low | Frontier is the provider model. v1 copies it before any corrections. v2 and v3 learn from corrections. | Frontier is the large model in use today. v1 is Mubit's small model before any corrections. Each later version learns from them. |
| C10 | `learning/LearningView.tsx:110` | Colon-then-reveal, and "catches the rest" is wrong: analysts handled 29. | medium | Most corrections need no person: arithmetic catches them in seconds and the SEC filing catches the rest. Analysts only handle judgement calls. | Arithmetic and SEC checks caught 202 of the 231 corrections. Analysts caught the other 29. *(numbers come from the data)* |
| C11 | `learning/MubitPanel.tsx:152` | Colon-then-reveal, and the key fact (no correction API) comes last. | low | Corrections reach Mubit as better provider answers: each fix is fed into later prompts as an example, and Mubit learns from the improved answers it records. Mubit has no correction API yet. | Mubit has no correction API yet. Each fix goes into later prompts as an example, and Mubit learns from the better answers that come back. |
| C12 | `shell/TopBar.tsx:69,72` | "partial rollout" is console jargon. The tooltip names a page that doesn't exist ("Mubit status"); the pill opens Learning. | low | Mubit · v2 · partial rollout 10% / *tooltip:* Open Mubit status | Mubit v2 · 10% of calls / *tooltip:* Open Learning |
| C13 | `overview/KpiRow.tsx:37` | On MSFT, one wrong revenue figure puts "Needs you" on three KPI cards. Gross margin and FCF margin don't need fixing; they use revenue. | medium | Needs you · Needs you · Needs you | Needs you · Uses revenue · Uses revenue |
| C14 | `overview/FundamentalsTable.tsx:44`, `overview/QuarterBarCard.tsx:73` | `label.toLowerCase()` would print "diluted eps (gaap)". `lib/format.ts` already has `inSentence`. | low | Uses diluted eps (gaap), which needs you | Uses diluted EPS, which needs you |
| C15 | `api/mock/data.ts:57,85,125,136` | The After banner describes the held-out test as "Compared in Try models, 20 held-out cases". Learning describes the same test as "20 held-out companies, 60 releases". It's console jargon, and the two descriptions don't match. | low | Compared in Try models, 20 held-out cases · Sample data | 20 held-out companies · Sample data |
| C16 | `api/mock/data.ts:159` | The accuracy chart shows v3 at 95.1%. The Mubit panel on the same screen says v3 still needs 14 of 84 examples before it trains. | **high** | Frontier, v1, v2, v3 bars | Frontier, v1, v2 bars |
| C17 | `api/mock/data.ts:168` | "All eight rules" when `RULES` has seven. | medium | All eight rules pasted into the prompt | All seven rules pasted into the prompt |

### Visual

| # | Where | Finding | Sev | Proposed fix |
|---|---|---|---|---|
| V1 | `overview/FundamentalsTable.tsx:59` | In After mode a sparkle icon sits on every learned value: 7 on MSFT. It's the stock "AI" icon and carries no meaning. The amber value and the struck old value already mark the change. The KPI row shows the same state without it. | medium | Remove the icon. |
| V2 | `learning/MubitPanel.tsx:20` | Rollout events in the timeline use the same sparkle icon. | low | Use `Route` (traffic being routed). |
| V3 | `overview/QuarterBarCard.tsx:86` | The legend has a grey swatch for "FCF conversion (on hover)", a series that is never drawn. | low | Keep the hint as text with no swatch: "Hover for FCF conversion". |
| V4 | `overview/QuarterBarCard.tsx:60` | At 1440 with the chat folded, the two ratio cards are about 220px wide and the x-axis labels run into each other ("Q3 FY26FY26…"). | medium | Put the fiscal year on a second line under the quarter. The axis already reserves 40px. |
| V5 | KPI labels, panel titles, group rows, top bar | Almost every label is uppercase. | low | — |
| V6 | Learning | "10%" appears six times on one screen and "partial rollout" four times. | low | — |
| V7 | `release/AttentionStrip.tsx:40` | Two filled amber "Fix" buttons when two numbers are flagged. | low | — |
| V8 | `App.tsx:21` | The toast at bottom left covers "Track a company" for about 4s. | low | — |

### UX

| # | Where | Finding | Sev | Proposed fix |
|---|---|---|---|---|
| U1 | `learning/LearningToggle.tsx:9` | On the Learning screen the top bar reads "Learning … LEARNING Before After". | low | — |
| U2 | `overview/KpiRow.tsx:36-37` | Revenue and net income carry two chips (change and "Awaiting SEC"); the others carry one. | low | — |
| U3 | `state/app.tsx:174` | "Something went wrong. Try again." is generic. | low | — |

---

## 2. Plan

1. Fix the three **high** items, because each one tells the reader something false: C3, C4, C16.
2. Then the medium copy and visual items that pass the pressure test.
3. Leave the excluded files alone and list their findings in section 5.

---

## 3. Pressure test

Three views: **Analyst** (a hedge-fund finance analyst using it), **Designer** (a senior product designer), **Mubit** (a Mubit cofounder judging the demo). An item is dropped if it is churn, if it removes something the analyst needs, or if it moves the Overview away from Amir Dehkordi's Fundamentals Tracker.

| # | Verdict | Reason |
|---|---|---|
| C1 | **keep** | Mubit: the first line a judge reads should name the loop (checks, fixes, Mubit), not a slogan. |
| C2 | **keep** | Designer: the paperclip and placeholder already say it. Analyst: "drop" suggests drag and drop, which fails. |
| C3 | **keep** | Analyst: "everything else passed" next to two "Awaiting SEC" chips is a false claim on the first screen. |
| C4 | **keep** | Analyst: "All 7 checked" directly above "Checked 5 of 7" is a contradiction. |
| C5 | **keep** | The row loses nothing: checker and rule are printed just before it, and "Fixed" is on the chip. |
| C6 | **change** | Mubit: keep the example count, because it shows the loop working. Move it into the description so the title confirms the save. |
| C7 | **keep** | The data stays clearly labelled. The shorter line is easier to read on every screen. |
| C8 | **keep** | The control sits 40px above. The link stays. |
| C9 | **keep** | Mubit: v1 isn't a copy of the frontier model, so "copies it" misdescribes the product. One name for one model. |
| C10 | **keep** | Analyst: the counts are on screen, so the caption should use them instead of "most". |
| C11 | **keep** | Mubit: lead with the limitation. Judges ask about it. |
| C12 | **change** | Keep the version and share; drop only "partial rollout". The stage is on Learning, one click away. |
| C13 | **keep** | Analyst: "Uses revenue" says why the margin is red and where to go. The value stays red and the card still opens the fix. |
| C14 | **keep** | Latent bug. Uses the shared helper. |
| C15 | **keep** | Mock content, but it's what the judges read in the After banner. It now matches Learning. The type shape is unchanged. |
| C16 | **keep** | Mubit: a judge will notice an accuracy for a model that hasn't trained. The shape is unchanged; one row goes. |
| C17 | **already fixed** | Another session changed it to "seven" before I got here (`data.ts` modified 19:18). No action. |
| V1 | **keep** | Designer: decoration. Analyst: amber plus the struck value carries the meaning, as on the KPI. The table returns to the tracker's plain look. |
| V2 | **keep** | One-icon swap that removes the last sparkle in my scope. |
| V3 | **keep** | A swatch implies a series on the chart. The hint stays visible as text. |
| V4 | **keep** | Overlapping labels look broken. Two lines keep the full label and fit the 40px axis that is already there. |
| V5 | **drop** | Uppercase KPI labels, panel titles and group rows are the tracker look. AUDIT I5 kept them. |
| V6 | **drop** | Mubit: each repeat belongs to a different part of their console (stage, gate, routing, timeline). Cutting any of them loses console fidelity. |
| V7 | **drop** | Analyst: the next step is "fix", and each row needs its own button. Outline buttons would weaken the one clear action. |
| V8 | **drop** | The toast is brief. Moving it would cover the chat or the fix panel instead. |
| U1 | **drop** | On release screens the label is needed; hiding it on one screen is churn. |
| U2 | **drop** | Analyst: "Awaiting SEC" is exactly what they need to know about revenue. |
| U3 | **drop** | It's the fallback for unknown errors. Known errors already have their own text (`client.ts`). |

---

## 4. Outcome

**Counts.** 28 findings in my scope (17 copy, 8 visual, 3 UX), plus 10 for the excluded files in section 5.

- **Fixed: 18.** C1–C5, C7–C11, C13–C16, V1–V4.
- **Changed: 2.** C6 and C12 were built in the reduced form the pressure test asked for.
- **Already fixed elsewhere: 1.** C17.
- **Dropped: 7.** V5–V8, U1–U3.

### What changed

| # | Result | Files |
|---|---|---|
| C1 | Start line: "Track earnings releases. Checks flag the AI's mistakes, and Mubit learns from your fixes." It was shortened once more after the first after-shot so it fits on one line. | `start/StartScreen.tsx` |
| C2 | The "or drop a press release with the clip" helper is gone. | `start/StartScreen.tsx` |
| C3, C4 | The strip counts waiting fields. NVDA reads "Everything else passed or is waiting for the 10-Q." With the fixes done it reads "Nothing needs you. 2 of 7 numbers are waiting for the 10-Q." MSFT, with nothing waiting, reads "Everything else passed." | `release/AttentionStrip.tsx` |
| C5 | Release check rows read "Analyst · R1 GAAP EPS · Changed from $1.24 to $1.17." and "Analyst · R4 Fiscal label · Kept at Q3 2026 despite the failed check." | `state/app.tsx` |
| C6 | Toast: "Fix saved and sent to Mubit" (or "Value kept and sent to Mubit"). Description: "NVDA Q2 FY2027 · Diluted EPS (GAAP). Mubit has 13 of the 84 new examples it needs to train v3." | `state/app.tsx` |
| C7 | "Sample data. These are not the companies' reported results." | `common/Panel.tsx` |
| C8–C10 | Learning captions as proposed. C10 computes 202 and 29 from `byCheck`. | `learning/LearningView.tsx` |
| C11, V2 | Alert copy as proposed. The rollout icon is `Route`. | `learning/MubitPanel.tsx` |
| C12 | Pill: "Mubit v2 · 10% of calls". Tooltip: "Open Learning". The unused `MUBIT_STAGES` import was removed. | `shell/TopBar.tsx` |
| C13 | MSFT KPIs: "Needs you" on Revenue, "Uses revenue" on Gross margin and FCF margin. Values stay red, and the cards still open the fix. | `overview/KpiRow.tsx` |
| C14 | "Uses … which needs you" uses `inSentence` from `lib/format.ts`. | `overview/FundamentalsTable.tsx`, `overview/QuarterBarCard.tsx` |
| C15 | After banner reads "20 held-out companies · Sample data". | `api/mock/data.ts` |
| C16 | The accuracy chart shows Frontier, v1 and v2. It no longer contradicts the Mubit panel. The `Learning` type is unchanged. | `api/mock/data.ts` |
| V1 | No sparkle icon on learned values in the Fundamentals table. They show the amber value with the struck old value above, as before. | `overview/FundamentalsTable.tsx` |
| V3 | The legend shows "Hover for FCF conversion" as plain text after the swatches. `ChartLegend` gains a `"none"` swatch. | `overview/QuarterBarCard.tsx`, `charts/chartTheme.tsx` |
| V4 | Bar-card axis labels are on two lines ("Q3" over "FY26", the year at 11px). They no longer collide at 1440 with the chat folded. | `overview/QuarterBarCard.tsx` |

### Verification

- `npx tsc -b` passes. `npm run build` passes; the chunk-size warning was already there.
- The grep for hex, `rgba(`, `style={{ background`, `<select`, `<textarea` and `<kbd` in `src/components` outside `ui/` is empty.
- Headless Chrome at 1440x900 walked: start, Track NVIDIA, fold the chat, fix the fiscal quarter and EPS, Release check, Track Microsoft from the chat, Overview, After, Release check in After, Learning. It logged no console errors or warnings in either run.
- The browser pane, after a fresh reload with `console.error`, `console.warn` and `window.onerror` hooked, ran Track NVIDIA, the EPS fix, After, Release check, Before and Learning with no errors. Earlier buffered "useApp must be used inside AppProvider" errors came from Vite hot-reloading `state/app.tsx` mid-edit. Their module stamps (`?t=…`) predate the reload, and they do not recur on a clean load.
- Screenshots: `ai-smell/before-01…13-*.png` and `ai-smell/after-01…13-*.png`, the same steps and the same names. The ones that show the changes most:
  - `04-nvda-overview`: strip line, sample notice, pill, bar-card axis and legend.
  - `08-release-check`: strip, de-duplicated analyst lines.
  - `07-eps-fixed-toast`: toast.
  - `10-msft-overview`: "Uses revenue" chips.
  - `11-msft-after-overview`: no sparkles.
  - `13-learning`: no v3 bar, new captions, alert, timeline icon.
  - `01-start`: start line.

### Notes

- `api/mock/data.ts` and `state/app.tsx` were also being edited by another session (both modified at 19:18). I re-read each line right before changing it and used exact-match edits, so nothing of theirs was overwritten.
- `lib/format.ts` was not edited; that session added `inSentence` there, and I reuse it.

---

## 5. Findings for the excluded files (not edited)

For the session redesigning these files.

| # | Where | Finding | Suggested fix |
|---|---|---|---|
| X1 | `release/ReleaseView.tsx:66-74` | The After banner says "Showing v2's answers after learning" and ends with "These answers are not all served live yet." That sentence is vague and repeats `liveNote`. "Served by" also appears again in the summary card (line 122). | "Showing Mubit v2's answers. v2 answers 10% of live calls today." Drop the second "Served by". |
| X2 | `release/ReleaseView.tsx:207` | The footnote shows a Mubit request ID (`mreq_0b7e5a1c…`) and the filed date, which is already in the top bar. | Keep the ID in the history row and the CSV only. |
| X3 | `release/ReleaseView.tsx:200,207` | Two click instructions under two panels: "Click a fixed field for its history." and "Click a field to see where it came from." | Keep one: "Click a row to see it in the release." |
| X4 | `release/ReleaseView.tsx:118` | "Checked 5 of 7 fields" while the strip and start screen say "numbers". | Use "numbers". |
| X5 | `release/ReleaseView.tsx:169` | Sparkle icon on the "Learned from…" line. V1 removed it from the table. | Drop the icon, keep amber text. |
| X6 | `release/ReleaseView.tsx:218` | Summary card labels are uppercase (CHECKED, NEEDS YOU, SPEED, COST). It's not part of Amir's dashboard. | Sentence case. |
| X7 | `review/ReviewCard.tsx:143` | "Tip: click a number in the release below to fill both." The "Tip:" prefix is filler. | "Or click a number in the release below." |
| X8 | `review/ReviewCard.tsx:167` | "In the release" here, "From the release" on the Release check panel: two names for one thing. | "From the release" in both. |
| X9 | `chat/Thread.tsx:72` | The loading row says "Working…" under a list of named steps. | Name the next step, for example "Checking the numbers…". |
| X10 | `chat/Thread.tsx:28-37` | Three pulsing dots while the assistant answers. | A one-line "Looking at the checks…" reads less like a chatbot. |

Already fixed by that session since my first read: the fix card title no longer lowercases acronyms (`inSentence`), and the chat suggestions now come from the release (old AUDIT B9).
