# Earnings Desk — Benchmark Report

**Status: NO LIVE RUN — results template.**

Prepared: 24 October 2026. The offline smoke harness has been exercised against one synthetic simple-fact fixture; it uses fake outputs, null latency, and unknown costs. No live model calls, timing measurements, reviewed accuracy scores, or billed costs have been collected. Empty results are not zero. No performance winner or cost saving is established.

Protocol: [System test and benchmark plan](test-and-benchmark-plan.md).

Architecture: [Integrated NestJS implementation plan](extraction-service-plan.md). The current offline runner is call-level only; it does not exercise the NestJS extractor, full Langflow workflow, filing-level validation/repair, or durable job/event delivery. Existing application telemetry and workspace training notes have not been collected or analyzed as benchmark results here.

## Measurement scope

Publish separate result sets for:

1. **Section LLM calls:** identical content, frozen task contract, and model settings through direct provider versus Mubit.
2. **Complete filing jobs:** identical prepared sections, Langflow workflow, gateway, initial rules, and verifier snapshots; include all calls and at most the configured repair pass.
3. **Desk planning and client delivery:** planning calls, queue time, and persisted-event-to-client delay, separately from model extraction speed.
4. **XBRL/dashboard correctness:** deterministic reference data and calculations; excluded from LLM accuracy claims.

Report successful and failed work at each boundary. Do not combine section-call and filing-job samples in a single distribution. A visible XBRL number is not evidence that the extractor succeeded.

## Executive result

| Question | Current finding |
| --- | --- |
| Is direct inference or Mubit faster? | Not measured |
| Which route extracts more accurate data? | Not measured |
| Which route costs less for correct results? | Not measured |
| Does feedback improve future extractions? | Not evaluated |
| Can a Mubit-trained adapter be benchmarked through the API? | Invocation, serving identity, and billing require verification |

## Run identity and comparability

Complete before a measured run:

| Item | Value |
| --- | --- |
| Run ID / UTC start-end / Git commit | Pending |
| Run type: routing / pipeline / learning | Pending |
| Provider / requested model / exact snapshot | OpenRouter routes; extractor default is `qwen/qwen3-30b-a3b-instruct-2507`; smoke fixture retains `openai/gpt-6-luna`; exact snapshot not pinned |
| Actual serving identity per arm | Pending |
| Dataset manifest/hash / unique company-quarters | Pending; target pilot coverage is 20 |
| Unique filings / documents / selected sections / expected facts | Pending; count each separately |
| Split / label version / adjudication record | Pending |
| Prompt / schema / rules / flow / preprocessing hashes | Pending |
| Task fingerprint / model-gateway revision / verifier and XBRL snapshots | Pending |
| Client SDK / retries / timeouts / streaming | Pending |
| Host / network / concurrency / cache profile | Pending |
| Paired repetitions / scheduled and completed cases | Pending |
| Isolated arm/repetition state / cache and rule reset procedure | Pending |
| Pricing date/source / billing basis / currency | Public OpenRouter list prices checked 24 Oct 2026; no billed amounts or Mubit fees |
| Call/spend cap and actual spend | No paid run; no spend cap consumed |
| Holdout training-exclusion verification | Pending |
| Production recording versus evaluation exclusion / routing changes | Pending |
| Registered accuracy/latency/cost gates | Not set |

Arm A uses OpenRouter directly at `https://openrouter.ai/api/v1`. Arm B sends the same Chat Completions request through Mubit at `https://api.mubit.ai/compat/openrouter/v1`. Arm C, if available, is a separate trained-adapter experiment and must identify its frozen version. Document every mismatch or unavailable field before drawing conclusions. See [OpenRouter routing and pricing notes](openrouter.md).

The runner pins the requested provider, sets `require_parameters: true` and disables provider fallbacks. It sends one SDK attempt per call. Actual serving identity is still unverified unless reported by the endpoint. The synthetic smoke fixture requests `openai/gpt-6-luna`; repeated fake outputs are not model results.

## Latency results

All durations use the common caller clock. Separate one-attempt call measurements from production-policy jobs with retries.

| Metric | A: OpenRouter direct | B: Mubit/OpenRouter | B − A / percentage change |
| --- | --- | --- | --- |
| Scheduled / successful / failed calls | Not measured | Not measured | — |
| Section call latency p50, ms | Not measured | Not measured | — |
| Section call latency p95, ms | Not measured | Not measured | — |
| Mean section call latency, ms | Not measured | Not measured | — |
| Timeout/error rate | Not measured | Not measured | — |
| Time to first token, ms, streaming only | Not measured | Not measured | — |
| Queue delay p50/p95, s | Not measured | Not measured | — |
| Section dispatch-to-persist p50/p95, s | Not measured | Not measured | — |
| Complete filing processing p50/p95, s | Not measured | Not measured | — |
| Client-visible job p50/p95, s | Not measured | Not measured | — |
| Committed-event-to-client delay p50/p95, ms | Not measured | Not measured | — |
| Desk planning latency/call count, separate profile | Not measured | Not measured | — |

Include paired-difference confidence intervals, first-observed versus warm profiles, concurrency, timeout handling, output length, and request IDs for outliers. Add a latency distribution chart once measurements exist. Do not equate the observed route difference with internal Mubit overhead.

Record sections per filing and concurrency. Filing wall time is measured directly, not obtained by summing concurrent section-call durations. Distinguish SDK retries from verifier-triggered model repair calls; include both in the production-policy profile.

## Accuracy results

