# State Machine Canvas Right-Click & Tree Creation Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore exact parity for creating State Machine elements across the canvas right-click context menu, the Model Explorer tree, the workspace toolbar, and the MISRA C code generator by pruning unsupported pseudostates and adding a canvas right-click menu with State, Junction, and X-Bridges State.

**Architecture:** 
1. Prune `stateMachineExplorerAdapter.ts` and `modelExplorerCapabilities.ts` to strictly allow `state`, `junction`, and `xBridgesState` under State Machine regions/diagrams, removing all unused pseudostates.
2. Implement `createElement` for `xBridgesState` in `stateMachineExplorerAdapter.ts`.
3. Add a canvas context menu to `App.tsx` on `#adia-diagram-canvas` when in `statemachine` mode offering the 3 toolbar-matching items ("Add State", "Add Junction", "Add X-Bridges State") positioned at the right-clicked coordinates.
4. Keep state initial/autostart, terminal, and history as intrinsic State Properties matching existing MISRA C codegen.

**Tech Stack:** React, TypeScript, Vitest, Tailwind CSS, Lucide Icons.

## Global Constraints
- Only expose State, Junction, and X-Bridges State in the State Machine creation menus.
- No new items added to C code generation.
- Autostart / Initial state remains configured via State Properties (`autostart: true`).
- All existing Model Explorer and C code generator tests must pass without regressions.

---

### Task 1: Prune Model Explorer Capabilities and Add X-Bridges Creation Support

**Files:**
- Modify: `src/features/modelExplorer/adapters/stateMachineExplorerAdapter.ts`
- Modify: `src/features/modelExplorer/modelExplorerCapabilities.ts`
- Test: `src/features/modelExplorer/adapters/stateMachineExplorerAdapter.test.ts`

**Interfaces:**
- Consumes: `STATE_MACHINE_CHILDREN` in `stateMachineExplorerAdapter.ts`, `BASE_ELEMENT_KIND_LABELS` in `modelExplorerCapabilities.ts`
- Produces: `capabilities([ownerId])` returning only `['state', 'junction', 'xBridgesState']` for regions, and `createElement` dispatching `xBridgesState`.

- [ ] **Step 1: Write the failing test**
Create/update `src/features/modelExplorer/adapters/stateMachineExplorerAdapter.test.ts` to assert that:
1. `capabilities(['root'])` returns only `state`, `junction`, `xBridgesState`, and `stateMachine` diagram creation, and does NOT return `initial`, `choice`, `fork`, `join`, `terminate`, `entry-point`, `exit-point`, `final`.
2. `createElement` with `elementKind: 'xBridgesState'` creates a `StateData` with `isXBridges: true`.

```typescript
import { describe, it, expect } from 'vitest';
import { createStateMachineExplorerAdapter } from './stateMachineExplorerAdapter';

describe('stateMachineExplorerAdapter parity', () => {
  it('returns strictly State, Junction, and X-Bridges State as creatable children for regions', () => {
    const adapter = createStateMachineExplorerAdapter({
      getSnapshot: () => ({
        states: [],
        layers: [{ id: 'root', name: 'Root Region', parentStateId: null, stateIds: [], transitionIds: [], junctionIds: [] }],
        transitions: [],
        junctions: [],
        diagrams: [],
      }),
      onCommit: () => {},
    });

    const caps = adapter.capabilities(['root']);
    const createCaps = caps.filter(c => c.kind === 'createElement').map(c => c.elementKind);
    expect(createCaps).toEqual(['state', 'junction', 'xBridgesState']);
  });

  it('creates an X-Bridges state with isXBridges: true', () => {
    let committed: any = null;
    const adapter = createStateMachineExplorerAdapter({
      getSnapshot: () => ({
        states: [],
        layers: [{ id: 'root', name: 'Root Region', parentStateId: null, stateIds: [], transitionIds: [], junctionIds: [] }],
        transitions: [],
        junctions: [],
        diagrams: [],
      }),
      onCommit: (next) => { committed = next; },
    });

    const res = adapter.executeCommand({
      type: 'createElement',
      ownerId: 'root',
      elementKind: 'xBridgesState',
    });

    expect(res.committed).toBe(true);
    expect(committed.states).toHaveLength(1);
    expect(committed.states[0]).toMatchObject({
      isXBridges: true,
      parentId: 'root',
      regionId: 'root',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/modelExplorer/adapters/stateMachineExplorerAdapter.test.ts`
Expected: FAIL with missing `xBridgesState` or extra pseudostates returned.

- [ ] **Step 3: Update `stateMachineExplorerAdapter.ts` and `modelExplorerCapabilities.ts`**

