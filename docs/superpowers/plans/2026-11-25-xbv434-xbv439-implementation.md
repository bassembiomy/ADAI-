# Implementation plan — XBV-434 (float32 rounds after every operation) and XBV-439 (warm-up pass false root)

Written 2026-11-25 by the Opus controller after reading the code. It continues
`docs/superpowers/plans/2026-11-24-xbridges-open-findings.md`, sections A (WP-A2 to WP-A5) and B. Progress is tracked in
`docs/xbridges-verification/PROGRESS-open-findings.md`; update it after every step (standing rule in `CLAUDE.md`).

Branch: `arena/87db4611-adai`, HEAD at writing: `6cc2d15a`. Full `test:xbridges` at that point: 5543 passed, 8 failed
(the XBV-434 acceptance, on purpose), 56 skipped.

## Roles (the user's standing instruction)

| Step kind | Who | How |
| --- | --- | --- |
| Plan, acceptance tests, briefs, review, ledger, commits | **Opus** (main session) | The acceptance is committed alone first and must fail for the right reason. Opus re-runs every claim before it commits. |
| Generator, interpreter and engine changes | **Sonnet** | `Agent`, `subagent_type: xbv-executor`, `model: sonnet`. It never commits and edits only the files named in its brief. |
| Gate runs, inventories, repetitive edits | **Haiku** | `Agent`, `subagent_type: xbv-executor`, `model: haiku`. |
| Independent check before a merge | **Opus verifier** | `Agent`, `subagent_type: xbv-verifier`. It returns PASS or FAIL. Nothing is marked done or merged without PASS. |

Two Sonnet executors may run in parallel only when their briefs name disjoint files.

---

# Part 1 — XBV-439: the Gauss-Seidel warm-up accepts a false root (do this first)

Small, self-contained and in the engine file that WP-B3 just changed. It is done first so that the engine work is
finished before the float32 work starts.

## What is wrong — measured, cause not yet located

Read the code: `XbridgesEngine.solveAlgebraicLoopCore` runs up to `algMaxPasses` (50) Gauss-Seidel passes before
NLEQ-ERR (`src/engine/xbridges/XbridgesEngine.ts`, about lines 783–838).

A pass counts as settled when:

- every loop value moved by at most `algTol·(1 + |value|)`; and
- one of these holds:
  - the change is 0; or
  - the pass is at least the second, the change is not growing, and either
    `solutionError = change·q/(1 − q) ≤ algTol` (with `q = change / prevChange`) or `change ≤ 1e-14`.

Measured on 2026-11-25 with the real engine (`npx tsx scripts/xbridges-verification/xbv439Probe.ts`, model
`y = y + 1e-12·(y² + 1)` wired as Constant 1 → Sum ← Product(y,y), → Gain 1e-12 → Sum(y, ·); cycle order
`p, s2, g, s`):

| `algMaxPasses` | Result |
| --- | --- |
| 0 | `ALGEBRAIC_LOOP_NOT_CONVERGED`, y = 0 (correct: no real root) |
| 1 | `ALGEBRAIC_LOOP_NOT_CONVERGED`, y = 0 |
| 2, 3, 4, 50 | **accepted, y = 3e-12, no error** (false root) |

With the default of 50, the loop block `s` is evaluated exactly 3 times: y goes 1e-12 → 2e-12 → 3e-12, then the solve
returns.

**Hypothesis refuted.** The first guess was that the rate estimate is fooled by `q ≈ 1`. It is not:

- `q = 0.9999999999990004`, so `solutionError ≈ 1.0004`, far above `algTol` = 1e-6;
- `change ≈ 1e-12`, so the `1e-14` floor does not fire either.

So the acceptance comes from another branch, perhaps one of these:

- `change === 0`, if a pass compares values that did not move because a snapshot or cache returns the same values;
- the first pass's comparison against `undefined` pre-sweep values;
- a path after the passes, where NLEQ-ERR starts from the passes' last values and not from `start`.

Not yet located, and the old engine did the same. The fix below does not depend on which branch it is.

## The fix (decided here; record it as decision D25)

**No point may leave the warm-up passes without passing the same acceptance as the main solver.**

