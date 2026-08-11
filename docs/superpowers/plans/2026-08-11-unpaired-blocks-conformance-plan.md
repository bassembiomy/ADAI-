# Implementation Plan: X-Bridges Paired Conformance for VectorPow, SumElements, Mean, Max, and IdentityMatrix

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transition `VectorPow`, `SumElements`, `Mean`, `Max`, and `IdentityMatrix` from unpaired embedded status to verified support across semantic shape resolution/validation, TypeScript reference interpreter execution, strict allocation-free C99 generation, capability registration, and executable TypeScript-versus-compiled-C conformance testing.

**Architecture:** Extend `xbCapabilities.ts` with dedicated shape policies, add evaluation logic to `xbInterpreter.ts`, add C99 generation to `xbCGenerator.ts`, enforce model checks in `xbSemanticValidator.ts`, and register executable paired conformance test cases in `xbCConformanceCases.ts`.

**Tech Stack:** TypeScript, Vitest, C99 (`gcc`/`clang` compiler harness), GitHub Flavored Markdown.

## Global Requirements

- Compile generated C with `-std=c99 -Wall -Wextra -Werror`.
- Do not introduce dynamic allocation or variable-length arrays.
- Flatten matrices in the repository's established row-major order.
- Reject missing, empty, incompatible, non-square, and oversized shapes before code generation.
- Do not mask invalid models with interpreter defaults such as `inputs[0] ?? [0]` or division by `Math.max(1, length)`.
- Resolve generated scalar types through existing datatype helpers. Use `powf` for `float` and `pow` for `double`.
- Preserve `Max` NaN propagation and the ordering rule `+0 > -0` in both runtimes.
- Compare finite floating-point values with absolute and relative tolerances. Compare NaN, infinity sign, and signed zero by classification.
- Use the existing static matrix limit (`MAX_STATIC_MATRIX_DIMENSION = 8`) shared with `MatrixSolve`. If no shared exported constant exists, extract one rather than duplicating a literal.
- Follow existing diagnostic codes, operation-result wrapping, signal connection metadata, and test-fixture conventions found in the repository.

---

### Task 0: Repository-Alignment Gate

**Files:**
- Inspect: `src/utils/stateMachine/xbCapabilities.ts`
- Inspect: `src/utils/stateMachine/xbInterpreter.ts`
- Inspect: `src/utils/stateMachine/xbCGenerator.ts`
- Inspect: `src/utils/stateMachine/xbSemanticValidator.ts`
- Inspect: `src/utils/stateMachine/xbShapeResolver.ts`
- Inspect: `src/utils/stateMachine/xbCConformanceCases.ts`
- Inspect tests and compiler harness files in `src/utils/stateMachine/`

**Interfaces & Findings:**
- Confirm exact `evaluateDirectOperation` return type wrapper (`readonly (readonly XBScalar[])[]`).
- Confirm graph connection metadata representation for input port 2 on `VectorPow`.
- Confirm `math-library` capability semantics (header availability vs link-time library).
- Confirm compiler harness and numeric comparator reuse patterns.

- [ ] **Step 1: Inspect repository files to confirm type signatures and helper names**
- [ ] **Step 2: Document findings in Task 0 completion log**

---

### Task 1: Semantic Shape Resolution & Validation

**Files:**
- Modify: `src/utils/stateMachine/xbShapeResolver.ts`
- Modify: `src/utils/stateMachine/xbSemanticValidator.ts`
- Test: `src/utils/stateMachine/xbShapeResolver.test.ts`, `src/utils/stateMachine/xbSemanticValidator.test.ts`

**Interfaces:**
- Consumes: `resolveGraphShapes`, `validateXBSemantics`
- Produces: `ModelDiagnostic` errors for invalid shapes ($N < 1$, non-square $N \times N$, $N > 8$, incompatible broadcasting)

- [ ] **Step 1: Write failing tests in `xbShapeResolver.test.ts` and `xbSemanticValidator.test.ts`**

Tests must cover:
- `VectorPow`: scalar/scalar, vector/scalar, scalar/vector, equal vector/vector, and matrix/scalar resolve successfully.
- `VectorPow`: vector 3 / vector 5 rejected.
- `VectorPow`: matrix exponent rejected when unsupported.
- `VectorPow`: unconnected exponent uses parameter fallback.
- `VectorPow`: connected empty exponent is rejected (no fallback).
- Reductions (`SumElements`, `Mean`, `Max`): accept non-empty vectors/matrices ($N \ge 1$), reject $N < 1$.
- `IdentityMatrix`: $1 \times 1$, $2 \times 2$, and $8 \times 8$ pass; zero, fractional, non-square, conflicting, or $N > 8$ dimensions fail.

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/utils/stateMachine/xbSemanticValidator.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement shape resolution and semantic validation**

