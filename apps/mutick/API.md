# Earnings Desk API contract

The UI talks to the backend only through `src/api/client.ts`. Today that file returns sample data. To connect the real backend, keep each function's signature and return type and replace its body with a `fetch` call to the endpoints below. The JSON shapes are the TypeScript types in `src/api/types.ts`. Those types are the contract.

Money is USD millions unless a field says otherwise. Dates are `YYYY-MM-DD`.

## Endpoints

| Client function | Method and path | Request | Response |
|---|---|---|---|
| `trackCompany(query, onStep)` | `POST /api/track` | `{ "query": "Track NVIDIA" }` | Server-sent events: zero or more `step` events (`ProgressStep`), then one `result` event (`{ company: Company, releases: Release[] }`), or an `error` event (`{ message }`) |
| `uploadRelease(file, onStep)` | `POST /api/upload` | multipart form, field `file` | Same event stream as `/api/track` |
| `submitCorrection(input)` | `POST /api/corrections` | `{ releaseId, field, from, to, rule?, reason?, requestId? }` | `Correction` (with `by` and `at` set by the server) |
| `getMubitStatus()` | `GET /api/mubit` | | `MubitStatus` |
| `getOverview(ticker)` | `GET /api/companies/{ticker}/overview` | | `CompanyOverview`: quarterly fundamentals (oldest first), about three years of daily closes, 8-K dates |
| `ask(question, release?)` | `POST /api/ask` | `{ question, releaseId? }` | `Answer` |

### Progress steps
Send one `step` event per stage so the user sees the pipeline working: found the 8-K (with `href` to EDGAR), read the press release, extracted N fields, arithmetic check, SEC check, earlier quarters added. `tone` is `ok`, `issue` or `wait`.

### Releases and the two extractions
Every `Release` carries two extractions, `before` and `after`:
- `before`: the frontier model's answer with the production prompt, plus each field's check result. This is what the analyst reviews.
- `after`: the answer after learning (the Mubit-trained small model, or the frontier model with learned corrections fed in as examples).

`seconds`, `costUsd`, `servedBy` and `measuredAt` must be real measurements, and `measuredAt` must say when and how they were measured (for example "Measured 24 Oct, Try models, 20 held-out releases"). The UI shows these labels next to the numbers. Mubit doesn't let code call an adapter directly, so never report adapter speed you didn't measure.

### Fields
- `status`: `verified_math` (arithmetic check passed), `verified_sec` (matches the 10-Q), `flagged` (a check failed or a judgement call is needed), `corrected`, `waiting` (10-Q not filed yet).
- `check`: which check produced the status, and one plain sentence explaining it.
- `sourceSegment`: id of the excerpt segment the value was read from.
- `candidates`: numbers in the excerpt the analyst can pick when correcting a flagged field. Include the right one and the one the AI took.
- `learnedFrom` (after only): a short line such as "Learned from analyst fixes on 14 similar releases (R1)".

### Excerpt
`excerpt` is the trimmed release text as a list of segments. Plain text segments have no `id`. Every number a field or candidate can point at is its own segment with an `id`.

### Corrections
A correction arrives when the analyst clicks a candidate, types a value, or keeps the AI's value. Store it with the release, field, rule and the original Mubit request ID. Use stored corrections as examples for similar releases, so the provider's recorded answers improve and Mubit learns from them.

### Audit fields on corrections
`by` is who made the fix. `reason` is required when the analyst keeps a value a check flagged. `requestId` is the Mubit `x-middleware-request-id` of the extraction call that produced the original value. The UI shows all three in each fixed field's history and in Copy and Export CSV.

### Mubit status
`MubitStatus` mirrors what the Mubit console shows for the task: stage (collecting, reviewing, training, testing, passed, silent test, partial rollout, live), kept examples, new examples toward the next version, each version's test result (Passed, Below target or Prompt only, with matched % against the % needed), the share of calls answered by the provider and by Mubit, calls through Mubit, routing per task, and a timeline of events. Mubit has no documented API for this yet, so fill it from the console by hand at first, and set `measuredAt` to say so (for example "From the Mubit console, Sat 17:30").

### Mubit status: retraining rule, gates and live note (added in v3)
- `liveExamples` and `minNewFraction`: Mubit trains the next version only after `threshold` new kept examples **and** at least `minNewFraction × liveExamples` (defaults 25 and 0.5, from the console's Settings). The UI shows the larger of the two.
- `gates.silentTest`: graded pairs and sessions against Mubit's promotion minimums (50 pairs, 10 sessions) and the pass rate against the 90% bar.
- `gates.rollout`: real calls answered during partial rollout against the 100 needed.
- `liveNote`: one sentence on what live traffic looks like now, e.g. "Live traffic: v2 answers 10% of calls (partial rollout)". The After view shows it next to answers compared in Try models, so the two are never confused.

### After extractions
Label `after.measuredAt` with how the answers were produced, e.g. "Compared in Try models, 20 held-out cases". Don't call them served unless Mubit's Served by column shows the adapter answered them.

### Corrections
A typed correction always carries a `reason` saying where the value comes from. A picked number carries "Picked from the release: …". Kept values carry the analyst's reason. `at` is ISO 8601 in UTC.

## Company overview

The Overview tab mirrors the Fundamentals Tracker. They draw from `CompanyOverview`:

- `quarters`: one `QuarterRow` per fiscal quarter in USD millions (EPS in USD, shares in millions). Filed quarters come from SEC XBRL. A quarter tracked here carries its `releaseId`.
- The UI overlays the release's extracted fields onto that quarter (revenue, net income, diluted EPS, diluted shares), so analyst fixes and flagged values show in the table and charts. The backend should send the stored quarter as filed or as extracted; it does not need to apply corrections.
- `earningsDates` line up with `quarters` from the end: the last date is the last quarter's 8-K.
