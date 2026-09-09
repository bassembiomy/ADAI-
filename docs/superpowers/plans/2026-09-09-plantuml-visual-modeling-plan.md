# PlantUML Visual Modeling Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a professional offline visual PlantUML workspace in ADIA where users create sequence and use-case diagrams with drag-and-drop blocks, properties, validation, rendering, persistence, and export.

**Architecture:** Add a framework-agnostic visual diagram model and diagram-type adapters, then connect them to a React canvas workspace modeled after the existing BDD editor. The visual model is authoritative; adapters generate PlantUML source, and an Electron-local renderer converts validated source to SVG for preview and export.

**Tech Stack:** React 18, TypeScript, Vite, Electron, existing ADIA canvas/UI components, Vitest, existing project persistence and export services, bundled offline PlantUML renderer.

## Global Constraints

- Rendering must work fully offline with no PlantUML server or remote URL.
- Users must not need to write PlantUML source to create diagrams.
- The UI must follow ADIA's existing dark surfaces, orange accent, typography, toolbar, palette, canvas, and properties-panel conventions.
- The visual model is the authoritative persisted representation; generated PlantUML is an interoperability artifact.
- Invalid models remain editable and show actionable validation feedback.
- Production code must be introduced through failing tests first.
- Existing unrelated working-tree changes must not be modified or committed.

## File map

- Create `src/features/plantuml/model/visualDiagramModel.ts`: versioned shared model types and constructors.
- Create `src/features/plantuml/model/visualDiagramModel.test.ts`: model and migration tests.
- Create `src/features/plantuml/model/diagramValidation.ts`: shared validation result types and common checks.
- Create `src/features/plantuml/model/diagramValidation.test.ts`: validation tests.
- Create `src/features/plantuml/adapters/useCaseAdapter.ts`: use-case validation and PlantUML generation.
- Create `src/features/plantuml/adapters/useCaseAdapter.test.ts`: use-case behavior tests.
- Create `src/features/plantuml/adapters/sequenceAdapter.ts`: sequence validation and PlantUML generation.
- Create `src/features/plantuml/adapters/sequenceAdapter.test.ts`: sequence behavior tests.
- Create `src/features/plantuml/persistence/plantUmlProjectState.ts`: project payload integration and migration boundary.
- Create `src/features/plantuml/persistence/plantUmlProjectState.test.ts`: persistence tests.
- Create `src/features/plantuml/rendering/offlinePlantUmlRenderer.ts`: renderer interface and Electron-local implementation boundary.
- Create `src/features/plantuml/rendering/offlinePlantUmlRenderer.test.ts`: renderer success/failure contract tests.
- Create `src/components/plantuml/PlantUmlWorkspace.tsx`: workspace composition and state orchestration.
- Create `src/components/plantuml/PlantUmlPalette.tsx`: diagram-specific drag/drop palette.
- Create `src/components/plantuml/PlantUmlCanvas.tsx`: canvas rendering and interactions.
- Create `src/components/plantuml/PlantUmlPropertiesPanel.tsx`: selected-element and relationship editing.
- Create matching component tests beside each component.
- Modify `src/App.tsx`: register the new diagram mode and workspace entry point.
- Modify the existing project persistence types/service identified during implementation: include versioned PlantUML visual diagrams without changing unrelated payloads.
- Modify existing export integration identified during implementation: add SVG, PNG, PDF, and source export commands.

### Task 1: Shared visual model and validation

**Files:**
- Create: `src/features/plantuml/model/visualDiagramModel.ts`
- Create: `src/features/plantuml/model/visualDiagramModel.test.ts`
- Create: `src/features/plantuml/model/diagramValidation.ts`
- Create: `src/features/plantuml/model/diagramValidation.test.ts`

**Interfaces:**
- Produce `VisualDiagramType = 'sequence' | 'use-case'`.
- Produce `VisualDiagramModel`, `VisualDiagramElement`, `VisualDiagramRelationship`, `createVisualDiagram(type)`, `migrateVisualDiagram(raw)`, and `validateVisualDiagram(model)`.

