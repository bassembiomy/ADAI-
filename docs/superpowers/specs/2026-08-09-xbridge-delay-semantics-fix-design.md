# XBridge DELAY State and Scheduling Semantics Fix – Design Specification

## Overview

This specification details the structural and semantic changes required in the XBridge code generation pipeline to support multi-sample `DELAY(N)` operations.

Currently, `DELAY` operations are lowered identically to single-state `UNIT_DELAY` operations. This fix establishes:
1. Strict parameter parsing and semantic validation for delay length $N$, initial condition $IC$, and discrete sample time $T_s$.
2. State representation using a static circular history buffer `buffer[N * M]` and buffer index pointer `index` (with $N=1$ unit delay optimization).
3. Discrete sampling schedule separation so solver substeps do not advance delay history prematurely.
4. Conformance in both the TypeScript interpreter (`xbInterpreter.ts`) and C code generator (`xbCGenerator.ts`).

## Architecture & Data Flow

```
Model DELAY parameters (delay_length N, IC, sample_time Ts)
         │
         ▼
Semantic Builder & Validation (xbSemanticBuilder.ts & xbSemanticValidator.ts)
   ├── Validate N >= 1, integer, within static limit
   ├── Resolve discrete schedule (periodSubsteps)
   └── Create State Boundary:
         ├── slot 'buffer': shape [N * M], initialValues = [IC, ..., IC]
         └── slot 'index': shape scalar uint32, initialValues = [0] (if N > 1)
         │
         ▼
Target Runtime Lowering & Execution
   ├── TypeScript Interpreter (xbInterpreter.ts)
   │     ├── Read: output = buffer[index * M ... index * M + M - 1]
   │     └── Update (on sample tick): buffer[index * M ...] = input; index = (index + 1) % N
   └── Static C Code Generation (xbCGenerator.ts)
         ├── State struct declarations:
         │     float state_XB8_Delay_buffer[N * M];
         │     uint32_t state_XB8_Delay_index;
         ├── State Init: fill buffer with IC, index = 0
         ├── Output Read: instance->member.signal = instance->member.state_buffer[index]
         └── State Update (inside discrete schedule gate):
               instance->member.state_buffer[index] = input;
               instance->member.state_index = (instance->member.state_index + 1U) % N;
```

## Detailed Requirements Mapping

### 1. IR Model & Data Structures (`xbSemanticModel.ts`)

Define `XBDelayParameters`:
```ts
export interface XBDelayParameters {
  readonly delayLength: number;
  readonly initialCondition: number;
  readonly samplePeriod: number;
  readonly isUnitDelay: boolean;
}
```

Add `delayParameters?: XBDelayParameters` to `XBSemanticOperation`.

### 2. Semantic Validation & Building (`xbSemanticBuilder.ts` & `xbSemanticValidator.ts`)

- Extract `delay_length` / `delayLength` / `N` from node parameters.
- If missing, non-numeric, non-integral, $\le 0$, or $> 65536$:
  - Emit appropriate diagnostic: `XB_DELAY_LENGTH_MISSING`, `XB_DELAY_LENGTH_INVALID`, `XB_DELAY_LENGTH_OUT_OF_RANGE`, or `XB_DELAY_STORAGE_LIMIT_EXCEEDED`.
- Extract `initialCondition` / `initial_condition` / `ic` (defaulting to 0 if absent).
- Construct `XBSemanticStateBoundary`:
  - `role: 'buffer'`: size `N * M` (where $M$ is signal `elementCount`), initialized to `IC`.
  - `role: 'index'`: scalar `uint32_t`, initialized to `0` (omitted if $N == 1$).
- Sample scheduling (`scheduleForNode`):
  - Mark `hold: 'zero-order'` for discrete stateful execution.
  - Compute `periodSubsteps` relative to continuous solver step.

### 3. Interpreter (`xbInterpreter.ts`)

- During output evaluation (`read-before-update`):
  - Output signal is set to `buffer[index * M ... index * M + M - 1]`.
- During state update (`after-direct-feedthrough`):
  - Only execute when discrete sample tick triggers.
  - Set `buffer[index * M ... index * M + M - 1] = input`.
  - Increment `index = (index + 1) % N`.

### 4. C Code Generator (`xbCGenerator.ts`)

- Struct field layout:
  - Generate array field for `buffer` slot (`float state_XB8_Delay_buffer[N * M];`).
  - Generate `uint32_t state_XB8_Delay_index;` for `index` slot (if $N > 1$).
- State Initialization:
  - Loop or static assignment setting all $N \times M$ elements of `buffer` to `IC`, and `index = 0`.
- Output Evaluation:
  - `output = buffer[index * M + m]`.
- State Update:
  - Gated by `if (instance->member.schedule_delay == 0) { ... }`.
  - Perform circular update:
    ```c
    for (uint32_t m = 0; m < M; m++) {
        instance->member.state_delay_buffer[instance->member.state_delay_index * M + m] = input[m];
    }
    instance->member.state_delay_index = (instance->member.state_delay_index + 1U) % N;
    ```

## Testing & Verification Plan

### Automated Test Cases

1. **GEN-XB-DELAY-TEST-001 (Two-Sample Constant Input)**:
   - Config: $N=2$, $IC=-1$, $input=7$.
   - Verified sequence: `-1, -1, 7, 7, 7, ...`
2. **GEN-XB-DELAY-TEST-002 (Variable Input History)**:
   - Config: $N=2$, inputs: `[10, 20, 30, 40]`, $IC=-1$.
   - Verified sequence: `[-1, -1, 10, 20, ...]`
3. **GEN-XB-DELAY-TEST-003 (One-Sample Unit Delay Optimization)**:
   - Config: $N=1$. Confirm single-state optimization produces identical sequence.
4. **GEN-XB-DELAY-TEST-004 (Multiple Delay Lengths)**:
   - Test $N=1, 2, 3, 5$.
5. **GEN-XB-DELAY-TEST-005 (Initial Conditions)**:
   - Verify zero, positive, negative, and floating point initial conditions.
6. **GEN-XB-DELAY-TEST-006 & 007 (Solver Substep Independence)**:
   - Discrete sample period = 100 ms, continuous solver step = 10 ms (10 substeps per tick).
   - Confirm delay state advances exactly once per 100 ms tick, NOT 10 times. Changing solver step to 5 ms leaves output sequence at 100 ms intervals unchanged.
