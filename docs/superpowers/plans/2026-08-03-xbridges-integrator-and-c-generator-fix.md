# X-Bridges Discrete Integrator & C Generator Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Discrete Integrator (`INTEGRATOR_DISCRETE`) block implementation in `xbCGenerator.ts` and `xbInterpreter.ts` to correctly apply sample time ($T_s$) and integration method (Forward Euler, Backward Euler, Trapezoidal), and eliminate strict compiler `-Wparentheses-equality` warnings in generated C code (`smCGenerator.ts`).

**Architecture:** 
1. `xbCGenerator.ts`: Update `INTEGRATOR_DISCRETE` state update generation to compute $T_s \cdot u$ for Backward Euler, $T_s \cdot u_{\text{prev}}$ for Forward Euler, and $\frac{T_s}{2}(u + u_{\text{prev}})$ for Trapezoidal/Tustin.
2. `xbInterpreter.ts`: Align the JS simulation engine so MIL (Model-in-the-Loop) and SIL (Software-in-the-Loop) match tick-by-tick.
3. `smCGenerator.ts`: Fix transition route condition formatting to avoid redundant extra parentheses triggering `-Wparentheses-equality` under strict C compilers.

**Tech Stack:** TypeScript, Node.js, Vitest, C99 GCC/Clang tooling.

## Global Constraints

- **Language Floor:** C99 compliant code generation.
- **Testing:** All existing unit tests and new regression tests must pass via `npx vitest`.
- **Zero Loss of Parity:** SIL (C code execution) and MIL (JS interpreter execution) MUST yield identical numerical outputs for all sample times and input steps.

---

### Task 1: Fix Discrete Integrator State Update Generation in `xbCGenerator.ts`

**Files:**
- Modify: `src/utils/stateMachine/xbCGenerator.ts:1952-1961`
- Test: `src/utils/stateMachine/xbCGenerator.test.ts`

**Interfaces:**
- Consumes: `operation.parameters.sample_time`, `operation.parameters.sampleTime`, `operation.parameters.dt`, `operation.parameters.method`
- Produces: Correct C expressions for `INTEGRATOR_DISCRETE` state updates in `renderStateSlotAssignment`

- [ ] **Step 1: Write failing unit test for Discrete Integrator Forward Euler with sample time in `xbCGenerator.test.ts`**

```typescript
it('generates correct Forward Euler state update with sample time (Ts=0.1)', () => {
  const ir = semanticModel();
  const integrator = statefulOperation(
    'integrator', 'INTEGRATOR_DISCRETE', ['integrator:u'], ['integrator:y'], 4,
    { sample_time: 0.1, method: 'forward_euler' }
  );
  ir.states.controller.xBridges = {
    stateId: 'controller',
    executionOrder: ['integrator'],
    operations: { integrator },
    signals: {
      'integrator:u': scalarInputSignal('integrator:u', 'source:y'),
      'integrator:y': signal('integrator:y', float32),
    },
    mappings: [],
    solver: { kind: 'euler', stepSeconds: 0.01, substepsPerTick: 1 },
    policy: { memory: 'retain', numericFault: 'signal-only' },
  };
  const code = renderXBridgesC(ir);
  expect(code).toContain('0.1');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/stateMachine/xbCGenerator.test.ts -t "Forward Euler"`
Expected: FAIL (0.1 not present in emitted C code)

- [ ] **Step 3: Update `xbCGenerator.ts` for `INTEGRATOR_DISCRETE`**

Modify `src/utils/stateMachine/xbCGenerator.ts`:
Extract `sample_time` / `sampleTime` / `dt` parameter (default `1.0`), and format integration method expressions (`forward_euler`, `backward_euler`, `trapezoidal`):

```typescript
      case 'INTEGRATOR_DISCRETE': {
        const dtVal = scalarParameter(operation, ['sample_time', 'sampleTime', 'dt'], 1.0);
        const dt = cNumber(dtVal);
        const method = String(operation.parameters.method ?? 'forward_euler');
        const stateExpr = stateSlotRealExpression(slot, layout, member);
        let updateExpr: string;
        if (method === 'backward_euler') {
          updateExpr = `${stateExpr} + (${dt}) * (${input})`;
        } else if (method === 'trapezoidal' || method === 'tustin') {
          const uPrevSlot = operation.state?.slots.find(s => s.role === 'u_prev') ?? slot;
          const uPrev = stateSlotRealExpression(uPrevSlot, layout, member);
          updateExpr = `${stateExpr} + (0.5 * (${dt})) * ((${input}) + (${uPrev}))`;
        } else {
          // Default: forward_euler
          const uPrevSlot = operation.state?.slots.find(s => s.role === 'u_prev') ?? slot;
          const uPrev = stateSlotRealExpression(uPrevSlot, layout, member);
          updateExpr = `${stateExpr} + (${dt}) * (${uPrev})`;
        }
        return renderStateSlotAssignment(
          state,
          slot,
          updateExpr,
          layout,
          member,
          `${operation.id}_${slotIndex}_update`,
          layout.errorFields.get(operation.id), operation,
        );
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/stateMachine/xbCGenerator.test.ts -t "Forward Euler"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/xbCGenerator.ts src/utils/stateMachine/xbCGenerator.test.ts
git commit -m "fix(xbridges): apply sample time and method to discrete integrator C code generation"
```