- [ ] **Step 1: Write failing tests for model construction and migration.** Test stable IDs, version `1`, empty element/relationship collections, canvas metadata, rejection of unknown diagram types, and migration of a legacy payload missing optional canvas fields.
- [ ] **Step 2: Run `npx vitest run src/features/plantuml/model/visualDiagramModel.test.ts`; verify it fails because the model module is absent.**
- [ ] **Step 3: Implement the minimal discriminated-union model and migration function.** Keep common fields (`id`, `label`, `position`, `size`, `style`) separate from type-specific fields.
- [ ] **Step 4: Write failing validation tests.** Cover missing labels, dangling relationship endpoints, duplicate IDs, and a valid empty diagram.
- [ ] **Step 5: Run `npx vitest run src/features/plantuml/model/diagramValidation.test.ts`; verify expected failures.**
- [ ] **Step 6: Implement common validation with structured issues containing `severity`, `code`, `message`, and optional `elementId`/`relationshipId`.**
- [ ] **Step 7: Run both model test files and commit `feat: add PlantUML visual diagram model`.**

### Task 2: Project persistence integration

**Files:**
- Create: `src/features/plantuml/persistence/plantUmlProjectState.ts`
- Create: `src/features/plantuml/persistence/plantUmlProjectState.test.ts`
- Modify: existing ADIA project persistence type/service found by locating the canonical project payload interface and hydration path.

**Interfaces:**
- Produce `PlantUmlProjectState`, `readPlantUmlDiagrams(project)`, and `writePlantUmlDiagrams(project, diagrams)`.

- [ ] **Step 1: Write failing tests for round-trip persistence.** Assert that two diagrams survive write/read with all elements, relationships, canvas metadata, and unknown safe fields preserved.
- [ ] **Step 2: Run the focused persistence test and verify failure.**
- [ ] **Step 3: Add the versioned optional PlantUML collection to the canonical project payload without changing existing diagram state behavior.**
- [ ] **Step 4: Implement read/write migration handling for absent, malformed, and legacy PlantUML state.** Malformed state should return an empty collection plus a structured warning rather than crash project loading.
- [ ] **Step 5: Run focused model and persistence tests; commit `feat: persist PlantUML visual diagrams`.**

### Task 3: Use-case adapter

**Files:**
- Create: `src/features/plantuml/adapters/useCaseAdapter.ts`
- Create: `src/features/plantuml/adapters/useCaseAdapter.test.ts`

**Interfaces:**
- Produce `validateUseCaseDiagram(model)`, `generateUseCasePlantUml(model)`, and `getUseCasePaletteItems()`.

- [ ] **Step 1: Write failing tests for actor/use-case/boundary creation and association, include, extend, and generalization generation.** Assert stable aliases are generated safely from IDs and labels are escaped.
- [ ] **Step 2: Run the focused adapter tests and verify failure.**
- [ ] **Step 3: Implement typed use-case elements and relationship checks.** Require valid relationship endpoints, enforce boundary membership references, and emit structured issues for unsupported pairs.
- [ ] **Step 4: Implement deterministic PlantUML generation with stable element ordering and no network/API dependency.**
- [ ] **Step 5: Run adapter and shared validation tests; commit `feat: add use-case PlantUML adapter`.**

### Task 4: Sequence adapter

**Files:**
- Create: `src/features/plantuml/adapters/sequenceAdapter.ts`
- Create: `src/features/plantuml/adapters/sequenceAdapter.test.ts`

**Interfaces:**
- Produce `validateSequenceDiagram(model)`, `generateSequencePlantUml(model)`, and `getSequencePaletteItems()`.

- [ ] **Step 1: Write failing tests for lifelines, synchronous/asynchronous calls, returns, self-calls, notes, and `alt`/`opt`/`loop`/`par` fragments.** Assert participant order is deterministic and fragment nesting errors are reported.
- [ ] **Step 2: Run the focused adapter tests and verify failure.**
- [ ] **Step 3: Implement sequence-specific element and relationship validation.** Check message endpoints, fragment scope, and ordering references while allowing the model to remain editable.
- [ ] **Step 4: Implement deterministic PlantUML generation with escaped labels and explicit participant declarations.**
- [ ] **Step 5: Run sequence, use-case, and shared validation tests; commit `feat: add sequence PlantUML adapter`.**

### Task 5: Offline renderer boundary

