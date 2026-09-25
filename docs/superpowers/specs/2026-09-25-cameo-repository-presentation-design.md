# Cameo-Style Repository and Diagram Presentation Design

**Date:** 2026-09-25  
**Status:** Approved  
**Scope:** SysML model creation, cross-diagram presentation, and Model Explorer commands

## Objective

Make ADIA behave like Cameo: semantic model elements live once in a canonical repository, while diagrams contain presentations that reference those elements. Every visible Model Explorer action must execute a backend command or return an explicit diagnostic; no action may silently do nothing.

## Authority and terminology

- The separation between model elements and diagram symbols is `CAMEO_TOOLING` behavior.
- Blocks, Requirements, TestCases, relationships, ownership, and applicable constraints retain their declared `OMG_SYSML_1_6` or `UML_FOUNDATION` authority.
- ADIA command handling, transaction boundaries, diagnostics, and approval flows are `ADIA_EXTENSION` behavior.
- A diagram presentation is not a second semantic element and does not change the element's SysML identity or ownership.

## Alternatives considered

### 1. Canonical command-only architecture — selected

All semantic mutations pass through one repository command gateway. Diagram state stores presentation references and geometry only. Legacy editor arrays are read-only projections until removed.

This provides stable identity, atomic updates, reliable undo/redo, and enforceable semantic validation.

### 2. Continue bidirectional legacy synchronization — rejected

Canvas arrays and the repository would both remain writable and would be reconciled after edits. This preserves current code paths but permits duplicate identities, delayed consistency, and lost updates.

### 3. Patch individual toolbar and context-menu handlers — rejected

Fixing each visible failure independently would leave multiple mutation paths and make future features reproduce the same defects.

## Semantic and presentation model

The repository is the only authority for:

- semantic identity and metaclass;
- name and normative properties;
- owner and containment hierarchy;
- typed usages and properties;
- semantic relationships;
- validation and deletion impact.

A diagram presentation contains:

- a stable presentation ID;
- the referenced semantic element or relationship ID;
- diagram ID;
- position, size, routing, and symbol appearance;
- optional diagram-specific display settings.

Multiple presentations may reference one semantic ID. A presentation must never contain an independent copy of the semantic name, stereotype, type, owner, or relationship endpoints.

## Creation behavior

Creating an element from a diagram palette is one atomic `CreateAndPresent` transaction:

1. Resolve the legal semantic owner from the diagram context or an explicit owner selection.
2. Validate that the requested metaclass is legal for that owner.
3. Create one semantic element in the repository.
4. Create one presentation on the active diagram referencing the new semantic ID.
5. Commit both operations together, or commit neither.

Creating an element from the Model Explorer creates only the semantic element beneath the selected legal owner. The user can subsequently add it to compatible diagrams.

Creating a Block on a Requirements Diagram therefore creates one canonical Block plus one Requirements Diagram presentation. Adding that Block to a BDD creates another presentation of the same Block; it does not create another Block.

No semantic type is created implicitly. Commands that require a missing type return `TYPE_NOT_FOUND`, candidate existing types, and an explicit `CreateNewType` action. This applies to UI, imports, adapters, scripts, migrations, and AI agents.

## Model Explorer command behavior

Every context-menu item uses the same command bus and returns a structured result containing commit status, revision, diagnostics, selection, and impact when applicable.

- **Create owned element:** create one canonical element under the selected legal owner.
- **Add to active diagram:** create presentation records referencing existing semantic IDs.
- **Remove from diagram:** delete only selected presentation records.
- **Rename:** update the semantic element once; all presentations resolve the new name.
- **Move:** change semantic ownership after ownership and cycle validation.
- **Copy:** place a complete semantic ownership forest in the clipboard and report success; it does not mutate the repository.
- **Paste:** create remapped semantic copies under a legal target owner in one transaction.
- **Duplicate:** perform copy and paste as one backend transaction with new semantic IDs.
- **Delete from model:** show impact when material, then delete semantic elements, owned descendants, affected relationships, and all corresponding presentations in one transaction.

An action that cannot run must be disabled with a reason or return a visible diagnostic. Empty impact metadata must not prevent command execution. No rendered menu command may silently return without feedback.

## Deletion and hierarchy rules

`Remove from Diagram` and `Delete from Model` are separate commands.

- Removing a presentation preserves the semantic element, ownership, relationships, and presentations on other diagrams.
- Deleting from the model calculates descendants, incoming and outgoing relationships, typed references, and presentations before commit.
- Destructive model deletion requires confirmation when the calculated impact is material.
- Ownership changes and deletion are validated at the repository layer independently of the UI.
- A diagram cannot own semantic elements merely because they are displayed there; the diagram context determines or requests a valid semantic owner.

## State flow

The frontend sends an intent to the command gateway. The gateway validates against the current canonical revision, executes an atomic transaction, and returns the new repository and presentation store. React state then projects canvas data from that result. Canvas arrays cannot be merged back as an independent semantic authority.

All callers—including toolbars, canvas gestures, keyboard shortcuts, Model Explorer actions, imports, and AI workflows—must use this path.

## Diagnostics and user feedback

Commands return stable diagnostic codes such as:

- `TYPE_NOT_FOUND`
- `OWNER_NOT_FOUND`
- `ILLEGAL_OWNERSHIP`
- `SELF_OWNERSHIP_CYCLE`
- `PRESENTATION_ALREADY_EXISTS`
- `NO_COMPATIBLE_DIAGRAM_PRESENTATION`
- `UNSUPPORTED_COMMAND`

The frontend displays success or failure feedback and keeps selection consistent with committed IDs. A rejected command must not partially mutate legacy or canonical state.

## Verification and release gates

### Mandatory semantic identity scenario

1. Create Block `Motor` on BDD-A.
2. Add the same `Motor` to BDD-B.
3. Create `leftMotor : Motor` inside Block `Vehicle` and display it on the Vehicle IBD.
4. Create Requirement `REQ-001`.
5. Create `Motor «satisfy» REQ-001` and display it on a Requirement Diagram.
6. Rename `Motor` to `BLDCMotor`.

Expected semantic counts remain one Motor/BLDCMotor definition, one `leftMotor` PartProperty, one Requirement, and one Satisfy relationship. Every presentation resolves `BLDCMotor` without rewriting or duplicating semantic elements.

### Additional release gates

- Create a Block on a Requirements Diagram, then add it to a BDD; assert one semantic Block and two presentations.
- Remove the Requirements presentation; assert the Block and BDD presentation remain.
- Delete the Block from the Model Explorer; assert all its presentations and affected relationships are removed after impact confirmation.
- Exercise every visible Model Explorer command and assert either a committed backend transaction or an explicit diagnostic.
- Verify copy feedback, paste ownership remapping, duplicate IDs, move validation, and delete execution with empty and material impact.
- Verify repository-level behavior separately from React and end-to-end UI tests.

## Migration boundary

During migration, compatibility projections may feed existing renderers, but they are never writable semantic sources. The legacy array-to-repository merge effect must be removed after each remaining editor mutation is routed through commands. The migration is complete only when repository and presentation stores can reconstruct every supported diagram without reading semantic data owned solely by canvas state.
