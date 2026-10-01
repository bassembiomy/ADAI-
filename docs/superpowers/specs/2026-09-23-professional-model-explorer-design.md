# Professional State Machine and SysML Model Explorer Design

## Goal

Replace ADIA's basic hierarchy panel with a professional model-authoring explorer for State Machine and SysML models. The explorer must support Cameo-style creation, relationship authoring, semantic reorganization, navigation, and diagram presentation while preserving one canonical model and complete undo/redo behavior.

## Product principles

- The containment tree represents semantic ownership, not visual grouping.
- Creating an element in the tree creates the semantic element only.
- Dragging an existing tree element to a diagram creates a presentation of the same stable model ID.
- Creating an element from a diagram creates both the semantic element and its first presentation.
- Every visible action is context-sensitive and limited to operations valid for the selected element type.
- Every mutation is validated, atomic, reversible, and synchronized with properties and all diagrams.
- State Machine and SysML use one explorer interaction model while retaining domain-specific semantic rules.

## Reference behavior

The interaction model follows familiar professional-modeling conventions:

- Cameo-style creation beneath a selected owner through a searchable `Create Element` menu.
- Model-first authoring followed by drag-to-diagram presentation.
- Context-sensitive incoming and outgoing relationship creation.
- Papyrus-style `New Child`, inline rename, diagram creation, and model explorer navigation.

The implementation will reproduce these useful workflows without copying proprietary visual design or internal implementation.

## Architecture

The current `HierarchyTree` in `src/App.tsx` will be replaced by a focused Model Explorer subsystem.

### ModelTreeProjection

Builds normalized, immutable tree nodes from canonical State Machine and SysML repositories. It exposes stable node IDs, semantic IDs, parent IDs, child-presence metadata, labels, icons, badges, ordering information, and lazy child resolvers. It supports containment, active-diagram context, and search projections without mutating the model.

### ModelCapabilityRegistry

Returns the legal operations for a node based on domain, metatype, owner, active diagram, selection, and model state. Capabilities include child element types, relationship types and directions, diagram types, move targets, property actions, and destructive operations. Disabled actions include a human-readable reason.

### ModelExplorerCommandBus

Executes typed commands for create, rename, move, copy, paste, duplicate, delete, relationship creation, diagram creation, and presentation creation. A command performs preflight validation, applies one atomic transaction, records an inverse patch, updates model indexes, and emits a domain event. Failed commands leave the model unchanged.

### Domain adapters

`StateMachineExplorerAdapter` and `SysmlExplorerAdapter` translate normalized explorer commands into existing domain mutations. They own domain-specific validation and projection behavior. The shared explorer must not contain State Machine or SysML semantic branching beyond adapter selection.

### ModelExplorerView

Renders the tree, tabs, toolbar, search, rows, context menus, inline editors, drag previews, status markers, and dialogs. The view consumes projections and capabilities and dispatches commands; it does not mutate model arrays directly.

### DiagramPresentationService

Creates, locates, removes, and synchronizes diagram presentations for existing semantic elements. It prevents accidental semantic duplication and distinguishes deleting a presentation from deleting a model element.

### Data flow

`User action -> capability check -> command preflight -> atomic canonical-model mutation -> inverse patch/history -> index update -> projection refresh -> diagram/property synchronization`

## Explorer views

### Containment

Shows authoritative semantic ownership across the selected State Machine or SysML model. The view supports packages and model roots, domain elements, relationships, behaviors, and diagrams.

### Diagram Context

Shows elements relevant to the active diagram and highlights its semantic context. Filtering this view never creates, moves, copies, deletes, or retypes model elements.

### Search Results

Shows matches across names, qualified names, types, stereotypes, requirement IDs, and selected searchable property values. Selecting a result can reveal its containment path or locate its presentations.

## Core interaction behavior

- Expand, collapse, expand recursively, collapse recursively, and restore expansion state per project.
- Keyboard navigation with arrows, Home, End, Page Up, Page Down, Enter, Space, F2, Delete, and standard clipboard shortcuts.
- Single selection, range selection, additive multi-selection, and selection synchronization with canvas and property panels.
- Searchable `Create Element` menu containing only legal child types for the selected owner.
- `Create Diagram` menu containing only diagram types legal for the selected owner.
- `Create Relationship -> Incoming` and `Create Relationship -> Outgoing`, followed by relationship type and target selection.
- Inline rename with F2, semantic validation, cancel, and commit behavior.
- Cut, copy, paste, duplicate, delete, and multi-item operations where the selected elements are compatible.
- Drag within the tree to change semantic ownership, with compatible-target highlighting and transaction validation.
- Drag from tree to diagram to create a presentation of an existing semantic element.
- `Add to Active Diagram` as the keyboard/context-menu equivalent of drag-to-diagram.
- Double-click to open the most relevant diagram, nested context, or specification editor.
- `Reveal in Containment`, `Show in Diagram`, `Open Type`, `Show Usages`, and `Open Specification` navigation commands.
- Favorites and recent elements stored as non-semantic project UI state.
- Validation badges for unresolved typing, invalid ownership, broken references, incomplete required fields, and conflicting names.

