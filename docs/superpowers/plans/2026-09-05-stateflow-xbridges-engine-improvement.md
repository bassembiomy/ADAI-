# Stateflow / X-Bridges Engine Improvement Plan

> **For agentic workers:** Use the executing-plans skill to implement this plan task by task. Checkboxes track implementation, not work completed during planning.

**Goal:** Correct verified generation and verification defects while preserving supported features, saved-project compatibility, deterministic execution, and measured performance.

**Architecture:** Retain the existing state-machine IR with attached X-Bridges IR, TypeScript execution, and static C99 generation. Make localized changes with independent regression tests; keep normalization and validation at generation time wherever possible.

**Tech stack:** Existing TypeScript, Vitest, C99, GCC, and desktop integration. No new runtime dependencies are proposed.

**Status:** Proposed plan only. No engine implementation or performance measurements have been performed for this plan. Zero regression cannot be promised in advance; the gates below make regressions observable and block promotion.

## Approach and alternatives

Selected: staged stabilization with compatibility fixtures, independent numerical expectations, and before/after benchmarks. This gives each correction a small review and rollback boundary.

Rejected for this iteration: a generator rewrite or splitting all emitters first. Both expand the diff before numerical behavior is trustworthy. Also rejected: changing tests until they pass without documenting the intended mathematical and compatibility contracts.

## Constraints to preserve

- Stable generated public C functions, symbols, variable types, and exported package structure. Detect accidental state-structure layout changes; do not change PID state storage representation merely to align its meaning.
- Existing saved schemas, parameter aliases, boundary bindings, subsystem flattening, supported block families, and precision selection.
- Fixed logical ticks: accepted scheduler jitter does not change the behavioral time increment. Preserve timing rejection and timer saturation.
- Outer transitions precede During and X-Bridges execution; inner transitions follow it; child layers follow the existing order. Preserve entry/exit actions, priority, history, parallel regions, and internal/self transitions.
- Sample mapped inputs once per state step, execute the bounded solver loop, and commit mapped outputs according to the existing contract. Preserve discrete sample gates, read-before-update, Euler/RK4, reset/retain policy, fault rollback, and safety outputs.
- No generated heap allocation, recursion, unbounded loops, or graph traversal during each C tick. Do not reintroduce graph unrolling proportional to solver substeps.
- Preserve strict compile flags and existing numerical tolerances. No fast-math or weakened checks to obtain a pass.
- Keep unrelated workspace changes untouched; execution uses an isolated checkout. Do not overwrite the existing task.md to track this plan.

## Evidence baseline

The review run selected 707 tests: 565 passed and 142 failed. Of the failures, 120 explicitly contained GCC's missing-linker error. Additional failures wrapped compiler errors without retaining that message. These totals are not a clean engine-quality baseline.

Verified issues include Step literal rounding, unsigned zero-threshold comparisons, dead Step presence validation, ignored unflagged X-Bridges payloads, singleton-vector rejection, mismatched numeric-fault expectations, and differing PID_BASIC derivative-state recurrences. Additional failures include Kalman generated declarations, discrete-realization fixture dimensions, and isnanf portability on the selected compiler.

The existing Outport writer is type-aware. A redundant double cast is not a precision fix. Declared conformance currently uses 1e-4 absolute/relative tolerance; JSON comparison is a different verification path. HIL currently includes unistd.h conditionally, so the pasted report's missing-include assertion must not be treated as a confirmed defect.

## Task 1: Establish reproducible correctness and performance baselines

**Files:** scripts/verify_sm_codegen.ts; package.json; src/utils/stateMachine/smCHarness.ts; existing generator tests. Create scripts/benchmark_sm_codegen.ts and docs/superpowers/reviews/2026-09-05-stateflow-xbridges-baseline.md during execution.

**Interface:** Keep buildSemanticModel and generateCArtifacts unchanged. Benchmark output is a separate JSON artifact with commit, fixture hash, toolchain, flags, machine, measurements, and run count.

