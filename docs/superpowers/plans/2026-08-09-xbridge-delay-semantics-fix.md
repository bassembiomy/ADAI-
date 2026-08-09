# XBridge DELAY State and Scheduling Semantics Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix XBridge DELAY lowering by implementing multi-sample circular history buffers `buffer[N * M]` and `index`, strict parameter validation, discrete sampling schedule gating, unit delay ($N=1$) optimization, and C code generation.

**Architecture:** Extend semantic builder to parse $N$, $IC$, and $T_s$, generating a state boundary with `buffer` array and `index` slots for $N > 1$. Update TS interpreter and C generator to perform circular buffer read and gated sample state update.

**Tech Stack:** TypeScript, Vitest test runner, C99 state-machine code generator.

## Global Constraints

- Preserve exact external signal dimensions ($M$) and temporal delay length ($N$).
- Memory allocation for delay history MUST be static (no `malloc`/`free`).
- Continuous solver substeps MUST NOT advance discrete DELAY state.
- $N=1$ delay MAY be optimized to omit `index` state slot.

---

### Task 1: Add `XBDelayParameters` and Update IR Semantic Types

**Files:**
- Modify: `src/utils/stateMachine/xbSemanticModel.ts:120-165`
- Test: `src/utils/stateMachine/xbSemanticModel.test.ts`

**Interfaces:**
- Consumes: Existing `XBSemanticOperation`
- Produces: `XBDelayParameters`, optional `delayParameters` field on `XBSemanticOperation`

- [ ] **Step 1: Write failing test for `XBDelayParameters` structure**

```ts
// src/utils/stateMachine/xbSemanticModel.test.ts
import { describe, expect, it } from 'vitest';
import type { XBDelayParameters, XBSemanticOperation } from './xbSemanticModel';

describe('XBDelayParameters', () => {
  it('supports delayParameters on XBSemanticOperation', () => {
    const delayParams: XBDelayParameters = {
      delayLength: 2,
      initialCondition: -1,
      samplePeriod: 0.1,
      isUnitDelay: false,
    };
    const op: Partial<XBSemanticOperation> = { delayParameters: delayParams };
    expect(op.delayParameters?.delayLength).toBe(2);
    expect(op.delayParameters?.initialCondition).toBe(-1);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/utils/stateMachine/xbSemanticModel.test.ts`
Expected: FAIL with missing module/export `XBDelayParameters`.

- [ ] **Step 3: Add `XBDelayParameters` interface to `xbSemanticModel.ts`**

```ts
export interface XBDelayParameters {
  readonly delayLength: number;
  readonly initialCondition: number;
  readonly samplePeriod: number;
  readonly isUnitDelay: boolean;
}
```

Add `readonly delayParameters?: XBDelayParameters;` to `XBSemanticOperation`.

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run src/utils/stateMachine/xbSemanticModel.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/xbSemanticModel.ts src/utils/stateMachine/xbSemanticModel.test.ts
git commit -m "feat(xbridge): add XBDelayParameters to semantic model IR"
```

---

### Task 2: Implement Delay Parameter Parsing, Validation, and State Boundary in Builder

**Files:**
- Modify: `src/utils/stateMachine/xbSemanticBuilder.ts:650-890`
- Modify: `src/utils/stateMachine/xbSemanticValidator.ts`
- Test: `src/utils/stateMachine/xbSemanticBuilder.test.ts`

**Interfaces:**
- Consumes: Node parameters `delay_length`/`delayLength`/`N`, `initialCondition`/`IC`, `sampleTime`/`Ts`
- Produces: `XBSemanticStateBoundary` with `buffer` (size $N \times M$) and `index` (for $N > 1$) slots, diagnostics on invalid parameters

- [ ] **Step 1: Write failing tests for multi-sample DELAY state boundary and validation**

Add tests to `src/utils/stateMachine/xbSemanticBuilder.test.ts`:
- Test building `DELAY` node with `delay_length: 2`, `initialCondition: -1`: check `buffer` slot has `elementCount: 2` (or shape length 2) and `initialValues: [-1, -1]`, and `index` slot present with `initialValues: [0]`.
- Test `delay_length: 1`: check single-element history, `isUnitDelay: true`.
- Test invalid `delay_length` (missing, 0, -1, non-integer): check diagnostics contains `XB_DELAY_LENGTH_INVALID` or `XB_DELAY_LENGTH_OUT_OF_RANGE`.

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/utils/stateMachine/xbSemanticBuilder.test.ts`
Expected: FAIL due to missing multi-element `buffer` and `index` slots for `DELAY`.

- [ ] **Step 3: Implement DELAY state boundary builder logic in `xbSemanticBuilder.ts`**

