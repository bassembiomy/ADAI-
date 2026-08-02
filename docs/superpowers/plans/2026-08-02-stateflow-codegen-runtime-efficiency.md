# Stateflow-Like Code Generation Runtime Efficiency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate compact, deterministic C99 whose logical timing matches simulation, whose reports contain model-scoped evidence, and whose optional host verification is performed through a secured Electron boundary.

**Architecture:** Keep semantic model construction and C rendering pure. Normalize accepted scheduler jitter to one fixed logical tick in the semantic runtime and generated C, render one X-Bridges solver-substep helper behind a bounded C loop, and pass immutable evidence into reports. A separate least-privilege Electron verifier may compile and smoke-test generated files; it cannot manufacture reachability or differential evidence.

**Tech Stack:** TypeScript 5.4, Vitest 4, C99/GCC, React 18, Electron 43, CommonJS main/preload security boundary.

## Global Constraints

- Generated code is ISO C99 with no dynamic allocation, recursion, or unbounded loops.
- `SM_Step(instance, delta_ms)` uses `delta_ms` only for scheduler-tolerance validation; accepted calls advance exactly `SM_TICK_MS`.
- Simulation and generated C must preserve Stateflow-like outer-transition, during-action, inner-transition, and child-execution order.
- Inport/Outport mappings, fixed/float conversion, numeric faults, Euler/RK4 solvers, history, parallel states, and internal transitions must not regress.
- Existing public generated-C API signatures and UUID-derived symbols remain stable.
- Reports may claim PASS only from explicit evidence for that exact validation layer.
- Electron keeps `contextIsolation: true`, `nodeIntegration: false`, sandboxing, explicit IPC allowlists, RLS checks, bounded payloads, contained temporary paths, and `spawn(..., { shell: false })`.
- Do not stage or modify unrelated existing workspace changes.

---

### Task 1: Define and apply the fixed logical-tick contract in simulation

**Files:**
- Create: `src/utils/stateMachine/smTiming.ts`
- Create: `src/utils/stateMachine/smTiming.test.ts`
- Modify: `src/utils/stateMachine/smInterpreter.ts:20-27,800-815,985-1008`
- Modify: `src/utils/stateMachine/smInterpreter.test.ts:575-590`
- Modify: `src/utils/stateMachine/smInterpreter.parallel-history.test.ts:324-334`
- Modify: `src/utils/stateMachine/smStandaloneRuntime.ts`
- Modify: `src/utils/stateMachine/smStandaloneRuntime.test.ts`

**Interfaces:**
- Consumes: positive integer `tickMs` from `SemanticModel` and observed finite `elapsedMs` from the simulation caller.
- Produces: `normalizeLogicalTick(tickMs, observedMs): LogicalTickResult` and `snapshotRuntime(runtime): SemanticTraceFrame`.

- [ ] **Step 1: Write failing timing-contract tests**

```ts
import { describe, expect, it } from 'vitest';
import { normalizeLogicalTick, timingToleranceMs } from './smTiming';

describe('fixed logical tick', () => {
  it('normalizes accepted jitter to one configured tick', () => {
    expect(timingToleranceMs(500)).toBe(50);
    expect(normalizeLogicalTick(500, 450)).toEqual({
      kind: 'accepted', observedMs: 450, logicalMs: 500,
    });
    expect(normalizeLogicalTick(500, 550)).toEqual({
      kind: 'accepted', observedMs: 550, logicalMs: 500,
    });
  });

  it('separates invalid elapsed values from out-of-tolerance jitter', () => {
    expect(normalizeLogicalTick(500, -1).kind).toBe('invalid');
    expect(normalizeLogicalTick(500, Number.NaN).kind).toBe('invalid');
    expect(normalizeLogicalTick(500, 449)).toEqual({
      kind: 'out-of-tolerance', observedMs: 449, logicalMs: 500,
    });
  });
});
```

Add an interpreter test that performs two accepted `tickMs + 1` calls and
expects the active-state timer to equal exactly `2 * tickMs`. Add a snapshot
test that proves `snapshotRuntime()` does not execute transitions, actions,
timers, or X-Bridges.

- [ ] **Step 2: Run the new tests and verify RED**

Run:

```bash
npx vitest run src/utils/stateMachine/smTiming.test.ts src/utils/stateMachine/smInterpreter.test.ts src/utils/stateMachine/smInterpreter.parallel-history.test.ts --reporter=verbose
```

Expected: FAIL because `smTiming.ts`, `normalizeLogicalTick`, and
`snapshotRuntime` do not exist and jitter still increments actual elapsed time.

