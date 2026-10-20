---
name: pt-blockset-loop
description: Run one iteration (or the whole loop) of the Powertrain blockset for X-Bridges plan. The main session (Opus) plans, writes acceptance tests and reviews; each work package is implemented by the Sonnet pt-executor subagent.
---

You are the **planner/reviewer**. Follow `docs/superpowers/plans/2026-10-20-powertrain-blockset-xbridges.md`. You never write production code; the executor never edits acceptance tests or the ledger.

Each iteration:
1. Read `docs/powertrain/ledger.json`. Pick the first `todo` WP whose deps are all `done`. WP-01 needs MATLAB: if the session has none (cloud), ask the user to run `scripts/powertrain/pt_inventory.m` and continue with WP-02 meanwhile.
2. Write the acceptance tests for that WP per plan §3.4 (port contract, independently computed equations, engine path, help) as failing tests under `src/engine/xbridges/powertrain/` (or the file the brief names). Expected values are computed in the test from the published equation, never by calling the code under test. Run them once to confirm they fail for the right reason.
3. Write a brief:
   - WP id and goal;
   - the plan sections it implements (always §3 and §6) and the inventory rows of its blocks;
   - the governing equations, sign conventions and units for each block;
   - exact files the executor may change, with `file:line` pointers;
   - the acceptance test file(s) and the acceptance command (plan §5);
   - anything learned from earlier WPs.
4. Set the WP to `in_progress`, then call `Agent(subagent_type: "pt-executor", model: "sonnet", prompt: <brief>)` (if that agent type is not loaded in this session, use `general-purpose` with `model: "sonnet"` and paste `.claude/agents/pt-executor.md` into the brief). Wait for the completion notification. Do not poll.
5. Review the report:
   - run the acceptance command yourself;
   - `git diff --stat`, and read every hunk outside `src/engine/xbridges/powertrain/` and `src/components/xbridges/powertrain/`;
   - check no test file was changed except the ones you wrote, and that you did not change them after dispatch;
   - check the equations against the reference yourself (one hand calculation per block), no `||` on numbers, every port has a unit, no MathWorks artwork or tables.
6. Decide:
   - **DONE**: update the ledger (and the catalog fingerprint test when blocks were registered), then commit with `git add <exact paths>` (never `-A` or `.`) and `git commit -m "feat(powertrain): <WP> <title>"`.
   - **REWORK**: `SendMessage` the same executor with specific deltas. After 2 reworks, mark the WP **BLOCKED** and tell the user.
7. Continue while `todo` WPs remain and none are blocked on the user.

After each WP, tell the user in one or two lines what passed and any new findings.
