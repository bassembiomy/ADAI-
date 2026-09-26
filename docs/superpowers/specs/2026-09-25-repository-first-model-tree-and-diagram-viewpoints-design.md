# Repository-First Model Tree and Diagram Viewpoints Design

## Goal

Make the Model Tree the authoritative semantic repository editor and make BDD, IBD, Requirements, and other diagrams projections of the same semantic elements. Match Cameo-style interaction where practical without misreporting tooling behavior as an OMG SysML v1.6 requirement.

## Semantic Authorities

- Semantic element, ownership, relationship, and constraint rules declare either `OMG_SYSML_1_6` or `UML_FOUNDATION` authority.
- Context menus, “All Types…”, drag/drop, and diagram presentation behavior declare `CAMEO_TOOLING` authority.
- Approval, AI assistance, compatibility migration, and application-specific workflows declare `ADIA_EXTENSION` authority.
- No Cameo interaction is presented as normative SysML unless independently supported by SysML v1.6 or UML.

## Core Invariants

1. One semantic element has one stable repository identity.
2. An element may have zero or many diagram presentations.
3. A presentation references a semantic element; it never copies semantic fields.
4. Tree creation commits semantics before any presentation is created.
5. Diagram creation commits semantics and presentation in one transaction.
6. “Add to Diagram” creates only a presentation.
7. “Remove from Diagram” removes only a presentation.
8. “Delete from Model” deletes semantics only after impact analysis and removes or invalidates dependent presentations and relationships.
9. Rename and property edits resolve through semantic identity and appear in every presentation.
10. Missing referenced types return `TYPE_NOT_FOUND` with candidates and `CreateNewType`; no UI, import, migration, script, or AI path may create a type silently.

## Architecture

The canonical SysML repository and command gateway are the only writable semantic path. The Model Tree and diagram toolbars dispatch typed commands to that gateway. Read-only projections produce tree nodes and diagram visuals. Legacy arrays remain compatibility projections during migration and must not become an independent source of truth.

```text
Model Tree / Diagram / Import / AI
               |
        typed command gateway
               |
     ownership + relationship policy
               |
       canonical repository transaction
               |
       semantic and presentation stores
               |
      tree and diagram projections
```

## Model Tree Behavior

Right-clicking a semantic tree item opens capability groups derived from its metaclass and repository context:

- New Element
- New Owned Feature
- New Relationship
- New Diagram
- Add to Active Diagram
- Open Specification
- Rename, Move, Copy, Duplicate, Delete

The default menu shows legal actions. “All Types…” shows the complete supported catalog, with illegal choices disabled and a precise ownership or endpoint diagnostic.

Capabilities are calculated by backend policy, not duplicated in JSX. The same policy is used by preflight and execution so the UI cannot advertise a command the repository rejects.

## Ownership Policy

The initial supported ownership matrix is:

| Owner | Legal owned elements/features |
|---|---|
| Model, Package | Package, Block, InterfaceBlock, ValueType, Requirement, TestCase, UseCase, Activity, ConstraintBlock, FlowSpecification |
| Block | PartProperty, ReferenceProperty, SharedPartProperty, ValueProperty, FlowProperty, UML Port, ProxyPort, FullPort, legacy FlowPort, ConstraintProperty, Operation |
| InterfaceBlock | FlowProperty, ValueProperty, ReferenceProperty, UML Port, ProxyPort, Operation |
| ConstraintBlock | ConstraintParameter, ValueProperty, ConstraintExpression, Operation |
| Requirement | nested Requirement and requirement-specific relationships; arbitrary classifiers are not semantically owned by a Requirement |
| Activity | ActivityParameter, Action, ObjectNode, ActivityPartition |
| UseCase | ExtensionPoint and supported UML-owned behavior features |
| TestCase | test behavior/evidence references supported by the ADIA repository |

When a Block, UseCase, or TestCase is created while a Requirements Diagram is active, its semantic owner is the selected Package or Model—not the Requirement currently visible on the diagram. The diagram receives a presentation reference to the newly created semantic element.

## Element Creation

Every create command includes:

- requested metaclass or semantic kind;
- explicit semantic owner ID;
- optional requested name;
- optional existing type ID;
- optional active diagram ID and initial bounds;
- command origin (`TREE`, `DIAGRAM`, `IMPORT`, `MIGRATION`, `SCRIPT`, or `AI`).

The gateway validates ownership, name rules, type references, and normative constraints. On success it commits the semantic element and, when requested, its presentation atomically. On failure neither is committed.

Generic Port creation produces a UML Port. ProxyPort and FullPort require explicit selection. FlowPort remains a legacy SysML v1 representation and is not the default.

TestCase is the normative SysML concept. Existing `VerificationCase` data is mapped to TestCase or identified as `ADIA_EXTENSION`; new UI labels use TestCase.

## Diagram Viewpoints

### BDD

Shows definitions and legal definition relationships. A Block first created or shown on a Requirements Diagram is available in the tree and can be added to a BDD without creating another Block.

### Requirements Diagram