- [ ] Verify a compiler by compiling, linking, and running a small C99 program, rather than checking gcc --version alone. Use an explicit, recorded toolchain selection without changing global machine settings.
- [ ] Separate missing-toolchain BLOCKED status from compiler rejection of generated source, which is FAIL.
- [ ] Replace tests that read personal Downloads paths with sanitized, checked-in deterministic fixtures; preserve their original behavioral assertions.
- [ ] Run the full selected suite and classify each failure as environment, model/fixture validation, generation, runtime, differential, or assertion-contract failure.
- [ ] Record outputs and traces for representative valid legacy/current models, and compile all 27 declared conformance cases. Preserve known failures explicitly; do not establish them as accepted semantics.
- [ ] Add benchmark fixtures for scalar chains, hierarchy/parallel states, vector/matrix operations, PID/DELAY, subsystems, and 1/5/50 solver substeps. Include small, medium, and large graphs with fixed seeds.
- [ ] Measure semantic-build time, generation time, TS tick time, compiled-C tick time, generated source size, executable text/data/bss, instance size, and available stack-usage reports. Measure production C separately from trace-enabled C.
- [ ] Warm up TS, time batches of C ticks with observable results, repeat paired baseline/candidate runs on the same machine/toolchain, and record variability. Exclude compilation and tracing from tick timing.

**Gate:** Working compile/link/run probe; every failure classified; baseline artifacts reproducible. Further implementation cannot claim performance preservation until these measurements exist.

## Task 2: Lock down state-flow and compatibility behavior

**Files:** src/utils/stateMachine/smXBridgesAppIntegration.test.ts, smDifferential.test.ts, smInterpreter.parallel-history.test.ts, smModelMigration.test.ts, xbModelAdapter.test.ts, xbBoundaryMappings.test.ts, xbSubsystemFlattener.test.ts.

**Interface:** Existing project model -> buildSemanticModel -> existing TS and C harnesses; no schema changes.

- [ ] Extend existing integration fixtures to cover outer transitions skipping XB work, inner guards seeing current mapped outputs, entry timer reset, and reset/retain on re-entry.
- [ ] Cover parallel regions, history restoration, deterministic operation order, nested subsystems, delay sample gating, multiple substeps, and fault output preservation.
- [ ] Add save/load/export round trips for existing aliases and smVarId bindings; assert one canonical mapping and unchanged values/types.
- [ ] Record expected state, timers, outputs, and fault behavior from the documented contract, not solely from either implementation.

**Gate:** Existing passing behavior remains passing in TS, application integration, and generated C. A change to ordering or public model behavior is outside this stabilization task.

## Task 3: Repair Step output precision and zero-time generation

**Files:** src/utils/stateMachine/xbCGenerator.ts, xbCGenerator.test.ts, xbInterpreter.test.ts, xbCConformanceCases.ts.

**Interface:** Consume existing operation.stepParameters; retain threshold alignment and timer source.

- [ ] Add failing cases for initial/final values 0.125, -0.0625, small finite magnitudes, and representative float32/float64 values. Define signed-zero handling explicitly if observable.
- [ ] Add zero-threshold, exact-tick, between-tick, re-entry, and large valid threshold cases with independent expected outputs.
- [ ] Reuse the existing precise C numeric-literal formatter instead of toFixed(1), auditing that formatter's edge cases first. Apply equivalent handling to both reachable Step paths.
- [ ] Emit the final constant for zero threshold. Do not alter timer-before-execution ordering or ceil-to-tick alignment.
- [ ] Run all declared suites that use Step, including flip-flop and register-counter cases, under strict flags.

**Gate:** Precise values and threshold timing agree with independent expectations and TS/C execution. No new per-tick work, storage, or duplicated substep code.

## Task 4: Make validation explicit without rejecting valid legacy projects

**Files:** src/utils/stateMachine/xbSemanticBuilder.ts, xbModelAdapter.ts, smSemanticBuilder.ts, smSemanticValidator.ts, smModelMigration.ts and their existing tests.

**Interface:** Adapter/migration normalizes legacy input; semantic validation consumes canonical data and returns diagnostics.