1. **Diagnose first (Sonnet, WP-439b step 1).** Instrument the pass loop on the model above and report which branch
   returns, and why. If the cause is a plain defect (a snapshot or cache bug, or a comparison with `undefined`), fix
   that defect as well.
2. **Fast path, unchanged in cost.** Accept from the rate estimate alone only for a clear contraction:
   - `q ≤ Q_MAX = 0.5`, measured on two consecutive passes;
   - the two `q` values agree within a factor of 2 (a stable rate, not noise);
   - `solutionError ≤ algTol`.

   At `q = 0.5`, `change·q/(1 − q)` equals `change`, so the estimate is at least the last observed step. The value
   comes from the bound, not from a test case.
3. **Every other acceptance is verified.** This covers `change === 0`, the `1e-14` floor, an unstable `q`, and
   `q > Q_MAX`.
   - Run `acceptedSolution` (residual AND Newton correction within `algTol`, one Jacobian) at the candidate point.
   - Accept if it passes.
   - Otherwise continue into NLEQ-ERR from the pre-sweep values (`start`).

   The verification Jacobian counts as evaluations, not iterations. `maxIter` and `algMaxPasses` keep their meaning.

## WP-439a — acceptance (Opus)

New `describe` in `src/engine/xbridges/verification/xbLoopDomain.test.ts`, or a new file `xbLoopWarmup.test.ts` if
that one grows past ~150 lines. Expected results are worked out by hand:

| Case | Expected |
| --- | --- |
| `y = y + 1e-12·(y² + 1)`, algTol 1e-6 and 1e-3, `algMaxPasses` 2 and 50 | no real root → `ALGEBRAIC_LOOP_NOT_CONVERGED`, fatal, never a value |
| `y = y + 1e-20·(y² + 1)` | the same |
| `y = 1 + 0.5·y` (contraction 0.5) | 2 within `algTol·3`, **and accepted by the fast path**. Assert that at most 30 loop evaluations are spent, so the fix cannot buy correctness with a Jacobian on every easy loop. |
| `y = 1 + 0.9999·y` (slow contraction) | 10000 within `algTol·10001` |
| `y = 1 − 0.5·y` (alternating) | 2/3 within `algTol·(5/3)` |
| warm start: the same loop solved twice at consecutive times | the second solve takes at most 3 passes (performance guard) |

Count evaluations the way `xbEngineB` describe `e` does: wrap one block's `execute`. Commit the file alone. The two
no-root cases must fail today, and every other case must pass today. If one of the others fails today, stop: the test or
the oracle is wrong.

## WP-439b — fix (Sonnet)

- **Step 1:** diagnose and report the accepting branch (see the fix above).
- **Edit only:** `src/engine/xbridges/XbridgesEngine.ts`, the warm-up block (lines ~783–838) and, if the diagnosis
  points there, the hand-over to NLEQ-ERR. Reuse `acceptedSolution`
  and `jacobianOf` from the NLEQ-ERR section rather than copying them; move them up if needed.
- **Acceptance:**
  - WP-439a: all green;
  - `xbEngineB`: 264 of 264;
  - `xbLoopDomain`: 6 of 6;
  - `xbEngine`, `xbWp21Engine`, `xbLoopOptions`, `xbSolversB`, `xbDiagnostics`, `xbWp21Blocks`,
    `xbEquations.motor`: all green;
  - `tsc`: clean.
- **Timing:** against the baseline in the PROGRESS log (xbEngineB 7.5 / 5.4 s; Wp21Blocks + motor 8.2 / 8.1 s), at
  most +10 %.
- **Full suite:** `test:xbridges` must show only the 8 XBV-434 failures.

## WP-439c — verify and close (Opus verifier, then Opus)

- **Probe:** the verifier re-runs its probe script (no-root loops, oscillating loops, slow contractions, a triple
  root, `sqrt` loops) against the old and the new engine. It must report no new false root and no newly unsolved
  case.
- **Close-out:** XBV-439 `fixed` with its commits, D25 recorded, `xbv:report` re-run, PROGRESS updated.

**Estimate:** half a day.

---

# Part 2 — XBV-434: float32 rounds after every operation (D20 option A)

## Where the work is (read from the code)

