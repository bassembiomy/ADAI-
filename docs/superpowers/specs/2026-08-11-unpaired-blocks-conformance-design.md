# Design Specification: X-Bridges Paired Conformance for VectorPow, SumElements, Mean, Max, and IdentityMatrix

**Date:** 2026-08-11  
**Status:** Approved for Implementation  
**Topic:** Embedded C99 and TypeScript Reference Conformance for 5 X-Bridges Operations (`VectorPow`, `SumElements`, `Mean`, `Max`, `IdentityMatrix`)

---

## 1. Overview & Goals

This specification defines the complete execution semantics, C99 code generation, TypeScript reference interpreter implementation, semantic validation rules, and paired conformance testing suite for five X-Bridges operations:
1. `VectorPow`: Element-wise power operation.
2. `SumElements`: Matrix/vector scalar summation reduction.
3. `Mean`: Matrix/vector scalar mean reduction.
4. `Max`: Matrix/vector scalar maximum element reduction.
5. `IdentityMatrix`: $N \times N$ identity matrix generator.

The goal is to transition these operations from `UNPAIRED_EMBEDDED_OPERATIONS` to fully supported, executable, paired C99 and TypeScript reference conformance cases in `xbCapabilities.ts`.

---

## 2. Detailed Technical Requirements & Edge-Case Semantics

### 2.1 `VectorPow`
- **Input Selection & Parameter Fallback**:
  - Unconnected Port 2: Falls back to `operation.parameters.exponent` or `operation.parameters.power` (default `1.0`).
  - Connected Port 2: Consumes input signal 2. If Port 2 is connected but produces an empty or invalid signal, a **semantic validation error** is raised (does NOT silently fall back to parameter).
- **Broadcasting & Shape Policy (`vectorPowBroadcastShapes`)**:
  - Supported input shape combinations:
    1. Scalar base ($1$), Scalar exponent ($1$) $\to$ Scalar output ($1$).
    2. Vector base ($N$), Scalar exponent ($1$) $\to$ Vector output ($N$).
    3. Scalar base ($1$), Vector exponent ($N$) $\to$ Vector output ($N$).
    4. Equal-dimension Vector base ($N$) & Vector exponent ($N$) $\to$ Vector output ($N$).
    5. Matrix base ($R \times C$), Scalar exponent ($1$) $\to$ Matrix output ($R \times C$).
  - Incompatible shapes (e.g. vector of length 3 with vector of length 5) MUST be rejected during semantic validation (`xbSemanticValidator.ts`).
- **Numeric Type & C Generator Functions**:
  - Uses `<math.h>` header.
  - Generates `powf(base, exp)` when signal datatype is single-precision `float`.
  - Generates `pow(base, exp)` when signal datatype is double-precision `double`.
  - Capability registration requires `requiredTargetCapabilities: ['math-library']`.
- **Domain & Special Floating-Point Values**:
  - **Negative Base with Fractional Exponent**: Evaluates to `NaN` in TS and C.
  - **Zero Base with Negative Exponent**:
    - `+0` raised to negative exponent $\to +\infty$.
    - `-0` raised to negative odd integer exponent $\to -\infty$.
    - Other `-0` raised to negative exponent $\to +\infty$.
  - **NaN Propagation**: If either base or exponent is `NaN`, output element is `NaN`.

---

### 2.2 `SumElements`
- **Semantics**: Reduces a vector ($N$) or matrix ($R \times C$, $N = R \cdot C$) signal to a scalar sum: $y = \sum_{i=0}^{N-1} u[i]$.
- **Matrix Storage Order**: Flattens matrices in row-major order ($u[r \cdot C + c]$).
- **Validation**:
  - $N \ge 1$ required. Empty inputs ($N = 0$) MUST be rejected during semantic/model validation.
- **C99 Generator**:
  ```c
  float sum_val = 0.0f;
  for (uint32_t i = 0U; i < N; i++) {
    sum_val += u[i];
  }
  y = sum_val;
  ```
- **Interpreter**:
  ```ts
  const sum = inputs[0].reduce((acc, val) => acc + Number(val), 0);
  return [sum];
  ```
- **Capabilities**: Does NOT require `math-library` capability (pure loop).

---

### 2.3 `Mean`
- **Semantics**: Reduces a vector ($N$) or matrix ($R \times C$, $N = R \cdot C$) signal to a scalar arithmetic mean: $y = \frac{1}{N} \sum_{i=0}^{N-1} u[i]$.
- **Validation**:
  - $N \ge 1$ required. $N = 0$ is rejected during model validation.
- **Precision Matching**: Accumulation type follows signal datatype (`float` for `float` signals, `double` for `double` signals).
- **C99 Generator**:
  ```c
  float sum_val = 0.0f;
  for (uint32_t i = 0U; i < N; i++) {
    sum_val += u[i];
  }
  y = sum_val / (float)N;
  ```
- **Interpreter**:
  ```ts
  const sum = inputs[0].reduce((acc, val) => acc + Number(val), 0);
  return [sum / inputs[0].length];
  ```
- **Capabilities**: Does NOT require `math-library`.

