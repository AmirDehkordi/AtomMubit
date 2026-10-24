# UI audit: Atom Earnings Desk (v4)

Scope: every file in `src/components` outside `src/components/ui`, plus `src/index.css`, `src/lib` and `src/state/app.tsx`. Browser walk at 1440x900 on port 5180: Track NVIDIA, fix EPS, Track Microsoft from Compare, then Overview, Release check, Compare, Review, Learning and Before/After, with the chat open and folded.

Severity: **high** means a reader could take a wrong number or meaning away. **Medium** means a visible break or a broken interaction. **Low** means polish or code consistency.

Verdicts come from the pressure test in section 3. Only **keep** items were built. Section 4 records the outcome of each one.

Before screenshots are in `audit/before-*.jpg` and after screenshots in `audit/after-*.jpg`.

---

## 1. Findings and proposed fixes

### A. Not from shadcn

| # | Where | Finding | Sev | Proposed fix |
|---|---|---|---|---|
| S1 | `common/Panel.tsx:20` | The "i" tooltip trigger is a raw `<button>` with the custom `focus-ring`. | low | Use `Button variant="ghost" size="icon"`. |
| S2 | `overview/KpiRow.tsx:22` | The whole KPI card is a raw `<button>`. | low | shadcn has no clickable card. Keep it, but share the shadcn focus ring (I24). |
| S3 | `overview/FundamentalsTable.tsx:37` | The flagged cell is a raw `<button>` styled as a red link. | low | `Button variant="link"` with `h-auto p-0`. |
| S4 | `compare/CompareTab.tsx:174` | The flagged value in the Compare table is a raw `<button>`. | low | `Button variant="link"`, as in S3. |
| S5 | `shell/TopBar.tsx:58-62` | The Mubit status pill is a raw `<button>` with a native `title=` tooltip. | low | `Button variant="outline" size="sm"` plus a shadcn `Tooltip`. |
| S6 | `release/SourceExcerpt.tsx:35` | Candidate numbers in the release text use native `title=` tooltips. | low | Wrap each in a shadcn `Tooltip`. |
| S7 | `release/SourceExcerpt.tsx:51` | The SEC link is a hand-styled `<a>`. The same link in `LanguageChangesCard.tsx:49` uses `Button variant="link" asChild`. | low | Use `Button variant="link" asChild`. |
| S8 | `shell/TopBar.tsx:46` | The quarter and period chip is a `<span>` built to look like a badge. | low | Use `Badge`, keeping its look. |
| S9 | `shell/Sidebar.tsx:31` | The Review count uses `SidebarMenuBadge` with colours set by hand. | low | This is the right shadcn part. Only its shape is off (see I8). |
| S10 | `shell/Sidebar.tsx:60` | A raw `<button>` sits inside `SidebarMenuSubButton asChild`. | — | This is the shadcn pattern. Justified. |
| S11 | `chat/Composer.tsx:31` | A raw `<input type="file">`. | — | Hidden native picker that the paperclip opens. Justified. |
| S12 | `overview/InsiderCard.tsx:28`, `review/ReviewCard.tsx:200` | Nested boxes are `rounded-md border p-3` divs, while `MubitPanel` uses `Card`. | low | Use `Card`. |
| S13 | `review/ReviewCard.tsx:102` | The card header is a raw `<header>` with `border-b`, not `CardHeader`. | low | Use `CardHeader`. |
| S14 | `learning/MubitPanel.tsx:42-59, 136-149`; `chat/Thread.tsx:28-37`; `charts/chartTheme.tsx`; `CompareTab.tsx:168`; `Sidebar.tsx:62`; `ChatPanel.tsx:29`; `SourceExcerpt.tsx` | Custom pieces: stage stepper, timeline, typing dots, chart tooltip and legend, series swatches, status dots, unread dot, release-text segment marks. | — | shadcn has no stepper, timeline or chart internals. Justified. |
| S15 | all | Tabs, toggles, tables, selects, inputs, kbd, alerts, empty states and progress meters all use shadcn parts. There are no hand-rolled tabs, segmented controls, dialogs or `<table>` elements. | — | Nothing to do. |
| S16 | `src/components/ui` | Compared with the registry, only `badge.tsx` (success, warning, danger, soft, muted) and `alert.tsx` (danger, warning, primary) differ, and both are cva variants. The rest is stock. | — | Nothing to do. |