**Files:**
- Create: `src/features/plantuml/rendering/offlinePlantUmlRenderer.ts`
- Create: `src/features/plantuml/rendering/offlinePlantUmlRenderer.test.ts`
- Modify: Electron preload/main bridge files identified from the existing IPC conventions.
- Modify: `package.json` and lockfile only if a vetted bundled renderer dependency is required.

**Interfaces:**
- Produce `OfflinePlantUmlRenderer.render(source, options): Promise<RenderResult>` where success returns SVG and failure returns a structured render error.

- [ ] **Step 1: Write failing contract tests for successful SVG rendering, syntax failure mapping, and the absence of network calls.**
- [ ] **Step 2: Run the focused renderer tests and verify failure.**
- [ ] **Step 3: Select the offline implementation compatible with the Electron packaging target and existing dependency policy.** Prefer a bundled local renderer; do not fall back to a PlantUML web endpoint.
- [ ] **Step 4: Implement the renderer bridge and structured error mapping.** Keep the UI-facing interface independent of the renderer library.
- [ ] **Step 5: Run renderer, adapter, and build/type checks; commit `feat: add offline PlantUML renderer`.**

### Task 6: Visual workspace components

**Files:**
- Create: `src/components/plantuml/PlantUmlWorkspace.tsx`
- Create: `src/components/plantuml/PlantUmlPalette.tsx`
- Create: `src/components/plantuml/PlantUmlCanvas.tsx`
- Create: `src/components/plantuml/PlantUmlPropertiesPanel.tsx`
- Create: component tests for each file.

**Interfaces:**
- `PlantUmlWorkspace` receives the active diagram, `onChange`, `onSave`, and `onExport` callbacks and composes palette, canvas, properties, preview/status, and toolbar.
- `PlantUmlCanvas` emits typed element/relationship edit actions; it does not generate PlantUML itself.

- [ ] **Step 1: Write failing component tests for palette item rendering, drag/drop creation, selection, property editing, connection creation, diagram-type switching, and render-error display.**
- [ ] **Step 2: Run focused component tests and verify failure.**
- [ ] **Step 3: Implement the three-pane workspace using existing ADIA common controls and canvas patterns.** Add dark theme classes, orange accent actions, keyboard focus states, and empty/error states.
- [ ] **Step 4: Implement model-driven canvas interactions: snapping, multi-select, move/resize, duplicate/delete, undo/redo transactions, relationship creation, and fragment grouping.
- [ ] **Step 5: Connect the selected-element properties panel to typed model updates and adapter validation.**
- [ ] **Step 6: Run focused component tests and commit `feat: add PlantUML visual workspace`.**

### Task 7: App integration, exports, and end-to-end flow

**Files:**
- Modify: `src/App.tsx`
- Modify: existing project save/load and export integration files.
- Create: `src/features/plantuml/plantUmlWorkspace.integration.test.tsx`

- [ ] **Step 1: Write failing integration tests for opening the PlantUML mode, creating one use-case and one sequence diagram, saving/reloading, rendering locally, and exporting source/SVG.**
- [ ] **Step 2: Run the integration test and verify failure because the mode is not registered.**
- [ ] **Step 3: Register the new diagram mode in the app navigation and route project state through the workspace.**
- [ ] **Step 4: Add toolbar actions for New, diagram type, render, zoom, reset template, and export SVG/PNG/PDF/source using existing export conventions.**
- [ ] **Step 5: Add professional starter templates for a login sequence and a system use-case diagram.**
- [ ] **Step 6: Run integration tests, the full relevant Vitest suite, `npx tsc --noEmit`, and `npm run build`; fix failures without changing unrelated working-tree files.**
- [ ] **Step 7: Commit `feat: integrate PlantUML visual modeling workspace`.**

## Verification checklist

- [ ] `npx vitest run src/features/plantuml src/components/plantuml`
- [ ] `npx tsc --noEmit`
- [ ] `npm run build`
- [ ] Offline smoke test with network disabled: create, edit, render, save, reload, and export both diagram types.
- [ ] Confirm existing BDD, IBD, OPM, State Machine, V-Lab, and reporting tests remain green.
- [ ] Review the final diff and confirm unrelated pre-existing working-tree files remain untouched.
