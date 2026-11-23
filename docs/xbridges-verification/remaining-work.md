# X-Bridges verification: remaining work (handoff)

Written 2026-11-23 so the work can resume in a new session if usage limits stop this one.
Source of truth: `docs/xbridges-verification/ledger.json` (findings, decisions, work packages) and the generated
`report.md` (`npm run -s xbv:report`). Plan: `docs/superpowers/plans/2026-11-10-xbridges-full-verification.md`.
Branch: `automative` (push only there, never open a PR unless asked).

## 1. Scope

Verify that every X-Bridges block, solver and engine rule behaves like Simulink (gates V1-V8 and G in plan §2), and
fix every finding (WP-21) in the engine, following Simulink / Embedded Coder semantics, with tests.

State at writing: 25 of 29 work packages done, 7 findings open.

## 2. How the work is run (keep this loop)

1. **Acceptance first (controller):** turn the finding's `it.fails` pin into a plain `it`, or write a new failing
   test from an independent oracle. Commit and push it (pushing red acceptance is allowed).
2. **Executor (Sonnet `xbv-executor`, `isolation: worktree`):**
   - `git reset --hard automative`;
   - symlink `node_modules` from the scratchpad `full/node_modules`;
   - fixes product code only, never tests, fixtures or the ledger;
   - commits in its worktree.
3. **Verifier (Opus `xbv-verifier`):** must return PASS. It reruns the acceptance twice, probes edge cases and
   regressions, and edits nothing. On FAIL: add acceptance for what it found, then send a rework.
4. **Merge** `--no-ff` into `automative`.
5. **After the merge:**
   - if the interpreter changed: `npm run -s build:sm-runtime`, then `npx vitest run src/engine/xbridges/verification/xbContract.test.ts -u`;
   - update the ledger (close the finding, add new ones, add decisions);
   - `npm run -s xbv:report`.
6. **Gates before pushing:**
   - `npm run -s test:xbridges -- --exclude '.claude/**'` (about 10 min, run in the background);
   - `npm run -s test:help -- --exclude '.claude/**'`;
   - `npx tsc --noEmit -p .` (only the 2 known `xlsx` errors).

   Always pass `--exclude '.claude/**'`: old agent worktrees live there.
7. **Commit messages** end with the two attribution lines (Co-Authored-By, Claude-Session). Stage exact paths, never
   `git add -A`.

Known environment-only failures (not regressions):
- `src/utils/stateMachine`: avr-gcc ×3, c90 `snprintf`, CLI exit, host-compile e2e;
- HIL cross-compilers;
- load flakes: TC-ROBOT-03, SLAM in `xbEquations.robot`, ec07, XBV-032.

## 3. Work in flight (not yet merged)

| Item | Branch / commit | State | Next step |
|---|---|---|---|
| **E16**: XBV-430 (isRoot slack grows with \|z\|²), XBV-431 (far loop roots from a zero start) | `worktree-agent-a11f541db1b41b7cd` @ `1ec3bf1d`; acceptance `d973c610` on automative (4 tests red there) | Verifier running | On PASS: merge, close XBV-430/431, full suite, push. Open question for the verifier: 23 warm-started no-solution loops (y = u + y with \|u\| <= algTol(1+\|z\|), e.g. u = 1 at \|z\| = 1e13) are accepted. Decide whether that is "within tolerance on the solution" or false convergence. If false, add acceptance and send a rework. |
| **WP-22**: nightly seed rotation and mutation run | `worktree-agent-a385cf06d9d3966b2` @ `efea9e79` + rework `eba7bad0` | Re-verification running | On PASS: merge and push. Update the WP-22 note in the ledger: `seedsFromEnv`, days-since-epoch × 1000 seed windows, `scripts/xbridges-verification/mutationRun.ts`, nightly / dispatch job, partial report 5 of 22. |

Until E16 merges, the 4 XBV-431 tests in `xbEngineB.test.ts` are red on `automative`. That is expected.

## 4. Remaining work, in order

### 4.1 Test-strength gaps from the mutation run (small, controller + executor)

Mutants that survived and have a real gap:

- **Mutant 16, chatter limit `>` to `>=`** (`zeroCrossingGuard.ts`). Add a unit test of `ConsecutiveCrossings`: 1000
  notes at the same time give false, the 1001st gives true.
- **Mutant 2, sign of the Newton regularisation** (`XbridgesEngine.ts`, JᵀJ + 1e-8). Add a loop whose Jacobian is
  singular, so the regularised Levenberg-Marquardt direction is used, and assert the converged value.
- **Optional, mutant 21, saturation region `u >= hi`.** Feed u exactly equal to hi and check the region-dependent
  zero-crossing / derivative behaviour.

Mutants 1 and 5 are near-equivalent or equivalent. Note them in `mutation-report.md`; no test is needed.

Then run the full mutation run once, `npx tsx scripts/xbridges-verification/mutationRun.ts` (about 2 min per
mutant, 23 runs), and commit the complete `mutation-report.md`.

