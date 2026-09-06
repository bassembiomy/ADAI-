# Generated-Code Testing System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate and execute an evidence-backed verification suite for every ADIA state-machine C package, with independent results for compilation, behavior, safety, timing, coverage, differential testing, static/MISRA analysis, target compilation, and hardware testing.

**Architecture:** Extend the validated semantic model with resolved verification configuration, derive a deterministic `SMTestManifest` directly from that model, and render production C and independent C test suites from sibling representations. Execute each verification activity through a typed adapter returning canonical evidence; the aggregator is fail-closed and never infers an unexecuted result from another activity.

**Tech Stack:** TypeScript 5.4+, Vitest 4, Node.js 20+, generated C90/C99/C11, GCC/Clang host tooling, gcov/llvm-cov, configurable static/MISRA analyzers, existing ADIA target packs and HIL services.

## Global Constraints

- Host flags: `-Wall -Wextra -Werror -Wpedantic -Wconversion -Wsign-conversion -Wshadow`.
- Supported standards: `c90`, `c99`, `c11`; migrated projects default to `c11`.
- Expected results come from `SemanticModel`, never from parsing generated C.
- Production and test files are separate; every test owns a fresh instance and MCAL log.
- Missing execution evidence is `NOT_RUN`, never `PASS`.
- Feature absence is `NOT_APPLICABLE` only when proven from the semantic model.
- Statement/branch percentages come from instrumented execution, not static reachability.
- Required statement and branch targets are 100% for model behavior and specified decisions.
- Target compilation must pass before embedded delivery acceptance.
- Preserve unrelated worktree changes and stage only task-owned files.

---

## File Map

- Model/config: `smModel.ts`, `smModelMigration.ts`, `smSemanticModel.ts`, `smSemanticBuilder.ts`.
- Manifest: new `smTestManifest.ts`, `smBoundaryVectors.ts`, `smTestPlanBuilder.ts`.
- C tests: new `smCTestRuntimeRenderer.ts`, `smCTestSuiteRenderer.ts`; update `smCGenerator.ts`, `smFileWriter.ts`.
- Evidence/execution: new `smVerificationEvidence.ts`, `smToolRunner.ts`, `smCoverageRunner.ts`, `smAnalysisRunner.ts`, `smTargetCompileRunner.ts`; update `smCHarness.ts`, `smDifferentialEngine.ts`, `smPipelineOrchestrator.ts`, `smVerificationAggregator.ts`.
- Reports/entry points: update `smReports.ts`, `createStateMachineVerificationReport.ts`, `stateMachineCodeGenerator.ts`, `verify_sm_codegen.ts`, and `package.json`.

### Task 1: Persist and Resolve Verification Configuration

**Files:**
- Modify: `src/utils/stateMachine/smModel.ts`
- Modify: `src/utils/stateMachine/smModelMigration.ts`
- Modify: `src/utils/stateMachine/smSemanticModel.ts`
- Modify: `src/utils/stateMachine/smSemanticBuilder.ts`
- Test: `src/utils/stateMachine/smModelMigration.test.ts`
- Test: `src/utils/stateMachine/smSemanticBuilder.test.ts`

**Interfaces:**
- Consumes: v4 state-machine models and existing `HILConfig` mappings.
- Produces: schema v5 `verification: SMVerificationConfig` and `SemanticModel.verification: ResolvedSMVerificationConfig`.

- [ ] **Step 1: Write failing migration and validation tests**

Assert v4 migration produces C11, zero tolerance, logical time, 100% statement/branch targets, 100,000 cycles, no invented tools/target, and preserves explicit v5 settings. Assert stable diagnostics for invalid tolerance, thresholds, cycles, missing input policy, safety-only MC/DC, and HIL target mismatch.

```ts
expect(migrateStateMachineModel(v4).model.verification).toEqual({
  cStandard: 'c11', tickToleranceMs: 0, timerPolicy: 'logical-tick',
  resetPolicy: 'always-authorized',
  watchdogAfterCriticalFault: 'do-not-service',
  statementCoverageTarget: 100, branchCoverageTarget: 100,
  requireMcdc: false, repeatedExecutionCycles: 100_000,
  staticAnalysisToolId: null, misraToolId: null, targetId: null,
});
```

- [ ] **Step 2: Run tests; expect schema/config failures**

Run: `npx vitest run src/utils/stateMachine/smModelMigration.test.ts src/utils/stateMachine/smSemanticBuilder.test.ts`

- [ ] **Step 3: Add exact persisted types and bump the schema to 5**

```ts
export type SMCStandard = 'c90' | 'c99' | 'c11';
export type SMTimerPolicy = 'logical-tick' | 'actual-delta';
export type SMInvalidInputPolicy = 'clamp' | 'reject' | 'default' | 'diagnostic-fault';
export interface SMVerificationConfig {
  cStandard: SMCStandard; tickToleranceMs: number; timerPolicy: SMTimerPolicy;
  resetPolicy: 'always-authorized' | 'condition-required';
  watchdogAfterCriticalFault: 'service' | 'do-not-service';
  statementCoverageTarget: number; branchCoverageTarget: number;
  requireMcdc: boolean; repeatedExecutionCycles: number;
  staticAnalysisToolId: string | null; misraToolId: string | null;
  targetId: string | null;
  invalidInputPolicies?: Record<string, SMInvalidInputPolicy>;
}
```

Define `StateMachineModelV5`, set `CURRENT_SM_SCHEMA_VERSION = 5`, and define `ResolvedSMVerificationConfig` as the required form with a read-only input-policy map.

- [ ] **Step 4: Implement migration and semantic validation**

