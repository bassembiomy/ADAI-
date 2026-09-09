# OPM Executable UI Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate executable OPM properties (Link guards/triggers/transitions, State entry/exit behaviors & timeouts, Object typed variables/attributes, and Process guards/actions) directly into the OPM Right Panel Inspector with ADAI glassmorphic visual styling.

**Architecture:** Extend `OpmRightPanelContent.tsx` to host dedicated, context-aware executable inspector sections for selected links, states, objects, and processes. Data binds to `element.data.execution` through `EntropyWorkspace.tsx`'s state management, reusing tested building blocks from `OpmExecutionPropertiesPanel.tsx` styled to match the ADAI theme.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide Icons, Vitest for testing.

## Global Constraints
- Strictly follow ADAI glassmorphic visual styling: `bg-[#16161a]/95 backdrop-blur-md border border-white/10 rounded-xl`, inputs `bg-[#0e0e11] border border-white/10 text-white font-mono`, labels `text-[10px] text-gray-400 uppercase font-bold tracking-wider`.
- Use distinct accent color coding: Sky Blue (`#38bdf8`) for Links/Processes, Amber/Orange (`#f97316`) for States/Transitions, Emerald Green (`#10b981`) for Objects/Variables.
- Data edits must preserve canonical `data-opm-path` attributes for source-linked diagnostics.
- Ensure all existing tests pass (`npm run test:run` / vitest).

---

### Task 1: Type Definitions & Contract in `OpmRightPanelContent`

**Files:**
- Modify: `src/components/entropy/OpmRightPanelContent.tsx:1-50`
- Test: `src/components/entropy/__tests__/opmRightPanelContent.test.tsx`

**Interfaces:**
- Consumes: `OpmExecutionConfig`, `OpmDiagnostic`, `OpmAttribute`, `OpmLinkExecution`, `OpmStateExecution`, `OpmObjectExecution`, `OpmProcessExecution` from `../../engine/opm/executableTypes`.
- Produces: Updated `OpmRightPanelContentProps` accepting `executionConfig?: OpmExecutionConfig`, `onUpdateSelectionExecution?: (updatedExecution: any) => void`, `writableAttributes?: readonly Pick<OpmAttribute, 'id' | 'displayName'>[]`, `diagnostics?: OpmDiagnostic[]`.

- [ ] **Step 1: Write failing test in `opmRightPanelContent.test.tsx`**
Add a test asserting that `OpmRightPanelContent` accepts `executionConfig` and `onUpdateSelectionExecution`.

- [ ] **Step 2: Run test to verify it fails or verifies the contract**
Run `npx vitest run src/components/entropy/__tests__/opmRightPanelContent.test.tsx`

- [ ] **Step 3: Update `OpmRightPanelContentProps` and imports**
Import execution types from `../../engine/opm/executableTypes` and add optional props to `OpmRightPanelContentProps`.

- [ ] **Step 4: Run test to verify it passes**
Run `npx vitest run src/components/entropy/__tests__/opmRightPanelContent.test.tsx`

- [ ] **Step 5: Commit**
`git add src/components/entropy/OpmRightPanelContent.tsx src/components/entropy/__tests__/opmRightPanelContent.test.tsx && git commit -m "feat(opm): add execution props to OpmRightPanelContent"`

---

### Task 2: Implement Link Execution Inspector in `OpmRightPanelContent`

**Files:**
- Modify: `src/components/entropy/OpmRightPanelContent.tsx:500-560`
- Test: `src/components/entropy/__tests__/opmRightPanelContent.test.tsx`

**Interfaces:**
- Consumes: `selectedEdge`, `executionConfig`, `onUpdateSelectionExecution`, `writableAttributes`.
- Produces: Rendered Guard Expression input (`linkExecution.guard`), Event Trigger selector (`linkExecution.eventId`), Delay & Priority grid, State Transition fields (`transition.ownerObjectId`, `transition.targetStateId`), and Action Assignments table.

- [ ] **Step 1: Write failing test for Link Execution fields**
Test that selecting an edge renders Guard Expression input (`data-testid="guard-expr-input"`), Delay input (`data-testid="link-delay-input"`), and State Transition target input (`data-testid="link-transition-target-input"`).

- [ ] **Step 2: Run test to verify failure**
Run `npx vitest run src/components/entropy/__tests__/opmRightPanelContent.test.tsx`

- [ ] **Step 3: Implement Link Execution Inspector in `OpmRightPanelContent.tsx`**
Add the execution card under the existing Link Role selector with ADAI glassmorphic styling, inputs, and change dispatchers.

- [ ] **Step 4: Run test to verify passing**
Run `npx vitest run src/components/entropy/__tests__/opmRightPanelContent.test.tsx`

- [ ] **Step 5: Commit**
`git add src/components/entropy/OpmRightPanelContent.tsx src/components/entropy/__tests__/opmRightPanelContent.test.tsx && git commit -m "feat(opm): implement link execution inspector with guards and transitions"`

---

### Task 3: Implement State Execution Inspector in `OpmRightPanelContent`

