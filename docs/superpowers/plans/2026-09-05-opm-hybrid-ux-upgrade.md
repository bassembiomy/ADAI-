# OPM Hybrid UX Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the OPM workspace into a simple-by-default, engineering-capable UI with consistent warm selection feedback, smooth validated connections, clear inspectors, and reliable simulation/code-generation interactions.

**Architecture:** Keep the OPM canvas as the primary surface and move advanced controls into focused, collapsible inspectors. Put presentation state in small pure helpers where possible, keep OPM simulation/configuration/code generation isolated from State Machine and X-Bridges, and let the existing canonical runtime remain the only semantic execution engine.

**Tech Stack:** React, TypeScript, Vite, `@xyflow/react`, Tailwind utility classes, Vitest, existing OPM TypeScript runtime, existing C99 generator and qualification harness.

## Global Constraints

- Use a hybrid UX: common actions visible by default; advanced actions available contextually.
- Warm amber identifies selection only; simulation activity, warnings, and errors use separate visual channels.
- Every connection uses the same validator during preview and final commit.
- OPM simulation uses persisted `OpmSimulationConfig` and does not modify the State Machine tick.
- C artifacts remain pending until host compilation/runtime/parity qualification succeeds.
- State Machine and X-Bridges runtime and generator paths are protected and must not be modified.
- Invalid operations must leave the model unchanged and expose a stable diagnostic.
- Run tests before claiming completion: TypeScript, OPM tests, C qualification, production build, and browser smoke flow.

---

### Task 1: Establish the UX test contract

**Files:**
- Modify: `src/components/entropy/__tests__/opmReleaseFlow.test.tsx`
- Create: `src/components/entropy/__tests__/opmHybridUx.test.tsx`

**Interfaces:**
- Consumes: current `EntropyWorkspace` props and existing OPM helper APIs.
- Produces: regression tests for selection, inspector synchronization, conversion confirmation, and independent OPM tick editing.

- [ ] **Step 1: Write failing tests**

Add tests that render the workspace with two nodes and one link, click a node and link, and assert:

```tsx
expect(screen.getByTestId('opm-selection-indicator')).toHaveTextContent('selected');
expect(screen.getByTestId('opm-convert-node-type')).toBeInTheDocument();
expect(screen.getByTestId('opm-convert-edge-type')).toBeInTheDocument();
```

Add tests that request an unsafe conversion and assert the confirmation text, then verify Cancel leaves the original node type unchanged. Add a tick test that changes the OPM tick and asserts the supplied global `tickMs` callback is not called.

- [ ] **Step 2: Run the focused tests and observe RED**

Run: `npx vitest run src/components/entropy/__tests__/opmHybridUx.test.tsx`

Expected: FAIL because the selection indicator, confirmation controls, and OPM-specific tick control are not yet exposed by the production component.

- [ ] **Step 3: Commit the test contract**

```bash
git add src/components/entropy/__tests__/opmHybridUx.test.tsx src/components/entropy/__tests__/opmReleaseFlow.test.tsx
git commit -m "test(opm): define hybrid workspace UX contract"
```

### Task 2: Build shared visual state helpers

**Files:**
- Create: `src/components/entropy/OpmSelectionStyles.ts`
- Modify: `src/components/entropy/OPMNodeComponents.tsx`
- Modify: `src/components/entropy/OPMEdgeComponents.tsx`
- Test: `src/components/entropy/__tests__/opmSelectionStyles.test.ts`

**Interfaces:**
- Consumes: node/edge selection and simulation flags.
- Produces: `getOpmNodeVisualState(state)` and `getOpmEdgeVisualState(state)` returning stable class/style tokens for `default`, `hover`, `selected`, `active`, `warning`, `error`, and `disabled`.

- [ ] **Step 1: Write the failing pure helper tests**

Cover that selected state contains the warm amber border/glow tokens, active simulation does not return the selected tokens, and warning/error tokens remain distinguishable from selection.

- [ ] **Step 2: Implement the minimal state maps**

Use one constant palette and return values such as:

```ts
export const OPM_WARM_SELECTION = {
  border: '#fbbf24',
  glow: '0 0 14px rgba(251,191,36,.65)',
};
```

Apply the helper to node borders, labels, ports, edge paths, markers, and selected badges. Keep active-flow animation on its existing semantic colors.

- [ ] **Step 3: Add accessible selection indicators**

