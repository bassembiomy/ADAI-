# SysML Package Diagram and Contextual Editing Design

## Purpose

ADIA will provide Cameo-aligned package-diagram creation and navigation, context-aware child creation, and complete synchronization among Model Explorer, diagram canvases, and the property panel. Every visible mutation will have real domain behavior, pass through the backend command/transaction boundary, persist in the canonical SysML repository, and comply with SysML v1.6 semantics.

This is a phased master design. Each phase must leave ADIA usable and independently testable; compatibility adapters may remain only until the corresponding UI surface reads exclusively from canonical projections.

## Current Context

ADIA already has a canonical SysML repository, command gateway, validation and persistence services, repository-backed diagram definitions and presentations, Model Explorer projections, and diagram navigation helpers. Package-diagram semantics and several interaction paths have test coverage. The remaining architectural risk is the active legacy UI representation in `src/App.tsx` and `src/types/sysml_types.ts`, where block, part, connector, and relationship arrays can still act as writable state beside the canonical repository.

The implementation must extend and consolidate existing services rather than introduce a third model or another synchronization mechanism.

## Architecture

The canonical SysML repository is the only writable model. All user operations follow one route:

`UI interaction -> semantic context resolver -> typed command -> validation and transaction -> canonical repository -> tree/canvas/property projections`

Legacy UI structures become read-only compatibility projections while each surface migrates. They are removed when parity tests establish that the corresponding repository projection supplies all required data.

Each mutation is atomic, undoable, persistable, and identified by stable semantic IDs. Presentation state remains separate from semantic ownership: showing an existing element in a diagram creates or updates a presentation but never duplicates or reparents the semantic element.

## Semantic Context and Ownership Resolution

Creation commands resolve their owner according to their invocation source:

1. A command from the property panel targets the semantic element to which the panel is bound.
2. A command from a focused diagram targets the selected canvas element.
3. Otherwise, a command from Model Explorer targets the selected tree element.
4. A diagram row delegates to the diagram's semantic `ownerId`; a diagram is never the semantic owner of model elements.
5. The domain capability service checks whether the target may own the requested metaclass.
6. If no legal owner is selected, the action is disabled and explains the required selection. ADIA does not open a parent-selection popup as a fallback.

Direct child-creation commands therefore do not ask users to choose a parent when the interaction already establishes one. A chooser remains appropriate when the command requires a distinct semantic reference, including selecting a port type, property type, relationship endpoint, connector end, conveyed classifier, or target diagram when several exact navigation targets exist.

The same resolver and capability result are used by context menus, canvas palettes, keyboard shortcuts, toolbars, and property-panel buttons so that invocation surfaces cannot disagree.

## Package Diagram Lifecycle

Model Explorer exposes **Create Diagram -> Package Diagram** when the selected semantic owner is Model or Package. The operation creates a real repository diagram with a stable ID, exact `ownerId`, name, kind, navigation identity, and presentation collection. It then selects the new tree node and opens its workspace tab.

A package diagram may present packages and every other repository element permitted by the ADIA SysML v1.6 package-diagram policy. Adding an existing element creates a presentation only. Creating an element on the diagram creates the semantic element beneath the resolved namespace owner and creates its presentation in one transaction.

Package diagrams participate in the same lifecycle as BDD, IBD, requirements, parametric, activity, use-case, and state-machine diagrams: open, close, rename, move where legal, copy/paste where legal, delete with impact analysis, undo/redo, save/reload, tab activation, breadcrumb selection, and back navigation.

Opening a symbol resolves an exact target using explicit diagram references first and uniquely owned diagrams second. One target opens directly. Multiple valid targets open a deterministic chooser sorted by name and stable ID. No valid target produces an explanatory disabled state or diagnostic; it never fabricates a pseudo-diagram ID.

## Context-Aware Element Creation

In a BDD, **Add Port** on a selected block creates the port directly under that block. The same action from the block's property panel targets the panel-bound block. Equivalent behavior applies to every legal owned element in every supported diagram, including:

- value, part, reference, flow, constraint, and parameter properties;
- standard, proxy, and full ports;
- operations, constraints, parameters, pins, actions, states, regions, transitions, requirements, test cases, and use cases;
- diagram-owned presentations and semantic diagram references.

Creating connections or behavioral relationships requires legal endpoint resolution. The completed relationship, its explicit endpoint data, and any associated item flow are stored as first-class repository elements. Canvas geometry and labels are stored as presentation data. A relationship is never represented only as an SVG line or component-local state.

Commands that require a type use an existing compatible classifier or offer an explicit create-and-type workflow. They do not silently create semantic types.

## Model Explorer Projection

Model Explorer is a deterministic projection of the canonical repository. It includes definitions, usages, owned features, ports, properties, operations, constraints, connector ends, connectors, item flows, allocations, requirement relationships, state transitions, activity edges, use-case relationships, diagrams, and diagram references.

Tree nesting reflects semantic ownership. Diagram grouping may show where an element is presented, but it never changes or obscures the semantic owner. Relationship nodes expose source, target, owner, type, and navigable endpoints without duplicating the underlying relationship.

Repository revision and semantic IDs drive incremental updates and selection. Names and array positions are not identity. Selecting an element from the tree, a diagram, a relationship endpoint, a breadcrumb, or the property panel updates the shared semantic selection and aligns all other visible surfaces. When the selected element is not presented on the active diagram, the tree and property panel still select it and the canvas reports that it is outside the active view rather than selecting an unrelated symbol.

