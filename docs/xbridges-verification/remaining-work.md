# X-Bridges verification: remaining work (handoff)

Written 2026-11-23 so the work can resume in a new session if usage limits stop this one.
Source of truth: `docs/xbridges-verification/ledger.json` (findings, decisions, work packages) and the generated
`report.md` (`npm run -s xbv:report`). Plan: `docs/superpowers/plans/2026-11-10-xbridges-full-verification.md`.
Branch: `automative` (push only there, never open a PR unless asked).

## 1. Scope

Verify that every X-Bridges block, solver and engine rule behaves like Simulink (gates V1-V8 and G in plan §2), and
fix every finding (WP-21) in the engine, following Simulink / Embedded Coder semantics, with tests.

State at writing: 25 of 29 work packages done, 7 findings open.

State on 2026-11-24 (WP-23 closed): 28 of 29 work packages done; only WP-15 is left
(`waiting_matlab`). 4 findings open and every one of them has a recorded decision: XBV-419 / XBV-420 (waiting on
the MATLAB goldens, D4), XBV-434 (D20, option A, a separate 1-2 day batch) and XBV-436 (D21, open after a second
measured investigation). §4.1, §4.3 XBV-417 and the whole of §4.5 are done. Section 6 records what is left and the
measured effort.

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

## 3. Work in flight

Nothing is in flight as of the last update (2026-11-23, evening). Merged and pushed since the first version of this
file:
- E16 (XBV-430, XBV-431). XBV-431 is narrowed to roots up to 1e8 in two wirings; larger roots are XBV-436.
- WP-22: nightly seed windows and the mutation run.
- The chatter-limit boundary test.
- XBV-435: Kalman vector parity.
- The full mutation run: kill rate 45.5 %, recorded as XBV-437.

State: 26 of 29 work packages done, 6 findings open (XBV-417, 419, 420, 434, 436, 437).

## 4. Remaining work, in order

### 4.1 XBV-437: tests that kill the real surviving mutants (small)

See `docs/xbridges-verification/mutation-report.md`. Add tests to
`src/engine/xbridges/verification/xbMutationGaps.test.ts`, then confirm each kill by applying the mutant by hand and
restoring it with `git checkout`.

- **#10:** `let h = Math.min(cfg.h0, cfg.hMax)` changed to `Math.max`. Find out why the E13 maxStep test does not catch
  it; the mutation subset is the verification folder, so check that test's maxStep and h0 values. Add a batch and a
  live case where h0 > maxStep and the first step must equal maxStep.
- **#12:** `Solvers.ts` `Math.min(dt, stopTime - t)` changed to `stopTime + t`. Add a batch discrete run whose stop time
  is not a multiple of dt (e.g. 0.35 with dt 0.1). The last step must be 0.05 and the final time exactly 0.35.
- **#15:** a touch (`a*b <= 0`) counted as a crossing. Add a signal that touches 0 and returns. It must not be located
  as an event, and the run must stay identical to base. This relates to XBV-419 / 420.
- **#8:** event bracket end not clamped to the interval end. Add an event closer than 2·EVENT_TIME_TOL to the end of
  an output step; the next output time must be exact.

