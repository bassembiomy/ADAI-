# Model Tree Scrolling and Diagram Grouping Design

## Goal

Fix the Model Explorer so users can scroll through the full tree and so elements created from a diagram's context menu appear beneath that diagram in the tree. Apply the grouping behavior consistently to BDD, state-machine, requirements, and parametric diagrams.

## Current Problems

1. The virtualized tree receives a height that can exceed its actual flex-panel viewport, so its internal overflow region may extend below the visible panel and prevent practical vertical scrolling.
2. Diagram nodes and the elements presented on them are projected as siblings based only on semantic ownership. Creating an element from a diagram therefore does not give the tree a visible diagram-to-element parent/child relationship.
3. Creation is initiated from a diagram node, but the command resolves that node directly as an element owner. A diagram is a presentation rather than a valid semantic owner, so the implementation must separate creation context from semantic ownership.

## Design

### Tree viewport and scrolling

The Model Explorer will measure the actual tree viewport (the flex child below the toolbar), not estimate it by subtracting a fixed toolbar height from the outer container. The virtual tree will fill that measured viewport and retain its own `overflow-y: auto` behavior. Resize observation will update the viewport height when the side panel, toolbar, or application window changes size.

Mouse wheel, scrollbar dragging, and keyboard focus movement must all move through the complete projected row set. Virtualization remains enabled.

### Diagram-aware creation

A diagram context-menu action carries two distinct pieces of context:

- **Semantic owner:** the existing model element, package, block, region, or root that legally owns the new element.
- **Presentation target:** the diagram on which the new element should be shown.

Creating from a diagram resolves the semantic owner from the diagram metadata and sends the existing semantic creation command to that owner. After successful creation, the new semantic element is added to the initiating diagram's presentation through the existing presentation command/state path. Diagrams never become semantic owners.

Creation from non-diagram tree nodes keeps its current behavior.

### Tree projection

Containment projection remains the authoritative semantic tree except for elements presented by an explicit diagram node. A presented element is visually parented beneath that diagram in the unified Model Explorer projection. Its `ownerSemanticId` continues to identify the real semantic owner so move, duplicate, delete, rename, relationship, and specification commands operate on the correct model object.

An element is shown once in the primary tree projection. If it belongs to an explicit diagram presentation, the diagram branch is its visual location; otherwise it remains beneath its semantic owner or pillar. This avoids duplicate and ambiguous tree rows.

Diagram grouping applies to:

- BDD diagrams and their presented structural elements.
- State-machine diagrams and their presented states, regions, and junctions.
- Requirements diagrams and their presented requirements and supported traceability elements.
- Parametric diagrams and their presented constraint/property elements.

Elements created elsewhere and later added to a diagram follow the same visual grouping rule.

### Expansion and selection

After a successful create-from-diagram action, the diagram node is expanded and the new element is selected. Existing expanded-node persistence remains in use. Diagram activation continues to open the diagram; element activation continues to open or select the semantic element.

### Failure handling

If semantic creation fails, no presentation is added. If semantic creation succeeds but presentation fails, the element remains valid under its semantic owner and the existing diagnostic channel reports the presentation failure. Tree projection must tolerate stale presentation IDs by ignoring references to missing semantic elements.

## Testing

Automated regression tests will cover:

1. The virtual tree uses the available viewport and exposes a scrollable range when rows exceed it.
2. BDD create-from-diagram produces a semantically owned block presented beneath the BDD node.
3. State-machine create-from-diagram preserves region/root ownership and groups the created state beneath the diagram.
4. Requirements and parametric create-from-diagram use their legal semantic owners and group created elements beneath their diagrams.
5. Existing non-diagram creation remains semantically projected as before.
6. Stale diagram presentation references do not break projection.
7. Undo/redo and persistence restore both semantic creation and diagram grouping.

Relevant focused unit tests will run first, followed by the Model Explorer and related SysML/state-machine test suites. Browser-level verification will confirm wheel scrolling and the four diagram workflows in the rendered application.

## Scope

This change is limited to Model Explorer scrolling, diagram-context creation, presentation membership, and unified tree projection. It does not redefine SysML ownership, introduce duplicate tree aliases, or change diagram canvas rendering rules beyond using the existing presentation model.
