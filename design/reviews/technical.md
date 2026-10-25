# MuTick: technical review (CTO / senior AI engineer lens)

Reviewed on 25 Oct 2026 at about 01:00–01:30 London, on branch `design-polish` with the uncommitted UI changes, against the local fake model (port 4099). I read the code and docs, ran the type check and the offline tests, and drove the app at http://localhost:3100 in a separate browser tab. No real Mubit or OpenRouter calls were made. The only file I changed is this report.

## Score: 7 / 10

**Verdict.** The core idea holds up and is built more carefully than most hackathon entries. Numbers come from XBRL in code, never from the model. The derived quarters are correct: I checked NVIDIA's Q2 FY2027 operating cash flow of $24.08B, which is 6M $74.42B − Q1 $50.34B, and the Q4 FY2026 value of $36.19B, which is FY − 9M, against the raw companyfacts. The agent is a small, readable tool loop, and the Mubit task is fingerprinted and locked so it can't drift by accident. The extraction side has a properly built durable job queue (leases, `SKIP LOCKED`, fencing tokens, checkpoints, idempotency keys), and there are 139 unit tests plus migration tests. What holds the score down is the joins left by merging two codebases:
- the README is two documents stitched together, and `OVERVIEW.md` still says "Earnings Desk" and "no benchmark has been run";
- the filing reader, which you'd open live to show "quotes the filings' own text", lists 28 sections all titled **"Document Document · 0 blocks"**;
- every new desk re-extracts every filing, which spends about 150 `section_extractor` calls on one "Add all" against a 200-a-day review budget;
- the server keeps no record of in-flight chats, so Stop doesn't stop anything and two sends interleave;
- the SEC client has no stale-cache fallback, so a venue Wi-Fi hiccup at 09:00 fails the demo's first step.

None of these is deep. They are the issues a code-reading judge will list, and most can be fixed in under 30 minutes each.

---

## Top 5 fixes before the 07:00 freeze

None of these touch `apps/api/src/agent/frozen.ts` (the model, prompt or tools), so the `desk_agent` lock is unaffected. None touch `EXTRACTOR_SYSTEM` or the extraction schema either.

### 1. Serve from the SEC cache when the SEC can't be reached (about 10 min). This is the biggest demo risk.
**Where:** `apps/api/src/edgar/edgar.client.ts`, `text()`.

**Why:**
- `submissions` has a **5-minute** TTL (`edgar.service.ts:173`) and companyfacts 6 hours (`xbrl.service.ts:13`). So at 09:00, both the first "NVIDIA, last 4 quarters" and the dashboard refetch live from the SEC.
- If the SEC answers 403 (an undeclared or blocked User-Agent, or a shared venue IP), 429, or times out, `readCache` has already returned `null` for the stale file and the request throws. find_filings then fails on stage, even though the file is sitting in `data/edgar-cache`.

**Fix:**
- Read the cached file with no age limit as a fallback. Wrap `fetchWithRetry` in try/catch; on any error, if a cached body exists, log a warning and return it.
- About 8 lines. Filings never change, and a quarter-old submissions list is fine for a demo.

**Also:** on the demo machine, set `SEC_USER_AGENT` to a real name and contact email, not `…@example.com`.

### 2. Make `pnpm test` green: a test with a hard-coded date started failing at 22:00 UTC yesterday (2 min)
**Where:** `apps/api/src/reader/reader.controller.spec.ts:51`.

**Why:**
- The test sets the "latest" run's `createdAt` to the literal `new Date('2026-10-24T22:00:00Z')`. The other runs are created "now", so since 22:00 UTC on the 24th they count as newer and the assertion flips.
- `pnpm test` now shows **1 failed / 139**. A judge agent that runs the tests will report a failing suite.

**Fix:** use `new Date(Date.now() + 60_000)`. I confirmed the failure; it is the only one.

### 3. Fix bullets that collapse after a citation, and the chat bubble overflow (10 min)
**Where:** `apps/web/components/chat/answer.tsx:77`, and the user bubble in `apps/web/components/chat/chat-panel.tsx`.

