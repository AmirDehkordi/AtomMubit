# Langflow workflows

Langflow is pinned to 1.13.0 in Compose. Its custom-component loader mounts
`components/` into the official `LANGFLOW_COMPONENTS_PATH` directory. The
`Earnings Desk Model Gateway` component calls only
`POST http://api:4000/internal/model`, passes the task/run/input envelope, and
requires the shared `MODEL_GATEWAY_TOKEN`. It enforces the two supported task
names and a 300 KB input limit; NestJS validates that the run is active.

## Provision the two flows

First open <http://localhost:7860> and create an API key in Langflow Settings.
Set `LANGFLOW_API_KEY` in the root `.env`, then run:

```sh
python3 workflows/langflow/provision_flows.py
```

The provisioning script reads Langflow's installed component templates from
`GET /api/v1/all`, then creates or updates two native graph flows through
`POST`/`PATCH /api/v1/flows`. Each graph is Chat Input → Earnings Desk Model
Gateway → Chat Output. This avoids checked-in node metadata going stale across
Langflow releases. It does not upload or execute Python source. The custom
component code is loaded only from the operator-mounted `components/` path.

The two flows are distinct IDs used for extraction and feedback dispatch. The
worker sends the JSON envelope `{task, runId, input}` as the Chat Input text;
the component restricts task names to `section_extractor` and
`feedback_evaluator`, authenticates to NestJS, and returns JSON text containing
`{output, requestId}`. Copy the two IDs printed by the script into
`LANGFLOW_EXTRACTION_FLOW_ID` and `LANGFLOW_FEEDBACK_FLOW_ID` in `.env`, then
restart the API and worker. Do not add an LLM/provider component: model
selection, prompts, structured output schemas, and audit logging belong to the
internal gateway.

Langflow custom components are Python classes inheriting `Component`, with
class-level inputs and outputs. In Docker, Langflow loads them from the
mounted path configured by `LANGFLOW_COMPONENTS_PATH`. This implementation
uses Langflow's `lfx` import path for the pinned release.

The generated node and edge structure follows the [official starter flow](https://github.com/langflow-ai/langflow/blob/main/src/backend/base/langflow/initial_setup/starter_projects/Basic%20Prompting.json). Container import/execution still needs validation on the pinned Langflow release.