Float32 arithmetic lives only in the **embedded path** — the state-machine IR interpreter and the C generator. The
canvas engine (`XbridgesEngine`) computes in double and only casts constants (`BlockDefinitions.ts:2685`, `Constant`);
it is **out of scope** and must not change.

- **Interpreter** (`src/utils/stateMachine/xbInterpreter.ts`):
  - the block equations run on JS doubles;
  - `writeSignal` (~line 237) → `convertScalar` → `xbNumeric.ts:~261` applies `Math.fround` **once at the write**;
  - for example, `Sum` (~line 598) is `inputs.reduce(binary(sum, input, (l, r) => l + sign·r), [0])`.
- **Generator** (`src/utils/stateMachine/xbCGenerator.ts`):
  - float32 signals are **stored** as `float` (`nativeSignalCType`, ~line 2170);
  - every read casts to double: `(double)(storage)` at ~lines 594 and 722;
  - the expression is therefore evaluated in double, then written through `SM_XB_ConvertFloat32(double)` (~line 746);
  - for example, `emitSum` (~line 1074) is `(a) + (b) + (c)` on double operands;
  - libm calls are the double functions (`sin(...)`), except `VectorPow`, which already emits `powf`.
- **Scope:** 51 blocks (19 multi-op and 32 libm), listed in `docs/xbridges-verification/float32-inventory.md`.
- **Target:** the 8 failing tests in `src/utils/stateMachine/xbFloat32Ops.test.ts`. Of the 9 reported when WP-A1 was
  committed, the SIN pin became a ≤ 1 ULP check in `9fef3ab2`.

## Decisions to record before any code (Opus; ledger entry D26)

1. **Compute type of an operation.** When a block's **output** is float32, every operation of that block runs in
   float32:
   - inputs of another type are converted to float32 first (Simulink: the internal rule makes floating-point
     accumulator and product types follow the input/output floating type);
   - when the output is float64, nothing changes;
   - mixed inputs into a float64 output stay double.
2. **Filters and state-space blocks** (`LOW_PASS_FILTER`, `HIGH_PASS_FILTER`, `MOVING_AVERAGE`, `STATE_SPACE`,
   `DISCRETE_TRANSFER_FUNCTION`):
   - **Recommendation:** single accumulators, the same as rule 1. In Simulink, the internal data types of these blocks
     default to "Inherit: Inherit via internal rule", which for floating-point signals is the signal's own floating
     type.
   - **Check:** add one Discrete Transfer Fcn case to the MATLAB golden list (WP-C1 script) to confirm.
   - **If the golden disagrees:** the block keeps a double accumulator, recorded as a documented difference.
3. **Order of operations.** Left to right in input-port order (Sum, Product). Reductions run in index order
   (`SumElements`, `Mean`, `MatrixMul` inner loop `k = 0..n−1`). That is what both sides already do; it only has to
   stay that way.
4. **Rounding environment in C.**
   - The generated code requires `FLT_EVAL_METHOD == 0`: x86-64 SSE, ARM Cortex-M4F/M7 and AArch64 all have it. It
     must fail to compile otherwise: `#if FLT_EVAL_METHOD != 0 #error ... #endif`, so x87 extended precision can never
     silently change results.
   - Floating-point contraction is forbidden: `#pragma STDC FP_CONTRACT OFF`, and `-ffp-contract=off` in the parity
     harness flags. With contraction, FMA would round `a*b+c` once.
5. **libm (D23, unchanged).**
   - The contract is interpreter = C within the measured bound: 1 float32 ULP for sin, cos, exp, log, pow, atan and
     asin; **2 ULP for tanh**; sqrt exact.
   - The interpreter keeps `Math.fn` + `Math.fround`. No glibc port.

## WP-A1b — correct the acceptance before the implementation (Opus)

Two places in the existing acceptance would fail **after a correct implementation**:

1. **`xbFloat32Ops.test.ts` ~line 415** (the libm sweep `"${f.type} float32: interpreter = generated C at 0 ULP"`).
   - It asserts `worstInterpVsC === 0`. That passes today only because both sides call the double function.
   - Once the C calls `sinf`, D23 measured disagreements on 1 % (sin) to 27 % (tanh) of arguments.
   - **Change:** assert the D23 bound per function (1 ULP; tanh 2), and add an assertion that the generated C actually
     contains the `*f` call (`sinf(`, `tanhf(`, …). That second assertion is the new failing target.
