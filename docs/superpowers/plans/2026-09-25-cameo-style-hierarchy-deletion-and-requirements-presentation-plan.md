# Cameo-Style SysML Hierarchy, Deletion, and Requirements Presentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make SysML hierarchy, deletion, and cross-diagram presentation behavior repository-first and Cameo-style, including reliable display and relationship creation for an existing Block on a Requirements Diagram.

**Architecture:** The canonical SysML repository and presentation index are the only semantic and diagram-membership authorities. UI state stores projections and interaction state only. All entry points use shared ownership, diagram compatibility, relationship, and deletion-impact policies.

**Tech Stack:** TypeScript, React, Vitest, Playwright, existing SysML v4 repository/domain, normalized store, command gateway, and model explorer.

## Global Constraints

- Semantic elements exist once and diagrams reference them through presentations.
- `Remove from Diagram` removes only a presentation.
- `Delete from Model` analyzes impact, confirms when required, cascades composite-owned children, removes attached presentations and relationships, and remains undoable.
- Shared/reference usages never silently cascade.
- Requirements Diagram display uses `DisplayExistingElement` semantics and preserves the existing semantic ID.
- Requirements relationships use the central SysML endpoint policy.
- Missing semantic types return `TYPE_NOT_FOUND` and never create replacement elements.
- Every production change has a failing test before implementation.
- Existing architecture, identity, release-gate, reporting, and TypeScript checks remain green.

---

### Task 1: Reproduce the split presentation-state defect

**Files:**
- Create: `src/engine/sysml/canonicalPresentationWorkflow.test.ts`
- Modify: `src/engine/sysml/requirementsDiagramScope.test.ts`
- Modify: `src/engine/sysml/requirementsDiagramScope.appIntegration.test.ts`

**Interfaces:** Use `createEmptyRepositoryV4`, `addSemanticElementV4`, `executeSysmlCommand`, `createSysmlGatewayState`, `getRequirementsDiagramScope`, and `projectLegacyDiagram`.

- [ ] **Step 1: Write the failing test.** Create one Block `Motor`, one Requirement `REQ-001`, BDD-A, and Requirements-A. Display the same Block on both diagrams and assert one semantic Block plus two presentations. Execute the application `addToDiagram` path while a Requirement is already visible and assert the complete view still contains both elements.
- [ ] **Step 2: Run the focused test and verify it fails for the split-state/filter-replacement defect.**

```powershell
npx vitest run src/engine/sysml/canonicalPresentationWorkflow.test.ts src/engine/sysml/requirementsDiagramScope.test.ts --reporter=verbose
```

- [ ] **Step 3: Extend the test with rename evidence.** Rename `Motor` to `BLDCMotor`; assert both presentations resolve the new name and the semantic Block count remains one.
- [ ] **Step 4: Commit the red regression tests.**

```powershell
git add src/engine/sysml/canonicalPresentationWorkflow.test.ts src/engine/sysml/requirementsDiagramScope.test.ts src/engine/sysml/requirementsDiagramScope.appIntegration.test.ts
git commit -m "test(sysml): reproduce split presentation state"
```

### Task 2: Unify canonical presentation membership and global projections

**Files:**
- Modify: `src/App.tsx:6058-6155, 6277-6400, 16690-16730`
- Modify: `src/services/sysmlCommandGateway.ts:1800-1880, 1930-2015`
- Modify: `src/engine/sysml/normalizedStore.ts:1150-1170, 1420-1500`
- Modify: `src/engine/sysml/requirementsDiagramScope.ts:10-75`
- Test: `src/engine/sysml/canonicalPresentationWorkflow.test.ts`
- Test: `src/engine/sysml/requirementsDiagramScope.appIntegration.test.ts`

**Interfaces:** Keep `sysmlStore.diagramPresentations` and repository presentations authoritative. Return a complete repository view separately from any diagram-scoped view.

- [ ] **Step 1: Add a failing source-level assertion** that Requirements scope reads canonical store presentations and that a diagram-filtered result is not assigned to global model arrays.
- [ ] **Step 2: Run the assertion and verify failure.**

```powershell
npx vitest run src/engine/sysml/requirementsDiagramScope.appIntegration.test.ts --reporter=verbose
```

