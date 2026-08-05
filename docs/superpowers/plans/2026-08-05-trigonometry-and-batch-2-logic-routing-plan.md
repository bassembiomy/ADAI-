# Trigonometry Reclassification & Batch 2 (Logic & Routing) Dual Conformance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reclassify Trigonometry blocks with clear `'Simulation supported / Generated-C conformance missing'` diagnostic reason, and promote 12 Logic & Routing blocks to dual executable conformance between the canonical interpreter and C generator.

**Architecture:** Extend capability declarations in `xbCapabilities.ts` with dedicated conformance case IDs, implement evaluation in `xbInterpreter.ts` and C code rendering in `xbCGenerator.ts`, and cover with TDD tests in `xbCapabilities.test.ts`, `xbInterpreter.test.ts`, `xbCGenerator.test.ts`, and `xbSemanticValidator.test.ts`.

**Tech Stack:** TypeScript, C99 Code Generator, Vitest

## Global Constraints

- Preserve all existing public API signatures and exports.
- Follow strict TDD (failing test -> run -> implement -> run -> commit).
- File paths:
  - Spec: `g:\adia project\docs\superpowers\specs\2026-08-05-trigonometry-and-batch-2-logic-routing-design.md`
  - Capabilities: `g:\adia project\src\utils\stateMachine\xbCapabilities.ts`
  - Capabilities test: `g:\adia project\src\utils\stateMachine\xbCapabilities.test.ts`
  - Interpreter: `g:\adia project\src\utils\stateMachine\xbInterpreter.ts`
  - Interpreter test: `g:\adia project\src\utils\stateMachine\xbInterpreter.test.ts`
  - C Generator: `g:\adia project\src\utils\stateMachine\xbCGenerator.ts`
  - C Generator test: `g:\adia project\src\utils\stateMachine\xbCGenerator.test.ts`
  - Semantic Validator test: `g:\adia project\src\utils\stateMachine\xbSemanticValidator.test.ts`

---

### Task 1: Reclassify Trigonometry Blocks & Add Capability Diagnostic Tests

**Files:**
- Modify: `src/utils/stateMachine/xbCapabilities.ts`
- Test: `src/utils/stateMachine/xbCapabilities.test.ts`
- Test: `src/utils/stateMachine/xbSemanticValidator.test.ts`

**Interfaces:**
- Produces: `TRIGONOMETRY_UNPAIRED_OPERATIONS` record in `xbCapabilities.ts` with reason `'Simulation supported / Generated-C conformance missing'`.

- [ ] **Step 1: Write failing test in `xbCapabilities.test.ts`**

```typescript
it('classifies trigonometry blocks as simulation supported but missing generated-C conformance', () => {
  for (const type of ['SIN', 'COS', 'TAN', 'COT', 'SEC', 'COSEC', 'ASIN', 'ACOS', 'ATAN', 'ACOT', 'ASEC', 'ACOSEC', 'SINH', 'COSH', 'TANH', 'COTH', 'SECH', 'COSECH', 'ASINH', 'ACOSH', 'ATANH', 'ACOTH', 'ASECH', 'ACOSECH']) {
    const cap = getXBBlockCapability(type);
    expect(cap?.codegen).toBe(false);
    expect(cap?.reason).toBe('Simulation supported / Generated-C conformance missing');
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/stateMachine/xbCapabilities.test.ts`
Expected: FAIL with reason mismatch (`"The canonical interpreter and generated-C paths do not yet have paired executable conformance coverage."` vs `"Simulation supported / Generated-C conformance missing"`).

- [ ] **Step 3: Update `xbCapabilities.ts` with `TRIGONOMETRY_UNPAIRED_OPERATIONS`**

