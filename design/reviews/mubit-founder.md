# MuTick, reviewed as Mubit's founder

Reviewed 25 Oct 2026, about 01:10 London, on branch `design-polish` including the uncommitted UI changes. I read the code and docs, and walked through the app on the fake model (port 4099). I made no Mubit calls. I checked Mubit's own docs: [concepts](https://docs.mubit.ai/concepts), [tasks and sessions](https://docs.mubit.ai/guides/tasks-and-sessions), [first adapter](https://docs.mubit.ai/guides/first-adapter), [API reference](https://docs.mubit.ai/reference/api), and [mubit.ai](https://mubit.ai).

## Score: 6.5 / 10

**Verdict.** Mubit is in the path of every model call MuTick makes, and the team has understood the one thing most teams get wrong: a task is a fingerprint. Every `desk_agent` call uses the same model, system prompt and ten strict tools. A lock file (`desk_agent.lock`, `assertAgentFrozen`) refuses to start the API if any of those change. Per-call context goes in user messages and not in the instructions. That last part is exactly what the docs ask for: "Put the text that changes per call… in the user message, not in the instructions."

The team also knows how the reviewer behaves: 200 calls a day, the 00:00 UTC reset, 25 kept examples before training. They feed it on purpose. Most of the copy is honest, saying "Which ones it kept… come from the Mubit console" and "acceptance is not guaranteed".

The integration is solid. What's missing is evidence that it works: nothing yet shows Mubit making MuTick better, cheaper or faster. The learning path stops at "Examples kept: —". The demo runs on `mreq_fake…` ids. MuTick's best asset for Mubit never reaches Mubit: it checks every extracted figure against XBRL, which is a verified outcome on almost every `section_extractor` call. The `desk_agent` history is also split across several Mubit tasks (more on this below).

I'd feature MuTick as a reference **integration**: "here's how to freeze a task, carry house rules in context, and work with the review budget". I wouldn't feature it as a reference **result** yet.

## Top 5 changes before the 07:00 freeze

All of these are UI, copy or data. None touches the agent's model, prompt or tools (`apps/api/src/agent/frozen.ts`), so none re-locks `desk_agent`.

### 1. Put the real console numbers into the panel (about 10 min, no code)

The "How far it has got" path shows "—" for Examples kept, Own model trained and Answers calls. The team already built `POST /mubit/console-status` for this. Before 07:00, open the Mubit console, read each task's kept count, adapter state and quality, and post them, even if kept is 0:

```bash
curl -X POST localhost:4000/mubit/console-status -H 'content-type: application/json' \
  -d '{"task":"desk_agent","kept":0,"adapterVersion":null,"adapterState":"collecting","quality":null,"note":"Read from the Mubit console at 06:30 London, 25 Oct"}'
```

Do the same for `section_extractor`, against the instance you'll demo from. A real "kept 14 of 25" beats a dash, and so does an honest "0 kept, the overnight run is still reviewing". Also take a screenshot of the console's task page and its **History** panel ("Reviewer: N new calls, N kept, N rejected") as a backup slide.

### 2. Show MuTick's verified-outcome signal next to each task (about 25 min)

Mubit's own pitch ties improvement to "verified results, such as tests, application checks, or human feedback". MuTick has exactly that: every `section_extractor` block carries `mubitRequestId` and a status of `verified`, `fixed`, `review` or `unchecked` (`blocks` table, `packages/shared/src/blocks.ts:59`).

Add one count to `GET /mubit/status` (`apps/api/src/mubit/mubit.controller.ts`): blocks grouped by status. Then add one line to the Section extractor card in `apps/web/components/mubit/mubit-panel.tsx`:

> **Checked against SEC data:** 412 verified · 9 fixed by a house rule · 31 to review. Mubit doesn't receive this check yet.

(The numbers above are placeholders. Show the real counts.)

It's read-only and outside the agent. This is the line that would make me lean forward in the judging room. It shows the team has the labels an adapter evaluation needs.

### 3. Fix the copy that over-claims (about 15 min)

Each fix below names the file, the current copy and a replacement.

- **"Mubit keeps the good answers / the best of these calls"**
  - Files: `mubit-panel.tsx:99`, `mubit-panel.tsx:142` and `mubit-receipt.tsx:41`.
  - Problem: Mubit doesn't judge "good". It keeps some calls as examples and trains a model to match your provider model's answers.
  - Replace with: "Mubit keeps some of these calls as examples and trains a small model to answer like the provider model does."