Shows Requirements plus explicitly presented model elements such as Blocks, UseCases, Activities, and TestCases. Showing an element does not imply a relationship. Users explicitly create `satisfy`, `verify`, `refine`, `trace`, `deriveReqt`, `copy`, or containment relationships as permitted by endpoint policy.

### IBD

Shows the internal structure of a Block context: typed properties, ports, connectors, item flows, and constraint usages. A PartProperty references a Block type; it does not duplicate that Block.

## Relationships

Relationship creation is repository-first and endpoint-aware:

1. Select source in the tree or diagram.
2. Choose a legal incoming or outgoing relationship kind.
3. Target picker shows compatible existing semantic elements.
4. Gateway validates endpoints, ownership/context, duplicate rules, and constraints.
5. One semantic relationship is committed.
6. If a diagram is active and supports it, a relationship presentation is added.

At minimum the shared architecture supports Association, SharedAggregation, Composition, Generalization, Dependency, Allocate, Satisfy, Verify, Refine, Trace, RequirementContainment, DeriveReqt, Copy, Connector, BindingConnector, and ItemFlow. Invalid combinations are diagnosed; they are never silently converted to Trace.

## Properties, Ports, and Other Features

Properties and ports are owned semantic features with stable IDs. Tree rows and compartments are projections of those IDs. Editing a compartment dispatches the same command used by the specification panel and tree.

Typed features must reference an existing semantic type. If no type exists, creation pauses with `TYPE_NOT_FOUND`, candidate matches, and an explicit `CreateNewType` action. AI has no privileged bypass.

Port rules include:

- UML Port is distinct from ProxyPort, FullPort, and legacy FlowPort.
- ProxyPort and FullPort are mutually exclusive.
- ProxyPort is typed by InterfaceBlock and follows nested ProxyPort constraints.
- Legacy FlowPort references an appropriate FlowSpecification representation.
- Port names and ownership are validated at the repository layer.

## Presentation Lifecycle

Presentation records contain identity, semantic element ID, diagram ID, bounds, style overrides, and compartment state. They do not store semantic names, types, stereotypes, properties, ports, or relationship endpoints.

Opening or refreshing a diagram resolves semantic data by ID. A semantic rename therefore updates all diagrams without presentation rewrites. A diagram may have multiple presentations of the same semantic element only where the diagram policy explicitly allows it; otherwise duplicate presentation creation is rejected.

## Error Handling

Commands fail closed with stable diagnostic codes, including:

- `OWNER_NOT_FOUND`
- `ILLEGAL_OWNERSHIP`
- `TYPE_NOT_FOUND`
- `INVALID_RELATIONSHIP_ENDPOINT`
- `INVALID_DIAGRAM_ELEMENT`
- `ALREADY_PRESENTED`
- `SEMANTIC_CONSTRAINT_VIOLATION`
- `DELETE_CONFIRMATION_REQUIRED`

Disabled “All Types…” actions display the same diagnostics produced by backend preflight.

## Compatibility Migration

The migration is incremental:

1. Centralize the capability/ownership catalog.
2. Route tree creation through typed canonical commands.
3. Route relationship creation and target selection through canonical policy.
4. Route feature creation and editing through canonical commands.
5. Route diagram toolbars through create-and-present transactions.
6. Convert legacy arrays into read-only projections.
7. Remove remaining direct semantic mutations from `App.tsx` as each family migrates.

Existing project files are loaded through migration adapters that preserve semantic IDs and convert legacy diagram membership to presentation records. Unsupported legacy data receives explicit loss or extension diagnostics.

## Verification and Release Gates

Automated evidence must cover:

- every capability advertised by the tree can pass backend preflight in a valid fixture;
- illegal ownership appears disabled and execution rejects it;
- tree creation persists after save/load without requiring a diagram;
- diagram creation commits exactly one semantic element and one presentation;
- Add to Diagram creates no semantic duplicate;
- Remove from Diagram preserves semantics and relationships;
- Block created on a Requirements Diagram can be shown on a BDD with the same ID;
- UseCase and TestCase presentations behave the same way;
- properties and ports retain ownership and identity across tree, BDD, IBD, and specification views;
- relationship target filtering matches backend endpoint validation;
- rename propagates to all presentations;
- no-silent-type-creation applies to UI, import, migration, script, and AI commands;
- the mandatory Motor/leftMotor/REQ-001 semantic identity scenario remains a release gate;
- compliance status is awarded only with specification, implementation, validator, persistence, projection, and automated-test evidence.

## Out of Scope

- Pixel-for-pixel cloning of Cameo.
- Full allocation matrix UI, while Allocate remains supported in the repository architecture.
- Complete UML/SysML metamodel coverage beyond the declared capability catalog.
- Replacing every legacy editor in one release.

## Success Criteria

The feature is complete when users can create every supported legal element, relationship, property, and port from the Model Tree; show the same semantic items on compatible diagrams; edit them from any view; save and reload them without identity loss; and receive matching frontend/backend diagnostics for every illegal action.
