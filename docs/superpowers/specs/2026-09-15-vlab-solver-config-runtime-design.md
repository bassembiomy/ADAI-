# V-Lab Solver Configuration Runtime Propagation Design

**Date:** 2026-09-15

## Goal

Ensure that a `solver_config` block is the effective source of truth for its V-Lab model: edits apply to the next simulation run and, where safe, to a simulation already in progress.

## Current Context

The repository already has a typed `SolverConfiguration`, a `SolverManager`, solver implementations, a physical-network extractor, and a `VLabWorkspace` inspector for the `solver_config` block. The risk is propagation: the UI may update node parameters while the simulation job or active solver continues using an earlier configuration snapshot.

## Design

### Configuration ownership

The `solver_config` node owns the persisted configuration values. The workspace maps its parameters into a validated `SolverConfiguration` whenever the model is compiled or the configuration node changes.

The mapping must support the existing fields in `src/engine/vlab/kernel/types.ts`, including solver selection, start/stop time, initial/max step, relative/absolute tolerances, and diagnostics settings. Numeric values are normalized at the boundary; invalid or non-finite values fall back to documented defaults or produce a validation diagnostic.

### Runtime propagation

Each simulation job receives a mutable runtime configuration object owned by the simulation controller. The active solver reads configuration through that object at solver-step boundaries rather than retaining an untracked copy.

The runtime exposes an update operation with this behavior:

- Solver method changes are applied at the next safe solver boundary; if the current solver cannot switch in place, the manager reconstructs the solver while preserving the current state.
- Time-step limits, tolerances, stop time, and diagnostic flags are applied before the next step.
- The current state, simulation time, and recorded outputs are preserved when configuration is updated.
- A new run always rebuilds the configuration from the current `solver_config` node, preventing stale settings.

### UI-to-runtime data flow

`VLabWorkspace` updates the selected node’s parameters, derives a typed configuration, and notifies the active simulation controller. The controller validates and atomically replaces the runtime configuration. The simulation loop observes the replacement at a step boundary.

If no active simulation exists, the latest node parameters remain available for the next run. If a configuration is invalid, the UI retains the edited value for correction but the runtime does not apply it; the user receives a clear diagnostic identifying the field and allowed range.

### Scope and association

The physical network extractor continues to associate exactly one `solver_config` block with each network. The runtime must use the configuration associated with the compiled network, not the first configuration found in an unrelated model or a global default.

## Testing Strategy

Add regression tests at three boundaries:

1. Extraction/normalization: node parameters become the expected typed `SolverConfiguration`, including changed values and invalid-value handling.
2. Solver manager: a job uses the supplied configuration, and an update changes solver method, tolerances, step limits, or stop time without resetting state.
3. Workspace/runtime integration: editing the block changes the next run and sends an update to an active simulation.

Tests must assert observable behavior, not only that an object was constructed. For example, a changed `maxStep` must change the solver’s accepted step bound, and a changed `stopTime` must alter the run termination time.

## Non-Goals

- No redesign of the VLab block UI.
- No changes to unrelated physical equations or non-VLab simulations.
- No requirement to interrupt a solver in the middle of a numerical step.
- No silent fallback to a different network’s configuration.

## Acceptance Criteria

- Changing any supported solver setting before starting a run affects that run.
- Changing a safe setting during a run affects the next solver step.
- Changing solver method during a run either switches safely or restarts only the solver instance while preserving model state and output history.
- Invalid configuration values never reach solver internals unvalidated.
- Tests prove configuration propagation at extraction, manager, and workspace boundaries.
