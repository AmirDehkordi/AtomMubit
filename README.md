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

## Mubit tasks

Two tasks, each with a fixed model, system prompt, tools and output format:

- **desk_agent**: the chat. Sends the full tool list in `packages/shared/src/tools.ts` on every turn.
- **section_extractor**: reads one filing section and returns blocks (`packages/shared/src/blocks.ts`).

Changing anything that is part of a task (the schemas above included) starts a new Mubit task and
resets its examples.
