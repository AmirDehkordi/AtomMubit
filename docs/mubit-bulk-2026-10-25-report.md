# Mubit 3,000-request development batch

Started: 2026-10-25T01:03:13.291Z. Finished: 2026-10-25T01:16:34.562Z.
Status: Completed. Model: `gemini-3.5-flash-lite`; backend: `mubit`.

Corpus: 461 SEC XBRL excerpts and 2539 synthetic variants across 20 scenario templates. These are 3000 unique inputs, not 3000 independent document structures. Reserved holdout companies were excluded.

| Measurement | Result |
| --- | --- |
| Examples completed | 3000/3000 |
| Outgoing requests | 3000/3000 |
| Successful requests | 3000 |
| Request errors | 0 |
| All scored fields correct | 2971/3000 (99.03%) |
| All scored fields correct and source-verified | 2916/3000 (97.20%) |
| Field agreement | 9081/9127 (99.50%) |
| Source-verified field agreement | 9001/9127 (98.62%) |
| Successful call p50 / p95 | 2200 / 2570 ms |
| Reported input / output tokens | 1590802 / 2669741 |
| Usage complete | true |
| Distinct mreq_ receipts for every successful call | true |
| Billed cost | Unknown |
| Mubit kept examples / trained adapter / routing | Not verified |

One call per example, no repair attempts, no SDK or application transport retries. Up to eight concurrent requests. Call latency includes client/telemetry overhead, so it is not pure provider latency. Provider-internal activity and billing are not measured.

## By scenario

| Scenario | Cases | All fields correct | Source-verified fields correct | Request errors |
| --- | ---: | ---: | ---: | ---: |
| sec-xbrl-rendered | 461 | 461 | 460 | 0 |
| plain | 127 | 127 | 127 | 0 |
| table | 127 | 126 | 123 | 0 |
| loss | 127 | 126 | 126 | 0 |
| zero | 127 | 127 | 126 | 0 |
| adjusted-distractor | 127 | 126 | 126 | 0 |
| missing-eps | 127 | 125 | 124 | 0 |
| source-instruction | 127 | 123 | 123 | 0 |
| cash-flow-distractor | 127 | 125 | 125 | 0 |
| segment-distractor | 127 | 125 | 124 | 0 |
| release-date | 127 | 125 | 124 | 0 |
| reordered | 127 | 126 | 86 | 0 |
| explicit-per-share | 127 | 125 | 124 | 0 |
| missing-net-income | 127 | 126 | 126 | 0 |
| footnote | 127 | 122 | 117 | 0 |
| large-values | 127 | 125 | 125 | 0 |
| small-decimals | 127 | 127 | 127 | 0 |
| semicolon | 127 | 127 | 127 | 0 |
| no-symbols | 127 | 126 | 126 | 0 |
| annual-narrative | 126 | 125 | 124 | 0 |
| additional-operating-income | 127 | 126 | 126 | 0 |

## Failed source checks

Counts are examples with a failed check; a case can have multiple reasons. These checks include display blocks, while the score above covers requested facts.
- 78: Checks exact quote, printed numbers/scale, range ordering and core GAAP basis; EPS must use units
- 27: Monetary unit currency contradicts the fact currency; no implicit currency conversion
- 1: Display block requires exact source quote; semantic accuracy is not established by this check

## Limits and reproducibility

This batch is recorded development traffic, not a held-out accuracy benchmark and not a direct-provider/Mubit comparison. Gold and source excerpts derive from the same structured values. Public SEC data is reformatted XBRL rather than original filing prose; synthetic cases reuse templates. The scorer checks requested values, currencies, units, scales, basis, explicit date boundaries, duration and missing-value handling. It does not score every fiscal label, explanation, extra fact, or legacy display block. More requests do not establish model training or improved adapter accuracy.

Fixture SHA-256: `dd422ab8a6c76e9ee5c20e46a3aa93cf806ee00c153654b3a29fe020f50442df`. Task fingerprint: `99040d29cae88ee6270e987a5ba47def5154c45c6bcbc5768573c01c441c0b47`. Runtime rules SHA-256: `44600ea5ad8b4bd5e1ce1718f97b0e6e5e960926dd7b78b632b31bc1dc455309`.

Local artifacts: fixture.json, corpus-summary.json, metadata.json, calls.jsonl, cases.jsonl, summary.json and the telemetry database in the run directory. Calls are journaled before dispatch; the original results are preserved without selective retries.

The last console evidence supplied before this batch showed reviewing status and zero kept examples. Only Mubit can confirm subsequent review, training or routing. A low kept count is not evidence of low extraction accuracy, and successful calls are not proof of acceptance.
