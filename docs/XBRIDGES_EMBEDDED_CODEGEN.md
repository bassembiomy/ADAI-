# X-Bridges Embedded C Code Generation

## Purpose and assurance boundary

ADIA generates a statically allocated C99 state-machine package for validated
X-Bridges models owned by ordinary states. The simulator and generated code use
the same semantic model and execution order. This is a behavioral-compatibility
target inspired by Stateflow and Simulink; it is not MathWorks-generated code,
MathWorks certification, MISRA certification, a safety case, WCET evidence, or
target-hardware qualification.

Always treat a successful generation as the start of MCU integration testing.
Compile with the target compiler, run SIL/PIL or HIL tests, measure timing and
stack usage, and complete the project's safety process before release.

## Embedded capability matrix

`src/utils/stateMachine/xbCapabilities.ts` is the authoritative registry.
Generation is opt-in: a type is embedded-capable only when its entry has
`codegen: true`. Unknown types and explicit host-only types stop generation with
`XB_BLOCK_NOT_CODEGEN_CAPABLE`; they are never silently omitted or converted to
pass-through behavior.

| Family | Embedded-capable block types |
|---|---|
| Sources and mappings | `Constant`, `Inport`, `Outport` |
| Arithmetic | `Sum`, `SUM_JUNCTION`, `GAIN`, `PRODUCT`, `VectorAdd`, `VectorSub`, `VectorMul`, `VectorDiv`, `UnaryNeg`, `Abs` |
| Matrix | `MatrixMul`, `Transpose`, `MatrixConcat`, `MatrixDiag`, `SubMatrix`, `MatrixSolve` |
| Logic | `AND`, `OR`, `NOT` |
| Routing | `TERMINATOR` |
| Stateful | `DELAY`, `UNIT_DELAY`, `MEMORY`, `INTEGRATOR_DISCRETE`, `INTEGRATOR_CONTINUOUS`, `Integrator` |
| Control and linear systems | `PID_BASIC`, `DISCRETE_TRANSFER_FUNCTION`, `STATE_SPACE` |
| Motor transforms | `CLARKE_TRANSFORM`, `PARK_TRANSFORM`, `INVERSE_PARK`, `INVERSE_CLARKE` |
| Numeric conversion | `DATA_TYPE_CONVERSION`, `NUMERIC_REPRESENTATION` |

Support is conditional on valid static dimensions, parameters, numeric types,
sample times, mappings, and target capabilities. Current target limits are a
maximum vector length of 16 and maximum matrix dimension of 8. `MatrixSolve`
also requires a configured maximum dimension from 1 through 8. `PID_BASIC`
requires a positive discrete `sampleTime`; `STATE_SPACE` requires the
`discrete` representation.

### Host-only and unsupported blocks

The following categories are explicitly rejected because no paired canonical
interpreter and strict-C99 embedded conformance case is registered:

- `Step`, `VectorPow`, reductions, `IdentityMatrix`, extended logic/bitwise,
  switches/muxes, low/high-pass and moving-average filters, and the standalone
  trigonometric family. Some have a partial emitter or host implementation, but
  partial support is not enough to authorize embedded generation;
- digital/UI simulation helpers such as flip-flops, registers, counters,
  clocks, waveform generators, notes, subsystems, inverse, and determinant;
- PWM, inverter, motor, FOC/SVPWM, estimator, Kalman, MPC, transfer-function,
  derivative, noise, impulse, Laplace, root-locus, and DOE variants not named in
  the supported table;
- neural, reinforcement-learning, adaptive-learning, and optimization blocks;
- robot-vacuum navigation, perception, mapping, planning, digital-twin,
  visualization, sensor, actuator, and supervisory blocks;
- fuzzy inference, membership, rule, controller, defuzzification, and surface
  visualization blocks;
- DEM, CFD, fabric, co-simulation, and surrogate-learning blocks.

`Scope` is host visualization. `LMS_ADAPTIVE_FILTER` and the other learning
blocks require online learning. `PID_CONTROLLER` lacks a compiled-C conformance
contract; use `PID_BASIC` for the embedded path. The generated testing report
lists every registered unsupported type and its exact reason. A block may remain
available in normal application simulation while being rejected for embedded C.

## Numeric behavior

### Fixed point

A fixed type records signedness, a word length from 1 through 32, and an integer
fraction length. Values are represented by stored integers with a binary-point
scale; generated arithmetic uses bounded, widened intermediates before explicit
conversion. Dynamic sizing and unsafe intermediate widths are rejected.

Supported rounding policies are:

| Policy | Rule |
|---|---|
| `floor` | toward negative infinity |
| `ceiling` | toward positive infinity |
| `zero` | toward zero |
| `nearest` | nearest, ties toward positive infinity |
| `round` | nearest, ties away from zero |
| `convergent` | nearest, ties to even |
| `simplest` | must be resolved to a concrete policy during semantic construction |

Overflow is `saturate`, two's-complement modular `wrap`, or `error`. Conversion
blocks use real-world-value conversion by default; stored-integer
reinterpretation occurs only when explicitly selected. Vector elements and
row-major matrix elements are converted in deterministic index order.

