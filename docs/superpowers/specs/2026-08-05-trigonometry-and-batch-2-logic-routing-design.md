# Design Spec: Trigonometry Reclassification & Batch 2 (Logic & Routing) Dual Conformance

**Date:** 2026-08-05  
**Status:** Approved by User  
**Target Subsystems:** `xbCapabilities`, `xbSemanticValidator`, `xbInterpreter`, `xbCGenerator`, Unit Tests (`Vitest`)

---

## 1. Goal & Context

1. **Trigonometry Reclassification:**  
   Currently, Trigonometry blocks (`SIN`, `COS`, `TAN`, `COT`, etc.) trigger the error:
   `"The canonical interpreter and generated-C paths do not yet have paired executable conformance coverage."`
   We need to update their capability reason in [xbCapabilities.ts](file:///g:/adia%20project/src/utils/stateMachine/xbCapabilities.ts) to explicitly state:  
   `"Simulation supported / Generated-C conformance missing"`  
   so the live semantic validator clearly reflects that simulation is supported while paired generated-C conformance coverage is missing.

2. **Batch 2 Dual Executable Conformance (Logic & Routing):**  
   Promote 12 Logic & Routing blocks from `UNPAIRED_EMBEDDED_OPERATIONS` to full code-generation capability (`codegen: true`) with paired conformance coverage between the canonical interpreter and C generator:
   - **Logic & Bitwise:** `NAND`, `NOR`, `XOR`, `BitwiseAND`, `BitwiseOR`, `BitwiseXOR`, `BitwiseNOT`, `ShiftLeft`, `ShiftRight`
   - **Signal Routing:** `SWITCH`, `MUX`, `DEMUX`

---

## 2. Detailed Component Architecture & Changes

### 2.1 Capability Classification & Manifests (`src/utils/stateMachine/xbCapabilities.ts`)

- **Trigonometry Group:**
  Define `TRIGONOMETRY_UNPAIRED_OPERATIONS` for all 24 trig block types (`SIN`, `COS`, `TAN`, `COT`, `SEC`, `COSEC`, `ASIN`, `ACOS`, `ATAN`, `ACOT`, `ASEC`, `ACOSEC`, `SINH`, `COSH`, `TANH`, `COTH`, `SECH`, `COSECH`, `ASINH`, `ACOSH`, `ATANH`, `ACOTH`, `ASECH`, `ACOSECH`).
  Reason: `'Simulation supported / Generated-C conformance missing'`.

- **Batch 2 Conformance Case IDs:**
  Add to `XB_INTERPRETER_CONFORMANCE_CASE_IDS` & `XB_C_CONFORMANCE_CASE_IDS`:
  - `'T10-INT-LOGIC-BITWISE'` & `'T10-C99-LOGIC-BITWISE'`
  - `'T10-INT-SIGNAL-ROUTING'` & `'T10-C99-SIGNAL-ROUTING'`

- **Coverage Manifests:**
  - `LOGIC_BITWISE_COVERAGE`: Scalar coverage for `NAND`, `NOR`, `XOR`, `BitwiseAND`, `BitwiseOR`, `BitwiseXOR`, `BitwiseNOT`, `ShiftLeft`, `ShiftRight`.
  - `SIGNAL_ROUTING_COVERAGE`: `allShapes` coverage for `SWITCH`, `MUX`, `DEMUX`.

- **Capabilities Map (`XB_CAPABILITIES`):**
  Remove the 12 Batch 2 block types from `UNPAIRED_EMBEDDED_OPERATIONS` and declare them with `codegen: true`, referencing their respective interpreter and C99 conformance case IDs.

---

### 2.2 Canonical Interpreter (`src/utils/stateMachine/xbInterpreter.ts`)

Implement `evaluateDirectOperation` cases for:
- `NAND`: Negation of logical AND over all input signals.
- `NOR`: Negation of logical OR over all input signals.
- `XOR`: Odd parity check across input signals.
- `BitwiseAND`: Bitwise AND (`&`) across inputs cast to 32-bit integers.
- `BitwiseOR`: Bitwise OR (`|`) across inputs cast to 32-bit integers.
- `BitwiseXOR`: Bitwise XOR (`^`) across inputs cast to 32-bit integers.
- `BitwiseNOT`: Bitwise NOT (`~`) on input 0 cast to 32-bit integer.
- `ShiftLeft`: Left shift (`<<`) of input 0 by input 1 shift amount.
- `ShiftRight`: Right shift (`>>`) of input 0 by input 1 shift amount.
- `SWITCH`: Evaluates condition input port against threshold (default > 0 or boolean true) to select between input 1 (pass) and input 2 (fail). Supports scalar, vector, and matrix shapes.
- `MUX`: Combines multiple input signals into a single output signal array.
- `DEMUX`: Splits a single input signal array across multiple output ports.

---

### 2.3 C Code Generator (`src/utils/stateMachine/xbCGenerator.ts`)

Implement C generation logic for Batch 2 block types:
- Generate C expressions / statements for `NAND`, `NOR`, `XOR`, `BitwiseAND`, `BitwiseOR`, `BitwiseXOR`, `BitwiseNOT`, `ShiftLeft`, `ShiftRight`.
- Generate C ternary expressions or conditional blocks for `SWITCH`.
- Generate array copy/assignment loops or index mappings for `MUX` and `DEMUX`.

---

## 3. Verification & Testing Strategy

1. **`xbCapabilities.test.ts`**:
   - Verify Trigonometry blocks return `codegen: false` with the exact reason `'Simulation supported / Generated-C conformance missing'`.
   - Verify every Batch 2 block (`NAND`, `NOR`, `XOR`, `SWITCH`, `MUX`, `DEMUX`, etc.) returns `codegen: true` and links to valid conformance cases in `XB_INTERPRETER_CONFORMANCE_CASE_IDS` and `XB_C_CONFORMANCE_CASE_IDS`.

2. **`xbInterpreter.test.ts`**:
   - Unit test execution of `NAND`, `NOR`, `XOR`, Bitwise operations, `ShiftLeft`, `ShiftRight`, `SWITCH`, `MUX`, and `DEMUX`.

3. **`xbCGenerator.test.ts`**:
   - Add C generation tests verifying that generated C code for Batch 2 blocks compiles and executes identically to the canonical interpreter.

4. **`xbSemanticValidator.test.ts`**:
   - Verify semantic diagnostics report the updated Trigonometry message and pass Batch 2 blocks clean.

---

## 4. Execution Workflow

- Step 1: Update `xbCapabilities.ts` (Trigonometry reason & Batch 2 capability declarations).
- Step 2: Implement interpreter logic in `xbInterpreter.ts`.
- Step 3: Implement C generator logic in `xbCGenerator.ts`.
- Step 4: Add Vitest tests across `xbCapabilities.test.ts`, `xbInterpreter.test.ts`, `xbCGenerator.test.ts`, and `xbSemanticValidator.test.ts`.
- Step 5: Run `npx vitest` to verify 100% pass across all test suites.
