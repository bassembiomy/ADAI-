# V-Lab Mathematical Model & Simulation Test Suite Design Specification

## Executive Summary
This design specification defines a professional, highly accurate test suite and executable runner for the Virtual Lab (V-Lab) mathematical model engine. It ensures high precision verification of Differential-Algebraic Equations (DAE), implicit time-stepping integration (Backward Euler / Trapezoidal), and multi-domain physics solver accuracy using real-world physical numbers and exact closed-form analytical equations.

---

## 1. Objectives & Scope

1. **Analytical Benchmark Suite (`src/engine/vlab/vlab_math_precision.test.ts`)**:
   - Automated unit and integration tests powered by Vitest.
   - Compares numerical solver trajectories directly against exact closed-form calculus equations across 5 physical domains.

2. **Professional Executable CLI Test Runner (`scripts/run_vlab_math_test.ts`)**:
   - A standalone CLI tool invoked via `npm run test:vlab:professional` or `npx tsx scripts/run_vlab_math_test.ts`.
   - Simulates multi-domain physical systems with real-world engineering SI units (Ohms, Farads, Henries, Kilograms, Joules/Kelvin, Pascals).
   - Computes statistical accuracy metrics: Mean Absolute Error (MAE), Root Mean Square Error (RMSE), Relative Percentage Error, and DAE Residual Norms.
   - Outputs colorized terminal summaries and exports structured JSON/Markdown performance reports.

---

## 2. Multi-Domain Mathematical Models & Real Physical Parameters

### A. Electrical Domain (RLC Step Response & Filter Dynamics)
- **Physical System**: Series $RC$ charging network and $RLC$ resonant circuit.
- **Parameters**:
  - Supply Voltage $V_{in} = 12.0\,\text{V}$
  - Resistance $R = 100.0\,\Omega$
  - Capacitance $C = 100.0\,\mu\text{F} \; (1.0 \times 10^{-4}\,\text{F})$
  - Time Constant $\tau = R \cdot C = 10.0\,\text{ms}$
- **Analytical Solution**:
  $$V_C(t) = V_{in} \left(1 - e^{-t/\tau}\right), \quad i_C(t) = \frac{V_{in}}{R} e^{-t/\tau}$$
- **Pass Threshold**: Relative error at $t = \tau, 3\tau, 5\tau$ is $< 0.05\%$.

### B. Mechanical Domain (Translational Damped Harmonic Oscillator)
- **Physical System**: Mass-Spring-Damper under external force step.
- **Parameters**:
  - Mass $m = 2.5\,\text{kg}$
  - Spring Constant $k = 250.0\,\text{N/m}$
  - Damping Coefficient $c = 5.0\,\text{N}\cdot\text{s/m}$
  - Natural Frequency $\omega_n = \sqrt{k/m} = 10.0\,\text{rad/s}$
  - Damping Ratio $\zeta = \frac{c}{2\sqrt{km}} = 0.1$ (Underdamped)
  - Damped Frequency $\omega_d = \omega_n \sqrt{1 - \zeta^2} = 9.94987\,\text{rad/s}$
- **Analytical Solution**:
  $$x(t) = x_{ss} \left[1 - e^{-\zeta \omega_n t} \left(\cos(\omega_d t) + \frac{\zeta}{\sqrt{1-\zeta^2}} \sin(\omega_d t)\right)\right]$$
- **Pass Threshold**: Natural frequency extraction error $< 0.1\%$; peak displacement overshoot within $0.05\%$.

### C. Thermal Domain (Heat Conduction & Transient Temperature Distribution)
- **Physical System**: Power dissipation source with thermal mass and convective cooling to ambient.
- **Parameters**:
  - Thermal Mass $C_{th} = 500.0\,\text{J/K}$
  - Thermal Resistance $R_{th} = 0.50\,\text{K/W}$
  - Heat Generation Rate $Q = 50.0\,\text{W}$
  - Ambient Temperature $T_{amb} = 293.15\,\text{K} \; (20.0^\circ\text{C})$
  - Thermal Time Constant $\tau_{th} = R_{th} \cdot C_{th} = 250.0\,\text{s}$