2. **`xbCodeParityB.test.ts`** (V7B-1, libm blocks ≤ 1 ULP).
   - `TANH` will reach 2 ULP.
   - **Change:** a per-function bound table taken from D23, not a global 2. Its header already says that changing a
     bound is WP-A2/A3 work.

Also add the failing targets the inventory names but WP-A1 left out:

- `Mean` and `SumElements` over a vector where per-operation accumulation differs;
- `LOW_PASS_FILTER` over 100 ticks, against a step-by-step `Math.fround` recurrence written in the test (decision 2);
- `INTEGRATOR_DISCRETE` trapezoidal;
- a mixed-type Sum (an int16 input into a float32 Sum) for decision 1;
- a C source check that `FLT_EVAL_METHOD` is guarded and that FP contraction is off.

Commit the corrected acceptance alone. Opus checks that each new case fails today for the stated reason, and that the
cases that hold today still hold.

## WP-A2 — C generator (Sonnet A; edits only `src/utils/stateMachine/xbCGenerator.ts`)

1. **Reads.** When the consuming operation's compute type is float32, read a float32 signal as `(storage)` (a `float`)
   instead of `(double)(storage)` (~lines 594 and 722). Inputs of other types are read as `(float)(...)`. Add a helper
   `readAs(computeType, storage)` and use it in `inputExpressions` (~line 844).
2. **Literals.** Emit float literals with the `f` suffix in float32 expressions (`cNumber(x, 'float32')` →
   `1.0f`). Every `'0.0'`, `'1.0'` and parameter literal in the emitters goes through it.
3. **Temporaries.** In the lifecycle emitters that declare `const double` temporaries (`LOW_PASS_FILTER` `lpf_*_tau`,
   `_alpha`, `_y`; `HIGH_PASS_FILTER`; `MOVING_AVERAGE`; `STATE_SPACE`; `DISCRETE_TRANSFER_FUNCTION`; `PID_CONTROLLER`;
   `INTEGRATOR_DISCRETE`; `RATE_LIMITER`; `KALMAN_FILTER`), declare them as the compute type (`float` for float32).
4. **libm.** Map each call to the float function by compute type: `sin → sinf`, `cos → cosf`, `tan → tanf`,
   `asin → asinf`, `acos → acosf`, `atan → atanf`, `sinh/cosh/tanh → *f`, `asinh/acosh/atanh → *f`, `exp → expf`,
   `log → logf`, `sqrt → sqrtf`, `pow → powf`, `fabs → fabsf`. Exclude `WaveformGen`, `WHITE_NOISE` and
   `BAND_LIMITED_NOISE`, which stay double (inventory notes).
5. **Writes.** A float32 result written to a float32 signal needs no `SM_XB_ConvertFloat32(double)`. Keep the
   non-finite fault check (`SM_XB_NumericResult_t`) on a `float` value.
6. **Guards.** Add the `FLT_EVAL_METHOD` `#error` guard and `#pragma STDC FP_CONTRACT OFF` to the generated header or
   source. Add `-ffp-contract=off` to `DEFAULT_PARITY_FLAGS` (testkit) only if the brief allows that file. Otherwise
   report it and Opus adds it.
7. **Warnings.** Compile one float32 model of every multi-op and libm block with gcc and clang,
   `-Wall -Wextra -Wdouble-promotion -Wfloat-conversion -Werror`. Put this in the acceptance if it is not already
   there.

## WP-A3 — interpreter (Sonnet B; in parallel with A2; edits only `src/utils/stateMachine/xbInterpreter.ts` and `src/utils/stateMachine/xbNumeric.ts`)

1. **Arithmetic helper.** Add one helper, `arith(computeType)`, that returns `add`, `sub`, `mul`, `div` and `neg`.
   For float32 each is `Math.fround(Math.fround(a) op Math.fround(b))`; for float64 it is the plain operator. Derive
   the compute type from the operation's output numeric type, as the generator does (decision 1). Both sides must use
   the same rule: Opus checks this in review.
