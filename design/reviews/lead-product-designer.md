# MuTick: lead product designer's review

Reviewed live at `localhost:3100` (fake model, 25 Oct, about 01:10 London) at 1440×900 and 1024×768, plus the code in `apps/web`. I walked the full flow: start screen, "NVIDIA, last 4 quarters", the filing picker and "Add all", the dashboard, the sources menu, the chat and "Ask next", the Mubit panel and a replay, then "+", a new desk and "Compare NVIDIA, Microsoft and Apple revenue". Screenshots are in this session's scratchpad (`shots/01…19`). I judged the design, not the canned answers.

Another session was editing the files while I reviewed. The "Document extraction" strip that sat at the top of the chat card is being moved into the Mubit panel (`page.tsx`, `extraction-panel.tsx`, `mubit-panel.tsx` are dirty). I saw it on the live page at 1440, and it was gone after a reload. **Check that this lands.** If it doesn't, it beats everything below as must-fix #1: a white bold `▶ Document extraction 0 requests · 4 runs` row with a native disclosure triangle is the most "unfinished" thing on screen.

Line numbers are from the tree as it was at review time. Match on the quoted code.

---

## Score: 7 / 10

The dashboard is the best thing here, and it looks like a product an analyst would trust. It keeps the familiar KPI → chart → table order. The latest quarter is labelled in the chart and tinted in the table. The provenance badges (D, ~, C, R) carry through to the axis. Capex and share count get neutral chips, not green and red, and the Ink palette is restrained. That's crafted work, and it's above most hackathon entries.

What holds it back from a 9 is everything around the dashboard.
- **The chat loses its own history.** After "Add all", the filing picker disappears and leaves an empty assistant turn.
- **The second demo prompt is the weakest screen in the app.** The title is the raw prompt, the same heading appears twice, the answer's markdown is broken, two-thirds of the canvas is empty, and MSFT gets a text tile beside two logos.
- **Mubit is the sponsor, but it reads like a send button.** It's an unlabelled paper-plane icon. Its panel opens on eight identical "NVIDIA 01:06" rows and leaks internal names (`desk_agent`, `section_extractor`, `mreq_…`, "Copy kept examples … from the console").

In the first 10 seconds the start screen looks competent but generic: a two-tone headline, a centred composer and three chips, the standard AI landing page. The product wins on the second screen, so the demo should get there fast.

---

## Top 5 must-fix before the 07:00 freeze

Each takes under 20 minutes and doesn't change Amir's dashboard structure.

### 1. After "Add all", the chat erases the filing picker and leaves an empty answer

**Where:** `apps/web/lib/desk-store.ts` · `send()`, line 154: `...s.messages.map((m) => ({ ...m, choice: null })),`

**What happens:** every new send nulls `choice` on all earlier messages. The first assistant turn, "I found 4 filings for NVIDIA CORP… Add them to the desk?" with its four filing cards, collapses to just "Used 1 tool" and the Mubit line. The next thing in the thread is a user bubble reading **"Add all"**. A judge scrolling up sees a question answered by nothing. `chat-panel.tsx` lines 217–224 already render a confirmation ("✓ 4 filings added to the desk") for answered choices, but it never shows, because `choice` is gone.

**Fix (10 min):**
- Change line 154 to `...s.messages,`. `Message` already switches an answered choice to the ✓ confirmation, because `reply !== undefined` once a later user message exists.
- In `ChatPanel`, skip rendering a user message whose text equals one of the previous assistant message's `choice.options`. The ✓ line says it better than an "Add all" bubble. (`RecordedTurn.choiceReply` in the Mubit replay already treats it this way, as "✓ Add all".)
- Check: send the prompt, click Add all, then scroll up. You should see the question, then "✓ 4 filings added to the desk", then the next answer.

### 2. The compare answer's bullets merge into one paragraph, with citations stuck to the dashes

**Where:** `apps/web/components/chat/answer.tsx` · `Answer`, line 78: `.replace(/(\[\[(?:f|b):[^\]]+\]\]\s*)+/g, …)`

