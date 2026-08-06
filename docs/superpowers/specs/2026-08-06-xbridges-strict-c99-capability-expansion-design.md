# X-Bridges Strict-C99 Capability Expansion Design

**Date:** 2026-08-06

## Purpose

Add deterministic embedded code-generation support for the selected unsupported
X-Bridges blocks. Delivery is family-by-family: a block remains fail-closed
until its semantic contract, canonical interpreter, generated C, float32 and
fixed-point behavior, and executable conformance evidence are complete.

## Assurance Boundary

The target is a generic bounded embedded profile with configurable compile-time
limits. Generated code must use strict C99, static model-sized storage, bounded
loops, fixed-width indices, and deterministic behavior. Heap allocation,
recursion, variable-length arrays, unbounded retries, and hidden global mutable
state are prohibited.

This program provides host-compiled strict-C99 and canonical-interpreter
equivalence evidence. MCU compiler qualification, target WCET, SIL/PIL, HIL,
MISRA certification, code signing, and functional-safety certification remain
separate downstream gates.

## Scope

### Included non-robot blocks

- Math and reductions: `VectorPow`, `SumElements`, `Mean`, `Max`,
  `IdentityMatrix`.
- Digital primitives: `DFlipFlop`, `JKFlipFlop`, `Register`, `Counter`,
  `Clock`, `WaveformGen`.
- Filters and dynamic systems: `LOW_PASS_FILTER`, `HIGH_PASS_FILTER`,
  `MOVING_AVERAGE`, `TRANSFER_FUNCTION`, `ZERO_POLE_GAIN`,
  `LAPLACE_TRANSFORM`, `DERIVATIVE`, `INTEGRATOR`.
- Controllers and switching: `PID_CONTROLLER`, `SIX_STEP_COMMUTATION`.
- Noise and estimation: `WHITE_NOISE`, `BAND_LIMITED_NOISE`, `KALMAN_FILTER`,
  `EXTENDED_KALMAN_FILTER`.
- Bounded optimization and adaptation: `MPC_CONTROLLER`,
  `LMS_ADAPTIVE_FILTER`.

### Included robot blocks

The following 57 runtime blocks are included:

- Hardware and sensing: `ROBOT_VACUUM_BATTERY`, `ROBOT_VACUUM_COMM`,
  `ROBOT_VACUUM_BUMPER_SENSOR`, `ROBOT_VACUUM_CLIFF_IR`,
  `ROBOT_VACUUM_DUSTBIN_SENSOR`, `ROBOT_VACUUM_MOTOR_CURRENT`,
  `ROBOT_VACUUM_ENCODER`, `ROBOT_VACUUM_LIDAR_SENSOR`,
  `ROBOT_VACUUM_ODOMETRY_SENSOR`, `ROBOT_VACUUM_DOCK_BEACON`, and
  `ROBOT_VACUUM_DIRT_DENSITY`.
- Dynamics and low-level control: `ROBOT_VACUUM_MOTOR`,
  `ROBOT_VACUUM_DYNAMICS`, `ROBOT_VACUUM_KINEMATICS`,
  `ROBOT_VACUUM_ODOMETRY`, `ROBOT_VACUUM_FUSION`,
  `ROBOT_VACUUM_LOCALIZATION`, `ROBOT_VACUUM_SENSOR_FUSION_EKF`,
  `ROBOT_VACUUM_WHEEL_CONTROL`, `ROBOT_VACUUM_VELOCITY_PID`,
  `ROBOT_VACUUM_MOTION_CONTROLLER`, `ROBOT_VACUUM_MOTOR_COMMAND`,
  `ROBOT_VACUUM_SIDE_BRUSH`, `ROBOT_VACUUM_SUCTION_PWM`,
  `ROBOT_VACUUM_SURFACE_ADAPTER`, `ROBOT_VACUUM_CLIFF_HALT`,
  `ROBOT_VACUUM_HALT_ALERT`, `ROBOT_VACUUM_CAPACITY_THRESHOLD`, and
  `ROBOT_VACUUM_DOCK_DETECT`.
