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
