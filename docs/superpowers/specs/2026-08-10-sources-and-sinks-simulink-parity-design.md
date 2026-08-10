# Sources & Sinks 100% Simulink-Exact C99 Parity Design

**Date**: 2026-08-10  
**Status**: Approved  
**Target Module**: `src/utils/stateMachine/` (`xbCapabilities.ts`, `xbCGenerator.ts`, `xbCConformanceCases.ts`)

---

## 1. Executive Summary & Goal

This design specification establishes 100% block-level conformance and exact mathematical equivalence between X-Bridges C99 code generation and MathWorks Simulink for all 10 block types in the **Sources & Sinks** library category.

---

## 2. Block Audit & Classification Table

| # | Block Type | Category | Classification | Codegen Target | Behavioral Contract / Equivalence Formula |
|---|---|---|---|---|---|
| 1 | `Constant` | Sources | Signal Source | Strict C99 | Emits constant scalar, vector, or matrix value |
| 2 | `Inport` | Ports | Interface | Strict C99 | Top-level model external input signal binding |
| 3 | `Outport` | Ports | Interface | Strict C99 | Top-level model external output signal binding |
| 4 | `Step` | Sources | Signal Source | Strict C99 | $y(t) = (t < t_{\text{step}}) ? y_0 : y_f$ |
| 5 | `WHITE_NOISE` | Sources | Stochastic Source | Strict C99 | Stateful Box-Muller normal random distribution $\mathcal{N}(\mu, \sigma^2)$ |
| 6 | `BAND_LIMITED_NOISE` | Sources | Stochastic Source | Strict C99 | Box-Muller white noise filtered by 1st-order LPF ($f_c$) |
| 7 | `Scope` | Sinks | Host-Only UI | Non-Codegen | Interactive UI plotting & scope node (`codegen: false`) |
| 8 | `Note` | Annotations | Host-Only UI | Non-Codegen | Canvas annotation block (`codegen: false`) |
| 9 | `Clock` | Sources | Time Source | Strict C99 | Continuous/discrete time accumulator: $y(t) = t = k \cdot \Delta t$ |
| 10 | `WaveformGen` | Sources | Signal Source | Strict C99 | Parametric signal generator (Sine, Square, Triangle, Sawtooth) |

---

## 3. Block Lowering Specifications

### 3.1 `Clock` Block
- **Purpose**: Generates continuous simulation time $t$ elapsed since execution start.
- **Parameters**:
  - `sampleTime`: Simulation step size $\Delta t$ (defaults to solver step `stepSeconds`).
- **State Struct Layout**:
  Allocates a `double sim_time` field in the state machine instance struct.
- **C99 Output Lowering**:
  ```c
  instance->xb_state.sim_time += dt;
  output_signal_0 = instance->xb_state.sim_time;
  ```

### 3.2 `WaveformGen` Block
- **Purpose**: Generates dynamic periodic signals matching Simulink's Signal Generator block.
- **Parameters**:
  - `waveform`: `'sine' | 'square' | 'triangle' | 'sawtooth'` (default: `'sine'`).
  - `amplitude`: Peak amplitude $A$ (default `1.0`).
  - `frequency`: Frequency $f$ in Hz (default `1.0`).
  - `phase`: Phase shift $\phi$ in radians (default `0.0`).
  - `bias`: DC offset $V_{\text{dc}}$ (default `0.0`).
- **Exact Mathematical Formulations**:
  1. **Sine**:
     $$y(t) = V_{\text{dc}} + A \cdot \sin(2\pi f t + \phi)$$
  2. **Square**:
     $$y(t) = V_{\text{dc}} + A \cdot \operatorname{sgn}(\sin(2\pi f t + \phi))$$
     *(Where $\operatorname{sgn}(x) = 1.0$ for $x \ge 0$, else $-1.0$)*
  3. **Triangle**:
     $$y(t) = V_{\text{dc}} + A \cdot \frac{2}{\pi} \arcsin(\sin(2\pi f t + \phi))$$
  4. **Sawtooth**:
     $$u = f \cdot t + \frac{\phi}{2\pi}; \quad y(t) = V_{\text{dc}} + A \cdot \left( 2 \cdot (u - \lfloor u \rfloor) - 1 \right)$$

- **C99 Output Lowering**:
  ```c
  double t = instance->xb_state.sim_time;
  double phase_arg = 2.0 * M_PI * freq * t + phase;
  double out = bias;
  if (type == WAVEFORM_SINE) {
      out += amp * sin(phase_arg);
  } else if (type == WAVEFORM_SQUARE) {
      out += amp * (sin(phase_arg) >= 0.0 ? 1.0 : -1.0);
  } else if (type == WAVEFORM_TRIANGLE) {
      out += amp * (2.0 / M_PI) * asin(sin(phase_arg));
  } else if (type == WAVEFORM_SAWTOOTH) {
      double u = freq * t + phase / (2.0 * M_PI);
      out += amp * (2.0 * (u - floor(u)) - 1.0);
  }
  ```

---

## 4. Integration into Capability & Conformance Registries

1. **`xbCapabilities.ts`**:
   - Update `XB_CAPABILITIES` to map `Clock` and `WaveformGen` as valid codegen targets with scalar input/output shapes.
   - Set host-only flags for `Scope` and `Note` with descriptive reasoning.
2. **`xbCConformanceCases.ts`**:
   - Register stable conformance case `T10-C99-WAVEFORMS` verifying `Clock` and `WaveformGen` outputs against analytical golden values across 100 simulation steps.

---

## 5. Verification Plan

- Run unit test suite: `npx vitest run src/utils/stateMachine/xbCGenerator.test.ts`.
- Verify clean compilation of generated C99 code with `avr-gcc` or `gcc` / standard host compiler.
- Validate zero runtime warnings/errors in StateMachine runtime bundle.
