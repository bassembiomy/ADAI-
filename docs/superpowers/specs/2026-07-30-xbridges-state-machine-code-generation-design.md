# X-Bridges State-Machine Code Generation Design

## Status

Implemented through the capability-audit gate on 2026-07-31. Acceptance is
based on semantic, strict-C99 differential, HIL-host, TypeScript, and
deterministic runtime-build evidence recorded by the implementation plan. MCU
toolchain compilation, execution on target hardware, WCET measurement, MISRA
qualification, and safety certification remain integration responsibilities.

## Goal

Generate deterministic embedded C99 for an MCU-safe subset of X-Bridges block
models embedded in ordinary hierarchical state-machine states. Simulation and
generated C must execute the same typed semantic model with Stateflow-style
state ordering and Simulink-style numeric conversion behavior.

This design targets behavioral compatibility with the selected
Stateflow/Simulink semantics. It does not claim MathWorks certification.

## Current Findings

The application already allows a state to contain an X-Bridges model through
`isXBridges` and `xBridgesModel`. During application simulation, active
X-Bridges states are executed after the complete state-machine step by a
separate `XbridgesEngine`.

The active structured C generator does not preserve an X-Bridges model in the
state-machine semantic IR. Consequently, generated runtime artifacts do not
execute X-Bridges blocks.

An older inactive generator contains direct node-to-C rendering for a small
scalar subset. That path:

- is not the source of the current generated runtime artifacts;
- supports only a few block types;
- represents every local signal and block state as `float`;
- treats data-type conversion and numeric representation as a float cast;
- does not reproduce fixed-point rounding, overflow, dimensions, error
  outputs, or solver behavior.

The simulation implementation of `NUMERIC_REPRESENTATION` distinguishes
fixed-point and floating-point modes, but the old C path does not. Therefore
the current application cannot claim simulator/generated-C parity for
X-Bridges states.

The workspace contains existing uncommitted changes in
`BlockDefinitions.ts` and its tests. They are not part of this design and must
be preserved during implementation.

## Scope

### Included

- X-Bridges submodels owned by normal hierarchical states.
- Stateflow-style execution during the owning state's `during` phase.
- One immutable typed semantic IR for simulation and C generation.
- Deterministic scalar, vector, and matrix signals with compile-time
  dimensions.
- Integer fixed-point storage with matching interpreter/C double-intermediate
  arithmetic and explicit output quantization.
- Float32 for the current production embedded target. The host semantic layer
  can represent explicitly selected float64, but embedded generation rejects
  it unless a qualified target profile enables it.
- Fixed-step Euler and RK4 continuous-state solvers.
- Multirate discrete blocks with statically validated sample times and
  zero-order hold.
- Configurable reset/retain lifecycle for stateful block memory.
- Recoverable numeric error signals and configurable escalation into the
  state-machine fault path.
- Static-memory C99 without dynamic allocation or runtime block dispatch.

### Excluded From the First Embedded-Safe Set

- Visualization and scope blocks.
- Online learning and training blocks.
- DOE and host-oriented optimization.
- CFD/DEM simulations.
- Dynamically sized signals or containers.
- Unbounded optimization or iteration.
- Pure algebraic loops requiring a runtime nonlinear solver.
- Variable-step solver execution in generated code.
- Host-only blocks without a deterministic bounded embedded implementation.

An excluded block must cause a precise generation diagnostic. It must never
silently become pass-through logic or disappear from the generated program.

## Reference Semantics

The design follows these Stateflow/Simulink concepts:

- A state can invoke model/function behavior from its state action.
- Hierarchical and parallel state execution order remains deterministic.
- Data types define storage and arithmetic behavior.
- Explicit conversions define rounding and overflow behavior.
- Generated code uses bounded, statically allocated data where required for
  embedded execution.

Relevant MathWorks references:

- <https://www.mathworks.com/help/stateflow/simulink-functions.html>
- <https://www.mathworks.com/help/stateflow/code-generation.html>
- <https://www.mathworks.com/help/stateflow/ug/control-state-execution-order.html>
- <https://www.mathworks.com/help/simulink/data-types.html>
- <https://www.mathworks.com/help/simulink/slref/datatypeconversion.html>
- <https://www.mathworks.com/help/simulink/ug/specify-fixed-point-data-types.html>