Export `defaultSMVerificationConfig()` with the values asserted above. Validate integer tolerance ≥0, thresholds in 0–100, cycles in 1–10,000,000, required per-input policies, MC/DC safety scope, and target agreement. Emit `SM_VERIFY_TOLERANCE_INVALID`, `SM_VERIFY_COVERAGE_INVALID`, `SM_VERIFY_CYCLES_INVALID`, `SM_VERIFY_INPUT_POLICY_MISSING`, `SM_VERIFY_MCDC_REQUIRES_SAFETY`, and `SM_VERIFY_TARGET_MISMATCH`.

- [ ] **Step 5: Run tests and typecheck; expect PASS**

Run: `npx vitest run src/utils/stateMachine/smModelMigration.test.ts src/utils/stateMachine/smSemanticBuilder.test.ts && npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add src/utils/stateMachine/smModel.ts src/utils/stateMachine/smModelMigration.ts src/utils/stateMachine/smSemanticModel.ts src/utils/stateMachine/smSemanticBuilder.ts src/utils/stateMachine/smModelMigration.test.ts src/utils/stateMachine/smSemanticBuilder.test.ts
git commit -m "feat(sm): add verification configuration"
```

### Task 2: Define the Canonical Test Manifest and Boundary Synthesis

**Files:**
- Create: `src/utils/stateMachine/smTestManifest.ts`
- Create: `src/utils/stateMachine/smBoundaryVectors.ts`
- Test: `src/utils/stateMachine/smTestManifest.test.ts`
- Test: `src/utils/stateMachine/smBoundaryVectors.test.ts`

**Interfaces:**
- Produces: `SMTestManifest`, `SMTestCase`, discriminated operation/expectation unions, timing/relational/ID/MC-DC vectors.

- [ ] **Step 1: Write failing determinism and boundary tests**

Assert JSON round-trip, stable case sorting, inclusive 450/500/550 and rejected 449/551 values for 500±50, unsigned-zero handling, relational true/false/boundary vectors, invalid minimum/maximum IDs, and MC/DC independent-condition pairs.

```ts
expect(timingBoundaryValues(500, 50)).toEqual([
  { deltaMs: 449, accepted: false }, { deltaMs: 450, accepted: true },
  { deltaMs: 500, accepted: true }, { deltaMs: 550, accepted: true },
  { deltaMs: 551, accepted: false },
]);
```

- [ ] **Step 2: Run tests; expect missing-module failures**

Run: `npx vitest run src/utils/stateMachine/smTestManifest.test.ts src/utils/stateMachine/smBoundaryVectors.test.ts`

- [ ] **Step 3: Define exact manifest contracts**

```ts
export type SMTestSuite = 'initialization'|'transitions'|'actions'|'timing'|'safety'|'io'|'reset'|'robustness'|'hierarchy';
export type SMApplicability = { status: 'applicable' } | { status: 'not-applicable'; reason: string };
export interface SMTestTraceability {
  modelId: string; stateIds: readonly string[]; transitionIds: readonly string[];
  requirementIds: readonly string[]; generatedFunctions: readonly string[];
  testCaseId: string;
}
export interface SMTestCase {
  id: string; suite: SMTestSuite; name: string; applicability: SMApplicability;
  operations: readonly SMTestOperation[];
  expectations: readonly SMTestExpectation[];
  traceability: SMTestTraceability;
}
export interface SMTestManifest {
  schemaVersion: 1; modelId: string; modelHash: string;
  verification: ResolvedSMVerificationConfig; cases: readonly SMTestCase[];
}
```

Operations must cover init/reset/step, variable/input setup, field corruption, timer setup, and repeated stepping. Expectations must cover active state/slot, variable, timer, error, fault latch, action/transition order, MCAL call/value/count/order, and watchdog count.

- [ ] **Step 4: Implement boundary helpers**

Export `timingBoundaryValues`, `relationalBoundaryValues`, `invalidIndexValues`, and `mcdcVectors`. Use typed finite domains; throw `SM_MCDC_VECTOR_UNRESOLVED` when obligations cannot be synthesized instead of fabricating coverage.

- [ ] **Step 5: Run focused tests and commit**

Run: `npx vitest run src/utils/stateMachine/smTestManifest.test.ts src/utils/stateMachine/smBoundaryVectors.test.ts && npx tsc --noEmit`

```bash
git add src/utils/stateMachine/smTestManifest.ts src/utils/stateMachine/smBoundaryVectors.ts src/utils/stateMachine/smTestManifest.test.ts src/utils/stateMachine/smBoundaryVectors.test.ts
git commit -m "feat(sm): define model-derived test manifest"
```

### Task 3: Derive All Required Test Cases From the Semantic Model

**Files:**
- Create: `src/utils/stateMachine/smTestPlanBuilder.ts`
- Test: `src/utils/stateMachine/smTestPlanBuilder.test.ts`
- Modify: `src/utils/stateMachine/smFixtures.ts`

**Interfaces:**
- Produces: `buildSMTestManifest(ir: SemanticModel): SMTestManifest`.

- [ ] **Step 1: Create the reviewed two-state fixture and failing case inventory**

The fixture has default `State_1`, `State_2`, boolean `x`, numeric `y`, transition `x == true`, entry action `y = 10`, tick 500, tolerance 50, and mapped I/O/safe values. Assert cases for all initialization, transition, action, timing, safety, I/O, reset, and robustness requirements plus all 15 reviewed-model checks.

```ts
const manifest = buildSMTestManifest(build(reviewedTwoStateFixture()));
expect(caseIds(manifest)).toContain('SM-TC-INIT-NULL-INSTANCE');
expect(findCase(manifest, 'SM-TC-TRANS-STATE_1-STATE_2-TRUE').expectations)
  .toContainEqual({ kind: 'variable', variableId: 'y', value: 10 });
```

- [ ] **Step 2: Add conditional hierarchy fixtures**

