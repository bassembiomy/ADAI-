# Design Spec: Batch 1 Discontinuities Blocks + Boolean Codegen Cleanup

**Date:** 2026-08-05  
**Status:** Approved by User  
**Target Subsystems:** `BlockDefinitions`, `xbCapabilities`, `xbInterpreter`, `xbSemanticBuilder`, `xbCGenerator`, Unit Tests (`Vitest`)

---

## 1. Goal & Context

Promote four standard Simulink Discontinuities blocks to full dual executable conformance (`codegen: true`) in X‑Bridges, and clean up the Boolean logic code‑generation path that was flagged in the Batch2A quality review.

### New Blocks (Batch 1)

| Block | Simulink Library | State | Output Type |
|-------|------------------|-------|-------------|
| `SATURATION` | Discontinuities / Saturation | Stateless | `float64` |
| `DEADZONE` | Discontinuities / Dead Zone | Stateless | `float64` |
| `RATE_LIMITER` | Discontinuities / Rate Limiter | `prev_y` | `float64` |
| `RELAY` | Discontinuities / Relay | `current_on` | `boolean` |

### Boolean Codegen Cleanup

AND / OR / NOT / NAND / NOR / XOR currently generate a redundant `double → bool → double → bool` conversion:

```c
const double xb_value_0_0 = (double)((SM_XB_Truth(u1)) && (SM_XB_Truth(u2)));
instance->out = SM_XB_Truth(xb_value_0_0);
if (!isfinite(xb_value_0_0)) { instance->out = false; }
```

This design keeps the entire path C99 `bool`:

```c
const bool xb_value_0_0 = (SM_XB_Truth(u1)) && (SM_XB_Truth(u2));
instance->out = xb_value_0_0;
```

Boolean constants are also emitted as `true`/`false` instead of `1.0`/`0.0` when the destination signal is Boolean.

---

## 2. Component Architecture & Detailed Specification

### 2.1 Capability Classification & Manifests (`src/utils/stateMachine/xbCapabilities.ts`)

Add a new conformance group for discontinuities and register the four blocks.

```typescript
const DISCONTINUOUS_COVERAGE: readonly XBConformanceCoverage[] = [
  scalarCoverage('SATURATION'),
  scalarCoverage('DEADZONE'),
  scalarCoverage('RATE_LIMITER'),
  scalarCoverage('RELAY'),
];

export const XB_INTERPRETER_CONFORMANCE_CASES: Readonly<Record<string, readonly XBConformanceCoverage[]>> = Object.freeze({
  ...
  'T10-INT-DISCONTINUOUS': DISCONTINUOUS_COVERAGE,
  'T14-INT-DISCONTINUOUS': DISCONTINUOUS_COVERAGE,
});

export const XB_C_CONFORMANCE_CASES: Readonly<Record<string, readonly XBConformanceCoverage[]>> = Object.freeze({
  ...
  'T10-C99-DISCONTINUOUS': DISCONTINUOUS_COVERAGE,
  'T14-C99-DISCONTINUOUS': DISCONTINUOUS_COVERAGE,
});
```

Register capabilities:

```typescript
SATURATION:   direct(scalar, ['math-library'], ['T10-INT-DISCONTINUOUS'], ['T10-C99-DISCONTINUOUS']),
DEADZONE:     direct(scalar, ['math-library'], ['T10-INT-DISCONTINUOUS'], ['T10-C99-DISCONTINUOUS']),
RATE_LIMITER: stateful(scalar, ['math-library'], ['T10-INT-DISCONTINUOUS'], ['T10-C99-DISCONTINUOUS']),
RELAY:        stateful(scalar, undefined, ['T10-INT-DISCONTINUOUS'], ['T10-C99-DISCONTINUOUS']),
```

`math-library` is required for `fmax`, `fmin`, and `fabs`.

### 2.2 Simulation Block Library (`src/engine/xbridges/BlockDefinitions.ts`)

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

### 2.3 Canonical Interpreter (`src/utils/stateMachine/xbInterpreter.ts`)

**Direct cases (`evaluateDirectOperation`):**

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

**Stateful update (`statefulUpdate`):**

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

### 2.4 Semantic State Slots (`src/utils/stateMachine/xbSemanticBuilder.ts`)

Special-case `stateBoundaryForNode` for the two stateful blocks.

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
  return boundary([{
    id: `${node.id}:current_on$state`,
    role: 'current_on',
    signalId: null,
    numericType: { kind: 'boolean' },
    shape: { kind: 'scalar' },
    initialValues: [node.parameters.initialState === true || node.parameters.initialState === 'on'],
  }]);
}
```

### 2.5 C Code Generator (`src/utils/stateMachine/xbCGenerator.ts`)

#### Stateless emitters

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

Register in `OPERATION_EMITTERS`:

```typescript
SATURATION: emitSaturation,
DEADZONE: emitDeadZone,
```

#### Stateful blocks

RateLimiter and Relay are implemented in the discrete state update section rather than as direct emitters because they must read and write state slots. The lifecycle stubs are registered in `OPERATION_EMITTERS` to satisfy the pipeline but produce no output lines directly; `renderDiscreteStateUpdates` computes and writes both the output signal and the state slot.

**RateLimiter update (in `renderDiscreteStateUpdates`):**

```c
const double u = <input>;
const double prev_y = <state prev_y>;
const double dt = <sampleTime>;
const double y = fmax(prev_y - (<fallingLimit>) * dt,
                      fmin(prev_y + (<risingLimit>) * dt, u));