## State-Machine Execution Semantics

For each active X-Bridges state, one state tick executes in this order:

1. Evaluate the state's outer transitions.
2. If an outer transition exits the state, do not execute its `during`
   behavior or X-Bridges submodel.
3. Execute the state's textual `during` action.
4. Execute `SM_XB_<State>_Step(instance)`.
5. Commit mapped X-Bridges outputs to state-machine variables.
6. Evaluate the state's inner transitions using those updated values.
7. Execute active child states.

Parent state behavior executes before child state behavior. Parallel states
execute in their deterministic semantic priority order.

This changes application simulation from its current post-state-machine-step
X-Bridges phase. The simulator must move X-Bridges execution into the semantic
state executor so that simulation and generated C use the same ordering.

### Lifecycle

Each X-Bridges state has a block-memory policy:

- `reset` is the default. Stateful block memory is initialized on every state
  entry.
- `retain` preserves block memory while the owning state is inactive.

Shallow or deep history controls which states are reactivated. It does not
implicitly override the X-Bridges memory policy.

`SM_Reset()` resets every X-Bridges state regardless of its ordinary
entry-retention policy.

## Architecture

### Model Adapter

`xbModelAdapter.ts` converts UI-owned nodes, edges, mappings, block parameters,
and solver options into a canonical, versioned X-Bridges model. The adapter
does not execute blocks or generate C.

### Capability Registry

`xbCapabilities.ts` contains the code-generation contract for every block
type:

- simulation capability;
- embedded-C capability;
- supported signal shapes and numeric types;
- direct-feedthrough or stateful classification;
- parameter schema and range requirements;
- target library requirements;
- runtime failure modes.

The registry is the only source used to decide whether a block is
code-generation capable.

### Semantic Validator

`xbSemanticValidator.ts` reports errors for:

- unsupported block types;
- missing blocks or ports;
- duplicate or incompatible mappings;
- invalid or dynamic dimensions;
- invalid fixed-point formats;
- implicit narrowing conversions;
- sample times not representable by the selected fixed-step schedule;
- target-incompatible float or math-library requirements;
- pure algebraic loops;
- duplicate generated-C identifiers;
- invalid reset/retain or fault policies.

Any error prevents the complete generated package.

### Semantic Builder

`xbSemanticBuilder.ts` produces an immutable typed IR containing:

- stable block and port IDs;
- statically resolved execution order;
- signal dimensions and storage layout;
- input, output, parameter, and state numeric types;
- explicit conversion operations;
- fixed-point intermediate and result types;
- sample-time schedule;
- solver and substep configuration;
- state memory and initialization values;
- state-machine mappings;
- runtime error and escalation behavior.

The state-machine `SemanticState` gains an optional X-Bridges semantic
submodel. The completed state-machine IR is the only input accepted by the
simulator and C renderer.

### Simulator

`xbInterpreter.ts` executes typed X-Bridges operations from semantic IR. It is
invoked by the normal state interpreter at the approved `during` position.

`xbNumeric.ts` implements canonical simulation behavior for:

- integer and fixed-point casts;
- rounding modes;
- saturation and wrapping;
- product/accumulator widening;
- float16 helper behavior when enabled;
- float32 conversion through `Math.fround`;
- non-finite detection;
- scalar/vector/matrix element operations.

### C Generator

`xbCGenerator.ts` emits:

- `sm_xbridges.h`;
- `sm_xbridges.c`;
- per-state signal and block-state structures;
- `SM_XB_<State>_Init()`;
- `SM_XB_<State>_Enter()`;
- `SM_XB_<State>_Step()`;
- fixed-point conversion and overflow helpers required by the model;
- statically bounded Euler or RK4 substeps;
- target dependency declarations.

The generated state-machine action code calls the X-Bridges step from the
owning state's `during` function. There is no runtime graph traversal,
heap allocation, polymorphic dispatch, or unbounded loop.

## Initial Embedded-Safe Block Families

The capability registry will initially support:

- Sources and mappings: `Constant`, `Inport`, and `Outport`.
- Arithmetic: `Sum`, `GAIN`, `PRODUCT`, `UnaryNeg`, `Abs`, and vector
  arithmetic.
- Bounded linear algebra: matrix multiply, transpose, concatenation,
  diagonal construction, submatrix, and statically bounded solve operations.
