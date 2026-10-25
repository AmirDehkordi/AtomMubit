# Mubit training: how it really behaves, and our plan

## Latest extraction observation — 24 October 2026

The user reports that **Extract financial facts 2** has 3,248 calls usable for
training, zero kept, zero rejected, 3,295 waiting for review, 200 queued today,
3,048 over today's limit and 11 running. First training has not started and
there are no routes. History shows 200 new calls admitted about 50 minutes
before the observation, then zero new calls five minutes before it. This is
evidence of a pending review backlog, not evidence that all calls were rejected
or that the integration failed. The differing totals should not be reconciled
without server-side details; they may reflect different scopes or refresh times.

The additional 100-example development batch was stopped after 39 completed
examples and 46 confirmed calls. One next-case call may have been in flight;
its outcome is unknown. Sources, results and the remaining-case manifest are
preserved under `benchmarks/results/mubit-expanded-2026-10-24/`. No automatic
resume is scheduled. Inspect reviewer completion/errors before sending more
traffic solely to increase kept examples. If running jobs stop progressing,
ask Mubit to inspect task `ln_5f0064bc8f24708841155f80` and its reviewer jobs.

See [expanded development results](mubit-expanded-development-report.md).
The observations and plans below are an earlier snapshot, not current counts
or confirmation that any previously mentioned scheduled process is still running.

## Earlier observations

Confirmed on Quell's own Mubit console (24 Oct 2026), which runs the same Mubit service.

## How Mubit turns calls into an adapter

1. **Daily review limit.** Mubit's reviewer reads at most **200 new calls per task per day**. The
   limit is per task, not per project: `desk_agent` and `section_extractor` each get their own 200.
2. **Reset time.** The day resets at **00:00 UTC** (01:00 UK time while clocks are on BST; the
   clocks go back at 02:00 on Sunday 25 Oct). Calls sent after the 200 are still recorded but not
   reviewed that day. On Quell, every reviewer run after the limit showed "0 new calls, 0 kept,
   0 rejected".
3. **How often it runs.** About once an hour. The task page's History panel shows each run:
   "Reviewer: N new calls, N kept, N rejected".
4. **First adapter.** Once **25 examples are kept**, Mubit trains the first adapter automatically
   (on Quell, a Qwen3-4B-Instruct-2507 "v1").
5. **Going live.** It starts as a **silent test** on 10% of calls. Quality is the share of answers
   that match the provider model on held-out test cases (Quell's v1: 17.9% on 39 cases; target
   95%). "Answered by your model" stays 0% until it passes that target and is promoted.
6. **Quell for comparison:** 2,188 calls, 198 examples kept, 1 adapter in silent test.

## Where MuTick stands

| Task | Calls recorded | Notes |
|---|---|---|
| `desk_agent` | 525 on 24 Oct (16:42–16:53 UTC) | 120 replayed conversations plus manual tests, 122 sessions. Only up to 200 can be reviewed on 24 Oct |
| `section_extractor` | 0 | Starts when the extraction module lands; its own 200 a day |

The `desk_agent` task has been re-locked twice on 24 Oct: when margins became metrics, and at about
20:10 UTC when the product was renamed from Earnings Desk to MuTick (the name is in the system prompt).
The 636 calls above belong to the older task, "You are the analyst at Earnings Desk…"; the current
task is "You are the analyst at MuTick…", and tonight's batch is its first.

## Plan

Tonight's `desk_agent` batch is scheduled: `apps/api/data/feed/overnight-feed.sh` (local, not in git)
sleeps until 00:01 UTC, reuses a desk API already running on 4000/4001/4010 or starts one on 4010,
sends about 215 calls of new questions, and logs to `apps/api/data/feed/overnight.log`. Cancel with
`pkill -f overnight-feed.sh`. Keep the laptop open and on power (a closed lid sleeps).

- **Don't send more `desk_agent` calls on a day whose 200 are used.** Extra calls cost credit and
  are not reviewed.
- **Feed each new day just after the reset**, with questions never sent before:

  ```bash
  # API running on port 4010 (built), then:
  node apps/api/scripts/replay-questions.mjs --api http://localhost:4010 --count 120 --concurrency 3 --max-calls 215
  # or let the script wait for the reset itself:
  node apps/api/scripts/replay-questions.mjs --api http://localhost:4010 --wait-reset --max-calls 215
  ```

  `--max-calls` stops once this run has made that many `desk_agent` calls (from `GET /mubit/stats`);
  it can overshoot by the conversations already in flight. Questions already sent are listed in
  `apps/api/data/replayed-questions.json` and never repeated.
- **Each task feeds separately.** When extraction lands, `section_extractor` needs its own daily
  batch (roughly 200 sections: about 5–8 filings).
- **Demo honestly.** Code freeze is Sunday 07:00 London, awards at 09:00. There is one more review
  window before then (00:00 UTC = 01:00 London, just before the clocks go back at 02:00), and the
  reviewer runs about hourly, so kept examples should show by roughly 02:00–03:00 and a first adapter
  (if 25 are kept) a few hours later. A first adapter in silent test is the realistic best case;
  "answered by your model" is unlikely.
  Show the task, its kept examples and the History panel, and say the replay is public data.
- **Check progress:** `GET /mubit/stats` (our own count per task, since 00:00 UTC by default) and
  the task's History panel in the Mubit console.
