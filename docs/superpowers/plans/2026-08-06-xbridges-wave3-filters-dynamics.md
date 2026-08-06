# X-Bridges Wave 3 Filters and Dynamics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add strict-C99 float32 and fixed-point implementations for `LOW_PASS_FILTER`, `HIGH_PASS_FILTER`, `MOVING_AVERAGE`, `TRANSFER_FUNCTION`, `ZERO_POLE_GAIN`, `LAPLACE_TRANSFORM`, `DERIVATIVE`, and `INTEGRATOR`.

**Architecture:** Normalize dynamic-system parameters into static discrete realizations in the semantic builder, then execute the same coefficient/state contract in the interpreter and C. Continuous blocks use the model solver contract; discrete filters use explicit delay-line state, fixed dimensions, and deterministic update order.

**Tech Stack:** TypeScript, Vitest, X-Bridges semantic IR, Euler/RK4 semantic solver, generated strict C99, GCC.

## Global Constraints

- Waves 1 and its executable-conformance infrastructure are prerequisites.
- Static model-sized storage and compile-time bounds only; no heap, recursion, VLAs, runtime polynomial allocation, or globals.
- Float32 and fixed-point coverage are both required for every released block.
- Parameter conversion or discretization occurs during semantic build, not in generated execution.
- Exclusions remain unchanged: all `ROBOT_VACUUM_*`, `Note`, `ROOT_LOCUS`, and `Scope` are codegen-disabled.

## File Map

- Create `src/utils/stateMachine/xbDynamicRealization.ts` and its tests for coefficient normalization/discretization.
- Modify builder/interpreter/C generator for filter, delay-line, and continuous state semantics.
- Add executable cases to `xbCConformanceCases.ts`.
- Release entries in `xbCapabilities.ts` only after all paired cases pass.

---

### Task 1: Static realization helper

**Files:**

- Create: `src/utils/stateMachine/xbDynamicRealization.ts`
- Create: `src/utils/stateMachine/xbDynamicRealization.test.ts`
- Modify: `src/utils/stateMachine/xbSemanticModel.ts`

**Interfaces:**
- Produces `normalizeTransferFunction(numerator, denominator, limits): XBDiscreteRealization` and `zeroPoleGainToTransfer(zeros, poles, gain, limits)`.
- `XBDiscreteRealization` contains readonly normalized numerator/denominator arrays and a literal state length.

- [ ] **Step 1: Write failing normalization tests**

```ts
it('normalizes denominator a0 to one', () => {
  expect(normalizeTransferFunction([2], [2, 4], limits)).toEqual({ numerator: [1], denominator: [1, 2], stateLength: 1 });
});

it.each([[[1], [0, 1]], [[1], []], [new Array(66).fill(1), [1]]])('rejects invalid or oversized coefficients', ([b, a]) => {
  expect(() => normalizeTransferFunction(b, a, limits)).toThrow();
});
```

- [ ] **Step 2: Confirm RED**

Run: `npx vitest run src/utils/stateMachine/xbDynamicRealization.test.ts`

Expected: FAIL because the helper is absent.

- [ ] **Step 3: Implement deterministic coefficient expansion**

Validate finite coefficients and nonzero `a0`; normalize in declared numeric precision. Expand zero/pole factors in ascending powers using bounded nested loops and reject complex coefficients until the persisted model has an explicit real-pair representation. Count coefficient/state elements against `embeddedLimits`.

- [ ] **Step 4: Run helper tests and commit**

Run: `npx vitest run src/utils/stateMachine/xbDynamicRealization.test.ts`

Expected: PASS including limit, non-finite, and zero-leading-denominator cases.

```bash
git add src/utils/stateMachine/xbDynamicRealization.ts src/utils/stateMachine/xbDynamicRealization.test.ts src/utils/stateMachine/xbSemanticModel.ts
git commit -m "feat: add bounded dynamic realization helper"
```

### Task 2: Low/high-pass and moving average

**Files:**
- Modify: `src/utils/stateMachine/xbSemanticBuilder.ts`
- Modify: `src/utils/stateMachine/xbInterpreter.ts`
- Modify: `src/utils/stateMachine/xbCGenerator.ts`
- Modify: `src/utils/stateMachine/xbCConformanceCases.ts`

**Interfaces:**
- Produces slots `y`, `last_u`, and literal-size moving-average `buffer/index/sum` state.
- Produces executable cases `XB-W3-FILTERS-F32` and `XB-W3-FILTERS-FIXED`.