---

### Task 2: Align JS Simulator in `xbInterpreter.ts` with $T_s$ and Methods

**Files:**
- Modify: `src/utils/stateMachine/xbInterpreter.ts:920-927`
- Test: `src/utils/stateMachine/xbInterpreter.test.ts`

**Interfaces:**
- Consumes: `operation.parameters.sample_time`, `operation.parameters.sampleTime`, `operation.parameters.dt`, `operation.parameters.method`
- Produces: Correct state updates during JS simulation step for `INTEGRATOR_DISCRETE`

- [ ] **Step 1: Write failing unit test for `xbInterpreter` discrete integrator in `xbInterpreter.test.ts`**

```typescript
it('computes discrete integrator state with sample_time=0.1 under Forward Euler', () => {
  // Test that step 1 with u=2.0 and Ts=0.1 returns 0.0 (using u_prev=0) and updates u_prev to 2.0
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/stateMachine/xbInterpreter.test.ts -t "discrete integrator"`
Expected: FAIL

- [ ] **Step 3: Update `xbInterpreter.ts` for `INTEGRATOR_DISCRETE`**

Modify `src/utils/stateMachine/xbInterpreter.ts` around line 920:

```typescript
      case 'INTEGRATOR_DISCRETE': {
        const dt = Number(parameter(operation, ['sample_time', 'sampleTime', 'dt'], 1));
        const method = String(operation.parameters.method ?? 'forward_euler');
        const uPrevSlot = operation.state?.slots.find(s => s.role === 'u_prev');
        const uPrevValues = uPrevSlot ? (runtime.stateSlots[uPrevSlot.id] ?? uPrevSlot.initialValues) : values;
        
        if (slot.role === 'u_prev') {
          updates[slot.id] = values.map((val) => convertValue(val, slot.numericType, faults, operation));
        } else {
          updates[slot.id] = previous.map((val, idx) => {
            const uCurr = Number(values[idx] ?? 0);
            const uPrev = Number(uPrevValues[idx] ?? 0);
            let delta = 0;
            if (method === 'backward_euler') {
              delta = dt * uCurr;
            } else if (method === 'trapezoidal' || method === 'tustin') {
              delta = 0.5 * dt * (uCurr + uPrev);
            } else {
              delta = dt * uPrev;
            }
            return convertValue(Number(val) + delta, slot.numericType, faults, operation);
          });
        }
        break;
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/stateMachine/xbInterpreter.test.ts -t "discrete integrator"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/xbInterpreter.ts src/utils/stateMachine/xbInterpreter.test.ts
git commit -m "fix(xbridges): align JS interpreter discrete integrator with sample time and method"
```

---

### Task 3: Eliminate Redundant Parentheses in `smCGenerator.ts`

**Files:**
- Modify: `src/utils/stateMachine/smCGenerator.ts:186-193` & `693-698`
- Test: `src/utils/stateMachine/smCGenerator.test.ts`

- [ ] **Step 1: Write test checking clean condition generation in `smCGenerator.test.ts`**

```typescript
it('generates clean single-level parentheses for transition condition checks', () => {
  // Ensure if (z == 1) is rendered instead of if (((z == 1)))
});
```

- [ ] **Step 2: Run test to verify current output format**

Run: `npx vitest run src/utils/stateMachine/smCGenerator.test.ts -t "condition"`

- [ ] **Step 3: Update `smCGenerator.ts` condition formatting**

Refactor `renderRouteEnabled` in `src/utils/stateMachine/smCGenerator.ts`:

```typescript
const renderRouteEnabled = (
  ir: SemanticModel,
  route: SemanticTransitionRoute,
  timerStateId: string,
): string => {
  const conds = route.transitionIds.map((transitionId) =>
    renderTransitionEnabled(ir, ir.transitions[transitionId], timerStateId));
  if (conds.length === 1) return conds[0];
  return conds.map((c) => `(${c})`).join(' && ');
};
```

- [ ] **Step 4: Run full C generator test suite**

Run: `npx vitest run src/utils/stateMachine/smCGenerator.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/smCGenerator.ts src/utils/stateMachine/smCGenerator.test.ts
git commit -m "fix(generator): sanitize transition condition parenthesization to prevent compiler warnings"
```

---

### Task 4: Regression Test & Verification with Audit Model

**Files:**
- Test: `src/utils/stateMachine/smXBridgesAppIntegration.test.ts`

- [ ] **Step 1: Add regression test importing `statemachine-history-xbridges-timing-fixed.json` model**

```typescript
it('verifies Discrete Integrator in audit model progresses step-by-step with Ts=0.1', () => {
  // Load JSON from C:/Users/EL-Dawlia/Downloads/xv/statemachine-history-xbridges-timing-fixed.json
  // Execute tick 1: expect integrator output = 0.0
  // Execute tick 2: expect integrator output = 0.2
});
```

- [ ] **Step 2: Run verification test**

Run: `npx vitest run src/utils/stateMachine/smXBridgesAppIntegration.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/utils/stateMachine/smXBridgesAppIntegration.test.ts
git commit -m "test(xbridges): add regression test for audit model discrete integrator timing"
```
