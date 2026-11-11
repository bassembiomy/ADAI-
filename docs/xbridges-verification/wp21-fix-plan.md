# WP-21 fix plan

User go-ahead 2026-11-11: fix all open findings. Opus (main session) plans, writes and flips the acceptance tests and
owns the ledger; Sonnet `xbv-executor` implements engine, block, generator and UI fixes; Haiku `xbv-executor` does
mechanical work (catalogue text, units, docs); an Opus `xbv-verifier` subagent verifies every batch before merge.

## Rules

- Acceptance first: before a batch is dispatched the controller flips its pins (`it.fails` -> `it`, `test.fail` ->
  `test`, ratchet / gap lists shrunk to the target) and commits them locally. The executor never edits a test.
- A batch owns its files; batches that run at the same time own disjoint files. Batches editing
  `BlockDefinitions.ts` in parallel run in separate git worktrees and are merged by the controller.
- Fixes follow Simulink / MATLAB semantics as cited by each finding (plan section 3 oracles). No `||` on numbers,
  invalid parameters give a diagnostic, never a silent clamp or NaN.
- After every merge: verification suites, `test:xbridges`, V6/V7 suites when engine, interpreter or generator files
  changed, e2e when UI files changed. Push only when green.

## Rounds

| Round | Batch | Findings | Files owned |
| --- | --- | --- | --- |
| 1 | A zero parameters | XBV-015, 019, 040, 064 | BlockDefinitions.ts, parameterSchema.ts |
| 1 | B embedded quick fixes | XBV-083, 095, 096, 097, 098, 099, 100, 104, 105 | src/utils/stateMachine/xb*.ts (not tests) |
| 1 | C workspace UI | XBV-135, 136, 138-146, 148, 149 | XbridgesWorkspace.tsx, App.tsx, properties panel |
| 2 | D element-wise math and routing | XBV-042-046, 048-061, 065, 066, 068 | BlockDefinitions.ts (math, routing, logic) |
| 2 | E engine core and solvers | XBV-002-005, 016-018, 020, 026, 028-033, 035-037, 047, 067, 069, 080 | XbridgesEngine.ts, Solvers.ts, AdaptiveSolver.ts, StiffSolver.ts, xbridgesWorker*.ts, stepLiveSolver |
| 2 | F embedded time base and data types | XBV-001, 084 (D9), 086-088, 090-094, 101-103, 106-108, 010 | src/utils/stateMachine/xb*.ts |
| 3 | G control and motor | XBV-024, 026-027, 062, 063, 070-082 | BlockDefinitions.ts (control, motor, PWM, integrators) |
| 3 | H fuzzy | XBV-110-121 | BlockDefinitions.ts (fuzzy) |
| 3 | I robot, DEM, CFD, universal battery | XBV-021-023, 025, 122-134, 147 | BlockDefinitions.ts (robot, DEM), labs |
| 4 | J schema and UI validation | XBV-011, 137, 039 | parameterSchema.ts, properties panel |
| 4 | K catalogue and docs (Haiku) | XBV-006, 007, 009, 012-014, 034, 038, 041, 109 | catalogue text, docs |

Findings that need a user decision are fixed with the recommended option and listed in the final report so it can be
reversed: D9 (start-of-tick time base), bitwise data type (uint32, the only well-defined C shift semantics), Clock block
(XBV-041: Simulink Clock outputs t; the pulse behaviour of ADIA's Clock is kept available under its existing labs).
