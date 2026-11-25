# X-Bridges open findings — progress and resume sheet

**Read this file first when you continue in a new session.** It is updated after every step of this work, and the
updates are committed and pushed together with the work they describe. Detailed plans:
`docs/superpowers/plans/2026-11-24-xbridges-open-findings.md` (all findings) and
**`docs/superpowers/plans/2026-11-25-xbv434-xbv439-implementation.md`** (the current one: XBV-439, then XBV-434). Finding and decision records:
`docs/xbridges-verification/ledger.json`. The human-readable report is `report.md`; regenerate it with
`npm run -s xbv:report`.

- **Branch:** `arena/87db4611-adai`. Push only there. `automative` was merged at `55ed35a5` and must stay green, so
  merge into it only when every test passes (see "Merge rule").
- **Last updated:** 2026-11-25. The implementation plan for XBV-434 and XBV-439 is written; no code started.

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

The branch holds acceptance tests that fail **on purpose** until the fix lands. Today: only the 8 in
`src/utils/stateMachine/xbFloat32Ops.test.ts` (XBV-434). Everything else is green (full `test:xbridges` after `95fbb387`:
5543 passed, 8 failed, 56 skipped). Do not merge the branch into `automative` until these pass.

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
| | WP-B3 port NLEQ-ERR into the engine | **done** | `6b5f2875` port; verifier FAIL on loops undefined on one side → acceptance `827e80ed`, fix `95fbb387` |
| XBV-439 Gauss-Seidel pre-pass false root | new, found by the WP-B3 verifier, older than WP-B3 | open, to plan | ledger XBV-439 |
| | WP-B4 close-out | **done — XBV-436 fixed, D21 closed** | ledger + report; the Simulink zero-start comparison still waits for MATLAB |
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

### 1. (done) WP-B3 / WP-B4 — XBV-436 fixed. See the log.

### 2. Current plan: `docs/superpowers/plans/2026-11-25-xbv434-xbv439-implementation.md`

Follow its "Order" table. Each step's brief, its files and its acceptance are in that document. In short:

1. **XBV-439** (Part 1). 439a acceptance (Opus) → 439b diagnose and fix (Sonnet) → 439c verify (Opus verifier).
   Probe: `npx tsx scripts/xbridges-verification/xbv439Probe.ts`; today `algMaxPasses` ≥ 2 gives the false root
   y = 3e-12. The accepting branch is **not yet located**: the rate-estimate branch was ruled out by measurement.
2. **XBV-434** (Part 2).
   - **Decisions and acceptance correction:** D26 (compute type, filters, operation order, `FLT_EVAL_METHOD` /
     FP-contract, libm bounds), then A1b. A1b corrects the acceptance first: the libm sweep's 0-ULP assertion and the
     V7B-1 libm bound would fail after a correct fix, because `tanhf` is 2 ULP from `Math.tanh`.
   - **Implementation:** A2 generator ‖ A3 interpreter (two Sonnet executors in parallel, disjoint files), merged
     together after the verifier's PASS.
   - **Close-out:** A4 remaining blocks (Haiku), then A5 close-out and merge into `automative`.

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

- **2026-11-25 merged into `automative` at the user's request** (`dbac07b2`; its tree is identical to the arena
  branch at `701f3701`).
  - **Now on `automative`:** XBV-436 fixed, the XBV-434 acceptance, the Simulink golden scripts, and the plans.
  - **Not green:** `automative` now carries the **8 failing XBV-434 acceptance tests** in `xbFloat32Ops.test.ts`.
    Everything else passed in the last full run (5543 passed at `95fbb387`). They turn green with Part 2 of the
    2026-11-25 plan.

