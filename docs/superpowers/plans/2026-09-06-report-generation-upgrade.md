# Adia Report Generation Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade every Adia report path so generated engineering evidence, diagrams, interactive viewing, PDF export, and DOCX export are driven by one validated, deterministic report package.

**Architecture:** Preserve the existing `ReportDocument` API for compatibility, then add a normalized `ReportPackage` envelope containing report metadata, sections, diagram assets, evidence, provenance, warnings, and status. Diagram renderers remain deterministic string/SVG producers; the viewer, PDF exporter, DOCX exporter, and verification-report adapters consume the package through explicit adapters. Interactive navigation uses a validated `DiagramManifest`, not DOM assumptions spread across generated markup.

**Tech Stack:** TypeScript, React 18, Vitest, Tailwind CSS, jsPDF, `docx`, existing SVG string renderers, existing state-machine verification evidence and report generators.

## Global Constraints

- Do not change the persisted Block, Part, State, Layer, Transition, or Connector models.
- Do not use browser-only measurement APIs in core report generation; output must remain deterministic in Node, Electron, and tests.
- Preserve existing `ReportDocument`, `renderBddDiagram`, `renderIbdDiagram`, `renderStateMachineDiagrams`, PDF, DOCX, and public reporting exports unless a compatibility adapter is added.
- Treat verification status and evidence as authoritative product data; presentation must not convert a failed or incomplete result into a passing report.
- Do not modify unrelated dirty-worktree files.
- Every changed behavior must have a focused Vitest test and the full reporting suite must remain green.

## Current Code Map

| Area | Files | Current responsibility |
|---|---|---|
| Report contract | `src/features/reporting/reportDocumentModel.ts` | Test/fault-isolation report sections and validation |
| Report generators | `src/features/reporting/generators/createStateMachineVerificationReport.ts`, `createMotorDriveTestReport.ts` | Build engineering reports |
| Diagram primitives | `src/features/reporting/reportDiagramModel.ts` | SVG sizing, escaping, bounds, figure wrappers |
| Diagram layout | `src/features/reporting/reportDiagramLayout.ts` | Layered/grid placement and edge routing |
| Diagram renderers | `src/features/reporting/reportDiagrams.ts` | BDD, requirements, IBD, state-machine, traceability, X-Bridges, HMI SVG |
| Hierarchy/navigation | `src/features/reporting/reportHierarchyEngine.ts` | Drill-down registry and generated navigation runtime |
| Viewer | `src/components/reporting/ReportViewerModal.tsx` | Preview, zoom, print, PDF, DOCX actions |
| Exports | `src/features/reporting/exportReportToPdf.ts`, `exportReportToDocx.ts` | Standalone export generation |
| Verification reports | `src/utils/stateMachine/smReports.ts`, `src/utils/stateMachine/smVerificationEvidence.ts` | Static/dynamic/code-generation evidence |

---

### Task 1: Define the normalized report package and status model

**Files:**
- Create: `src/features/reporting/reportPackageModel.ts`
- Test: `src/features/reporting/reportPackageModel.test.ts`
- Modify: `src/features/reporting/reportDocumentModel.ts`
- Test: `src/features/reporting/reportDocumentModel.test.ts`
- Modify: `src/features/reporting/index.ts`

**Interfaces:**
- Produce `ReportStatus = 'PASS' | 'FAIL' | 'INCOMPLETE' | 'BLOCKED' | 'DRAFT'`.
- Produce `ReportPackage`, `ReportMetadata`, `ReportEvidenceSummary`, `ReportProvenance`, `ReportWarning`, and `ReportSection` types.
- Produce `createReportPackage(document, options)` and `validateReportPackage(value)`.
- Keep `validateReportDocument` available and make package validation reject invalid embedded documents.

- [ ] **Step 1: Write tests for status preservation, package construction, warning severity, and invalid embedded documents.**
- [ ] **Step 2: Run `npx vitest run src/features/reporting/reportPackageModel.test.ts src/features/reporting/reportDocumentModel.test.ts --reporter=verbose`; expect the new tests to fail.**
- [ ] **Step 3: Implement the types and constructors with immutable copies of arrays, stable defaults, and no model-schema changes.**
- [ ] **Step 4: Export the new public types and run the focused tests; expect PASS.**
- [ ] **Step 5: Commit only the package-model files with `git add src/features/reporting/reportPackageModel.ts src/features/reporting/reportPackageModel.test.ts src/features/reporting/reportDocumentModel.ts src/features/reporting/reportDocumentModel.test.ts src/features/reporting/index.ts && git commit -m "feat(reporting): define normalized report package"`.**

### Task 2: Add a deterministic diagram manifest and validation boundary

