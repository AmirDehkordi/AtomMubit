# Local development with Docker Compose

The Compose stack binds the Next.js desk on <http://localhost:3100>, the NestJS
API on <http://localhost:4000>, PostgreSQL on port 5432, and Langflow's
developer editor on loopback at <http://localhost:7860>. PostgreSQL creates
separate `desk` and `langflow` databases and logins at first startup. Data and
source-document storage live in PostgreSQL; the API data volume retains task locks and SEC cache.

## Start the stack

Create a root `.env` file and set secrets/configuration before starting:

```dotenv
DESK_DB_PASSWORD=choose-a-local-password
LANGFLOW_DB_PASSWORD=choose-another-local-password
POSTGRES_ADMIN_PASSWORD=choose-a-local-admin-password
MODEL_GATEWAY_TOKEN=choose-a-long-random-local-token
MUBIT_API_KEY=
SEC_USER_AGENT=Your Name your-real-email@example.com
LANGFLOW_API_KEY=
LANGFLOW_EXTRACTION_FLOW_ID=
LANGFLOW_FEEDBACK_FLOW_ID=
```

Build and start:

```sh
docker compose up --build
```

Compose waits for PostgreSQL, runs the one-shot `migrate` service
(`node dist/migrate.js`), then starts the API and worker with
`RUN_MIGRATIONS=0`. The API and worker use the same image and database. PDF
text extraction uses `pdftotext` from `poppler-utils` in the API image; local
non-Docker API development needs Poppler installed and available on `PATH`.
Text-based PDFs are supported; scanned-PDF OCR is not included. Set
`SEC_USER_AGENT` to a real contact name and email to enable SEC monitoring; an
empty value disables SEC monitoring while uploads remain available.

## Configure Langflow

After the editor is ready, create an API key in Langflow and set it as
`LANGFLOW_API_KEY` in `.env`. Follow
[`workflows/langflow/README.md`](../workflows/langflow/README.md) to provision
the section-extraction and feedback-evaluation graph flows using the mounted
custom component. The script prints both flow IDs. Set them in `.env` and
restart the API/worker:

```dotenv
LANGFLOW_EXTRACTION_FLOW_ID=your-section-flow-id
LANGFLOW_FEEDBACK_FLOW_ID=your-feedback-flow-id
```

Use the exact same `MODEL_GATEWAY_TOKEN` for the API and Langflow. Langflow
can reach the API on the private Compose network at
`http://api:4000/internal/model`; that endpoint is authenticated and must
validate each run against an active job. Never expose the gateway token to the
browser. The API/worker are configured for `WORKFLOW_MODE=langflow` in Compose.

Set `MUBIT_API_KEY` to enable paid inference. Leaving it empty allows the
services to start with model jobs queued. Once credentials and flow IDs are
configured, the worker processes queued work; a configured SEC watchlist can
therefore trigger paid inference automatically. Leave `SEC_USER_AGENT` empty
to disable automatic SEC ingestion while setting up the flows.

Select `INFERENCE_BACKEND=openrouter` (default) or `mubit` for native Mubit
models. Native mode uses `MUBIT_AGENT_MODEL`, `MUBIT_EXTRACTOR_MODEL`, and
`MUBIT_FEEDBACK_MODEL`; see [backend settings](openrouter.md#switch-the-production-backend).
Model settings are shared by API and worker. Extraction defaults to
`qwen/qwen3-30b-a3b-instruct-2507` (`EXTRACTOR_MODEL`); the planner (`AGENT_MODEL`)
and feedback evaluator (`FEEDBACK_MODEL`) default to `openai/gpt-6-luna`.
Override these in `.env`, then restart both API and worker. Runs pin their
model: submit a new extraction after switching models rather than resuming an
old pending run with a different model.

The web image points its browser API client at `http://localhost:4000`. The
web server is available at port 3100 and enables the existing API CORS origin.

## Useful commands

```sh
docker compose ps
docker compose logs -f api worker langflow
docker compose run --rm migrate
docker compose --profile benchmark run --rm benchmark
docker compose down
```

The benchmark profile runs the synthetic offline smoke fixture by default.
Paid calls require explicitly overriding the command with the benchmark
runner's `--paid --confirm-paid` flags, a positive cost cap, credentials, and
verified pricing variables; the service does not make paid calls on startup.

`docker compose down` keeps named volumes. To discard all local database,
Langflow, and document data, use `docker compose down -v`.

Without Docker, the API can still use the repository's embedded PGlite mode.
For the shared API/worker Compose setup, use PostgreSQL: the API and worker
must not point at one embedded database directory.