- **2026-11-25 implementation plan written** (`2026-11-25-xbv434-xbv439-implementation.md`).
  - **XBV-439 measured:** `algMaxPasses` 0 or 1 → correct not-converged; ≥ 2 → false root 3e-12 after 3 loop
    evaluations.
  - **Hypothesis refuted:** the controller's first guess (the rate estimate fooled by q ≈ 1) was ruled out with
    numbers: the estimated error is about 1. The ledger entry XBV-439 is corrected.
  - **Probe** committed as `scripts/xbridges-verification/xbv439Probe.ts`.
  - **XBV-434 read from the code:** float32 signals are stored as `float` in C but read as `(double)` (xbCGenerator
    ~594 / ~722), so every expression runs in double. The interpreter rounds only in `writeSignal`.
  - **Two acceptance flaws found** that would fail a correct fix (the libm 0-ULP sweep, the V7B-1 tanh bound). They
    are corrected in step A1b.

- **2026-11-24 `95fbb387` + ledger: XBV-436 fixed, D21 closed.**
  - **The fix:** a one-sided finite difference restored where the central stencil is non-finite.
  - **Tests:** xbLoopDomain 6 of 6, xbEngineB 264 of 264, the related files 436 of 436. Full suite: 5543 passed,
    8 failed (XBV-434, expected).
  - **Controller's check:** the controller diffed the full verifier probe. Only the four sqrt rows changed, and all four
    are valid roots; no new false root.
  - **Open findings now:** XBV-434, XBV-419, XBV-420 and XBV-439.

- **2026-11-24 WP-B3 verifier: FAIL, rework.**
  - **Passed:** the acceptance A and B re-runs, the scope check, the timing (+3 to +5 %), and the false-root probes:
    there are no false roots in the new engine.
  - **Regression (deviation 5):** y = sqrt(y) + c from a zero start (c = −0.001, −0.0031, −0.1, −0.2) is now
    `ALGEBRAIC_LOOP_NOT_CONVERGED`. F(−h) is NaN, so the Jacobian is null and the solve stops; the old engine solved
    all four.
  - **Acceptance:** `xbLoopDomain.test.ts`, hand oracle y = w² with w² − w − c = 0. It passes 6 of 6 on the engine
    before WP-B3 (checked by swapping the file in) and fails 4 of 6 on `6b5f2875`.
  - **Fix dispatched to Sonnet:** restore a one-sided difference where the central one is non-finite.
  - **New finding:** XBV-439 (S3, open, present before WP-B3). The Gauss-Seidel pre-pass accepts y = 3e-12 for
    y = y + 1e-12 (y² + 1), which has no root.
  - **Division loops:** y = a/y + b fails in both engines (F is infinite at 0). Not a regression; not filed.

- **2026-11-24 WP-B3 implemented, not yet committed.**
  - **Executor's results:**
    - `XbridgesEngine.ts`: +160 / −253 lines.
    - `xbEngineB`: 264 of 264 pass.
    - The 7 related test files: 436 of 436 pass.
    - `tsc`: clean.
    - Full `test:xbridges`: 5537 passed, 8 failed (all XBV-434, expected), 56 skipped.
    - Timings are within noise of the baseline.
  - **Controller's re-run:** 341 of 341 pass (xbEngineB, xbLoopOptions, xbEngine).
  - **Deviations from the lab, still being verified:**
    1. a rate-based error estimate for multiple roots;
    2. the Aitken limit, used only when the residual is unresolved;
    3. a correction at the rounding floor (≤ 1e-14) is accepted;
    4. a retry with the raw Jacobian when the denoised one is singular;
    5. the old one-sided finite-difference fallback for a non-finite F was dropped.
  - **Now:** the `xbv-verifier` (Opus) is checking for false roots, for loops whose F is non-finite on one side, and
    for timing.
  - **Committed as `6b5f2875`, marked PENDING VERIFICATION**, so the work survives a session end. If the session ended
    before the verifier's verdict, re-run the verifier brief (acceptance A–E plus the five deviations) against
    `git diff 6b5f2875~1 6b5f2875`. On FAIL, fix it in a new commit or revert `6b5f2875`. Do not merge into
    `automative` until it passes.

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
