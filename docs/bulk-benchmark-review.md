# Bulk extraction benchmark and improvement review

Reviewed 25 October 2026 against preserved results from 24–25 October. This review makes no new model requests.

## Assessment

The two bulk runs provide a useful development baseline: **6,000 unique inputs, 5,992 successful requests, 99.29% requested-field agreement, and 97.05% fully correct cases passing source checks**. Successful calls had a pooled p50 of 2.136 seconds and p95 of 2.566 seconds.

The main improvement opportunity is usable, evidence-backed output. Currency-unit mistakes and non-verbatim quotations account for most lost results. The existing verifier rejected the incorrect scored numeric outputs in this corpus, but rejection still leaves the client without a usable answer.

These results do **not** establish that Mubit learned from the requests, outperforms direct inference, or costs less. Both runs used native Mubit with `gemini-3.5-flash-lite`; neither recorded a trained adapter identity, routing decision, reviewer acceptance count, or billed charge. The runs used different inputs, not a paired before/after experiment.

## Measured results

“Case correct” means every requested field matches the fixture's value, currency, unit, scale, basis, period end/duration, and explicit start when supplied. “Source-verified” additionally requires the application's checks to pass for numeric facts. Explicitly missing expected fields can pass both scores without a numeric source span. These are development scores, not independently adjudicated financial accuracy.

| Measurement | Bulk A: 24 October | Bulk B: 25 October | B versus A |
| --- | ---: | ---: | ---: |
| Scheduled cases / requests | 3,000 / 3,000 | 3,000 / 3,000 | Same |
| Successful requests | 2,992 (99.73%) | 3,000 (100%) | 8 fewer errors |
| Correct cases, all scheduled | 2,964 (98.80%) | 2,971 (99.03%) | +0.23 percentage points |
| Correct cases, successful requests only | 2,964/2,992 (99.06%) | 2,971/3,000 (99.03%) | −0.03 percentage points |
| Correct cases passing source checks | 2,907 (96.90%) | 2,916 (97.20%) | +0.30 percentage points |
| Requested-field agreement | 9,044/9,128 (99.08%) | 9,081/9,127 (99.50%) | +0.42 percentage points |
| Source-verified field agreement | 8,960/9,128 (98.16%) | 9,001/9,127 (98.62%) | +0.46 percentage points |
| Successful call p50 | 2,074 ms | 2,200 ms | +126 ms; 6.08% slower |
| Successful call p95 | 2,564 ms | 2,570 ms | +6 ms; 0.23% slower |
| Successful call p99 | 2,894 ms | 2,901 ms | +7 ms |
| Successful call mean | 2,040.5 ms | 2,129.1 ms | +88.6 ms |
| Total batch wall time | 22m 36.2s | 13m 21.3s | 9m 14.9s shorter |
| Scheduled requests / elapsed minute | 132.7 | 224.6 | Observed throughput only |

Both runs used up to eight concurrent requests, one call per case, zero repair attempts, and disabled application/SDK transport retries. Latency includes caller/telemetry overhead. It excludes document acquisition, job queueing, full-filing orchestration, and client delivery.

Bulk A's eight failed calls lasted **589.1–590.4 seconds each**. They are excluded from successful-call percentiles but included in scheduled-case accuracy and batch wall time. The shorter second batch therefore does not demonstrate faster inference. Successful-call median latency actually increased. Investigate timeout/cancellation behavior before setting a service latency target; these records do not identify the upstream cause.

Whole-case correctness among successful responses was nearly unchanged: 28 incorrect successful cases in A and 29 in B. Removing eight transport failures explains the improvement of seven correct scheduled cases. Field scores improved, but differing case mixes prevent attributing that change to learning.

## What failed and how to improve it

Across both runs, **177 cases** did not meet the combined correctness/source-check criterion: eight request failures, 57 cases with field mismatches, and 112 otherwise-correct cases failing source checks. These categories are disjoint.

