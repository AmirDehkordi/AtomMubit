# Extraction benchmark harness

Run from the repository root:

```sh
node benchmarks/run.mjs --report benchmarks/results/smoke.json
node benchmarks/run.test.mjs
```

Default mode uses a clearly labeled synthetic fixture and fake output. Its
latency/cost are null, and its score only checks harness plumbing. It cannot
establish extraction quality or a performance winner.

A measured run requires a reviewed fixture with `id`, `split`, `model`, exact
OpenRouter `provider`, `input`, JSON `schema`, and `gold` facts. The present
scorer matches simple `{key,value,evidence}` facts; it is not yet the full v2
period/basis/scale/range or filing-level scoring runner. Use the system test
plan to prepare those extensions before publishing a product benchmark.

Paid mode requires both `OPENROUTER_API_KEY` and `MUBIT_API_KEY`, an OpenRouter
key configured in that Mubit workspace, and explicit rate variables for each
arm. For `DIRECT` and `MUBIT`, set
`BENCH_<ARM>_INPUT_USD_PER_MILLION`, `BENCH_<ARM>_OUTPUT_USD_PER_MILLION`,
`BENCH_<ARM>_CACHE_READ_USD_PER_MILLION`, and
`BENCH_<ARM>_CACHE_WRITE_USD_PER_MILLION`. Also set
`BENCH_MUBIT_FEE_USD_PER_CALL`; unknown fees must not be represented as zero.
Verify held-out call exclusion first, then set `MUBIT_UNRECORDED_CONFIRMED=1`
for test/holdout fixtures.

```sh
node benchmarks/run.mjs --paid --confirm-paid \
  --fixture path/to/reviewed-fixture.json --report benchmarks/results/pilot.json \
  --max-cost-usd 1 --max-output-tokens 512 --repetitions 5 --seed 42
```

The harness pins the provider, disables fallback and hidden SDK retries,
randomizes paired route order, records successes and failures, and bounds new
calls using conservative reservations. Token estimates and actual billing are
separate; unknown usage/cost stays unknown. Provider-account spend controls are
still useful because local estimates are not a billing guarantee.

The default Compose benchmark profile runs the same offline smoke. The paired
direct-provider/Mubit comparison remains unrun. Separate live native-Mubit
development batches are analyzed in the [bulk benchmark review](../docs/bulk-benchmark-review.md).

Audit the two preserved 3,000-request batches without sending requests:

```sh
node benchmarks/review-bulk.mjs
```

This re-scores saved outcomes, checks journal/fixture integrity, and prints
pooled metrics and failure categories. It requires the ignored local result
directories; a fresh checkout does not contain the raw datasets.

## Recorded Mubit development examples

`fixtures/mubit-development.json` contains 25 fictional earnings excerpts and
expected fields. These are development examples, not a held-out test set. The
native Mubit or OpenRouter profile is read from `apps/api/.env`.

Prepare individual sample files without sending requests:

```sh
node benchmarks/mubit-development.mjs --output benchmarks/results/development-preview
node --test benchmarks/development-scoring.test.mjs
```

Explicitly send the batch after building the API:

```sh
node benchmarks/mubit-development.mjs --send --max-calls 50 \
  --output benchmarks/results/development-run
```

The runner invokes the production extraction engine and workflow with the
unchanged task prompt/schema and starter rules. Gold labels never enter model
prompts. Each single-section example permits at most one repair; the process
checks the global cap before every call, uses no SDK retries, and caps each
response at 3,000 output tokens. Authentication, payment, permission and rate
errors stop the batch. Provider-internal retries cannot be established here.
No application worker or SEC discovery is started. Calls are recorded under
normal `section_extractor` semantics; Mubit decides which examples to keep and
whether to train. Sending examples does not prove training or promotion.

The runner also disables the application's transient transport retries for
these budgeted calls. Repair attempts are counted separately. It persists an
attempt before sending and again after completion; an interrupted attempt with
no result has an unknown outcome and must not be automatically replayed.
SIGINT/SIGTERM requests a stop before the next model call, allowing the current
call to finish and be saved. This does not cancel a request already at Mubit.

Reports include model field agreement and source-verified agreement separately,
per-case results, call latency (including client/telemetry overhead), token
counts, and request IDs. Missing-field application fallbacks do not count as
correct model abstentions. Billed cost remains unknown without invoices. The
runner writes a separate telemetry database and JSON/Markdown reports under the
output directory, which is ignored by Git when placed in `benchmarks/results/`.

### Expanded corpus (100 examples)

`fixtures/mubit-development-expanded.json` freezes 20 reformatted SEC XBRL
excerpts (four available matched quarterly periods each for AAPL, MSFT, NVDA,
META and TSLA), plus 80 deterministic synthetic variants across ten scenario
families. The synthetic cases vary currencies, scales, 3/6/9/12-month periods,
HTML tables, losses, missing EPS, zero income, GAAP/non-GAAP distractors,
segment distractors, release dates and source instruction injection. These are
80 variants, not 80 independent document structures. All 100 ask for revenue,
net income and diluted EPS.

Each SEC case stores its original observations, concept names, accession,
companyfacts URL and raw-response SHA-256. Values and period boundaries must
match within one accession; overlapping revenue concepts are never added.
This source text is **reformatted structured data, not original filing prose**.
The answer key and text come from the same observations, so their agreement
does not establish independent financial accuracy. The four available periods
may be nonconsecutive when matched quarterly facts are unavailable.

