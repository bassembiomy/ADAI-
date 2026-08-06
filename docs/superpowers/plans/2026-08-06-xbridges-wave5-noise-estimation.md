# X-Bridges Wave 5 Noise and Estimation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic strict-C99 implementations for `WHITE_NOISE`, `BAND_LIMITED_NOISE`, `KALMAN_FILTER`, and `EXTENDED_KALMAN_FILTER` in float32 and fixed-point profiles.

**Architecture:** Replace host `Math.random()` with explicit per-instance PRNG state and deterministic Gaussian sampling. Use bounded static matrix kernels for Kalman filters; compile EKF expressions to the existing safe semantic AST at build time and generate bounded Jacobian evaluation without runtime parsing.

**Tech Stack:** TypeScript, Vitest, semantic expression AST, static matrix kernels, generated strict C99, GCC.

## Global Constraints

- Wave 1 bounded profile/executable gate and Wave 3 static dynamics conventions are prerequisites.
- No heap, recursion, VLA, mutable globals, runtime expression parser, or `mathjs` dependency in generated execution.
- PRNG state belongs to each ADIA instance; equal seeds produce equal traces.
- Float32 and fixed-point executable profiles are mandatory; fixed matrix operations quantize at every multiply-accumulate.
- All exclusions remain codegen-disabled.

## File Map

- Create `xbDeterministicNoise.ts/.test.ts` for the specified PRNG/Gaussian contract.
- Create `xbStaticMatrix.ts/.test.ts` for bounded matrix operations and inversion.
- Create `xbEkfExpressions.ts/.test.ts` for allowed vector-expression parsing/evaluation/Jacobians.
- Modify semantic builder/interpreter/C generator, conformance registry, capabilities, and docs.

---

### Task 1: Per-instance deterministic noise core

**Files:**
- Create: `src/utils/stateMachine/xbDeterministicNoise.ts`
- Create: `src/utils/stateMachine/xbDeterministicNoise.test.ts`
- Modify: `src/utils/stateMachine/xbSemanticModel.ts`

**Interfaces:**
- Produces `nextXorShift32(state: number): { state: number; uniform: number }` and `nextGaussianPair(state: number)`.
- Semantic noise operations store `rng_state`, `spare_normal`, and `has_spare_normal` slots.

- [ ] **Step 1: Write golden-vector tests**

```ts
it('matches the xorshift32 golden vector', () => {
  expect(takeUniforms(0x6d2b79f5, 4).states).toEqual([0x40aec71f, 0x91e00c19, 0x9c0fe128, 0x6570f69d]);
});

it('never passes zero to log during Box-Muller conversion', () => {
  expect(takeGaussians(1, 1000).every(Number.isFinite)).toBe(true);
});
```

- [ ] **Step 2: Confirm RED**

Run: `npx vitest run src/utils/stateMachine/xbDeterministicNoise.test.ts`

Expected: FAIL because the core is absent.

- [ ] **Step 3: Implement the bit-exact generator**

Apply xorshift32 shifts `13,17,5` with unsigned 32-bit truncation. Map output to open interval `(0,1)` as `(state + 0.5) / 4294967296`. Use Box-Muller, cache the second normal, reject seed zero or replace it deterministically with `0x6d2b79f5`, and document that libm tolerance applies to Gaussian outputs while PRNG states are exact.

- [ ] **Step 4: Run and commit**

Run: `npx vitest run src/utils/stateMachine/xbDeterministicNoise.test.ts`

Expected: PASS.

```bash
git add src/utils/stateMachine/xbDeterministicNoise.ts src/utils/stateMachine/xbDeterministicNoise.test.ts src/utils/stateMachine/xbSemanticModel.ts
git commit -m "feat: add deterministic embedded noise core"
```

### Task 2: White and band-limited noise blocks

**Files:**
- Modify: `src/utils/stateMachine/xbSemanticBuilder.ts`
- Modify: `src/utils/stateMachine/xbInterpreter.ts`
- Modify: `src/utils/stateMachine/xbCGenerator.ts`
- Modify: `src/utils/stateMachine/xbCConformanceCases.ts`

**Interfaces:**
- Produces cases `XB-W5-NOISE-F32` and `XB-W5-NOISE-FIXED`.
- Adds a persisted numeric `seed` parameter with deterministic default `1831565813`.

- [ ] **Step 1: Add failing repeatability tests**

```ts
it('repeats noise traces for equal seeds and isolates instances', () => {
  expect(runNoiseTwice(1234)).toEqual(runNoiseTwice(1234));
  expect(runTwoInterleavedInstances(1234)).toEqual(runTwoSeparateInstances(1234));
});
```

- [ ] **Step 2: Confirm RED**

Run: `npx vitest run src/utils/stateMachine/xbInterpreter.test.ts -t "repeats noise"`

Expected: FAIL while host `Math.random()` semantics remain.

