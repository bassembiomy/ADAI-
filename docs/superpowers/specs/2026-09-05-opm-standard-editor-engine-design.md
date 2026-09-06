# OPM Standard Editor, Simulation, and Embedded Code Generation Design

**Status:** Design approved by user for planning

**Date:** 2026-09-05

## Goal

Upgrade the Entropy OPM module into a standards-oriented editor and execution pipeline where blocks and links are easy to inspect and change, selected elements receive a consistent warm-light treatment, simulation uses an OPM-owned configurable system tick, and generated C is qualified against the canonical OPM runtime without changing the existing State Machine or X-Bridges generation engines.

## Current Review Findings

- The editor is implemented with React Flow in `src/components/entropy/EntropyWorkspace.tsx`.
- OPM node and edge renderers already provide partial ISO-style visual cues and amber selection glow in `OPMNodeComponents.tsx` and `OPMEdgeComponents.tsx`.
- Link type changes are partially available through the selected-edge badge, but node type conversion is not a first-class migration flow.
- `OpmLinkRules.ts` validates semantic link direction, but the editor does not yet expose a complete port-contract model for every connection case.
- `OpmSimulationEngine.ts` is a useful adapter around the canonical OPM runtime, but OPM tick ownership and scheduling policy are not yet isolated clearly from the application-wide tick setting.
- `src/engine/opm/pipeline.ts`, `cGenerator.ts`, `cRuntimeGenerator.ts`, and `cHostHarness.ts` already establish a separate OPM compilation and C qualification path. This boundary must be preserved and strengthened.
- The main State Machine and X-Bridges engines are shared application infrastructure and are explicitly out of scope for refactoring or behavioral changes.

## Scope

### Included

- OPM node and edge selection behavior, warm-light styling, and keyboard/mouse accessibility.
- Explicit conversion of OPM block types and transition/link types with deterministic migration warnings.
- Strong port/link compatibility validation before a connection is committed, before simulation, and before code generation.
- OPM-specific tick configuration and deterministic scheduling.
- Standards-oriented OPM runtime diagnostics, trace output, and state transition semantics.
- Embedded-focused C99 generation, target configuration, bounded resources, diagnostics, and strict TypeScript/C conformance evidence.
- OPM-only tests, qualification fixtures, documentation, and release gating.

### Excluded

- Changes to the main State Machine runtime or its C/H generator.
- Changes to the X-Bridges runtime, block definitions, or its C/H generator.
- Replacing React Flow or rewriting the application shell.
- Adding a new external simulation dependency.

## Design Principles

1. **OPM isolation:** all OPM-specific behavior lives behind `src/engine/opm` and `src/components/entropy`; shared engines remain untouched.
2. **Canonical model first:** editor data is normalized into the executable OPM model before validation, simulation, or C generation.
3. **Fail closed:** invalid direction, unsupported link semantics, invalid identifiers, unsupported expressions, resource overflow, or compiler absence must produce a visible diagnostic and block the affected action.
4. **Determinism:** identical model, input events, and tick configuration produce identical TypeScript traces and C qualification output.
5. **Safe migrations:** conversions preserve `id`, name, position, ports, and attributes whenever possible; incompatible execution fields are disabled or removed only after an explicit warning.
6. **Embedded suitability:** generated C is freestanding C99-oriented, bounded, identifier-safe, diagnosable, and accompanied by manifest metadata and qualification evidence.

## Architecture

```text
React Flow editor
  ├─ OPM node/edge renderers and selection state
  ├─ conversion/migration helpers
  └─ OPM port/link editor
          │
          ▼
Editor boundary model (`editorBoundaryTypes.ts`)
          │
          ▼
Canonical adapter + semantic validator
          │
          ├─ OPM TypeScript runtime + deterministic scheduler
          └─ OPM C IR → C99 runtime/artifacts → host qualification

State Machine runtime/generator ─────────────── unchanged
X-Bridges runtime/generator ─────────────────── unchanged
```

