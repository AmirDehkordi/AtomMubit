# Testing and interactive runs

## Automated checks

From the repository root:

```sh
pnpm test
pnpm typecheck
pnpm build
node apps/api/scripts/smoke-extraction.mjs
node apps/api/scripts/smoke-extraction.mjs --workflow
node apps/api/scripts/smoke-extraction.mjs --native
```

Run `pnpm build` before the smoke commands: they require the compiled API.
They start temporary local services and a fake model; they do not call the SEC
or a paid model provider.

## Interactive UI with the fake model

Install dependencies and copy `apps/api/.env.example` to `apps/api/.env` if you
have not already. Use two terminals from the repository root:

```sh
pnpm --filter @desk/api fake-llm
```

```sh
INFERENCE_BACKEND=openrouter MUBIT_BASE_URL=http://localhost:4099/v1 MUBIT_API_KEY=fake SEC_USER_AGENT= WORKFLOW_MODE=direct pnpm dev
```

Open <http://localhost:3100> and start a desk. Chat requests for real companies
can still fetch SEC data; use uploads for a local-only rehearsal. Open
**Document extraction** to upload a supported HTML, TXT, or text based PDF file,
submit an extraction request, and exercise the request/feedback UI. The fake
extractor deliberately returns unknown values because it cannot read source
evidence; this run checks UI and workflow behavior, not extraction accuracy.
Stop the app with Ctrl+C in its terminal and stop the fake model separately.

## Interactive run through Mubit

In `apps/api/.env`, set `MUBIT_API_KEY` to the key for your Mubit workspace and
connect an OpenRouter provider key in Mubit. The default
`MUBIT_BASE_URL=https://api.mubit.ai/compat/openrouter/v1` routes model calls
through Mubit. Keep `SEC_USER_AGENT` empty for an upload-only rehearsal; setting
it enables automatic SEC monitoring, which can also create model work. Start
the app from the repository root:

```sh
pnpm dev
```

At <http://localhost:3100>, start a desk, expand **Document extraction**, upload
a supported document with an optional ticker, then submit an extraction request
for the facts to inspect. The upload queues a default extraction; the request
can specify the fields to retrieve. Check the displayed status, source quote,
and evidence offsets when the run completes. Model calls are billed according
to the Mubit/OpenRouter account configuration.

For a separate API/worker, PostgreSQL, and Langflow setup, see
[`local-development.md`](local-development.md).

## Existing databases

Migration 0005 upgrades the current `main` schema and preserves existing filing
memberships. Databases created with the earlier unmerged extraction migrations
0002–0004 use a different history; back up any needed data and reconcile that
history before running this branch. Do not apply both migration lineages.

Dashboard corrections queue a new revision of each affected source document,
retaining its requested fields and previous citations. Legacy sections without
a durable source must be ingested first; a failed enqueue leaves the correction
available to retry.
