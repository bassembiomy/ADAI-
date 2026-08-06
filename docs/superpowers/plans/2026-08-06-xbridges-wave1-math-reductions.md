# X-Bridges Wave 1 Math and Reductions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add strict-C99, float32, and fixed-point code generation for `VectorPow`, `SumElements`, `Mean`, `Max`, and `IdentityMatrix`, backed by executed canonical-interpreter/C conformance.

**Architecture:** Establish the reusable bounded embedded profile and executable conformance registry first. Add each operation to the semantic builder, canonical interpreter, and table-driven C emitter, then enable its capability only after the same fixture has run through both paths.

**Tech Stack:** TypeScript 5, Vitest, the existing X-Bridges semantic IR, generated strict C99, GCC with `-std=c99 -pedantic-errors -Wall -Wextra -Werror`.

## Global Constraints

- Emit strict C99 only; generated execution uses static model-sized storage, bounded loops, and no heap allocation, recursion, variable-length arrays, or global mutable state.
- Use a generic bounded embedded profile with configurable compile-time limits.
- Support float32 and fixed-point together for every applicable block.
- Fail closed until semantic contract, canonical interpreter behavior, generated-C behavior, and paired executable conformance all exist for every declared shape and numeric profile.
- Keep all `ROBOT_VACUUM_*`, `Note`, `ROOT_LOCUS`, and `Scope` blocks excluded from embedded code generation.

## File Map

- Create `src/utils/stateMachine/xbEmbeddedProfile.ts`: target-limit validation and model resource accounting.
- Create `src/utils/stateMachine/xbEmbeddedProfile.test.ts`: boundary and rejection tests.
- Create `src/utils/stateMachine/xbCConformanceCases.ts`: executable paired-case registry shared by all waves.
- Create `src/utils/stateMachine/xbDeclaredCConformance.test.ts`: compiles and executes every declared C case and compares it with the canonical interpreter.
- Modify `src/utils/stateMachine/xbModel.ts`: add target limits without changing persisted diagram schema.
- Modify `src/utils/stateMachine/xbCapabilities.ts`: declare coverage only from executable case IDs.
- Modify `src/utils/stateMachine/xbSemanticBuilder.ts`: shape/resource validation and operation construction.
- Modify `src/utils/stateMachine/xbInterpreter.ts`: canonical math/reduction semantics.
- Modify `src/utils/stateMachine/xbCGenerator.ts`: strict-C99 operation emitters.
- Modify focused existing tests and `docs/XBRIDGES_EMBEDDED_CODEGEN.md`.

---

### Task 1: Bounded embedded profile

**Files:**
- Create: `src/utils/stateMachine/xbEmbeddedProfile.ts`
- Create: `src/utils/stateMachine/xbEmbeddedProfile.test.ts`
- Modify: `src/utils/stateMachine/xbModel.ts:72`
- Modify: `src/utils/stateMachine/smSemanticValidator.ts:36`

**Interfaces:**
- Produces: `XBEmbeddedLimits`, `DEFAULT_XB_EMBEDDED_LIMITS`, and `assertXBResourceWithinLimits(resource, limits): void`.
- Consumes: `XBTargetCapabilities` during semantic validation.

- [ ] **Step 1: Write failing limit tests**

```ts
it('accepts a model-sized matrix at the configured boundary', () => {
  expect(() => assertXBResourceWithinLimits(
    { vectorLength: 0, matrixRows: 8, matrixColumns: 8, stateElements: 64, loopIterations: 64 },
    { maxVectorLength: 64, maxMatrixRows: 8, maxMatrixColumns: 8, maxStateElements: 64, maxLoopIterations: 64 },
  )).not.toThrow();
});

it('rejects a resource before C generation when any bound is exceeded', () => {
  expect(() => assertXBResourceWithinLimits(
    { vectorLength: 65, matrixRows: 0, matrixColumns: 0, stateElements: 0, loopIterations: 65 },
    DEFAULT_XB_EMBEDDED_LIMITS,
  )).toThrow(/maxVectorLength/);
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npx vitest run src/utils/stateMachine/xbEmbeddedProfile.test.ts`

Expected: FAIL because `xbEmbeddedProfile.ts` does not exist.

- [ ] **Step 3: Add the exact profile contract and validator**

