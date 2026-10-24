# Atom Earnings Desk: interaction QA

Tested on 24 Oct 2026 against the mock data, in headless Chrome at 1440×900, with the key paths repeated at 1024×768. Each run started from a fresh load, with `console.error`, `console.warn` and uncaught errors captured. Screenshots are in `qa/`. The scripts that reproduce every finding are in this session's scratchpad.

## Verdict

The 2-minute demo works at 1440×900 and at 1024×768. You can track NVIDIA, see the red numbers, fix EPS with key 1, watch it land, switch to After and open the Mubit popover. The fix lands everywhere at once and correctly, and clean loads show no console errors. The weak spot is the fix panel's guard rails. A single key (2), a double click, or a fast 1 then 2 can save the AI's wrong number as "Fixed", with an invented reason, or reverse a fix the analyst just made. The panel also accepts text such as "one seventeen" as an EPS value. The chat has the next-biggest problem: any message starting with "follow", "add" or "track" is treated as a request to track a company. The fix panel and the chat are where a presenter or a judge is most likely to stumble live, so fix them first.

**Counts:** 0 blockers · 10 major · 12 minor.

**Changed while I tested.** The accessibility session was editing `src/` during this run. Two problems I saw early had already gone on a clean reload:
- in After mode below about 1,230px wide, the Mubit button was pushed off the right edge;
- "Track another company" left focus on the menu button.

The top bar now wraps onto two rows instead (see m7). Neither is listed as an issue.

## Top five

1. **M1:** picking the AI's own number (key 2) keeps a failed value with no reason, marks it "Fixed" and logs a made-up reason.
2. **M2:** the panel takes a second pick while the first is saving. A double click sends two fixes, and 1 then 2 reverses the fix.
3. **M4:** chat messages starting with "follow", "add" or "track" go to company tracking and get "This build can track NVIDIA or Microsoft".
4. **M3:** "Type it" accepts any text for a number. The chat then says "$NaN", while the Overview quietly shows a different value.
5. **M5:** on the start screen, typing just "NVIDIA" or "NVDA" doesn't track it. The reply tells you to "Track a company first".

## Issues

