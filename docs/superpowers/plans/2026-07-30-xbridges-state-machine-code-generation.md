# X-Bridges State-Machine Code Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate deterministic embedded C99 for the approved MCU-safe X-Bridges block subset and execute the same typed model during ordinary Stateflow-style state execution in simulation.

**Architecture:** A canonical X-Bridges model adapter and capability registry feed an immutable typed semantic IR. The normal state-machine interpreter and structured C generator consume that IR at the owning state's `during` phase, using shared numeric semantics and compiled-C differential tests as the parity gate.

**Tech Stack:** TypeScript 5, Vitest, existing state-machine semantic runtime, strict C99/GCC host harness, statically allocated MCU data, generated standalone browser runtime.

## Global Constraints

- Preserve all pre-existing uncommitted changes, especially `src/engine/xbridges/BlockDefinitions.ts` and `src/engine/xbridges/BlockDefinitions.test.ts`.
- Do not restore the legacy node-to-C generator as a production path.
- Generated code must use C99, static bounded memory, and no heap allocation or runtime graph dispatch.
- Execute X-Bridges after textual `during` actions and before inner transitions and child states.
- Outer transitions that exit a state suppress that state's X-Bridges execution for the tick.
- Float32 is the default; float64 and float16 require explicit target capability.
- Fixed-point word length is 1–32 bits and uses true stored-integer semantics.
- Scalar, vector, and row-major matrix dimensions are positive compile-time constants.
- Generated continuous behavior supports only fixed-step Euler and RK4.
- Pure algebraic loops and variable-step embedded solvers are generation errors.
- Reset-on-entry is the default X-Bridges memory policy; retain is explicit.
- Unsupported blocks stop the entire generated package with a precise diagnostic.
- Simulation/C parity is proven by executing compiled generated C, not source snapshots alone.

---

## File and Responsibility Map

**New semantic files**

- `src/utils/stateMachine/xbModel.ts` — canonical persisted X-Bridges model and policy types.
- `src/utils/stateMachine/xbCapabilities.ts` — explicit per-block embedded capability registry.
- `src/utils/stateMachine/xbNumeric.ts` — canonical fixed-/floating-point scalar and shaped-value semantics.
- `src/utils/stateMachine/xbSemanticModel.ts` — immutable typed block IR.
- `src/utils/stateMachine/xbModelAdapter.ts` — UI node/edge normalization.
- `src/utils/stateMachine/xbSemanticValidator.ts` — graph, target, type, dimension, timing, and mapping diagnostics.
- `src/utils/stateMachine/xbSemanticBuilder.ts` — deterministic typed IR construction.
- `src/utils/stateMachine/xbInterpreter.ts` — semantic block execution and state lifecycle.
- `src/utils/stateMachine/xbCGenerator.ts` — `sm_xbridges.h/.c` rendering and state-action call sites.

**Existing integration files**

- `src/utils/stateMachine/smModel.ts` — attach canonical X-Bridges configuration to a state.
- `src/utils/stateMachine/smModelMigration.ts` — normalize legacy `xBridgesModel` payloads.
- `src/utils/stateMachine/smSemanticModel.ts` — optional `xBridges` IR on `SemanticState`.
- `src/utils/stateMachine/smSemanticBuilder.ts` — invoke X-Bridges build and merge diagnostics.
- `src/utils/stateMachine/smSemanticValidator.ts` — route X-Bridges structural diagnostics.
- `src/utils/stateMachine/smInterpreter.ts` — invoke X-Bridges at the approved `during` position.
- `src/utils/stateMachine/smCGenerator.ts` — add X-Bridges artifacts, storage, initialization, entry, and step calls.
- `src/utils/stateMachine/smTrace.ts` — include X-Bridges signals, block state, and errors.
- `src/utils/stateMachine/smCHarness.ts` — print and parse X-Bridges trace data.
- `src/utils/stateMachine/smFixtures.ts` — reusable hybrid-state fixtures.
- `src/utils/stateMachine/smStandaloneRuntime.ts` — export integrated simulation runtime.
- `src/generated/stateMachineRuntimeBundle.ts` — regenerated standalone runtime.
- `src/App.tsx` — remove the separate post-step X-Bridges execution path.
- `src/types/sm_types.ts` — use the canonical persisted X-Bridges type.
- `src/engine/xbridges/BlockDefinitions.ts` — only make the two numeric conversion blocks call `xbNumeric`; preserve every unrelated edit.

---

### Task 1: Canonical Model and Capability Registry

**Files:**
- Create: `src/utils/stateMachine/xbModel.ts`
- Create: `src/utils/stateMachine/xbCapabilities.ts`
- Create: `src/utils/stateMachine/xbCapabilities.test.ts`
- Modify: `src/utils/stateMachine/smModel.ts`
- Modify: `src/types/sm_types.ts`

**Interfaces:**
- Produces: `XBPersistedModelV1`, `XBStatePolicy`, `XBSolverConfig`, `XBTargetCapabilities`.
- Produces: `getXBBlockCapability(type: string): XBBlockCapability | null`.
- Consumes: existing UI node data without executing `BlockDefinitions` closures.

- [ ] **Step 1: Write capability contract tests**

