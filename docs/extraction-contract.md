# Extraction contract

For whoever builds the extraction module. The rest of the desk (filing search, XBRL numbers,
agent, dashboard) is built around this contract, so the two halves meet without either side
waiting on the other. Anything marked **fixed** is part of a Mubit task fingerprint or a type the
dashboard reads: change it only after agreeing with the desk side.

## 1. What the module does

The desk sends the module one **extraction job** per filing: the filing's details plus its **raw
HTML**, exactly as the SEC serves it. The module never calls the SEC itself. It:

1. splits the HTML into sections,
2. calls the **section_extractor** LLM task once per section, through Mubit,
3. checks every extracted block (verifiers),
4. re-runs failed sections once with the broken rule added,
5. stores sections, blocks and checks, and streams progress to the UI.

The agent never reads filings itself. Its `add_filings` tool builds the job, calls `extractFiling`
and gets back only the summary counts.

## 2. The job you receive (`ExtractionJob`, fixed)

Defined in `packages/shared/src/extraction.ts`:

```ts
interface ExtractionJob {
  accession: string;                 // "0001045810-26-000075"
  projectId: string;                 // the desk to stream progress to
  company: { cik: number; ticker: string; name: string; fiscalYearEnd: string /* "01-31" */ };
  filing: {
    form: string;                    // "10-Q" | "10-K" | "8-K"
    periodEnd: string;               // quarter end; for an 8-K, the release date
    fiscalYear: number;              // 2027
    fiscalPeriod: string;            // "Q1"–"Q3", "FY" for a 10-K
    quarter: string;                 // "Q2 FY2027"; a 10-K is "Q4 FY2026"; an 8-K, the quarter it reports
    filedAt: string;
  };
  documents: { type: string; url: string; html: string }[];  // main document first
}
```

| Form | `documents` |
|---|---|
| 10-Q, 10-K | One: the filing itself (`type` "10-Q"/"10-K"), 1–2 million characters of HTML with inline XBRL |
| 8-K (Item 2.02) | The press release (`EX-99.1`, a few hundred thousand characters) and, when filed, CFO commentary (`EX-99.2`). The 8-K's own cover page is left out |

The HTML is untouched: no cleaning, no trimming. In 10-Qs and 10-Ks, reported numbers are wrapped in
inline XBRL tags (`<ix:nonFraction name="us-gaap:Revenues" contextRef=… scale="6" …>`), which tell
you the concept, period and scale of each figure; use them if they help.

**Real samples to build against:** with the API running,

```bash
pnpm --filter @desk/api dump-filings --ticker NVDA --quarters 4 --releases 2
```

writes `samples/NVDA/<accession>/job.json` (the job without HTML) and the raw HTML files next to it.
Or over HTTP: `GET /filings/<accession>/job` (job with document sizes) and
`GET /filings/<accession>/html?doc=0` (one document's raw HTML).

## 3. Where it plugs in

- Code lives in `apps/api/src/extraction/` as a Nest `ExtractionModule` whose `ExtractionService`
  implements `ExtractionApi`:

  ```ts
  extractFiling(job: ExtractionJob): Promise<ExtractionSummary>
  ```

  Idempotent: calling it again for a finished filing returns its summary without new LLM calls.

  ```ts
  rereadSections(request: RereadRequest): Promise<void>
  // { projectId, sectionIds, correctionId, ruleCode }
  ```

  Called when a person corrects a block and confirms a rule (section 7). Re-run section_extractor on
  those sections **even if they were read before**, with the current active rules, replace their
  blocks and checks, and stream `block` / `extraction` events. Not awaited by the desk.
- Provide it under the injection token `EXTRACTION_API` (`apps/api/src/core/extraction.token.ts`):
  `providers: [ExtractionService, { provide: EXTRACTION_API, useExisting: ExtractionService }]`,
  `exports: [EXTRACTION_API]`.
- In `apps/api/src/agent/agent.module.ts`, replace `ExtractionStubModule` with your `ExtractionModule`. The
  stub (`apps/api/src/extraction-stub/`) only marks filings ready so the desk works before
  extraction lands; delete it once yours is in.
- The agent's `add_filings` tool links the filing to the desk (`project_filings`; a filing can be on
  several desks, so read it once and reuse its blocks), sets `status: 'queued'`, fetches the
  documents, then calls `extractFiling` **without awaiting it** and tells the user the filings are
  being read. Progress reaches the UI through your events (section 8).
