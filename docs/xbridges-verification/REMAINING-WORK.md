# X-Bridges verification — remaining work

**State on 2026-11-25.** `automative` and `arena/87db4611-adai` hold the same code.

- **Work packages:** 28 of 29 done.
- **Findings:** 4 open, every one with a plan.
- **Decisions:** 1 open (D20, decided but not implemented).
- **Full suite:** 5543 tests pass. 8 fail **on purpose**: they are the acceptance tests of the float32 fix (XBV-434),
  which is not written yet.

Related documents:

| Document | Use it for |
| --- | --- |
| `docs/xbridges-verification/CHANGES-2026-11-24.md` | what changed on 2026-11-24 and how to test it |
| `docs/xbridges-verification/PROGRESS-open-findings.md` | step-by-step state and log; start here in a new session |
| `docs/superpowers/plans/2026-11-25-xbv434-xbv439-implementation.md` | the detailed plan: items 1 and 2 (Parts 1, 2), and the MATLAB follow-ups and final close-out (Part 3) |
| `docs/superpowers/plans/2026-11-24-xbridges-open-findings.md` | the overall plan (sections A, B, C) |
| `docs/xbridges-verification/ledger.json` → `report.md` | the findings and decisions of record (`npm run -s xbv:report`) |

How the work is run (the user's standing instruction, also in `CLAUDE.md`):

- **Opus** plans, writes the acceptance tests first and verifies.
- **Sonnet** and **Haiku** execute and run the tests (`xbv-executor` with `model: sonnet` / `model: haiku`).
- The **Opus verifier** (`xbv-verifier`) must PASS a change before it counts as done.

---

## 1. XBV-439 — the loop solver's warm-up passes accept a false root (S3)

| | |
| --- | --- |
| **What** | `y = y + 1e-12·(y² + 1)` has no real root, yet the engine returns y = 3e-12 with no error. It happens with `algMaxPasses` ≥ 2; with 0 or 1 the engine correctly reports `ALGEBRAIC_LOOP_NOT_CONVERGED`. It is older than the recent loop-solver work. |
| **Known** | The accepting branch is not yet located. The rate estimate was ruled out by measurement (its error estimate is about 1, far above `algTol`). |
| **Reproduce** | `npx tsx scripts/xbridges-verification/xbv439Probe.ts` |
| **Plan** | Part 1 of the 2026-11-25 plan: <br>1. acceptance tests (Opus); <br>2. locate the branch, then fix (Sonnet). Every warm-up acceptance outside a clear contraction must pass the main solver's solution test (decision D25 to record); <br>3. verify (Opus verifier). |
| **Done when** | The no-root loops fail honestly at any `algMaxPasses`, easy loops cost no more than today, and the full suite has no new failure. |
| **Effort** | Half a day. Nothing blocks it. |

## 2. XBV-434 — float32 must round after every operation, like Simulink `single` (S2, the only S2 left)

| | |
| --- | --- |
| **What** | A float32 signal is computed in double and rounded once. Example: Sum of 16777216, 1, 1 gives 16777218, but Simulink gives 16777216. This happens in the embedded interpreter (`xbInterpreter.ts`, which rounds only in `writeSignal`) and in the generated C (`xbCGenerator.ts` reads float32 signals as `(double)`). |
| **Scope** | 51 blocks: 19 multi-operation and 32 math-function blocks. The list is `float32-inventory.md`. The canvas engine is out of scope. |
| **Tests** | `src/utils/stateMachine/xbFloat32Ops.test.ts`: 8 failing targets, already on `automative`. |
| **Plan** | Part 2 of the 2026-11-25 plan: <br>1. decision D26: the type each block computes in, single-precision filters, left-to-right operation order, a `FLT_EVAL_METHOD` guard and no FMA contraction, and the math-function tolerances from D23 (1 ULP; tanh 2 ULP); <br>2. **correct two existing assertions first** (A1b): the math-function sweep's 0-ULP check and the tanh bound in `xbCodeParityB` would fail a correct fix; <br>3. C generator and simulator changes in parallel (two Sonnet agents, separate files), merged together after the verifier passes them; <br>4. remaining blocks (Haiku); <br>5. help text and a Cortex-M4F compile check, if that compiler is available. |
| **Done when** | `xbFloat32Ops` is green under gcc and clang, the simulator and C agree at 0 ULP (D23 bounds for math functions), the float64 path is unchanged, and the full suite has **0 failures**. `automative` is green again from that point. |
| **Effort** | About 2½ days. Nothing blocks it. |

## 3. XBV-419 / XBV-420 — Relay and Dead Zone when a signal only touches the threshold (S3 each)

| | |
| --- | --- |
| **What** | Should a signal that touches the threshold without crossing it be an event? The two findings: Relay switchOff 0 on u = (t−1)²; Dead Zone [−1, 0] under ode23tb. Batch and live runs disagree for the Relay. |
| **Blocked on** | **The user's MATLAB R2024b** (decision D4, WP-15 `waiting_matlab`). |
| **Ready** | `scripts/xbridges-verification/goldens/tangent_touch.m` and `src/engine/xbridges/verification/xbGoldenTangent.test.ts`. The test's 24 comparisons skip by name until the output files exist. |
| **User step** | `matlab -batch "run('scripts/xbridges-verification/goldens/tangent_touch.m')"`, then commit the CSV and `.meta.json` files under `docs/xbridges-verification/goldens/`. |
| **Then** | Two possible outcomes: <br>• Simulink holds the mode on a touch: fix live to match batch. <br>• Simulink switches on a touch: change event location and rewrite the mutant-15 test in `xbMutationGaps.test.ts`. <br>In both cases, remove "provisional" from the Relay / Dead Zone help and the solver selector topic (generator `scripts/help/buildUiHelpInventory.ts`). |
| **Effort** | Half a day after the MATLAB run. |

## 4. Simulink check of the XBV-436 zero start (follow-up, not an open finding)

| | |
| --- | --- |
| **What** | XBV-436 is fixed: the engine now solves loops with roots up to 1e10 from a zero start. It is not yet known whether Simulink itself does; if it doesn't, ADIA's target was stricter than Simulink. |
| **Ready** | `scripts/xbridges-verification/goldens/far_root_loop.m` and `xbGoldenLoop.test.ts`, skipped until the outputs exist. The Simulink parameter names that could not be checked without MATLAB are listed in the script header. The least certain is whether an IC block works as the loop's initial guess. |
| **User step** | `matlab -batch "run('scripts/xbridges-verification/goldens/far_root_loop.m')"`, then commit the outputs. |
| **Effort** | One hour after the run. |

## 5. Smaller items found along the way (not filed as findings; decide whether to file them)

1. **Division loops.** `y = a/y + b` from a zero start fails in the engine before and after the XBV-436 work
   (F is infinite at 0). It may also fail in Simulink; worth adding to `far_root_loop.m` before filing anything.
2. **Zero-crossing on/off.** ADIA has no switch for zero-crossing detection (Simulink has `ZeroCrossControl`). The
   `zcoff` golden files of `tangent_touch.m` therefore have nothing to compare against. This would be a feature
   request, not a defect.
3. **Filter accumulators in Simulink.** Decision D26 assumes Simulink filters use single accumulators for single
   signals. Add one Discrete Transfer Fcn case to the MATLAB script to confirm (listed in the XBV-434 plan).
4. **Mutation score.** The last full mutation run gave 45.5 %. The four real gaps were fixed and their mutants
   killed. A full rerun would give at most 63.6 % (eight near-equivalent mutants remain) and takes 10–12 hours. Run it
   only if a fresh headline number is needed.

## Order

1. XBV-439 (½ day)
2. XBV-434 (2½ days) — after this, `automative` is fully green.
3. When MATLAB is available: items 3 and 4 (and 5.1 and 5.3 in the same MATLAB session).
