# SysML Model Structure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a valid SysML BDD/IBD hierarchy in which every part references a Block type and the model hierarchy is visible in the modeling tool.

**Architecture:** Define reusable Blocks in the BDD, define typed Part Properties inside parent Blocks, and display those properties in IBDs. Use the Model Browser/Containment Tree for model ownership; diagram movement is only visual layout.

**Tech Stack:** SysML v1 modeling tool, BDD, IBD, Model Browser/Containment Tree.

## ADIA Implementation Scope

Implement the approved ADIA design in the canonical SysML repository and its React projections. Keep an authoritative **All Model** tree and add a diagram-aware **Diagram Context** tree. Use stable canonical IDs so BDD compartments, IBD nodes, and requirement/RTM views reference the same elements.

## Global Constraints

- Every Part Property must reference a Block as its type.
- Block definitions belong in the model/package hierarchy and are reused by parts.
- BDDs show block definitions and relationships; IBDs show the internal parts of one context Block.
- Do not fix typing by merely moving diagram symbols.
- Preserve existing model elements until their replacement is validated.
- A Part Property or Requirement is one shared model element displayed on multiple diagrams; never create diagram-specific duplicates.
- Context-sensitive trees may filter navigation, but must not alter model ownership or semantics.

---

### Task 1: Activate and inspect the model hierarchy

**Files:** None; modeling-tool configuration only.

- [ ] Open the model browser using **Window → Model Browser**.
- [ ] Enable/select **Containment Tree** or the equivalent hierarchy tree.
- [ ] Expand the root Model and identify the package containing the SysML blocks.
- [ ] Confirm the SysML profile/plugin is loaded and the project is using SysML stereotypes.
- [ ] Record the package path containing the affected `part_10` and its owning Block.

**Expected result:** The model hierarchy is visible independently of diagram layout.

### Task 2: Create or verify Block definitions in the BDD

**Files:** Existing BDD model elements.

- [ ] Identify the parent Block that should contain `part_10`.
- [ ] Identify the real type of `part_10`, for example `Engine`, `Room`, or `Sensor`.
- [ ] Create that type as a Block if it does not exist.
- [ ] Ensure the parent is also a Block, not a generic UML Class or untyped element.
- [ ] Place the Block definitions on the BDD and show relevant relationships.

**Expected result:** Both the parent Block and the part’s type are valid Block definitions.

### Task 3: Replace the untyped part with a typed Part Property

**Files:** Existing Block definition containing `part_10`.

- [ ] Select `part_10` in the model browser, not only on the diagram.
- [ ] Set its property kind to **Part Property**.
- [ ] Set `Type` to the intended Block, for example `Engine`.
- [ ] Rename it from `part_10` to a meaningful role name such as `engine`.
- [ ] Confirm the resulting model meaning is equivalent to:

```text
block Car {
    part engine : Engine
}
```

- [ ] Remove the old untyped element from the diagram only after the typed replacement exists.

**Expected result:** The validation error “Part part_10 must reference a block type” is removed.

### Task 4: Build the IBD from the owning Block

**Files:** IBD for the parent Block.

- [ ] Create or open an Internal Block Diagram whose context is the parent Block.
- [ ] Add the typed Part Property `engine : Engine` from the model browser.
- [ ] Add ports, connectors, or item flows only when they represent valid relationships in the model.
- [ ] Move the part for visual layout only; do not change its ownership or type by dragging it into another Block.
- [ ] Confirm the IBD context is the intended parent Block.

**Expected result:** The IBD displays the parent Block’s internal typed parts correctly.

### Task 5: Synchronize BDD properties and IBD parts

**Files:** Existing BDD and IBD diagrams.

- [ ] Enable the parent Block’s **Parts/Properties compartment** in the BDD.
- [ ] Display the existing Part Property in the parent Block compartment using the model element from the model browser.
- [ ] Add that same Part Property to the parent Block’s IBD.
- [ ] Confirm both views show the same name and type, for example `engine : Engine`.
- [ ] Change the type or name once in the model browser and confirm both diagrams update.
- [ ] Reject any workflow that creates a second part with the same role merely to display it on another diagram.

**Expected result:** The BDD and IBD remain synchronized views of one shared Part Property.

### Task 6: Add and display requirements (“demands”)

**Files:** Requirement Diagram, BDD/IBD relationship views, and model package.

- [ ] Create each demand as a SysML Requirement in the model hierarchy.
- [ ] Give each requirement a unique name or ID and text such as `id = R-001` and `text = ...`.
- [ ] Add the required relationships, such as `satisfy`, `deriveReqt`, `verify`, or `refine`.
- [ ] Display the same Requirement and relationship on the Requirement Diagram.
- [ ] Display the relationship on the BDD or IBD only when that relationship is relevant to the view.
- [ ] Verify that the block or part satisfying a requirement is the existing model element, not a diagram-only copy.

**Expected result:** Requirements and their relationships are reusable and traceable across diagrams.

### Task 7: Implement context-sensitive hierarchy navigation

**Files:** Modeling-tool browser/view configuration; no duplicate model elements.

- [ ] Keep the Containment Tree as the authoritative permanent hierarchy.
- [ ] Add or enable a secondary Diagram/Context Tree or filtered browser if the tool supports it.
- [ ] On BDD activation, filter the secondary view to Block Definitions and their properties/relationships.
- [ ] On IBD activation, filter it to the owning Block, Part Properties, Ports, and Connectors.
- [ ] On State Machine activation, filter it to the State Machine, Regions, States, and Transitions.
- [ ] On Activity activation, filter it to Activities, Actions, and Flows.
- [ ] On Requirement Diagram activation, filter it to Requirements and traceability relationships.
- [ ] Make the active diagram’s context element selected in the secondary view.
- [ ] Ensure filtering changes visibility only; it must not move, copy, delete, or retype model elements.

