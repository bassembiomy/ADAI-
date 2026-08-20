# VLab White-Box Component Testing Framework Design Specification

- **Date**: 2026-08-20
- **Status**: Approved
- **Scope**: Comprehensive multi-domain white-box test suite for VLab physics DAE simulation engine and component library against analytical/standard baseline models.

---

## 1. Executive Summary & Goals

The VLab simulation engine employs a Differential-Algebraic Equation (DAE) assembler and implicit non-linear solver to simulate multi-domain physical systems. To guarantee rigorous physical fidelity and prevent silent regressions, this specification establishes an automated **White-Box Testing Framework** structured around a **Dual-Agent / Dual-Module Pattern**:
1. **Boundary Generator (Agent / Module 1)**: Assembles DAE topological networks, standard parameter sweeps, boundary conditions, and domain-specific excitations (step, ramp, sinusoidal, impulse).
2. **Oracle Judge (Agent / Module 2)**: Encapsulates closed-form analytical mathematical models and high-precision reference solvers, calculating Normalized Root Mean Square Error (NRMSE), time constants ($\tau$), steady-state errors ($E_{ss}$), and physical conservation residuals.

---

## 2. System Architecture & Directory Layout

The testing framework is organized under `src/engine/vlab/whitebox_benchmarks/`:

```
src/engine/vlab/whitebox_benchmarks/
├── boundary_generator/
│   ├── types.ts                      # Interfaces for fixtures, excitations, domain bindings
│   ├── ElectricalFixtures.ts         # DC/AC circuits, RC/RL/RLC, Diode, MOSFET, IGBT
│   ├── MechanicalFixtures.ts         # Mass-Spring-Damper, Inertia-Damper, Gearbox
│   ├── ThermalFixtures.ts            # Conduction, Convection, Thermal Mass heating
│   ├── FluidFixtures.ts              # Orifice flow, Pipe resistance, Fluid capacitance
│   ├── ElectromechanicalFixtures.ts  # DC Motor, AC Motor, Inverter stage
│   └── SignalFixtures.ts             # PID loop, Gain, Saturation, Integrator
│
├── oracle_judge/
│   ├── AnalyticalBaselines.ts        # Closed-form theoretical formulas (RC, RLC, ODE2, Heat Eq)
│   ├── NonlinearReferences.ts        # High-accuracy numerical reference benchmarks
│   ├── MetricsComparator.ts          # NRMSE, % peak error, tau (tau_63.2%), steady-state tolerance
│   └── ToleranceProfiles.ts          # Linear (1%), Nonlinear (5%), Conservation law thresholds
│
└── suites/
    ├── electrical_whitebox.test.ts
    ├── mechanical_whitebox.test.ts
    ├── thermal_whitebox.test.ts
    ├── fluid_whitebox.test.ts
    ├── electromechanical_whitebox.test.ts
    └── signal_whitebox.test.ts
```

---

## 3. Component Batches & Standard Baseline Models

### Batch A: Electrical Domain
- **Resistor / DC Circuit**: Ohm's Law $I = V / R$. Steady-state error $\le 0.1\%$.
- **RC Circuit**: Step charging curve $V_C(t) = V_s(1 - e^{-t/RC})$. Evaluated at $t = \tau$, $t = 3\tau$, $t = 5\tau$. NRMSE $\le 1.0\%$.
- **RL Circuit**: Step current rise $I_L(t) = (V_s / R)(1 - e^{-t/(L/R)})$. $\tau = L/R$. NRMSE $\le 1.0\%$.
- **Diode**: Shockley exponential / piecewise forward knee curve ($V > V_f \implies I \approx (V - V_f)/R_{on}$). Forward voltage drop tolerance $\le 2.0\%$.
- **AC Impedance & Phase**: Sinusoidal excitation across RC/RL networks. Frequency-domain magnitude $|Z|$ and phase angle $\theta = \arctan(\omega RC)$ comparison $\le 2.0\%$.

### Batch B: Mechanical Domain
- **Translational Mass-Spring-Damper**: Underdamped step response $m\ddot{x} + b\dot{x} + kx = F_0$.
  - Natural frequency $\omega_n = \sqrt{k/m}$, damping ratio $\zeta = b / (2\sqrt{km})$.
  - Closed-form trajectory $x(t) = x_{ss}[1 - e^{-\zeta\omega_n t}(\cos\omega_d t + \frac{\zeta}{\sqrt{1-\zeta^2}}\sin\omega_d t)]$. NRMSE $\le 1.0\%$.
