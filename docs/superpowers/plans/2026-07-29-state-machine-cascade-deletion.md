# State Machine Cascade Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement recursive cascading deletion of state machine states, child states, sub-layers, junctions, and transitions from the workspace canvas, state tree, and navigation stack with user confirmation.

**Architecture:** Create a pure, testable state machine hierarchy pruner utility `src/utils/stateMachine/smStatePruner.ts` that calculates all descendant states, sub-layers, child junctions, and transitions, returning pruned model arrays and safe navigation fallbacks. Integrate this utility into `deleteState` in `App.tsx`.

**Tech Stack:** TypeScript, React, Vitest

## Global Constraints
- Target File 1: `src/utils/stateMachine/smStatePruner.ts`
- Test File 1: `src/utils/stateMachine/smStatePruner.test.ts`
- Modify File: `src/App.tsx`
- Preserves existing model interfaces in `src/types/sm_types.ts`
- Zero breaking changes to other diagram modes (bdd, ibd, reqs)

---

### Task 1: Create `smStatePruner` helper module with comprehensive unit tests

**Files:**
- Create: `src/utils/stateMachine/smStatePruner.ts`
- Create: `src/utils/stateMachine/smStatePruner.test.ts`

**Interfaces:**
- Consumes: `StateData`, `Layer`, `JunctionData`, `TransitionData` from `src/types/sm_types.ts`
- Produces: `pruneStateHierarchy(targetStateId: string, model: StateMachineModel, navigation: NavigationState): PruneResult`

- [ ] **Step 1: Write failing unit test for `pruneStateHierarchy`**

Create `src/utils/stateMachine/smStatePruner.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { pruneStateHierarchy, countDescendants } from './smStatePruner';
import { StateData, Layer, JunctionData, TransitionData } from '../../types/sm_types';

describe('smStatePruner', () => {
  const rootLayer: Layer = { id: 'root', name: 'Root', parentStateId: null, stateIds: ['s1', 's2'], transitionIds: ['t1'], junctionIds: [] };
  const childLayer: Layer = { id: 'l_child', name: 'ChildLayer', parentStateId: 's1', stateIds: ['s1_sub1'], transitionIds: ['t2'], junctionIds: ['j1'] };
  
  const s1: StateData = { id: 's1', name: 'State_1', x: 0, y: 0, width: 100, height: 100, entry: '', during: '', exit: '', isActive: false, color: '#fff', parentId: 'root', children: [], priority: 10, isParallel: false, regionId: null, autostart: false, historyType: 'none', internalTransitions: '' };
  const s2: StateData = { id: 's2', name: 'State_2', x: 200, y: 0, width: 100, height: 100, entry: '', during: '', exit: '', isActive: false, color: '#fff', parentId: 'root', children: [], priority: 20, isParallel: false, regionId: null, autostart: false, historyType: 'none', internalTransitions: '' };
  const s1_sub1: StateData = { id: 's1_sub1', name: 'Sub_1', x: 10, y: 10, width: 80, height: 80, entry: '', during: '', exit: '', isActive: false, color: '#fff', parentId: 'l_child', children: [], priority: 10, isParallel: false, regionId: null, autostart: false, historyType: 'none', internalTransitions: '' };

  const j1: JunctionData = { id: 'j1', x: 50, y: 50, type: 'junction', autostart: false, parentId: 'l_child' };
  const t1: TransitionData = { id: 't1', sourceId: 's1', targetId: 's2', event: '', condition: '', action: '', afterTicks: null, type: 'condition', hasControlPoint: false, order: 1 };
  const t2: TransitionData = { id: 't2', sourceId: 'j1', targetId: 's1_sub1', event: '', condition: '', action: '', afterTicks: null, type: 'condition', hasControlPoint: false, order: 1 };

  it('correctly counts descendant states and sub-layers', () => {
    const counts = countDescendants('s1', [s1, s2, s1_sub1], [rootLayer, childLayer]);
    expect(counts.stateCount).toBe(1);
    expect(counts.layerCount).toBe(1);
  });

  it('recursively prunes state and all descendant states, sub-layers, junctions, and transitions', () => {
    const result = pruneStateHierarchy('s1', {
      states: [s1, s2, s1_sub1],
      layers: [rootLayer, childLayer],
      junctions: [j1],
      transitions: [t1, t2]
    }, {
      currentLayerId: 'l_child',
      layerStack: ['root', 'l_child'],
      layerPath: ['Root', 'State_1']
    });

    expect(result.states.map(s => s.id)).toEqual(['s2']);
    expect(result.layers.map(l => l.id)).toEqual(['root']);
    expect(result.layers[0].stateIds).toEqual(['s2']);
    expect(result.junctions).toEqual([]);
    expect(result.transitions).toEqual([]);
    expect(result.navigation.currentLayerId).toBe('root');
    expect(result.navigation.layerStack).toEqual(['root']);
    expect(result.navigation.layerPath).toEqual(['Root']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/stateMachine/smStatePruner.test.ts`
