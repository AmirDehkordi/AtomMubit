# Earnings Desk — System Test and Benchmark Plan

Status: harness implemented; **no live model benchmark or end-to-end system run has been performed**. The offline smoke test uses one synthetic text fixture, identical fake output for each arm, and reports latency and cost as unknown. It validates harness wiring only; it does not test the extraction engine, complete filings, real-document accuracy, or provider routing. See the [report](benchmark-report.md), [OpenRouter route and pricing notes](openrouter.md), and [integrated implementation plan](extraction-service-plan.md).

## Objectives

1. Verify the four API operations, automated ingestion, extraction, feedback, and historical reprocessing behave as designed.
2. Compare direct provider LLM calls with calls through Mubit on **latency, accuracy, and cost**.
3. Measure learning improvements separately from changes caused by routing, prompts, rules, or models.

The planned full-system harness runs as an optional Docker Compose profile alongside the NestJS API, worker, Langflow, client, and PostgreSQL. The implemented `benchmarks/run.mjs` is currently a smaller call-level pilot: offline fake mode by default, one synthetic simple-fact fixture, five paired repetitions, deterministic order seed, JSON report, schema checks, and fact/evidence scoring. Paid mode requires explicit flags, both credentials, per-arm input/cache-read/cache-write/output rates, a Mubit fee input, a spend cap, provider pinning, and one SDK attempt per call. The budget is a configured-rate reservation; unknown upstream retries, fees, or missing usage keep billed exposure unknown. This pilot does not execute the NestJS extraction pipeline or filing workflow.

## Measurement boundaries in the integrated system

| Layer | Unit | What it establishes |
| --- | --- | --- |
| Section model call | Identical frozen `ExtractorInput`, task/schema fingerprint, and Chat Completions settings | Direct-versus-Mubit call latency, raw extraction accuracy, and per-attempt cost |
| Filing extraction | Identical documents, prepared sections, Langflow revision, initial rule bundle, and verifier snapshot | Complete filing time/cost, section coverage, raw versus repaired block accuracy, and review rate |
| Desk planning | Identical natural-language request and captured tool/environment state | Existing desk agent's intent/tool-selection accuracy and its separate latency/cost |
| Client-visible operation | Accepted request/upload through persisted completion and browser delivery | Queue/workflow/event delivery latency and complete operational cost |
| XBRL/dashboard | Fixed source facts and calculation code | Deterministic financial-data correctness; never credited to the LLM extractor |

Do not pool sections, filings, chat turns, and XBRL facts into one latency or accuracy average. A correct XBRL dashboard cell can exist while extraction is still a stub or failed. Score source-linked model output before XBRL repair or result selection, then score final verified outputs separately.

`MubitService` now translates the desk agent's Responses contract to Chat Completions, because the configured Mubit compatibility route supports Chat Completions rather than Responses. It sets SDK retries to zero, uses a monotonic caller clock, and persists attempt rows with route/task/model/run/request/session context, latency, and token usage where returned. Errors are reduced to a safe class/status and returned request IDs are retained when available. Cost remains unknown in production telemetry. The translator groups new parallel tool batches, reads legacy alternating call/result history as sequential rounds, validates JSON-schema output locally, and fails closed for unsupported schema keywords. Mubit-side retries or serving changes cannot be ruled out from the client alone and must be checked in the provider/Mubit request record.

Production calls go through Mubit at `https://api.mubit.ai/compat/openrouter/v1`; the benchmark's direct arm uses `https://openrouter.ai/api/v1`. Both use the OpenAI Chat Completions SDK contract and the same model, provider, schema, messages, token cap, and retry policy. The direct arm is benchmark-only. Keep identical Langflow/gateway overhead for whole-workflow A/B runs; measure the provider-call boundary separately from gateway/flow time. Reuse shared Zod schemas and section preparation. Do not tune frozen task definitions to improve the locked evaluation set.

## Comparison arms

| Arm | Execution | Purpose |
| --- | --- | --- |
| A — Direct | Call the chosen OpenRouter model at `https://openrouter.ai/api/v1`, pinned to a provider with fallbacks disabled | Baseline |
| B — Mubit/OpenRouter | Send the same model and request through Mubit's `https://api.mubit.ai/compat/openrouter/v1` route | Measure the Mubit-routed path against direct OpenRouter |
| C — Mubit/trained adapter | A specific frozen adapter version, only through a verified supported invocation mechanism | Later evaluation of a trained system; not a same-model routing comparison |

