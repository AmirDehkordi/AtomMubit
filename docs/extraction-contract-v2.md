# Integrated extraction contract v2

The v1 document remains historical integration context. The running desk uses
`ExtractionService.submitFiling(accession, projectId, requestId?, fields?)` to
queue retrieval. SEC HTML enters the same engine as optional uploaded HTML,
UTF-8 text, and text extracted from PDF. Uploads never receive fabricated SEC
accessions.

## API and identity

Four `/v1` operations are documented in the root README. The local deployment
serves a single trusted internal team: `TEAM_ID` is resolved on the server,
never accepted from client payloads. Host ports bind to localhost in Compose;
public deployment needs authentication before exposing these APIs.

POST idempotency keys are scoped by operation, team, and project. Reusing a key
with a different payload returns 409. Content/specification/version identities
reuse a run; `request_runs` links all requesting receipts to it. Document and
filing membership is many-to-many across desks. Legacy filings remain readable.

A run pins source identity, sorted requested fields, model, task fingerprint,
schema/workflow revision, and immutable rule strings/version. Result selection
is per project/document/field set. Acceptance never allows an older rule version
to replace a newer accepted result. Review results remain inspectable without
replacing accepted data. Original sections, blocks, and citations survive reruns.

## Facts and evidence

`SectionExtractionV2` contains six legacy display-block kinds and general facts.
Facts carry basis, printed currency/unit/scale, scalar or range, period and
qualifier, exact quote, and explicit missing reasons. Stored engine facts add
UTF-16 source spans, checks, normalization, supported status, and attempt IDs.
Full immutable engine output lives in `extraction_runs.output` JSONB; SEC display
blocks are additionally projected into existing section/block/check tables.

HTML preparation preserves tables as Markdown and bounds sections to 30,000
UTF-16 characters. PDF pages are extracted by Poppler; OCR is not implemented.
Checks distinguish pass/fail/unknown/not-applicable. Exact quote and printed
number/scale/date checks are deterministic; they do not prove semantic financial
accuracy. Missing XBRL and unavailable arithmetic are explicitly unknown.
Quarterly reported XBRL may reconcile comparable facts; it never replaces raw
LLM results. Annual/cumulative periods retain their actual duration, and the
engine never derives quarterly EPS by subtraction. USD totals have a separate
millions normalization; per-share figures stay per share.

One section repair is allowed for invalid schema/evidence. Attempts remain
separate. Transient job failures have three lease attempts; source lookbacks can
recover failed ingestion after a cooldown. Successful section-call checkpoints
survive restart. Work may still be repeated if a process dies between a provider
response and checkpoint commit; provider billing is not exactly-once.

## Progress and feedback

Queue leasing and result commits use lease-token fencing. Scheduler jobs dedupe
across workers; discovery has a separate processing lane. PostgreSQL is required
for separate API/worker processes. The PGlite local mode uses one process.

Result/status and progress writes share transactions. `GET /v1/data` exposes
an `after` cursor and `nextCursor`; SSE supports `Last-Event-ID`. A run can be
queued/running/completed/needs_review/failed; requests may also need clarification.
A completed document with no supported requested facts is not accepted.

Feedback proposals are apply/defer/reject decisions, with scoped immutable
lessons and target stage. Factual corrections need exact source evidence;
preferences cannot become hardcoded numeric answers. Candidate extraction runs
must preserve supported observations; up to two peer examples are replayed.
Planner lessons replay available accepted intents; planner-only changes defer
without planning examples. This is a bounded development regression gate, not
a substitute for a held-out accuracy benchmark. Applied policies queue affected
last-four-period revisions transactionally. Reprocessing does not create new
user feedback. Rule activation and each rerun have separate visible states.

## Model and flow integration

Production is NestJS/Langflow → authenticated internal gateway → Mubit →
OpenRouter. Local `WORKFLOW_MODE=direct` skips Langflow but still uses Mubit.
`/internal/model` validates the secret, active job lease, team, and persisted
section text. It owns prompts/schemas; Langflow cannot supply arbitrary system
instructions or provider credentials. Missing credentials/flow IDs leave model
jobs queued. Configure them before expecting completion.

The chat loop retains a Responses-shaped internal interface; its transport
converts to Chat Completions with parallel tool grouping. Task/transport changes
are versioned without deleting the original desk lock. Held-out benchmark calls
are separate unrecorded requests. Live Mubit exclusion, adapter serving, fees,
and provider schema support still require validation against the real workspace.
