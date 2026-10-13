# Smooth Block Movement Across All Diagrams Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure selecting and moving blocks/nodes across all diagrams (SysML BDD, IBD, Requirements, Package, Parametric, State Machine, Use Case, Activity, Sequence, X-Bridges, V-Lab, and PlantUML) moves smoothly, eliminating deadzones, freezing on slow drag, 4px gesture hitches, CSS transition latency, and high-frequency render thrashing.

**Architecture:** 
1. Fix coordinate accumulation in `App.tsx` by tracking raw unrounded coordinates (`dragRawPositionsRef`) for State Machine states and junctions so sub-grid deltas are preserved and elements never freeze during slow drag.
2. Remove the 4px gesture lag and selection-wipe in BDD blocks; ensure rapid drags outside canvas boundaries continue smoothly.
3. Remove CSS position transition latency in PlantUML blocks (`transition` -> `transition-colors, transition-shadow`).
4. Provide smooth dragging / snap toggles in UseCase, Activity, X-Bridges, and V-Lab workspaces so users can move blocks smoothly without chunky 10px/15px jumps.
5. Apply `requestAnimationFrame` throttling to live canvas drag events in `App.tsx` to maintain 60+ FPS without re-render jank.

**Tech Stack:** React 18, TypeScript, SVG, ReactFlow, Vitest.

## Global Constraints

- **STRICT FREEZE-PREVENTION PROTECTION**: DO NOT modify, alter, or regress any background workers, worker clients (`vlabWorkerClient`, `xbridgesWorkerClient`, `doeWorkerClient`), worker protocols (`backgroundTaskProtocol`), simulation solver loops, numerical tolerances, timesteps, or freeze regression gates.
- All changes must be strictly confined to UI pointer/mouse event handling, canvas coordinate math, and CSS presentation attributes.
- Maintain existing hotkeys, shortcuts, and undo/redo history semantics.
- Every task must end with passing automated tests.

---

### Task 1: Fix State Machine Sub-Grid Coordinate Tracking (Deadzones & Freezing)

**Files:**
- Modify: `src/App.tsx:11385-11430`
- Test: `src/utils/transitionGeometry.test.ts`

**Problem:**
When dragging States and Junctions in State Machine diagrams:
`newX = state.x + dx; const snappedX = snapEnabled ? snapToGrid(newX, GRID_SIZE) : newX;`
Since `state.x` is already snapped and `dx` from one frame to the next is small (e.g. 2px), `snappedX` evaluates back to `state.x`. At the end of the event, `dragOffsetRef` is reset to the current mouse position. The sub-grid delta is discarded on every frame. As a result, moving the mouse smoothly or slowly causes States and Junctions to completely freeze!

**Fix:**
Use `dragRawPositionsRef` (just as done for BDD blocks and IBD parts) to accumulate raw unrounded positions for states and junctions across frames:
```ts
const rawPos = dragRawPositionsRef.current[id] ?? { x: state.x, y: state.y };
const nextRawPos = { x: rawPos.x + dx, y: rawPos.y + dy };
dragRawPositionsRef.current[id] = nextRawPos;
const snappedX = snapEnabled ? snapToGrid(nextRawPos.x, GRID_SIZE) : nextRawPos.x;
const snappedY = snapEnabled ? snapToGrid(nextRawPos.y, GRID_SIZE) : nextRawPos.y;
updateState(id, { x: snappedX, y: snappedY });
```
Apply the same pattern to `junctions`.

- [ ] **Step 1: Write a unit test for accumulated drag math**
In `src/utils/transitionGeometry.test.ts`, add a test verifying that accumulating sub-grid deltas over multiple small movements correctly crosses grid thresholds without dropping movement.

- [ ] **Step 2: Run test to verify it passes**
Run: `npx vitest run src/utils/transitionGeometry.test.ts`

- [ ] **Step 3: Update `App.tsx` state and junction movement in `handleMouseMove`**
Modify `src/App.tsx` lines 11390-11425 to store and update `dragRawPositionsRef.current[id]` for states and junctions.

