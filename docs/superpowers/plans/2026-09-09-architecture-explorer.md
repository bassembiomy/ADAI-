# Architecture Explorer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only interactive Software Architecture Explorer to the existing Help & Documentation modal.

**Architecture:** Keep architecture content in a focused typed data/component module. Add one HelpData topic and extend HelpModal with a dedicated explorer rendering branch, preserving the existing editor state and Help navigation.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS, lucide-react, Vitest.

## Global Constraints

- The page is read-only and must not mutate project, simulation, persistence, HIL, or code-generation state.
- Use the existing ADIA dark visual language with orange interaction, cyan data flow, green verified safeguards, and amber policy-gated areas.
- Architecture layers, cards, data types, and protections must use one typed static source of truth.
- The Help modal must preserve normal topic navigation and return to the same editor state when closed.

---

### Task 1: Create the typed architecture explorer model and component

**Files:**
- Create: `src/components/help/SoftwareArchitectureExplorer.tsx`
- Test: `src/components/help/SoftwareArchitectureExplorer.test.tsx`

**Interfaces:**
- Produces `SoftwareArchitectureExplorer` with props `{ onClose?: () => void }`.
- Exports typed static architecture/data/protection definitions for the component test and Help integration.

- [ ] **Step 1: Write failing tests** for layer labels, data-type legend, selected-card inspector content, search filtering, reset, and protection-overlay toggle.
- [ ] **Step 2: Run `npx vitest run src/components/help/SoftwareArchitectureExplorer.test.tsx`; verify the tests fail because the component does not exist.**
- [ ] **Step 3: Implement the typed data model and responsive component with clickable cards, inspector, search, reset, legend, and protection overlay.**
- [ ] **Step 4: Run the focused Vitest test and verify it passes.**
- [ ] **Step 5: Commit with `git add src/components/help/SoftwareArchitectureExplorer.tsx src/components/help/SoftwareArchitectureExplorer.test.tsx && git commit -m "feat: add architecture explorer component"`.**

### Task 2: Add the explorer to Help navigation

**Files:**
- Modify: `src/HelpData.ts`
- Modify: `src/App.tsx:4908-5260` (HelpModal)
- Test: `src/components/help/HelpArchitectureTopic.test.tsx`

**Interfaces:**
- Consumes `SoftwareArchitectureExplorer` from Task 1.
- Adds HelpData key `software-architecture` with title `Software Architecture Explorer`, category `System`, summary, and sections.

- [ ] **Step 1: Write failing tests** that assert the new HelpData topic exists and HelpModal renders an open-explorer action/branch for `initialTopic="software-architecture"`.
- [ ] **Step 2: Run `npx vitest run src/components/help/HelpArchitectureTopic.test.tsx`; verify failure.**
- [ ] **Step 3: Add the Help topic and wire HelpModal so selecting the topic displays the explorer while the Help close and topic navigation controls remain available.**
- [ ] **Step 4: Run the focused tests and verify they pass.**
- [ ] **Step 5: Commit with `git add src/HelpData.ts src/App.tsx src/components/help/HelpArchitectureTopic.test.tsx && git commit -m "feat: expose architecture explorer in help"`.**

### Task 3: Verify the integrated page

**Files:**
- Modify: only files from Tasks 1–2 if fixes are needed.

- [ ] **Step 1: Run `npx tsc --noEmit`; verify TypeScript passes.**
- [ ] **Step 2: Run `npx vitest run src/components/help`; verify the explorer and Help integration tests pass.**
- [ ] **Step 3: Run `npm run build`; verify the Vite production build completes.**
- [ ] **Step 4: Manually verify Help → Software Architecture Explorer, card selection, search, overlay, reset, topic switching, close behavior, and narrow viewport stacking.**
- [ ] **Step 5: Commit any verification fixes with `git add src && git commit -m "fix: verify architecture explorer integration"`.**

## Spec coverage self-review

- Architecture layers and canonical flow: Task 1.
- Data-type taxonomy and usage timing: Task 1.
- Freeze/crash and unsafe-operation protections: Task 1 overlay and inspector.
- Help entry and navigation: Task 2.
- Read-only behavior and preserved editor state: Task 2.
- TypeScript, tests, build, and responsive manual verification: Task 3.