- [ ] Inventory missing Step keys and X-Bridges enable flags in supported schemas and the checked-in model corpus before tightening validation.
- [ ] Test missing versus explicit zero, each alias, invalid numeric values, and ambiguous/conflicting aliases.
- [ ] Validate canonical Step key presence before applying fallback values. If a supported legacy schema defines omitted values, materialize those documented defaults at its migration boundary with diagnostic provenance.
- [ ] For an XB payload with a missing flag, diagnose the inconsistency. Normalize only where the saved-schema contract proves it means an enabled diagram; otherwise block generation with an actionable diagnostic.
- [ ] Preserve explicitly disabled diagrams; do not auto-enable isXBridges: false or interpret retained editor content as execution intent.
- [ ] Include state/block identifiers and corrective actions in diagnostics. Keep validation out of runtime tick loops.

**Gate:** Every supported legacy fixture loads and preserves its documented behavior. Ambiguous input is explained rather than silently executed or omitted. No implicit schema-wide default change.

## Task 5: Align PID_BASIC state semantics

**Files:** src/utils/stateMachine/xbInterpreter.ts, xbCGenerator.ts, xbPidContract.ts, xbPidContract.test.ts, xbInterpreter.test.ts, xbCConformanceCases.ts. Add a focused PID_BASIC contract module only if needed to avoid conflating PID_CONTROLLER semantics.

**Interface:** Preserve existing ports, parameters, and public state layout. Document the meaning of i_state, d_state, and last_e and the equations for each supported integration method.

- [ ] Derive expected multi-tick sequences independently for forward Euler, backward Euler, and trapezoidal methods. Neither current implementation is automatically the oracle.
- [ ] Cover constant/step/ramp inputs, reset, disable/re-enable, saturation, anti-windup, sample periods, and float32/float64.
- [ ] Resolve the previous-error versus filtered-state disagreement explicitly, then implement the selected documented recurrence in TS and C together.
- [ ] Keep PID_CONTROLLER separate unless its contract and regression evidence justify reuse. Do not add a runtime method parser or generic dispatcher to C.
- [ ] Document intentional corrections to previously wrong outputs; keep already valid PID modes unchanged.

**Gate:** Independent expected sequences and complete internal-state/output traces agree; no layout/API change or unexplained runtime regression.

## Task 6: Restore shape and numeric-fault consistency

**Files:** src/utils/stateMachine/xbShapeResolver.ts, xbNumeric.ts, xbInterpreter.ts, xbCGenerator.ts, smDifferential.test.ts and associated tests.

**Interface:** Declared shape remains distinct from element count. Existing signal-only/escalate policies retain their meanings.

- [ ] Test length-one vectors through adaptation, shape inference, VectorAdd/Sub/Mul/Div, generated storage, and traces. Accept vector length one where the block contract supports vectors; retain true scalar mismatch errors.
- [ ] Specify finite arithmetic overflow, f64-to-f32 overflow, divide-by-zero, incoming NaN/Infinity, saturation, and rollback as separate contract cases. Reconcile existing floating-value allowances before adding faults.
- [ ] Add failing expected-policy tests first, then align TS/C at the narrowest existing conversion or operation boundary.
- [ ] Avoid duplicate isfinite checks when the conversion path already establishes the required result. Measure any unavoidable additional checks on affected and unaffected graphs.
- [ ] Do not raise tolerance or resize singleton-vector fixtures simply to hide a defect.

**Gate:** Both policies, storage updates, mapped safety outputs, and recoverability match the explicit contract without regressions in supported floating-point behavior.

## Task 7: Repair remaining generation and fixture defects individually

**Files:** src/utils/stateMachine/xbCGenerator.ts, xbCGenerator.test.ts, xbCConformanceCases.ts, xbDeclaredCConformance.test.ts.

- [ ] Reproduce Kalman missing/duplicate declarations with the smallest valid graph; fix scope and symbol emission and test multiple Kalman blocks together.
- [ ] Replace nonportable isnanf emission with type-correct C99 behavior and test finite, NaN, and Infinity branches on supported host toolchains.
- [ ] Correct DELAY/discrete-realization fixture parameters and dimensions only against supported contracts; preserve the behaviors the fixtures were meant to test.
- [ ] Investigate RATE_LIMITER vector capability versus emitter support. Implement declared supported behavior if promised; otherwise report the unsupported shape at validation, not during rendering. Never silently remove advertised support.
- [ ] Replace redundant-cast string expectations with same-type and cross-type mapping value tests. Retain structural assertions where they protect API, scheduling, or type correctness.

