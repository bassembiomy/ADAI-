# Batch5C – Filter Blocks Conformance Design Specification

## 1. Executive Summary

This specification outlines the technical design for paired executable conformance and embedded C-code generation for canonical XBridge filter blocks:
- `LOW_PASS_FILTER`
- `HIGH_PASS_FILTER`
- `MOVING_AVERAGE`

All implementations (Canonical Interpreter, Generated-C Emitter, Capability Registry, and Paired Conformance Tests) retain these exact, case-sensitive block type names without modification to model JSON or workaround aliases.

Initial Batch5C Status:
```text
Batch5C: BLOCKED BY PROGRAM CONFORMANCE GATE
```

Only after all paired conformance tests pass, registry capability entries are updated, and negative/positive gate tests pass shall Batch5C status transition to:
```text
CONFORMANT / GENERATION ENABLED
```

---

## 2. End-to-End Execution Pipeline

```text
                XBridge Model JSON
                         │
                         ▼
             Parameter Normalization
            (Alias -> Canonical Name)
                         │
                         ▼
               Canonical Semantic IR
        (Authoritative State Layout Definition)
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
       Canonical Interpreter   Generated-C Emitter
              │                     │
              └──────────┬──────────┘
                         ▼
              Paired Executable Test
            (Sample-by-Sample Equivalence)
                         │
                  PASS / FAIL
                         │
                         ▼
              Conformance Registry
                         │
                         ▼
              Semantic Generation Gate
                         │
                  ┌──────┴──────┐
                  ▼             ▼
               ENABLED        BLOCKED
```

---

## 3. Canonical Parameter Normalization & State Layout Rules

### 3.1 Parameter Normalization
Parameter parsing maps incoming model parameter keys to canonical parameter names before Semantic IR construction:

| Block Type | Canonical Parameter | Accepted Input Aliases | Default Value |
| :--- | :--- | :--- | :--- |
| `LOW_PASS_FILTER` | `cutoff_frequency` | `cutoffFrequency`, `fc` | `1.0` (Hz) |
| `LOW_PASS_FILTER` | `sample_time` | `sampleTime`, `dt` | `0.1` (s) |
| `LOW_PASS_FILTER` | `initial_condition` | `initialCondition`, `ic` | `0.0` |
| `HIGH_PASS_FILTER` | `cutoff_frequency` | `cutoffFrequency`, `fc` | `1.0` (Hz) |
| `HIGH_PASS_FILTER` | `sample_time` | `sampleTime`, `dt` | `0.1` (s) |
| `HIGH_PASS_FILTER` | `initial_condition` | `initialCondition`, `ic` | `0.0` |
| `MOVING_AVERAGE` | `window_size` | `windowSize`, `N` | `4` |
| `MOVING_AVERAGE` | `sample_time` | `sampleTime`, `dt` | `0.1` (s) |
| `MOVING_AVERAGE` | `initial_condition` | `initialCondition`, `ic` | `0.0` |

### 3.2 Authoritative State Layout Definition Rule
> **Requirement**: The Semantic IR shall define the authoritative state layout for each canonical filter. Model-side auxiliary or legacy state fields (such as extraneous `sum` or `x_prev` fields) shall not be emitted into generated C unless explicitly required by the canonical filter semantics.

---

## 4. Block Specifications & Mathematical Formulations

### 4.1 `LOW_PASS_FILTER`

* **Canonical Block Name**: `LOW_PASS_FILTER`
* **Canonical Parameters**: `cutoff_frequency`, `sample_time`, `initial_condition`
* **State Slots**:
  - `prev_y$state` (scalar float64/float32, initial value = `initial_condition`)
* **Discrete Formulation**:
  $$\tau = \frac{1}{2 \pi f_c}, \quad \alpha = \frac{\Delta t}{\tau + \Delta t}$$
  $$y[k] = (1 - \alpha) \cdot y[k-1] + \alpha \cdot u[k]$$

### 4.2 `HIGH_PASS_FILTER`

* **Canonical Block Name**: `HIGH_PASS_FILTER`
* **Canonical Parameters**: `cutoff_frequency`, `sample_time`, `initial_condition`
* **State Slots**:
  - `prev_y$state` (scalar float64/float32, initial value = `initial_condition`)
  - `prev_u$state` (scalar float64/float32, initial value = `initial_condition`)
* **Discrete Formulation & Initialization**:
  - Initial condition state: `prev_y(0) = initial_condition`, `prev_u(0) = initial_condition`
  - Discrete step equation:
    $$\tau = \frac{1}{2 \pi f_c}, \quad \alpha = \frac{\tau}{\tau + \Delta t}$$
    $$y[k] = \alpha \cdot (y[k-1] + u[k] - u[k-1])$$

