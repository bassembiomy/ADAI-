# Air-Fryer Temperature Calibration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the VLab air-fryer learning model report temperature in the correct units and produce physically reasonable heating behavior.

**Architecture:** Keep the existing VLab block architecture, but correct the predefined air-fryer scope adapter, separate RMS electrical power from peak AC voltage, and give the chamber a configurable thermal mass and heat-loss model. Add focused regression tests around units, power, heating rate, and cutoff behavior.

**Tech Stack:** TypeScript, Vitest, VLab `VLabPhysicsEngine`, DAE block equations.

## Global Constraints

- Preserve existing generic VLab block interfaces and solver APIs.
- Keep temperatures internally in Kelvin for thermal-domain equations.
- Expose air-fryer scope values in Celsius only at the UI/scope boundary.
- Do not change unrelated microwave, blender, or washing-machine learning labs.
- Use test-first changes and run focused tests before the full VLab suite.

---

### Task 1: Add failing regression tests for air-fryer units and power

**Files:**
- Modify: `src/engine/vlab/test_airfryer_sim.test.ts`
- Test reference: `src/engine/vlab/vlabPhysics.ts`

**Interfaces:**
- Consumes: `VLabPhysicsEngine.simulateStep(nodes, edges, state, dt)`.
- Produces: Assertions proving that the air-fryer scope converts Kelvin to Celsius and that the configured electrical source does not use peak voltage as average heating power.

- [ ] **Step 1: Add a scope-unit assertion**

Use a simple air-chamber fixture initialized at a known thermal state and assert that a value of `373.15 K` is exposed as approximately `100 °C`, not `373.15 °C`.

- [ ] **Step 2: Add a power expectation test**

For a 230 V RMS, 35 Ω heater, assert the expected average resistive power is approximately `1511 W` using `P = Vrms² / R`. Keep `Vpk = 325 V` only as the waveform amplitude.

- [ ] **Step 3: Run the focused test and verify failure**

Run:

```powershell
npx vitest run src/engine/vlab/test_airfryer_sim.test.ts --reporter=verbose
```

Expected: the unit assertion fails because the current air-fryer adapter exposes Kelvin as Celsius.

- [ ] **Step 4: Commit the failing tests**

```powershell
git add src/engine/vlab/test_airfryer_sim.test.ts
git commit -m "test: define air fryer temperature and power expectations"
```

### Task 2: Correct the air-fryer scope temperature conversion

**Files:**
- Modify: `src/engine/vlab/vlabPhysics.ts:417-422`
- Test: `src/engine/vlab/test_airfryer_sim.test.ts`

**Interfaces:**
- Consumes: internal thermal scope value in Kelvin.
- Produces: `thermal_scope` value in Celsius with label `Air Fryer Temperature (°C)`.

- [ ] **Step 1: Replace the adapter conversion**

Change the air-fryer branch to subtract `273.15` before clamping the displayed Celsius value:

```ts
const tempK = indices.length > 0 ? xCurrent[indices[0]] : 293.15;
const cel = Math.max(0.0, tempK - 273.15);
```

- [ ] **Step 2: Run the focused test**

Run:

```powershell
npx vitest run src/engine/vlab/test_airfryer_sim.test.ts --reporter=verbose
```

Expected: the unit assertion passes; unrelated physical-calibration assertions may remain red until Task 3.

- [ ] **Step 3: Commit the conversion fix**

```powershell
git add src/engine/vlab/vlabPhysics.ts src/engine/vlab/test_airfryer_sim.test.ts
git commit -m "fix: convert air fryer scope temperature from kelvin"
```

### Task 3: Make electrical heating use RMS-equivalent average power

**Files:**
- Modify: `src/engine/vlab/vlabEquations.ts:585-596`
- Modify: `src/engine/vlab/vlabComponentDefinitions.ts` parameter documentation for `thermal_resistor`.
- Test: `src/engine/vlab/test_airfryer_sim.test.ts`

**Interfaces:**
- Consumes: AC source waveform amplitude and resistor parameters.
- Produces: average thermal power for an AC resistive heater without changing DC resistor behavior.

- [ ] **Step 1: Extend the heater parameters**

Add an explicit optional parameter such as `ac_rms: true` or `voltage_mode: 'peak' | 'rms'`; default existing generic resistor behavior to current semantics, and configure only the air-fryer heater for peak-to-RMS conversion.

- [ ] **Step 2: Implement the minimal AC power correction**

For the air-fryer AC path, calculate:

```ts
const vrms = vPeak / Math.sqrt(2);
const qAverage = (vrms * vrms) / R;
```

Keep the current `Q = I * I * R` behavior for non-AC uses.

- [ ] **Step 3: Assert the expected power**

Verify that `325 V peak` and `35 Ω` produce approximately `1511 W`, with a tolerance suitable for the solver’s numeric representation.

- [ ] **Step 4: Run focused tests and commit**

```powershell
npx vitest run src/engine/vlab/test_airfryer_sim.test.ts src/engine/vlab/thermal_blocks_validation.test.ts --reporter=verbose
git add src/engine/vlab/vlabEquations.ts src/engine/vlab/vlabComponentDefinitions.ts src/engine/vlab/test_airfryer_sim.test.ts
git commit -m "fix: use average rms heating power for air fryer ac heater"
```