In `xbShapeResolver.ts` and `xbSemanticValidator.ts`:
- Enforce $N \ge 1$ for `SumElements`, `Mean`, `Max`.
- Enforce square output matrix $N \times N$ ($N \le MAX_STATIC_MATRIX_DIMENSION$) for `IdentityMatrix`.
- Validate broadcasting for `VectorPow` and reject connected empty/invalid port 2 signals.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/stateMachine/xbSemanticValidator.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/xbShapeResolver.ts src/utils/stateMachine/xbSemanticValidator.ts src/utils/stateMachine/xbShapeResolver.test.ts src/utils/stateMachine/xbSemanticValidator.test.ts
git commit -m "feat(stateMachine): validate VectorPow reductions and identity matrix shapes"
```

---

### Task 2: TypeScript Reference Interpreter

**Files:**
- Modify: `src/utils/stateMachine/xbInterpreter.ts`
- Test: `src/utils/stateMachine/xbInterpreter.test.ts`

**Interfaces:**
- Consumes: `XBSemanticOperation`, `inputs`, `signalValues`
- Produces: Array of signal output value arrays (`readonly (readonly XBScalar[])[]`) for target operations in `evaluateDirectOperation`

- [ ] **Step 1: Write failing tests in `xbInterpreter.test.ts`**

Tests must cover:
- `VectorPow`: every supported broadcast form.
- `VectorPow`: parameter fallback and connected-port precedence.
- `VectorPow`: `(-0, -3)` $\to -\infty$ and `(-0, -2)` $\to +\infty$.
- `VectorPow`: NaN propagation.
- Reductions: one element, mixed signs, vector, matrix.
- `Mean`: fractional result.
- `Max`: all-negative values and repeated maxima.
- `Max`: NaN first and NaN last.
- `Max`: `Max([-0, +0])` and `Max([+0, -0])` both return `+0` (verified with `Object.is`).
- `IdentityMatrix`: exact flat row-major values for $1 \times 1$, $2 \times 2$, $3 \times 3$.
- Missing/empty inputs throw instead of returning default values.

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/utils/stateMachine/xbInterpreter.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement evaluation logic in `evaluateDirectOperation`**

In `xbInterpreter.ts`:
- Throw for missing/empty required inputs.
- `VectorPow`: use validated broadcasting and `Math.pow(Number(b), Number(e))`.
- `SumElements`: left-to-right flattened storage sum.
- `Mean`: sum divided by validated element count $N$.
- `Max`: loop checking `Number.isNaN(value) || value > maxValue || (value === 0 && maxValue === 0 && Object.is(value, +0) && Object.is(maxValue, -0))`.
- `IdentityMatrix`: flat row-major array of length $N \times N$ wrapped as `[[flatResult]]`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/stateMachine/xbInterpreter.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/xbInterpreter.ts src/utils/stateMachine/xbInterpreter.test.ts
git commit -m "feat(stateMachine): implement paired operation interpreter semantics"
```

---

### Task 3: Strict C99 Code Generation & Compilation

**Files:**
- Modify: `src/utils/stateMachine/xbCGenerator.ts`
- Test: `src/utils/stateMachine/xbCGenerator.test.ts`

**Interfaces:**
- Consumes: `XBSemanticOperation`, C code emission helpers
- Produces: C99 code string and verified compilation via compiler harness (`-std=c99 -Wall -Wextra -Werror`)

- [ ] **Step 1: Write failing tests in `xbCGenerator.test.ts`**

Tests must cover:
- `float VectorPow` emits `powf`; `double VectorPow` emits `pow`.
- Scalar broadcasting does not emit invalid scalar indexing.
- Reduction accumulators, literals, and mean divisor match float and double models.
- `Max` emission contains `isnan` and `signbit` signed-zero handling.
- `IdentityMatrix` emits exactly $N \times N$ logical assignments without dynamic allocation or VLAs.
- Representative model for every operation compiles cleanly under `-std=c99 -Wall -Wextra -Werror`.
- Both float and double `VectorPow` models compile and execute without warnings.

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/utils/stateMachine/xbCGenerator.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement C emission logic in `xbCGenerator.ts`**

In `xbCGenerator.ts`:
- Include `<math.h>` where needed.
- `VectorPow`: emit `powf` / `pow` matching signal type.
- `SumElements` & `Mean`: emit static reduction loop and correct division.
- `Max`: emit loop with `isnan` and `signbit` logic matching signal type.
- `IdentityMatrix`: emit fixed-bound nested loops or constant initialization in row-major order.

- [ ] **Step 4: Run compiler harness tests**

Run: `npx vitest run src/utils/stateMachine/xbCGenerator.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/xbCGenerator.ts src/utils/stateMachine/xbCGenerator.test.ts
git commit -m "feat(stateMachine): generate C99 for VectorPow reductions and identity matrix"
```

---

### Task 4: Executable Paired Conformance Cases

**Files:**
- Modify: `src/utils/stateMachine/xbCConformanceCases.ts`
- Test: Full conformance test suite

