# X-Bridges Wave 6 Optimization and Adaptation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Release bounded strict-C99 float32 and fixed-point implementations for `MPC_CONTROLLER` and `LMS_ADAPTIVE_FILTER`.

**Architecture:** Replace the host-only MPC solver object with a semantic, fixed-iteration projected-gradient controller whose matrices and workspace sizes are fixed at model build time. Implement LMS as an explicit two-tap state transition, then require full interpreter/C trace agreement and worst-case iteration/resource validation before release.

**Tech Stack:** TypeScript, Vitest, static matrix kernels from Wave 5, generated strict C99, GCC.

## Global Constraints

- Waves 1 and 5 are prerequisites for bounded profiles, executable conformance, and checked static matrix kernels.
- Generated execution uses static model-sized storage, literal-bounded loops, no heap, recursion, VLA, mutable globals, or opaque host solver objects.
- Solver iteration counts and every matrix dimension are compile-time/model-build constants checked against the target profile.
- Float32 and fixed-point executable profiles are both mandatory.
- All `ROBOT_VACUUM_*`, `Note`, `ROOT_LOCUS`, and `Scope` stay excluded.

## File Map

- Create `src/utils/stateMachine/xbMpcContract.ts/.test.ts`: parameter normalization, lifted matrices, resource/iteration checks.
- Create `src/utils/stateMachine/xbProjectedGradient.ts/.test.ts`: deterministic bounded solver semantics.
- Modify semantic builder/interpreter/C generator, executable cases, capabilities, and docs.
- Reuse `xbStaticMatrix.ts` checked operations; do not introduce a second matrix library.

---

### Task 1: Static MPC contract and resource accounting

**Files:**
- Create: `src/utils/stateMachine/xbMpcContract.ts`
- Create: `src/utils/stateMachine/xbMpcContract.test.ts`
- Modify: `src/utils/stateMachine/xbSemanticModel.ts`
- Modify: `src/utils/stateMachine/xbEmbeddedProfile.ts`

**Interfaces:**
- Produces `buildMpcContract(parameters, limits): XBMpcContract`.
- `XBMpcContract` contains validated dimensions, static `H`, `g` construction operands, bounds, `iterations`, `stepSize`, and exact workspace element count.

- [ ] **Step 1: Write failing parameter/resource tests**

```ts
it('builds a bounded SISO horizon contract', () => {
  const contract = buildMpcContract(sisoParameters, limits);
  expect(contract).toMatchObject({ stateCount: 1, inputCount: 1, outputCount: 1, predictionHorizon: 4, controlHorizon: 2, iterations: 16 });
});

it.each([
  { Np: 0 }, { Nc: 5, Np: 4 }, { iterations: 0 },
  { u_min: [2], u_max: [1] }, oversizedMatrixParameters,
])('rejects invalid MPC configuration %#', override => {
  expect(() => buildMpcContract({ ...sisoParameters, ...override }, limits)).toThrow();
});
```

- [ ] **Step 2: Confirm RED**

Run: `npx vitest run src/utils/stateMachine/xbMpcContract.test.ts`

Expected: FAIL because the static contract does not exist.

- [ ] **Step 3: Implement validation and lifted matrices**

Validate finite, rectangular A/B/C/D/Q/R; compatible dimensions; integers `1 <= Nc <= Np`; positive integer iterations; positive finite step size; and element/loop totals within `XBEmbeddedLimits`. Build prediction/control matrices at semantic-build time, symmetrize the Hessian, and store flat row-major readonly arrays. Default to exactly `16` iterations; no convergence-dependent early exit.

- [ ] **Step 4: Run tests and commit**

Run: `npx vitest run src/utils/stateMachine/xbMpcContract.test.ts src/utils/stateMachine/xbEmbeddedProfile.test.ts`

Expected: PASS at exact boundaries and for every rejection.

```bash
git add src/utils/stateMachine/xbMpcContract.ts src/utils/stateMachine/xbMpcContract.test.ts src/utils/stateMachine/xbSemanticModel.ts src/utils/stateMachine/xbEmbeddedProfile.ts src/utils/stateMachine/xbEmbeddedProfile.test.ts
git commit -m "feat: add bounded MPC semantic contract"
```

### Task 2: Deterministic projected-gradient solver

**Files:**
- Create: `src/utils/stateMachine/xbProjectedGradient.ts`
- Create: `src/utils/stateMachine/xbProjectedGradient.test.ts`

**Interfaces:**
- Produces `solveProjectedGradient(problem, warmStart, numeric): XBProjectedGradientResult`.
- Inputs are static row-major Hessian/gradient/bounds, literal dimension, exact iteration count, and step size; output includes solution and numeric fault.

- [ ] **Step 1: Write failing golden tests**

```ts
it('solves a bounded scalar quadratic in exactly four iterations', () => {
  expect(solveProjectedGradient({ h: [2], g: [-2], lower: [0], upper: [0.75], dimension: 1, iterations: 4, stepSize: 0.25 }, [0], f32).solution).toEqual([0.75]);
});

it('quantizes every fixed-point gradient update', () => {
  expect(solveProjectedGradient(fixedProblem, [0], q15).solution).toEqual([16384]);
});
```

