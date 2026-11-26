# X-Bridges verification — remaining work

**State on 2026-11-26.** Branch `arena/87db4611-adai` at `15b3bb94` + this file. The work since 2026-11-25 is in
pull request [#25](https://github.com/bassembiomy/ADAI-/pull/25) (from the fork `Nassar-glitch/ADAI-`, branch
`xbv439-warmup-fix`, into `arena/87db4611-adai`). `automative` is unchanged.

- **Work packages:** 28 of 29 done.
- **Findings:** 4 open: XBV-434, XBV-419, XBV-420 and the new XBV-440. XBV-439 is fixed.
- **Decisions:** D25 recorded (XBV-439). D20 decided, not implemented. D26 not written yet.
- **Tests:** the XBV-439 work passed every suite it touches (726 of 726). `xbFloat32Ops.test.ts` still has
  **8 failing tests on purpose**: they are the acceptance of XBV-434, which is not written yet.

Related documents:

| Document | Use it for |
| --- | --- |
| `docs/xbridges-verification/PROGRESS-open-findings.md` | step-by-step state and log; start here in a new session |
| `docs/superpowers/plans/2026-11-25-xbv434-xbv439-implementation.md` | the detailed plan; Part 2 is XBV-434 (briefs, files, acceptance) |
| `docs/superpowers/plans/2026-11-24-xbridges-open-findings.md` | the overall plan (sections A, B, C) |
| `docs/xbridges-verification/ledger.json` → `report.md` | the findings and decisions of record (`npm run -s xbv:report`) |