### B. Inconsistencies

**Colour and theme**

| # | Where | Finding | Sev | Proposed fix |
|---|---|---|---|---|
| I1 | `src/components` excluding `ui` | The grep for hex, `rgba(`, `style={{ background`, `<select`, `<textarea` and `<kbd` comes back empty. | — | Nothing to do. |
| I2 | `learning/LearningView.tsx:73-81` | The accuracy chart writes its own axis, grid and cursor props with raw `var(--…)` strings and uses `ChartTooltipContent`. Every other chart uses `chartTheme` (`C`, `gridProps`, `axisBase`, `chartClass`, `TooltipShell`). | low | Move it onto `chartTheme`. |
| I3 | `release/ReleaseView.tsx:46` | The active tab is meant to be amber (`data-[state=active]:bg-primary-soft text-primary`), but `<html class="dark">` lets stock `dark:data-[state=active]:bg-input/30` win. It renders grey, while every other selected state is amber (sidebar release, 2Y range, After). | medium | Give the override the `dark:` prefix. |
| I26 | `shell/Sidebar.tsx:79`, `shell/ChatPanel.tsx:47`, `start/StartScreen.tsx:32` | On outline buttons, `hover:border-primary` loses to stock `dark:border-input`. The hover border stays grey, while the Mubit pill's border turns amber. | low | Use `dark:hover:border-primary`. |

**Type scale**

| # | Where | Finding | Sev | Proposed fix |
|---|---|---|---|---|
| I4 | `FundamentalsTable.tsx:105,113`, `Sidebar.tsx:50`, `LanguageChangesCard.tsx:23`, `ReleaseView.tsx:48 (10px), 236` | Arbitrary `text-[11px]` and `text-[10px]` sit beside the named `text-13` step. | low | Add a `--text-11` step to `index.css` and use `text-11`. |
| I5 | Fundamentals and Compare tables vs Release check, Learning and Mubit tables | Two table header styles: sentence case at 13px vs uppercase `text-xs`. | low | Pick one. |
| I6 | `overview/InsiderCard.tsx:29` | The in-panel sub-heading is `text-subtle-foreground`. Every other one is `text-muted-foreground` (`CompareTab:49`, `ReviewCard:77`, `MubitPanel:93,113,135`). | low | Use muted. |

**Panels and badges**

| # | Where | Finding | Sev | Proposed fix |
|---|---|---|---|---|
| I7 | all `Panel`s | Panel padding and gap are the same everywhere (`gap-3 py-4 px-4`). | — | Nothing to do. |
| I8 | `StatusChip:22`, `DeltaChip:13`, `LanguageChangesCard:23`, `ReleaseView:162`, `MubitPanel:29,104,176`, `Thread:91,95,111` vs `ReleaseView:48`, `Sidebar:31` | Every badge overrides shadcn's `rounded-full` with `rounded-md`. The two count badges differ: the tab count is `rounded-full` and the sidebar count is `rounded`. | low | Make `rounded-md` the Badge default in `badge.tsx` and drop the 11 overrides. Make both count badges `rounded-full`. |
| I23 | `learning/MubitPanel.tsx:29` | The neutral stage chip uses Badge `secondary`. Every other neutral chip uses `muted`. | low | Use `muted`. |

**Numbers, dates and words**