Add `aria-selected`, a visible non-color marker, and a stable `data-testid="opm-selection-indicator"` in the selected node/link presentation.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/components/entropy/__tests__/opmSelectionStyles.test.ts src/components/entropy/__tests__/opmHybridUx.test.tsx`

Expected: PASS for pure style tests; component tests may still fail until Task 4 wires selection state.

- [ ] **Step 5: Commit**

```bash
git add src/components/entropy/OpmSelectionStyles.ts src/components/entropy/OPMNodeComponents.tsx src/components/entropy/OPMEdgeComponents.tsx src/components/entropy/__tests__/opmSelectionStyles.test.ts
git commit -m "feat(opm): add consistent warm selection visual states"
```

### Task 3: Redesign the toolbar and contextual panel structure

**Files:**
- Modify: `src/components/entropy/EntropyWorkspace.tsx`
- Create: `src/components/entropy/OpmWorkspaceToolbar.tsx`
- Create: `src/components/entropy/OpmContextPanel.tsx`
- Test: `src/components/entropy/__tests__/opmWorkspaceLayout.test.tsx`

**Interfaces:**
- `OpmWorkspaceToolbarProps`: active tool, active link type, simulation callbacks, undo/redo callbacks, and action-menu callbacks.
- `OpmContextPanelProps`: selected node/edge, conversion callbacks, diagnostic callback, and advanced-section state.

- [ ] **Step 1: Write failing layout tests**

Assert that the toolbar exposes Select/Object/Process/State/Link, that secondary operations appear under Actions or named tabs, and that the context panel is absent with no selection.

- [ ] **Step 2: Extract the toolbar without changing behavior**

Move existing toolbar controls into `OpmWorkspaceToolbar`. Preserve callback names and active-tool semantics. Keep import/export, OPL, diagnostics, and code generation out of the primary row.

- [ ] **Step 3: Extract the inspector shell**

Move node and edge inspector markup into `OpmContextPanel`; expose collapsible sections for common properties, ports, states/execution, diagnostics, simulation, and code generation.

- [ ] **Step 4: Add responsive widths**

Use a fixed desktop context width with a collapsible panel below the desktop breakpoint. Do not alter React Flow viewport state when the panel opens or closes.

- [ ] **Step 5: Run tests and commit**

Run: `npx vitest run src/components/entropy/__tests__/opmWorkspaceLayout.test.tsx`

```bash
git add src/components/entropy/EntropyWorkspace.tsx src/components/entropy/OpmWorkspaceToolbar.tsx src/components/entropy/OpmContextPanel.tsx src/components/entropy/__tests__/opmWorkspaceLayout.test.tsx
git commit -m "refactor(opm): organize hybrid workspace controls"
```

### Task 4: Make selection state authoritative and synchronized

**Files:**
- Modify: `src/components/entropy/EntropyWorkspace.tsx`
- Modify: `src/components/entropy/__tests__/opmHybridUx.test.tsx`

**Interfaces:**
- Produces one selection model: `{ kind: 'node' | 'edge'; id: string } | null`.

- [ ] **Step 1: Add selection reducer tests**

Test node selection, edge selection, pane clearing, diagnostic navigation, conversion, undo/redo, and deletion. Every state transition must clear stale selection IDs.

- [ ] **Step 2: Wire React Flow events through the selection model**

Use `onNodeClick`, `onEdgeClick`, `onPaneClick`, and `onNodesChange/onEdgesChange` to derive selected elements from current arrays instead of retaining stale object references.

- [ ] **Step 3: Apply warm visual state**

Pass `selected={selection?.kind === 'node' && selection.id === node.id}` and the equivalent edge prop. Render the non-color selection indicator and synchronize the inspector.

- [ ] **Step 4: Run focused component tests**

Run: `npx vitest run src/components/entropy/__tests__/opmHybridUx.test.tsx src/components/entropy/__tests__/executionPanels.test.tsx`

- [ ] **Step 5: Commit**

```bash
git add src/components/entropy/EntropyWorkspace.tsx src/components/entropy/__tests__/opmHybridUx.test.tsx
git commit -m "feat(opm): synchronize canvas selection and inspector"
```

### Task 5: Complete smooth, diagnostic connection interaction

**Files:**
- Modify: `src/components/entropy/OpmPortContracts.ts`
- Modify: `src/components/entropy/EntropyWorkspace.tsx`
- Modify: `src/components/entropy/OPMEdgeComponents.tsx`
- Test: `src/components/entropy/__tests__/opmConnectionInteraction.test.tsx`

**Interfaces:**
- `validateOpmPortConnection(...)` returns `{ valid, code, reason, sourcePort, targetPort }`.
- `onConnectStart/onConnectEnd` maintain cancellable preview state.

- [ ] **Step 1: Add failing interaction tests**

Cover valid handle snapping, missing/reversed handles, incompatible role/data types, duplicate connections, Escape cancellation, and rejected connection diagnostics.

- [ ] **Step 2: Use one validator for preview and commit**

Store the latest verdict in state for the preview label. Return the same verdict from `onConnect`; never call `addEdge` on an invalid verdict.

- [ ] **Step 3: Improve preview rendering**

Render valid candidates with a green/blue semantic cue and invalid candidates with a red cue plus a short reason. Keep amber exclusively for selection.

- [ ] **Step 4: Add port/multiplicity diagnostics**

Include source/target handle IDs in duplicate checks and return the resolved port records for accepted connections.

- [ ] **Step 5: Run tests and commit**

Run: `npx vitest run src/components/entropy/__tests__/opmConnectionInteraction.test.tsx src/components/entropy/__tests__/opmReleaseFlow.test.tsx`

```bash
git add src/components/entropy/OpmPortContracts.ts src/components/entropy/EntropyWorkspace.tsx src/components/entropy/OPMEdgeComponents.tsx src/components/entropy/__tests__/opmConnectionInteraction.test.tsx
git commit -m "feat(opm): smooth and diagnose port connections"
```

### Task 6: Add safe block/link conversion flow

**Files:**
- Modify: `src/components/entropy/OpmMigrations.ts`
- Modify: `src/components/entropy/EntropyWorkspace.tsx`
- Modify: `src/components/entropy/OpmContextPanel.tsx`
- Test: `src/components/entropy/__tests__/opmConversionFlow.test.tsx`

**Interfaces:**
- `convertOpmNodeType` and `convertOpmEdgeType` remain pure and return `{ node|edge, warnings }`.
- Production conversion uses staged candidates `{ candidate, warnings }` and `Apply/Cancel`.

- [ ] **Step 1: Add failing conversion tests**

Verify node/link selectors are available for all convertible types, warning text appears before mutation, Cancel preserves deep equality, Apply preserves IDs and compatible metadata, and invalid link conversion leaves the original edge unchanged.

- [ ] **Step 2: Keep renderer and semantic types separate**

Store link role in `edge.data.type`; always keep `edge.type = 'opmEdge'`. Preserve handles, labels, conditions, and execution metadata.

- [ ] **Step 3: Revalidate affected relationships after node conversion**

After Apply, re-run the port/node contract for edges touching the converted node. Preserve valid links and attach a stable diagnostic to invalid links without silently deleting them.

- [ ] **Step 4: Run tests and commit**

Run: `npx vitest run src/components/entropy/__tests__/opmConversionFlow.test.tsx src/components/entropy/__tests__/opmReleaseFlow.test.tsx`

```bash
git add src/components/entropy/OpmMigrations.ts src/components/entropy/EntropyWorkspace.tsx src/components/entropy/OpmContextPanel.tsx src/components/entropy/__tests__/opmConversionFlow.test.tsx
git commit -m "feat(opm): add confirmed safe type conversion flow"
```

### Task 7: Persist independent OPM simulation configuration

**Files:**
- Modify: `src/components/entropy/OpmSimulationConfig.ts`
- Modify: `src/components/entropy/EntropyWorkspace.tsx`
- Modify: `src/App.tsx`
- Modify: `src/engine/opm/persistence.ts`
- Test: `src/components/entropy/__tests__/opmSimulationConfig.test.ts`
- Test: `src/engine/opm/__tests__/persistence.test.ts`

**Interfaces:**
- `parseOpmSimulationConfig(input): { ok: true; config } | { ok: false; diagnostics }`.
- `EntropyWorkspace` receives `opmSimulationConfig` and `onOpmSimulationConfigChange`.

- [ ] **Step 1: Add failing config tests**

Reject zero, negative, fractional, NaN, Infinity, and above-limit values. Assert the previous valid config remains active after rejected edits. Assert save/restore preserves OPM config and does not change global State Machine `tickMs`.

- [ ] **Step 2: Implement bounded parsing**

Use documented bounds (`tickMs` 1–60000, `maxTicks` 1–1000000, `maxEventsPerTick` 1–1024). Return diagnostics instead of silently rounding or falling back.

- [ ] **Step 3: Wire configuration through App persistence**

Add only an OPM project field; preserve the existing global tick field unchanged. Pass the OPM config to the OPM workspace and use `config.tickMs` for its interval.

- [ ] **Step 4: Expose controls in the Simulation panel**

Show OPM tick, max ticks, max events/tick, simulated time, and status with inline validation. Keep invalid edits from replacing the active config.

- [ ] **Step 5: Run tests and commit**

Run: `npx vitest run src/components/entropy/__tests__/opmSimulationConfig.test.ts src/engine/opm/__tests__/persistence.test.ts`

```bash
git add src/components/entropy/OpmSimulationConfig.ts src/components/entropy/EntropyWorkspace.tsx src/App.tsx src/engine/opm/persistence.ts src/components/entropy/__tests__/opmSimulationConfig.test.ts src/engine/opm/__tests__/persistence.test.ts
git commit -m "feat(opm): persist isolated simulation configuration"
```

### Task 8: Harden the code-generation panel UX

**Files:**
- Modify: `src/components/entropy/OpmCodeGenerationWorkspace.tsx`
- Modify: `src/components/entropy/OpmContextPanel.tsx`
- Modify: `src/engine/opm/cGenerator.ts`
- Test: `src/components/entropy/__tests__/opmCodeGenerationWorkspace.test.tsx`

**Interfaces:**
- Generation state remains `draft → validated → generated(pending) → verifying → verified`.
- `generateOpmCArtifacts` returns merged diagnostics and never labels unqualified output as qualified.

- [ ] **Step 1: Add failing panel tests**

Assert Generate is blocked on errors, generator diagnostics are visible, empty files produce `failed`, the manifest shows `pending`, and Download is enabled only for matching verified fingerprints.

- [ ] **Step 2: Add progress and evidence sections**

Show Validate, Generate, Verify, and Download as sequential actions. Display fingerprint, OPM tick, resource limits, compiler flags, qualification status, and verification evidence.

- [ ] **Step 3: Wire diagnostic navigation**

Use `data-opm-path` and source references to focus the matching inspector control or show an explicit fallback message.

- [ ] **Step 4: Run tests and commit**

Run: `npx vitest run src/components/entropy/__tests__/opmCodeGenerationWorkspace.test.tsx src/engine/opm/__tests__/cGenerator.test.ts`

```bash
git add src/components/entropy/OpmCodeGenerationWorkspace.tsx src/components/entropy/OpmContextPanel.tsx src/engine/opm/cGenerator.ts src/components/entropy/__tests__/opmCodeGenerationWorkspace.test.tsx
git commit -m "feat(opm): present qualified code generation flow"
```

### Task 9: Accessibility, performance, and browser smoke verification

**Files:**
- Modify: `src/components/entropy/EntropyWorkspace.tsx`
- Modify: `src/components/entropy/OpmWorkspaceToolbar.tsx`
- Modify: `src/components/entropy/OpmContextPanel.tsx`
- Create: `src/components/entropy/__tests__/opmAccessibility.test.tsx`
- Test: `src/engine/opm/__tests__/generatorBoundary.test.ts`

**Interfaces:**
- All controls have accessible names, keyboard focus, and stable test IDs.
- Protected engine paths remain outside the OPM diff.

- [ ] **Step 1: Add accessibility tests**

Check keyboard navigation, visible focus, Escape cancellation, Enter confirmation, accessible names, and non-color status labels.

- [ ] **Step 2: Profile render stability**

Use React Profiler or render-count assertions to ensure selecting one element does not recreate unrelated nodes/edges and dragging does not reset viewport state.

- [ ] **Step 3: Run the production verification suite**

```bash
npx tsc --noEmit
npx vitest run src/components/entropy/__tests__ src/engine/opm/__tests__
npm run test:opm:release
npm run build
```

Expected: all commands exit 0; the boundary test reports no protected OPM imports.

- [ ] **Step 4: Run browser smoke flow**

Start from the implementation worktree with `npm run dev`, then verify: page load, selection warm glow, node/link inspectors, valid/invalid connection, conversion Cancel/Apply, OPM tick edit independent from global tick, one simulation step, diagnostics navigation, pending code generation, failed verification, successful verification, and download gating.

- [ ] **Step 5: Commit final verification changes**

```bash
git add src/components/entropy src/engine/opm/__tests__/generatorBoundary.test.ts
git commit -m "test(opm): verify hybrid UX accessibility and release flow"
```

## Self-Review Coverage

- UX-01 layout: Task 3.
- UX-02 block visual language: Task 2.
- UX-03 warm selection: Tasks 2 and 4.
- UX-04 smooth connections: Task 5.
- UX-05 link presentation: Tasks 2, 3, and 5.
- UX-06 conversions: Task 6.
- UX-07 advanced controls: Task 3.
- UX-08 simulation controls: Task 7.
- UX-09 code generation: Task 8.
- UX-10 diagnostics: Tasks 5, 6, and 8.
- UX-11 accessibility: Task 9.
- UX-12 performance: Task 9.
- Protected boundaries and verification: Global Constraints and Task 9.

## Execution Notes

Execute tasks in order. Use the isolated worktree created with `using-git-worktrees`; do not work in a dirty root checkout. For implementation, choose either `superpowers:subagent-driven-development` with review after each task or `superpowers:executing-plans` with checkpoints after Tasks 4, 7, and 9.
