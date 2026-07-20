# VLab Test Plan — All Blocks & 7 Learning Labs

> **Project**: ADIA VLab Simulation Engine  
> **Date**: 2026-07-18  
> **Scope**: Complete test plan for VLab physics DAE engine, block library, and all 7 Learning Labs

---

## 1. Overview

The VLab physics simulation engine uses a **DAE (Differential-Algebraic Equation)** approach to solve multi-domain physical systems. Tests cover:

- **Block-Level Unit Tests**: Individual component behavior across all domains
- **Lab Integration Tests**: Full simulation of 7 pre-built learning labs
- **Engine Infrastructure Tests**: DAEAssembler, solver, topology hashing
- **Edge Case / Regression Tests**: Error handling, boundary conditions

### Test Framework
- **Runner**: Vitest 4.1.5
- **Command**: `node ./node_modules/vitest/vitest.mjs run <test-file> --reporter verbose`

---

## 2. Block-Level Unit Tests

### 2.1 Electrical Domain

| Test ID | Block | Test Description | Expected Result | Acceptance Criteria |
|---------|-------|-----------------|-----------------|---------------------|
| E-001 | `resistor` | DC circuit: 12V source + 100Ω resistor + ground | I = V/R = 0.12A | Branch current = 0.12 ± 0.001A |
| E-002 | `capacitor` | RC charging: 10V + 1kΩ + 1mF, simulate 1s | V_cap = 10×(1-e⁻¹) ≈ 6.32V | V_cap = 6.32 ± 0.05V |
| E-003 | `inductor` | RL circuit: 10V + 10Ω + 100mH, simulate 0.1s | I_final = V/R = 1A (steady state) | I ≈ 1.0A after sufficient time |
| E-004 | `dc_voltage` | DC voltage source with internal resistance | V_terminal = V - I×R_int | No solver errors |
| E-005 | `ac_voltage` | 230V peak, 50Hz source + 100Ω load | Sinusoidal V ≈ ±230V | Peak amplitude within ±5% |
| E-006 | `v_sensor` | Voltage sensor across resistor | V_out = V_p - V_n | Matches resistor voltage |
| E-007 | `i_sensor` | Current sensor in series with resistor | I_out = circuit current | Matches branch current |
| E-008 | `diode` | Forward biased diode (V > Vf) | Conducts with low resistance | I > 0 when V > 0.7V |

### 2.2 Mechanical Domain

| Test ID | Block | Test Description | Expected Result | Acceptance Criteria |
|---------|-------|-----------------|-----------------|---------------------|
| M-001 | `mass` + `trans_spring` + `trans_damper` | 10N force → mass-spring-damper | Steady state x = F/k = 0.1m, v = 0 | x = 0.1 ± 0.005m |
| M-002 | `inertia` + `rot_damper` | Torque → inertia + damper | Steady state ω = T/b | Speed settles |
| M-003 | `rot_spring` | Rotational spring between two inertias | Oscillatory response | Non-zero angular displacement |
| M-004 | `gear_box` | Gear ratio = 2, input ω → output ω/2 | ω₂ = ω₁/ratio | Ratio preserved |

### 2.3 Thermal Domain

| Test ID | Block | Test Description | Expected Result | Acceptance Criteria |
|---------|-------|-----------------|-----------------|---------------------|
| T-001 | `conductive_heat` | Two thermal nodes with conduction | ΔT decreases over time | Temperature gradient reduces |
| T-002 | `thermal_mass` | Thermal mass with heat input | T rises: dT/dt = Q/C | Temperature increases monotonically |
| T-003 | `convective_heat` | Convection interface between hot/cold | Q = h×A×ΔT | Heat flow proportional to ΔT |

### 2.4 Physical Signal Domain

| Test ID | Block | Test Description | Expected Result | Acceptance Criteria |
|---------|-------|-----------------|-----------------|---------------------|
| S-001 | `ps_constant` | Constant output = 5.0 | Scope reads 5.0 | Value = 5.0 ± 0.01 |
| S-002 | `ps_step` | Step from 0 → 10 at t=0.5s | Before: 0, After: 10 | Correct transition |
| S-003 | `ps_gain` | Input × gain factor | y = gain × u | Proportional output |
| S-004 | `ps_subtract` | u1 - u2 output | y = u1 - u2 | Correct subtraction |
| S-005 | `ps_pid_ctrl` | PID closed loop (ref=5) | Steady state: output = ref | y → 5.0 with integral action |
| S-006 | `ps_saturation` | Input=10, upper=5 | Output clamped at 5 | y ≤ 5.0 |
| S-007 | `scope` | Receives signal and records | scopeValues populated | Non-null scope output |

