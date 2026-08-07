# Design Specification: XBridge Code Generation Runtime and Mapping Fixes

**Date**: 2026-08-08  
**Status**: Approved (Implementation-Ready)  
**Approach**: Approach 1 – Integrated Semantic Symbol Table & Pre-Lowering Resolution  

---

## 1. Overview & Objectives

This design specification details the architectural and code-generation changes required to make XBridge-generated C code semantically accurate, deterministically compilable, and structurally consistent with the source state-machine model.

### Key Objectives
1. **Authoritative Variable Resolution**: Every XBridge mapping referencing a state-machine variable ID (human-readable string or UUID) is resolved to a single C symbol object (`SemanticVariableSymbol`) before rendering. Direct string sanitization fallbacks during C generation are strictly eliminated.
2. **Explicit Owner State Context**: Every XBridge semantic graph retains resolved owner-state identity (`XBOwnerState`), referencing `cIndexSymbol` (e.g. `SM_ST_..._IDX`) rather than literal fallback indices (`state_timers[0U]`).
3. **Canonical Time & Alignment Abstraction**: Time units are explicitly tracked. Unit conversion (`convertTime`) and scheduler alignment (`alignRuntimeThreshold`) are decoupled. Step blocks and time-dependent expressions render pre-aligned threshold comparisons in milliseconds against the owning state's timer.
4. **Data Member & Symbol Verification**: Before host compilation, generated C AST / code accesses are validated to guarantee `usedDataMembers ⊆ declaredDataMembers` and `usedStateIndices ⊆ declaredStateIndices`.
5. **Mandatory Host Compilation Gate**: All generated C artifacts (`sm_core.c`, `sm_xbridges.c`, etc.) are syntax-checked using host compilers (`gcc -std=c11 -Wall -Wextra -fsyntax-only` for correctness gate, `-Werror` for CI gate) before generation is declared successful.

---

## 2. Shared Semantic Symbol & Context Models

To avoid circular dependencies between the state-machine (`SM`) and XBridge (`XB`) semantic modules, shared lightweight symbol types are introduced in `src/utils/stateMachine/smSemanticModel.ts` (and exported for use by `xbSemanticModel.ts`).

### 2.1 `SemanticType` and `SemanticVariableSymbol`
```ts
export type SemanticType =
  | 'boolean'
  | 'int8'
  | 'uint8'
  | 'int16'
  | 'uint16'
  | 'int32'
  | 'uint32'
  | 'float32'
  | 'float64';

export interface SemanticVariableSymbol {
  readonly id: string;            // Source model variable ID (e.g., "xb6-step-output-0001" or UUID)
  readonly modelName: string;     // Model-defined variable name (e.g., "xb6_step_output")
  readonly cIdentifier: string;   // Verified C identifier in SM_Data_t (e.g., "xb6_step_output")
  readonly semanticType: SemanticType; // Validated strongly-typed semantic type
  readonly cType: string;         // Target C type (e.g., "float", "double", "bool")
}
```

### 2.2 `XBOwnerState`
```ts
export interface XBOwnerState {
  readonly stateId: string;          // Source state UUID / identifier
  readonly stateName: string;        // Human readable state name (e.g., "State_6_copy")
  readonly cIndexSymbol: string;     // Resolved state index macro (e.g., "SM_ST__1FC92E02_C821_43E6_9B89_2F938DB7945D_IDX")
  readonly numericIndex: number;     // Integer index in SM state table
}
```