- **Analytical Solution**:
  $$T(t) = T_{amb} + Q \cdot R_{th} \left(1 - e^{-t/\tau_{th}}\right)$$
- **Pass Threshold**: Steady-state temperature $T_{ss} = 318.15\,\text{K} \; (45.0^\circ\text{C})$ matched within $0.01\,\text{K}$.

### D. Fluid / Hydraulic Domain (Fluid Level & Pipe Dynamics)
- **Physical System**: Fixed head supply feeding a hydraulic tank via a restrictive fluid pipe.
- **Parameters**:
  - Pipe Hydraulic Resistance $R_{hyd} = 1.0 \times 10^6\,\text{Pa}\cdot\text{s/m}^3$
  - Fluid Density $\rho = 1000.0\,\text{kg/m}^3$
  - Tank Area $A = 0.50\,\text{m}^2$
  - Inlet Pressure $P_{in} = 1.0 \times 10^5\,\text{Pa} \; (1.0\,\text{bar})$
- **Analytical Solution**:
  $$Q_{fluid}(t) = \frac{\Delta P}{R_{hyd}}, \quad \frac{dh}{dt} = \frac{Q_{fluid}}{A}$$
- **Pass Threshold**: Flow rate $Q_{fluid} = 0.1\,\text{L/s}$ verified with relative error $< 0.01\%$.

### E. Electromechanical / Multiphysics (Permanent Magnet DC Motor)
- **Physical System**: Armature voltage step driving rotor shaft with mechanical load friction.
- **Parameters**:
  - Armature Resistance $R_a = 1.5\,\Omega$
  - Armature Inductance $L_a = 2.0\,\text{mH}$
  - Back-EMF / Torque Constant $K_e = K_t = 0.05\,\text{V}\cdot\text{s/rad}$
  - Rotor Inertia $J = 1.0 \times 10^{-4}\,\text{kg}\cdot\text{m}^2$
  - Viscous Friction $B = 1.0 \times 10^{-5}\,\text{N}\cdot\text{m}\cdot\text{s/rad}$
  - Applied Armature Voltage $V_a = 24.0\,\text{V}$
- **Analytical Solution**:
  $$\omega_{ss} = \frac{K_t V_a}{R_a B + K_e K_t} = 470.588\,\text{rad/s} \; (4493.8\,\text{RPM})$$
  $$T_{stall} = K_t \frac{V_a}{R_a} = 0.80\,\text{N}\cdot\text{m}$$
- **Pass Threshold**: No-load angular velocity $\omega_{ss}$ matched within $0.05\%$ accuracy.

---

## 3. Accuracy Metrics & Conservation Verification

For each physics test scenario, the runner evaluates:
1. **Root Mean Square Error (RMSE)**:
   $$\text{RMSE} = \sqrt{\frac{1}{N} \sum_{k=1}^N \left(y_{\text{sim}}(t_k) - y_{\text{exact}}(t_k)\right)^2}$$
2. **Normalized Mean Square Error (NMSE)**: Enforced to be $< 10^{-4}$.
3. **DAE Solver Residual Norm**: $\|R(x_k)\| < 10^{-6}$ for implicit step updates.
4. **Energy Conservation Verification**:
   $$\Delta E(t) = \left| E_{\text{stored}}(t) + E_{\text{dissipated}}(t) - E_{\text{input}}(t) \right| \le \epsilon_{energy}$$

---

## 4. Implementation Structure & File Map

1. `src/engine/vlab/vlab_math_precision.test.ts`:
   - Vitest test suite executing analytical precision tests across all 5 domains.
2. `scripts/run_vlab_math_test.ts`:
   - Standalone CLI runner with formatted console output, accuracy stats, and report saving.
3. `package.json`:
   - Add `"test:vlab:professional": "tsx scripts/run_vlab_math_test.ts"` npm script.

---

## 5. Verification Plan

### Automated Tests
- Run `npm run test:vlab:professional` to execute CLI accuracy runner with report generation.
- Run `npx vitest run src/engine/vlab/vlab_math_precision.test.ts` to execute Vitest assertions.

### Verification Criteria
- All 5 domain simulations complete without numerical instability or solver divergence.
- Accuracy metrics fall strictly within $0.05\% - 0.1\%$ relative tolerance limits.