```ts
it('marks deterministic arithmetic as codegen capable', () => {
  expect(getXBBlockCapability('GAIN')).toMatchObject({
    codegen: true,
    directFeedthrough: true,
    shapes: ['scalar', 'vector', 'matrix'],
  });
});

it('rejects host-only visualization and learning blocks', () => {
  expect(getXBBlockCapability('Scope')?.codegen).toBe(false);
  expect(getXBBlockCapability('LMS_ADAPTIVE_FILTER')?.codegen).toBe(false);
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```powershell
npx vitest run src/utils/stateMachine/xbCapabilities.test.ts --reporter=verbose
```

Expected: FAIL because `xbCapabilities.ts` does not exist.

- [ ] **Step 3: Define persisted contracts**

```ts
export type XBMemoryPolicy = 'reset' | 'retain';
export type XBSolverKind = 'euler' | 'rk4';
export type XBFaultPolicy = 'signal-only' | 'escalate';

export interface XBSolverConfig {
  kind: XBSolverKind;
  stepSeconds: number;
}

export interface XBStatePolicy {
  memory: XBMemoryPolicy;
  numericFault: XBFaultPolicy;
}

export interface XBPersistedModelV1 {
  schemaVersion: 1;
  nodes: readonly XBNodeV1[];
  edges: readonly XBEdgeV1[];
  mappings: readonly XBMappingV1[];
  solver: XBSolverConfig;
  policy: XBStatePolicy;
}
```

Add `xBridgesModel?: XBPersistedModelV1` to the canonical state model and use
the same type from `sm_types.ts`.

- [ ] **Step 4: Implement an explicit capability registry**

Define an entry for every block enabled in the first embedded-safe set. Define
host-only entries with `codegen: false` and a reason. Unknown types return
`null`; they are not assumed capable.

```ts
export const getXBBlockCapability = (
  type: string,
): XBBlockCapability | null => XB_CAPABILITIES[type] ?? null;
```

- [ ] **Step 5: Run focused and type tests**

Run:

```powershell
npx vitest run src/utils/stateMachine/xbCapabilities.test.ts --reporter=verbose
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/utils/stateMachine/xbModel.ts src/utils/stateMachine/xbCapabilities.ts src/utils/stateMachine/xbCapabilities.test.ts src/utils/stateMachine/smModel.ts src/types/sm_types.ts
git commit -m "feat(xbridges): define embedded model capabilities"
```

---

### Task 2: Canonical Fixed- and Floating-Point Numeric Kernel

**Files:**
- Create: `src/utils/stateMachine/xbNumeric.ts`
- Create: `src/utils/stateMachine/xbNumeric.test.ts`
- Modify: `src/engine/xbridges/BlockDefinitions.ts`
- Modify: `src/engine/xbridges/BlockDefinitions.test.ts`

**Interfaces:**
- Produces: `XBNumericType`, `XBFixedType`, `XBShape`, `XBTypedValue`.
- Produces: `xbConvertScalar(value, destination, policy): XBConversionResult`.
- Produces: `xbMapValue(value, shape, convert): XBTypedValue`.

- [ ] **Step 1: Capture the existing dirty-file baseline**

Run:

```powershell
git diff -- src/engine/xbridges/BlockDefinitions.ts src/engine/xbridges/BlockDefinitions.test.ts
```

Save the output in the task log. Do not stage or rewrite unrelated DEM/fabric
changes.

- [ ] **Step 2: Write RED tests for exact rounding semantics**

```ts
it.each([
  ['floor', -1.5, -2],
  ['ceiling', -1.5, -1],
  ['zero', -1.5, -1],
  ['nearest', -1.5, -1],
  ['round', -1.5, -2],
  ['convergent', -1.5, -2],
] as const)('%s converts negative ties correctly', (rounding, input, stored) => {
  const result = xbConvertScalar(input, {
    kind: 'fixed', signed: true, wordLength: 8, fractionLength: 0,
  }, { rounding, overflow: 'saturate' });
  expect(result.storedInteger).toBe(stored);
});
```

Add boundary tests for signed/unsigned saturation, two's-complement wrap,
overflow-as-error, float32 `Math.fround`, float64, float16 capability errors,
vectors, and row-major matrices.

- [ ] **Step 3: Verify RED**

Run:

```powershell
npx vitest run src/utils/stateMachine/xbNumeric.test.ts --reporter=verbose
```

Expected: FAIL because the numeric kernel is missing.

- [ ] **Step 4: Implement numeric types and conversions**

Use exact integer arithmetic for 1–32-bit fixed types. Use a widened JS integer
for intermediates and reject values outside the exact safe range.

```ts
export interface XBConversionResult {
  value: number | boolean;
  storedInteger: number | null;
  quantizationError: number;
  fault: 'overflow' | 'non-finite' | 'unsupported-float' | null;
}
```

Resolve `simplest` to `floor` or `zero` before execution; never branch on
target-dependent behavior at runtime.

- [ ] **Step 5: Delegate workspace conversion blocks to the kernel**

Surgically replace only the `DATA_TYPE_CONVERSION` and
`NUMERIC_REPRESENTATION` execute bodies with calls to `xbConvertScalar`.
Preserve their existing ports and UI parameters.

- [ ] **Step 6: Verify numeric and existing block tests**

Run:

```powershell
npx vitest run src/utils/stateMachine/xbNumeric.test.ts src/engine/xbridges/BlockDefinitions.test.ts --reporter=dot
npx tsc --noEmit
```

Expected: PASS, including existing numeric-representation tests.

- [ ] **Step 7: Verify preservation and commit**

Run:

```powershell
git diff --check
git diff -- src/engine/xbridges/BlockDefinitions.ts src/engine/xbridges/BlockDefinitions.test.ts
```

Confirm the earlier unrelated hunks remain present, then stage only the
numeric-kernel files and intentional conversion-block hunks.

```powershell
git commit -m "feat(xbridges): add bit-exact numeric semantics"
```

---

### Task 3: Model Adapter and Structural Diagnostics

**Files:**
- Create: `src/utils/stateMachine/xbModelAdapter.ts`
- Create: `src/utils/stateMachine/xbModelAdapter.test.ts`
- Create: `src/utils/stateMachine/xbSemanticValidator.ts`
- Create: `src/utils/stateMachine/xbSemanticValidator.test.ts`
- Modify: `src/utils/stateMachine/smModelMigration.ts`
- Modify: `src/utils/stateMachine/smModelMigration.test.ts`

**Interfaces:**
- Consumes: `StateData.xBridgesModel` in current and legacy UI shapes.
- Produces: `adaptXBModel(input: unknown): XBAdaptResult`.
- Produces: `validateXBModel(model: XBPersistedModelV1, variables: Readonly<Record<string, SemanticVariable>>, target: XBTargetCapabilities): ModelDiagnostic[]`.

- [ ] **Step 1: Write adapter RED tests**

Cover missing schema version, node `data.id` differing from React node ID,
legacy empty mappings, solver defaults, policy defaults, and deep-clone
isolation.

```ts
expect(adaptXBModel(legacy).model.policy).toEqual({
  memory: 'reset',
  numericFault: 'escalate',
});
```

- [ ] **Step 2: Write validator RED tests**

Assert exact diagnostic codes for:

```ts
XB_BLOCK_NOT_CODEGEN_CAPABLE
XB_PORT_DANGLING
XB_DIMENSION_DYNAMIC
XB_FIXED_FORMAT_INVALID
XB_SAMPLE_TIME_INVALID
XB_ALGEBRAIC_LOOP_UNSUPPORTED
XB_TARGET_CAPABILITY_MISSING
XB_MAPPING_INVALID
```

- [ ] **Step 3: Verify RED**

Run:

```powershell
npx vitest run src/utils/stateMachine/xbModelAdapter.test.ts src/utils/stateMachine/xbSemanticValidator.test.ts --reporter=verbose
```

Expected: FAIL because adapter and validator are absent.

- [ ] **Step 4: Implement normalization without guessing**

Default only omitted optional fields. Do not invent port connections,
dimensions, mappings, block types, or target capabilities.

- [ ] **Step 5: Implement structural validation**

Use state-machine variables by stable ID. Require unique node IDs, valid
handles, one incoming edge per scalar input, fixed dimensions, and explicit
conversion for incompatible mapped types.

- [ ] **Step 6: Integrate migration and verify**

Run:

```powershell
npx vitest run src/utils/stateMachine/xbModelAdapter.test.ts src/utils/stateMachine/xbSemanticValidator.test.ts src/utils/stateMachine/smModelMigration.test.ts --reporter=dot
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/utils/stateMachine/xbModelAdapter.ts src/utils/stateMachine/xbModelAdapter.test.ts src/utils/stateMachine/xbSemanticValidator.ts src/utils/stateMachine/xbSemanticValidator.test.ts src/utils/stateMachine/smModelMigration.ts src/utils/stateMachine/smModelMigration.test.ts
git commit -m "feat(xbridges): validate embedded block models"
```

---

### Task 4: Typed X-Bridges Semantic IR and Deterministic Schedule

**Files:**
- Create: `src/utils/stateMachine/xbSemanticModel.ts`
- Create: `src/utils/stateMachine/xbSemanticBuilder.ts`
- Create: `src/utils/stateMachine/xbSemanticBuilder.test.ts`

**Interfaces:**
- Consumes: validated `XBPersistedModelV1`, semantic variables, target capabilities, base tick.
- Produces: `buildXBSemanticModel(input: XBSemanticBuildInput): XBSemanticBuildResult`.
- Produces: immutable `XBSemanticModel`.

- [ ] **Step 1: Write RED tests for execution order and type propagation**

Create `Constant → GAIN → NUMERIC_REPRESENTATION → Outport` and assert:

```ts
expect(ir.executionOrder).toEqual(['constant', 'gain', 'quantize', 'out']);
expect(ir.signals['quantize:y'].numericType).toEqual({
  kind: 'fixed', signed: true, wordLength: 16, fractionLength: 8,
});
```

Add stateful-feedback acceptance and pure-algebraic-loop rejection tests.

- [ ] **Step 2: Write timing RED tests**

Assert Euler/RK4 substep counts, discrete sample divisibility, integer schedule
counters, and zero-order-hold metadata.

- [ ] **Step 3: Verify RED**

Run:

```powershell
npx vitest run src/utils/stateMachine/xbSemanticBuilder.test.ts --reporter=verbose
```

Expected: FAIL because builder and IR do not exist.

- [ ] **Step 4: Implement the immutable IR**

```ts
export interface XBSemanticModel {
  readonly stateId: string;
  readonly executionOrder: readonly string[];
  readonly operations: Readonly<Record<string, XBSemanticOperation>>;
  readonly signals: Readonly<Record<string, XBSemanticSignal>>;
  readonly mappings: readonly XBSemanticMapping[];
  readonly solver: { kind: 'euler' | 'rk4'; substepsPerTick: number };
  readonly policy: XBStatePolicy;
}

