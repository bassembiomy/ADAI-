# Cameo-Style SysML Hierarchy, Deletion, and Requirements Presentation Design

Date: 2026-09-25
Status: Approved design
Scope: SysML repository, model explorer, BDD, IBD, and Requirements Diagram behavior

## Goal

Make hierarchy, deletion, and cross-diagram display behavior repository-first and consistent across every SysML viewpoint. A semantic element exists once in the repository and may have multiple diagram presentations. In particular, a Block created in the model repository must be displayable on a Requirements Diagram and connect legally to a Requirement without creating or rewriting the Block.

The interaction model follows Cameo-style tooling behavior while the semantic legality of elements and relationships remains governed by UML/SysML v1.6 rules.

## Authority and terminology

- Semantic elements, ownership, relationship endpoint legality, and SysML stereotypes use `OMG_SYSML_1_6` or `UML_FOUNDATION` authority as declared by the capability catalog.
- Diagram display, remove-from-diagram behavior, model-browser workflows, and impact-confirmation interaction use `CAMEO_TOOLING` authority.
- ADIA persistence, command dispatch, diagnostics, and approval mechanics use `ADIA_EXTENSION` authority.
- A diagram node is a presentation of a semantic element. It is not a separate semantic copy.
- `Remove from Diagram` deletes a presentation only.
- `Delete from Model` deletes a semantic element and applies the repository deletion policy.

## Current defect and root cause

ADIA currently has two presentation-state paths:

1. `sysmlStore.diagramPresentations`, updated by the repository command gateway.
2. A separate React `diagramPresentations` state, read by Requirements Diagram scope and other legacy paths.

Dragging an existing model-tree Block to the Requirements Diagram updates the first path while the diagram reads the second. The dropped Block therefore does not reliably appear. In addition, the `addToDiagram` command returns a diagram-filtered legacy view and the application replaces global projected arrays with that filtered view. This can hide unrelated repository elements and later feed an incomplete projection back into migration compatibility code.

The fix must remove this split-brain behavior rather than mirror updates between two mutable stores.

## Architecture

### Canonical semantic repository

The repository is the sole authority for:

- semantic elements;
- semantic ownership;
- semantic relationships;
- diagrams;
- diagram presentations;
- indexes by owner, type, endpoint, and diagram.

React state may cache projections, selection, viewport, and transient interaction state, but it must not independently decide semantic existence or presentation membership.

### Presentation projection

Every SysML diagram obtains its visible element IDs from the canonical presentation query for its diagram identity. Requirements automatically visible by the diagram's defined scope may be combined with explicit presentations, but explicit display of a Block must be persisted as a presentation.

`DisplayExistingElement` is the normative command for displaying a repository element. It must:

1. verify that the diagram exists;
2. verify that the semantic element exists;
3. verify metaclass compatibility with the diagram kind;
4. reject duplicate presentation of the same element on the same diagram;
5. create only a presentation and presentation index entry;
6. preserve the semantic element ID and owner;
7. return a complete repository projection separately from any diagram-scoped projection.

The legacy `addToDiagram` application command becomes a compatibility adapter over this behavior. It must not maintain an independent presentation list.

### Diagram compatibility

The shared diagram-element policy must allow the following on Requirements Diagrams:

- Requirement;
- Block and applicable Block specializations;
- TestCase;
- other UML/SysML classifiers already declared legal by the central catalog.

The same policy must be used by drag/drop preflight, context-menu display actions, command validation, import, and automated agents.

## Cameo-style hierarchy behavior

The Model Explorer shows semantic containment, not diagram containment.

- Creating an element under a tree owner executes `CreateElement` with that semantic owner.
- Moving an element in the tree executes `MoveElement` and validates the central ownership matrix.
- A diagram presentation never changes the semantic owner.
- Displaying a Block on a Requirements Diagram does not move it under a Requirement or diagram.
- A PartProperty remains owned by its Block and typed by a Block definition.
- Requirements may own nested Requirements where permitted by the shared ownership policy.
- Invalid ownership returns `ILLEGAL_OWNERSHIP` and leaves the repository unchanged.
- Circular ownership is rejected.
- Tree projections are rebuilt from canonical ownership indexes after successful commands.

These rules apply uniformly to all supported SysML semantic types. Unsupported element types remain disabled with an explicit diagnostic rather than appearing to succeed.

## Cameo-style deletion behavior

### Remove from Diagram

Invoked from a diagram node or the Delete key while the diagram presentation has focus:

