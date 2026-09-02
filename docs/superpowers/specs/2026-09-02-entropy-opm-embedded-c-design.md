# Entropy OPM Embedded C Design Specification

## Purpose

Extend the Entropy module from conceptual Object-Process Modeling into an executable modeling environment that can generate deterministic embedded C. The feature must preserve existing OPM and OPL behavior while adding explicit places for users to define values, process behavior, guards, assignments, events, timing, and state transitions.

The implementation will use a dedicated typed OPM compiler rather than translating the model into the State Machine module. It may reuse generic download, host-compilation, diagnostics, and HIL integration utilities, but OPM execution semantics and generated artifacts remain independent.

## Product Decisions

- Use a hybrid cyclic and event-driven runtime.
- Use dedicated type-specific property panels for executable values and behavior.
- Accept a restricted, typed expression language; do not accept arbitrary C.
- Generate C99-compatible, MISRA-oriented code with static memory allocation.
- Use the same normalized executable model for editor validation, simulation, and code generation.
- Preserve existing Entropy diagrams by treating new executable properties as optional and supplying backward-compatible defaults.

## Architecture

The compilation pipeline is:

```text
React Flow OPM diagram
  -> executable schema adapter
  -> normalized OPM model
  -> graph and semantic validation
  -> typed expression intermediate representation
  -> embedded-C intermediate representation
  -> generated C package and traceability manifest
```

This boundary prevents React components from becoming compiler inputs and prevents C templates from interpreting unvalidated editor strings. Every compilation diagnostic retains the source element ID, property path, and expression range needed to focus the corresponding editor control.

### Executable schema

The current Entropy node and edge data will gain optional execution properties:

- **Objects** own typed attributes with a display name, stable identifier, scalar type, initial value, optional minimum and maximum, access direction, persistence flag, and optional hardware mapping.
- **States** remain owned by an object and define whether they are initial or terminal, plus optional entry assignments, exit assignments, and timeout behavior.
- **Processes** define activation mode, input and output parameters, a guard, restricted action statements, priority, optional cyclic period, debounce time, and reentrancy policy.
- **Procedural links** define executable guards, events, assignments, transition targets, priorities, and delays according to link type.
- **Structural links** remain model metadata and do not execute directly.

The initial scalar type set is `bool`, `int32`, `uint32`, `float32`, and generated enumerations. Dynamic memory, pointers, recursion, unbounded collections, and unbounded strings are outside the first release.

### Normalized model

A UI-independent normalizer resolves nodes, object-owned states, ports, and links into stable tables. Display labels remain unchanged, while all generated identifiers are separately sanitized, collision-checked C symbols. Normalization resolves references before semantic analysis and produces deterministic model order so that saving, simulation, and code generation do not depend on React Flow array order.

### Restricted expression language

The language supports typed literals, attribute references, event and timer values, arithmetic, comparisons, Boolean operations, parentheses, assignment, and a small allowlist of deterministic intrinsics. Example guards and assignments include:

```text
temperature.value < target.value
door.state == CLOSED
elapsed_ms >= 5000
heater.power = 80
fan.enabled = true
remaining_time = remaining_time - delta_ms
```

Expressions are tokenized and parsed into a typed syntax tree. The validator rejects undeclared references, incompatible operands, invalid casts, assignment to read-only values, numeric overflow, unsupported syntax, and non-deterministic functions. Source ranges are retained for inline editor errors. Expression text is never copied directly into generated C.

## OPM Execution Semantics

### Procedural links

- **Consumption** reads or consumes an object value for a process.
- **Result** assigns a process result to an object value or requests an object-state transition.
- **Effect** reads and subsequently updates an object value.
- **Condition** enables a process while its typed guard evaluates true.
- **Trigger** activates a process when its bound external event or state-change event occurs.
- **Agent** and **instrument** expose object data to a process without consuming it.
- Aggregation, generalization, and exhibition links are structural and have no direct runtime side effect.

### Public runtime contract

The generated runtime is instance-based so multiple models can run independently:

```c
void OPM_Init(OPM_Instance_t *instance);
OPM_Status_t OPM_Step(OPM_Instance_t *instance, uint32_t delta_ms);
OPM_Status_t OPM_DispatchEvent(
    OPM_Instance_t *instance,
    OPM_EventId_t event_id
);
const OPM_Diagnostics_t *OPM_GetDiagnostics(
    const OPM_Instance_t *instance
);
```

No heap allocation occurs after initialization. Event, process, state, transition, assignment, and diagnostic capacities are fixed generated constants.

### Deterministic step cycle

Each `OPM_Step()` call performs these phases:

1. Sample hardware-mapped inputs.
2. Advance bounded timers and enqueue detected state-change events.
3. Evaluate cyclic, condition, and queued-event activation.
4. Sort eligible processes by explicit priority and then stable normalized model order.
5. Evaluate each eligible process against a read-only snapshot of committed data.
6. Stage assignments and requested state transitions.
7. Detect conflicting writes and invalid transition combinations.
8. Commit valid assignments and state changes.
9. Execute state exit actions followed by entry actions in deterministic model order.
10. Publish hardware-mapped outputs and runtime diagnostics.

`OPM_DispatchEvent()` appends a validated event ID to a bounded FIFO queue. Events are consumed during the next step. Queue capacity and overflow policy are visible target settings and generated constants.

### Assignments and transitions

Assignments are ordered rows rather than an unstructured code field. Each row records a target, operator, typed expression, and enabled state. A state-changing result or effect link records the owning object, source state when applicable, target state, guard, triggering event, delay, and priority.

An object must have exactly one initial state once it contains executable states. More than one initial state, an invalid source/target ownership relationship, or an unreachable transition target blocks generation. Two writes to the same value at different priorities resolve to the higher priority. Conflicting writes at equal priority are compilation errors rather than order-dependent behavior.

## Editor and Interaction Design

Selecting an element opens a dedicated inspector rather than showing generic JSON or raw C.

### Object inspector

- **Attributes:** add, remove, and reorder typed values.
- **Initial Values:** edit each value with type-aware controls.
- **Constraints:** configure minimum, maximum, overflow policy, and read/write access.
- **I/O Mapping:** bind attributes to generated hardware abstraction inputs and outputs.

### State inspector

- **Behavior:** choose initial and terminal status.
- **Entry Assignments:** ordered assignment rows executed after entry.
- **Exit Assignments:** ordered assignment rows executed before exit.
- **Timing:** timeout duration and timeout event behavior.

### Process inspector

- **Activation:** cyclic, triggered, or both.
- **Parameters:** typed inputs and outputs linked to model values.
- **Guard:** a restricted Boolean expression.
- **Actions:** ordered typed assignment rows.
- **Scheduling:** priority, cyclic period, debounce, and reentrancy policy.

### Link inspector

- **Semantics:** explanatory link behavior and endpoint compatibility.
- **Guard or Trigger:** condition expression or event binding where supported.
- **Assignments:** ordered typed target/operator/expression rows.
- **Transition:** source state, target state, priority, and delay for state-changing links.

Assignment rows have the shape `Target | Operator | Typed value or expression`. Users can add, reorder, disable, and remove rows. Reference selectors list only values valid for the current link or process scope, while the expression field supports completion for valid names.

### Diagnostics and transition feedback

- Invalid controls receive inline error text and an error border.
- The related canvas node or edge receives an error badge.
- Selecting a diagnostic focuses the canvas element and opens the exact property section.
- A transition preview lists its trigger, guard result, values read, writes staged, exited state, entered state, and any higher-priority competitor.
- Simulation animates active processes, traversed procedural links, and committed state changes.
- A value-watch panel displays initial, previous, current, and pending values.

### Code-generation workspace

The workflow mirrors the proven State Machine experience without sharing its semantic compiler:

1. Validate the current OPM model.
2. Select the target profile, tick settings, queue capacity, and numeric policies.
3. Generate embedded-C artifacts.
4. Review blocking errors, warnings, and source-to-code traceability.
5. Preview generated source and headers.
6. Run strict host compilation and runtime smoke checks.
7. Download an archive or hand the package to HIL integration.

