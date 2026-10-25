# MuTick, reviewed by a buy-side analyst

Reviewed on 25 Oct 2026 against the local build on `design-polish` (port 3100, fake model) at 1440×900. I ran: NVIDIA last 4 quarters → Add all; the sources menu and the Q2 FY2027 10-Q in the reader; the Ask next follow-ups; on a new desk, NVIDIA vs Microsoft vs Apple; then Microsoft FY2026. I checked figures against NVIDIA, Microsoft and Apple releases and read `quarter-overview.tsx`, `compare-view.tsx`, `cell-value.tsx`, `ui/delta.tsx`, `xbrl/*`, `edgar/fiscal.ts` and `dashboard.service.ts`.

## Score: 6.5 / 10

**Verdict.** The numbers are right, and that is the hard part. Every revenue, net income, diluted EPS and gross margin figure I checked for NVIDIA, Microsoft and Apple matches the companies' releases. That includes the derived Q4s and NVIDIA's 52/53-week fiscal calendar (Q2 FY2027 = quarter ended 26 Jul 2026). Badges that show where a number came from (D, C, ~, R) are something Bloomberg doesn't give me, and I like them. But the dashboard reads every change as quarter-on-quarter only. Nobody on the buy side leads with Q/Q, and for seasonal names (Apple, Microsoft's June quarter) it misleads. The filing reader, which is what's supposed to set this apart from Koyfin, is broken on the filing I opened. A few labels (capex, the "D" footer, "every number is checked") would trip up a careful reader. Fix the Y/Y and the reader state and this is an 8.

## Top 5 fixes before the 07:00 freeze

All UI or labels, each under 30 minutes. None touch the agent's model, prompt or tools.

1. **Lead with Y/Y, keep Q/Q second.** `GET /views/compare?metric=<key>&tickers=<T>&periodEnd=<latest>` already returns `yearAgo` and `yoy` for a single ticker, margins in points included. I tested it: NVDA gross margin Q2 FY27 is +2.6pp Y/Y, and MSFT revenue Q4 FY26 is +17.7% Y/Y. In `quarter-overview.tsx`, fetch it for the 4 KPI keys and show "+105.9% Y/Y" as the main chip, with Q/Q as a smaller grey line underneath. Change the caption "Change vs Q1 FY2027" to "Y/Y vs Q2 FY2026 · Q/Q vs Q1 FY2027". If there's time, add a "Y/Y" column to the table beside "Q/Q". This is the single biggest credibility gain.
2. **Don't show the reader broken.** The NVDA Q2 FY2027 10-Q opens with about 30 sections all labelled "Document Document · 0 blocks", "0 EXTRACTED", and raw `|  |` table pipes in the text. (`/filings/0001045810-26-000075/sections` returns `sections: []`.) When a filing has no labelled sections or no blocks, show one plain state instead: "Not split into sections yet. Read the original on SEC ↗". Also hide the "Document extraction · 0 requests · 4 runs" strip and upload form at the top of the chat panel. To an analyst it looks like dev tooling.
3. **Fix three labels that overclaim or mislead.**
   - "Capital expenditure" → **"Capex (cash, PP&E)"**, with the tooltip "Purchases of property and equipment. Excludes finance leases." MSFT Q1 FY26 shows $19.39B, but the number the Street quotes is about $34.9B including finance leases. Without the label, an analyst will think it's wrong.
   - The footer "D derived (Q4 = full year − nine months)" → **"D derived from year-to-date figures (Q4 = full year − 9 months; quarterly cash flow = YTD − prior YTD)"**. Today, NVDA's Q2 and Q3 cash-flow cells carry a "D" the footer doesn't explain.
   - Sources menu: "Every number is checked against SEC XBRL" → **"Figures from SEC XBRL (the company's own tagged data). Text read from the filings below."** The dashboard *is* XBRL, so "checked against" is circular, and an analyst will spot that.
4. **Flag non-operating gains on net income.** When net margin is above operating margin, add a one-line note under the Net income KPI and a `*` on the net-margin cell: "Above operating income: includes non-operating items (e.g. investment gains)". This catches real cases in today's data:
   - NVDA Q1 FY27: net margin 71.5% vs operating margin 65.6%;
   - NVDA Q2 FY27: net income included a $7.8B equity gain;
   - MSFT Q2 FY26: net income $38.46B vs operating income $38.27B, from the OpenAI gain.

   Without the flag, "Net income +2.3%" (NVDA) and the 71.5% → 62.0% net-margin drop (−9.4pp, red) read as an operating story when they aren't.