**Gate:** All declared supported conformance cases compile and execute. Fixture edits cannot reduce coverage or disguise missing advertised functionality.

## Task 8: Make verification evidence precise and repeatable

**Files:** src/utils/stateMachine/smDifferentialEngine.ts, smTrace.ts, smPipelineOrchestrator.ts, smVerificationAggregator.ts and tests; scripts/verify_sm_codegen.ts; package.json. Add .github/workflows/stateflow-xbridges-review.yml if CI runners/toolchains can satisfy the gate.

- [ ] Label comparisons accurately: structural equality, exact numeric values, or explicit tolerances. Preserve existing tolerances; do not call tolerance-based checks bit-exact.
- [ ] Test signed zero and nonfinite serialization where relevant; prevent JSON normalization from concealing a meaningful mismatch.
- [ ] Verify supplied vectors actually drive both executions and that compared evidence includes XB signals/state when claiming XB equivalence.
- [ ] Report missing tools as BLOCKED and invalid generated C as FAIL. Bind evidence to model hash, generator revision, fixture/vector identity, compiler, and flags.
- [ ] Add a fast fixture semantic-validation stage before compilation, followed by compile/run, independent numeric expectations, and differential tests.
- [ ] Preserve separate host and target status: host tests do not certify MCU timing or integration.

**Gate:** A synthetic mismatch, invalid C, missing compiler, and missing execution evidence each produce the correct non-pass result.

## Performance and release gates

These are proposed investigation thresholds, not measured guarantees or permission to slow the engine down:

- Preserve asymptotic scaling and the compact bounded substep loop. Structural regressions fail regardless of noisy timing results.
- Require no new allocations in generated tick execution and no unexplained instance/stack/data growth.
- Compare paired warmed runs using the same fixtures, machine, compiler, and optimization flags. Use at least 20 batches; choose batch lengths above timer noise. Run shared CI timing as informational unless its variance is controlled.
- A repeatable increase above 5% in median or p95 batched tick cost, or above 10% in generation/build time or code size, blocks promotion pending investigation. Smaller repeatable regressions still require explanation and optimization; the thresholds are not budgets to consume.
- Correctness-driven extra work must be measured and minimized, then explicitly recorded as a tradeoff if it remains. Do not claim zero performance cost without evidence.
- Re-run benchmarks after every runtime/generator change; run full integration/conformance before promotion. Measure target timing separately before making target WCET claims.
- Every formerly passing relevant test remains passing; all declared supported conformance cases pass on the recorded supported toolchain. Do not skip failures or relabel supported capabilities to ship.

Suggested full verification commands, after toolchain preflight:

```powershell
npx vitest run src/utils/stateMachine --reporter=json --outputFile=stateflow-verification.json
npx tsc --noEmit
npm run build:sm-runtime
```

Classify pre-existing repository-wide type-check failures separately, but introduce none. Validate generated standalone runtime artifacts and normal application export as part of integration; preserve unrelated generated-file changes.

## Delivery and rollback

Execute Tasks 1-2 first, then separate changes for Step, validation, PID, shapes/faults, remaining emitters, and verification reporting. For every behavioral change: write a failing regression, confirm its failure, apply the minimal fix, pass focused tests, run applicable integration and benchmark gates, then commit only related changes.

Each delivery records the trigger, corrected behavior, compatibility evidence, performance delta, and rollback commit. Keep schema rewrites out of this iteration so reverting a generator fix does not require reversing saved-project mutations.

Defer emitter splitting and legacy Step deletion until consumer searches, saved-model fixtures, and generated-artifact comparisons prove they are safe. They are optional later maintenance, not prerequisites for correctness.

## Plan review

- [x] Uses the verified review rather than accepting the pasted report's fix list wholesale.
- [x] Preserves fixed logical ticks, bounded loops, mappings, and existing integration features.
- [x] Separates legacy migration from strict canonical validation.
- [x] Defines measurable performance gates without claiming an unmeasured guarantee.
- [x] Provides independent mathematical expectations as well as differential checks.
- [x] Leaves implementation checkboxes open and engine source unchanged.
