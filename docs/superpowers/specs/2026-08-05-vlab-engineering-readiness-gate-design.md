# V-Lab Engineering Readiness Gate Design

**Date:** 2026-08-05  
**Status:** Approved design  
**Scope:** Mathematical, solver, and simulation certification for all V-Lab blocks and representative connected models

## 1. Objective

Create a blocking engineering-readiness gate for V-Lab, a Simscape-like physical modeling environment. The gate must verify that every library block implements its documented mathematical behavior and that connected physical networks produce accurate, stable, deterministic simulations.

The first certification layer uses independent analytical equations, manufactured solutions, conservation laws, and numerical convergence studies. MATLAB/Simulink/Simscape trace comparison is deferred to a later certification layer and is not required for this implementation.

## 2. Acceptance Scope

The gate covers:

- All 241 blocks currently exposed by `VLAB_LIBRARY` across all 12 domains.
- Every corresponding equation factory in `blockEquations`.
- Algebraic, dynamic, nonlinear, source, sensor, controller, converter, utility, and multi-domain coupling blocks.
- DAE assembly, nonlinear iteration, sparse linear solving, timestep handling, state continuity, topology changes, and simulation repeatability.
- Representative connected models for each major physical domain and for multi-domain systems.

No production block may be silently excluded. Test harness blocks such as scopes and references still require explicit behavioral contracts appropriate to their role.

## 3. Architecture

### 3.1 Validation contract registry

Every V-Lab block has exactly one `VLabValidationContract`. A contract contains:

- Stable block ID and domain.
- Governing equation reference.
- Across and through variables with SI units.
- Port-domain and sign conventions.
- Nominal and boundary parameter sets.
- Required supporting network topology.
- Initial conditions and simulation horizon.
- Observable variables and extraction rules.
- Analytical or manufactured reference solution.
- Algebraic, transient, conservation, and monotonicity invariants.
- Absolute, relative, residual, conservation, and convergence tolerances.

Catalog completeness is bidirectional: every library block must have one contract, and every contract must resolve to one library block and one equation factory.

### 3.2 Validation harness

The common harness:

1. Builds a valid physical network around the device under test.
2. Verifies parameters, ports, units, and domain compatibility.
3. Runs the V-Lab simulation at specified timesteps.
4. Extracts named observations without relying on private variable ordering where a stable semantic identifier is available.
5. Compares results with the contract oracle.
6. Records solver iterations, residuals, state values, conservation balances, and errors.
7. Returns structured evidence instead of unconditional or diagnostic-only assertions.

Missing observations, fallback values, and empty trajectories are failures. The harness must never substitute an analytical expected value when the simulated value cannot be found.

### 3.3 Solver certification

Solver certification is independent of individual block contracts and covers:

- DAE residual norm at accepted steps.
- Newton iteration convergence and iteration limits.
- Sparse linear solver residual and pivot behavior.
- Timestep-halving studies using at least three step sizes.
- Observed numerical convergence rate appropriate to the implemented method.
- Deterministic repeated execution.
- Initial-condition consistency.
- Stiff and moderately ill-conditioned systems within documented limits.
- Clean failure diagnostics for singular, invalid, or non-convergent systems.

The gate uses combined absolute and relative tolerances. It does not use one percentage tolerance for all quantities.

### 3.4 Connected-model benchmarks

Connected benchmarks validate equations in network context:

- Electrical: resistor network, RC, RL, RLC, and nonlinear diode load.
- Translational mechanics: mass-spring-damper step and free response.
- Rotational mechanics: inertia-damper and geared drivetrain.
- Thermal: thermal mass with conduction and convection.
- Fluid: tank level with restrictive flow path.
- Gas: pressure storage and resistive flow network.
- Magnetic: reluctance circuit with source and sensor.
- Control/physical signals: closed-loop controlled plant with saturation and reset.
- Electromechanical: DC motor with electrical and mechanical dynamics.
- Multi-domain appliance: electrical input, energy conversion, thermal or mechanical load, and sensors.

Each benchmark defines independent reference equations, initial conditions, measurable outputs, conservation checks, solver settings, and acceptance tolerances.

## 4. Block Validation Classes

Contracts use one or more validation classes:

1. **Algebraic/source:** exact nominal equation, sign convention, parameter boundaries, and zero-input behavior.
2. **Dynamic storage:** analytical transient, initial condition, state continuity, and timestep convergence.
3. **Nonlinear:** operating regions, continuity, limiting behavior, and finite-difference Jacobian comparison.
4. **Sensors/converters:** scale, sign, units, domain mapping, and non-intrusive behavior.
5. **Controllers/utilities:** transfer behavior, saturation, reset, timing, and invalid-parameter handling.
6. **Couplings:** power, energy, force, torque, heat, mass-flow, or flux consistency across domains.