**Why:**
- `text.replace(/(\[\[(?:f|b):[^\]]+\]\]\s*)+/g, …)` eats the trailing newline after a citation, because `\s*` also matches `\n`. Any bullet that ends with `[[f:…]]` glues the next `- item` onto its line.
- In the compare answer this rendered as "NVDA … ④ - **MSFT** …, ⑤ - AAPL …", so the bullets are broken. The prompt tells the model to "cite as you go", so real answers will hit this all the time.

**Fix:**
- Change `\s*` to `[ \t]*`. Keep the `run.endsWith(' ')` logic; it still works.
- Add `break-words` (or `[overflow-wrap:anywhere]`) to the user bubble. Without it, a long unbroken string, such as a pasted URL or accession list, runs out of the chat card and is clipped. I reproduced this.

### 4. Make the filing reader not look broken (15–20 min, UI only)
**Where:** `apps/web/components/dashboard/filing-reader.tsx:64`, `:124` and `:142`.

**Why:**
- `prepareSections` (`apps/api/src/extraction/preparation.ts`) only recognises `<h1–h6>` headings. SEC inline-XBRL filings don't use them, so every section gets `item = title = 'Document'`.
- The NVIDIA 10-Q outline is 28 rows of "Document Document · 0 blocks", and the 10-K is 75. Empty layout tables render as raw `| |` rows.
- The re-read logic at `:124` matches a replacement section by `item + kind`. With every item set to "Document", after a correction re-read it jumps to the **first table section** of the filing, not the one being edited.

**Fix:**
- When `item === 'Document'`, label each row "Page {ordinal + 1}" and show the first non-empty, non-pipe line of the section as the title.
- In the `SectionView` effect, match the replacement by `ordinal`. Section ids are `run:doc:ordinal`, so the ordinal is stable across re-reads.
- Hide lines that match `/^\|(\s*\|)+\s*$/` in the section text view.
- Don't change `preparation.ts` tonight. It feeds `EXTRACTION_TASK_VERSION` (`preparation:'v2'`), and changing it means re-pinning runs.

### 5. Make the docs tell one story (15 min). This matters most for a code-reading judge.
**Where:** `README.md` and `OVERVIEW.md`.

**`OVERVIEW.md`:**
- Line 1 still says **"Earnings Desk — Extraction Overview"**.
- Under "Remaining implementation work" it says "*no benchmark has been run*" and "*the integrated extraction changes described here remain planned*". The README shows a benchmark table, and the extraction code is merged.
- Fix: retitle it, add one line saying it is the design brief for the extraction service and is now implemented, and delete the two contradicting sentences.

**`README.md`:**
- After the "Built for Night Shift London" footer, a second README begins: "Extraction API", "Validate without paid calls", "Layout". It repeats Getting started with different wording ("A research desk for SEC filings, with a conversational planner…"). Fix: move the Extraction API table under Architecture, merge "Validate without paid calls" into Scripts, and delete the duplicate Layout table.
- Getting started says "*Set `SEC_USER_AGENT`… to enable monitoring… scans every five minutes*". In the code, monitoring is opt-in and needs **`SEC_MONITORING=1`** as well (`processor.service.ts:199`). Say so.
- Say plainly that 2 of the 10 agent tools (`get_insider_activity`, `diff_risk_factors`) return "Not available yet". A judge reading `tools.service.ts:113` will find this anyway, and it's better that they read it from you first.
- Add one sentence under Results: the baseline is the model with no tools, so the 2/13 → 13/13 jump measures grounding, not model quality.

