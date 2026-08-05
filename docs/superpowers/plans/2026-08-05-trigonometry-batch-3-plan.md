# Batch 3 (Trigonometry Lane) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote all 24 Trigonometry operations to dual executable conformance between the canonical interpreter and C generator (`codegen: true`).

**Architecture:** Update capability declarations in `xbCapabilities.ts` with `T10-INT-TRIGONOMETRY` and `T10-C99-TRIGONOMETRY`, implement evaluation in `xbInterpreter.ts`, C code rendering in `xbCGenerator.ts`, and cover with TDD tests in `xbCapabilities.test.ts`, `xbInterpreter.test.ts`, `xbCGenerator.test.ts`, and `xbSemanticValidator.test.ts`.

**Tech Stack:** TypeScript, C99 Code Generator (`<math.h>`), Vitest

## Global Constraints

- Spec: `g:\adia project\docs\superpowers\specs\2026-08-05-trigonometry-batch-3-design.md`
- Preserve all existing public API signatures and exports.
- Follow strict TDD (failing test -> run -> implement -> run -> commit).
- File paths:
  - Capabilities: `g:\adia project\src\utils\stateMachine\xbCapabilities.ts`
  - Capabilities test: `g:\adia project\src\utils\stateMachine\xbCapabilities.test.ts`
  - Interpreter: `g:\adia project\src\utils\stateMachine\xbInterpreter.ts`
  - Interpreter test: `g:\adia project\src\utils\stateMachine\xbInterpreter.test.ts`
  - C Generator: `g:\adia project\src\utils\stateMachine\xbCGenerator.ts`
  - C Generator test: `g:\adia project\src\utils\stateMachine\xbCGenerator.test.ts`
  - Semantic Validator test: `g:\adia project\src\utils\stateMachine\xbSemanticValidator.test.ts`

---

### Task 1: Register Batch 3 Capabilities & Conformance Case Manifests

**Files:**
- Modify: `src/utils/stateMachine/xbCapabilities.ts`
- Test: `src/utils/stateMachine/xbCapabilities.test.ts`

**Interfaces:**
- Produces: Conformance case IDs `'T10-INT-TRIGONOMETRY'` and `'T10-C99-TRIGONOMETRY'` in `xbCapabilities.ts`.

- [ ] **Step 1: Write failing test in `xbCapabilities.test.ts`**

```typescript
it('declares executable conformance coverage for all 24 Trigonometry blocks', () => {
  for (const type of [
    'SIN', 'COS', 'TAN', 'COT', 'SEC', 'COSEC', 'ASIN', 'ACOS', 'ATAN',
    'ACOT', 'ASEC', 'ACOSEC', 'SINH', 'COSH', 'TANH', 'COTH', 'SECH',
    'COSECH', 'ASINH', 'ACOSH', 'ATANH', 'ACOTH', 'ASECH', 'ACOSECH',
  ]) {
    const cap = getXBBlockCapability(type);
    expect(cap?.codegen).toBe(true);
    expect(cap?.requiredTargetCapabilities).toContain('math-library');
    expect(cap?.interpreterConformanceCaseIds).toContain('T10-INT-TRIGONOMETRY');
    expect(cap?.cConformanceCaseIds).toContain('T10-C99-TRIGONOMETRY');
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/stateMachine/xbCapabilities.test.ts`
Expected: FAIL because trig blocks currently return `codegen: false`.

- [ ] **Step 3: Update `xbCapabilities.ts` with Trigonometry Conformance Case IDs and Capability Mapping**

1. Add `'T10-INT-TRIGONOMETRY'` and `'T10-C99-TRIGONOMETRY'` to `XB_INTERPRETER_CONFORMANCE_CASE_IDS` and `XB_C_CONFORMANCE_CASE_IDS`.
2. Define `TRIGONOMETRY_COVERAGE` containing scalar coverage for all 24 trig operations.
3. Add `'T10-INT-TRIGONOMETRY': TRIGONOMETRY_COVERAGE` to `XB_INTERPRETER_CONFORMANCE_CASES` and `'T10-C99-TRIGONOMETRY': TRIGONOMETRY_COVERAGE` to `XB_C_CONFORMANCE_CASES`.
4. Remove `TRIGONOMETRY_UNPAIRED_OPERATIONS` and its spread in `XB_CAPABILITIES`.
5. Declare all 24 trig block entries in `XB_CAPABILITIES` using:
   `direct(scalar, ['math-library'], ['T10-INT-TRIGONOMETRY'], ['T10-C99-TRIGONOMETRY'])`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/stateMachine/xbCapabilities.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/xbCapabilities.ts src/utils/stateMachine/xbCapabilities.test.ts