Use `historyFixture`, `parallelHistoryFixture`, and `nestedAndFixture` to assert default child, parent entry/exit, shallow/deep restoration, reset/fault history, parallel activation/exit/consistency. A flat model must contain explicit `not-applicable` manifest entries.

- [ ] **Step 3: Run tests; expect missing builder**

Run: `npx vitest run src/utils/stateMachine/smTestPlanBuilder.test.ts`

- [ ] **Step 4: Implement deterministic identity and traceability**

Sort layers by slot, states by activity index, transitions by priority then ID, mappings by ID. Build readable IDs with `toCIdentifier`; append eight model-hash characters on collision. Resolve requirement IDs only from `traceableElements` and function names only from semantic element kinds.

- [ ] **Step 5: Implement initialization, transition, and action planners**

Derive defaults, inactive states, slots, timers, data, error/latch, entry counts, mapping failure, guard false/true/boundaries, priority, one transition per layer, complete transition coverage, action results/order, and internal/external self-transition behavior.

- [ ] **Step 6: Implement timing, safety, I/O, reset, and robustness planners**

Derive timing boundaries/policy/saturation; safe-output values/calls; corrupted fields; repeated fault behavior; watchdog policy; every mapping conversion/order/count; each invalid-input policy; normal/fault/null reset; invalid public arguments and array boundaries; configured long-run cycles.

- [ ] **Step 7: Add requirement-coverage assertions**

Maintain an explicit test matrix mapping TGEN-REQ-001–005, TEST-INIT-001–004, TEST-TRANS-001–007, TEST-ACT-001–005, TEST-TIME-001–007, TEST-SAFE-001–008, TEST-IO-001–006, TEST-RESET-001–004, TEST-ROB-001–005, and conditional hierarchy requirements to applicable/not-applicable cases.

- [ ] **Step 8: Run tests and commit**

Run: `npx vitest run src/utils/stateMachine/smTestPlanBuilder.test.ts src/utils/stateMachine/smTraceabilityEngine.test.ts`

```bash
git add src/utils/stateMachine/smTestPlanBuilder.ts src/utils/stateMachine/smTestPlanBuilder.test.ts src/utils/stateMachine/smFixtures.ts
git commit -m "feat(sm): derive complete generated test plan"
```

### Task 4: Generate the C Test Runtime and MCAL Recorder

**Files:**
- Create: `src/utils/stateMachine/smCTestRuntimeRenderer.ts`
- Test: `src/utils/stateMachine/smCTestRuntimeRenderer.test.ts`

**Interfaces:**
- Produces: `tests/test_support.h/.c`, `tests/test_main.c`, and `tests/mcal_test_stub.h/.c`.

- [ ] **Step 1: Write failing renderer/compile tests**

Assert bounded logs, typed assertions, reset/query APIs, no VLA, and recording of function/channel/value/count/order/safe-output/watchdog. Compile rendered support code under C90, C99, and C11 with all strict flags.

- [ ] **Step 2: Run; expect missing renderer**

Run: `npx vitest run src/utils/stateMachine/smCTestRuntimeRenderer.test.ts`

- [ ] **Step 3: Render the stable support contract**

```c
typedef void (*ADIA_TestFn)(void);
void ADIA_TestBegin(const char *case_id);
void ADIA_TestFail(const char *file, unsigned long line, const char *message);
void ADIA_AssertBool(bool expected, bool actual, const char *expr, const char *file, unsigned long line);
void ADIA_AssertU32(uint32_t expected, uint32_t actual, const char *expr, const char *file, unsigned long line);
void ADIA_AssertDouble(double expected, double actual, double tolerance, const char *expr, const char *file, unsigned long line);
int ADIA_TestRun(const ADIA_TestCase *cases, size_t count);
```

For C90, render ADIA-owned bool/fixed-width compatibility declarations and avoid C99 syntax. For C99/C11, use standard headers.

- [ ] **Step 4: Render the bounded MCAL recorder**

Define `MCAL_TestCall`, `MCAL_TestReset`, `MCAL_TestCount`, `MCAL_TestCallAt`, input setters, safe-output, and watchdog hooks. Capacity is `max(64, expectedMaximumCalls + 8)`; overflow calls `ADIA_TestFail`.

- [ ] **Step 5: Run strict compile tests and commit**

Run: `npx vitest run src/utils/stateMachine/smCTestRuntimeRenderer.test.ts`

Expected: PASS with installed GCC; absence skips the generator integration assertion without creating product evidence.

```bash
git add src/utils/stateMachine/smCTestRuntimeRenderer.ts src/utils/stateMachine/smCTestRuntimeRenderer.test.ts
git commit -m "feat(sm): generate C test runtime and MCAL recorder"
```

### Task 5: Render Independent Suite Files and Safe Package Layout

**Files:**
- Create: `src/utils/stateMachine/smCTestSuiteRenderer.ts`
- Test: `src/utils/stateMachine/smCTestSuiteRenderer.test.ts`
- Modify: `src/utils/stateMachine/smCGenerator.ts`
- Modify: `src/utils/stateMachine/smCGenerator.test.ts`
- Modify: `src/utils/stateMachine/smFileWriter.ts`
- Modify: `src/utils/stateMachine/smFileWriter.test.ts`

**Interfaces:**
- Produces: `renderSMCTestPackage(ir, manifest): GeneratedCFile[]` and separated production/test/verification paths.

- [ ] **Step 1: Write failing file-set, isolation, and traceability tests**

Assert eight required `test_sm_*.c` files, MCAL/support/main files, manifest and differential vectors. Every test comment must contain model/state/transition/requirement/function/case IDs and every function must declare a local `ADIA_Instance_t` and reset MCAL state.

- [ ] **Step 2: Run; expect missing suites and flat layout**

Run: `npx vitest run src/utils/stateMachine/smCTestSuiteRenderer.test.ts src/utils/stateMachine/smCGenerator.test.ts src/utils/stateMachine/smFileWriter.test.ts`

