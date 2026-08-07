# Design Specification – Fix Step Block Code Generation (XB6)

## 1. Overview & Objective

This specification defines the architectural, application serialization, semantic validation, and C code generation enhancements required to support the **XB6 Step block** (`Step`) in the ADIA State Machine Code Generator ecosystem.

The implementation shall correctly translate JSON Step block definitions directly into C code without fallback default values, ensuring exact numeric formatting, deterministic ceiling-based time conversion, state-scoped time reference, application serializer mapping synchronization, generator-level diagnostic reporting, and comprehensive differential verification.

---

## 2. Requirements & Design Mapping

### 2.1 Parameter Parsing & Non-Defaulting (GEN-XB-STEP-001, GEN-XB-STEP-006)
- **JSON Parameters**: `step_time`, `initial_value`, `final_value`.
- **Validation Rule**: In `xbSemanticBuilder.ts`, if any of these parameters are missing, `undefined`, `null`, or non-numeric, semantic validation MUST fail and emit generator diagnostic `XB_STEP_PARAM_MISSING` or `XB_STEP_PARAM_INVALID`.
- **Zero Fallback Principle**: Default replacement values (such as `1`, `1.0`, `1000 ms`) SHALL NEVER be inserted automatically.

### 2.2 Numeric Precision & C Formatting (GEN-XB-STEP-002)
- Numbers parsed from JSON parameters shall be rendered in generated C code as exact float/double literals:
  - JSON `0` -> `0.0f` (or `0.0`)
  - JSON `5` -> `5.0f` (or `5.0`)
  - JSON `0.3` -> `0.3f` (or `0.3`)

### 2.3 Time Base & Scope Reference (GEN-XB-STEP-003)
- **Step Time Semantic Rule**:
  > The Step output shall equal `initial_value` while elapsed time `< step_time` and `final_value` when elapsed time `>= step_time`.
- **Execution Context Scope**:
  > `step_time` shall be measured from activation/initialization of that XBridges state execution context, not from global state-machine startup.
  - Upon state re-entry, the Step time counter/timer restarts from zero unless retained-state memory policy is explicitly configured.
- **Ceiling-Based Tick Conversion**:
  - When operating in discrete tick mode, threshold ticks are precomputed in the TypeScript generator using ceiling:
    ```typescript
    const thresholdTicks = Math.ceil(stepTimeSeconds / tickSeconds);
    ```
  - Examples:
    - `0.25 s / 0.1 s` -> `3 ticks` (250 ms threshold -> changes at tick 3 = 300 ms)
    - `0.30 s / 0.1 s` -> `3 ticks` (300 ms threshold -> changes at tick 3 = 300 ms)

### 2.4 Application Mapping & Outport Propagation (APP-XB-MAP-001, GEN-XB-STEP-004, GEN-XB-STEP-008)
- **Application Serializer Synchronization (`APP-XB-MAP-001`)**:
  > When an XBridges Outport is bound to a state-machine variable through `Outport.params.smVarId`, the application serializer shall create exactly one corresponding `xBridgesModel.mappings` entry:
  ```json
  {
    "smVarId": "xb6-step-output-0001",
    "blockId": "XB6-StepOut",
    "portId": "out",
    "direction": "out"
  }
  ```
  The serializer shall preserve this mapping during save, load, copy, and export operations.
- **Outport Variable Propagation Timing (`GEN-XB-STEP-004`, `GEN-XB-STEP-008`)**:
  > After execution of all upstream XBridges operations required to resolve an Outport, each mapped Outport shall propagate its resolved signal value to the corresponding `instance->data` variable.
  - For XB6, this produces:
    ```c
    instance->data.xb6_step_output = XB6_StepOut_out;
    ```
  - Immediately following execution of the state step, `instance->data.xb6_step_output` MUST equal `XB6_StepOut_out`.

### 2.5 Generator Diagnostics vs Runtime Errors (GEN-XB-STEP-005)
- Generator-time semantic diagnostics are cleanly separated from runtime `SM_Error_t` codes:
  - Generator/model errors:
    - `XB_MAPPING_NOT_FOUND` (emitted when `Outport.params.smVarId` is not present in `xBridgesModel.mappings`)
    - `XB_MAPPING_DUPLICATE` (emitted when duplicate bindings exist for the same variable)
    - `XB_STEP_PARAM_MISSING` (emitted when a required Step parameter is omitted)
    - `XB_STEP_PARAM_INVALID` (emitted when a Step parameter is non-numeric or invalid)
  - **Rule**: Semantic validation failure aborts C generation immediately; no runtime `SM_Error_t` is generated for an invalid source model.

