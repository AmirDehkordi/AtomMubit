# Mubit 3,000-request development batch

Started: 2026-10-24T22:35:11.701Z. Finished: 2026-10-24T22:57:47.916Z.
Status: Completed. Model: `gemini-3.5-flash-lite`; backend: `mubit`.

Corpus: 439 SEC XBRL excerpts and 2561 synthetic variants across 20 scenario templates. These are 3000 unique inputs, not 3000 independent document structures. Reserved holdout companies were excluded.

| Measurement | Result |
| --- | --- |
| Examples completed | 3000/3000 |
| Outgoing requests | 3000/3000 |
| Successful requests | 2992 |
| Request errors | 8 |
| All scored fields correct | 2964/3000 (98.80%) |
| All scored fields correct and source-verified | 2907/3000 (96.90%) |
| Field agreement | 9044/9128 (99.08%) |
| Source-verified field agreement | 8960/9128 (98.16%) |
| Successful call p50 / p95 | 2074 / 2564 ms |
| Reported input / output tokens | 1580603 / 2640645 |
| Usage complete | false |
| Distinct mreq_ receipts for every successful call | true |
| Billed cost | Unknown |
| Mubit kept examples / trained adapter / routing | Not verified |

One call per example, no repair attempts, no SDK or application transport retries. Up to eight concurrent requests. Call latency includes client/telemetry overhead, so it is not pure provider latency. Provider-internal activity and billing are not measured.

## By scenario

| Scenario | Cases | All fields correct | Source-verified fields correct | Request errors |
| --- | ---: | ---: | ---: | ---: |
| sec-xbrl-rendered | 439 | 439 | 435 | 0 |
| plain | 129 | 128 | 127 | 0 |
| table | 128 | 127 | 122 | 0 |
| loss | 128 | 127 | 127 | 0 |
| zero | 128 | 126 | 126 | 0 |
| cash-flow-distractor | 128 | 127 | 127 | 0 |
| release-date | 128 | 128 | 126 | 0 |
| source-instruction | 128 | 126 | 126 | 0 |
| missing-eps | 128 | 126 | 126 | 0 |
| segment-distractor | 128 | 127 | 127 | 0 |
| adjusted-distractor | 128 | 127 | 127 | 0 |
| missing-net-income | 128 | 126 | 126 | 1 |
| reordered | 128 | 127 | 86 | 1 |
| small-decimals | 128 | 125 | 125 | 1 |
| semicolon | 128 | 126 | 125 | 1 |
| explicit-per-share | 128 | 125 | 125 | 1 |
| no-symbols | 128 | 126 | 126 | 1 |
| additional-operating-income | 128 | 124 | 124 | 1 |
| large-values | 128 | 125 | 125 | 1 |
| annual-narrative | 128 | 128 | 128 | 0 |
| footnote | 128 | 124 | 121 | 0 |

## Failed source checks

Counts are examples with a failed check; a case can have multiple reasons. These checks include display blocks, while the score above covers requested facts.
- 84: Checks exact quote, printed numbers/scale, range ordering and core GAAP basis; EPS must use units
- 27: Monetary unit currency contradicts the fact currency; no implicit currency conversion

## Limits and reproducibility

This batch is recorded development traffic, not a held-out accuracy benchmark and not a direct-provider/Mubit comparison. Gold and source excerpts derive from the same structured values. Public SEC data is reformatted XBRL rather than original filing prose; synthetic cases reuse templates. The scorer checks requested values, currencies, units, scales, basis, explicit date boundaries, duration and missing-value handling. It does not score every fiscal label, explanation, extra fact, or legacy display block. More requests do not establish model training or improved adapter accuracy.

Fixture SHA-256: `7dab0e33c891f828c24c9ecc8ea2e5c0b4c7ddbbcfeb9a26724467d6f5838747`. Task fingerprint: `99040d29cae88ee6270e987a5ba47def5154c45c6bcbc5768573c01c441c0b47`. Runtime rules SHA-256: `44600ea5ad8b4bd5e1ce1718f97b0e6e5e960926dd7b78b632b31bc1dc455309`.

Local artifacts: fixture.json, corpus-summary.json, metadata.json, calls.jsonl, cases.jsonl, summary.json and the telemetry database in the run directory. Calls are journaled before dispatch; the original results are preserved without selective retries.

The last console evidence supplied before this batch showed reviewing status and zero kept examples. Only Mubit can confirm subsequent review, training or routing. A low kept count is not evidence of low extraction accuracy, and successful calls are not proof of acceptance.