A and B are the first required benchmark. Record the requested model and actual serving identity where available; an unverified serving identity must be disclosed. The smoke runner currently pins the configured OpenRouter provider with `require_parameters: true` and `allow_fallbacks: false`; record the actual serving identity where the response exposes it. Mubit route behavior and any internal retries are unverified. Route-changing or adapter-served calls cannot silently be pooled into B.

Mubit documents passing provider model IDs through and states that adapters cannot be selected simply by using an adapter name as the model ID. Arm C therefore remains **not available for this benchmark until invocation and billing are verified**. Console-only experiments, if used, must be labeled separately from API measurements. [Mubit model IDs](https://docs.mubit.ai/guides/model-ids)

## System test coverage

| Area | Required scenarios | Expected result |
| --- | --- | --- |
| GET data | Job/result/feedback lookup, filters, pagination, unknown IDs, incomplete results | Correct version, evidence, state, and explicit missing/error information |
| Upload | Supported file, malformed/oversized file, unsupported scan, duplicate retry, storage failure | Valid upload automatically queues one default extraction; rejected uploads do not queue jobs; orphaned storage is reconciled |
| Natural-language extraction | Core/additional fields, relative dates, company ambiguity, unavailable evidence | Typed plan matches intent; dates are pinned; unresolved ambiguity asks for clarification; unsupported facts stay missing |
| Watchlist expansion | New company request, repeated request, invalid company, restart | Resolved company is added once, receives four-quarter backfill, and remains monitored after restart |
| SEC ingestion | Scheduled polls, irrelevant 8-K, multiple exhibits, duplicate filing, amendment, outage/rate limit | Relevant documents are preserved and queued once; revisions remain traceable; failures retry without losing discoveries |
| Backfill | Different fiscal calendars, Q4, fewer than four available quarters | Last four reported quarters are selected; incomplete coverage is visible; no annual/quarterly substitution |
| Extraction | GAAP/adjusted, annual/quarterly, thousands/millions, negative/zero/null, tables, financial-sector labels | Correct metric, period, basis, scale, and evidence; EPS is never normalized as a monetary total |
| Additional fields | Guidance ranges, percentages, derived metrics, absent metric | Typed values retain qualifiers and periods; derivations retain formula/inputs; absence is explicit |
| Feedback | Supported/unsupported correction, planning error, extraction error, conflicting rule, duplicate submission | System applies, rejects, or defers with rationale; updates relevant agents; decisions are idempotent |
| Reprocessing | Accepted rule, company-specific exception, old job finishing late, worker crash | Only affected team/records in the four-quarter window are rerun; new versions do not erase history; stale runs do not replace newer results |
| Reliability | Provider timeout, malformed JSON, partial batch, expired worker lease, database restart | Bounded retries, recoverable state, explicit failure, no duplicate accepted writes |
| Access and isolation | Missing/invalid auth, forged team ID, foreign-team test fixture | Access denied; source sharing never exposes private uploads, results, or learned rules |
| Untrusted content | Document text attempts to change instructions or invoke tools | Content is treated as evidence only; it cannot change permissions, rules, destinations, or the task |
| Local deployment | Fresh startup, migration, readiness, restart, backup/restore exercise | Required services become ready and persistent records survive restart/restore |
| Existing contract compatibility | SEC filing summary, block types/keys, exact quotes, citation resolution, legacy IDs | Existing chat/dashboard still read results; old citations remain valid after reruns |
| Cross-process progress | Worker/API split, event commit before crash, disconnect, replay cursor | Persistent events reach the correct project and resume without losing committed progress |
| Source and revision identity | Same filing in two projects, upload without accession, old stub-ready record, new rule version | Membership is not moved; uploads have valid identity; only real completed matching runs are cached |
| Frozen task and rule scope | Runtime lesson changes, schema-version migration, company-specific rules | Approved runtime context changes do not mutate frozen system contracts; intentional task changes are versioned |
| Integration-specific evidence | Repeated quote, non-ASCII text, two exhibits, annual/YTD table, 8-K release date | Correct document and UTF-16 span; reporting period differs from release date where necessary; skipped checks are explicit |

Use unit tests for normalization, matching, state transitions, and rule scope; integration tests for database/storage/API/worker behavior; and a small live end-to-end suite for SEC and model integrations. Include fault injection where a successful happy-path run cannot establish recovery behavior.

Measure discovery delay separately from model speed. Controlled source fixtures establish scheduler behavior; a real-time observation records EDGAR availability and discovery timestamps without treating historical filing timestamps as live discovery latency. Target approximately 15 minutes under normal conditions.

## Dataset and reference answers

Start with AAPL, MSFT, NVDA, WMT, and JPM across each company's last four reported quarters: **20 company-quarter cases**, with source documents selected and frozen at dataset creation. These are coverage targets, not an already collected dataset.

For each case, retain:

- Original SEC document, accession/source URL, retrieval timestamp, checksum, and period dates.
- Prepared text/table representation and preprocessing version.
- Reference revenue, net income, GAAP diluted EPS, units/basis, and supporting page/section/table excerpts.
- Requested additional fields, accepted alternatives, missing-value reasons, and per-field scoring rules.
- Intent/planning reference: company, period, fields, and whether clarification is needed.
- Document/section inventory, exact prepared `content`, stable section IDs, task fingerprint, and expected fact-to-section mapping. Multiple filings/exhibits may support one company-quarter; record their counts separately.

A human reviewer verifies labels against source evidence; a second reviewer resolves ambiguous definitions or disagreements before scoring. Model output must not define its own reference answers. Set net-income attribution, amended-filing precedence, and Q4 treatment before freezing labels. Do not use a later restatement as the expected answer for a prompt limited to an earlier release unless the task explicitly asks for the latest restated figure.

Add a separately labeled challenge suite for unit errors, period confusion, missing facts, guidance ranges, malformed inputs, and instruction-like document text. Synthetic fixtures test behavior but are reported separately from real-document accuracy.

### Development and holdout separation

For a future learning comparison, use each company's two oldest selected quarters for development/training (10 cases), the next quarter for validation (5), and the newest quarter for locked testing (5). Keep related releases, filings, amendments, and overlapping comparative-period answers together where needed; redact/exclude cross-split answer-bearing material or adjust the split. Publish the final manifest and any resulting count changes.

Freeze splits before tuning. Test answers and feedback never enter training, prompts, examples, or rule selection. Ensure benchmark calls cannot become training data through Mubit retention or automatic training; verify the project's recording/training controls before using the holdout. If exclusion cannot be established, use a separate evaluation project or report contamination and disqualify the run as a held-out learning test.

The 20-case set is a pilot. Repeated calls measure variability, not more independent financial examples. Five unique holdout quarters cannot support broad generalization; expand the independently labeled corpus before production-quality or small-improvement claims.

## Fair execution protocol

1. Freeze dataset, labels, schema, preprocessing, prompts, tools, rules, model/snapshot, token limits, sampling parameters, streaming mode, SDK versions, and timeout/retry policy. Store hashes in a run manifest.
2. Use one runner machine/network environment and equivalent provider account/service-tier settings. A/B share all settings except endpoint/authentication and required routing headers. Record deviations.
3. Start with extraction-only section calls using identical prepared content and canonical extraction input. Benchmark the existing desk planner separately using frozen requests and tool fixtures. Then run complete filing jobs with the same Langflow flow, gateway, verifier/XBRL snapshots, and only the inference route switched.
4. For the routing pilot, use five paired repetitions per selected section, randomized A/B order and shuffled section order. If the manifest contains S eligible sections across its company-quarter cases, there are `5 × S` initial section calls per arm, before warmups, failures, or repair calls. A filing with 30 sections therefore contributes 150 initial calls per arm over five repetitions. Do not estimate cost as one call per company-quarter. Register any stratified section subset before running. Learning comparisons use only the locked holdout for headline test scores.
5. Use concurrency 1 for the baseline. Run a separately labeled concurrency-4 profile if budget permits. Keep offered workload, resources, and limits equal. Do not mix profiles.
6. Separate initial connection/model startup runs from steady-state runs. Do not call a run “cold” unless cache/connection state is controlled; otherwise label it first-observed. Record cached tokens and cache state where available. Randomize order rather than modifying prompts to force cache misses.
7. Freeze global feedback/rule changes during a run. Give each arm/repetition an isolated database/schema or resettable snapshot so caches, idempotency, repair rules, and prior results cannot cross-contaminate measurements. Initial outputs are scored before repair. The production-policy profile may use one verifier-triggered repair with the same deterministic rule mapping on both arms; log its different inputs and costs separately and never activate those lessons globally. Use recorded source bytes and XBRL snapshots so live SEC calls do not change the experiment. Test live ingestion independently.
8. Primary call-level experiment uses one SDK attempt to expose raw latency/error behavior. A separate production-policy experiment uses bounded retries and includes all attempts/backoff in job time and cost. Do not silently combine them.
9. Record every scheduled case, attempted call, error, timeout, retry, and returned output. Partial or invalid responses remain failures; no cherry-picking the fastest or most accurate repetition.
10. Generate the report from raw results and manifest. No paid run begins until a provider/model, billing basis, and total spend cap are configured. Stop starting calls when the budget is exhausted and mark the run incomplete, including in-flight exposure.

Keep the same harness on both routes. A direct SDK call versus a Mubit call inside Langflow would confound routing with orchestration overhead.

The current contract records production section calls as learning examples. Benchmark holdouts require a separate evaluation invocation with verified recording/training exclusion, isolated from production datasets. The existing `unrecorded` facility is a starting point to test, not permission to assume exclusion worked. Preserve ordinary production recording. Treat any workspace-reported silent adapter tests/promotions as possible routing changes; capture serving identity or mark the affected comparison inconclusive.

## Metrics

### 1. Latency

Measure durations using a monotonic clock at the common caller:

- **Call latency:** From immediately before SDK request dispatch until the complete response is received and parsed. Report milliseconds, median (p50), p95, mean, sample count, and error/timeout rate.
- **Time to first token:** Optional, only for identically configured streaming runs; measure the first content token, not headers or an empty event.
- **Section turnaround:** Section dispatch to validated persisted blocks, including Langflow/gateway overhead, verification, and any repair call.
- **Filing extraction processing time:** Worker start to final persisted status across all sections, including preparation, extraction, validation, and retries. Sum call costs, but measure filing wall time directly because sections run concurrently.
- **Client-visible job time:** Accepted request/upload to final persisted status, including queue delay; report completed, partial, and failed jobs separately. The upload-transfer duration is a separate metric.
- **Feedback update time:** Accepted feedback to activated rule, plus separate time to finish the affected-record reprocessing batch.
- **Event delivery delay:** Committed progress event to browser receipt/render, measured in an instrumented end-to-end session. This is separate from LLM call speed.

Report successful-call quantiles alongside timeout counts and time-to-failure; timed-out calls are censored at their timeout, not fast successful responses. Report paired latency differences `B - A` and percentage change relative to A; positive means B is slower. A paired routing difference includes network/routing variance and is not a pure measurement of Mubit's internal processing.

Mubit exposes serving identity, token counts, response timing, and a timing breakdown in its Requests UI. Use these for corroboration; the common caller clock remains the primary cross-route measurement. Capture Mubit request IDs to trace anomalies. [Requests documentation](https://docs.mubit.ai/guides/requests)

### 2. Accuracy

Score raw outputs before repair and final outputs after the same validation/repair policy, separately. Do not let one route have extra repair calls without recording their latency and cost.

Primary **strict fact accuracy** is `fully correct requested facts / all requested facts` on the frozen manifest. A fully correct fact requires the right value, metric definition, company, period, accounting basis, currency/scale, and supporting evidence. A failed job or invalid whole output receives zero correct facts for its expected facts. Missing required fields are incorrect even if remaining fields are right.

For section/block extraction, match outputs to predefined expected facts by semantic identity and source period. Deduplicate repeated blocks so repeating a correct number cannot raise the score. Report fact precision/recall, section coverage, and statement/guidance/risk evidence quality separately. A table extraction is scored against expected cells/structure, not counted as one correct numeric fact merely because a table block exists. A source-supported annual fact may be correct extraction while not satisfying a request for quarterly revenue; preserve both scores.

Use `verified`, `fixed`, `review`, and `unchecked` as workflow outcomes, not reference truth. Report false-verification rate (verified/fixed blocks incorrect against gold) and repair success/regression rates. XBRL tolerance passes and approximate derived EPS do not establish strict model correctness. A metric field missing because section selection skipped its source counts as an end-to-end failure, even if per-call accuracy on selected sections is high.

Normalize numeric representation deterministically. Set per-field tolerances before seeing outputs based on source precision, using decimal arithmetic; do not loosen tolerances after a failure. Evidence must resolve to supporting source content, not just a plausible URL.

Also report:

- Numeric-value accuracy independent of evidence, and evidence correctness independently.
- Correct-null rate on truly absent fields; false-null rate on available facts. Report available-fact accuracy separately so numerous null cases cannot inflate the headline result.
- Unsupported non-null claims divided by all non-null claims; report extra unrequested claims separately.
- Exact-record accuracy: all required facts correct for a company-quarter.
- Schema-valid response rate, request success rate, and results by company, field, period, and challenge category.
- Planner accuracy for company/period/field selection and appropriate clarification; distinguish planner failures from extractor failures.

Use deterministic graders for structured fields and blinded human adjudication for ambiguous evidence or qualitative additions. An LLM judge may assist triage but is not the sole accuracy authority. Retain failure examples and adjudication notes.

### 3. Cost

Record both **estimated economic cost** and **actual billed cost**, with currency, pricing source/effective date, discounts, and missing data. Do not assume direct and Mubit calls have identical billing simply because the requested model is the same.

For each attempt, estimate cost from non-overlapping billed token categories and their rates: uncached input, cached input, output (including reasoning where billed), plus separately billed tools or other services. Use provider usage semantics to avoid double-counting reasoning or cached tokens. Record unreconciled costs as unknown, not zero; timeouts may still incur charges.

For B, reconcile provider charges, Mubit inference/platform fees, and any subscription allocation without double-counting provider costs already included in a Mubit charge. Show credits separately from ongoing economic cost. If fees are unknown, report provider-only estimates as partial and do not claim total savings.

Report:

- Total inference cost, including failed attempts, retries, and repairs.
- Cost per scheduled section attempt, completed section, complete filing, and fully correct company-quarter record; numerator includes all workload failures. If there are no correct records, cost per correct record is not finite.
- Cost per 1,000 filings as an explicitly labeled projection, stating sections per filing, repair rate, and workload mix. Do not confuse filings with section calls.
- Token usage and average input/output sizes alongside costs.
- Training/evaluation cost and recurring infrastructure/subscription allocation separately from marginal inference. State amortization volume and show both marginal and fully allocated totals when data exists.
- Break down desk-agent calls, section extraction, verifier repair, feedback evaluation, and historical reprocessing. Show deterministic XBRL retrieval/validation infrastructure separately from model inference.

Use `100 × (A_cost - B_cost) / A_cost` for savings where A is positive and both costs cover the same scope. A negative number means B costs more. Fetch applicable rates when choosing the model; this plan assumes no prices.

## Learning benchmark

Run this only after the feedback integration and data-exclusion controls are verified:

1. Freeze a baseline on the held-out set without using its errors to tune.
2. Apply corrections from the development split through the real feedback API. Record changes to planner policy, extractor policy, house rules, and any provider training separately.
3. Validate changes on the validation split and freeze a candidate version.
4. Evaluate the frozen candidate on the locked test set. Give A and B identical updated prompts/rules when isolating route effects. Compare C separately if supported.
5. Measure accuracy change, latency/cost trade-offs, feedback-processing expense, and four-quarter reprocessing expense. Track regressions and rule leakage to unrelated companies.

Changes to prompts or rules cannot be presented as evidence that Mubit trained a better model. Distinguish local policy learning from verified adapter training and service-level combined improvements.

## Statistics and reporting

Present counts and paired differences with 95% confidence intervals where supported. Bootstrap by company-quarter (keeping repeated calls together), not by individual field or token; document seed and method. Show company-level results, and disclose that only five companies limits cross-company inference. Small-set tail latency and small accuracy differences are exploratory.

Do not name a winner from a single average. Before the measured run, register required accuracy, acceptable latency, maximum cost, and any non-inferiority margin. Functional invariants such as no cross-team leakage, no duplicate accepted jobs, and preserved evidence/version history must pass. Numeric product gates remain unset until the pilot and operating budget are agreed; pilot-informed gates apply to a new evaluation, not retroactively to make the pilot pass.

## Future benchmark artifacts

```text
benchmarks/
  manifests/          # Case IDs, source hashes, splits, run configuration
  fixtures/           # Versioned documents and challenge inputs
  gold/               # Reviewed answers and evidence; excluded from model inputs
  runners/            # Shared harness with direct and Mubit transports
  scoring/            # Deterministic grading and adjudication records
  results/<run-id>/   # attempts.jsonl, case-scores.jsonl, summary.json
  reports/            # Markdown report and generated latency/accuracy/cost charts
```

The call-level smoke runner exists at `benchmarks/run.mjs` with a synthetic fixture and offline test. Reviewed labels, real filing manifests, full-pipeline runner, and measured reports do not exist yet. Existing `dump-filings`, fake-LLM scripts, and test utilities can supply inputs and offline scaffolding. Each full-run attempt should capture run/case/split/repetition/arm, document/section/parent job, stage, task fingerprint, request hash, flow/rule/schema versions, model asked/served, source hashes, timing/cache/concurrency, token usage, cost status, retry and repair indexes, errors, request IDs, output reference, and scoring results. Never log credentials.

Implementation order: freeze schemas and fixtures → build offline tests → collect reviewed cases → implement paired runner/instrumentation → run a budgeted A/B pilot → fill the report → expand holdout and add learning evaluation.
