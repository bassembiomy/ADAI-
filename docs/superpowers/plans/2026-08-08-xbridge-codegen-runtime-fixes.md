# XBridge Code Generation Runtime and Mapping Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix XBridge C code generation runtime and mapping defects by implementing authoritative symbol resolution, explicit owner-state context, decoupled timing abstractions, Step lowering, symbol consistency verification, and host GCC compilation gates.

**Architecture:** Approach 1 (Integrated Semantic Symbol Table & Pre-Lowering Resolution). Lightweight `SemanticVariableSymbol` and `XBOwnerState` symbols are resolved during SM semantic building and passed into `buildXBSemanticModel()`. Lowering converts Step parameters into pre-aligned millisecond threshold expressions against owning state timer symbols. Pure C renderers consume resolved symbols without string sanitization fallbacks.

**Tech Stack:** TypeScript, Vitest, C11 (`gcc` host compiler).

## Global Constraints

* Every XBridge mapping referencing a state-machine variable ID (string or UUID) MUST resolve to `SemanticVariableSymbol.cIdentifier`. Direct sanitization of raw `smVarId` during C generation is prohibited.
* `sourceVariableId` is retained on `XBSemanticMapping` for diagnostics/provenance ONLY. C generation MUST consume `mapping.variable.cIdentifier`.
* No XBridge time-dependent operation SHALL emit a literal `state_timers[0U]` reference. All state timer accesses SHALL use `ownerState.cIndexSymbol`.
* Time unit conversion (`convertTime`) and scheduler tick alignment (`alignRuntimeThreshold`) MUST remain separate functions in `smTiming.ts`.
* Generated C artifacts MUST pass post-rendering symbol consistency validation (`usedDataMembers ⊆ declaredDataMembers`) and host GCC syntax compilation (`gcc -std=c11 -Wall -Wextra -fsyntax-only`).

---

### Task 1: Introduce Shared Symbol Types and Timing Utilities

**Files:**
- Modify: `src/utils/stateMachine/smSemanticModel.ts`
- Modify: `src/utils/stateMachine/smTiming.ts`
- Test: `src/utils/stateMachine/smTiming.test.ts`

**Interfaces:**
- Produces: `SemanticType`, `SemanticVariableSymbol`, `XBOwnerState` in `smSemanticModel.ts`
- Produces: `convertTime(value, fromUnit, toUnit, baseTickMs)` and `alignRuntimeThreshold(timeMs, baseTickMs, policy)` in `smTiming.ts`

- [ ] **Step 1: Write failing tests for timing utilities**

Create or update `src/utils/stateMachine/smTiming.test.ts` with tests for `convertTime` and `alignRuntimeThreshold` (including 0ms step time).

```ts
import { describe, it, expect } from 'vitest';
import { convertTime, alignRuntimeThreshold } from './smTiming';

describe('smTiming utilities', () => {
  it('converts units correctly', () => {
    expect(convertTime(0.3, 'seconds', 'milliseconds', 100)).toBe(300);
    expect(convertTime(300, 'milliseconds', 'seconds', 100)).toBe(0.3);
    expect(convertTime(3, 'ticks', 'milliseconds', 100)).toBe(300);
  });

  it('aligns runtime thresholds cleanly including 0ms', () => {
    expect(alignRuntimeThreshold(300, 100, 'ceil-to-tick')).toEqual({
      requiredTicks: 3,
      thresholdMs: 300,
    });
    expect(alignRuntimeThreshold(250, 100, 'ceil-to-tick')).toEqual({
      requiredTicks: 3,
      thresholdMs: 300,
    });
    expect(alignRuntimeThreshold(0, 100, 'ceil-to-tick')).toEqual({
      requiredTicks: 0,
      thresholdMs: 0,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/stateMachine/smTiming.test.ts`  
Expected: FAIL due to missing exports/functions.

- [ ] **Step 3: Implement shared symbol types and timing functions**

In `src/utils/stateMachine/smSemanticModel.ts`, add:

