---
name: xb-verification-loop
description: Run one iteration (or the whole loop) of the X-Bridges full verification plan. Opus controls the loop (acceptance tests, briefs, ledger, commits); Sonnet and Haiku execute and run the tests (xbv-executor); Fable verifies every result (xbv-verifier) before commit; Simulink golden runs go to MATLAB on the user's machine.
---

Roles (user decision 2026-11-10):
| Role | Model | Does | Never |
| --- | --- | --- | --- |
| Controller | Opus (main session) | picks the WP, writes acceptance tests and the brief, dispatches, decides DONE/REWORK, owns ledger and commits | production code |
| Executor | Sonnet (`xbv-executor`, default) | harnesses, test kit, equations, engine/interpreter/generator fixes | acceptance tests, ledger, commits |
| Executor | Haiku (`xbv-executor` with `model: "haiku"`) | mechanical work: run suites, regenerate snapshots/inventory, transcription, fixtures, palette/help boilerplate | equations, engine, generator |
| Verifier | Fable (`xbv-verifier`) | re-runs the acceptance command, audits scope and hunks, checks oracles, one hand calculation, PASS/FAIL | edits of any kind |

You are the **controller**. Follow `docs/superpowers/plans/2026-11-10-xbridges-full-verification.md` (§2 gates, §3 oracles, §9 findings). Executors never edit acceptance tests or the ledger; the verifier never edits anything.

Each iteration:
1. Read `docs/xbridges-verification/ledger.json`. Pick the first `todo` WP whose deps are all `done` (WP-21 fixes run alongside from the first finding).
   - `exec` contains `M` (MATLAB) and this session has no MATLAB: write the self-contained brief to `docs/xbridges-verification/matlab/<WP>-*.md`, set the WP to `waiting_matlab`, tell the user in one line which brief to run, and pick the next WP.
2. Write the acceptance tests for that WP (from WP-06 on, decision D7: for block-family WPs write the oracle specification per block in the brief instead — stimulus, closed-form expected values with their source, tolerances, Simulink rule — and let the Sonnet executor write the test file from it; review every expected value against the spec before verification). Every expected value comes from a §3 oracle and names it in a comment. Run them once.
   - A test that fails because the harness does not exist yet is the executor's job.
   - A test that fails because the product is wrong is a **finding**: add `XBV-nnn` to the ledger (block, gate, expected and source, actual, severity S1–S4) and mark the test `it.fails` with the finding id. Never `skip`.
3. Write the brief: WP id and goal; plan sections; the inventory rows of its blocks; the oracle per block; exact files the executor may change with `file:line` pointers; acceptance test file(s) and command (plan §11); anything learned from earlier WPs.
4. Set the WP to `in_progress`, record `git hash-object` of each acceptance test file in the brief, and dispatch `Agent(subagent_type: "xbv-executor", model: "sonnet" | "haiku", prompt: <brief>)` (if that agent type is not loaded, use `general-purpose` with the same model and paste `.claude/agents/xbv-executor.md` into the brief). Independent WPs may run in parallel when their allowed file lists do not overlap. Wait for the notification. Do not poll.
5. Verify: dispatch `Agent(subagent_type: "xbv-verifier", model: "fable", prompt: <brief + executor report + allowed files + test hashes>)` (if not loaded, `general-purpose` with `model: "fable"` and `.claude/agents/xbv-verifier.md` pasted). Then check yourself:
   - the verifier's re-run counts equal your own run of the acceptance command;
   - `git diff --stat`; skim every hunk the verifier flagged;
   - for a fix: the `it.fails` marker is removed and nothing else in the test changed; V6 and V7 suites re-run when engine, interpreter or generator files changed.
6. Decide:
   - **DONE**: update the ledger (WP status, per-block gates, findings), re-run `npm run xbv:inventory` when the catalogue changed, then `git add <exact paths>` (never `-A` or `.`) and commit `test(xbridges): <WP> <title>` or `fix(xbridges): XBV-nnn <summary>`.
   - DONE requires verifier `PASS`.
   - **REWORK** (verifier `FAIL` or your own review): `SendMessage` the same executor with the verifier's problems as deltas, then verify again. After 2 reworks, mark **BLOCKED** and tell the user.
7. Continue while runnable WPs remain.

Cloud sessions: `npm ci` is blocked (the `xlsx` tarball host is denied). Install the lockfile minus `xlsx` in the scratchpad, symlink it as `node_modules` for the run and remove the link afterwards; never commit it and never change `package.json` for it.

After each WP, tell the user in one or two lines what passed, new findings by severity, and any brief waiting for MATLAB.