**If you have 20 more minutes (#6):** add a server-side in-flight guard in `apps/api/src/agent/agent.controller.ts`:
- Keep a module-level `Set<conversationId>`; return **409** while a turn is running, and remove the id in `finally`.
- Add `res.on('close')` that sets a flag so `emit` stops writing.

This needs no change to `runAgent`'s model call, so the Mubit task is unchanged. See bugs B3 and B4.

---

## Live demo risk (09:00)

| Risk | Likelihood | What happens | De-risk |
|---|---|---|---|
| **SEC EDGAR fetch fails** (403 for the User-Agent, 429 on a shared venue IP, slow Wi-Fi) | Medium | The submissions TTL is 5 minutes, so step 1 of the demo always goes to the SEC, and the stale cache is never used. The agent then says it couldn't find filings. | Fix #1, a real `SEC_USER_AGENT`, and a phone hotspot as backup. |
| **Mubit `section_extractor` budget and latency** | High that it's spent, low that it's visible | One NVIDIA "Add all" produces 148 sections (27 + 75 + 18 + 28), so ≥148 extractor calls and up to 296 with repair attempts. The review cap is 200 a day per task. Run identity includes `projectId` (`extraction.service.ts:94`), so **every new desk re-reads everything**. | Rehearse on **one** desk. On stage, open the pre-built desk (`/p/<id>`) rather than creating new ones. Don't rehearse "Add all" five times after 00:00 UTC. |
| **Reader empty on stage** | High if you open it right after "Add all" | Extraction runs in the background (concurrency 2 × 2 lanes). With a real model, 150 calls take minutes, and the reader shows "0 blocks" or "Nothing read yet". | Pre-build the NVIDIA desk at 08:30, let it finish, and show the reader on that desk. |
| **Background extraction slows the chat** | Medium | The worker runs **inside the API process** when PGlite is used (`main.ts:17`). Parsing 1–8 MB of HTML and five worker lanes all go through one PGlite instance on one event loop, as does the SSE `/events` poller, which queries every second per open tab. A chat turn right after "Add all" can stall. | Wait for "ready" before the next question, or start with `RUN_LOCAL_WORKER=0` once the demo desk is built. Close extra tabs. |
| **No token streaming** | Certain, cosmetic | Steps stream; the answer text arrives all at once after the last round, and `useReveal` fakes the typing. With gpt-6-luna, 3 rounds at about 2–5 s each means 6–15 s of "thinking". | Fine. Talk over the step list. Don't claim "streaming answers". |
| **Lock mismatch on start** | Low | If the demo machine's `.env` changes `MUBIT_AGENT_MODEL`/`AGENT_MODEL`, `assertAgentFrozen` refuses to start (by design). | Start the API at 08:30 and check `/health`. Don't touch model env vars. |
| **A cold start downloads nothing** | Low | The PGlite migrations are quick, the EDGAR cache is 47 MB, and the PGlite data is 74 MB. | Start at 08:30 rather than 08:59. |
| **Mubit panel shows local or fake counts** | Medium if you reuse this machine's DB | The panel counts the local `llm_calls` table, which here holds 1,479 calls to the **fake** extractor ("200 of 200 used · 1,035 sent" today). | Demo from a database whose calls really went to Mubit. Never demo from this local fake-model DB. |

---

## Architecture

**Sound for what it claims:**
- **The agent** (`agent/run-agent.ts`): a dependency-injected tool loop. It runs up to 6 rounds, makes parallel tool calls, ends the turn on `ask_user`, and replays history without reasoning items. It's easy to test, and `run-agent.spec.ts` does test it.
- **The arithmetic boundary:** tools return formatted values, changes and margins. `get_metrics` and `compare` compute in code, and the prompt forbids computing.
- **Fiscal calendars and quarter maths** (`edgar/fiscal.ts`, `xbrl/quarter-math.ts`): Q4 = FY − 9M and the cash-flow YTD differencing are correct against the raw XBRL, as checked above. EPS for Q4 is marked approximate (`~`), which is the right call.
- **The Mubit transport** (`mubit/mubit.service.ts`): translates Responses to Chat Completions both ways, with explicit rejection of unsupported items. Retries cover only transient gateway statuses, and timeouts are not retried. Errors are logged as class and status only, so no request content leaks. The transport is versioned separately from the task.
- **The job queue** (`jobs/`): durable, leased, fenced, heartbeated, and safe against stale workers. It is more production-grade than this demo needs.

**Questionable:**
- **Two systems behind one front end.** The chat and dashboard use XBRL. The reader and extraction use the LLM section extractor with verifiers. Both are fine, but the README tells them as one pipeline. The extraction service's planner (`agent/extraction-intent.ts`) runs a **second system prompt under the `desk_agent` task tag** ("You are Earnings Desk's intent planner…"). The record header isn't off for `desk_agent`, so these calls are sent for recording as `desk_agent` with a different prompt and schema. Mubit groups calls by fingerprint, so they would form a separate group. Either way the label is misleading, and the prompt still says "Earnings Desk". Don't change it now; just know it's there.
- **House rules go into the agent's history as a fake first user message** (`agent.service.ts:43`: `{role:'user',content:JSON.stringify({houseRules})}`). It works, but it's a hack a reviewer will spot, and it changes the prompt prefix every time the rules change.
- **Run identity includes `projectId`**, so there is no extraction reuse across desks. This is expensive in Mubit calls (see the demo risks).
- **The worker runs inside the API process on PGlite.** It's fine for a demo, but every DB access is serialised and the API event loop does the HTML parsing.
- **The SSE `/events` endpoint polls the DB every second per connection.** That's fine at demo scale.
- **`TRANSPORT_FINGERPRINT` says `retries: 0`** (`frozen.ts:93`), but `withTransientRetry` retries 3 times. It's a stale label, and changing it would trip the transport lock, so leave it and note it.

## Code quality: what a code-reading judge will flag

- **Two styles in one repo.** `agent/`, `edgar/`, `xbrl/`, `dashboard/` and `web/` read cleanly. `extraction/`, `jobs/worker-loop.ts`, `workflows/` and `feedback/` are dense one-liners: `if(!x)return;`, 300+ character lines, no spaces after commas. That's **49 lines over 200 characters in `extraction/`** and 27 in `mubit/`. Running Prettier on those folders is a 2-minute change that looks good to a judge, but it touches many files. Only do it if you'll re-run the tests after.
- **`any` in the transport.** There are 23 `any` or `as any` in `mubit.service.ts`. It's understandable for a protocol adapter, but it will be noticed.
- **Stub tools.** `get_insider_activity` and `diff_risk_factors` are declared to the model but return "Not available yet". They are frozen, so document them (fix #5).
- **Inconsistent "current revision" rules.** `search_blocks` only searches **accepted** runs (`tools.service.ts:229`). The reader shows the **latest finished run when none is accepted** (`reader.controller.ts:94–107`). So passages visible in the reader (`needs_review`) can't be found by the agent.
- **Dashboard view endpoints return 500 on bad input.** `GET /views/quarter-overview?ticker=ZZZZQ` returns a 500, because `EdgarError` isn't mapped to an HTTP error. `edgar.controller.ts` has a `run()` helper for this that the dashboard controller doesn't use. `POST /chat/:id/messages` with `{"text":123}` also returns a 500 (`.trim` on a number).
- **Positives:** zod validation on every tool, controller and upload; the `strictJsonSchema` sharing between server and model; the tests are real (PGlite-backed integration tests, a migration upgrade test, and an offline benchmark harness); and the comments explain *why*.

## Honesty: claims vs code

| Claim | Reality | Verdict |
|---|---|---|
| "Numbers from the SEC… margins computed in code, never by the model" | True. I verified the derived values against the raw XBRL. | ✅ |
| "streamed to the browser over SSE" | Steps, views and choices stream. The answer text arrives in one `text` event after the last round, and the typing is client-side animation. | ⚠️ Fine if you don't say "token streaming". |
| "ten tools" | Ten are declared, and two are stubs. | ⚠️ Say so. |
| Benchmark 13/13 vs 2/13 | `docs/benchmark/latest.json` matches. The baseline has no retrieval, and the questions and scoring are your own. | ⚠️ Honest, but say what it measures. |
| "Monitoring… scans every five minutes" | Only with `SEC_MONITORING=1`. | ❌ The README is wrong. |
| `OVERVIEW.md`: "no benchmark has been run", "remain planned" | It contradicts the README and the merged code. | ❌ |
| UI: "Answered through Mubit · N calls recorded for training" | Shown whatever the base URL is (it said this against the fake model). "Recorded" means "sent without `x-middleware-record: off`", not confirmed by Mubit. | ⚠️ "Sent to Mubit for review" is more accurate. Fine on the real backend. |
| Mubit panel "From the Mubit console" | Typed in by hand through an **unauthenticated** `POST /mubit/console-status`. The UI does say "copy… from the console". | ⚠️ Disclosed. Make sure what you type is true. |
| Reader "quotes the filings' own text… typed blocks" | The pipeline exists, but the outline is untitled pages (see fix #4). | ⚠️ |
| `D` legend: "derived (Q4 = full year − nine months)" | `D` also marks cash-flow Q2/Q3 values derived as YTD − YTD. | ⚠️ Minor wording: "derived from year-to-date figures". |

## Errors and empty states

- **Good:**
  - An empty prompt can't be sent; the composer trims it, and the API returns 400.
  - Double-clicking "Add all" sent once: the client-side `sending` guard works, and the choice card clears.
  - Tool errors go back to the model as `{error}`, so the agent can explain them.
  - An unknown ticker gives the clean message `No SEC registrant found for ticker "ZZZZQ"` (404) on `/filings/find` and in the agent path.
  - Extraction failures mark the filing as `failed` instead of leaving it on "reading" forever.
  - Reload restores the conversation and the dashboard tabs. There were no console errors.
- **Weak:**
  - Raw server errors reach the user verbatim, for example "No conversation …", "MUBIT_API_KEY is not set (apps/api/.env).", or an SDK `429 …` string (`chat-panel.tsx:250`). On stage, a Mubit hiccup shows a stack-ish message. Wrap it: "The model didn't answer. Try again."
  - "Ask again" (`desk-store.ts` `retry`) resends the question as a **new** user message, so the history gets duplicates.
  - The reader tab isn't restored after a reload. It's client-only; that's fine.

## Security basics

- **Secrets:** `.env` is gitignored, and only `.env.example` is tracked. Error logging deliberately drops message bodies. ✅
- **CORS:** locked to `WEB_ORIGIN`. An evil origin gets `Access-Control-Allow-Origin: http://localhost:3100`. ✅
- **Input handling:** zod everywhere on extraction, corrections and tools. The body limit is 1 MB. Uploads are capped at 10 MiB, with a PDF signature check, `execFile` (no shell) and a temp dir. The internal model gateway uses a timing-safe token compare. ✅
- **No auth on any route.** This is acceptable for a local demo, but say "single-team local deployment" if asked. It matters most for `POST /mubit/console-status` (it rewrites what the panel claims) and `POST /corrections/:id/apply` (it triggers model spend).
- **`GET /filings/:accession/html`** serves third-party SEC HTML as `text/html` from the API origin. There are no cookies, so the risk is low, but `Content-Security-Policy: sandbox` on that response would be the textbook fix.
- **The SEC User-Agent** is a required header and enforced (the client throws if it's missing). ✅

---

## Bugs found, with reproduction steps

**B1. The reader outline is all "Document Document · 0 blocks".** It is visible on stage.
1. Ask "NVIDIA, last 4 quarters", then click "Add all".
2. Open "4 sources" and choose "Open in the reader" for the Q2 FY2027 10-Q.
3. All 28 sections are titled "Document Document", and the text shows raw `| |` rows. `curl 'localhost:4000/filings/0001045810-26-000075/sections?projectId=<id>'` gives `{'Document | Document': 28}`.

The cause is `preparation.ts`, which only splits on `<h1–6>`. (The 0 blocks here is from the fake extractor; the titles aren't.)

**B2. After a re-read, the reader jumps to the wrong section.** Code path: `filing-reader.tsx:124`. When the open section's id disappears after a correction, the replacement is the first section with the same `item` and `kind`, and with B1 that's always the first table. To reproduce, flag a block in any section after the first, apply the correction, and wait for the re-read.

**B3. Stop doesn't stop the server, and the "stopped" answer comes back after a reload.** `agent.controller.ts` doesn't listen for the client closing. `runAgent` finishes every model round (spending Mubit calls) and saves the assistant message. To reproduce, press Stop mid-turn, then reload the page; the full answer is there. (Read from the code; with the fake model the turns finish too fast to interrupt in the UI.)

**B4. Concurrent sends to one conversation both run, and the history interleaves.**
1. `POST /conversations`.
2. Send "Get Apple last four quarters".
3. Fire two `POST /chat/<id>/messages {"text":"add all"}` at the same time.
4. The history becomes `user, assistant, user, user, assistant, assistant`, and `add_filings` runs twice.

The UI prevents this in one tab. It happens with two tabs, or with Stop followed by a quick resend (B3).

**B5. Refreshing mid-answer loses the answer until the next reload.** The user message is saved at the start of the turn (`agent.service.ts:44`). After a refresh, `load()` shows the question with no reply and no pending state. The `done` event went to the old connection, and `/events` doesn't carry chat. (Read from the code.)

**B6. Bullets collapse after a citation.** Ask "Compare NVIDIA, Microsoft and Apple revenue". The answer renders as "• NVDA … ④ - **MSFT** … ⑤ - AAPL …". The cause is `answer.tsx:77`, where `\s*` swallows the newline. This is fix #3.

**B7. A long unbroken user message overflows the chat card.** Send a question containing about 900 characters with no spaces. The bubble runs out of the right edge of the chat card and is clipped.

**B8. `pnpm test` fails: 1 of 139.** It's `reader.controller.spec.ts:51`, a hard-coded `2026-10-24T22:00:00Z`. This is fix #2.

**B9. A 500 instead of 400/404 on bad input.**
- `curl 'localhost:4000/views/quarter-overview?ticker=ZZZZQ&periods=2026-07-26'` returns 500.
- `curl -XPOST localhost:4000/chat/x/messages -H 'content-type: application/json' -d '{"text":123}'` returns 500.

**B10. Minor items.**
- The `D` legend text is wrong for cash-flow Q2/Q3.
- "Ask again" duplicates the user message.
- The receipt says "Answered through Mubit" even on the fake backend.

---

## Pre-demo checklist (08:30)

1. **Check the environment:** `apps/api/.env` points at real Mubit (`INFERENCE_BACKEND`, `MUBIT_API_KEY`), `SEC_USER_AGENT` is a real name and email, and `SEC_MONITORING` is unset or 0. Don't touch the model env vars (the lock).
2. **Choose a clean database:** use one that never saw the fake model, either `pnpm reset` and then rebuild the demo desk, or the team's real DB. Otherwise the Mubit panel shows fake counts.
3. **Start** with `pnpm dev`, then run `curl localhost:4000/health`. Expect `mubitKey:"set"`, `secUserAgent:"set"`, `database:"pglite"`, and 10 tools. The API must not print a lock error.
4. **Check the SEC is reachable from the venue:** `curl -sI -A "$SEC_USER_AGENT" https://data.sec.gov/submissions/CIK0001045810.json` should return `200`. If it gives 403/429, switch to the hotspot. With fix #1 in, the cache covers you.
5. **Build the demo desk once:** "NVIDIA, last 4 quarters", then "Add all".
   - Wait until all four filings show ready. Check with `curl 'localhost:4000/v1/data?projectId=<id>'`: all runs should be `completed` or `needs_review`.
   - Open the reader once to see that it has blocks.
   - Note the `/p/<id>` URL.
6. **Ask the compare question once** on that desk ("Compare NVIDIA, Microsoft and Apple revenue") so the MSFT and AAPL companyfacts are cached.
7. **Open the Mubit panel** and check that the counts are real, today's review budget isn't spent, and anything under "From the Mubit console" is accurate.
8. **Run the safety net:** `pnpm typecheck && pnpm --filter @desk/api test`, which should be green after fix #2.
9. **Prepare the browser:** close every other desk tab (each has an `/events` poller), zoom to 100%, and don't open DevTools network throttling.
10. **Have a fallback ready:** keep the README hero screenshots open in another tab, in case the network dies completely.

---

## What's strong

- **The grounding design is right, and it's provable.** Figures come from XBRL with their provenance (`reported` / `derived` / `computed`, approximate, restated), the fiscal labels are correct, and Q4 and cash-flow differencing are done in code. The derived values I checked are exact.
- **Treating the Mubit task as an artifact.** The frozen prompt and tools are fingerprinted with a lock file, the transport is versioned separately, benchmark baselines are sent with `x-middleware-record: off`, and the request id is kept on every call and block. This shows a team that understands how Mubit groups and trains, and judges from Mubit will notice.
- **Extraction verification.** Exact-quote evidence spans, period and scale checks, XBRL cross-checks that return `unknown` rather than a made-up pass, a bounded repair attempt, and immutable revisions.
- **The infrastructure under it.** The durable leased job queue, checkpointed model calls, idempotency keys, an SSE replay cursor, and migrations tested against an upgraded database.
- **Test discipline for a hackathon:** 17 test files and 139 tests, including PGlite integration tests and offline benchmark scoring.
- **The UX path works end to end.** Find, then ask, then add, then the dashboard: the find step took about 6 s from a cold click (with the fake model). Compare across fiscal calendars is labelled honestly (each company's own latest quarter against a year earlier), and the state survives a reload.