- [ ] **Step 3: Implement both blocks**

Validate finite mean, variance `>=0`, integer seed, and for band-limited noise `fc>0`. White output is `mean + sqrt(variance)*normal`. Band-limited output applies the Wave 3 low-pass equation using the model step. Persist all random/filter state in the instance and quantize output plus filter state for fixed-point.

- [ ] **Step 4: Execute cases and commit**

Run: `npx vitest run src/utils/stateMachine/xbDeclaredCConformance.test.ts -t "XB-W5-NOISE"`

Expected: PASS including exact PRNG-state comparison and tolerance-based numeric output comparison.

```bash
git add src/utils/stateMachine/xbSemanticBuilder.ts src/utils/stateMachine/xbInterpreter.ts src/utils/stateMachine/xbCGenerator.ts src/utils/stateMachine/xbCConformanceCases.ts src/utils/stateMachine/xbInterpreter.test.ts
git commit -m "feat: generate deterministic noise blocks"
```

### Task 3: Bounded static matrix kernel

**Files:**
- Create: `src/utils/stateMachine/xbStaticMatrix.ts`
- Create: `src/utils/stateMachine/xbStaticMatrix.test.ts`
- Modify: `src/utils/stateMachine/xbCGenerator.ts`

**Interfaces:**
- Produces checked `matrixMultiply`, `matrixAdd`, `matrixTranspose`, and `matrixInverseGaussJordan` semantic helpers plus equivalent literal-dimension C templates.
- Inversion returns a fault instead of dividing by a pivot whose absolute value is below `1e-6` float32 or one fixed-point LSB.

- [ ] **Step 1: Write failing matrix tests**

```ts
it('inverts a pivoting 2x2 matrix', () => {
  expect(matrixInverseGaussJordan([[0, 2], [1, 3]], f32)).toApproxMatrix([[-1.5, 1], [0.5, 0]]);
});

it('faults deterministically on a singular innovation covariance', () => {
  expect(matrixInverseGaussJordan([[1, 2], [2, 4]], f32).fault).toBe(true);
});
```

- [ ] **Step 2: Confirm RED, implement partial-pivot Gauss-Jordan, and run tests**

Run before implementation: `npx vitest run src/utils/stateMachine/xbStaticMatrix.test.ts`

Expected before: FAIL. Use fixed literal dimensions, deterministic first-maximum pivot selection, bounded loops, and checked multiply-accumulate. Run again; expected PASS.

- [ ] **Step 3: Commit**

```bash
git add src/utils/stateMachine/xbStaticMatrix.ts src/utils/stateMachine/xbStaticMatrix.test.ts src/utils/stateMachine/xbCGenerator.ts
git commit -m "feat: add bounded static matrix kernels"
```

### Task 4: Linear Kalman filter

**Files:**
- Modify: `src/utils/stateMachine/xbSemanticBuilder.ts`
- Modify: `src/utils/stateMachine/xbInterpreter.ts`
- Modify: `src/utils/stateMachine/xbCGenerator.ts`
- Modify: `src/utils/stateMachine/xbCConformanceCases.ts`

**Interfaces:**
- Produces static slots `x` and `P` and outputs `x_hat`, `y_hat`, `innovation`, and `K`.
- Produces `XB-W5-KALMAN-F32` and `XB-W5-KALMAN-FIXED`.

- [ ] **Step 1: Add failing scalar and 2-state tests**

```ts
it('matches a hand-calculated scalar Kalman update', () => {
  expect(runKalman(scalarFixture, [1])).toApproxFrame({ x_hat: [0.5], innovation: [1], K: [[0.5]] });
});
```

- [ ] **Step 2: Confirm RED**

Run: `npx vitest run src/utils/stateMachine/xbInterpreter.test.ts -t "scalar Kalman"`

Expected: FAIL.

- [ ] **Step 3: Implement predict/update with Joseph covariance form**

Validate all A/B/C/Q/R/P0 dimensions and total elements against embedded limits. Execute predict, innovation, gain, state update, and `P=(I-KC)P(I-KC)^T+KRK^T`. On singular innovation covariance, retain prior state/covariance, emit configured fallback outputs, and raise the operation fault.

- [ ] **Step 4: Execute cases and commit**

Run: `npx vitest run src/utils/stateMachine/xbStaticMatrix.test.ts src/utils/stateMachine/xbDeclaredCConformance.test.ts -t "XB-W5-KALMAN"`

Expected: PASS for scalar, 2-state, singular-fault, reset, float32, and fixed-point cases.

```bash
git add src/utils/stateMachine/xbSemanticBuilder.ts src/utils/stateMachine/xbInterpreter.ts src/utils/stateMachine/xbCGenerator.ts src/utils/stateMachine/xbCConformanceCases.ts src/utils/stateMachine/xbInterpreter.test.ts
git commit -m "feat: add bounded Kalman filter generation"
```