| # | Where | Finding | Sev | Proposed fix |
|---|---|---|---|---|
| I9 | `lib/format.ts:3` vs `lib/fundamentals.ts:116` | There are two USD-millions formatters. `fmtUsdM` gives 2 decimals below $100B ($52.94B); `fmtMetric` always gives 1 ($52.9B). | low | Merge them into one rule. |
| I10 | `lib/format.ts:19` vs `lib/fundamentals.ts:125` | A zero change reads "+0.0%" on Release check and "0.0%" on Overview. | low | Use one formatter (comes with I21). |
| I11 | `state/app.tsx:106` | The fixed-field note says "Corrected by an analyst from 1.24 to 1.17": unformatted numbers, and "Corrected" where the chip says "Fixed". | low | "Fixed by an analyst: $1.24 to $1.17 (rule R1)." |
| I12 | `learning/LearningView.tsx:61-62` | "11× cheaper" and "5.7× faster" use ×, while P/E and ratios use x ("51.7x", "0.9x"). | low | Use x. |
| I13 | `CompareTab.tsx:183`, `FundamentalsTable.tsx:105` vs `TopBar.tsx:47` | Quarter end reads "Q4 FY2026 · 30 Jun 2026" in the Compare table, "e. 26 Oct 2025" in Fundamentals, and "ended …" in the top bar and Compare tooltip. | low | Add "ended" to the Compare table. Spell out "e." |
| I14 | `QuarterBarCard.tsx:47`, `CompareTab.tsx:125` | `QuarterBarCard` reimplements `shortQuarter`. Compare uses long "Q4 FY2026" labels where Overview uses "Q4 FY26". | low | Use `shortQuarter`. |
| I15 | `CompareTab.tsx:159` | The header says "YoY change" where Fundamentals says "YoY". | low | "YoY". |
| I18 | `LanguageChangesCard.tsx:51` vs `SourceExcerpt.tsx:52` | Two wordings for the same link: "Read the Q2 FY2027 8-K on SEC.gov" and "Open the 8-K on SEC.gov". | low | "Open the Q2 FY2027 8-K on SEC.gov" in both. |
| I19 | `CompareTab.tsx:128` | A YoY bar label says "n.m.", which is jargon. Everywhere else shows "—". | low | "—". |
| I20 | `ReleaseView.tsx:184` | In After mode the footnote still says "Click a fixed field for its history", but history only opens in Before. | low | Show that sentence in Before only. |

**Status colour, focus, hover and loading**

| # | Where | Finding | Sev | Proposed fix |
|---|---|---|---|---|
| I21 | `ReleaseView.tsx:129,162` | The Release check "vs Q1" chips colour by sign, not by whether the change is good. NVDA diluted shares −0.1% shows **red**, while the Overview counts fewer shares as good. The chip also has no arrow, unlike `DeltaChip`. | **high** | Use `DeltaChip` with the metric's polarity. |
| I22 | many | Amber means selected, learned, fixed by an analyst and gate in progress. | low | Split the meanings. |
| I24 | `index.css:123` vs shadcn controls | Two focus rings. The custom `focus-ring` utility (solid 2px with an offset, on S1-S7 and the KPI cards) differs from shadcn's `ring-[3px] ring-ring/50`. | low | Redefine `focus-ring` to match shadcn. |
| I25 | `FundamentalsTable.tsx:15` | On hover the sticky Metric cell goes `bg-muted` while the rest of the row goes `bg-muted/50`, so the first cell looks lit on its own. | low | Make the whole row hover `bg-muted`. |
| I27 | icons | Icon sizes are consistent per role (`size-3` inline, `size-3.5` in buttons, `size-4` in alerts). | — | Nothing to do. |
| I28 | `LearningView.tsx:24` | Learning refetches on every visit, so the skeleton flashes each time. Overviews are cached. | low | Cache it for the session, like overviews. |
| I29 | `ReleaseView.tsx:32` | The "Pick a release" empty state is plain text, not `Empty`. | low | Use `Empty`. |

**Behaviour**

