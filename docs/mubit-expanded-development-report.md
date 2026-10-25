# Expanded Mubit extraction development report

Status: **Partial; Stopped: user reports Mubit review backlog and daily review limit; no kept or rejected examples yet.**.
Started 2026-10-24T20:44:33.109Z. Model: `gemini-3.5-flash-lite`; backend: `mubit`.

Corpus: 100 development excerpts: 80 deterministic synthetic variants across 10 scenario families and 20 reformatted public SEC XBRL excerpts across five companies. Gold is generated from the same data, not independently adjudicated.

| Measurement | Result |
| --- | --- |
| Completed examples | 39 / 100 |
| Confirmed calls in saved case results | 46 / 200 maximum |
| Successful calls | 46 |
| Completed repair attempts | 7 |
| First-attempt field agreement | 111 / 117 |
| Final field agreement | 113 / 117 |
| Final source-verified field agreement | 109 / 117 |
| First-attempt correct whole examples | 37 / 39 |
| Final correct whole examples | 37 / 39 |
| Final source-verified whole examples | 35 / 39 |
| Call latency p50 / p95 | 2440 / 2855 ms |
| Example latency p50 / p95, including repairs | 2442 / 5460 ms |
| Reported input / output tokens | 24115 / 40772 |
| Usage complete for saved calls | true |
| Billed cost | Unknown |
| Mubit kept examples / training / routing | Not measured by this runner |

Latency includes client and local telemetry overhead. Example latency includes repair calls. Partial reports omit any in-flight call not yet saved; do not treat their call count as an exact billing count.

## Results by scenario

| Scenario | Examples completed | Final correct | Source verified |
| --- | --- | --- | --- |
| sec-xbrl-rendered | 20 | 20 | 18 |
| plain-text | 2 | 2 | 2 |
| html-table | 2 | 2 | 2 |
| loss-parentheses | 2 | 1 | 1 |
| missing-eps | 2 | 2 | 2 |
| zero-income | 2 | 2 | 2 |
| gaap-adjusted-distractor | 2 | 2 | 2 |
| segment-distractor | 2 | 2 | 2 |
| release-date-distractor | 2 | 1 | 1 |
| source-instruction-injection | 2 | 2 | 2 |
| extra-operating-metrics | 1 | 1 | 1 |

## Source validation failures

Counts below are examples with each failed check, including legacy display blocks. One example can have multiple failures.
- 2: Checks exact quote, printed numbers/scale, range ordering and core GAAP basis; EPS must use units

## Interpretation and reproducibility

This is recorded development traffic, not a paired direct-provider versus Mubit benchmark. Expected answers and excerpts share their input data; SEC excerpts are reformatted XBRL, not original filings. Synthetic cases include repeated templates. Scores check value, currency, unit, scale, GAAP basis, duration, period end, explicit period start when specified, and model abstention for missing values; fiscal labels are not scored. These results cannot establish production accuracy or adapter improvement.

Eight AMZN/GOOGL excerpts remain unsent in `benchmarks/fixtures/extraction-holdout-candidates.json`. Those companies and accessions are absent from this development batch, but templates overlap. Independent review and original filing coverage are still required for a credible benchmark.

Fixture SHA-256: `d0f3cae1509c3e8d08daa205d128894854be7a58d93f9bbe045fc2dffbacf212`. Task fingerprint: `6ac1679d4a12363fbb3392bd3027ee61cab86180147ad684ba650f27d97081b7`.

Per-case model outputs, evidence checks, request IDs and local telemetry are retained in the ignored run directory. Gold labels are only used for local scoring.

Mubit records calls by default but trains only on examples its reviewer keeps. A successful request is not evidence of acceptance. Check the task review/history details and request/reply storage before sending more traffic solely to increase kept examples. See [Mubit adapter lifecycle](https://docs.mubit.ai/guides/first-adapter) and [request recording](https://docs.mubit.ai/guides/connect-gemini).