In `src/utils/stateMachine/xbCapabilities.ts`:
Separate the 24 trigonometry types into:
```typescript
const TRIGONOMETRY_UNPAIRED_OPERATIONS = hostOnlySet([
  'SIN', 'COS', 'TAN', 'COT', 'SEC', 'COSEC', 'ASIN', 'ACOS', 'ATAN',
  'ACOT', 'ASEC', 'ACOSEC', 'SINH', 'COSH', 'TANH', 'COTH', 'SECH',
  'COSECH', 'ASINH', 'ACOSH', 'ATANH', 'ACOTH', 'ASECH', 'ACOSECH',
], 'Simulation supported / Generated-C conformance missing');
```
And merge `...TRIGONOMETRY_UNPAIRED_OPERATIONS` into `XB_CAPABILITIES`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/stateMachine/xbCapabilities.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/xbCapabilities.ts src/utils/stateMachine/xbCapabilities.test.ts
git commit -m "feat(xb): reclassify trigonometry blocks as simulation supported with missing generated-C conformance"
```

---

### Task 2: Batch 2 Capability Definitions & Conformance Case Manifests

**Files:**
- Modify: `src/utils/stateMachine/xbCapabilities.ts`
- Test: `src/utils/stateMachine/xbCapabilities.test.ts`

**Interfaces:**
- Produces: Conformance case IDs `'T10-INT-LOGIC-BITWISE'`, `'T10-C99-LOGIC-BITWISE'`, `'T10-INT-SIGNAL-ROUTING'`, `'T10-C99-SIGNAL-ROUTING'` in `xbCapabilities.ts`.

- [ ] **Step 1: Write failing test in `xbCapabilities.test.ts`**

```typescript
it('declares executable conformance coverage for Batch 2 Logic & Routing blocks', () => {
  for (const type of [
    'NAND', 'NOR', 'XOR', 'BitwiseAND', 'BitwiseOR', 'BitwiseXOR', 'BitwiseNOT', 'ShiftLeft', 'ShiftRight',
    'SWITCH', 'MUX', 'DEMUX',
  ]) {
    const cap = getXBBlockCapability(type);
    expect(cap?.codegen).toBe(true);
    expect(cap?.interpreterConformanceCaseIds?.length).toBeGreaterThan(0);
    expect(cap?.cConformanceCaseIds?.length).toBeGreaterThan(0);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/stateMachine/xbCapabilities.test.ts`
Expected: FAIL because these blocks are currently in `UNPAIRED_EMBEDDED_OPERATIONS` (`codegen: false`).

- [ ] **Step 3: Update `xbCapabilities.ts` with Batch 2 Conformance Manifests & Capability Mapping**

1. Update `XB_INTERPRETER_CONFORMANCE_CASE_IDS` & `XB_C_CONFORMANCE_CASE_IDS`:
   Include `'T10-INT-LOGIC-BITWISE'`, `'T10-INT-SIGNAL-ROUTING'`, `'T10-C99-LOGIC-BITWISE'`, `'T10-C99-SIGNAL-ROUTING'`.
2. Define `LOGIC_BITWISE_COVERAGE` and `SIGNAL_ROUTING_COVERAGE` in `XB_INTERPRETER_CONFORMANCE_CASES` and `XB_C_CONFORMANCE_CASES`.
3. Remove `NAND`, `NOR`, `XOR`, `BitwiseAND`, `BitwiseOR`, `BitwiseXOR`, `BitwiseNOT`, `ShiftLeft`, `ShiftRight`, `SWITCH`, `MUX`, `DEMUX` from `UNPAIRED_EMBEDDED_OPERATIONS`.
4. Add capability declarations for `NAND`, `NOR`, `XOR`, `BitwiseAND`, `BitwiseOR`, `BitwiseXOR`, `BitwiseNOT`, `ShiftLeft`, `ShiftRight` using `direct(scalar, undefined, ['T10-INT-LOGIC-BITWISE'], ['T10-C99-LOGIC-BITWISE'])`.
5. Add capability declarations for `SWITCH`, `MUX`, `DEMUX` using `direct(allShapes, undefined, ['T10-INT-SIGNAL-ROUTING'], ['T10-C99-SIGNAL-ROUTING'])`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/stateMachine/xbCapabilities.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/xbCapabilities.ts src/utils/stateMachine/xbCapabilities.test.ts
git commit -m "feat(xb): register Batch 2 logic and routing block capabilities and conformance manifests"
```

---

### Task 3: Canonical Interpreter Support for Batch 2 (Logic & Routing)

**Files:**
- Modify: `src/utils/stateMachine/xbInterpreter.ts`
- Test: `src/utils/stateMachine/xbInterpreter.test.ts`

**Interfaces:**
- Produces: Evaluation handling for `NAND`, `NOR`, `XOR`, `BitwiseAND`, `BitwiseOR`, `BitwiseXOR`, `BitwiseNOT`, `ShiftLeft`, `ShiftRight`, `SWITCH`, `MUX`, `DEMUX` in `evaluateDirectOperation`.

- [ ] **Step 1: Write failing tests in `xbInterpreter.test.ts`**

Add tests in `xbInterpreter.test.ts` for evaluating Batch 2 operations:
- `NAND`, `NOR`, `XOR`
- `BitwiseAND`, `BitwiseOR`, `BitwiseXOR`, `BitwiseNOT`, `ShiftLeft`, `ShiftRight`
- `SWITCH` (threshold selection between port 1 and port 2)
- `MUX` (multiplexing input signals into output vector)
- `DEMUX` (demultiplexing input vector into output signals)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/stateMachine/xbInterpreter.test.ts`
Expected: FAIL with `"X-Bridges operation has unsupported type"`.

- [ ] **Step 3: Implement Batch 2 operation cases in `xbInterpreter.ts`**

Add case branches inside `evaluateDirectOperation`:
```typescript
case 'NAND':
  return [[!inputs.every((input) => input.every(Boolean))]];
case 'NOR':
  return [[!inputs.some((input) => input.some(Boolean))]];
case 'XOR': {
  const trueCount = inputs.reduce((count, input) => count + (input.some(Boolean) ? 1 : 0), 0);
  return [[trueCount % 2 === 1]];
}
case 'BitwiseAND':
  return [binary(inputs[0] ?? [0], inputs[1] ?? [0], (a, b) => (Number(a) & Number(b)) >>> 0)];
case 'BitwiseOR':
  return [binary(inputs[0] ?? [0], inputs[1] ?? [0], (a, b) => (Number(a) | Number(b)) >>> 0)];
case 'BitwiseXOR':
  return [binary(inputs[0] ?? [0], inputs[1] ?? [0], (a, b) => (Number(a) ^ Number(b)) >>> 0)];
case 'BitwiseNOT':
  return [unary(inputs[0] ?? [0], (a) => (~Number(a)) >>> 0)];
case 'ShiftLeft':
  return [binary(inputs[0] ?? [0], inputs[1] ?? [0], (a, b) => (Number(a) << Number(b)) >>> 0)];
case 'ShiftRight':
  return [binary(inputs[0] ?? [0], inputs[1] ?? [0], (a, b) => (Number(a) >> Number(b)) >>> 0)];
case 'SWITCH': {
  const cond = inputs[0]?.[0];
  const threshold = Number(parameter(operation, ['threshold', 'Threshold'], 0));
  const pass = Boolean(cond) && Number(cond) >= threshold;
  return [pass ? (inputs[1] ?? [0]) : (inputs[2] ?? [0])];
}
case 'MUX': {
  const combined = inputs.flatMap((input) => Array.from(input));
  return [combined];
}
case 'DEMUX': {
  const input = inputs[0] ?? [0];
  const outputCount = operation.outputSignalIds.length;
  const elementPerOutput = Math.max(1, Math.floor(input.length / outputCount));
  return Array.from({ length: outputCount }, (_, idx) =>
    input.slice(idx * elementPerOutput, (idx + 1) * elementPerOutput),
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/utils/stateMachine/xbInterpreter.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/xbInterpreter.ts src/utils/stateMachine/xbInterpreter.test.ts
git commit -m "feat(xb): implement canonical interpreter evaluation for Batch 2 logic and routing operations"
```

---

### Task 4: C Code Generator Implementation & Conformance Tests for Batch 2

**Files:**
- Modify: `src/utils/stateMachine/xbCGenerator.ts`
- Test: `src/utils/stateMachine/xbCGenerator.test.ts`

**Interfaces:**
- Produces: C code generation support for Batch 2 operations in `renderXBSource`.

- [ ] **Step 1: Write failing C generator conformance tests in `xbCGenerator.test.ts`**

Add tests validating that generated C code for `NAND`, `NOR`, `XOR`, Bitwise operations, `ShiftLeft`, `ShiftRight`, `SWITCH`, `MUX`, and `DEMUX` compiles and matches canonical interpreter output step for step.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/stateMachine/xbCGenerator.test.ts`
Expected: FAIL due to missing C rendering for Batch 2 operation types.

- [ ] **Step 3: Implement C code generator for Batch 2 in `xbCGenerator.ts`**

Add code generation rendering logic for `NAND`, `NOR`, `XOR`, `BitwiseAND`, `BitwiseOR`, `BitwiseXOR`, `BitwiseNOT`, `ShiftLeft`, `ShiftRight`, `SWITCH`, `MUX`, and `DEMUX`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/stateMachine/xbCGenerator.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/xbCGenerator.ts src/utils/stateMachine/xbCGenerator.test.ts
git commit -m "feat(xb): implement C code generation and conformance tests for Batch 2 logic and routing operations"
```

---

### Task 5: Full Suite Integration & Semantic Validator Verification

**Files:**
- Test: `src/utils/stateMachine/xbSemanticValidator.test.ts`
- Test: All test suites in `src/utils/stateMachine/`

- [ ] **Step 1: Run full Vitest suite to verify zero regressions**

Run: `npx vitest run src/utils/stateMachine/`
Expected: ALL PASS cleanly.

- [ ] **Step 2: Final Commit & Tag Verification**

```bash
git status
```
Ensure working copy is clean and all tests pass.