export interface XBSemanticBuildInput {
  readonly stateId: string;
  readonly model: XBPersistedModelV1;
  readonly variables: Readonly<Record<string, SemanticVariable>>;
  readonly target: XBTargetCapabilities;
  readonly baseTickMs: number;
}

export interface XBSemanticBuildResult {
  readonly ir?: XBSemanticModel;
  readonly diagnostics: readonly ModelDiagnostic[];
}
```

- [ ] **Step 5: Build deterministic graph and numeric types**

Break dependency cycles only at capability-declared stateful outputs. Sort
ready nodes by stable node ID so persisted UI order cannot change generated
behavior.

- [ ] **Step 6: Verify and commit**

```powershell
npx vitest run src/utils/stateMachine/xbSemanticBuilder.test.ts --reporter=dot
npx tsc --noEmit
git add src/utils/stateMachine/xbSemanticModel.ts src/utils/stateMachine/xbSemanticBuilder.ts src/utils/stateMachine/xbSemanticBuilder.test.ts
git commit -m "feat(xbridges): build typed deterministic block IR"
```

---

### Task 5: Attach X-Bridges IR to the State-Machine Semantic Model

**Files:**
- Modify: `src/utils/stateMachine/smSemanticModel.ts`
- Modify: `src/utils/stateMachine/smSemanticBuilder.ts`
- Modify: `src/utils/stateMachine/smSemanticValidator.ts`
- Modify: `src/utils/stateMachine/smSemanticBuilder.test.ts`
- Modify: `src/utils/stateMachine/smStatePruner.ts`
- Modify: `src/utils/stateMachine/smStatePruner.test.ts`
- Modify: `src/utils/stateMachine/smFixtures.ts`

**Interfaces:**
- Consumes: `buildXBSemanticModel`.
- Produces: `SemanticState.xBridges: XBSemanticModel | null`.

- [ ] **Step 1: Add a hybrid fixture and RED tests**

Build a normal OR chart containing one ordinary state and one X-Bridges state.
Assert the X-Bridges state carries frozen IR and the ordinary state carries
`null`.

- [ ] **Step 2: Verify RED**

Run:

```powershell
npx vitest run src/utils/stateMachine/smSemanticBuilder.test.ts -t "X-Bridges semantic model" --reporter=verbose
```

Expected: FAIL because `SemanticState.xBridges` is absent.

- [ ] **Step 3: Integrate build and diagnostics**

For every `isXBridges` state, adapt, validate, and build its model before
freezing the complete state-machine IR. Prefix diagnostic messages with the
owning state ID while preserving the canonical `XB_*` code.

- [ ] **Step 4: Preserve X-Bridges reachability pruning**

Ensure pruning a state removes its X-Bridges model and mappings without
mutating other states.

- [ ] **Step 5: Verify and commit**

```powershell
npx vitest run src/utils/stateMachine/smSemanticBuilder.test.ts src/utils/stateMachine/smStatePruner.test.ts --reporter=dot
npx tsc --noEmit
git add src/utils/stateMachine/smSemanticModel.ts src/utils/stateMachine/smSemanticBuilder.ts src/utils/stateMachine/smSemanticValidator.ts src/utils/stateMachine/smSemanticBuilder.test.ts src/utils/stateMachine/smStatePruner.ts src/utils/stateMachine/smStatePruner.test.ts src/utils/stateMachine/smFixtures.ts
git commit -m "feat(sm): attach X-Bridges IR to states"
```

---

### Task 6: Interpreter During-Phase and Memory Lifecycle

**Files:**
- Create: `src/utils/stateMachine/xbInterpreter.ts`
- Create: `src/utils/stateMachine/xbInterpreter.test.ts`
- Modify: `src/utils/stateMachine/smInterpreter.ts`
- Modify: `src/utils/stateMachine/smInterpreter.test.ts`
- Modify: `src/utils/stateMachine/smTrace.ts`

**Interfaces:**
- Produces: `createXBRuntime(ir: XBSemanticModel): XBRuntime`.
- Produces: `enterXBState(runtime: XBRuntime): void`.
- Produces: `stepXBState(runtime: XBRuntime, data: Record<string, number | boolean>): XBNumericFault[]`.
- Produces: `resetXBState(runtime: XBRuntime): void`.
- Extends: `SemanticRuntime.xBridgesByStateId`.

- [ ] **Step 1: Write RED ordering tests**

Use a state whose textual `during` sets `u`, whose GAIN maps `u → y`, and whose
inner transition checks `y`.

```ts
expect(frame.actions).toEqual([
  'during:CONTROLLER',
  'xbridges:CONTROLLER',
  'transition:$internal_controller_0',
]);
```

Also prove an enabled outer transition produces no `xbridges:*` action.
Add an internal-action transition that does not exit the owner and prove its
X-Bridges memory is retained. Add two active parallel regions and prove their
X-Bridges steps follow existing layer priority and stable-ID tie-breaking.

- [ ] **Step 2: Write RED lifecycle tests**

Exit/reenter a reset-policy state and a retain-policy state. Assert delay and
integrator memories reset or persist exactly as configured. Assert
`resetRuntime` clears both. Repeat re-entry through shallow and deep history:
history restores the state configuration, while the owning state's X-Bridges
`reset`/`retain` policy independently controls block memory.

- [ ] **Step 3: Verify RED**

Run:

```powershell
npx vitest run src/utils/stateMachine/xbInterpreter.test.ts src/utils/stateMachine/smInterpreter.test.ts -t "X-Bridges|during order|memory policy" --reporter=verbose
```

Expected: FAIL because runtime integration is absent.

- [ ] **Step 4: Implement stateless and stateful operation execution**

Execute mappings in, operations in semantic order, mappings out, and append
the trace action only after successful model execution.

- [ ] **Step 5: Insert the approved state execution order**

In `executeState`, retain:

```ts
outer -> textual during -> X-Bridges -> inner -> children
```

Do not run X-Bridges for terminal states or after an outer transition exits
the owner.

- [ ] **Step 6: Verify and commit**

```powershell
npx vitest run src/utils/stateMachine/xbInterpreter.test.ts src/utils/stateMachine/smInterpreter.test.ts src/utils/stateMachine/smInterpreter.parallel-history.test.ts --reporter=dot
npx tsc --noEmit
git add src/utils/stateMachine/xbInterpreter.ts src/utils/stateMachine/xbInterpreter.test.ts src/utils/stateMachine/smInterpreter.ts src/utils/stateMachine/smInterpreter.test.ts src/utils/stateMachine/smTrace.ts
git commit -m "feat(sm): execute X-Bridges during active states"
```

---

### Task 7: Generated Static Storage and Numeric C Helpers

**Files:**
- Create: `src/utils/stateMachine/xbCGenerator.ts`
- Create: `src/utils/stateMachine/xbCGenerator.test.ts`
- Modify: `src/utils/stateMachine/smCGenerator.ts`
- Modify: `src/utils/stateMachine/smCGenerator.test.ts`

**Interfaces:**
- Produces: `renderXBHeader(ir: SemanticModel): string`.
- Produces: `renderXBSource(ir: SemanticModel): string`.
- Produces: `renderXBInstanceMembers(ir: SemanticModel): readonly string[]`.

- [ ] **Step 1: Write source-shape RED tests**

Assert generated code contains no `malloc`, VLA, runtime node table, or
function-pointer dispatcher. Assert fixed signals use `int8_t`–`int32_t` or
unsigned equivalents and widened operations use `int64_t`/`uint64_t`.

- [ ] **Step 2: Write compiled numeric RED tests**

Generate a fixed-point conversion state and compare stored integers, real
values, quantization error, saturation, and wrap against `xbNumeric`.

- [ ] **Step 3: Verify RED**

Run:

```powershell
npx vitest run src/utils/stateMachine/xbCGenerator.test.ts --reporter=verbose
```

Expected: FAIL because X-Bridges C artifacts are absent.

- [ ] **Step 4: Render per-state static types**

Generate:

```c
typedef struct {
    int16_t quantize_y;
    float gain_y;
    bool quantize_error;
} SM_XB_CONTROLLER_t;
```

Embed one field per X-Bridges state in `ADIA_Instance_t`.

- [ ] **Step 5: Render numeric helpers without undefined overflow**

Use pre-checks and widened unsigned/signed intermediates. Do not depend on C
signed overflow for wrap behavior.

- [ ] **Step 6: Add generated artifacts**

`generateCArtifacts` must include `sm_xbridges.h` and `sm_xbridges.c` only when
at least one state owns X-Bridges IR.

- [ ] **Step 7: Verify and commit**

```powershell
npx vitest run src/utils/stateMachine/xbCGenerator.test.ts src/utils/stateMachine/smCGenerator.test.ts --reporter=dot
npx tsc --noEmit
git add src/utils/stateMachine/xbCGenerator.ts src/utils/stateMachine/xbCGenerator.test.ts src/utils/stateMachine/smCGenerator.ts src/utils/stateMachine/smCGenerator.test.ts
git commit -m "feat(generator): emit static X-Bridges numeric runtime"
```

---

### Task 8: Combinational Blocks, Mappings, and State Call Sites

**Files:**
- Modify: `src/utils/stateMachine/xbCGenerator.ts`
- Modify: `src/utils/stateMachine/xbCGenerator.test.ts`
- Modify: `src/utils/stateMachine/smCGenerator.ts`
- Modify: `src/utils/stateMachine/smDifferential.test.ts`

**Interfaces:**
- Consumes: typed operations from Task 4.
- Produces: `SM_XB_<State>_Init`, `SM_XB_<State>_Enter`, `SM_XB_<State>_Step`.

- [ ] **Step 1: Write RED compiled tests for the scalar subset**

Cover sources, arithmetic, logic, bitwise, routing, explicit conversions, and
input/output mappings. Include a mapped output that fires an inner transition
in the same tick.

- [ ] **Step 2: Verify RED**

Run:

```powershell
npx vitest run src/utils/stateMachine/xbCGenerator.test.ts -t "combinational|same tick" --reporter=verbose
```

Expected: FAIL because operation emission and state call sites are incomplete.

- [ ] **Step 3: Emit typed expressions per operation**

Each capability entry maps to a dedicated emitter. Do not add a default
pass-through case. Exhaustiveness failure must throw during generation.

- [ ] **Step 4: Integrate lifecycle and during calls**

Call `Init` from `SM_Init`, `Enter` from state entry when policy is reset, and
`Step` between textual during actions and inner transition evaluation.

- [ ] **Step 5: Verify and commit**

```powershell
npx vitest run src/utils/stateMachine/xbCGenerator.test.ts src/utils/stateMachine/smDifferential.test.ts --reporter=dot
npx tsc --noEmit
git add src/utils/stateMachine/xbCGenerator.ts src/utils/stateMachine/xbCGenerator.test.ts src/utils/stateMachine/smCGenerator.ts src/utils/stateMachine/smDifferential.test.ts
git commit -m "feat(generator): integrate X-Bridges state execution"
```

---

### Task 9: Stateful Blocks, Multirate Scheduling, Euler, and RK4

**Files:**
- Modify: `src/utils/stateMachine/xbInterpreter.ts`
- Modify: `src/utils/stateMachine/xbInterpreter.test.ts`
- Modify: `src/utils/stateMachine/xbCGenerator.ts`
- Modify: `src/utils/stateMachine/xbCGenerator.test.ts`
- Modify: `src/utils/stateMachine/smFixtures.ts`

**Interfaces:**
- Adds deterministic delay, memory, discrete integrator, and continuous integrator operations.
- Uses integer schedule counters and `substepsPerTick`.

- [ ] **Step 1: Write RED multirate tests**

Use base tick 10 ms, solver step 2 ms, and a discrete delay sample of 20 ms.
Assert five solver substeps per tick and output updates every ten substeps with
zero-order hold between updates.

- [ ] **Step 2: Write RED Euler/RK4 differential tests**

Integrate `dx/dt = -x + u` for a fixed number of ticks. Compare interpreter
and compiled C per tick for both solver kinds.

- [ ] **Step 3: Verify RED**

Run:

```powershell
npx vitest run src/utils/stateMachine/xbInterpreter.test.ts src/utils/stateMachine/xbCGenerator.test.ts -t "multirate|Euler|RK4" --reporter=verbose
```

Expected: FAIL because schedule and solver emission are absent.

- [ ] **Step 4: Implement integer schedules and state updates**

Advance schedule counters by compile-time substeps. Update a discrete block
only when its counter reaches its exact period; otherwise retain its output.

- [ ] **Step 5: Implement bounded solver emitters**

Emit explicit Euler or four RK stages with statically named temporaries.
Evaluate direct-feedthrough operations at each RK stage using stage state.

- [ ] **Step 6: Verify and commit**

```powershell
npx vitest run src/utils/stateMachine/xbInterpreter.test.ts src/utils/stateMachine/xbCGenerator.test.ts src/utils/stateMachine/smDifferential.test.ts --reporter=dot
npx tsc --noEmit
git add src/utils/stateMachine/xbInterpreter.ts src/utils/stateMachine/xbInterpreter.test.ts src/utils/stateMachine/xbCGenerator.ts src/utils/stateMachine/xbCGenerator.test.ts src/utils/stateMachine/smFixtures.ts
git commit -m "feat(xbridges): generate bounded solvers and schedules"
```

---

### Task 10: Static Vectors, Matrices, Control Blocks, and Transforms

**Files:**
- Modify: `src/utils/stateMachine/xbInterpreter.ts`
- Modify: `src/utils/stateMachine/xbInterpreter.test.ts`
- Modify: `src/utils/stateMachine/xbCGenerator.ts`
- Modify: `src/utils/stateMachine/xbCGenerator.test.ts`
- Modify: `src/utils/stateMachine/xbCapabilities.ts`

**Interfaces:**
- Enables capability-tested vector/matrix operations, PID/filter/state-space operations, and Clarke/Park transforms.

- [ ] **Step 1: Write RED shaped-value tests**

Cover elementwise vector arithmetic, 2×3 by 3×2 matrix multiplication,
transpose, concatenation, diagonal construction, and statically bounded solve.
Assert row-major element ordering.

- [ ] **Step 2: Write RED control tests**

Cover PID saturation, discrete transfer function state, bounded state-space
update, Clarke/Park, and inverse transforms with known reference vectors.

- [ ] **Step 3: Verify RED**

Run:

```powershell
npx vitest run src/utils/stateMachine/xbInterpreter.test.ts src/utils/stateMachine/xbCGenerator.test.ts -t "vector|matrix|PID|state-space|Clarke|Park" --reporter=verbose
```

Expected: FAIL because these capability emitters are not enabled.

- [ ] **Step 4: Implement static loop emitters**

All loop bounds must be numeric literals or generated `#define` constants.
Bounded solve must use a configured maximum dimension and deterministic pivot
failure handling.

