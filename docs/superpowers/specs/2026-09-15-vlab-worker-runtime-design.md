# Generic V-Lab Worker Runtime

## Goal

Prevent any V-Lab model from blocking the React/Electron UI while preserving the existing numerical engine, solver settings, timestep handling, and output values.

## Design

V-Lab simulation steps run in a dedicated module worker. The worker receives serializable nodes, edges, solver configuration, previous engine state, and a requested timestep. It constructs or reuses `VLabPhysicsEngine`, executes exactly the same `simulateStep` call, and returns the resulting state and scope values. The UI remains responsible for rendering, sampling, and user controls.

The worker protocol supports step, reset, and dispose messages. Requests are sequenced so stale results cannot overwrite newer simulation state. Worker failures are reported to the existing simulation error path. A synchronous engine path remains available as a compatibility fallback when workers are unavailable.

## Accuracy and behavior

No solver equations, tolerances, timestep values, or model parameters are changed. The worker only changes execution context. Pause, stop, restart, scope decimation, and per-scope routing retain their current behavior.

## Verification

Add protocol tests for request sequencing and error propagation, then run the existing V-Lab test suites and TypeScript build.
