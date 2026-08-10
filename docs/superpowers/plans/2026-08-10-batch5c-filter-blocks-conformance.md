# Batch5C – Filter Blocks Conformance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Achieve paired executable conformance (Interpreter vs Generated-C) and enable embedded C code generation for canonical filter block types (`LOW_PASS_FILTER`, `HIGH_PASS_FILTER`, `MOVING_AVERAGE`) while opening the program's semantic generation gate.

**Architecture:** Parameter normalization maps input model aliases to canonical parameter names (`cutoff_frequency`, `sample_time`, `initial_condition`, `window_size`). `xbSemanticBuilder` constructs authoritative state slots (`prev_y`, `prev_u`, `buffer`, `index`). `xbInterpreter` and `xbCGenerator` execute identical discrete filter step math. `xbCConformanceCases` verifies sample-by-sample output agreement within $10^{-4}$ tolerance before `xbCapabilities` and the semantic gate mark Batch5C `CONFORMANT / GENERATION ENABLED`.

**Tech Stack:** TypeScript (Node.js), Vitest, Strict C99.

## Global Constraints

- Retain exact block names `LOW_PASS_FILTER`, `HIGH_PASS_FILTER`, `MOVING_AVERAGE` with case-sensitive matching.
- Model JSON remains untouched.
- Authoritative state layout defined in Semantic IR; no model-side legacy state fields emitted to C.
- `MOVING_AVERAGE`: Sample insertion before output calculation.
- `HIGH_PASS_FILTER`: `prev_u(0) = initial_condition` and `prev_y(0) = initial_condition`.
- Numerical comparison tolerance: $1e-4$.

---

### Task 1: Parameter Normalization & Semantic IR State Slots

**Files:**
- Modify: `src/utils/stateMachine/xbSemanticBuilder.ts`
- Test: `src/utils/stateMachine/xbInterpreter.test.ts`

**Interfaces:**
- Produces: `stateBoundaryForNode` for `LOW_PASS_FILTER`, `HIGH_PASS_FILTER`, `MOVING_AVERAGE` in `xbSemanticBuilder.ts`.

- [ ] **Step 1: Write the failing test for parameter normalization and IR state slots**

```typescript
it('builds canonical state slots for filter blocks with parameter normalization', async () => {
  const { BLOCK_LIBRARY } = await import('../../engine/xbridges/BlockDefinitions');
  const { buildXBSemanticIR } = await import('./xbSemanticBuilder');
  const lpfNode = BLOCK_LIBRARY.LOW_PASS_FILTER('lpf', { cutoffFrequency: 2, dt: 0.05, initialCondition: 1.5 });
  const hpfNode = BLOCK_LIBRARY.HIGH_PASS_FILTER('hpf', { fc: 5, sampleTime: 0.01, ic: 0.5 });
  const maNode = BLOCK_LIBRARY.MOVING_AVERAGE('ma', { windowSize: 3, dt: 0.1, ic: 2.0 });

  const result = buildXBSemanticIR({
    model: {
      schemaVersion: 1,
      nodes: [lpfNode, hpfNode, maNode],
      edges: [],
      mappings: [],
      solver: { kind: 'euler', stepSeconds: 0.01 },
      policy: { memory: 'reset', numericFault: 'escalate' },
    },
    target: { supportsFloat16: true, supportsFloat32: true, supportsFloat64: true, supportsFixedPoint: true },
  });

  expect(result.diagnostics).toHaveLength(0);
  const lpfOp = result.ir!.operations['lpf'];
  expect(lpfOp.state?.slots).toHaveLength(1);
  expect(lpfOp.state?.slots[0].role).toBe('prev_y');
  expect(lpfOp.state?.slots[0].initialValues).toEqual([1.5]);

  const hpfOp = result.ir!.operations['hpf'];
  expect(hpfOp.state?.slots).toHaveLength(2);
  expect(hpfOp.state?.slots.map(s => s.role)).toEqual(['prev_y', 'prev_u']);
  expect(hpfOp.state?.slots[0].initialValues).toEqual([0.5]);
  expect(hpfOp.state?.slots[1].initialValues).toEqual([0.5]);

  const maOp = result.ir!.operations['ma'];
  expect(maOp.state?.slots).toHaveLength(2);
  expect(maOp.state?.slots.map(s => s.role)).toEqual(['buffer', 'index']);
  expect(maOp.state?.slots[0].initialValues).toEqual([2.0, 2.0, 2.0]);
  expect(maOp.state?.slots[1].initialValues).toEqual([0]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/stateMachine/xbInterpreter.test.ts --exclude ".worktrees/**"`