- [ ] **Step 5: Enable capabilities only after conformance passes**

Add `codegen: true` to each individual capability entry only in the same
change that adds its interpreter and compiled-C tests.

- [ ] **Step 6: Verify and commit**

```powershell
npx vitest run src/utils/stateMachine/xbInterpreter.test.ts src/utils/stateMachine/xbCGenerator.test.ts src/engine/xbridges/BlockDefinitions.test.ts --reporter=dot
npx tsc --noEmit
git add src/utils/stateMachine/xbInterpreter.ts src/utils/stateMachine/xbInterpreter.test.ts src/utils/stateMachine/xbCGenerator.ts src/utils/stateMachine/xbCGenerator.test.ts src/utils/stateMachine/xbCapabilities.ts
git commit -m "feat(xbridges): generate static control and matrix blocks"
```

---

### Task 11: Numeric Error Signals and State-Machine Fault Escalation

**Files:**
- Modify: `src/utils/stateMachine/xbInterpreter.ts`
- Modify: `src/utils/stateMachine/xbCGenerator.ts`
- Modify: `src/utils/stateMachine/smSemanticModel.ts`
- Modify: `src/utils/stateMachine/smInterpreter.ts`
- Modify: `src/utils/stateMachine/smCGenerator.ts`
- Modify: `src/utils/stateMachine/smCGenerator.test.ts`
- Modify: `src/utils/stateMachine/smDifferential.test.ts`