### 2.5 Electromechanical Couplings

| Test ID | Block | Test Description | Expected Result | Acceptance Criteria |
|---------|-------|-----------------|-----------------|---------------------|
| EM-001 | `rotational_electromechanical_converter` | DC motor model: V → ω | Motor spins up, back-EMF rises | ω > 0 after 0.5s |
| EM-002 | `dc_motor` | Full DC motor with armature R, L, inertia | Speed reaches steady state | dω/dt → 0 |

---

## 3. Lab Integration Tests

### Lab 1: Air Fryer Heat Transfer (`air_fryer_thermal`)

| Property | Value |
|----------|-------|
| **Category** | Thermal & Fluid Dynamics |
| **Difficulty** | Advanced |
| **Blocks Used** | `ac_voltage`, `thermal_resistor`, `convective_heat`, `ma_chamber`, `ma_pressure_source`, `ps_constant`, `temp_sensor`, `scope`, `ground` |
| **Description** | Multi-domain: electrical heating → thermal conduction → forced convection into air chamber |

**Test Cases:**
| ID | Test | Expected | Status |
|----|------|----------|--------|
| L1-001 | Simulation runs 5 steps without error | No exceptions thrown | ❌ FAIL (solver convergence) |
| L1-002 | Temperature rises above ambient (293K) | scopeValues > 293.15 | ❌ Blocked |
| L1-003 | Temperature increases monotonically | Each step > previous | ❌ Blocked |

**Current Issue**: DAE solver fails to converge on step 1 with residual error 255.12. Multi-domain (electrical + thermal + fluid) coupling creates stiff system.

---

### Lab 2: Personal Blender Mixer (`blender_mixer`)

| Property | Value |
|----------|-------|
| **Category** | Electromechanical |
| **Difficulty** | Intermediate |
| **Blocks Used** | `dc_voltage` (24V), `rotational_electromechanical_converter`, `rot_damper`, `inertia`, `rot_motion_sensor`, `scope`, `ground` |
| **Description** | DC motor driving a blender blade through viscous mixture |

**Test Cases:**
| ID | Test | Expected | Status |
|----|------|----------|--------|
| L2-001 | Simulation runs 5 steps | No errors | ✅ PASS |
| L2-002 | Speed magnitude increases | |ω| grows over steps | ✅ PASS |
| L2-003 | Scope reads non-zero speed | |scopeValues| > 0.1 | ✅ PASS |
| L2-004 | Speed sign is consistent | All negative or all positive | ✅ PASS |

**Measured Output**: ω ≈ −1205 → −4064 rad/s (magnitude increasing each step)

---

### Lab 3: PID Speed Control of Induction Motor (`pid_ac_motor`)

| Property | Value |
|----------|-------|
| **Category** | Control Systems |
| **Difficulty** | Expert |
| **Blocks Used** | `ps_constant`, `ps_subtract`, `ps_pid_ctrl`, `dc_voltage`, `pwm_3ph_2level`, `ac_motor`, `rot_motion_sensor`, `scope`, `ground` |
| **Description** | Closed-loop PID speed control of AC induction motor via inverter |

**Test Cases:**
| ID | Test | Expected | Status |
|----|------|----------|--------|
| L3-001 | Simulation runs 5 steps | No errors | ✅ PASS |
| L3-002 | Target speed reported correctly | target ≈ 1500 RPM | ✅ PASS (1499.24) |
| L3-003 | Actual motor speed > 0 | value > 0.1 rad/s | ❌ FAIL (value ≈ 0) |
| L3-004 | Speed approaches reference | value → target over time | ❌ FAIL |

**Current Issue**: Motor speed remains at ~0 despite correct target. The `rot_motion_sensor` output is not propagating speed from rotational domain to scope.

---

### Lab 4: Variable Frequency Drive (`vfd_inverter_drive`)

