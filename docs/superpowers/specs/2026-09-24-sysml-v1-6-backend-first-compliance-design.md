# ADIA SysML v1.6 Backend-First Compliance Design

## Purpose

ADIA will provide Cameo-style modeling workflows for BDD, IBD, ports and flows, properties, requirements, traceability, and the model browser while using OMG SysML v1.6 and its UML foundation as the semantic authority. A feature is not complete when it is merely visible on a diagram. Every editable model concept must have a typed semantic representation, repository lifecycle, command, validation rules, persistence mapping, projection, and automated semantic tests.

The normative baseline is OMG SysML v1.6, formal/19-11-01, including the normative SysML XMI. Cameo/MagicDraw is a tooling and interaction reference only. ADIA-specific behavior must be labeled as an extension.

## Approved migration strategy

Use an incremental repository-first migration. The canonical repository becomes the only writable semantic source. Existing `BlockData`, `PartData`, `ConnectorData`, and `RelationshipData` arrays remain temporarily as read-only projections so existing screens and saved projects continue to work. No UI component or AI adapter may directly mutate those projections. Legacy merge adapters are removed after parity and migration gates pass.

## Non-negotiable architecture

```text
UI / AI / import request
        |
        v
Application command API
        |
        v
Transaction + authorization + undo/redo
        |
        v
Domain services and relationship rules
        |
        v
Validation engine
        |
        v
Canonical semantic repository
        |
        +--> persistence / migration / interchange
        |
        +--> read-only diagram and browser projections
                       |
                       v
                 React rendering
```

The canvas stores no authoritative SysML semantics. Coordinates, size, routing, collapsed compartments, and styling belong to presentation records. Names, types, ownership, multiplicity, port kind, flow direction, connector ends, conveyed classifiers, requirement text, and relationship kinds belong to semantic records.

## Layer responsibilities

### Domain model

The domain layer defines stable IDs, metaclasses, ownership, namespaces, types, features, relationships, diagrams, and presentations. It introduces explicit semantic types for Block, InterfaceBlock, ConstraintBlock, AssociationBlock, ValueType, DataType, Enumeration, Signal, Unit, QuantityKind, Property subtypes, Port subtypes, Operation, Parameter, Reception, Constraint, Requirement specializations, TestCase, Comment, and Rationale. The existing ADIA `VerificationCase` is either migrated to `TestCase` or retained only as an explicitly labeled `ADIA_EXTENSION` specialization; it is never reported as a normative SysML metaclass.

Operations, constraints, units, flow items, and compartment entries may not be stored as display strings. Human-readable notation is generated from typed entities.

### Repository

The repository owns normalized collections and indexes by ID, owner, namespace, type, diagram, and relationship endpoint. It exposes query operations but no UI concepts. A semantic element can appear in zero, one, or many diagrams through independent `DiagramPresentation` records.

### Services

Focused services implement ownership, namespaces, type resolution, inheritance, property-specific types, relationship legality, connector-path resolution, port compatibility, effective conjugated flow direction, traceability, allocation queries, notation, and deletion impact. Services return typed results and diagnostics; they do not update React state.

### Commands and transactions

Every mutation is a command. Commands validate intent, operate atomically, increment repository revision, record audit metadata, and produce undo/redo patches. Separate commands handle `CreateElement`, `CreateNewType`, `DisplayExistingElement`, `RemovePresentation`, and `DeleteModelElement`. If a referenced semantic type does not exist, every entry point returns `TYPE_NOT_FOUND` with candidate existing elements and an explicit `CreateNewType` action. UI commands, importers, migrations, scripts, and AI agents all use the same policy and none has a privileged creation path.

### Validation

Validation runs at command time and as a repository-wide audit. It covers identity, ownership, namespaces, type existence, multiplicity, inheritance cycles, relationship endpoint matrices, connector context/path legality, port compatibility after conjugation, conveyed item legality, requirement direction, dangling references, and presentation references. Diagnostics have stable codes, severity, element IDs, and remediation text.

### Persistence and migration

Persistence serializes semantic entities and presentation entities separately in one versioned project envelope. Load performs schema validation, deterministic migration, quarantine of unresolved references, and full validation. Legacy BDD/IBD/requirements arrays are imported once into canonical entities; future saves use the canonical schema while optional compatibility exports remain adapters.

### Projection and UI

BDD, IBD, Requirements, RTM, Model Browser, reports, and future diagrams are selectors over repository snapshots. React components receive immutable view models and dispatch commands. Editing a compartment edits its referenced semantic feature. Dragging an existing browser element creates a presentation only. Diagram deletion and model deletion are visibly separate operations.

## Structural semantics

### Definitions and usages

A Block is a reusable definition. A PartProperty, ReferenceProperty, ValueProperty, ConstraintProperty, FlowProperty, and Port is a typed feature owned by a classifier. An IBD displays usages in a Block context. Creating `leftMotor : Motor` creates one property referencing an existing `Motor`; it does not clone the type. Creating a new type and creating a usage is a distinct, explicit compound command.

### Ports and interfaces

