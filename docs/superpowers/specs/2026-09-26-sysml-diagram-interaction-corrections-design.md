# SysML v1.6 Diagram Interaction Corrections Design

**Date:** 2026-09-26

**Scope:** Repository-backed corrections for Port and Property authoring, IBD connectors, Requirement Diagram navigation and TestCase presentation, State satisfaction, and Package Diagram activation.

## Goal

Correct the reported BDD, IBD, Requirement Diagram, and Package Diagram workflows so every enabled action changes the canonical model through validated commands and every presentation resolves an existing semantic element. Cameo is the interaction benchmark; normative semantics remain attributable to UML or SysML v1.6.

## Semantic Authority

- Standard UML Port, Property, Connector, Association, Dependency, Package, and Diagram foundations: `UML_FOUNDATION`.
- ProxyPort, FullPort, legacy FlowPort, Block, PartProperty, InterfaceBlock, Requirement, Satisfy, Verify, and TestCase usage: `OMG_SYSML_1_6`.
- Palette grouping, smart placement, explicit diagram navigation, context menus, last-active diagram opening, and user-facing notation: `CAMEO_TOOLING`.
- Stable diagnostics, command transactions, AI approval boundaries, legacy VerificationCase normalization, and compliance evidence storage: `ADIA_EXTENSION`.

Cameo behavior must not be reported as an OMG requirement unless the normative specification independently requires it.

## Global Architecture

`SysmlRepository` remains the only writable semantic model. `sysmlCommandGateway` is the shared mutation boundary for canvas, Model Explorer, imports, scripts, migration adapters, and AI agents. React components dispatch intents and render projections; they do not create repository-shaped semantic objects locally.

Every canvas symbol stores presentation data keyed by the active persisted diagram ID. One semantic Port, Property, Block, State, Requirement, or TestCase may have multiple presentations without duplication. Rename, ownership, typing, and relationship changes resolve through the shared semantic ID.

All create-and-present workflows are atomic. If semantic creation or presentation validation fails, neither operation commits. `Remove from Diagram` removes only presentation state. `Delete from Model` uses semantic impact analysis and removes dependent relationships and presentations after confirmation.

## BDD Port Authoring

The BDD palette exposes one compact **Port** control with four explicit choices:

1. Standard UML Port
2. Proxy Port
3. Full Port
4. Flow Port — Legacy

After choosing a kind, the user clicks the owning Block. The command creates the semantic Port as an owned feature and adds a border presentation to the active BDD. The selected tool may remain active for repeated creation; Escape cancels it. Model Explorer offers the same four choices under a Block and dispatches the same command.

The generic Standard Port is not automatically stereotyped as ProxyPort or FullPort. ProxyPort creation requires selection of an existing InterfaceBlock. If none is selected or available, creation returns `TYPE_NOT_FOUND` with compatible candidates and an explicit `CreateNewType` action. No command caller may silently create the InterfaceBlock.

Port properties expose kind, existing type, direction where applicable, conjugation, multiplicity, and ownership. Semantic constraints are validated independently of the diagram:

- ProxyPort and FullPort cannot simultaneously classify the same Port.
- ProxyPort must be typed by an InterfaceBlock.
- Nested ProxyPorts must obey SysML v1.6 nesting constraints.
- Proxy behavior remains semantically distinct from a separate system element.
- FlowPort remains available only as a clearly marked legacy SysML representation.

## BDD Property Authoring and Relationships

Creating a Property from the canvas requires clicking the owning Block. Tree and canvas creation use one command and create one owned semantic Property. Typed properties require an existing compatible type; missing types return `TYPE_NOT_FOUND` and do not create placeholders.

A Property may be used as a relationship endpoint where UML/SysML permits it. Drawing from a Property to a Block opens or uses an explicit relationship-kind choice. The application does not infer composition, association, dependency, allocation, or another semantic relationship merely from geometry. Endpoint validation, direction, ownership, persistence, undo, and projection are handled in the backend before a line appears.

The minimum supported relationship choices for this correction are Association, Dependency, and Allocate where their endpoint rules permit them. Composite ownership remains represented by the Property's ownership and aggregation semantics rather than by an unrelated display-only connector.

## IBD Boundary Ports and Connectors

An IBD context is a Block semantic ID. Boundary Ports shown on its dotted frame are Ports owned by that context Block. A PartProperty shown inside the IBD is a semantic usage owned by the context Block. Its displayed Ports resolve Ports of its type and use occurrence-aware connector endpoints.

The connector tool supports:

- context boundary Port to PartProperty Port;
- PartProperty Port to PartProperty Port;
- legal delegation and assembly connector variants;
- connector creation only when both endpoint presentations belong to the active IBD context.

The command must reject missing Ports, endpoints outside the context, illegal connector kinds, unresolved types, and invalid duplicates with stable diagnostics. Successful creation persists connector endpoint identities, survives save/reload, and can be undone and redone without replacing semantic elements.

## Requirement Diagram Navigation and TestCase

A Block displayed on a Requirement Diagram is a presentation of the same canonical Block used by BDDs. Double-clicking that Block performs no navigation and no mutation. Navigation is available through explicit context actions such as `Open Specification`, `Open in BDD`, or `Open IBD`, matching Cameo's explicit diagram-navigation style.

