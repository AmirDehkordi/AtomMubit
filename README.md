# Earnings Desk

A model that learns your house rules from reality.

A chat-first research desk for SEC filings. You talk to one agent; it finds the filings, reads them
section by section, checks every number, and draws what it read on a live dashboard beside the chat.
Every LLM call goes through [Mubit](https://mubit.ai).

## Run it

```bash
pnpm install
cp apps/api/.env.example apps/api/.env   # set MUBIT_API_KEY and SEC_USER_AGENT
pnpm dev                                  # API on :4000, web on :3100
```

Open http://localhost:3100 and try "Get NVIDIA's last four quarters".

**Without a Mubit key** (UI work, rehearsals): run the scripted fake model and point the API at it.
It walks the find → add → dashboard flow and compare, nothing else.

```bash
pnpm --filter @desk/api fake-llm                     # port 4099
MUBIT_BASE_URL=http://localhost:4099/v1 MUBIT_API_KEY=fake pnpm dev
```

**Giving Mubit volume:** with the API running on a real key, replay templated questions about 50 large
US companies. Replayed conversations don't start extraction, and no question is sent twice. Mubit's
reviewer reads at most 200 new calls per task per day (reset 00:00 UTC), so cap each day's batch;
see [docs/mubit-training.md](docs/mubit-training.md).

```bash
pnpm --filter @desk/api replay --max-calls 215 --concurrency 3           # now
pnpm --filter @desk/api replay --max-calls 215 --concurrency 3 --wait-reset  # just after 00:00 UTC
```

No Docker needed: without `DATABASE_URL` the API runs embedded Postgres (PGlite) in
`apps/api/data/pglite`. For a real server: `pnpm db:up`, then set
`DATABASE_URL=postgres://desk:desk@localhost:5432/desk`. Migrations run on start;
after changing `apps/api/src/db/schema.ts`, run `pnpm db:generate`.

## SEC data

`apps/api/src/edgar` and `apps/api/src/xbrl` are the only code that talks to SEC EDGAR: a declared
User-Agent on every request, at most 8 requests a second, and a disk cache in `apps/api/data/edgar-cache`.

| Endpoint (and agent tool) | Example |
|---|---|
| `find_filings` | `GET /filings/find?ticker=NVDA&forms=10-Q,10-K&lastNQuarters=4` |
| `get_metrics` | `GET /metrics?ticker=NVDA&metrics=revenue,eps_diluted&periodEnds=2026-01-25,2026-04-26` |

- Quarters are labelled on the company's own fiscal year (NVIDIA's quarter ending 26 Jul 2026 is
  Q2 FY2027). A 10-K stands for Q4; an 8-K earnings release is labelled with the quarter it reports.
- Quarterly numbers come from XBRL. When a quarter isn't reported on its own (Q4, and cash-flow
  lines, which 10-Qs give year-to-date), it is derived: Q4 = full year − nine months. Each value
  says whether it was `reported`, `derived` or `computed`.
- Run the unit tests with `pnpm --filter @desk/api test`.

The extraction module is built separately against [docs/extraction-contract.md](docs/extraction-contract.md).

## Layout

| Part | Where |
|---|---|
| Shared Zod schemas: extractor blocks, dashboard views, agent tool args, stream events | `packages/shared/src` |
| NestJS API | `apps/api/src` |
| Database schema (Drizzle) and migrations | `apps/api/src/db/schema.ts`, `apps/api/drizzle` |
| Next.js web app | `apps/web` |

## How the chat works

One agent (`apps/api/src/agent`) with a fixed set of tools (`packages/shared/src/tools.ts`). Each
user message runs up to 6 tool rounds on the Responses API; the turn streams to the browser as
server-sent events: tool steps, a choice card (`ask_user`), dashboard views (`show_on_dashboard`)
and the answer. The agent never computes numbers: tools return formatted values, changes and margins.

| Tool | Status |
|---|---|
| `find_filings`, `ask_user`, `add_filings`, `get_metrics`, `compare`, `show_on_dashboard` | Working |
| `search_blocks`, `get_blocks` | Working once extraction fills `blocks` |
| `get_insider_activity`, `diff_risk_factors` | Answer "not available yet" |

Dashboard views working now: `quarter_overview` and `compare`. Extraction is a stub
(`apps/api/src/extraction-stub`) until the real module lands; see the contract.

## Mubit tasks

Two tasks, each with a fixed model, system prompt, tools and output format:

- **desk_agent**: the chat. Sends the full tool list in `packages/shared/src/tools.ts` on every turn.
- **section_extractor**: reads one filing section and returns blocks (`packages/shared/src/blocks.ts`).

Changing anything that is part of a task (the schemas above included) starts a new Mubit task and
resets its examples. The API refuses to start when the desk_agent definition no longer matches
`apps/api/data/desk_agent.lock`; delete the lock only when you mean to start a new task.
All LLM calls go through `MubitService` (`apps/api/src/mubit`), which logs each one in `llm_calls`.
