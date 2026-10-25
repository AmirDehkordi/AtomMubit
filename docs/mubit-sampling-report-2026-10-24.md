# Mubit sampling and currency regression report — 24 October 2026

Completed 140 unique development examples plus eight targeted reruns. Sent **164 requests** within the user-authorized ceiling of 3,000: 163 succeeded and one failed with a transport error. The failed case succeeded in the follow-up run. No further batch is running or scheduled.

| Phase | Examples | Requests | Correct whole examples | Field agreement | Call p50 / p95 |
| --- | ---: | ---: | ---: | ---: | --- |
| Initial new sampling | 100 | 111 | 92/100 | 323/340 | 2486 / 3419 ms |
| Targeted failure rerun after fix | 8 | 10 | 8/8 | 25/25 | 2390 / 3206 ms |
| Fresh currency cases after fix | 40 | 43 | 40/40 | 120/120 | 2181 / 2443 ms |

The final source-verified scores match field agreement in each row. They include explicitly missing observations; they are not independent financial accuracy estimates. The initial results remain unchanged, including the failed request and seven currency-label failures.

## What the samples revealed

Seven initial cases returned CAD facts with USD or USD/share unit labels. Values could be correct while units contradicted the stated currency. The existing verifier did not reject this contradiction.

The fix rejects monetary currency/unit contradictions, adds a general runtime rule requiring consistent units, and includes that requirement in repair instructions. It does not supply expected numerical answers. The frozen system prompt, output schema and model remain unchanged; the local verification version advances to currency-unit-consistency-v3. Known failures passed the targeted rerun, and 40 new CAD/EUR/GBP/USD development cases passed after the fix.

These results validate a pipeline correction, not Mubit adapter training. The rerun selected known failures, and the fresh set uses synthetic templates, so neither is a production-quality benchmark or a controlled causal model comparison.

## Traffic, coverage and cost

- Model: gemini-3.5-flash-lite through native Mubit.
- Initial corpus: 40 additional historical SEC XBRL excerpts (four GAAP metrics each) and 60 previously unsubmitted synthetic cases (three metrics each). SEC excerpts are reformatted structured data, not original filing prose.
- Fresh currency corpus: ten examples each for CAD, EUR, GBP and USD, covering text/HTML, losses, zero values, missing EPS and non-GAAP distractors.
- All 163 successful requests returned distinct Mubit mreq_ IDs. Response IDs and outputs are saved locally in each report.json and request-receipts.json.
- Previously interrupted expanded-020 was excluded because it may already have been submitted. Eight reserved AMZN/GOOGL holdout candidates remain unsent.
- SDK and application transport retries were disabled for budgeted sampling; schema/evidence repair calls were counted. Requests are journaled before sending and after completion.
- Reported tokens across received responses: 85,006 input and 152,765 output. Usage for the failed call is unknown. Billed cost is unknown; missing usage is not zero cost.
- Last user-supplied Mubit console status still showed zero kept examples and reviewing status. This runner cannot confirm reviewer acceptance, training, promotion or adapter routing. More traffic alone does not establish improvement.

## Validation and artifacts

142 API tests, seven offline benchmark tests, API typecheck and build passed. A reader test had used a fixed future timestamp that had become earlier than the current time; its fixture now uses explicit baseline dates so ordering is deterministic. The running desk API was not restarted; the sampling processes loaded the new build.

Reusable fresh cases: [currency regression fixture](../benchmarks/fixtures/mubit-currency-regression.json). Run instructions: [benchmark README](../benchmarks/README.md).

Local detailed reports (ignored by Git):
- `benchmarks/results/mubit-resumed-2026-10-24/analysis.md` and `report.json`
- `benchmarks/results/mubit-currency-followup-2026-10-24/analysis.md` and `report.json`
- `benchmarks/results/mubit-currency-fresh-2026-10-24/analysis.md` and `report.json`