- removes only the selected presentation;
- preserves the semantic element;
- preserves its presentations on other diagrams;
- preserves semantic relationships;
- updates the diagram presentation index atomically;
- is undoable as a presentation action.

### Delete from Model

Invoked explicitly from the Model Explorer or specification UI:

1. analyze impact without mutation;
2. show owned descendants, presentations, touching relationships, evidence/baseline impacts, and unresolved usages;
3. require confirmation when impact severity requires review;
4. execute one atomic semantic deletion after confirmation;
5. remove every presentation of deleted semantic elements;
6. remove relationships whose source or target was deleted;
7. rebuild all affected indexes;
8. support undo/redo of the complete transaction.

### Cascade rules

- Composite-owned semantic children cascade with their owner.
- Owned ports and owned feature elements cascade with their owner.
- Shared/reference usages do not silently cascade when their type is deleted. They are reported as unresolved impacts and require an explicit resolution or block the deletion according to policy.
- Deleting a relationship never deletes either endpoint.
- Deleting one presentation never deletes another presentation or semantic element.
- Deleting a diagram deletes its presentations but not the presented semantic elements.
- Baseline-protected semantic changes require the existing explicit authorization workflow.

The canonical deletion-impact policy is the single source for the gateway, tree UI, diagram UI, scripts, imports, and AI agents.

## Requirements Diagram workflow

The required user flow is:

1. Create Block `Motor` in the repository or on a BDD.
2. Open a Requirements Diagram containing `REQ-001`.
3. Drag `Motor` from Model Explorer or choose `Display on Active Diagram`.
4. Preflight confirms `Block` is legal on a Requirements Diagram.
5. Dispatch `DisplayExistingElement` with the existing `Motor` ID and drop bounds.
6. Refresh the Requirements Diagram projection from canonical presentation state.
7. Create `Motor «satisfy» REQ-001` through the shared relationship policy.
8. Persist one Block, one Requirement, one Satisfy relationship, and separate diagram presentations.

Renaming `Motor` to `BLDCMotor` updates the semantic element once. Every presentation resolves and displays the new name.

## Error handling

Commands fail atomically and return stable diagnostics:

- `ELEMENT_NOT_FOUND`: requested semantic element does not exist;
- `DIAGRAM_NOT_FOUND`: target diagram does not exist;
- `INVALID_DIAGRAM_ELEMENT`: element type is illegal on the target diagram;
- `ALREADY_PRESENTED`: the element is already shown on that diagram;
- `ILLEGAL_OWNERSHIP`: create or move violates semantic containment;
- `CIRCULAR_OWNERSHIP`: move would place an owner under its descendant;
- `DELETE_IMPACT_CONFIRMATION_REQUIRED`: model deletion requires reviewed impact;
- `BASELINE_AUTHORIZATION_REQUIRED`: deletion affects protected evidence/baselines.

No command may silently create a missing semantic type, semantic element, diagram, relationship endpoint, or replacement copy.

## Testing and release gates

### Hierarchy tests

- every enabled parent/child capability commits successfully;
- every disabled combination returns `ILLEGAL_OWNERSHIP` without mutation;
- moving preserves identity and rejects cycles;
- tree projection matches repository ownership indexes.

### Deletion tests

- removing a presentation preserves the semantic element and other presentations;
- deleting a semantic element removes all presentations and touching relationships;
- deleting a relationship preserves endpoints;
- composite descendants cascade;
- shared/reference usages remain unresolved rather than silently deleted;
- indexes, persistence, undo, and redo remain consistent.

### Requirements presentation integration test

Create one Block `Motor` and one Requirement `REQ-001`. Present `Motor` on both BDD-A and Requirements-A, create `Motor «satisfy» REQ-001`, then rename it to `BLDCMotor`.

Expected state:

- Block definitions: 1;
- Requirements: 1;
- Satisfy relationships: 1;
- presentations: one per target diagram;
- semantic Block ID unchanged;
- both presentations render `BLDCMotor`;
- BDD and Requirements projections do not delete or hide unrelated repository elements.

### UI integration test

From the Model Explorer, drag an existing Block onto an active Requirements Diagram. Confirm the Block appears, can be connected to a Requirement with `«satisfy»`, survives diagram switching and persistence round-trip, and can be removed from the diagram without being deleted from the model.

## Completion criteria

The work is complete only when:

- all SysML diagram paths use canonical presentation membership;
- no diagram-scoped projection overwrites the global semantic projection;
- hierarchy and deletion commands share one repository policy across all entry points;
- the Block-to-Requirements workflow passes semantic, persistence, projection, and browser tests;
- existing SysML release, identity, architecture, and TypeScript gates pass.