### 4.2 XBV-435: coverage gap (S4)

- Add a KALMAN_FILTER code-parity scenario with vector and matrix dimensions in
  `src/utils/stateMachine/xbCodeParityB.test.ts`. Set A, B, C, Q, R and P0 explicitly with matching sizes (e.g. a
  2-state, 1-input, 1-output system), so the builder does not refuse it with XB_SHAPE_MISMATCH. Run it in float64
  and float32.
- Add a passing float32 assertion for the innovation output. Bound it by operand scale, 8·2⁻²⁴·max(|y_meas|, |C x|);
  after E15 it should be exact.
- If the generator refuses the vector case although the capability says `allShapes`, record a finding.

### 4.3 Decisions only the user can make

- **XBV-434 (S2), float32 semantics.**
  - *Today:* float32 blocks compute in double and round once at each signal or state write, in the interpreter and
    the generated C alike.
  - *Simulink 'single' / Embedded Coder:* compute in float, rounding every operation. Example: Sum 16777216 + 1 + 1
    gives 16777218 here and 16777216 in Simulink. A single-precision FPU (e.g. Cortex-M4F) has to emulate the
    double maths in software.
  - VectorPow's C already computes in float (`powf`). It must follow whichever option is chosen.
  - *Option A, follow Simulink:* interpreter and generator emit per-operation float32 arithmetic. This is a large
    batch. Write acceptance first: Sum 16777216 + 1 + 1 = 16777216; float accumulation in Product, MatrixMultiply,
    filters and the integrator; `sinf` against `(float)sin`.
  - *Option B, keep the current behaviour:* record it as a decision (D20) and document it in the help as a
    difference from Simulink, then close the finding.
- **XBV-417 (S4).** The loop-solver `algTol` and `maxIter` work in the engine, but the canvas never passes them and
  no screen edits them.
  - *Option A:* add them to the solver settings UI (Simulink shows the algebraic-loop tolerance in its
    configuration parameters) and pass them in `solverOptionsForRun`. Test it with the workspace input tests and
    help coverage.
  - *Option B:* document the fixed defaults (1e-6, 100) as decision D20/D21 and close the finding.

### 4.4 Blocked on MATLAB (WP-15 is `waiting_matlab`)

The user has no MATLAB now. WP-15 is skipped, gate G stays `pending` for every block (D4), and blocks are verified
by oracles 1, 2, 4 and 5.

- **XBV-419:** a Relay touches switchOff without crossing it, and batch and live disagree.
- **XBV-420:** ode23tb on a tangent touch of a Dead Zone limit.

Both stay open until a Simulink golden decides them. When MATLAB is available:
- build `docs/xbridges-verification/simulink-map.json`, `scripts/xbridges-verification/xb_goldens.m` and
  `xbSimulinkParity.test.ts` (plan §3.3 item 3);
- include the XBV-419 and XBV-420 scenarios, with zero-crossing detection on and off.

The first harness attempt was stopped before anything was committed. Whatever the golden says, batch and live must
agree for XBV-419.

### 4.5 WP-23: close-out (last)

Prerequisites: E16 and WP-22 merged, 4.1 and 4.2 done, decisions 4.3 recorded.

- **Final report.** Generate `report.md` from the ledger, per block × gate. Include:
  - findings fixed and open, with reasons;
  - decisions D1-D19 and any new ones;
  - mutation score from the full run;
  - coverage gaps (the 18 stateful blocks that do not move under the stimulus, the 14 FAR_SKIPPED types);
  - gate G `pending` for all blocks (no MATLAB).
- **Help.** Update it with every documented difference from Simulink:
  - D9 time base;
  - D12 Rate Limiter initial condition;
  - D15 fixed-step zero crossings;
  - D16 XBV-106 limitation;
  - D17 Diag;
  - D18 robot grids per major step;
  - D19 removed solver options;
  - whichever way XBV-434 and XBV-417 are decided.

  Keep `npm run -s help:coverage` and `test:help` green, and add AUTHORED entries in
  `scripts/help/reviewLiveUi.ts` where needed.
- **Ledger.** Set WP-21, WP-22 and WP-23 to done (WP-15 stays `waiting_matlab`). Run the full gates and push.

## 5. Effort estimate (from the pace so far)

| Item | Estimate |
|---|---|
| E16 and WP-22 merge | 1-2 h (more if E16 needs a rework) |
| 4.1 test gaps + full mutation run | 2-3 h |
| 4.2 Kalman vector coverage | 1-2 h, plus a fix batch if it finds a defect |
| 4.3, option A for XBV-434 (float32 per operation) | 1-2 days |
| 4.3, option B for XBV-434 | 1 h |
| 4.3, XBV-417 UI | half a day |
| 4.3, XBV-417 documented | 30 min |
| 4.5 close-out | 3-4 h |
| WP-15 goldens, when MATLAB is available | half a day to build, plus the run on the user's machine |