| ID | Severity | Area | Steps to reproduce | Expected | Actual | Screenshot | Suggested fix |
|---|---|---|---|---|---|---|---|
| M1 | major | Fix panel | Track NVIDIA → Fix on Diluted EPS → press **2** (or click "$1.24 · the AI's answer", or click $1.24 in the release text) | Keeping the AI's value goes through the same "Keep $1.24?" step, which asks why | Saves at once with no reason. Toast: "Value kept and sent to Mubit". The KPI shows $1.24 with a green +67.6% and a "Fixed" chip. The audit row reads `Reason: "Picked from the release: Non-GAAP diluted EPS"`, a reason the analyst never gave | `qa/M1-key-2-keeps-ai-value.png`, `qa/M1-audit-fake-reason.png` | In `ReviewCard` `pick()`, when `c.value === field.value`, switch to `keep` mode instead of saving. Keep the "2" shortcut, but have it open the reason step |
| M2 | major | Fix panel | Open the EPS fix → double-click $1.17. Or open the Fiscal quarter fix → press 1 then 2 within about 0.25s | One save. Later input is ignored until the panel closes | Double click: two submissions and two "Fix saved" toasts (a real backend would get two examples). 1 then 2: both saved and the last one wins, so the quarter ends up "Kept at Q3 2026 despite the failed check" | `qa/M2-double-click-two-toasts.png`, `qa/M2-fast-1-then-2-reverses-fix.png` | Add a `saving` state in `ReviewCard`. Set it on the first pick, disable the options and ignore keys while it's set, or close the panel straight away (optimistic) |
| M3 | major | Fix panel, Type it | Fix on Diluted EPS → **E** → type `one seventeen` → put `my notes` as the source → Enter | Save stays disabled with "Enter a number" | Saved as Fixed. The Overview shows $1.17, because it falls back to the sample row. The chat says "Diluted EPS (GAAP) is $NaN, fixed by an analyst" | `qa/M3-typed-text-saved-as-eps.png` | For units `usd_m`, `shares_m` and `usd_per_share`, require `parsed()` to return a number. Show an inline error and keep Save disabled |
| M4 | major | Chat | With NVIDIA tracked, send "follow up on EPS please" or "Add revenue to my notes" | Answered as a question about EPS or revenue | Shows a tracking error card: "This build can track NVIDIA or Microsoft. Try "Track NVIDIA"" | `qa/M4-chat-follow-routed-to-tracking.png` | In `state/app.tsx` `ask()`, route to `track()` only when the text also names a company (reuse `matchCompany`), or when it is exactly "Track …" |
| M5 | major | Start screen | Type `nvidia` (or `NVDA`, or `Microsoft`) → Enter | Starts tracking, because the box says "Track a company" | Reply: "Track a company first, for example "Track NVIDIA"" | `qa/M5-start-company-name-not-tracked.png` | When there is no release, send any message that names a known company to `track()` |
| M6 | major | Chat, upload | Click the paperclip in the chat → choose any file, for example `quarterly-notes.txt` | "Couldn't find an earnings release in this file" | "Reading quarterly-notes.txt" → "Found Microsoft's 8-K…". Microsoft's sample data is shown as if it was read from the file | `qa/M6-any-upload-becomes-microsoft.png` | In `uploadRelease`, throw a `TrackError` when `matchCompany(file.name)` is null, instead of falling back to MSFT |
| M7 | major | Fix panel | Fix on EPS → **Enter** (Keep) → type a reason → press **Esc** | Esc leaves the field and returns to the card, as the code comment intends, and the reason is kept | The whole panel closes and the typed reason is lost. The same happens in "Type it" | `qa/M7-keep-reason-before-esc.png`, `qa/M7-esc-closed-panel.png` | On `SheetContent`, add `onEscapeKeyDown={(e) => { if ((e.target as HTMLElement).closest("input")) e.preventDefault() }}` |
| M8 | major | Fix panel, red box | At 1440, open the EPS fix → try to switch to the Fiscal quarter fix from the red box | The other flagged number is one click away | The 420px panel covers the red box's Fix buttons and the right of the top bar (Before/After, Mubit). On the Overview, Fiscal quarter has no other way in, so you have to close the panel first. A click on a tab also closes the panel | `qa/M8-panel-covers-other-fix-button.png` | Make the whole red-box row clickable (the label is on the left and stays visible). Also add "Next: Fiscal quarter" to the panel footer when more than one number is flagged |
| M9 | major | Fix panel | Fix on EPS → hover the $1.17 option (matches the check) | The right answer is marked in a positive or neutral colour | Under "From the release", $1.17 turns red (destructive), so the right answer looks wrong. The AI's $1.24 is red by default | `qa/M9-right-answer-highlighted-red.png` | In `SourceExcerpt`, colour the highlight by candidate. Use primary for the suggested value and red only for the AI's value |
| M10 | major | Start screen | Track Apple → paste a long message (about 2,000 characters) → Enter | The thread scrolls inside its area | The thread spills over the composer, and the reply is drawn on top of the input | `qa/M10-start-long-message-overlaps.png` | Give the start-screen `ScrollArea` a bounded height that its viewport respects (`h-[60vh]`, or `flex-1 min-h-0`) and scroll it to the end on new messages |
| m1 | minor | Start screen | Send "Track Apple" | The suggestion chips stay so you can recover in one click | The error appears and the "Track NVIDIA" and "Track Microsoft" chips disappear | `qa/m1-chips-gone-after-error.png` | Show the chips while `phase !== "workspace"`, not only when the thread is empty |
| m2 | minor | Overview, KPI cards | Click Gross margin or FCF margin (when not flagged), then click Revenue | Every card does the same kind of thing, and a card that does nothing doesn't look clickable | Gross margin and FCF margin have a hover state but do nothing. Revenue and Net income jump to the Release check tab without warning | `qa/m2-kpi-cards.png` | Give every card a target (scroll to its Fundamentals row), or render the non-field cards as plain cards. Add a tooltip such as "See where it came from" |
| m3 | minor | Release check | Click the "Period end" row, then the "Adjusted EPS" row | Only the clicked row is selected | Two rows are selected each time (Period end with Fiscal quarter, and Adjusted EPS with Diluted EPS), because they share a source segment | `qa/m3-two-rows-selected.png` | Track the selected field key for the row state, and keep the segment only for the text highlight |
| m4 | minor | Toast | Fix EPS → open the Release check → click the EPS row to show its history | The history row and request-ID button are visible | The bottom-left toast covers the history row and the copy button for about 4s. The toast also stays when you switch company (an NVDA toast over Microsoft) | `qa/m4-toast-covers-history.png` | Move the Toaster to `bottom-right`, or dismiss it when the company changes |
| m5 | minor | Fix panel, keys | Open a fix → press **Enter** | Enter confirms the highlighted (primary) option | Enter opens "Keep Q3 2026?", the opposite of the highlighted choice | `qa/m5-enter-means-keep.png` | Make Enter pick the suggested option, and use K for Keep |
| m6 | minor | Status labels | Fix on EPS → Keep $1.24 → give a reason → save | Shown as "Kept", in a neutral colour | The KPI and Release check say "Fixed", with a green YoY arrow | `qa/m6-kept-labelled-fixed.png` | Add a "Kept" label to `StatusChip` when `from === to` |
| m7 | minor | Top bar, layout | At 1440, track NVIDIA (the chat opens) → click anywhere | A stable layout | With the chat open, the top bar wraps onto two rows (93px), so its border no longer lines up with the chat header (56px). The first click folds the chat, and the bar jumps back to one row and the page reflows. This is new since the accessibility session's wrap change | `qa/m7-topbar-two-rows-chat-open.png`, `qa/m7-topbar-one-row-chat-folded.png` | Hide the Trailing P/E or the After result line before wrapping, or wrap only below about 1,100px of column width |
| m8 | minor | Chat | Ask "What was revenue?" → then "What about compared with last year?". Also ask "How many diluted shares?" | The follow-up uses the last topic, and the copy matches the units shown | The follow-up gets the generic help text. The shares answer reads "Diluted shares is 24.48B. In millions, consistent with…" | `qa/M4-chat-follow-routed-to-tracking.png` | Carry the last topic into the mock `ask()`. Reword the R5 message for chat |
| m9 | minor | Mubit story | Open the Mubit popover → fix EPS → reopen it → switch to After | The numbers tell one story | The popover goes from 12 to 13 of 84, so the bar barely moves. After says "Learned from analyst fixes on 14 similar releases" (and 11 for the quarter) whatever you fixed | `qa/m9-mubit-popover-12-of-84.png`, `qa/m9-after-learned-from-14.png` | Show "+1 from you" next to the count, or briefly pulse the progress bar after a fix. Align the "learned from" counts with the popover |
| m10 | minor | Refresh | Track NVIDIA → fix EPS → refresh | Work survives, or you get a warning first | Back to an empty start screen with no warning, so re-tracking takes about 5s in a live demo | `qa/m10-refresh-loses-work.png` | Save the state to `sessionStorage`, or add a `beforeunload` prompt once there are fixes. Browser back works, because the page is restored from cache |
| m11 | minor | Chat | Ask a question with a long answer | The thread scrolls to show the new suggestion chips | The scroll runs on new messages only, so the last chip can be cut off at the bottom | `qa/m11-chips-cut-off.png` | Scroll to the end when the suggestions change as well |
| m12 | minor | Layout at 1024 | At 1024×768, track NVIDIA (the chat opens) | Readable headline row | The KPI cards sit 2 + 2 + 1, with FCF margin alone on its row, and the red-box messages are cut to one and a half lines. The Mubit button and Trailing P/E are hidden until the chat folds | `qa/m12-1024-chat-open.png` | Use 3 + 2 KPI columns at this width, or fold the chat by default below 1,200px |