## 5. Numerical Acceptance Policy

Every comparison declares:

- Absolute tolerance for values near zero.
- Relative tolerance for non-zero engineering values.
- Maximum DAE residual norm.
- Conservation error normalized by input or stored quantity.
- Expected convergence-rate range when timestep refinement applies.

Tolerance values are derived from equation scale, solver order, timestep, conditioning, and numeric representation. Loosening a tolerance requires a documented reason in the contract and review of the produced error evidence.

## 6. Hard Failure Conditions

The gate fails on any of the following:

- Missing or duplicate block contract.
- Missing equation factory or unresolved library block.
- Missing observation, expected result, or unit declaration.
- NaN, Infinity, invalid state dimension, or empty trajectory.
- Solver exception, singular system, or non-convergence outside a deliberately negative test.
- DAE residual, conservation, or analytical error above tolerance.
- Incorrect timestep-convergence behavior.
- Silent zero-residual, zero-output, or expected-value fallback.
- Non-deterministic repeated results.
- Invalid parameter acceptance or incorrect boundary handling.
- Port-domain, unit, scaling, or sign mismatch.

Diagnostic tests that use unconditional assertions such as `expect(true).toBe(true)` cannot satisfy certification coverage.

## 7. Execution Tiers

### 7.1 Pull-request gate

The fast blocking PR gate runs:

- Catalog/contract/equation completeness.
- Schema, unit, port, and parameter validation.
- Nominal contract cases for every block when inexpensive.
- Critical algebraic and transient cases.
- Solver smoke, residual, and deterministic-repeat checks.
- At least one connected benchmark per major domain.

The target is actionable feedback suitable for normal development.

### 7.2 Release gate

The complete blocking release gate runs:

- All 241 block contracts.
- Nominal, boundary, and representative parameter sweeps.
- Timestep-halving convergence studies.
- Nonlinear-region and Jacobian checks.
- Conservation and energy/power balance checks.
- All connected and multi-domain benchmarks.
- Repeated-run determinism checks.
- Certification report generation.

## 8. Evidence and Reporting

Each run produces machine-readable JSON and a human-readable Markdown report. Every result includes:

- Block/model ID and domain.
- Governing equation reference.
- Parameters, units, initial conditions, and topology identifier.
- Solver method, timestep, horizon, and iteration statistics.
- Observed and expected values or trajectories.
- Absolute error, relative error, residual norm, conservation error, and convergence rate.
- Applied tolerances.
- Pass/fail result and precise diagnostic message.

The process exits non-zero when any required result fails. Reports must not mark finite zero output as success unless zero is the contractually expected physical result.

## 9. Test Organization

The implementation should separate:

- Contract types and registry.
- Reusable analytical oracles and numerical metrics.
- Network/scenario builders.
- Observation extraction.
- Generated per-block Vitest cases.
- Solver certification tests.
- Connected-model benchmark tests.
- CLI runner and report serializers.

This keeps mathematical definitions reviewable and prevents a single large test file from mixing topology construction, solver execution, and acceptance logic.

## 10. Migration of Existing Tests

Existing V-Lab tests remain useful as regression or diagnostic coverage but do not count as certification unless they make meaningful assertions. The current mathematical benchmark attempt must be replaced or strengthened where it only checks finite values, returns zero-valued placeholders, or falls back to the analytical expected value when an observation cannot be extracted.

## 11. Delivery Sequence

1. Build contract types, metrics, evidence schema, and catalog completeness gate.
2. Implement stable observation extraction and scenario builders.
3. Certify solver and DAE infrastructure.
4. Add contracts domain by domain for all blocks.
5. Add connected and multi-domain benchmarks.
6. Add PR/release commands and reporting.
7. Run the complete gate, classify failures, and fix engine defects separately with regression tests.

## 12. Completion Criteria

The V-Lab readiness gate is complete when:

- All 241 library blocks are represented by enforceable contracts.
- No contract relies on unconditional assertions or hidden expected-value fallbacks.
- Solver certification and all connected benchmarks pass their declared tolerances.
- PR and release commands fail reliably on injected mathematical defects.
- JSON and Markdown evidence identify every checked equation and result.
- The complete release gate exits successfully with zero uncertified production blocks.