| Metric | Denominator | A: OpenRouter direct | B: Mubit/OpenRouter | Difference, percentage points |
| --- | --- | --- | --- | --- |
| Strict fact accuracy, raw | All expected facts, including failed cases | Not measured | Not measured | — |
| Strict fact accuracy, final | Same facts after identical repair policy | Not measured | Not measured | — |
| Available-fact accuracy | Expected non-null facts | Not measured | Not measured | — |
| Numeric-value accuracy | Expected numeric facts | Not measured | Not measured | — |
| Evidence correctness | Returned non-null facts requiring evidence | Not measured | Not measured | — |
| Correct-null / false-null rates | Absent / available facts respectively | Not measured | Not measured | — |
| Unsupported-claim rate | Returned non-null claims | Not measured | Not measured | — |
| Exact-record accuracy | All scheduled company-quarter records | Not measured | Not measured | — |
| Schema-valid response rate | All scheduled cases | Not measured | Not measured | — |
| Planner intent accuracy | All scheduled planner cases | Not measured | Not measured | — |
| Fact precision / recall | Matched deduplicated outputs / expected facts | Not measured | Not measured | — |
| Section coverage | Expected source sections | Not measured | Not measured | — |
| False-verification rate | Blocks marked verified/fixed | Not measured | Not measured | — |
| Repair success / regression rate | Repaired cases with reviewed reference answers | Not measured | Not measured | — |
| Narrative/guidance/risk evidence quality | Adjudicated non-numeric blocks | Not measured | Not measured | — |
| Table-cell / structure accuracy | Expected table cells/structure | Not measured | Not measured | — |

Show unique cases separately from repeated attempts. Break down errors by revenue, net income, EPS, extra fields, period, accounting basis, units, and evidence; include company-level results. Add confidence intervals and blinded adjudication notes.

The `verified`, `fixed`, and `review` statuses are operational outputs, not gold labels. Score raw printed-value extraction, normalized facts, and final selected results separately. Keep direct XBRL retrieval, approximate quarterly calculations, and source-selection errors in their own evaluation. No dashboard value is used as proof of an LLM answer without checking the underlying model output.

| Filing / section / block / source evidence | Reference answer | A output | B output | Error category / adjudication |
| --- | --- | --- | --- | --- |
| No measured examples yet | — | — | — | — |

## Cost results

Use one declared currency. Distinguish estimates from reconciled bills; unavailable costs remain unknown.

| Metric | A: OpenRouter direct | B: Mubit/OpenRouter | Savings versus A |
| --- | --- | --- | --- |
| Input / cached input / output usage | Not measured | Not measured | — |
| Estimated provider inference cost | Not measured | Not measured | — |
| Actual reconciled inference charges | Not measured | Not measured | — |
| Mubit fees not already included above | Not applicable | Unknown | — |
| Failed/retried/repaired call cost, included in totals | Not measured | Not measured | — |
| Total marginal workload cost | Not measured | Not measured | — |
| Cost per scheduled section case | Not measured | Not measured | — |
| Cost per completed section | Not measured | Not measured | — |
| Cost per complete filing | Not measured | Not measured | — |
| Cost per fully correct record | Not measured | Not measured | — |
| Projected cost per 1,000 filings, with section/repair mix | Not projected | Not projected | — |
| Allocated infrastructure/subscription cost | Not measured | Not measured | — |
| Training/evaluation setup cost | Not measured | Not measured | — |

List pricing URLs, effective dates, discounts, credit offsets, allocation assumptions, unknown charges, and any billing reconciliation discrepancies. Do not claim total savings from provider-only partial estimates. Add a cost-per-correct-record chart after measurement.

| Cost component | A: OpenRouter direct | B: Mubit/OpenRouter |
| --- | --- | --- |
| Desk-agent intent planning | Not measured | Not measured |
| Initial section extraction | Not measured | Not measured |
| Verifier-triggered repair calls | Not measured | Not measured |
| Feedback evaluation | Not measured | Not measured |
| Four-quarter reprocessing | Not measured | Not measured |
| Langflow/API/worker/database and XBRL processing allocation | Not measured | Not measured |

Component rows explain the totals and must not be added again on top of those totals. Twenty company-quarter cases can contain many documents and sections; they do not imply twenty model calls.

## Learning and system outcomes

Complete separately from the routing comparison:

| Item | Result |
| --- | --- |
| Frozen baseline/candidate and holdout manifest | Not evaluated |
| Planner/extractor/rule changes versus trained-model changes | Not evaluated |
| Held-out strict accuracy change and regressions | Not evaluated |
| Time/cost to evaluate feedback and activate changes | Not evaluated |
| Affected four-quarter reprocessing: queued/completed/failed | Not evaluated |
| Reprocessing time and cost | Not evaluated |
| Arm C adapter version, invocation, serving proof, metrics | Not available until verified |
| API, ingestion, restart recovery, versioning, scope tests | Not run |
| Legacy client compatibility, old citations, uploaded document identity | Not run |
| Cross-process progress replay and stale-result protection | Not run |
| XBRL reference/calculation correctness, separate from LLM scoring | Not evaluated |

## Limitations and decision

Record corpus size, company mix, duplicate/overlapping disclosures, holdout contamination checks, unresolved ground truth, model drift, cache/rate-limit differences, unavailable serving/billing information, and incomplete runs.

**Current decision:** No comparative conclusion. Collect reviewed reference cases, verify both inference routes and billing, set the run budget, and execute the paired protocol. The implemented smoke fixture is synthetic and intentionally narrow; it cannot establish extraction-engine, filing-level, production-readiness, or trained-model results. The pilot is exploratory and cannot establish a trained-model advantage by itself.
