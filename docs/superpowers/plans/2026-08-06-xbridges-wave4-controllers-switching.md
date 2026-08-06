# X-Bridges Wave 4 Controllers and Switching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Release strict-C99 float32 and fixed-point generation for `PID_CONTROLLER` and `SIX_STEP_COMMUTATION` with complete deterministic paired coverage.

**Architecture:** Preserve the advanced PID block's explicit proportional, integral, filtered-derivative, enable, reset, clamp, and anti-windup state contract. Implement six-step commutation as a total Boolean lookup with a defined safe output for invalid Hall codes.

**Tech Stack:** TypeScript, Vitest, X-Bridges semantic IR, generated strict C99, GCC.

## Global Constraints

- Wave 1 bounded profile and executable conformance gate are prerequisites.
- Generated code has static storage and bounded control flow; no heap, recursion, VLA, or mutable globals.
- Both float32 and fixed-point cases must execute before capability release.
- Every parameter is validated at semantic-build time and every numeric failure follows the model fault policy.
- All `ROBOT_VACUUM_*`, `Note`, `ROOT_LOCUS`, and `Scope` remain excluded.

## File Map

- Create `src/utils/stateMachine/xbPidContract.ts` and tests for normalized PID parameters and update ordering.
- Modify builder/interpreter/C generator and executable conformance cases.
- Modify capability registry and documentation only at release.

---

### Task 1: Normalize the advanced PID contract

**Files:**
- Create: `src/utils/stateMachine/xbPidContract.ts`
- Create: `src/utils/stateMachine/xbPidContract.test.ts`
- Modify: `src/utils/stateMachine/xbSemanticModel.ts`

**Interfaces:**
- Produces `normalizePidParameters(parameters, solver): XBPidParameters`.
- `XBPidParameters` contains `mode`, `kp`, `ki`, `kd`, `filterN`, `beta`, `gamma`, `minimum`, `maximum`, `method`, and `sampleTime` with no optional fields.

- [ ] **Step 1: Write failing normalization tests**

```ts
it('normalizes defaults without truthy-value loss', () => {
  expect(normalizePidParameters({ Kp: 0, Ki: 0, Kd: 0, min: -1, max: 1 }, solver).kp).toBe(0);
});

it.each([
  { min: 2, max: 1 }, { sampleTime: 0 }, { N: -1 }, { method: 'unknown' },
])('rejects invalid PID parameters %#', parameters => {
  expect(() => normalizePidParameters(parameters, solver)).toThrow();
});
```

- [ ] **Step 2: Confirm RED**

Run: `npx vitest run src/utils/stateMachine/xbPidContract.test.ts`

Expected: FAIL because the normalized contract does not exist.

- [ ] **Step 3: Implement the normalized contract**

Accept only documented modes and `ForwardEuler`, `BackwardEuler`, or `Trapezoidal` methods. Require finite coefficients, `sampleTime > 0`, `N >= 0`, and `min <= max`. Preserve explicit zero values with nullish-default logic. Store the normalized parameters directly on the semantic operation so interpreter and C do not reparse UI parameters.

- [ ] **Step 4: Run tests and commit**

Run: `npx vitest run src/utils/stateMachine/xbPidContract.test.ts`

Expected: PASS.

```bash
git add src/utils/stateMachine/xbPidContract.ts src/utils/stateMachine/xbPidContract.test.ts src/utils/stateMachine/xbSemanticModel.ts
git commit -m "feat: normalize embedded PID contract"
```

### Task 2: Canonical PID state transition

**Files:**
- Modify: `src/utils/stateMachine/xbSemanticBuilder.ts`
- Modify: `src/utils/stateMachine/xbInterpreter.ts`
- Test: `src/utils/stateMachine/xbSemanticBuilder.test.ts`
- Test: `src/utils/stateMachine/xbInterpreter.test.ts`

**Interfaces:**
- Produces slots `i_state`, `d_state`, `last_e`, and `last_ed` and outputs `u`, `error`, `p_term`, `i_term`, `d_term`.
- Consumes `XBPidParameters`.

- [ ] **Step 1: Write failing sequence tests**

```ts
it('applies reset, disable, derivative filtering, clamp, and anti-windup in the documented order', () => {
  expect(runPidTrace(pid, pidInputs)).toApproxTrace([
    { u: 0, i: 0 }, { u: 1, i: 0 }, { u: 0.5, i: 0.1 }, { u: 0, i: 0 },
  ]);
});
```

- [ ] **Step 2: Confirm RED**

Run: `npx vitest run src/utils/stateMachine/xbInterpreter.test.ts -t "anti-windup"`

Expected: FAIL because the advanced block is not in the canonical semantic path.

- [ ] **Step 3: Implement one update function**

Compute `error = r-y`, `ep = beta*r-y`, and `ed = gamma*r-y`. Reset clears all slots and output. Disable holds state and emits zero control with current error. Otherwise calculate P, candidate I, filtered D, unclamped control, clamp to `[min,max]`, and apply conditional-integration anti-windup: reject the candidate I update only when it would drive an already saturated output farther into saturation. Quantize every term and state boundary in fixed-point.

- [ ] **Step 4: Run canonical tests and commit**

Run: `npx vitest run src/utils/stateMachine/xbPidContract.test.ts src/utils/stateMachine/xbSemanticBuilder.test.ts src/utils/stateMachine/xbInterpreter.test.ts -t "PID_CONTROLLER|anti-windup"`

Expected: PASS.