SysML v1.6 `TestCase` is the normative semantic concept. Canvas creation atomically creates one TestCase and one presentation on the active Requirement Diagram. Tree creation creates one repository TestCase; `Add to Diagram` presents that same ID. The TestCase projection must be visible, selectable, movable, removable from the diagram, deletable from the model with impact analysis, and stable through save/reload.

Legacy ADIA `VerificationCase` data is normalized to TestCase. Any remaining public name `VerificationCase` is classified as `ADIA_EXTENSION`; it is not described as a normative SysML metaclass.

Requirement Diagram visibility is based on explicit presentations and legal relationship endpoints, not on converting Blocks or TestCases into Requirement-shaped frontend objects.

## State Satisfaction of Requirements

State-to-Requirement `satisfy` is accepted with the State as client/source and Requirement as supplier/target. The endpoint classifier must recognize the canonical State regardless of whether the relationship starts from the State Machine canvas, Requirement Diagram, Model Explorer, import, script, or AI command.

The correction removes inconsistent legacy/canonical endpoint classification that currently produces `INVALID_SATISFY_DIRECTION` for a valid source. The opposite direction remains invalid and returns the same stable diagnostic with a corrective message. Tests cover semantic validation, command creation, diagram projection, undo/redo, save/reload, and invalid-direction atomicity.

## Package Diagram Activation

The Package Diagram application control never silently does nothing:

- If a persisted Package Diagram was active previously, open that exact semantic diagram ID.
- If exactly one Package Diagram exists, open it.
- If multiple Package Diagrams exist and none was last active, expose a chooser or direct Model Explorer selection without inventing a synthetic ID.
- If none exists, show a clear `Create Package Diagram` action. Creation uses the shared repository command with Model as the default owner and opens the returned diagram ID.
- Double-clicking a Package Diagram tree node always opens that exact persisted diagram.

Failure preserves the current active diagram and displays the backend diagnostic. Package mode never substitutes the literal string `package` for a repository diagram ID.

## Commands and Diagnostics

The implementation adds or consolidates explicit intents for:

- `createOwnedPortAndPresent`
- `createOwnedPropertyAndPresent`
- `createConnectorAndPresent`
- `createTestCaseAndPresent`
- `createRelationshipAndPresent`
- `openDiagram`

These may be represented as typed compositions of existing batch commands when atomicity and diagnostics are preserved. UI-specific code must not bypass the gateway.

Required stable diagnostics include:

- `TYPE_NOT_FOUND`
- `INVALID_PORT_TYPE`
- `INVALID_PROXY_PORT_TYPE`
- `INVALID_NESTED_PROXY_PORT`
- `INVALID_RELATIONSHIP_ENDPOINT`
- `INVALID_CONNECTOR_ENDPOINT`
- `ENDPOINT_OUTSIDE_IBD_CONTEXT`
- `INVALID_SATISFY_DIRECTION`
- `DIAGRAM_NOT_FOUND`
- `PRESENTATION_ALREADY_EXISTS`

Every rejection leaves repository, undo history, presentation state, and active diagram state unchanged.

## No Silent Semantic Creation

When a requested Port, Property, PartProperty, relationship endpoint, type, Requirement, TestCase, or Diagram does not exist, all command callers return the relevant not-found diagnostic. `TYPE_NOT_FOUND` includes candidate existing elements and an explicit `CreateNewType` action. UI, imports, migration adapters, scripts, and AI agents have identical rules; AI receives no privileged creation path.

## Compliance and Evidence

Compliance is evaluated at four levels for every delivered feature:

1. Element — the semantic entity exists.
2. Properties — normative semantic properties are represented correctly.
3. Relationships — all required legal relationships have correct endpoint and ownership semantics.
4. Constraints — invalid configurations are rejected or diagnosed.

No feature is marked `COMPLIANT` without automated semantic evidence. Each evidence record identifies authority, specification section, source file, domain type, command, validator, persistence mapping, projection, and automated test. A feature with any failed level remains `PARTIAL` or `NON_COMPLIANT`.

## Test Strategy and Release Gates

Semantic tests run without React and prove Port constraints, type lookup, Property endpoints, connector context rules, TestCase identity, State satisfaction, and diagram activation selection. Gateway tests prove transaction atomicity, stable IDs, undo/redo, deletion distinction, and no-silent-creation behavior. Persistence tests prove save/load and migration stability.

Browser tests cover:

- all four BDD Port tools plus matching tree commands;
- ProxyPort InterfaceBlock selection and missing-type rejection;
- Property creation and explicit Property-to-Block relationship selection;
- boundary Port to PartProperty Port connector creation on an IBD;
- Requirement Diagram Block double-click no-op and explicit navigation;
- TestCase creation from tree and canvas, presentation, move, removal, and deletion;
- State-to-Requirement Satisfy creation and wrong-direction rejection;
- Package Diagram activation with zero, one, and multiple repository diagrams.

Final gates include TypeScript, the full SysML suite, semantic identity, repository-first architecture, persistence, Model Explorer, browser workflows, large-model performance, and repository/code-generation isolation. Environment-dependent target compiler or sanitizer limitations are recorded separately and never misreported as semantic compliance.

## Success Criteria

- Every reported action either commits a validated semantic change and corresponding presentation or returns a visible stable diagnostic.
- Tree and canvas actions produce identical canonical entities and constraints.
- No UI element is enabled without a backend command, validator, persistence mapping, projection, and automated evidence.
- Existing BDD, IBD, Requirement, RTM, Package Diagram, deletion, hierarchy, semantic identity, and code-generation behavior remain regression-tested.