Expected: FAIL with module/function not found.

- [ ] **Step 3: Implement `smStatePruner.ts`**

Create `src/utils/stateMachine/smStatePruner.ts`:
```ts
import { StateData, Layer, JunctionData, TransitionData } from '../../types/sm_types';

export interface StateMachineModel {
  states: StateData[];
  layers: Layer[];
  junctions: JunctionData[];
  transitions: TransitionData[];
}

export interface NavigationState {
  currentLayerId: string;
  layerStack: string[];
  layerPath: string[];
}

export interface DescendantCounts {
  stateCount: number;
  layerCount: number;
  descendantStateIds: string[];
  descendantLayerIds: string[];
}

export interface PruneResult {
  states: StateData[];
  layers: Layer[];
  junctions: JunctionData[];
  transitions: TransitionData[];
  navigation: NavigationState;
  deletedStateIds: string[];
  deletedLayerIds: string[];
  deletedJunctionIds: string[];
  deletedTransitionIds: string[];
}

export function countDescendants(
  targetStateId: string,
  states: StateData[],
  layers: Layer[]
): DescendantCounts {
  const descendantStateIds = new Set<string>();
  const descendantLayerIds = new Set<string>();

  const queue: string[] = [targetStateId];

  while (queue.length > 0) {
    const currentStateId = queue.shift()!;
    const childLayers = layers.filter(l => l.parentStateId === currentStateId);

    for (const layer of childLayers) {
      descendantLayerIds.add(layer.id);
      const childStates = states.filter(s =>
        s.parentId === layer.id ||
        layer.stateIds.includes(s.id) ||
        s.parentId === currentStateId
      );

      for (const childState of childStates) {
        if (!descendantStateIds.has(childState.id)) {
          descendantStateIds.add(childState.id);
          queue.push(childState.id);
        }
      }
    }
  }

  return {
    stateCount: descendantStateIds.size,
    layerCount: descendantLayerIds.size,
    descendantStateIds: Array.from(descendantStateIds),
    descendantLayerIds: Array.from(descendantLayerIds)
  };
}

export function pruneStateHierarchy(
  targetStateId: string,
  model: StateMachineModel,
  navigation: NavigationState
): PruneResult {
  const targetState = model.states.find(s => s.id === targetStateId);
  if (!targetState) {
    return {
      states: model.states,
      layers: model.layers,
      junctions: model.junctions,
      transitions: model.transitions,
      navigation,
      deletedStateIds: [],
      deletedLayerIds: [],
      deletedJunctionIds: [],
      deletedTransitionIds: []
    };
  }

  const { descendantStateIds, descendantLayerIds } = countDescendants(targetStateId, model.states, model.layers);

  const deletedStateIds = new Set<string>([targetStateId, ...descendantStateIds]);
  const deletedLayerIds = new Set<string>(descendantLayerIds);

  const deletedJunctionIds = new Set<string>();
  model.junctions.forEach(j => {
    if (j.parentId && deletedLayerIds.has(j.parentId)) {
      deletedJunctionIds.add(j.id);
    }
  });
  model.layers.forEach(l => {
    if (deletedLayerIds.has(l.id)) {
      l.junctionIds.forEach(jid => deletedJunctionIds.add(jid));
    }
  });

  const deletedTransitionIds = new Set<string>();
  model.transitions.forEach(t => {
    if (
      deletedStateIds.has(t.sourceId) ||
      deletedStateIds.has(t.targetId) ||
      deletedJunctionIds.has(t.sourceId) ||
      deletedJunctionIds.has(t.targetId)
    ) {
      deletedTransitionIds.add(t.id);
    }
  });
  model.layers.forEach(l => {
    if (deletedLayerIds.has(l.id)) {
      l.transitionIds.forEach(tid => deletedTransitionIds.add(tid));
    }
  });

  const remainingStates = model.states.filter(s => !deletedStateIds.has(s.id));

  const remainingLayers = model.layers
    .filter(l => !deletedLayerIds.has(l.id))
    .map(l => ({
      ...l,
      stateIds: l.stateIds.filter(sid => !deletedStateIds.has(sid)),
      junctionIds: l.junctionIds.filter(jid => !deletedJunctionIds.has(jid)),
      transitionIds: l.transitionIds.filter(tid => !deletedTransitionIds.has(tid))
    }));

  const remainingJunctions = model.junctions.filter(j => !deletedJunctionIds.has(j.id));
  const remainingTransitions = model.transitions.filter(t => !deletedTransitionIds.has(t.id));

  let nextCurrentLayerId = navigation.currentLayerId;
  if (deletedLayerIds.has(navigation.currentLayerId)) {
    const parentLayerOfDeletedState = remainingLayers.find(l => l.stateIds.includes(targetStateId)) ||
      remainingLayers.find(l => l.id === 'root') ||
      remainingLayers[0];
    nextCurrentLayerId = parentLayerOfDeletedState ? parentLayerOfDeletedState.id : 'root';
  }

  const nextLayerStack = navigation.layerStack.filter(lid => !deletedLayerIds.has(lid));
  const validStackIndices = navigation.layerStack
    .map((lid, idx) => (!deletedLayerIds.has(lid) ? idx : -1))
    .filter(idx => idx !== -1);
  const nextLayerPath = navigation.layerPath.filter((_, idx) => validStackIndices.includes(idx));

  return {
    states: remainingStates,
    layers: remainingLayers,
    junctions: remainingJunctions,
    transitions: remainingTransitions,
    navigation: {
      currentLayerId: nextCurrentLayerId,
      layerStack: nextLayerStack.length > 0 ? nextLayerStack : ['root'],
      layerPath: nextLayerPath.length > 0 ? nextLayerPath : ['Root']
    },
    deletedStateIds: Array.from(deletedStateIds),
    deletedLayerIds: Array.from(deletedLayerIds),
    deletedJunctionIds: Array.from(deletedJunctionIds),
    deletedTransitionIds: Array.from(deletedTransitionIds)
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/stateMachine/smStatePruner.test.ts`
Expected: PASS

