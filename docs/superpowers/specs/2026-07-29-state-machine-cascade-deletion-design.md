# State Machine State & Sub-layer Cascade Deletion Design

## Overview
When a state is deleted from the State Machine, all of its descendant child states, sub-layers, child junctions, and transitions must be recursively deleted. The workspace canvas, left hierarchy tree, active navigation layer, and layer stack must update seamlessly.

## User Experience & Confirmation
1. When the user initiates state deletion (via keypress, context menu, or properties panel button):
   - The system recursively counts all descendant states ($M$) and sub-layers ($N$) owned by the state.
   - If $M > 0$ or $N > 0$, display a confirmation prompt:
     > `"State '${state.name}' contains ${M} child state(s) and ${N} sub-layer(s). Deleting it will permanently remove all child components and sub-layers from the workspace and tree. Continue?"`
   - If $M = 0$ and $N = 0$, display standard deletion confirmation (or confirm direct deletion).
2. Upon confirmation, the state, all its descendant states, and all its sub-layers are purged from the state machine workspace and tree.

## Technical Design & Architecture

### 1. State Machine Pruner Module (`src/utils/stateMachine/smStatePruner.ts`)
A dedicated utility function `pruneStateHierarchy` accepts:
- `targetStateId`: ID of state to delete
- `model`: `{ states: StateData[], layers: Layer[], junctions: JunctionData[], transitions: TransitionData[] }`
- `navigation`: `{ currentLayerId: string, layerStack: string[], layerPath: string[] }`

#### Traversal Algorithm:
1. Initialize `stateIdsToDelete = Set([targetStateId])`, `layerIdsToDelete = Set()`.
2. Queue `[targetStateId]`:
   - Pop `currentStateId`.
   - Find all layers $L$ where $L.parentStateId === currentStateId$. Add $L.id$ to `layerIdsToDelete`.
   - Find all states $C$ where $C.parentId === L.id$ OR $L.stateIds.includes(C.id)$ OR $C.parentId === currentStateId$.
   - Add $C.id$ to `stateIdsToDelete` and push $C.id$ to queue.
3. Collect `junctionIdsToDelete`:
   - Any junction $J$ where $J.parentId \in layerIdsToDelete$ or $L.junctionIds.includes(J.id)$ for $L \in layerIdsToDelete$.
4. Collect `transitionIdsToDelete`:
   - Any transition $T$ where $T.sourceId$ or $T.targetId$ is in `stateIdsToDelete` $\cup$ `junctionIdsToDelete`, OR $T.id \in L.transitionIds$ for any $L \in layerIdsToDelete$.

#### Model & Navigation Mutation Output:
- `states`: Filter out `stateIdsToDelete`.
- `layers`: Filter out `layerIdsToDelete`. Update remaining layers to remove deleted state/junction/transition IDs from their respective array fields (`stateIds`, `junctionIds`, `transitionIds`).
- `junctions`: Filter out `junctionIdsToDelete`.
- `transitions`: Filter out `transitionIdsToDelete`.
- `currentLayerId`: If `currentLayerId` is in `layerIdsToDelete`, fallback to parent layer of target state or `'root'`.
- `layerStack` & `layerPath`: Remove entries corresponding to `layerIdsToDelete`.

### 2. Integration with `App.tsx`
- Update `deleteState` in `App.tsx` to delegate to `pruneStateHierarchy`.
- Ensure keyboard shortcuts, state tree deletion, and UI button deletion call updated `deleteState`.

### 3. Tree View Synchronization (`HierarchyTree`)
- `HierarchyTree` in `App.tsx` renders nodes using `layers` and `states`. Since `states` and `layers` are purged, the tree view updates automatically and cleanly without remaining orphan nodes.

## Verification & Testing Strategy
1. **Unit Tests (`src/utils/stateMachine/smStatePruner.test.ts`)**:
   - Single state deletion without children.
   - 2-level state hierarchy deletion (State -> Child Layer -> Child States & Junctions).
   - Multi-level nested state hierarchy deletion (Root -> StateA -> SublayerA -> StateB -> SublayerB -> StateC).
   - Navigation fallback verification when currently inside a deleted sub-layer.
2. **Manual & UI Verification**:
   - Create multi-layer state hierarchy in state machine canvas.
   - Delete top parent state via tree view / canvas.
   - Verify confirmation message popup mentions child states and sub-layers.
   - Confirm deletion and verify canvas, tree panel, and layer stack contain zero orphaned items.
