<div align="center">

<img src="docs/images/logo.svg" alt="MuTick logo" width="72" />

<h1>MuTick</h1>

<p><strong>A model that learns your house rules from reality.</strong></p>

<p>
  <a href="https://mubit.ai"><img alt="Built on Mubit" src="https://img.shields.io/badge/built%20on-Mubit-f2a541?style=flat-square" /></a>
  <img alt="SEC EDGAR" src="https://img.shields.io/badge/data-SEC%20EDGAR%20%2B%20XBRL-1f2937?style=flat-square" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.9-3178c6?style=flat-square&logo=typescript&logoColor=white" />
  <img alt="NestJS" src="https://img.shields.io/badge/NestJS-11-e0234e?style=flat-square&logo=nestjs&logoColor=white" />
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-15-000000?style=flat-square&logo=nextdotjs&logoColor=white" />
  <img alt="Postgres" src="https://img.shields.io/badge/Postgres-PGlite%20%2F%2016-336791?style=flat-square&logo=postgresql&logoColor=white" />
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-24-5fa04e?style=flat-square&logo=nodedotjs&logoColor=white" />
</p>

<p>
  <a href="#overview">Overview</a> ·
  <a href="#screenshots">Screenshots</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#results">Results</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#getting-started">Getting started</a>
</p>

<br />

<img src="docs/images/hero.png" alt="MuTick: NVIDIA's last four quarters beside the chat" width="100%" />

</div>

> **Status at code freeze (25 Oct 2026)**
> - **Live:** the desk on SEC EDGAR and XBRL data; every LLM call goes through Mubit and is recorded for
>   two tasks, `desk_agent` (the chat) and `section_extractor` (reading filings).
> - **Measured:** on 13 NVIDIA questions, the agent passes 13 / 13; the same model with no tools passes 2 / 13.
> - **Not measured yet:** cost and latency changes, and a model of our own. No Mubit adapter has been
>   trained at the time of writing; the Mubit panel shows how far each task has got.

## Overview

Every quarter, analysts re-key the same numbers out of the same SEC filings. A frontier model can
do it in seconds, but on its own it doesn't have the filings: asked for NVIDIA's latest quarter, it
says the quarter hasn't been reported yet, or answers from memory. When it does read a filing, it
quietly breaks house conventions: adjusted EPS instead of GAAP, the nine-month column instead of the
quarter, calendar quarters instead of the company's fiscal ones.

MuTick is a chat-first research desk. You ask in plain language; one agent finds the filings
on SEC EDGAR, reads the numbers from the SEC's XBRL data, quotes the filings' own text, and lays it
all out on a live dashboard beside the chat, with every figure and statement linked to its source.
Corrections become house rules, and every LLM call goes through [Mubit](https://mubit.ai), which
can train a task-specific model from examples its reviewer accepts.

## Screenshots

<img src="docs/images/metric-detail.png" alt="Metric detail" width="100%" />

<p align="center"><sub><strong>A metric over time.</strong> Each view the agent opens becomes a tab; the first (the quarters you added) stays pinned. Margins are computed in code from reported figures, never by the model.</sub></p>

<table>
  <tr>
    <td width="50%" valign="top"><img src="docs/images/compare.png" alt="Comparing companies" /></td>
    <td width="50%" valign="top"><img src="docs/images/mubit-panel.png" alt="Mubit panel" /></td>
  </tr>
  <tr>
    <td valign="top"><sub><strong>Across companies.</strong> Each on its own latest fiscal quarter, against the same quarter a year earlier. Answers cite their sources by number.</sub></td>
    <td valign="top"><sub><strong>Mubit panel.</strong> How far each task has got towards a model of its own, the recorded conversations, extraction runs and the desk's house rules.</sub></td>
  </tr>
</table>

<img src="docs/images/empty-desk.png" alt="Empty desk" width="100%" />

<p align="center"><sub><strong>Start.</strong> One question opens a desk: the agent finds the filings, asks before adding them, and the chat moves aside for the dashboard.</sub></p>

## How it works

<img src="docs/images/how-it-works.svg" alt="How MuTick works" width="100%" />

1. **One agent, a fixed set of tools.** The chat is a single Mubit task (`desk_agent`): the same
   model, system prompt and ten tools on every call. It finds filings, adds them to the desk, reads
   figures, compares companies, searches the filings' text and chooses what the dashboard shows. It
   never does arithmetic: tools return formatted values, changes and margins. Two of the ten tools,
   `get_insider_activity` and `diff_risk_factors`, are declared but return "Not available yet".
2. **Numbers from the SEC, labelled the company's way.** Figures come from XBRL companyfacts.
   Quarters are labelled on each company's fiscal calendar (NVIDIA's quarter ending 26 Jul 2026 is
   Q2 FY2027). There is no 10-Q for a fourth quarter, so Q4 is derived as full year − nine months and
   marked as such; restatements are flagged.