| Finding | Evidence from both runs | Recommended change and verification |
| --- | --- | --- |
| Currency and unit disagree | 97 wrong fields across 54 cases; 27 affected cases in each batch | Keep the existing rejection rule. Add focused development cases for all supported currencies and total/per-share units; improve unit constraints or derive unit labels only from independently supported currency and metric type. Compare raw output and corrected output separately. |
| Quotes are reconstructed rather than copied | All 164 fields that matched gold but failed source verification lacked an exact source span | Prefer selecting source spans or copying complete table rows. Teach punctuation preservation with development examples. Keep exact provenance checks; do not relax them to hide failures. |
| Reordered sentences lose evidence | 253/255 cases had correct fields, but only 172/255 passed source checks; 84 correct fields lacked exact spans | Make reordered punctuation cases a required regression slice. Example `bulk-syn-3011`: source has `Net income: 595.65;`, reply quotes `Net income: 595.65.` |
| Tables and footnotes lose evidence | Combined table slice: 253/255 correct, 245/255 verified. Footnote slice: 246/255 correct, 238/255 verified | Preserve table delimiters and source offsets. Example `bulk-syn-3579`: model quotes `Revenue 11449.39`, but the source is a Markdown table row. |
| Printed scale is ignored | Six wrong fields in three cases used `units` instead of `millions` or `billions` | Bind scale to the applicable table/header. Add mixed-scale sections and EPS exceptions to regression tests. |
| Numeric transcription | Two value mismatches in one case | Keep numeric matching and inspect digit/sign/decimal handling in the targeted regression corpus. |
| Long failed requests consume workers | Eight errors at roughly 590 seconds | Establish an explicit per-attempt deadline and cancellation test. Measure timeout rate and batch completion alongside successful-call percentiles. |

The 130 incorrect expected fields comprise 25 fields affected by request errors and 105 mismatched fields in successful responses: 97 unit, six scale and two value mismatches. This classification excludes application-generated null fallbacks. No scored incorrect field had a source-supported candidate in the saved results. That is reassuring evidence for these checks, **not proof of zero false verification on unseen documents or unscored claims**.

Net income is the weakest core field after evidence checks: 5,854/6,000 (97.57%), compared with revenue 5,945/6,000 (99.08%) and diluted EPS 5,911/6,000 (98.52%). Operating income covered only 255 cases, with 251 correct and verified (98.43%). Correct missing-value handling was 509/510, including the transport-failed missing-value case in the denominator.

## Which improvements are already supported?

The [initial 25-case report](mubit-development-report.md) recorded 75/75 field matches but only 40/75 source-verified fields (13/25 whole cases), using 41 calls including repair. The later currency sampling recorded 323/340 field matches before the targeted fix. These earlier runs help explain the development work, but their corpus, verifier behavior and repair policy differ from the bulk baseline. The apparent rise in source-verified scores must not be presented as a controlled accuracy gain.

The earlier [currency regression work](mubit-sampling-report-2026-10-24.md) found CAD facts labeled with USD units. A local verifier/rule change added rejection of this contradiction. Eight selected failures subsequently passed, and 40 fresh synthetic currency cases passed. This supports the pipeline correction on those cases; it does not isolate a model-training effect.

Both bulk runs used the same task fingerprint and runtime-rule hash, after that change. Their 54 currency-error cases show that the model still makes this mistake. The improvement is detection and safe rejection, not elimination of the error. Bulk runs intentionally disabled repair, so they do not measure production repair success, added latency, or cost.

## Cost and efficiency

| Measurement | Bulk A | Bulk B | Combined |
| --- | ---: | ---: | ---: |
| Reported input tokens | 1,580,603 | 1,590,802 | 3,171,405 |
| Reported output tokens | 2,640,645 | 2,669,741 | 5,310,386 |
| Reported total tokens | 4,221,248 | 4,260,543 | 8,481,791 |
| Mean reported tokens / successful request | 1,410.8 | 1,420.2 | — |
| Usage complete | No: eight failures | Yes | No |
| Billed cost / cost per correct result | Unknown | Unknown | Unknown |

No cost-saving claim is supported. Failed-call usage is unknown, not zero. There is no reconciled Mubit invoice, pricing basis, or direct-provider bill in these artifacts. Usage is provider-reported and its token categories have not been reconciled to charges.

For a later comparison, compute total charged inference plus non-overlapping Mubit fees, repairs and retries; report cost per scheduled case and per fully correct, source-verified case. For these runs the latter denominators are 2,907 and 2,916. Keep infrastructure/training allocations separate and state their allocation method. Output tokens exceed input tokens; inspect their composition before testing a leaner output schema or lower output limit. Any such experiment needs an accuracy/evidence non-regression check.

## Benchmark validity and missing comparisons