Near-equivalent mutants (#1, 2, 3, 4, 5, 6, 14, 21) need no test. Note them in the report.

### 4.2 XBV-436 (S4, optional)

Loops with roots above 1e8 from a zero start depend on the wiring. Either leave the finding open as a documented
limitation, or make the globalised Newton phase scale-invariant (variable scaling by a running estimate of |z|) and
add both wirings for roots 1e9 and 1e10.

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

Prerequisites: 4.1 done, 4.2 decided, decisions 4.3 recorded.

- **Final report.** Generate `report.md` from the ledger, per block × gate. Include:
  - findings fixed and open, with reasons;
  - decisions D1-D19 and any new ones;
  - mutation score (45.5 % on 2026-11-23; rerun after 4.1);
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
- **Ledger.** Set WP-21 and WP-23 to done (WP-15 stays `waiting_matlab`). Run the full gates and push.

## 5. Effort estimate (from the pace so far)

| Item | Estimate |
|---|---|
| 4.1 XBV-437 gap tests | 2-3 h |
| 4.2 XBV-436 | 30 min to document as a limitation, or half a day to fix |
| 4.3, XBV-434 option A (float32 per operation) | 1-2 days |
| 4.3, XBV-434 option B (documented as a decision) | 1 h |
| 4.3, XBV-417 UI field | half a day |
| 4.3, XBV-417 documented | 30 min |
| 4.5 close-out | 3-4 h |
| WP-15 goldens, when MATLAB is available | half a day to build, plus the run on the user's machine |

Measured on 2026-11-24 (what the remaining items actually cost):

| Item | Outcome | Time spent | Estimate to finish |
|---|---|---|---|
| 4.1 XBV-437 gap tests | done, 4 mutants killed | 3 h | - |
| 4.3 XBV-417 UI field (option A) | done, help and acceptance included | 2 h | - |
| 4.2 XBV-436 (option "fix") | investigated, scaled direction tried and reverted, D21 recorded | 1.5 h | half a day |
| 4.3 XBV-434 (option A) | scoped, D20 recorded | 0.5 h | 1-2 days |
| 4.5 close-out | help entries, ledger, report, gates | 2 h | 2 h (after 4.2 and 4.3) |
| WP-15 / XBV-419 / XBV-420 | blocked on MATLAB | - | half a day on the user's machine |

A full mutation rerun does not fit a session on this machine: the unmutated baseline of the targeted subset takes
505-660 s, which sets a ~1500-2000 s timeout per mutant, so 22 mutants need 10-12 h. The four real gaps are rerun
with `npx tsx scripts/xbridges-verification/mutationRun.ts --only=8,10,12,15`.

## 6. What is left (as of 2026-11-24, WP-23 closed)

Nothing in this document is left undone inside this session's scope: the work packages are 28 of 29 done and the
remaining three findings each have a decision with its own batch. What is left, in the order it could be picked up:

1. **XBV-436 (D21, 1-2 days).** The far algebraic-loop roots: y = c + y -/+ k y^2 from a zero start reaches the root up
   to 1e8 in both wirings, fails in one wiring at 1e9 and 1e10, and fails in both for y = 1e-3 + 1e-20 y^2 (3.16e8).
   All failures are honest fatals. Measured cause: at the zero start the y^2 column of the Jacobian is pure rounding
   (+-1e-12 for one wiring, +-1e-20 for the other), the step is 1e12-1e19 times the iterate, no line search accepts it,
   and the absolute-residual test that then rescues the 1e8 cases cannot move once the raw component reaches 1e20.
   Nine candidate fixes were implemented and measured this pass (column equilibration, relative-residual merit, scaled
   natural-monotonicity norms, a trust radius, retrying Newton after the damped phase, perturbation-first, a perturbation
   cap, forced Levenberg-Marquardt, a trust-region LM phase): two fix only the '++-' wiring, the rest regress cases that
   pass today, and all were reverted. What is left is a redesigned globalisation - a properly normed least-squares or
   trust-region formulation, or NLEQ-ERR implemented exactly as published - developed against the 14-case matrix in D21
   with the XBV-431 cases (roots up to 1e8, both wirings) kept green, and acceptance for the new cases added to
   `xbEngineB.test.ts`.
2. **XBV-434 (D20, 1-2 days).** Per-operation float32 in the interpreter and the generated C: acceptance first (Sum
   16777216 + 1 + 1 = 16777216; float accumulation in Product, MatrixMultiply, the filters and the integrator; `sinf`
   against `(float)sin`; the same through the generated C harness), then float temporaries in the C generator, then the
   interpreter's multi-operation blocks. Do not land it half-way: the interpreter and the generated C must agree.
3. **WP-15 / XBV-419 / XBV-420** stay open until MATLAB is installed; gate G stays `pending` for every block (D4).
4. **Every future fix** still runs the loop of §2 (acceptance, executor, verifier, merge) and the three gates of §2.6,
   and keeps `report.md` regenerated with `npm run -s xbv:report`.

Measured on 2026-11-24 for the close-out itself: help entries for the differences from Simulink and the solver pane
(one commit, `test:help` 114, `help:coverage` 2211/2211), the report template that still said "no fix has been made",
`test:xbridges` (5386 passed, 45 failures that are all the absent clang of this machine), and this handoff.
