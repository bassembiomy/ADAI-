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

The domain layer defines stable IDs, metaclasses, ownership, namespaces, types, features, relationships, diagrams, and presentations. It introduces explicit semantic types for Block, InterfaceBlock, ConstraintBlock, AssociationBlock, ValueType, DataType, Enumeration, Signal, Unit, QuantityKind, Property subtypes, Port subtypes, Operation, Parameter, Reception, Constraint, Requirement specializations, VerificationCase, Comment, and Rationale.

Operations, constraints, units, flow items, and compartment entries may not be stored as display strings. Human-readable notation is generated from typed entities.

### Repository

The repository owns normalized collections and indexes by ID, owner, namespace, type, diagram, and relationship endpoint. It exposes query operations but no UI concepts. A semantic element can appear in zero, one, or many diagrams through independent `DiagramPresentation` records.

### Services

Focused services implement ownership, namespaces, type resolution, inheritance, property-specific types, relationship legality, connector-path resolution, port compatibility, effective conjugated flow direction, traceability, notation, and deletion impact. Services return typed results and diagnostics; they do not update React state.

### Commands and transactions

Every mutation is a command. Commands validate intent, operate atomically, increment repository revision, record audit metadata, and produce undo/redo patches. Separate commands handle `CreateElement`, `DisplayExistingElement`, `RemovePresentation`, and `DeleteModelElement`. Unknown types are rejected or returned as an explicit decision; they are never silently created.

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

ProxyPort, FullPort, and legacy FlowPort remain distinct. ProxyPort and FullPort reference existing types; InterfaceBlock owns FlowProperties. Conjugation is represented semantically and effective direction is calculated recursively for nested ports. Provided/required interfaces are semantic references, not lollipop/socket decorations.

### Connectors and flows

Connector is owned by an internal structure context and owns two typed ConnectorEnds. Each end references a connectable element and an optional nested property path. ItemFlow is an independent semantic relationship that references its realizing connector/association and conveyed classifier IDs. BindingConnector remains distinct from ordinary connectors and information flows.

### Requirements

Requirement has an internal UUID and a separate human-facing requirement ID. Containment, deriveReqt, satisfy, verify, refine, trace, and copy are distinct relationships with explicit endpoint and direction rules. Requirement definitions and relationships can have multiple presentations. Test cases, rationale, evidence, baselines, suspect links, and traceability queries remain repository-backed.

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

## Out of scope for this implementation program

Complete Activity, Sequence, Parametric, Package, and Use Case diagram implementations are not part of this program. The semantic core must provide extension points for them without creating a second repository. Existing Use Case work is preserved but is not expanded unless needed for shared repository compatibility.