## State Machine capabilities

### Ownership

- A State Machine owns one or more Regions.
- A Region owns vertices and transitions.
- A composite State owns child Regions rather than directly owning nested States.
- Transitions reference source and target vertices and appear in a relationships branch without becoming children of either endpoint.

### Creation

- State Machine: Region and State Machine Diagram.
- Region: State, Final State, Initial Pseudostate, Choice, Junction, Fork, Join, Shallow History, Deep History, Entry Point, Exit Point, Terminate, and Transition.
- State: child Region, entry/during/exit behavior, internal transition, outgoing transition, and incoming transition.
- Composite State: the Region and vertex actions above within its child Regions.

### Moving

Moving a vertex between Regions changes semantic ownership. Preflight rejects cycles and illegal targets and analyzes every connected transition. The impact dialog lists transitions that remain valid, become cross-region but legal, or must be removed. The user may cancel, preserve all legal relationships, or confirm removal of invalid relationships.

## SysML capabilities

### Ownership

- Packages own definitions, requirements, behaviors, diagrams, and nested packages.
- Blocks own Part Usages, Port Usages, value properties, operations, constraints, and behaviors.
- Part Usages reference Block types and may have presentations in multiple BDD and IBD diagrams.
- Requirements participate in containment and traceability relationships without being duplicated between views.
- Relationships are canonical elements with stable source and target IDs.

### Creation

- Package/model root: Package, Block, Value Type, Interface Block, Requirement, Test Case, Activity, State Machine, Constraint Block, and valid diagram types supported by ADIA.
- Block: Part, Reference, Shared Part, Port, Proxy Port, Full Port, Flow Property, Value Property, Operation, Constraint Property, State Machine, Activity, and supported diagrams.
- Part: required Block type, multiplicity, redefinition/subsetting where supported, navigation to type, and addition to an IBD.
- Requirement: child Requirement and satisfy, verify, refine, derive, trace, and containment relationships.
- Relationships: composition, association, generalization, dependency, allocation, binding, item flow, connector, and requirement relations when supported by the selected endpoint types.

The capability registry must expose only relationship types currently supported by ADIA's canonical repository and diagram renderers. Unsupported SysML metatypes are not advertised until their semantics, persistence, properties, and rendering are implemented.

## Relationship workflow

The relationship wizard receives a fixed source or target from the current selection. It then:

1. Lists legal incoming or outgoing relationship types.
2. Filters candidate endpoints using the capability registry.
3. Supports searching by name, qualified name, type, and requirement ID.
4. Shows why disabled candidates are invalid.
5. Previews ownership, direction, and affected diagrams.
6. Commits one atomic relationship command.
7. Offers to add the new relationship to the active diagram when both endpoint presentations exist.

## Reparenting and drag/drop

Drop targets are evaluated before pointer release and display allowed, warning, or forbidden feedback. A move changes `ownerId` or the equivalent canonical parent reference; it never merely reorders a visual list. Sibling ordering is stored separately from ownership when manual ordering is enabled.

Dropping an element on a diagram creates a presentation referencing the existing semantic ID. If the active diagram cannot represent that metatype, the drop is rejected with a precise reason. If a presentation already exists, the explorer selects and reveals it instead of creating a duplicate unless the diagram type explicitly permits multiple presentations.

## Rename, copy, paste, and duplicate

- Rename validates identifier syntax, namespace uniqueness, reserved names, and domain constraints before commit.
- Copy records semantic IDs and an immutable snapshot of the selected ownership forest.
- Paste chooses copy or reference semantics according to the target capability. The confirmation UI states which behavior will occur.
- Duplicate creates new stable IDs for the selected ownership forest and remaps internal references while preserving legal external references.
- Cut followed by paste is a validated atomic ownership move when possible.

## Deletion and impact analysis

Deleting a diagram symbol removes only that presentation. Deleting through Containment removes the semantic element after an impact preview.

The preview lists:

- recursively owned descendants;
- incoming and outgoing relationships;
- diagram presentations;
- typed usages and references;
- requirements traceability and verification evidence;
- State Machine transitions and behavior dependencies.

Protected or externally referenced elements cannot be silently deleted. The user receives available resolutions, and cancel leaves all state unchanged.

## Error handling and recovery

- Commands return structured success or failure results with stable diagnostic codes and actionable messages.
- Validation failure performs no mutation and keeps selection and expansion state stable.
- Unexpected adapter failures roll back the complete transaction and report the failed action.
- Persistence failure retains the in-memory command in a dirty state and offers retry or save-as; it does not discard edits.
- Stale drag targets and deleted relationship candidates are revalidated at commit time.
- Import migration reports invalid ownership or typing rather than silently restructuring the model.

