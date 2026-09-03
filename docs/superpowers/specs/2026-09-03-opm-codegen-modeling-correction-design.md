# OPM Code Generation and Modeling Correction Design

## Purpose

Correct the executable Object-Process Modeling workflow so the OPM editor, TypeScript simulator, and generated embedded C implement one deterministic semantic contract. The result must reject unsafe or inconsistent models, expose precise diagnostics, preserve conceptual OPM and OPL compatibility, and qualify generated C by compiling and executing it against the reference runtime.

## Scope

This design covers only:

- OPM executable schema, normalization, and semantic validation.
- OPM modeling and executable-property editing.
- OPM TypeScript simulation.
- OPM C99 generation, compilation, verification, preview, and export.
- OPM project persistence and compatibility.

It excludes V-Lab, State Machine, X-Bridges, and their generators or simulation engines.

## Audit Findings

The current implementation has several release-blocking gaps:

1. Generated C runs process guards and actions sequentially and does not implement the TypeScript runtime's activation, event, timing, priority, staged-write, conflict, transition, state-action, overflow, or diagnostic behavior.
2. Persisted identifiers and initial values can reach generated C without complete type validation or canonicalization.
3. Assignment destinations use stable model IDs instead of resolved C identifiers.
4. The existing parity test inspects generated source text but does not execute C or compare it with TypeScript.
5. Host compilation can be silently skipped, so a green test run does not prove the generated package compiles.
6. Imported models are not consistently checked with the same connection rules enforced by the canvas.
7. Disabled executable processes and links lose their disabled state in compiled IR.
8. Result and effect links can execute without proving their source process fired.
9. Several configured capacities and numeric policies are not enforced by the TypeScript runtime.
10. The current short model fingerprint is not a suitable artifact identity boundary.
11. The modeling UI maintains state that can diverge from the canonical runtime, and several executable editors or diagnostic-navigation paths are incomplete.
12. Generated packages can be downloaded without a strict verified-build state tied to the current semantic model.

Passing unit tests therefore demonstrate partial implementation, not full semantic or generated-code correctness.

## Product Decisions

- Use one normalized, typed executable IR as the only input to simulation and C generation.
- Treat the TypeScript runtime as the executable reference while generated C is qualified against it step by step.
- Generate bounded, static-memory C99 with deterministic ordering.
- Never copy unvalidated editor strings into C identifiers, literals, expressions, or comments.
- Block generation on schema, graph, semantic, or expression errors.
- Block verified export when compilation or differential execution fails.
- Preserve legacy conceptual OPM diagrams and existing OPL behavior.
- Do not claim MISRA compliance solely from code generation; expose the selected profile and verification evidence.

## Canonical Architecture

```text
OPM editor model
  -> boundary schema validation
  -> deterministic normalization
  -> semantic validation
  -> typed executable IR
  +-> canonical TypeScript runtime
  +-> C runtime generator
        -> strict C99 compilation
        -> host execution
        -> differential comparison with TypeScript
```

The editor is a client of this pipeline. React Flow nodes, edges, labels, layout properties, and transient animation state are not compiler inputs until the boundary adapter has converted them into the validated editor contract.

## Compiler Boundary

The boundary adapter must validate and canonicalize:

- Scalar initial values according to `bool`, `int32`, `uint32`, `float32`, or a declared enum.
- Minimum, maximum, access, persistence, overflow, and hardware-mapping fields.
- Target settings as finite bounded integers or supported enum values.
- Stable IDs as model references only.
- C identifiers using one deterministic sanitizer and collision detector.
- Enum definitions, member values, and references.
- Events and timeout-event references.
- Process inputs, outputs, assignments, and guards.
- Procedural-link direction, endpoint kind, assignment scope, event binding, and transition ownership.
- Disabled executable elements without silently re-enabling or executing them.

The normalized model must include requirements and other valid structural endpoints without treating them as executable. Imported, pasted, migrated, and programmatically created models must pass the same graph rules as canvas-created connections.

Diagnostics must include a stable code, severity, element ID, property path, and expression range when applicable. Invalid input returns diagnostics rather than partially executable IR.

## Canonical Execution Semantics

Each runtime step uses these phases:

1. Validate the step request and sample mapped inputs.
2. Advance state timers, process periods, debounce timing, and delayed transitions.
3. Inspect queued events without prematurely consuming them.
4. Determine eligible processes from enabled state, activation mode, timing, triggers, conditions, and guards.
5. Sort eligible processes by descending priority and stable normalized order.
6. Evaluate eligible processes against one immutable committed-value snapshot.
7. Stage process and causally associated link assignments and transition requests.
8. Enforce staged-write and transition capacities.
9. Resolve priorities and equal-priority conflicts without committing fabricated values.
10. Commit accepted writes and transitions atomically.
11. Execute exit assignments followed by entry assignments in deterministic order.
12. Consume only the events used by accepted activations.
13. Publish mapped outputs, trace records, and structured diagnostics.

Result and effect links originating from a process are active only when that process fires. Expression evaluation failures, division by zero, invalid numeric conversion, or overflow under the diagnostic policy prevent the affected write from committing.

Waiting for an event, period, debounce interval, or delayed transition is a valid waiting state, not a finished simulation.

Reset reconstructs initial values, active states, timers, queues, debounce records, delayed transitions, trace state, I/O state, and diagnostics.

## Generated C Runtime

Generated C must implement the canonical phases rather than directly mutating instance fields in process order. It will contain bounded arrays and generated tables for:

- Attributes and active object states.
- Event FIFO state and overflow policy.
- State and process timers.
- Process activation metadata.
- Staged writes and transition requests.
- Delayed transitions.
- Runtime diagnostics.
- Optional trace records.
- Hardware input and output bindings.