```ts
export interface XBEmbeddedLimits {
  readonly maxVectorLength: number;
  readonly maxMatrixRows: number;
  readonly maxMatrixColumns: number;
  readonly maxStateElements: number;
  readonly maxLoopIterations: number;
}

export interface XBEmbeddedResource {
  readonly vectorLength: number;
  readonly matrixRows: number;
  readonly matrixColumns: number;
  readonly stateElements: number;
  readonly loopIterations: number;
}

export const DEFAULT_XB_EMBEDDED_LIMITS: XBEmbeddedLimits = Object.freeze({
  maxVectorLength: 64,
  maxMatrixRows: 8,
  maxMatrixColumns: 8,
  maxStateElements: 128,
  maxLoopIterations: 256,
});

export function assertXBResourceWithinLimits(
  resource: XBEmbeddedResource,
  limits: XBEmbeddedLimits,
): void {
  for (const [resourceKey, limitKey] of [
    ['vectorLength', 'maxVectorLength'],
    ['matrixRows', 'maxMatrixRows'],
    ['matrixColumns', 'maxMatrixColumns'],
    ['stateElements', 'maxStateElements'],
    ['loopIterations', 'maxLoopIterations'],
  ] as const) {
    if (!Number.isInteger(resource[resourceKey]) || resource[resourceKey] < 0
      || resource[resourceKey] > limits[limitKey]) {
      throw new Error(`${resourceKey} exceeds ${limitKey}=${limits[limitKey]}`);
    }
  }
}
```

Add `embeddedLimits: XBEmbeddedLimits` to `XBTargetCapabilities`, set it to `DEFAULT_XB_EMBEDDED_LIMITS` in the production target, and update every test target literal.

- [ ] **Step 4: Run profile and semantic validation tests**

Run: `npx vitest run src/utils/stateMachine/xbEmbeddedProfile.test.ts src/utils/stateMachine/xbSemanticValidator.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/xbEmbeddedProfile.ts src/utils/stateMachine/xbEmbeddedProfile.test.ts src/utils/stateMachine/xbModel.ts src/utils/stateMachine/smSemanticValidator.ts src/utils/stateMachine/xbSemanticBuilder.test.ts src/utils/stateMachine/xbSemanticValidator.test.ts
git commit -m "feat: add bounded X-Bridges embedded profile"
```

### Task 2: Executed paired-conformance gate

**Files:**
- Create: `src/utils/stateMachine/xbCConformanceCases.ts`
- Create: `src/utils/stateMachine/xbDeclaredCConformance.test.ts`
- Modify: `src/utils/stateMachine/xbCapabilities.ts:25`
- Modify: `src/utils/stateMachine/xbCapabilities.test.ts`
- Reuse: `src/utils/stateMachine/smCHarness.ts`

**Interfaces:**
- Produces: `XBExecutableConformanceCase`, `XB_EXECUTABLE_C_CASES`, and `getExecutedCoverage(caseId)`.
- Consumes: `compileAndRunCProgram(...)` and the canonical runtime trace produced by `smCHarness.ts`.

- [ ] **Step 1: Write a failing integrity test**

```ts
it('requires every enabled capability case ID to resolve to an executed case', () => {
  for (const [type, capability] of Object.entries(XB_BLOCK_CAPABILITIES)) {
    if (!capability.codegen) continue;
    for (const id of capability.cConformanceCaseIds ?? []) {
      expect(XB_EXECUTABLE_C_CASES[id], `${type}: ${id}`).toBeDefined();
    }
  }
});
```

- [ ] **Step 2: Run the integrity test and confirm RED**

Run: `npx vitest run src/utils/stateMachine/xbCapabilities.test.ts`

Expected: FAIL because the executable registry is absent.

- [ ] **Step 3: Add the executable registry contract**

```ts
export interface XBExecutableConformanceCase {
  readonly id: string;
  readonly coverage: readonly XBConformanceCoverage[];
  readonly fixture: DifferentialFixture;
  readonly tolerance: Readonly<{ absolute: number; relative: number }>;
}

export const XB_EXECUTABLE_C_CASES: Readonly<Record<string, XBExecutableConformanceCase>> =
  Object.freeze({});

export const getExecutedCoverage = (caseId: string): readonly XBConformanceCoverage[] => {
  const testCase = XB_EXECUTABLE_C_CASES[caseId];
  if (!testCase) throw new Error(`Unknown executable X-Bridges C case '${caseId}'.`);
  return testCase.coverage;
};
```

Move coverage ownership out of the metadata-only `XB_C_CONFORMANCE_CASES` table. Make `xbDeclaredCConformance.test.ts` iterate registry values, run the fixture canonically, compile generated C, execute it, and compare every signal/state trace using each case's absolute and relative tolerance. Keep missing GCC as a hard failure in this release gate.