**Interfaces:**
- Adds `SM_ERR_XBRIDGES_NUMERIC`.
- Adds canonical `XBNumericFault` and recoverable fallback values.

- [ ] **Step 1: Write RED recovery/escalation tests**

Test division by zero, fixed overflow-as-error, non-finite float, and bounded
solve pivot failure in both policies:

```ts
expect(signalOnly.errorOutput).toBe(true);
expect(signalOnly.runtime.error).toBeNull();
expect(escalated.runtime.error?.code).toBe('XBRIDGES_NUMERIC');
```

- [ ] **Step 2: Verify RED**

Run:

```powershell
npx vitest run src/utils/stateMachine/smDifferential.test.ts -t "X-Bridges numeric fault" --reporter=verbose
```

Expected: FAIL because error propagation is absent.

- [ ] **Step 3: Implement recoverable fallbacks**

Every faulting operation defines its fallback in the semantic operation:
previous value for stateful outputs, zero for stateless numeric outputs, and
`true` for its error signal.

- [ ] **Step 4: Integrate escalation**

On `escalate`, latch the first error, commit existing safe outputs, suppress
watchdog kick after failed output commit, and use the existing safety path.

- [ ] **Step 5: Verify and commit**

```powershell
npx vitest run src/utils/stateMachine/smCGenerator.test.ts src/utils/stateMachine/smDifferential.test.ts --reporter=dot
npx tsc --noEmit
git add src/utils/stateMachine/xbInterpreter.ts src/utils/stateMachine/xbCGenerator.ts src/utils/stateMachine/smSemanticModel.ts src/utils/stateMachine/smInterpreter.ts src/utils/stateMachine/smCGenerator.ts src/utils/stateMachine/smCGenerator.test.ts src/utils/stateMachine/smDifferential.test.ts
git commit -m "feat(xbridges): integrate numeric safety faults"
```