Update `stateBoundaryForNode` in `xbSemanticBuilder.ts`:
- Handle `node.type === 'DELAY' || node.type === 'UNIT_DELAY'`:
  - Extract `delayLength`: resolve parameter `delay_length`, `delayLength`, `delay_samples`, `N`, or `delayTime / sampleTime`. Default 1 for `UNIT_DELAY`.
  - Validate `delayLength`: integer $\ge 1$, $\le 65536$. If invalid, emit diagnostic (`XB_DELAY_LENGTH_INVALID`, `XB_DELAY_LENGTH_OUT_OF_RANGE`, etc.).
  - Extract initial condition $IC$ (default 0).
  - Calculate total buffer elements: $N \times M$ where $M$ is output signal element count.
  - Create `buffer` slot with `initialValues: Array(N * M).fill(IC)` and shape `vector[N * M]` (or matrix/scalar as appropriate).
  - If $N > 1$, create `index` slot (`role: 'index'`, numeric type `uint32`, `shape: scalar`, `initialValues: [0]`).
  - Populate `delayParameters` on the returned operation.

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run src/utils/stateMachine/xbSemanticBuilder.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/xbSemanticBuilder.ts src/utils/stateMachine/xbSemanticBuilder.test.ts
git commit -m "feat(xbridge): implement DELAY state boundary and parameter validation"
```

---

### Task 3: Implement TypeScript Interpreter Execution for Circular Buffer `DELAY(N)`

**Files:**
- Modify: `src/utils/stateMachine/xbInterpreter.ts:1335-1360`
- Test: `src/utils/stateMachine/xbInterpreter.test.ts`

**Interfaces:**
- Consumes: `XBSemanticOperation` with `buffer` and `index` state slots
- Produces: Correct $N$-sample delayed output sequence and sample-gated state update in TS interpreter

- [ ] **Step 1: Write failing interpreter test for DELAY(2)**

In `src/utils/stateMachine/xbInterpreter.test.ts`:
- Create test for `DELAY` with $N=2, IC=-1$, input constant `7`.
- Run for 4 discrete sample steps.
- Expect output sequence: `-1, -1, 7, 7`.
- Create test for solver substep independence: discrete step = 100 ms, solver step = 10 ms (10 substeps per tick). Verify output does NOT change during the 10 substeps of a single tick.

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/utils/stateMachine/xbInterpreter.test.ts`
Expected: FAIL (currently output changes after 1 sample or during substeps).

- [ ] **Step 3: Implement circular buffer read and state update in `xbInterpreter.ts`**

In `xbInterpreter.ts`:
- For `DELAY` / `UNIT_DELAY`:
  - **Output evaluation**: Read from `buffer` slot at `index * M ... index * M + M - 1`. If $N=1$, read `buffer[0...M-1]`.
  - **State update**:
    - Only update if execution schedule matches discrete sample tick (`isSampleStep`).
    - Write `input` into `buffer[index * M ... index * M + M - 1]`.
    - If $N > 1$, update `index` slot: `(index + 1) % N`.

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run src/utils/stateMachine/xbInterpreter.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/xbInterpreter.ts src/utils/stateMachine/xbInterpreter.test.ts
git commit -m "feat(xbridge): implement circular buffer DELAY execution in interpreter"
```

---

### Task 4: Implement Static C Code Generation for Circular Buffer `DELAY(N)`

**Files:**
- Modify: `src/utils/stateMachine/xbCGenerator.ts:2795-2810`
- Test: `src/utils/stateMachine/xbCGenerator.test.ts`

**Interfaces:**
- Consumes: IR operation `DELAY` with `buffer` and `index` slots
- Produces: C struct declarations, state initialization code, delayed output read expression, and sample-gated circular index increment code

- [ ] **Step 1: Write failing C generator test for DELAY(2)**

In `src/utils/stateMachine/xbCGenerator.test.ts`:
- Test C generation for `DELAY` with $N=2, IC=-1$.
- Verify generated state struct contains `float state_XB8_Delay_buffer[2];` and `uint32_t state_XB8_Delay_index;`.
- Verify generated state init populates `buffer[0] = -1.0F; buffer[1] = -1.0F; index = 0U;`.
- Verify output read reads `buffer[index]`.
- Verify state update writes `buffer[index] = input; index = (index + 1U) % 2U;`.

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/utils/stateMachine/xbCGenerator.test.ts`
Expected: FAIL (currently generates single state slot `state_XB8_Delay_y_state`).

- [ ] **Step 3: Implement `DELAY` code rendering in `xbCGenerator.ts`**

In `xbCGenerator.ts`:
- Update `stateLayout` to declare array buffer dimensions for `buffer` slot and `uint32_t` for `index` slot.
- Update state initialization renderer to fill all $N \times M$ elements with initial condition $IC$ and set `index = 0`.
- Update output evaluation to index into `buffer[index * M + m]`.
- Update state update block (gated by discrete schedule counter `if (counter == 0)`) to assign `buffer[index * M + m] = input` and advance `index = (index + 1U) % N`.

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run src/utils/stateMachine/xbCGenerator.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/xbCGenerator.ts src/utils/stateMachine/xbCGenerator.test.ts
git commit -m "feat(xbridge): implement circular buffer DELAY C code generation"
```

---

### Task 5: End-to-End Conformance and Differential Verification Tests

**Files:**
- Modify: `src/utils/stateMachine/smDifferential.test.ts`
- Modify: `src/utils/stateMachine/xbCConformanceCases.ts`

**Interfaces:**
- Consumes: C generator, TS interpreter
- Produces: Full differential test pass for $N=1, 2, 3$, solver substep independence, variable inputs, and initial conditions

- [ ] **Step 1: Add DELAY differential conformance tests**

In `src/utils/stateMachine/smDifferential.test.ts`:
- Add test case Batch5B equivalent: $N=2, IC=-1, input=7$. Verify 10 solver substeps per 100ms tick produce `-1` output for ticks 0 and 1, and `7` for tick 2.
- Add test cases for $N=1, N=3, N=5$.
- Add test case for rate independence (changing solver step 10ms to 5ms does not alter tick outputs).

- [ ] **Step 2: Run differential test suite**

Run: `npx vitest run src/utils/stateMachine/smDifferential.test.ts`
Expected: PASS.

- [ ] **Step 3: Run all state machine test suites**

Run: `npx vitest run src/utils/stateMachine/`
Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/utils/stateMachine/smDifferential.test.ts src/utils/stateMachine/xbCConformanceCases.ts
git commit -m "test(xbridge): add full differential verification test suite for DELAY(N)"
```