- [ ] **Step 4: Seed the registry with all already-declared cases and run it**

Run: `npx vitest run src/utils/stateMachine/xbDeclaredCConformance.test.ts src/utils/stateMachine/xbCapabilities.test.ts`

Expected: PASS; each declared case prints one passing Vitest case after compiling with strict C99.

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/xbCConformanceCases.ts src/utils/stateMachine/xbDeclaredCConformance.test.ts src/utils/stateMachine/xbCapabilities.ts src/utils/stateMachine/xbCapabilities.test.ts src/utils/stateMachine/smCHarness.ts
git commit -m "test: enforce executable X-Bridges C conformance"
```

### Task 3: Vector power and reductions

**Files:**
- Modify: `src/utils/stateMachine/xbSemanticBuilder.ts`
- Modify: `src/utils/stateMachine/xbInterpreter.ts`
- Modify: `src/utils/stateMachine/xbCGenerator.ts`
- Modify: `src/utils/stateMachine/xbCConformanceCases.ts`
- Test: `src/utils/stateMachine/xbInterpreter.test.ts`
- Test: `src/utils/stateMachine/xbCGenerator.test.ts`

**Interfaces:**
- Produces operation semantics for `VectorPow`, `SumElements`, `Mean`, and both `Max` modes.
- Consumes `assertXBResourceWithinLimits(...)` and executable case IDs `XB-W1-F32-MATH` and `XB-W1-FIXED-MATH`.

- [ ] **Step 1: Add failing canonical tests**

```ts
it.each([
  ['VectorPow', [[2, 3], [3, 2]], [8, 9]],
  ['SumElements', [[1, 2, 3]], [6]],
  ['Mean', [[2, 4, 8]], [14 / 3]],
  ['Max', [[-4, 7, 2]], [7]],
  ['Max', [[1, 9], [4, 3]], [4, 9]],
])('%s has deterministic shaped semantics', (type, inputs, expected) => {
  expect(runDirectBlock(type, inputs)).toEqual(expected);
});
```

- [ ] **Step 2: Confirm canonical tests fail**

Run: `npx vitest run src/utils/stateMachine/xbInterpreter.test.ts -t "deterministic shaped semantics"`

Expected: FAIL on unsupported operation semantics.

- [ ] **Step 3: Implement exact semantic contracts**

Implement `VectorPow` as same-shape pairwise `pow(base[i], exponent[i])`; reject unequal shapes. Implement one-input `Max`, `SumElements`, and `Mean` as non-empty scalar reductions in row-major order. Implement multi-input `Max` as same-shape elementwise maximum. For fixed-point, quantize every multiplication/power result and every reduction accumulation through the existing `xbNumeric.ts` conversion/fault policy; do not accumulate secretly in float.

Register table-driven C emitters whose generated loops use literal model dimensions:

```c
for (uint32_t i = 0U; i < 3U; ++i) {
    output[i] = SM_XB_Quantize(powf(base[i], exponent[i]), &fault);
}
```

For fixed-point `VectorPow`, accept only integral exponents known from the runtime input value, use bounded exponentiation-by-squaring capped by `maxLoopIterations`, and signal a numeric fault for fractional or out-of-bound exponents.

- [ ] **Step 4: Add and execute float32/fixed paired cases**

Register `XB-W1-F32-MATH` and `XB-W1-FIXED-MATH` fixtures covering negative inputs, empty-input rejection, saturation, non-finite `pow`, vector/matrix reductions, and both `Max` modes.

Run: `npx vitest run src/utils/stateMachine/xbInterpreter.test.ts src/utils/stateMachine/xbCGenerator.test.ts src/utils/stateMachine/xbDeclaredCConformance.test.ts`

Expected: PASS with both new case IDs compiled and executed.

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/xbSemanticBuilder.ts src/utils/stateMachine/xbInterpreter.ts src/utils/stateMachine/xbCGenerator.ts src/utils/stateMachine/xbCConformanceCases.ts src/utils/stateMachine/xbInterpreter.test.ts src/utils/stateMachine/xbCGenerator.test.ts
git commit -m "feat: generate bounded math and reduction blocks"
```

### Task 4: Identity matrix and capability release

**Files:**
- Modify: `src/utils/stateMachine/xbSemanticBuilder.ts`
- Modify: `src/utils/stateMachine/xbInterpreter.ts`
- Modify: `src/utils/stateMachine/xbCGenerator.ts`
- Modify: `src/utils/stateMachine/xbCapabilities.ts`
- Modify: `src/utils/stateMachine/xbCConformanceCases.ts`
- Modify: `docs/XBRIDGES_EMBEDDED_CODEGEN.md`

