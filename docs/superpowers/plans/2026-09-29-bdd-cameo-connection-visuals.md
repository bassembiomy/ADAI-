# BDD Cameo-Style Connection Visuals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Distinguish Block-to-Block and property-to-Block BDD relationships in the UI while preserving canonical SysML endpoint semantics and Cameo-style relationship validation.

**Architecture:** Keep the existing `SysmlRelationship` model and central connection policy. Add a pure endpoint-classification/presentation helper, use it in the BDD renderer for route markers and labels, and retain the existing property-row geometry for property endpoints. The connection pen will continue to create canonical relationships through the command gateway.

**Tech Stack:** React, TypeScript, SVG, Vitest, Playwright, SysML normalized repository.

## Global Constraints

- Block-to-Block relationships must pass the existing central SysML connection policy before mutation.
- Property-to-Block Association is valid only when the target matches the property's declared `typeId`.
- Persist the property ID as the relationship source endpoint.
- Rejected gestures must not mutate the repository or diagram presentation.
- Do not introduce a second relationship model.

---

### Task 1: Add pure BDD endpoint presentation classification

**Files:**
- Modify: `src/services/sysmlConnectionUi.ts`
- Test: `src/services/sysmlConnectionUi.test.ts`

**Interfaces:**
- Produce `classifyBddRelationshipPresentation(model, relationship)` returning `{ kind: 'blockAssociation' | 'propertyAssociation' | 'composition' | 'aggregation' | 'generalization' | 'dependency' | 'allocation'; propertyId?: string; ownerBlockId?: string }`.

- [x] **Step 1: Write the failing tests** for Block-to-Block association, property-to-Block association, and invalid property typing.
- [x] **Step 2: Run** `npx vitest run src/services/sysmlConnectionUi.test.ts`; confirm the new helper is missing/fails.
- [x] **Step 3: Implement** endpoint resolution using `resolveUiConnectionEndpoint`, relationship kind, and property `typeId`.
- [x] **Step 4: Run** the focused test and confirm it passes.
- [x] **Step 5: Commit** `test: classify BDD relationship endpoint visuals`.

### Task 2: Render Cameo-style distinction in BDD SVG

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/services/sysmlBddRelationshipGeometry.ts`
- Test: `src/services/sysmlBddRelationshipGeometry.test.ts`

**Interfaces:**
- Consume the classifier from Task 1.
- Add property-end marker/label rendering to `renderRelationships` while preserving existing notation markers.

- [x] **Step 1: Add failing geometry tests** proving property routes use the property row and expose a stable label position.
- [x] **Step 2: Run** `npx vitest run src/services/sysmlBddRelationshipGeometry.test.ts`; confirm failure.
- [x] **Step 3: Implement** the property-end marker and role/multiplicity label; keep Block-to-Block routes on Block borders.
- [x] **Step 4: Run** geometry and connection UI tests.
- [x] **Step 5: Commit** `feat: distinguish property-end BDD associations visually`.

### Task 3: Verify connection pen and semantic persistence end to end

**Files:**
- Modify: `tests/e2e/sysml-diagram-interaction-corrections.spec.ts`
- Test: existing browser regression in the same file.

**Interfaces:**
- Use the Connect button, property row, and typed target Block.
- Assert the repository relationship has `kind: 'association'`, `sourceId` equal to the property ID, and `targetId` equal to the Block ID.
- Assert the rendered relationship includes the property-end marker/label.

- [x] **Step 1: Add the browser assertions for Block-to-Block kind filtering and property-to-Block rendering.**
- [x] **Step 2: Run** `npx playwright test --project=chromium tests/e2e/sysml-diagram-interaction-corrections.spec.ts -g "BDD connection pen"`.
- [x] **Step 3: Fix only the identified event or rendering failure, preserving command-gateway semantics.**
- [x] **Step 4: Re-run the focused browser test and the 3-file Vitest suite.**
- [x] **Step 5: Commit** `test: cover Cameo-style BDD connection visuals`.

### Task 4: Final verification

**Files:**
- No source changes unless a verified failure requires them.

- [x] **Step 1:** Run `npx vitest run src/services/sysmlConnectionUi.test.ts src/services/sysmlBddRelationshipGeometry.test.ts src/services/sysmlPropertyCommands.test.ts` and record the result.
- [x] **Step 2:** Run the focused Playwright regression and record the result.
- [x] **Step 3:** Run `npx tsc --noEmit --pretty false`; report any unrelated pre-existing compile error explicitly.
- [x] **Step 4:** Review `git diff --check` and the final diff for unrelated changes.
