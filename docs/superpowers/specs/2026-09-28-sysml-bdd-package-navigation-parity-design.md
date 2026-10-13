# SysML BDD, Package Diagram, and Navigation Parity Design

**Date:** 2026-09-28
**Status:** Approved
**Scope:** BDD property relationships, Part creation, diagram/layer navigation, Package Diagram relationship and hierarchy behavior, and canvas-to-tree consistency.

## Objective

Repair the SysML diagram workflows so BDD, IBD, Package Diagram, and the Model Explorer present and mutate one repository-first model. A Part created in an active Block context must be owned by that Block and resolve consistently as a BDD property and IBD Part. A property-to-Block relationship must route from the actual property row rather than `(0,0)`. Diagram activation and breadcrumb navigation must preserve exact diagram and context identity. Package Diagram must show the supported legal model relationships and package hierarchy without conflating visual nesting with semantic ownership.

## Authority and boundaries

- UML `Property`, `Association`, `Generalization`, Package containment, and relationship endpoint semantics are governed by `UML_FOUNDATION`; SysML BDD usage and Block/Part semantics are governed by `OMG_SYSML_1_6`.
- Cameo interaction parity—diagram activation, palette affordances, navigation, and tree synchronization—is `CAMEO_TOOLING`, not an OMG requirement unless independently specified.
- ADIA diagram colors, navigation history, command orchestration, and automatic tree refresh are `ADIA_EXTENSION`.
- OMG SysML 1.6 describes Block properties and allows properties typed by Blocks to serve as association ends. Cameo documents BDD association representations both as relationships between Blocks and as reference properties in compartments. Association color is an ADIA presentation choice.
- Normative/tooling references: [OMG SysML 1.6](https://www.omg.org/spec/SysML/1.6/PDF), [OMG UML 2.5.1](https://www.omg.org/spec/UML/2.5.1/PDF), [Cameo SysML Block Definition Diagram](https://docs.nomagic.com/MT/2026x/magic-cyber-systems-engineer---cameo-systems-modeler/sysml-block-definition-diagram-272732304.html), and [Cameo Defining Blocks in a BDD](https://docs.nomagic.com/MT/2026x/magic-systems-modeling---cameo-systems-modeler/defining-blocks-in-block-definition-diagram-272731811.html).
- “All connections” means all relationship kinds currently supported by ADIA and legal for the selected endpoint types and active diagram. It does not mean claiming complete UML/SysML metamodel coverage.

## User-visible behaviors

### BDD property relationships

Dragging an existing typed Part/Reference Property onto its compatible Block creates or presents the correct Association semantics using the existing property identity. Its edge starts at the property's displayed compartment row on its owning Block and terminates on the target Block boundary. Routing uses diagram-space coordinates and current transforms; missing or stale presentation geometry returns a diagnostic or falls back to a validated owner-compartment anchor, never `(0,0)`. Association edges use a dedicated semantic presentation role distinct from other relationship types; colors remain presentation-only and do not affect validation.

### Part creation and shared feature identity

Every canvas control that creates a Part delegates to the same typed feature command used by the tree. If a Block is the active context, that Block is the owner; do not ask the user to select an owner again. The command validates an existing compatible Block type, atomically stores the PartUsage/feature/owner/type data, and updates repository projections. The BDD compartment and IBD symbol resolve the same stable Part ID. If the operation is presentation-only (Show/Add to Diagram), it adds a presentation and does not create a semantic duplicate. Errors leave semantic state, presentations, history, and tree projection unchanged.

### Exact diagram and layer navigation

Opening a diagram tree item activates its exact repository diagram ID, not merely its `DiagramKind`. This applies to multiple BDDs and to Package Diagrams, IBD contexts, and other supported SysML diagrams. Entering a Block from a BDD records the origin diagram ID and context. Breadcrumb Root returns to that origin BDD; it must not silently open a generic BDD, retain an unrelated current layer, or do nothing. Navigation changes view state only; it never reparents semantic elements.

### Package Diagram hierarchy and relationships

Package Diagram renders semantic Package containment and packageable members from repository ownership. Collapsing/expanding or showing/hiding contents affects presentations only. It does not change `ownerId`; an explicit Move-to-Package semantic command remains the only ownership change.

The diagram displays and creates all relationship kinds that the repository and Package Diagram capability policy currently support, including Generalization between compatible classifiers, package import/access, element import, package merge, and dependency where endpoint rules permit. Existing relationship IDs are shared across diagrams. Cross-diagram navigation and “find/show in diagram” resolve semantic endpoints by ID. Relationship endpoint visibility rules are explicit and validated; no relationship is fabricated merely because an element is displayed.

### Canvas and tree parity

Every enabled canvas button and relationship tool must dispatch a typed repository command or a presentation command. Semantic create/rename/type/ownership/relationship actions update the Model Explorer from the committed canonical repository. Presentation-only actions update diagram membership but do not synthesize tree elements. Unsupported actions are not rendered as active controls. A backend capability/validator remains authoritative; the UI and tree consume its result rather than duplicating semantic policy.

## Architecture

```text
Canvas buttons / gestures / Model Explorer
                 |
      typed semantic or presentation intent
                 |
      shared capability + endpoint policy
                 |
       atomic repository command gateway
                 |
 repository + presentation persistence/history
            /                         \
  diagram projection              tree projection
```

Use one diagram navigation state that retains `{diagramId, diagramKind, contextElementId, returnTarget}`. Keep semantic repository ownership separate from the navigation stack and from presentation layout. Use existing normalized repository identity and gateway transactions; do not add a BDD-only or Package-Diagram-only semantic store. Add a focused routing helper that maps semantic relationship endpoints to diagram geometry, using presentation layout and owner compartment coordinates.

## Error behavior

- Missing/incompatible property type: return the existing `TYPE_NOT_FOUND` or typed-feature diagnostic and explicit type-selection action; never infer a type.
- Invalid relationship endpoints/kind: reject atomically with the canonical endpoint diagnostic.
- Missing property-row geometry: report a structured presentation diagnostic or use an owner-row fallback; never draw from the viewport origin.
- Stale/deleted diagram or navigation target: clear or restore to a valid parent diagram with a user-visible diagnostic; do not silently activate another diagram of the same kind.
- Failed canvas command: do not update the tree optimistically; refresh from the committed repository result only.

## Verification gates

1. Semantic tests prove Part ownership/type, Association member-end identity, Generalization endpoints, Package ownership, and package import/merge/dependency identities independently of React.
2. Projection tests prove BDD property compartment coordinates map to the correct edge anchor and Package Diagram containment/relationship projections resolve by semantic ID.
3. Navigation tests prove exact activation with multiple same-kind diagrams and round-trip BDD → Block IBD → originating BDD, including Root breadcrumb.
4. Command parity tests prove each enabled canvas creation control dispatches the same semantic command/validator as the tree and that presentation-only actions do not create semantics.
5. Browser release gate creates Blocks and a typed property, draws the association, creates a Part from the active Block, opens multiple BDDs, navigates into/out of IBD, creates and opens a Package Diagram, presents package contents and legal relationships, and confirms tree/canvas identity.
6. Save/reload, rename, undo/redo, deletion-impact, TypeScript, semantic release, Package Diagram, browser, and code-generation isolation gates remain green.