- [ ] **Step 3: Remove the split React authority.** Derive explicit Requirements presentations from `Object.fromEntries(sysmlStore.diagramPresentations.entries())`; update compatibility state from command results only.
- [ ] **Step 4: Preserve the complete global projection.** After `addToDiagram`, update repository/store and global `blocks`, `relationships`, `parts`, and `connectors` from the complete repository projection. Use a diagram-scoped projection only for the active canvas.
- [ ] **Step 5: Route Model Explorer drag/drop through canonical display.** Dispatch an existing-element presentation command for the active Requirements diagram, preserve coordinates by semantic ID, and return `ALREADY_PRESENTED` without mutation for duplicates.
- [ ] **Step 6: Run the focused green tests.**

```powershell
npx vitest run src/engine/sysml/canonicalPresentationWorkflow.test.ts src/engine/sysml/requirementsDiagramScope.test.ts src/engine/sysml/requirementsDiagramScope.appIntegration.test.ts --reporter=verbose
```

- [ ] **Step 7: Commit.**

```powershell
git add src/App.tsx src/services/sysmlCommandGateway.ts src/engine/sysml/normalizedStore.ts src/engine/sysml/requirementsDiagramScope.ts src/engine/sysml/canonicalPresentationWorkflow.test.ts src/engine/sysml/requirementsDiagramScope.test.ts src/engine/sysml/requirementsDiagramScope.appIntegration.test.ts
git commit -m "fix(sysml): unify diagram presentation authority"
```

### Task 3: Separate Cameo-style presentation removal from model deletion

**Files:**
- Modify: `src/engine/sysml/commands/presentationCommands.ts`
- Modify: `src/engine/sysml/commands/presentationCommands.test.ts`
- Modify: `src/engine/sysml/commands/elementCommands.ts`
- Modify: `src/engine/sysml/commands/dispatcher.ts`
- Modify: `src/engine/sysml/commands/types.ts`
- Modify: `src/services/sysmlCommandGateway.ts`
- Modify: `src/components/modelExplorer/AppModelExplorer.tsx`
- Modify: `src/App.tsx`

**Interfaces:** Use `RemovePresentation`, `DeleteElement`, `analyzeMutation`, `applyCommand`, and the existing impact-confirmation fields.

- [ ] **Step 1: Write failing tests.** Display one Block on BDD-A and Requirements-A; remove only the Requirements presentation and assert the Block and BDD presentation remain. Add a confirmed model-deletion test asserting both presentations and touching relationships are removed.
- [ ] **Step 2: Run the focused tests and verify failure.**

```powershell
npx vitest run src/engine/sysml/commands/presentationCommands.test.ts src/services/sysmlCommandGateway.test.ts --reporter=verbose
```

- [ ] **Step 3: Implement atomic `RemovePresentation`.** Remove only the presentation, diagram index entry, presentation coordinates/style payload, and corresponding inverse patch.
- [ ] **Step 4: Align semantic deletion.** Use the shared impact policy: composite-owned descendants cascade; shared/reference usages remain unresolved; relationships touching deleted elements and every deleted presentation are removed; undo/redo restores the complete transaction.
- [ ] **Step 5: Wire distinct UI actions.** Diagram Delete invokes presentation removal. Model Explorer/specification `Delete from Model…` invokes impact analysis and confirmation. No diagram action may delete a semantic element implicitly.
- [ ] **Step 6: Run deletion coverage.**

```powershell
npx vitest run src/engine/sysml/commands/presentationCommands.test.ts src/engine/sysml/mutations.test.ts src/engine/sysml/policy.test.ts src/services/sysmlCommandGateway.test.ts --reporter=verbose
```

- [ ] **Step 7: Commit.**

```powershell
git add src/engine/sysml/commands/presentationCommands.ts src/engine/sysml/commands/presentationCommands.test.ts src/engine/sysml/commands/elementCommands.ts src/engine/sysml/commands/dispatcher.ts src/engine/sysml/commands/types.ts src/services/sysmlCommandGateway.ts src/components/modelExplorer/AppModelExplorer.tsx src/App.tsx
git commit -m "fix(sysml): separate presentation removal from model deletion"
```

### Task 4: Enforce hierarchy and relationship parity

**Files:**
- Modify: `src/engine/sysml/capabilities/ownershipPolicy.ts`
- Modify: `src/engine/sysml/capabilities/relationshipPolicy.ts`
- Modify: `src/engine/sysml/commands/elementCommands.ts`
- Modify: `src/features/sysml/diagramCreationController.ts`
- Modify: `src/features/modelExplorer/adapters/sysmlExplorerAdapter.ts`
- Modify: `src/components/modelExplorer/AppModelExplorer.tsx`
- Test: `src/engine/sysml/capabilities/ownershipPolicy.test.ts`
- Test: `src/engine/sysml/capabilities/relationshipPolicy.test.ts`
- Test: `src/features/sysml/diagramCreationController.test.ts`
- Test: `src/features/modelExplorer/adapters/sysmlExplorerAdapter.test.ts`

