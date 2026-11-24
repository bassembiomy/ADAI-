# X-Bridges open findings — implementation plan (2026-11-24)

Plan for the four findings still open after the WP-21 / WP-23 close-out and its review (XBV-438). The plan follows the same
loop as the full verification plan (`2026-11-10-xbridges-full-verification.md`, §8–§9) and the `xb-verification-loop` skill:

- **Opus (controller):** writes the acceptance tests first and commits them on their own, writes the brief for each
  work package, reviews the diff, records the result in `docs/xbridges-verification/ledger.json`, commits and merges.
- **Sonnet (`xbv-executor`, model sonnet):** algorithm and generator work against the committed acceptance.
- **Haiku (`xbv-executor`, model haiku):** mechanical work and gate runs (type-check, the suites, help coverage, report).
- **Opus verifier (`xbv-verifier`):** re-runs the acceptance, audits the diff against the brief, and checks that the
  expected values come from an independent oracle. It gives PASS or FAIL before every merge.

Starting state: branch `automative` at the merge of `arena/87db4611-adai`. `test:xbridges` gives 5493 passed, 0 failed,
6 skipped (109 files). `test:help` gives 114 passed, and `help:coverage` is 2211/2211. The open findings are 4:

| Finding | Sev. | Decision | Blocked on | Estimate | Order |
| --- | --- | --- | --- | --- | --- |
| XBV-434 float32 per-operation rounding | S2 | D20, option A (follow Simulink `single`) | nothing | 2–3 days | 1 |
| XBV-436 far algebraic-loop roots | S4 | D21, make the globalisation scale-invariant | nothing | 1–2 days | 2 |
| XBV-419 Relay tangent touch | S3 | D4, a Simulink golden decides | MATLAB on the user's machine | ½ day + the run | 3 |
| XBV-420 Dead Zone tangent touch (ode23tb) | S3 | D4, a Simulink golden decides | MATLAB on the user's machine | with XBV-419 | 3 |

XBV-434 comes first because it is the only S2 finding and is not blocked. XBV-436 is S4, and every one of its failures
is an honest fatal, never a wrong value. XBV-419 and XBV-420 wait for MATLAB, but their MATLAB script (WP-C1) can be
written now so that the run on the user's machine takes one step.

---

## Rules for every work package

1. **Acceptance first.** The test file is committed on its own, and it must fail for the right reason before any
   production code changes. Expected values come from an oracle that is independent of the code under test: hand
   arithmetic, `Math.fround` step by step, the C compiler, or a Simulink golden. They never come from the engine's own
   output.
2. **No half-landed semantics.** The interpreter and the generated C must agree at every merge. A work package that
   changes one side changes the other in the same merge, or it does not merge.
3. **No regressions.** Each merge runs the full gates: `npx tsc --noEmit -p .`,
   `npm run -s test:xbridges -- --exclude '.claude/**'`, `npm run -s test:help -- --exclude '.claude/**'`,
   `npm run -s help:coverage`, and the two host-compile suites with clang **and** gcc
   (`src/utils/stateMachine/xbCodeParity.test.ts`, `xbLongIds.test.ts`).
4. **Ledger and report.** Each closed finding gets its fix commit in the ledger, and `npm run -s xbv:report` is re-run.
   `git diff --exit-code docs/xbridges-verification/report.md` must then show no drift.
5. **Help.** If behaviour visible to the user changes, the help text that describes it changes in the same merge. Where
   the help topic is generated, the change goes in the generator (`scripts/help/buildUiHelpInventory.ts`).

---

## A. XBV-434 — float32 rounds after every operation (D20, option A)

**Goal.** A float32 signal behaves like Simulink `single` and Embedded Coder: every arithmetic operation rounds to float,
and float libm is used (`sinf`, `cosf`, `powf`, `expf`, `logf`, `sqrtf`). The interpreter (`Math.fround` after each
operation) and the generated C (`float` temporaries and float prototypes) give bit-identical results.

**Today.** The interpreter computes in double and rounds once, at the signal or state write: `BlockDefinitions.ts:2685`,
`case 'float32': return Math.fround(n)`. The generator wraps a double expression the same way:
`SM_XB_ConvertFloat32(double)`, at `xbCGenerator.ts:363`, `:746` and `:5057`. VectorPow is the exception: its C already
uses `powf`, while the interpreter rounds a double `pow`.

### WP-A0 Inventory (Haiku, ½ hour)
List every X-Bridges block that can carry a float32 signal and does more than one arithmetic operation per output or
state update. Use `scripts/xbridges-verification/inventory.ts` as the base and the block contracts in
`BlockDefinitions.ts`. Classify each block:
- **single-op**: already correct, because one rounding at the write is the same as per-operation rounding;
- **multi-op**: needs per-operation rounding;
- **libm**: needs the float libm function.

Output a table in `docs/xbridges-verification/float32-inventory.md`, with each block's execute function and its C
emitter. D20 counted 231 execute functions to audit; the table is the scope of WP-A2 to WP-A4.

