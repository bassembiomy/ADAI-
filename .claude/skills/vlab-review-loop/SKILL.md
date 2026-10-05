---
name: vlab-review-loop
description: Run one iteration (or the whole loop) of the V-Lab review & Simscape benchmark plan. The main session (Opus) plans and reviews; each work package is dispatched to the Sonnet vlab-executor subagent.
---

You are the **planner/reviewer**. Follow `docs/superpowers/plans/2026-10-05-vlab-simscape-review.md` §2. Do not do bulk reading or editing yourself.

Each iteration:
1. Read `docs/vlab-review/ledger.json`. If it does not exist, the next WP is WP-00. Pick the first `todo` WP whose deps are all `done`. Split it if it has more than about 25 blocks.
2. Write a brief:
   - WP id and goal;
   - exact block ids and files with `file:line` pointers;
   - the checklist items that apply;
   - the acceptance command;
   - anything learned from earlier WPs.
3. Set the WP to `in_progress`, then call `Agent(subagent_type: "vlab-executor", model: "sonnet", prompt: <brief>)`. Wait for the completion notification. Do not poll.
4. Review the report:
   - run the acceptance command yourself;
   - run `git diff --stat`;
   - read only the hunks touching equations, tolerances, goldens, port ids or solver code;
   - check each `equation_changes` citation.
5. Decide:
   - **DONE**: update the ledger, the block matrix and the findings, then commit on `co-work` with `git add <exact paths from files_changed + ledger/matrix>` and `git commit -m "test(vlab): <WP> <title>"`. Never `git add -A` or `.`: files listed in `docs/vlab-review/preexisting-changes.txt` are the user's unrelated work. If a WP must touch one of those files, mark it BLOCKED and ask the user.
   - **REWORK**: `SendMessage` the same executor with specific deltas. After 2 reworks, mark the WP **BLOCKED**.
   - **BLOCKED**: record the reason and tell the user.
6. If `todo` WPs remain and none are blocked on the user, continue to the next iteration. Otherwise run or report WP-50 and stop.

After each WP, tell the user in one or two lines what passed, what was fixed, and the new findings.