---

### Task 12: Differential Trace, Reports, and Standalone Runtime

**Files:**
- Modify: `src/utils/stateMachine/smTrace.ts`
- Modify: `src/utils/stateMachine/smCHarness.ts`
- Modify: `src/utils/stateMachine/smDifferential.test.ts`
- Modify: `src/utils/stateMachine/smReports.ts`
- Modify: `src/utils/stateMachine/smReports.test.ts`
- Modify: `src/utils/stateMachine/smStandaloneRuntime.ts`
- Modify: `src/utils/stateMachine/smStandaloneRuntime.test.ts`
- Regenerate: `src/generated/stateMachineRuntimeBundle.ts`

**Interfaces:**
- Extends trace frames with canonical X-Bridges signals, block state, and numeric faults.
- Extends generated reports with X-Bridges code-generation evidence and unsupported capability lists.

- [ ] **Step 1: Write RED trace tests**

Compare interpreter/C frames including:

```ts
xBridges: {
  controller: {
    signals: { 'gain:y': 1.25 },
    blockState: { delay: { previous: 1.0 } },
    faults: [],
  },
}
```

- [ ] **Step 2: Write RED report tests**

Require block count, static memory bytes, solver, substeps, numeric types,
capability dependencies, and `STATIC_ANALYSIS_ONLY` unless compiled execution
evidence was recorded.