### 2.3 Updated `XBSemanticMapping` & `XBSemanticModel`
```ts
export interface XBSemanticMapping {
  readonly sourceVariableId: string;         // Diagnostics and provenance ONLY
  readonly variable: SemanticVariableSymbol; // Pre-resolved symbol (replaces raw smVarId for C generation)
  readonly blockId: string;
  readonly portId: string;
  readonly direction: 'in' | 'out';
  readonly signalId: string;
  readonly numericType: XBNumericType;
}

export interface XBSemanticModel {
  readonly stateId: string;
  readonly ownerState: XBOwnerState;         // Pre-resolved owner state context
  readonly executionOrder: readonly string[];
  readonly operations: Readonly<Record<string, XBSemanticOperation>>;
  readonly signals: Readonly<Record<string, XBSemanticSignal>>;
  readonly mappings: readonly XBSemanticMapping[];
  readonly solver: {
    readonly kind: 'euler' | 'rk4';
    readonly stepSeconds: number;
    readonly substepsPerTick: number;
  };
  readonly policy: XBStatePolicy;
}
```

---

## 3. Time Base and Step Lowering Architecture

### 3.1 Decoupled Time Conversion and Scheduler Alignment
Time unit conversions and tick-alignment policies are kept strictly separate in `src/utils/stateMachine/smTiming.ts`:

```ts
export type TimeUnit = 'seconds' | 'milliseconds' | 'ticks';

export function convertTime(
  value: number,
  fromUnit: TimeUnit,
  toUnit: TimeUnit,
  baseTickMs: number
): number {
  if (fromUnit === toUnit) return value;
  // Convert from source unit to milliseconds
  const ms = fromUnit === 'seconds' ? value * 1000 : fromUnit === 'ticks' ? value * baseTickMs : value;
  // Convert milliseconds to target unit
  if (toUnit === 'milliseconds') return ms;
  if (toUnit === 'seconds') return ms / 1000;
  if (toUnit === 'ticks') return ms / baseTickMs;
  throw new Error(`Unsupported unit conversion: ${fromUnit} to ${toUnit}`);
}

export function alignRuntimeThreshold(
  timeMs: number,
  baseTickMs: number,
  policy: 'ceil-to-tick' | 'exact' = 'ceil-to-tick'
): { requiredTicks: number; thresholdMs: number } {
  if (!Number.isFinite(timeMs) || timeMs < 0) {
    throw new Error(`Invalid time threshold: ${timeMs}`);
  }
  if (!Number.isFinite(baseTickMs) || baseTickMs <= 0) {
    throw new Error(`Invalid base tick: ${baseTickMs}`);
  }

  if (policy === 'ceil-to-tick') {
    const requiredTicks = Math.ceil(timeMs / baseTickMs);
    return {
      requiredTicks,
      thresholdMs: requiredTicks * baseTickMs,
    };
  }

  return {
    requiredTicks: Math.ceil(timeMs / baseTickMs),
    thresholdMs: timeMs,
  };
}
```

### 3.2 Step Block Semantic Representation
Step blocks are lowered during `xbSemanticBuilder.ts` into a pre-aligned semantic operation:

```ts
export interface XBStepOperationParameters {
  readonly initialValue: number;
  readonly finalValue: number;
  readonly threshold: {
    readonly milliseconds: number;
    readonly alignment: 'ceil-to-tick' | 'exact';
  };
  readonly timerSource: {
    readonly kind: 'stateElapsedTime';
    readonly stateId: string;
    readonly stateIndexSymbol: string;
  };
}
```

The C renderer in `xbCGenerator.ts` receives this pre-lowered operation and emits pure C:

```c
const double xb6_step_value =
    (instance->state_timers[SM_ST__1FC92E02_C821_43E6_9B89_2F938DB7945D_IDX] < 300U)
        ? 0.0
        : 5.0;
```

---

## 4. Verification & Validation Pipeline

The full verification flow operates in a strict 9-step sequence:

