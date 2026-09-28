# SysML BDD, Package Diagram, and Navigation Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make BDD property connections, Part creation, diagram/layer navigation, Package Diagram hierarchy and supported relationships, and canvas-to-tree behavior consistent with the repository-first SysML model and Cameo interaction benchmark.

**Architecture:** Keep the semantic repository and `sysmlCommandGateway` authoritative. Add shared navigation state for exact diagram/context identity, route BDD property connections from semantic compartment geometry, and make every canvas action call the same command/capability path as the Model Explorer. Package Diagram contents and all supported legal relationship presentations resolve canonical IDs; visual nesting and Show Contents never alter ownership.

**Tech Stack:** TypeScript, React, Vitest, Playwright, existing SysML command gateway, normalized repository/projections, diagram presentation persistence, and CSS semantic tokens.

## Global Constraints

- Follow `docs/superpowers/specs/2026-09-28-sysml-bdd-package-navigation-parity-design.md`.
- `OMG_SYSML_1_6`, `UML_FOUNDATION`, `CAMEO_TOOLING`, and `ADIA_EXTENSION` remain explicitly distinguished; Cameo behavior is not called an OMG requirement.
- All semantic mutations go through the canonical command gateway; failed commands mutate neither repository nor presentation/history/tree state.
- Part usages and relationship endpoints keep stable canonical IDs across BDD, IBD, Package Diagram, Model Explorer, save/load, undo, and redo.
- Package Diagram visual containment never changes semantic ownership. Use the explicit Move-to-Package command for ownership changes.
- “All connections” is bounded to relationship kinds supported by the repository and legal for endpoint types; do not silently coerce unsupported or invalid connections.
- Colors are presentation metadata. Association receives a distinct palette role; colors never decide endpoint or validation semantics.
- Preserve current save/load, deletion, code-generation isolation, and SysML semantic release gates.

---

## File Map

| File | Responsibility |
|---|---|
| `src/App.tsx` | Wire canvas gestures/buttons, exact active diagram IDs, navigation context, and gateway results to existing React views. |
| `src/engine/sysml/requirementsDiagramScope.ts` | Retain or extend pure block drill-down/navigation decisions without mixing semantic mutation into navigation. |
| `src/engine/sysml/capabilities/relationshipPolicy.ts` and `src/engine/sysml/capabilities/packagePolicy.ts` | Validate supported relationship endpoint kinds and Package Diagram constraints from the shared capability layer. |
| `src/engine/sysml/semanticPresentationStyles.ts` | Add the Association presentation role/token and keep it separate from relationship validity/status. |
| `src/services/sysmlDiagramNavigation.ts` | New pure transition service for opening exact diagram IDs, entering a context, returning to origin, and invalid-target recovery. |
| `src/services/sysmlBddRelationshipGeometry.ts` | New pure geometry resolver for association/property endpoints and safe fallback diagnostics. |
| `src/services/sysmlOwnedFeatureCommands.ts` | Reuse/extend the existing shared Part creation command so BDD and IBD controls produce the same owner/type/usage transaction. |
| `src/services/sysmlCommandGateway.ts` | Only if needed: ensure Package Diagram supports presentation of every currently supported legal relationship and validates endpoint presentation atomically. |
| `src/engine/sysml/projection/canonicalProjections.ts` and `src/services/sysmlPropertyUsageSync.ts` | Confirm canonical PartUsage projection reaches BDD compartments and IBD Parts; avoid parallel semantic state. |
| `src/engine/sysml/diagramInteractionCorrections.test.ts` | Add pure navigation, relationship identity, and cross-view regression tests. |
| `src/services/sysmlBddRelationshipGeometry.test.ts` | New geometry tests for compartment rows, box boundaries, transforms, missing layout, and nonzero viewport offsets. |
| `src/services/sysmlDiagramNavigation.test.ts` | New unit tests for exact diagram activation and navigation-stack restoration. |
| `src/services/sysmlOwnedFeatureCommands.test.ts` | Add owner-context and create-from-canvas parity assertions. |
| `src/services/sysmlCommandGateway.test.ts` | Add Package Diagram relationship/containment and atomic presentation tests. |
| `src/components/modelExplorer/AppModelExplorer.test.tsx` | Verify tree activation callback receives the exact diagram semantic ID. |
| `tests/e2e/sysml-bdd-package-navigation-parity.spec.ts` | New browser release gate for BDD/IBD/Package Diagram creation, connections, navigation, tree identity, and real persistence. |

## Implementation Tasks

### Task 1: Lock the Existing Semantic Contracts and Relationship Inventory