### WP-A1 Acceptance (Opus)
New file `src/utils/stateMachine/xbFloat32Ops.test.ts`, with interpreter cases and the same cases through the generated
C harness (`cHarness.ts`, compiled with gcc and clang). The cases:
- Sum `+++` of 16777216, 1, 1 gives **16777216** (today 16777218). Add a Sum `+-+` case and a 5-input case.
- Product of three float32 inputs, and Product with division. The oracle is `Math.fround` after each operation.
- MatrixMultiply 3×3 float32, accumulating per element in float.
- A discrete filter (Discrete Transfer Fcn), a Discrete-Time Integrator `x + dt·u`, and a PID. Run each for 100 ticks
  and check bit-identity with a step-by-step `Math.fround` oracle written in the test.
- `sinf`, `expf`, `powf` against `(float)sin` etc. Inputs where the two differ are chosen by a search in the test and
  pinned. The interpreter's oracle for `sinf` is the C result itself (libm decides), so these cases compare interpreter
  and C. Their contract is: **interpreter = C, 0 ULP**.
- VectorPow: interpreter = C, 0 ULP.
- Every non-libm block in the WP-A0 table: interpreter = C, 0 ULP. This extends `xbCodeParityB` V7B-1, which today
  allows ≤ 1 ULP for libm.

Update the existing `xbCodeParityB` V7B-1 expectations that encode the old profile in the same acceptance commit, and
list each changed line in the commit message.

### WP-A2 Generator (Sonnet, ~1 day)
In `xbCGenerator.ts`, float32 blocks emit `float` temporaries, `f` literals and float prototypes, and call the float libm
functions. `SM_XB_ConvertFloat32` stays only for conversions *from* other types. Check the generated code with
`-Wdouble-promotion -Wfloat-conversion -Werror` under gcc and clang. Add that check to the acceptance if it is not
already there.

### WP-A3 Interpreter (Sonnet, ~1 day, can run in parallel with WP-A2)
Add a helper, `f32` (`Math.fround`), and use it between operations in each multi-op block's execute function from the
WP-A0 table. Every libm block in float32 mode calls a float-libm shim that matches C. For `sinf` and the other libm
functions, use the approach decided in WP-A1: either a precomputed C result in the test, or Math functions plus
`fround` where C gives the same result. Record that choice as decision D23.

### WP-A4 Remaining blocks (Haiku, mechanical)
Apply the same pattern to the multi-op blocks left in the WP-A0 table. Each block gets a row in the parameterised
acceptance.

### WP-A5 Close-out (Opus, with Haiku running the gates)
- Run the full gates, plus the Cortex-M4F compile check if a cross-compiler is available (`arm-none-eabi-gcc`).
  Otherwise record it as not run.
- Update the help for the float32 profile: the data type help and the code generation chapter.
- XBV-434 becomes `fixed`, and D20 becomes `decided (implemented)`.

**Risks.**
- Accumulation order must match between the interpreter and C. Fix it as left to right in input-port order, the same
  as Simulink Sum.
- Simulink results may differ for blocks that internally use double accumulators, for example some filter
  implementations. Where Simulink documents a double accumulator for `single`, keep it and record it as a documented
  difference, not a finding.

---

## B. XBV-436 — far algebraic-loop roots from a zero start (D21)

**Goal.** `y = c + y ∓ k·y²` from a zero start converges in **both** wirings (`'++-'` with Gain `+k`, and `'+++'` with
Gain `−k`) for roots up to 1e10, including `c = 1e-3, k = 1e-20` (root 3.16e8). All cases that pass today must stay
green, including every XBV-431 case (roots up to 1e8) and the `xbEngineB` loop rows. A loop with no root must still end
in an honest `ALGEBRAIC_LOOP_NOT_CONVERGED`, never a false root.

**Today.** The globalised Newton is `solveAlgebraicLoopCore` in `XbridgesEngine.ts`, about lines 755–1180. At the zero
start, the `y²` column of the finite-difference Jacobian is pure rounding: ±1e-12 in one wiring and ±1e-20 in the
other. The Newton step is therefore 1e12–1e19 times the iterate, and no line search accepts it. Nine local fixes were
measured and reverted (table in D21). Two fixed only the `'++-'` wiring, and the rest regressed cases that pass today.

### WP-B1 Acceptance (Opus)
New `describe` in `xbEngineB.test.ts`, with the 14-case matrix from D21:
- roots 1e3, 1e7, 1e8, 3.16e8, 1e9 and 1e10;
- both wirings for each;
- a no-root loop (`y = 1 + y + y²`) that must stay fatal;
- the triple-root slow loop (`maxIter` 3 stays fatal).

The oracle is the closed form `y* = √(c/k)`, with a tolerance of `algTol·(1 + |y*|)`. Each case also asserts the number
of loop evaluations against a budget of 4× today's count, so the fix cannot buy convergence with a huge iteration count.

