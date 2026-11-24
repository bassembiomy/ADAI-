# X-Bridges open findings — progress and resume sheet

**Read this file first when you continue in a new session.** It is updated after every step of this work, and the
updates are committed and pushed together with the work they describe. Detailed plan:
`docs/superpowers/plans/2026-11-24-xbridges-open-findings.md`. Finding and decision records:
`docs/xbridges-verification/ledger.json`. The human-readable report is `report.md`; regenerate it with
`npm run -s xbv:report`.

- **Branch:** `arena/87db4611-adai`. Push only there. `automative` was merged at `55ed35a5` and must stay green, so
  merge into it only when every test passes (see "Merge rule").
- **Last updated:** 2026-11-24, after `8ab47ec5` (WP-B3 dispatched to Sonnet).

## How to run the work (roles — the user's standing instruction)

| Role | Who | Does |
| --- | --- | --- |
| Planning, acceptance, verification | **Opus** (main session) | Writes the briefs and the acceptance tests first (committed alone, failing for the right reason). Reviews every diff and re-runs the claims itself. Updates the ledger and this file. Commits and pushes. |
| Algorithm, generator, engine work | **Sonnet** — `Agent` with `subagent_type: xbv-executor`, `model: sonnet` | Implements against the committed acceptance and reports. Never commits. |
| Mechanical work and test runs | **Haiku** — `Agent` with `subagent_type: xbv-executor`, `model: haiku` | Runs the gates, does inventories and repetitive edits. Never edits during a run-only task. |
| Independent check before a merge | `xbv-verifier` (Opus) | Re-runs the acceptance and audits the diff against the brief. Returns PASS or FAIL. |

Run two executors in parallel only when they touch different files. Give each executor the exact files it may edit.

## Gates (run by Haiku; all must pass before anything merges to `automative`)

```bash
npx tsc --noEmit -p .
npm run -s test:xbridges -- --exclude '.claude/**'
npm run -s test:help -- --exclude '.claude/**'
npm run -s help:coverage
npm run -s xbv:report && git diff --exit-code docs/xbridges-verification/report.md
```

The full `test:xbridges` takes about 8–20 minutes. The two host-compile suites in `src/utils/stateMachine`
(`xbCodeParity`, `xbLongIds`) need clang and gcc.

## Merge rule

The branch holds acceptance tests that fail **on purpose** until the fix lands. Today: 8 in
`src/utils/stateMachine/xbFloat32Ops.test.ts` (XBV-434) and 5 in `src/engine/xbridges/verification/xbEngineB.test.ts`
describe `e` (XBV-436). Do not merge the branch into `automative` until these pass.

---

## Status

| Finding | Work package | Status | Evidence / commit |
| --- | --- | --- | --- |
| XBV-417 review → XBV-438 | loop fields saved, engine refuses invalid values, help corrected | **done, merged** | `32c9d606`, `3dff1cba`, `aa527663`, merge `55ed35a5` |
| XBV-434 float32 | WP-A0 inventory | done | `53b7b64f`, `docs/xbridges-verification/float32-inventory.md` (51 of 99 codegen blocks: 19 multi-op, 32 libm) |
| | WP-A1 acceptance + D23 | done (8 failing by design) | `efb349a3`, SIN case corrected to the D23 contract in `9fef3ab2` |
| | WP-A2 C generator (`float` temporaries, float libm) | **to do** | — |
| | WP-A3 interpreter (`Math.fround` between operations) | **to do** | — |
| | WP-A4 remaining multi-op blocks | to do | — |
| | WP-A5 close-out | to do | — |
| XBV-436 far loop roots | WP-B1 acceptance | done (5 failing by design) | `6852e9a0`; resolution floor for root 3.16e8 in `ec9130e9` |
| | WP-B2 lab | **done: NLEQ-ERR green 12/12 from zero, worst 613 evaluations** | `ec9130e9`, D24 revised; the first verdict ("cannot work") was a lab defect |
| | WP-B3 port NLEQ-ERR into the engine | **in progress (next)** | — |
| | WP-B4 close-out | to do | — |
| | Simulink check of the zero start | script ready, waiting for MATLAB | `06becad6`, `901670c3`: `far_root_loop.m`, `xbGoldenLoop.test.ts` |
| XBV-419 / 420 tangent touch | WP-C1 script, WP-C3 harness | done | `c96efcfa`: `tangent_touch.m`, `xbGoldenTangent.test.ts` (24 named skips) |
| | WP-C2 MATLAB run | **waiting for the user's machine** | — |
| | WP-C4 decide and close | to do after WP-C2 | — |

### Commands for the user (MATLAB R2024b)

```bash
matlab -batch "run('scripts/xbridges-verification/goldens/tangent_touch.m')"
```

```bash
matlab -batch "run('scripts/xbridges-verification/goldens/far_root_loop.m')"
```

Commit the CSV and `.meta.json` files they write to `docs/xbridges-verification/goldens/`. After that, the skipped
comparison tests run by themselves.

---

## Next steps in order (with the brief each one needs)

### 1. WP-B3 — port NLEQ-ERR into the engine (Sonnet, then Opus verifies)

- **Edit only:** `src/engine/xbridges/XbridgesEngine.ts`, in `solveAlgebraicLoopCore`, about lines 755–1180.
- **Source:** the NLEQ-ERR candidate in `scripts/xbridges-verification/loopLab.ts`, with its fixes NL-1 to NL-5 and
  LAB-1, and the scaled linear solve.