- [ ] **Step 3: Implement exhaustive operation/expectation rendering**

Use exhaustive switches plus `assertNever`. Resolve C symbols from the semantic model; never scan C text. Render one function per applicable case and keep non-applicable cases only in the manifest/report.

- [ ] **Step 4: Integrate generation with backward compatibility**

Add `includeVerificationPackage?: boolean`. When true, prefix production artifacts with `production/`, tests with `tests/`, and JSON/reports with `verification/`. Retain `includeHostHarness` for one release as a deprecated alias; flat generation remains unchanged when neither option is set.

- [ ] **Step 5: Support nested writes safely**

Create parent directories after resolving each destination. Reject `../`, absolute, drive-qualified, and mixed-separator escapes while permitting safe nested relative paths.

- [ ] **Step 6: Run focused/golden tests and commit**

Run: `npx vitest run src/utils/stateMachine/smCTestSuiteRenderer.test.ts src/utils/stateMachine/smCGenerator.test.ts src/utils/stateMachine/smFileWriter.test.ts src/utils/stateMachineCodeGenerator.golden.test.ts`

```bash
git add src/utils/stateMachine/smCTestSuiteRenderer.ts src/utils/stateMachine/smCTestSuiteRenderer.test.ts src/utils/stateMachine/smCGenerator.ts src/utils/stateMachine/smCGenerator.test.ts src/utils/stateMachine/smFileWriter.ts src/utils/stateMachine/smFileWriter.test.ts src/utils/__snapshots__/stateMachineCodeGenerator.golden.test.ts.snap
git commit -m "feat(sm): generate independent C verification suites"
```

### Task 6: Close Generated Runtime Safety and Testability Gaps

**Files:**
- Modify: `src/utils/stateMachine/smCGenerator.ts`
- Test: `src/utils/stateMachine/smCGenerator.behavior.test.ts`
- Test: `src/utils/stateMachine/smCGenerator.test.ts`

**Interfaces:**
- Produces: configured timing/fault/reset behavior and `ADIA_TESTING`-only corruption hooks.

- [ ] **Step 1: Add failing compiled behavior tests**

Cover null APIs, invalid mapping, 450/500/550 acceptance, 449/551 rejection, timer saturation, active-state exit on fault, safe outputs, latched execution blocking, repeated fault calls, watchdog policy, reset authorization, and invalid IDs/indices. Compile without `ADIA_TESTING` and assert hooks are not exported.

- [ ] **Step 2: Run; preserve existing passes and identify exact gaps**

Run: `npx vitest run src/utils/stateMachine/smCGenerator.behavior.test.ts src/utils/stateMachine/smCGenerator.test.ts`

- [ ] **Step 3: Implement safe timing arithmetic**

```c
if ((delta_ms < SM_TICK_MIN_MS) || (delta_ms > SM_TICK_MAX_MS)) {
    SM_Enter_Fault(instance, SM_ERR_TIMING);
    return SM_ERR_TIMING;
}
if (instance->state_timers[state_index] > (UINT32_MAX - increment_ms)) {
    instance->state_timers[state_index] = UINT32_MAX;
} else {
    instance->state_timers[state_index] += increment_ms;
}
```

Resolve `increment_ms` to `SM_TICK_MS` or `delta_ms` from configuration.

- [ ] **Step 4: Implement idempotent fault and complete reset contracts**

Exit active states once, set the precise error/latch, apply safe outputs, enforce watchdog policy, and block normal step/write while latched. Reset exits once, clears timers/history/error/latch/data, validates reset/mapping conditions, enters defaults, and applies initial outputs.

- [ ] **Step 5: Add bounded test-only setters**

Under `ADIA_TESTING`, expose setters for active states, activity flags, shallow/deep history, timers, and layer slots. Return `SM_ERR_NULL_INSTANCE` or `SM_ERR_INVALID_ARGUMENT` on bad input; do not emit declarations in production builds.

- [ ] **Step 6: Make production rendering honor all three configured standards**

Add a standard-compatibility renderer shared by production and test files. C90 output must use ADIA-owned boolean/fixed-width typedefs, declarations at block starts, block comments, and no designated initializers or `for`-scope declarations. C99/C11 output uses `<stdbool.h>` and `<stdint.h>`. Extend the compiled fixture to compile the complete production plus test package under each configured standard with strict flags.

- [ ] **Step 7: Run strict tests and commit**

Run: `npx vitest run src/utils/stateMachine/smCGenerator.behavior.test.ts src/utils/stateMachine/smCGenerator.test.ts`

```bash
git add src/utils/stateMachine/smCGenerator.ts src/utils/stateMachine/smCGenerator.behavior.test.ts src/utils/stateMachine/smCGenerator.test.ts
git commit -m "fix(sm): enforce generated runtime safety contracts"
```

### Task 7: Add Canonical Evidence and Safe Tool Execution

**Files:**
- Create: `src/utils/stateMachine/smVerificationEvidence.ts`
- Create: `src/utils/stateMachine/smToolRunner.ts`
- Test: `src/utils/stateMachine/smToolRunner.test.ts`

**Interfaces:**
- Produces: `ActivityEvidence`, `CommandEvidence`, `VerificationBundle`, and `runTool(request)`.

- [ ] **Step 1: Write failing process/evidence tests**

Use a temporary Node executable to prove exact argument passing, `shell: false`, cwd confinement, bounded stdout/stderr, timeout termination, `ENOENT` classification, tool-version capture, and SHA-256 input/output hashes.

- [ ] **Step 2: Run; expect missing modules**

Run: `npx vitest run src/utils/stateMachine/smToolRunner.test.ts`

- [ ] **Step 3: Define canonical evidence contracts**