**Files:**
- Modify: `src/components/entropy/OpmRightPanelContent.tsx:135-210`
- Test: `src/components/entropy/__tests__/opmRightPanelContent.test.tsx`

**Interfaces:**
- Consumes: `selectedNode` (when `type === 'state'`), `executionConfig`, `onUpdateSelectionExecution`, `writableAttributes`.
- Produces: Rendered Initial/Terminal checkboxes, Timeout (ms) input, Timeout Event dropdown, Entry Actions list, and Exit Actions list.

- [ ] **Step 1: Write failing test for State Execution fields**
Test that selecting a state node renders `state-initial-checkbox`, `state-terminal-checkbox`, `state-timeout-input`, and entry/exit assignment buttons.

- [ ] **Step 2: Run test to verify failure**
Run `npx vitest run src/components/entropy/__tests__/opmRightPanelContent.test.tsx`

- [ ] **Step 3: Implement State Execution Inspector in `OpmRightPanelContent.tsx`**
Render the state execution controls when `selectedNode.data.type === 'state'` styled with ADAI amber/orange theme.

- [ ] **Step 4: Run test to verify passing**
Run `npx vitest run src/components/entropy/__tests__/opmRightPanelContent.test.tsx`

- [ ] **Step 5: Commit**
`git add src/components/entropy/OpmRightPanelContent.tsx src/components/entropy/__tests__/opmRightPanelContent.test.tsx && git commit -m "feat(opm): implement state execution inspector with entry and exit actions"`

---

### Task 4: Upgrade Object Inspector to Typed Variables & Process Inspector

**Files:**
- Modify: `src/components/entropy/OpmRightPanelContent.tsx:280-360`
- Test: `src/components/entropy/__tests__/opmRightPanelContent.test.tsx`

**Interfaces:**
- Consumes: `selectedNode` (when `type === 'object'` or `type === 'process'`), `onUpdateSelectionExecution`.
- Produces: Typed Attributes manager with scalar type selector (`float32`, `int32`, `uint32`, `bool`, `enum`), initial value editor, reorder/delete, and Process activation/guard/assignment inspector.

- [ ] **Step 1: Write failing test for Object Typed Variables & Process Inspector**
Test that selecting an object displays typed attribute inputs (`attr-name-input`, typed value controls) and `add-attr-btn`.

- [ ] **Step 2: Run test to verify failure**
Run `npx vitest run src/components/entropy/__tests__/opmRightPanelContent.test.tsx`

- [ ] **Step 3: Implement Typed Variables and Process Inspector**
Add the typed variable table for objects with emerald styling and process execution controls with sky styling.

- [ ] **Step 4: Run test to verify passing**
Run `npx vitest run src/components/entropy/__tests__/opmRightPanelContent.test.tsx`

- [ ] **Step 5: Commit**
`git add src/components/entropy/OpmRightPanelContent.tsx src/components/entropy/__tests__/opmRightPanelContent.test.tsx && git commit -m "feat(opm): upgrade object variables and process inspector in right panel"`

---

### Task 5: Wire State Management & Data Flow in `EntropyWorkspace`

**Files:**
- Modify: `src/components/entropy/EntropyWorkspace.tsx:1640-1710`
- Test: `src/components/entropy/__tests__/opmRightPanelContent.test.tsx`

**Interfaces:**
- Consumes: `nodes`, `edges`, `setNodes`, `setEdges`, `activeOpmConfig`, `saveHistory`.
- Produces: `onUpdateSelectionExecution` handler connected to `OpmRightPanelContent`, passing `writableAttributes` and `executionConfig`.

- [ ] **Step 1: Write integration test verifying update dispatch**
Verify that updating execution updates `selectedNode.data.execution` or `selectedEdge.data.execution` and triggers state updates.

- [ ] **Step 2: Run test to check current behavior**
Run `npx vitest run src/components/entropy/__tests__/`

- [ ] **Step 3: Implement handler and props in `EntropyWorkspace.tsx`**
Define `handleUpdateSelectionExecution` in `EntropyWorkspace.tsx` and pass `executionConfig`, `writableAttributes`, and `onUpdateSelectionExecution` to `OpmRightPanelContent`.

- [ ] **Step 4: Run full test suite to verify end-to-end correctness**
Run `npx vitest run src/components/entropy/`

- [ ] **Step 5: Commit**
`git add src/components/entropy/EntropyWorkspace.tsx src/components/entropy/__tests__/ && git commit -m "feat(opm): wire execution updates and data flow in EntropyWorkspace"`

---

### Task 6: Visual Polish, Aesthetics Review & Full Suite Verification

**Files:**
- Modify: `src/components/entropy/OpmRightPanelContent.tsx`
- Test: All tests in `src/components/entropy/` and `src/engine/opm/`

- [ ] **Step 1: Run complete OPM and Entropy test suites**
Run `npx vitest run src/components/entropy/ src/engine/opm/`

- [ ] **Step 2: Verify visual styling against ADAI design language**
Check colors, padding, borders, responsive scrollbars, and focus states.

- [ ] **Step 3: Commit final polish**
`git add -A && git commit -m "style(opm): polish executable inspector aesthetics and visual identity"`