### 2.6 Differential Execution & Behavioral Oracle (GEN-XB-STEP-007, GEN-XB-STEP-009)
- **TypeScript Reference Interpreter (`smReferenceInterpreter.ts`)**: Evaluates `Step` block using state-scoped elapsed time and exact ceiling thresholding.
- **Differential Verification Acceptance Matrix**:
  Given `step_time = 0.3s`, `initial_value = 0`, `final_value = 5`:

  | Elapsed State Time | Expected Output |
  | -----------------: | --------------: |
  |               0 ms |               0 |
  |             100 ms |               0 |
  |             200 ms |               0 |
  |             299 ms |               0 |
  |         **300 ms** |           **5** |
  |             400 ms |               5 |
  |            1000 ms |               5 |

- **Unit Test Assertion Strategy**:
  - Assert exact string literals in generated code: `expect(stepCode).toContain('0.3f'); expect(stepCode).toContain('0.0f'); expect(stepCode).toContain('5.0f');`.
  - Execute compiled C binary in host smoke harness and compare JSONL trace steps against reference interpreter trace.

---

## 3. Architecture & File Modifications

| Component | File Path | Responsibilities |
| --------- | --------- | ---------------- |
| **Application Serializer** | [smModelMigration.ts](file:///g:/adia%20project/src/utils/stateMachine/smModelMigration.ts) / Model Importer | Enforce `APP-XB-MAP-001`: Auto-populate `xBridgesModel.mappings` entry when `Outport.params.smVarId` is present. |
| **Capabilities Registry** | [xbCapabilities.ts](file:///g:/adia%20project/src/utils/stateMachine/xbCapabilities.ts) | Register `Step` capabilities and input/output port shapes. |
| **Semantic Builder** | [xbSemanticBuilder.ts](file:///g:/adia%20project/src/utils/stateMachine/xbSemanticBuilder.ts) | Validate `step_time`, `initial_value`, `final_value` presence. Validate `smVarId` against mappings emitting `XB_MAPPING_NOT_FOUND` / `XB_STEP_PARAM_MISSING`. |
| **C Generator** | [xbCGenerator.ts](file:///g:/adia%20project/src/utils/stateMachine/xbCGenerator.ts) | Render state-scoped `Step` block evaluation using ceiling threshold, formatted float literals (`0.3f`, `0.0f`, `5.0f`), and mapped Outport propagation to `instance->data.<varName>`. |
| **Reference Interpreter** | [smReferenceInterpreter.ts](file:///g:/adia%20project/src/utils/stateMachine/smReferenceInterpreter.ts) | Evaluate `Step` blocks in TypeScript reference interpreter. |
| **Host Smoke Harness & Tests** | [xbCGenerator.test.ts](file:///g:/adia%20project/src/utils/stateMachine/xbCGenerator.test.ts) | Add regression unit tests for parameter parsing, mapping errors, C code literal checking, and multi-step differential execution. |

---

## 4. Verification & Testing Strategy

1. **Semantic Diagnostic Tests**:
   - Verify `XB_STEP_PARAM_MISSING` diagnostic emitted when `step_time`, `initial_value`, or `final_value` is missing.
   - Verify `XB_MAPPING_NOT_FOUND` diagnostic emitted when `Outport.params.smVarId` is missing from `xBridgesModel.mappings`.
2. **Application Serializer Tests**:
   - Test `APP-XB-MAP-001`: Verify `smVarId` in Outport creates corresponding mapping entry.
3. **Code Generation Tests**:
   - Assert `0.3f`, `0.0f`, `5.0f` literals appear in C code.
   - Assert `instance->data.xb6_step_output = XB6_StepOut_out;` generated.
4. **Host Execution & Differential Tests**:
   - Compile generated C with `gcc -std=c99 -Wall -Wextra -Wshadow -Werror`.
   - Run host harness through steps 0 ms to 1000 ms and assert exact output matrix matching `0` at 0-299 ms and `5` at 300-1000 ms.

---

## 5. Self-Review Checklist
- [x] **Placeholder scan**: No TODOs, TBDs, or missing sections.
- [x] **Internal consistency**: Architectural details match corrections 1 through 5.
- [x] **Scope check**: Self-contained specification covering serialization, semantic validation, C code generation, and verification.
- [x] **Ambiguity check**: Exact C code statements, generator diagnostics, and acceptance matrix specified.