---

### 2.4 `Max`
- **Semantics**: Reduces a vector ($N$) or matrix ($R \times C$, $N = R \cdot C$) signal to the maximum scalar element value.
- **Loop, Signed Zero (`+0` vs `-0`), and NaN Semantics**:
  - Avoids `Math.max(...values)` in TS to prevent call-stack overflow on large vectors.
  - **NaN Propagation**: If any element is `NaN`, result is `NaN`.
  - **Signed Zero**: `+0` is strictly preferred over `-0`.
- **Interpreter**:
  ```ts
  const values = inputs[0];
  let maxValue = Number(values[0]);
  for (let i = 1; i < values.length; i += 1) {
    const value = Number(values[i]);
    if (
      Number.isNaN(value) ||
      value > maxValue ||
      (value === 0 && maxValue === 0 && Object.is(value, +0) && Object.is(maxValue, -0))
    ) {
      maxValue = value;
    }
  }
  return [maxValue];
  ```
- **C99 Generator**:
  Includes `<math.h>` for `isnan()` and `signbit()` macros:
  ```c
  float max_val = u[0];
  for (uint32_t i = 1U; i < N; ++i) {
    const float value = u[i];
    if (
      isnan(value) ||
      value > max_val ||
      (value == 0.0f && max_val == 0.0f && !signbit(value) && signbit(max_val))
    ) {
      max_val = value;
    }
  }
  y = max_val;
  ```
- **Capabilities**: Uses standard C macros `isnan`/`signbit` from `<math.h>`, does NOT require `math-library` link capability.

---

### 2.5 `IdentityMatrix`
- **Semantics**: Generates a static $N \times N$ identity matrix output ($I_N$), where $I[r, c] = 1$ if $r = c$ else $0$.
- **Shape Policy (`squareMatrixOutput`)**:
  - Output shape MUST be a square matrix ($N \times N$, $N \ge 1$, up to static limit 8).
  - Invalid dimensions ($N \le 0$, non-integer, non-square output shape, oversized $N > 8$) MUST fail during semantic validation.
- **Interpreter**: Returns flat array of $N^2$ elements in row-major order:
  ```ts
  const N = outputShape.rows;
  const result = Array.from({ length: N * N }, (_, index) =>
    Math.floor(index / N) === index % N ? 1 : 0
  );
  return result;
  ```
- **C99 Generator**:
  ```c
  for (uint32_t r = 0U; r < N; r++) {
    for (uint32_t c = 0U; c < N; c++) {
      out[r * N + c] = (r == c) ? 1.0f : 0.0f;
    }
  }
  ```
- **Capabilities**: Does NOT require `math-library`.

---

## 3. Conformance Comparator & Test Suite

### 3.1 Conformance Comparison Rules
| Result Class | Comparison Method |
| :--- | :--- |
| **Finite Values** | $\|a - b\| \le \text{absTol} + \text{relTol} \times \max(\|a\|, \|b\|)$ (Tolerances adjusted for `float` vs `double`) |
| **NaN** | Both TS and C results MUST be `NaN` |
| **Infinity** | Both TS and C results MUST be infinite with matching sign ($+\infty$ or $-\infty$) |
| **Zero (`Max` / `VectorPow`)** | Compare sign using `Object.is` in TS and `signbit()` in C |

### 3.2 Dedicated Test Cases Required
1. **`Max`**:
   - `Max([-0, +0])` $\to `+0$`
   - `Max([+0, -0])` $\to `+0$`
   - `Max([NaN, 1])` and `Max([1, NaN])` $\to `NaN$`
2. **`VectorPow`**:
   - `VectorPow(-0, -3)` $\to -\infty$
   - `VectorPow(-0, -2)` $\to +\infty$
   - Scalar/scalar, vector/scalar, scalar/vector, vector/vector, matrix/scalar
3. **`IdentityMatrix`**:
   - Dimensions 1, 2, 8. Rejection of zero, negative, non-square, or oversized > 8.
4. **C Compilation**:
   - Strict C99 compilation under `-std=c99 -Wall -Wextra -Werror`.
   - Zero dynamic memory allocation (pure static bounds).

---

## 4. Capability Registration Map

```ts
VectorPow: direct(
  vectorPowBroadcastShapes,
  ['math-library'],
  ['T10-INT-VECTOR-POW'],
  ['T10-C99-VECTOR-POW']
),
SumElements: direct(
  vectorOrMatrix,
  undefined,
  ['T10-INT-REDUCTIONS'],
  ['T10-C99-REDUCTIONS']
),
Mean: direct(
  vectorOrMatrix,
  undefined,
  ['T10-INT-REDUCTIONS'],
  ['T10-C99-REDUCTIONS']
),
Max: direct(
  vectorOrMatrix,
  undefined,
  ['T10-INT-REDUCTIONS'],
  ['T10-C99-REDUCTIONS']
),
IdentityMatrix: direct(
  squareMatrixOutput,
  undefined,
  ['T10-INT-IDENTITY-MATRIX'],
  ['T10-C99-IDENTITY-MATRIX']
)
```
