# MuTick: pitch review

Reviewed as an early-stage investor on a hackathon panel, 25 Oct 2026, about 01:00 London (six hours before code freeze).
I read `README.md`, `OVERVIEW.md` and `docs/mubit-training.md`, and walked the app at :3100 on the scripted fake model, at 1440×900. Path: start screen, "NVIDIA, last 4 quarters", Add all, the dashboard, "4 sources", "Answered through Mubit", the Mubit panel, and one follow-up question.

## Score: 7 / 10

**Verdict.** This is a working product with a real user and a real pain behind it, and a careful build: fiscal-calendar labels, a derived Q4 that is flagged as derived, a model that never does arithmetic, and every figure linked to the SEC. That puts it ahead of most hackathon entries. The weak spot is the reason this event exists. "Why Mubit" is **told, not shown.** The Mubit panel is the right idea, a five-step track from calls recorded to answering calls, but on stage it stops at step 2: "Examples kept —", "Own model trained: Not yet". The judges also have to infer *why this product in particular* benefits from Mubit. The best answer is already in the build and never said out loud: **finance has an answer key.** The SEC's XBRL data tells you whether an answer is right, so MuTick can tell Mubit which calls deserve to be kept. Say that, show the panel with tonight's real kept count, and this is an 8. The README and OVERVIEW also contradict each other in places, and AI judges will read both. Fix that and you stop losing points you've already earned.

## The pitch in one sentence

Today the start screen says *"Read every earnings filing like an analyst would."* It's a good line, but it names neither the user nor the Mubit loop. The README tagline, *"A model that learns your house rules from reality"*, names the loop but not the user. Join them:

> **MuTick is a research desk for equity analysts: ask about any US company and get its last four quarters from the SEC filings, every number sourced, while each AI call trains a model the team owns, through Mubit.**

A shorter version for the opening line on stage:

> "Analysts re-key the same numbers from the same filings every quarter. MuTick does it with sources, and the work itself trains a model the team owns."

## Why Mubit: shown or told?

| What a judge needs to see | Today | Shown? |
|---|---|---|
| Every call goes through Mubit | "Answered through Mubit · 3 calls recorded for training" under each answer, which opens to show `mreq_…` request ids | **Shown**, well |
| What's being learned from | Panel: "Recorded for training" list, 8 desk rules | Partly. The list reads "NVIDIA 01:06, 2 questions" eight times, so you can't see *what* was asked |
| Progress towards an owned model | The 5-step track: 251 recorded, 22 sent for review, kept —, trained "Not yet", answering "Not yet" | Shown, but stalls at step 2 |
| Why *this* product needs Mubit | Not said anywhere in the app | **Told only in the README**, and only partly |
| What gets better over time | "trains a small model of MuTick's own" | Told. Cost and speed are never measured, and it's right that they aren't claimed |

