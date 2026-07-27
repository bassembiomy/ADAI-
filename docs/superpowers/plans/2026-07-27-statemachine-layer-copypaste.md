# State Machine Layer-Aware & Recursive Copy/Paste Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable multi-element selection, copying, and pasting across any state machine layer, with proper parentId re-parenting and recursive sub-layer duplication for composite states.

**Architecture:** Create a dedicated helper module (`src/utils/stateMachineClipboard.ts`) containing pure logic for recursive copying and layer-aware pasting, fully covered by unit tests in `src/utils/stateMachineClipboard.test.ts`. Wire the helper into `App.tsx` keyboard shortcut handlers (`Ctrl+C`, `Ctrl+X`, `Ctrl+V`).

**Tech Stack:** React 18, TypeScript, Vitest, UUID v4.

## Global Constraints

- Preserve all existing state machine, BDD, and IBD copy/paste support.
- Top-level pasted states must update `parentId` to `currentLayerId`.
- Child layers and nested sub-states of copied composite states must be cloned recursively and linked to their re-mapped parent states.
- Offset top-level states and junctions by `+20px` x and y.

---

### Task 1: Create State Machine Clipboard Utility & Recursive Helper Logic

**Files:**
- Create: `src/utils/stateMachineClipboard.ts`
- Test: `src/utils/stateMachineClipboard.test.ts`

**Interfaces:**
- Consumes: `StateData`, `JunctionData`, `TransitionData`, `Layer`, `BlockData`, `RelationshipData`, `PartData`, `ConnectorData`, `InterfaceRealizationData` from `src/types` or `src/App` context.
- Produces:
  ```ts
  export interface StateMachineClipboardData {
    states: StateData[];
    junctions: JunctionData[];
    transitions: TransitionData[];
    layers: Layer[];
    blocks: BlockData[];
    relationships: RelationshipData[];
    parts: PartData[];
    connectors: ConnectorData[];
    interfaceRealizations: InterfaceRealizationData[];
    topLevelStateIds: string[];
    topLevelJunctionIds: string[];
    topLevelTransitionIds: string[];
  }

  export function createStateMachineClipboard(
    selectedIds: string[],
    states: StateData[],
    junctions: JunctionData[],
    transitions: TransitionData[],
    layers: Layer[],
    blocks: BlockData[],
    relationships: RelationshipData[],
    parts: PartData[],
    connectors: ConnectorData[],
    interfaceRealizations: InterfaceRealizationData[]
  ): StateMachineClipboardData;

  export function pasteStateMachineClipboard(
    clipboard: StateMachineClipboardData,
    currentLayerId: string,
    existingStates: StateData[],
    existingJunctions: JunctionData[],
    existingTransitions: TransitionData[],
    existingLayers: Layer[],
    existingBlocks: BlockData[],
    existingRelationships: RelationshipData[],
    existingParts: PartData[],
    existingConnectors: ConnectorData[],
    existingInterfaceRealizations: InterfaceRealizationData[]
  ): {
    newStates: StateData[];
    newJunctions: JunctionData[];
    newTransitions: TransitionData[];
    updatedLayers: Layer[];
    newBlocks: BlockData[];
    newRelationships: RelationshipData[];
    newParts: PartData[];
    newConnectors: ConnectorData[];
    newInterfaceRealizations: InterfaceRealizationData[];
    pastedTopLevelIds: string[];
  };
  ```

- [ ] **Step 1: Write failing unit test for recursive copy and layer-aware paste**

Create `src/utils/stateMachineClipboard.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { createStateMachineClipboard, pasteStateMachineClipboard } from './stateMachineClipboard';

describe('stateMachineClipboard', () => {
  it('should recursively copy composite state sub-layers and paste into target layer with updated parentId', () => {
    const rootLayer = { id: 'root', name: 'Root', parentStateId: null, stateIds: ['s1'], transitionIds: [], junctionIds: [] };
    const childLayer = { id: 'l_child', name: 'State1_Layer', parentStateId: 's1', stateIds: ['s1_sub1'], transitionIds: [], junctionIds: [] };
    
    const s1 = { id: 's1', name: 'State_1', x: 100, y: 100, parentId: 'root' } as any;
    const s1_sub1 = { id: 's1_sub1', name: 'Sub_1', x: 10, y: 10, parentId: 'l_child' } as any;

    const clipboard = createStateMachineClipboard(
      ['s1'],
      [s1, s1_sub1],
      [],
      [],
      [rootLayer, childLayer],
      [], [], [], [], []
    );

    expect(clipboard.states).toHaveLength(2);
    expect(clipboard.layers).toHaveLength(1);
    expect(clipboard.topLevelStateIds).toEqual(['s1']);

    const result = pasteStateMachineClipboard(
      clipboard,
      'target_layer',
      [s1, s1_sub1],
      [],
      [],
      [rootLayer, childLayer],
      [], [], [], [], []
    );

    const pastedTopState = result.newStates.find(s => s.name === 'State_1_copy');
    expect(pastedTopState).toBeDefined();
    expect(pastedTopState?.parentId).toBe('target_layer');
    expect(pastedTopState?.x).toBe(120);

    const pastedSubState = result.newStates.find(s => s.name === 'Sub_1_copy');
    expect(pastedSubState).toBeDefined();
    expect(pastedSubState?.parentId).not.toBe('l_child'); // Should point to cloned child layer ID
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/utils/stateMachineClipboard.test.ts`  
Expected: FAIL ("Cannot find module ./stateMachineClipboard")

- [ ] **Step 3: Implement `stateMachineClipboard.ts`**

Create `src/utils/stateMachineClipboard.ts` implementing `createStateMachineClipboard` and `pasteStateMachineClipboard`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/stateMachineClipboard.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachineClipboard.ts src/utils/stateMachineClipboard.test.ts
git commit -m "feat: add state machine clipboard recursive utility"
```

---

### Task 2: Integrate Clipboard Utility into App.tsx Copy, Cut, and Paste Handlers

**Files:**
- Modify: `src/App.tsx:13988-14130`
- Test: `npx vitest run src/utils/stateMachineClipboard.test.ts`

- [ ] **Step 1: Update Copy, Cut, and Paste keyboard handlers in App.tsx**

Replace inline clipboard mapping in `App.tsx` keydown handlers for `e.key === 'c'`, `e.key === 'x'`, and `e.key === 'v'` with calls to `createStateMachineClipboard` and `pasteStateMachineClipboard`.

- [ ] **Step 2: Run tests to verify build & unit tests**

Run: `npx vitest run src/utils/stateMachineClipboard.test.ts`  
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: integrate layer-aware state machine copy paste into App.tsx"
```
