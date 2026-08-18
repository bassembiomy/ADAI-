# Unified DOE Analyzer Buttons & UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify all buttons and control elements across the DOE Analyzer Pro modal in `src/App.tsx` to match the dark ADIA design system.

**Architecture:** Modernize the header bar, model switcher, top action pills, deployment buttons, plot type controls, and experiment data table in `src/App.tsx`.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide React icons.

---

### Task 1: Refactor DOE Analyzer Header & Top Controls in `src/App.tsx`

**Files:**
- Modify: `src/App.tsx:2510-2555`

- [ ] **Step 1: Update DOE header markup**
Replace lines 2510-2555 in `src/App.tsx` with segmented model switcher (`RSM`, `GMDH`, `Taguchi`) and unified top actions capsule (`Save`, `Upload Data`, `Report`, `Close`).

---

### Task 2: Refactor Model Deployment, Equation Actions, and Plot Type Controls

**Files:**
- Modify: `src/App.tsx:2555-3160`

- [ ] **Step 1: Update Model Deployment, Equation export pills, Plot Type buttons, and 3D Canvas overlay controls**
Update lines ~2555-3160 with refined `h-7` buttons, amber active highlights, unified X-Bridges/V-Lab export pills, and floating glassmorphic canvas overlay.

---

### Task 3: Refactor ManualEntryTable Action Buttons

**Files:**
- Modify: `src/App.tsx:4740-4780`

- [ ] **Step 1: Update `ManualEntryTable` header and buttons**
Update lines ~4740-4780 in `src/App.tsx` with clean `+ Factor` and `+ Row` buttons.

---

### Task 4: Verification & Build

- [ ] **Step 1: Run TypeScript compiler check**
Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 2: Run Vitest persistence tests**
Run: `npx vitest run src/utils/adiaProjectPersistence.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit changes**
```bash
git add src/App.tsx docs/superpowers/plans/2026-08-18-unified-doe-analyzer-buttons.md docs/superpowers/specs/2026-08-18-unified-doe-analyzer-buttons-design.md
git commit -m "feat(ui): unify DOE analyzer buttons and controls"
```