### Task 4: Calibrate chamber thermal mass and heat loss

**Files:**
- Modify: `src/engine/vlab/vlabEquations.ts:1191-1212`
- Modify: `src/engine/vlab/vlabComponentDefinitions.ts` `ma_chamber` parameter documentation.
- Test: `src/engine/vlab/test_airfryer_sim.test.ts`

**Interfaces:**
- Consumes: chamber volume and optional thermal parameters.
- Produces: stable chamber temperature dynamics using configurable effective heat capacity and heat-loss coefficient.

- [ ] **Step 1: Add explicit parameters**

Support `thermal_mass` or `heat_capacity` in J/K, plus `ambient_temp` in °C and `k_loss` in W/K. If no explicit capacity is supplied, calculate air capacity and add documented default wall/load capacity rather than using air alone.

- [ ] **Step 2: Preserve Kelvin internally**

Convert the ambient parameter once to Kelvin and use Kelvin consistently in energy balance equations:

```ts
const T_ambC = Number(params.ambient_temp ?? 25);
const T_amb = T_ambC + 273.15;
const C = Number(params.heat_capacity ?? airCapacity + wallCapacity + loadCapacity);
```

- [ ] **Step 3: Add realistic default air-fryer values**

Use documented defaults representing air, basket/walls, and a modest food load. Ensure the resulting capacity is orders of magnitude larger than the current approximately `6 J/K` air-only value.

- [ ] **Step 4: Add a heating-rate regression assertion**

Run the standard learning fixture for a bounded interval and assert that it does not jump to several hundred Celsius immediately and trends toward a plausible controlled operating range.

- [ ] **Step 5: Run and commit**

```powershell
npx vitest run src/engine/vlab/test_airfryer_sim.test.ts --reporter=verbose
git add src/engine/vlab/vlabEquations.ts src/engine/vlab/vlabComponentDefinitions.ts src/engine/vlab/test_airfryer_sim.test.ts
git commit -m "fix: calibrate air fryer chamber thermal dynamics"
```

### Task 5: Add generic over-temperature protection for the air-fryer chamber

**Files:**
- Modify: `src/engine/vlab/vlabEquations.ts:1191-1212`
- Modify: `src/engine/vlab/vlabComponentDefinitions.ts`
- Test: `src/engine/vlab/test_airfryer_sim.test.ts`

**Interfaces:**
- Consumes: `max_temp` in °C and chamber heat input.
- Produces: smoothly reduced heater input as the chamber approaches the configured safety limit.

- [ ] **Step 1: Add the failing cutoff test**

Configure `max_temp: 220` and assert that the simulated temperature does not continue increasing beyond the safety band after the cutoff engages.

- [ ] **Step 2: Implement a smooth cutoff**

Convert the limit to Kelvin and multiply incoming heat by a bounded smooth factor, matching the existing microwave-cavity safety pattern.

- [ ] **Step 3: Run focused thermal tests**

```powershell
npx vitest run src/engine/vlab/test_airfryer_sim.test.ts src/engine/vlab/thermal_blocks_validation.test.ts --reporter=verbose
```

- [ ] **Step 4: Commit**

```powershell
git add src/engine/vlab/vlabEquations.ts src/engine/vlab/vlabComponentDefinitions.ts src/engine/vlab/test_airfryer_sim.test.ts
git commit -m "feat: add air fryer thermal safety cutoff"
```

### Task 6: Verify the complete VLab behavior

**Files:**
- Test: `src/engine/vlab/test_airfryer_sim.test.ts`
- Review: `src/engine/vlab/vlabPhysics.ts`, `src/engine/vlab/vlabEquations.ts`, `src/engine/vlab/vlabComponentDefinitions.ts`

- [ ] **Step 1: Run the complete VLab test suite**

```powershell
npx vitest run src/engine/vlab --reporter=verbose
```

- [ ] **Step 2: Check the final expected behavior**

Confirm that the scope label is Celsius, the numerical value is Celsius, a 618 K internal state appears as approximately 345 °C, the heater power is RMS-equivalent, and the chamber remains bounded by the configured safety limit.

- [ ] **Step 3: Run the project quality checks**

```powershell
npm run lint
npm run build
```

- [ ] **Step 4: Review the diff for scope**

```powershell
git diff --check
git status --short
```

- [ ] **Step 5: Commit the verified implementation**

```powershell
git add src/engine/vlab docs/superpowers/plans/2026-09-14-air-fryer-temperature-calibration.md
git commit -m "fix: make air fryer learning model physically consistent"
```

## Self-Review

- Unit conversion is covered by a direct regression test.
- AC peak-versus-RMS behavior is covered by a numerical power test.
- Thermal capacity and heat loss are covered by a bounded heating-rate test.
- Safety cutoff behavior is covered by a temperature-limit test.
- The plan preserves generic VLab behavior outside the air-fryer learning path.
- No implementation is claimed until the focused suite, full VLab suite, lint, and build pass.