```bash
git add src/utils/stateMachine/xbSemanticBuilder.ts src/utils/stateMachine/xbInterpreter.ts src/utils/stateMachine/xbSemanticBuilder.test.ts src/utils/stateMachine/xbInterpreter.test.ts
git commit -m "feat: add canonical advanced PID semantics"
```

### Task 3: PID C emitter and executable profiles

**Files:**
- Modify: `src/utils/stateMachine/xbCGenerator.ts`
- Modify: `src/utils/stateMachine/xbCConformanceCases.ts`
- Test: `src/utils/stateMachine/xbCGenerator.test.ts`

**Interfaces:**
- Produces table emitter `PID_CONTROLLER` and executable cases `XB-W4-PID-F32` and `XB-W4-PID-FIXED`.

- [ ] **Step 1: Write a failing generated-code structure test**

```ts
it('emits PID state inside the ADIA instance and no mutable global', () => {
  const artifacts = generatePidArtifacts();
  expect(artifacts.header).toContain('state_i_state');
  expect(artifacts.source).not.toMatch(/^static\s+(?!const)/m);
});
```

- [ ] **Step 2: Confirm RED**

Run: `npx vitest run src/utils/stateMachine/xbCGenerator.test.ts -t "PID state inside"`

Expected: FAIL.

- [ ] **Step 3: Emit the same ordered transition**

Generate explicit scalar temporaries for P/I/D and next state, using `float`/`*f` math for float32 and existing checked fixed operations for fixed-point. Do not call host PID helpers. Register cases covering all methods, reset/enable, derivative kick weighting, upper/lower saturation, anti-windup, overflow, and repeated instance independence.

- [ ] **Step 4: Compile and execute both profiles**

Run: `npx vitest run src/utils/stateMachine/xbCGenerator.test.ts src/utils/stateMachine/xbDeclaredCConformance.test.ts -t "XB-W4-PID|PID state inside"`

Expected: PASS with strict C99 compilation.

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/xbCGenerator.ts src/utils/stateMachine/xbCConformanceCases.ts src/utils/stateMachine/xbCGenerator.test.ts
git commit -m "feat: generate advanced PID controller C"
```

### Task 4: Six-step commutation

**Files:**
- Modify: `src/utils/stateMachine/xbSemanticBuilder.ts`
- Modify: `src/utils/stateMachine/xbInterpreter.ts`
- Modify: `src/utils/stateMachine/xbCGenerator.ts`
- Modify: `src/utils/stateMachine/xbCConformanceCases.ts`

**Interfaces:**
- Produces Boolean-input/scalar-output direct operation and case `XB-W4-SIX-STEP`.

- [ ] **Step 1: Write the failing truth-table test**

```ts
it('implements all eight Hall codes', () => {
  expect(allHallOutputs()).toEqual([
    [0,0,0], [1,0,-1], [-1,1,0], [0,1,-1],
    [0,-1,1], [1,-1,0], [-1,0,1], [0,0,0],
  ]);
});
```

- [ ] **Step 2: Confirm RED**

Run: `npx vitest run src/utils/stateMachine/xbInterpreter.test.ts -t "all eight Hall"`

Expected: FAIL.

- [ ] **Step 3: Implement total lookup semantics**

Coerce `h1/h2/h3` through the Boolean input contract, calculate `(h1<<2)|(h2<<1)|h3`, and use the exact eight-row table above. Codes `000` and `111` are safe all-off outputs, not faults. Emit a C `switch` with a `default` all-off assignment.

- [ ] **Step 4: Execute and commit**

Run: `npx vitest run src/utils/stateMachine/xbDeclaredCConformance.test.ts -t "XB-W4-SIX-STEP"`

Expected: PASS for all eight inputs under both surrounding numeric profiles.

```bash
git add src/utils/stateMachine/xbSemanticBuilder.ts src/utils/stateMachine/xbInterpreter.ts src/utils/stateMachine/xbCGenerator.ts src/utils/stateMachine/xbCConformanceCases.ts src/utils/stateMachine/xbInterpreter.test.ts
git commit -m "feat: add six-step commutation generation"
```

### Task 5: Release Wave 4

**Files:**
- Modify: `src/utils/stateMachine/xbCapabilities.ts`
- Modify: `src/utils/stateMachine/xbCapabilities.test.ts`
- Modify: `docs/XBRIDGES_EMBEDDED_CODEGEN.md`

**Interfaces:**
- Enables only `PID_CONTROLLER` and `SIX_STEP_COMMUTATION`.

- [ ] **Step 1: Add capability assertions and enable both entries**

Point `PID_CONTROLLER` to both numeric-profile cases and `SIX_STEP_COMMUTATION` to its exhaustive truth-table case. Mark PID stateful/non-direct and commutation direct.

- [ ] **Step 2: Run release verification**

Run: `npx vitest run src/utils/stateMachine/xbPidContract.test.ts src/utils/stateMachine/xbCapabilities.test.ts src/utils/stateMachine/xbSemanticBuilder.test.ts src/utils/stateMachine/xbInterpreter.test.ts src/utils/stateMachine/xbCGenerator.test.ts src/utils/stateMachine/xbDeclaredCConformance.test.ts src/utils/stateMachine/smDifferential.test.ts && npm run build:sm-runtime && npx tsc --noEmit`

Expected: PASS with three Wave 4 executable cases and no skipped compiler runs.

- [ ] **Step 3: Document and commit**

```bash
git add src/utils/stateMachine/xbCapabilities.ts src/utils/stateMachine/xbCapabilities.test.ts docs/XBRIDGES_EMBEDDED_CODEGEN.md src/generated/stateMachineRuntimeBundle.ts
git commit -m "feat: release X-Bridges controllers wave"
```