| # | Where | Finding | Sev | Proposed fix |
|---|---|---|---|---|
| B1 | `ReleaseView.tsx:158`, `ReviewCard.tsx:121` | Flagged values are **not red** in the Release check table's Value column (281,700, $1.24, Q3 2026) or in the fix card's "AI said". They are red on the attention strip, KPI, Fundamentals and Compare. | **high** | Make them `text-destructive` when flagged. |
| B2 | `CompareTab.tsx:82` | On the Compare "Change on a year earlier" chart a flagged company draws nothing. Recharts skips the label on a zero-height bar, so MSFT reads as no change. | medium | Add a red "Needs you" label at zero. |
| B3 | `state/app.tsx:70` | "Track Microsoft" from Compare's empty state lands on MSFT's Overview, not on Compare. | medium | Stay on Compare when tracking starts there. |
| B4 | `ReviewCard.tsx:61` | Shortcuts leak through links. Enter on "Open the 8-K on SEC.gov" inside the fix card switches to "Keep AI value" and blocks the link, and a digit picks a candidate. | medium | Ignore keys whose target is a link. |
| B5 | `ReviewCard.tsx:39` | With the chat open, Release check stacks and the fix card opens at the bottom edge. Focus uses `preventScroll`, so the card's actions are off-screen. | low | Scroll the panel card into view (`block: "nearest"`). |
| B6 | `FundamentalsTable.tsx:49-61` | In After mode the learned table cell shows the old value only in a tooltip. The KPI and Release check strike it through inline. | low | Show the struck value inline. |
| B7 | `ReleaseView.tsx:258,261` | In After mode the CSV leaves "Original AI value" empty for values learning changed (fiscal quarter), though it fills it for analyst fixes. | low | Use `beforeValue` when there is no fix. |
| B8 | — | Fixes propagate everywhere: KPI, table, Trailing P/E, Compare, sidebar dot, Review count, attention strip. | — | Nothing to do. |
| B9 | `ChatPanel.tsx:11` | The chat suggestions are fixed, so "Why was EPS flagged?" also shows on MSFT. | low | Derive them from the release. |
| B10 | 1024 px, chat open | The top bar clips ("NV…", "After" cut off) and the attention strip rows truncate to a few words. | medium | Out of the 1440 brief. See section 5. |

Console: no errors or warnings across the whole walk, chat open or folded.

---

## 2. Plan

Fix the two **high** items first (B1, I21). Then the **medium** breaks (I3, B2, B3, B4). Then the low consistency items that pass the pressure test. Contract shapes (`src/api/types.ts`, `API.md`) and `src/api/client.ts` stay untouched.

---

## 3. Pressure test

Each fix was tested from three views. **Designer**: does it move away from Amir Dehkordi's Fundamentals Tracker look? **Analyst**: does a finance user gain anything, or is it churn? **Purist**: does shadcn really have a part for it?

