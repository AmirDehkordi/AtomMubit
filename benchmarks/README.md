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

The default Compose benchmark profile runs the same offline smoke. No live
model benchmark has been run in this implementation.

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

Reports include model field agreement and source-verified agreement separately,
per-case results, call latency (including client/telemetry overhead), token
counts, and request IDs. Missing-field application fallbacks do not count as
correct model abstentions. Billed cost remains unknown without invoices. The
runner writes a separate telemetry database and JSON/Markdown reports under the
output directory, which is ignored by Git when placed in `benchmarks/results/`.