git commit -m "feat(xb): register Batch 3 trigonometry capabilities and conformance case manifests"
```

---

### Task 2: Canonical Interpreter Implementation for Batch 3 Trigonometry

**Files:**
- Modify: `src/utils/stateMachine/xbInterpreter.ts`
- Test: `src/utils/stateMachine/xbInterpreter.test.ts`

**Interfaces:**
- Produces: Evaluation handling for all 24 Trigonometry operations in `evaluateDirectOperation`.

- [ ] **Step 1: Write failing tests in `xbInterpreter.test.ts`**

Add tests evaluating reference angles and inverse/hyperbolic functions:
- `SIN` (0 -> 0, $\pi/6$ -> 0.5)
- `COS` (0 -> 1, $\pi/3$ -> 0.5)
- `TAN` ($\pi/4$ -> 1)
- `ASIN` (1 -> $\pi/2$)
- `ACOS` (1 -> 0)
- `ATAN` (1 -> $\pi/4$)
- `SINH`, `COSH`, `TANH`, `ASINH`, `ACOSH`, `ATANH`
- Reciprocals `COT`, `SEC`, `COSEC`, `COTH`, `SECH`, `COSECH`

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/stateMachine/xbInterpreter.test.ts`
Expected: FAIL with `"X-Bridges operation has unsupported type"`.

- [ ] **Step 3: Implement Trigonometry cases in `xbInterpreter.ts`**

Add case branches in `evaluateDirectOperation`:
```typescript
case 'SIN': return [unary(inputs[0] ?? [0], Math.sin)];
case 'COS': return [unary(inputs[0] ?? [0], Math.cos)];
case 'TAN': return [unary(inputs[0] ?? [0], Math.tan)];
case 'COT': return [unary(inputs[0] ?? [0], (x) => 1 / Math.tan(x))];
case 'SEC': return [unary(inputs[0] ?? [0], (x) => 1 / Math.cos(x))];
case 'COSEC': return [unary(inputs[0] ?? [0], (x) => 1 / Math.sin(x))];
case 'ASIN': return [unary(inputs[0] ?? [0], Math.asin)];
case 'ACOS': return [unary(inputs[0] ?? [0], Math.acos)];
case 'ATAN': return [unary(inputs[0] ?? [0], Math.atan)];
case 'ACOT': return [unary(inputs[0] ?? [0], (x) => Math.atan(1 / x))];
case 'ASEC': return [unary(inputs[0] ?? [0], (x) => Math.acos(1 / x))];
case 'ACOSEC': return [unary(inputs[0] ?? [0], (x) => Math.asin(1 / x))];
case 'SINH': return [unary(inputs[0] ?? [0], Math.sinh)];
case 'COSH': return [unary(inputs[0] ?? [0], Math.cosh)];
case 'TANH': return [unary(inputs[0] ?? [0], Math.tanh)];
case 'COTH': return [unary(inputs[0] ?? [0], (x) => 1 / Math.tanh(x))];
case 'SECH': return [unary(inputs[0] ?? [0], (x) => 1 / Math.cosh(x))];
case 'COSECH': return [unary(inputs[0] ?? [0], (x) => 1 / Math.sinh(x))];
case 'ASINH': return [unary(inputs[0] ?? [0], Math.asinh)];
case 'ACOSH': return [unary(inputs[0] ?? [0], Math.acosh)];
case 'ATANH': return [unary(inputs[0] ?? [0], Math.atanh)];
case 'ACOTH': return [unary(inputs[0] ?? [0], (x) => Math.atanh(1 / x))];
case 'ASECH': return [unary(inputs[0] ?? [0], (x) => Math.acosh(1 / x))];
case 'ACOSECH': return [unary(inputs[0] ?? [0], (x) => Math.asinh(1 / x))];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/utils/stateMachine/xbInterpreter.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/xbInterpreter.ts src/utils/stateMachine/xbInterpreter.test.ts
git commit -m "feat(xb): implement canonical interpreter evaluation for Batch 3 trigonometry operations"
```

---

### Task 3: C Code Generator Implementation & Conformance Tests for Batch 3

**Files:**
- Modify: `src/utils/stateMachine/xbCGenerator.ts`
- Test: `src/utils/stateMachine/xbCGenerator.test.ts`

**Interfaces:**
- Produces: C code generation support for all 24 Trigonometry operations in `renderXBSource`.

- [ ] **Step 1: Write failing C generator conformance tests in `xbCGenerator.test.ts`**