**What happens:** `\s*` swallows the newline after a citation, so the `- MSFT…` bullet joins the line above. On screen it reads: "• NVDA $96.22B … (+105.9% vs a year ago) ¹ - MSFT $90.01B … ² - AAPL …". It looks like raw model output, on the very prompt the demo uses to show comparison.

**Fix (5 min):**
- Change `\s*` to `[ \t]*` in that regex. `run.endsWith(' ')` keeps working.
- While you're there, look at the three source chips. All of them read "SEC filing", because the compare filings aren't on the desk (`label()`, line 147). If the stream gives you the ticker, use `${ticker} ${form}`. If it doesn't, leave it: the regex is the must-fix.

### 3. The KPI cards' "from $57.01B" sits beside "+17.9%", but they measure different things

**Where:** `apps/web/components/dashboard/quarter-overview.tsx` · KPI map, lines 66–70 (`from {formatValue(start.value, r.unit)}`) and the orphan caption at line 39 (`Change vs {prior}`)

**What happens:** the chip is Q/Q (81.61 → 96.22 = +17.9%). The footer is the *first* quarter in range. Read together, they say $57.01B grew 17.9% to $96.22B, but that's actually +69%. An analyst on the panel will catch this in five seconds, and it undercuts the "every number is checked" story. The "Change vs Q1 FY2027" caption floats above the cards at 12px, where nobody connects it to the chips.

**Fix (10 min):**
- Make the footer the comparison the chip uses: `vs {formatValue(r.cells[last - 1]?.value, r.unit)}`, with `title={`In ${prior}`}`.
- Revenue then reads "$96.22B · ↗ +17.9% · vs $81.61B". It explains itself, and you can delete the caption on line 39.
- Keep the sparkline. Its start point no longer needs a label.

### 4. The compare desk's header is the raw prompt, and its card repeats the title

**Where:**
- `apps/web/components/dashboard/dashboard.tsx` · `Dashboard`, line 25. `heading` falls back to `title`, which is the user's sentence.
- `components/dashboard/compare-view.tsx`, line 38: the "Comparison" eyebrow plus "Revenue" heading.
- `components/ui/monogram.tsx` · `LOGOS`: there's no MSFT entry, because Simple Icons doesn't carry Microsoft.

**What happens:**
- The page title reads "Compare NVIDIA, Microsoft and Apple revenue". That breaks the "company name as the title" decision the NVIDIA desk follows.
- The card below then says "Comparison / Revenue".
- The legend says "NVDA · Peers", but this desk belongs to no company. NVDA is accented only because it was named first (`compare-view.tsx:30`, `tickers[0]`).
- MSFT is a text tile ("MSFT") between the Apple and NVIDIA logos.

**Fix (20 min):**
- In `Dashboard`, when the active spec is a compare, set `heading = spec.tickers.map((t) => companyName(t)).join(' · ')`, which gives "NVIDIA · Microsoft · Apple". Put "Revenue · latest quarter vs a year earlier" on the period line where the NVIDIA desk shows its range. Use the existing monogram row for the logos.
- In `CompareView`, drop the "Comparison" eyebrow and the duplicate heading. Keep the one-line description and the legend.
- Add an inline `MSFT` case to `Monogram`: four 8×8 squares in `currentColor` on a 24 grid, so all three demo companies render as grey logos.
- If time allows, inline all three demo logos. `cdn.simpleicons.org` loading at runtime is a risk on venue Wi-Fi.
- Optional, in the same file: rename "NVDA" in the legend to "First named", or colour all bars the accent when the desk has no single company.

### 5. Mubit's button looks like "send", and its panel buries the story

**Where:** `apps/web/components/mubit/mubit-panel.tsx`: `MubitButton` (line 33ff, `toolbarButton`), `MubitPanel` section order (lines 109–126), `Conversation` row label (line 227). Also `components/mubit/mubit-receipt.tsx`, line 27.

