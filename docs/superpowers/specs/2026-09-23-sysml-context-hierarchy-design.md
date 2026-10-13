# ADIA SysML Context Hierarchy and Shared Views Design

## Goal

Make ADIA’s hierarchy navigation follow the active SysML diagram while preserving one canonical model. Parts created in a BDD must appear as typed properties of the owning Block and as the same part in its IBD. Requirements and traceability links must remain shared across diagram views.

## Approved approach

Use two navigation views:

1. **All Model** — the authoritative containment hierarchy containing packages, Blocks, Part Usages, State Machines, Activities, Requirements, and relationships.
2. **Diagram Context** — a filtered view that follows the active diagram and highlights its context element.

The context view filters visibility only. It never moves, copies, creates, deletes, or retypes semantic model elements.

## Context rules

| Active diagram | Context view shows |
|---|---|
| BDD | Block Definitions, declared Part Properties, ports, value properties, and BDD relationships |
| IBD | Context Block, owned Part Usages, Port Usages, Connectors, and relevant item flows |
| State Machine | State Machine, Regions, States, Pseudostates, Transitions, and behavior owner |
| Activity | Activity, Actions, Control Nodes, Object Nodes, and Flows |
| Requirements | Requirements, containment, derivation, satisfy, verify, refine, and trace links |
| RTM | Requirements, governed elements, links, evidence, baselines, and suspect status |

## Shared semantic model

The canonical repository is the only source of truth. A Part Property is represented as a typed `PartUsage` with an `ownerId` pointing to the parent Block and a `typeId` pointing to a `BlockDefinition`. The BDD property compartment and IBD part node are presentations of that same ID.

Creating or editing a part must therefore:

- require a valid Block type;
- assign the parent Block as owner;
- update all presentations by stable element ID;
- surface a validation error when the type is missing or is not a Block.

Requirements follow the same identity rule. Requirement and traceability presentations reference canonical requirement and relationship IDs rather than creating copies.

## UI behavior

- The active diagram mode updates the Diagram Context view.
- Selecting a model element in either tree selects the corresponding presentation wherever it is visible.
- A “Show in All Model” action reveals the canonical containment location.
- A “Show context” action returns to the active diagram’s filtered scope.
- When no diagram is active, Diagram Context falls back to the selected model element’s relevant scope.

## Validation and acceptance criteria

- An untyped part cannot be created or saved.
- A Part created in a BDD appears in the owning Block property compartment and its IBD using the same stable ID.
- Renaming or retyping the Part updates both views.
- Opening BDD, IBD, State Machine, Activity, Requirements, and RTM diagrams updates only Diagram Context, not All Model.
- Requirements and traceability links remain navigable from every relevant view.
- Existing persistence, deletion, undo/redo, and validation rules remain intact.

## Scope exclusions

- No changes to SysML semantics or profile version.
- No automatic duplication of elements between diagrams.
- No destructive migration of existing model elements without validation and impact reporting.