**Files:**
- Create: `src/features/reporting/reportDiagramManifest.ts`
- Test: `src/features/reporting/reportDiagramManifest.test.ts`
- Modify: `src/features/reporting/reportHierarchyEngine.ts`
- Test: `src/features/reporting/reportHierarchyEngine.test.ts`
- Modify: `src/features/reporting/index.ts`

**Interfaces:**
- Produce `DiagramManifestEntry` with `id`, `parentId`, `type`, `title`, `caption`, `svgContent`, `elementCount`, `connectionCount`, `visibleInInteractive`, `visibleInPdf`, `visibleInDocx`, and `warnings`.
- Produce `DiagramManifest` with `rootId`, `entries`, `get(id)`, and `validate()`.
- Produce `buildDiagramManifest(model, registry)` and ensure IDs are unique across BDD, IBD, state-machine, requirements, traceability, X-Bridges, and HMI entries.

- [ ] **Step 1: Add failing tests for duplicate IDs, missing parents, missing SVG, unsupported layer references, and deterministic ordering.**
- [ ] **Step 2: Run the focused manifest and hierarchy tests; expect the new tests to fail.**
- [ ] **Step 3: Implement manifest construction from the existing hierarchy registry and renderer outputs; malformed references become structured warnings or validation failures according to severity.**
- [ ] **Step 4: Update hierarchy tests to assert that drillable layers and rendered entries have matching IDs.**
- [ ] **Step 5: Run `npx vitest run src/features/reporting/reportDiagramManifest.test.ts src/features/reporting/reportHierarchyEngine.test.ts --reporter=verbose`; expect PASS.**
- [ ] **Step 6: Commit with `git commit -m "feat(reporting): add validated diagram manifest"`.**

### Task 3: Harden layout and SVG primitives without browser dependencies

**Files:**
- Modify: `src/features/reporting/reportDiagramModel.ts`
- Test: `src/features/reporting/reportDiagramModel.test.ts`
- Modify: `src/features/reporting/reportDiagramLayout.ts`
- Test: `src/features/reporting/reportDiagramLayout.test.ts`

- [ ] **Step 1: Add failing tests for empty input, long labels, whitespace-only labels, duplicate node IDs, cyclic graphs, disconnected graphs, parallel edges, and deterministic output.**
- [ ] **Step 2: Run the focused layout/model tests and record the expected failures.**
- [ ] **Step 3: Replace fixed-width-only sizing with a deterministic text-width policy: normalized text, explicit maximum line width, predictable wrapping, minimum dimensions, and an optional injected measurement function for tests; never call `window.getComputedTextLength` from the core path.**
- [ ] **Step 4: Add `LayoutOptions` fields for compact mode, maximum width, and routing policy; keep existing defaults compatible.**
- [ ] **Step 5: Make layered layout handle duplicate/invalid edges, disconnected components, and cycles without infinite loops; keep grid layout safe for zero nodes.**
- [ ] **Step 6: Add bounded orthogonal routing for IBD and deterministic offsets for parallel/backward edges; do not claim global crossing minimization unless the algorithm and test prove it.**
- [ ] **Step 7: Run `npx vitest run src/features/reporting/reportDiagramModel.test.ts src/features/reporting/reportDiagramLayout.test.ts --reporter=verbose`; expect PASS.**
- [ ] **Step 8: Commit with `git commit -m "fix(reporting): make diagram layout deterministic and robust"`.**

### Task 4: Make all diagram renderers consume validated inputs and manifest metadata

**Files:**
- Modify: `src/features/reporting/reportDiagrams.ts`
- Test: `src/features/reporting/reportDiagrams.sysml.test.ts`
- Test: `src/features/reporting/reportDiagrams.ibd.test.ts`
- Test: `src/features/reporting/reportDiagrams.sm.test.ts`
- Test: `src/features/reporting/reportDiagrams.trace.test.ts`
- Test: `src/features/reporting/reportDiagrams.xhmi.test.ts`

- [ ] **Step 1: Add failing tests for missing node targets, duplicate IDs, missing layer states/transitions, empty requirement/traceability/X-Bridges/HMI inputs, chunked diagrams, and SVG escaping.**
- [ ] **Step 2: Run all diagram renderer tests and record failures.**
- [ ] **Step 3: Add a shared normalization/filtering boundary so invalid edges are omitted with warnings rather than crashing, while empty diagrams use formal empty figures.**
- [ ] **Step 4: Ensure every generated SVG has stable marker IDs scoped to the report/diagram, stable captions, valid viewBox bounds, and no unescaped user/model text.**
- [ ] **Step 5: Preserve interactive drill-down attributes but emit the manifest layer ID and title from one source.**
- [ ] **Step 6: Run all `src/features/reporting/reportDiagrams*.test.ts` tests; expect PASS.**
- [ ] **Step 7: Commit with `git commit -m "fix(reporting): harden all diagram renderers"`.**

### Task 5: Refactor hierarchy navigation around the manifest