The corpus contains 900 SEC-derived excerpts and 5,100 synthetic inputs. The SEC slice achieved 900/900 field-correct cases and 895/900 source-verified cases, but these excerpts are rendered from structured XBRL; reference answers come from the same values. This is much easier than finding facts in original filings. Synthetic inputs reuse 20 scenario templates. Exact text uniqueness does not imply 6,000 independent document structures.

Scoring omits full fiscal-label accuracy, every unexpected fact, narrative explanations, many legacy display-block semantics, original-file parsing, and source-selection coverage. The local verifier is not an independent human evidence judge. The combined “verified” metric also includes explicit missing observations. These limits prevent treating 99.29% field agreement as production financial accuracy.

| Evaluation question | Evidence status |
| --- | --- |
| Native Mubit development extraction baseline | Measured here |
| Direct API versus Mubit, same requested model/provider and input | Not run |
| Mubit trained adapter versus frozen base model | Not run; serving identity unavailable |
| Feedback/rule improvement on an untouched holdout | Not run |
| End-to-end filing and dashboard latency/correctness | Not measured by these batches |
| Production retry/repair quality and cost | Not measured by these batches |

The last available console snapshot showed zero kept examples and a review backlog. It predates these batches. Successful receipts confirm requests returned through Mubit; they do not confirm kept examples, training, promotion, or adapter routing. Current console status must be collected separately before evaluating learning.

## Next benchmark and improvement sequence

1. **Freeze this baseline and build targeted regressions.** Preserve all failed outputs. Add reviewed currency, exact-quote, scale and timeout cases. Report each category separately, including wrong facts blocked and correct facts rejected. Do not silently rescore historical runs with a changed verifier.
2. **Create an independent evaluation corpus.** Use original SEC releases/filing sections with tables, comparative periods, negative/zero/missing facts, multiple scales and non-GAAP distractors. Have references and evidence spans reviewed independently. Split by company, document and template family; keep evaluation examples out of training. The existing eight AMZN/GOOGL candidates are only candidates, not an adjudicated benchmark.
3. **Run a paired route comparison after defining a budget.** Compare the same model/version, inputs, schema and rules directly versus through Mubit. Alternate/randomize route order and repeat under a fixed concurrency/cache policy. If native Mubit and direct routing cannot expose equivalent serving identities, label the result a product configuration comparison rather than isolated routing overhead. Keep a separate production-policy run with bounded repairs/retries.
4. **Evaluate learning only with serving evidence.** Capture accepted/rejected/pending examples, frozen adapter version and per-request route. Compare base versus adapter on the excluded holdout with rules fixed. Separately compare old versus new rules with model fixed, so gains can be attributed.
5. **Publish accuracy, latency and reconciled cost together.** Include all scheduled failures; report raw and final exact-record accuracy, independently judged evidence, unsupported claims, p50/p95/p99, timeout rate, full-job latency and cost per correct verified record. Use paired uncertainty estimates clustered by document/company; template siblings must not count as independent evidence.

Proposed promotion criteria, to register before the next experiment: zero accepted currency contradictions in the targeted suite; an improvement in correct source-backed records on the frozen paired corpus without more unsupported claims; and latency/cost within explicit service budgets. Numerical service budgets and tolerances remain undecided. More bulk traffic alone is not the next quality milestone.

## Reproducibility

Sources: [bulk A report](mubit-bulk-3000-report.md), [bulk B report](mubit-bulk-2026-10-25-report.md), [sampling/currency report](mubit-sampling-report-2026-10-24.md), and [benchmark protocol](test-and-benchmark-plan.md).

The offline audit [review-bulk.mjs](../benchmarks/review-bulk.mjs) re-scores all 6,000 saved outcomes with the existing scorer; checks summaries against raw journals, fixture hashes, unique case/content hashes, one start/finish per case, and 5,992 distinct successful receipts; and computes error categories and latency/throughput statistics. It passed during this review. Re-run from the repository root:

```sh
node benchmarks/review-bulk.mjs
```

Detailed inputs remain in ignored local directories `benchmarks/results/mubit-bulk-3000/` and `benchmarks/results/mubit-bulk-2026-10-25/`. A fresh checkout needs these artifacts to reproduce the audit. Preserve fixtures, metadata, calls/cases journals and summaries together in an access-controlled artifact store. Recorded task/rule hashes support reproducibility, but the batches do not pin a complete source commit plus dirty-tree/build snapshot or a provider model revision. This review does not certify the newly pulled application's behavior.