- [ ] **Step 3: Verify RED**

Run:

```powershell
npx vitest run src/utils/stateMachine/smDifferential.test.ts src/utils/stateMachine/smReports.test.ts src/utils/stateMachine/smStandaloneRuntime.test.ts --reporter=verbose
```

Expected: FAIL because trace/report/runtime data is incomplete.

- [ ] **Step 4: Implement trace encoding and parsing**

Sort state IDs, signal IDs, and block IDs before serialization. Encode shaped
values deterministically without locale-dependent formatting.

- [ ] **Step 5: Rebuild standalone runtime**

Run:

```powershell
npm run build:sm-runtime
```

Expected: exit 0 and only `src/generated/stateMachineRuntimeBundle.ts` changes.

- [ ] **Step 6: Verify and commit**

```powershell
npx vitest run src/utils/stateMachine/smDifferential.test.ts src/utils/stateMachine/smReports.test.ts src/utils/stateMachine/smStandaloneRuntime.test.ts --reporter=dot
npx tsc --noEmit
git add src/utils/stateMachine/smTrace.ts src/utils/stateMachine/smCHarness.ts src/utils/stateMachine/smDifferential.test.ts src/utils/stateMachine/smReports.ts src/utils/stateMachine/smReports.test.ts src/utils/stateMachine/smStandaloneRuntime.ts src/utils/stateMachine/smStandaloneRuntime.test.ts src/generated/stateMachineRuntimeBundle.ts
git commit -m "test(xbridges): prove simulator and generated C parity"
```