**Interfaces:** Use `OWNERSHIP_MATRIX`, `evaluateOwnership`, central relationship endpoint validation, and explorer capability projections.

- [ ] **Step 1: Write failing parity tests.** Assert Block → PartProperty is legal, Requirement → PartProperty is illegal, Block → Requirement `satisfy` is legal, reversed `satisfy` is illegal, and missing types return `TYPE_NOT_FOUND` without mutation.
- [ ] **Step 2: Run parity tests and verify failure.**

```powershell
npx vitest run src/engine/sysml/capabilities/ownershipPolicy.test.ts src/engine/sysml/capabilities/relationshipPolicy.test.ts src/features/sysml/diagramCreationController.test.ts src/features/modelExplorer/adapters/sysmlExplorerAdapter.test.ts --reporter=verbose
```

- [ ] **Step 3: Route tree creation, diagram creation, drag/drop, move, import, and relationship actions through the shared policies.** Keep unsupported types disabled with explicit authority and diagnostics.
- [ ] **Step 4: Run the parity tests and commit.**

```powershell
npx vitest run src/engine/sysml/capabilities/ownershipPolicy.test.ts src/engine/sysml/capabilities/relationshipPolicy.test.ts src/features/sysml/diagramCreationController.test.ts src/features/modelExplorer/adapters/sysmlExplorerAdapter.test.ts --reporter=verbose
git add src/engine/sysml/capabilities/ownershipPolicy.ts src/engine/sysml/capabilities/relationshipPolicy.ts src/engine/sysml/commands/elementCommands.ts src/features/sysml/diagramCreationController.ts src/features/modelExplorer/adapters/sysmlExplorerAdapter.ts src/components/modelExplorer/AppModelExplorer.tsx src/engine/sysml/capabilities/ownershipPolicy.test.ts src/engine/sysml/capabilities/relationshipPolicy.test.ts src/features/sysml/diagramCreationController.test.ts src/features/modelExplorer/adapters/sysmlExplorerAdapter.test.ts
git commit -m "test(sysml): enforce hierarchy and relationship policy parity"
```

### Task 5: Add the browser workflow and run release verification

**Files:**
- Create: `tests/e2e/sysml-requirements-existing-block.spec.ts`
- Modify: `task.md`
- Modify: `docs/SYSML_PROFILE_CONFORMANCE_MATRIX.md` when evidence paths or statuses change

**Interfaces:** Use Model Explorer drag payload, Requirements Diagram drop handling, canonical presentation commands, relationship wizard, and explicit presentation removal.

- [ ] **Step 1: Write the failing browser scenario.** Create or locate `Motor`, display it on Requirements-A, connect `Motor «satisfy» REQ-001`, switch to BDD, rename to `BLDCMotor`, remove only the Requirements presentation, reload, and assert one Block, one Requirement, one Satisfy relationship, and the remaining BDD presentation.
- [ ] **Step 2: Run it against an isolated server with `reuseExistingServer: false` and verify the current presentation-state failure.**
- [ ] **Step 3: Implement only the missing UI wiring using canonical commands; do not add direct diagram-array mutations.**
- [ ] **Step 4: Run the browser scenario and the existing explorer scenarios until green.**
- [ ] **Step 5: Run final verification.**

```powershell
git diff --check
npm run test:sysml:architecture
npm run test:sysml:release-gate
npm run test:sysml:release
npx tsc --noEmit --pretty false
```

- [ ] **Step 6: Update `task.md` with command, validator, persistence, projection, and automated-test evidence for presentation removal, model deletion, Requirements display, satisfy legality, and semantic identity.
- [ ] **Step 7: Commit final evidence.**

```powershell
git add tests/e2e/sysml-requirements-existing-block.spec.ts task.md docs/SYSML_PROFILE_CONFORMANCE_MATRIX.md
git commit -m "docs(sysml): record Cameo hierarchy and presentation evidence"
```

## Self-review checklist

- [x] The split-state root cause is covered by Tasks 1 and 2.
- [x] Canonical presentation authority is covered by Task 2.
- [x] Hierarchy and relationship parity is covered by Task 4.
- [x] Cameo-style deletion distinction is covered by Task 3.
- [x] Requirements display, satisfy, rename, persistence, and removal are covered by Task 5.
- [x] Release and TypeScript verification are covered by Task 5.
- [x] No task relies on an undefined command or type.