### Task 5: Extended Kalman expressions and filter

**Files:**
- Create: `src/utils/stateMachine/xbEkfExpressions.ts`
- Create: `src/utils/stateMachine/xbEkfExpressions.test.ts`
- Modify: `src/utils/stateMachine/xbSemanticBuilder.ts`
- Modify: `src/utils/stateMachine/xbInterpreter.ts`
- Modify: `src/utils/stateMachine/xbCGenerator.ts`
- Modify: `src/utils/stateMachine/xbCConformanceCases.ts`

**Interfaces:**
- Produces `compileEkfVectorExpressions(expressions, symbols, limits): readonly ExpressionNode[]`.
- Produces `XB-W5-EKF-F32` and `XB-W5-EKF-FIXED`.

- [ ] **Step 1: Write failing expression-policy tests**

```ts
it('accepts bounded arithmetic and rejects calls or unknown symbols', () => {
  expect(compileEkfVectorExpressions(['x0 + dt*u0', 'sin(x1)'], symbols, limits)).toHaveLength(2);
  expect(() => compileEkfVectorExpressions(['import("fs")'], symbols, limits)).toThrow();
  expect(() => compileEkfVectorExpressions(['x99'], symbols, limits)).toThrow();
});
```

- [ ] **Step 2: Confirm RED, then implement the allowlist**

Run before: `npx vitest run src/utils/stateMachine/xbEkfExpressions.test.ts`; expected FAIL. Reuse the repository expression tokenizer/AST and allow only literals, `xN/uN/dt`, arithmetic, parentheses, and explicitly emitted scalar functions `sin`, `cos`, `exp`, `sqrt`, `abs`. Enforce AST-node and dimension limits. Run again; expected PASS.

- [ ] **Step 3: Implement EKF semantics and C generation**

Evaluate `f` and `h` from the precompiled AST. Compute Jacobians by symmetric finite differences with semantic constant `epsilon=0.0009765625` (exact binary float32); fixed-point uses the larger of epsilon and one LSB. Use the same Joseph covariance update and failure behavior as Task 4. Generated C contains direct expressions and literal-bound loops, never strings or parsing.

- [ ] **Step 4: Execute cases and commit**

Run: `npx vitest run src/utils/stateMachine/xbEkfExpressions.test.ts src/utils/stateMachine/xbDeclaredCConformance.test.ts -t "XB-W5-EKF"`

Expected: PASS for a nonlinear scalar case, a 2-state case, fixed-point perturbation, and singular covariance.

```bash
git add src/utils/stateMachine/xbEkfExpressions.ts src/utils/stateMachine/xbEkfExpressions.test.ts src/utils/stateMachine/xbSemanticBuilder.ts src/utils/stateMachine/xbInterpreter.ts src/utils/stateMachine/xbCGenerator.ts src/utils/stateMachine/xbCConformanceCases.ts
git commit -m "feat: add bounded extended Kalman generation"
```

### Task 6: Release and verify Wave 5

**Files:**
- Modify: `src/utils/stateMachine/xbCapabilities.ts`
- Modify: `src/utils/stateMachine/xbCapabilities.test.ts`
- Modify: `docs/XBRIDGES_EMBEDDED_CODEGEN.md`

**Interfaces:**
- Enables exactly the four Wave 5 blocks.

- [ ] **Step 1: Enable capabilities with all executed IDs**

Require the math library for Gaussian and allowed EKF functions. Declare output shapes explicitly for state/measurement/gain matrices and reject any diagram whose dimensions exceed the target profile.

- [ ] **Step 2: Run the full release gate**

Run: `npx vitest run src/utils/stateMachine/xbDeterministicNoise.test.ts src/utils/stateMachine/xbStaticMatrix.test.ts src/utils/stateMachine/xbEkfExpressions.test.ts src/utils/stateMachine/xbCapabilities.test.ts src/utils/stateMachine/xbSemanticBuilder.test.ts src/utils/stateMachine/xbInterpreter.test.ts src/utils/stateMachine/xbCGenerator.test.ts src/utils/stateMachine/xbDeclaredCConformance.test.ts src/utils/stateMachine/smDifferential.test.ts && npm run build:sm-runtime && npx tsc --noEmit`

Expected: PASS; six Wave 5 profile cases execute through GCC.

- [ ] **Step 3: Document and commit**

Document seed behavior, PRNG algorithm, matrix limits/pivot threshold, EKF grammar/epsilon, quantization points, and singular-matrix fallback.

```bash
git add src/utils/stateMachine/xbCapabilities.ts src/utils/stateMachine/xbCapabilities.test.ts docs/XBRIDGES_EMBEDDED_CODEGEN.md src/generated/stateMachineRuntimeBundle.ts
git commit -m "feat: release X-Bridges noise and estimation wave"
```