```sh
# Optional refresh of public data (no model calls). Uses SEC_USER_AGENT and
# cached raw SEC responses under benchmarks/results/sec-corpus-cache/.
node benchmarks/prepare-expanded-development.mjs

# Offline validation and sample preparation:
node --test benchmarks/development-fixture.test.mjs benchmarks/development-scoring.test.mjs
node benchmarks/mubit-development.mjs \
  --fixture benchmarks/fixtures/mubit-development-expanded.json \
  --max-calls 200 --output benchmarks/results/expanded-preview

# Paid run: use a NEW output directory and an explicitly agreed call budget.
node benchmarks/mubit-development.mjs --send \
  --fixture benchmarks/fixtures/mubit-development-expanded.json \
  --max-calls 200 --output benchmarks/results/expanded-run
```

The runner accepts at most 100 cases and 200 calls, checks the cap before each
call, refuses exact duplicate content and refuses `split: holdout`. An exclusive
`send.lock` prevents reusing a paid output directory, including after an interrupted
run. It does not resume or retry a partial paid batch automatically. The expanded
scorer also checks the explicitly printed period start; the older 25-case corpus
does not define start-date gold, so the two scores are not directly comparable.

`fixtures/extraction-holdout-candidates.json` contains eight **unsent** examples
from AMZN and GOOGL, companies excluded from this development batch. The text
template overlaps development. These are candidates for a future evaluation,
not a finalized independent holdout: review labels, add original filing excerpts,
split by company/filing/template, freeze the test set and verify exclusion from
Mubit recording before using them in a paired benchmark.

### Finding the traffic in Mubit

Use Requests, Last 24 hours (or longer), All tasks and Served by Anyone. Mubit
names tasks from the system instructions; find the task beginning “You extract
financial facts…”, using model `gemini-3.5-flash-lite` for the current native
profile. Local `section_extractor` is our task label, not a guaranteed console
name. JSON reports retain the `mreq_` response-header IDs for support correlation;
the console's internal Request ID differs. The benchmark telemetry database is
separate from the desk application's database, so its local stats do not include
these batches. See [Mubit Requests](https://docs.mubit.ai/guides/requests) and
[task grouping](https://docs.mubit.ai/guides/tasks-and-sessions).

Recorded calls, kept examples, trained adapters and routed responses are separate
stages. More calls do not prove that an adapter trained or improved. Only kept
examples train adapters, according to the
[Gemini recording documentation](https://docs.mubit.ai/guides/connect-gemini).
Use the console to verify kept/training/serving status; the local reports do not
measure those stages. No background feed is scheduled by this runner.

### Currency regression samples

`fixtures/mubit-currency-regression.json` adds 40 synthetic development examples
across CAD, EUR, GBP and USD. They cover both text and HTML, zero and negative
amounts, missing EPS and non-GAAP distractors. They are recorded development
material, not held-out benchmark data. The sampling run found CAD facts labelled
with USD units; the verifier now rejects currency/unit contradictions and the
runtime rules explicitly require consistent units. The system prompt and schema
remain unchanged; the local extraction task version changes for the new verifier.

```sh
# Prepare without model calls (add --send only for an authorized live run):
node benchmarks/mubit-development.mjs \
  --fixture benchmarks/fixtures/mubit-currency-regression.json \
  --max-calls 80 --output benchmarks/results/currency-preview

# Summarize an existing run without sending anything:
node benchmarks/summarize-development.mjs benchmarks/results/currency-run
```

Reports for targeted reruns must stay separate from their original results:
correcting a known failure is useful development evidence, not a fresh accuracy
measurement or proof that Mubit trained an adapter.

### Explicit 3,000-request development batch

`prepare-bulk.py` builds 3,000 unique source examples from the cached SEC
companyfacts responses and synthetic scenario templates. It excludes previously
prepared exact source text and previously used public reporting periods, uses
only the five development companies, and leaves reserved AMZN/GOOGL material
out. The corpus manifest reports the actual SEC/synthetic mix. Synthetic
variants are not independent document structures, and generated gold is not
independently adjudicated.

```sh
python3 benchmarks/prepare-bulk.py
node benchmarks/mubit-bulk.mjs  # validates only; sends nothing
# Only with an explicit budget, after building the API:
node benchmarks/mubit-bulk.mjs --send --max-calls 3000 --concurrency 8
```

This runner uses one model call per example, with both repair attempts and
transport retries disabled. It permits at most eight concurrent calls and
3,000 total starts. Authentication, payment, permission or rate-limit failures
stop new starts; requests already started finish and are logged. SIGINT or
SIGTERM similarly stops new starts without discarding responses already in
flight. No automatic background retries or scheduled follow-up are created.

`calls.jsonl` journals starts before dispatch and outcomes after completion;
`cases.jsonl` stores outputs, scoring and evidence checks; `progress.json` is
an atomic progress snapshot. `summary.json` contains final results and receipts.
An exclusive `send.lock` prevents accidentally rerunning a paid output directory.
The corpus generator also refuses to overwrite an already-sent fixture.
An interrupted request without an outcome has unknown status and must not be
automatically replayed. Model errors remain part of the report; no attempts are
hidden to improve the score. Cost and Mubit kept/trained/routed status remain
unknown without external billing and console evidence.