How the work is run (the user's standing instruction, also in `CLAUDE.md`):

- **Opus** plans, writes the acceptance tests first and verifies.
- **Sonnet** and **Haiku** execute and run the tests (`xbv-executor` with `model: sonnet` / `model: haiku`).
- The **Opus verifier** (`xbv-verifier`) must PASS a change before it counts as done.

---

## Done since 2026-11-25

### XBV-439 — the loop solver's warm-up passes accepted a false root (S3): **fixed**

| | |
| --- | --- |
| **What it was** | `y = y + 1e-12·(y² + 1)` has no real root, yet the engine returned y = 3e-12 with no error whenever `algMaxPasses` ≥ 2. |
| **Cause** | The rate estimate at pass 1 measured q across different loop values settling: pass 0 moves p and s2, pass 1 moves only s by 1e-12, so q = 1e-12 was an artefact and the estimated error was 1e-24. It was not the q ≈ 1 case first suspected. |
| **Fix (D25)** | The rate is measured **per loop value**. A point leaves the warm-up passes without a check only if every moving value contracts with q ≤ 0.5 and its error estimate is within `algTol`. Otherwise it gets up to 3 more sweeps, then the residual and Newton-correction check; if that fails, NLEQ-ERR starts from the pre-sweep values. An exact fixed point is accepted as before. |
| **Review** | The first version (one rate over all values) failed verification: the drift could hide behind another loop value that settles or contracts. The acceptance was extended for that case and the rate made per value. The second version passed. |
| **Evidence** | `xbLoopWarmup.test.ts` 20 of 20; xbLoopDomain, xbEngineB, xbEngine, xbWp21Engine, xbLoopOptions, xbSolversB, xbDiagnostics, xbWp21Blocks + motor 726 of 726; `tsc` clean; `npx tsx scripts/xbridges-verification/xbv439Probe.ts` gives `ALGEBRAIC_LOOP_NOT_CONVERGED` on all 6 rows. The verifier ran more than 100 adversarial probes on the old and new engines: no new false root and no newly unsolved case. |
| **Cost** | About +9 % test time on `algebraicLoops` + `wp31_evReference` (gate: +10 %). |
| **Commits** | `f8b6596d`, `1d6f4d23` acceptance; `2fc4ed13` fix; `15b3bb94` ledger, report, progress. |
| **Not yet run** | The full `test:xbridges` on a machine with gcc and clang. The machine this was done on has neither, so every C-compiling suite failed there for that reason only. |

---

## Still open

### 1. XBV-434 — float32 must round after every operation, like Simulink `single` (S2): **not started**

| | |
| --- | --- |
| **What** | A float32 signal is computed in double and rounded once. Example: Sum of 16777216, 1, 1 gives 16777218, but Simulink gives 16777216. This happens in the embedded interpreter (`xbInterpreter.ts`, which rounds only in `writeSignal`) and in the generated C (`xbCGenerator.ts` reads float32 signals as `(double)`). |
| **Scope** | 51 blocks: 19 multi-operation and 32 math-function blocks. The list is `float32-inventory.md`. The canvas engine is out of scope. |
| **Tests** | `src/utils/stateMachine/xbFloat32Ops.test.ts`: 8 failing targets, already on the branch. |
| **Needs** | **gcc and clang.** The acceptance compiles the generated C and compares it with the interpreter. Run it on a machine that has both. |
| **Plan** | Part 2 of the 2026-11-25 plan: <br>1. decision D26: the type each block computes in, single-precision filters, left-to-right operation order, a `FLT_EVAL_METHOD` guard and no FMA contraction, and the math-function tolerances from D23 (1 ULP; tanh 2 ULP); <br>2. **correct two existing assertions first** (A1b): the math-function sweep's 0-ULP check and the tanh bound in `xbCodeParityB` would fail a correct fix; <br>3. C generator (A2) and interpreter (A3) changes in parallel (two Sonnet agents, separate files), merged together after the verifier passes them; <br>4. remaining blocks (Haiku); <br>5. help text and a Cortex-M4F compile check, if that compiler is available. |
| **Done when** | `xbFloat32Ops` is green under gcc and clang, the simulator and C agree at 0 ULP (D23 bounds for math functions), the float64 path is unchanged, and the full suite has **0 failures**. From that point the branch can be merged into `automative`. |
| **Effort** | About 2½ days. |

### 2. XBV-440 — two loops of one cycle set joined by a feed-forward path (S2): **new, not planned**

| | |
| --- | --- |
| **What** | Found by the XBV-439 verifier; present in the engine before XBV-439. Two algebraic loops in one cycle set are joined by a feed-forward path that lies outside `cycleBlocks` (Lx → sat → gj → s). The second loop is solved with the stale value gj = 0 and gives 5/3 instead of 168.33, with no diagnostic. |
| **Next** | Turn the verifier's probe into an acceptance test, then plan the fix. |
| **Effort** | Not estimated yet. |

### 3. XBV-419 / XBV-420 — Relay and Dead Zone when a signal only touches the threshold (S3 each)

| | |
| --- | --- |
| **What** | Should a signal that touches the threshold without crossing it be an event? The two findings: Relay switchOff 0 on u = (t−1)²; Dead Zone [−1, 0] under ode23tb. Batch and live runs disagree for the Relay. |
| **Blocked on** | **MATLAB R2024b** (decision D4, WP-15 `waiting_matlab`). |
| **Ready** | `scripts/xbridges-verification/goldens/tangent_touch.m` and `src/engine/xbridges/verification/xbGoldenTangent.test.ts`. The test's 24 comparisons skip by name until the output files exist. |
| **User step** | `matlab -batch "run('scripts/xbridges-verification/goldens/tangent_touch.m')"`, then commit the CSV and `.meta.json` files under `docs/xbridges-verification/goldens/`. |
| **Then** | Two possible outcomes: <br>• Simulink holds the mode on a touch: fix live to match batch. <br>• Simulink switches on a touch: change event location and rewrite the mutant-15 test in `xbMutationGaps.test.ts`. <br>In both cases, remove "provisional" from the Relay / Dead Zone help and the solver selector topic (generator `scripts/help/buildUiHelpInventory.ts`). |
| **Effort** | Half a day after the MATLAB run. |

### 4. Simulink check of the XBV-436 zero start (follow-up, not an open finding)

| | |
| --- | --- |
| **What** | XBV-436 is fixed: the engine solves loops with roots up to 1e10 from a zero start. It is not yet known whether Simulink itself does; if it doesn't, ADIA's target was stricter than Simulink. |
| **Ready** | `scripts/xbridges-verification/goldens/far_root_loop.m` and `xbGoldenLoop.test.ts`, skipped until the outputs exist. The Simulink parameter names that could not be checked without MATLAB are listed in the script header. The least certain is whether an IC block works as the loop's initial guess. |
| **User step** | `matlab -batch "run('scripts/xbridges-verification/goldens/far_root_loop.m')"`, then commit the outputs. |
| **Effort** | One hour after the run. |

### 5. Smaller items found along the way (not filed as findings; decide whether to file them)

1. **Division loops.** `y = a/y + b` from a zero start fails in the engine (F is infinite at 0). It may also fail in
   Simulink; worth adding to `far_root_loop.m` before filing anything.
2. **Zero-crossing on/off.** ADIA has no switch for zero-crossing detection (Simulink has `ZeroCrossControl`). The
   `zcoff` golden files of `tangent_touch.m` therefore have nothing to compare against. This would be a feature
   request, not a defect.
3. **Filter accumulators in Simulink.** Decision D26 assumes Simulink filters use single accumulators for single
   signals. Add one Discrete Transfer Fcn case to the MATLAB script to confirm (listed in the XBV-434 plan).
4. **Mutation score.** The last full mutation run gave 45.5 %. A full rerun would give at most 63.6 % and takes
   10–12 hours. Run it only if a fresh headline number is needed.
5. **Vector loops.** D25 checks numeric (scalar) loop values only; a loop with no numeric outputs is not verified,
   as before XBV-439.
6. **File name clash on Windows.** The branch has both `remaining-work.md` (old, 2026-11-23) and this
   `REMAINING-WORK.md`. Windows cannot hold both, so a checkout there shows one of them as modified. Delete the old
   one on a Linux or macOS machine.

## Order

1. Merge PR #25 (XBV-439) into `arena/87db4611-adai`, then run the full `test:xbridges` on a machine with gcc and clang.
2. XBV-434 (2½ days, on a machine with gcc and clang) — after this, the branch is fully green and can be merged into `automative`.
3. XBV-440: acceptance test from the verifier's probe, then plan and fix.
4. When MATLAB is available: items 3 and 4 (and 5.1 and 5.3 in the same MATLAB session).