**Interfaces:**
- Produces `IdentityMatrix` as a no-input, `dim x dim` static matrix operation and enables all five Wave 1 capability entries.
- Consumes executed cases `XB-W1-F32-MATH`, `XB-W1-FIXED-MATH`, `XB-W1-F32-IDENTITY`, and `XB-W1-FIXED-IDENTITY`.

- [ ] **Step 1: Add failing dimension and output tests**

```ts
it('builds a statically sized identity matrix', () => {
  expect(runConstantBlock('IdentityMatrix', { dim: 3 })).toEqual([
    [1, 0, 0], [0, 1, 0], [0, 0, 1],
  ]);
});

it.each([0, -1, 9, 2.5])('rejects IdentityMatrix dim=%s', (dim) => {
  expect(() => buildIdentity(dim)).toThrow();
});
```

- [ ] **Step 2: Confirm tests fail**

Run: `npx vitest run src/utils/stateMachine/xbSemanticBuilder.test.ts src/utils/stateMachine/xbInterpreter.test.ts -t "IdentityMatrix"`

Expected: FAIL because the operation is not enabled in the semantic path.

- [ ] **Step 3: Implement and cover IdentityMatrix**

Validate `dim` as an integer in `[1, target.embeddedLimits.maxMatrixRows]` and also against `maxMatrixColumns`. Emit nested literal-bound loops and numeric-profile constants (`1.0F/0.0F` for float32, quantized one/zero for fixed-point). Add and execute both identity case IDs.

- [ ] **Step 4: Enable capabilities only after coverage passes**

Declare directional shapes exactly: `VectorPow` vector-to-vector; reductions vector/matrix-to-scalar; one-input `Max` vector/matrix-to-scalar plus multi-input same-shape mode; `IdentityMatrix` no-input-to-matrix. Point each capability to its executed float32 and fixed case IDs.

Run: `npx vitest run src/utils/stateMachine/xbCapabilities.test.ts src/utils/stateMachine/xbSemanticBuilder.test.ts src/utils/stateMachine/xbDeclaredCConformance.test.ts && npx tsc --noEmit`

Expected: PASS and zero TypeScript errors.

- [ ] **Step 5: Document and commit Wave 1**

Document limits, reduction order, `Max` modes, fixed integral-exponent restriction, and failure behavior.

```bash
git add src/utils/stateMachine/xbSemanticBuilder.ts src/utils/stateMachine/xbInterpreter.ts src/utils/stateMachine/xbCGenerator.ts src/utils/stateMachine/xbCapabilities.ts src/utils/stateMachine/xbCConformanceCases.ts src/utils/stateMachine/xbSemanticBuilder.test.ts src/utils/stateMachine/xbInterpreter.test.ts docs/XBRIDGES_EMBEDDED_CODEGEN.md
git commit -m "feat: release X-Bridges math reduction wave"
```

### Task 5: Wave 1 release verification

**Files:**
- Verify only.

**Interfaces:**
- Consumes the complete Wave 1 implementation.
- Produces a recorded clean verification result for review.

- [ ] **Step 1: Run the complete X-Bridges suite**

Run: `npx vitest run src/utils/stateMachine/xbCapabilities.test.ts src/utils/stateMachine/xbSemanticBuilder.test.ts src/utils/stateMachine/xbSemanticValidator.test.ts src/utils/stateMachine/xbInterpreter.test.ts src/utils/stateMachine/xbCGenerator.test.ts src/utils/stateMachine/xbDeclaredCConformance.test.ts src/utils/stateMachine/smDifferential.test.ts`

Expected: PASS; no skipped executable conformance case.

- [ ] **Step 2: Verify generated C and production build**

Run: `npm run build:sm-runtime && npx tsc --noEmit`

Expected: both commands exit 0.

- [ ] **Step 3: Verify exclusions remain fail-closed**

Run: `npx vitest run src/utils/stateMachine/xbCapabilities.test.ts -t "ROBOT_VACUUM|authoring|visualization"`

Expected: PASS; every `ROBOT_VACUUM_*`, `Note`, `ROOT_LOCUS`, and `Scope` capability remains `codegen: false`.

- [ ] **Step 4: Commit generated runtime bundle if changed**

```bash
git add src/generated/stateMachineRuntimeBundle.ts
git commit -m "build: refresh state machine runtime for wave 1"
```

