# Earnings Desk — Extraction Overview

*A model that learns your house rules from reality.*

## Purpose

Turn earnings releases and SEC filings into reliable, structured financial data. Reduce manual extraction and recurring errors such as confusing adjusted EPS with GAAP EPS, annual results with quarterly results, or thousands with millions.

This work focuses on the extraction pipeline. A separate team owns the chatbot; the dashboard and chat consume the extracted data and provide interfaces for feedback.

Implementation will extend the existing NestJS backend and shared PostgreSQL database in this repository. Reuse the Next.js client, desk agent, SEC retrieval, XBRL services, and shared types. API and worker run as separate processes from one backend image; Langflow handles extraction and feedback workflows. This supersedes the standalone Python extraction-service design.

The first version serves one internal team and retains team IDs for future expansion. Starter rules use quarterly GAAP figures, preserve reported currency and units, also normalize USD monetary totals to millions, and leave unsupported values missing with an explanation. EPS remains in currency per share. Feedback can refine these rules over time.

## Proposed workflow

**Data → Task Planner → Extraction Agent → Validation → Storage**

- **Data:** Automatically discover and download SEC EDGAR earnings releases and filings for an initial watchlist of AAPL, MSFT, NVDA, WMT, and JPM, targeting discovery within about 15 minutes. Backfill each company's last four reported quarters. Client uploads are an additional input. Prepare relevant text and tables for the shared extraction pipeline.
- **Task Planner:** Extend the existing desk agent to interpret natural-language requests and submit typed extraction jobs. Automatic ingestion and uploads use a default specification without an extra conversational planning call.
- **New companies:** Requests for companies outside the watchlist fetch their SEC filings, add them to the requesting team's ongoing monitoring, and trigger the standard four-quarter backfill.
- **Extraction Agent:** Execute tasks through Mubit and return structured JSON covering revenue, net income, GAAP diluted EPS, fiscal period, units, and source evidence by default. Natural-language requests can add other fields with supporting evidence.
- **Validation:** Check units, periods, arithmetic consistency, and evidence before marking results as verified. Later SEC filings can provide additional checks.
- **Storage:** Extend the existing database with durable jobs, document/run revisions, facts, scoped rules, and feedback. Preserve the dashboard's block/citation structures and deliver persistent progress across API and worker processes.

Existing headline dashboard values come from XBRL. The planned LLM extraction adds section-level facts and evidence; the system will keep these sources distinct and expose conflicts and derivations explicitly.

## Feedback loop

**Dashboard / Chat → Feedback ledger → System evaluation → Agent and rule updates → Future extractions**

Both interfaces submit feedback to the same ledger, preserving the original output, proposed correction, reason, and source evidence. The system decides how to apply feedback to the planner, extractor, and house rules, recording its rationale and versioned changes. Routine human approval is not required. Agent instruction/example updates and provider-managed model training are separate mechanisms.

Learned rules apply to the same team, with company-specific scope when relevant. Accepted rule changes automatically reprocess affected records within each company's last four reported quarters, preserving earlier revisions and exposing progress.

**Illustrative example:** A release lists GAAP diluted EPS of **$1.45** and adjusted EPS of **$1.90**. The extractor incorrectly selects $1.90 for GAAP EPS. An analyst corrects it to $1.45 through the dashboard or chat, and the correction becomes a learning example.

Mubit documents provider-compatible model calls and adapter training when enabled for a workspace. A direct correction-submission mechanism and production adapter usage still need verification. Backend scheduling, feedback decisions, and rule updates remain our responsibility. See the implementation plan for documentation findings.

## First milestone

Process **one real earnings release end to end**:

1. Automatically discover and download a relevant filing, then generate extraction tasks for a small set of core financial fields.
2. Extract and validate the values against the source.
3. Store structured JSON with source references and status.
4. Share the output contract and feedback API with the chatbot/dashboard team.
5. Record one correction and verify that the feedback is traceable to its extraction.

The initial build includes recurring ingestion for the watchlist, alongside manual uploads. Then expand coverage, SEC cross-checks, and the supported learning integration. See the [implementation plan](docs/extraction-service-plan.md) for confirmed decisions and pending questions.

The first version runs locally with Docker Compose services for web, API, worker, Langflow, and PostgreSQL. Production deployment follows later.

## Remaining implementation work

The [test and benchmark plan](docs/test-and-benchmark-plan.md) covers functional behavior and direct-LLM versus Mubit comparisons for latency, accuracy, and cost. A [benchmark report template](docs/benchmark-report.md) is ready for future measurements; no benchmark has been run.

The core product choices are settled. Remaining work includes the API contract and data schema, source/rule-conflict handling, automated feedback acceptance criteria, cost limits, and live Mubit/Langflow integration verification.

Source: [Data Extraction Automation Plan — shared chat](https://chatgpt.com/share/6adcd18f-58d0-83ed-b632-6e1c43576814), subsequent product decisions, and the repository's [client extraction contract](docs/extraction-contract.md). The desk application exists; the integrated extraction changes described here remain planned.

## Implementation

The integrated NestJS extraction worker, OpenRouter routing through Mubit, four API operations, scoped feedback, Compose/Langflow artifacts, and offline benchmark harness are now in the repository. See [implementation status](docs/implementation-status.md) for verification and remaining live acceptance work.