- **Keep:**
  - the Gauss–Seidel pre-passes;
  - one `algTol` / `maxIter` budget;
  - the XBV-421 solution test (residual AND Newton correction within `algTol`);
  - the diagnostics (`ALGEBRAIC_LOOP_NOT_CONVERGED` naming the loop blocks);
  - the stiff-solver tight solve (`StiffSolver.computeOutputsTight`).
- **Acceptance:** `xbEngineB.test.ts` describe `e` must become all green, and every other test in `xbEngineB`,
  `xbEngine`, `xbLoopOptions`, `xbSolversB` and `xbDiagnostics` must stay green.
- **Then:** run the full `test:xbridges`, plus the performance check (the PWM / ode45 timings in the WP-21 ledger note
  must stay within +10 %).
- **Risk:** converged values of loops that pass today can move within `algTol`. The tests pin to `algTol`, not to
  bits.

### 2. WP-A2 + WP-A3 — float32 per operation (two Sonnet executors in parallel, different files)

- **A2 (generator):** in `src/utils/stateMachine/xbCGenerator.ts`, use `float` temporaries, `f` literals and float
  libm for float32 blocks. `SM_XB_ConvertFloat32` stays only for conversions from other types. Compile with
  `-Wdouble-promotion -Wfloat-conversion -Werror` under gcc and clang.
- **A3 (interpreter):** add `Math.fround` between operations in the 19 multi-op blocks of `float32-inventory.md`
  (`src/engine/xbridges/BlockDefinitions.ts` and the state-machine interpreter `src/utils/stateMachine/xbInterpreter.ts`).
  The libm contract is D23: interpreter = C within 1 float32 ULP, and sqrt exact.
- **Acceptance:** `xbFloat32Ops.test.ts` all green, and `xbCodeParityB` V7B-1 still 0 ULP for the non-libm blocks.
- **Merge both together.** The interpreter and the C must agree at every merge.

### 3. WP-A4, WP-A5, WP-B4 — close-outs

Each close-out: remaining blocks, help text, the ledger set to `fixed` with the commits, `xbv:report`, the full gates,
then merge into `automative`.

### 4. After MATLAB — WP-C2 to WP-C4 and the zero-start question for XBV-436

**Tangent touch (WP-C2 to WP-C4).** Once the tangent-touch output files exist:
- **If Simulink holds the mode on a touch:** fix live to match batch. The mutant-15 test in `xbMutationGaps.test.ts`
  stays.
- **If Simulink switches on a touch:** change `crossingBlock` and event location, and rewrite the mutant-15 test.
- **In both cases:** remove "provisional" from the Relay / Dead Zone help and from the solver selector topic. That
  topic's text is in the generator `scripts/help/buildUiHelpInventory.ts`.

**Zero-start loop (XBV-436).** Once the far-root loop output files exist:
- Where Simulink also fails from zero, record that XBV-436's target is stricter than Simulink.

---

## Log (newest first)

- **2026-11-24 WP-B3 started.**
  - **Dispatched:** to Sonnet (`xbv-executor`), editing only `XbridgesEngine.ts` `solveAlgebraicLoopCore`.
  - **Baseline timings, two runs each (wall seconds):**

    | Test files | Run 1 | Run 2 |
    | --- | --- | --- |
    | xbEngineB | 7.5 | 5.4 |
    | xbEngine + xbWp21Engine + xbLoopOptions | 8.1 | 8.3 |
    | xbWp21Blocks + xbEquations.motor | 8.2 | 8.1 |

  - **If the session ended here:** check `git status`. If `XbridgesEngine.ts` is modified but not committed, run
    acceptance A–E from section "Next steps 1" on it before trusting it, or discard it with
    `git checkout -- src/engine/xbridges/XbridgesEngine.ts` and dispatch WP-B3 again.

- **2026-11-24 `ec9130e9`.** The XBV-436 lab was corrected.
  - **Defects:** seven, LAB-1, DL-1 and NL-1 to NL-5, documented in the lab header.
  - **Result:** NLEQ-ERR converges on 12 of 12 from the engine's zero start (worst 613 evaluations, budget 2020).
    Dogleg and plain Newton each converge on 2 of 12. Re-run by the controller.
  - **D24 revised:** the loop's Jacobian has det = 2ks; it is not rank-deficient.
  - **Tolerance:** the acceptance for root 3.16e8 uses the derived resolution floor (every y from root − 6700 to
    root + 2650 is an exact fixed point in double).
- **2026-11-24 `06becad6`, `901670c3`.** Simulink golden for the far-root loop: script and harness, skipped until
  MATLAB runs. The setting names that could not be verified are listed in the script header.
- **2026-11-24 `9fef3ab2`.** The XBV-434 SIN acceptance now asserts within 1 ULP of the C `sinf` (D23), not glibc's
  exact value.
- **2026-11-24 `53b7b64f` … `77d8e6e6`.** Another session: WP-A0, A1, B1, B2 (first verdict, since revised), C1 and C3.
  Review findings: the D24 claim was wrong; the SIN test contradicted D23; whether Simulink converges from zero was
  not asked.
- **2026-11-24 `55ed35a5`.** The tested changes were merged into `automative`, and the plan was written.
- **2026-11-24 `32c9d606`, `3dff1cba`, `aa527663`.** XBV-417 review fixes (XBV-438). Full suite: 5493 passed,
  0 failed.