```ts
export type VerificationStatus = 'PASS'|'FAIL'|'NOT_RUN'|'NOT_APPLICABLE'|'PENDING';
export type VerificationActivity =
  'structural'|'semantic'|'test-generation'|'host-compilation'|'host-runtime'|
  'sanitizers'|'statement-coverage'|'branch-coverage'|'mcdc-coverage'|
  'differential'|'static-analysis'|'misra-analysis'|'target-compilation'|'hardware';
export interface CommandEvidence {
  executable: string; args: readonly string[]; cwd: string;
  toolVersion: string | null; exitCode: number | null; signal: string | null;
  timedOut: boolean; stdout: string; stderr: string;
  startedAt: string; durationMs: number;
  inputHashes: Readonly<Record<string,string>>;
  outputHashes: Readonly<Record<string,string>>;
}
export interface ActivityEvidence<T = unknown> {
  activity: VerificationActivity; status: VerificationStatus;
  summary: string; command: CommandEvidence | null; details: T;
}
```

- [ ] **Step 4: Implement safe execution and run tests**

Use `spawn` with executable/argument array, explicit timeout, bounded buffers, sanitized inherited environment, and resolved workspace cwd. Return `ENOENT` to callers as unavailable; retain real nonzero exits as executed failures.

Run: `npx vitest run src/utils/stateMachine/smToolRunner.test.ts && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/smVerificationEvidence.ts src/utils/stateMachine/smToolRunner.ts src/utils/stateMachine/smToolRunner.test.ts
git commit -m "feat(sm): add canonical verification evidence"
```

### Task 8: Execute Host Compilation, Runtime Suites, and Sanitizers

**Files:**
- Modify: `src/utils/stateMachine/smCHarness.ts`
- Modify: `src/utils/stateMachine/smCHarness.test.ts`

**Interfaces:**
- Produces: `compileHostPackage`, `runHostTests`, `runSanitizers`, each returning `ActivityEvidence`.

- [ ] **Step 1: Add failing adapter tests**

Assert standard mapping, all seven required flags, all production/test sources, warning-as-error behavior, runtime nonzero exit, malformed JSONL, missing/duplicate case IDs, ASan/UBSan finding, unsupported sanitizer, and missing compiler. Missing compiler must be `NOT_RUN`; compile failure must prevent execution.

- [ ] **Step 2: Run; expect absent evidence APIs**

Run: `npx vitest run src/utils/stateMachine/smCHarness.test.ts`

- [ ] **Step 3: Implement strict host compilation**

Use `-std=c90|c99|c11`, `-pedantic-errors`, all required warnings, `-DADIA_TESTING`, both include directories, every `.c` source, and a real link output. `-fsyntax-only` may remain a fast diagnostic but cannot yield PASS evidence.

- [ ] **Step 4: Implement runtime and sanitizer execution**

Parse bounded JSON Lines from the generated runner, require each applicable manifest ID exactly once, retain assertion detail/duration, and require zero exit. Rebuild with `-fsanitize=address,undefined -fno-omit-frame-pointer`; any diagnostic/nonzero exit is FAIL, unavailable support is NOT_RUN.

- [ ] **Step 5: Run and commit**

Run: `npx vitest run src/utils/stateMachine/smCHarness.test.ts src/utils/stateMachine/smCGenerator.behavior.test.ts`

```bash
git add src/utils/stateMachine/smCHarness.ts src/utils/stateMachine/smCHarness.test.ts
git commit -m "feat(sm): execute host and sanitizer verification"
```

### Task 9: Collect Executed Coverage and Complete Differential Evidence

**Files:**
- Create: `src/utils/stateMachine/smCoverageRunner.ts`
- Test: `src/utils/stateMachine/smCoverageRunner.test.ts`
- Modify: `src/utils/stateMachine/smDifferentialEngine.ts`
- Modify: `src/utils/stateMachine/smDifferentialEngine.test.ts`
- Modify: `src/utils/stateMachine/smDifferential.test.ts`

**Interfaces:**
- Produces: statement/branch/MC-DC evidence and first-divergence evidence.

- [ ] **Step 1: Write failing coverage parser/policy tests**

Use inline gcov/llvm-cov fixtures. Verify production-only measurement, uncovered file/function/line/branch details, threshold failure, malformed/missing tool data, and refusal to substitute static reachability. MC/DC is NOT_APPLICABLE only for non-safety models and NOT_RUN when required but unsupported.

```ts
export interface UncoveredCode {
  file: string; functionName: string; line: number;
  kind: 'statement'|'branch'|'condition';
  reason: string; requiredAction: string;
}
export interface CoverageDetails {
  measuredPercent: number; covered: number; total: number;
  threshold: number; uncovered: readonly UncoveredCode[];
}
```

- [ ] **Step 2: Implement instrumented coverage**

For GCC compile/run with `--coverage -O0`, then collect gcov JSON. For Clang use `-fprofile-instr-generate -fcoverage-mapping`, merge, and export llvm-cov JSON. Exclude `tests/`. Define `SMCoverageAdapter.measureMcdc`; built-ins return NOT_RUN if installed versions lack condition coverage.

- [ ] **Step 3: Write failing complete differential tests**

Compare active states, all variables, outputs, timers, transitions, ordered actions, and error state each cycle. First mismatch must include cycle, field path, expected/actual, model hash, input vector, and replay command. Missing compiled execution is NOT_RUN.

- [ ] **Step 4: Implement shared observation/evidence schema**

Share `SMCycleObservation` between the reference trace and C parser. Sort map fields but preserve transition/action order. Replace legacy `VERIFIED/FAILED/INTEGRATION REQUIRED` at this boundary with canonical statuses; keep a compatibility mapper only until Task 13.

- [ ] **Step 5: Run and commit**

Run: `npx vitest run src/utils/stateMachine/smCoverageRunner.test.ts src/utils/stateMachine/smDifferentialEngine.test.ts src/utils/stateMachine/smDifferential.test.ts`