- [ ] **Step 2: Confirm RED**

Run: `npx vitest run src/utils/stateMachine/xbProjectedGradient.test.ts`

Expected: FAIL because the solver is absent.

- [ ] **Step 3: Implement exact fixed-iteration semantics**

For each of exactly `iterations` passes, compute `gradient = H*u + g`, then `u = clamp(u-stepSize*gradient, lower, upper)`. Traverse rows and columns in ascending index order. Quantize every multiply, accumulate, subtraction, and stored iterate in fixed-point. On a numeric fault, retain the previous complete iterate and return the fault; never return a partially updated vector.

- [ ] **Step 4: Run tests and commit**

Run: `npx vitest run src/utils/stateMachine/xbProjectedGradient.test.ts`

Expected: PASS, including exact iteration-count instrumentation and fault rollback.

```bash
git add src/utils/stateMachine/xbProjectedGradient.ts src/utils/stateMachine/xbProjectedGradient.test.ts
git commit -m "feat: add fixed-iteration projected-gradient solver"
```

### Task 3: MPC semantic operation and canonical interpreter

**Files:**
- Modify: `src/utils/stateMachine/xbSemanticBuilder.ts`
- Modify: `src/utils/stateMachine/xbInterpreter.ts`
- Test: `src/utils/stateMachine/xbSemanticBuilder.test.ts`
- Test: `src/utils/stateMachine/xbInterpreter.test.ts`

**Interfaces:**
- Consumes `XBMpcContract`, `solveProjectedGradient(...)`, and static matrix kernels.
- Produces per-instance warm-start slot `u_sequence`, current plant-state slot when required by the block contract, and first control action output.

- [ ] **Step 1: Add failing closed-loop trace tests**

```ts
it('applies bounds and shifts the warm start deterministically', () => {
  expect(runMpcTrace(sisoParameters, referenceTrace)).toApproxTrace([
    { u: [0.5], warm: [0.5, 0] },
    { u: [0.75], warm: [0.75, 0] },
    { u: [0.5], warm: [0.5, 0] },
  ]);
});
```

- [ ] **Step 2: Confirm RED**

Run: `npx vitest run src/utils/stateMachine/xbInterpreter.test.ts -t "warm start deterministically"`

Expected: FAIL while `MPC_CONTROLLER` is host-only.

- [ ] **Step 3: Implement canonical update order**

Build the gradient vector from current state/reference, solve using the previous sequence, emit only the first `inputCount` values, shift the solution left one control interval, and repeat the final action into the tail. Reset zeroes the warm start. On solver fault, emit the previous first action, retain the full warm start, and raise the operation fault.

- [ ] **Step 4: Run canonical tests and commit**

Run: `npx vitest run src/utils/stateMachine/xbMpcContract.test.ts src/utils/stateMachine/xbProjectedGradient.test.ts src/utils/stateMachine/xbSemanticBuilder.test.ts src/utils/stateMachine/xbInterpreter.test.ts -t "MPC|warm start"`

Expected: PASS.

```bash
git add src/utils/stateMachine/xbSemanticBuilder.ts src/utils/stateMachine/xbInterpreter.ts src/utils/stateMachine/xbSemanticBuilder.test.ts src/utils/stateMachine/xbInterpreter.test.ts
git commit -m "feat: add canonical bounded MPC semantics"
```

### Task 4: MPC C emitter and paired profiles

**Files:**
- Modify: `src/utils/stateMachine/xbCGenerator.ts`
- Modify: `src/utils/stateMachine/xbCConformanceCases.ts`
- Test: `src/utils/stateMachine/xbCGenerator.test.ts`

**Interfaces:**
- Produces table emitter `MPC_CONTROLLER` and cases `XB-W6-MPC-F32` and `XB-W6-MPC-FIXED`.

- [ ] **Step 1: Add failing structural C tests**

```ts
it('emits literal MPC workspace and iteration bounds', () => {
  const source = generateMpcArtifacts().source;
  expect(source).toContain('for (uint32_t iteration = 0U; iteration < 16U; ++iteration)');
  expect(source).not.toMatch(/malloc|calloc|realloc|free|\[[a-zA-Z_][^\]]*\]/);
});
```

- [ ] **Step 2: Confirm RED**

Run: `npx vitest run src/utils/stateMachine/xbCGenerator.test.ts -t "literal MPC workspace"`

Expected: FAIL.

- [ ] **Step 3: Emit static row-major loops and register cases**

Place workspace arrays in the instance state with literal extents. Emit fixed iteration, row, and column bounds derived from the semantic contract. Use checked fixed operations for the fixed profile. Cases must cover unconstrained optimum, active lower/upper bounds, warm start, reset, two instances, numeric-fault rollback, and maximum accepted dimensions with a reduced valid horizon fixture.