- Make every LLM call through `MubitService.respond(params, { task: 'section_extractor',
  promptCacheKey: accession })` (`apps/api/src/mubit/mubit.service.ts`). It adds the Mubit
  headers, logs the call in `llm_calls`, and returns `{ response, requestId }`.
- For the xbrl verifier, import `EdgarModule` (`apps/api/src/edgar/edgar.module.ts`) and use
  `XbrlService.quarterValue(cik, metric, periodEnd)`.

**What to read in each document:**

| Form | Read these parts |
|---|---|
| 10-Q | Part I Item 1 financial statements (income statement, cash flow), the segment note, Part I Item 2 MD&A |
| 10-K | Item 7 MD&A, Item 8 income statement, cash flow and segment note, Item 1A risk factors |
| 8-K | Headline, highlights, income statement table, outlook (EX-99.1); commentary (EX-99.2) |

Fourth quarters have no 10-Q; the 10-K covers them. The desk derives Q4 numbers from XBRL
(full year − nine months), so the extractor should report what the 10-K prints (often the full
year) with the right `period.months`, never compute Q4 itself.

## 4. Sections (table `sections`)

| Column | Value |
|---|---|
| `id` | `<accession>:<ordinal>`, e.g. `0001045810-26-000075:12` |
| `accession` | The filing |
| `item` | `Item 2`, `Item 7`, `Note 14`, `EX-99.1`… |
| `title` | Heading as printed |
| `kind` | `text` or `table` |
| `ordinal` | Order in the document, from 0 |
| `text` | **Exactly** the `content` sent to the extractor. Tables as Markdown. Spans index into this. |
| `charCount` | `text.length` |

Keep each section well under ~30,000 characters (split long MD&A by sub-heading). Small inputs
suit the Qwen3-4B/8B adapter Mubit trains, and examples over 256 KB are dropped from training.

## 5. The section_extractor task (fixed)

One Mubit task. Mubit groups calls by **model + system prompt + tools + output format**, so these
must stay identical on every call. Copy Quell's `frozen.ts` pattern: hash them and refuse to start
if the hash changes.

| Part | Value |
|---|---|
| API | OpenAI **Responses API** through `MubitService.respond` |
| Model | `config.extractorModel` (default `gpt-6-luna`: reasoning model, `temperature` 1 only, use `max_output_tokens`) |
| Instructions | Your frozen system prompt. General rules only, no company specifics |
| Output format | `text.format = { type: 'json_schema', name: 'section_extraction', strict: true, schema: strictJsonSchema(ExtractorOutput) }` |
| User message | `JSON.stringify(input)` where `input: ExtractorInput` (`packages/shared/src/blocks.ts`) |
| `prompt_cache_key` | The accession number (Mubit uses it as the session, which decides its held-back test cases) |

Mubit rules that matter:

- **Do not** send `x-middleware-record: off` or `x-middleware-store: false` on extractor calls.
  They must be recorded to become training examples.
- **Do not** send `store: true` or `metadata` (refused on the starter credit).
- Store the `x-middleware-request-id` response header on every block (`blocks.mubitRequestId`)
  and log each call in `llm_calls` (`task: 'section_extractor'`).
- **Lessons go in `input.rules`, never in the system prompt.** Every call carries the text of all
  active rules from the `rules` table, ordered by `code`. That keeps one task, and training and
  real use see the same input.

### Input (`ExtractorInput`, fixed)

```json
{
  "company": { "ticker": "NVDA", "name": "NVIDIA CORP", "fiscalYearEnd": "01-31" },
  "filing": { "form": "10-Q", "fiscalYear": 2027, "fiscalPeriod": "Q2", "periodEnd": "2026-07-26" },
  "section": { "id": "0001045810-26-000075:12", "item": "Item 2", "title": "Management's Discussion and Analysis", "kind": "text" },
  "rules": ["R1: …", "R3: …"],
  "content": "<the section text>"
}
```