**Interfaces:**
- Consumes: Conformance harness
- Produces: Executable cases `T10-INT-VECTOR-POW`, `T10-C99-VECTOR-POW`, `T10-INT-REDUCTIONS`, `T10-C99-REDUCTIONS`, `T10-INT-IDENTITY-MATRIX`, `T10-C99-IDENTITY-MATRIX`

- [ ] **Step 1: Write paired conformance case definitions**

In `xbCConformanceCases.ts`:
- Register `T10-INT-VECTOR-POW` / `T10-C99-VECTOR-POW`
- Register `T10-INT-REDUCTIONS` / `T10-C99-REDUCTIONS`
- Register `T10-INT-IDENTITY-MATRIX` / `T10-C99-IDENTITY-MATRIX`

- [ ] **Step 2: Run conformance tests**

Run: `npx vitest run src/utils/stateMachine/xbCConformanceCases.test.ts`  
Expected: PASS across all finite tolerance and special value classifications (NaN, infinity sign, signed zero).

- [ ] **Step 3: Commit**

```bash
git add src/utils/stateMachine/xbCConformanceCases.ts
git commit -m "test(stateMachine): add executable paired conformance cases"
```

---

### Task 5: Capability Registration (`xbCapabilities.ts`)

**Files:**
- Modify: `src/utils/stateMachine/xbCapabilities.ts`
- Test: `src/utils/stateMachine/xbCapabilities.test.ts`

**Interfaces:**
- Consumes: `XB_CAPABILITIES`, executable case IDs
- Produces: Updated capability registrations with `codegen: true` and removal from unpaired operations list

- [ ] **Step 1: Write failing test in `xbCapabilities.test.ts`**

```ts
import { describe, expect, test } from 'vitest';
import { getXBBlockCapability, XB_CAPABILITIES } from './xbCapabilities';

describe('capability registration for paired operations', () => {
  test('registers codegen capabilities with executable case IDs', () => {
    expect(getXBBlockCapability('VectorPow')?.codegen).toBe(true);
    expect(getXBBlockCapability('VectorPow')?.requiredTargetCapabilities).toContain('math-library');
    expect(getXBBlockCapability('VectorPow')?.interpreterConformanceCaseIds).toContain('T10-INT-VECTOR-POW');
    expect(getXBBlockCapability('VectorPow')?.cConformanceCaseIds).toContain('T10-C99-VECTOR-POW');

    expect(getXBBlockCapability('SumElements')?.codegen).toBe(true);
    expect(getXBBlockCapability('Mean')?.codegen).toBe(true);
    expect(getXBBlockCapability('Max')?.codegen).toBe(true);
    expect(getXBBlockCapability('IdentityMatrix')?.codegen).toBe(true);

    const unpairedList = (XB_CAPABILITIES as Record<string, any>).UNCLASSIFIED_HOST_ONLY ?? {};
    expect(Object.keys(unpairedList)).not.toContain('VectorPow');
    expect(Object.keys(unpairedList)).not.toContain('SumElements');
    expect(Object.keys(unpairedList)).not.toContain('Mean');
    expect(Object.keys(unpairedList)).not.toContain('Max');
    expect(Object.keys(unpairedList)).not.toContain('IdentityMatrix');
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/utils/stateMachine/xbCapabilities.test.ts`  
Expected: FAIL

- [ ] **Step 3: Update `XB_CAPABILITIES` and remove operations from unpaired list**

In `xbCapabilities.ts`:
- Update capability entries for `VectorPow`, `SumElements`, `Mean`, `Max`, `IdentityMatrix`.
- Remove exact operation names from `UNPAIRED_EMBEDDED_OPERATIONS`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/stateMachine/xbCapabilities.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/xbCapabilities.ts src/utils/stateMachine/xbCapabilities.test.ts
git commit -m "feat(stateMachine): register verified paired capabilities"
```

---

### Task 6: Full Regression & Quality Gate

- [ ] **Step 1: Run focused unit test files**
```bash
npx vitest run src/utils/stateMachine/xbShapeResolver.test.ts
npx vitest run src/utils/stateMachine/xbSemanticValidator.test.ts
npx vitest run src/utils/stateMachine/xbInterpreter.test.ts
npx vitest run src/utils/stateMachine/xbCGenerator.test.ts
npx vitest run src/utils/stateMachine/xbCapabilities.test.ts
```

- [ ] **Step 2: Run full repository test suite and type checking**
```bash
npm test
```

- [ ] **Step 3: Verify Definition of Done**
- All 5 operations pass semantic validation for valid models and reject invalid models.
- Interpreter and C results match for every required finite and special-value case.
- Strict C99 compilation succeeds with warnings treated as errors.
- No dynamic allocation or VLA is emitted.
- `float` and `double` `VectorPow` paths are covered.
- Every advertised capability case ID resolves and executes.
- All 5 operations are absent from the unpaired list.
- Existing unit, conformance, type-check, and lint suites pass.