1. In `src/features/modelExplorer/modelExplorerCapabilities.ts`, ensure `xBridgesState: 'X-Bridges State'` is in `BASE_ELEMENT_KIND_LABELS`.
2. In `src/features/modelExplorer/adapters/stateMachineExplorerAdapter.ts`:
   - Update `STATE_MACHINE_CHILDREN`:
   ```typescript
   const STATE_MACHINE_CHILDREN: Record<string, readonly string[]> = {
     stateMachine: ['region'],
     region: ['state', 'junction', 'xBridgesState'],
     state: ['region'],
   };
   ```
   - In `executeCommand` under `case 'createElement'`:
   ```typescript
   if (command.elementKind === 'xBridgesState') {
     const name = command.name ?? generateUniqueName('XBridges_State', existingNames);
     const stateId = generateId('xbState');
     const newState: StateData = {
       id: stateId,
       name,
       x: 100,
       y: 100,
       width: 140,
       height: 70,
       entry: '',
       during: '',
       exit: '',
       isActive: false,
       color: '#4caf50',
       parentId: ownerId,
       children: [],
       priority: 0,
       isParallel: false,
       regionId: ownerId,
       autostart: false,
       isXBridges: true,
       xBridgesModel: {
         nodes: [],
         edges: [],
         mappings: [],
         solver: { kind: 'euler', stepSeconds: 0.01 },
         policy: { memory: 'reset', numericFault: 'escalate' },
       },
     };

     const nextLayers = snapshot.layers.map(l =>
       l.id === ownerId ? { ...l, stateIds: [...l.stateIds, stateId] } : l
     );

     const nextSnapshot: StateMachineExplorerSnapshot = {
       ...snapshot,
       states: [...snapshot.states, newState],
       layers: nextLayers,
     };
     commitSnapshot(nextSnapshot, `Create X-Bridges state ${name}`);
     return {
       committed: true,
       revision: this.getRevision(),
       diagnostics: [],
       selectedIds: [stateId],
     };
   }
   ```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/modelExplorer/adapters/stateMachineExplorerAdapter.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/modelExplorer/adapters/stateMachineExplorerAdapter.ts src/features/modelExplorer/adapters/stateMachineExplorerAdapter.test.ts src/features/modelExplorer/modelExplorerCapabilities.ts
git commit -m "feat(model-explorer): restrict state machine creation to C-codable elements"
```

---

### Task 2: Implement State Machine Canvas Right-Click Context Menu in `App.tsx`

**Files:**
- Modify: `src/App.tsx`
- Test: `src/components/modelExplorer/AppModelExplorer.actions.test.tsx` (and existing tests)

**Interfaces:**
- Consumes: `createState(x, y)`, `createJunction(x, y)`, `createXBridgesState(x, y)` in `App.tsx`
- Produces: Canvas right-click context menu popup rendered at mouse coordinates when `diagramMode === 'statemachine'`.

- [ ] **Step 1: Check existing context menu prevent-default in `App.tsx`**

View line ~18233 of `src/App.tsx`:
```tsx
<div
  ref={canvasRef}
  id="adia-diagram-canvas"
  ...
  onContextMenu={(e) => e.preventDefault()}
```

- [ ] **Step 2: Add canvas context menu state and handler in `App.tsx`**

1. Add state:
```typescript
const [canvasContextMenu, setCanvasContextMenu] = useState<{
  x: number;
  y: number;
  worldX: number;
  worldY: number;
} | null>(null);
```

2. Replace `onContextMenu={(e) => e.preventDefault()}` on `#adia-diagram-canvas`:
```typescript
onContextMenu={(e) => {
  e.preventDefault();
  if (diagramMode === 'statemachine') {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const worldX = ((e.clientX - rect.left) / uiZoom - view.offsetX) / view.scale;
    const worldY = ((e.clientY - rect.top) / uiZoom - view.offsetY) / view.scale;
    setCanvasContextMenu({
      x: e.clientX,
      y: e.clientY,
      worldX,
      worldY,
    });
  }
}}
```

3. Render the floating context menu:
```tsx
{canvasContextMenu && (
  <div
    className="fixed z-50 bg-[#121212] border border-[#2d2d2d] rounded-lg shadow-2xl py-1 w-48 text-xs text-[#e0e0e0] backdrop-blur-md"
    style={{ left: canvasContextMenu.x, top: canvasContextMenu.y }}
    onClick={(e) => e.stopPropagation()}
  >
    <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#888] border-b border-[#222]">
      Add State Machine Element
    </div>
    <button
      onClick={() => {
        createState(canvasContextMenu.worldX, canvasContextMenu.worldY);
        setCanvasContextMenu(null);
      }}
      className="w-full text-left px-3 py-2 hover:bg-[#222] hover:text-[#fff] flex items-center space-x-2 transition-colors"
    >
      <Plus size={13} className="text-orange-400" />
      <span>Add State</span>
    </button>
    <button
      onClick={() => {
        createJunction(canvasContextMenu.worldX, canvasContextMenu.worldY);
        setCanvasContextMenu(null);
      }}
      className="w-full text-left px-3 py-2 hover:bg-[#222] hover:text-[#fff] flex items-center space-x-2 transition-colors"
    >
      <Circle size={13} className="text-amber-400" />
      <span>Add Junction</span>
    </button>
    <button
      onClick={() => {
        createXBridgesState(canvasContextMenu.worldX, canvasContextMenu.worldY);
        setCanvasContextMenu(null);
      }}
      className="w-full text-left px-3 py-2 hover:bg-[#222] hover:text-[#fff] flex items-center space-x-2 transition-colors"
    >
      <Box size={13} className="text-[#4caf50]" />
      <span>Add X-Bridges State</span>
    </button>
  </div>
)}
```

4. Add click-outside and Escape key listener to close `canvasContextMenu`.

- [ ] **Step 3: Run Vitest tests to ensure no regressions in App or ModelExplorer**

Run: `npx vitest run src/components/modelExplorer/AppModelExplorer.actions.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(canvas): add right-click context menu for state machine workspace"
```

---

### Task 3: Regression Suite & Golden Verification

**Files:**
- Test: `src/features/modelExplorer/adapters/stateMachineExplorerAdapter.test.ts`
- Test: `src/components/modelExplorer/AppModelExplorer.actions.test.tsx`
- Test: `src/utils/stateMachineCodeGenerator.golden.test.ts`

- [ ] **Step 1: Run all related Vitest suites**

Run: `npx vitest run src/features/modelExplorer/adapters/stateMachineExplorerAdapter.test.ts src/components/modelExplorer/AppModelExplorer.actions.test.tsx src/utils/stateMachineCodeGenerator.golden.test.ts`
Expected: All tests PASS.

- [ ] **Step 2: Commit any snapshot/test updates**

```bash
git commit --allow-empty -m "test: verify tree and canvas context menu parity against C codegen"
```
