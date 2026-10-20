---
name: pt-blockset-loop
description: Run one iteration (or the whole loop) of the Powertrain blockset for X-Bridges plan. The main session (Opus) plans, writes acceptance tests and reviews; equation/engine work goes to the Sonnet pt-executor subagent, bulk/mechanical and MATLAB work goes to Antigravity (agy).
---

You are the **planner/reviewer**. Follow `docs/superpowers/plans/2026-10-20-powertrain-blockset-xbridges.md` (§4 gate, §5 routing). You never write production code; executors never edit acceptance tests or the ledger.

Each iteration:
1. Read `docs/powertrain/ledger.json`. Pick the first `todo` WP whose deps are all `done`. Its `exec` field says who implements it.
   - `exec` contains `AG` and this session has no `agy` (`command -v agy` fails) or no MATLAB where needed: make sure the brief exists in `docs/powertrain/antigravity/<WP>-*.md` (write it if not, using `.agents/skills/agy-delegate/references/writing-the-brief.md`), set the WP to `waiting_agy`, tell the user in one line which brief to paste into Antigravity, and pick the next WP.
2. Write the acceptance tests for that WP (plan §4: G1/G2 contract, G4 physics with independently computed values, G5 conformance; for block WPs also the stimulus case files `tests/fixtures/powertrain/cases/<type>/*.case.json` for G3). Run them once to confirm they fail for the right reason.
3. Write the brief:
   - WP id and goal; plan sections (always §3, §4, §8) and the inventory rows of its blocks;
   - governing equations, sign conventions, units, variants for each block;
   - exact files the executor may change, with `file:line` pointers;
   - acceptance test file(s) and command (plan §7);
   - anything learned from earlier WPs.
4. Set the WP to `in_progress` and dispatch:
   - **Sonnet**: `Agent(subagent_type: "pt-executor", model: "sonnet", prompt: <brief>)` (if that agent type is not loaded, use `general-purpose` with `model: "sonnet"` and paste `.claude/agents/pt-executor.md` into the brief). Wait for the notification. Do not poll.
   - **Antigravity**: save the brief as `docs/powertrain/antigravity/<WP>-<slug>.md`, then run `node .agents/skills/agy-delegate/scripts/relay.mjs --brief <file> --cd <repo>` with `run_in_background: true` and read `result.json` when notified (route a), or ask the user to paste it (route b).
5. Review:
   - run the acceptance command yourself (and `npx vitest run src/engine/xbridges/powertrain/ptParity.test.ts` when goldens exist);
   - `git diff --stat`, read every hunk outside `src/engine/xbridges/powertrain/` and `src/components/xbridges/powertrain/`;
   - no test file changed except yours, and none of yours changed after dispatch;
   - one hand calculation per block against the reference; no `||` on numbers; every port has a unit; no MathWorks artwork or shipped tables.
6. Decide:
   - **DONE**: update the ledger (WP status and per-block `gates`), the catalog fingerprint test when blocks were registered, then `git add <exact paths>` (never `-A` or `.`) and `git commit -m "feat(powertrain): <WP> <title>"`. A block WP whose goldens are not yet produced is DONE with `G3: pending` and a follow-up Antigravity golden run in the ledger.
   - **REWORK**: Sonnet → `SendMessage` the same executor with deltas; Antigravity → delta brief with `--resume-last` (or a pasted delta). After 2 reworks, mark **BLOCKED** and tell the user.
7. Continue while runnable WPs remain.

After each WP, tell the user in one or two lines what passed, gate status, and any brief waiting for Antigravity.