- Perception and mapping: `ROBOT_VACUUM_LIDAR`,
  `ROBOT_VACUUM_ENVIRONMENT`, `ROBOT_VACUUM_TERRAIN_MODEL`,
  `ROBOT_VACUUM_COLLISION_MESH`, `ROBOT_VACUUM_MAPPING`,
  `ROBOT_VACUUM_SLAM`, `ROBOT_VACUUM_ROOM_SEGMENTATION`,
  `ROBOT_VACUUM_SEMANTIC_MAP`, `ROBOT_VACUUM_ERODE_MASK`,
  `ROBOT_VACUUM_DOOR_TRACKER`, and `ROBOT_VACUUM_DOOR_CROSSING`.
- Planning and behavior: `ROBOT_VACUUM_BOUSTROPHEDON_SWEEP`,
  `ROBOT_VACUUM_CONTINUOUS_ENERGY`, `ROBOT_VACUUM_COVERAGE`,
  `ROBOT_VACUUM_COVERAGE_PLANNER`, `ROBOT_VACUUM_DIGITAL_TWIN`,
  `ROBOT_VACUUM_GLOBAL_PLANNER`, `ROBOT_VACUUM_GOAL_MANAGER`,
  `ROBOT_VACUUM_NAV`, `ROBOT_VACUUM_OBSTACLE_AVOIDANCE`,
  `ROBOT_VACUUM_COLLISION_AVOID`, `ROBOT_VACUUM_RESUME_SCHEDULER`,
  `ROBOT_VACUUM_ROOM_SCHEDULER`, `ROBOT_VACUUM_THETA_STAR`,
  `ROBOT_VACUUM_TOPOLOGY_RETURN`, `ROBOT_VACUUM_WAYPOINT_GEN`,
  `ROBOT_VACUUM_BATTERY_MONITOR`, and `ROBOT_VACUUM_MODE_SUPERVISOR`.

### Excluded host-only blocks

Authoring and visualization blocks do not receive placeholder C emitters. They
remain host-only and fail closed when placed in an embedded state:

- `Note`, `ROOT_LOCUS`, and `Scope`.
- `ROBOT_VACUUM_3D_SCENE_VIEW`, `ROBOT_VACUUM_3D_VIZ_COLORS`,
  `ROBOT_VACUUM_BATTERY_HUD`, `ROBOT_VACUUM_COVERAGE_HEATMAP`,
  `ROBOT_VACUUM_DOCK_ICON`, `ROBOT_VACUUM_DUSTBIN_HUD`,
  `ROBOT_VACUUM_FURNITURE_MESH`, `ROBOT_VACUUM_ROOM_ZONE_COLORS`, and
  `ROBOT_VACUUM_VISUALIZATION`.

Blocks not explicitly listed in the included scope are not added implicitly by
this program.

## Vertical Implementation Contract

Every included block follows the same delivery path:

1. Define ports, shapes, parameters, state, scheduling, reset/retain behavior,
   numeric types, limits, faults, and deterministic fallbacks.
2. Validate exact dimensions, configured capacities, parameter ranges, numeric
   conversions, target requirements, and bounded-work guarantees before IR or C
   generation.
3. Implement corrected deterministic semantics in the canonical interpreter.
   Existing simulator behavior may be corrected; the simulator and generated C
   must then adopt the same documented contract.
4. Generate strict C99 with instance-owned static storage and statically bounded
   loops.
5. Register capability metadata only after executable interpreter and compiled-C
   cases cover every claimed shape and numeric profile.
6. Compare multi-tick interpreter and C traces, including outputs, internal
   state, stored integers, fault flags, and scheduling counters.

Shared kernels are introduced only when required by an active family. Expected
kernels include fixed-point arithmetic, matrix operations, ring buffers,
instance-local deterministic PRNG, bounded solvers, grid containers, path
containers, and bounded priority queues.

## Numeric and Storage Contract

Each applicable block supports float32 and fixed-point in the same delivery
wave.

Float32 execution uses explicit `float` storage and controlled narrowing points
so interpreter and C traces agree. Fixed-point execution explicitly models
signedness, word length, fraction length, rounding, overflow, accumulator width,
intermediate scaling, and stored-integer traces. Fixed-point implementations may
use widened bounded integer intermediates but must not silently fall back to
floating point.

The generator specializes storage from exact model dimensions. Array sizes,
filter order, state count, prediction horizon, control horizon, grid dimensions,
path capacity, and iteration ceilings become compile-time constants. Validators
calculate resource estimates and reject configurations above configurable
limits. Matrix and grid storage is row-major and contiguous.