- [ ] **Step 3: Implement the pure timing contract**

```ts
export type LogicalTickResult =
  | { kind: 'accepted'; observedMs: number; logicalMs: number }
  | { kind: 'out-of-tolerance'; observedMs: number; logicalMs: number }
  | { kind: 'invalid'; observedMs: number; logicalMs: number };

export const timingToleranceMs = (tickMs: number): number =>
  Math.max(Math.floor(tickMs / 10), 1);

export const normalizeLogicalTick = (
  tickMs: number,
  observedMs: number,
): LogicalTickResult => {
  if (!Number.isInteger(tickMs) || tickMs <= 0) {
    throw new RangeError(`tickMs must be a positive integer; received ${tickMs}`);
  }
  if (!Number.isFinite(observedMs) || observedMs < 0) {
    return { kind: 'invalid', observedMs, logicalMs: tickMs };
  }
  return Math.abs(observedMs - tickMs) <= timingToleranceMs(tickMs)
    ? { kind: 'accepted', observedMs, logicalMs: tickMs }
    : { kind: 'out-of-tolerance', observedMs, logicalMs: tickMs };
};
```

- [ ] **Step 4: Apply normalization to `stepRuntime` and add snapshots**

Extend `SemanticRuntimeError['code']` with `'TIMING'`. In `stepRuntime`, keep
the existing invalid-value error, latch `TIMING` and enter the fault
configuration for out-of-tolerance calls, and pass only `logicalMs` to
`incrementActiveTimers`:

```ts
const timing = normalizeLogicalTick(runtime.ir.tickMs, elapsedMs);
if (timing.kind === 'invalid') {
  runtime.error = {
    code: 'INVALID_ELAPSED_MS',
    message: `elapsed time must be finite and non-negative; received ${elapsedMs}`,
  };
  return createTraceFrame(context, elapsedMs);
}
if (timing.kind === 'out-of-tolerance') {
  runtime.error = {
    code: 'TIMING',
    message: `observed ${elapsedMs} ms outside ${runtime.ir.tickMs} ms tick tolerance`,
  };
  enterFaultConfiguration(context);
  return createTraceFrame(context, elapsedMs);
}
incrementActiveTimers(runtime, timing.logicalMs);
```

Add and export:

```ts
export const snapshotRuntime = (runtime: SemanticRuntime): SemanticTraceFrame =>
  createTraceFrame({ runtime, actions: [] }, 0);
```

Replace the history test's observational `stepRuntime(runtime, 0)` call with
`snapshotRuntime(runtime)`. Re-export the snapshot API from
`smStandaloneRuntime.ts` and include it in `ADIAStateMachineRuntime`.

- [ ] **Step 5: Run focused simulation tests and verify GREEN**

Run:

```bash
npx vitest run src/utils/stateMachine/smTiming.test.ts src/utils/stateMachine/smInterpreter.test.ts src/utils/stateMachine/smInterpreter.parallel-history.test.ts src/utils/stateMachine/smStandaloneRuntime.test.ts --reporter=dot
```

Expected: all selected tests PASS; accepted jitter increments fixed logical
time and snapshotting has no behavioral side effects.

- [ ] **Step 6: Commit Task 1**

```bash
git add src/utils/stateMachine/smTiming.ts src/utils/stateMachine/smTiming.test.ts src/utils/stateMachine/smInterpreter.ts src/utils/stateMachine/smInterpreter.test.ts src/utils/stateMachine/smInterpreter.parallel-history.test.ts src/utils/stateMachine/smStandaloneRuntime.ts src/utils/stateMachine/smStandaloneRuntime.test.ts
git commit -m "fix(runtime): normalize accepted jitter to logical ticks"
```

---

### Task 2: Make generated C use the same logical tick

**Files:**
- Modify: `src/utils/stateMachine/smCGenerator.ts:1451-1484`
- Modify: `src/utils/stateMachine/smCGenerator.test.ts:820-845`
- Modify: `src/utils/stateMachine/smFixtures.ts:620-655`
- Modify: `src/utils/stateMachine/smDifferential.test.ts`
- Modify: `src/utils/stateMachine/smCHarness.ts:330-350,480-510`

**Interfaces:**
- Consumes: `SM_TICK_MS`, observed `delta_ms`, and the Task 1 interpreter contract.
- Produces: C state timers that advance exactly one logical tick per accepted call and differential fixtures that exercise jitter explicitly.

- [ ] **Step 1: Write failing generated-source and compiled-runtime tests**

Extend the existing jitter test harness:

```c
(void)SM_Step(&inst, SM_TICK_MS + 1U);
printf("%u\n", (unsigned)inst.state_timers[SM_ST_A_IDX]);
(void)SM_Step(&inst, SM_TICK_MS - 1U);
printf("%u\n", (unsigned)inst.state_timers[SM_ST_A_IDX]);
```

Assert the output is exactly `SM_TICK_MS` then `2 * SM_TICK_MS`. Also assert
the source contains `SM_TICK_MS > (UINT32_MAX -` and does not contain
`delta_ms > (UINT32_MAX - instance->state_timers`.

Add a `timing-jitter-normalized` differential fixture with accepted jittered
steps and a temporal transition. TypeScript and C traces must agree on timers,
transition sequence, state configuration, and data.

- [ ] **Step 2: Run timing and differential tests and verify RED**

Run:

```bash
npx vitest run src/utils/stateMachine/smCGenerator.test.ts -t "jitter" --reporter=verbose
npx vitest run src/utils/stateMachine/smDifferential.test.ts -t "timing-jitter-normalized" --reporter=verbose
```

Expected: FAIL because generated C increments timers by `delta_ms`.

- [ ] **Step 3: Render fixed logical timer increments**

Replace only the timer accumulation operand in `renderCoreSource`:

```ts
'            if (SM_TICK_MS > (UINT32_MAX - instance->state_timers[state_index])) {',
'                instance->state_timers[state_index] = UINT32_MAX;',
'            } else {',
'                instance->state_timers[state_index] += SM_TICK_MS;',
'            }',
```

Keep the existing overflow-safe tolerance check before validation, timers, and
execution. Add a generated comment stating that `delta_ms` is observed physical
jitter and `SM_TICK_MS` is behavioral logical time.

- [ ] **Step 4: Align differential fault mapping**

Update `runInterpreterTrace` and the C harness parser so an interpreter
`TIMING` error maps to `SM_ERR_TIMING`. Do not normalize traces after execution;
both runtimes must produce matching values directly.

Use one explicit mapping shared by differential assertions:

```ts
const runtimeErrorToCError = (
  error: SemanticRuntimeError | null,
): 'SM_ERR_NONE' | 'SM_ERR_TIMING' | 'SM_ERR_RUNTIME' | 'SM_ERR_XBRIDGES_NUMERIC' => {
  if (error === null) return 'SM_ERR_NONE';
  if (error.code === 'TIMING') return 'SM_ERR_TIMING';
  if (error.code === 'XBRIDGES_NUMERIC') return 'SM_ERR_XBRIDGES_NUMERIC';
  return 'SM_ERR_RUNTIME';
};
```

Keep the existing generated-C trace parser authoritative for the C enum token;
compare its parsed token with `runtimeErrorToCError(frame.error)`.

- [ ] **Step 5: Run timing, state-machine parity, and strict C tests**

Run:

```bash
npx vitest run src/utils/stateMachine/smCGenerator.test.ts src/utils/stateMachine/smDifferential.test.ts -t "jitter|temporal-exact-boundary|T14-C99-CORE-DIRECT" --reporter=verbose
```

Expected: selected tests PASS with strict C99 compilation and equal traces.

- [ ] **Step 6: Commit Task 2**

```bash
git add src/utils/stateMachine/smCGenerator.ts src/utils/stateMachine/smCGenerator.test.ts src/utils/stateMachine/smFixtures.ts src/utils/stateMachine/smDifferential.test.ts src/utils/stateMachine/smCHarness.ts
git commit -m "fix(codegen): use one fixed logical time base"
```

---

### Task 3: Replace X-Bridges source unrolling with a bounded C loop

**Files:**
- Modify: `src/utils/stateMachine/xbCGenerator.ts:2183-2310`
- Modify: `src/utils/stateMachine/xbCGenerator.test.ts`
- Modify: `src/utils/stateMachine/smDifferential.test.ts`

**Interfaces:**
- Consumes: validated `XBSemanticModel.solver.substepsPerTick` and the existing `renderSolverSubstep` operation order.
- Produces: `SM_XB_<STATE>_SUBSTEPS_PER_TICK`, one static `SM_XB_<STATE>_SolverSubstep()` helper, and one bounded loop in `SM_XB_<STATE>_Step()`.

- [ ] **Step 1: Write failing compactness tests**

Create otherwise-identical semantic models with 1 and 50 substeps. Assert:

```ts
expect(countOccurrences(core50, 'xb_result_1_0 =')).toBe(1);
expect(core50).toContain(
  'for (xb_substep = 0U; xb_substep < SM_XB_CONTROLLER_SUBSTEPS_PER_TICK; ++xb_substep)',
);
expect(header50).toContain('#define SM_XB_CONTROLLER_SUBSTEPS_PER_TICK 50U');
expect(Math.abs(core50.length - core1.length)).toBeLessThan(128);
```