| # | Verdict | Reason |
|---|---|---|
| B1 | **keep** | Analyst: Release check is the screen for flagged numbers, and it is the one place they are white. Red is already the rule everywhere else. |
| I21 | **keep** | Analyst: showing fewer shares as bad is a wrong signal. Designer: `DeltaChip` is the tracker's arrow chip, so this moves closer to Amir's look. |
| I3 | **keep** | Designer: amber is the selected state everywhere else, and the code already asks for it. Only the prefix is missing. The tab bar is this product's own, not part of Amir's dashboard. |
| B2 | **keep** | Analyst: a missing bar reads as a 0% change. One red label fixes it, styled like the other bar labels. |
| B3 | **keep** | Designer: the button sits in Compare, so the person wants to compare. Landing elsewhere breaks the flow. |
| B4 | **keep** | Keyboard users lose the link, and a stray Enter starts a correction. One selector fixes it. |
| B5 | **keep** | With the chat open, the card's actions are hidden at the bottom. Scrolling to `nearest` changes nothing when the card is already in view. |
| B6 | **keep** | The KPI and Release check already strike through the old value, so the table should match. The latest column has room for one short struck value. |
| B7 | **keep** | Analyst: an export should carry what learning changed. One-line change. |
| I26 | **keep** | Same cause as I3, and the hover state was meant to be amber. |
| I24 | **keep** | One style rule in `index.css` gives every custom control shadcn's ring. Keyboard users see one ring style. |
| I8 | **keep** | Purist: a className default in our own copy is allowed. It removes 11 repeated overrides and stops new badges coming out round by mistake. There is no visual change apart from the two count badges matching. |
| I4 | **keep** | Same look; the size becomes a named step like `text-13`. The tab count moves from 10px to 11px to share the step. |
| I2 | **keep** | Same look; the chart now follows the theme, and its tooltip matches the other charts. |
| I11 | **keep** | Plain wording that matches the "Fixed" chip, with formatted numbers. |
| I15, I19, I12, I13 (Compare part), I18, I20 | **keep** | Copy only. Each brings wording in line with the rest of the app. |
| I6, I23, I14 | **keep** | One-class or one-line alignments with no layout effect. |
| S3, S4 | **keep** | Purist: `Button variant="link"` is the shadcn part for a clickable value. The look stays the same, with the shadcn focus ring. |
| S5 | **keep** | Purist: a native `title=` should be a shadcn `Tooltip`, and the pill is a Button. It matches the other outline pills. |
| S6 | **keep** | Same reason as S5. The tooltip appears on keyboard focus too, which `title=` does not. |
| S7 | **keep** | The sister link already uses `Button variant="link" asChild`. Same look. |
| S8 | **keep** | Purist: it is a badge. `Badge` with the same classes, no visual change. |
| I25 | **keep** | The first cell no longer lights up on its own. A whole-row hover matches the KPI card hover (`bg-muted`). |
| I28 | **keep** | Overviews are cached the same way; it stops the skeleton flash. |
| S1 | **change** | Use the shared focus ring (I24) instead. `Button` at 14px would need every size and hover style overridden for no gain. |
| S2 | **change** | No shadcn clickable card exists. Keep the raw button and give it the shared ring (I24). |
| S12 | **drop** | `Card` brings `rounded-xl`, a shadow and `py-6`. The insider windows are part of Amir's card, and the forecast box sits inside a card. |
| S13 | **drop** | `CardHeader` is a grid with title and action slots that fights the one-row header. A `border-b` between card regions is the normal shadcn look. |
| I5 | **drop** | The Fundamentals and Compare tables copy the tracker's sentence-case headers. Changing either drifts from Amir or restyles three product tables for no user gain. |
| I9 | **drop** | Analyst: the fix card needs the release's own precision ($76.42B) to check against the text. The tracker views use one decimal. The two precisions serve different jobs. |
| I10 | **drop as separate item** | Comes with I21, since `DeltaChip` uses `fmtChange`. |
| I13 ("e." part) | **drop** | Spelling "ended" into three Fundamentals headers widens a table that already scrolls with the chat open, and this header row is part of the tracker look. |
| I14 (Compare long labels) | **drop** | Compare sets two fiscal calendars side by side, and the full year avoids "FY26" ambiguity. |
| I22 | **drop** | The theme has one accent by design. All the amber meanings are versions of "changed by a person or by learning". Splitting them would add a second accent. |
| I29 | **drop** | Not reachable: the workspace always has a release selected. |
| B9 | **drop** | Content, not consistency. The questions are answered by `api.ask`, which the backend owns. |
| B10 | **drop (for now)** | Outside the 1440 brief and needs a layout decision. See section 5. |

---

## 4. Outcome

**Counts.** 45 real findings: 11 not-shadcn, 25 inconsistencies, 9 behaviour. Rows marked "—" were checked and found fine, so they are not counted. One more (I30) turned up while fixing.

- **Fixed: 35.** 33 kept items, plus I10 (comes with I21) and S9 (comes with I8).
- **Changed: 2.** S1 and S2 now get shadcn's ring through I24.
- **Dropped: 8.** S12, S13, I5, I9, I22, I29, B9, B10.

