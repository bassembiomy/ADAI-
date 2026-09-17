# Requirements Diagram BDD Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the live and exported SysML requirements diagrams show connected BDD test cases and blocks with Cameo-like traceability scoping.

**Architecture:** Add a small pure SysML scope module that identifies requirement elements, connected non-requirement endpoints, and visible relationships. Reuse it in the React requirements view and the reporting renderer so both surfaces share the same rules.

**Tech Stack:** TypeScript, React, Vitest, Playwright, existing `BlockData` and `RelationshipData` model types.

## Global Constraints

- Only requirement-connected BDD elements are visible in the requirements diagram.
- Preserve active-layer filtering, treating missing legacy `layerId` as `root`.
- Supported traceability/structure relationships: `satisfy`, `verify`, `refine`, `trace`, `derive`, `deriveReqt`, `copy`, `requirementContainment`.
- Do not alter unrelated BDD diagram behavior.

## File Map

- Create `src/engine/sysml/requirementsDiagramScope.ts`: pure shared scope calculation.
- Create `src/engine/sysml/requirementsDiagramScope.test.ts`: unit tests for SysML/Cameo-style inclusion rules.
- Modify `src/App.tsx`: use the shared scope for requirements-mode state, nodes, and edges.
- Modify `src/features/reporting/reportDiagrams.ts`: use the shared scope for exported requirements diagrams.
- Modify `src/features/reporting/reportDiagrams.sysml.test.ts`: regression coverage for connected `testCase` and `block` output.

### Task 1: Add failing scope tests

**Files:** Create `src/engine/sysml/requirementsDiagramScope.test.ts`.

- [ ] Write tests asserting a requirement plus a `testCase` linked by `verify` and a `block` linked by `satisfy` are included, while unrelated BDD elements are excluded.
- [ ] Assert BDD-only relationships are excluded and cross-layer endpoints are excluded when a layer is supplied.
- [ ] Run `npm test -- src/engine/sysml/requirementsDiagramScope.test.ts`; expect failure because the scope module does not exist.

### Task 2: Implement the pure scope module

**Files:** Create `src/engine/sysml/requirementsDiagramScope.ts`.

- [ ] Export `REQUIREMENT_DIAGRAM_RELATIONSHIP_TYPES` as a readonly set/array.
- [ ] Export `getRequirementsDiagramScope(blocks, relationships, currentLayerId?)` returning `{ visibleBlockIds: Set<string>; visibleRelationshipIds: Set<string> }`.
- [ ] Include requirements in the selected layer, then include non-requirement endpoints only if they are joined to an included requirement by a supported relationship and share the selected layer.
- [ ] Include an edge only when its type is supported and both endpoints are visible.
- [ ] Run the focused tests and require all to pass.

### Task 3: Integrate the live requirements diagram

**Files:** Modify `src/App.tsx` around `getActiveStateData`, requirements node rendering, and relationship rendering.

- [ ] Import `getRequirementsDiagramScope`.
- [ ] Replace the inline endpoint filter in the requirements state snapshot with the helper’s visible IDs.
- [ ] In requirements node rendering, return `null` for blocks outside the helper scope while retaining existing layer and stereotype rules.
- [ ] In requirements edge rendering, return `null` unless the helper marks the relationship visible; retain existing notation, labels, and selection behavior.
- [ ] Run the existing requirements/BDD tests and confirm unrelated BDD elements remain hidden.

### Task 4: Integrate exported requirements diagrams

**Files:** Modify `src/features/reporting/reportDiagrams.ts`; modify `src/features/reporting/reportDiagrams.sysml.test.ts`.

- [ ] Add a failing regression test that checks exported SVG contains the connected test case/block labels and edge IDs but not unrelated BDD labels.
- [ ] Apply the shared scope before layout/rendering so exported nodes and edges match the live diagram.
- [ ] Run the reporting test file and confirm the new regression passes without breaking containment notation tests.

### Task 5: Verify end to end

- [ ] Run `npm test -- src/engine/sysml/requirementsDiagramScope.test.ts src/features/reporting/reportDiagrams.sysml.test.ts`.
- [ ] Run `npm run typecheck` (or the repository’s exact typecheck script from `package.json`).
- [ ] Run `npx playwright test tests/e2e/sysml-bdd-ibd-requirements-rtm.spec.ts`.
- [ ] Inspect `git diff` and confirm only the scoped implementation/tests changed; preserve unrelated worktree changes.
- [ ] Commit the implementation with `feat: show connected BDD elements in requirements diagrams`.