```ts
export type SemanticType =
  | 'boolean'
  | 'int8'
  | 'uint8'
  | 'int16'
  | 'uint16'
  | 'int32'
  | 'uint32'
  | 'float32'
  | 'float64';

export interface SemanticVariableSymbol {
  readonly id: string;
  readonly modelName: string;
  readonly cIdentifier: string;
  readonly semanticType: SemanticType;
  readonly cType: string;
}

export interface XBOwnerState {
  readonly stateId: string;
  readonly stateName: string;
  readonly cIndexSymbol: string;
  readonly numericIndex: number;
}
```

In `src/utils/stateMachine/smTiming.ts`, implement:

```ts
export type TimeUnit = 'seconds' | 'milliseconds' | 'ticks';

export function convertTime(
  value: number,
  fromUnit: TimeUnit,
  toUnit: TimeUnit,
  baseTickMs: number
): number {
  if (fromUnit === toUnit) return value;
  const ms = fromUnit === 'seconds' ? value * 1000 : fromUnit === 'ticks' ? value * baseTickMs : value;
  if (toUnit === 'milliseconds') return ms;
  if (toUnit === 'seconds') return ms / 1000;
  if (toUnit === 'ticks') return ms / baseTickMs;
  throw new Error(`Unsupported unit conversion: ${fromUnit} to ${toUnit}`);
}

export function alignRuntimeThreshold(
  timeMs: number,
  baseTickMs: number,
  policy: 'ceil-to-tick' | 'exact' = 'ceil-to-tick'
): { requiredTicks: number; thresholdMs: number } {
  if (!Number.isFinite(timeMs) || timeMs < 0) {
    throw new Error(`Invalid time threshold: ${timeMs}`);
  }
  if (!Number.isFinite(baseTickMs) || baseTickMs <= 0) {
    throw new Error(`Invalid base tick: ${baseTickMs}`);
  }

  if (policy === 'ceil-to-tick') {
    const requiredTicks = Math.ceil(timeMs / baseTickMs);
    return {
      requiredTicks,
      thresholdMs: requiredTicks * baseTickMs,
    };
  }

  return {
    requiredTicks: Math.ceil(timeMs / baseTickMs),
    thresholdMs: timeMs,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/stateMachine/smTiming.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/smSemanticModel.ts src/utils/stateMachine/smTiming.ts src/utils/stateMachine/smTiming.test.ts
git commit -m "feat(sm): add shared symbol types and decoupled timing utilities"
```

---

### Task 2: Build Authoritative Symbol Tables in `smSemanticBuilder.ts`

**Files:**
- Modify: `src/utils/stateMachine/smSemanticBuilder.ts`
- Modify: `src/utils/stateMachine/smSemanticModel.ts`
- Test: `src/utils/stateMachine/smSemanticBuilder.test.ts`

**Interfaces:**
- Consumes: `SemanticVariableSymbol`, `XBOwnerState`
- Produces: Variable and State symbol table resolution in `buildSemanticModel()`

- [ ] **Step 1: Write failing test for symbol table construction**

In `src/utils/stateMachine/smSemanticBuilder.test.ts`, add a test asserting that variable and state symbols are built accurately.

```ts
it('builds variable and state symbol maps accurately', () => {
  const model = hybridXBridgesFixture();
  const { ir, variableSymbols, stateSymbols } = buildSemanticModel(model);
  expect(variableSymbols).toBeDefined();
  expect(stateSymbols).toBeDefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/stateMachine/smSemanticBuilder.test.ts`  
Expected: FAIL due to missing `variableSymbols` / `stateSymbols` on result.

- [ ] **Step 3: Implement symbol table building**