```bash
git add src/utils/stateMachine/smCoverageRunner.ts src/utils/stateMachine/smCoverageRunner.test.ts src/utils/stateMachine/smDifferentialEngine.ts src/utils/stateMachine/smDifferentialEngine.test.ts src/utils/stateMachine/smDifferential.test.ts
git commit -m "feat(sm): add executed coverage and differential evidence"
```

### Task 10: Add Static/MISRA Analysis, Metrics, and Identifier Qualification

**Files:**
- Create: `src/utils/stateMachine/smAnalysisRunner.ts`
- Test: `src/utils/stateMachine/smAnalysisRunner.test.ts`
- Create: `src/utils/stateMachine/smCIdentifierPolicy.ts`
- Test: `src/utils/stateMachine/smCIdentifierPolicy.test.ts`
- Modify: `src/utils/stateMachine/smCGenerator.ts`
- Modify: `src/utils/smAnalysisEngine.ts`
- Modify: `src/utils/smAnalysisEngine.test.ts`

**Interfaces:**
- Produces: normalized analysis evidence, qualified external identifiers, and per-function metrics.

- [ ] **Step 1: Write failing analysis and collision tests**

Cover tool/version/rules, mandatory/required/advisory counts, deviations, suppressions with justification, locations, PASS/FAIL/NOT_RUN, and two UUID-heavy identifiers colliding within 31 significant characters.

- [ ] **Step 2: Implement deterministic short identifiers**

Export `allocateExternalIdentifiers(elements, significantCharacters)`. Combine a readable normalized prefix with eight SHA-256 characters and lengthen the hash within the fixed limit on collision. Keep original IDs in comments and traceability JSON only.

- [ ] **Step 3: Implement analyzer adapters**

Define `probe()` and `run(request)`. Add a generic JSON adapter supporting only `{sourceDir}`, `{outputFile}`, and `{standard}` tokens, invoked through `smToolRunner`. Unknown tokens fail configuration; unavailable configured tools return NOT_RUN.

- [ ] **Step 4: Add metrics**

Normalize cyclomatic complexity, nesting depth, function length, parameter count, and optional stack estimate. Unsupported stack estimation is NOT_RUN, never zero.

- [ ] **Step 5: Run and commit**

Run: `npx vitest run src/utils/stateMachine/smAnalysisRunner.test.ts src/utils/stateMachine/smCIdentifierPolicy.test.ts src/utils/smAnalysisEngine.test.ts src/utils/stateMachine/smCGenerator.test.ts`

```bash
git add src/utils/stateMachine/smAnalysisRunner.ts src/utils/stateMachine/smAnalysisRunner.test.ts src/utils/stateMachine/smCIdentifierPolicy.ts src/utils/stateMachine/smCIdentifierPolicy.test.ts src/utils/stateMachine/smCGenerator.ts src/utils/smAnalysisEngine.ts src/utils/smAnalysisEngine.test.ts
git commit -m "feat(sm): add static MISRA and identifier qualification"
```

### Task 11: Reuse Target Packs for Target Compilation

**Files:**
- Create: `src/utils/stateMachine/smTargetCompileRunner.ts`
- Test: `src/utils/stateMachine/smTargetCompileRunner.test.ts`
- Modify: `src/engine/targetPacks/targetPackTypes.ts`
- Modify: `src/engine/targetPacks/targetPackSchema.ts`
- Modify: `src/engine/targetPacks/targetPackSchema.test.ts`

**Interfaces:**
- Consumes: resolved target ID, `TargetRegistry`, immutable pack assets and compile recipe.
- Produces: target-compilation evidence with pack/compiler/output identity.

- [ ] **Step 1: Write failing target-status tests**

Cover no target (NOT_RUN), missing pack (FAIL), missing compiler (NOT_RUN), diagnostics (FAIL), success (PASS), tool/version/command, pack hash, output hash, and proof that host compilation cannot set target status.

- [ ] **Step 2: Add a declarative target verification recipe**

Extend `TargetPackManifest` with executable, argument array, source globs, include directories, output path, and version arguments. Validate all paths as pack-relative and reject shell-control characters; execution uses argument arrays.

- [ ] **Step 3: Implement target compilation**

Resolve through `TargetRegistry`, materialize assets with existing hash checks, include generated production sources, invoke the pinned recipe, require the expected object/ELF, and capture target ID, pack version/hash, compiler version, diagnostics, and output hash.

- [ ] **Step 4: Run and commit**

Run: `npx vitest run src/utils/stateMachine/smTargetCompileRunner.test.ts src/engine/targetPacks/targetPackSchema.test.ts src/engine/targetPacks/defaultTargetPacks.test.ts`

```bash
git add src/utils/stateMachine/smTargetCompileRunner.ts src/utils/stateMachine/smTargetCompileRunner.test.ts src/engine/targetPacks/targetPackTypes.ts src/engine/targetPacks/targetPackSchema.ts src/engine/targetPacks/targetPackSchema.test.ts
git commit -m "feat(sm): verify code with target compilers"
```

### Task 12: Orchestrate Gates and Enforce Fail-Closed Acceptance

**Files:**
- Modify: `src/utils/stateMachine/smPipelineOrchestrator.ts`
- Modify: `src/utils/stateMachine/smPipelineOrchestrator.test.ts`
- Modify: `src/utils/stateMachine/smVerificationAggregator.ts`
- Modify: `src/utils/stateMachine/smVerificationAggregator.test.ts`

**Interfaces:**
- Produces: async `runVerificationPipeline(request): Promise<VerificationBundle>` and `deriveAcceptance(bundle)`.

- [ ] **Step 1: Write failing gate-order/status truth-table tests**