### Output (`ExtractorOutput`, fixed)

`{ "blocks": ExtractedBlock[] }`. Every field is required; use `null` when it doesn't apply.

| Field | Meaning |
|---|---|
| `type` | `metric` (one number), `table` (a table worth showing), `statement` (an explanatory sentence, e.g. what drove revenue), `guidance` (outlook), `risk`, `segment` (a number for one segment) |
| `key` | For headline numbers, one of `METRIC_KEYS` (`packages/shared/src/metrics.ts`): `revenue`, `cost_of_revenue`, `gross_profit`, `research_and_development`, `operating_income`, `net_income`, `eps_diluted`, `eps_basic`, `diluted_shares`, `operating_cash_flow`, `capex`. For segments `segment.<snake_name>.<metric>`, e.g. `segment.data_center.revenue`. Otherwise `null` |
| `label` | Short display label |
| `period` | `{ end: "YYYY-MM-DD", months: 3 \| 6 \| 9 \| 12 }`: the column the number came from |
| `value` | The number **as printed**: `57,006` in a table "in millions" is `57006` with `scale: "millions"`. Parentheses mean negative. EPS as printed (`2.46`) |
| `unit` | `USD`, `USD/share`, `shares`, `percent` |
| `scale` | `units`, `thousands`, `millions`, `billions` (from the table header or the text) |
| `text` | One-sentence summary for `statement`, `guidance` and `risk` blocks |
| `quote` | **Copied character for character** from `content`: the sentence or table row the value came from |

Example (from an income statement table "in millions, except per share data"):

```json
{ "blocks": [
  { "type": "metric", "key": "revenue", "label": "Revenue", "period": { "end": "2026-07-26", "months": 3 },
    "value": 96221, "unit": "USD", "scale": "millions", "text": null, "quote": "| Revenue | $ 96,221 | …" },
  { "type": "statement", "key": null, "label": "Data Center growth", "period": { "end": "2026-07-26", "months": 3 },
    "value": null, "unit": null, "scale": null,
    "text": "Data Center revenue rose on demand for Blackwell systems.", "quote": "<exact sentence>" }
] }
```

## 6. Stored blocks (table `blocks`)

| Column | Value |
|---|---|
| `id` | `<section id>:<n>` |
| `sectionId`, `accession` | Where it came from |
| `type` … `quote` | From the extractor (`periodEnd` and `months` from `period`) |
| `spanStart`, `spanEnd` | Character offsets of `quote` inside `sections.text`; `null` if not found. The dashboard highlights this span and chat citations jump to it |
| `status` | `verified`, `fixed`, `review` or `unchecked` (below) |
| `mubitRequestId` | The extractor call that produced it |

`blocks.tsv` (full-text search) fills itself. The dashboard and the agent's `search_blocks` and
`get_blocks` tools read this table directly, so the column meanings above are fixed.

## 7. Verifiers (table `checks`)

One row per verifier per block: `{ id, blockId, verifier, passed, detail }`, with `verifier` from
`VERIFIERS`: `schema`, `quote`, `period`, `xbrl`, `arithmetic`.

| Verifier | Passes when |
|---|---|
| `schema` | The output parses with `ExtractorOutput` |
| `quote` | `quote` is found in the section text, and `value` (in any printed form: commas, `$`, `(…)`, "billion") appears in it |
| `period` | `period.end` is the filing's period end (or the prior-year comparative), and `months` is 3 for quarterly 10-Q figures (10-K: 12) |
| `xbrl` | For blocks whose `key` is a metric key: `value × scale` is within **0.5%** of `XbrlService.quarterValue(cik, key, period.end).value` (EPS within **0.01**). Compare only like with like: `quarterValue` is three-month; for a 12-month 10-K figure, skip or compare with the full-year fact. Skip when the XBRL value is `null`. A `derived` per-share value is `approximate`; use a looser bar |
| `arithmetic` | Segment revenues sum to total revenue (±1%); gross profit = revenue − cost of revenue (±0.5%) |

