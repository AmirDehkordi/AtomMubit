# Mubit synthetic development batch

Model: gemini-3.5-flash-lite; backend: mubit.

Completed 25/25 examples using 41/50 allowed calls.
Model field agreement: 75/75 (100.0%). Source-verified field agreement: 40/75 (53.3%).
Whole examples: 25 model-correct; 13 source-verified.
Successful call latency p50: 2315 ms; p95: 2561 ms (includes client and telemetry overhead).
Reported tokens: 18003 input, 32084 output. Usage complete: true. Billed cost: unknown.

Calls use normal section_extractor recording. This does not confirm that Mubit kept examples, trained an adapter, or improved a model. These generated synthetic development cases are not a held-out financial benchmark. Gold answers are used only by the local scorer and are never added to prompts.

| Case | Model fields | Source verified | Notes |
| --- | --- | --- | --- |
| syn-01: Synthetic quarterly USD millions | 3/3 | 0/3 | revenue: Correct fields failed source-evidence validation; net_income: Correct fields failed source-evidence validation; eps_diluted: Correct fields failed source-evidence validation |
| syn-02: Synthetic quarterly thousands | 3/3 | 3/3 |  |
| syn-03: Synthetic quarterly units and zero | 3/3 | 3/3 |  |
| syn-04: Synthetic quarterly loss parentheses | 3/3 | 0/3 | revenue: Correct fields failed source-evidence validation; net_income: Correct fields failed source-evidence validation; eps_diluted: Correct fields failed source-evidence validation |
| syn-05: Synthetic quarterly euros | 3/3 | 3/3 |  |
| syn-06: Synthetic quarterly billions | 3/3 | 3/3 |  |
| syn-07: Synthetic six-month report | 3/3 | 0/3 | revenue: Correct fields failed source-evidence validation; net_income: Correct fields failed source-evidence validation; eps_diluted: Correct fields failed source-evidence validation |
| syn-08: Synthetic nine-month report | 3/3 | 3/3 |  |
| syn-09: Synthetic fiscal year report | 3/3 | 0/3 | revenue: Correct fields failed source-evidence validation; net_income: Correct fields failed source-evidence validation; eps_diluted: Correct fields failed source-evidence validation |
| syn-10: Synthetic explicit three-month range | 3/3 | 0/3 | revenue: Correct fields failed source-evidence validation; net_income: Correct fields failed source-evidence validation; eps_diluted: Correct fields failed source-evidence validation |
| syn-11: Synthetic net loss | 3/3 | 0/3 | revenue: Correct fields failed source-evidence validation; net_income: Correct fields failed source-evidence validation; eps_diluted: Correct fields failed source-evidence validation |
| syn-12: Synthetic decimals and thousands | 3/3 | 3/3 |  |
| syn-13: Synthetic revenue only | 3/3 | 3/3 |  |
| syn-14: Synthetic revenue and EPS only | 3/3 | 1/3 | revenue: Correct fields failed source-evidence validation; eps_diluted: Correct fields failed source-evidence validation |
| syn-15: Synthetic GAAP versus adjusted | 3/3 | 3/3 |  |
| syn-16: Synthetic non-GAAP distractors | 3/3 | 0/3 | revenue: Correct fields failed source-evidence validation; net_income: Correct fields failed source-evidence validation; eps_diluted: Correct fields failed source-evidence validation |
| syn-17: Synthetic publication date distractor | 3/3 | 0/3 | revenue: Correct fields failed source-evidence validation; net_income: Correct fields failed source-evidence validation; eps_diluted: Correct fields failed source-evidence validation |
| syn-18: Synthetic consolidated versus segment | 3/3 | 0/3 | revenue: Correct fields failed source-evidence validation; net_income: Correct fields failed source-evidence validation; eps_diluted: Correct fields failed source-evidence validation |
| syn-19: Synthetic HTML table | 3/3 | 3/3 |  |
| syn-20: Synthetic HTML EUR thousands | 3/3 | 3/3 |  |
| syn-21: Synthetic fiscal nine months | 3/3 | 3/3 |  |
| syn-22: Synthetic precise negatives | 3/3 | 3/3 |  |
| syn-23: Synthetic small figures | 3/3 | 0/3 | revenue: Correct fields failed source-evidence validation; net_income: Correct fields failed source-evidence validation; eps_diluted: Correct fields failed source-evidence validation |
| syn-24: Synthetic annual EUR | 3/3 | 0/3 | revenue: Correct fields failed source-evidence validation; net_income: Correct fields failed source-evidence validation; eps_diluted: Correct fields failed source-evidence validation |
| syn-25: Synthetic prompt injection in source | 3/3 | 3/3 |  |

## Interpretation

Expected field agreement checks value, currency, unit, scale, basis, period end and months; missing values require model-authored abstention. It does not score fiscal year, fiscal quarter label, or period start equality. Source validation separately checks claimed starts and evidence.

The 75 expected fields include explicit missing-value cases. A matching numeric value alone does not establish an accepted result. Source-verified scores include correct abstentions, not just numeric facts.

Failure reasons (cases may have more than one):

- 10 cases: Period start is not supported by source dates.
- 2 cases: Reporting date and duration must be printed in the source; publication date alone is insufficient.

Fixture SHA-256: `357c503c01a4223c97c999952f77680c534bc075d9ffc3694b2d8347978ae1e2`.
