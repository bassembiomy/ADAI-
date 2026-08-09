# XBridge DELAY Indexed State Lowering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement explicit storage category classification (`scalar`, `array`, `matrix`, `integral_index`) in XBridge IR and C code generator to prevent generic scalar lowering from emitting invalid unindexed array accesses or casts on `DELAY` history buffers.

**Architecture:** Extend `XBSemanticStateSlot` with `storageCategory`. Require indexed array access `buffer[index * M + m]` and `memcpy` snapshot/rollback for array state. Add a structural C AST validator pass in `xbCGenerator.ts` to reject scalar array operations before code generation returns success.

**Tech Stack:** TypeScript, C11, Vitest, GCC/Clang/MSVC compiler test harnesses.

## Global Constraints

- Storage categories MUST be explicitly represented (`'scalar'`, `'array'`, `'matrix'`, `'integral_index'`).
- Circular buffer indices MUST be represented using `uint32_t` (`{ kind: 'fixed', wordLength: 32, fractionLength: 0, signed: false }`).
- Array state snapshot/rollback MUST use `memcpy` in C rendering.
- AST validator MUST reject array address casts `(double)buffer` or unindexed array assignments `buffer = input`.
- C compilation gate MUST pass before returning PASS for differential tests.

---

### Task 1: Add Storage Categories to `XBSemanticStateSlot` and Update `xbSemanticBuilder.ts`

**Files:**
- Modify: `src/utils/stateMachine/xbSemanticModel.ts`
- Modify: `src/utils/stateMachine/xbSemanticBuilder.ts`
- Test: `src/utils/stateMachine/xbSemanticModel.test.ts`
- Test: `src/utils/stateMachine/xbSemanticBuilder.test.ts`

**Interfaces:**
- Consumes: `XBNumericType`, `XBShape`
- Produces: `export type XBStorageCategory = 'scalar' | 'array' | 'matrix' | 'integral_index';` attached as `storageCategory?: XBStorageCategory` to `XBSemanticStateSlot`.

- [ ] **Step 1: Write failing test for XBStorageCategory**

Edit `src/utils/stateMachine/xbSemanticModel.test.ts`:
```typescript
import { describe, expect, it } from 'vitest';
import type { XBSemanticStateSlot } from './xbSemanticModel';

describe('XBStorageCategory model extensions', () => {
  it('supports storageCategory on state slots', () => {
    const slot: XBSemanticStateSlot = {
      id: 'delay:buffer$state',
      role: 'buffer',
      signalId: 'delay:y',
      numericType: { kind: 'float32' },
      shape: { kind: 'vector', length: 2 },
      initialValues: [-1, -1],
      storageCategory: 'array',
    };
    expect(slot.storageCategory).toBe('array');
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run ./src/utils/stateMachine/xbSemanticModel.test.ts --exclude ".worktrees/**"`
Expected: FAIL due to missing `storageCategory` type definition.

- [ ] **Step 3: Add XBStorageCategory to xbSemanticModel.ts and update xbSemanticBuilder.ts**

In `src/utils/stateMachine/xbSemanticModel.ts`:
```typescript
export type XBStorageCategory = 'scalar' | 'array' | 'matrix' | 'integral_index';

export interface XBSemanticStateSlot {
  readonly id: string;
  readonly role: string;
  readonly signalId: string | null;
  readonly numericType: XBNumericType;
  readonly shape: XBShape;
  readonly initialValues: readonly number[];
  readonly storageCategory?: XBStorageCategory;
}
```

In `src/utils/stateMachine/xbSemanticBuilder.ts`:
Set `storageCategory: 'array'` on `bufferSlot` when `delayLength > 1` (or `'scalar'` when `delayLength === 1`), and `storageCategory: 'integral_index'` on `indexSlot`.

- [ ] **Step 4: Run test to verify PASS**

Run: `npx vitest run ./src/utils/stateMachine/xbSemanticModel.test.ts ./src/utils/stateMachine/xbSemanticBuilder.test.ts --exclude ".worktrees/**"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/xbSemanticModel.ts src/utils/stateMachine/xbSemanticBuilder.ts src/utils/stateMachine/xbSemanticModel.test.ts src/utils/stateMachine/xbSemanticBuilder.test.ts
git commit -m "feat(xbridge): add XBStorageCategory to semantic state slots and builder"
```

---

### Task 2: Storage-Category-Aware Interpreter Execution in `xbInterpreter.ts`

**Files:**
- Modify: `src/utils/stateMachine/xbInterpreter.ts`
- Test: `src/utils/stateMachine/xbInterpreter.test.ts`

**Interfaces:**
- Consumes: `XBSemanticStateSlot` with `storageCategory`
- Produces: `evaluateOperationOutput` and `statefulUpdate` handling indexed buffer accesses for `storageCategory: 'array'`.

- [ ] **Step 1: Write failing unit test for DELAY indexed state evolution**

In `src/utils/stateMachine/xbInterpreter.test.ts`:
```typescript
it('GEN-XB-DELAY-009/010/011: uses indexed buffer and uint32 index state for DELAY(N=2, IC=-1)', () => {
  const runtime = createTestRuntimeWithMultiSampleDelay();
  expect(runtime.stateSlots['delay:index$state']).toEqual([0]);
  stepXBState(runtime, { input: 7 });
  expect(runtime.signals['delay:y']).toEqual([-1]);
  expect(runtime.stateSlots['delay:buffer$state']).toEqual([7, -1]);
  expect(runtime.stateSlots['delay:index$state']).toEqual([1]);
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run ./src/utils/stateMachine/xbInterpreter.test.ts --exclude ".worktrees/**"`
Expected: FAIL or verify behavior against storage categories.