Also seen but not counted:
- After a fix the panel closes and focus falls to `<body>`. The accessibility session is likely covering this.
- The top bar's quarter badge already says "Q2 FY2027" while the panel asks which quarter is right.
- Typed fixes are stored as typed: "Q2 fy27" becomes the release label in the Release check.

## Works well: keep it

- **The demo path.** Track NVIDIA → Fix → key 1 updates everything at once and consistently:
  - the red-box row disappears;
  - the KPI turns white with "Fixed" and +58.1% YoY;
  - the Fundamentals cell gets a pen icon;
  - Trailing P/E recalculates (50.8x → 51.7x) and stops being red;
  - the Release check badge counts down;
  - the toast names the field and the Mubit progress;
  - the popover count goes up by one per fix (12 → 13 → 14 → 15 with Microsoft).

  See `qa/ok-eps-fix-lands.png`.
- **The tracking trace.** Steps appear one by one, with a link to the SEC filing. A double click on "Track NVIDIA" tracks once. Tracking the same company again doesn't duplicate it and keeps earlier fixes.
- **"Not listed? Type it".** Save stays disabled until both fields are filled. Clicking a number in the release text fills the value and the source (`qa/ok-type-it-filled-from-text.png`).
- **"Keep $X".** It requires a reason, and Back returns to the choice.
- **Closing the panel.** Esc (with focus on the card), the close button and clicking outside all close it. Hot keys do nothing while the panel is closed.
- **After mode.**
  - Before values are struck through.
  - The red box and the tab badge hide.
  - The result line has an honest tooltip ("Measured in Mubit's test runs… Sample data").
  - Switching back to Before restores every fix.

  See `qa/ok-after-mode.png`.
