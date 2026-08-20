# Empty Module Workspaces on Startup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure that all module workspaces and variable stores in ADIA initialize in an empty state with zero pre-assigned variables or demo blocks on application startup.

**Architecture:** Update initial React state hooks in `src/App.tsx` for `variables`, `states`, `transitions`, `layers`, `globalXBridgesNodes`, `globalXBridgesEdges`, and DOE `data`/`headers` to initialize as empty collections, while preserving full deserialization logic for project saving and importing.

**Tech Stack:** React, TypeScript, Vitest

## Global Constraints
- Do not modify project import/export schema or `.adia` serialization format.
- Ensure all existing unit tests in `src/utils/` continue to pass.

---

### Task 1: Add Unit Tests for Initial Startup State Invariants

**Files:**
- Create: `src/utils/startupDefaults.test.ts`

**Interfaces:**
- Consumes: `createPersistedAppSimulationModel`, `createUnifiedProjectPayload`
- Produces: Verified default empty state serialization contracts

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { createPersistedAppSimulationModel } from './stateMachine/smAppAdapter';
import { createUnifiedProjectPayload } from './adiaProjectPersistence';

describe('Startup Defaults Invariants', () => {
  it('serializes a clean empty model when initial states and variables are empty', () => {
    const emptyModel = createPersistedAppSimulationModel({
      tickMs: 500,
      states: [],
      junctions: [],
      transitions: [],
      variables: [],
      layers: [{
        id: 'root',
        name: 'Root',
        parentStateId: null,
        stateIds: [],
        transitionIds: [],
        junctionIds: [],
      }],
      safetyMode: false,
      hilConfig: {
        enabled: false,
        target: 'Generic',
        clockSpeed: 16,
        channels: [],
        mappings: [],
        commPort: '',
        baudRate: 115200,
      },
    });

    expect(emptyModel.states).toEqual([]);
    expect(emptyModel.transitions).toEqual([]);
    expect(emptyModel.variables).toEqual([]);
    expect(emptyModel.layers[0].stateIds).toEqual([]);
  });

  it('creates an empty project payload when all workspaces are empty', () => {
    const project = createUnifiedProjectPayload({
      projectName: 'Main Project',
      activeModule: 'statemachine',
      stateMachine: {
        tickMs: 500,
        states: [],
        junctions: [],
        transitions: [],
        layers: [{
          id: 'root',
          name: 'Root',
          parentStateId: null,
          stateIds: [],
          transitionIds: [],
          junctionIds: [],
        }],
        variables: [],
        safetyMode: false,
      },
      sysml: {
        blocks: [],
        relationships: [],
        parts: [],
        connectors: [],
        interfaceRealizations: [],
      },
      xbridges: {
        globalXBridgesNodes: [],
        globalXBridgesEdges: [],
      },
      vlab: {
        vlabNodes: [],
        vlabEdges: [],
      },
    });

    expect(project.stateMachine.variables).toEqual([]);
    expect(project.stateMachine.states).toEqual([]);
    expect(project.xbridges.globalXBridgesNodes).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run src/utils/startupDefaults.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/utils/startupDefaults.test.ts
git commit -m "test: add startup defaults invariant tests"
```

---

### Task 2: Update App.tsx Default State Initializations

**Files:**
- Modify: `src/App.tsx:6225-6930`

**Interfaces:**
- Consumes: React `useState` hooks
- Produces: Empty collections for `variables`, `states`, `transitions`, `layers`, `globalXBridgesNodes`, `globalXBridgesEdges`, `headers`, and `data`.

- [ ] **Step 1: Update initial states in `src/App.tsx`**

In `src/App.tsx`:
1. Change `variables`:
```ts
const [variables, setVariables] = useState<VariableDef[]>([]);
```
2. Change `data`, `headers`, `results`:
```ts
const [data, setData] = useState<number[][]>([]);
const [headers, setHeaders] = useState<string[]>([]);
const [results, setResults] = useState<any | null>(null);
```
3. Change `layers`:
```ts
const [layers, setLayers] = useState<Layer[]>([{
  id: 'root',
  name: 'Root',
  parentStateId: null,
  stateIds: [],
  transitionIds: [],
  junctionIds: []
}]);
```
4. Change `states`, `junctions`, `transitions`:
```ts
const [states, setStates] = useState<StateData[]>([]);
const [junctions, setJunctions] = useState<JunctionData[]>([]);
const [transitions, setTransitions] = useState<TransitionData[]>([]);
```
5. Remove `defaultXBridgesNodes` and `defaultXBridgesEdges` and initialize:
```ts
const [globalXBridgesNodes, setGlobalXBridgesNodes] = useState<any[]>([]);
const [globalXBridgesEdges, setGlobalXBridgesEdges] = useState<any[]>([]);
```

- [ ] **Step 2: Run test suite to verify application integrity**

Run: `npx vitest run`
Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: initialize all module workspaces and variables to empty state on startup"
```
