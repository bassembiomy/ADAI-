# Simulink-Style Right-Drag Copy Design

## Goal

Make right-click drag copy consistent across ADIA canvases. The gesture creates a new, independent repository element at the drop location; it is never a UI-only duplicate or a second presentation of the original semantic element.

## Interaction Contract

- A simple right-click continues to open the existing context menu.
- Right-clicking an already selected canvas item and moving farther than the drag threshold begins copy drag.
- The canvas shows the copy cursor during the drag and suppresses the context menu when the drag completes.
- Releasing creates the clone at the transformed canvas coordinates, selects it, and records one undoable command.
- Right-click dragging a multi-selection clones all selected compatible items as one transaction.
- Connections are recreated only when both endpoint items belong to the copied selection. Connections to items outside the selection are not copied.

## Semantic Architecture

Each canvas delegates to a shared copy-drag controller that distinguishes a context click from a drag based on pointer button, selection, and movement threshold. The controller builds a typed clone request; it does not create model data itself.

The relevant domain command receives the request, validates that the source elements and target diagram/context are legal, creates fresh IDs, assigns collision-free names, copies permitted semantic properties, creates requested internal relationships, and creates the new diagram presentations. The repository command result remains the only source used for canvas projection, tree projection, persistence, undo/redo, interchange, and code generation.

SysML copies preserve metaclass and valid feature data but receive new semantic identity. Diagram ownership/context checks remain in force. A copy cannot silently move an element to another owner or make a second presentation when an independent semantic copy was requested.

## Module Scope

The controller is applied to State Machine, SysML BDD, SysML IBD, Requirements, Package Diagram, X-Bridges, and V-Lab canvases. Existing X-Bridges and V-Lab right-drag behavior is routed through the same contract rather than retained as an independent UI path.

For SysML elements, clone support covers Blocks, Packages, Part Properties, Ports, Requirements, TestCases, States, and diagram-legal relationships. Unsupported types produce an explicit diagnostic and leave the source unchanged.

## Error Handling

- No selected source, invalid target context, or unsupported clone type: no mutation; show a precise diagnostic.
- Name collision: backend assigns the normal unique copy name (for example `Motor_1`).
- Validation failure: the full clone transaction is rejected atomically.
- Deleting either original or copy remains independent and uses the existing deletion-impact process.

## Verification

Automated semantic tests prove copied elements have different IDs, correct ownership, copied legal properties, independent edits, persistence, and undo/redo. Diagram tests prove one click opens the context menu, a right-drag suppresses it, clone placement respects zoom/pan, and multi-copy recreates only internal connections.