- **The Mubit popover.** It is clear, compact, labels sample data, and has a live count (`qa/ok-mubit-popover.png`).
- **The company menu.** The red, grey and green dots and the tick are right. The red dot on the chevron appears only when *another* company needs you (`qa/ok-company-menu.png`).
- **Copy and Export CSV.** Plain numbers, ISO dates, the full audit columns, and the mode in the file name (`NVDA-Q2-FY2027-before.csv`). Copying the request ID copies the full ID.
- **Chat.** Suggestions follow the flagged numbers, drop off once asked, and the fixed-EPS question disappears after the fix. The rail shows an unread dot when a reply lands while the chat is folded.
- **Charts and tooltips.** The price range switch, price and bar hovers, the info tooltips, the "Fix the flagged number first" dashes and the red-cell tooltips all behave.

## Outcome (24 Oct 2026, after the fixes)

Re-tested in the browser pane at 1440×900 and 1024×768, with the chat open and folded, and with `console.error`, `console.warn` and uncaught errors captured. No errors were logged. axe 4.10.2 reports 0 violations on the Overview, with the fix panel open, and in After mode, at both widths. `npx tsc -b` and `npm run build` pass, and the gate grep is empty.

| ID | Outcome |
|---|---|
| M1 | Fixed. Picking the AI's own number (key 2, its button, or its number in the release text) opens "Keep $1.24?" and asks why. Nothing is saved. |
| M2 | Fixed. One save per panel: after the first pick, the options, keys and buttons are disabled. A double click gives one toast. |
| M3 | Fixed. Money and share fields accept numbers only. "one seventeen" shows "Enter a number, for example 52940." and doesn't save. "76,420" saves. |
| M4 | Fixed. Only "Track …", or a message that names NVIDIA or Microsoft, goes to tracking. "follow up on EPS please" gets the EPS answer. |
| M5 | Fixed. "nvidia" or "NVDA" on its own tracks the company. |
| M6 | Fixed. A file that isn't an NVIDIA or Microsoft release says so, instead of loading Microsoft. |
| M7 | Fixed. Esc in a text box returns to the card and keeps the text; the panel stays open. |
| M8 | Fixed. The whole red-box row opens the fix, so the visible label works when the panel covers the button. The panel footer offers "Next: fiscal quarter" when another number needs you. |
| M9 | Fixed. In the release text the number the check points to lights up amber; only the AI's wrong number is red. |
| M10 | Fixed. The start screen keeps the box at the bottom and scrolls the thread above it. |
| m1 | Fixed. The Track NVIDIA and Track Microsoft buttons stay after an error. |
| m2 | Fixed (by the accessibility pass). Only cards that lead somewhere are buttons. |
| m3 | Fixed. The Release check selects one row, tracked by field rather than by source segment. |
| m4 | Fixed. Toasts clear when you switch company or open a fix's history. |
| m5 | Fixed. Enter picks the highlighted number; K keeps the AI's value. The hints say so. |
| m6 | Fixed. A kept value shows a neutral "Kept" label and "Kept by …" in its history. |
| m7 | Fixed. At 1440 with the chat open the top bar stays on one row (57px) in Before and After. On a narrow column "Trailing P/E" shortens to "P/E", and the After result drops "per release", which is in its tooltip. At 1024 with the chat open it still wraps to two rows, as the accessibility pass intends; nothing is hidden. |
| m8 | Fixed. A follow-up stays on the last number asked about, and the shares answer reads "Diluted shares are 24.48B. It passed the arithmetic check." |
| m9 | Fixed. "Learned from" lines no longer give counts, and the Mubit popover shows "+1 from your fixes", rolling the count and the bar from the last value you saw. |
| m10 | Not fixed. Refresh still returns to the start screen; rehearse the demo without refreshing. |
| m11 | Fixed. The chat scrolls to the end when the suggestions change. |
| m12 | Fixed. At 1024 with the chat open the KPI cards sit 3 + 2. |

### Animations added

All respect reduced motion: Motion's `reducedMotion="user"`, NumberFlow's own setting, and `motion-reduce:animate-none` on the CSS ones.

- **Start screen.** The box moves to the bottom once, the steps grow above it, and the whole column glides into the assistant (one shared `layoutId`). The workspace then comes in from the left: top bar, tabs, red box, then the panels.
- **Fix landing.** The KPI value rolls from $1.24 to $1.17 (`@number-flow/react` 0.6.2), its colour fades from red, and the card glows amber once. The trailing P/E rolls too.
- **Before/After.** The KPI values and the latest Fundamentals column roll to their new values.
- **Pipeline.** Each step slides in, and the card grows smoothly.
- **Red box.** Fixed rows fold away, and messages wrap on narrow widths.
