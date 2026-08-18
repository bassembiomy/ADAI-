# Unified UI Toolbar & Header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modernize and unify the ADIA top header toolbar to provide a cohesive dark UI, single-line text layout with no wrapping, and organized semantic group capsules.

**Architecture:** Refactor the top header `<header>` element in `src/App.tsx` into clean, semantic group capsules with standardized button heights (`h-7`), `whitespace-nowrap`, 13-14px icons, and coordinated zinc neutral tokens with purposeful accent colors.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide React icons, Radix UI / shadcn components.

## Global Constraints
- Must maintain 100% existing functionality (all `onClick` handlers, state toggles, modal open triggers, shortcuts, and inputs).
- Must eliminate awkward multi-line text wrapping across all buttons.
- Must ensure responsive scrolling (`overflow-x-auto no-scrollbar`) without layout deformation.

---

### Task 1: Refactor and Unify the Top Header Toolbar in `App.tsx`

**Files:**
- Modify: `src/App.tsx:15170-15490`

**Interfaces:**
- Consumes: `currentProjectName`, `setCurrentProjectName`, `VERSION`, `setShowWorkspaceFileDialog`, `diagramMode`, `setDiagramMode`, `tickMs`, `setTickMs`, `isRunning`, `startSimulation`, `pauseSimulation`, `stepSimulation`, `resetSimulation`, `validateModel`, `addError`, `validateWithAI`, `isAiValidating`, `safetyMode`, `setSafetyMode`, `generateCode`, `isGenerating`, `saveUnifiedProject`, `handleOpenProjectDialog`, `handleExportProject`, `setShowReportDialog`, `toggleWindow`, `setShowHelpModal`, `setShowFactoryIOGateway`, `factoryIOEnabled`, `setShow3DXGateway`, `simulationTime`, `currentStates`, `variables`.
- Produces: Polished, unified top header toolbar UI.

- [ ] **Step 1: Replace header toolbar markup in `src/App.tsx`**
Update `src/App.tsx` lines ~15170 to ~15490 with the unified, semantic group container architecture.

- [ ] **Step 2: Verify TypeScript compilation and build**
Run: `npm run build` or `npx tsc --noEmit`
Expected: PASS with 0 errors.

- [ ] **Step 3: Verify visually in the browser**
Check the running Vite dev server (`http://localhost:5173`) using the browser subagent or manual verification to ensure:
- No text wrapping on any toolbar button
- Crisp icons and aligned labels
- Functional click triggers for each button
- Clean unified dark aesthetic

- [ ] **Step 4: Commit changes**
```bash
git add src/App.tsx docs/superpowers/plans/2026-08-18-unified-ui-toolbar.md docs/superpowers/specs/2026-08-18-unified-ui-toolbar-design.md
git commit -m "feat(ui): unify and modernize top toolbar header"
```