- [ ] **Step 4: Compile, execute, and commit**

Run: `npx vitest run src/utils/stateMachine/xbCGenerator.test.ts src/utils/stateMachine/xbDeclaredCConformance.test.ts -t "XB-W6-MPC|literal MPC workspace"`

Expected: PASS for float32 and fixed-point strict-C99 programs.

```bash
git add src/utils/stateMachine/xbCGenerator.ts src/utils/stateMachine/xbCConformanceCases.ts src/utils/stateMachine/xbCGenerator.test.ts
git commit -m "feat: generate bounded MPC controller C"
```

### Task 5: Two-tap LMS adaptive filter

**Files:**
- Modify: `src/utils/stateMachine/xbSemanticBuilder.ts`
- Modify: `src/utils/stateMachine/xbInterpreter.ts`
- Modify: `src/utils/stateMachine/xbCGenerator.ts`
- Modify: `src/utils/stateMachine/xbCConformanceCases.ts`

**Interfaces:**
- Produces slots `w1`, `w2`, `x_prev`; outputs `y`, `err`, `w1`, `w2`; cases `XB-W6-LMS-F32` and `XB-W6-LMS-FIXED`.

- [ ] **Step 1: Add failing hand-calculated trace**

```ts
it('matches the two-tap LMS update order', () => {
  expect(runLmsTrace([
    { x: 1, d: 1, lr: 0.5 },
    { x: 2, d: 0, lr: 0.5 },
  ])).toApproxTrace([
    { y: 0, err: 1, w1: 0.5, w2: 0 },
    { y: 1, err: -1, w1: -0.5, w2: -0.5 },
  ]);
});
```

- [ ] **Step 2: Confirm RED**

Run: `npx vitest run src/utils/stateMachine/xbInterpreter.test.ts -t "two-tap LMS"`

Expected: FAIL.

- [ ] **Step 3: Implement and emit exact LMS semantics**

Calculate `y=w1*x+w2*x_prev`, `err=d-y`, then `next_w1=w1+lr*err*x`, `next_w2=w2+lr*err*x_prev`, and finally `next_x_prev=x`. Validate finite default/runtime learning rates and require `0 <= lr <= 1`. Fixed-point quantizes each multiply, accumulation, error, and state update; fault retains all three previous slots.

- [ ] **Step 4: Execute paired cases and commit**

Run: `npx vitest run src/utils/stateMachine/xbDeclaredCConformance.test.ts -t "XB-W6-LMS"`

Expected: PASS for convergence samples, zero learning rate, runtime override, saturation, reset, and instance independence.

```bash
git add src/utils/stateMachine/xbSemanticBuilder.ts src/utils/stateMachine/xbInterpreter.ts src/utils/stateMachine/xbCGenerator.ts src/utils/stateMachine/xbCConformanceCases.ts src/utils/stateMachine/xbInterpreter.test.ts
git commit -m "feat: add LMS adaptive filter generation"
```

### Task 6: Release and verify Wave 6

**Files:**
- Modify: `src/utils/stateMachine/xbCapabilities.ts`
- Modify: `src/utils/stateMachine/xbCapabilities.test.ts`
- Modify: `docs/XBRIDGES_EMBEDDED_CODEGEN.md`

**Interfaces:**
- Enables exactly `MPC_CONTROLLER` and `LMS_ADAPTIVE_FILTER`.

- [ ] **Step 1: Add release assertions and capability entries**

Declare exact vector/scalar directional shapes, statefulness, target requirements, and both profile case IDs. Remove only these two blocks from their host-only groups.

- [ ] **Step 2: Run resource and conformance release gates**

Run: `npx vitest run src/utils/stateMachine/xbMpcContract.test.ts src/utils/stateMachine/xbProjectedGradient.test.ts src/utils/stateMachine/xbCapabilities.test.ts src/utils/stateMachine/xbSemanticBuilder.test.ts src/utils/stateMachine/xbInterpreter.test.ts src/utils/stateMachine/xbCGenerator.test.ts src/utils/stateMachine/xbDeclaredCConformance.test.ts src/utils/stateMachine/smDifferential.test.ts && npm run build:sm-runtime && npx tsc --noEmit`

Expected: PASS; four Wave 6 cases compile and execute, and oversized/worst-case-work violations fail before generation.

- [ ] **Step 3: Verify the entire six-wave release surface**

Run: `npx vitest run src/utils/stateMachine`

Expected: PASS with every `codegen: true` capability backed by a resolved, executed C case and all exclusions still disabled.

- [ ] **Step 4: Document and commit**

Document MPC algorithm/iteration/step-size contract, resource formula, warm-start/fault behavior, LMS order, and fixed-point quantization points.

```bash
git add src/utils/stateMachine/xbCapabilities.ts src/utils/stateMachine/xbCapabilities.test.ts docs/XBRIDGES_EMBEDDED_CODEGEN.md src/generated/stateMachineRuntimeBundle.ts
git commit -m "feat: release X-Bridges optimization wave"
```