---

### Task 13: Application Simulation Integration

**Files:**
- Modify: `src/App.tsx`
- Create: `src/utils/stateMachine/smXBridgesAppIntegration.test.ts`
- Modify: `src/utils/stateMachine/smAppAdapter.ts`
- Modify: `src/utils/stateMachine/smAppAdapter.test.ts`

**Interfaces:**
- Removes: separate `stepActiveXBridgesModels` post-step execution.
- Uses: integrated `stepRuntime` from the standalone/semantic runtime.

- [ ] **Step 1: Write RED application ordering test**

Create an app-level session where an X-Bridges output drives an inner
transition. Assert the transition fires on the first tick, not the second.

- [ ] **Step 2: Verify RED**

Run:

```powershell
npx vitest run src/utils/stateMachine/smXBridgesAppIntegration.test.ts --reporter=verbose
```

Expected: FAIL while the app uses the separate post-step engine.

- [ ] **Step 3: Remove duplicate execution**

Delete `stepActiveXBridgesModels` and its engine cache from the state-machine
simulation path. Do not remove the standalone X-Bridges workspace engine,
which remains necessary for editing and independent simulation.

- [ ] **Step 4: Use canonical adapter data**

Ensure state save/load paths persist solver, policy, dimensions, types, and
mappings without serializing execute closures.

- [ ] **Step 5: Verify and commit**

```powershell
npx vitest run src/utils/stateMachine/smXBridgesAppIntegration.test.ts src/utils/stateMachine/smAppAdapter.test.ts --reporter=dot
npx tsc --noEmit
git add src/App.tsx src/utils/stateMachine/smXBridgesAppIntegration.test.ts src/utils/stateMachine/smAppAdapter.ts src/utils/stateMachine/smAppAdapter.test.ts
git commit -m "fix(app): use integrated X-Bridges state execution"
```

---

### Task 14: Capability Audit, Documentation, and Full Acceptance Gate

**Files:**
- Create: `docs/XBRIDGES_EMBEDDED_CODEGEN.md`
- Modify: `docs/superpowers/specs/2026-07-30-xbridges-state-machine-code-generation-design.md`
- Modify: `src/utils/stateMachine/xbCapabilities.test.ts`
- Modify: `src/utils/stateMachineCodeGenerator.golden.test.ts`
- Update: `src/utils/__snapshots__/stateMachineCodeGenerator.golden.test.ts.snap`

**Interfaces:**
- Produces: user-facing supported/unsupported block and target capability matrix.

- [ ] **Step 1: Add exhaustive capability audit test**

Load every key from `BLOCK_LIBRARY` and require one explicit registry entry:

```ts
for (const type of Object.keys(BLOCK_LIBRARY)) {
  expect(getXBBlockCapability(type), type).not.toBeNull();
}
```

For every `codegen: true` entry, require interpreter and C conformance case
IDs registered in the capability object.

- [ ] **Step 2: Write the user documentation**

Document:

- supported block types;
- unsupported reasons;
- fixed-point formats and rounding;
- float target requirements;
- solver/sample-time rules;
- reset/retain behavior;
- Stateflow execution order;
- numeric error and safety behavior;
- generated files and MCU integration points.

- [ ] **Step 3: Run the full acceptance suite**

Run:

```powershell
npx vitest run src/utils/stateMachine src/utils/stateMachineCodeGenerator.behavior.test.ts src/utils/stateMachineClipboard.test.ts src/utils/stateMachineCodeGenerator.test.ts src/utils/stateMachineCodeGenerator.phase2.test.ts src/utils/stateMachineCodeGenerator.golden.test.ts src/utils/smAnalysisEngine.test.ts src/engine/xbridges --reporter=dot
npx vitest run src/engine/hil/hilCompilation.test.ts src/engine/hil/hil.test.ts src/components/hil/HILSignalMapper.test.ts --reporter=dot
npx tsc --noEmit
npm run build:sm-runtime
git diff --check
```

Expected:

- all state-machine and X-Bridges tests pass;
- all HIL tests pass;
- TypeScript exits 0;
- runtime bundle regenerates deterministically;
- no whitespace errors.

- [ ] **Step 4: Run strict generated-C integration scenarios**

Compile and run at minimum:

- ordinary state → X-Bridges state → ordinary state;
- X-Bridges parent with child and inner transition;
- two parallel X-Bridges states;
- shallow/deep history with reset and retain policies;
- fixed scalar/vector/matrix model;
- Euler and RK4 continuous model;
- recoverable and escalated numeric faults.

Expected: every interpreter/C trace comparison returns `null`.

- [ ] **Step 5: Review preservation**

Run:

```powershell
git status --short
git diff -- src/engine/xbridges/BlockDefinitions.ts src/engine/xbridges/BlockDefinitions.test.ts
```

Confirm unrelated pre-existing changes remain present and unstaged unless the
user separately authorized them.

- [ ] **Step 6: Commit**

```powershell
git add docs/XBRIDGES_EMBEDDED_CODEGEN.md docs/superpowers/specs/2026-07-30-xbridges-state-machine-code-generation-design.md src/utils/stateMachine/xbCapabilities.test.ts src/utils/stateMachineCodeGenerator.golden.test.ts src/utils/__snapshots__/stateMachineCodeGenerator.golden.test.ts.snap
git commit -m "docs(xbridges): document embedded code generation"
```
