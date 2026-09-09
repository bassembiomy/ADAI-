# PlantUML Visual Modeling Workspace

## Goal

Add a professional, fully offline visual modeling workspace to ADIA for creating sequence and use-case diagrams with drag-and-drop blocks, while preserving ADIA's existing dark UI, interaction patterns, project persistence, and export workflows.

## User experience

The workspace is opened as a first-class ADIA diagram mode. It uses the same general three-pane pattern as the existing BDD editor:

- A modeling palette provides diagram-specific elements.
- A central infinite canvas supports drag/drop placement, pan, zoom, snapping, alignment guides, multi-select, resize, duplicate, delete, and undo/redo.
- A properties panel edits the selected element or relationship.

The visual model is authoritative. Users do not need to write PlantUML source. The application generates PlantUML internally for rendering and export.

## Supported diagram types

### Sequence diagrams

The initial professional tool supports actors, participants, boundary/control/entity/database lifelines, synchronous and asynchronous calls, returns, self-calls, notes, and combined fragments for `alt`, `opt`, `loop`, `par`, and grouped frames. Lifeline ordering is explicit and can be changed through canvas operations or properties.

### Use-case diagrams

The tool supports actors, use cases, system boundaries, associations, `include`, `extend`, and generalization relationships. Elements can be named and styled through the properties panel, and system-boundary membership is represented explicitly in the model.

## Architecture

Create a diagram-independent visual modeling core with diagram-type adapters:

- `VisualDiagramModel`: document identity, diagram type, elements, relationships, canvas metadata, and version.
- Element and relationship discriminated unions: shared identifiers and labels plus type-specific properties.
- Sequence adapter: validates participant ordering, message endpoints, fragment scope, and return relationships; generates PlantUML sequence syntax.
- Use-case adapter: validates endpoint compatibility, boundary membership, and relationship semantics; generates PlantUML use-case syntax.
- Canvas interaction layer: handles selection, drag/drop, connection creation, transforms, snapping, keyboard commands, and undo/redo transactions.
- Renderer boundary: accepts validated generated source and returns SVG or a structured render error; it must not make network requests.

Keep the model separate from React presentation so it can be tested independently and extended later for class, activity, component, and state diagrams.

## Offline rendering

PlantUML rendering is bundled with the Electron application and runs locally. The renderer produces SVG for the live preview and supports PNG/PDF export through the existing local export pipeline where practical. No PlantUML server, remote URL, or network access is required for authoring or rendering.

Renderer failures are shown in the workspace status area with a human-readable message and, when available, the affected element or generated-source line. The canvas remains editable when rendering fails.

## Persistence and interoperability

PlantUML visual diagrams are saved as part of the ADIA project payload using a versioned schema. Loading includes migration support for future schema versions and preserves unknown safe fields where possible. Diagrams can be duplicated and reopened without converting them into a text-only representation.

Exports include SVG, PNG, PDF, and generated PlantUML source. Exported source is an interoperability artifact; editing that source is not required to use the visual workspace.

## Validation and safety

Validation runs before rendering and export. It reports missing names, invalid endpoints, unsupported relationship combinations, invalid fragment containment, and dangling references. Validation must not prevent ordinary canvas editing; it only blocks or warns on operations that require a valid render/export.

Generated source is produced from typed model data rather than concatenating untrusted executable input. The offline renderer receives only the generated diagram source and configured rendering options.

## Visual design

Use existing ADIA design conventions: charcoal backgrounds and panels, orange primary accent, muted gold/blue/green semantic accents, compact rounded controls, existing typography, and familiar toolbar/property-panel behavior. UML semantics must remain legible in the dark theme through clear line contrast, readable labels, and distinct relationship styling.

## Delivery stages

1. Shared visual modeling foundation, canvas interactions, schema, persistence, and test fixtures.
2. Full use-case modeling with palette, properties, validation, generated source, and rendering.
3. Full sequence modeling with lifeline ordering, messages, returns, notes, and fragments.
4. Bundled offline renderer, SVG/PNG/PDF/source exports, and error presentation.
5. Professional usability pass: templates, alignment, keyboard shortcuts, grouping, duplicate/reorder actions, and accessibility details.

## Testing strategy

Unit tests cover model creation, migrations, validation, relationship rules, PlantUML source generation, and render-error mapping. Component tests cover palette drag/drop, selection and property editing, connection creation, diagram-type switching, persistence hooks, and error display. Integration tests cover create → edit → save → reload → render for both diagram types and verify that the application does not depend on network access. Export tests verify SVG/source output and the existing PDF/PNG pathways.

## Acceptance criteria

- A user can create and edit a use-case diagram entirely with drag-and-drop blocks and relationships.
- A user can create and edit a sequence diagram entirely with drag-and-drop lifelines, messages, returns, notes, and fragments.
- Both diagram types render locally while offline.
- The UI follows existing ADIA visual conventions and interaction patterns.
- Diagrams persist in ADIA projects and reload without losing elements or relationships.
- Invalid models remain editable and provide actionable validation feedback.
- SVG, PNG, PDF, and generated PlantUML source can be exported.
- Automated tests cover the model, adapters, persistence, rendering boundary, and core UI interactions.
