# OPM Standard Release Improvement Requirements

**Status:** Required before merging the Antigravity OPM changes

**Source:** Review of Antigravity commits b87c6d0 through eb6200d

**Scope:** Entropy OPM editor, OPM simulation runtime, OPM C generation, and OPM qualification only.

## Release Decision

The current OPM changes must not be merged as the standard release until all P0 and P1 requirements below are implemented and verified. Existing tests pass, but several new helpers are test-only and are not connected to the production OPM editor.

## Protected Boundaries

The following are explicitly out of scope and must remain behaviorally unchanged:

- State Machine runtime and State Machine C/H generation.
- X-Bridges runtime, block definitions, and X-Bridges C/H generation.
- Shared application simulation and code-generation behavior outside OPM.

Any pull request implementing these requirements must show no changes to protected generator/runtime paths and must pass an automated boundary test.

## P0 Requirements — Merge Blockers

### REQ-P0-01: Correct OPM link-type migration

When a user changes the type of an OPM transition/link, the implementation shall:

- write the semantic link type to edge.data.type;
- preserve the React Flow renderer type as opmEdge;
- preserve edge ID, source, target, source handle, target handle, label, condition text, and compatible execution metadata;
- revalidate the converted edge against the source and target node/port contract;
- refuse the conversion and keep the original edge unchanged when it is invalid;
- show a stable warning or error code explaining why the conversion was refused.

Acceptance criteria:

- A converted edge renders through the OPM edge renderer.
- Reloading/saving the diagram preserves the new semantic link type.
- An invalid conversion causes no partial mutation.
- A regression test proves edge.type === 'opmEdge' and edge.data.type === requestedType.

### REQ-P0-02: Production integration of block/link conversion

The block and link conversion helpers shall be called by the production OPM properties panel and not only by tests.

Acceptance criteria:

- Selecting a block exposes a type selector.
- Selecting a transition exposes a link-type selector.
- Applying a conversion updates the canvas and properties panel.
- Incompatible data produces a confirmation warning before mutation.
- Cancel leaves the original model unchanged.

### REQ-P0-03: Real port-aware connection validation

Every OPM connection shall validate the actual source and target handles before it is committed.

The validator shall verify:

- source and target node existence;
- source and target handle existence;
- handle ownership by the declared node;
- source handle direction is source and target handle direction is target;
- semantic port role and link-type compatibility;
- scalar/data type compatibility;
- duplicate links and port multiplicity;
- node-level ISO 19450 link rules;
- whether the connection is conceptual-only or executable.

Acceptance criteria:

- The connection preview and final onConnect path call the same validator.
- A missing, reversed, incompatible, or duplicate handle connection is rejected.
- Rejected connections never enter React Flow state.
- The verdict returns the resolved source and target port records, not unknown.
- Tests cover every link type supported by OpmLinkRules.

### REQ-P0-04: Fail-closed C generation lifecycle

Generating C artifacts shall not mark them as qualified. Qualification shall be a separate successful operation.

Required lifecycle:

draft → validated → generated(pending) → verifying → verified

Any validation, generation, compiler, runtime, or parity failure shall lead to failed and shall block download/HIL export.

Acceptance criteria:

- generateOpmCArtifacts returns qualificationStatus: pending on successful generation.
- Only successful host compilation and runtime parity change the status to qualified/verified.
- The manifest records the actual qualification result and toolchain evidence.
- Download and HIL export remain disabled until the current model fingerprint is verified.

### REQ-P0-05: Surface all generation diagnostics

Diagnostics returned by normalization, semantic validation, C generation, and qualification shall be merged into the visible OPM diagnostics state.

Acceptance criteria:

- Invalid identifiers, resource overflow, invalid expressions, and compiler failures are visible to the user.
- The code-generation panel does not report generated when files are empty or generation diagnostics contain errors.
- Each diagnostic includes stable code, severity, element ID, and property path where available.
- Selecting a diagnostic focuses the corresponding editor control.

## P1 Requirements — Required for Standard Release

### REQ-P1-01: Integrate OPM-specific simulation configuration

The OPM editor shall use a persisted OPM configuration independent of the application State Machine tick.

Minimum configuration:

    interface OpmSimulationConfig {
      tickMs: number;
      maxTicks: number;
      maxEventsPerTick: number;
      deterministicOrder: 'priority-then-source-order';
    }

Acceptance criteria:

- OPM simulation reads only OpmSimulationConfig.tickMs.
- Saving and restoring an OPM project preserves this configuration.
- Invalid values are rejected with a diagnostic and do not silently round or fall back.
- The State Machine tick value remains unchanged when OPM tick is edited.
- Tests prove OPM and State Machine tick values can differ in the same application session.

### REQ-P1-02: Enforce strict configuration bounds

tickMs, maxTicks, and maxEventsPerTick shall be finite positive integers within documented upper bounds.

