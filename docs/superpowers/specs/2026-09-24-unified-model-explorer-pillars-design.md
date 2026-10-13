# Unified Model Explorer Pillars and Diagram Context Design

## Goal

Replace the domain-switched Hierarchy tree with one professional, Cameo/Papyrus-style project browser. The browser must always begin with stable Structural, Behavior, Parametric, and Requirements divisions and place every model element beneath its semantic division and owner. The Diagram control must display the active diagram's semantic context rather than leaving the tree unchanged.

## User experience

The default Containment view presents one project architecture:

```text
Model
|- Structural
|  |- Blocks
|  |- Parts and properties owned by their Blocks
|  |- Interfaces and value types
|  `- Structural diagrams
|- Behavior
|  |- State Machines
|  |  `- State Machine
|  |     |- Regions
|  |     |- States
|  |     |  `- State-owned XBridge or VLab models
|  |     `- Transitions
|  `- Other behavioral diagrams
|- Parametric
|  |- Standalone XBridge Models
|  |- Standalone VLab Models
|  `- Parametric diagrams
`- Requirements
   |- Requirements
   |- Verification Cases
   `- Requirements diagrams
```

The four divisions are read-only virtual organization nodes. They organize the browser but are not serialized as fake SysML packages. Model elements keep their canonical semantic IDs and ownership.

The tree must not switch its entire source between SysML and State Machine data when the active editor changes. Changing editors updates selection and diagram context while the complete project architecture remains available.

## Ownership and classification rules

- Block definitions, interfaces, value types, part usages, ports, and properties belong to Structural.
- State machines, regions, states, junctions, and transitions belong to Behavior.
- Requirements, verification cases, and their requirement diagrams belong to Requirements.
- A standalone XBridge or VLab model belongs to Parametric.
- An XBridge or VLab model owned by a State appears beneath that State in Behavior. It is not duplicated under Parametric.
- A nested element follows its canonical owner even when its modeling technology normally belongs to another pillar.
- Diagram nodes are placed under the pillar matching their diagram kind and remain references to canonical diagram metadata.
- Relationships remain discoverable through their participating elements and diagram context; they are not duplicated as independent top-level roots.

Classification is implemented by a pure registry so adding a future model or diagram kind does not require modifying tree rendering code.

## Architecture

### Unified project projection

Introduce a project-level projection service above the existing domain adapters. It reads canonical SysML, State Machine, XBridge, VLab, and diagram metadata and emits one `ModelTreeProjection`.

The projection service owns only navigation structure. Mutations continue to route to the domain adapter responsible for the selected semantic element. Every projected node records its semantic domain, canonical ID, kind, owner, and optional diagram identity.

Virtual node IDs use a reserved navigation namespace and never collide with semantic IDs. The initial roots are deterministic and ordered as Model, Structural, Behavior, Parametric, Requirements rather than alphabetically sorted.

### Domain routing

The explorer resolves capabilities and commands from the selected node's domain instead of the active editor mode. This permits creating and editing State Machine and SysML elements from the same tree.

Virtual pillar capabilities are explicit:

- Structural: create supported structural elements and structural diagrams.
- Behavior: create State Machines and supported behavioral diagrams.
- Parametric: create standalone XBridge, VLab, and parametric models/diagrams.
- Requirements: create Requirements, Verification Cases, and requirements diagrams.

State-owned XBridge/VLab creation is available from a State's menu and assigns that State as canonical owner.

### Diagram context

The explorer receives an active diagram descriptor containing its canonical diagram ID, kind, domain, and presented semantic element IDs. Selecting Diagram projects the unified hierarchy with only:

1. elements presented on the active diagram;
2. their canonical ownership ancestors;
3. the Model root and relevant pillar nodes;
4. context elements required to explain the diagram, such as an IBD context Block or a State Machine owner.

The Diagram control is disabled when there is no active diagram, with a tooltip explaining why. If persisted UI state requests Diagram view but no active diagram is available, the explorer displays a clear empty-context message and offers return to Containment.

The active diagram name is shown in the toolbar. Double-clicking a diagram node opens it. `Show in Containment` switches to Containment, expands the canonical ancestor path, and selects the element.

## Interaction behavior