**Files:**
- Test: `src/engine/sysml/diagramInteractionCorrections.test.ts`
- Test: `src/services/sysmlCommandGateway.test.ts`
- Test: `src/services/sysmlOwnedFeatureCommands.test.ts`
- Read-only reference: `src/engine/sysml/model.ts`, `src/engine/sysml/capabilities/relationshipPolicy.ts`, `src/engine/sysml/capabilities/packagePolicy.ts`

- [x] Add failing tests for a typed Part property being the Association end, relationship IDs/endpoints remaining canonical, package owner not changing when contents are shown, and the currently supported legal Package Diagram connection kinds.
- [x] Run the three focused Vitest files and confirm each new test fails for its asserted missing behavior, not due to test setup.
- [x] Implement no behavior in this task; enumerate supported relationship kinds from the existing model/policy and record which diagram tools can create/display each. Do not expand the metamodel by silently adding a type.
- [x] Run the same tests and confirm existing behavior remains unchanged except for the newly failing regression assertions.

Commands:

```powershell
npx vitest run src/engine/sysml/diagramInteractionCorrections.test.ts src/services/sysmlCommandGateway.test.ts src/services/sysmlOwnedFeatureCommands.test.ts
```

Expected: new regression tests fail before implementation; unrelated tests pass.

### Task 2: Add Safe BDD Property-to-Block Relationship Geometry

**Files:**
- Create: `src/services/sysmlBddRelationshipGeometry.ts`
- Create: `src/services/sysmlBddRelationshipGeometry.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/engine/sysml/diagramInteractionCorrections.test.ts`

- [ ] Write geometry tests using a Block with a property row at a nonzero local Y, nonzero block origin, zoom, and pan. Assert the edge source resolves to the actual row coordinate and target resolves to the closest target Block boundary.
- [ ] Add tests for the property row being absent, property/owner IDs stale, self-link, and property type not matching the dropped Block. Assert each invalid case returns a stable diagnostic and never returns `(0,0)` as a fabricated anchor.
- [ ] Implement a pure resolver whose input carries the semantic property ID, owner Block ID, target Block ID, diagram presentation/layout, and viewport transform. Return resolved diagram-space endpoints plus a typed error when required geometry cannot be resolved.
- [ ] Route `dropBddFeatureOnBlock` in `src/App.tsx` through the geometry/policy service before committing. Keep the existing property ID as the Association end and preserve the canonical endpoint IDs; do not create a duplicate Property or Block.
- [ ] Add stable `data-semantic-id`/relationship-kind selectors only where needed for browser assertions, then verify existing BDD relationship click/selection behavior.

Commands:

```powershell
npx vitest run src/services/sysmlBddRelationshipGeometry.test.ts src/engine/sysml/diagramInteractionCorrections.test.ts
```

Expected: all geometry and BDD relationship tests pass; no route originates at the canvas origin unless the property row itself is located there.

### Task 3: Add an Association-Specific Presentation Role

**Files:**
- Modify: `src/engine/sysml/semanticPresentationStyles.ts`
- Modify: `src/index.css`
- Modify: `src/App.tsx`
- Modify: `src/engine/sysml/semanticPresentationStyles.test.ts`
- Modify: `tests/e2e/sysml-bdd-package-navigation-parity.spec.ts`

- [ ] Add a resolver test proving Association uses its own token, different from dependency/generalization/requirement trace colors, and that presentation override never changes relationship kind or validation.
- [ ] Add light- and dark-theme CSS values for the new association role using existing ADIA palette contrast conventions.
- [ ] Render Association edges through that role; keep package imports/merges/dependencies, Generalization, requirement trace links, selection, and error roles distinct. Selection/error state retains precedence over the base Association role and stored style overrides.
- [ ] Add browser assertions for computed edge stroke in both themes and for selection/error precedence.

Command:

```powershell
npx vitest run src/engine/sysml/semanticPresentationStyles.test.ts
```

Expected: token tests pass; browser assertion is exercised in Task 7.

### Task 4: Unify Part Creation and Keep BDD/IBD Projections in Sync

**Files:**
- Modify: `src/services/sysmlOwnedFeatureCommands.ts`
- Modify: `src/services/sysmlOwnedFeatureCommands.test.ts`
- Modify: `src/services/sysmlPropertyUsageSync.ts`
- Modify: `src/services/sysmlPropertyUsageSync.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/modelExplorer/AppModelExplorer.actions.test.tsx`