Inject fake adapters. Structural/semantic failures stop generation; compile failure makes dependent runtime/sanitizer/coverage/differential NOT_RUN; mandatory NOT_RUN blocks acceptance; MC/DC N/A is allowed only outside safety; hardware can remain PENDING but is never PASS; target compilation is required for delivery.

- [ ] **Step 2: Add dependency-injected request types**

```ts
export interface SMVerificationAdapters {
  host: SMHostVerificationAdapter; coverage: SMCoverageAdapter;
  staticAnalysis: SMAnalysisAdapter | null; misra: SMAnalysisAdapter | null;
  target: SMTargetCompileAdapter;
}
export interface SMVerificationRequest {
  ir: SemanticModel; outputDirectory: string;
  vectors?: readonly SMVerificationVector[];
  adapters: SMVerificationAdapters;
}
```

- [ ] **Step 3: Implement ordered, resumable evidence writing**

Build manifest/render/write once and reuse the immutable manifest. Execute gates in dependency order. Include one evidence entry per report activity even when blocked. Atomically rewrite canonical JSON after each gate so crashes preserve truthful partial results.

- [ ] **Step 4: Implement acceptance policy and requirement matrix**

Require PASS for structural, semantic, test generation, host compile/runtime, sanitizer, differential, static, MISRA, and target compile; require measured thresholds; require MC/DC when configured. Add a test matrix for compilation, sanitizer, static/MISRA, coverage, differential, report statuses, 15 reviewed-model tests, and all acceptance bullets.

- [ ] **Step 5: Run and commit**

Run: `npx vitest run src/utils/stateMachine/smPipelineOrchestrator.test.ts src/utils/stateMachine/smVerificationAggregator.test.ts`

```bash
git add src/utils/stateMachine/smPipelineOrchestrator.ts src/utils/stateMachine/smPipelineOrchestrator.test.ts src/utils/stateMachine/smVerificationAggregator.ts src/utils/stateMachine/smVerificationAggregator.test.ts
git commit -m "feat(sm): orchestrate fail-closed verification"
```

### Task 13: Render Honest Reports From Canonical Evidence

**Files:**
- Modify: `src/utils/stateMachine/smReports.ts`
- Modify: `src/utils/stateMachine/smReports.test.ts`
- Modify: `src/features/reporting/generators/createStateMachineVerificationReport.ts`
- Modify: `src/features/reporting/generators/reportGenerators.test.ts`

**Interfaces:**
- Consumes: `VerificationBundle`; produces Markdown, JSON, and `ReportDocument` views without synthesized evidence.

- [ ] **Step 1: Write failing truthfulness/detail tests**

Assert allowed statuses, C standard, tools/versions/commands, executed-vs-static labels, uncovered details, MC/DC applicability, first divergence, safe-output calls/values, MISRA categories/deviations/suppressions, target details, hardware pending, and rejection of structural-only PASS.

- [ ] **Step 2: Remove legacy evidence defaults**

Require a bundle, or create an explicit validation-only bundle whose executable activities are NOT_RUN. Render coverage as a measured percentage or NOT RUN. Remove hard-coded differential/compilation claims.

- [ ] **Step 3: Render complete evidence sections**

Include test totals, traceability, compiler flags, sanitizers, coverage gaps, replay data, MCAL evidence, static metrics, MISRA results, target hashes, hardware status, and final acceptance checklist. Update `createStateMachineVerificationReport` to accept the same bundle.

- [ ] **Step 4: Run and commit**

Run: `npx vitest run src/utils/stateMachine/smReports.test.ts src/features/reporting/generators/reportGenerators.test.ts src/components/reporting/ReportViewerModal.test.tsx`

```bash
git add src/utils/stateMachine/smReports.ts src/utils/stateMachine/smReports.test.ts src/features/reporting/generators/createStateMachineVerificationReport.ts src/features/reporting/generators/reportGenerators.test.ts
git commit -m "feat(sm): report independent verification evidence"
```

### Task 14: Wire Public Generation, CLI, and CI Scripts