```text
1. Build SM variable/state symbol tables
        ↓
2. Build XBridge semantic graph
        ↓
3. Resolve mappings + owner state (fail with XB_MAPPING_VARIABLE_NOT_FOUND if unresolved)
        ↓
4. Lower time-dependent blocks (Step, Delay, Pulse, Timers)
        ↓
5. Run semantic integrity validation (GEN-SEM-001..003)
        ↓
6. Render C code (pure string translation of resolved symbols)
        ↓
7. Run generated-symbol consistency validation (usedDataMembers ⊆ declaredDataMembers)
        ↓
8. Run gcc/clang syntax compilation check (-std=c11 -Wall -Wextra -fsyntax-only)
        ↓
9. Run behavioral / golden test suites
```

---

## 5. Implementation Sequence

1. **Symbol Tables (`smSemanticBuilder.ts`)**: Construct authoritative lookup maps `Map<string, SemanticVariableSymbol>` and `Map<string, XBOwnerState>` during SM building.
2. **XBridge Model Signature Update**: Update `buildXBSemanticModel()` signature to take pre-resolved variable symbols and `XBOwnerState`.
3. **Resolved Mappings**: Update `XBSemanticMapping` construction to attach `sourceVariableId` (for diagnostics) and `variable: SemanticVariableSymbol` (for C generation). Fail semantic building if `smVarId` cannot be resolved.
4. **C Generator Consumption (`xbCGenerator.ts`)**: Replace all sanitized mapping accesses (`instance->data.${sanitize(mapping.smVarId)}`) with `instance->data.${mapping.variable.cIdentifier}` across Outport, Inport, and solver writes.
5. **Owner State Resolution**: Store `XBOwnerState` in `XBSemanticModel` and replace hardcoded `state_timers[0U]` with `instance->state_timers[ownerState.cIndexSymbol]`.
6. **Time Base & Alignment Utilities (`smTiming.ts`)**: Add `convertTime()` and `alignRuntimeThreshold()`.
7. **Step Pre-Lowering**: Lower Step parameters (`step_time`, `initial_value`, `final_value`) into pre-aligned threshold milliseconds and timer references in `xbSemanticBuilder.ts`.
8. **Semantic Validation Assertions (`smSemanticValidator.ts` & `xbSemanticValidator.ts`)**: Add rules rejecting unresolved variable mappings, missing owner states, or untyped time units.
9. **Generated Symbol Consistency Checker (`smCGenerator.ts`)**: Implement post-render AST/regex check asserting every `instance->data.<member>` exists in `SM_Data_t`.
10. **Host Compiler Verification Gate**: Add GCC syntax compiler execution (`gcc -std=c11 -Wall -Wextra -fsyntax-only`) to generator test harness / pipeline.
11. **Regression & Comprehensive Tests**: Update existing `xbCGenerator.test.ts` test cases and add dedicated unit/integration tests for Step parameter preservation, UUID mappings, readable ID mappings, non-zero owner states, and missing mappings.

---

## 6. Acceptance Criteria

- **AC-1**: Step block parameters (`step_time = 0.3s`, `initial = 0`, `final = 5`) produce exact `300U` millisecond comparisons using `instance->state_timers[SM_ST_..._IDX]`.
- **AC-2**: No XBridge time-dependent operation SHALL emit a literal `state_timers[0U]` reference. All state timer accesses SHALL use the resolved owning-state `cIndexSymbol`.
- **AC-3**: Variable mappings referencing readable IDs (e.g., `xb6-step-output-0001`) or UUIDs (e.g., `cc53310b-344b-4df9-84f3-6068138c22aa`) resolve to valid `SM_Data_t` C identifiers (e.g., `xb6_step_output`). Sanitized model IDs never appear in generated C.
- **AC-4**: Generated-symbol consistency check guarantees `usedDataMembers ⊆ declaredDataMembers`. Undeclared field access triggers explicit diagnostic `GEN_C_UNDECLARED_DATA_MEMBER`.
- **AC-5**: Generated C artifacts compile cleanly with `gcc -std=c11 -Wall -Wextra -fsyntax-only` (correctness gate) and `-Werror` (CI quality gate).
- **AC-6**: Missing mappings or missing owner state context fail semantic validation before C rendering.