The editor boundary remains permissive enough for conceptual diagrams, while the canonical executable model is strict. Conceptual-only nodes and links can be edited and saved, but simulation and code generation must identify the exact diagnostics that prevent execution.

## Editor and UI Behavior

### Selection and warm-light feedback

- Selecting any OPM object, process, state, or requirement applies one shared warm amber treatment to the complete node boundary, label, ports, and focus ring.
- Selecting any OPM link applies the same warm treatment to the hit area, visible path, marker, and floating action badge.
- Simulation activity remains visually distinct from selection: warm amber means selected; execution colors and pulse animation mean active/firing.
- Keyboard focus must be visible and must not depend on hover-only labels.
- Selection state is controlled by React Flow and mirrored into the editor panel without stale copies of node/edge data.

### Block conversion

The editor exposes a type selector for the selected block and calls:

```ts
convertOpmNodeType(
  node: AppNode,
  nextType: OPMNodeType,
): { node: AppNode; warnings: OpmMigrationWarning[] }
```

The conversion rules preserve the node ID, name, position, dimensions, ports, attributes, and user metadata. The converter must return warnings for removed or disabled state/execution fields, unsupported parent relationships, and links that become invalid after conversion. The UI must show the warnings before applying a destructive migration and provide cancel/apply actions.

### Link conversion

The selected-link badge and properties panel expose a type selector and call:

```ts
convertOpmEdgeType(
  edge: AppEdge,
  nextType: OPMLinkType,
): { edge: AppEdge; warnings: OpmMigrationWarning[] }
```

The conversion preserves the edge ID, endpoints, handles, label, condition text, and execution metadata when compatible. It revalidates direction and port compatibility before committing the change. Invalid conversions remain unapplied and show an actionable diagnostic.

### Ports and connections

Every visible port has an ID, direction, position, semantic role, scalar/data type, and owner. Connection validation must check:

- source/target direction;
- source and target existence;
- port ownership and handle identity;
- link role compatibility with source and target node types;
- scalar/data type compatibility;
- multiplicity and duplicate-link constraints;
- whether a conceptual link is allowed but executable link is not.

The connection preview must use the same validator as final commit so the user receives feedback before release of the pointer. Invalid connections are never added to React Flow state.

## OPM Simulation Engine

OPM owns an execution configuration separate from the application State Machine tick:

```ts
interface OpmSimulationConfig {
  tickMs: number;
  maxTicks: number;
  maxEventsPerTick: number;
  deterministicOrder: 'priority-then-source-order';
}
```

The OPM workspace receives and persists this configuration in `OPMProjectData`. The global application tick may remain available to other modules, but OPM simulation and OPM C generation use only the OPM configuration passed through the OPM pipeline.

Each tick must have an explicit sequence: apply latched inputs, dispatch queued events, evaluate guards/enablers, resolve conflicts deterministically, apply staged state/attribute writes, emit trace/diagnostics, and advance simulated time by `tickMs`. The TypeScript runtime and generated C runtime must implement the same sequence and boundary rules.

## Embedded C Generation

The OPM code-generation flow remains independent from the main generator:

```text
OPM editor model
  → compileExecutableOpm()
  → semantic diagnostics
  → OPM C IR
  → generated header/source/runtime/manifest
  → strict C99 compile
  → conformance execution against TS snapshots
```

The generated package must provide:

- stable public API for `OPM_Init`, `OPM_Reset`, `OPM_Step`, `OPM_DispatchEvent`, and input/output access;
- target-independent core runtime with explicit target configuration hooks;
- fixed-width integer and controlled floating-point types;
- bounded arrays and compile-time resource constants;
- safe C identifiers and deterministic symbol naming;
- diagnostics counters for dropped events, conflicts, invalid transitions, and resource exhaustion;
- manifest fields for model fingerprint, generator version, tick configuration, limits, compiler flags, and qualification status;
- no shell-dependent generation or compilation arguments;
- failure to generate or qualify when any required compiler, validation, or resource condition is unavailable.