- [ ] Write a failing command test: with Block `Vehicle` active, a canvas Add Part intent without a separately supplied owner resolves owner to `Vehicle`, requires an explicit existing Block type, and creates one canonical PartUsage ID.
- [ ] Write a failing projection test that the same PartUsage ID appears in the `Vehicle` BDD property compartment and in its IBD after a refresh; no second feature/usage ID may be created.
- [ ] Route each canvas Part button/gesture and tree-owned-feature action through the same builder and gateway path. Pass active Block ID as owner context; never open an owner chooser when that context is valid.
- [ ] Keep type selection explicit. If no compatible type exists, return `TYPE_NOT_FOUND` and `CreateNewType`; cancellation leaves repository and presentations unchanged.
- [ ] Verify command failure does not optimistically update tree/canvas; successful repository result refreshes both projections from canonical IDs.
- [ ] Verify rename, type change, undo/redo, and reload resolve the same feature and do not duplicate the parent Block.

Commands:

```powershell
npx vitest run src/services/sysmlOwnedFeatureCommands.test.ts src/services/sysmlPropertyUsageSync.test.ts src/components/modelExplorer/AppModelExplorer.actions.test.tsx
```

Expected: BDD compartment and IBD node contain the same PartUsage ID; owner and type are identical in repository, tree, and canvas.

### Task 5: Make Diagram Activation and Root Navigation Identity-Preserving

**Files:**
- Create: `src/services/sysmlDiagramNavigation.ts`
- Create: `src/services/sysmlDiagramNavigation.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/modelExplorer/AppModelExplorer.tsx`
- Modify: `src/components/modelExplorer/AppModelExplorer.test.tsx`
- Modify: `src/components/modelExplorer/AppModelExplorer.actions.test.tsx`

- [ ] Write pure tests for opening an exact diagram ID among multiple BDDs, entering a Block from a specific BDD, returning by Root to that exact BDD, and recovering from deleted/stale diagram IDs.
- [ ] Define navigation state with `activeDiagramId`, `diagramKind`, `contextElementId`, and a stack entry recording the return diagram/context. Do not overload `currentLayerId` as both model owner and diagram ID.
- [ ] Update the tree double-click callback path to pass both semantic item ID and item kind; when the item is a Diagram, activate its exact repository ID and set its mode from its `diagramKind`.
- [ ] On Block entry from BDD, retain the origin BDD ID and set the IBD context to the Block ID. Root/back restores the origin BDD, not a generic `bdd` string or the previous unrelated layer.
- [ ] Apply exact-ID activation to Package Diagram and every other supported SysML diagram kind; keep existing explicit package chooser behavior only for the toolbar action where multiple package diagrams are ambiguous.
- [ ] Test click, double-click, breadcrumb, back/forward, tab/mode switch, save/reload restoration, and deletion of current context. Navigation-only actions must not modify semantic ownership.

Commands:

```powershell
npx vitest run src/services/sysmlDiagramNavigation.test.ts src/components/modelExplorer/AppModelExplorer.test.tsx src/components/modelExplorer/AppModelExplorer.actions.test.tsx
```

Expected: every activation resolves one exact ID and the BDD → IBD → Root path returns to the original BDD.

### Task 6: Complete Package Diagram Hierarchy, Relationship, and Cross-Diagram Projection

**Files:**
- Modify: `src/services/sysmlDiagramCreation.ts`
- Modify: `src/services/sysmlDiagramActivation.ts`
- Modify: `src/engine/sysml/capabilities/packagePolicy.ts`
- Modify: `src/services/sysmlCommandGateway.ts`
- Modify: `src/engine/sysml/services/packageQueries.ts`
- Modify: `src/App.tsx`
- Modify: `src/services/sysmlDiagramActivation.test.ts`
- Modify: `src/services/sysmlCommandGateway.test.ts`
- Modify: `src/engine/sysml/services/packageQueries.test.ts`

- [ ] Add failing semantic/presentation tests for Package containment display without owner mutation; Generalization between compatible displayed Classifier/Block endpoints; existing package import/access, element import, package merge, and dependency endpoints; and relationships whose endpoints are not both presented.
- [ ] Enumerate every supported relationship kind and valid endpoint family from the canonical metamodel/policy. Expose only legal canvas tools; do not present unsupported types as active buttons.
- [ ] Ensure Package Diagram projection reads package owner/member and relationship records from the canonical repository. Collapse/expand/Show Contents modifies only diagram presentations; explicit Move-to-Package alone changes ownership.
- [ ] Add relationship presentations by canonical relationship ID after endpoint preflight; invalid endpoint or missing endpoint presentation returns a structured diagnostic without partial lines or semantic mutations.
- [ ] Support cross-diagram commands to find/show the same semantic element and relationship on another compatible diagram; preserve semantic identity and all existing presentations.
- [ ] Verify tree projection reflects semantic Package, member, Generalization, import, merge, and dependency changes immediately; presentation-only changes must not invent tree semantic items.
- [ ] Cover duplicate, invalid-target, cycle, hidden-endpoint, undo/redo, and save/load cases at service/repository level.

