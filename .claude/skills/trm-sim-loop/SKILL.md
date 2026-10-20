---
name: trm-sim-loop
description: Run one iteration (or the whole loop) of the TRM simulation loop plan. The main session (Opus) plans, writes acceptance tests and reviews; each work package is implemented by the Sonnet trm-executor subagent.
---

You are the **planner/reviewer**. Follow `docs/superpowers/plans/2026-10-14-trm-simulation-loop.md`. You never write production code; the executor never edits acceptance tests or the ledger.

Each iteration:
1. Read `docs/trm-sim/ledger.json`. Pick the first `todo` WP whose deps are all `done`.
2. Write the acceptance tests for that WP (the plan's "Tests" lines) as failing tests, in the test file the brief will name. Run them once to confirm they fail for the right reason.
3. Write a brief:
   - WP id and goal;
   - the contract section it implements;
   - exact files the executor may change, with `file:line` pointers;
   - the acceptance test file(s) and the acceptance command;
   - anything learned from earlier WPs.
4. Set the WP to `in_progress`, then call `Agent(subagent_type: "trm-executor", model: "sonnet", prompt: <brief>)` (if that agent type is not loaded in this session, use `general-purpose` with `model: "sonnet"` and paste `.claude/agents/trm-executor.md` into the brief). Wait for the completion notification. Do not poll.
5. Review the report:
   - run the acceptance command yourself;
   - `git diff --stat`, and read every hunk outside `src/engine/trmSim/`;
   - check no test file was changed except the ones you wrote, and that you did not change them after dispatch.
6. Decide:
   - **DONE**: update the ledger, then commit with `git add <exact paths>` (never `-A` or `.`) and `git commit -m "feat(trm-sim): <WP> <title>"`.
   - **REWORK**: `SendMessage` the same executor with specific deltas. After 2 reworks, mark the WP **BLOCKED** and tell the user.
7. Continue while `todo` WPs remain and none are blocked on the user.

After each WP, tell the user in one or two lines what passed and any new findings.