Compile and run both models and compare their results with the interpreter.
Add stateful Euler, RK4, schedule-counter, numeric-fault rollback, Inport, and
Outport cases with more than one substep.

- [ ] **Step 2: Run compactness tests and verify RED**

Run:

```bash
npx vitest run src/utils/stateMachine/xbCGenerator.test.ts -t "bounded substep loop" --reporter=verbose
```

Expected: FAIL because the TypeScript renderer emits 50 operation graphs.

- [ ] **Step 3: Render the state-specific bound and helper**

Add a macro to `renderXBHeader`:

```ts
`#define SM_XB_${stateSuffix(state)}_SUBSTEPS_PER_TICK ${xb.solver.substepsPerTick}U`,
```

Add `SemanticState` to the existing type-only import from `smSemanticModel`;
do not introduce a runtime dependency for this renderer helper.

Render the existing canonical substep body once:

```ts
const renderSolverSubstepFunction = (
  state: SemanticState,
  xb: XBSemanticModel,
  layout: XBStorageLayout,
  member: string,
): string => lines(
  `static void SM_XB_${stateSuffix(state)}_SolverSubstep(ADIA_Instance_t *instance)`,
  '{',
  ...renderSolverSubstep(state, xb, layout, member),
  '}',
);
```

Ensure `renderSolverSubstep` returns only function-body statements, not an
extra anonymous compound block that changes declarations or transaction scope.

- [ ] **Step 4: Replace the generation-time loop with generated C control flow**

Delete:

```ts
for (let substep = 0; substep < xb.solver.substepsPerTick; substep++) {
  stepLines.push(...renderSolverSubstep(state, xb, layout, member));
}
```

Emit:

```ts
stepLines.push(
  '    uint32_t xb_substep;',
  `    for (xb_substep = 0U; xb_substep < SM_XB_${stateSuffix(state)}_SUBSTEPS_PER_TICK; ++xb_substep) {`,
  `        SM_XB_${stateSuffix(state)}_SolverSubstep(instance);`,
  '    }',
);
```

Place mapped-input sampling and operation-fault reset before the loop; keep
fault synchronization and mapped-output commitment after the loop.

- [ ] **Step 5: Run the full X-Bridges interpreter/C gates**

Run:

```bash
npx vitest run src/utils/stateMachine/xbCGenerator.test.ts src/utils/stateMachine/xbInterpreter.test.ts src/utils/stateMachine/smDifferential.test.ts --reporter=dot
```

Expected: every X-Bridges test PASS; generated source size is independent of
substep count and TypeScript/C traces remain equal.

- [ ] **Step 6: Commit Task 3**

```bash
git add src/utils/stateMachine/xbCGenerator.ts src/utils/stateMachine/xbCGenerator.test.ts src/utils/stateMachine/smDifferential.test.ts
git commit -m "perf(codegen): loop over X-Bridges solver substeps"
```

---

### Task 4: Produce model-scoped metrics and state traceability

**Files:**
- Modify: `src/utils/stateMachine/smReports.ts:1-145,230-335`
- Modify: `src/utils/stateMachine/smReports.test.ts`
- Modify: `src/utils/stateMachine/smCGenerator.ts:807-960`
- Modify: `src/utils/stateMachine/smCGenerator.test.ts`

**Interfaces:**
- Consumes: validated semantic states, operation types, `XB_CAPABILITIES`, and solver bounds.
- Produces: `operationEvaluationsPerTick`, used-only unsupported capability messages, report traceability rows, and safe C comments.

- [ ] **Step 1: Write failing report-scope tests**

For a model using only `Inport`, `Constant`, `Sum`, and `Outport`, assert:

```ts
expect(report.xBridges.unsupportedCapabilities).toEqual([]);
expect(report.xBridges.operationEvaluationsPerTick).toBe(200);
expect(testing).toContain('| State name | Model ID | C enum | Layer | X-Bridges |');
expect(testing).toContain('| Controller | controller | SM_ST_CONTROLLER | root | yes |');
expect(testing).not.toContain('LMS_ADAPTIVE_FILTER');
```

Add a second fixture that actually uses an unsupported operation and assert
that only its reason appears. Add a model name containing `*/` and newlines;
assert generated comments cannot terminate early or create a directive.

- [ ] **Step 2: Run report and rendering tests and verify RED**

Run:

```bash
npx vitest run src/utils/stateMachine/smReports.test.ts src/utils/stateMachine/smCGenerator.test.ts -t "capabilit|traceability|comment" --reporter=verbose
```

Expected: FAIL because reports enumerate the full global registry and contain
no traceability table or operation-evaluation metric.

- [ ] **Step 3: Filter capabilities by used operation types**

Build one sorted set while walking states:

```ts
const usedOperationTypes = new Set<string>();
// Inside executionOrder traversal:
usedOperationTypes.add(operation.type);
operationEvaluationsPerTick += xb.solver.substepsPerTick;
```

Then derive unsupported entries only from that set:

```ts
const unsupportedCapabilities = [...usedOperationTypes]
  .filter((type) => XB_CAPABILITIES[type]?.codegen !== true)
  .sort()
  .map((type) => `${type}: ${XB_CAPABILITIES[type]?.reason ?? 'Not supported.'}`);