<write y to output signal>
<write y to prev_y slot>
```

**Relay update:**

```c
const double u = <input>;
const bool current_on = (u >= (<switchOn>)) || ((<prev current_on>) && (u > (<switchOff>)));
<write current_on to boolean output signal>
<write current_on to current_on slot>
```

### 2.6 Boolean Logic Cleanup (`xbCGenerator.ts`)

#### 2.6.1 Boolean input reader

Add a helper that returns a C99 `bool` expression for each input, applying `SM_XB_Truth` only when the source is numeric:

```typescript
const inputBooleanExpressions = (
  state: SemanticState,
  operation: XBSemanticOperation,
  layout: XBStateLayout,
  member: string,
): string[] => operation.inputSignalIds.map((signalId) => {
  const signal = requireScalarSignal(state, signalId);
  if (signal.numericType.kind === 'boolean') {
    return signalStorageExpression(state, signalId, layout, member).expression;
  }
  return `SM_XB_Truth(${signalRealExpression(state, signalId, layout, member)})`;
});
```

#### 2.6.2 Boolean output writer

Modify `renderSignalWrite` so that when the destination signal is Boolean it does not create a `double` temporary, does not call `SM_XB_Truth` on the result, and does not check `isfinite`:

```typescript
if (signal.numericType.kind === 'boolean') {
  return [
    `    const bool ${valueName} = (${expression});`,
    `    instance->${member}.${field} = ${valueName};`,
    ...(errorField === undefined ? [] : [`    instance->${member}.${errorField} = true;`]),
  ];
}
```

Logic emitters are changed to produce Boolean expressions:

```typescript
const emitAnd = emitSingleOutput((inputs, operation, state) =>
  reduceExpression(inputBooleanExpressions(state, operation, ...), '&&', 'true'));
const emitOr  = emitSingleOutput((inputs, operation, state) =>
  reduceExpression(inputBooleanExpressions(state, operation, ...), '||', 'false'));
const emitNot = emitSingleOutput((inputs, operation, state) =>
  `(!${inputBooleanExpressions(state, operation, ...)[0] ?? 'false'})`);
const emitNand = emitSingleOutput((inputs, operation, state) =>
  `(!${reduceExpression(inputBooleanExpressions(...), '&&', 'true')})`);
const emitNor = emitSingleOutput((inputs, operation, state) =>
  `(!${reduceExpression(inputBooleanExpressions(...), '||', 'false')})`);
const emitXor = emitSingleOutput((inputs, operation, state) =>
  `((${inputBooleanExpressions(...).map((input) => `((${input}) ? 1 : 0)`).join(' + ') || '0'}) % 2)`);
```

#### 2.6.3 Boolean constants

For `Constant` blocks whose output signal is Boolean, `emitConstant` emits `true`/`false` instead of `1.0`/`0.0`:

```typescript
if (signal.numericType.kind === 'boolean') {
  const value = operation.parameters.value;
  return value === true || value === 1 || value === 'true' ? 'true' : 'false';
}
```

---

## 3. Verification & Testing Strategy

1. **`xbCapabilities.test.ts`**
   - Verify `SATURATION`, `DEADZONE`, `RATE_LIMITER`, `RELAY` return `codegen: true`.
   - Verify the new `T10/T14-INT-DISCONTINUOUS` and `T10/T14-C99-DISCONTINUOUS` conformance groups include the four blocks.

2. **`xbInterpreter.test.ts`**
   - Saturation: clamp above upper, below lower, inside range.
   - DeadZone: inside band returns 0, outside returns shifted value.
   - RateLimiter: rising/falling slew limits, sampleTime scaling.
   - Relay: hysteresis (switch on, switch off, keep state in band).

3. **`xbCGenerator.test.ts`**
   - Each block generates code that compiles under `-std=c99 -pedantic-errors -Wall -Wextra -Werror` and matches the interpreter on the same input vectors.
   - RateLimiter and Relay state is initialized and carried across steps.

4. **`xbSemanticValidator.test.ts`**
   - Models using the new blocks pass validation.
   - `RATE_LIMITER` and `RELAY` are treated as non-direct-feedthrough (stateful) and break algebraic loops correctly.

5. **Boolean cleanup regression**
   - A model with AND/OR/NOT feeding a Boolean signal produces no `SM_XB_Truth` on the output, no `isfinite` check, and no `1.0`/`0.0` constants.
   - Existing interpreter/C parity tests for logic blocks still pass.

6. **Integration**
   - Generate a sample state machine that uses the new blocks and confirm the full artifact pipeline (headers, MCAL binding, compiler dry-run) succeeds.

---

## 4. Risks & Trade-offs

| Risk | Mitigation |
|------|------------|
| `fmax`/`fmin`/`fabs` require `math-library` target capability | Explicitly set `requiredTargetCapabilities: ['math-library']` for all blocks that use them. |
| Changing the Boolean write path affects every block with a Boolean output | Keep the numeric/fixed paths unchanged; only the `if (signal.numericType.kind === 'boolean')` branch is modified. Snapshots are updated only after confirming correctness. |
| Relay state must be Boolean while the interpreter may store it as number | The interpreter normalizes to `Boolean`, and the state slot type is `boolean`. The C runtime stores it as `bool`. |
| DeadZone `start`/`end` parameter ordering | Follow the Simulink convention: `start` is the upper edge and `end` is the lower edge. If a model swaps them, the ternary still produces a deterministic asymmetric dead zone. |

---

**Next Step:** After this spec is approved, invoke the `writing-plans` skill to create the implementation plan.