- Logic and bitwise operations.
- Routing: switches, mux, demux, and terminator.
- Stateful primitives: delay, unit delay, memory, discrete integrator, and
  continuous integrator.
- Control: PID, bounded filters, discrete transfer functions, and bounded
  state-space models.
- Motor-control transforms: Clarke, Park, inverse Park, and inverse Clarke.
- Trigonometric operations when target math support is enabled.
- `DATA_TYPE_CONVERSION` and `NUMERIC_REPRESENTATION`.

Each individual type must have a capability entry and conformance tests before
it is enabled. A family name does not automatically authorize every block in
that family.

## Numeric Type System

Each signal has a resolved shape and numeric type.

### Shapes

- Scalar.
- Fixed-length vector.
- Fixed-size row-major matrix.

Dimensions must be positive compile-time constants. Dynamic or ragged arrays
are rejected.

### Floating Point

- `float32` is the default floating type.
- `float64` exists in the host semantic/interpreter type system, but requires
  explicit selection and target capability. The current production
  `STATE_MACHINE_XB_TARGET_CAPABILITIES` profile disables it, so embedded
  generation rejects float64 until another target profile explicitly enables
  and qualifies it.
- `float16` requires a target-native type or an approved bounded software
  helper. Otherwise generation fails.
- Narrowing from float64 to float32 or float16 requires an explicit
  conversion.
- Runtime non-finite results are reported according to the block's error
  policy.

### Fixed Point

A fixed-point type records:

- signed or unsigned;
- word length;
- fraction length;
- rounding mode;
- overflow mode.

Supported rounding semantics:

- floor: toward negative infinity;
- ceiling: toward positive infinity;
- zero: toward zero;
- nearest: nearest with ties toward positive infinity;
- round: nearest with ties away from zero;
- convergent: nearest with ties to even;
- simplest: resolved to a concrete mode during semantic construction.

Supported overflow semantics:

- saturate;
- two's-complement modular wrap;
- error.

Fixed-point values are stored as integers. In the implemented operation path,
operands are converted to `double`, the operation is evaluated in `double`,
and the result is explicitly rounded, overflow-processed, and quantized to the
destination stored integer. The simulation numeric kernel reproduces that same
sequence. This is deterministic across the tested host interpreter/C harness,
but it is not a claim of bit-true integer-domain arithmetic: magnitudes outside
the exact-integer range of the target `double` and target floating-point
differences require rejection, tighter modeling bounds, or target-specific
qualification.

### Conversion Blocks

`DATA_TYPE_CONVERSION` and `NUMERIC_REPRESENTATION` use real-world-value
conversion by default:

1. Convert the source real-world value into the destination scaled integer or
   floating representation.
2. Apply the selected rounding rule.
3. Apply the selected saturation, wrap, or error rule.
4. Produce the converted value.
5. Produce the configured quantization/error output.

Stored-integer reinterpretation is a separate explicit mode and is never
inferred.

## Timing and Solver Semantics

Generated continuous behavior supports fixed-step Euler and RK4.

- Solver selection and step size are fixed at generation time.
- Solver step size must divide the state-machine base tick exactly.
- The number of substeps per state tick is a positive compile-time constant.
- Discrete sample times must be integer multiples of the solver step.
- Discrete outputs use zero-order hold between scheduled executions.
- Schedules use integer tick counters rather than accumulated floating time.
- Variable-step solvers are simulation-only and rejected for embedded code
  generation.

Simulation must use the same selected fixed-step solver and schedule whenever
code-generation parity is requested.

## State-Machine Mappings

Mappings are explicit and directional:

- state-machine variable to X-Bridges input;
- X-Bridges output to state-machine variable.

Validation requires:

- an existing variable, block, and port;
- matching scalar/vector/matrix dimensions;
- compatible numeric type or an explicit conversion;
- no duplicate writer for one state-machine variable in the same execution
  phase;
- deterministic ordering when multiple active parallel X-Bridges states map
  different variables.

An output mapping commits before inner transitions and child-state execution.
This enables same-tick control decisions under the approved Stateflow-style
ordering.

## Error Handling

Generation diagnostics include:

- `XB_BLOCK_NOT_CODEGEN_CAPABLE`;
- `XB_PORT_DANGLING`;
- `XB_DIMENSION_DYNAMIC`;
- `XB_DIMENSION_MISMATCH`;
- `XB_TYPE_UNRESOLVED`;
- `XB_IMPLICIT_NARROWING`;
- `XB_FIXED_FORMAT_INVALID`;
- `XB_SAMPLE_TIME_INVALID`;
- `XB_SOLVER_NOT_CODEGEN_CAPABLE`;
- `XB_ALGEBRAIC_LOOP_UNSUPPORTED`;
- `XB_TARGET_CAPABILITY_MISSING`;
- `XB_MAPPING_INVALID`.

Runtime numeric conditions include division by zero, non-finite floating
results, dimension/index violations that remain possible after static
validation, and fixed-point overflow configured as an error.

Each condition can:

- set a recoverable block error output and continue with the defined fallback
  value; and
- optionally escalate by setting `SM_ERR_XBRIDGES_NUMERIC`, latching the
  fault, committing safe outputs, and following the normal state-machine
  safety path.

Safety-critical numeric conditions default to escalation.

## Verification Strategy

### Unit Tests

- Model adapter normalization.
- Capability decisions.
- Topological execution order.
- Dimension and type inference.
- Identifier collision handling.
- Every fixed-point rounding mode, including negative ties.
- Signed and unsigned saturation/wrap boundaries.
- Widened multiplication and accumulation.
- Float32 conversions and non-finite behavior.
- Solver and sample-time validation.

### Semantic Integration Tests

- Outer transition suppresses X-Bridges execution.
- Textual `during` executes before X-Bridges.
- X-Bridges output affects an inner transition in the same tick.
- Parent X-Bridges executes before child-state behavior.
- Parallel states execute in deterministic priority order.
- Normal entry, exit, shallow history, and deep history.
- Reset and retain memory policies.
- State-machine mapping conversions and conflicts.

### Compiled-C Differential Tests

For each supported operation, execute the same immutable IR in the TypeScript
interpreter and generated strict-C99 binary. Compare every tick:

- active states;
- state-machine variables;
- X-Bridges input/output signals;
- internal block states;
- actions and mappings;
- numeric error outputs;
- state-machine error and fault latch.

Numeric tests include:

- bit-exact fixed-point stored integers;
- float32 bit-pattern comparison;
- scalar, vector, and matrix values;
- multirate zero-order hold;
- Euler and RK4 trajectories;
- saturation, wrap, and escalation paths.

Generated C compiles with `-std=c99 -pedantic-errors -Wall -Wextra -Werror`.
Target/HIL tests verify that the generated files integrate with the existing
MCAL boundary without target-specific logic in application code.

## Acceptance Criteria

Implementation is complete only when:

1. The production structured generator preserves and validates X-Bridges
   state models in semantic IR.
2. Supported X-Bridges states execute during the owning state's `during`
   phase in simulation and C.
3. Same-tick inner/child logic observes committed X-Bridges outputs.
4. Unsupported blocks stop generation with precise diagnostics.
5. Generated code uses only static bounded memory and execution.
6. Fixed-point simulation and C use matching double-intermediate evaluation
   and explicit stored-integer output quantization.
7. Float32 is the default and narrowing is never silent.
8. Euler/RK4 and multirate scheduling are deterministic and matched.
9. Reset/retain memory policies behave identically in simulation and C.
10. Numeric error outputs and state-machine escalation behave identically.
11. Strict C99, state-machine, X-Bridges, differential, HIL, and TypeScript
    suites pass.
12. Existing unrelated X-Bridges block changes remain intact.

## Delivered Capability Boundary

The public integration contract and current block matrix are documented in
[`docs/XBRIDGES_EMBEDDED_CODEGEN.md`](../../XBRIDGES_EMBEDDED_CODEGEN.md).
`xbCapabilities.ts` is exhaustive for the public `BLOCK_LIBRARY`: every type is
either explicitly enabled with interpreter and C conformance-case identifiers
or explicitly rejected with a reason. This prevents newly encountered UI-only
blocks from silently entering the embedded path.

The implemented behavior is intentionally described as Stateflow-style state
ordering and Simulink-style numeric conversion. It is not a claim of complete
Stateflow/Simulink feature equivalence, MathWorks code-generation equivalence,
formal MISRA compliance, or certification for a safety integrity level.