### Floating point and target requirements

The production target profile enables float32 and the math library. It disables
float16 and float64. Float32 conversion uses IEEE-style single-precision storage
semantics; float64 and float16 models fail target validation unless a future
target profile explicitly enables and qualifies them. Trigonometric and motor
transform blocks require target math-library support and normally require
linking the target equivalent of `libm` (for GCC-like host builds, `-lm`).

The application interpreter can evaluate additional floating formats for
analysis, but that does not override the embedded target profile.

## Timing and solver rules

- The model selects fixed-step `euler` or `rk4`; variable-step generation is not
  supported.
- Solver step size must be finite, positive, and divide the state-machine base
  tick exactly. Substep count is fixed at generation time.
- A discrete sample time must be a positive integer multiple of the solver
  step. Scheduling uses integer counters, not accumulated floating time.
- Discrete outputs retain their last value between scheduled executions
  (zero-order hold).
- The simulator must run the same solver, step, schedule, numeric policy, and
  target capability assumptions when differential parity is required.

## State ownership, history, and lifecycle

An X-Bridges model belongs to an ordinary state. Its default memory policy is
`reset`: state slots initialize on every ordinary state entry. `retain` keeps
the slots while the owner is inactive. `SM_Reset()` initializes all X-Bridges
memory regardless of the entry policy.

Shallow and deep history restore state-machine configuration. They do not
silently change X-Bridges memory policy: history plus `reset` reinitializes the
re-entered owner's block memory, while history plus `retain` preserves it.

## Stateflow-style execution order

For one active owner state, each tick executes:

1. outer transitions;
2. if no outer transition exits, the textual `during` action;
3. `SM_XB_<STATE>_Step(instance)`;
4. mapped X-Bridges outputs committed to state-machine variables;
5. inner transitions, which can observe those same-tick outputs;
6. active child states.

Parents execute before children. Parallel regions execute in deterministic
semantic priority order. This selected ordering is tested for simulator/C
parity, but it is not a claim that every MathWorks Stateflow option or Simulink
block semantic is implemented.

## Numeric faults and safety behavior

Runtime faults include fixed overflow configured as `error`, non-finite
floating results, unsupported floating formats, division by zero, and bounded
matrix-solve pivot failure. An operation's fault flag is cleared at the start of
the next state tick and remains sticky across all substeps of the current tick.
Stateful operations update transactionally: a fault retains the previous output
and block state rather than committing a partial multi-element update.

With `signal-only`, the block publishes its error indication and deterministic
fallback while the state machine continues. With `escalate`, generated code sets
`SM_ERR_XBRIDGES_NUMERIC`, latches the state-machine fault, applies configured
safe outputs, and suppresses the watchdog kick through the normal safety path.
Target integration must implement and verify the safe-output behavior.

## Generated package and MCU integration

Every package contains `sm_config.h`, `sm_core.h/.c`, `sm_safety.h/.c`,
`sm_user_logic.h/.c`, `mcal_dio.h`, `sm_testing_report.md`, and
`static_metrics_report.md`. A model with at least one X-Bridges owner also
contains `sm_xbridges.h/.c`. Host-test stubs are generated only when explicitly
requested.

MCU integration procedure:

1. Add all generated `.c` files to the target build and expose their headers on
   the include path. Compile as C99 with warnings treated as errors.
2. Replace the MCAL boundary with target implementations of
   `MCAL_Dio_ReadChannel`, `MCAL_Dio_WriteChannel`, `MCAL_ApplySafeOutputs`, and
   `MCAL_Watchdog_Kick`; do not add target-register access to application or
   X-Bridges generated files.
3. Link the qualified math library when the report lists `math-library`.
4. Allocate one `ADIA_Instance_t` in caller-owned static memory. Call
   `SM_Init()` before use; it clears the full structure before entry or tracing.
5. Call `SM_Step(instance, elapsed_ms)` at the configured base tick. Do not call
   generated `SM_XB_*` functions independently from an ISR or second task.
6. Use `SM_GetError()` and the project's diagnostics path to handle latched
   faults. Verify safe outputs and watchdog behavior on the actual target.
7. Review both generated reports. `STATIC_ANALYSIS_ONLY` means host/runtime
   execution was not recorded; it is not an executable PASS.

Do not edit generated files as the long-term fix. Change the model, registry,
semantic builder, or generator template and regenerate the complete package.

## Release checklist

- Generation has no diagnostics and the capability report contains no used
  unsupported block.
- Simulator/generated-C differential scenarios cover the application's normal,
  transition, history, parallel, reset/retain, solver, and numeric-fault paths.
- The target compiler accepts the package with project warning settings.
- Stack, static memory, execution time, numeric tolerances, endianness, and math
  library behavior are measured on the selected MCU/toolchain.
- MCAL I/O, safe outputs, watchdog, reset behavior, and fault persistence pass
  HIL or target tests.
- Required coding-standard analysis, traceability, reviews, and safety
  certification remain completed by the integrating organization.