## Generated Artifacts

The generator produces:

- `opm_types.h`: fixed-width scalar aliases, object-state enumerations, event IDs, and public structures.
- `opm_config.h`: tick, capacity, numeric, queue, and feature configuration.
- `opm_model.h` and `opm_model.c`: model data, initialization, process guards, and process actions.
- `opm_runtime.h` and `opm_runtime.c`: scheduler, FIFO event queue, staged writes, transitions, and diagnostics.
- `opm_io.h` and `opm_io.c`: generated hardware abstraction hooks.
- `opm_trace.h` and `opm_trace.c`: optional trace records mapped to source OPM IDs.
- `main_example.c`: minimal initialization, dispatch, and step integration example.
- `opm_manifest.json`: model fingerprint, generator settings, symbol map, and requirement traceability.

The C package is C99-compatible, uses fixed-width integer types, avoids post-initialization allocation, and is intended to compile with strict warnings treated as errors. MISRA-oriented means templates avoid known unsafe constructs and expose any target-specific compliance deviations; it does not claim certification by generation alone.

## Validation

Validation is divided into explicit stages:

1. **Schema:** required fields, legal scalar types, initial values, stable IDs, and backward-compatible defaults.
2. **Graph:** missing endpoints, invalid link direction, orphan states, invalid state ownership, and executable use of structural links.
3. **Semantic:** undeclared values, incompatible types, invalid operations, conflicting writes, ambiguous transitions, and invalid priorities.
4. **Execution:** event capacity, cyclic activation dependencies, nondeterministic writes, unreachable states or processes, and processes that can never activate.
5. **Generated output:** deterministic artifacts, synchronized declarations, strict C compilation, and host runtime behavior.

Errors block generation. Warnings permit generation but remain visible in the editor, code-generation panel, and manifest.

## Compatibility and Migration

Existing `entropyNodes` and `entropyEdges` project data remains loadable. Missing executable properties receive conceptual-only defaults and do not make an existing diagram invalid merely because it has no runtime configuration. The editor will offer an explicit action to enable executable behavior and initialize safe defaults. Existing OPL generation and parsing continue to operate on the OPM semantic fields and ignore execution-only metadata that OPL cannot represent.

## Testing Strategy

- **Schema tests:** executable-field serialization, default migration, and existing project compatibility.
- **Expression tests:** precedence, typing, references, assignments, invalid tokens, overflow, and diagnostic ranges.
- **Normalization tests:** reference resolution, stable ordering, symbol sanitization, and collision handling.
- **Semantic tests:** all procedural link types, state ownership, conflicting writes, activation cycles, and transition priorities.
- **Generator tests:** stable files, public API signatures, static allocation, sanitized identifiers, and manifest traceability.
- **Compilation tests:** generate representative models and compile all C with strict C99 warnings as errors.
- **Runtime tests:** execute host harnesses for cyclic activation, event dispatch, assignment commit, state changes, timers, queue overflow, and write conflicts.
- **UI tests:** type-specific inspectors, assignment rows, transition controls, inline diagnostics, preview, persistence, and keyboard interaction.
- **Regression tests:** existing Entropy OPL tests and saved diagrams continue to pass.
- **End-to-end test:** simulate a representative appliance controller, generate C, compile and execute the host harness, and compare state/value traces with the TypeScript simulation.

## Delivery Boundaries

Implementation will proceed through independently testable increments:

1. Backward-compatible executable schema and persistence.
2. Normalized model, diagnostics, and graph validation.
3. Restricted expression parser and typed intermediate representation.
4. Shared deterministic runtime semantics for simulation and generation.
5. Embedded-C artifacts and strict host compilation verification.
6. Object, state, process, and link property inspectors.
7. Assignment and transition editors with diagnostic navigation.
8. Simulation animation, transition preview, and value watch.
9. Code preview, archive export, HIL handoff, and end-to-end qualification.

Each increment must retain existing Entropy and State Machine behavior. The subsequent implementation plan will name exact files, interfaces, tests, commands, and commit boundaries for these increments.