2. **Use it** in the 19 multi-op blocks of the inventory. Each block's spans (interpreter line numbers) are in
   `float32-inventory.md`.
   - `Sum` / `VectorAdd` / `SUM_JUNCTION`: `binary(sum, input, (l, r) => A.add(l, A.mul(sign, r)))`. `sign·r` is exact.
   - `PRODUCT` / `VectorMul` (multiply and divide), `SumElements`, `Mean` (accumulate, then divide), `MatrixMul`
     (inner loop), `MatrixSolve` (each elimination step), `Max` (unchanged arithmetic, kept in the test).
   - The state updates of `INTEGRATOR_DISCRETE`, `PID_CONTROLLER`, `RATE_LIMITER`, `LOW_PASS_FILTER`,
     `HIGH_PASS_FILTER`, `MOVING_AVERAGE`, `STATE_SPACE`, `DISCRETE_TRANSFER_FUNCTION` and `KALMAN_FILTER`.
   - Keep the exact operation order the C uses: the same left-to-right order, and the same grouping as the C source.
     Where the C groups `x + (dt*u)`, the interpreter does too.
3. **libm.** The interpreter keeps `Math.fn` with `Math.fround` on the argument and the result (D23). Nothing else.
4. **Writes.** `writeSignal` / `convertScalar` stay as they are. A value that is already float32 passes
   `Math.fround` unchanged.

## WP-A2 + A3 merge gate (Opus verifier, Haiku runs)

A2 and A3 merge **together** in one commit pair. The interpreter and the C must agree at every commit.

- **Acceptance:**
  - `xbFloat32Ops.test.ts`: all green, with gcc and with clang;
  - `xbCodeParityB.test.ts`: 0 ULP for every non-libm block (V7B-1), and the D23 per-function bound for libm blocks;
  - `xbCodeParity.test.ts` and `xbLongIds.test.ts` (host compile, gcc and clang): green.
- **No regression in the float64 path:** `xbCGenerator.test.ts`, `xbInterpreter.test.ts`, `xbNumeric.test.ts`,
  `xbStateMachineAlignment.test.ts`, `smDifferential.test.ts`, `xbSimEmbeddedParity`, `xbTriParity`.
- **Expected movement:** these compare canvas (double) against embedded float32 with a tolerance. If a float32 case
  now moves by more than its tolerance, Opus decides whether the tolerance was a D20 artefact (a documented change) or a
  real regression; neither the tolerance nor the test changes without that decision.
- **Full gates:** `tsc`, `test:xbridges` with 0 failures, `test:help`, `help:coverage`.
- **Generated code size:** report the size change for one reference model. Float temporaries should shrink the code
  on an FPU target; any growth above 5 % is reported.

## WP-A4 — remaining blocks (Haiku, mechanical, after A2/A3 pass)

- **Scope:** anything in the inventory's multi-op and libm tables that A2/A3 did not reach. The inventory script
  (`scripts/xbridges-verification/float32Inventory.ts`) is re-run to list what is left.