- [ ] **Step 4: Verify with Vitest**
Run: `npx vitest run src/utils/transitionGeometry.test.ts`

---

### Task 2: Eliminate BDD Block 4px Drag Delay and Multi-Selection Drop

**Files:**
- Modify: `src/App.tsx:11200-11220`, `src/App.tsx:11950-11975`
- Test: `src/services/sysmlProjectionState.test.ts`

**Problem:**
1. In BDD mode, `handleBlockMouseDown` defers drag start into `pendingBddBlockGestureRef` with a 4px Euclidean threshold. Until 4px has elapsed, the block does not respond, producing an initial hitch/jerk.
2. When starting to drag, `setSelectedIds(previous => pendingBlockGesture.ctrlKey ? ... : [pendingBlockGesture.blockId])` wipes out all other selected blocks if multiple were selected! If the user selected 3 blocks and drags one of them, the other 2 are unselected.

**Fix:**
1. If the clicked block is already in `selectedIds`, initiate drag immediately (`isDragging = true`, `setDiagramDragOffset`) without the 4px deferral or selection wipe.
2. If not selected and Ctrl is not pressed, select it immediately and allow smooth dragging.
3. Keep `pendingBddBlockGestureRef` only if distinguishing double-click or specific property clicks, but ensure `isDragging` responds smoothly.

- [ ] **Step 1: Write test in `src/services/sysmlProjectionState.test.ts`**
Verify that moving a block when multiple blocks are selected preserves multi-element bounds updating.

- [ ] **Step 2: Run test to confirm behavior**
Run: `npx vitest run src/services/sysmlProjectionState.test.ts`

- [ ] **Step 3: Update `handleBlockMouseDown` and `handleMouseMove` in `src/App.tsx`**
Ensure that dragging an already-selected block moves all currently selected items without resetting `selectedIds` to `[blockId]`.

- [ ] **Step 4: Re-run tests**
Run: `npx vitest run src/services/sysmlProjectionState.test.ts`

---

### Task 3: Remove CSS Transition Latency in PlantUML Canvas

**Files:**
- Modify: `src/components/plantuml/PlantUmlCanvas.tsx:10`
- Test: `src/components/plantuml/PlantUmlCanvas.test.tsx` (or new test file)

**Problem:**
In `PlantUmlCanvas.tsx`:
```tsx
className={`absolute cursor-grab rounded-lg border px-4 py-3 text-left shadow-lg transition active:cursor-grabbing ...`}
```
The Tailwind `transition` class animates `all` properties including `top`, `left`, `transform` over 150ms. When dragging, each mouse move triggers an animated transition, causing severe rubber-banding lag.

**Fix:**
Replace `transition` with `transition-colors transition-shadow` so position updates (`left`, `top`) apply instantly with zero animation delay.

- [ ] **Step 1: Write or check test for PlantUML canvas**
Create/update `src/components/plantuml/PlantUmlCanvas.test.tsx` verifying that element style position updates without delay.

- [ ] **Step 2: Update `PlantUmlCanvas.tsx`**
Replace `transition` with `transition-colors transition-shadow`.

- [ ] **Step 3: Run Vitest**
Run: `npx vitest run src/components/plantuml/`

---

### Task 4: Add Smooth Dragging Support to UseCase and Activity Workspaces

**Files:**
- Modify: `src/components/sysml/UseCaseWorkspace.tsx`
- Modify: `src/components/sysml/ActivityWorkspace.tsx`
- Test: `src/components/sysml/UseCaseWorkspace.test.tsx`
- Test: `src/components/sysml/ActivityWorkspace.test.tsx`

**Problem:**
Both `UseCaseWorkspace` and `ActivityWorkspace` hardcode `GRID = 10` and `const snap = (v) => Math.round(v / GRID) * GRID`. Elements cannot be moved smoothly 1:1 with the pointer.

**Fix:**
1. Add `snapEnabled` state (defaulting to `false` for smooth continuous dragging, or toggled via toolbar button / `Alt` key).
2. When `snapEnabled` is false, `snap(v)` is simply `v` (smooth 1:1 pixel movement).
3. Add a Snap toggle button to the workspace toolbar (styled consistently with the rest of the application).

