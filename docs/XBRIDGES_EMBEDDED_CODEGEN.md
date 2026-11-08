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

## State-machine boundary mapping

Use canonical mappings to connect a state-machine scalar to an X-Bridges graph:

```text
SM x -> Inport input -> Sum(+ Constant 1) -> Outport output -> SM x
```

Scalar arithmetic uses `Sum`; `VectorAdd` requires vector signals. The input
mapping targets the Inport input and the output mapping originates from the
Outport output.

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
fraction length. Values are stored as scaled integers. The current generated
operation path converts operands to C `double`, performs the operation, and
then explicitly rounds and applies the configured overflow policy while
quantizing to the destination stored integer. The interpreter follows the same
sequence.

This provides tested interpreter/C parity, but it is not bit-true
integer-domain arithmetic. Values beyond the exact-integer range of the
target's `double`, intermediate rounding, and target floating-point behavior
can affect results before quantization. Models must remain inside the validated
numeric bounds and require target compiler plus SIL/PIL qualification when
fixed-point bit exactness is a system requirement.

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

- The model selects the fixed-step solver kind `euler`, `rk4` or `discrete`;
  variable-step generation is not supported. The `discrete` kind has no
  integration stage: each step evaluates the outputs and the discrete updates
  only, so a block with continuous states is rejected with
  `XB_DISCRETE_SOLVER_CONTINUOUS_STATE` (use `euler` or `rk4`, or the discrete
  block). It applies to a continuous `INTEGRATOR_CONTINUOUS`, `Integrator`,
  `TRANSFER_FUNCTION`, a `STATE_SPACE` whose representation is not `discrete`,
  and a `PID_CONTROLLER` without a positive sample time.
- The kind and step come from the X-Bridges workspace Solver settings and are
  saved with the model. Explicit Euler (ODE1) is stored as `euler`, Fixed-Step
  RK4 (ODE4) as `rk4`, and Discrete as `discrete`; the step is the resolved
  Fixed Step (`auto` is replaced by the greatest common divisor of the discrete
  sample times, otherwise by `(stop - start) / 50`, or 0.2 for an infinite stop
  time). Any other workspace solver (ode2, ode3, ode5, ode23, ode45, ode14x,
  ode23tb) is saved as chosen for simulation but is not an embedded kind: the
  model adapter reports `XB_MODEL_INVALID` (solver must be Euler, RK4 or
  Discrete with an explicit step). Start Time and Stop Time are simulation
  settings and are not part of the generated package.
- Solver step size must be finite, positive, and divide the state-machine base
  tick exactly. Substep count is fixed at generation time.
- A discrete sample time must be a positive integer multiple of the solver
  step. Scheduling uses integer counters, not accumulated floating time.
- Discrete outputs retain their last value between scheduled executions
  (zero-order hold).
- The simulator must run the same solver, step, schedule, numeric policy, and
  target capability assumptions when differential parity is required.

## Constant output data type

The `Constant` block property **Output data type** (`output_type`) is `auto`
(inherit), `float64`, `float32`, `boolean`, `int8`, `uint8`, `int16`, `uint16`,
`int32` or `uint32`. The simulation rounds a value to the nearest integer and
saturates it at the limits of an integer type. Code generation refuses what it
would have to change, for every element of a vector value:

| Diagnostic | Cause |
|---|---|
| `XB_CONSTANT_TYPE_INVALID` | `output_type` is not one of the listed types |
| `XB_CONSTANT_VALUE_NOT_REPRESENTABLE` | a non-integer value for an integer type |
| `XB_CONSTANT_VALUE_OUT_OF_RANGE` | a value outside the range of the integer type, for example 300 for `uint8` (0 to 255) |

Models saved before the property existed are read as `auto`. The target profile
still decides which numeric types can be generated (see Floating point above).

## Control-port defaults

The Enable and Reset inputs of `PID_BASIC` and `PID_CONTROLLER` are control
ports with defaults: Enable is 1 and Reset is 0. A scalar control port that is
left unconnected (and has no boundary mapping) is driven by a generated
`Constant` of its default before validation, so the validator, the semantic
model, the interpreter and the generated C use the same value, as the simulation
does. Data inputs have no default: every scalar data input needs exactly one
driver, otherwise generation stops with `XB_PORT_DANGLING`.

## Discrete integrator methods

`INTEGRATOR_DISCRETE` (parameters `sample_time` and `method`) follows the same
difference equations in the simulation, the interpreter and the generated C:

| Method | Equations | Direct feedthrough |
|---|---|---|
| `forward_euler` (default) | `y(k) = x(k)`, `x(k+1) = x(k) + Ts*u(k)` | no |
| `backward_euler` | `y(k) = x(k) + Ts*u(k)` | yes |
| `tustin` (Tustin, alias `trapezoidal`) | `y(k) = x(k) + Ts/2*(u(k) + u(k-1))`, `u(-1) = 0` | yes |

A feedback loop made only of blocks with direct feedthrough is an algebraic
loop. The simulation reports `ALGEBRAIC_LOOP` and solves it iteratively;
generation stops with `XB_ALGEBRAIC_LOOP_UNSUPPORTED`. Break the loop with
`forward_euler` or a `UNIT_DELAY`.

## Diagnostics

Every code-generation diagnostic is an error. The in-application Help chapter
"X-Bridges Embedded Code Generation" lists each `XB_*` code with its meaning and
corrective action; the codes added by the Discrete solver, the Constant output
type, control-port defaults and the integrator methods are
`XB_DISCRETE_SOLVER_CONTINUOUS_STATE`, `XB_CONSTANT_TYPE_INVALID`,
`XB_CONSTANT_VALUE_NOT_REPRESENTABLE`, `XB_CONSTANT_VALUE_OUT_OF_RANGE`,
`XB_PORT_DANGLING` and `XB_ALGEBRAIC_LOOP_UNSUPPORTED`.

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

For detailed runtime contracts, bounded loop specifications, and verification evidence rules, see [CODEGEN_MCU_VERIFICATION_GATE.md](CODEGEN_MCU_VERIFICATION_GATE.md).