**Expected result:** Navigation follows the active diagram while the underlying SysML model remains stable.

### Task 8: Validate the model against SysML rules

**Files:** None; model validation output.

- [ ] Run the tool’s model validation command.
- [ ] Confirm there are no errors for untyped Parts, invalid IBD context, or elements outside their owner.
- [ ] Check that every displayed part has a type in the model browser.
- [ ] Check that every part type is a Block or a specialization of a Block.
- [ ] Save the model and reopen it to confirm the hierarchy tree and diagrams persist.

**Expected result:** Validation passes, the hierarchy tree remains active, and BDD/IBD semantics are consistent.

### Task 9: Document the modeling convention

**Files:** Project modeling guidelines, if the project has one.

- [ ] Add the rule: “Create Blocks in the BDD before creating typed Part Properties.”
- [ ] Add the rule: “Create IBD parts from existing Part Properties; do not use generic untyped parts.”
- [ ] Add the rule: “Use the Model Browser for ownership and hierarchy; use diagram movement only for layout.”

**Expected result:** Future model edits do not recreate the same error.

## Self-Review Checklist

- The hierarchy view is a tool window, not a SysML relationship.
- The BDD owns Block definitions.
- The IBD shows the internals of one Block.
- `part_10` has a meaningful name and a Block type.
- The same Part Property is visible in the BDD compartment and the IBD.
- Requirements are shared model elements with traceability relationships.
- Diagram context filters do not change model ownership.
- Validation is run after the model changes.

## ADIA source map

- `src/engine/sysml/model.ts`: canonical BlockDefinition, PartUsage, RequirementDefinition, and relationship semantics.
- `src/engine/sysml/normalizedStore.ts`: indexed lookup and ownership/type queries.
- `src/services/sysmlCommandGateway.ts`: validated creation/update commands.
- `src/components/sysml/`: diagram navigation, browser/tree, inspectors, and presentation components.
- `src/App.tsx`: active diagram mode and legacy projection integration; must not become a second semantic store.
- `tests/e2e/sysml-bdd-ibd-requirements-rtm.spec.ts`: browser acceptance coverage.
- `src/engine/sysml/*.test.ts` and `src/services/*.test.ts`: canonical unit/integration tests.

## ADIA implementation tasks

### Task A: Add canonical context-tree selectors

**Files:** `src/engine/sysml/normalizedStore.ts`, related SysML types/tests.

- [ ] Add selectors that return the authoritative all-model containment tree.
- [ ] Add a diagram-context selector accepting the active diagram kind and context element ID.
- [ ] Return only relevant canonical IDs for BDD, IBD, State Machine, Activity, Requirements, and RTM contexts.
- [ ] Add tests proving filtering does not mutate ownership or duplicate elements.

### Task B: Enforce typed PartUsage creation and updates

**Files:** `src/services/sysmlCommandGateway.ts`, `src/services/sysmlCreationRules.ts`, relevant engine tests.

- [ ] Require `ownerId` to reference a BlockDefinition.
- [ ] Require `typeId` to reference a BlockDefinition.
- [ ] Reject missing or non-Block types with the diagnostic `Part <name> must reference a block type`.
- [ ] Preserve stable PartUsage identity during rename/retype operations.
- [ ] Add tests for valid creation, missing type, invalid type, invalid owner, and retype behavior.

### Task C: Project one PartUsage into BDD and IBD

**Files:** relevant components under `src/components/sysml/`, `src/App.tsx` only where routing is required.

- [ ] Render declared PartUsages in the owning Block’s BDD properties compartment.
- [ ] Render the same PartUsage ID in the owning Block’s IBD.
- [ ] Resolve names and types from the canonical store at render time.
- [ ] Ensure moving a presentation changes coordinates only.
- [ ] Add component or browser tests proving rename/retype updates both views.

### Task D: Add the All Model and Diagram Context trees

**Files:** existing SysML navigation/tree components under `src/components/sysml/` and active diagram state wiring.

- [ ] Keep All Model permanently available.
- [ ] Add Diagram Context filtered by active diagram kind and context ID.
- [ ] Update context when BDD, IBD, State Machine, Activity, Requirements, or RTM opens.
- [ ] Add “Show in All Model” and “Show context” navigation actions.
- [ ] Ensure filtering never creates, moves, deletes, or retypes model elements.
- [ ] Add browser coverage for each diagram kind.

### Task E: Preserve shared Requirements and traceability

**Files:** requirement/RTM components and canonical requirement relationship services.

- [ ] Render requirements by canonical ID in Requirement, BDD, IBD, and RTM views when relevant.
- [ ] Render `satisfy`, `deriveReqt`, `verify`, `refine`, and `trace` from canonical relationships.
- [ ] Ensure the context tree filters relationships without downgrading or duplicating them.
- [ ] Add acceptance coverage for bidirectional navigation and persistence.

### Task F: Run verification and release checks

**Files:** no new production files unless tests expose a defect.

- [ ] Run targeted SysML unit/service tests.
- [ ] Run `npm run test:e2e:sysml`.
- [ ] Run `npm run test:sysml:release`.
- [ ] Run `npx tsc --noEmit`.
- [ ] Fix failures using the canonical gateway/store rather than adding UI-only exceptions.