## Performance and accessibility

- Parent/child, type, relationship endpoint, presentation, and search indexes avoid repeated full-array scans.
- Projection updates are incremental and keyed by stable IDs.
- Children are resolved lazily, and visible rows are virtualized.
- Search is debounced and index-backed.
- The target is smooth navigation and editing with at least 10,000 visible elements.
- All actions are keyboard accessible and expose accessible names, roles, expanded state, selection state, validation state, and menu structure.
- Focus returns predictably after create, rename, move, dialog completion, or cancellation.

## Delivery phases

1. **Tree foundation:** component extraction, normalized nodes, containment/context tabs, selection, expansion, search, keyboard behavior, and virtualization.
2. **Command foundation:** capability registry, transactions, create/rename/delete, validation, diagnostics, and undo/redo.
3. **State Machine authoring:** Regions, States, Pseudostates, Transitions, nested hierarchy, behavior editing, and validated reparenting.
4. **SysML authoring:** packages, Blocks, Parts, Ports, properties, Requirements, behaviors, diagrams, and typed ownership.
5. **Relationship authoring:** context-sensitive incoming/outgoing relationship wizard and valid endpoint filtering.
6. **Professional manipulation:** copy/paste, duplicate, multi-selection, drag/reparent, drag-to-diagram, navigation actions, favorites, and impact previews.
7. **Hardening:** accessibility, large-model performance, persistence, migration, recovery, regression testing, and documentation.

## Testing strategy

### Unit tests

- Projection shape, stable ordering, lazy children, and incremental updates.
- Capability matrices for every supported State Machine and SysML metatype.
- Ownership, cycle, naming, typing, relationship endpoint, and presentation rules.
- Command success, failure atomicity, inverse patches, redo, and multi-command transactions.
- Clipboard ID remapping and impact analysis.

### Component tests

- Context menus, searchable creation, inline rename, relationship wizard, impact dialogs, and notifications.
- Keyboard navigation, focus restoration, selection, expansion, search, and accessibility attributes.
- Allowed, warning, and forbidden drag/drop states.

### Integration tests

- One semantic element remains synchronized across Containment, Diagram Context, properties, and several diagrams.
- State Machine moves preserve or reject transitions according to semantic rules.
- SysML Part typing and Block ownership remain synchronized between BDD and IBD.
- Deleting a presentation preserves semantics; deleting semantics removes dependent presentations.
- Save/load and undo/redo preserve explorer and model invariants.

### Browser and performance tests

- Build a realistic nested State Machine primarily from the explorer.
- Build a BDD, IBD, and Requirements model primarily from the explorer.
- Create valid relationships through incoming/outgoing workflows and add them to diagrams.
- Reorganize ownership and verify impact previews and undo.
- Measure initial projection, expand, search, rename, move, and incremental update behavior at 1,000 and 10,000 elements.
- Run existing SysML persistence, deletion, reporting, simulation, and State Machine generation regression suites.

## Acceptance criteria

- Users can create all currently supported State Machine and SysML elements beneath valid owners from the tree.
- Invalid child and relationship choices are absent or visibly disabled with an explanation.
- Tree creation does not create a diagram presentation automatically.
- Dragging or using `Add to Active Diagram` creates a presentation of the same stable semantic ID.
- Tree drag/drop performs validated semantic reparenting and is fully undoable.
- Relationship creation supports context-sensitive incoming and outgoing workflows.
- Rename, copy, paste, duplicate, delete, multi-selection, search, reveal, and navigation work consistently.
- Properties, diagrams, Containment, and Diagram Context remain synchronized after every command.
- Failure at any validation or execution stage leaves the canonical model unchanged.
- Interaction remains responsive with at least 10,000 visible elements.
- Existing persistence, deletion, reporting, simulation, code generation, and canonical SysML synchronization behavior remains intact.

## Scope exclusions

- Exact cloning of Cameo or Papyrus visual design.
- Advertising SysML metatypes that ADIA cannot yet persist, validate, edit, and render correctly.
- Collaborative multi-user locking and merge conflict resolution.
- Profile or metamodel authoring UI in the first release.
- Replacing the canonical SysML repository or State Machine runtime semantics.

## Reference sources

- Cameo Systems Modeler 2026x, "Working with model elements": https://docs.nomagic.com/MT/2026x/magic-cyber-systems-engineer---cameo-systems-modeler/working-with-model-elements-272730343.html
- Cameo Systems Modeler 2026x, "Creating and displaying contextual relationships": https://docs.nomagic.com/MT/2026x/magic-cyber-systems-engineer---cameo-systems-modeler/creating-and-displaying-contextual-relationships-272732012.html
- Eclipse Papyrus SysML user tutorial: https://eclipse.dev/papyrus/components/sysml/0.10.0/user/tuto1-createsysmlproject.html