Commands:

```powershell
npx vitest run src/services/sysmlDiagramActivation.test.ts src/services/sysmlCommandGateway.test.ts src/engine/sysml/services/packageQueries.test.ts src/engine/sysml/capabilities/packagePolicy.test.ts
```

Expected: valid Package Diagram actions persist once and project consistently; invalid actions leave repository and presentation state unchanged.

### Task 7: Audit Canvas Buttons and Add the Browser Release Gate

**Files:**
- Create: `tests/e2e/sysml-bdd-package-navigation-parity.spec.ts`
- Modify: `src/App.tsx` only for behavior gaps or stable accessible selectors
- Modify: `src/engine/sysml/repositoryPresentationReleaseGate.test.ts`
- Modify: `src/engine/sysml/diagramInteractionCorrections.test.ts`

- [ ] Inventory enabled BDD, IBD, Package Diagram, and relationship toolbar buttons. For each button, assert it maps to one typed semantic command, presentation command, selection/navigation action, or explicitly disabled unsupported feature; reject handlers that mutate only component-local arrays.
- [ ] Add browser workflow: create two Blocks and a typed Property; drag the Property to its compatible Block; assert edge begins at the property compartment row and uses Association color; save and reload and assert relationship endpoints unchanged.
- [ ] Add browser workflow: open a BDD, enter a Block, create a typed Part from the canvas; assert no owner chooser, same Part ID in tree/BDD compartment/IBD, then navigate Root and confirm the originating BDD is active.
- [ ] Create two BDDs and two Package Diagrams; double-click each tree item and assert the exact ID and independent presentations are active.
- [ ] Add Package Diagram workflow: show nested Package contents; create/show all legal relationship controls including Generalization and package relationships; verify ownership is unchanged by visual containment and all endpoints/relationship IDs appear in the tree/model projection.
- [ ] For semantic actions, assert one repository mutation and one tree projection update; for presentation-only actions, assert no new semantic element/relationship. Verify undo/redo, real app save/reload, and rename propagation.
- [ ] Run Playwright without optional assertions for these required behaviors.

Command:

```powershell
npx playwright test tests/e2e/sysml-bdd-package-navigation-parity.spec.ts
```

Expected: all workflow steps execute and persist without skipped core assertions.

### Task 8: Run Full Relevant Release Gates and Record Evidence

**Files:**
- Modify: `docs/sysml/compliance-evidence.json` only if evidence results/statuses change
- Modify: `docs/superpowers/plans/2026-09-26-sysml-diagram-interaction-review-repairs.md` only to reconcile superseded checklist items
- Modify: source files only for specific failing tests

- [ ] Run TypeScript check: `npx tsc --noEmit`; expected exit code 0.
- [ ] Run focused semantic suites for command gateway, owned features, property synchronization, diagram activation, Package policy/queries, geometry, and compliance evidence; expected all pass.
- [ ] Run repository identity and presentation release gates: `npx vitest run src/engine/sysml/repositoryFirstTreeReleaseGate.test.ts src/engine/sysml/repositoryPresentationReleaseGate.test.ts src/engine/sysml/diagramInteractionCorrections.test.ts`; expected all pass.
- [ ] Run browser gates: `npx playwright test tests/e2e/sysml-bdd-package-navigation-parity.spec.ts tests/e2e/sysml-repository-presentation.spec.ts tests/e2e/sysml-diagram-interaction-corrections.spec.ts`; expected all pass after real save/reload.
- [ ] Run code-generation isolation gate `npm run verify:repository-codegen-isolation`; expected generated outputs unaffected by presentation/navigation changes.
- [ ] Run `git diff --check`; expected no whitespace errors. Record exact test commands and results in the implementation handoff; do not mark unexecuted features compliant.

## Completion Gate

Do not mark complete until all eight tasks pass; property edges resolve to the actual property row and correct Block; Part creation uses the active Block owner and one stable ID across views; exact diagram activation and return navigation work with multiple same-kind diagrams; Package hierarchy is presentation-only unless an explicit move command executes; every enabled canvas button has a real semantic, presentation, or navigation effect; supported legal connections preserve endpoint IDs; the full browser/persistence/repository/code-generation gate passes without optional assertions.