The OPM C pipeline must not import or invoke the State Machine/X-Bridges code-generation implementation. A boundary test will assert that OPM generation only consumes OPM canonical model types and OPM generator modules.

## Error Handling and UX

- Every diagnostic includes severity, stable code, message, element ID, and property path when applicable.
- Blocked actions keep the user in the editor and focus the first invalid element.
- Conversion warnings are shown before mutation; validation errors are shown before simulation/code generation.
- A generated artifact is downloadable only after validation and qualification succeed for the current model fingerprint.
- Editing the model invalidates prior artifacts and qualification evidence.
- Tick values must be finite integers within an explicit supported range; invalid values are rejected without changing the previous configuration.

## Verification Strategy

### Editor tests

- warm selection is applied consistently to node and edge renderers;
- selection and focus are distinguishable from simulation activity;
- node conversion preserves common fields and emits exact warnings for incompatible fields;
- edge conversion preserves endpoints and refuses invalid role/direction changes;
- connection preview and commit share the same validation result;
- OPM tick setting is persisted and does not mutate the main engine tick.

### Runtime tests

- deterministic initial-state selection;
- trigger, condition, agent, instrument, consumption, result, and effect semantics;
- priority/order conflict resolution;
- event queue limits and diagnostics;
- exact simulated-time increments for configurable tick values;
- reset and repeated-run determinism.

### C qualification tests

- generated artifacts compile with strict C99 flags and warnings-as-errors;
- TypeScript and C snapshots match for every qualification fixture;
- invalid model, unsafe identifier, unsupported expression, missing compiler, and resource overflow fail closed;
- generated manifest fingerprint matches the input canonical model;
- OPM qualification does not import or alter State Machine/X-Bridges generators.

### Release gate

The OPM release is ready only when TypeScript tests, strict type-check, OPM host qualification, and a focused browser smoke test all pass. The browser smoke test must exercise selection, conversion warning, valid/invalid link creation, tick configuration, simulation, and code-generation status.

## Rollout

1. Add pure migration and port-contract helpers with tests.
2. Integrate UI selection, conversion, and connection feedback.
3. Separate and persist the OPM simulation configuration and scheduler.
4. Harden the OPM C generator and qualification manifest.
5. Add boundary tests and release gate.
6. Review the resulting PR before merging; do not merge changes into State Machine/X-Bridges paths as part of this work.

## Implementation and Release Flow Status

All planned milestones have been implemented and verified:
- **Warm-light Selection & Port Contracts:** Every selected OPM block and transition shares the warm golden-amber selection treatment. Link creation strictly validates ISO 19450 contracts in real time for both preview and commit (`validateOpmPortConnection`).
- **Safe Block and Edge Conversions:** `convertOpmNodeType` and `convertOpmEdgeType` preserve common node data and emit explicit user warnings (`OPM_STATE_DATA_DISABLED`, `OPM_STATE_PARENT_REQUIRED`) before mutating structures.
- **Deterministic Scheduler & Independent Tick:** OPM runtime uses canonical `stepOpmRuntime(runtime, input)` with explicit latch, evaluation, staging, and commit phases. Tick configuration is strictly decoupled from State Machine tick.
- **Embedded C99 Code Generator:** Emits bounded C99 artifacts with standard API (`OPM_Init`, `OPM_Reset`, `OPM_Step`, `OPM_DispatchEvent`), compile-time limits, fail-closed identifier safety, and JSON manifest.
- **Boundary & Qualification Gates:** `test:opm:qualification` strictly tests compiler presence, snapshot parity, and enforces zero-import isolation from State Machine and X-Bridges generators.
- **Release UX & Lifecycle Management:** The codegen workspace tracks canonical states `draft`, `generated`, `verified`, and `failed` linked to `model.fingerprint`. Model edits immediately invalidate to `draft`, disabling download/export and displaying remediation guidance until re-verified.