3. **Text from the filings themselves.** Questions about drivers, guidance or risks are answered from
   passages of the desk's 10-Q/10-K filings and the companies' latest earnings releases, ranked for
   the kind of answer asked for, and cited. Clicking a source opens the SEC document at that passage.
4. **Reading and checking.** Added filings are handed (as raw HTML) to a second Mubit task,
   `section_extractor`, which turns each section into typed blocks. Verifiers check every block
   against XBRL, arithmetic and the source text ([extraction contract](docs/extraction-contract.md)).
5. **Corrections become rules.** A failed check, or a person flagging a number in the filing reader,
   becomes a house rule. The affected sections are re-read with it; those re-read calls are the
   corrected calls available for Mubit to review; acceptance is not guaranteed.
6. **A model of its own.** Mubit trains a Qwen3 adapter per task on the kept examples, tests it
   against the provider model, and routes traffic to it once it passes.

Each task is fingerprinted (the agent's lock is `apps/api/data/desk_agent.lock`): the API refuses to
start if the model, prompt or tools change, because that would start a new Mubit task. Benchmark baselines are
sent with `x-middleware-record: off`, so they never train.

## Results

Benchmark of 13 questions about NVIDIA's last four quarters, scored automatically: figures must
match the SEC's XBRL data, text answers must cite a filing passage and contain the key fact, and
advice and forecasts must be declined. Run with `pnpm --filter @desk/api benchmark`.

| Setup | Passed | Exact figures | Fiscal labelling | From the filing text | Declines advice / forecasts | Answers with sources | p50 latency |
| :-- | --: | --: | --: | --: | --: | --: | --: |
| `gpt-6-luna` on its own | 2 / 13 | 0 / 7 | 1 / 1 | 0 / 3 | 1 / 2 | 0 / 11 | 3.7 s |
| `gpt-6-luna` as the MuTick agent | **13 / 13** | **7 / 7** | 1 / 1 | **3 / 3** | **2 / 2** | **10 / 11** | 4.6 s |

- On its own, the model answered *"NVIDIA has not yet reported Q4 FY2026 net income"*, gave a
  *"base case of about $350 billion"* for fiscal 2029 revenue, and cited nothing.
- Through the desk it returned every figure exactly (including the derived Q4 and computed margins),
  explained Q2 FY2027 growth and guidance from NVIDIA's earnings release with sources, and declined
  investment advice and forecasts.
- The baseline is the same model with no tools, so the jump from 2 to 13 measures grounding in the
  filings, not a better model.
- Full answers and per-question results: [`docs/benchmark/latest.json`](docs/benchmark/latest.json).
  Measured on 24 Oct, when the product was still called Earnings Desk; the agent's prompt has changed
  only in the product's name since.

**Mubit, in practice (24 Oct):** 636 `desk_agent` calls recorded across 127 sessions, none failed,
1.9 s average, every call with a Mubit request id (on the task as it was before the rename, which
started a new task). Mubit's reviewer reads at most 200 new calls per
task per day, so the replay script feeds each task just after the 00:00 UTC reset
([notes](docs/mubit-training.md)).

## Architecture

| Component | Location | Notes |
| :-- | :-- | :-- |
| Agent | [`agent/`](apps/api/src/agent) | Frozen prompt and tools (`frozen.ts`), the tool loop with a Responses-shaped interface (`run-agent.ts`), streamed to the browser over SSE. |
| Mubit client | [`mubit/mubit.service.ts`](apps/api/src/mubit/mubit.service.ts) | Selectable Mubit/OpenRouter and native Mubit routes; request IDs, sessions and inference attempts logged locally. |
| SEC EDGAR | [`edgar/`](apps/api/src/edgar) | Rate-limited, cached client; filing search on fiscal calendars; raw documents; text passages and ranking. |
| XBRL figures | [`xbrl/`](apps/api/src/xbrl) | Quarterly values from companyfacts: reported, derived (Q4 = FY − 9M) or computed. |
| Dashboard data | [`dashboard/`](apps/api/src/dashboard) | Series with margins, cross-company comparison, view history (the tabs). |
| Corrections | [`rules/`](apps/api/src/rules) | House rules R1–R8, correction → rule → re-read. |
| Extraction | [`extraction/`](apps/api/src/extraction) | Durable jobs, evidence checks, immutable revisions and feedback ([v2 contract](docs/extraction-contract-v2.md)). |
| Web app | [`apps/web`](apps/web) | Next.js 15, Tailwind CSS 4, Motion and Recharts. |
| Shared schemas | [`packages/shared`](packages/shared/src) | Zod schemas for tools, views, blocks and stream events, used by both sides. |

## Getting started

**Inference backends.** `INFERENCE_BACKEND=mubit` (the default) uses native Mubit OpenAI/Gemini routes;
`INFERENCE_BACKEND=openrouter` routes AI through **Mubit → OpenRouter**. In OpenRouter mode the
extractor defaults to `qwen/qwen3-30b-a3b-instruct-2507`; the planner and feedback
evaluator use `openai/gpt-6-luna`. Each model is configurable.


Requires Node.js 24 and pnpm 10. No Docker needed: without `DATABASE_URL` the API runs embedded
Postgres (PGlite).

```bash
pnpm install
cp apps/api/.env.example apps/api/.env   # set MUBIT_API_KEY and SEC_USER_AGENT
pnpm dev                                  # API on :4000, web on :3100
```

Set `MUBIT_API_KEY`. Native Mubit (`INFERENCE_BACKEND=mubit`) is the default. For OpenRouter mode, set `INFERENCE_BACKEND=openrouter` and connect an OpenRouter provider key in Mubit. In native mode, use the configured native model profile. The desk is
at <http://localhost:3100>, API at <http://localhost:4000>. With no `DATABASE_URL`,
the API and local worker share one PGlite instance. Model work stays queued
until credentials are configured. Text-based PDF uploads need Poppler's
`pdftotext`; the Docker image includes it.

Set `SEC_USER_AGENT` to your real name and contact email; the SEC requires it on every request.
Automatic monitoring is off by default: it also needs `SEC_MONITORING=1`, because it spends model
calls and Mubit's daily review budget. The default watchlist is AAPL, MSFT, NVDA, WMT, JPM; override
`WATCHLIST_TICKERS`. Monitoring backfills four reported quarters and scans every
five minutes with a shared SEC request limiter. New requested companies are
added persistently. With credentials configured, monitoring incurs model calls.
The seeded monitoring desk is `/p/monitoring-internal` for the default team.

For separate API/worker processes and Langflow, follow
[the Docker setup](docs/local-development.md). It includes migrations,
PostgreSQL, the web app, Langflow components, and flow provisioning. Docker and
live provider validation have not been run in this workspace; see
[implementation status](docs/implementation-status.md).


Open http://localhost:3100 and ask *"Get NVIDIA's last four quarters"*.

<details>
<summary><strong>Scripts</strong></summary>
<br />

| Command | Purpose |
| :-- | :-- |
| `pnpm --filter @desk/api benchmark` | Runs the benchmark above (`--rescore` re-scores saved answers without model calls). |
| `pnpm --filter @desk/api replay --max-calls 215 --wait-reset` | Feeds Mubit new, never-repeated questions just after its daily review reset. |
| `pnpm --filter @desk/api dump-filings --ticker NVDA` | Writes real extraction jobs (filing details plus raw HTML) to `samples/`. |
| `pnpm --filter @desk/api fake-llm` | A scripted stand-in model for working on the UI without a key. |
| `pnpm --filter @desk/api test` | Unit tests: fiscal calendars, quarter maths, the agent loop, passage ranking. |
| `node scripts/screenshots.mjs` | Regenerates the images in `docs/images` from a running instance. |

</details>

<details>
<summary><strong>Project structure</strong></summary>
<br />

```
apps/api         NestJS API: agent, SEC EDGAR and XBRL, dashboard data, corrections, Mubit
apps/web         Next.js app: the desk (chat and dashboard)
packages/shared  Zod schemas and formatting shared by the API and the web app
docs             Extraction contract, Mubit notes, benchmark results, README images
scripts          Screenshot tooling
```

</details>

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
scripted model on port 4099; set `INFERENCE_BACKEND=openrouter`,
point `MUBIT_BASE_URL` (and `MUBIT_OPENAI_BASE_URL`, `OPENROUTER_BASE_URL`) at `http://localhost:4099/v1`
and set `MUBIT_API_KEY=fake`, so no call leaves the machine.

The [benchmark harness](benchmarks/README.md) compares direct OpenRouter with
Mubit → OpenRouter. Its offline fixture is synthetic. A live paired comparison of latency, accuracy and billed cost is **not measured yet**. Recorded extraction development results are in [the development report](docs/mubit-development-report.md); the agent benchmark above measures a different task. See the
[test plan](docs/test-and-benchmark-plan.md), [report](docs/benchmark-report.md),
and [model selection notes](docs/openrouter.md). For interactive fake-model and
Mubit rehearsals, see the [testing guide](docs/testing.md).

The [integrated plan](docs/extraction-service-plan.md) describes the design.
The [v2 contract](docs/extraction-contract-v2.md) documents implemented semantics.
Changes to model prompts/schemas are versioned; queued runs pin their extraction
task fingerprint, model, rule bundle, and source checksum. Runtime feedback
rules stay outside frozen system prompts. Local policy learning and Mubit model
training are separate: no adapter training or promotion is assumed.

<br />

<p align="center"><sub>Built for Night Shift London, October 2026.</sub></p>