Add tests validating that generated C code for `SIN`, `COS`, `TAN`, `ASIN`, `ACOS`, `ATAN`, `SINH`, `COSH`, `TANH`, `ASINH`, `ACOSH`, `ATANH` and reciprocals compiles with `gcc -std=c99 -lm` and outputs values identical to the canonical interpreter.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/stateMachine/xbCGenerator.test.ts`
Expected: FAIL due to missing C rendering for Batch 3 Trigonometry types.

- [ ] **Step 3: Implement C code generator for Trigonometry in `xbCGenerator.ts`**

Add emitters:
```typescript
const emitSin = emitSingleOutput((inputs) => `sin(${inputs[0] ?? '0.0'})`);
const emitCos = emitSingleOutput((inputs) => `cos(${inputs[0] ?? '0.0'})`);
const emitTan = emitSingleOutput((inputs) => `tan(${inputs[0] ?? '0.0'})`);
const emitCot = emitSingleOutput((inputs) => `(1.0 / tan(${inputs[0] ?? '0.0'}))`);
const emitSec = emitSingleOutput((inputs) => `(1.0 / cos(${inputs[0] ?? '0.0'}))`);
const emitCosec = emitSingleOutput((inputs) => `(1.0 / sin(${inputs[0] ?? '0.0'}))`);
const emitAsin = emitSingleOutput((inputs) => `asin(${inputs[0] ?? '0.0'})`);
const emitAcos = emitSingleOutput((inputs) => `acos(${inputs[0] ?? '0.0'})`);
const emitAtan = emitSingleOutput((inputs) => `atan(${inputs[0] ?? '0.0'})`);
const emitAcot = emitSingleOutput((inputs) => `atan(1.0 / (${inputs[0] ?? '0.0'}))`);
const emitAsec = emitSingleOutput((inputs) => `acos(1.0 / (${inputs[0] ?? '0.0'}))`);
const emitAcosec = emitSingleOutput((inputs) => `asin(1.0 / (${inputs[0] ?? '0.0'}))`);
const emitSinh = emitSingleOutput((inputs) => `sinh(${inputs[0] ?? '0.0'})`);
const emitCosh = emitSingleOutput((inputs) => `cosh(${inputs[0] ?? '0.0'})`);
const emitTanh = emitSingleOutput((inputs) => `tanh(${inputs[0] ?? '0.0'})`);
const emitCoth = emitSingleOutput((inputs) => `(1.0 / tanh(${inputs[0] ?? '0.0'}))`);
const emitSech = emitSingleOutput((inputs) => `(1.0 / cosh(${inputs[0] ?? '0.0'}))`);
const emitCosech = emitSingleOutput((inputs) => `(1.0 / sinh(${inputs[0] ?? '0.0'}))`);
const emitAsinh = emitSingleOutput((inputs) => `asinh(${inputs[0] ?? '0.0'})`);
const emitAcosh = emitSingleOutput((inputs) => `acosh(${inputs[0] ?? '0.0'})`);
const emitAtanh = emitSingleOutput((inputs) => `atanh(${inputs[0] ?? '0.0'})`);
const emitAcoth = emitSingleOutput((inputs) => `atanh(1.0 / (${inputs[0] ?? '0.0'}))`);
const emitAsech = emitSingleOutput((inputs) => `acosh(1.0 / (${inputs[0] ?? '0.0'}))`);
const emitAcosech = emitSingleOutput((inputs) => `asinh(1.0 / (${inputs[0] ?? '0.0'}))`);
```
Register all 24 in `OPERATION_EMITTERS`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/stateMachine/xbCGenerator.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/xbCGenerator.ts src/utils/stateMachine/xbCGenerator.test.ts
git commit -m "feat(xb): implement C code generation and gcc parity tests for Batch 3 trigonometry operations"
```

---

### Task 4: Full Suite Integration & Semantic Validator Verification

**Files:**
- Test: `src/utils/stateMachine/xbSemanticValidator.test.ts`
- Test: All test suites in `src/utils/stateMachine/`

- [ ] **Step 1: Update `xbSemanticValidator.test.ts`**

Update test assertions so that trigonometry blocks pass clean without `XB_BLOCK_NOT_CODEGEN_CAPABLE` errors.

- [ ] **Step 2: Run full Vitest suite to verify zero regressions**

Run: `npx vitest run src/utils/stateMachine/`
Expected: ALL PASS cleanly.

- [ ] **Step 3: Final Commit & Working Copy Clean Check**

```bash
git status
```
Ensure working copy is clean and all tests pass.