- [ ] **Step 1: Write test for smooth dragging without grid snapping**
In `src/components/sysml/UseCaseWorkspace.test.tsx` and `src/components/sysml/ActivityWorkspace.test.tsx`, add tests verifying that with snap disabled (or Alt held), drag overrides reflect exact 1:1 delta without 10px rounding.

- [ ] **Step 2: Run tests to verify failure**
Run: `npx vitest run src/components/sysml/UseCaseWorkspace.test.tsx src/components/sysml/ActivityWorkspace.test.tsx`

- [ ] **Step 3: Implement `snapEnabled` and toolbar toggle in UseCaseWorkspace and ActivityWorkspace**
Update `dragOverrides` to respect `snapEnabled ? snap(value) : value`.

- [ ] **Step 4: Run tests to verify pass**
Run: `npx vitest run src/components/sysml/UseCaseWorkspace.test.tsx src/components/sysml/ActivityWorkspace.test.tsx`

---

### Task 5: Add Smooth Dragging (Snap Toggle) in X-Bridges and V-Lab Workspaces

**Files:**
- Modify: `src/components/xbridges/XbridgesWorkspace.tsx`
- Modify: `src/components/vlab/VLabWorkspace.tsx`
- Test: `src/components/xbridges/XbridgesWorkspace.test.tsx`
- Test: `src/components/vlab/VLabWorkspace.test.tsx`

**Problem:**
In `XbridgesWorkspace.tsx`, `<ReactFlow snapToGrid snapGrid={[15, 15]}>` is hardcoded.
In `VLabWorkspace.tsx`, `<ReactFlow snapToGrid snapGrid={[10, 10]}>` is hardcoded.
Blocks always jump by 15px or 10px.

**Fix:**
1. Add `snapToGrid={snapEnabled}` with a state toggle (`snapEnabled`, defaulted to `true` or `false` based on preference, with a toolbar button).
2. DO NOT TOUCH ANY WORKERS, PHYSICS SOLVERS, OR SIMULATION ENGINES. Only pass the boolean `snapToGrid={snapEnabled}` to `<ReactFlow>`.

- [ ] **Step 1: Add unit test in `XbridgesWorkspace.test.tsx` and `VLabWorkspace.test.tsx`**
Verify the canvas renders with configurable `snapToGrid`.

- [ ] **Step 2: Add `snapEnabled` state and toolbar toggle button in X-Bridges and V-Lab**
Update `<ReactFlow snapToGrid={snapEnabled} ...>`.

- [ ] **Step 3: Run X-Bridges and V-Lab tests**
Run: `npx vitest run src/components/xbridges/ src/components/vlab/`

---

### Task 6: RequestAnimationFrame Throttling for App Canvas MouseMove

**Files:**
- Modify: `src/App.tsx:11190-11540`
- Test: `src/services/sysmlProjectionState.test.ts`

**Problem:**
High-resolution mice dispatch 120-250 `mousemove` events per second. Running React state updates (`setMousePos`, `updatePresentationDraft`, `setStates`) on every single event causes frame drops and sluggish feel.

**Fix:**
Use `requestAnimationFrame` to batch drag updates to display refresh intervals:
- Store the latest `worldX, worldY` in a ref (`latestDragPointRef`).
- If an animation frame is already pending, update the ref and return.
- In the animation frame callback, apply the delta and update the presentation/draft states once per frame.
- Cancel any pending rAF on `mouseUp` or `mouseLeave`.

- [ ] **Step 1: Implement rAF throttling in `handleMouseMove` inside `App.tsx`**
Ensure positions update smoothly once per animation frame while drag is active.

- [ ] **Step 2: Run all affected tests and freeze prevention regression tests**
Run: `npx vitest run src/services/sysmlProjectionState.test.ts src/services/backgroundWorkerClient.test.ts`

- [ ] **Step 3: Verification of full test suite**
Run: `npm test` or focused vitest suite to ensure zero regressions across all workspaces.
