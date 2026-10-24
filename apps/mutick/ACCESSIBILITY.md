# Accessibility: WCAG 2.2 AA pass

Atom Earnings Desk, 24 Oct 2026. This file records the audit, the plan, the pressure test and the outcome. It sits beside `AUDIT.md` (shadcn and consistency) and `AI-SMELL.md` (copy). Nothing here undoes their fixes.

## 1. How it was tested

- **Browsers.** Headless Chrome over CDP, at 1440x900 and 1024x768, with the chat open and folded. Reflow was checked at 720x450 (200% zoom of 1440) and 320x700 (400% zoom of 1280). Text spacing was checked with the WCAG 1.4.12 override (line height 1.5, letter spacing 0.12em, word spacing 0.16em, paragraph spacing 2em).
- **Automated.** axe-core 4.10.2 was injected into the page, with the tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa` and `best-practice`. It ran on 11 screens: start, tracking, workspace, company menu, Mubit popover, fix panel, fix panel in typing mode, Release check, After mode on both tabs, and chat folded.
- **Keyboard.** A scripted Tab walk recorded every focus stop, its size and whether it showed a ring. The fix panel was driven by keys only: open, shortcuts, Esc, typing mode, then a saved fix.
- **Contrast.** Every token pair used in `src/index.css` was computed, with alpha tints flattened onto the surface they sit on.
- **Code.** `src/components` (including `ui/`), `src/index.css`, `src/lib` and `src/state/app.tsx`.

Severity: **blocker** stops a keyboard or screen-reader user from finishing the flow. **Serious** fails a WCAG AA criterion in a way users will hit. **Moderate** fails AA or a best practice with a workaround. **Minor** is polish or advisory.

## 2. Contrast, before

Text needs 4.5:1, large text 3:1, and UI parts and focus rings 3:1.

| Pair | Ratio | Result |
|---|---|---|
| `--foreground` on `--background` / `--card` | 16.60 / 15.61 | Pass |
| `--muted-foreground` on `--card` / `--muted` / `--primary-soft` | 8.11 / 7.42 / 6.97 | Pass |
| `--subtle-foreground` (#868d96) on `--background` / `--card` | 5.80 / 5.46 | Pass |
| `--subtle-foreground` on `--muted` and `--popover` | 4.99 | Pass |
| `--subtle-foreground` on `--primary-soft` | 4.69 | Pass |
| `--subtle-foreground` on the red box (`destructive/5` over card) | 5.14 | Pass |
| `--primary` on `--card` / `--primary-soft` | 8.48 / 7.29 | Pass |
| `--primary` on the soft badge (`primary/15` over card) | 6.48 | Pass |
| `--primary-foreground` on `--primary` | 9.01 | Pass |
| `text-primary-foreground/80` on amber buttons | 6.35 | Pass |
| `--destructive` on `--card` | 6.09 | Pass |
| `--destructive` on the danger badge, over card | 4.97 | Pass |
| `--destructive` on the danger badge, over popover ("Below target") | **4.49** | **Fail** |
| `--success` on the success badge (`success/15` over card) | 6.58 | Pass |
| Tooltip (`--background` on `--foreground`) | 16.60 | Pass |
| Focus ring `ring/50` on `--background` / `--card` | 3.03 / 3.03 | Borderline |
| Focus ring `ring/50` on `--muted` (tab list, toggle track) | **2.94** | **Fail** |
| Input border `--input` on `--card` / `--background` | **1.34 / 1.42** | **Fail** |
| Selected tab or toggle fill vs its track | **1.06 to 1.16** | **Fail** (state shown by text colour only) |
| Flagged chart bar (`--destructive`) vs amber bar | **1.39** | **Fail** (hue only) |
| Chart bars, ticks and MA line on `--card` | 8.48 / 5.46 / 8.11 | Pass |
| Status dots in the company menu, on `--popover` | 5.57 / 7.87 / 4.99 | Pass for contrast; colour only |
| Earnings markers on the price chart (`--border` dashed line) | 1.34 | Fail, see F12 |

Text contrast was already in good shape. The failures are non-text: focus, input edges, selected states, and red-versus-amber.

## 3. Findings

axe before the fixes, summed over the 11 screens: **critical** `aria-required-children` (7 screens). **Serious**: `target-size` (8), `aria-dialog-name` (1), `color-contrast` (1) and `aria-hidden-focus` (1). **Moderate**: `page-has-heading-one`, `region`, `landmark-banner-is-top-level`, `landmark-contentinfo-is-top-level` and `landmark-one-main`.

### Colour and contrast

| ID | WCAG | Where | Severity | Issue | Fix |
|---|---|---|---|---|---|
| F1 | 1.4.3 | `index.css` `--destructive`; Mubit popover | Serious | The "Below target" danger badge on the popover surface is 4.49:1. | Lighten `--destructive` from #e5736b to #e67870 (same hue). |
| F2 | 1.4.11, 2.4.7 | `index.css` `--ring` | Moderate | The `ring/50` focus ring is 2.94:1 on muted surfaces and only 3.03:1 elsewhere. | Lighten `--ring` from #e0a64e to #e8be7d (same hue). |
| F3 | 1.4.11 | `ui/input.tsx`, `ui/input-group.tsx` | Moderate | The edges of the fix-panel inputs and the chat box are 1.34:1. | Set the border class default to `border-subtle-foreground/70`, giving 3.3:1. Inputs only. |
| F4 | 1.4.11, 1.4.1 | `LearningToggle.tsx:16-21`, `ReleaseView.tsx:50`, `PriceChartPanel.tsx:63` | Moderate | Before/After, the Overview and Release check tabs, and 6M/1Y/2Y show the selected item by a fill of 1.06:1 and a text colour. | Add an inset hairline on the selected item in its own text colour (`foreground/50` or `primary/60`), giving 3.1 to 4.1:1. |
| F5 | 1.4.1, 1.4.11 | `QuarterBarCard.tsx:76-78` | Serious | A bar built from a flagged number differs from the amber bars by hue only (1.39:1). | Put a warning triangle above the flagged bar and in its legend entry. The table alternative (F30) says "needs you". |
| F6 | 1.4.1, 2.1.1 | `TopBar.tsx:21-36` | Serious | Trailing P/E turns red when EPS needs you. The reason is only in a hover tooltip on a span that can't take focus. | Add a warning icon when flagged, and make the trigger focusable so the tooltip opens on focus. |
| F7 | 1.4.1 | `DeltaChip.tsx`, `FundamentalsTable.tsx:94` | Moderate | Arrows and signs give the direction, but good or bad is green or red only. | Add screen-reader text ("better" or "worse"). A visual cue needs a design decision (section 6). |
| F8 | 1.4.1, 4.1.2 | `CompanySwitcher.tsx:44` | Serious | The menu's status dots are colour only, and their `aria-label` on a plain span is not exposed. | Use the status-chip icons (triangle, clock, tick) in the same colours, with screen-reader text. |
| F9 | 4.1.2 | `CompanySwitcher.tsx:27,31` | Moderate | "Another company needs you" is on a span inside a button whose `aria-label` overrides it, so it is never read. | Put it in the trigger's `aria-label`. |
| F10 | 1.4.1 | Attention box, KPI cards, both tables | — | Red numbers are always paired with a triangle, a "Needs you" chip or the red box's heading. | Pass. No change. |
| F11 | 1.4.11 | `PriceChartPanel.tsx:94` | Minor | Volume bars sit at 18% opacity. | See section 4. |
| F12 | 1.4.11 | `PriceChartPanel.tsx:99` | Minor | The earnings markers are dashed lines at 1.34:1. | See section 4. |

### Typography and reflow

| ID | WCAG | Where | Severity | Issue | Fix |
|---|---|---|---|---|---|
| F13 | 1.4.4 (practice) | `PriceChartPanel.tsx:99,102`, `QuarterBarCard.tsx:34` | Minor | The release markers are 10px and the last price and fiscal-year ticks are 11px. | Raise all three to 12px. |
| F14 | 1.4.4 (practice) | `FundamentalsTable.tsx:108,116`, `ReleaseView.tsx:52,223` | Minor | `text-11` (11px) is used for real content: column sub-labels, the tab count and the request ID. | Use `text-xs` (12px). |
| F15 | 1.4.8 (advisory) | Panel titles, KPI labels, table headers | Minor | Labels are all caps with tracking at 12px. | See section 4. |
| F16 | 1.4.10 | `TopBar.tsx:63` | Serious | At 320px the top bar clips the Before/After switch and the quarter chip off screen, with no scroll. | Let the top bar wrap to a second row. |
| F17 | 1.4.10, 1.4.4, 2.1.1 | `ChatPanel.tsx`, `ui/sidebar.tsx` mobile path | **Blocker** | Below 768px (1440 at 200% zoom) the assistant becomes a mobile sheet with no trigger. Chat and "Track another company" are unreachable. | Add an Assistant button to the top bar below `md`, and keep the chat state and the mobile sheet in sync. |
| F18 | 1.4.10, 1.4.4 | `TopBar.tsx:25,47`, `MubitPopover.tsx:31` | Serious | Below a 56rem column (1024 with chat open, or about 150% zoom) the Mubit popover, Trailing P/E and the After result are `display:none`. Function is lost. | Show them and wrap instead of hiding. Only the wordmark text stays hidden; the sr-only `h1` covers it. |
| F19 | 1.4.10 | `ReleaseView.tsx:70` | Serious | The fix panel is fixed at 420px, so it is cut off on a 320px viewport. | Full width below 420px. |
| F20 | 1.4.10 | `AttentionStrip.tsx:29-32` | Moderate | At 320px the red box's title is cut to "2 numbe…" (`line-clamp-1` in `AlertTitle`). | Let the heading row wrap and drop the clamp. |
| F21 | 1.4.12 | Top bar | Moderate | With the text-spacing override, the top bar clips the Mubit button. | Fixed by F16. |
| F22 | 1.4.10 | `AttentionStrip.tsx:42` | Minor | Check messages are truncated to one or two lines. | See section 4. |

### Keyboard

| ID | WCAG | Where | Severity | Issue | Fix |
|---|---|---|---|---|---|
| F23 | 2.4.1 | `AppShell.tsx` | Moderate | There is no skip link past the top bar. | Add "Skip to the release" as the first stop, visible on focus. |
| F24 | 2.4.3 | `App.tsx` and the start-to-workspace switch | Serious | Tracking from the start screen drops focus to `<body>` when the workspace replaces it. | Focus the workspace `h1` (`tabIndex=-1`) on arrival. |
| F25 | 2.4.3 | `ReleaseView.tsx:66-78` | **Blocker** | Esc and saving a fix close the panel but leave focus on `<body>`. It does not return to the Fix button. | Remember the opener. On close, return to it, or to the next Fix button or the red box when it is gone. Don't steal focus after an outside click. |
| F26 | 2.1.1 | `ReviewCard.tsx:63` | Moderate | Shortcuts 1–9 and E are ignored whenever focus is on any button in the panel, so they stop working after one Tab. | Block only text fields; on buttons and links block just Enter and Space. In inputs nothing fires (already correct). |
| F27 | 2.4.3 | `ReleaseView.tsx`, `AttentionStrip.tsx` | Moderate | The panel is portalled to the end of the page. Once focus leaves it, pressing "Fixing" does nothing. | Pressing Fix or Fixing for the open number moves focus back into the panel. |
| F28 | 2.1.1 | `ReleaseView.tsx:129-141` | **Blocker** | Release check rows are `<tr onClick>` only. Show source, open the fix and the fix history are mouse-only. | Make the field name a button in each row, with `aria-expanded` when it toggles history. The row click stays for the mouse. |
| F29 | 2.1.1, 1.4.13 | `TopBar.tsx:25,47`, `FundamentalsTable.tsx:23,57,70`, `StatusChip.tsx` | Serious | Tooltip-only information sits on spans that can't take focus: P/E, the After result, the table's dashes, "Before learning", "Fixed by an analyst" and the long status labels. | Make the P/E and After result focusable. Give table cells and chips screen-reader text instead, with no extra Tab stops in a 12-row table. |
| F30 | 2.4.7 | `ReleaseView.tsx:61-62` (TabsContent) | Serious | The tab panel is a Tab stop (Radix, `tabIndex=0`) with `outline-none` and no ring. | Add a focus ring. |
| F31 | 2.4.7, 4.1.2 | `PriceChartPanel.tsx:70`, `QuarterBarCard.tsx:70` | Serious | The three charts are Tab stops (Recharts accessibility layer, `role=application`) with no ring and no useful name. | Add a ring on the chart surface, plus a `title` and a `desc` that name the chart and mention the arrow keys. |
| F32 | 2.1.1 | Radix menu, popover, tabs, toggle groups, tooltips | — | Arrow keys, Esc and roving focus work. There are no traps; the Select component is not used. | Pass. |

### Screen reader

| ID | WCAG | Where | Severity | Issue | Fix |
|---|---|---|---|---|---|
| F33 | 1.3.1, 2.4.6 | Start screen, workspace, `Panel.tsx:14` | Serious | There is no `h1` and the panels have no headings; the only heading is "Assistant". | Make the wordmark the `h1` on the start screen; add an sr-only `h1` (company and quarter) in the workspace. Panel titles and the red box title become `h2`. |
| F34 | 1.3.1 | `ChatPanel.tsx:41`, `ReviewCard.tsx:83,179` | Moderate | The assistant is not a landmark (`aria-label` on a plain div), and the fix panel's `header` and `footer` become banner and contentinfo inside a region. | Add `role="complementary"` to the sidebar; use `div` in the panel. |
| F35 | 4.1.3 | `AttentionStrip.tsx:28` (shadcn Alert) | Moderate | The red box is `role="alert"`, so its whole content, buttons included, is read out assertively on load and on every change. | Use `role="region"` named by its `h2`. The toast already announces each fix. |
| F36 | 1.3.1 | `AttentionStrip.tsx:34`, `Thread.tsx:50` | Serious | `ItemGroup` is `role="list"` but its items are not list items (axe, critical). | Add `role="listitem"` to the items. |
| F37 | 2.4.6, 4.1.2 | Attention box, tab badge, fix options, KPI cards | Moderate | Two buttons are both called "Fix". The tab reads "Release check 2". Fix options read "matches the check1". KPI cards don't say what they do. | Name the buttons "Fix {field}", add "numbers need you" to the tab, hide the `Kbd` from the name and use `aria-keyshortcuts`, and add an action hint to KPI cards. |
| F38 | 1.3.1 | `FundamentalsTable.tsx:137`, `ReleaseView.tsx:138` | Moderate | Metric and field names are `td`, not row headers, and the tables have no name. | Use `th scope="row"` with `aria-labelledby` pointing at the panel heading. |
| F39 | 1.1.1, 1.3.1 | Price, Earnings quality, Capex intensity | Serious | Charts have no text alternative, and the second ratio is hover-only. | Add an sr-only table per bar chart (quarter, value, second ratio, needs you) and a price summary (last close, range, high, low, 150-day average). |
| F40 | 4.1.3 | `Thread.tsx` | Serious | Assistant answers are not announced. The thinking line's `aria-live` arrives with its text, so it is missed, and messages don't say who is speaking. | Make the thread `role="log"` (polite), and add sr-only "You:" and "Assistant:". |
| F41 | 4.1.2 | `MubitPopover.tsx:37` | Moderate | The popover dialog has no name (axe). | Add `aria-label`. |
| F42 | 3.3.1, 3.3.2, 4.1.3 | `ReviewCard.tsx:133-161` | Serious | Save fix and Keep stay disabled with no reason given. Enter in the value field does nothing. Disabled buttons are skipped by Tab. | Keep the buttons enabled. On submit, mark empty fields `aria-invalid`, show a `FieldError` (announced) and focus the first empty field. |
| F43 | 3.2.5 (advisory) | `SourceExcerpt.tsx:56`, `Thread.tsx:60,93` | Minor | Links open a new tab without saying so. | Add sr-only "(opens in a new tab)". |
| F44 | 3.1.1 | `index.html:2` | Minor | `lang="en"`, but the copy is British. | Set `en-GB`. |
| F45 | 2.4.6 | `SourceExcerpt.tsx:32-44` | Minor | Number buttons in the release text are named only by the number; the tooltip says what it is. | Use `aria-label` "Use $1.17, GAAP diluted EPS". |
| F46 | 4.1.3 | `ReleaseView.tsx` ExportButtons | Moderate | "Copied" only changes the button label, which is not announced reliably. | Add an sr-only `role="status"` message. |
| F47 | 1.3.1 | Release check source highlight | Minor | Highlighting the source segment is visual only. | See section 4. |
| F48 | 4.1.3 | Toast after a fix, pipeline progress | — | Sonner's polite region announces the toast (verified). Progress is in a live region. | Pass. Progress moves into the F40 log. |

### Motion and targets

| ID | WCAG | Where | Severity | Issue | Fix |
|---|---|---|---|---|---|
| F49 | 2.3.3 (AAA), 2.2.2 | `index.css:123-125` | Minor | Under reduced motion, spinners keep an infinite 0.01ms animation, which flickers. | Add `animation-iteration-count: 1` and `scroll-behavior: auto`. |
| F50 | 2.3.3 | `SourceExcerpt.tsx:21` | Minor | JS smooth-scrolls whatever the user's preference. | Use `behavior: "auto"` when the user prefers reduced motion. |
| F51 | 2.3.3 | `MotionConfig reducedMotion="user"`, sheet slide | — | `layoutId` and the sheet animations follow the preference. Nothing flashes. | Pass. |
| F52 | 2.5.8 | `Panel.tsx:19` | Serious | The "i" buttons are 14x14 (axe). | Give them a 24px hit area with padding and a negative margin, so they look the same. |
| F53 | 2.5.8 | `FundamentalsTable.tsx:40` | Moderate | The flagged value button in the table is 56x20 (axe). | Add `min-h-6`. |
| F54 | 2.5.8 | Composer upload and send (24px), panel close (28px), chips (28px) | — | All meet 24px. | Pass. |

### Found while fixing

The re-walk after the first round of fixes turned up four more.

| ID | WCAG | Where | Severity | Issue | Fix |
|---|---|---|---|---|---|
| F55 | 2.4.7 | `ui/dropdown-menu.tsx` items | Serious | The highlighted menu item is invisible: `--accent` and `--popover` are the same colour (#1b1e22). | Class default: `focus:bg-input`, plus an amber hairline (`inset-ring-ring/60`, 4.69:1) on keyboard focus only. |
| F56 | 2.4.3 | `CompanySwitcher.tsx` | Moderate | "Track another company" fills the chat box, but the menu then returns focus to its trigger. | Skip the menu's focus return for that item, so focus stays in the chat box after "Track ". |
| F57 | 4.1.2 | `KpiRow.tsx` | Moderate | The Gross margin and FCF margin cards are buttons that do nothing when nothing is flagged. | They render as a plain `div` unless there is somewhere to go. |
| F58 | 4.1.2 | `CompanySwitcher.tsx` | Serious (axe) | While the menu is open, Radix's modal mode sets `aria-hidden` on the page around focusable content (`aria-hidden-focus`, `landmark-one-main`). | Make the menu `modal={false}`. Esc, Tab and an outside click still close it. |

## 4. Pressure test

Each fix was read three ways: as a **screen-reader** user (SR), as a **keyboard power user**, an analyst who lives on the keyboard (KB), and as the **designer** who keeps the look close to Amir Dehkordi's Fundamentals Tracker (dark, one amber accent) (D).

| ID | Verdict | Reason |
|---|---|---|
| F1 | Keep | D: a 1% lightness nudge to the red, invisible next to the old one. Fixes the only text failure. |
| F2 | Keep | D: the ring stays amber, just paler, and only shows on keyboard focus. KB: the ring is easier to find on dark grey. |
| F3 | Change | D: brighter edges on every outline button would make the page busier. Apply to text inputs only (three fields and the chat box). Buttons are named by their text, so their edge isn't needed to find them. |
| F4 | Keep | D: a hairline in the text's own colour reads as "selected" and adds no new colour. SR: Radix already exposes the selected state. |
| F5 | Keep | D: uses the same triangle as every other "needs you", rather than a hatch pattern. SR: covered by F39. |
| F6 | Keep | KB: P/E is one more Tab stop in the top bar, and it carries a warning. |
| F7 | Change | SR: add "better" or "worse" text. D: an extra visual mark on every chip is clutter. The visual question goes to section 6. |
| F8 | Keep | D: the same three icons as the status chips, so no new visual language. |
| F9 | Keep | Name change only. |
| F11 | Drop | Volume is context. The axis, close line and tooltip carry the price story. |
| F12 | Drop | The marker's 12px label (F13) says which release it is. The line is a guide, like a grid line. |
| F13 | Keep | D: 12px matches the axis ticks already in use. |
| F14 | Keep | D: 1px larger still fits the headers (checked at 1024 with chat open). |
| F15 | Drop | D: all-caps labels are core to the Fundamentals Tracker look. They are short, and SR reads them as normal text. |
| F16 | Keep | D: no change at 1440. Narrower layouts wrap instead of clipping. |
| F17 | Keep | SR and KB: the assistant is half the product. One icon button, shown only below `md`. |
| F18 | Change | D: keep the wordmark text hidden (the mark stays). Show P/E, After and Mubit, and let the bar wrap. At 1440 nothing changes. |
| F19 | Keep | No change on desktop. |
| F20 | Keep | No change on desktop. |
| F21 | Keep | Covered by F16. |
| F22 | Drop | The full message is one action away: the fix panel opens on it, and the Release check shows it in full. Truncation keeps the box short. |
| F23 | Keep | KB: one Tab, hidden until focused. |
| F24 | Keep | SR: hears where they landed ("NVIDIA Q2 FY2027"). KB: the next Tab is the skip link. |
| F25 | Keep | KB: Fix, 1, then focus lands on the next Fix: a fast loop through what needs you. |
| F26 | Keep | KB: shortcuts work wherever focus is in the panel, except in text fields. |
| F27 | Keep | KB: a way back into the panel without Tabbing through the page. |
| F28 | Keep | D: the field name looks the same; only the focus ring is new. |
| F29 | Change | KB: no Tab stop for each dash in the table. Only P/E and the After result get one. SR gets the cell text inline. |
| F30 | Keep | Ring only on keyboard focus. |
| F31 | Keep | KB: arrow-key tooltips stay and become visible. SR: the name says what the chart is and that a table follows. |
| F33 | Keep | D: all headings keep their current styles; the workspace `h1` is sr-only. |
| F34 | Keep | No visual change. |
| F35 | Keep | SR: a region you can jump to, not something shouting on every render. |
| F36 | Keep | No visual change. |
| F37 | Keep | No visual change. |
| F38 | Keep | D: row headers keep the cell styles. |
| F39 | Keep | No visual change. |
| F40 | Keep | SR: answers are read when they arrive. No visual change. |
| F41 | Keep | No visual change. |
| F42 | Keep | KB: Enter always does something. D: red text appears only after a failed submit. |
| F43 | Keep | No visual change. |
| F44 | Keep | No visual change. |
| F45 | Keep | No visual change. |
| F46 | Keep | No visual change. |
| F47 | Drop | The row already holds the value and the check, and the excerpt is readable text. Announcing every highlight would be noise. |
| F49 | Keep | No visual change with motion on. |
| F50 | Keep | No visual change with motion on. |
| F52 | Keep | D: the hit area grows; the icon looks the same. |
| F53 | Keep | D: the row height doesn't change. |
| F55 | Keep | D: grey highlight for the mouse as before; the amber hairline appears only for the keyboard, matching the selected tab. |
| F56 | Keep | KB: type the company name straight after choosing the item. |
| F57 | Keep | No visual change; two fewer dead Tab stops. |
| F58 | Keep | KB and SR: the menu behaves the same; the page just isn't hidden behind it. |

## 5. Outcome

**Counts.** 58 items were checked. 5 of them already passed (F10, F32, F48, F51, F54), which leaves **53 findings**:

- **48 fixed.** That includes 4 fixed in a changed form: F3, F7, F18 and F29.
- **5 dropped**, with reasons in section 4: F11, F12, F15, F22 and F47.

**Checks.** `npx tsc -b` and `npm run build` pass. The gate grep (hex, `rgba(`, `style={{ background`, `<select`, `<textarea` and `<kbd` in `src/components` outside `ui/`) is empty. There were no console errors in any run.

**axe, after.** At 1440x900 and at 1024x768, over the same 11 screens, there are **0 critical and 0 serious** issues. One moderate `region` result is left. It only appears while the company menu is open, on Radix's popper wrapper around the `role="menu"`.

| axe rule | Before (screens) | After |
|---|---|---|
| aria-required-children (critical) | 7 | 0 |
| target-size (serious) | 8 | 0 |
| aria-dialog-name (serious) | 1 | 0 |
| color-contrast (serious) | 1 | 0 |
| aria-hidden-focus (serious) | 1 | 0 |
| page-has-heading-one (moderate) | 8 | 0 |
| region (moderate) | 9 | 1 (menu open only) |
| landmark-banner / contentinfo-is-top-level (moderate) | 2 | 0 |
| landmark-one-main (moderate) | 1 | 0 |

**Contrast, after.** All changes are in `src/index.css` at the same hue, or in class defaults that use tokens.

| Pair | Before | After |
|---|---|---|
| `--destructive` (#e5736b to #e67870) on the danger badge over popover | 4.49 | **4.63** |
| `--destructive` on the danger badge over card | 4.97 | 5.13 |
| `--destructive` on card | 6.09 | 6.35 |
| Focus ring `ring/50` (`--ring` #e0a64e to #e8be7d) on background / card / muted | 3.03 / 3.03 / 2.94 | **3.53 / 3.53 / 3.42** |
| Chart focus outline `ring/60` on card | none | 4.49 |
| Menu item keyboard highlight | 1.00 (invisible) | 4.69 hairline |
| Text input edge (`subtle-foreground/70`) on card / muted | 1.34 / 1.42 | **3.31 / 3.15** |
| Before selected (`foreground/50` hairline) vs track | 1.16 | 4.06 |
| After selected and active tab (`primary/60` hairline) vs track | 1.06 | 3.77 |
| 6M / 1Y / 2Y selected vs card | about 1.1 | 4.12 |
| Flagged bar vs amber bar | 1.39, hue only | 1.34, plus a triangle mark (6.35:1) and the table alternative |

**Keyboard re-walk at 1440, keys only** (`a11y/after-focus-*.png`):

1. Track NVIDIA from the start screen. Focus lands on the `h1` "NVIDIA Q2 FY2027".
2. The first Tab stop on the page is "Skip to the release". Shift+Tab reaches the top bar, where the company menu, P/E (its tooltip opens on focus), Before/After and Mubit are all reachable.
3. "Fix fiscal quarter" opens the panel with focus in it. Shortcuts work from the panel and its buttons, and pressing 2 saves the fix.
4. Focus moves to "Fix diluted EPS". Esc returns focus there.
5. E opens typing mode. Enter with empty fields shows "Type the right value." and "Say where the value comes from.", marks both fields invalid and focuses the value field. Filling both and pressing Enter saves, the toast is announced, and focus lands on "Nothing needs you".
6. In the Release check, every field name is a button, and "fix history" toggles with `aria-expanded`. Copy announces "Copied. Paste it into Excel." Export CSV is reachable.
7. The company menu works with arrow keys and has a visible highlight. "Track another company" leaves focus in the chat box with "Track " filled in.
8. The Mubit popover is named, and Esc returns focus to its trigger.
9. Charts are Tab stops with a visible ring. The arrow keys show the tooltip.

**Reflow and zoom.** At 720px (200% zoom) and at 320px (400% zoom) there is no horizontal scroll outside the data tables. The top bar wraps instead of clipping, and nothing is hidden except the wordmark text. The assistant opens from the top bar. The fix panel is full width, and the red box wraps its messages under the numbers. The text-spacing override clips nothing except sr-only text, which is expected.

**Screenshots.** `a11y/before-*.png` (14) and `a11y/after-*.png` (22). They cover 1440 and 1024, chat open and folded, the fix panel, the Release check, the menu, the popover, After mode, reflow, text spacing and focus states.

**Files changed:** `index.html`, `src/index.css`, and `ui/` class defaults only in `input.tsx`, `input-group.tsx` and `dropdown-menu.tsx`. Components changed: `AppShell`, `TopBar`, `ChatPanel`, `CompanySwitcher`, `MubitPopover`, `StartScreen`, `Thread`, `Panel`, `StatusChip`, `AttentionStrip`, `ReleaseView`, `SourceExcerpt`, `ReviewCard`, `KpiRow`, `DeltaChip`, `FundamentalsTable`, `QuarterBarCard`, `PriceChartPanel`, `chartTheme` and `LearningToggle`. Not touched: `api/types.ts`, `API.md` and sample data.

## 6. Needs a design decision

1. **Good or bad in colour only (F7).** Delta chips and the YoY column show direction by arrow and sign, but good or bad only by green or red. Screen readers now hear "better" or "worse". A visual cue (for example a muted chip when a rise is bad, as with diluted shares) is a design call.
2. **The top bar at narrow widths (F16, F18).** At 1440 nothing changed. At 1024 with the chat folded, in After mode, or zoomed in, the bar now wraps to a second row (about 93px) instead of clipping or hiding P/E, the After result and Mubit. A more compact narrow layout, such as an overflow menu, would need a design.
3. **Brighter input edges (F3).** The three fix-panel fields and the chat box now have 3:1 edges. Outline buttons keep their hairline. Confirm the inputs still sit right next to them.
4. **Selected hairlines (F4).** Selected tabs and toggles now carry a thin outline in their text colour. An alternative that meets 3:1 is a stronger fill.
5. **The assistant on small screens (F17).** Below 768px the assistant opens as a sheet on arrival, as it does on desktop. It might be better to start it closed there.
6. **The mobile sheet's name.** shadcn's mobile Sidebar titles its sheet "Sidebar" in `ui/sidebar.tsx`. Renaming it to "Assistant" is a text change in a `ui/` file, so it was left alone.