Expected: FAIL with missing slots / parameters.

- [ ] **Step 3: Implement parameter normalization and filter state slots in `xbSemanticBuilder.ts`**

Add filter parameter normalization and `stateBoundaryForNode` clauses:
```typescript
if (node.type === 'LOW_PASS_FILTER') {
  const output = outputByPort('y') ?? signals[outputSignalIds[0] ?? ''];
  if (output === undefined) return boundary([]);
  const ic = Number(firstPresentParameter(node.parameters as UnknownRecord, ['initial_condition', 'initialCondition', 'ic']) ?? 0);
  return boundary([{
    id: `${node.id}:prev_y$state`,
    role: 'prev_y',
    signalId: null,
    numericType: output.numericType,
    shape: { kind: 'scalar' },
    initialValues: [ic],
  }]);
}

if (node.type === 'HIGH_PASS_FILTER') {
  const output = outputByPort('y') ?? signals[outputSignalIds[0] ?? ''];
  if (output === undefined) return boundary([]);
  const ic = Number(firstPresentParameter(node.parameters as UnknownRecord, ['initial_condition', 'initialCondition', 'ic']) ?? 0);
  return boundary([
    {
      id: `${node.id}:prev_y$state`,
      role: 'prev_y',
      signalId: null,
      numericType: output.numericType,
      shape: { kind: 'scalar' },
      initialValues: [ic],
    },
    {
      id: `${node.id}:prev_u$state`,
      role: 'prev_u',
      signalId: null,
      numericType: output.numericType,
      shape: { kind: 'scalar' },
      initialValues: [ic],
    },
  ]);
}

if (node.type === 'MOVING_AVERAGE') {
  const output = outputByPort('y') ?? signals[outputSignalIds[0] ?? ''];
  if (output === undefined) return boundary([]);
  const windowSize = Math.max(1, Math.floor(Number(firstPresentParameter(node.parameters as UnknownRecord, ['window_size', 'windowSize', 'N']) ?? 4)));
  const ic = Number(firstPresentParameter(node.parameters as UnknownRecord, ['initial_condition', 'initialCondition', 'ic']) ?? 0);
  return boundary([
    {
      id: `${node.id}:buffer$state`,
      role: 'buffer',
      signalId: null,
      numericType: output.numericType,
      shape: { kind: 'vector', length: windowSize },
      initialValues: Array.from({ length: windowSize }, () => ic),
    },
    {
      id: `${node.id}:index$state`,
      role: 'index',
      signalId: null,
      numericType: { kind: 'fixed', signed: false, wordLength: 32, fractionLength: 0 },
      shape: { kind: 'scalar' },
      initialValues: [0],
    },
  ]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/stateMachine/xbInterpreter.test.ts --exclude ".worktrees/**"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/xbSemanticBuilder.ts src/utils/stateMachine/xbInterpreter.test.ts
git commit -m "feat(xbridges): add filter parameter normalization and state slots"
```

---

### Task 2: Canonical Interpreter Filter Execution

**Files:**
- Modify: `src/utils/stateMachine/xbInterpreter.ts`
- Test: `src/utils/stateMachine/xbInterpreter.test.ts`

**Interfaces:**
- Consumes: Filter state slots from Task 1.
- Produces: `writeStateOutputs` and `statefulUpdate` filter support.

- [ ] **Step 1: Write failing test for interpreter filter evaluation**

```typescript
it('evaluates LOW_PASS_FILTER, HIGH_PASS_FILTER, and MOVING_AVERAGE correctly in interpreter', async () => {
  // Test low pass filter exponential smoothing, high pass filter, moving average sample insertion order
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/stateMachine/xbInterpreter.test.ts --exclude ".worktrees/**"`
Expected: FAIL.

- [ ] **Step 3: Implement filter output evaluation and state updates in `xbInterpreter.ts`**

Add filter handlers in `writeStateOutputs` and `statefulUpdate`:
- `LOW_PASS_FILTER`:
  $$\tau = \frac{1}{2 \pi f_c}, \quad \alpha = \frac{\Delta t}{\tau + \Delta t}, \quad y[k] = (1 - \alpha) \cdot \text{prev\_y} + \alpha \cdot u[k]$$
- `HIGH_PASS_FILTER`:
  $$\tau = \frac{1}{2 \pi f_c}, \quad \alpha = \frac{\tau}{\tau + \Delta t}, \quad y[k] = \alpha \cdot (\text{prev\_y} + u[k] - \text{prev\_u})$$