- **Per block:** one row in the parameterised acceptance (`xbFloat32Ops` "interpreter = C at 0 ULP for the non-libm
  multi-op blocks"), then the same pattern as A2/A3.
- Opus reviews each batch.

## WP-A5 — close-out (Opus, Haiku runs the gates)

- **Help:**
  - the data-type help and the code-generation chapter state the float32 profile: per-operation rounding,
    float libm, `FLT_EVAL_METHOD == 0` required, no FMA contraction;
  - help that is generated changes in its generator (`scripts/help/buildUiHelpInventory.ts`);
  - then run `test:help` and `help:coverage`.
- **Cortex-M4F check:** if `arm-none-eabi-gcc` is installed, compile the reference model for `-mcpu=cortex-m4
  -mfpu=fpv4-sp-d16 -mfloat-abi=hard` and confirm there are no double-precision helper calls (`__aeabi_d*`) in the
  float32 blocks. If it is not installed, record "not run".
- **Ledger:** XBV-434 `fixed` with the commits; D20 `implemented`; D26 recorded; `xbv:report`; PROGRESS updated.
- **Merge:** only now merge `arena/87db4611-adai` into `automative`. It is the first point where the full suite has
  0 failures.

---

## Order, parallelism, estimates

| Step | Who | Depends on | Estimate |
| --- | --- | --- | --- |
| 439a acceptance | Opus | — | 1 h |
| 439b fix | Sonnet | 439a | 2–3 h |
| 439c verify, close | verifier + Opus | 439b | 1 h |
| D26 + A1b acceptance correction | Opus | — (can run during 439b) | 2 h |
| A2 generator ‖ A3 interpreter | Sonnet A ‖ Sonnet B | A1b | 1 day each, in parallel |
| A2+A3 merge gate | verifier + Haiku | A2, A3 | ½ day (includes reworks) |
| A4 remaining blocks | Haiku, Opus review | A2+A3 merged | ½ day |
| A5 close-out, merge to `automative` | Opus + Haiku | A4 | ½ day |

**Total:** about 3 working days.

## Risks and how each is caught

| Risk | Caught by |
| --- | --- |
| The interpreter and the C pick a different compute type for a mixed-type block | the mixed-type Sum case in A1b; the verifier reads both rules side by side |
| FMA contraction or x87 makes C round differently on another machine | `FLT_EVAL_METHOD` `#error`, `FP_CONTRACT OFF`, `-ffp-contract=off`, run under gcc and clang |
| libm differences between C libraries (glibc vs MSVC vs newlib) | the D23 bound is a ULP bound, not a pinned value; the values measured on glibc are documented as glibc's |
| Float32 changes canvas-vs-embedded comparisons | the alignment and tri-parity suites in the merge gate; any tolerance change needs a recorded decision |
| Simulink keeps a double accumulator in a filter | the Discrete Transfer Fcn golden case added to the MATLAB script; a documented difference if so |
| The warm-up fix (XBV-439) slows every loop model | the "at most 30 evaluations" and "at most 3 passes on a warm start" guards in 439a; the +10 % timing gate |
| A session ends mid-step | PROGRESS file: each step's state is logged and committed; uncommitted executor work is re-verified, not trusted |

---

# Part 3 — after Parts 1 and 2: the MATLAB follow-ups and the final close-out

Added 2026-11-26. Parts 1 and 2 need nothing from the user. Part 3 starts when the user has MATLAB R2024b again
(decision D4; WP-15 is `waiting_matlab`). Same roles as above.

## WP-M0 — extend the MATLAB scripts before the user runs them (Opus, 1 h, no MATLAB needed)

Do this first, so one MATLAB session produces every golden.

1. **Filter accumulator.** Add a Discrete Transfer Fcn case with a `single` input to `scripts/xbridges-verification/goldens/`,
   for example `filter_single.m`. It checks D26's assumption that Simulink filters accumulate in single. The output goes
   to `docs/xbridges-verification/goldens/filter_single_*.csv` and `.meta.json`.
2. **Division loop** (REMAINING-WORK item 5.1). Add `y = a/y + b` from a zero start to `far_root_loop.m`, to learn
   whether Simulink also fails where F is infinite at the start point.
3. Add a skipped-until-present harness case for each new output, in the style of `xbGoldenTangent.test.ts`: absent
   files are skipped by name, never passed.
4. Write one command, in `docs/xbridges-verification/goldens/README.md`, that runs every script in a single
   `matlab -batch` call.

**Acceptance:** the new test cases are listed as skipped with the file and command named; the full suite is
unchanged otherwise.

## WP-M1 — the user's MATLAB session (user, about 30 min)

Run the single command from the README in the repository root, then commit the CSV and `.meta.json` files under
`docs/xbridges-verification/goldens/`. Nothing else is needed from the user.

## WP-M2 — XBV-419 and XBV-420: the touch-without-crossing rule (Opus acceptance, Sonnet fix, Opus verifier; ½ day)

1. Run `xbGoldenTangent.test.ts`. Its 24 comparisons are now real. Read what Simulink did for:
   - the Relay with switchOff 0 on u = (t−1)²;
   - the Dead Zone [−1, 0] on the same input, with zero-crossing detection on (and off for reference), under
     ode45, ode4 and ode23tb.
2. Record the rule as decision D27: on a touch, Simulink either holds the mode or switches it.
3. **If Simulink holds the mode on a touch:**
   - Acceptance: the live loop must equal batch for the Relay (live currently switches because t = 1 is on the grid).
     Flip the XBV-419 pins to match.
   - Fix (Sonnet): live mode updates must use the same strict sign-change rule as `crossingBlock`
     (`zeroCrossingGuard.ts`). Edit only `liveStep.ts` / `zeroCrossingGuard.ts`.
   - XBV-420: the ode23tb Dead Zone error of 2.55e-4 on the touch must fall to the solver tolerance. Locate why
     ode23tb differs from ode23 / ode45 there.
4. **If Simulink switches on a touch:**
   - Acceptance: batch must locate the touch as an event.
   - Fix (Sonnet): event location in `zeroCrossingGuard.ts` / `AdaptiveSolver.ts` / `StiffSolver.ts`.
   - Rewrite the mutant-15 test in `xbMutationGaps.test.ts` ("a touch is not a crossing"), because the rule it pins
     changes.
5. In both cases:
   - remove "provisional" from the RELAY and DEADZONE entries in `src/help/blockGuidance.ts`;
   - remove it from the solver-selector help in `scripts/help/buildUiHelpInventory.ts`, then regenerate
     `src/help/uiFeatureTopics.ts` with that generator;
   - keep `npm run -s help:coverage` and `test:help` green.
6. Verifier PASS, merge, close XBV-419 and XBV-420.

## WP-M3 — the far-root check and the filter case (Opus; 1–2 h)

1. **`xbGoldenLoop.test.ts` against the far-root goldens.**
   - If Simulink converges from zero, nothing changes.
   - If it does not, record in D24 that ADIA is stricter than Simulink there. That is a documented difference, not a
     defect, so add it to the help next to D21.
2. **Division loop:**
   - if Simulink solves it and ADIA does not, file a finding with acceptance first;
   - if Simulink fails too, record it as a documented limitation.
3. **Filter accumulator:**
   - if Simulink keeps a double accumulator for a single filter, change D26 for filters with acceptance first (Part 2
     risk table);
   - otherwise nothing changes.

## WP-M4 — final close-out (Opus + Haiku runs the gates; ½ day)

Start only when Parts 1–2 are merged and WP-M2 / M3 are done, or when the user accepts leaving XBV-419 and XBV-420
open.

1. Ledger:
   - WP-15 done, or still `waiting_matlab` with the reason;
   - WP-21 done;
   - every decision up to the last one recorded.
2. `npm run -s xbv:report`. In the report:
   - gate G per block: `pass` where a golden exists, `pending` elsewhere, with the list;
   - the mutation score with its date. A rerun is optional; see REMAINING-WORK item 5.4: it takes 10–12 h and gives
     at most 63.6 %.
3. Help: every documented difference D9 to the last decision is attached to its block. `help:coverage` and
   `test:help` are green.
4. Gates:
   - `npm run -s test:xbridges -- --exclude '.claude/**'` with 0 failures;
   - `npm run -s test:help -- --exclude '.claude/**'`;
   - `npx tsc --noEmit -p .`, with only the two known `xlsx` errors.
5. Update `docs/xbridges-verification/REMAINING-WORK.md` to "nothing open" (or the accepted open items), log the end
   in `PROGRESS-open-findings.md`, and push `automative`.

## Order and estimates for the whole remaining work

| Step | Needs the user? | Estimate |
| --- | --- | --- |
| Part 1, XBV-439 | no | ½ day |
| Part 2, XBV-434 | no | about 2½ days |
| WP-M0, extend the MATLAB scripts | no | 1 h |
| WP-M1, MATLAB run | **yes (MATLAB R2024b)** | 30 min of the user's time |
| WP-M2, XBV-419 / 420 | after WP-M1 | ½ day |
| WP-M3, far root, division loop, filter | after WP-M1 | 1–2 h |
| WP-M4, close-out | — | ½ day |

**Total without MATLAB:** about 3½ days, leaving XBV-419 / 420 open. **With MATLAB:** about 4½ days plus the user's
run.