**The argument to make (true to the code, and it matches what Mubit's own site rewards):** mubit.ai says it ties traces to *verified outcomes* (tests, app checks, human feedback) and builds task-specific models you own. MuTick has an unusually strong outcome signal: XBRL ground truth, arithmetic checks, quote matching (the verifiers in `extraction/`) and analyst corrections. It's a repeated, narrow, checkable task, which is exactly what a small owned model is for. One caution: `OVERVIEW.md` says a direct correction-submission path to Mubit "still needs verification". So say *"our checks tell us which calls are right"*, not *"we send our checks to Mubit"*, unless you've wired that up.

## The 3-minute demo

**Before you go on:** run on live Mubit, not `fake-llm`. On the fake model every timing reads "0.0s" and follow-ups answer "I'm the scripted…". At about 06:30, open the Mubit console and put tonight's kept count (and the adapter status, if there is one) into the panel through "Update". Have the console's task History tab open in a second browser tab. Start from a fresh desk at `/`.

| Time | Click | Say |
|---|---|---|
| 0:00 | Nothing. Start screen on show | "Every quarter, analysts re-key the same numbers out of the same SEC filings. Ask ChatGPT for NVIDIA's latest quarter and it tells you NVIDIA hasn't reported yet, or quotes adjusted EPS when your desk uses GAAP." |
| 0:20 | Click **NVIDIA, last 4 quarters** | "One question. It found the four filings on the company's own fiscal calendar, Q3 FY2026 to Q2 FY2027, and it asks before adding them." |
| 0:35 | Click **Add all** | "The chat moves aside and the desk lays out what an analyst would build by hand." |
| 0:45 | Hover the **Q4 FY2026** bar, then point at the **D** marks in the table | "There's no 10-Q for a fourth quarter, so Q4 is the full year minus nine months, marked D. The model never does arithmetic: margins and changes are computed in code from reported figures." **← wow #1: the domain detail a finance judge checks.** |
| 1:10 | Click **4 sources**, then one **SEC ↗** | "Every figure traces back to the SEC filing. Click it and you're in the document." |
| 1:30 | *(live only)* Click **What drove revenue growth in Q2 FY2027?** | "Text questions are answered from the filing itself, with numbered citations." Skip this on the fake model. |
| 1:55 | Expand **Answered through Mubit** | "Every AI call goes through Mubit. Here are the request ids." |
| 2:05 | Open the **Mubit panel** (top-right icon) | "This is why Mubit. Finance has an answer key: the SEC's XBRL data tells us which answers are right. Mubit keeps the good calls and trains a small model the team owns. Here's where we are tonight: [N] calls recorded, [K] examples kept, first model [not yet / in silent test]." **← wow #2: point at the track, then at the rules R1–R8.** |
| 2:35 | Switch to the Mubit console History tab (optional, 5 s) | "Real reviewer runs from tonight, not a mock-up." |
| 2:45 | Nothing | "Through the desk, the same model went from 2 of 13 to 13 of 13 on our NVIDIA benchmark. The next step is the same answers from a model we own, on fewer frontier calls. We haven't measured that yet and we won't claim it until we do." |

**Skip:** the "Document extraction · 0 requests · N runs" strip, "Pick", Microsoft FY2026, the comparison prompt, uploads, Langflow, and the extraction API. Each is a detour, and "0 requests" looks broken.

**If you have 20 seconds spare**, use "NVIDIA vs Microsoft vs Apple". It shows the fiscal-calendar alignment across companies, which is hard to do and easy to see.

## Credibility: what gets challenged

- **"Every number is checked against SEC XBRL"** (sources dropdown, `components/dashboard/dashboard.tsx:131`) and **"checks the numbers against the SEC's data"** (start screen, `components/empty-desk.tsx:67`). The dashboard figures *come from* XBRL, so "checked against" is circular to a sharp judge. Checking against XBRL applies to the extracted text blocks, not the headline numbers. Say "from the SEC's XBRL data".
- **13/13 vs 2/13.** The baseline is a bare model with no tools, so it measures the desk, not Mubit. Say that before a judge does.
- **Cost and speed.** Not measured. Desk p50 is 4.6 s against 3.7 s for the bare model, so it's slower today. Never say "cheaper" or "faster" in the present tense.
- **Owned model.** None trained yet. The realistic best case by 09:00 is a first adapter in silent test (`docs/mubit-training.md`).
- **Numbers a finance judge will hover:** Q1 FY2027 net margin 71.5%, and Q2 FY2027 cash from operations −52.2% Q/Q while revenue is up 17.9%. Know why: cash from operations for Q2 is derived (six months minus Q1, marked D). Amir should have the one-line reason for each ready.
- **Two task counts.** The README says 636 `desk_agent` calls; the panel says 251 and 1,036. Each is right for its own task or period. Say which on stage, or stick to one.

## Market

**Is "analysts reading filings" a believable wedge?** Yes, but it's crowded. AlphaSense, Hebbia, Rogo, Fintool, BamSEC and Daloopa all sell "AI over filings", and Daloopa sells exactly "numbers from filings, linked to source". The wedge that's actually yours is narrower and stronger: **the desk's own conventions** (GAAP vs adjusted, fiscal calendars, three-month vs year-to-date columns) **applied every time and turned into rules**, on a model the team owns and runs at small-model cost. That fits a smaller fund, IR team or boutique research shop that can't justify a terminal seat per analyst. Name that buyer.

**Against the competition, in one line:**

> Bloomberg and Koyfin give you the numbers, AlphaSense finds the paragraph, and ChatGPT guesses. MuTick reads the filing your desk's way, shows its source, and trains a model your team owns on the work it already does.

## Top 5 changes before the 07:00 freeze

Each takes under 20 minutes, highest impact first.

1. **Put tonight's real Mubit numbers on screen (10 min, ~06:30).** In the Mubit console, read the kept count and adapter status for `desk_agent` and `section_extractor`, enter them through the panel's "Update", and take a screenshot of the History panel as a backup. An empty "Examples kept —" is the most expensive dash in the product. If an adapter exists, add one line to the README Results section: "First adapter v1 in silent test, [x]% on held-out cases".
2. **Say "why Mubit" in the app, once (10 min, copy only).** Change the Mubit panel intro (`components/mubit/mubit-panel.tsx`) from "Every AI call MuTick makes goes through Mubit. It keeps the good answers and trains a small model of MuTick's own from them." to: **"Every AI call goes through Mubit. Filings come with an answer key, the SEC's XBRL data, so the desk knows which answers are right. Mubit keeps those and trains a small model MuTick owns."** Use the same sentence as the spoken line at 2:05.
3. **Name the user and fix the circular claim on the start screen and sources (10 min, copy only).** Start screen subtitle (`components/empty-desk.tsx:67`): "For equity analysts. Ask about any US company: the desk finds the filings, takes the numbers from the SEC's XBRL data and lays them out beside the chat, every one linked to its source." Sources dropdown (`dashboard.tsx:131`): "Figures from the SEC's XBRL data. Text quoted from these filings."
4. **Make the README and OVERVIEW agree (15 min).** AI judges read both. Add a 4-line **"Status at code freeze"** box under the README tagline: what's live (desk, SEC/XBRL, every call through Mubit, N calls recorded), what's measured (13/13 vs 2/13), what isn't (cost, speed, owned model), and the one-sentence pitch. In `OVERVIEW.md`, rename "Earnings Desk — Extraction Overview" to "MuTick — Extraction overview" and replace "no benchmark has been run" with a pointer to the README Results. Right now it reads as a contradiction.
5. **Take the dev chrome off the demo path (15 min).** Hide the "Document extraction · 0 requests · N runs" strip above the chat on the desk (or show it only once there's a request), and hide a latency of "0.0s" rather than printing it. If there's time instead of the strip fix: show the first question's text in the "Recorded for training" rows, rather than "NVIDIA · 2 questions", so judges can see what's being learned from.

## Five hard judge questions

1. **"You haven't trained anything. Where's the improvement?"**
   "Right, no model of our own yet. Mubit reviews 200 calls per task a day and trains once 25 are kept. Tonight we have [N] recorded and [K] kept. The first adapter starts as a silent test on 10% of calls, and it only answers once it matches the frontier model on held-out cases. What we're showing is the pipeline and the data, not a gain."
2. **"13 of 13 against 2 of 13: isn't that just giving a model tools?"**
   "Yes. That benchmark measures the desk, not Mubit. Mubit's job is the next step: the same 13 of 13 from a small model we own. We've built the paired benchmark for that and haven't run it live, so we don't claim it."
3. **"Koyfin and Bloomberg already have these numbers. Why does this exist?"**
   "For headline numbers they do. We're for the work after that: reading the text with citations, applying the desk's conventions every time, and turning a correction into a rule, on a model the team owns rather than rents."
4. **"Is it cheaper or faster?"**
   "Not yet, and we haven't measured it. Through the desk it's 4.6 s p50 against 3.7 s for the bare model. The saving should come from moving calls to a 4B model, and we'll publish it once we've measured it."
5. **"Why would an analyst trust AI with numbers?"**
   "Because the AI doesn't produce the numbers. They come from the SEC's XBRL data, the arithmetic is in code, derived quarters are marked, every figure links to the filing, and it declines advice and forecasts. The model chooses what to show and reads the text."

## What's strong

- **Real data, careful finance.** Fiscal-calendar labels, Q4 derived and flagged, restatements marked, margins computed in code. An analyst on the panel will notice.
- **The flow.** One question, the agent asks before adding, the chat moves aside for a familiar dashboard (KPI cards, chart, quarterly table). It reads as a product, not a prototype.
- **Mubit is visible on every answer.** The "Answered through Mubit" line with request ids is the right amount of proof, in the right place.
- **The 5-step learning track** in the Mubit panel is the best "why Mubit" asset in the build. It just needs tonight's numbers.
- **Honesty.** The README says what isn't measured and the UI doesn't claim gains. With AI judges checking claims against code, that's worth more than a bigger number.
- **Desk rules R1–R8** show the domain problem in a way a non-finance judge can understand at a glance: "EPS means diluted GAAP EPS", "numbers in parentheses are negative".

Sources: [mubit.ai](https://mubit.ai). No public page for the Night Shift × Mubit event came up in search.