**Files:**
- Modify: `src/features/reporting/reportHierarchyEngine.ts`
- Test: `src/features/reporting/reportHierarchyEngine.test.ts`
- Create: `src/features/reporting/reportDiagramNavigation.ts`
- Test: `src/features/reporting/reportDiagramNavigation.test.ts`

- [ ] **Step 1: Add failing tests for missing containers, missing layers, nested drill-down, back/jump behavior, duplicate history entries, keyboard navigation, per-layer zoom/pan state, and HTML/attribute escaping.**
- [ ] **Step 2: Extract navigation state transitions from the generated script into pure tested functions: `initNavigationState`, `drillDown`, `navBack`, `navJump`, `setLayerTransform`, and `resetLayerTransform`.**
- [ ] **Step 3: Generate the runtime from validated manifest IDs; every DOM lookup is nullable and every action is a no-op with a structured warning when its target is absent.**
- [ ] **Step 4: Store transforms by `diagId` and `layerId`, preserve them when switching layers, and reset only the requested layer.**
- [ ] **Step 5: Render accessible breadcrumbs with buttons, `aria-current`, keyboard focus, and safe text content; add Alt+Left/Alt+Right only when focus is not inside an editable control.**
- [ ] **Step 6: Add an accessible layer index/list for all manifest entries, including unavailable or empty entries with reason text.**
- [ ] **Step 7: Run the focused navigation and hierarchy tests; expect PASS.**
- [ ] **Step 8: Commit with `git commit -m "feat(reporting): make diagram navigation manifest-driven"`.**

### Task 6: Assemble complete report packages from every report generator

**Files:**
- Modify: `src/features/reporting/generators/createStateMachineVerificationReport.ts`
- Modify: `src/features/reporting/generators/createMotorDriveTestReport.ts`
- Modify: `src/features/reporting/generators/reportGenerators.test.ts`
- Modify: `src/utils/stateMachine/smReports.ts`
- Modify: `src/utils/stateMachine/smReports.test.ts`
- Modify: `src/features/reporting/reportPackageModel.ts`

- [ ] **Step 1: Add failing tests proving static analysis, dynamic execution, differential traces, HIL evidence, target compilation, and unsupported capabilities retain separate evidence records and statuses.**
- [ ] **Step 2: Add failing tests proving failed, incomplete, blocked, and draft outcomes remain visible in generated reports and cannot be normalized to PASS.**
- [ ] **Step 3: Implement generator adapters that create `ReportPackage` instances while preserving the existing `ReportDocument` output for callers that have not migrated.**
- [ ] **Step 4: Include model fingerprint/version, generator version, execution mode, timestamps, evidence artifact names, and source traceability where available.**
- [ ] **Step 5: Ensure report generation is deterministic for identical input except for explicitly marked runtime timestamps.**
- [ ] **Step 6: Run reporting and state-machine report suites; expect PASS.**
- [ ] **Step 7: Commit with `git commit -m "feat(reporting): attach verification evidence to report packages"`.**

### Task 7: Upgrade the interactive report viewer and accessibility behavior

**Files:**
- Modify: `src/components/reporting/ReportViewerModal.tsx`
- Modify: `src/components/reporting/ReportViewerModal.test.tsx`
- Create: `src/components/reporting/ReportLayerPanel.tsx`
- Create: `src/components/reporting/ReportLayerPanel.test.tsx`
- Modify: `src/index.css` or the existing reporting style location after confirming the current theme convention

- [ ] **Step 1: Add failing React tests for modal semantics, close button labeling, zoom limits, reset behavior, export busy/error states, print action, responsive layer panel, active layer announcement, and keyboard operation.**
- [ ] **Step 2: Implement `ReportLayerPanel` as a controlled component consuming `DiagramManifest`, with stable keys, active selection, empty/error states, and no thumbnail rendering that mutates the source SVG.**
- [ ] **Step 3: Replace hard-coded color literals that duplicate the Adia theme with existing Tailwind/theme tokens where available; retain print-safe white report pages.**
- [ ] **Step 4: Add dialog roles/labels, focus handling, escape-to-close, `aria-live` export status, labeled zoom controls, and disabled states that explain failures.**
- [ ] **Step 5: Run component tests and `npx tsc --noEmit`; expect PASS.**
- [ ] **Step 6: Commit with `git commit -m "feat(reporting): improve report viewer and layer accessibility"`.**

### Task 8: Make PDF and DOCX exports consume the same package and diagram policy

**Files:**
- Modify: `src/features/reporting/exportReportToPdf.ts`
- Modify: `src/features/reporting/exportReportToPdf.test.ts`
- Modify: `src/features/reporting/exportReportToDocx.ts`
- Modify: `src/features/reporting/exportReportToDocx.test.ts`
- Create: `src/features/reporting/reportExportPolicy.ts`
- Test: `src/features/reporting/reportExportPolicy.test.ts`

