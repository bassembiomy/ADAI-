# Design Specification – Fix Step Block Code Generation (XB6)

## 1. Overview & Objective

This specification defines the architectural and code generation enhancements required to support the **XB6 Step block** (`Step`) in the ADIA State Machine Code Generator.

The generator shall convert JSON Step block definitions directly into C code without fallback default values, ensuring exact numeric formatting, time-base conversion, mandatory mapping validation, and full differential verification.

---

## 2. Requirements & Design Mapping

### 2.1 Parameter Parsing & Non-Defaulting (GEN-XB-STEP-001, GEN-XB-STEP-006)
- **JSON Parameters**: `step_time`, `initial_value`, `final_value`.
- **Validation Rule**: In `xbSemanticBuilder.ts`, if any of these parameters are missing or non-numeric, semantic validation MUST fail and emit diagnostic code `XB_STEP_PARAM_MISSING` or `XB_STEP_PARAM_INVALID`.
- **Zero Fallback Principle**: Default replacement values (such as `1`, `1.0`, `1000 ms`) SHALL NEVER be inserted automatically.

### 2.2 Numeric Precision & C Formatting (GEN-XB-STEP-002)
- Numbers parsed from JSON parameters shall be rendered in generated C code as exact float/double literals:
  - JSON `0` -> `0.0f` (or `0.0`)
  - JSON `5` -> `5.0f` (or `5.0`)
  - JSON `0.3` -> `0.3f` (or `0.3`)

### 2.3 Time Base Conversion (GEN-XB-STEP-003)
- `step_time` is specified in seconds.
- Runtime C code evaluates elapsed time or tick counter:
  - If runtime uses elapsed seconds `instance->time_s`:
    ```c
    if (instance->time_s < 0.3f) {
        output = 0.0f;
    } else {
        output = 5.0f;
    }
    ```
  - If runtime uses discrete tick steps `substep_count` / `step_ticks`:
    ```c
    const uint32_t threshold_ticks = (uint32_t)(0.3f / SM_TICK_SECONDS);
    if (instance->ticks < threshold_ticks) {
        output = 0.0f;
    } else {
        output = 5.0f;
    }
    ```

### 2.4 Outport Mapping & Variable Propagation (GEN-XB-STEP-004, GEN-XB-STEP-008)
- Every `Outport` block attached to a `Step` output that specifies `smVarId` (e.g. `xb6-step-output-0001`) shall generate explicit variable assignment into the state machine instance data struct:
  ```c
  instance->data.xb6_step_output = XB6_StepOut_out;
  ```
- Propagation assertion: Immediately following the `Step` evaluation block, the mapped state machine variable `instance->data.xb6_step_output` MUST equal `XB6_StepOut_out`.

### 2.5 Mapping Consistency & Validation (GEN-XB-STEP-005)
- In `xbSemanticBuilder.ts` / `smSemanticValidator.ts`, every `Outport.params.smVarId` MUST match a valid entry inside `xBridgesModel.mappings`.
- If `smVarId` is missing from mappings or duplicated:
  - Emit error `SM_ERR_MAPPING_NOT_FOUND` or `SM_ERR_DUPLICATE_MAPPING`.
  - Abort code generation immediately.

### 2.6 Differential & Harness Verification (GEN-XB-STEP-007, GEN-XB-STEP-009)
- **TypeScript Reference Interpreter (`smReferenceInterpreter.ts`)**: Implement `Step` evaluation logic matching C execution.
- **Differential Verification Test Suite (`xbCGenerator.test.ts` & `smDifferentialEngine.test.ts`)**:
  - Test model fixture with `step_time = 0.3s`, `initial_value = 0`, `final_value = 5`.
  - Verify output timeline:
    - `0.0s`: 0
    - `0.1s`: 0
    - `0.2s`: 0
    - `0.3s`: 5
    - `0.4s`: 5
    - `1.0s`: 5
  - Differential engine compares C binary host trace JSONL against reference interpreter trace.

---

## 3. Architecture & File Modifications

| Component | File Path | Responsibilities |
| --------- | --------- | ---------------- |
| **Capabilities Registry** | [xbCapabilities.ts](file:///g:/adia%20project/src/utils/stateMachine/xbCapabilities.ts) | Verify `Step` capability definition, input/output port shapes, and C99 conformance IDs. |
| **Semantic Builder** | [xbSemanticBuilder.ts](file:///g:/adia%20project/src/utils/stateMachine/xbSemanticBuilder.ts) | Add strict parameter checks for `Step` block (`step_time`, `initial_value`, `final_value`). Validate `Outport.params.smVarId` consistency against mappings. |
| **C Generator** | [xbCGenerator.ts](file:///g:/adia%20project/src/utils/stateMachine/xbCGenerator.ts) | Render `Step` block evaluation statements and output variable assignments (`instance->data.<varName> = ...`). |
| **Reference Interpreter** | [smReferenceInterpreter.ts](file:///g:/adia%20project/src/utils/stateMachine/smReferenceInterpreter.ts) | Evaluate `Step` blocks in TypeScript reference interpreter for differential parity. |
| **Host Smoke Harness** | [smHostHarness.ts](file:///g:/adia%20project/src/utils/stateMachine/smHostHarness.ts) | Support trace serialization for `Step` block outputs. |
| **Unit & Differential Tests** | [xbCGenerator.test.ts](file:///g:/adia%20project/src/utils/stateMachine/xbCGenerator.test.ts) | Add regression test cases for parameter parsing, missing parameter diagnostics, mapping checks, and differential execution. |

---

## 4. Verification & Testing Strategy

1. **Semantic Validation Tests**:
   - Verify `XB_STEP_PARAM_MISSING` error when `step_time`, `initial_value`, or `final_value` is missing.
   - Verify `SM_ERR_MAPPING_NOT_FOUND` error when `Outport.params.smVarId` is not in mappings.
2. **Generated C Inspection Tests**:
   - Verify exact float literal strings (`0.3f`, `0.0f`, `5.0f`) appear in generated `.c` files.
   - Verify zero fallback constants (`1`, `1.0`) are absent unless in JSON model.
3. **Host Compiler & Execution Tests**:
   - Compile generated C with `gcc -std=c99 -Wall -Wextra -Wshadow -Werror`.
   - Run host binary across 10 steps (0.0s to 1.0s) and compare 11-field JSONL trace against reference interpreter.

---

## 5. Self-Review Checklist
- [x] **Placeholder scan**: No TODOs, TBDs, or missing sections.
- [x] **Internal consistency**: Architectural changes match requirement numbers (`GEN-XB-STEP-001` through `GEN-XB-STEP-009`).
- [x] **Scope check**: Self-contained focus on Step block code generation, validation, and verification.
- [x] **Ambiguity check**: Exact C code templates and error diagnostic codes specified.