In `src/utils/stateMachine/smSemanticBuilder.ts`, construct lookup maps:
- `variableSymbols`: `Map<string, SemanticVariableSymbol>` keyed by variable ID (and model name).
- `stateSymbols`: `Map<string, XBOwnerState>` keyed by state ID.
Attach these tables to the return object of `buildSemanticModel()`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/stateMachine/smSemanticBuilder.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/smSemanticBuilder.ts src/utils/stateMachine/smSemanticModel.ts src/utils/stateMachine/smSemanticBuilder.test.ts
git commit -m "feat(sm): build authoritative variable and state symbol tables"
```

---

### Task 3: Update `XBSemanticModel`, Mappings, and Owner State Context

**Files:**
- Modify: `src/utils/stateMachine/xbSemanticModel.ts`
- Modify: `src/utils/stateMachine/xbSemanticBuilder.ts`
- Test: `src/utils/stateMachine/xbSemanticBuilder.test.ts`

**Interfaces:**
- Consumes: `SemanticVariableSymbol`, `XBOwnerState`
- Produces: Updated `XBSemanticMapping` (`sourceVariableId`, `variable: SemanticVariableSymbol`) and `XBSemanticModel.ownerState`

- [ ] **Step 1: Write failing test for resolved XBridge mappings and owner state**

In `src/utils/stateMachine/xbSemanticBuilder.test.ts`, add:

```ts
it('resolves XBridge mappings and attaches ownerState symbol context', () => {
  const input = createTestBuildInput();
  const result = buildXBSemanticModel(input);
  expect(result.ir?.ownerState.cIndexSymbol).toContain('SM_ST_');
  expect(result.ir?.mappings[0].variable.cIdentifier).toBeDefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/stateMachine/xbSemanticBuilder.test.ts`  
Expected: FAIL due to missing `ownerState` or `mapping.variable`.

- [ ] **Step 3: Implement `XBSemanticModel` and builder updates**

Update `XBSemanticMapping` in `xbSemanticModel.ts`:
```ts
export interface XBSemanticMapping {
  readonly sourceVariableId: string;
  readonly variable: SemanticVariableSymbol;
  readonly blockId: string;
  readonly portId: string;
  readonly direction: 'in' | 'out';
  readonly signalId: string;
  readonly numericType: XBNumericType;
}
```

Update `XBSemanticBuildInput` to accept `ownerState: XBOwnerState` and `variableSymbols: ReadonlyMap<string, SemanticVariableSymbol>`.  
In `xbSemanticBuilder.ts`, resolve each mapping using `variableSymbols.get(mapping.smVarId)`. If not found, push diagnostic `XB_MAPPING_VARIABLE_NOT_FOUND`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/stateMachine/xbSemanticBuilder.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/xbSemanticModel.ts src/utils/stateMachine/xbSemanticBuilder.ts src/utils/stateMachine/xbSemanticBuilder.test.ts
git commit -m "feat(xb): update XBSemanticModel with resolved variable symbols and ownerState context"
```

---

### Task 4: Lower Step Parameters into Resolved Semantic Thresholds

**Files:**
- Modify: `src/utils/stateMachine/xbSemanticModel.ts`
- Modify: `src/utils/stateMachine/xbSemanticBuilder.ts`
- Test: `src/utils/stateMachine/xbSemanticBuilder.test.ts`

**Interfaces:**
- Consumes: `convertTime`, `alignRuntimeThreshold`, `XBOwnerState`
- Produces: `XBStepOperationParameters` attached to Step `XBSemanticOperation`

- [ ] **Step 1: Write failing test for Step pre-lowering**

In `src/utils/stateMachine/xbSemanticBuilder.test.ts`:

```ts
it('lowers Step parameters into pre-aligned threshold milliseconds and state timer source', () => {
  const input = createStepTestBuildInput({ step_time: 0.3, initial_value: 0, final_value: 5 });
  const result = buildXBSemanticModel(input);
  const stepOp = result.ir?.operations['step1'];
  expect(stepOp?.stepParameters).toEqual({
    initialValue: 0,
    finalValue: 5,
    threshold: { milliseconds: 300, alignment: 'ceil-to-tick' },
    timerSource: {
      kind: 'stateElapsedTime',
      stateId: input.ownerState.stateId,
      stateIndexSymbol: input.ownerState.cIndexSymbol,
    },
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/stateMachine/xbSemanticBuilder.test.ts`  
Expected: FAIL due to missing `stepParameters`.

- [ ] **Step 3: Implement Step lowering in `xbSemanticBuilder.ts`**

Define `XBStepOperationParameters` in `xbSemanticModel.ts`:
```ts
export interface XBStepOperationParameters {
  readonly initialValue: number;
  readonly finalValue: number;
  readonly threshold: {
    readonly milliseconds: number;
    readonly alignment: 'ceil-to-tick' | 'exact';
  };
  readonly timerSource: {
    readonly kind: 'stateElapsedTime';
    readonly stateId: string;
    readonly stateIndexSymbol: string;
  };
}
```

In `xbSemanticBuilder.ts`, when processing a `Step` node:
1. Parse `step_time` (seconds), `initial_value`, `final_value`.
2. Convert `step_time` to ms via `convertTime(stepTime, 'seconds', 'milliseconds', baseTickMs)`.
3. Align ms via `alignRuntimeThreshold(ms, baseTickMs, 'ceil-to-tick')`.
4. Attach `stepParameters` to the operation object.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/stateMachine/xbSemanticBuilder.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/xbSemanticModel.ts src/utils/stateMachine/xbSemanticBuilder.ts src/utils/stateMachine/xbSemanticBuilder.test.ts
git commit -m "feat(xb): lower Step parameters into pre-aligned threshold milliseconds"
```

---

### Task 5: Refactor `xbCGenerator.ts` to Consume Resolved Symbols & Lowered Step Operations

**Files:**
- Modify: `src/utils/stateMachine/xbCGenerator.ts`
- Test: `src/utils/stateMachine/xbCGenerator.test.ts`

**Interfaces:**
- Consumes: `mapping.variable.cIdentifier`, `ownerState.cIndexSymbol`, `stepParameters`
- Produces: Pure C rendering without string sanitization or literal `state_timers[0U]`

- [ ] **Step 1: Write failing test for Step C generation with resolved owner state**

In `src/utils/stateMachine/xbCGenerator.test.ts`:

```ts
it('generates exact float-formatted Step block evaluation with owner state cIndexSymbol and resolved mapping', () => {
  const model = createStepModelFixture();
  const artifacts = generateCArtifacts(model);
  const source = artifacts.files.find((f) => f.name === 'sm_xbridges.c')?.content ?? '';
  expect(source).toContain('instance->state_timers[SM_ST_');
  expect(source).not.toContain('state_timers[0U]');
  expect(source).toContain('< 300U');
  expect(source).toContain('instance->data.xb6_step_output');
  expect(source).not.toContain('xb6_step_output_0001');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/stateMachine/xbCGenerator.test.ts`  
Expected: FAIL due to existing string sanitization or hardcoded `state_timers[0U]`.

- [ ] **Step 3: Implement renderer updates in `xbCGenerator.ts`**

1. Replace all Outport / Inport mapping writes that use `sanitizeIdentifier(mapping.smVarId)` or similar with `mapping.variable.cIdentifier`.
2. Replace all `state_timers[0U]` or `stateIndex ?? 0` fallbacks with `ownerState.cIndexSymbol`.
3. Update `Step` renderer to consume `operation.stepParameters`:
```c
const double xb6_step_value =
    (instance->state_timers[${op.stepParameters.timerSource.stateIndexSymbol}] < ${op.stepParameters.threshold.milliseconds}U)
        ? ${op.stepParameters.initialValue.toFixed(1)}
        : ${op.stepParameters.finalValue.toFixed(1)};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/stateMachine/xbCGenerator.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/xbCGenerator.ts src/utils/stateMachine/xbCGenerator.test.ts
git commit -m "fix(xb): consume resolved symbols, owner state index, and lowered Step operations in C renderer"
```

---

### Task 6: Implement Pre-Render Semantic Assertions and Post-Render Symbol Consistency Verification

**Files:**
- Modify: `src/utils/stateMachine/smSemanticValidator.ts`
- Modify: `src/utils/stateMachine/smCGenerator.ts`
- Test: `src/utils/stateMachine/smCGenerator.test.ts`

**Interfaces:**
- Produces: Pre-rendering assertions (`GEN-SEM-001..003`) and post-render check (`usedDataMembers ⊆ declaredDataMembers`)

- [ ] **Step 1: Write failing test for symbol consistency verification**

In `src/utils/stateMachine/smCGenerator.test.ts`:

```ts
it('detects undeclared SM_Data_t member access and fails verification with GEN_C_UNDECLARED_DATA_MEMBER', () => {
  const result = verifyGeneratedCStructure(invalidCoreCode, declaredDataMembers);
  expect(result.valid).toBe(false);
  expect(result.diagnostics[0].code).toBe('GEN_C_UNDECLARED_DATA_MEMBER');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/stateMachine/smCGenerator.test.ts`  
Expected: FAIL due to missing verification function.

- [ ] **Step 3: Implement pre-rendering and post-rendering validation**

1. In `smSemanticValidator.ts`, add checks verifying all mappings have resolved `variable`, all graphs have resolved `ownerState`, and all Step blocks have valid `stepParameters`.
2. In `smCGenerator.ts`, add `verifyGeneratedCStructure()`:
   - Extract declared members of `SM_Data_t` from generated `sm_config.h`.
   - Scan generated `sm_core.c` and `sm_xbridges.c` for `instance->data.<field>`.
   - If any accessed `<field>` is not in declared members, fail with `GEN_C_UNDECLARED_DATA_MEMBER`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/stateMachine/smCGenerator.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/smSemanticValidator.ts src/utils/stateMachine/smCGenerator.ts src/utils/stateMachine/smCGenerator.test.ts
git commit -m "feat(sm): add pre-render semantic validation and post-render data member consistency checker"
```

---

### Task 7: Integrate Host GCC Compilation Gate and Full Test Suite

**Files:**
- Modify: `src/utils/stateMachine/smCHarness.ts`
- Modify: `src/utils/stateMachine/xbCGenerator.test.ts`
- Test: `src/utils/stateMachine/xbCGenerator.test.ts`

**Interfaces:**
- Produces: `verifyHostCompilation()` invoking `gcc -std=c11 -Wall -Wextra -fsyntax-only`

- [ ] **Step 1: Write test for host GCC syntax compilation gate**

In `src/utils/stateMachine/xbCGenerator.test.ts`:

```ts
it('compiles generated C artifacts cleanly via host GCC syntax compilation', () => {
  const model = hybridXBridgesFixture();
  const artifacts = generateCArtifacts(model);
  const result = compileGeneratedCSyntax(artifacts);
  expect(result.success).toBe(true);
  expect(result.errors).toHaveLength(0);
});
```

- [ ] **Step 2: Run test to verify host syntax compilation**

Run: `npx vitest run src/utils/stateMachine/xbCGenerator.test.ts`  
Expected: PASS when GCC is available on host system.

- [ ] **Step 3: Implement host compilation helper in `smCHarness.ts`**

Add `compileGeneratedCSyntax(artifacts)` using `child_process.execFileSync('gcc', ['-std=c11', '-Wall', '-Wextra', '-fsyntax-only', ...files])`.

- [ ] **Step 4: Run full vitest suite on root stateMachine tests**

Run: `npx vitest run src/utils/stateMachine/xbCGenerator.test.ts src/utils/stateMachine/smCGenerator.test.ts`  
Expected: PASS for all tests.

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/smCHarness.ts src/utils/stateMachine/xbCGenerator.test.ts
git commit -m "feat(sm): integrate host GCC syntax compilation gate and verify full XBridge C generation suite"
```

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-08-xbridge-codegen-runtime-fixes.md`. Two execution options:

1. **Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - Execute tasks in this session using `executing-plans`, batch execution with checkpoints.

Which approach would you like to take?