### Fixed

| # | What changed | Files |
|---|---|---|
| B1 | Flagged values are red in the Release check Value column and in the fix card's "AI said". | `ReleaseView.tsx`, `ReviewCard.tsx` |
| I21, I10 | The Release check "vs Q1" column uses `DeltaChip`: arrow, `fmtChange` formatting, and the Overview's polarity, so fewer diluted shares now shows green. `fmtDelta` was removed as unused. | `ReleaseView.tsx`, `lib/format.ts` |
| I3 | The active tab is amber (`dark:data-[state=active]:bg-primary-soft text-primary`). | `ReleaseView.tsx` |
| I26 | Outline buttons get the amber hover border (`dark:hover:border-primary`). | `Sidebar.tsx`, `ChatPanel.tsx`, `StartScreen.tsx` |
| B2 | The Compare YoY chart shows a red "Needs you" at zero for a flagged company. | `CompareTab.tsx` |
| B3 | Tracking a company while on Compare stays on Compare. | `state/app.tsx` |
| B4 | Fix-card shortcuts ignore keys from links, so Enter opens the SEC link again and digits do nothing there. | `ReviewCard.tsx` |
| B5 | The panel fix card scrolls into view (`nearest`) when it opens. | `ReviewCard.tsx` |
| B6 | In After mode the Fundamentals cell shows the old value struck through, stacked above the new one. Stacking keeps the column width; an inline version overflowed the table by 13px. | `FundamentalsTable.tsx` |
| B7 | In After mode the CSV fills "Original AI value" for values learning changed (fiscal quarter: Q3 2026). | `ReleaseView.tsx` |
| I24 | `focus-ring` now uses shadcn's ring (`ring-[3px] ring-ring/50`), so custom controls match shadcn ones. | `index.css` |
| I8, S9 | `rounded-md` is the Badge default; 11 overrides removed. Both count badges are `rounded-full`. | `ui/badge.tsx`, `StatusChip.tsx`, `DeltaChip.tsx`, `LanguageChangesCard.tsx`, `MubitPanel.tsx`, `Thread.tsx`, `Sidebar.tsx` |
| I4 | New `--text-11` step. All `text-[11px]` and `text-[10px]` now use `text-11`. | `index.css`, `FundamentalsTable.tsx`, `Sidebar.tsx`, `LanguageChangesCard.tsx`, `ReleaseView.tsx` |
| I2 | The Learning chart uses `chartTheme` (grid, axes, `chartClass`, `TooltipShell`). | `LearningView.tsx` |
| I28 | Learning data is cached for the session, so revisits show no skeleton. | `LearningView.tsx` |
| I11 | The fix note reads "Fixed by an analyst: $1.24 to $1.17 (rule R1)." A kept value reads "Kept at … by an analyst." | `state/app.tsx` |
| I12 | "11x cheaper", "5.7x faster". | `LearningView.tsx` |
| I13 | The Compare quarter column reads "Q4 FY2026 · ended 30 Jun 2026". | `CompareTab.tsx` |
| I14 | `QuarterBarCard` uses `shortQuarter`. | `QuarterBarCard.tsx` |
| I15, I19 | The Compare header reads "YoY", and "n.m." is now "—". | `CompareTab.tsx` |
| I18 | Both SEC links read "Open the {quarter} 8-K on SEC.gov". | `LanguageChangesCard.tsx`, `SourceExcerpt.tsx` |
| I20 | The "Click a fixed field for its history" hint shows in Before mode only. | `ReleaseView.tsx` |
| I6, I23 | The insider window label is muted, and the neutral stage chip uses `muted`. | `InsiderCard.tsx`, `MubitPanel.tsx` |
| I25 | Fundamentals rows hover as one (`bg-muted`). | `FundamentalsTable.tsx` |
| S3, S4 | Flagged values in the Fundamentals and Compare tables are `Button variant="link"`. | `FundamentalsTable.tsx`, `CompareTab.tsx` |
| S5 | The Mubit status pill is an outline `Button` with a shadcn `Tooltip`; the native `title=` is gone. | `TopBar.tsx` |
| S6 | Candidate numbers use a shadcn `Tooltip`; the native `title=` is gone. | `SourceExcerpt.tsx` |
| S7 | The SEC link in the source panel is `Button variant="link" asChild`. | `SourceExcerpt.tsx` |
| S8 | The quarter and period chip is a `Badge`. It keeps the same 24px height, colours and radius. | `TopBar.tsx` |
| I30 (new) | `Button size="sm"` links with an icon picked up `has-[>svg]:px-2.5`, which beat `px-0` and indented "Open the 8-K" by 10px. Fixed with `has-[>svg]:px-0`. | `LanguageChangesCard.tsx`, `SourceExcerpt.tsx` |