- **"Sent for review ✓ Reached · 200 today"**
  - File: `mubit-panel.tsx:375`.
  - Problem: this is our own count of calls sent today, capped at 200, not a review that happened.
  - Replace with: "In today's review window", with the hint "Mubit reviews up to 200 a day".
- **README "How it works" step 6**
  - Current: "…tests it against the provider model, and routes traffic to it once it passes."
  - Problem: the present tense reads as if this is already happening.
  - Replace with: "Once 25 examples are kept, Mubit trains an adapter… None has been trained yet."
- **README tagline**
  - Current: "A model that learns your house rules from reality."
  - Problem: today the rules live in context and no model has learned anything. A founder will spot this.
  - Replace with: "A research desk that turns your corrections into house rules, and records every call so Mubit can train a model of its own."
- **`OVERVIEW.md`**
  - Problem: it still says "Earnings Desk" and "no benchmark has been run". The README shows a benchmark, so the two docs contradict each other.
  - Fix: update both lines, or add a one-line "superseded by README" note at the top.

### 4. Demo on real Mubit ids, and keep "Add all" away from live cost (about 20 min of preparation)

A founder will expand the receipt ("Answered through Mubit · 3 calls ▸"). If the ids start with `mreq_fake`, the Mubit story ends there. Run the demo instance against real Mubit (`INFERENCE_BACKEND` and the key in your own `.env`; I didn't touch it).

Live, one "Add all" on four NVIDIA filings sent about **296** `section_extractor` calls (888 vs 592 in `/mubit/status` before and after). That's more than a whole day's review budget, plus real credit. To avoid it:

- Prepare the NVIDIA desk beforehand.
- In the demo, open the existing desk and ask one new question, so the receipt shows fresh real ids.
- Copy one id and paste it into the console's **Requests** search. It's the strongest 15 seconds you can show a Mubit judge.

### 5. Lead the adapter story with `section_extractor` (about 10 min)

`section_extractor` is the textbook distillation task: one fixed instruction, structured JSON output, high volume, and checkable. `desk_agent` is a hard first adapter. It runs multi-round loops over ten strict tools with long tool outputs (`get_blocks` returns up to eight passages), and Mubit's docs list "Malformed tool calls" and "examples too long" as outcomes.

Two changes:

- Put Section extractor first in the panel: swap the order of `TASKS` in `mubit.controller.ts:12-15`.
- Add one hint under its title: "About 75 calls per filing, one instruction, JSON out: the task a small model should take over first."

In the pitch, say that this task is where the cost and latency savings would come from.

## A 3-minute demo with a Mubit beat that lands

1. **0:00–0:40. Problem and product.** Open the prepared NVIDIA desk. Ask "What drove revenue growth in Q2 FY2027?" and show the cited answer.
2. **0:40–1:10. Mubit on every call.** Expand the receipt. Point at the real `mreq_…` ids and `desk_agent`. Say: "Same model, same prompt, same ten tools on every call. We lock it, because one changed word starts a new Mubit task."
3. **1:10–2:00. What Mubit is learning from.** Open the panel and show:
   - one recorded conversation;
   - Section extractor: "≈300 calls per desk, N verified against the SEC" (change 2, with the real count);
   - the learning path with real console numbers (change 1).
4. **2:00–2:40. Corrections become rules, and rules become examples.** Flag a figure in the filing reader. Show the proposed rule and the re-read. Say: "The re-read is a new, corrected call recorded for Mubit."
5. **2:40–3:00. The honest close.** "No adapter yet: the reviewer has had one night. Once 25 are kept, Mubit trains a small extractor, tests it against the provider model, and we route to it when it passes. We already have the labels to check it."

## Risks a founder would probe, with honest answers

**"How many tasks do I see in your project?"**
Probably more than two, and the team should know the exact number before 09:00. The `desk_agent` fingerprint has changed at least three ways:

- the Earnings Desk → MuTick rename on 24 Oct, which the team already knows about;
- switching `INFERENCE_BACKEND`, which sends the model as `openai/gpt-6-luna` on the OpenRouter route and as `gpt-6-luna` on the native route;
- the `/compat/openrouter` and `/openai` endpoints differing.

The local lock normalises the model prefix (`frozen.ts:59-65`), but Mubit's fingerprint uses the model as sent. *Answer:* "Our lock guards the prompt and tools. The rename and the backend switch split the history. From today it's one task per backend, and we'd pick one."

**"Your extraction planner is recorded as a separate task with your old name in it."**
`apps/api/src/agent/extraction-intent.ts:12-15` calls `completeJson({ task: 'desk_agent', … })` with its own system prompt, "You are Earnings Desk's intent planner…". In Mubit that's a third, recorded task. Locally it's counted as `desk_agent`, which inflates the panel's numbers. *Answer:* "Known. It's the extraction API's planner, not the chat. After the freeze it gets its own label." I'd fix this after 07:00, since it changes what gets recorded.

**"How do you group sessions?"**
On the native backend, `nativeOpenAIRequest` strips `session_id` and `metadata` (`mubit.service.ts:154`). Mubit then falls back to "the instructions and first user message". In `desk_agent`, the first user message is always the injected `{"houseRules": …}` blob (`agent.service.ts:41`), so every conversation may look like one session to Mubit. The panel's "37 sessions" is a local count. *Answer:* "Local sessions are exact. We'd send `metadata.session_id` as your docs recommend. We haven't yet, because native OpenAI metadata needs `store=true`, and we wanted to know how you handle that first."

**"Are you training me on wrong answers?"**
Yes, partly. Extractor calls whose blocks fail the XBRL check are recorded at full fidelity. Mubit trains towards the provider's answers, wrong ones included. The corrected re-read is an extra, better call, but the original isn't withdrawn. *Answer:* "We can't mark a call as bad after the fact. Your public API has no outcome endpoint. We have a verified or failed label per request id ready to send the day you add one." Founders like hearing that a customer wants their next feature.

**"What does Mubit add over calling the provider directly?"**
The benchmark (2/13 → 13/13) measures the desk's tools against the bare model, not Mubit. The README is upfront that "a live paired comparison of latency, accuracy and billed cost is **not measured yet**". *Answer:* "Today Mubit gives us the record and the training path. The win we expect is the extractor, our ≈300-calls-per-desk task, moving to a small model. We haven't measured that yet, and we won't claim it."

**"Is this real user signal or replay?"**
Most `desk_agent` volume comes from `replay-questions.mjs`, which uses generated but never-repeated questions. The panel marks those conversations "· replayed". *Answer:* "Bootstrapped with replayed questions on public filings, clearly flagged. Real analyst traffic would replace it."

**"One click spent your daily review budget."**
That's 296 extractor calls for a single four-filing desk, and the panel already shows "200 of 200 used · 444 sent". *Answer:* "We know. Automatic monitoring is opt-in for that reason (`processor.service.ts:112`), and we feed each task just after the reset."

**"Is `section_extractor` frozen like the agent?"**
Not with a lock file. Runs pin `EXTRACTION_TASK_VERSION` (`extraction/policy.ts:12`), but nothing stops a start if the prompt changes. The extractor model also differs by backend: `gemini-3.5-flash-lite` native, Qwen3-30B via OpenRouter. *Answer:* "Runs are versioned. A start-up lock like the agent's is a five-line follow-up."

## What's strong

- **Freezing tasks is done properly.** It covers prompt, tools and model in a fingerprint, refuses to start on drift, and versions the transport separately (`TRANSPORT_FINGERPRINT`). That's better hygiene than most paying customers have.
- **Per-call context stays out of the instructions.** House rules and history go in user messages, and runtime rules are kept outside the frozen prompts.
- **Unrecorded calls are marked as such.** Benchmark baselines and `feedback_evaluator` send `x-middleware-record: off`, so eval and judge traffic never trains.
- **Request ids flow end to end.** Every call is logged with its Mubit id (`llm_calls`, `inference_attempts`, `blocks.mubit_request_id`). They're surfaced on each answer (`mubitCalls` on the `done` event) and per conversation (`GET /mubit/recorded`). Ids can be traced from the UI to the console.
- **The team works with the review budget.** They feed after the reset, cap with `--max-calls`, keep monitoring opt-in, and show a "today's review budget" meter in the UI.
- **Most of the copy is honest.** For example: "Whether Mubit kept a call is only known in its console", "acceptance is not guaranteed", and the `mubit-development-report.md` disclaimer "This does not confirm that Mubit kept examples, trained an adapter, or improved a model."
- **The data is in a good domain for distillation.** It has deterministic verification (XBRL), a correction → rule → re-read loop, and per-company house rules. That's the shape of a task where a small model can win, and where you can prove it did.

## After the freeze, in priority order

1. Send `metadata.session_id` so Mubit groups conversations correctly.
2. Give the extraction planner its own task label.
3. Lock `section_extractor` the same way as the agent.
4. Pick one backend so `desk_agent` stops splitting into separate tasks.
5. Run the paired cost and latency benchmark once an extractor adapter passes.
6. Send the XBRL verified/failed label per request id once Mubit offers an outcome API.
