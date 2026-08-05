# Design Spec: Batch 3 (Trigonometry Lane) Dual Conformance

**Date:** 2026-08-05  
**Status:** Approved by User  
**Target Subsystems:** `xbCapabilities`, `xbInterpreter`, `xbCGenerator`, `Vitest` Test Suites

---

## 1. Goal & Requirements

Promote all 24 Trigonometry blocks from unpaired simulation status to full dual executable conformance (`codegen: true`):

- **Direct Circular:** `SIN`, `COS`, `TAN`
- **Reciprocal Circular:** `COT`, `SEC`, `COSEC`
- **Inverse Circular:** `ASIN`, `ACOS`, `ATAN`, `ACOT`, `ASEC`, `ACOSEC`
- **Hyperbolic:** `SINH`, `COSH`, `TANH`, `COTH`, `SECH`, `COSECH`
- **Inverse Hyperbolic:** `ASINH`, `ACOSH`, `ATANH`, `ACOTH`, `ASECH`, `ACOSECH`

---

## 2. Capability Manifest & Target Requirements (`xbCapabilities.ts`)

- **Remove from Unpaired:** Remove all 24 trig block types from `TRIGONOMETRY_UNPAIRED_OPERATIONS`.
- **Conformance Case IDs:**  
  Add `'T10-INT-TRIGONOMETRY'` and `'T10-C99-TRIGONOMETRY'` to `XB_INTERPRETER_CONFORMANCE_CASE_IDS` and `XB_C_CONFORMANCE_CASE_IDS`.
- **Coverage Manifest:**  
  Add `TRIGONOMETRY_COVERAGE` containing scalar coverage for all 24 trig operations to `XB_INTERPRETER_CONFORMANCE_CASES` and `XB_C_CONFORMANCE_CASES`.
- **Block Capability Declarations:**  
  Declare all 24 trig operations with:
  `direct(scalar, ['math-library'], ['T10-INT-TRIGONOMETRY'], ['T10-C99-TRIGONOMETRY'])`

---

## 3. Canonical Interpreter Implementation (`xbInterpreter.ts`)

Implement `evaluateDirectOperation` cases for:
- Circular: `SIN` (`Math.sin`), `COS` (`Math.cos`), `TAN` (`Math.tan`)
- Reciprocal Circular: `COT` (`1 / Math.tan`), `SEC` (`1 / Math.cos`), `COSEC` (`1 / Math.sin`)
- Inverse Circular: `ASIN` (`Math.asin`), `ACOS` (`Math.acos`), `ATAN` (`Math.atan`), `ACOT` (`Math.atan(1 / x)` or `Math.PI/2 - Math.atan(x)`), `ASEC` (`Math.acos(1 / x)`), `ACOSEC` (`Math.asin(1 / x)`)
- Hyperbolic: `SINH` (`Math.sinh`), `COSH` (`Math.cosh`), `TANH` (`Math.tanh`), `COTH` (`1 / Math.tanh`), `SECH` (`1 / Math.cosh`), `COSECH` (`1 / Math.sinh`)
- Inverse Hyperbolic: `ASINH` (`Math.asinh`), `ACOSH` (`Math.acosh`), `ATANH` (`Math.atanh`), `ACOTH` (`Math.atanh(1 / x)`), `ASECH` (`Math.acosh(1 / x)`), `ACOSECH` (`Math.asinh(1 / x)`)

---

## 4. C Code Generator (`xbCGenerator.ts`)

- Add C emitters using C standard library `<math.h>` functions (`sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `sinh`, `cosh`, `tanh`, `asinh`, `acosh`, `atanh`).
- Implement reciprocal C expressions for `COT`, `SEC`, `COSEC`, `COTH`, `SECH`, `COSECH`, `ACOT`, `ASEC`, `ACOSEC`, `ACOTH`, `ASECH`, `ACOSECH`.
- Register all 24 emitters in `OPERATION_EMITTERS`.

---

## 5. Verification & Testing Scenarios

1. **Scenario 1 (Capabilities & Conformance):**  
   `xbCapabilities.test.ts` verifies that all 24 trig blocks return `codegen: true`, require `'math-library'`, and link to `'T10-INT-TRIGONOMETRY'` and `'T10-C99-TRIGONOMETRY'`.

2. **Scenario 2 (Interpreter Numerical Precision):**  
   `xbInterpreter.test.ts` evaluates reference angles ($\sin(0)=0$, $\sin(\pi/6)=0.5$, $\cos(\pi/3)=0.5$, $\tan(\pi/4)=1$, $\arcsin(1)=\pi/2$, $\arctan(1)=\pi/4$) and hyperbolic functions.

3. **Scenario 3 (C Code Generator & Parity):**  
   `xbCGenerator.test.ts` compiles C output with `gcc -std=c99 -lm` and verifies exact output equivalence with the canonical interpreter.