```

Add `operationEvaluationsPerTick: number` to `XBridgesReport` and render it in
both generated reports.

- [ ] **Step 4: Render stable state traceability without changing symbols**

Add report rows from states sorted by `activityIndex`. Escape Markdown pipes
and line breaks. Add a C-comment helper:

```ts
const cCommentText = (value: string): string => value
  .replaceAll('*/', '* /')
  .replace(/[\r\n]+/g, ' ');

const stateTraceComment = (state: SemanticState): string =>
  `/* State: ${cCommentText(state.name)} | Model ID: ${cCommentText(state.id)} | C enum: ${state.enumName} */`;
```

Emit this comment before state macros and each Entry/During/Exit declaration
and definition. Do not rename enums or functions.

- [ ] **Step 5: Run report, generator, and injection-safety tests**

Run:

```bash
npx vitest run src/utils/stateMachine/smReports.test.ts src/utils/stateMachine/smCGenerator.test.ts src/utils/stateMachine/smCExpressions.test.ts --reporter=dot
```

Expected: all selected tests PASS; unused catalogue entries are absent and
model-owned names cannot escape comments or Markdown cells.

- [ ] **Step 6: Commit Task 4**

```bash
git add src/utils/stateMachine/smReports.ts src/utils/stateMachine/smReports.test.ts src/utils/stateMachine/smCGenerator.ts src/utils/stateMachine/smCGenerator.test.ts
git commit -m "feat(reports): scope metrics and add state traceability"
```

---

### Task 5: Generate a host smoke harness and preserve evidence boundaries

**Files:**
- Create: `src/utils/stateMachine/smHostHarness.ts`
- Create: `src/utils/stateMachine/smHostHarness.test.ts`
- Modify: `src/utils/stateMachine/smReports.ts`
- Modify: `src/utils/stateMachine/smReports.test.ts`
- Modify: `src/utils/stateMachine/smCGenerator.ts:28-45,1546-1590`
- Modify: `src/utils/stateMachine/smCGenerator.test.ts`
- Modify: `src/utils/stateMachineCodeGenerator.ts:2906-2985`
- Modify: `src/utils/stateMachineCodeGenerator.test.ts`

**Interfaces:**
- Consumes: `SemanticModel`, generated implementation files, and immutable `VerificationEvidence` supplied by a trusted caller.
- Produces: `renderHostSmokeHarness(ir): string`, `CGeneratorOptions.includeHostHarness`, `CGeneratorOptions.verificationEvidence`, and a separate `dynamicReachability` evidence field.

- [ ] **Step 1: Write failing evidence-isolation tests**

Extend `VerificationEvidence` with `dynamicReachability`. Assert:

```ts
const smokeOnly = {
  ...DEFAULT_VERIFICATION_EVIDENCE,
  hostCompile: 'pass' as const,
  hostRuntime: 'pass' as const,
};
const rendered = renderTestingReport(analysis, smokeOnly, ir);
expect(rendered).toContain('Execution mode: DYNAMIC_EXECUTION_VERIFIED');
expect(rendered).toContain('Dynamic executable reachability: NOT RUN');
expect(rendered).toContain('Compiled X-Bridges execution: NOT RUN');
```

Also assert that only `dynamicReachability: 'pass'` upgrades the reachability
line and only host compile + host runtime + differential PASS upgrades compiled
X-Bridges execution.

- [ ] **Step 2: Write failing host-harness tests**

Generate a model with OR, AND, history storage, X-Bridges, and trace enabled.
Assert the harness:

```c
ADIA_Instance_t instance;
(void)memset(&instance, 0xA5, sizeof(instance));
if (SM_Init(&instance) != SM_ERR_NONE) return 10;
if (SM_Validate_State_Consistency(&instance) != SM_ERR_NONE) return 11;
if (SM_Step(&instance, SM_TICK_MS) != SM_ERR_NONE) return 12;
if (SM_WriteOutputs(&instance) != SM_ERR_NONE) return 13;
if (SM_Reset(&instance) != SM_ERR_NONE) return 14;
if (SM_Validate_State_Consistency(&instance) != SM_ERR_NONE) return 15;
```

Compile and run it with production and `SM_TRACE_ENABLED` variants using the
existing test workspace helper.

- [ ] **Step 3: Run the new tests and verify RED**

Run:

```bash
npx vitest run src/utils/stateMachine/smHostHarness.test.ts src/utils/stateMachine/smReports.test.ts src/utils/stateMachineCodeGenerator.test.ts --reporter=verbose
```

Expected: FAIL because the harness, dynamic-reachability field, and generator
options do not exist.

- [ ] **Step 4: Implement the deterministic smoke harness**

Implement `renderHostSmokeHarness` using only fixed return codes, generated
headers, `memset`, and public state-machine/safety APIs. Include MCAL test stubs
as a separate generated file through existing `includeTestShims` behavior.
Do not add target hardware calls, random stimuli, sleeps, or dynamic memory.

- [ ] **Step 5: Plumb immutable evidence into reports**

Extend options:

```ts
export interface CGeneratorOptions {
  includeTestShims?: boolean;
  includeHostHarness?: boolean;
  reportSourceFiles?: readonly GeneratedCFile[];
  verificationEvidence?: VerificationEvidence;
}
```

When requested, append `sm_host_test.c` to files used by the verifier. Pass
`options.verificationEvidence` to `renderSemanticTestingReport`; default to
`DEFAULT_VERIFICATION_EVIDENCE`. Update `generateMISRACCode` options with the
same two fields and pass them through without mutation.

- [ ] **Step 6: Correct reachability evidence semantics**

Change `dynamicReachabilityLabel` to read only
`evidence.dynamicReachability`. Keep execution mode based on host
compile/runtime. Keep compiled X-Bridges based on host compile/runtime plus
differential. No inference may substitute one evidence layer for another.

- [ ] **Step 7: Run host harness, report, and facade tests**

Run:

```bash
npx vitest run src/utils/stateMachine/smHostHarness.test.ts src/utils/stateMachine/smReports.test.ts src/utils/stateMachine/smCGenerator.test.ts src/utils/stateMachineCodeGenerator.test.ts --reporter=dot
```

Expected: all selected tests PASS and smoke-only evidence remains scoped.

- [ ] **Step 8: Commit Task 5**

```bash
git add src/utils/stateMachine/smHostHarness.ts src/utils/stateMachine/smHostHarness.test.ts src/utils/stateMachine/smReports.ts src/utils/stateMachine/smReports.test.ts src/utils/stateMachine/smCGenerator.ts src/utils/stateMachine/smCGenerator.test.ts src/utils/stateMachineCodeGenerator.ts src/utils/stateMachineCodeGenerator.test.ts
git commit -m "feat(codegen): add scoped host verification artifacts"
```

---

### Task 6: Add a secured Electron host-verification boundary

**Files:**
- Create: `src/security/generatedCodeVerifier.cjs`
- Create: `src/security/generatedCodeVerifier.test.cjs`
- Modify: `src/security/roleSecurity.cjs:32-90`
- Modify: `src/security/roleSecurity.test.cjs`
- Modify: `src/main.cjs`
- Modify: `src/preload.cjs:1-20`
- Modify: `src/App.tsx:13345-13425`
- Modify: `package.json`

**Interfaces:**
- Consumes: renderer payload `{ files: Array<{name:string;content:string}> }` containing generator-owned filenames only.
- Produces: IPC result `{ success, evidence, compiler, stdout, stderr, error? }`, where logs are bounded and evidence defaults to not-run/fail closed.

- [ ] **Step 1: Write failing verifier security tests**

Create CommonJS tests that reject:

```js
['../escape.c', 'x/escape.c', 'x\\escape.c', 'sm_core.c\0.exe'];
```

Also reject more than 32 files, any content over 2 MiB, total content over
16 MiB, duplicate filenames, unknown filenames, non-string content, and a
second invocation while one verification is active. Assert the compiler
launcher receives a fixed command, fixed argument array, `shell: false`, a
contained temporary cwd, a 30-second timeout, and no renderer-supplied flags.

- [ ] **Step 2: Run verifier and RLS tests and verify RED**

Run:

```bash
node src/security/generatedCodeVerifier.test.cjs
node src/security/roleSecurity.test.cjs
```

Expected: FAIL because the verifier and `codegen.verify` permission do not
exist.

- [ ] **Step 3: Implement the isolated verifier module**

Export constants and one async function:

```js
const ALLOWED_FILES = new Set([
  'sm_config.h', 'sm_core.h', 'sm_core.c', 'sm_safety.h', 'sm_safety.c',
  'sm_user_logic.h', 'sm_user_logic.c', 'mcal_dio.h',
  'mcal_dio_test_stubs.c', 'sm_xbridges.h', 'sm_xbridges.c',
  'sm_host_test.c',
]);