Acceptance criteria:

- 0, negative values, NaN, Infinity, fractional values, and values above the supported maximum are rejected.
- The previous valid configuration remains active after a rejected edit.
- The error identifies the exact configuration property.

### REQ-P1-03: Consistent warm-light selection behavior

Selecting any OPM object, process, state, requirement, or transition shall apply a consistent warm amber visual treatment.

Acceptance criteria:

- Node border, label, ports, edge path, marker, and selected-link badge use the same selection cue.
- Selection glow is visually distinct from simulation firing/active-flow animation.
- Keyboard focus is visible without requiring hover.
- Selection state and property-panel state cannot become stale after a conversion or model update.

### REQ-P1-04: Deterministic OPM runtime contract

The canonical TypeScript runtime shall execute each tick in this order:

1. Apply/latch external inputs.
2. Dispatch external events within the event limit.
3. Advance timers.
4. Evaluate guards and enablers from one immutable pre-commit snapshot.
5. Resolve process and transition conflicts by documented priority/order.
6. Stage writes and state changes.
7. Commit valid writes and state changes.
8. Emit trace and diagnostics.
9. Advance simulated time by exactly tickMs.

Acceptance criteria:

- The same model/input/configuration produces identical traces across repeated runs.
- Event overflow, write conflict, transition conflict, invalid initial state, and max-tick termination have stable diagnostics.
- A failed tick does not partially commit state or values.
- The React adapter only presents canonical runtime results and does not implement a second semantic engine.

### REQ-P1-05: Embedded C artifact contract

The OPM C generator shall produce deterministic C99 artifacts suitable for embedded integration.

Required public API:

- OPM_Init
- OPM_Reset
- OPM_Step
- OPM_DispatchEvent

Required properties:

- fixed-width integer types;
- no heap allocation in the generated runtime;
- compile-time bounded arrays;
- safe deterministic C identifiers;
- configurable target hooks without shared-engine imports;
- diagnostics counters for event drops, conflicts, invalid transitions, and resource exhaustion;
- manifest containing model fingerprint, generator version, OPM tick, resource limits, compiler flags, and qualification status.

Acceptance criteria:

- Generated output compiles with -std=c99 -pedantic-errors -Wall -Wextra -Werror.
- Resource overflow emits no partial downloadable package.
- Generated output is byte-identical for semantically identical input orderings.
- No generated C artifact imports or invokes State Machine/X-Bridges generator code.

### REQ-P1-06: TypeScript/C parity qualification

The release gate shall compare TypeScript and compiled C snapshots for the same scenarios.

Acceptance criteria:

- Missing compiler fails the gate instead of skipping it.
- Extra stdout, duplicate step indexes, non-finite values, unsafe IDs, fingerprint mismatch, and snapshot divergence fail the gate.
- Qualification records compiler, flags, model fingerprint, scenario, and pass/fail evidence.
- A mutation-resistance test proves the gate rejects wrong scheduler order, wrong conflict winner, wrong event consumption, and wrong assignment target.

### REQ-P1-07: Diagnostic navigation

Every visible diagnostic with a source property path shall navigate to the selected element and focus the matching data-opm-path control.

Acceptance criteria:

- Node diagnostics select the correct node.
- Edge diagnostics select the correct edge and open its editor.
- Property paths containing array indexes resolve to the correct control.
- Missing controls produce a visible fallback message instead of silently doing nothing.

## P2 Requirements — Quality and Maintainability

### REQ-P2-01: Pure helper tests

Migration, port-contract, configuration, and selection helpers shall be unit tested without React Flow or browser state wherever possible.

### REQ-P2-02: Production-path tests

At least one test per feature shall exercise the production component integration, not only the pure helper. The release-flow test shall fail if helpers are no longer imported by production OPM code.

### REQ-P2-03: Protected-engine boundary test

The boundary test shall scan all OPM production source files and reject imports from State Machine or X-Bridges runtime/generator modules. The final PR shall show no protected-path diff.

### REQ-P2-04: Verification commands

The implementation PR shall pass:

    npx tsc --noEmit
    npx vitest run src/components/entropy/__tests__ src/engine/opm/__tests__
    npm run test:opm:qualification
    npm run build

The browser smoke test shall exercise OPM selection, conversion, valid/invalid connection, tick editing, one simulation tick, C generation, failed verification, successful verification, and download gating.

## Definition of Done

The Antigravity OPM changes are ready for merge only when:

- all P0 and P1 requirements pass;
- all release verification commands pass;
- the browser smoke flow passes on the actual production OPM workspace;
- no new helper exists only in tests without production integration;
- generated C is not labelled qualified before qualification;
- the final diff contains no State Machine/X-Bridges runtime or generator changes;
- a reviewer can trace every generated artifact to a verified model fingerprint and qualification record.