- [ ] **Step 1: Add failing tests for section order, page breaks, long tables, empty sections, status banners, warnings, provenance, diagram inclusion/exclusion, and stable filenames.**
- [ ] **Step 2: Implement an export policy that selects only manifest entries marked for the target format and records omitted diagrams with reasons.**
- [ ] **Step 3: Update PDF generation to include report status, evidence summary, warnings, provenance, and SVG/diagram captions using the existing jsPDF path.**
- [ ] **Step 4: Update DOCX generation to include the same semantic sections and status/evidence information using the existing `docx` dependency.**
- [ ] **Step 5: Ensure export failures return actionable errors to the viewer and do not leave `isExporting` stuck.**
- [ ] **Step 6: Run both export suites and inspect generated buffers for non-zero size and expected section markers; expect PASS.**
- [ ] **Step 7: Commit with `git commit -m "feat(reporting): align PDF and DOCX exports with report packages"`.**

### Task 9: Add end-to-end reporting verification and regression fixtures

**Files:**
- Create: `src/features/reporting/reportPipeline.integration.test.ts`
- Create: `src/features/reporting/fixtures/reportPipelineFixtures.ts`
- Modify: `package.json` only if a focused `test:reporting` script is needed
- Create: `docs/superpowers/reviews/2026-09-06-report-generation-upgrade-baseline.md`

- [ ] **Step 1: Create fixtures for a minimal report, a full SysML/IBD/state-machine report, a failed verification bundle, a blocked report, and a malformed graph.**
- [ ] **Step 2: Add integration tests covering generator → package validation → diagram manifest → viewer HTML → PDF buffer → DOCX buffer.**
- [ ] **Step 3: Assert no missing layer IDs, duplicate SVG IDs, unescaped model text, invalid status conversion, or uncaught renderer exceptions.**
- [ ] **Step 4: Add a test that exercises every exported renderer listed by `src/features/reporting/index.ts`.**
- [ ] **Step 5: Run the complete reporting suite with `npx vitest run src/features/reporting src/components/reporting --reporter=verbose`.**
- [ ] **Step 6: Run `npx tsc --noEmit` and the relevant state-machine report tests.**
- [ ] **Step 7: Document baseline results, known limitations, and migration compatibility in the review document.**
- [ ] **Step 8: Commit with `git commit -m "test(reporting): verify complete report pipeline"`.**

### Task 10: Release gate and migration cleanup

**Files:**
- Modify: `src/features/reporting/index.ts`
- Modify: all direct report consumers identified by `rg -n "createStateMachineVerificationReport|createMotorDriveTestReport|exportReportToPdf|exportReportToDocx|renderInteractiveDiagramHierarchy" src`
- Modify: relevant reporting documentation under `docs/`

- [ ] **Step 1: Migrate direct consumers to package-aware APIs where the integration tests show the compatibility adapter is safe.**
- [ ] **Step 2: Keep legacy document-only entry points as thin adapters and mark them internally as compatibility paths.**
- [ ] **Step 3: Remove only dead navigation assumptions and duplicate formatting code proven unused by the full suite.**
- [ ] **Step 4: Run `npx vitest run src/features/reporting src/components/reporting --reporter=dot`, `npx tsc --noEmit`, and the existing state-machine verification test commands required by the current branch.**
- [ ] **Step 5: Review the final diff for unrelated files and verify dirty-worktree changes were not overwritten.**
- [ ] **Step 6: Record release evidence: test commands, generated artifact checks, accessibility checks, and known limitations.**

## Acceptance Criteria

- Every report generator can produce a validated package without changing the persisted engineering model.
- Viewer, PDF, and DOCX consume the same report content, status, evidence summary, provenance, warnings, and diagram selection policy.
- BDD, requirements, IBD, state-machine, traceability, X-Bridges, and HMI diagrams either render valid deterministic SVG or produce a formal no-data/warning result.
- Invalid edges, missing layers, duplicate IDs, empty graphs, cyclic graphs, and disconnected graphs do not cause uncaught exceptions.
- Interactive layer navigation has stable IDs, safe DOM guards, keyboard-accessible breadcrumbs, per-layer transform state, and an accessible layer panel.
- A failed, blocked, incomplete, or draft verification result cannot be represented as a passing report by any export path.
- Focused and full reporting tests pass, TypeScript type-checks, and existing state-machine verification gates remain green.

## Explicitly Deferred

- Replacing SVG string generation with a canvas/WebGL renderer.
- Introducing a new persisted report schema or changing Block/Part/State/Layer models.
- Adding Lighthouse or Playwright as a new dependency without an existing project test harness.
- Global graph-layout optimization beyond deterministic local crossing reduction.
- User analytics or satisfaction metrics; these require a product instrumentation decision and are not release gates for this upgrade.