## Property Panel

The property panel is schema-driven by semantic metaclass plus presentation type. Every displayed field is classified as one of:

- editable semantic data, committed through a typed update command;
- editable presentation data, committed through a typed presentation command; or
- derived read-only data, visibly marked read-only with its source or reason.

Editable fields cover the complete supported data contract for the selected element: identity and naming, ownership where legal, stereotypes/metaclass-specific attributes, type references, multiplicity, direction, conjugation, aggregation, default/value/unit data, inheritance, relationship roles and endpoints, connector ends and nested paths, item flows, requirement fields and relations, behavioral guards/triggers/effects, documentation, and diagram presentation attributes.

Every enabled button dispatches a real command. Capability results determine whether buttons are visible or enabled and provide the disabled explanation. No field or button may exist as a display-only placeholder.

A successful edit immediately refreshes every projection and remains correct after undo, redo, save, close, and reload. A rejected edit leaves the repository and all projections unchanged and displays a field-level or command-level diagnostic.

## SysML v1.6 and Cameo Alignment

SysML v1.6 semantics are enforced in domain and service layers, not React handlers. Required rules include legal ownership, namespace uniqueness, definitions versus usages, port kinds and typing, proxy/full-port semantics, property kinds, multiplicity, aggregation, inheritance, nested connector ends, item-flow compatibility, relationship endpoint compatibility, allocation and requirement relationship rules, and separation of semantic and presentation data.

Cameo behavior guides interaction conventions—context menus, direct creation under the current context, specification/property editing, diagram opening, and deterministic target choice—where SysML does not prescribe UI behavior. Cameo conventions must not override the SysML metamodel or create proprietary semantic shortcuts.

## Transactions, Errors, and Persistence

All commands execute at the existing command/transaction boundary. A compound operation, such as create-and-present or create-relationship-with-ends, either commits in full or rolls back in full. Validation failures return stable diagnostic codes, affected semantic IDs, and actionable messages.

Undo and redo operate on repository transactions, not component snapshots. Persistence serializes canonical semantic elements and presentation records with schema versioning, migration, integrity validation, and existing checksum/transaction guarantees. Loading a project rebuilds all UI surfaces from the repository without merging stale component state.

## Delivery Phases

1. **Guardrails and semantic context:** introduce the shared interaction-context contract, capability-based enablement, command-only mutation checks, and regression tests around existing workflows.
2. **Package-diagram parity:** complete right-click creation for Model and Package, exact navigation, presentation behavior, lifecycle operations, and persistence.
3. **Context-aware creation:** remove redundant parent prompts and route direct child creation from canvas, tree, and property panel through the shared resolver.
4. **Repository-complete tree:** project all structural, behavioral, and relationship elements with stable selection synchronization.
5. **Schema-driven property editing:** make all supported fields and buttons functional, explicitly mark derived data, and add metaclass-specific validation.
6. **Relationship and behavior parity:** make connector ends, item flows, allocations, requirement relations, activity/state/use-case relationships, and navigation first-class across all surfaces.
7. **Legacy-state retirement:** convert remaining UI arrays to projections, remove merge paths and duplicate mutations, migrate saved data, and activate the single-writable-model release gate.
8. **Release certification:** run full SysML, persistence, performance, accessibility, and end-to-end matrices and document the supported SysML v1.6/Cameo behavior.

## Verification Strategy

Each phase starts with failing tests and ends with an independently usable deliverable. Verification layers are:

- domain tests for ownership, typing, endpoints, relationships, validation, and metaclass schemas;
- command tests for atomic mutation, diagnostics, revisioning, undo, and redo;
- projection tests for complete tree/canvas/property consistency;
- React interaction tests for context resolution, enabled/disabled actions, editing, and diagnostics;
- persistence and migration tests for semantic and presentation round trips;
- Playwright workflows covering tree -> diagram -> property panel -> save/reload and the reverse navigation paths;
- architecture gates rejecting direct UI mutation, duplicate writable models, presentation/semantic ownership confusion, or controls without command behavior;
- large-model regression gates using the existing 1k/10k/50k performance suites.

Representative acceptance scenarios include:

1. Right-click a package, create a Package Diagram, create and display content, reload the project, and reopen the same diagram from tree and canvas references.
2. Select a block on a BDD and add each port kind without a parent popup; verify repository ownership, tree placement, property-panel selection, canvas presentation, undo/redo, and reload.
3. Add the same port from the block property panel and obtain identical canonical results.
4. Create a connector or behavioral relationship and verify its relationship node, endpoints, editable fields, navigation, persistence, and deletion impact.
5. Attempt an illegal creation or edit and verify that the action is disabled or rejected atomically with a stable diagnostic and no repository revision change.

## Definition of Done

The work is complete only when:

- package diagrams have creation, navigation, editing, and persistence parity with other diagram types;
- direct child creation consistently uses the interaction's already-selected legal owner and never asks for a redundant parent;
- every supported semantic element and relationship appears in Model Explorer and is navigable;
- every displayed editable property field and enabled button has tested canonical behavior;
- tree, canvas, property panel, tabs, and breadcrumbs remain aligned by semantic identity;
- no UI path directly mutates a parallel writable model;
- every mutation has frontend wiring, backend/domain behavior, validation, undo/redo, persistence, and automated round-trip coverage;
- the applicable SysML v1.6 conformance and Cameo-interaction scenarios pass the release gates.