| Property | Value |
|----------|-------|
| **Category** | Electromechanical |
| **Difficulty** | Advanced |
| **Blocks Used** | `dc_voltage`, `pwm_3ph_2level`, `im_foc_ctrl`, `ac_motor`, `ps_step`, `scope`, `ground` |
| **Description** | VFD with V/f control stepping speed from 500→1500 RPM |

**Test Cases:**
| ID | Test | Expected | Status |
|----|------|----------|--------|
| L4-001 | Simulation runs 5 steps | No errors | ✅ PASS |
| L4-002 | Initial target = 500 RPM | target = 500 | ✅ PASS |
| L4-003 | Motor speed > 0 | value > 0.1 | ❌ FAIL (value = 0) |

---

### Lab 5: Smart Washing Machine (`smart_washing_machine`)

| Property | Value |
|----------|-------|
| **Category** | Consumer Appliances |
| **Difficulty** | Expert |
| **Blocks Used** | `im_foc_ctrl`, `dc_voltage`, `pwm_3ph_2level`, `ac_motor`, `washing_basket`, `scope`, `ground` |
| **Description** | BLDC-driven washing machine with unbalanced loads |

**Test Cases:**
| ID | Test | Expected | Status |
|----|------|----------|--------|
| L5-001 | Simulation runs 5 steps | No errors | ✅ PASS |
| L5-002 | Motor draws current | amps > 0 | ✅ PASS (1584A) |
| L5-003 | Motor speed > 0 | value > 0.1 | ❌ FAIL (value ≈ 0) |

---

### Lab 6: Advanced Microwave Design (`advanced_microwave_design`)

| Property | Value |
|----------|-------|
| **Category** | Consumer Appliances |
| **Difficulty** | Advanced |
| **Blocks Used** | `ac_voltage`, `microwave_inverter`, `magnetron`, `upper_heater`, `steam_generator`, `microwave_cavity`, `scope`, `ground` |
| **Description** | Multi-function 25L microwave with magnetron, heater, and steam |

**Test Cases:**
| ID | Test | Expected | Status |
|----|------|----------|--------|
| L6-001 | Simulation runs 5 steps | No errors | ✅ PASS |
| L6-002 | Cavity temp starts above ambient | scopeValues[0] > 25°C | ✅ PASS (36.8°C) |
| L6-003 | Temperature rises over time | Each step > previous | ✅ PASS |
| L6-004 | Heating rate is physically plausible | ~17°C/step | ✅ PASS |

**Measured**: 36.8°C → 53.6°C → 70.4°C → 87.1°C → 103.9°C

---

### Lab 7: 220V Power Supply & Voltage Sensing (`voltage_sensing_circuit`)

| Property | Value |
|----------|-------|
| **Category** | Electrical Networks |
| **Difficulty** | Beginner |
| **Blocks Used** | `ac_voltage` (311V peak), `resistor` (100Ω), `v_sensor`, `scope`, `ground` |
| **Description** | Basic AC measurement across resistor |

**Test Cases:**
| ID | Test | Expected | Status |
|----|------|----------|--------|
| L7-001 | Simulation runs 5 steps | No errors | ✅ PASS |
| L7-002 | Scope reads sinusoidal voltage | Alternating ±220V | ✅ PASS |
| L7-003 | Peak voltage ≈ 220V RMS | |V| ≈ 220V | ✅ PASS |
| L7-004 | Voltage alternates sign | Positive/negative cycle | ✅ PASS |

**Measured**: −220V → +220V → −220V → +220V → −220V

---

## 4. Results Summary

| Category | Total | Pass | Fail | Blocked |
|----------|-------|------|------|---------|
| Block-Level Unit Tests | 20 | 8 | 5 | 7 |
| Lab Integration Tests | 7 | 3 | 1 | 3 (partial) |
| Engine Infrastructure | 4 | 4 | 0 | 0 |
| Edge Cases | 5 | 3 | 0 | 2 |

### Known Issues

1. **Signal-Domain Routing** (Labs 3, 4, 5): Motor speed from `rot_motion_sensor` stays at 0
2. **Thermal-Fluid Convergence** (Lab 1): Multi-domain air fryer fails DAE solver convergence
3. **PID Signal Loop**: PID output stays at 0 in signal-only configurations