- [ ] **Step 5: Commit Task 1**

```bash
git add src/utils/stateMachine/smStatePruner.ts src/utils/stateMachine/smStatePruner.test.ts
git commit -m "feat: add smStatePruner helper module for cascading state deletion"
```

---

### Task 2: Integrate `smStatePruner` into `App.tsx`

**Files:**
- Modify: `src/App.tsx:9562-9599`

**Interfaces:**
- Consumes: `pruneStateHierarchy`, `countDescendants` from `src/utils/stateMachine/smStatePruner.ts`
- Produces: Updated `deleteState` callback in `App.tsx` with user confirmation message listing sub-layers and descendant states count.

- [ ] **Step 1: Update `deleteState` in `App.tsx`**

In `src/App.tsx`, import `pruneStateHierarchy` and `countDescendants`:
```ts
import { pruneStateHierarchy, countDescendants } from './utils/stateMachine/smStatePruner';
```

Replace `deleteState` in `src/App.tsx`:
```ts
  const deleteState = useCallback((id: string) => {
    const state = states.find(s => s.id === id);
    if (!state) return;

    const { stateCount, layerCount } = countDescendants(id, states, layers);

    if (stateCount > 0 || layerCount > 0) {
      const stateMsg = stateCount > 0 ? `${stateCount} child state(s)` : '';
      const layerMsg = layerCount > 0 ? `${layerCount} sub-layer(s)` : '';
      const parts = [stateMsg, layerMsg].filter(Boolean).join(' and ');
      if (!window.confirm(`State '${state.name}' contains ${parts}. Deleting it will permanently remove all child components and sub-layers from the workspace and tree. Continue?`)) {
        return;
      }
    } else {
      if (!window.confirm(`Are you sure you want to delete state '${state.name}'?`)) {
        return;
      }
    }

    addToHistory();

    const result = pruneStateHierarchy(
      id,
      { states, layers, junctions, transitions },
      { currentLayerId, layerStack, layerPath }
    );

    setStates(result.states);
    setLayers(result.layers);
    setJunctions(result.junctions);
    setTransitions(result.transitions);
    setCurrentLayerId(result.navigation.currentLayerId);
    setLayerStack(result.navigation.layerStack);
    setLayerPath(result.navigation.layerPath);
    setSelectedIds(prev => prev.filter(sid => !result.deletedStateIds.includes(sid) && !result.deletedJunctionIds.includes(sid)));

    addError('info', `Deleted state: ${state.name}`);
  }, [states, layers, junctions, transitions, currentLayerId, layerStack, layerPath, addError, addToHistory]);
```

- [ ] **Step 2: Run all test suites to verify no breakages**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 3: Commit Task 2**

```bash
git add src/App.tsx
git commit -m "feat: integrate smStatePruner into deleteState with workspace and tree cascading deletion"
```
