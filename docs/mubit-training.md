# Mubit training: how it really behaves, and our plan

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

## Where Earnings Desk stands

| Task | Calls recorded | Notes |
|---|---|---|
| `desk_agent` | 525 on 24 Oct (16:42–16:53 UTC) | 120 replayed conversations plus manual tests, 122 sessions. Only up to 200 can be reviewed on 24 Oct |
| `section_extractor` | 0 | Starts when the extraction module lands; its own 200 a day |

The first `desk_agent` lock was replaced on 24 Oct (margins became metrics), so only calls made after
that change belong to the current task. Check the console for the task named "You are the analyst at
Earnings Desk…".

## Plan

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
- **Demo honestly.** By Sunday 10:00 there is at most one more review window (00:00 UTC Sunday). A
  first adapter in silent test is the realistic best case; "answered by your model" is unlikely.
  Show the task, its kept examples and the History panel, and say the replay is public data.
- **Check progress:** `GET /mubit/stats` (our own count per task, since 00:00 UTC by default) and
  the task's History panel in the Mubit console.