5. **Make the compare view answer the question an analyst asks.**
   - "Highest: AAPL" (by absolute revenue) → **"Fastest Y/Y: NVDA +105.9%"**.
   - Add one line on the period: "All three quarters ended 27 Jun – 26 Jul 2026 (calendar Q2 2026)". The fiscal labels (Q3 FY2026, Q2 FY2027, Q4 FY2026) look mismatched until you read the dates, and they're actually well aligned.
   - On a desk with no subject company, drop the "NVDA vs Peers" colour split. Today it highlights whichever ticker was typed first.
   - Use company names in the heading, not the prompt text ("Compare NVIDIA, Microsoft and Apple revenue").

**Next, if there's time:**
- In KPI cards, change "from $57.01B" to "Q3 FY26 $57.01B". "From" reads as the prior quarter.
- Show "—" with the existing note as a tooltip in place of "n/a" for Q4 diluted shares.
- Change "24.48B shares" to "24.48B" (the row label already says shares).

## Numbers I believe are wrong

**1. NVIDIA per-share and share-count figures before the June 2024 10-for-1 split.** This is confirmed, though it isn't on the default demo path.

`GET /views/quarter-overview?ticker=NVDA&periods=2024-04-28,…` returns:

| Quarter | Diluted EPS shown | Split-adjusted | Diluted shares shown | Split-adjusted |
|---|---|---|---|---|
| Q1 FY2025 (ended 28 Apr 2024) | **$5.98** (R) | $0.60 | **2.489B** (R) | ~24.9B |
| Q2 FY2025 | $0.67 | $0.67 | 24.85B | 24.85B |

The cause is in `quarter-math.ts` `pickOriginal()`: "the original filing's value wins", so the pre-split 10-Q value beats the later restated comparatives. The R badge appears, but the table would show EPS falling about 89% Q/Q. For per-share and share-count metrics (`kind: per_share | average`), take the **latest-filed** value. Analysts want figures recast to today's share count. The default "last 4 quarters" view is unaffected. Any view going back 10+ quarters for NVDA (or any company with a split) is wrong.

**2. Nothing else.** Every figure I checked matches:

| Company · quarter | MuTick | Reported |
|---|---|---|
| NVDA Q2 FY27 (26 Jul 2026) | Rev $96.22B, NI $59.69B, EPS $2.46, CFO $24.08B | $96.2B, $59.688B, $2.46, $24.1B |
| NVDA Q1 FY27 | Rev $81.61B, NI $58.32B, EPS $2.39, GM 74.9% | $81.6B, $58.3B, $2.39, 74.9% |
| NVDA Q4 FY26 (derived) | Rev $68.13B, NI $42.96B, EPS ~$1.76, GM 75.0% | $68.1B, $42.96B, $1.76, 75.0% |
| NVDA Q3 FY26 | Rev $57.01B, NI $31.91B, EPS $1.30, GM 73.4% | matches |
| NVDA Q2 FY26 (year-ago) | Rev $46.74B (Y/Y +105.9%) | $46.7B, +106% |
| MSFT Q4 FY26 (derived) | Rev $90.01B (+17.7% Y/Y), NI $35.77B, EPS ~$4.81, OI $40.60B | $90.0B (+18%), $35.8B, $4.81, $40.6B |
| MSFT Q2 FY26 | NI $38.46B | $38.5B (incl. OpenAI gain) |
| AAPL Q3 FY26 (27 Jun 2026) | Rev $109.42B (+16.4%), year-ago $94.04B | $109.4B (+16%), $94.04B |

The fiscal labels are right for NVIDIA (FY ends late January), Microsoft (June) and Apple (late September).

## Wrong or misleading signals

- **Q/Q colours on seasonal businesses.** Microsoft's Q4 is +8.6% Q/Q in green, while the story is +18% Y/Y. Apple's December → March quarter would show a red −15% Q/Q in a healthy year. Fix 1 above solves this.
- **NVDA cash from operations −52.2% (red).** The number is correct (third-party coverage reports the same $24.1B, down 52%). But on a 4-quarter card with no Y/Y and no working-capital line, it looks like alarm. Y/Y context helps.
- **"0.0pp" gross margin** for NVDA (74.9% → 75.0%) is correct: the real change is under 0.05pp. Fine.
- **Capex and shares in neutral grey.** Correct, keep it.
- **Restated values are not used** (the original wins everywhere, not just per-share figures). For segment recasts or discontinued operations, an analyst wants the recast figure. The R badge is honest, but the default is the opposite of what Bloomberg or FactSet show.