- **Rotational Inertia-Damper**: Spin-down and torque step response $J\dot{\omega} + b\omega = \tau_{ext}$. Steady state $\omega_{ss} = \tau_{ext}/b$, time constant $\tau = J/b$. Error $\le 1.0\%$.
- **Gearbox Transmission**: Gear ratio preservation $\omega_2 = \omega_1 / N$ and $\tau_2 = N \tau_1$. Error $\le 0.1\%$.

### Batch C: Thermal Domain
- **1D Fourier Conduction**: $Q = \frac{k A}{L} (T_1 - T_2) = \frac{\Delta T}{R_{th}}$. Steady state temperature gradient error $\le 0.5\%$.
- **Thermal Mass Heat Accumulation**: $\frac{dT}{dt} = \frac{Q_{in}}{C_{th}} \implies T(t) = T_0 + \frac{Q_{in}}{C_{th}} t$. Slope error $\le 0.5\%$.
- **Newton's Law of Cooling (Convective Heat)**: $Q = h A (T_{surface} - T_{fluid})$. Exponential thermal decay curve $T(t) = T_\infty + (T_0 - T_\infty) e^{-t / (R_{th} C_{th})}$. NRMSE $\le 1.0\%$.

### Batch D: Fluid Domain
- **Laminar Fluid Resistance (Hagen-Poiseuille)**: $\Delta P = R_f \dot{m}$. Mass flow rate error $\le 0.5\%$.
- **Orifice Flow (Bernoulli Restriction)**: $\dot{m} = C_d A \sqrt{2 \rho |\Delta P|} \text{sign}(\Delta P)$. Nonlinear benchmark comparison $\le 2.0\%$.
- **Fluid Capacitance (Chamber Storage)**: $\dot{m} = C_f \frac{dP}{dt} \implies P(t) = P_0 + \frac{1}{C_f} \int \dot{m} dt$. Linear slope error $\le 1.0\%$.

### Batch E: Electromechanical Domain
- **DC Motor Step Response**: Armature equation $V_a = R_a i_a + L_a \frac{di_a}{dt} + K_e \omega$, torque equation $J \frac{d\omega}{dt} + b\omega = K_t i_a$.
  - Theoretical no-load steady-state speed $\omega_{ss} = \frac{K_t V_a}{R_a b + K_t K_e}$.
  - Motor mechanical time constant $\tau_m = \frac{J R_a}{R_a b + K_t K_e}$. NRMSE $\le 2.0\%$.
- **3-Phase 2-Level Inverter (PWM)**: Fundamental AC voltage output tracking modulating index $V_{rms} = \frac{m_a V_{dc}}{2\sqrt{2}}$. Magnitude error $\le 3.0\%$.

### Batch F: Signal / Control Domain
- **PID Controller Closed-Loop**: Proportional, Integral, Derivative action step response with plant $G(s) = \frac{1}{s+1}$. Tracking error at steady state $\rightarrow 0$.
- **Saturation Block**: Clamping limits $[u_{min}, u_{max}]$ under large amplitude excitation.
- **Math Blocks**: Gain, Sum/Subtract signal algebraic exactness ($< 10^{-7}$).

---

## 4. Oracle Judge Evaluation Metrics

The Oracle Judge evaluates simulated trajectories against exact mathematical ground truth using 4 quantitative gates:

1. **Normalized Root Mean Square Error (NRMSE)**:
   $$\text{NRMSE} = \frac{\sqrt{\frac{1}{N} \sum_{k=1}^N (y_{sim}(t_k) - y_{ref}(t_k))^2}}{\max(y_{ref}) - \min(y_{ref}) + \epsilon}$$
   - Linear components: $\le 1.0\%$
   - Non-linear / Switched components: $\le 5.0\%$
2. **Steady-State Relative Error ($E_{ss}$)**:
   $$E_{ss} = \left| \frac{y_{sim}(t_{end}) - y_{ref}(t_{end})}{y_{ref}(t_{end})} \right| \le 1.0\%$$
3. **Transient Time Constant ($\tau$) Accuracy**:
   $$\Delta \tau = \left| \frac{\tau_{sim}^{63.2\%} - \tau_{ref}}{\tau_{ref}} \right| \le 2.0\%$$
4. **Physical Conservation Residuals**:
   - $\sum I_{node} < 10^{-6}$ A
   - $\sum F_{node} < 10^{-5}$ N
   - $\sum \dot{m}_{node} < 10^{-6}$ kg/s

---

## 5. Verification & Test Execution

- All benchmarks run via Vitest runner:
  ```bash
  npx vitest run src/engine/vlab/whitebox_benchmarks/suites/
  ```
- Each test outputs a formatted console verification card summarizing domain, component, metrics, and oracle verdict.