The public API is:

```c
void OPM_Init(OPM_Instance_t *instance);
OPM_Status_t OPM_Step(OPM_Instance_t *instance, uint32_t delta_ms);
OPM_Status_t OPM_DispatchEvent(OPM_Instance_t *instance, OPM_EventId_t event_id);
void OPM_Reset(OPM_Instance_t *instance);
const OPM_Diagnostics_t *OPM_GetDiagnostics(const OPM_Instance_t *instance);
```

All assignment targets and expression references use resolved C identifiers from typed IR. User-facing names may appear only in properly escaped manifest data or sanitized comments that cannot alter C syntax.

Unknown events, queue overflow, capacity exhaustion, conflicts, expression failures, and invalid step requests produce matching TypeScript and C status or diagnostic codes.

## Artifact Identity and Lifecycle

The compiler computes a deterministic SHA-256 fingerprint from a canonical representation of the complete executable model and target settings. UI layout and transient display state are excluded.

The code-generation workspace has explicit states:

```text
edited -> validated -> generated -> verifying -> verified
                                      +-> failed
```

Any semantic edit invalidates generated artifacts and verification. Preview, manifest, host-build output, and parity results display the fingerprint they belong to. Download and HIL handoff are enabled only when the verified fingerprint matches the current model fingerprint.

## Modeling and Simulation UX

The executable inspector must support:

- Typed object attributes and initial values.
- Identifier preview without coupling display names to C identifiers.
- Process activation, period, debounce, priority, guard, inputs, outputs, and ordered assignments.
- State initial/terminal settings, timeout, entry assignments, and exit assignments.
- Link guards, events, priorities, delays, assignments, and transitions.
- Event and enum management.
- Typed reference selectors that show only legal targets.
- Reordering, enabling, disabling, and deleting assignment rows.

Node and edge selection must both reach the inspector. Selecting a diagnostic must focus the exact node or edge and the related property control.

Simulation controls dispatch events, reset, step, and any supported manual state operation through explicit canonical-runtime APIs. The canvas, watch panel, trace overlay, process animation, traversed-link animation, values, states, timing, and diagnostics are derived from the latest runtime result rather than reconstructed from initial editor data.

Compilation or runtime failure preserves the last committed display state and surfaces actionable diagnostics.

## Verification Strategy

### Boundary and semantic tests

- Hostile or invalid identifiers and code-like values.
- Boolean strings, numeric overflow, invalid enum members, and invalid settings.
- Identifier collisions and stable-ID/C-identifier differences.
- Imported invalid link directions and valid requirement links.
- Disabled objects, states, processes, and links.
- Read-only assignments, invalid references, invalid transition ownership, and unreachable states.

### Runtime tests

- Cyclic, triggered, combined, condition-linked, and disabled activation.
- Event FIFO ordering and both overflow policies.
- Debounce, period timing, timeouts, and delayed transitions.
- Snapshot evaluation, staged writes, priority winners, and equal-priority conflicts.
- Exit and entry assignment ordering.
- Numeric overflow policies and failed-expression non-commit behavior.
- Capacity exhaustion and reset completeness.
- Hardware input sampling and output publication.

### Generated-C tests

- Use a supported bundled compiler through argument arrays rather than shell-built command strings.
- Treat absence or failure of the required qualification compiler as a failed release gate.
- Compile every representative generated package with strict C99 warnings as errors.
- Execute a generated host harness and emit machine-readable step snapshots.
- Compare TypeScript and C after every step for typed values, float32 representation, active states, timers, queued events, fired and blocked processes, traversed links, committed writes, transitions, statuses, and diagnostic codes.
- Repeat with reversed input order and boundary capacities.

### UI and persistence tests

- Exercise real property editing and validation interactions.
- Select and edit executable links.
- Navigate diagnostics to exact controls.
- Dispatch events, step, reset, and observe canonical runtime state.
- Invalidate artifacts after semantic edits.
- Prevent export when verification is missing, failed, or stale.
- Round-trip execution settings and verified-artifact metadata safely.
- Preserve conceptual OPM and OPL regressions.

### Mutation resistance

The qualification suite must fail when deliberately mutating scheduler ordering, process-link causality, event consumption, assignment identifier mapping, transition priority, state-action order, or fingerprint inputs. This demonstrates that passing tests depend on correct semantics rather than source substrings or finite output alone.

## Delivery Sequence

1. Truthful release gates and adversarial compiler-boundary tests.
2. Canonical schema, graph, identifier, value, and settings validation.
3. Correct TypeScript execution semantics and diagnostic enforcement.
4. Complete generated C scheduler and runtime support.
5. Strict host compilation and TypeScript/C differential harness.
6. Unified modeling and simulation UI.
7. Verified code-generation workspace and export lifecycle.
8. Persistence, compatibility, security, build, and end-to-end qualification.

Each increment must be independently testable and committed separately. No increment may weaken a diagnostic or exclude a failing model merely to restore a green test run.

## Acceptance Criteria

- No unvalidated editor value can alter generated C syntax.
- Imported and canvas-created models use identical connection and semantic rules.
- Disabled executable elements never execute.
- TypeScript and generated C produce equivalent step results for the qualification corpus.
- Generated C implements all advertised activation, scheduling, event, assignment, transition, numeric, capacity, I/O, trace, and diagnostic behavior.
- Strict C99 compilation and executable parity are mandatory release gates.
- The UI displays actual runtime values, states, links, time, and diagnostics.
- Export is impossible for unverified or stale artifacts.
- Existing conceptual OPM projects and OPL behavior remain compatible.
