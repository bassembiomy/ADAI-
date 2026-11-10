---
name: xb-verification-loop
description: Run one iteration (or the whole loop) of the X-Bridges full verification plan. The main session plans, writes acceptance tests and reviews; harness and fix work goes to the xbv-executor subagent; Simulink golden runs go to MATLAB on the user's machine.
---

You are the **planner/reviewer**. Follow `docs/superpowers/plans/2026-11-10-xbridges-full-verification.md` (§2 gates, §3 oracles, §9 findings). You write acceptance tests, briefs, the ledger and commits; executors never edit acceptance tests or the ledger.

Each iteration:
1. Read `docs/xbridges-verification/ledger.json`. Pick the first `todo` WP whose deps are all `done` (WP-21 fixes run alongside from the first finding).
   - `exec` contains `M` (MATLAB) and this session has no MATLAB: write the self-contained brief to `docs/xbridges-verification/matlab/<WP>-*.md`, set the WP to `waiting_matlab`, tell the user in one line which brief to run, and pick the next WP.
2. Write the acceptance tests for that WP. Every expected value comes from a §3 oracle and names it in a comment. Run them once.
   - A test that fails because the harness does not exist yet is the executor's job.
   - A test that fails because the product is wrong is a **finding**: add `XBV-nnn` to the ledger (block, gate, expected and source, actual, severity S1–S4) and mark the test `it.fails` with the finding id. Never `skip`.
3. Write the brief: WP id and goal; plan sections; the inventory rows of its blocks; the oracle per block; exact files the executor may change with `file:line` pointers; acceptance test file(s) and command (plan §11); anything learned from earlier WPs.
4. Set the WP to `in_progress` and dispatch `Agent(subagent_type: "xbv-executor", prompt: <brief>)` (if that agent type is not loaded, use `general-purpose` and paste `.claude/agents/xbv-executor.md` into the brief). Wait for the notification. Do not poll.
5. Review:
   - run the acceptance command yourself;
   - `git diff --stat`; read every hunk outside test files and `src/engine/xbridges/testkit/`;
   - no acceptance test changed after dispatch; no expectation derived from the code under test;
   - for a fix: the `it.fails` marker is removed and nothing else in the test changed; V6 and V7 suites re-run when engine, interpreter or generator files changed.
6. Decide:
   - **DONE**: update the ledger (WP status, per-block gates, findings), re-run `npm run xbv:inventory` when the catalogue changed, then `git add <exact paths>` (never `-A` or `.`) and commit `test(xbridges): <WP> <title>` or `fix(xbridges): XBV-nnn <summary>`.
   - **REWORK**: `SendMessage` the same executor with deltas. After 2 reworks, mark **BLOCKED** and tell the user.
7. Continue while runnable WPs remain.

Cloud sessions: `npm ci` is blocked (the `xlsx` tarball host is denied). Install the lockfile minus `xlsx` in the scratchpad, symlink it as `node_modules` for the run and remove the link afterwards; never commit it and never change `package.json` for it.

After each WP, tell the user in one or two lines what passed, new findings by severity, and any brief waiting for MATLAB.
