# X-Bridges Design Specification: SATURATION, DEADZONE, and RATE_LIMITER Blocks

## Overview

This specification details the implementation of three Simulink-compatible nonlinear blocks for the X-Bridges simulation engine, semantic IR, reference TypeScript interpreter, state manager, validation layer, and C99 code generator:

1. **SATURATION**: Limits input signals to lower and upper numerical bounds.
2. **DEADZONE**: Output is zero within a dead zone interval and shifted linearly outside it.
3. **RATE_LIMITER**: Limits the slew rate (rate of change) of output signals across discrete time steps.

---

## Key Architectural Principles

All legacy parameter compatibility mapping, parameter broadcasting, sample-time resolution, and constraint validation occur **upstream in the semantic normalization layer** (`xbSemanticBuilder.ts` and `xbShapeResolver.ts`). The reference TypeScript interpreter and Embedded C99 generator consume the exact same normalized `XBSemanticOperation` representation to guarantee zero divergence.

---

## Detailed Component Specifications

### 1. Block Definitions & UI Metadata (`src/engine/xbridges/BlockDefinitions.ts`)
- **SATURATION**:
  - `lowerLimit` (default `-1`), `upperLimit` (default `1`).
  - Supports backward compatibility mapping from legacy `lower` / `upper` parameters.
- **DEADZONE**:
  - `lowerLimit` (default `-0.5`), `upperLimit` (default `0.5`).
  - Supports backward compatibility mapping from legacy `start` / `end` parameters.
- **RATE_LIMITER**:
  - `risingSlewRate` (default `1`, constraint `>= 0`).
  - `fallingSlewRate` (default `-1`, constraint `<= 0`).
  - `initialCondition` (default `0`).
  - `sampleTime` (default `'inherited'`, resolved to discrete `dt > 0`).
  - Persistent state `previousOutput` initialized to `initialCondition`.
  - Supports backward compatibility mapping from legacy `risingLimit` / `fallingLimit` parameters.

### 2. Semantic IR & Upstream Normalization (`src/utils/stateMachine/xbSemanticModel.ts`, `xbSemanticBuilder.ts`)
- **Single-Pass Parameter Normalization**:
  - Legacy parameter fallback mapping occurs strictly during semantic IR building.
  - Scalar-to-vector parameter broadcasting (e.g., expanding scalar `lowerLimit` to match vector input shape) occurs during semantic normalization.
  - Parameter vectors use standard X-Bridges vector parameter serialization formats.
- **State Allocation**:
  - `SATURATION` & `DEADZONE`: Stateless operations (`directFeedthrough: true`, `stateful: false`).
  - `RATE_LIMITER`: Stateful operation (`directFeedthrough: true`, `stateful: true`).
    - Allocated persistent state slot: `previousOutput` in `XBSemanticStateBoundary`.
    - State width is defined as matching the resolved output shape (equal to input shape).
    - `outputPhase`: `'read-before-update'`; `updatePhase`: `'after-direct-feedthrough'`.

### 3. Semantic Validation & Diagnostics (`src/utils/stateMachine/xbSemanticValidator.ts`)
Validates:
- `lowerLimit <= upperLimit` for SATURATION and DEADZONE.
- `risingSlewRate >= 0`, `fallingSlewRate <= 0`.
- `sampleTime > 0` resolved block sample time (must not fall back to global solver step size).
- Parameters are finite numbers (rejects NaN or Infinity limits/rates/initial conditions).
- Parameter vector lengths match input signal element count or are scalar (broadcast).
- Actionable diagnostic reporting containing block ID, parameter name, received value, and failed constraint.

### 4. Shape & Type Propagation (`src/utils/stateMachine/xbShapeResolver.ts`)
- `outputShape = inputShape` for all three blocks.
- Broadcast scalar parameters to vector inputs during shape resolution.
- Require fixed-size parameter vector width to match input width exactly.
- `RATE_LIMITER` state shape matches resolved output shape.

