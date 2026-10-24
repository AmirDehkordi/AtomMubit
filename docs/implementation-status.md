# Implementation and verification status

Updated 24 October 2026. This is a local integrated implementation, not a
production deployment or a measured extraction-quality result.

## Implemented

- Four extraction operations inside the existing NestJS API; idempotent upload,
  request and feedback receipts; natural-language intent and clarification.
- SEC ingestion through the existing EDGAR module, configurable persistent
  watchlists, four-quarter backfill, five-minute discovery cadence, a shared
  SEC limiter and fresh submissions cache. Real 15-minute detection performance
  has not been measured.
- PostgreSQL durable jobs, exclusive leases, heartbeats, stale-worker fencing,
  bounded retries, persistent section checkpoints, and transactional progress.
  Separate processing lanes keep discovery independent of long extraction jobs.
- Immutable source/run identities and project memberships; independently selected
  accepted revisions for each field set; old citations preserved.
- HTML/text preparation, structured v2 facts and legacy blocks, exact evidence
  spans, period/scale checks, explicit unknown checks, one repair, and USD
  normalization. PDF processing is implemented using Poppler in the Docker image.
- Scoped feedback decisions and development replay before rule activation;
  stage-specific planner/extractor context; automatic historical reprocessing.
  Missing/ambiguous regression evidence can defer a proposed update.
- Mubit → OpenRouter Chat Completions transport, structured outputs, parallel
  tool-call conversion, session IDs, per-attempt usage and request telemetry.
  Extractor default `qwen/qwen3-30b-a3b-instruct-2507`; planner and feedback
  evaluator default `openai/gpt-6-luna`. Each model remains configurable.
- Extraction UI for upload, requests, clarification, results/evidence, feedback
  and persistent progress polling. Existing chat/XBRL views remain integrated.
- Compose API/worker/web/PostgreSQL/migrate/Langflow/benchmark artifacts; two
  Langflow flows are provisioned from installed component metadata and a checked-in
  gateway component. Task locks and SEC cache persist in the API data volume.
- A paired, budget-bounded call benchmark harness and explicit results template.

## Verification performed

| Check | Result |
| --- | --- |
| API Vitest suite, including migrated PGlite queue/feedback/processor tests | 86 passed, 9 test files |
| Shared/API/web TypeScript checks | Passed |
| API production compilation | Passed |
| Next.js optimized production build | Passed |
| HTTP smoke with fake model and a temporary database | Passed |
| HTTP smoke through fake Langflow transport and real authenticated gateway | Passed |
| Offline paired benchmark harness test | Passed; synthetic outputs, null latency/cost |
| Langflow Python syntax and PostgreSQL init shell syntax | Passed |
| Compose YAML parsing and whitespace checks | Passed |

HTTP smoke checks upload, deduplication, process restart recovery, supported
facts/evidence, durable progress, reuse of an extraction by another request,
and feedback evaluation. The fake workflow check validates the HTTP envelope
and gateway contract, not a running Langflow installation.

The locked dependencies initially failed the local package-age policy.
`baseline-browser-mapping`, `electron-to-chromium`, and `es-toolkit` were pinned
to older versions; the lockfile was regenerated under the policy. No policy
was disabled. Existing approved build dependencies remain explicit.

## Remaining acceptance work

1. Install/start Docker and execute Compose builds and Langflow flow provisioning.
   Docker is not available on this host. Validate actual flow import/execution
   on the pinned Langflow release, separate PostgreSQL worker recovery, and
   successful text-PDF extraction with Poppler (also unavailable on this host).
2. Configure Mubit/OpenRouter credentials and a real SEC contact. Exercise a
   real filing and verify the serving model/provider, strict schema behavior,
   session grouping, recording/exclusion controls, and request IDs.
3. Curate and review the proposed SEC gold dataset. Extend the simple call-level
   benchmark scorer to the full v2 fiscal-period/basis/unit/range and filing
   pipeline protocol, then run the paired pilot with a configured spend cap.
   There are no measured live latency, accuracy, or billed-cost results yet.
4. Verify Mubit adapter invocation, promotion and billing separately. Local
   policy activation does not prove that provider-managed training occurred.

The application is configured for one trusted internal team on localhost.
Public deployment and multi-team onboarding require authentication and further
operational hardening. OCR remains out of scope. No PR, commit, deployment,
SEC download, or paid model call was performed during this implementation.