- [ ] **Step 3: Update evaluateOperationOutput and statefulUpdate in xbInterpreter.ts**

Ensure `evaluateOperationOutput` dereferences `buffer[index * M ... index * M + M - 1]` for `storageCategory === 'array'`, and `statefulUpdate` assigns `buffer[index * M ... index * M + M - 1] = input` and increments `index = (index + 1) % N`.

- [ ] **Step 4: Run tests to verify PASS**

Run: `npx vitest run ./src/utils/stateMachine/xbInterpreter.test.ts --exclude ".worktrees/**"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/xbInterpreter.ts src/utils/stateMachine/xbInterpreter.test.ts
git commit -m "feat(xbridge): implement storage-category-aware interpreter DELAY execution"
```

---

### Task 3: C Generator Array Snapshot/Rollback and AST Structural Validator in `xbCGenerator.ts`

**Files:**
- Modify: `src/utils/stateMachine/xbCGenerator.ts`
- Test: `src/utils/stateMachine/xbCGenerator.test.ts`

**Interfaces:**
- Consumes: `XBSemanticStateSlot` with `storageCategory`
- Produces: `memcpy` based array state snapshotting & rollback, and AST structural validation function `validateGeneratedCAST`.

- [ ] **Step 1: Write failing test for array memcpy snapshot and AST validation**

In `src/utils/stateMachine/xbCGenerator.test.ts`:
```typescript
it('GEN-XB-DELAY-017/C-006: renders memcpy for array state snapshot and passes AST structural validation', () => {
  const cCode = generateCCodeWithMultiSampleDelay();
  expect(cCode).toContain('memcpy');
  expect(cCode).not.toMatch(/\(double\)state_[A-Za-z0-9_]+_buffer/);
  expect(cCode).not.toMatch(/instance->[A-Za-z0-9_.]+\s*=\s*instance->[A-Za-z0-9_.]+state_[A-Za-z0-9_]+_buffer;/);
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run ./src/utils/stateMachine/xbCGenerator.test.ts --exclude ".worktrees/**"`
Expected: FAIL

- [ ] **Step 3: Implement array snapshot/rollback and AST validation in xbCGenerator.ts**

In `xbCGenerator.ts`:
1. In `renderTransactionalStateUpdates`, check `slot.storageCategory` or `slot.shape.kind === 'vector'`.
   If `'array'` or `'matrix'`, emit:
   `declaration: `${type} ${name}${shapeSuffix(slot.shape)};`, save: `(void)memcpy(&${name}, &instance->${member}.${field}, sizeof(${name}));`, restore: `(void)memcpy(&instance->${member}.${field}, &${name}, sizeof(${name}));``.
2. Add `validateGeneratedCAST(cCode: string): void` inside `generateCArtifacts` to inspect generated code and throw `Error` if invalid scalar buffer casts/assignments are detected.

- [ ] **Step 4: Run tests to verify PASS**

Run: `npx vitest run ./src/utils/stateMachine/xbCGenerator.test.ts --exclude ".worktrees/**"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/xbCGenerator.ts src/utils/stateMachine/xbCGenerator.test.ts
git commit -m "feat(xbridge): implement array memcpy snapshotting and AST C validation pass"
```

---

### Task 4: End-to-End Differential Verification and Strict C11 Compilation Tests

**Files:**
- Modify: `src/utils/stateMachine/smDifferential.test.ts`
- Test: `src/utils/stateMachine/smDifferential.test.ts`

**Interfaces:**
- Consumes: C code generator artifacts and interpreter
- Produces: Verification of requirements `GEN-XB-DELAY-TEST-008` through `TEST-012`.

- [ ] **Step 1: Write failing differential tests for GEN-XB-DELAY-TEST-008 through TEST-012**

In `src/utils/stateMachine/smDifferential.test.ts`:
```typescript
it('GEN-XB-DELAY-TEST-008..012: verifies strict C11 compilation, indexed buffer access, uint32 index, and reference sequence [-1, -1, 7, 7]', () => {
  const fixture = {
    name: 'flat-priority' as const,
    model: multiSampleDelayFixture(),
    steps: [
      { kind: 'step' as const },
      { kind: 'step' as const },
      { kind: 'step' as const },
    ],
  };
  const expected = runInterpreterTrace(fixture);
  const actual = compileAndRunCTrace(fixture);

  expect(expected.map((frame) => frame.data.delay_y)).toEqual([-1, -1, 7, 7]);
  expect(compareSemanticTraces(expected, actual)).toBeNull();
});
```

- [ ] **Step 2: Run test to verify failure/PASS**

Run: `npx vitest run ./src/utils/stateMachine/smDifferential.test.ts --exclude ".worktrees/**"`
Expected: PASS

- [ ] **Step 3: Run complete test suite**

Run: `npx vitest run ./src/utils/stateMachine/xbSemanticModel.test.ts ./src/utils/stateMachine/xbSemanticBuilder.test.ts ./src/utils/stateMachine/xbInterpreter.test.ts ./src/utils/stateMachine/xbCGenerator.test.ts ./src/utils/stateMachine/smDifferential.test.ts --exclude ".worktrees/**"`
Expected: PASS (All tests passing)

- [ ] **Step 4: Commit**

```bash
git add src/utils/stateMachine/smDifferential.test.ts
git commit -m "test(xbridge): add end-to-end differential verification for DELAY indexed state lowering"
```