## Language

- Good: Q/Q, pp, GAAP, "Diluted EPS (GAAP)", fiscal labels with period-end dates, "derived".
- Change:
  - "Capital expenditure" → "Capex", and say it's cash PP&E.
  - "Diluted weighted-average shares" → "Diluted shares (avg)".
  - "Cash from operations" → "Operating cash flow" or "CFO".
  - "Change vs Q1 FY2027" → state Y/Y or Q/Q.
  - "Highest" in compare → say on what.
- The table uses $B to two decimals. Fine for a dashboard, but an export would need $M with full precision.

## Workflow notes (with the fake model)

- The flow from "NVIDIA, last 4 quarters" to the 4 filings card, then to the dashboard, takes about 5 seconds and is excellent. The filings card (form, fiscal quarter, period end, filed date) is exactly the right first answer.
- Most "Ask next" chips ("What guidance did they give?", "Show cash from operations for each quarter", "Compare NVDA revenue with AMD and AVGO") fall through to "I'm the scripted fake model…" or reload the NVIDIA filings. If judges see the fake model, the chips are a dead end. Check which model the judges' build uses.
- Guidance is in the 8-K earnings release, not the 10-Q or 10-K. The sources list never includes the 8-K, so "What guidance did they give?" can't be answered from the desk's own sources.

## What would make me actually use it

1. Y/Y everywhere, with 8 quarters as the default so Y/Y is visible in the table and not only in a chip.
2. **Export**: a CSV or Excel of the table with the accession number per cell. The D/C/~/R provenance in a spreadsheet would beat TIKR on audit trail.
3. Segment revenue (Data Center vs Gaming for NVDA; Intelligent Cloud for MSFT; iPhone and Services for AAPL). XBRL has segment facts in the dimensioned data, though not in `companyfacts`.
4. The 8-K press release as a source, for guidance and the quarterly Q4 as reported. Today Q4 is derived even though the company printed it.
5. Free cash flow (CFO − capex) as a row, since both inputs are already there.
6. Click a number to jump to its line in the filing. The reader plus the accessions on every cell make this close.

## What's strong

- **The numbers are right**, and the dashboard says how each one was obtained. The D/C/~/R badges with tooltips ("9 months − 6 months") are better provenance than Koyfin or TIKR give.
- **The fiscal calendar is handled properly**: 52/53-week years, a ±21-day tolerance, and NVIDIA's FY2027 labelling.
- **Q4 derivation is correct** and visibly marked, including on the chart's x-axis.
- **Approximate derived EPS** is marked "~". That's honest, because per-share figures don't subtract cleanly.
- **The compare view picks the year-ago quarter**, not the prior quarter, and shows the period-end date per company. That is the right analytical choice.
- **Margins are in pp, and capex and shares are coloured neutral.** Someone who knows finance designed this.
- **It's fast.** From an empty desk to a full 4-quarter dashboard takes seconds, with every figure linked to an SEC filing.

## Sources

- NVIDIA Q2 FY2027 press release (8-K): https://www.sec.gov/Archives/edgar/data/0001045810/000104581026000073/q2fy27pr.htm
- NVIDIA Q4 FY2026 press release (8-K): https://www.sec.gov/Archives/edgar/data/1045810/000104581026000019/q4fy26pr.htm
- NVIDIA Q1 FY2027 coverage: https://www.telecomtv.com/content/digital-platforms-services/nvidia-announces-financial-results-for-first-quarter-fiscal-2027-55538/
- NVIDIA Q2 FY2027 cash flow, consensus and equity-investment gain: https://beancount.io/blog/2026/08/26/nvidia-fy2027-q2-earnings-analysis and https://www.webull.com/blog/304-Nvidia-Q2-FY2027-Earnings-Beats-Revenue-EPS-Estimates-Guides-Q3-to-108B
- Microsoft FY2026 Q4 press release (8-K Ex. 99.1): https://www.sec.gov/Archives/edgar/data/0000789019/000119312526323632/msft-ex99_1.htm
- Apple Q3 FY2026: https://9to5mac.com/2026/07/30/apple-reports-q3-2026-earnings-109-4-billion-in-revenue-up-16/