`XbrlService.quarterValue` returns raw units (USD, not millions) and says how it got the number:
`reported`, `derived` (Q4 = full year − nine months) or `computed`.

**Status:** `verified` when every applicable check passed first time; `fixed` when they passed after
the re-run; `review` when something still fails after one re-run; `unchecked` before checks run.

**Re-run:** when a check fails, map it to a rule (table below), add the rule to `rules` if it isn't
active yet (`source: 'verifier'`), and run that section once more with the updated `input.rules`.
That second call is the corrected example Mubit can learn from. Never put the expected answer
(e.g. "XBRL says 96,221") in the input; only the general rule.

**People correct blocks too.** In the filing reader, a person flags a block ("this is the nine-month
figure"), picks an existing rule or writes a new one, and confirms. The desk then:

1. stores a row in `corrections` (block, note, rule) and makes the rule active (`source: 'user'`),
2. emits `{ type: 'block', id, status: 'unchecked' }` for the blocks being re-read,
3. calls `rereadSections` with the block's section plus the sections with the same `item` and `kind`
   in the project's other filings.

Your re-run calls carry the new rule in `input.rules`, so they are the corrected examples Mubit keeps.
Set the re-read blocks' status as usual (`fixed` when they pass now). Keep block ids stable where you
can (`<section id>:<n>`), so a correction still points at its block after the re-read.

The desk seeds these starting rules on startup (`source: 'seed'`, `apps/api/src/rules/seed-rules.ts`);
read active rules from the `rules` table ordered by `code`:

| Code | Text |
|---|---|
| R1 | EPS means diluted GAAP EPS. Put adjusted (non-GAAP) EPS in a separate statement block, never under `eps_diluted`. |
| R2 | `revenue` is total consolidated revenue, never a segment, product line or "organic" figure. |
| R3 | Take numbers from the three-month column. Year-to-date columns get `months` 6, 9 or 12. |
| R4 | Fiscal labels follow the company's fiscal year, as given in `filing`. |
| R5 | Read the scale from the table header ("in millions", "in thousands") and set `scale` to match. |
| R6 | Numbers in parentheses are negative. |
| R7 | Guidance is "raised" or "lowered" only if the midpoint of the full-year range moved. |
| R8 | Use `null` when a figure is not stated. Never estimate or compute one. |

## 8. Progress and status

- `filings.status`: `queued` → `reading` → `ready` (or `failed`).
- After each section, emit through `EventsService.emit(projectId, event)` (`apps/api/src/core/events.service.ts`):

  ```ts
  { type: 'extraction', accession, status, sectionsDone, sectionsTotal, fixed, review }
  ```

  and `{ type: 'block', id, status }` whenever a block's status changes.
- Run sections with bounded concurrency (4–8 at a time) so a burst of filings doesn't trip
  rate limits.

## 9. Test filings

All found by `GET /filings/find?ticker=NVDA&forms=10-Q,10-K&lastNQuarters=4` (and `forms=8-K&lastNQuarters=2`), and written by `dump-filings`:

| Accession | Form | Period end | Quarter |
|---|---|---|---|
| 0001045810-26-000075 | 10-Q | 2026-07-26 | Q2 FY2027 |
| 0001045810-26-000052 | 10-Q | 2026-04-26 | Q1 FY2027 |
| 0001045810-26-000021 | 10-K | 2026-01-25 | Q4 FY2026 |
| 0001045810-25-000230 | 10-Q | 2025-10-26 | Q3 FY2026 |
| 0001045810-26-000073 | 8-K | released 2026-08-26 | Q2 FY2027 (EX-99.1, EX-99.2) |
| 0001045810-26-000051 | 8-K | released 2026-05-20 | Q1 FY2027 (EX-99.1, EX-99.2) |

XBRL answer key for the same quarters: `GET /metrics?ticker=NVDA&metrics=revenue,net_income,eps_diluted&periodEnds=2025-10-26,2026-01-25,2026-04-26,2026-07-26`
(revenue Q2 FY2027 = 96,221 million, reported; Q4 FY2026 = 68,127 million, derived).