- Search covers all domains and preserves ancestor paths and pillar context.
- Expand All and Collapse All operate on the currently projected view.
- Multi-selection is limited to compatible command domains for mutations; incompatible mixed selections retain navigation selection but disable invalid commands with an explanation.
- Dragging an element to the canvas uses its recorded domain and routes to the correct presentation service.
- Dragging within the tree validates semantic ownership through the responsible domain adapter.
- Selecting an element synchronizes the relevant editor when a presentation exists without changing canonical ownership.
- Favorites store canonical IDs and therefore survive movement between valid owners and changes between views.

## State and persistence

The unified projection is derived and is not persisted. Canonical domain models, diagram metadata, and presentation membership remain the sources of truth.

State Machine diagram metadata must be included in project save/load and State Machine snapshot commits. XBridge/VLab ownership must be persisted as a canonical owner reference so the projection can distinguish standalone models from State-owned models after reload.

Explorer UI state persists expanded virtual and semantic node IDs, favorites, selected view, and recent semantic IDs per project. Invalid stale IDs are ignored during restoration.

## Error handling

- Missing active-diagram metadata produces an explanatory empty state, never an apparently unchanged Diagram view.
- Orphan elements are placed in a read-only `Unresolved` group under their normal pillar and receive a diagnostic badge.
- Unknown model kinds appear in `Unclassified` under Model and cannot be moved until their kind and owner are valid.
- Commands against virtual nodes are accepted only through their declared pillar capabilities.
- Cross-domain ownership attempts that violate the classification rules fail preflight without mutating canonical state.

## Accessibility and visual design

The hierarchy uses the application's semantic palette tokens for surfaces, text, borders, focus, selection, hover, status, and icons. Pillars have distinct semantic icons but do not introduce hard-coded colors.

The Containment, Diagram, and Search controls expose tab semantics and keyboard focus. Virtual pillars and groups are announced as organizational nodes. Disabled Diagram state includes accessible explanatory text.

## Testing strategy

Development follows test-first behavior slices.

### Projection tests

- The four pillars always appear in the required order.
- SysML structural elements appear beneath Structural.
- State Machines appear beneath Behavior regardless of active editor.
- Standalone XBridge/VLab models appear beneath Parametric.
- State-owned XBridge/VLab models appear beneath their owning State and are absent from Parametric.
- Requirements and Verification Cases appear beneath Requirements.
- Orphan and unknown elements receive deterministic fallback placement and diagnostics.

### Diagram-context tests

- Clicking Diagram changes visible rows to the active diagram context.
- Presented elements, required context, owners, and pillars are retained.
- Unrelated elements are removed.
- Missing context displays the explicit empty state.
- Show in Containment reveals and selects the canonical element.

### Command and persistence tests

- Pillar create actions route to the correct domain adapter.
- Mixed-domain selections disable invalid mutations.
- State-owned XBridge/VLab creation records the State owner.
- Canvas drops route by payload domain.
- State Machine diagrams and XBridge/VLab ownership survive save, reload, undo, and redo.

### End-to-end acceptance

An end-to-end fixture contains Structural blocks, a State Machine, standalone XBridge and VLab models, a State-owned XBridge model, and Requirements. It verifies the complete hierarchy, switches through representative editors without losing pillars, opens each diagram from the tree, confirms Diagram filtering, reloads the project, and verifies identical ownership and placement.

## Acceptance criteria

1. Model always exposes Structural, Behavior, Parametric, and Requirements as its first-level divisions in that order.
2. State Machines remain visible under Behavior while any editor is active.
3. Standalone XBridge/VLab models appear under Parametric.
4. State-owned XBridge/VLab models appear only beneath their owning State under Behavior.
5. Clicking Diagram visibly filters the tree to the active diagram context.
6. No-active-diagram behavior is explicit and accessible.
7. Double-clicking a diagram node opens the associated diagram.
8. Creation, rename, move, delete, copy/paste, and add-to-diagram commands route by node domain and preserve canonical ownership.
9. The hierarchy and diagram metadata survive save/reload and undo/redo.
10. All explorer surfaces use the existing application palette in dark and light themes.

## Scope boundaries

- This design does not clone Cameo or Papyrus proprietary implementation details.
- It does not duplicate semantic elements to satisfy navigation placement.
- It does not change SysML language semantics.
- It does not add Activity or Sequence modeling features that do not already exist; it only provides classification extension points for them.
- It does not replace domain command services with UI-local mutation logic.
