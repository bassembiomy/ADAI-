# Design Spec: IF_ELSE Block Strict C99 Code Generation Support

**Date:** 2026-08-05  
**Status:** Approved by User  
**Target Subsystems:** `xbCapabilities`, `xbSemanticValidator`, `xbInterpreter`, `xbCGenerator`, Unit Tests (`Vitest`)

---

## 1. Goal & Context

Promote the `IF_ELSE` signal routing block from `UNCLASSIFIED_HOST_ONLY` to full dual executable conformance (`codegen: true`).

Currently, using an `IF_ELSE` block in an X-Bridges diagram inside a State Machine state produces the semantic validation error:
`"State '<stateId>': No paired canonical-interpreter and strict-C99 embedded conformance case is registered."`

By enabling `codegen: true` with dual executable conformance coverage between the TypeScript canonical interpreter (`xbInterpreter.ts`) and the MISRA-compliant strict-C99 code generator (`xbCGenerator.ts`), models containing `IF_ELSE` blocks will pass semantic model validation and generate clean, deterministic C code.

---

## 2. Component Architecture & Detailed Specification

### 2.1 Capability Classification & Manifests (`src/utils/stateMachine/xbCapabilities.ts`)

- **Manifest Integration:**
  Add `'IF_ELSE'` to `SIGNAL_ROUTING_COVERAGE` in `xbCapabilities.ts`.
- **Capability Mapping (`XB_CAPABILITIES`):**
  Remove `'IF_ELSE'` from `UNCLASSIFIED_HOST_ONLY`.
  Register `'IF_ELSE'` in `XB_CAPABILITIES`:
  ```typescript
  IF_ELSE: direct(allShapes, undefined, ['T10-INT-SIGNAL-ROUTING'], ['T10-C99-SIGNAL-ROUTING']),
  ```
- **Supported Shapes:**
  Supports `scalar`, `vector`, and `matrix` signal shapes (`allShapes`).

---

### 2.2 Canonical Interpreter (`src/utils/stateMachine/xbInterpreter.ts`)

- **Input Port Contract:**
  - Input 0 (`inputs[0]`): Condition signal (`cond`).
  - Input 1 (`inputs[1]`): Value signal when condition is true (`u_true`).
  - Input 2 (`inputs[2]`): Value signal when condition is false (`u_false`).
- **Evaluation Logic:**
  ```typescript
  case 'IF_ELSE': {
    const cond = inputs[0]?.[0];
    const threshold = Number(parameter(operation, ['threshold', 'Threshold'], 0.5));
    const pass = cond !== undefined && (Boolean(cond) && (typeof cond === 'boolean' || cond >= threshold || Number(cond) !== 0));
    return [pass ? (inputs[1] ?? [0]) : (inputs[2] ?? [0])];
  }
  ```

---

### 2.3 C Code Generator (`src/utils/stateMachine/xbCGenerator.ts`)

- **Emitter (`emitIfElse`):**
  ```typescript
  const emitIfElse = emitSingleOutput((inputs, operation) => {
    const threshold = cNumber(
      scalarParameter(operation, ['threshold', 'Threshold'], 0.5),
    );
    const cond = inputs[0] ?? '0.0';
    const trueVal = inputs[1] ?? '0.0';
    const falseVal = inputs[2] ?? '0.0';
    return `((SM_XB_Truth(${cond}) && (${cond}) >= ${threshold}) ? (${trueVal}) : (${falseVal}))`;
  });
  ```
- **Register in Emitter Map:**
  Map `'IF_ELSE': emitIfElse` in `OPERATION_EMITTERS`.

---

## 3. Verification & Testing Strategy

1. **`xbCapabilities.test.ts`**:
   - Verify `getXBBlockCapability('IF_ELSE')` returns `codegen: true`.
   - Verify required conformance case IDs match `['T10-INT-SIGNAL-ROUTING']` and `['T10-C99-SIGNAL-ROUTING']`.

2. **`xbInterpreter.test.ts`**:
   - Test `IF_ELSE` with true condition selects `u_true`.
   - Test `IF_ELSE` with false condition selects `u_false`.
   - Test vector/matrix signal pass-through.

3. **`xbCGenerator.test.ts`**:
   - Verify generated C code for `IF_ELSE` compiles and evaluates correctly against reference inputs.

4. **`xbSemanticValidator.test.ts`**:
   - Verify models containing `IF_ELSE` pass validation without `XB_BLOCK_NOT_CODEGEN_CAPABLE` errors.

5. **Integration Verification:**
   - Verify `statemachine-xbridges-master-batch2b-routing-probe.json` code generation completes with 0 errors.