The port hierarchy contains a standard UML Port plus SysML ProxyPort, FullPort, and legacy FlowPort representations. Creating a generic Port creates a standard UML Port and applies no SysML port stereotype automatically. ProxyPort and FullPort remain mutually exclusive specializations. A ProxyPort must be typed by an InterfaceBlock, must satisfy nested ProxyPort constraints, and must preserve proxy semantics rather than represent a separate system element. These constraints are repository-level validation rules with semantic tests independent of diagram rendering. InterfaceBlock owns FlowProperties. Conjugation is represented semantically and effective direction is calculated recursively for nested ports. Provided/required interfaces are semantic references, not lollipop/socket decorations.

### Connectors and flows

Connector is owned by an internal structure context and owns two typed ConnectorEnds. Each end references a connectable element and an optional nested property path. ItemFlow is an independent semantic relationship that references its realizing connector/association and conveyed classifier IDs. BindingConnector remains distinct from ordinary connectors and information flows.

### Requirements

Requirement has an internal UUID and a separate human-facing requirement ID. Containment, deriveReqt, satisfy, verify, refine, trace, and copy are distinct relationships with explicit endpoint and direction rules. Requirement definitions and relationships can have multiple presentations. SysML `TestCase`, rationale, evidence, baselines, suspect links, and traceability queries remain repository-backed. Any ADIA-specific verification workflow is labeled `ADIA_EXTENSION` and mapped to the normative TestCase concept where applicable.

### Allocation foundation

The shared relationship architecture includes SysML `Allocate` now, with typed source/target endpoint rules and repository indexes. It reserves explicit extension points for `AllocateActivityPartition`, allocation queries, allocation matrices, and derived `allocatedFrom`/`allocatedTo` presentation. Full allocation UI is outside this program, but enabling it later must not require a repository or relationship-model redesign.

## Provenance and compliance evidence

Every modeled feature and compliance definition declares one semantic authority: `OMG_SYSML_1_6`, `UML_FOUNDATION`, `CAMEO_TOOLING`, or `ADIA_EXTENSION`. Provenance is stored in the conformance catalog and emitted in compliance reports. Tooling behavior is not attributed to OMG unless supported independently by the normative specification.

Compliance is evaluated at four levels: Level 1 Element, Level 2 Properties, Level 3 Relationships, and Level 4 Constraints. Overall `COMPLIANT` requires all applicable levels to pass and requires automated semantic evidence. A feature with a valid entity but a failed constraint is `PARTIAL` or `NON_COMPLIANT`, never `COMPLIANT`.

Each compliance record contains: specification source, specification section, ADIA source file, domain type/class, command, validator, persistence mapping, projection, automated test, the four level results, and overall status. Missing automated semantic evidence prohibits `COMPLIANT` status.

## Cameo-style workflows

The Model Browser shows semantic ownership, supports reuse by drag/drop, and distinguishes definitions from usages. Property dialogs choose an existing type by default and offer explicit creation of a new type. Diagram frames show kind and context. Rename propagates to every presentation because labels are generated from repository state. Delete presents separate “Remove from Diagram” and “Delete from Model” operations with impact analysis. Relationship creation is constrained by valid endpoint matrices and provides actionable diagnostics.

## Compatibility and rollout

Each migration slice follows: domain types, repository/indexes, services, commands, validation, persistence migration, projection adapters, UI conversion, semantic tests, and legacy parity tests. A feature flag controls repository-only UI writes until all target flows pass. Existing project files are preserved through deterministic migration and round-trip fixtures. State Machine, XBridges, simulation, HIL/SIL, reporting, and AI integrations consume repository queries/commands through adapters and are not rewritten unless required to remove direct legacy SysML mutations.

## Definition of done

A capability is complete only when:

1. It has a typed semantic backend representation and stable ID.
2. Ownership, typing, and lifecycle are repository-managed.
3. All mutations use commands and transactions.
4. Invalid states are rejected or diagnosed by stable validation rules.
5. Persistence round-trips without semantic loss.
6. Diagram and browser rendering are read-only projections.
7. Semantic tests prove reuse, deletion, rename propagation, and invalid-case behavior.
8. Legacy files migrate deterministically.
9. The compliance matrix links the capability to code and tests.
10. No UI-only state is required to reconstruct its semantics.
11. Its conformance record declares authority, specification section, implementation evidence, and all four compliance levels.
12. `COMPLIANT` is impossible without passing automated semantic evidence.

## Mandatory repository identity release gate

The release suite creates one `Motor` Block, displays it on BDD-A and BDD-B, creates one `leftMotor : Motor` PartProperty inside `Vehicle`, displays it on the Vehicle IBD, creates one `REQ-001`, creates one `Motor «satisfy» REQ-001`, and displays the relationship on a Requirement Diagram. The repository must contain exactly one Motor definition, one leftMotor PartProperty, one requirement, and one satisfy relationship while allowing multiple presentations. Renaming `Motor` to `BLDCMotor` must update every projection by reference without duplicating or rewriting semantic entities. This integration test is a blocking repository-first release gate.

## Out of scope for this implementation program

Complete Activity, Sequence, Parametric, Package, and Use Case diagram implementations are not part of this program. The semantic core must provide extension points for them without creating a second repository. Existing Use Case work is preserved but is not expanded unless needed for shared repository compatibility.