- `MOVING_AVERAGE`:
  Insert $u[k]$ into `buffer[index]`, increment `index = (index + 1) % W`, calculate output $y[k] = \frac{1}{W} \sum \text{buffer}[i]$.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/stateMachine/xbInterpreter.test.ts --exclude ".worktrees/**"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/xbInterpreter.ts src/utils/stateMachine/xbInterpreter.test.ts
git commit -m "feat(xbridges): implement canonical interpreter execution for filter blocks"
```

---

### Task 3: Generated-C Emitter Code Generation for Filters

**Files:**
- Modify: `src/utils/stateMachine/xbCGenerator.ts`
- Test: `src/utils/stateMachine/xbCGenerator.test.ts`

**Interfaces:**
- Consumes: Semantic IR operations and slots for filter blocks.
- Produces: C struct members, init code, step math, and state update code in generated C.

- [ ] **Step 1: Write failing test for C code generation of filters**

```typescript
it('generates valid C code for LOW_PASS_FILTER, HIGH_PASS_FILTER, and MOVING_AVERAGE', async () => {
  // Test code generation contains correct filter structs, alpha calculations, ring buffer updates
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/stateMachine/xbCGenerator.test.ts --exclude ".worktrees/**"`
Expected: FAIL.

- [ ] **Step 3: Implement C emitter logic for filter blocks in `xbCGenerator.ts`**

Generate strict C99 statements for filter step computation and state updates.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/stateMachine/xbCGenerator.test.ts --exclude ".worktrees/**"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/xbCGenerator.ts src/utils/stateMachine/xbCGenerator.test.ts
git commit -m "feat(xbridges): emit C code for LOW_PASS_FILTER, HIGH_PASS_FILTER, and MOVING_AVERAGE"
```

---

### Task 4: Capability Registry & Paired Executable Conformance Cases

**Files:**
- Modify: `src/utils/stateMachine/xbCapabilities.ts`
- Modify: `src/utils/stateMachine/xbCConformanceCases.ts`
- Test: `src/utils/stateMachine/smDifferential.test.ts`

**Interfaces:**
- Consumes: Interpreter and C emitter from Tasks 2 & 3.
- Produces: Registered `T10-INT-FILTERS` and `T10-C99-FILTERS` executable test cases.

- [ ] **Step 1: Write failing test for paired filter conformance**

```typescript
it('executes paired conformance tests for LOW_PASS_FILTER, HIGH_PASS_FILTER, and MOVING_AVERAGE', async () => {
  // Execute identical test sequences through Interpreter vs Generated-C and check 1e-4 tolerance match
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/stateMachine/smDifferential.test.ts --exclude ".worktrees/**"`
Expected: FAIL.

- [ ] **Step 3: Move filters to `XB_CAPABILITIES` and add `T10-INT-FILTERS` / `T10-C99-FILTERS` fixtures**

Update `xbCapabilities.ts` and `xbCConformanceCases.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/stateMachine/smDifferential.test.ts --exclude ".worktrees/**"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/xbCapabilities.ts src/utils/stateMachine/xbCConformanceCases.ts src/utils/stateMachine/smDifferential.test.ts
git commit -m "feat(xbridges): add paired executable conformance cases for filter blocks"
```

---

### Task 5: Semantic Generation Gate Negative and Positive Tests

**Files:**
- Modify: `src/utils/stateMachine/xbSemanticValidator.test.ts` or gate tests

**Interfaces:**
- Consumes: Capability registry and paired conformance status.
- Produces: Gate diagnostic validation (Negative: unverified block rejected with diagnostic; Positive: verified blocks approved).

- [ ] **Step 1: Write failing negative and positive gate tests**

```typescript
it('verifies semantic gate rejects unverified blocks and opens for conformant filter blocks', async () => {
  // Verify negative gate diagnostic when paired conformance is missing
  // Verify positive gate approval when paired conformance passes
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/stateMachine/xbSemanticValidator.test.ts --exclude ".worktrees/**"`
Expected: FAIL.

- [ ] **Step 3: Implement gate verification logic and verify diagnostic messages**

Ensure gate emits proper diagnostic structure when blocked and opens when all criteria pass.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/stateMachine/xbSemanticValidator.test.ts --exclude ".worktrees/**"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/xbSemanticValidator.test.ts
git commit -m "test(xbridges): verify semantic gate negative and positive conformance checks for Batch5C"
```