- [ ] **Step 1: Add failing impulse/step traces**

```ts
it('matches known first-order and moving-average traces', () => {
  expect(runFilter('LOW_PASS_FILTER', { fc: 1, sampleTime: 0.1 }, [0, 1, 1])).toApproxTrace([0, 0.38587, 0.62284]);
  expect(runFilter('MOVING_AVERAGE', { window_size: 3 }, [3, 6, 9, 12])).toEqual([1, 3, 6, 9]);
});
```

- [ ] **Step 2: Confirm RED**

Run: `npx vitest run src/utils/stateMachine/xbInterpreter.test.ts -t "known first-order"`

Expected: FAIL.

- [ ] **Step 3: Implement exact equations**

Use `alpha = dt/(1/(2*pi*fc)+dt)`. Low-pass: `y += alpha*(u-y)`. High-pass: `y = alpha*(y+u-last_u)`. Moving average stores a literal-length circular buffer, running sum, and index; initial zero-filled samples participate in the divisor. Validate `fc > 0`, `sampleTime > 0`, and integer `window_size` within state/loop limits. Quantize every state update in fixed-point.

- [ ] **Step 4: Execute paired cases and commit**

Run: `npx vitest run src/utils/stateMachine/xbDeclaredCConformance.test.ts -t "XB-W3-FILTERS"`

Expected: PASS for reset, initial state, saturation, and at least two window sizes.

```bash
git add src/utils/stateMachine/xbSemanticBuilder.ts src/utils/stateMachine/xbInterpreter.ts src/utils/stateMachine/xbCGenerator.ts src/utils/stateMachine/xbCConformanceCases.ts src/utils/stateMachine/xbInterpreter.test.ts
git commit -m "feat: add bounded embedded filters"
```

### Task 3: Transfer function, zero-pole-gain, and Laplace transform

**Files:**
- Modify: `src/utils/stateMachine/xbSemanticBuilder.ts`
- Modify: `src/utils/stateMachine/xbInterpreter.ts`
- Modify: `src/utils/stateMachine/xbCGenerator.ts`
- Modify: `src/utils/stateMachine/xbCConformanceCases.ts`

**Interfaces:**
- Consumes `XBDiscreteRealization`.
- Produces a common direct-form-II-transposed state update for `TRANSFER_FUNCTION` and `ZERO_POLE_GAIN`; `LAPLACE_TRANSFORM` must lower to the same realization or fail validation.

- [ ] **Step 1: Add failing equivalence tests**

```ts
it('gives identical traces for equivalent TF and ZPK models', () => {
  const input = [1, 0, 0, 0];
  expect(runDynamic('TRANSFER_FUNCTION', tf, input)).toEqual(runDynamic('ZERO_POLE_GAIN', zpk, input));
});

it('rejects symbolic Laplace expressions outside the supported rational grammar', () => {
  expect(() => buildLaplace('exp(-s)')).toThrow(/rational polynomial/);
});
```

- [ ] **Step 2: Confirm RED**

Run: `npx vitest run src/utils/stateMachine/xbSemanticBuilder.test.ts src/utils/stateMachine/xbInterpreter.test.ts -t "TF and ZPK|rational polynomial"`

Expected: FAIL.

- [ ] **Step 3: Implement one realization kernel**

Convert all three block forms to normalized static coefficients. For `LAPLACE_TRANSFORM`, accept only a numeric numerator/denominator parameter form or the bounded grammar of real-coefficient polynomials in `s`; reject delays, arbitrary functions, and improper ambiguous expressions. Discretize once at build time with the documented bilinear transform and solver step. Emit literal-bound direct-form-II-transposed loops.

- [ ] **Step 4: Add float/fixed executable cases**

Register `XB-W3-DYNAMICS-F32` and `XB-W3-DYNAMICS-FIXED`, covering first/second order, non-unit `a0`, reset, overflow, and equivalent TF/ZPK/Laplace traces.