**Files:**
- Modify: `src/utils/stateMachineCodeGenerator.ts`
- Modify: `src/utils/stateMachineCodeGenerator.test.ts`
- Modify: `scripts/verify_sm_codegen.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: complete exported package and CI-safe exit code.

- [ ] **Step 1: Write failing public/CLI tests**

Assert normal export includes the verification package, explicit legacy mode stays flat, invalid configuration blocks export, initial evidence is truthful, CLI exits 0 only on acceptance, and FAIL/mandatory NOT_RUN exits 1.

- [ ] **Step 2: Wire public generation**

Pass resolved configuration into manifest construction and request `includeVerificationPackage: true` for standard exports. External tools run only through the explicit async pipeline, never from a pure renderer.

- [ ] **Step 3: Upgrade CLI and scripts**

Accept `--model`, `--output`, and `--target`; print every activity independently and final reasons; never print PASS before evidence exists. Add:

```json
"test:sm:verification": "vitest run src/utils/stateMachine/smTestManifest.test.ts src/utils/stateMachine/smTestPlanBuilder.test.ts src/utils/stateMachine/smCTestRuntimeRenderer.test.ts src/utils/stateMachine/smCTestSuiteRenderer.test.ts src/utils/stateMachine/smCHarness.test.ts src/utils/stateMachine/smCoverageRunner.test.ts src/utils/stateMachine/smDifferential.test.ts src/utils/stateMachine/smAnalysisRunner.test.ts src/utils/stateMachine/smTargetCompileRunner.test.ts src/utils/stateMachine/smPipelineOrchestrator.test.ts src/utils/stateMachine/smReports.test.ts",
"verify:sm:codegen": "tsx scripts/verify_sm_codegen.ts"
```

- [ ] **Step 4: Run and commit**

Run: `npm run test:sm:verification && npx tsc --noEmit`

```bash
git add src/utils/stateMachineCodeGenerator.ts src/utils/stateMachineCodeGenerator.test.ts scripts/verify_sm_codegen.ts package.json
git commit -m "feat(sm): expose complete code verification"
```

### Task 15: Prove the Reviewed Model End to End and Document Operations

**Files:**
- Create: `src/utils/stateMachine/smGeneratedVerification.e2e.test.ts`
- Modify: `docs/CODEGEN_MCU_VERIFICATION_GATE.md`
- Modify: `docs/STATE_MACHINE_CODE_GENERATION_CORRECTIONS.md`

**Interfaces:**
- Consumes: completed public pipeline and reviewed fixture; produces executable acceptance evidence and operator documentation.

- [ ] **Step 1: Write the real end-to-end test**

Generate the reviewed model and run real host compile/runtime, ASan/UBSan, coverage, and differential gates. Assert all 15 minimum checks exactly. Use normalized fake static/MISRA/target adapters only for an acceptance-policy test; a separate real-tools test must report unavailable tools as NOT_RUN.

- [ ] **Step 2: Run and fix requirement gaps at their owning modules**

Run: `npx vitest run src/utils/stateMachine/smGeneratedVerification.e2e.test.ts --reporter=verbose`

Expected: PASS. If it fails, add the focused failing test in the owning module, implement there, rerun focused test, then rerun E2E. Never weaken E2E assertions or patch the report.

- [ ] **Step 3: Document operator workflow**

Document configuration, package layout, prerequisites, analyzer adapters, target selection, CLI, statuses, evidence paths, target delivery gate, hardware PENDING semantics, and the ISO 26262/IEC 61508 non-certification disclaimer.

- [ ] **Step 4: Run the complete verification set**

```bash
npm run test:sm:verification
npx vitest run src/utils/stateMachine src/utils/stateMachineCodeGenerator.test.ts src/utils/stateMachineCodeGenerator.golden.test.ts --reporter=dot
npx tsc --noEmit
npm run build
```

Expected: all tests PASS, typecheck succeeds, and production build completes.

- [ ] **Step 5: Inspect a real generated package**

Run: `npm run verify:sm:codegen -- --model adia_project_unified_adia_corrected.json --output generated-verification-review`

Expected: every activity prints independently; unavailable mandatory tools show NOT_RUN and reject acceptance; required test files and evidence exist. Remove or exclude this disposable output according to repository policy; do not commit it.

- [ ] **Step 6: Commit**

```bash
git add src/utils/stateMachine/smGeneratedVerification.e2e.test.ts docs/CODEGEN_MCU_VERIFICATION_GATE.md docs/STATE_MACHINE_CODE_GENERATION_CORRECTIONS.md
git commit -m "test(sm): prove generated verification acceptance"
```

---

## Requirements-to-Task Coverage

| Requirement group | Implementing tasks | Executed proof |
|---|---:|---|
| Purpose and no structural-only success | 7, 12, 13 | Aggregator truth table and report truthfulness tests |
| TGEN-REQ-001–005 | 2–5, 14 | Manifest inventory, file-set, traceability, and public export tests |
| TEST-REQ-001–004 | 1, 7, 8, 11–13 | Strict command, standard, target, and NOT_RUN tests |
| TEST-INIT-001–004 | 3, 5, 6 | Reviewed-fixture generated/compiled tests |
| TEST-TRANS-001–007 | 2, 3, 5, 6 | Guard, priority, per-layer, coverage, and boundary tests |
| TEST-ACT-001–005 | 3, 5, 6 | Action count/order and self-transition tests |
| TEST-TIME-001–007 | 1–3, 6 | 449/450/500/550/551, policy, reset, and saturation tests |
| TEST-SAFE-001–008 | 1, 3–6, 8 | MCAL safe values/calls, latch, corruption, repeat, watchdog, sanitizer tests |
| TEST-IO-001–006 | 1, 3–6 | Per-mapping conversion/order/count/value tests |
| TEST-RESET-001–004 | 1, 3, 5, 6 | Normal/fault/null reset and action-count tests |
| TEST-ROB-001–005 | 3–6, 8 | Invalid arguments/indices, sanitizers, initialization, long-run tests |
| Hierarchy and history | 3, 5, 6 | Conditional fixture tests and NOT_APPLICABLE assertions |
| TEST-STATIC-001–004 | 10, 13 | Analyzer normalization, identifier collision, metrics, report tests |
| TEST-COV-001–005 | 2, 3, 9, 12, 13 | Instrumented thresholds, MC/DC obligations, uncovered detail tests |
| TEST-DIFF-001–003 | 3, 9, 12, 15 | Shared vectors, full cycle observations, first mismatch, E2E |
| Report status table | 7, 12, 13 | Allowed-status and no-inference report tests |
| Reviewed-model tests 1–15 | 3, 6, 8, 9, 15 | Real compiled E2E acceptance fixture |
| Final acceptance criteria | 8–15 | Fail-closed policy matrix and full verification run |

---

## Final Verification Checklist

- [ ] `git diff --check` has no errors.
- [ ] Focused verification and full state-machine suites pass.
- [ ] Typecheck and production build pass.
- [ ] Package contains every required independent test and MCAL stub.
- [ ] Strict host command contains the configured standard and all required flags.
- [ ] ASan and UBSan executed with no findings.
- [ ] Coverage is instrumented evidence and includes uncovered details.
- [ ] Differential comparison includes every required per-cycle field.
- [ ] MCAL evidence proves safe-output calls and actual safe values.
- [ ] Static/MISRA evidence includes tool/version/rules/deviations/suppressions.
- [ ] Target compilation is PASS before embedded delivery acceptance.
- [ ] NOT_RUN, NOT_APPLICABLE, and PENDING are used only with their defined meanings.
- [ ] Structural-only validation cannot yield accepted verification.