### 4.3 `MOVING_AVERAGE`

* **Canonical Block Name**: `MOVING_AVERAGE`
* **Canonical Parameters**: `window_size`, `sample_time`, `initial_condition`
* **State Slots**:
  - `buffer$state` (vector array of size $W = \text{window\_size}$, initial values = `initial_condition`)
  - `index$state` (scalar integer counter, initial value = `0`)
* **Sample Insertion & Output Calculation Order**:
  > **Requirement**: The current input sample $u[k]$ shall be inserted into the moving-average window buffer before calculation of the current output $y[k]$.
  - Sample insertion: `buffer[index] = u[k]`, `index = (index + 1) % W`
  - Output calculation:
    $$y[k] = \frac{1}{W} \sum_{i=0}^{W-1} \text{buffer}[i]$$

---

## 5. Capability Registry & Generation Gate Logic

### 5.1 Capability Registry Updates (`src/utils/stateMachine/xbCapabilities.ts`)
- Remove `LOW_PASS_FILTER`, `HIGH_PASS_FILTER`, and `MOVING_AVERAGE` from `UNPAIRED_EMBEDDED_OPERATIONS`.
- Register explicit capabilities in `XB_CAPABILITIES`:
  ```typescript
  LOW_PASS_FILTER: stateful(allShapes, undefined, ['T10-INT-FILTERS'], ['T10-C99-FILTERS']),
  HIGH_PASS_FILTER: stateful(allShapes, undefined, ['T10-INT-FILTERS'], ['T10-C99-FILTERS']),
  MOVING_AVERAGE: stateful(allShapes, undefined, ['T10-INT-FILTERS'], ['T10-C99-FILTERS']),
  ```
- Register `T10-INT-FILTERS` in `XB_INTERPRETER_CONFORMANCE_CASES` and `T10-C99-FILTERS` in `XB_C_CONFORMANCE_CASES`.

### 5.2 Generation Gate Diagnostics & Negative / Positive Tests

#### Gate Diagnostic Format
When a block is rejected by the gate, it must return a precise capability diagnostic:
```text
BLOCKED BY PROGRAM CONFORMANCE GATE

Block Type: LOW_PASS_FILTER

Required:
- Canonical Interpreter: PASS
- Generated-C Emitter: PASS
- Paired Executable Conformance: PASS
- Registry Registration: PASS
```

#### Test Suite Requirements:
1. **Gate Negative Test**:
   - Given: Canonical Interpreter = PASS, Generated-C Emitter = PASS, Paired Conformance = MISSING/FAIL
   - Expect: Semantic Generation Gate = **BLOCKED** with diagnostic.
2. **Gate Positive Test**:
   - Given: Canonical Interpreter = PASS, Generated-C Emitter = PASS, Paired Conformance = PASS, Registry Registration = REGISTERED
   - Expect: Semantic Generation Gate = **ENABLED** (`CONFORMANT / GENERATION ENABLED`).

---

## 6. Acceptance Criteria

| Criterion | Requirement | Status |
| :--- | :--- | :--- |
| `LOW_PASS_FILTER` interpreter | Exponential smoothing $y[k] = (1-\alpha)y[k-1] + \alpha u[k]$ | PASS |
| `LOW_PASS_FILTER` Generated-C emitter | Strict C99 state struct and step function | PASS |
| `LOW_PASS_FILTER` paired test | Sample-by-sample tolerance match ($10^{-4}$) | PASS |
| `HIGH_PASS_FILTER` interpreter | $y[k] = \alpha(y[k-1]+u[k]-u[k-1])$, `prev_u(0)=initial_condition` | PASS |
| `HIGH_PASS_FILTER` Generated-C emitter | Strict C99 state struct and step function | PASS |
| `HIGH_PASS_FILTER` paired test | Sample-by-sample tolerance match ($10^{-4}$) | PASS |
| `MOVING_AVERAGE` interpreter | Sample insertion before output calculation | PASS |
| `MOVING_AVERAGE` Generated-C emitter | Ring buffer update and sum calculation in C99 | PASS |
| `MOVING_AVERAGE` paired test | Sample-by-sample tolerance match ($10^{-4}$) | PASS |
| Canonical names consistent | `LOW_PASS_FILTER`, `HIGH_PASS_FILTER`, `MOVING_AVERAGE` | PASS |
| Parameter normalization | Accepted input aliases mapped to canonical parameters | PASS |
| Authoritative state layout | IR defines state slots, no model-side legacy junk emitted | PASS |
| Capability registry updated | Capability entries registered with conformance case IDs | PASS |
| Gate negative & positive tests | Rejects when unverified, opens when paired conformance passes | PASS |
| Model JSON unchanged | No workaround modifications to input JSON | PASS |