Run: `npx vitest run src/utils/stateMachine/xbDynamicRealization.test.ts src/utils/stateMachine/xbDeclaredCConformance.test.ts -t "XB-W3-DYNAMICS"`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/xbSemanticBuilder.ts src/utils/stateMachine/xbInterpreter.ts src/utils/stateMachine/xbCGenerator.ts src/utils/stateMachine/xbCConformanceCases.ts src/utils/stateMachine/xbSemanticBuilder.test.ts src/utils/stateMachine/xbInterpreter.test.ts
git commit -m "feat: generate bounded transfer realizations"
```

### Task 4: Derivative and integrator

**Files:**
- Modify: `src/utils/stateMachine/xbSemanticBuilder.ts`
- Modify: `src/utils/stateMachine/xbInterpreter.ts`
- Modify: `src/utils/stateMachine/xbCGenerator.ts`
- Modify: `src/utils/stateMachine/xbCConformanceCases.ts`

**Interfaces:**
- Produces explicit previous-input derivative state and integrator continuous/discrete state boundaries.
- Produces `XB-W3-CONTINUOUS-F32` and `XB-W3-CONTINUOUS-FIXED`.

- [ ] **Step 1: Add failing solver tests**

```ts
it.each(['euler', 'rk4'] as const)('integrates a constant with %s', kind => {
  expect(runIntegrator(kind, 0.1, [2, 2, 2])).toApproxTrace([0.2, 0.4, 0.6]);
});

it('defines derivative output at initialization as zero', () => {
  expect(runDerivative(0.1, [5, 7])).toEqual([0, 20]);
});
```

- [ ] **Step 2: Confirm RED**

Run: `npx vitest run src/utils/stateMachine/xbInterpreter.test.ts -t "integrates a constant|derivative output"`

Expected: FAIL.

- [ ] **Step 3: Implement state and fault semantics**

Use the existing semantic solver for `INTEGRATOR`, honoring initial condition, optional reset, and output limits in a fixed priority order: reset, integrate, clamp, commit. Define `DERIVATIVE` as zero before a previous sample exists, then `(u-last_u)/dt`; reject nonpositive `dt`. Quantize each RK stage and committed state for fixed-point so C and interpreter agree.

- [ ] **Step 4: Execute cases and commit**

Run: `npx vitest run src/utils/stateMachine/xbDeclaredCConformance.test.ts -t "XB-W3-CONTINUOUS"`

Expected: PASS for Euler, RK4, reset, limits, initialization, and numeric faults.

```bash
git add src/utils/stateMachine/xbSemanticBuilder.ts src/utils/stateMachine/xbInterpreter.ts src/utils/stateMachine/xbCGenerator.ts src/utils/stateMachine/xbCConformanceCases.ts src/utils/stateMachine/xbInterpreter.test.ts
git commit -m "feat: add derivative and integrator generation"
```

### Task 5: Capability release and full verification

**Files:**
- Modify: `src/utils/stateMachine/xbCapabilities.ts`
- Modify: `src/utils/stateMachine/xbCapabilities.test.ts`
- Modify: `docs/XBRIDGES_EMBEDDED_CODEGEN.md`

**Interfaces:**
- Enables exactly the eight Wave 3 block types with their executed float/fixed case IDs.

- [ ] **Step 1: Add and satisfy release assertions**

```ts
it.each(['LOW_PASS_FILTER','HIGH_PASS_FILTER','MOVING_AVERAGE','TRANSFER_FUNCTION','ZERO_POLE_GAIN','LAPLACE_TRANSFORM','DERIVATIVE','INTEGRATOR'])('%s has paired executable profiles', type => {
  const cap = getXBBlockCapability(type)!;
  expect(cap.codegen).toBe(true);
  expect(cap.cConformanceCaseIds).toEqual(expect.arrayContaining([expect.stringMatching(/F32/), expect.stringMatching(/FIXED/)]));
});
```

- [ ] **Step 2: Run all release gates**

Run: `npx vitest run src/utils/stateMachine/xbDynamicRealization.test.ts src/utils/stateMachine/xbCapabilities.test.ts src/utils/stateMachine/xbSemanticBuilder.test.ts src/utils/stateMachine/xbInterpreter.test.ts src/utils/stateMachine/xbCGenerator.test.ts src/utils/stateMachine/xbDeclaredCConformance.test.ts src/utils/stateMachine/smDifferential.test.ts && npm run build:sm-runtime && npx tsc --noEmit`

Expected: PASS with no skipped C cases or TypeScript errors.

- [ ] **Step 3: Document and commit**

Document coefficient order, bilinear discretization, initialization, fixed-point quantization points, and all rejected parameter forms.

```bash
git add src/utils/stateMachine/xbCapabilities.ts src/utils/stateMachine/xbCapabilities.test.ts docs/XBRIDGES_EMBEDDED_CODEGEN.md src/generated/stateMachineRuntimeBundle.ts
git commit -m "feat: release X-Bridges filters and dynamics wave"
```

