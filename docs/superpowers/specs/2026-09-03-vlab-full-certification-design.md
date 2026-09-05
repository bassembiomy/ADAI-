# V-Lab Full Certification Test Design

**Date:** 2026-09-03

**Status:** Approved for implementation planning

## Objective

Create one user-facing Vitest certification file that automatically validates every block in the live V-Lab catalog across every domain. The gate must cover catalog metadata, declared ports, equation factories, numerical behavior, and representative connected simulations. It must provide actionable domain-and-block-specific diagnostics and be runnable through a dedicated npm command.

## Scope

The deliverable consists of:

- `src/engine/vlab/vlab_full_certification.test.ts`, the master certification suite.
- A `test:vlab:full` script in `package.json` that runs the master suite with a verbose reporter.
- Production fixes only when the new certification suite exposes a genuine defect. Every such fix must start with a failing certification test and remain narrowly scoped to that defect.

The suite discovers domains and blocks from `VLAB_LIBRARY`; it does not hard-code the current catalog total of 242 blocks. A newly added catalog block must automatically enter the gate.

## Architecture

The master suite uses a data-driven inventory derived from `VLAB_LIBRARY`. It reuses `blockEquations`, `DAEAssembler`, the validation contracts, the existing block validation harness where its assertions are meaningful, and existing analytical or connected-model infrastructure where practical.

The suite contains four certification layers:

1. Catalog and domain integrity.
2. Port contract integrity.
3. Equation-factory and numerical integrity.
4. Representative connected-domain readiness.

Each layer accumulates structured issues rather than failing at the first block. At the end of the layer, the test prints and asserts on the complete issue list so one run gives the user a useful repair inventory.

## Catalog and Domain Integrity

The suite must assert that:

- The catalog contains at least one domain.
- Every domain has a nonempty, unique name and contains at least one block.
- Every block ID is nonempty and globally unique.
- Every block has a nonempty name, icon, color, description, and displayed equation.
- Every block has a parameter object and a port array.
- Every parameter has a nonempty label and a string unit. An empty unit is valid only for dimensionless, boolean, enumerated, or text-valued controls; numeric physical quantities must declare a unit or use `1` explicitly.
- Every catalog block has an equation factory and a validation contract.
- No equation factory or validation contract is orphaned, except intentional framework aliases already represented by structural types such as alternate subsystem/inport/outport capitalization. Intentional aliases must be named in an explicit allowlist.

Coverage totals must come from the live inventory and must be included in failure diagnostics.

## Port Contract Integrity

The actual V-Lab port schema defines `id`, `pos`, optional `label`, and optional `domain`. It does not define a separate input/output direction field. The suite therefore validates the real contract rather than inventing direction metadata.

For every block, the suite must assert that:

- Each port ID is nonempty and unique within the block.
- Each position is one of `left`, `right`, `top`, or `bottom`.
- A supplied port domain is a recognized physical or signal domain used by the compiler.
- Labels, when supplied, are nonempty.
- The block can be passed to `DAEAssembler` with all declared port handles without producing invalid system dimensions or non-finite initial data.
- Representative compatible connections for each physical domain preserve the declared handle IDs through assembly.

Zero-port structural or utility blocks are permitted only when their role does not require an external connection. Their equation, metadata, and assembly contracts remain mandatory.

## Equation and Numerical Integrity

For each catalog block, the suite invokes its equation factory with deterministic arrays for across variables, derivatives, branch variables, internal states, time context, parameters, and declared port IDs.

Each executable factory must:

- Return an array.
- Return only finite numbers.
- Return the same residual count for repeated calls with equivalent inputs.
- Return identical values for repeated deterministic calls.
- Leave every supplied input array and parameter object unchanged.
- Execute with nominal catalog parameters.
- Execute with low and high boundary parameter cases derived from its validation contract.

Factories must not be considered mathematically certified merely because they return a finite constant. For representative governing equations in each behavior family, the suite uses independent reference values and explicit tolerances. The families include algebraic passive elements, dynamic storage elements, nonlinear switching or flow elements, sensors, sources, controllers, and cross-domain couplers.

Structural factories that intentionally contribute no residual equation—such as ground-like topology helpers, subsystems, inports, and outports—must be listed in an explicit allowlist. They still undergo catalog, port, assembly, determinism, and immutability checks.

Numerical comparisons use combined absolute and relative tolerance checks. Tolerances come from validation contracts when present; any family-specific override must be declared beside its independent reference case with a reason.

## Connected-Domain Readiness

The master gate runs at least one representative connected model for each supported behavior group:

- Electrical.
- Translational mechanical.
- Rotational mechanical.
- Thermal.
- Fluid or gas.
- Magnetic.
- Physical signal and control.
- Electromechanical coupling.

These cases reuse existing benchmark fixtures when they already provide independent analytical expectations. Each case must verify finite state, stable dimensions, expected signal propagation, and a physically meaningful reference result such as Ohm's law, RC response, force/velocity response, heat conduction, pressure/flow relation, magnetic flux relation, gain/saturation behavior, or DC motor conversion.

The connected cases certify domain wiring and system behavior; they do not replace the per-block equation sweep.

## Diagnostics

Failures are collected as strings containing the domain, block ID, certification phase, and observed defect. Examples:

- `Electrical/resistor [ports]: duplicate port id "p"`
- `Thermal/thermal_mass [equation]: returned NaN for high-boundary case`
- `Mechanical/mass [equation]: residual count changed from 1 to 0`
- `Fluid/orifice [assembly]: declared handle "a" was not preserved`

The suite must not catch and ignore exceptions. Caught exceptions are converted into certification issues containing the exception message. Console output is limited to a compact inventory summary and the complete issue list on failure.

## Acceptance Criteria

The implementation is accepted when:

- `npm run test:vlab:full` exists and executes the master file.
- Every block in the live catalog is visited by catalog, port, and equation checks.
- Missing and orphaned coverage is zero after applying only documented structural aliases.
- Every declared port satisfies the real `VLabPort` contract and its relevant assembly checks.
- Every executable factory is finite, deterministic, dimensionally stable, and input-immutable under nominal and boundary cases.
- Independent reference equations pass their declared tolerances.
- Every connected behavior-group benchmark passes.
- The full master command exits with code 0.
- The wider existing V-Lab regression command still exits with code 0.
- TypeScript compilation succeeds for the affected project.

## Non-Goals

- Replacing every existing focused V-Lab test file.
- Hard-coding the current number of catalog blocks.
- Claiming full physical accuracy from finite-output smoke tests alone.
- Adding artificial direction properties to the existing port model.
- Broad refactoring of the solver, library, or equation registry unrelated to a demonstrated certification failure.