### Verification

- `npx tsc -b` passes. `npm run build` passes; the chunk-size warning (1.09 MB) was there before.
- The grep for hex, `rgba(`, `style={{ background`, `<select`, `<textarea` and `<kbd` in `src/components` outside `ui/` is empty.
- Browser walk at 1440x900, chat open and folded, after a fresh reload:
  - With `console.error`, `console.warn` and `window.onerror` hooked, the run from Track NVIDIA through fix, After, Learning and Review logged nothing. The only buffered error, a hook-deps size warning, came from hot-reloading `ReviewCard` mid-edit and does not recur on a clean load.
  - Clicking the red EPS cell on Overview opens the fix card on Release check with the card focused. Pressing 1 fixes it.
  - The Overview KPI then shows $1.17 with "Fixed". Trailing P/E goes from 50.8x to 51.7x and turns from red to white.
  - MSFT's flagged revenue is red in the KPI, the Fundamentals cells (Revenue, Gross profit, Gross, Operating, Net and FCF margin, Capex intensity) and the latest bar in both ratio charts. Checked via computed colour `#e5736b` and bar fill `var(--destructive)`.
  - After mode shows learned values in amber with the old value struck through, on the KPI, the Fundamentals cell and Release check. The table has no horizontal overflow.
  - CSV export builds `NVDA-Q2-FY2027-after.csv` with the expected rows. The download was captured in the page rather than saved to disk.
  - Track Microsoft from Compare stays on Compare, and the YoY chart shows the red "Needs you".
  - Enter and 1 on the SEC link inside the fix card no longer act on the card.
- Screenshots are in `audit/`. Before: `before-*.jpg`. After: `after-*.jpg` / `.png`. The browser pane captures 1440x900 scaled to 800x500.

### Dropped (and why)

- **S12, S13**: `Card` and `CardHeader` would change radius, shadow and padding on Amir's insider card and on the fix card header. No user gain.
- **I5**: The two table header styles stay. Fundamentals and Compare follow the tracker; the product tables keep uppercase.
- **I9**: Two money precisions stay on purpose. The fix card needs the release's own precision to check against the text.
- **I22**: One accent colour by design.
- **I29**: The empty state is not reachable.
- **B9**: The chat suggestions are content owned by the backend `ask`.
- **B10**: See below.
- **Partial drops**: "e." in the Fundamentals header (width, tracker look) and long fiscal labels in Compare (clarity across fiscal calendars).

## 5. Left for later

1. **Narrow width with the chat open (B10, medium).** At 1024px wide with the chat open, the main column is about 390px. The top bar clips ("NV…", "After" cut off) and the attention strip rows truncate their messages to a few words. A fix needs a layout decision: wrap the strip's rows, or hide the period chip and P/E below a container size.
2. **Copy for fixed chat suggestions (B9).** They could come from the release's flagged fields.
3. **Bundle size.** One 1.09 MB chunk. Code-splitting Recharts or Learning would clear the warning; this is not a UI consistency item.
