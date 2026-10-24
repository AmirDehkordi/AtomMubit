# Earnings Desk

A model that learns your house rules from reality.

A research desk for SEC filings, with a conversational planner, automated
filing ingestion, evidence-linked extraction, and scoped house rules learned
from feedback. Production AI requests go through **Mubit → OpenRouter**. The
extractor defaults to `qwen/qwen3-30b-a3b-instruct-2507`; the planner and feedback
evaluator use `openai/gpt-6-luna`. Each model is configurable.

## Run locally

```sh
pnpm install
cp apps/api/.env.example apps/api/.env
pnpm dev
```

Set `MUBIT_API_KEY` and connect an OpenRouter provider key in Mubit. The desk is
at <http://localhost:3100>, API at <http://localhost:4000>. With no `DATABASE_URL`,
the API and local worker share one PGlite instance. Model work stays queued
until credentials are configured. Text-based PDF uploads need Poppler's
`pdftotext`; the Docker image includes it.

Set `SEC_USER_AGENT` to your real name and contact email to enable monitoring.
The default watchlist is AAPL, MSFT, NVDA, WMT, JPM; override
`WATCHLIST_TICKERS`. Monitoring backfills four reported quarters and scans every
five minutes with a shared SEC request limiter. New requested companies are
added persistently. With credentials configured, monitoring incurs model calls.
The seeded monitoring desk is `/p/monitoring-internal` for the default team.

For separate API/worker processes and Langflow, follow
[the Docker setup](docs/local-development.md). It includes migrations,
PostgreSQL, the web app, Langflow components, and flow provisioning. Docker and
live provider validation have not been run in this workspace; see
[implementation status](docs/implementation-status.md).

## Extraction API

Existing chat, project, SEC, and XBRL routes remain available.

| Operation | Route | Behavior |
| --- | --- | --- |
| Read results/progress | `GET /v1/data?projectId=…` | Requests, runs, revisions, facts/evidence, feedback, durable event cursor |
| Upload | `POST /v1/files` | Multipart `projectId`, `file`, optional `ticker`; automatically queues extraction |
| Feedback | `POST /v1/feedback` | JSON `projectId`, `runId`, `text`; evaluates and reprocesses supported changes |
| Request extraction | `POST /v1/extractions` | JSON `projectId`, `request`, optional `documentIds`/`parentRequestId` |

POST operations accept `Idempotency-Key`. Extraction/feedback return `202`;
upload returns `201`. Poll the returned `location`. Ambiguous requests expose
`needs_clarification` and a question; answer with another extraction request
referencing `parentRequestId`. Progress also streams through
`GET /events/:projectId`, with `Last-Event-ID` replay.

The extraction panel supports uploads, requests, clarification, feedback, and
review of printed and normalized facts. Old source citations remain available.
Dashboard headline calculations remain a separate XBRL data path.

## Validate without paid calls

```sh
pnpm test
pnpm typecheck
pnpm build
node apps/api/scripts/smoke-extraction.mjs
node apps/api/scripts/smoke-extraction.mjs --workflow
node benchmarks/run.test.mjs
```

The HTTP smoke test requires a built API. It starts a fake local model and a
temporary database, queues an upload, restarts the API, verifies extraction and
request reuse, and evaluates feedback. It makes no SEC or paid model calls.
For interactive UI rehearsals, `pnpm --filter @desk/api fake-llm` serves a
scripted model on port 4099; point `MUBIT_BASE_URL` at
`http://localhost:4099/v1` and set `MUBIT_API_KEY=fake`.

The [benchmark harness](benchmarks/README.md) compares direct OpenRouter with
Mubit → OpenRouter. Its offline fixture is synthetic. Live latency, extraction
accuracy, and billed cost are **not measured yet**. See the
[test plan](docs/test-and-benchmark-plan.md), [report](docs/benchmark-report.md),
and [model selection notes](docs/openrouter.md). For interactive fake-model and
Mubit rehearsals, see the [testing guide](docs/testing.md).

## Layout

| Component | Location |
| --- | --- |
| Shared schemas, v2 extraction contracts | `packages/shared/src` |
| API, planner, extraction, feedback, workers | `apps/api/src` |
| Additive database migrations | `apps/api/drizzle` |
| Next.js desk and extraction panel | `apps/web` |
| Langflow gateway component and flow provisioning | `workflows/langflow` |
| Paired benchmark runner | `benchmarks` |

The [integrated plan](docs/extraction-service-plan.md) describes the design.
The [v2 contract](docs/extraction-contract-v2.md) documents implemented semantics.
Changes to model prompts/schemas are versioned; queued runs pin their extraction
task fingerprint, model, rule bundle, and source checksum. Runtime feedback
rules stay outside frozen system prompts. Local policy learning and Mubit model
training are separate: no adapter training or promotion is assumed.
