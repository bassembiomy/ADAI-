# Batch 1 Discontinuities Blocks + Boolean Codegen Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `SATURATION`, `DEADZONE`, `RATE_LIMITER`, and `RELAY` to the X‑Bridges runtime and strict C99 generator, and clean the AND/OR/NOT Boolean code‑generation path so it stays `bool` from input to output.

**Architecture:** The four new blocks follow the existing pattern: runtime block factory in `BlockDefinitions.ts`, capability manifest in `xbCapabilities.ts`, canonical interpreter in `xbInterpreter.ts`, semantic state slots in `xbSemanticBuilder.ts`, and C99 emitters/state updates in `xbCGenerator.ts`. The Boolean cleanup is a targeted change inside `xbCGenerator.ts` to add type‑aware Boolean input/output helpers without altering the numeric/fixed paths.

**Tech Stack:** TypeScript (Vitest), C99 (`gcc -std=c99 -pedantic-errors -Wall -Wextra -Werror`).

## Global Constraints

- All four new blocks are **scalar-only**.
- Blocks using `fmax`/`fmin`/`fabs` declare `requiredTargetCapabilities: ['math-library']`.
- Generated C must compile with `-std=c99 -pedantic-errors -Wall -Wextra -Werror`.
- `RELAY` output is Boolean; `SATURATION`, `DEADZONE`, and `RATE_LIMITER` output `float64`.
- The Boolean cleanup must not change behavior for numeric or fixed-point output signals.
- No `TBD`, `TODO`, or placeholder steps are allowed.

---

## Task 1: Register Capabilities and Conformance Groups

**Files:**
- Modify: `src/utils/stateMachine/xbCapabilities.ts`
- Modify: `src/utils/stateMachine/xbCapabilities.test.ts`

**Interfaces:**
- Consumes: none.
- Produces: `getXBBlockCapability('SATURATION')`, `getXBBlockCapability('DEADZONE')`, `getXBBlockCapability('RATE_LIMITER')`, `getXBBlockCapability('RELAY')` return `codegen: true` with the new conformance IDs.

- [ ] **Step 1: Write the failing test**

Add to `src/utils/stateMachine/xbCapabilities.test.ts` inside the existing `describe('getXBBlockCapability', ...)` block:

```typescript
it('declares executable conformance coverage for Batch 1 discontinuities blocks', () => {
  for (const type of ['SATURATION', 'DEADZONE', 'RATE_LIMITER', 'RELAY']) {
    const cap = getXBBlockCapability(type);
    expect(cap?.codegen).toBe(true);
    expect(cap?.interpreterConformanceCaseIds).toContain('T10-INT-DISCONTINUOUS');
    expect(cap?.cConformanceCaseIds).toContain('T10-C99-DISCONTINUOUS');
  }
  expect(getXBBlockCapability('SATURATION')?.requiredTargetCapabilities).toContain('math-library');
  expect(getXBBlockCapability('DEADZONE')?.requiredTargetCapabilities).toContain('math-library');
  expect(getXBBlockCapability('RATE_LIMITER')?.requiredTargetCapabilities).toContain('math-library');
});
```

- [ ] **Step 2: Run the failing test**

Run: `npx vitest run src/utils/stateMachine/xbCapabilities.test.ts`

Expected: FAIL with `Expected: true, Received: false` (or `getXBBlockCapability('SATURATION')` returns null) because the blocks are not yet registered.

- [ ] **Step 3: Implement the capability registry changes**

In `src/utils/stateMachine/xbCapabilities.ts`:

1. Add a new coverage group near the existing groups:

```typescript
const DISCONTINUOUS_COVERAGE: readonly XBConformanceCoverage[] = [
  scalarCoverage('SATURATION'),
  scalarCoverage('DEADZONE'),
  scalarCoverage('RATE_LIMITER'),
  scalarCoverage('RELAY'),
];
```

2. Add the new case IDs to the master lists:

```typescript
export const XB_INTERPRETER_CONFORMANCE_CASE_IDS = [
  ...,
  'T10-INT-DISCONTINUOUS', 'T14-INT-DISCONTINUOUS',
] as const;

export const XB_C_CONFORMANCE_CASE_IDS = [
  ...,
  'T10-C99-DISCONTINUOUS', 'T14-C99-DISCONTINUOUS',
] as const;
```

3. Register the cases in the case manifest objects:

```typescript
export const XB_INTERPRETER_CONFORMANCE_CASES: Readonly<Record<string, readonly XBConformanceCoverage[]>> = Object.freeze({
  ...,
  'T10-INT-DISCONTINUOUS': DISCONTINUOUS_COVERAGE,
  'T14-INT-DISCONTINUOUS': DISCONTINUOUS_COVERAGE,
});

export const XB_C_CONFORMANCE_CASES: Readonly<Record<string, readonly XBConformanceCoverage[]>> = Object.freeze({
  ...,
  'T10-C99-DISCONTINUOUS': DISCONTINUOUS_COVERAGE,
  'T14-C99-DISCONTINUOUS': DISCONTINUOUS_COVERAGE,
});
```

4. Add the capability entries inside `XB_CAPABILITIES`:

```typescript
SATURATION:   direct(scalar, ['math-library'], ['T10-INT-DISCONTINUOUS'], ['T10-C99-DISCONTINUOUS']),
DEADZONE:     direct(scalar, ['math-library'], ['T10-INT-DISCONTINUOUS'], ['T10-C99-DISCONTINUOUS']),
RATE_LIMITER: stateful(scalar, ['math-library'], ['T10-INT-DISCONTINUOUS'], ['T10-C99-DISCONTINUOUS']),
RELAY:        stateful(scalar, undefined, ['T10-INT-DISCONTINUOUS'], ['T10-C99-DISCONTINUOUS']),
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/utils/stateMachine/xbCapabilities.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit (optional — confirm with user)**

```bash
git add src/utils/stateMachine/xbCapabilities.ts src/utils/stateMachine/xbCapabilities.test.ts
# git commit -m "feat(xb): register Batch 1 discontinuities blocks and conformance coverage"
```

---

## Task 2: Add Runtime Block Definitions

**Files:**
- Modify: `src/engine/xbridges/BlockDefinitions.ts`

**Interfaces:**
- Consumes: `getXBBlockCapability` now recognizes the new types.
- Produces: `BLOCK_LIBRARY.SATURATION(...)`, `BLOCK_LIBRARY.DEADZONE(...)`, `BLOCK_LIBRARY.RATE_LIMITER(...)`, `BLOCK_LIBRARY.RELAY(...)` return valid `XBlock` objects.

- [ ] **Step 1: Write the failing test**

Add to `src/utils/stateMachine/xbCapabilities.test.ts` (the existing test that iterates `Object.keys(BLOCK_LIBRARY)` already fails if a block has no capability; here we verify the runtime factories are present and sane). A minimal test in `src/utils/stateMachine/xbInterpreter.test.ts` is sufficient:

```typescript
it('instantiates Batch 1 discontinuities blocks with defaults', () => {
  const sat = BLOCK_LIBRARY.SATURATION('sat', {});
  expect(sat.params).toMatchObject({ upper: 1, lower: -1 });
  const dz = BLOCK_LIBRARY.DEADZONE('dz', {});
  expect(dz.params).toMatchObject({ start: 0.5, end: -0.5 });
  const rl = BLOCK_LIBRARY.RATE_LIMITER('rl', {});
  expect(rl.isStateful).toBe(true);
  expect(rl.params).toMatchObject({ risingLimit: 1, fallingLimit: 1, sampleTime: 1 });
  const relay = BLOCK_LIBRARY.RELAY('relay', {});
  expect(relay.isStateful).toBe(true);
  expect(relay.params).toMatchObject({ switchOn: 1, switchOff: 0, initialState: false });
});
```

- [ ] **Step 2: Run the failing test**

Run: `npx vitest run src/utils/stateMachine/xbInterpreter.test.ts -t "instantiates Batch 1"`

Expected: FAIL because `BLOCK_LIBRARY` does not yet contain the new factories.

- [ ] **Step 3: Implement the runtime definitions**

In `src/engine/xbridges/BlockDefinitions.ts` add the four factories inside the `BLOCK_LIBRARY` object (next to existing discontinuities or near the end of the scalar list):

```typescript
'SATURATION': (id, params) => ({
  id, type: 'SATURATION',
  params: { upper: params.upper ?? 1, lower: params.lower ?? -1 },
  inputs: [createPort('u', 'u', 'input')],
  outputs: [createPort('y', 'y', 'output')],
  execute: (ins, p) => ({
    outputs: [Math.max(p.lower, Math.min(p.upper, Number(ins[0])))]
  })
}),

'DEADZONE': (id, params) => ({
  id, type: 'DEADZONE',
  params: { start: params.start ?? 0.5, end: params.end ?? -0.5 },
  inputs: [createPort('u', 'u', 'input')],
  outputs: [createPort('y', 'y', 'output')],
  execute: (ins, p) => {
    const u = Number(ins[0]);
    const y = u > p.start ? (u - p.start) : (u < p.end ? (u - p.end) : 0);
    return { outputs: [y] };
  }
}),

'RATE_LIMITER': (id, params) => ({
  id, type: 'RATE_LIMITER',
  isStateful: true,
  params: {
    risingLimit: params.risingLimit ?? 1,
    fallingLimit: params.fallingLimit ?? 1,
    sampleTime: params.sampleTime ?? params.dt ?? 1,
  },
  inputs: [createPort('u', 'u', 'input')],
  outputs: [createPort('y', 'y', 'output')],
  state: { prev_y: 0 },
  execute: (ins, p, state) => {
    const dt = Number(p.sampleTime);
    const u = Number(ins[0]);
    const y = Math.max(state.prev_y - p.fallingLimit * dt,
                       Math.min(state.prev_y + p.risingLimit * dt, u));
    return { outputs: [y], nextState: { prev_y: y } };
  }
}),

'RELAY': (id, params) => ({
  id, type: 'RELAY',
  isStateful: true,
  params: {
    switchOn: params.switchOn ?? 1,
    switchOff: params.switchOff ?? 0,
    initialState: params.initialState ?? false,
  },
  inputs: [createPort('u', 'u', 'input')],
  outputs: [createPort('y', 'y', 'output')],
  state: { current_on: Boolean(params.initialState) },
  execute: (ins, p, state) => {
    const u = Number(ins[0]);
    const current_on = u >= p.switchOn || (state.current_on && u > p.switchOff);
    return { outputs: [current_on], nextState: { current_on } };
  }
}),
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/utils/stateMachine/xbInterpreter.test.ts -t "instantiates Batch 1"`

Expected: PASS.

- [ ] **Step 5: Commit (optional — confirm with user)**

```bash
git add src/engine/xbridges/BlockDefinitions.ts src/utils/stateMachine/xbInterpreter.test.ts
# git commit -m "feat(xb): add Batch 1 discontinuities block runtime definitions"
```

---

## Task 3: Add Canonical Interpreter Evaluation

**Files:**
- Modify: `src/utils/stateMachine/xbInterpreter.ts`
- Modify: `src/utils/stateMachine/xbInterpreter.test.ts`

**Interfaces:**
- Consumes: `BLOCK_LIBRARY` factories from Task 2.
- Produces: `evaluateDirectOperation` and `statefulUpdate` handle the four new types.

- [ ] **Step 1: Write the failing tests**

Add to `src/utils/stateMachine/xbInterpreter.test.ts` inside the main `describe` block:

```typescript
it('T10-INT-DISCONTINUOUS evaluates Saturation and DeadZone', () => {
  const sat = operation('sat', 'SATURATION', ['sat:u'], ['sat:y'], { upper: 5, lower: -5 });
  const dz = operation('dz', 'DEADZONE', ['dz:u'], ['dz:y'], { start: 0.5, end: -0.5 });
  const ir = model('reset', { sat, dz }, {
    'sat:u': signal('sat:u', 'input', null, { kind: 'float64' }),
    'sat:y': signal('sat:y', 'output', null, { kind: 'float64' }),
    'dz:u': signal('dz:u', 'input', null, { kind: 'float64' }),
    'dz:y': signal('dz:y', 'output', null, { kind: 'float64' }),
  }, ['sat', 'dz']);
  const runtime = createXBRuntime(ir);
  runtime.signals['sat:u'] = [10];
  runtime.signals['dz:u'] = [0.25];
  stepXBState(runtime, {});
  expect(runtime.signals['sat:y']).toEqual([5]);
  expect(runtime.signals['dz:y']).toEqual([0]);
  runtime.signals['sat:u'] = [-10];
  runtime.signals['dz:u'] = [2];
  stepXBState(runtime, {});
  expect(runtime.signals['sat:y']).toEqual([-5]);
  expect(runtime.signals['dz:y']).toEqual([1.5]);
  runtime.signals['sat:u'] = [2];
  runtime.signals['dz:u'] = [-2];
  stepXBState(runtime, {});
  expect(runtime.signals['sat:y']).toEqual([2]);
  expect(runtime.signals['dz:y']).toEqual([-1.5]);
});

