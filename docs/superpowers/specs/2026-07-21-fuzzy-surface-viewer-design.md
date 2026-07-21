# Design Spec: Fuzzy Surface Viewer Configuration & Validation

## Goal
Fix the `FUZZY_SURFACE_VIEWER` block in X-Bridges to allow users to link a valid `FUZZY_INFERENCE_SYSTEM` (FIS) block from the workspace in the properties panel. Additionally, block simulation start if any `FUZZY_SURFACE_VIEWER` block is unconfigured, showing a Model Diagnostics error rather than silently failing and outputting zero.

---

## Proposed Changes

### 1. Properties Panel UI Selector (`src/components/xbridges/XbridgesPropertiesPanel.tsx`)
- Extend the `Props` interface to accept `availableFisBlocks?: Array<{ id: string; label: string; params: any }>`.
- When rendering block parameters, if the parameter key is `fisConfig`, render a select dropdown containing all available FIS blocks in the workspace, allowing the user to select one.

### 2. Workspace Nodes Listing (`src/components/xbridges/XbridgesWorkspace.tsx`)
- Compute `availableFisBlocks` by filtering ReactFlow nodes for those of type `'FUZZY_INFERENCE_SYSTEM'`.
- Pass `availableFisBlocks` as a prop to `<XbridgesPropertiesPanel />`.

### 3. Linked Config Resolution at Compile Time
At compilation time, we will resolve the linked block ID (stored in `fisConfig` as a string) to the target FIS block's actual parameters configuration so the simulation engine can execute it:
- **Inside `src/components/xbridges/XbridgesWorkspace.tsx`** (around line 1650 in the start simulation effect):
  Resolve `d.params.fisConfig` string to the target node's `data.params`.
- **Inside `src/App.tsx`** (around line 9518 in the co-simulation engine creation):
  Resolve `d.params.fisConfig` string to the target node's `data.params`.

### 4. Compilation Validation (`src/engine/xbridges/XbridgesEngine.ts`)
- In the `compile()` method, iterate over all blocks.
- If a block is of type `'FUZZY_SURFACE_VIEWER'` and its `params.fisConfig` is null/undefined/empty:
  - Add a Model Diagnostic error with code `'MISSING_FIS_CONFIG'`.

### 5. Build/Tick Blocking on Compile Error (`src/components/xbridges/XbridgesWorkspace.tsx`)
- Inside the simulation loop `useEffect` of `XbridgesWorkspace.tsx`, after calling `engineRef.current.compile()`:
  - If the compile diagnostics contain any error-level diagnostic (`severity === 'error'`), set `isSimulating` to `false`, open the floating Diagnostics panel, and return immediately to halt the tick loop.

---

## Verification Plan

### Automated Tests
Add a test suite in `src/engine/xbridges/BlockDefinitions.test.ts`:
- Build a mock `XbridgesEngine` model with a `FUZZY_SURFACE_VIEWER` block.
- Verify that calling `engine.compile()` reports a `'MISSING_FIS_CONFIG'` warning/error when `fisConfig` is missing.
- Verify that when a valid `fisConfig` is supplied, it compiles successfully.

### Manual Verification
- Add a `Fuzzy Surface Viewer` block and try to run simulation. Ensure it halts and the Diagnostics panel displays the error.
- Link it to a `Fuzzy Inference System` block, run simulation, and verify it starts and outputs the surface values.