**What happens:**
- In a Mubit hackathon, Mubit's entry point is an unlabelled 32px square with a paper-plane-like mark. It sits one card away from the composer's send arrow, so judges will read it as "send" or "share".
- The panel opens on "Recorded for training": eight identical rows of "**NVIDIA** 01:06 · 2 questions". The compelling part, the 5-step "How far it has got" ladder (recorded → reviewed → kept → trained → answering), is below the fold.
- Every task card shows "Calls recorded" twice, once in the ladder and once in the stats row.
- Internal identifiers leak into the copy: `desk_agent`, "Every section_extractor call carries these", `mreq_fake…` ids, and "Not recorded yet. Copy kept examples and adapter status from the console."
- Every receipt says "0.0s". That's the fake model, but in a judge's screenshot it looks like a bug.

**Fix (20 min, all copy and order):**
- **Label the button.** Render `<MubitMark/> Mubit` with `px-2.5 w-auto gap-1.5 text-xs` in place of the square `size-8`. Keep the `+` square.
- **Lead with the ladder.** Move `Section "How far it has got"` above `Recorded for training`. Pass `defaultOpen={false}` to "Recorded for training" and "Desk rules", so the panel opens on the ladder.
- **Name each recording by its first question,** not the desk. In `Conversation`, use `turns[0].question` (truncate it) in place of `deskName(turns[0].desk)`, and move the desk name into the muted meta next to the time. The rows then read "NVIDIA, last 4 quarters · 01:06 · 2 questions".
- **Replace the internal copy:**
  - "Every section_extractor call carries these" becomes "Every filing read carries these rules."
  - The `font-mono` task ids on `TaskCard` (line 312) go.
  - The console placeholder becomes "Kept examples appear here once Mubit has reviewed today's calls."
- **Hide sub-100ms times.** In `MubitReceipt`, show the seconds only when `seconds >= 0.1`, and do the same for the `Avg call` stat.

---

## Nice-to-haves, roughly in order of value

1. **Don't reload during the demo.** Restored messages carry no `mubitCalls` (`desk-store.ts` `fromStored`, line 93), so after a reload every "Answered through Mubit" line vanishes from the chat. Persisting it needs the API to store the calls with the message. Until then, avoid refreshing on stage.
2. **The chat still has a lot of generic chat furniture.** Copy and retry icons, a "Used N tools" disclosure *above* the answer and a separate Mubit line *below* it make three chrome rows per answer. Merge "Used 2 tools" into the receipt row ("2 steps · answered through Mubit · 3 calls ›"), and keep copy and retry on hover only. Older answers already hide them with `opacity-0`, but still reserve 28px, which leaves a visible gap above the Mubit line. Use `hidden group-hover:flex` there.
3. **Three date formats.**
   - The picker and table header use mono ISO (`ended 2025-10-26 · filed 2025-11-19`).
   - The sources menu uses "ended 26 Oct 2025".
   - The compare view uses mono "ended 27 Jun 2026".

   Use "26 Oct 2025" in sans everywhere. The files are `chat-panel.tsx` `FilingCards` and `quarter-overview.tsx` (`q.periodEnd`, line 89).
4. **"NVIDIA CORP" in capitals** in the picker question comes from the SEC entity name. Run it through `companyName()` the way the header does.
5. **Four chip shapes.**
   - The start-screen examples are `rounded-xl` rectangles.
   - "Ask next" chips are `rounded-full` pills with borders.
   - Picker buttons are `rounded-full`.
   - Toolbar buttons are `rounded-lg` squares.

   Make every suggestion a pill. The start chips also reserve space for a hidden `ArrowUpRight` (`empty-desk.tsx` lines 84–88), which gives them lopsided right padding. Drop the arrow.
6. **Three micro-label styles:**
   - "METRIC" is 11px with `tracking-wider`.
   - "INCOME STATEMENT" is 10px with `0.14em`.
   - "ASK NEXT" is 11px with `tracking-wider`.
   - The Mubit panel's section heads are larger again.

   Pick one, 11px semibold with `tracking-[0.08em]`, and use it everywhere.