it('T10-INT-DISCONTINUOUS evaluates RateLimiter with state', () => {
  const rl: XBSemanticOperation = {
    ...operation('rl', 'RATE_LIMITER', ['rl:u'], ['rl:y'], { risingLimit: 1, fallingLimit: 1, sampleTime: 0.1 }),
    directFeedthrough: false,
    stateful: true,
    state: {
      outputPhase: 'read-before-update',
      updatePhase: 'after-direct-feedthrough',
      slots: [{ id: 'rl:prev_y$state', role: 'prev_y', signalId: null, numericType: { kind: 'float64' }, shape: { kind: 'scalar' }, initialValues: [0] }],
    },
    schedule: { periodSubsteps: 1, offsetSubsteps: 0, initialCounter: 0, counterIncrement: 1, hold: 'none' },
  };
  const ir = model('reset', { rl }, {
    'rl:u': signal('rl:u', 'input', null, { kind: 'float64' }),
    'rl:y': signal('rl:y', 'output', null, { kind: 'float64' }),
  }, ['rl']);
  const runtime = createXBRuntime(ir);
  runtime.signals['rl:u'] = [100];
  stepXBState(runtime, {});
  expect(runtime.signals['rl:y'][0]).toBeCloseTo(0.1, 10);
  runtime.signals['rl:u'] = [100];
  stepXBState(runtime, {});
  expect(runtime.signals['rl:y'][0]).toBeCloseTo(0.2, 10);
  runtime.signals['rl:u'] = [0];
  stepXBState(runtime, {});
  expect(runtime.signals['rl:y'][0]).toBeCloseTo(0.1, 10);
});