async function verifyGeneratedCode(payload, dependencies) {
  // Validate bounded payload, create contained fs.mkdtemp directory,
  // write allowlisted basenames, spawn gcc twice with fixed arrays,
  // run the smoke executable, bound output, and remove the temp directory.
}
```

Use `path.basename(name) === name`, `path.resolve` containment with a trailing
separator, `fs.mkdtemp`, `spawn` with `shell: false`, process termination on
timeout/output overflow, and `fs.rm(..., { recursive: true, force: true })` only
for the verified temporary directory created by this invocation.

- [ ] **Step 4: Add least-privilege IPC and RLS wiring**

Add `codegen.verify` with minimum role `ENGINEER`. Add exactly
`sm-verify-generated-c` to `ALLOWED_INVOKE_CHANNELS`. Register one
`ipcMain.handle` that checks permission, rate-limits/concurrency-limits the
request, validates the result shape, records an audit event without source
contents, and calls the isolated verifier.

- [ ] **Step 5: Integrate verification into desktop generation**

In `App.generateCode`:

1. generate temporary artifacts with `includeHostHarness: true` and
   `includeTestShims: true`;
2. if the allowlisted Electron IPC bridge exists, invoke
   `sm-verify-generated-c` with those artifacts;
3. construct evidence with host compile/runtime PASS only on exact verifier
   success; preserve differential, dynamic reachability, embedded compile, and
   target hardware as NOT RUN/PENDING;
4. regenerate final export artifacts without the host harness and with that
   evidence;
5. on missing compiler, browser mode, timeout, malformed response, or failure,
   export an honestly labeled static/failed report and show a user warning;
6. never append an unverified structural-check PASS after a failed host gate.

Update the existing package-level security gate so the new boundary cannot be
omitted from CI or release builds:

```json
"test:security": "node src/security/inputValidator.test.cjs && node src/security/roleSecurity.test.cjs && node src/security/generatedCodeVerifier.test.cjs"
```

- [ ] **Step 6: Run security, codegen, and TypeScript tests**

Run:

```bash
node src/security/generatedCodeVerifier.test.cjs
npm run test:security
npx vitest run src/utils/stateMachineCodeGenerator.test.ts src/utils/stateMachine/smReports.test.ts --reporter=dot
npx tsc --noEmit
```

Expected: all commands exit 0; malicious filenames/oversized payloads are
rejected and no new IPC channel is exposed without validation and RLS.

- [ ] **Step 7: Commit Task 6**

```bash
git add src/security/generatedCodeVerifier.cjs src/security/generatedCodeVerifier.test.cjs src/security/roleSecurity.cjs src/security/roleSecurity.test.cjs src/main.cjs src/preload.cjs src/App.tsx package.json
git commit -m "feat(electron): verify generated C through secured IPC"
```

---

### Task 7: Prove whole-model parity and document the MCU handoff

**Files:**
- Modify: `src/utils/stateMachine/smDifferential.test.ts`
- Modify: `src/utils/stateMachine/smXBridgesAppIntegration.test.ts`
- Modify: `src/utils/stateMachine/smReports.test.ts`
- Modify: `src/generated/stateMachineRuntimeBundle.ts` using `npm run build:sm-runtime`
- Modify: `docs/XBRIDGES_EMBEDDED_CODEGEN.md`
- Create: `docs/CODEGEN_MCU_VERIFICATION_GATE.md`

**Interfaces:**
- Consumes: Tasks 1-6 generator, runtime, report, harness, and verification interfaces.
- Produces: one release gate proving compact 50-substep output, fixed-tick parity, boundary mappings, strict C compilation, and honest evidence labels.

- [ ] **Step 1: Add the generated-package regression model**

Build a three-state fixture equivalent to the reviewed package:

- 500 ms state-machine tick;
- one X-Bridges state with 10 ms Euler step and 50 substeps;
- scalar `x` mapped through Inport → Sum(+1) → Outport;
- State 2 → X-Bridges when `x == 1`;
- X-Bridges → State 3 when `x >= 2`;
- State 3 → State 2 when `x >= 2`.

Assert TypeScript and compiled C produce:

```text
init: State 2, x=0
input x=1: X-Bridges, x=1
next logical tick: X-Bridges, x=2
next logical tick: State 3, x=2
next logical tick: State 2, x=2
```

Use accepted positive and negative jitter in the compiled-C scenario and exact
logical ticks in expected state timers. Assert the generated core contains one
operation graph and the bounded 50-iteration loop.

- [ ] **Step 2: Run the package regression and verify GREEN**

Run:

```bash
npx vitest run src/utils/stateMachine/smXBridgesAppIntegration.test.ts src/utils/stateMachine/smDifferential.test.ts -t "50-substep generated package" --reporter=verbose
```

Expected: both selected TypeScript/application and compiled-C gates PASS.

- [ ] **Step 3: Document the integration and evidence contract**

Document:

- `SM_ReadInputs` → `SM_Step(instance, observed_delta_ms)` → `SM_WriteOutputs`;
- accepted observed jitter advances one `SM_TICK_MS` logical tick;
- the X-Bridges loop bound is compile-time and must be included in WCET review;
- state name/ID/C-symbol traceability table usage;
- meanings of `STATIC_ANALYSIS_ONLY`, `DYNAMIC_EXECUTION_VERIFIED`, dynamic
  reachability, differential, embedded compile, and target hardware labels;
- browser fallback and Electron verifier behavior;
- target compiler, linker map, stack, flash, WCET, driver, and hardware tests
  remain the embedded engineer's delivery gates.

- [ ] **Step 4: Regenerate and verify the standalone simulation bundle**

Run:

```bash
npm run build:sm-runtime
git diff --check -- src/generated/stateMachineRuntimeBundle.ts
npx vitest run src/utils/stateMachine/smStandaloneRuntime.test.ts --reporter=dot
```

Expected: bundle generation exits 0, diff check is clean, and standalone
simulation exposes fixed-tick and snapshot behavior.

- [ ] **Step 5: Run the complete focused release gate**

Run:

```bash
npx vitest run src/utils/stateMachine/smTiming.test.ts src/utils/stateMachine/smInterpreter.test.ts src/utils/stateMachine/smInterpreter.parallel-history.test.ts src/utils/stateMachine/smSemanticBuilder.test.ts src/utils/stateMachine/smCGenerator.test.ts src/utils/stateMachine/xbInterpreter.test.ts src/utils/stateMachine/xbCGenerator.test.ts src/utils/stateMachine/smDifferential.test.ts src/utils/stateMachine/smXBridgesAppIntegration.test.ts src/utils/stateMachine/smReports.test.ts src/utils/stateMachine/smHostHarness.test.ts src/utils/stateMachineCodeGenerator.test.ts --reporter=dot
node src/security/generatedCodeVerifier.test.cjs
npm run test:security
npx tsc --noEmit
npm run build:sm-runtime
git diff --exit-code -- src/generated/stateMachineRuntimeBundle.ts
git diff --check
```

Expected: all tests and compilation commands exit 0; the second bundle build
has no diff; unrelated pre-existing workspace changes remain untouched.

- [ ] **Step 6: Commit Task 7**

```bash
git add src/utils/stateMachine/smDifferential.test.ts src/utils/stateMachine/smXBridgesAppIntegration.test.ts src/utils/stateMachine/smReports.test.ts src/generated/stateMachineRuntimeBundle.ts docs/XBRIDGES_EMBEDDED_CODEGEN.md docs/CODEGEN_MCU_VERIFICATION_GATE.md
git commit -m "test(codegen): gate compact fixed-tick MCU output"
```

---

## Final Review Checklist

- [ ] Review every commit against `docs/superpowers/specs/2026-08-02-stateflow-codegen-runtime-efficiency-design.md`.
- [ ] Confirm the generated C contains no dynamic allocation, recursion, variable-bound loop, or user-controlled compiler arguments.
- [ ] Confirm history, parallel, internal-transition, fixed/float, boundary-mapping, Euler, RK4, and numeric-fault regression gates pass.
- [ ] Confirm a 50-substep model renders one graph and a bounded loop.
- [ ] Confirm accepted jitter advances one logical tick in TypeScript and C.
- [ ] Confirm smoke execution cannot claim dynamic reachability or differential PASS.
- [ ] Confirm reports contain only model-used unsupported capabilities and complete state traceability.
- [ ] Confirm browser export remains safe and honestly static-only when verification is unavailable.
- [ ] Confirm only task-owned files are staged in each commit.