7. **The title is weaker than the numbers.** The company name is 17px and the KPI values are 26–30px. Take the `h1` to about 22px, so "NVIDIA" anchors the page and the 30px KPIs still lead the data.
8. **The jump-to-latest button covers "Ask next".** At `bottom-[120px]` (`chat-panel.tsx:153`), it sits on top of the last suggestion's text. Move it to `bottom-[132px] right-5` and drop the centring.
9. **Focus rings are the browser's default blue.** They're visible, so not a blocker, but off-brand. Add `:where(button,a,[tabindex]):focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }` to `globals.css`.
10. **Table units.**
    - "24.48B shares" repeats the unit in every cell. Use the label "Diluted shares (B)" and plain numbers.
    - The "~" prefix on "~ $1.76" pushes the figure off the column's right edge. Render "~" as a trailing badge like `D`.
11. **"Ask next" switches between tickers and names** ("Compare NVDA revenue with AMD and AVGO") while the rest of the UI uses names. Use names.
12. **The start screen.** The composer is about 130px tall for a one-line question, so drop it to about 88px. Under the chips, add one quiet proof line the AI-landing template doesn't have, such as "Checked against SEC XBRL · every call trains through Mubit". It gives the 10-second impression something only MuTick can say.
13. **Compare view:** to fill the empty canvas, add the year-ago value as text on the bar tick (`F10` is half done), or a small "growth year on year" ranked list underneath. Keep it in the existing card.

## What reads as AI-generated, in one list

- The two-tone hero headline, plus a centred textarea and example chips.
- The "Used N tools" disclosure and the copy/retry icon row: ChatGPT furniture.
- Broken markdown in answers (must-fix #2).
- Raw ids and task names in user-facing copy (must-fix #5).
- An echo bubble for a button press ("Add all").

The dashboard itself doesn't read as AI-generated. Its details are the kind a template doesn't produce.

## Accessibility basics

- **Contrast:** the Ink tokens pass AA (subtle #8f8c88 on ink is 5.35:1).
- **Keyboard:**
  - Tab order on the start screen is sensible (composer autofocus, then the chips, then the Mubit link).
  - The sources menu closes on Escape and leaves focus visible on its trigger.
  - The chart has a title and description.
- **Gaps:**
  - The focus ring is the browser default (nice-to-have #9).
  - "Answered through Mubit" disappears after a reload.
  - The KPI cards' visual "from" line contradicts their screen-reader summary (must-fix #3 fixes both).

## Mubit's role: clear, or confusing?

The concept is clear, and the copy explains it well: "Every AI call MuTick makes goes through Mubit. It keeps the good answers and trains a small model of MuTick's own from them." So is the receipt under each answer. The entry point (an unlabelled icon) and the panel's order are what confuse. After must-fix #5, the story reads top to bottom: a labelled Mubit button, then a ladder showing how far training has got, then the real conversations it learned from, each one replayable.

---

## Genuinely strong: say these in the demo

1. **"Every number has a receipt."** The sources menu says "Every number is checked against SEC XBRL" and links each 10-Q and 10-K to SEC. The D, C, ~ and R badges appear in the table *and* on the chart's axis (Q4 FY2026 D), with a one-line key under the table. Show this by opening "4 sources" under the title.
2. **The chart was designed by someone who reads earnings.**
   - The latest quarter is labelled directly ($96.2B / $59.7B) and its axis label is bold.
   - Bars start at zero, ticks are compact ($25B) and the grid is a solid hairline.
   - Revenue and net income are separated by lightness as well as hue.
3. **Colour means one thing.** Green and red mean direction only, and always come with ↗/↘ and a sign. A 0.0pp change is a neutral grey chip. Capex up and shares down are neutral too, because up isn't always good. Blue means "checked". Say this sentence out loud, because judges notice semantic colour.
4. **It stays familiar for the finance user.** KPI cards, then the chart, then the table with the latest column tinted. It's the dashboard Amir already reads, so there's nothing to learn.
5. **There's a human in the loop at the right moment.** The filing picker ("I found 4 filings… Add all / Pick") puts the analyst in control of what's on the desk, before any number appears.
6. **Mubit is made concrete.** Each answer says how many calls it recorded for training. The panel then *replays the actual recorded conversations*. That turns "we fine-tune on usage" from a claim into something the judges can click.
7. **Restraint.** One accent, no glow, no gradient text, warm graphite, and a floating chat card that never covers the data. It looks calm next to the typical neon AI dashboard.