it('T10-INT-DISCONTINUOUS evaluates Relay hysteresis', () => {
  const relay: XBSemanticOperation = {
    ...operation('relay', 'RELAY', ['relay:u'], ['relay:y'], { switchOn: 2, switchOff: 0.5, initialState: false }),
    directFeedthrough: false,
    stateful: true,
    state: {
      outputPhase: 'read-before-update',
      updatePhase: 'after-direct-feedthrough',
      slots: [{ id: 'relay:current_on$state', role: 'current_on', signalId: 'relay:y', numericType: { kind: 'boolean' }, shape: { kind: 'scalar' }, initialValues: [false] }],
    },
    schedule: { periodSubsteps: 1, offsetSubsteps: 0, initialCounter: 0, counterIncrement: 1, hold: 'none' },
  };
  const ir = model('reset', { relay }, {
    'relay:u': signal('relay:u', 'input', null, { kind: 'float64' }),
    'relay:y': signal('relay:y', 'output', null, { kind: 'boolean' }),
  }, ['relay']);
  const runtime = createXBRuntime(ir);
  runtime.signals['relay:u'] = [1];
  stepXBState(runtime, {});
  expect(runtime.signals['relay:y']).toEqual([false]);
  runtime.signals['relay:u'] = [3];
  stepXBState(runtime, {});
  expect(runtime.signals['relay:y']).toEqual([true]);
  runtime.signals['relay:u'] = [0.75];
  stepXBState(runtime, {});
  expect(runtime.signals['relay:y']).toEqual([true]);
  runtime.signals['relay:u'] = [0.25];
  stepXBState(runtime, {});
  expect(runtime.signals['relay:y']).toEqual([false]);
});
```

- [ ] **Step 2: Run the failing tests**

Run: `npx vitest run src/utils/stateMachine/xbInterpreter.test.ts -t "T10-INT-DISCONTINUOUS"`

Expected: FAIL because the interpreter does not yet know how to evaluate the new types.

- [ ] **Step 3: Implement the interpreter cases**

In `src/utils/stateMachine/xbInterpreter.ts`:

1. In the direct evaluation switch (the same area that handles `GAIN`, `Sum`, etc.), add:

```typescript
case 'SATURATION': {
  const u = Number(inputs[0]?.[0] ?? 0);
  const upper = Number(parameter(operation, ['upper'], 1));
  const lower = Number(parameter(operation, ['lower'], -1));
  return [[Math.max(lower, Math.min(upper, u))]];
}
case 'DEADZONE': {
  const u = Number(inputs[0]?.[0] ?? 0);
  const start = Number(parameter(operation, ['start'], 0.5));
  const end = Number(parameter(operation, ['end'], -0.5));
  const y = u > start ? (u - start) : (u < end ? (u - end) : 0);
  return [[y]];
}
```

2. In the `statefulUpdate` switch (the area that handles `UNIT_DELAY`, `MEMORY`, etc.), add:

```typescript
case 'RATE_LIMITER': {
  const u = Number(inputs[0]?.[0] ?? 0);
  const rising = Number(parameter(operation, ['risingLimit'], 1));
  const falling = Number(parameter(operation, ['fallingLimit'], 1));
  const dt = Number(parameter(operation, ['sampleTime', 'dt'], 1));
  const prev_y = Number(state.prev_y ?? 0);
  const y = Math.max(prev_y - falling * dt, Math.min(prev_y + rising * dt, u));
  return { outputs: [[y]], nextState: { prev_y: y } };
}
case 'RELAY': {
  const u = Number(inputs[0]?.[0] ?? 0);
  const on = Number(parameter(operation, ['switchOn'], 1));
  const off = Number(parameter(operation, ['switchOff'], 0));
  const current_on = u >= on || (Boolean(state.current_on) && u > off);
  return { outputs: [[current_on]], nextState: { current_on } };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/utils/stateMachine/xbInterpreter.test.ts -t "T10-INT-DISCONTINUOUS"`

Expected: PASS.

- [ ] **Step 5: Commit (optional — confirm with user)**

```bash
git add src/utils/stateMachine/xbInterpreter.ts src/utils/stateMachine/xbInterpreter.test.ts
# git commit -m "feat(xb): add canonical interpreter for Batch 1 discontinuities blocks"
```

---

## Task 4: Add Semantic State Slots for Stateful Blocks

**Files:**
- Modify: `src/utils/stateMachine/xbSemanticBuilder.ts`
- Modify: `src/utils/stateMachine/xbSemanticValidator.test.ts`

**Interfaces:**
- Consumes: `BLOCK_LIBRARY` factories and interpreter support from Tasks 2 and 3.
- Produces: `RATE_LIMITER` operations have a `prev_y` state slot; `RELAY` operations have a `current_on` Boolean state slot.

- [ ] **Step 1: Write the failing test**

Add to `src/utils/stateMachine/xbSemanticValidator.test.ts` (import `buildSemanticModel` from `./smSemanticBuilder` if it is not already available):

```typescript
it('creates the expected state slots for RATE_LIMITER and RELAY', () => {
  const persisted = model({
    nodes: [
      node('rl', 'RATE_LIMITER'),
      node('relay', 'RELAY'),
    ],
  });
  const { ir } = buildSemanticModel(persisted);
  expect(ir).toBeDefined();
  const rl = ir!.states.controller.xBridges!.operations.rl;
  expect(rl.stateful).toBe(true);
  expect(rl.state!.slots.map((s) => s.role)).toContain('prev_y');
  const relay = ir!.states.controller.xBridges!.operations.relay;
  expect(relay.stateful).toBe(true);
  expect(relay.state!.slots.map((s) => s.role)).toContain('current_on');
  expect(relay.state!.slots[0].numericType).toEqual({ kind: 'boolean' });
});
```

- [ ] **Step 2: Run the failing test**

Run: `npx vitest run src/utils/stateMachine/xbSemanticValidator.test.ts -t "creates the expected state slots"`

Expected: FAIL because `stateBoundaryForNode` does not yet create the `prev_y` or `current_on` slots, so the operations either lack state slots or have the wrong shape.

- [ ] **Step 3: Implement the state slot rules**

In `src/utils/stateMachine/xbSemanticBuilder.ts`, inside `stateBoundaryForNode` (the same function that already special-cases `PID_BASIC`), add before the fallback `return boundary(outputSignalIds.map(...))`:

```typescript
if (node.type === 'RATE_LIMITER') {
  const control = outputByPort('u') ?? outputByPort('y') ?? signals[outputSignalIds[0] ?? ''];
  if (control === undefined) return boundary([]);
  return boundary([{
    id: `${node.id}:prev_y$state`,
    role: 'prev_y',
    signalId: null,
    numericType: { kind: 'float', precision: 'float64' },
    shape: { kind: 'scalar' },
    initialValues: [0],
  }]);
}

if (node.type === 'RELAY') {
  const output = outputByPort('y') ?? signals[outputSignalIds[0] ?? ''];
  if (output === undefined) return boundary([]);
  return boundary([{
    id: `${node.id}:current_on$state`,
    role: 'current_on',
    signalId: output.id,
    numericType: { kind: 'boolean' },
    shape: { kind: 'scalar' },
    initialValues: [node.parameters.initialState === true || node.parameters.initialState === 'on'],
  }]);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/utils/stateMachine/xbSemanticValidator.test.ts -t "creates the expected state slots"`

Expected: PASS.

- [ ] **Step 5: Commit (optional — confirm with user)**

```bash
git add src/utils/stateMachine/xbSemanticBuilder.ts src/utils/stateMachine/xbSemanticValidator.test.ts
# git commit -m "feat(xb): define semantic state slots for RateLimiter and Relay"
```

---

## Task 5: Add C99 Emitters for Stateless Blocks

**Files:**
- Modify: `src/utils/stateMachine/xbCGenerator.ts`
- Modify: `src/utils/stateMachine/xbCGenerator.test.ts`

**Interfaces:**
- Consumes: registered capabilities from Task 1.
- Produces: `OPERATION_EMITTERS.SATURATION` and `OPERATION_EMITTERS.DEADZONE` generate valid C99 expressions.

- [ ] **Step 1: Write the failing test**

Add to `src/utils/stateMachine/xbCGenerator.test.ts` inside the main `describe` block, reusing the existing helpers:

```typescript
it('T10-C99-DISCONTINUOUS emits clean Saturation and DeadZone C99', () => {
  const ir = semanticModel();
  ir.states.controller.xBridges = {
    stateId: 'controller',
    executionOrder: ['sat', 'dz'],
    operations: {
      sat: scalarOperation('sat', 'SATURATION', ['sat:u'], ['sat:y'], { upper: 5, lower: -5 }),
      dz: scalarOperation('dz', 'DEADZONE', ['dz:u'], ['dz:y'], { start: 0.5, end: -0.5 }),
    },
    signals: {
      'input:y': signal('input:y', { kind: 'float64' }),
      'sat:u': scalarInputSignal('sat:u', 'input:y', { kind: 'float64' }),
      'sat:y': signal('sat:y', { kind: 'float64' }),
      'dz:u': scalarInputSignal('dz:u', 'input:y', { kind: 'float64' }),
      'dz:y': signal('dz:y', { kind: 'float64' }),
    },
    mappings: [],
    solver: { kind: 'euler', stepSeconds: 0.01, substepsPerTick: 1 },
    policy: { memory: 'reset', numericFault: 'escalate' },
  };
  const source = renderXBSource(ir);
  expect(source).toContain('fmax(');
  expect(source).toContain('fmin(');
  expect(source).toContain('SATURATION');
  expect(source).toContain('DEADZONE');
  // Compile using the existing workspace pattern from the vector/matrix tests
  const workspace = createGeneratedCodeTestWorkspace('xb-discontinuous-stateless');
  try {
    for (const file of generateCArtifacts(ir, { includeTestShims: true }).files) {
      writeFileSync(join(workspace.directory, file.name), file.content);
    }
    const executable = join(workspace.directory, 'xb_discontinuous.exe');
    execFileSync('gcc', ['-std=c99', '-pedantic-errors', '-Wall', '-Wextra', '-Werror', '-I.', 'sm_core.c', 'sm_safety.c', 'sm_user_logic.c', 'sm_xbridges.c', 'mcal_dio_test_stubs.c', '-lm', '-o', executable], { cwd: workspace.directory, stdio: 'pipe' });
  } finally {
    workspace.cleanup();
  }
});
```

- [ ] **Step 2: Run the failing test**

Run: `npx vitest run src/utils/stateMachine/xbCGenerator.test.ts -t "T10-C99-DISCONTINUOUS emits clean Saturation and DeadZone"`

Expected: FAIL because `OPERATION_EMITTERS` does not contain `SATURATION`/`DEADZONE`.

- [ ] **Step 3: Implement the emitters**

In `src/utils/stateMachine/xbCGenerator.ts`, near the other scalar emitters, add:

```typescript
const emitSaturation = emitSingleOutput((inputs, operation) => {
  const upper = cNumber(scalarParameter(operation, ['upper'], 1));
  const lower = cNumber(scalarParameter(operation, ['lower'], -1));
  const u = inputs[0] ?? '0.0';
  return `(fmax(${lower}, fmin(${upper}, (${u}))))`;
});

const emitDeadZone = emitSingleOutput((inputs, operation) => {
  const start = cNumber(scalarParameter(operation, ['start'], 0.5));
  const end = cNumber(scalarParameter(operation, ['end'], -0.5));
  const u = inputs[0] ?? '0.0';
  return `(((${u}) > (${start})) ? ((${u}) - (${start})) : (((${u}) < (${end})) ? ((${u}) - (${end})) : 0.0))`;
});
```

Register them in `OPERATION_EMITTERS`:

```typescript
SATURATION: emitSaturation,
DEADZONE: emitDeadZone,
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/utils/stateMachine/xbCGenerator.test.ts -t "T10-C99-DISCONTINUOUS emits clean Saturation and DeadZone"`

Expected: PASS.

- [ ] **Step 5: Commit (optional — confirm with user)**

```bash
git add src/utils/stateMachine/xbCGenerator.ts src/utils/stateMachine/xbCGenerator.test.ts
# git commit -m "feat(xb): add C99 emitters for Saturation and DeadZone"
```

---

## Task 6: Add C99 State Output and Update for RateLimiter and Relay

**Files:**
- Modify: `src/utils/stateMachine/xbCGenerator.ts`
- Modify: `src/utils/stateMachine/xbCGenerator.test.ts`

**Interfaces:**
- Consumes: `stateBoundaryForNode` changes from Task 4 and interpreter from Task 3.
- Produces: `renderStateOutputs` emits the `RATE_LIMITER` output; `renderDiscreteStateUpdates` advances both `prev_y` and `current_on`.

- [ ] **Step 1: Write the failing test**

Add to `src/utils/stateMachine/xbCGenerator.test.ts`:

```typescript
it('T10-C99-DISCONTINUOUS stateful blocks execute identically to the interpreter', { timeout: 60_000 }, () => {
  const ir = semanticModel();
  const rl = {
    ...scalarOperation('rl', 'RATE_LIMITER', ['rl:u'], ['rl:y'], { risingLimit: 1, fallingLimit: 1, sampleTime: 0.1 }),
    directFeedthrough: false,
    stateful: true,
    state: {
      outputPhase: 'read-before-update',
      updatePhase: 'after-direct-feedthrough',
      slots: [{ id: 'rl:prev_y$state', role: 'prev_y', signalId: null, numericType: { kind: 'float64' }, shape: { kind: 'scalar' }, initialValues: [0] }],
    },
    schedule: { periodSubsteps: 1, offsetSubsteps: 0, initialCounter: 0, counterIncrement: 1, hold: 'none' },
  };
  const relay = {
    ...scalarOperation('relay', 'RELAY', ['relay:u'], ['relay:y'], { switchOn: 2, switchOff: 0.5, initialState: false }),
    directFeedthrough: false,
    stateful: true,
    state: {
      outputPhase: 'read-before-update',
      updatePhase: 'after-direct-feedthrough',
      slots: [{ id: 'relay:current_on$state', role: 'current_on', signalId: 'relay:y', numericType: { kind: 'boolean' }, shape: { kind: 'scalar' }, initialValues: [false] }],
    },
    schedule: { periodSubsteps: 1, offsetSubsteps: 0, initialCounter: 0, counterIncrement: 1, hold: 'none' },
  };
  ir.states.controller.xBridges = {
    stateId: 'controller',
    executionOrder: ['rl', 'relay'],
    operations: { rl, relay },
    signals: {
      'rl:u': { ...signal('rl:u', { kind: 'float64' }), direction: 'input' },
      'rl:y': signal('rl:y', { kind: 'float64' }),
      'relay:u': { ...signal('relay:u', { kind: 'float64' }), direction: 'input' },
      'relay:y': signal('relay:y', { kind: 'boolean' }),
    },
    mappings: [],
    solver: { kind: 'euler', stepSeconds: 0.01, substepsPerTick: 1 },
    policy: { memory: 'reset', numericFault: 'escalate' },
  };
  const runtime = createXBRuntime(ir.states.controller.xBridges!);
  const inputs = [[100, 1], [100, 3], [0, 0.75], [0, 0.25]];
  const expected: number[] = [];
  for (const [rlInput, relayInput] of inputs) {
    runtime.signals['rl:u'] = [rlInput];
    runtime.signals['relay:u'] = [relayInput];
    stepXBState(runtime, {});
    expected.push(Number(runtime.signals['rl:y'][0]), Number(runtime.signals['relay:y'][0]));
  }
  const workspace = createGeneratedCodeTestWorkspace('xb-discontinuous-stateful');
  try {
    for (const file of generateCArtifacts(ir, { includeTestShims: true }).files) {
      writeFileSync(join(workspace.directory, file.name), file.content);
    }
    const source = generateCArtifacts(ir).files.find((file) => file.name === 'sm_core.c')!.content;
    writeFileSync(join(workspace.directory, 'harness.c'), [
      '#include "sm_core.h"', '#include <stdio.h>', '',
      'int main(void) {', '  ADIA_Instance_t instance;', '  if (SM_Init(&instance) != SM_ERR_NONE) return 1;',
      '  const double inputs[4][2] = {{100,1},{100,3},{0,0.75},{0,0.25}};', '  for (unsigned i = 0; i < 4; ++i) {',
      '    instance.xb_controller.rl_u = inputs[i][0];', '    instance.xb_controller.relay_u = inputs[i][1];',
      '    SM_XB_CONTROLLER_Step(&instance);',
      '    printf("%.17g,%d,", instance.xb_controller.rl_y, instance.xb_controller.relay_y ? 1 : 0);',
      '  }', '  printf("\\n");', '  return 0;', '}', '',
    ].join('\n'));
    const executable = join(workspace.directory, 'xb_stateful.exe');
    execFileSync('gcc', ['-std=c99', '-pedantic-errors', '-Wall', '-Wextra', '-Werror', '-I.', 'sm_core.c', 'sm_safety.c', 'sm_user_logic.c', 'sm_xbridges.c', 'mcal_dio_test_stubs.c', 'harness.c', '-lm', '-o', executable], { cwd: workspace.directory, stdio: 'pipe' });
    const actual = execFileSync(executable, [], { cwd: workspace.directory, encoding: 'utf8' }).trim().split(',').map(Number);
    expect(actual).toHaveLength(expected.length);
    actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index], 10));
  } finally {
    workspace.cleanup();
  }
});
```

- [ ] **Step 2: Run the failing test**

Run: `npx vitest run src/utils/stateMachine/xbCGenerator.test.ts -t "T10-C99-DISCONTINUOUS stateful blocks"`

Expected: FAIL with an unsupported operation error.

- [ ] **Step 3: Implement the stateful C99 logic**

In `src/utils/stateMachine/xbCGenerator.ts`:

1. In `renderStateOutputs`, after the `PID_BASIC` and `STATE_SPACE` special cases and before the fallback, add:

```typescript
if (operation.type === 'RATE_LIMITER') {
  const inputId = operation.inputSignalIds[0];
  const outputId = operation.outputSignalIds[0];
  const prevSlot = stateSlotForRole(operation, 'prev_y');
  if (inputId === undefined || outputId === undefined || prevSlot === undefined) {
    throw new Error(`X-Bridges RATE_LIMITER '${operation.id}' requires input, output, and prev_y state`);
  }
  const u = signalRealExpression(state, inputId, layout, member);
  const prevY = stateSlotRealExpression(prevSlot, layout, member);
  const dt = cNumber(scalarParameter(operation, ['sampleTime', 'dt'], 1));
  const rising = cNumber(scalarParameter(operation, ['risingLimit'], 1));
  const falling = cNumber(scalarParameter(operation, ['fallingLimit'], 1));
  const y = `(fmax((${prevY}) - (${falling}) * (${dt}), fmin((${prevY}) + (${rising}) * (${dt}), (${u}))))`;
  return renderSignalWrite(state, operation, operationIndex, 0, outputId, y, layout, member);
}
```

2. In `renderDiscreteStateUpdates`, inside the `updates` switch (near the `PID_CONTROLLER` case), add:

```typescript
case 'RATE_LIMITER': {
  const prevSlot = stateSlotForRole(operation, 'prev_y');
  const inputId = operation.inputSignalIds[0];
  if (prevSlot === undefined || inputId === undefined) {
    throw new Error(`X-Bridges RATE_LIMITER '${operation.id}' requires prev_y state and input`);
  }
  const u = signalRealExpression(state, inputId, layout, member);
  const prevY = stateSlotRealExpression(prevSlot, layout, member);
  const dt = cNumber(scalarParameter(operation, ['sampleTime', 'dt'], 1));
  const rising = cNumber(scalarParameter(operation, ['risingLimit'], 1));
  const falling = cNumber(scalarParameter(operation, ['fallingLimit'], 1));
  const y = `(fmax((${prevY}) - (${falling}) * (${dt}), fmin((${prevY}) + (${rising}) * (${dt}), (${u}))))`;
  return renderStateSlotAssignment(state, prevSlot, y, layout, member, `${operation.id}_prev_y_update`, layout.errorFields.get(operation.id), operation);
}
case 'RELAY': {
  const onSlot = stateSlotForRole(operation, 'current_on');
  const inputId = operation.inputSignalIds[0];
  if (onSlot === undefined || inputId === undefined) {
    throw new Error(`X-Bridges RELAY '${operation.id}' requires current_on state and input`);
  }
  const u = signalRealExpression(state, inputId, layout, member);
  const on = cNumber(scalarParameter(operation, ['switchOn'], 1));
  const off = cNumber(scalarParameter(operation, ['switchOff'], 0));
  const currentOn = stateSlotRealExpression(onSlot, layout, member); // returns 0.0/1.0 for boolean slot
  const expr = `(((${u}) >= (${on})) || (((${currentOn}) != 0.0) && ((${u}) > (${off}))))`;
  return renderStateSlotAssignment(state, onSlot, expr, layout, member, `${operation.id}_current_on_update`, layout.errorFields.get(operation.id), operation);
}
```

3. Register lifecycle stubs in `OPERATION_EMITTERS` so the generator validation pass does not fail:

```typescript
RATE_LIMITER: () => [],
RELAY: () => [],
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/utils/stateMachine/xbCGenerator.test.ts -t "T10-C99-DISCONTINUOUS stateful blocks"`

Expected: PASS.

- [ ] **Step 5: Commit (optional — confirm with user)**

```bash
git add src/utils/stateMachine/xbCGenerator.ts src/utils/stateMachine/xbCGenerator.test.ts
# git commit -m "feat(xb): add C99 state output and update for RateLimiter and Relay"
```

---

## Task 7: Clean Up Boolean Logic Code Generation

**Files:**
- Modify: `src/utils/stateMachine/xbCGenerator.ts`
- Modify: `src/utils/stateMachine/xbCGenerator.test.ts`

**Interfaces:**
- Consumes: existing logic emitters and `renderSignalWrite`.
- Produces: AND/OR/NOT/NAND/NOR/XOR generate a `bool` expression and assign it directly to a Boolean signal with no `SM_XB_Truth` on the output and no `isfinite` check.

- [ ] **Step 1: Write the failing test**

Add to `src/utils/stateMachine/xbCGenerator.test.ts`:

```typescript
it('emits Boolean logic without redundant double conversions', () => {
  const ir = combinationalSemanticModel();
  ir.states.controller.xBridges.executionOrder = ['logical-and', 'logical-not', 'logical-or', 'nand', 'nor', 'xor', 'constant'];
  ir.states.controller.xBridges.operations = {
    'logical-and': scalarOperation('logical-and', 'AND', ['logical-and:a', 'logical-and:b'], ['logical-and:y']),
    'logical-not': scalarOperation('logical-not', 'NOT', ['logical-not:u'], ['logical-not:y']),
    'logical-or': scalarOperation('logical-or', 'OR', ['logical-or:a', 'logical-or:b'], ['logical-or:y']),
    'nand': scalarOperation('nand', 'NAND', ['nand:a', 'nand:b'], ['nand:y']),
    'nor': scalarOperation('nor', 'NOR', ['nor:a', 'nor:b'], ['nor:y']),
    'xor': scalarOperation('xor', 'XOR', ['xor:a', 'xor:b'], ['xor:y']),
    'constant': scalarOperation('constant', 'Constant', [], ['constant:y'], { value: true }),
  };
  ir.states.controller.xBridges.signals = {
    'logical-and:a': scalarInputSignal('logical-and:a', 'input:y', { kind: 'boolean' }),
    'logical-and:b': scalarInputSignal('logical-and:b', 'input:y', { kind: 'boolean' }),
    'logical-and:y': signal('logical-and:y', { kind: 'boolean' }),
    'logical-not:u': scalarInputSignal('logical-not:u', 'input:y', { kind: 'boolean' }),
    'logical-not:y': signal('logical-not:y', { kind: 'boolean' }),
    'logical-or:a': scalarInputSignal('logical-or:a', 'input:y', { kind: 'boolean' }),
    'logical-or:b': scalarInputSignal('logical-or:b', 'input:y', { kind: 'boolean' }),
    'logical-or:y': signal('logical-or:y', { kind: 'boolean' }),
    'nand:a': scalarInputSignal('nand:a', 'input:y', { kind: 'boolean' }),
    'nand:b': scalarInputSignal('nand:b', 'input:y', { kind: 'boolean' }),
    'nand:y': signal('nand:y', { kind: 'boolean' }),
    'nor:a': scalarInputSignal('nor:a', 'input:y', { kind: 'boolean' }),
    'nor:b': scalarInputSignal('nor:b', 'input:y', { kind: 'boolean' }),
    'nor:y': signal('nor:y', { kind: 'boolean' }),
    'xor:a': scalarInputSignal('xor:a', 'input:y', { kind: 'boolean' }),
    'xor:b': scalarInputSignal('xor:b', 'input:y', { kind: 'boolean' }),
    'xor:y': signal('xor:y', { kind: 'boolean' }),
    'constant:y': signal('constant:y', { kind: 'boolean' }),
    'input:y': signal('input:y', { kind: 'boolean' }),
  };
  const source = renderXBSource(ir);
  // No SM_XB_Truth on the output assignment path for boolean signals
  const logicLines = source.split('\n').filter((line) =>
    line.includes('logical-and') || line.includes('logical-not') || line.includes('logical-or') ||
    line.includes('nand') || line.includes('nor') || line.includes('xor') || line.includes('constant')
  );
  for (const line of logicLines) {
    expect(line).not.toMatch(/isfinite\s*\(/);
  }
  // Boolean constant should be emitted as true, not 1.0
  expect(source).toContain('constant_y = true');
});
```

- [ ] **Step 2: Run the failing test**

Run: `npx vitest run src/utils/stateMachine/xbCGenerator.test.ts -t "emits Boolean logic without redundant double conversions"`

Expected: FAIL because the current code still uses `SM_XB_Truth` and `isfinite`.

- [ ] **Step 3: Implement the Boolean cleanup helpers and emitters**

In `src/utils/stateMachine/xbCGenerator.ts`:

1. Add a helper to read an input as a C99 Boolean expression:

```typescript
const signalBooleanExpression = (
  state: SemanticState,
  signalId: string,
  layout: XBStateLayout,
  member: string,
): string => {
  const storage = signalStorageExpression(state, signalId, layout, member);
  if (storage.signal.numericType.kind === 'boolean') {
    return storage.expression;
  }
  return `SM_XB_Truth(${signalRealExpression(state, signalId, layout, member)})`;
};

const inputBooleanExpressions = (
  state: SemanticState,
  operation: XBSemanticOperation,
  layout: XBStateLayout,
  member: string,
): string[] => operation.inputSignalIds.map((signalId) =>
  signalBooleanExpression(state, signalId, layout, member));
```

2. Change the logic emitters to use the Boolean helper. `emitSingleOutput` does not pass `layout`/`member` to the expression function, so each emitter is wrapped:

```typescript
const emitAnd: OperationEmitter = (state, operation, operationIndex, layout, member) => {
  const inputs = inputBooleanExpressions(state, operation, layout, member);
  return emitSingleOutput(() => reduceExpression(inputs, '&&', 'true'))(state, operation, operationIndex, layout, member);
};

const emitOr: OperationEmitter = (state, operation, operationIndex, layout, member) => {
  const inputs = inputBooleanExpressions(state, operation, layout, member);
  return emitSingleOutput(() => reduceExpression(inputs, '||', 'false'))(state, operation, operationIndex, layout, member);
};

const emitNot: OperationEmitter = (state, operation, operationIndex, layout, member) => {
  const inputs = inputBooleanExpressions(state, operation, layout, member);
  const first = inputs[0] ?? 'false';
  return emitSingleOutput(() => `(!${first})`)(state, operation, operationIndex, layout, member);
};

const emitNand: OperationEmitter = (state, operation, operationIndex, layout, member) => {
  const inputs = inputBooleanExpressions(state, operation, layout, member);
  return emitSingleOutput(() => `(!${reduceExpression(inputs, '&&', 'true')})`)(state, operation, operationIndex, layout, member);
};

const emitNor: OperationEmitter = (state, operation, operationIndex, layout, member) => {
  const inputs = inputBooleanExpressions(state, operation, layout, member);
  return emitSingleOutput(() => `(!${reduceExpression(inputs, '||', 'false')})`)(state, operation, operationIndex, layout, member);
};

const emitXor: OperationEmitter = (state, operation, operationIndex, layout, member) => {
  const inputs = inputBooleanExpressions(state, operation, layout, member);
  return emitSingleOutput(() => `((${inputs.map((input) => `((${input}) ? 1 : 0)`).join(' + ') || '0'}) % 2)`)(state, operation, operationIndex, layout, member);
};
```

3. In `renderSignalWrite`, replace the `boolean` branch with:

```typescript
if (signal.numericType.kind === 'boolean') {
  return [
    `    const bool ${valueName} = (${expression});`,
    `    instance->${member}.${field} = ${valueName};`,
  ];
}
```

Boolean outputs do not carry numeric faults, so no `errorField` or `isfinite` handling is needed here.

4. In `renderStateSlotAssignment`, replace the non-fixed branch with a Boolean-aware branch:

```typescript
if (slot.numericType.kind === 'boolean') {
  return [
    `    const bool ${value} = (${expression});`,
    `    ${field} = ${value};`,
  ];
}
return [
  `    const double ${value} = (double)(${expression});`,
  `    if (!isfinite(${value})) {`, ...faultLines, '    } else {',
  `        ${field} = (${numericCType(slot.numericType)})${value};`, '    }',
];
```

5. In `renderStateOutputs`, replace the fallback default expression for boolean slots so a Boolean state slot exposed as an output uses the Boolean field directly:

```typescript
return (operation.state?.slots ?? []).flatMap((slot, slotIndex) => slot.signalId === null ? [] :
  renderSignalWrite(
    state,
    operation,
    operationIndex,
    slotIndex,
    slot.signalId,
    expressions?.[slotIndex]
      ?? (slot.numericType.kind === 'boolean'
        ? `instance->${member}.${stateSlotField(slot, layout)}`
        : stateSlotRealExpression(slot, layout, member)),
    layout,
    member,
  ));
```

6. In `emitConstant`, emit `true`/`false` when the output signal is Boolean:

```typescript
const emitConstant: OperationEmitter = (state, operation, operationIndex, layout, member) => {
  if (operation.outputSignalIds.length === 0) return [];
  const signal = requireScalarSignal(state, operation.outputSignalIds[0]);
  const value = operation.parameters.value;
  const raw = typeof value === 'boolean' || value === 1 || value === 'true' || value === true ? 'true' : 'false';
  const expression = signal.numericType.kind === 'boolean'
    ? raw
    : cNumber(value);
  return renderSignalWrite(state, operation, operationIndex, 0, operation.outputSignalIds[0], expression, layout, member);
};
```

Use the exact `emitConstant` implementation already in the file; only change the expression path for Boolean output.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/utils/stateMachine/xbCGenerator.test.ts -t "emits Boolean logic without redundant double conversions"`

Expected: PASS.

- [ ] **Step 5: Run the existing logic block tests to verify no regression**

Run: `npx vitest run src/utils/stateMachine/xbCGenerator.test.ts -t "T14-C99-CORE-DIRECT executes every registered scalar core operation"`

Expected: PASS. If it fails due to snapshots or test expectations, update the test/snapshot after confirming the new Boolean output is correct.

- [ ] **Step 6: Commit (optional — confirm with user)**

```bash
git add src/utils/stateMachine/xbCGenerator.ts src/utils/stateMachine/xbCGenerator.test.ts
# git commit -m "refactor(xb): keep Boolean logic path as bool in generated C99"
```

---

## Task 8: Full Regression Test Suite

**Files:**
- All files changed above.
- Modify: `src/utils/__snapshots__/stateMachineCodeGenerator.golden.test.ts.snap` if tests fail due to legitimate output changes.

- [ ] **Step 1: Run the targeted X-Bridges test suites**

Run:

```bash
npx vitest run src/utils/stateMachine/xbCGenerator.test.ts src/utils/stateMachine/xbInterpreter.test.ts src/utils/stateMachine/xbCapabilities.test.ts src/utils/stateMachine/xbSemanticValidator.test.ts
```

Expected: PASS or snapshot failures that are clearly due to the intended Boolean cleanup (e.g., `1.0` → `true`).

- [ ] **Step 2: Update any failing snapshots intentionally**

If Vitest reports snapshot mismatches, inspect each diff. Only update if the change is the expected removal of `SM_XB_Truth`/`isfinite` on Boolean outputs or `1.0`/`0.0` → `true`/`false` for Boolean constants.

Run: `npx vitest run src/utils/stateMachine/xbCGenerator.test.ts --update`

- [ ] **Step 3: Verify the runtime build**

Run: `npm run build:sm-runtime`

Expected: exits with code 0 and no TypeScript errors.

- [ ] **Step 4: Commit (optional — confirm with user)**

```bash
git add src/utils/__snapshots__/stateMachineCodeGenerator.golden.test.ts.snap
# git commit -m "test(xb): update snapshots for Boolean cleanup"
```

---

## Task 9: Integration Verification and Documentation

**Files:**
- Modify: `docs/XBRIDGES_EMBEDDED_CODEGEN.md` (capability matrix only if the doc lists block-level capabilities).
- Modify: `docs/superpowers/specs/2026-08-05-batch1-discontinuous-blocks-design.md` status line if needed.

- [ ] **Step 1: Run the integration validation script**

Run: `tsx scripts/validate_generated_code.ts`

Expected: passes TR-01 through TR-07 with no phantom variables, correct headers, or MCAL interface errors.

- [ ] **Step 2: Run the state-machine C generator tests**

Run: `npx vitest run src/utils/stateMachine/smCGenerator.test.ts`

Expected: PASS, including any Batch2B routing probe tests.

- [ ] **Step 3: Update the capability matrix in docs**

If `docs/XBRIDGES_EMBEDDED_CODEGEN.md` contains a table of supported blocks, add `SATURATION`, `DEADZONE`, `RATE_LIMITER`, and `RELAY` with the same notes as the spec. Do not add new sections otherwise.

- [ ] **Step 4: Final review and commit (optional — confirm with user)**

```bash
git add docs/XBRIDGES_EMBEDDED_CODEGEN.md
# git commit -m "docs(xb): document Batch 1 discontinuities blocks in embedded codegen matrix"
```

---

## Self-Review Checklist

- [ ] Every spec requirement maps to a task above.
- [ ] No plan step contains `TBD`, `TODO`, or vague instructions.
- [ ] All test snippets use the existing test helpers (`scalarOperation`, `statefulOperation`, `signal`, `createGeneratedCodeTestWorkspace`, `generateCArtifacts`, `renderXBSource`, `createXBRuntime`, `stepXBState`).
- [ ] `RELAY` state slot is Boolean and exposed as the output signal.
- [ ] `RATE_LIMITER` state slot is hidden (`signalId: null`) and updated separately from its output.
- [ ] Boolean cleanup does not change numeric/fixed output paths.

---

**Plan complete.** If any task proves larger than expected, stop after the failing test and ask for a review before proceeding to the implementation step.