Stateful blocks explicitly define initialization, reset and retain behavior,
sample time, scheduling, update ordering, previous-value fallback, and traceable
internal state.

## Fault Contract

The shared fault vocabulary is:

- `configuration-error`
- `numeric-overflow`
- `division-by-zero`
- `non-finite-result`
- `dimension-error`
- `iteration-limit`
- `singular-system`
- `invalid-state`
- `capacity-exceeded`
- `sensor-invalid`
- `no-feasible-solution`

Stateful filters, estimators, controllers, LMS, and MPC retain their previous
valid output and state on execution faults. Stateless operations publish zero or
a configured safe value. Robot motion and control failures publish a safe-stop
command. Mapping and planning capacity failures publish an empty bounded result
plus an explicit status.

Iterative algorithms such as MPC, Kalman variants, SLAM, and Theta* use fixed
iteration or work ceilings. Ceiling exhaustion produces a deterministic status
and fallback. Noise sources use an instance-local explicitly seeded PRNG with
defined reset/retain behavior. Identical models, seeds, inputs, and logical time
must produce identical traces.

Robot sensing, estimation, planning, and actuation expose separate status paths
so downstream safety logic can observe component failures.

## Delivery Waves

The work is divided into ten independently releasable waves:

1. Math and reductions.
2. Deterministic digital primitives.
3. Filters and dynamic systems.
4. Controllers and switching.
5. Noise and estimation.
6. Bounded optimization and adaptation.
7. Robot hardware and sensing.
8. Robot dynamics and low-level control.
9. Robot perception and mapping.
10. Robot planning and behavior.

Each wave completes its entire vertical contract before the next wave begins.
Later waves may consume verified kernels from earlier waves, but an unfinished
later family cannot weaken or bypass an earlier capability gate.

Because the ten waves cover independent execution architectures, each wave will
receive its own implementation plan and review checkpoint. Robot waves may be
split into smaller task batches within their plan, but their capability entries
remain disabled until the whole claimed contract is executable.

## Verification Gate

Before any block becomes code-generation capable, it must pass:

1. Contract tests for valid and invalid dimensions, parameter limits,
   scheduling, reset/retain behavior, and both numeric profiles.
2. Canonical interpreter tests for nominal execution, boundary values,
   multi-tick state, every fault, and every fallback.
3. Production generated-C compilation with
   `-std=c99 -pedantic-errors -Wall -Wextra -Werror`.
4. Interpreter-versus-C comparison of outputs, state, stored integers, faults,
   and schedule counters.
5. Independent analytical or reference traces appropriate to the family.
6. Resource checks for RAM, flash, stack, configured capacities, and bounded
   work.
7. Static checks forbidding heap allocation, recursion, VLAs, and mutable global
   runtime state.
8. Mixed-family state-machine regressions covering entry, exit, history, reset,
   parallel states, numeric faults, and package compilation.
9. Documentation synchronization with the authoritative capability registry.

Noise reference tests include deterministic sequence checks and bounded
statistical checks. Controller tests include known step responses and saturation
cases. Kalman and MPC tests use independent reference traces and infeasible or
iteration-limit cases. Robot tests use deterministic sensor traces, maps, paths,
localization sequences, and actuator commands.

## Acceptance Criteria

- Every included block has an explicit bounded semantic contract.
- Every applicable block supports both float32 and fixed-point without an
  undocumented numeric fallback.
- Generated packages use only static model-sized storage and bounded work.
- Oversized or invalid configurations fail before C generation.
- Every enabled capability has paired executable interpreter and strict-C99
  evidence for all claimed shapes and numeric profiles.
- No authoring or visualization block is falsely presented as an embedded
  runtime capability.
- Existing supported X-Bridges and state-machine behavior remains green.
- Documentation distinguishes host C99 assurance from target/HIL qualification.

## Non-Goals

- Placeholder or no-op embedded implementations for visualization blocks.
- Dynamic allocation or desktop-runtime dependencies in generated code.
- Automatic enablement of unsupported blocks outside the explicit scope.
- Target-specific optimization before portable strict-C99 conformance exists.
- Claims of WCET, MISRA, MCU, HIL, or functional-safety qualification.