### 5. TypeScript Reference Interpreter (`src/utils/stateMachine/xbInterpreter.ts`)
- **SATURATION**: Elementwise clamp with NaN passthrough (`isnan(u) -> NaN`). Clamps `+Inf -> upperLimit` and `-Inf -> lowerLimit`.
- **DEADZONE**: Explicit `isnan(u)` check first (`isnan(u) -> NaN`). `+Inf -> +Inf`, `-Inf -> -Inf`. Shifted output outside interval (`u > upperLimit ? u - upperLimit : u < lowerLimit ? u - lowerLimit : 0`).
- **RATE_LIMITER**:
  - Uses resolved block `sampleTime`.
  - `delta = u - previousOutput`
  - `maxIncrease = risingSlewRate * sampleTime`
  - `maxDecrease = fallingSlewRate * sampleTime`
  - Special Infinity Handling:
    - `+Infinity` input rises by `risingSlewRate * sampleTime` from prior state (`y = previousOutput + maxIncrease`).
    - `-Infinity` input falls by `fallingSlewRate * sampleTime` from prior state (`y = previousOutput + maxDecrease`).
  - Two-Phase State Lifecycle:
    - Output calculation phase reads only committed `previousOutput` state and returns `y` and `nextPreviousOutput`. State is NEVER updated during output evaluation.
    - State update phase commits `previousOutput = nextPreviousOutput` exactly once per sample hit. State does not advance on non-sample hits.
  - Stored NaN state propagates until reset.
  - Model reset / initialization restores state to `initialCondition`.

### 6. Embedded C99 Code Generator (`src/utils/stateMachine/xbCGenerator.ts`)
- Emits precision-aware C99 code distinguishing `float` (`float32`, `isnanf`, `f` suffixes) and `double` (`float64`, `isnan`, standard literals).
- Emits typed expressions and loops for vector signals with zero dynamic allocation.
- State fields placed in model persistent state struct (`XBridges_DW`).
- State fields and temporary variables use sanitized unique block IDs to prevent symbol collisions between instances.
- Separates step calculation (`y = ...`) from state commit phase (`state->block_previousOutput = block_nextPreviousOutput`).
- Initialization function assigns `initialCondition` to state array/scalar.

### 7. Capabilities & Conformance Tests (`src/utils/stateMachine/xbCapabilities.ts`, `xbCConformanceCases.ts`, `xbInterpreter.test.ts`, `xbCGenerator.test.ts`)
- Comprehensive unit tests and paired TS/C conformance test cases covering scalar, vector, boundary, special floating-point (NaN, Inf), sample time, multi-instance isolation, state reset, and invalid configuration diagnostics.
- `xbCapabilities.ts` updates capability status to `PAIRED_CONFORMANT` for each block only after all paired interpreter/C tests pass.

---

## Acceptance Criteria

The implementation is complete when:

1. **SATURATION**, **DEADZONE**, and **RATE_LIMITER** can be created, configured, serialized, loaded, simulated, and code-generated.

2. Scalar and fixed-size vector signals are supported with correct scalar parameter broadcasting.

3. Invalid bounds, slew rates, sample times, parameter widths, NaN parameters, and infinite parameters produce actionable semantic diagnostics.

4. **RATE_LIMITER**:
   - Initializes `previousOutput` from `initialCondition`.
   - Reads committed state during output calculation.
   - Commits next state only during the update phase.
   - Updates exactly once per sample hit.
   - Does not update on non-sample-hit calls.
   - Maintains independent state for every block instance.
   - Restores initial state during model reset and initialization.

5. **Generated C99**:
   - Contains no unsupported-operation placeholders.
   - Uses no heap allocation or variable-length arrays.
   - Generates unique block-specific state and temporary symbols.
   - Compiles without errors or new warnings.
   - Preserves float32 and float64 types correctly (`isnanf` vs `isnan`, `float` vs `double`).

6. **Paired TypeScript/C conformance tests pass for**:
   - Scalar signals.
   - Vector signals.
   - Boundary values.
   - NaN and Infinity inputs.
   - Multiple sequential RATE_LIMITER steps.
   - Reset behavior.
   - Multiple RATE_LIMITER instances.
   - Nonunit sample times.

7. Existing interpreter, semantic-model, and C-generation regression tests remain passing.

8. `xbCapabilities.ts` marks each operation as `PAIRED_CONFORMANT` only after its complete paired test suite passes.
