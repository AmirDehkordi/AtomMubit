# OpenRouter routing and pricing

Checked against OpenRouter's public model and pricing pages on **24 October 2026**. These are listed rates at that date, not a billing statement or a benchmark result; confirm them again before a paid run.

## Routes and models

| Use | Endpoint | Model ID |
| --- | --- | --- |
| Production | Mubit Chat Completions compatibility route: `https://api.mubit.ai/compat/openrouter/v1` | `qwen/qwen3-30b-a3b-instruct-2507` for extraction; `openai/gpt-6-luna` for the planner and feedback evaluator |
| Benchmark A | Direct OpenRouter Chat Completions: `https://openrouter.ai/api/v1` | Same model and provider as B |
| Benchmark B | Mubit route above | Same model and provider as A |

Mubit exposes Chat Completions on this compatibility route, so the desk agent's Responses-shaped API is translated into Chat Completions messages, function tools, tool results, JSON schema, and Responses-shaped output. SDK retries are disabled (`maxRetries: 0`). The client cannot establish whether Mubit or a serving provider retries internally; inspect Mubit/provider request records before interpreting “one attempt” as one upstream attempt.

For the paired routing pilot, the runner sends `provider.order` with one selected provider, `require_parameters: true`, and `allow_fallbacks: false`. It pins the same provider on both arms. Production and benchmark calls use OpenRouter's `session_id` field for sticky session grouping; production hashes the session key, and the benchmark isolates session IDs per arm and repetition to prevent cache sharing. Record the actual serving provider returned by each route when available; if it is absent, serving identity is unverified. Provider pinning does not freeze a model revision or guarantee identical upstream infrastructure.

The extractor defaults to `qwen/qwen3-30b-a3b-instruct-2507`, a non-thinking model whose OpenRouter page lists JSON Schema support. Its listed starting input/output rates are 10%/40% below the previous Luna rates. This is a price comparison, not measured end-to-end savings or extraction accuracy. Provider rates and repair frequency affect realized cost. The planner and feedback evaluator retain Luna through separate `AGENT_MODEL` and `FEEDBACK_MODEL` settings; `EXTRACTOR_MODEL` controls extraction.

Existing runs pin their model and must not silently switch mid-run. Restart API and worker after changing configuration, then submit new extractions. The synthetic benchmark fixture retains Luna as an explicit baseline. For a Qwen routing comparison, configure the same Qwen model and a verified schema-capable provider in both arms, and freeze those settings before the run. Financial extraction quality on Qwen has not yet been measured.

## Listed prices at check date

OpenRouter listed standard model rates at the time of checking:

| Model ID | Input / 1M | Cache read / 1M | Cache write / 1M | Output / 1M | Notes |
| --- | ---: | ---: | ---: | ---: | --- |
| `qwen/qwen3-30b-a3b-instruct-2507` | $0.09 | — | — | $0.30 | Extractor default; starting provider rates; cache prices not established |
| `openai/gpt-6-luna` | $0.10 | $0.01 | $0.125 | $0.50 | Public model page's standard price; pinned provider endpoint may differ |
| `google/gemini-2.5-flash-lite` | $0.10 | $0.01 | $0.08333 | $0.40 | Retiring 20 October 2026; not the configured default |
| `google/gemini-3.1-flash-lite` | $0.25 | $0.025 | $0.08333 | $1.50 | Possible later candidate; switching requires a new frozen task and evaluation |

OpenRouter states that inference is passed through at provider list price. Standard and Business platform fees are 5.5% and 8% respectively, charged when credits are purchased rather than per inference request. These payment fees still affect fully allocated economics. Mubit platform/inference fees, credits, discounts, and any Mubit-side charges remain unknown here; do not claim total cost savings until those are reconciled.

The benchmark runner's paid mode therefore requires explicit per-arm input, cache-read, cache-write, and output rate inputs plus a `BENCH_MUBIT_FEE_USD_PER_CALL` value to estimate a spend cap. It requests token usage and records cache reads/writes separately. The pre-call reservation applies the greatest configured input/cache rate to a conservative UTF-8-byte input bound and adds the full output token cap and configured fee. The runner checks exposure before every call; if actual usage rises above the reservation it can stop before the next arm, recording an incomplete pair. Its JSON `estimatedCostUsd` is a configured-rate estimate, never a billed amount; `billedCostUsd` remains `null`. Failed calls without usage remain charged at the reservation for cap accounting, while final economic cost is unknown. This does not include prepaid-credit purchase fees, tax, unknown Mubit platform charges, or any hidden Mubit-side retry; disclose these and reconcile invoices before claiming a hard total-spend ceiling.

## Sources

- [OpenRouter Qwen3 30B A3B Instruct pricing and structured output support](https://openrouter.ai/qwen/qwen3-30b-a3b-instruct-2507)
- [OpenRouter GPT-6 Luna model, providers, and pricing](https://openrouter.ai/openai/gpt-6-luna)
- [OpenRouter GPT-6 Luna provider endpoints](https://openrouter.ai/openai/gpt-6-luna/providers)
- [OpenRouter Gemini 2.5 Flash Lite page and retirement notice](https://openrouter.ai/google/gemini-2.5-flash-lite)
- [OpenRouter Gemini 3.1 Flash Lite model and pricing](https://openrouter.ai/google/gemini-3.1-flash-lite)
- [OpenRouter routing guide](https://openrouter.ai/blog/insights/model-routing/)
- [OpenRouter pricing and plan fees](https://openrouter.ai/pricing)