### WP-B2 Prototype outside the engine (Sonnet, ½ day)
Write a stand-alone solver in `scripts/xbridges-verification/loopLab.ts`. It works on a black-box `F(z)`, using the same
finite-difference Jacobian as the engine. Implement two candidates and run both on the 14-case matrix plus the existing
loop test rows, exported as plain functions:
1. **NLEQ-ERR** (Deuflhard): the error-oriented natural-monotonicity test in scaled variables, with the damping
   strategy implemented exactly as published. That covers the prediction/correction of λ, the restricted monotonicity
   test, and the rank-deficiency fallback.
2. **A dogleg trust region** on `½‖D⁻¹g‖²`, with column scaling `D` from the iterate and the update rule
   `D_j = max(D_j, |z_j|, typical_j)`. The radius is updated from the actual / predicted reduction ratio. On a
   rank-deficient Jacobian it takes the Cauchy step.

Report the result matrix and evaluation counts for both. Pick the candidate that is green on all 14 cases and regresses
nothing. If neither is, stop and report to the user. Do not tune constants case by case.

### WP-B3 Port into the engine (Sonnet, ½ day)
Replace the globalisation phase of `solveAlgebraicLoopCore` with the chosen candidate. Keep the Gauss–Seidel pre-passes,
the `algTol` / `maxIter` semantics (one budget), the convergence test on the solution (XBV-421), and the diagnostics
unchanged.

### WP-B4 Close-out (Opus verifier + Haiku gates)
- Run the full gates, plus `npx tsx scripts/xbridges-verification/mutationRun.ts --only=<loop mutants>` if any mutants
  are in `solveAlgebraicLoopCore`.
- Run the performance check on the PWM / ode45 timing cases noted in the WP-21 ledger. They must stay within +10 %.
- XBV-436 becomes `fixed` and D21 is closed. Remove the limitation sentence from the Loop Iter. help and the D21 help
  note.

**Risks.**
- A new globalisation can change the converged value of loops that pass today, within the tolerance. Acceptance must
  pin values only to `algTol`, not bit-for-bit.
- The stiff solvers solve the loop to 1e-10 first (`StiffSolver.computeOutputsTight`). Run the 14 cases under ode23tb
  and ode14x as well.

---

## C. XBV-419 / XBV-420 — tangent touches, decided by Simulink goldens (D4, WP-15)

**Goal.** Decide, against Simulink, whether a zero-crossing function that touches zero without a sign change is an
event:
- XBV-419: Relay with `switchOn 0.25`, `switchOff 0`, on `u = (t−1)²`;
- XBV-420: Dead Zone `[-1, 0]` on the same `u`, under ode23tb.

ADIA must then match Simulink in batch **and** live.

### WP-C1 Golden script (Opus writes, Haiku checks, can be done now)
`scripts/xbridges-verification/goldens/tangent_touch.m`, for MATLAB R2024b. It builds the two models from code (no
`.slx` committed), runs them under ode23, ode45, ode23tb and ode4 (fixed step 0.01), with zero-crossing detection on and
off, and exports `t, y` to `docs/xbridges-verification/goldens/tangent_touch_<solver>_<zc>.csv`. The script header lists
the exact MATLAB version, solver settings and tolerances, so that the comparison is reproducible.

### WP-C2 Run on the user's machine
This needs the user. Either they run the script themselves, or a session attached to their machine (Remote Control)
runs `matlab -batch "run('scripts/xbridges-verification/goldens/tangent_touch.m')"` and commits the CSVs.

### WP-C3 Acceptance and fix (Opus acceptance, Sonnet fix)
New `xbGoldenTangent.test.ts`: it compares batch and live ADIA against each CSV at that solver's tolerance.
- **If Simulink holds the mode on a touch:** the current batch behaviour is right. Fix live to match (today it
  switches at the grid point `t = 1`), and the mutant-15 test in `xbMutationGaps.test.ts` stays.
- **If Simulink switches on a touch:** change `crossingBlock` / event location to treat a touch as an event. Rewrite
  the mutant-15 test to the new rule, and update the XBV-420 ode23tb Dead Zone case.

In both cases, the RELAY / DEADZONE help in `src/help/blockGuidance.ts` and the solver selector topic (generator
`scripts/help/buildUiHelpInventory.ts`) drop the word "provisional" and state the decided rule.

### WP-C4 Close-out
XBV-419 and XBV-420 become `fixed` (or `not-a-defect`, with the golden as evidence). Gate G is set for Relay and Dead
Zone. WP-15 stays `waiting_matlab` for the other blocks, unless the user runs the full golden set.

---

## D. Schedule and exit

| Day | Work |
| --- | --- |
| 1 | A0, A1 (acceptance committed), B1 (acceptance committed), C1 (script ready) |
| 2–3 | A2 and A3 in parallel (Sonnet ×2), A4 (Haiku) |
| 3 | A5 verification, merge |
| 4 | B2 prototype, then B3 port |
| 5 | B4 verification, merge |
| when MATLAB is available | C2, C3, C4 |

**Exit criteria.**
- 0 open S1/S2 findings.
- XBV-436 fixed.
- XBV-419 and XBV-420 closed against a golden, or explicitly left open with the script ready and the reason recorded.
- `test:xbridges` 0 failed with gcc and clang.
- Help coverage at 100 %.
- `report.md` regenerated and matching the ledger.
