# ENTROPY OPM Upgrade — ISO 19450 Single-Source Modeling + Advanced Simulation + Smart Show

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the ENTROPY OPM module so one ISO 19450-compliant OPM model (objects, processes, states, structural/procedural links) replaces separately-authored SysML BDD, IBD, State Machine, and Requirements diagrams — powered by an event-driven simulation engine, ISO 19450 OPD notation on the canvas (standard shapes, link glyphs, node internals, and connection rules), and a "Smart Show" panel that auto-generates all four views from the single OPM source of truth.

**Architecture:** Keep the existing React Flow canvas (`EntropyWorkspace.tsx`) as the OPM authoring surface. Add three pure-TypeScript modules with zero React dependencies so they are fully unit-testable with vitest: `OpmSimulationEngine.ts` (event-driven execution semantics), `OpmViewDeriver.ts` (derives structure/internal/behavior/requirements views), `SysmlToOpmImporter.ts` (migrates existing SysML state into OPM). Then add `SmartShowPanel.tsx` (the Smart Show UI) and rewire `EntropyWorkspace`'s ad-hoc `runSimTick` to the new engine. The canvas renderers `OPMNodeComponents.tsx` and `OPMEdgeComponents.tsx` are upgraded to ISO 19450 OPD notation (shapes, arrowheads, dashed event links, node internals), with `OpmLegend.tsx` as the on-canvas notation legend and `OpmLinkRules.ts` as the pure connection-rule validator.

**Tech Stack:** TypeScript, React 18, @xyflow/react (already present), vitest (already present). **No new npm dependencies.**

## Global Constraints

- Test runner: `npx vitest run <file>` (vitest ^4.1.5 already in devDependencies).
- No new dependencies — only `@xyflow/react`, `uuid`, `lucide-react`, `react` may be imported.
- Pure-TS modules (`OpmSimulationEngine.ts`, `OpmViewDeriver.ts`, `SysmlToOpmImporter.ts`) must NOT import React or any `.tsx` file.
- This workspace is **not a git repository** — skip every "Commit" step if `git rev-parse --git-dir` fails; otherwise commit with the given message.
- OPM semantics follow ISO 19450: objects hold states, processes transform objects, agent/instrument are enablers (not consumed), consumption destroys the source state, result creates the target state, effect changes the target state, condition gates execution, trigger fires on a state-entry event. Requirements are an extension (ISO 19450 has no native requirement construct): a `requirement` node kind plus `satisfies` / `verifies` links, documented in code and Help text.
- Existing behavior must not regress: `npx vitest run src/components/entropy/__tests__/entropy.test.ts` must pass after every task.

## File Structure

```
src/components/entropy/
├── EntropyTypes.ts            # MODIFY  — add 'requirement' node type, 'satisfies'/'verifies' links, requirementText
├── OpmSimulationEngine.ts     # CREATE  — pure simulation semantics (Tasks 2–4)
├── OpmViewDeriver.ts          # CREATE  — pure view derivation for Smart Show (Task 5)
├── SysmlToOpmImporter.ts      # CREATE  — SysML state → OPM model migration (Task 6)
├── OplParser.ts               # MODIFY  — requirement/satisfies OPL sentences (Task 7), initial-state flags (Task 12)
├── OpmLinkRules.ts            # CREATE  — pure ISO OPM connection-rule validator (Task 8)
├── OPMNodeComponents.tsx      # MODIFY  — ISO 19450 shapes + node internals (Task 9)
├── OPMEdgeComponents.tsx      # MODIFY  — ISO 19450 link glyphs (Task 10)
├── OpmLegend.tsx              # CREATE  — on-canvas ISO 19450 notation legend (Task 10)
├── SmartShowPanel.tsx         # CREATE  — Smart Show derived-views UI (Task 11)
├── EntropyWorkspace.tsx       # MODIFY  — wire engine + Smart Show + link rules (Tasks 11–12)
└── __tests__/
    ├── entropy.test.ts        # EXISTS  — must stay green
    ├── opmSimulationEngine.test.ts   # CREATE (Tasks 2–4)
    ├── opmViewDeriver.test.ts        # CREATE (Task 5)
    ├── sysmlToOpmImporter.test.ts    # CREATE (Task 6)
    ├── oplRequirements.test.ts       # CREATE (Task 7)
    └── opmLinkRules.test.ts          # CREATE (Task 8)
src/types/sysml_types.ts       # READ ONLY — SysMLDiagramState shape used by the importer
src/App.tsx                    # MODIFY — pass SysML state into EntropyWorkspace (Task 9)
```

---

### Task 1: Extend ENTROPY types for requirements and requirement links

**Files:**
- Modify: `src/components/entropy/EntropyTypes.ts`
- Test: `src/components/entropy/__tests__/entropy.test.ts` (append to existing file)

**Interfaces:**
- Produces: `OPMNodeType` gains `'requirement'`; `OPMLinkType` gains `'satisfies' | 'verifies'`; `OPMNodeData.requirementText?: string`. Later tasks import these.

- [ ] **Step 1: Write the failing type test**

Append to `src/components/entropy/__tests__/entropy.test.ts`:

```typescript
describe('ENTROPY requirement extensions', () => {
  test('requirement node type and satisfies link are assignable to OPM types', () => {
    const nodeType: OPMNodeType = 'requirement';
    const linkType: OPMLinkType = 'satisfies';
    const verifyType: OPMLinkType = 'verifies';
    const data: OPMNodeData = {
      name: 'Response_Time_Under_2s',
      type: 'requirement',
      physical: false,
      requirementText: 'System shall respond in under 2 seconds.',
    };
    expect(nodeType).toBe('requirement');
    expect(linkType).toBe('satisfies');
    expect(verifyType).toBe('verifies');
    expect(data.requirementText).toContain('2 seconds');
  });
});
```

Update the existing import line at the top of the file to include the new names:

```typescript
import { generateOpl, parseOpl } from '../OplParser';
import type { AppNode, AppEdge, OPMNodeType, OPMLinkType, OPMNodeData } from '../EntropyTypes';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/entropy/__tests__/entropy.test.ts`
Expected: FAIL — `'requirement' does not exist in type OPMNodeType`.

- [ ] **Step 3: Apply the type changes**

In `src/components/entropy/EntropyTypes.ts`:

```typescript
export type OPMNodeType = 'object' | 'process' | 'state' | 'requirement';
```

```typescript
export type OPMLinkType =
  // Structural Links
  | 'aggregation'
  | 'exhibition'
  | 'generalization'
  // Procedural Links
  | 'agent'
  | 'instrument'
  | 'consumption'
  | 'result'
  | 'effect'
  | 'trigger'
  | 'condition'
  // Requirement traceability (extension to ISO 19450 — see module docs)
  | 'satisfies'
  | 'verifies';
```

Add to `OPMNodeData` (after `attributes`):

```typescript
  // Requirement nodes only: the natural-language requirement statement
  requirementText?: string;
  // State nodes only: true for the first state of an object (ISO initial-state marker)
  isInitial?: boolean;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/entropy/__tests__/entropy.test.ts`
Expected: PASS (all tests, old and new).

- [ ] **Step 5: Commit** (skip if not a git repo)

```bash
git add src/components/entropy/EntropyTypes.ts src/components/entropy/__tests__/entropy.test.ts
git commit -m "feat(entropy): add requirement node type and satisfies/verifies link types"
```

---

### Task 2: Simulation engine — model state and initialization

**Files:**
- Create: `src/components/entropy/OpmSimulationEngine.ts`
- Test: `src/components/entropy/__tests__/opmSimulationEngine.test.ts`

**Interfaces:**
- Consumes: `AppNode`, `AppEdge` from `./EntropyTypes`.
- Produces (used by Tasks 3, 4, 8, 9): `OpmSimulationState`, `OpmEvent`, `OpmTraceEntry`, `OpmSimLog`, `createSimulationState(): OpmSimulationState`, `initializeSimulation(nodes: AppNode[]): OpmSimulationState`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/entropy/__tests__/opmSimulationEngine.test.ts`:

```typescript
import { describe, test, expect } from 'vitest';
import { createSimulationState, initializeSimulation } from '../OpmSimulationEngine';
import type { AppNode } from '../EntropyTypes';

// Fixture: Home_System with states [Off, On], plus a process
export function makeFixtureNodes(): AppNode[] {
  return [
    { id: 'sys', type: 'opmObject', position: { x: 0, y: 0 },
      data: { name: 'Home_System', type: 'object', physical: false, parentId: null,
        states: [
          { id: 'sys-off', name: 'Off', isActive: false },
          { id: 'sys-on', name: 'On', isActive: false },
        ] } },
    { id: 'sys-off', type: 'opmState', position: { x: 15, y: 45 }, parentId: 'sys',
      data: { name: 'Off', type: 'state', physical: false, parentId: 'sys', isActive: false } },
    { id: 'sys-on', type: 'opmState', position: { x: 105, y: 45 }, parentId: 'sys',
      data: { name: 'On', type: 'state', physical: false, parentId: 'sys', isActive: false } },
    { id: 'proc', type: 'opmProcess', position: { x: 300, y: 0 },
      data: { name: 'Activate', type: 'process', physical: false, parentId: null } },
  ];
}

describe('OpmSimulationEngine — state & initialization', () => {
  test('createSimulationState returns a fresh idle state', () => {
    const s = createSimulationState();
    expect(s.tick).toBe(0);
    expect(s.objectActiveState).toEqual({});
    expect(s.pendingEvents).toEqual([]);
    expect(s.trace).toEqual([]);
    expect(s.finished).toBe(false);
  });

  test('initializeSimulation activates the first state of every stateful object', () => {
    const s = initializeSimulation(makeFixtureNodes());
    expect(s.objectActiveState['sys']).toBe('sys-off');
  });

  test('initializeSimulation leaves stateless objects unmapped', () => {
    const s = initializeSimulation(makeFixtureNodes());
    expect(s.objectActiveState['proc']).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/entropy/__tests__/opmSimulationEngine.test.ts`
Expected: FAIL — `Cannot find module '../OpmSimulationEngine'`.

- [ ] **Step 3: Create the engine with initialization**

Create `src/components/entropy/OpmSimulationEngine.ts`:

```typescript
/**
 * ENTROPY OPM Simulation Engine (pure TypeScript, no React).
 *
 * Execution semantics per ISO 19450:
 *  - Objects hold exactly one active state (or none).
 *  - A process fires when ALL of its enablers hold:
 *      consumption  → the source state is currently active (and gets consumed)
 *      condition    → the source state is currently active (object unaffected)
 *      agent/instrument → the source object has an active state if it has any states
 *      trigger      → the source state entered (a pending event exists for it) AND is active
 *  - Firing applies postconditions:
 *      result  → target state becomes active (state created)
 *      effect  → target state becomes active (state changed)
 *      consumption → the source state is deactivated (state destroyed)
 *  - Every state entry emits an event usable by trigger links on the NEXT tick.
 *  - If several eligible processes consume the same state, the process whose name
 *    sorts first wins; the others are blocked that tick (deterministic conflict resolution).
 */
import type { AppNode, AppEdge } from './EntropyTypes';

export interface OpmEvent {
  stateId: string;
  objectId: string;
  tick: number;
}

export interface OpmTraceStateChange {
  objectId: string;
  fromStateId: string | null;
  toStateId: string | null;
}

export interface OpmTraceEntry {
  tick: number;
  processId: string;
  processName: string;
  kind: 'fired' | 'blocked';
  reason?: string;
  stateChanges: OpmTraceStateChange[];
}

export interface OpmSimLog {
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

export interface OpmSimulationState {
  tick: number;
  /** objectId -> active stateId, or null when the object has no active state */
  objectActiveState: Record<string, string | null>;
  pendingEvents: OpmEvent[];
  trace: OpmTraceEntry[];
  /** processId -> last tick at which the process changed any state (animation detection) */
  lastChangeTick: Record<string, number>;
  /** processId -> last blocked-reason that was logged (prevents log spam) */
  lastLoggedBlock: Record<string, string>;
  finished: boolean;
}

export function createSimulationState(): OpmSimulationState {
  return {
    tick: 0,
    objectActiveState: {},
    pendingEvents: [],
    trace: [],
    lastChangeTick: {},
    lastLoggedBlock: {},
    finished: false,
  };
}

export function initializeSimulation(nodes: AppNode[]): OpmSimulationState {
  const state = createSimulationState();
  nodes
    .filter(n => n.data.type === 'object')
    .forEach(obj => {
      const childStates = nodes.filter(
        n => n.data.type === 'state' && (n.parentId === obj.id || n.data.parentId === obj.id)
      );
      if (childStates.length > 0) {
        state.objectActiveState[obj.id] = childStates[0].id;
      }
    });
  return state;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/entropy/__tests__/opmSimulationEngine.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit** (skip if not a git repo)

```bash
git add src/components/entropy/OpmSimulationEngine.ts src/components/entropy/__tests__/opmSimulationEngine.test.ts
git commit -m "feat(entropy): simulation engine state model and initialization"
```

---

### Task 3: Simulation engine — eligibility evaluation and conflict resolution

**Files:**
- Modify: `src/components/entropy/OpmSimulationEngine.ts` (append)
- Test: `src/components/entropy/__tests__/opmSimulationEngine.test.ts` (append)

**Interfaces:**
- Consumes: `OpmSimulationState`, `OpmEvent` from Task 2.
- Produces (used by Task 4): `ProcessEligibility { eligible: string[]; blocked: Record<string, string> }`, `evaluateProcessEligibility(nodes, edges, objectActiveState, pendingEvents): ProcessEligibility`.

- [ ] **Step 1: Write the failing tests**

Append to `src/components/entropy/__tests__/opmSimulationEngine.test.ts`:

```typescript
import { evaluateProcessEligibility } from '../OpmSimulationEngine';
import type { AppEdge } from '../EntropyTypes';

function edge(id: string, source: string, target: string, type: string): AppEdge {
  return { id, source, target, data: { type } } as AppEdge;
}

describe('OpmSimulationEngine — eligibility', () => {
  test('process with agent + consumption is eligible only when the consumed state is active', () => {
    const nodes = makeFixtureNodes();
    // Activate System to 'On'
    const active = { sys: 'sys-on' as string | null };
    const edges = [
      edge('e1', 'sys', 'proc', 'agent'),
      edge('e2', 'sys-on', 'proc', 'consumption'),
    ];
    const r1 = evaluateProcessEligibility(nodes, edges, active, []);
    expect(r1.eligible).toContain('proc');
    const r2 = evaluateProcessEligibility(nodes, edges, { sys: 'sys-off' }, []);
    expect(r2.eligible).not.toContain('proc');
    expect(r2.blocked['proc']).toContain('consumed state');
  });

  test('condition link gates eligibility on the active state', () => {
    const nodes = makeFixtureNodes();
    const edges = [edge('e1', 'sys-off', 'proc', 'condition')];
    const r1 = evaluateProcessEligibility(nodes, edges, { sys: 'sys-off' }, []);
    expect(r1.eligible).toContain('proc');
    const r2 = evaluateProcessEligibility(nodes, edges, { sys: 'sys-on' }, []);
    expect(r2.eligible).not.toContain('proc');
  });

  test('trigger link requires a pending event for the source state', () => {
    const nodes = makeFixtureNodes();
    const edges = [edge('e1', 'sys-off', 'proc', 'trigger')];
    const noEvent = evaluateProcessEligibility(nodes, edges, { sys: 'sys-off' }, []);
    expect(noEvent.eligible).not.toContain('proc');
    const withEvent = evaluateProcessEligibility(
      nodes, edges, { sys: 'sys-off' },
      [{ stateId: 'sys-off', objectId: 'sys', tick: 3 }]
    );
    expect(withEvent.eligible).toContain('proc');
  });

  test('agent object with states must have one active (enabler, not consumed)', () => {
    const nodes = makeFixtureNodes();
    const edges = [edge('e1', 'sys', 'proc', 'agent')];
    const r = evaluateProcessEligibility(nodes, edges, { sys: null }, []);
    expect(r.eligible).not.toContain('proc');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/entropy/__tests__/opmSimulationEngine.test.ts`
Expected: FAIL — `evaluateProcessEligibility is not exported`.

- [ ] **Step 3: Implement eligibility evaluation**

Append to `src/components/entropy/OpmSimulationEngine.ts`:

```typescript
export interface ProcessEligibility {
  eligible: string[];
  /** processId -> human-readable reason it is blocked this tick */
  blocked: Record<string, string>;
}

function childStatesOf(nodes: AppNode[], objectId: string): AppNode[] {
  return nodes.filter(
    n => n.data.type === 'state' && (n.parentId === objectId || n.data.parentId === objectId)
  );
}

export function evaluateProcessEligibility(
  nodes: AppNode[],
  edges: AppEdge[],
  objectActiveState: Record<string, string | null>,
  pendingEvents: OpmEvent[]
): ProcessEligibility {
  const nodeById = new Map(nodes.map(n => [n.id, n] as const));
  const eligible: string[] = [];
  const blocked: Record<string, string> = {};

  nodes
    .filter(n => n.data.type === 'process')
    .forEach(proc => {
      let reason: string | null = null;

      const checkStateLink = (
        linkType: string,
        predicate: (stateNode: AppNode, isActive: boolean) => boolean,
        describe: (stateNode: AppNode) => string
      ): void => {
        if (reason) return;
        const links = edges.filter(e => e.target === proc.id && e.data?.type === linkType);
        for (const link of links) {
          const src = nodeById.get(link.source);
          if (!src || src.data.type !== 'state') continue; // object-level source: not checkable per-state
          const parentId = src.parentId || src.data.parentId || null;
          const isActive = parentId != null && objectActiveState[parentId] === src.id;
          if (!predicate(src, isActive)) {
            reason = describe(src);
            return;
          }
        }
      };

      // consumption: state must be active; it will be destroyed when the process fires
      checkStateLink(
        'consumption',
        (_s, isActive) => isActive,
        s => `consumed state [${s.data.name}] is not active`
      );

      // condition: state must be active
      checkStateLink(
        'condition',
        (_s, isActive) => isActive,
        s => `condition [${s.data.name}] is not met`
      );

      // trigger: a pending event for this state must exist AND the state must be active
      checkStateLink(
        'trigger',
        (s, isActive) =>
          isActive && pendingEvents.some(ev => ev.stateId === s.id),
        s => `waiting for trigger event [${s.data.name}]`
      );

      // agent / instrument: enabler — if the object has states, one must be active
      (['agent', 'instrument'] as const).forEach(linkType => {
        if (reason) return;
        const links = edges.filter(e => e.target === proc.id && e.data?.type === linkType);
        for (const link of links) {
          const src = nodeById.get(link.source);
          if (!src) continue;
          const states = childStatesOf(nodes, src.id);
          if (states.length === 0) continue; // stateless enabler is always available
          const active = objectActiveState[src.id] ?? null;
          if (!active) {
            reason = `enabler [${src.data.name}] has no active state`;
            return;
          }
        }
      });

      if (reason) blocked[proc.id] = reason;
      else eligible.push(proc.id);
    });

  return { eligible, blocked };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/entropy/__tests__/opmSimulationEngine.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit** (skip if not a git repo)

```bash
git add src/components/entropy/OpmSimulationEngine.ts src/components/entropy/__tests__/opmSimulationEngine.test.ts
git commit -m "feat(entropy): process eligibility evaluation with trigger/condition/enabler semantics"
```

---

### Task 4: Simulation engine — step function, events, animation detection, UI applier

**Files:**
- Modify: `src/components/entropy/OpmSimulationEngine.ts` (append)
- Test: `src/components/entropy/__tests__/opmSimulationEngine.test.ts` (append)

**Interfaces:**
- Consumes: everything from Tasks 2–3.
- Produces (used by Tasks 11–12): `OpmSimTickResult { state; firingProcessIds; logs }`, `stepSimulation(nodes, edges, prev): OpmSimTickResult`, `applySimResultToNodes(nodes, sim, firingProcessIds): AppNode[]`.

- [ ] **Step 1: Write the failing tests**

Append to `src/components/entropy/__tests__/opmSimulationEngine.test.ts`:

```typescript
import { stepSimulation, applySimResultToNodes, initializeSimulation } from '../OpmSimulationEngine';

describe('OpmSimulationEngine — step', () => {
  test('fired process yields the target state and emits an event', () => {
    const nodes = makeFixtureNodes();
    const edges = [
      edge('e1', 'sys', 'proc', 'agent'),
      edge('e2', 'sys-off', 'proc', 'consumption'),
      edge('e3', 'proc', 'sys-on', 'result'),
    ];
    const init = initializeSimulation(nodes); // sys -> sys-off
    const r = stepSimulation(nodes, edges, init);

    expect(r.firingProcessIds).toEqual(['proc']);
    expect(r.state.objectActiveState['sys']).toBe('sys-on');
    // 'On' entry emits an event for the next tick
    expect(r.state.pendingEvents.map(ev => ev.stateId)).toContain('sys-on');
    expect(r.state.tick).toBe(1);
    expect(r.state.trace[0].processId).toBe('proc');
    expect(r.state.trace[0].kind).toBe('fired');
  });

  test('without an enabler no process fires and the state becomes finished', () => {
    const nodes = makeFixtureNodes();
    const edges = [edge('e1', 'sys', 'proc', 'agent')];
    const init = initializeSimulation(nodes);
    const r = stepSimulation(nodes, edges, { ...init, objectActiveState: { sys: null } });
    expect(r.firingProcessIds).toEqual([]);
    expect(r.state.finished).toBe(true);
  });

  test('two processes consuming the same state resolve deterministically (name order)', () => {
    const nodes: AppNode[] = [
      ...makeFixtureNodes(),
      { id: 'proc-b', type: 'opmProcess', position: { x: 300, y: 150 },
        data: { name: 'Activate', type: 'process', physical: false, parentId: null } },
    ];
    // proc (id 'proc') and proc-b both consume sys-off
    const edges = [
      edge('e1', 'sys', 'proc', 'agent'),
      edge('e2', 'sys-off', 'proc', 'consumption'),
      edge('e3', 'sys', 'proc-b', 'agent'),
      edge('e4', 'sys-off', 'proc-b', 'consumption'),
    ];
    const init = initializeSimulation(nodes);
    const r = stepSimulation(nodes, edges, init);
    // Deterministic tie-break: identical names fall back to id order → 'proc' wins
    expect(r.firingProcessIds).toEqual(['proc']);
    expect(r.state.trace.some(t => t.processId === 'proc-b' && t.kind === 'blocked')).toBe(true);
  });

  test('triggered process fires only on the tick after its state event', () => {
    const nodes = makeFixtureNodes();
    // 'On' entry triggers proc; proc has no other enabler requirements
    const edges = [edge('e1', 'sys-on', 'proc', 'trigger')];
    const init = initializeSimulation(nodes);
    const r1 = stepSimulation(nodes, edges, init);
    expect(r1.firingProcessIds).toEqual([]); // no event yet
    // Simulate 'On' having been entered externally at tick 1
    const r2 = stepSimulation(nodes, edges, {
      ...r1.state,
      objectActiveState: { sys: 'sys-on' },
      pendingEvents: [{ stateId: 'sys-on', objectId: 'sys', tick: 1 }],
    });
    expect(r2.firingProcessIds).toEqual(['proc']);
  });

  test('applySimResultToNodes syncs isActive/isFiring onto React Flow nodes', () => {
    const nodes = makeFixtureNodes();
    const edges = [
      edge('e1', 'sys', 'proc', 'agent'),
      edge('e2', 'sys-off', 'proc', 'consumption'),
      edge('e3', 'proc', 'sys-on', 'result'),
    ];
    const init = initializeSimulation(nodes);
    const r = stepSimulation(nodes, edges, init);
    const updated = applySimResultToNodes(nodes, r.state, r.firingProcessIds);

    const onNode = updated.find(n => n.id === 'sys-on')!;
    const offNode = updated.find(n => n.id === 'sys-off')!;
    const procNode = updated.find(n => n.id === 'proc')!;
    expect((onNode.data as any).isActive).toBe(true);
    expect((offNode.data as any).isActive).toBe(false);
    expect((procNode.data as any).isFiring).toBe(true);
    const sysNode = updated.find(n => n.id === 'sys')!;
    expect(sysNode.data.states!.find(s => s.id === 'sys-on')!.isActive).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/entropy/__tests__/opmSimulationEngine.test.ts`
Expected: FAIL — `stepSimulation is not exported`.

- [ ] **Step 3: Implement the step function and applier**

Append to `src/components/entropy/OpmSimulationEngine.ts`:

```typescript
const ANIMATION_TICK_LIMIT = 5;

export interface OpmSimTickResult {
  state: OpmSimulationState;
  firingProcessIds: string[];
  logs: OpmSimLog[];
}

function stateNodeName(nodes: AppNode[], stateId: string): string {
  const s = nodes.find(n => n.id === stateId);
  return s ? s.data.name : stateId;
}

export function stepSimulation(
  nodes: AppNode[],
  edges: AppEdge[],
  prev: OpmSimulationState
): OpmSimTickResult {
  const tick = prev.tick + 1;
  const logs: OpmSimLog[] = [];
  const nodeById = new Map(nodes.map(n => [n.id, n] as const));
  const objectActiveState: Record<string, string | null> = { ...prev.objectActiveState };
  const processes = nodes.filter(n => n.data.type === 'process');
  const processById = new Map(processes.map(n => [n.id, n] as const));

  // 1. Eligibility
  const eligibility = evaluateProcessEligibility(nodes, edges, objectActiveState, prev.pendingEvents);

  // 2. Deterministic conflict resolution over consumed states
  const consumerOfState = new Map<string, string>(); // stateId -> winning processId
  const fired = new Set<string>();
  const blocked: Record<string, string> = { ...eligibility.blocked };

  const sortedEligible = [...eligibility.eligible].sort((a, b) => {
    const na = processById.get(a)?.data.name ?? '';
    const nb = processById.get(b)?.data.name ?? '';
    return na.localeCompare(nb) || a.localeCompare(b);
  });

  for (const procId of sortedEligible) {
    const conflict = edges.find(
      e => e.target === procId && e.data?.type === 'consumption' && consumerOfState.has(e.source)
    );
    if (conflict) {
      const winner = processById.get(consumerOfState.get(conflict.source)!);
      blocked[procId] = `lost conflict: state already consumed by [${winner?.data.name ?? '?'}]`;
    } else {
      fired.add(procId);
      edges
        .filter(e => e.target === procId && e.data?.type === 'consumption')
        .forEach(e => consumerOfState.set(e.source, procId));
    }
  }

  // 3. Postconditions of firing processes
  const nextActive = new Map<string, string>(); // objectId -> stateId
  const toDeactivate = new Set<string>();

  fired.forEach(procId => {
    edges
      .filter(e => e.source === procId && (e.data?.type === 'result' || e.data?.type === 'effect'))
      .forEach(e => {
        const tgt = nodeById.get(e.target);
        const parentId = tgt ? tgt.parentId || tgt.data.parentId : null;
        if (tgt && tgt.data.type === 'state' && parentId) {
          nextActive.set(parentId, tgt.id);
        }
      });
    edges
      .filter(e => e.target === procId && e.data?.type === 'consumption')
      .forEach(e => {
        const src = nodeById.get(e.source);
        if (src && src.data.type === 'state') toDeactivate.add(src.id);
      });
  });

  // 4. Apply state changes, emit events
  const stateChanges: OpmTraceStateChange[] = [];
  const newEvents: OpmEvent[] = [];

  nodes
    .filter(n => n.data.type === 'object')
    .forEach(obj => {
      const before = objectActiveState[obj.id] ?? null;
      let after = before;
      if (nextActive.has(obj.id)) after = nextActive.get(obj.id)!;
      else if (before && toDeactivate.has(before)) after = null;
      objectActiveState[obj.id] = after;

      if (before !== after) {
        stateChanges.push({ objectId: obj.id, fromStateId: before, toStateId: after });
        if (after) newEvents.push({ stateId: after, objectId: obj.id, tick });
        const fromName = before ? stateNodeName(nodes, before) : 'none';
        const toName = after ? stateNodeName(nodes, after) : 'none';
        logs.push({ type: 'success', message: `Object [${obj.data.name}]: ${fromName} → ${toName}` });
      }
    });

  // 5. Trace + logs (blocked reasons only logged when the reason changes — no spam)
  fired.forEach(procId => {
    logs.push({ type: 'info', message: `Process [${processById.get(procId)!.data.name}] fired.` });
  });
  Object.entries(blocked).forEach(([procId, reason]) => {
    const proc = processById.get(procId);
    if (proc && prev.lastLoggedBlock[procId] !== reason) {
      logs.push({ type: 'info', message: `Process [${proc.data.name}] blocked: ${reason}.` });
    }
  });

  // 6. Animation detection (process firing without changing anything = endless loop)
  const lastChangeTick = { ...prev.lastChangeTick };
  fired.forEach(procId => {
    if (stateChanges.length > 0) lastChangeTick[procId] = tick;
  });
  fired.forEach(procId => {
    const lastChange = lastChangeTick[procId] ?? tick;
    if (tick - lastChange >= ANIMATION_TICK_LIMIT) {
      logs.push({
        type: 'warning',
        message: `Process [${processById.get(procId)!.data.name}] is animating: fired ${
          tick - lastChange
        } ticks without changing any state.`,
      });
    }
  });

  const trace: OpmTraceEntry[] = [
    ...prev.trace,
    ...[...fired].map(procId => ({
      tick,
      processId: procId,
      processName: processById.get(procId)!.data.name,
      kind: 'fired' as const,
      stateChanges,
    })),
    ...Object.entries(blocked).map(([procId, reason]) => ({
      tick,
      processId: procId,
      processName: processById.get(procId)?.data.name ?? procId,
      kind: 'blocked' as const,
      reason,
      stateChanges: [] as OpmTraceStateChange[],
    })),
  ];

  const state: OpmSimulationState = {
    tick,
    objectActiveState,
    pendingEvents: newEvents,
    trace,
    lastChangeTick,
    lastLoggedBlock: { ...prev.lastLoggedBlock, ...blocked },
    finished: fired.size === 0 && newEvents.length === 0,
  };

  return { state, firingProcessIds: [...fired], logs };
}

export function applySimResultToNodes(
  nodes: AppNode[],
  sim: OpmSimulationState,
  firingProcessIds: string[]
): AppNode[] {
  return nodes.map(n => {
    if (n.data.type === 'process') {
      const isFiring = firingProcessIds.includes(n.id);
      return isFiring !== Boolean((n.data as any).isFiring)
        ? { ...n, data: { ...n.data, isFiring } }
        : n;
    }
    if (n.data.type === 'state') {
      const parentId = n.parentId || n.data.parentId || null;
      const isActive = parentId != null && sim.objectActiveState[parentId] === n.id;
      return isActive !== Boolean((n.data as any).isActive)
        ? { ...n, data: { ...n.data, isActive } }
        : n;
    }
    if (n.data.type === 'object') {
      const activeId = sim.objectActiveState[n.id] ?? null;
      const states = (n.data.states || []).map(s => ({ ...s, isActive: s.id === activeId }));
      return { ...n, data: { ...n.data, states } };
    }
    return n;
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/entropy/__tests__/opmSimulationEngine.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Regression — existing tests still green**

Run: `npx vitest run src/components/entropy/__tests__/entropy.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit** (skip if not a git repo)

```bash
git add src/components/entropy/OpmSimulationEngine.ts src/components/entropy/__tests__/opmSimulationEngine.test.ts
git commit -m "feat(entropy): event-driven step semantics, conflict resolution, animation detection"
```

---

### Task 5: View deriver — Smart Show data (structure / internal / behavior / requirements)

**Files:**
- Create: `src/components/entropy/OpmViewDeriver.ts`
- Test: `src/components/entropy/__tests__/opmViewDeriver.test.ts`

**Interfaces:**
- Consumes: `AppNode`, `AppEdge` from `./EntropyTypes`.
- Produces (used by Task 11): `deriveStructureView`, `deriveBehaviorView`, `deriveRequirementsView`, `deriveInternalView` — signatures below.

- [ ] **Step 1: Write the failing tests**

Create `src/components/entropy/__tests__/opmViewDeriver.test.ts`:

```typescript
import { describe, test, expect } from 'vitest';
import {
  deriveStructureView,
  deriveBehaviorView,
  deriveRequirementsView,
  deriveInternalView,
} from '../OpmViewDeriver';
import type { AppNode, AppEdge } from '../EntropyTypes';

function obj(id: string, name: string, parentId: string | null = null): AppNode {
  return { id, type: 'opmObject', position: { x: 0, y: 0 },
    data: { name, type: 'object', physical: false, parentId } };
}
function req(id: string, name: string): AppNode {
  return { id, type: 'opmObject' as any, position: { x: 0, y: 0 },
    data: { name, type: 'requirement', physical: false, parentId: null, requirementText: 'shall work' } };
}
function proc(id: string, name: string): AppNode {
  return { id, type: 'opmProcess', position: { x: 0, y: 0 },
    data: { name, type: 'process', physical: false, parentId: null } };
}
function edge(id: string, source: string, target: string, type: string): AppEdge {
  return { id, source, target, data: { type } } as AppEdge;
}

const nodes: AppNode[] = [
  obj('sys', 'Home_System'),
  obj('sensor', 'Sensor'),
  obj('hvac', 'HVAC'),
  proc('p1', 'Monitor'),
  proc('p2', 'Regulate'),
  req('r1', 'Fast_Response'),
];
const edges: AppEdge[] = [
  edge('e1', 'sys', 'sensor', 'aggregation'),
  edge('e2', 'sys', 'hvac', 'aggregation'),
  edge('e3', 'sensor', 'p1', 'agent'),
  edge('e4', 'r1', 'p2', 'satisfies'),
];

describe('OpmViewDeriver — structure (replaces BDD)', () => {
  test('builds an aggregation tree with Home_System as root', () => {
    const tree = deriveStructureView(nodes, edges);
    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe('Home_System');
    expect(tree[0].children.map(c => c.name).sort()).toEqual(['HVAC', 'Sensor']);
  });
});

describe('OpmViewDeriver — behavior (replaces state machine)', () => {
  test('collects result/consumption transitions per object', () => {
    const sysState: AppNode = { id: 's-on', type: 'opmState', position: { x: 0, y: 0 }, parentId: 'sys',
      data: { name: 'On', type: 'state', physical: false, parentId: 'sys' } };
    const behavior = deriveBehaviorView([nodes[0], sysState, proc('p3', 'Switch_On')], [
      edge('e5', 'p3', 's-on', 'result'),
      edge('e6', 's-on', 'p3', 'consumption'),
    ]);
    const sys = behavior.find(b => b.objectName === 'Home_System')!;
    expect(sys.transitions).toHaveLength(2);
    expect(sys.transitions.some(t => t.kind === 'result' && t.processName === 'Switch_On')).toBe(true);
    expect(sys.transitions.some(t => t.kind === 'consumption' && t.fromStateId === 's-on')).toBe(true);
  });
});

describe('OpmViewDeriver — requirements (replaces requirements diagram)', () => {
  test('lists satisfied elements per requirement', () => {
    const trace = deriveRequirementsView(nodes, edges);
    expect(trace).toHaveLength(1);
    expect(trace[0].requirementName).toBe('Fast_Response');
    expect(trace[0].satisfiedBy).toEqual([{ id: 'p2', name: 'Regulate', kind: 'process' }]);
  });
});

describe('OpmViewDeriver — internal view (replaces IBD)', () => {
  test('splits links of a process into inputs and outputs', () => {
    const view = deriveInternalView(nodes, [...edges, edge('e7', 'p2', 'hvac', 'effect')], 'p2');
    expect(view!.processName).toBe('Regulate');
    expect(view!.inputs).toEqual([{ peerId: 'r1', peerName: 'Fast_Response', peerType: 'requirement', linkType: 'satisfies', direction: 'in' }]);
    expect(view!.outputs).toEqual([{ peerId: 'hvac', peerName: 'HVAC', peerType: 'object', linkType: 'effect', direction: 'out' }]);
  });

  test('returns null for unknown process id', () => {
    expect(deriveInternalView(nodes, edges, 'nope')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/entropy/__tests__/opmViewDeriver.test.ts`
Expected: FAIL — `Cannot find module '../OpmViewDeriver'`.

- [ ] **Step 3: Implement the deriver**

Create `src/components/entropy/OpmViewDeriver.ts`:

```typescript
/**
 * Smart Show view derivation: every classic SysML diagram view is derived
 * from the single OPM model (ISO 19450) instead of being authored separately.
 *  - Structure view      (replaces SysML BDD)  ← aggregation/generalization links
 *  - Internal view       (replaces SysML IBD)  ← a process and its procedural links
 *  - Behavior view       (replaces state machine) ← result/effect/consumption per object
 *  - Requirements view   (replaces requirements diagram) ← satisfies/verifies links
 * Pure TypeScript, no React.
 */
import type { AppNode, AppEdge, OPMLinkType } from './EntropyTypes';

export interface OpmStructureNode {
  id: string;
  name: string;
  kind: 'object' | 'requirement';
  physical: boolean;
  children: OpmStructureNode[];
}

export function deriveStructureView(nodes: AppNode[], edges: AppEdge[]): OpmStructureNode[] {
  const byId = new Map(nodes.map(n => [n.id, n] as const));
  const structural = edges.filter(
    e => e.data?.type === 'aggregation' || e.data?.type === 'generalization'
  );
  const childIds = new Set(structural.map(e => e.target));
  const visited = new Set<string>();

  const build = (n: AppNode): OpmStructureNode => {
    visited.add(n.id);
    return {
      id: n.id,
      name: n.data.name,
      kind: n.data.type === 'requirement' ? 'requirement' : 'object',
      physical: !!n.data.physical,
      children: structural
        .filter(e => e.source === n.id)
        .map(e => byId.get(e.target))
        .filter((c): c is AppNode => !!c && !visited.has(c.id))
        .map(build),
    };
  };

  return nodes
    .filter(n => (n.data.type === 'object' || n.data.type === 'requirement') && !childIds.has(n.id))
    .map(build);
}

export interface OpmBehaviorTransition {
  processId: string;
  processName: string;
  fromStateId: string | null;
  toStateId: string | null;
  kind: 'result' | 'effect' | 'consumption';
}

export interface OpmBehaviorObject {
  objectId: string;
  objectName: string;
  stateIds: string[];
  transitions: OpmBehaviorTransition[];
}

export function deriveBehaviorView(nodes: AppNode[], edges: AppEdge[]): OpmBehaviorObject[] {
  const nodeById = new Map(nodes.map(n => [n.id, n] as const));
  return nodes
    .filter(n => n.data.type === 'object')
    .map(obj => {
      const childStates = nodes.filter(
        n => n.data.type === 'state' && (n.parentId === obj.id || n.data.parentId === obj.id)
      );
      const stateIds = new Set(childStates.map(s => s.id));
      const transitions: OpmBehaviorTransition[] = [];

      edges.forEach(e => {
        const kind = e.data?.type as OpmBehaviorTransition['kind'];
        const isOutbound = kind === 'result' || kind === 'effect';
        const proc = isOutbound ? nodeById.get(e.source) : nodeById.get(e.target);
        if (!proc || proc.data.type !== 'process') return;
        if (isOutbound && stateIds.has(e.target)) {
          transitions.push({
            processId: proc.id, processName: proc.data.name,
            fromStateId: null, toStateId: e.target, kind,
          });
        } else if (kind === 'consumption' && stateIds.has(e.source)) {
          transitions.push({
            processId: proc.id, processName: proc.data.name,
            fromStateId: e.source, toStateId: null, kind,
          });
        }
      });

      return { objectId: obj.id, objectName: obj.data.name, stateIds: childStates.map(s => s.id), transitions };
    });
}

export interface OpmRequirementTrace {
  requirementId: string;
  requirementName: string;
  requirementText: string;
  satisfiedBy: { id: string; name: string; kind: string }[];
}

export function deriveRequirementsView(nodes: AppNode[], edges: AppEdge[]): OpmRequirementTrace[] {
  return nodes
    .filter(n => n.data.type === 'requirement')
    .map(r => {
      const satisfiedBy = edges
        .filter(e => e.source === r.id && (e.data?.type === 'satisfies' || e.data?.type === 'verifies'))
        .map(e => {
          const t = nodes.find(n => n.id === e.target);
          return t ? { id: t.id, name: t.data.name, kind: t.data.type } : null;
        })
        .filter((x): x is { id: string; name: string; kind: string } => !!x);
      return {
        requirementId: r.id,
        requirementName: r.data.name,
        requirementText: (r.data as any).requirementText || '',
        satisfiedBy,
      };
    });
}

export interface OpmInternalPort {
  peerId: string;
  peerName: string;
  peerType: string;
  linkType: OPMLinkType;
  direction: 'in' | 'out';
}

export interface OpmInternalView {
  processId: string;
  processName: string;
  inputs: OpmInternalPort[];
  outputs: OpmInternalPort[];
}

export function deriveInternalView(
  nodes: AppNode[],
  edges: AppEdge[],
  processId: string
): OpmInternalView | null {
  const proc = nodes.find(n => n.id === processId && n.data.type === 'process');
  if (!proc) return null;

  const portOf = (e: AppEdge, direction: 'in' | 'out'): OpmInternalPort | null => {
    const peer = nodes.find(n => n.id === (direction === 'in' ? e.source : e.target));
    if (!peer) return null;
    return {
      peerId: peer.id,
      peerName: peer.data.name,
      peerType: peer.data.type,
      linkType: (e.data?.type ?? 'condition') as OPMLinkType,
      direction,
    };
  };

  return {
    processId: proc.id,
    processName: proc.data.name,
    inputs: edges.filter(e => e.target === processId).map(e => portOf(e, 'in')).filter((p): p is OpmInternalPort => !!p),
    outputs: edges.filter(e => e.source === processId).map(e => portOf(e, 'out')).filter((p): p is OpmInternalPort => !!p),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/entropy/__tests__/opmViewDeriver.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit** (skip if not a git repo)

```bash
git add src/components/entropy/OpmViewDeriver.ts src/components/entropy/__tests__/opmViewDeriver.test.ts
git commit -m "feat(entropy): derive structure/behavior/requirements/internal views from OPM model"
```

---

### Task 6: SysML → OPM importer (migrate existing BDD/IBD/Requirements models)

**Files:**
- Create: `src/components/entropy/SysmlToOpmImporter.ts`
- Test: `src/components/entropy/__tests__/sysmlToOpmImporter.test.ts`

**Interfaces:**
- Consumes: `SysMLDiagramState` from `src/types/sysml_types.ts`.
- Produces: `importSysmlToOpm(state: SysMLDiagramState): { nodes: AppNode[]; edges: AppEdge[]; warnings: string[] }` (used by Task 12).

- [ ] **Step 1: Write the failing tests**

Create `src/components/entropy/__tests__/sysmlToOpmImporter.test.ts`:

```typescript
import { describe, test, expect } from 'vitest';
import { importSysmlToOpm } from '../SysmlToOpmImporter';
import type { SysMLDiagramState } from '../../../types/sysml_types';

const sample: SysMLDiagramState = {
  blocks: [
    { id: 'b1', name: 'Air_Fryer', stereotype: 'block', x: 0, y: 0, width: 120, height: 60,
      properties: [], operations: [], constraints: [], classes: [], ports: [] },
    { id: 'b2', name: 'Heater', stereotype: 'block', x: 0, y: 0, width: 120, height: 60,
      properties: [], operations: [], constraints: [], classes: [], ports: [] },
  ],
  ports: [],
  parts: [],
  connectors: [],
  requirements: [
    { id: 'r1', name: 'Heat_Quickly', stereotype: 'requirement', x: 0, y: 0, width: 120, height: 60,
      properties: [], operations: [], constraints: [], classes: [], ports: [],
      reqId: 'REQ-01', description: 'Reach 200C in under 5 minutes' },
  ],
  relations: [
    { id: 'rel1', sourceId: 'b1', targetId: 'b2', type: 'composition', label: '' },
    { id: 'rel2', sourceId: 'r1', targetId: 'b2', type: 'satisfy', label: '' },
    { id: 'rel3', sourceId: 'b2', targetId: 'b1', type: 'generalization', label: '' },
  ],
};

describe('SysmlToOpmImporter', () => {
  test('converts blocks to objects and requirements to requirement nodes', () => {
    const { nodes, errors } = { ...importSysmlToOpm(sample), errors: [] as string[] };
    expect(nodes.find(n => n.data.name === 'Air_Fryer')?.data.type).toBe('object');
    const r = nodes.find(n => n.data.name === 'Heat_Quickly');
    expect(r?.data.type).toBe('requirement');
    expect((r?.data as any).requirementText).toBe('Reach 200C in under 5 minutes');
    expect(errors).toHaveLength(0);
  });

  test('maps composition → aggregation, satisfy → satisfies, generalization → generalization', () => {
    const { edges } = importSysmlToOpm(sample);
    const types = edges.map(e => [e.data?.type, e.source, e.target]);
    expect(types).toContainEqual(['aggregation', 'b1', 'b2']);
    expect(types).toContainEqual(['satisfies', 'r1', 'b2']);
    expect(types).toContainEqual(['generalization', 'b2', 'b1']);
  });

  test('warns about unmapped relationship types instead of dropping them silently', () => {
    const withAllocation: SysMLDiagramState = {
      ...sample,
      relations: [{ id: 'x', sourceId: 'b1', targetId: 'b2', type: 'allocation', label: '' }],
    };
    const { edges, warnings } = importSysmlToOpm(withAllocation);
    expect(edges).toHaveLength(0);
    expect(warnings.some(w => w.includes('allocation'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/entropy/__tests__/sysmlToOpmImporter.test.ts`
Expected: FAIL — `Cannot find module '../SysmlToOpmImporter'`.

- [ ] **Step 3: Implement the importer**

Create `src/components/entropy/SysmlToOpmImporter.ts`:

```typescript
/**
 * One-time migration: converts an existing SysML diagram state into an OPM
 * (ISO 19450) model so the ENTROPY workspace can become the single source of truth.
 *
 * Mapping:
 *   block (stereotype 'block')          → object node
 *   requirement block                   → requirement node (requirementText = description)
 *   composition / aggregation relation   → aggregation link
 *   generalization relation              → generalization link
 *   satisfy / verify relation            → satisfies / verifies link (requirement → target)
 *   ports + connectors                   → NOT auto-mapped; reported as a warning
 *   association / allocation / others    → warning (author decides the OPM equivalent)
 */
import type { AppNode, AppEdge, OPMLinkType } from './EntropyTypes';
import type { SysMLDiagramState } from '../../types/sysml_types';

const RELATION_MAP: Record<string, { link: OPMLinkType; flip?: boolean } | undefined> = {
  composition: { link: 'aggregation' },
  aggregation: { link: 'aggregation' },
  generalization: { link: 'generalization', flip: true },
  satisfy: { link: 'satisfies' },
  verify: { link: 'verifies' },
};

export function importSysmlToOpm(state: SysMLDiagramState): {
  nodes: AppNode[];
  edges: AppEdge[];
  warnings: string[];
} {
  const nodes: AppNode[] = [];
  const edges: AppEdge[] = [];
  const warnings: string[] = [];
  const requirementIds = new Set(state.requirements.map(r => r.id));

  const makeNode = (
    id: string,
    name: string,
    type: 'object' | 'requirement',
    x: number,
    y: number,
    extra: Record<string, unknown> = {}
  ): AppNode => ({
    id,
    type: 'opmObject', // requirement nodes render via opmObject with data.type === 'requirement'
    position: { x, y },
    data: { name, type, physical: false, parentId: null, ...extra },
  });

  let reqX = 80;
  state.blocks
    .filter(b => !requirementIds.has(b.id))
    .forEach(b => {
      nodes.push(makeNode(b.id, b.name, 'object', b.x, b.y, {
        attributes: (b.properties || []).map(p => ({ key: p.name, value: p.defaultValue ?? p.type })),
      }));
    });

  state.requirements.forEach(r => {
    nodes.push(makeNode(r.id, r.name, 'requirement', reqX, 420, {
      requirementText: r.description || r.text || '',
    }));
    reqX += 200;
  });

  const relationSource = state.relations ?? [];
  relationSource.forEach(rel => {
    const mapped = RELATION_MAP[rel.type];
    if (!mapped) {
      warnings.push(
        `Relationship [${rel.type}] from ${rel.sourceId} to ${rel.targetId} has no automatic OPM equivalent — model it manually (e.g. as an instrument or effect link).`
      );
      return;
    }
    const source = mapped.flip ? rel.targetId : rel.sourceId;
    const target = mapped.flip ? rel.sourceId : rel.targetId;
    edges.push({
      id: `imp-${rel.id}`,
      source,
      target,
      data: { type: mapped.link },
    } as AppEdge);
  });

  if ((state.connectors?.length ?? 0) > 0) {
    warnings.push(
      `${state.connectors.length} IBD connector(s) were not auto-mapped: in OPM, model the exchanged items as processes with consumption/result links between the owning objects.`
    );
  }

  return { nodes, edges, warnings };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/entropy/__tests__/sysmlToOpmImporter.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit** (skip if not a git repo)

```bash
git add src/components/entropy/SysmlToOpmImporter.ts src/components/entropy/__tests__/sysmlToOpmImporter.test.ts
git commit -m "feat(entropy): SysML-to-OPM migration importer"
```

---

### Task 7: OPL — requirement sentences and satisfies links (bimodal sync)

**Files:**
- Modify: `src/components/entropy/OplParser.ts`
- Test: `src/components/entropy/__tests__/oplRequirements.test.ts`

**Interfaces:**
- Consumes: existing `generateOpl` / `parseOpl`.
- Produces: OPL sentences `Requirement <Name>.`, `Requirement <Name> is physical.` (never generated, parse-only tolerance), `<X> satisfies <Req>.`, `<X> verifies <Req>.`; parser round-trips them into `requirement` nodes and `satisfies`/`verifies` edges.

- [ ] **Step 1: Write the failing tests**

Create `src/components/entropy/__tests__/oplRequirements.test.ts`:

```typescript
import { describe, test, expect } from 'vitest';
import { generateOpl, parseOpl } from '../OplParser';
import type { AppNode, AppEdge } from '../EntropyTypes';

const nodes: AppNode[] = [
  { id: 'p1', type: 'opmProcess', position: { x: 0, y: 0 },
    data: { name: 'Regulate', type: 'process', physical: false } },
  { id: 'r1', type: 'opmObject', position: { x: 0, y: 0 },
    data: { name: 'Fast_Response', type: 'requirement', physical: false,
      requirementText: 'System shall respond in under 2 seconds.' } },
];
const edges: AppEdge[] = [
  { id: 'e1', source: 'r1', target: 'p1', data: { type: 'satisfies' } },
];

describe('OPL requirement support', () => {
  test('generateOpl emits Requirement declaration and satisfies sentence', () => {
    const opl = generateOpl(nodes, edges);
    expect(opl).toContain('Requirement Fast_Response.');
    expect(opl).toContain('Fast_Response satisfies Regulate.');
  });

  test('parseOpl round-trips requirement declarations and satisfies links', () => {
    const { nodes: parsed, edges: parsedEdges, errors } = parseOpl(
      'Requirement Fast_Response.\nFast_Response satisfies Regulate.\nProcess Regulate.'
    );
    expect(errors).toHaveLength(0);
    expect(parsed.find(n => n.data.name === 'Fast_Response')?.data.type).toBe('requirement');
    expect(parsedEdges.find(e => e.data?.type === 'satisfies')).toBeTruthy();
  });

  test('parseOpl parses verifies links', () => {
    const { edges: parsedEdges, errors } = parseOpl(
      'Requirement Fast_Response.\nProcess Regulate.\nFast_Response verifies Regulate.'
    );
    expect(errors).toHaveLength(0);
    expect(parsedEdges.find(e => e.data?.type === 'verifies')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/entropy/__tests__/oplRequirements.test.ts`
Expected: FAIL — generated OPL lacks requirement sentences.

- [ ] **Step 3: Update generateOpl**

In `generateOpl` (`src/components/entropy/OplParser.ts`):

3a. In the node-grouping section, add after `const states = ...`:

```typescript
  const requirements = nodes.filter(n => n.data.type === 'requirement');
  const nonRequirementObjects = objects.filter(o => o.data.type !== 'requirement');
```

and change the objects-declaration loop to iterate `nonRequirementObjects` instead of `objects`.

3b. Add a requirements declaration block right after the objects loop:

```typescript
  // 1b. Requirement declarations (extension to ISO 19450)
  requirements.forEach(req => {
    sentences.push(`Requirement ${req.data.name}.`);
  });
```

3c. In the edges switch, add cases before `default:`:

```typescript
      case 'satisfies':
        sentences.push(`${srcName} satisfies ${tgtName}.`);
        break;
      case 'verifies':
        sentences.push(`${srcName} verifies ${tgtName}.`);
        break;
```

- [ ] **Step 4: Update parseOpl**

In `parseOpl` (`src/components/entropy/OplParser.ts`), in the FIRST pass (declarations), add before the `Process` declaration matcher:

```typescript
    // Requirement declaration
    // Requirement [Name].
    match = line.match(/^Requirement\s+(.+?)\.$/i);
    if (match) {
      const node = getOrCreateNode(match[1], 'requirement');
      node.type = 'opmObject'; // rendered by opmObject; data.type distinguishes
      return;
    }
```

`getOrCreateNode` maps `'requirement'` through `type === 'state' ? 'opmState' : type === 'process' ? 'opmProcess' : 'opmObject'`, which already resolves to `opmObject` — keep it as-is.

In the SECOND pass (links), add before the final unmatched-error fallback (right after the `conditions` matchers):

```typescript
    // 11. Satisfies / verifies traceability links
    match = line.match(/^(.+?)\s+(satisfies|verifies)\s+(.+?)\.$/i);
    if (match) {
      matched = true;
      const src = getOrCreateNode(match[1], 'requirement');
      src.type = 'opmObject';
      const tgtNode = nodes.find(n => n.id === src.id) ?? src;
      const target = getOrCreateNode(match[3], 'object');
      edges.push({
        id: `e-${src.id}-${target.id}`,
        source: src.id,
        target: target.id,
        sourceHandle: 'std-out',
        targetHandle: 'res-in',
        data: { type: match[2].toLowerCase() as 'satisfies' | 'verifies' }
      });
      void tgtNode;
      return;
    }
```

Also update the skip-fast-path at the bottom of pass two to accept requirements:

```typescript
    if (line.match(/^Object\s+[^.]+\.$/i) || line.match(/^Process\s+[^.]+\.$/i) || line.match(/^Requirement\s+[^.]+\.$/i)) {
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/components/entropy/__tests__/oplRequirements.test.ts src/components/entropy/__tests__/entropy.test.ts`
Expected: PASS (both files — new tests and the existing bimodal sync suite).

- [ ] **Step 6: Commit** (skip if not a git repo)

```bash
git add src/components/entropy/OplParser.ts src/components/entropy/__tests__/oplRequirements.test.ts
git commit -m "feat(entropy): OPL requirement declarations and satisfies/verifies links"
```

---

### Task 8: ISO 19450 connection rules (which links may connect which things)

**Files:**
- Create: `src/components/entropy/OpmLinkRules.ts`
- Test: `src/components/entropy/__tests__/opmLinkRules.test.ts`

**Interfaces:**
- Consumes: `OPMLinkType`, `OPMNodeType` from `./EntropyTypes`.
- Produces (used by Task 12): `validateOpmConnection(linkType: OPMLinkType, sourceType: OPMNodeType, targetType: OPMNodeType): OpmConnectionVerdict` where `OpmConnectionVerdict = { allowed: boolean; reason?: string }`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/entropy/__tests__/opmLinkRules.test.ts`:

```typescript
import { describe, test, expect } from 'vitest';
import { validateOpmConnection } from '../OpmLinkRules';

describe('OpmLinkRules — ISO 19450 connection rules', () => {
  test('agent/instrument connect object → process only', () => {
    expect(validateOpmConnection('agent', 'object', 'process').allowed).toBe(true);
    expect(validateOpmConnection('instrument', 'object', 'process').allowed).toBe(true);
    expect(validateOpmConnection('agent', 'process', 'object').allowed).toBe(false);
    expect(validateOpmConnection('instrument', 'object', 'object').allowed).toBe(false);
  });

  test('consumption connects object/state → process', () => {
    expect(validateOpmConnection('consumption', 'object', 'process').allowed).toBe(true);
    expect(validateOpmConnection('consumption', 'state', 'process').allowed).toBe(true);
    expect(validateOpmConnection('consumption', 'process', 'object').allowed).toBe(false);
    expect(validateOpmConnection('consumption', 'object', 'state').allowed).toBe(false);
  });

  test('result connects process → object/state', () => {
    expect(validateOpmConnection('result', 'process', 'object').allowed).toBe(true);
    expect(validateOpmConnection('result', 'process', 'state').allowed).toBe(true);
    expect(validateOpmConnection('result', 'object', 'process').allowed).toBe(false);
  });

  test('effect connects process and object/state in either direction', () => {
    expect(validateOpmConnection('effect', 'process', 'object').allowed).toBe(true);
    expect(validateOpmConnection('effect', 'state', 'process').allowed).toBe(true);
    expect(validateOpmConnection('effect', 'object', 'object').allowed).toBe(false);
  });

  test('trigger/condition connect state (or object) → process', () => {
    expect(validateOpmConnection('trigger', 'state', 'process').allowed).toBe(true);
    expect(validateOpmConnection('condition', 'object', 'process').allowed).toBe(true);
    expect(validateOpmConnection('trigger', 'process', 'object').allowed).toBe(false);
  });

  test('structural links connect two objects', () => {
    expect(validateOpmConnection('aggregation', 'object', 'object').allowed).toBe(true);
    expect(validateOpmConnection('generalization', 'object', 'object').allowed).toBe(true);
    expect(validateOpmConnection('exhibition', 'object', 'object').allowed).toBe(true);
    expect(validateOpmConnection('aggregation', 'object', 'process').allowed).toBe(false);
  });

  test('satisfies/verifies connect requirement → object/process', () => {
    expect(validateOpmConnection('satisfies', 'requirement', 'object').allowed).toBe(true);
    expect(validateOpmConnection('verifies', 'requirement', 'process').allowed).toBe(true);
    expect(validateOpmConnection('satisfies', 'object', 'requirement').allowed).toBe(false);
  });

  test('rejected verdicts carry a human-readable reason', () => {
    const v = validateOpmConnection('agent', 'process', 'object');
    expect(v.allowed).toBe(false);
    expect(v.reason).toContain('Agent');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/entropy/__tests__/opmLinkRules.test.ts`
Expected: FAIL — `Cannot find module '../OpmLinkRules'`.

- [ ] **Step 3: Implement the rules**

Create `src/components/entropy/OpmLinkRules.ts`:

```typescript
/**
 * ISO 19450 connection rules: which OPM link roles are allowed between
 * which node kinds. Pure TypeScript — used by the canvas `onConnect` gate.
 */
import type { OPMLinkType, OPMNodeType } from './EntropyTypes';

export interface OpmConnectionVerdict {
  allowed: boolean;
  reason?: string;
}

const OBJECTISH: OPMNodeType[] = ['object', 'requirement'];

export function validateOpmConnection(
  linkType: OPMLinkType,
  sourceType: OPMNodeType,
  targetType: OPMNodeType
): OpmConnectionVerdict {
  const srcIsObjectish = OBJECTISH.includes(sourceType);
  const tgtIsObjectish = OBJECTISH.includes(targetType);

  switch (linkType) {
    case 'agent':
    case 'instrument':
      if (srcIsObjectish && targetType === 'process') return { allowed: true };
      return {
        allowed: false,
        reason: `${linkType === 'agent' ? 'Agent' : 'Instrument'} links connect an Object (the enabler) to a Process.`,
      };
    case 'consumption':
      if ((srcIsObjectish || sourceType === 'state') && targetType === 'process') return { allowed: true };
      return { allowed: false, reason: 'Consumption links connect an Object or State to the Process that consumes it.' };
    case 'result':
      if (sourceType === 'process' && (tgtIsObjectish || targetType === 'state')) return { allowed: true };
      return { allowed: false, reason: 'Result links connect a Process to the Object or State it yields.' };
    case 'effect':
      if (sourceType === 'process' && (tgtIsObjectish || targetType === 'state')) return { allowed: true };
      if (srcIsObjectish && targetType === 'process') return { allowed: true };
      return { allowed: false, reason: 'Effect links connect a Process with the Object or State it changes.' };
    case 'trigger':
    case 'condition':
      if ((srcIsObjectish || sourceType === 'state') && targetType === 'process') return { allowed: true };
      return { allowed: false, reason: `${linkType === 'trigger' ? 'Trigger' : 'Condition'} links connect a State (or Object) to the Process it gates.` };
    case 'aggregation':
    case 'generalization':
    case 'exhibition':
      if (srcIsObjectish && tgtIsObjectish) return { allowed: true };
      return { allowed: false, reason: `Structural ${linkType} links connect two Objects.` };
    case 'satisfies':
    case 'verifies':
      if (sourceType === 'requirement' && (tgtIsObjectish || targetType === 'process')) return { allowed: true };
      return { allowed: false, reason: `${linkType === 'satisfies' ? 'Satisfies' : 'Verifies'} links connect a Requirement to the Object or Process that fulfills it.` };
    default:
      return { allowed: true };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/entropy/__tests__/opmLinkRules.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit** (skip if not a git repo)

```bash
git add src/components/entropy/OpmLinkRules.ts src/components/entropy/__tests__/opmLinkRules.test.ts
git commit -m "feat(entropy): ISO 19450 link connection rules"
```

---

### Task 9: ISO 19450 node shapes and node internals

**Files:**
- Modify: `src/components/entropy/OPMNodeComponents.tsx` (replace the three exported components; keep the `renderOPMPort` helper and `getHandleColor` unchanged)

**Interfaces:**
- Consumes: `OPMNodeData.isInitial` (Task 1), `OPMNodeData.requirementText` (Task 1), `data.states` with `isActive`.
- Produces: the same component exports as before (`OPMObjectNode`, `OPMProcessNode`, `OPMStateNode`) — no signature changes, so `EntropyWorkspace` needs no import edits.

Notation decisions (ISO 19450 OPD):
- **Object** = rectangle (rounded corners for on-screen readability). Physical things carry a **thick solid border (3px)** — this replaces the current non-standard dashed border; informational things keep a thin border.
- **Process** = ellipse (already correct — kept).
- **State** = rounded rectangle (not a full pill) with a small **filled dot marker on the initial state**; the active state keeps the amber highlight.
- **Requirement** = object-shaped node rendered in purple with a `«Requirement»` tag and the requirement text INSIDE the shape.
- **Node internals:** objects show their states as chips and their attributes inside the rectangle; requirements show their text; zoomed-in processes show an In/Out port summary inside the ellipse.

- [ ] **Step 1: Replace `OPMObjectNode` (adds requirement branch, ISO thick border for physical, states/attributes inside)**

```tsx
// Custom Object Node Component (also renders Requirement nodes per the extension)
export const OPMObjectNode: React.FC<NodeProps<AppNode>> = ({ id, data, selected }) => {
  const isRequirement = data.type === 'requirement';
  const isPhysical = data.physical;
  const isZoomedIn = data.zoomedIn;
  const updateNodeInternals = useUpdateNodeInternals();

  const allPorts = React.useMemo(() => [
    ...(data.inputs || []),
    ...(data.outputs || [])
  ], [data.inputs, data.outputs]);

  React.useEffect(() => {
    updateNodeInternals(id);
  }, [id, allPorts.length, data.inputs, data.outputs, updateNodeInternals]);

  const leftPorts = allPorts.filter(p => p.position === 'left');
  const rightPorts = allPorts.filter(p => p.position === 'right');
  const topPorts = allPorts.filter(p => p.position === 'top');
  const bottomPorts = allPorts.filter(p => p.position === 'bottom');

  // ISO 19450: physical things get a THICK border, informational things a thin one.
  const borderClass = selected
    ? isRequirement
      ? 'border-2 border-purple-400 shadow-[0_0_20px_rgba(192,132,252,0.4)] bg-purple-950/40'
      : 'border-2 border-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.4)] bg-emerald-950/40'
    : isRequirement
      ? 'border border-purple-500/70 bg-[#190d24]/80'
      : isPhysical
        ? 'border-[3px] border-emerald-400/90 bg-[#0d1f14]/80'
        : 'border border-emerald-600/70 bg-[#0d1f14]/80';

  return (
    <div
      className={`relative rounded-lg px-4 py-3 min-w-[150px] min-h-[85px] flex flex-col justify-between transition-all duration-300 backdrop-blur-md shadow-md ${borderClass}`}
      style={{ width: '100%', height: '100%' }}
    >
      <NodeResizer minWidth={120} minHeight={60} isVisible={selected} lineStyle={{ borderColor: isRequirement ? '#c084fc' : '#10b981' }} handleStyle={{ background: isRequirement ? '#c084fc' : '#10b981', border: 'none', borderRadius: '4px' }} />

      {/* Header tag */}
      <div className={`flex items-center justify-between border-b pb-1 mb-1.5 select-none ${isRequirement ? 'border-purple-800/40' : 'border-emerald-800/40'}`}>
        <span className={`text-[9px] uppercase tracking-wider font-extrabold ${isRequirement ? 'text-purple-400/90' : 'text-emerald-400/80'}`}>
          {isRequirement ? '«Requirement»' : 'Object'}
        </span>
        {isPhysical && !isRequirement && (
          <span className="text-[8px] px-1 py-0.5 rounded bg-emerald-900/50 border border-emerald-700/50 text-emerald-300 font-semibold scale-90">Physical</span>
        )}
      </div>

      {isRequirement ? (
        /* Requirement internals: the statement lives INSIDE the shape */
        <div className="flex-1 overflow-y-auto custom-scrollbar text-[10px] leading-snug text-purple-100/90 italic px-1 py-0.5 select-none">
          {(data as any).requirementText || data.name}
        </div>
      ) : (
        <>
          <div className="flex-1 flex items-center justify-center relative px-1 py-1">
            <div className="text-sm font-bold text-emerald-100 text-center px-2 py-0.5 select-none">
              {data.name}
            </div>
          </div>

          {/* States live INSIDE the object (ISO 19450) */}
          {(data.states || []).length > 0 && (
            <div className="flex flex-wrap gap-1 mb-1 z-10">
              {(data.states || []).map(s => (
                <span
                  key={s.id}
                  className={`text-[8px] px-1.5 py-0.5 rounded-full border ${
                    s.isActive
                      ? 'bg-amber-500 text-black border-amber-300 font-bold'
                      : 'border-emerald-700/50 text-emerald-300/80'
                  }`}
                >
                  {s.name}{s.isActive ? ' ●' : ''}
                </span>
              ))}
            </div>
          )}

          {/* Attributes Listing */}
          {data.attributes && data.attributes.length > 0 && (
            <div className="mt-1.5 border-t border-emerald-900/40 pt-1 space-y-0.5 text-[9px] font-mono text-emerald-400/90 z-10">
              {data.attributes.map((attr, idx) => (
                <div key={idx} className="flex justify-between hover:bg-emerald-950/20 px-1 rounded transition-colors">
                  <span>{attr.key}:</span>
                  <span className="text-emerald-200">{attr.value}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {isZoomedIn && (
        <div className="mt-4 border-t border-emerald-800/20 pt-2 text-[10px] text-[#666] italic text-center">
          In-Body Detail Area (Drag elements here)
        </div>
      )}

      {/* Ports placed absolutely on boundaries */}
      {leftPorts.map((p, idx) => renderOPMPort(p, idx, leftPorts.length, false))}
      {rightPorts.map((p, idx) => renderOPMPort(p, idx, rightPorts.length, false))}
      {topPorts.map((p, idx) => renderOPMPort(p, idx, topPorts.length, false))}
      {bottomPorts.map((p, idx) => renderOPMPort(p, idx, bottomPorts.length, false))}
    </div>
  );
};
```

- [ ] **Step 2: Replace `OPMProcessNode` (adds the In/Out summary inside the ellipse when zoomed in)**

```tsx
// Custom Process Node Component
export const OPMProcessNode: React.FC<NodeProps<AppNode>> = ({ id, data, selected }) => {
  const isPhysical = data.physical;
  const isZoomedIn = data.zoomedIn;
  const isFiring = (data as any).isFiring;
  const updateNodeInternals = useUpdateNodeInternals();

  const allPorts = React.useMemo(() => [
    ...(data.inputs || []),
    ...(data.outputs || [])
  ], [data.inputs, data.outputs]);

  React.useEffect(() => {
    updateNodeInternals(id);
  }, [id, allPorts.length, data.inputs, data.outputs, updateNodeInternals]);

  const leftPorts = allPorts.filter(p => p.position === 'left');
  const rightPorts = allPorts.filter(p => p.position === 'right');
  const topPorts = allPorts.filter(p => p.position === 'top');
  const bottomPorts = allPorts.filter(p => p.position === 'bottom');

  return (
    <div
      className={`relative px-6 py-4 min-w-[140px] min-h-[80px] flex flex-col items-center justify-center transition-all duration-300 ${
        selected
          ? 'border-2 border-sky-400 shadow-[0_0_20px_rgba(56,189,248,0.5)] bg-sky-950/50'
          : isFiring
          ? 'border-2 border-orange-400 bg-sky-900/60 shadow-[0_0_25px_rgba(251,146,60,0.8)] scale-105 animate-pulse'
          : 'border border-sky-600/70 bg-[#0c1a24]/80 backdrop-blur-md shadow-md'
      } ${
        isPhysical
          ? 'border-[3px] border-sky-400/90'
          : ''
      }`}
      style={{
        borderRadius: '50%',
        width: '100%',
        height: '100%',
      }}
    >
      <NodeResizer minWidth={120} minHeight={60} isVisible={selected} lineStyle={{ borderColor: '#0284c7' }} handleStyle={{ background: '#0284c7', border: 'none', borderRadius: '4px' }} />

      <div className="text-center z-10 select-none">
        <span className="text-[8px] uppercase tracking-widest font-black text-sky-400/60 block mb-0.5">Process</span>
        <div className="text-sm font-extrabold text-sky-100 px-3">
          {data.name}
        </div>
      </div>

      {/* Zoomed-in internals: the process's procedural link summary INSIDE the ellipse */}
      {isZoomedIn && (
        <div className="absolute inset-x-5 bottom-2 flex justify-center gap-1 flex-wrap z-10">
          {(data.inputs || []).slice(0, 4).map(p => (
            <span key={p.id} className="text-[7px] px-1 py-0.5 rounded bg-black/50 border border-sky-800/60 text-sky-300/90 font-mono">→ {p.name}</span>
          ))}
          {(data.outputs || []).slice(0, 4).map(p => (
            <span key={p.id} className="text-[7px] px-1 py-0.5 rounded bg-black/50 border border-emerald-800/60 text-emerald-300/90 font-mono">{p.name} →</span>
          ))}
        </div>
      )}

      {/* Ports placed absolutely on ellipse boundaries */}
      {leftPorts.map((p, idx) => renderOPMPort(p, idx, leftPorts.length, true))}
      {rightPorts.map((p, idx) => renderOPMPort(p, idx, rightPorts.length, true))}
      {topPorts.map((p, idx) => renderOPMPort(p, idx, topPorts.length, true))}
      {bottomPorts.map((p, idx) => renderOPMPort(p, idx, bottomPorts.length, true))}
    </div>
  );
};
```

- [ ] **Step 3: Replace `OPMStateNode` (rounded-rectangle shape + initial-state dot)**

```tsx
// Custom State Node Component
export const OPMStateNode: React.FC<NodeProps<AppNode>> = ({ id, data, selected }) => {
  const isActive = (data as any).isActive;
  const isInitial = Boolean((data as any).isInitial);
  const updateNodeInternals = useUpdateNodeInternals();

  const allPorts = React.useMemo(() => [
    ...(data.inputs || []),
    ...(data.outputs || [])
  ], [data.inputs, data.outputs]);

  React.useEffect(() => {
    updateNodeInternals(id);
  }, [id, allPorts.length, data.inputs, data.outputs, updateNodeInternals]);

  const leftPorts = allPorts.filter(p => p.position === 'left');
  const rightPorts = allPorts.filter(p => p.position === 'right');
  const topPorts = allPorts.filter(p => p.position === 'top');
  const bottomPorts = allPorts.filter(p => p.position === 'bottom');

  return (
    <div
      className={`relative rounded-lg px-3 py-1.5 min-w-[75px] min-h-[28px] flex items-center justify-center border transition-all duration-300 ${
        selected
          ? 'border-orange-400 bg-orange-950/70 shadow-[0_0_12px_rgba(251,146,60,0.5)] scale-105'
          : isActive
          ? 'border-orange-400 bg-gradient-to-r from-orange-500 to-amber-500 text-black font-extrabold shadow-[0_0_18px_rgba(249,115,22,0.85)] scale-105'
          : 'border-orange-900/40 bg-gradient-to-br from-[#1a0e05]/90 to-[#0e0803]/90 text-orange-200/80 hover:border-orange-500/50 hover:bg-[#1a0e05]'
      }`}
      style={{
        width: '100%',
        height: '100%',
      }}
    >
      <div className={`text-[10px] font-bold text-center select-none flex items-center justify-center gap-1.5 ${isActive ? 'text-black font-black' : 'text-orange-200/90'}`}>
        {/* ISO initial-state marker: small filled dot */}
        {isInitial && <span title="Initial state" className="w-1.5 h-1.5 rounded-full bg-current opacity-70 shrink-0" />}
        {isActive && <span className="w-1.5 h-1.5 rounded-full bg-black/60 animate-ping border border-black/40" />}
        <span>{data.name}</span>
      </div>

      {/* Ports placed absolutely on boundaries */}
      {leftPorts.map((p, idx) => renderOPMPort(p, idx, leftPorts.length, false))}
      {rightPorts.map((p, idx) => renderOPMPort(p, idx, rightPorts.length, false))}
      {topPorts.map((p, idx) => renderOPMPort(p, idx, topPorts.length, false))}
      {bottomPorts.map((p, idx) => renderOPMPort(p, idx, bottomPorts.length, false))}
    </div>
  );
};
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors in `OPMNodeComponents.tsx`.

- [ ] **Step 5: Commit** (skip if not a git repo)

```bash
git add src/components/entropy/OPMNodeComponents.tsx
git commit -m "feat(entropy): ISO 19450 node shapes and internals (physical thick border, requirement shape, states/attrs inside)"
```

---

### Task 10: ISO 19450 link glyphs + on-canvas notation legend

**Files:**
- Modify: `src/components/entropy/OPMEdgeComponents.tsx` (full replacement)
- Create: `src/components/entropy/OpmLegend.tsx`

**Interfaces:**
- Produces: `OPMEdge` (same export signature), `OpmLegend` (no props) — `OpmLegend` is mounted in Task 12.

Glyph decisions (ISO 19450 OPD; color stays as a tool-specific secondary cue — the SHAPE carries the standard meaning):
- Enabler links (solid): **agent** = filled arrowhead, **instrument** = hollow arrowhead.
- Transforming links (solid): **consumption**, **result** = filled arrowhead; **effect** = filled arrowhead on BOTH ends (the process changes the object in either direction).
- Event links (dashed): **trigger** = dashed + filled arrowhead, **condition** = dashed + hollow arrowhead.
- Structural links (solid, glyph at the source/whole end): **aggregation** = filled triangle, **generalization** = hollow triangle, **exhibition** = filled circle.
- Requirement traceability (dashed, extension): **satisfies** / **verifies** = dashed + filled arrowhead.
- Also fixes an existing bug: `strokeDasharray` was declared but never applied, so dashed event links never rendered dashed.

- [ ] **Step 1: Replace `OPMEdgeComponents.tsx` entirely**

```tsx
import React from 'react';
import { EdgeProps, getBezierPath } from '@xyflow/react';
import { OPMEdgeData, type AppEdge } from './EntropyTypes';

/**
 * ISO 19450 OPD link notation:
 *  - Enabler links: agent = filled arrowhead, instrument = hollow arrowhead
 *  - Transforming links: consumption / result = filled arrowhead;
 *    effect = filled arrowheads on both ends (changes the object either way)
 *  - Event links: trigger = dashed + filled arrowhead, condition = dashed + hollow arrowhead
 *  - Structural links (glyph at the source/whole end): aggregation = filled triangle,
 *    generalization = hollow triangle, exhibition = filled circle
 *  - Requirement traceability (extension): satisfies / verifies = dashed + filled arrowhead
 * Colors are a tool-specific secondary cue; the shape carries the standard meaning.
 */

type MarkerKind = 'filled' | 'hollow' | 'none';

interface LinkStyle {
  stroke: string;
  dashed?: boolean;
  end?: MarkerKind;
  start?: MarkerKind;
  structuralStart?: 'triangle-filled' | 'triangle-hollow' | 'circle-filled';
}

const LINK_STYLES: Record<string, LinkStyle> = {
  agent:         { stroke: '#38bdf8', end: 'filled' },
  instrument:    { stroke: '#38bdf8', end: 'hollow' },
  consumption:   { stroke: '#94a3b8', end: 'filled' },
  result:        { stroke: '#10b981', end: 'filled' },
  effect:        { stroke: '#ec4899', end: 'filled', start: 'filled' },
  trigger:       { stroke: '#f59e0b', dashed: true, end: 'filled' },
  condition:     { stroke: '#c084fc', dashed: true, end: 'hollow' },
  aggregation:   { stroke: '#10b981', structuralStart: 'triangle-filled' },
  generalization:{ stroke: '#10b981', structuralStart: 'triangle-hollow' },
  exhibition:    { stroke: '#10b981', structuralStart: 'circle-filled' },
  satisfies:     { stroke: '#c084fc', dashed: true, end: 'filled' },
  verifies:      { stroke: '#c084fc', dashed: true, end: 'filled' },
};

// A single component that can render all custom edges based on the OPM link type.
export const OPMEdge: React.FC<EdgeProps<AppEdge>> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  data,
  markerEnd,
  selected,
}) => {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const linkType = data?.type || 'consumption';
  const ls = LINK_STYLES[linkType] ?? { stroke: '#94a3b8', end: 'filled' as MarkerKind };
  const dash = ls.dashed ? '6 4' : undefined;

  return (
    <>
      {/* SVG Marker Definitions self-contained for each edge */}
      <svg className="absolute w-0 h-0">
        <defs>
          {ls.end === 'filled' && (
            <marker id={`m-filled-${id}`} markerWidth="10" markerHeight="7" refX="8" refY="3.5" orient="auto" markerUnits="strokeWidth">
              <polygon points="0 0, 10 3.5, 0 7" fill={ls.stroke} />
            </marker>
          )}
          {ls.end === 'hollow' && (
            <marker id={`m-hollow-${id}`} markerWidth="10" markerHeight="7" refX="8" refY="3.5" orient="auto" markerUnits="strokeWidth">
              <polygon points="0 0, 10 3.5, 0 7" fill="#0d0d0d" stroke={ls.stroke} strokeWidth="1.2" />
            </marker>
          )}
          {ls.start === 'filled' && (
            <marker id={`m-sfilled-${id}`} markerWidth="10" markerHeight="7" refX="2" refY="3.5" orient="auto-start-reverse" markerUnits="strokeWidth">
              <polygon points="0 0, 10 3.5, 0 7" fill={ls.stroke} />
            </marker>
          )}
          {ls.structuralStart === 'triangle-filled' && (
            <marker id={`m-tri-f-${id}`} markerWidth="12" markerHeight="12" refX="2" refY="6" orient="auto-start-reverse">
              <polygon points="10 2, 2 6, 10 10" fill={ls.stroke} stroke={ls.stroke} strokeWidth="1" />
            </marker>
          )}
          {ls.structuralStart === 'triangle-hollow' && (
            <marker id={`m-tri-h-${id}`} markerWidth="12" markerHeight="12" refX="2" refY="6" orient="auto-start-reverse">
              <polygon points="10 2, 2 6, 10 10" fill="#0d0d0d" stroke={ls.stroke} strokeWidth="1.5" />
            </marker>
          )}
          {ls.structuralStart === 'circle-filled' && (
            <marker id={`m-cir-f-${id}`} markerWidth="12" markerHeight="12" refX="3" refY="6" orient="auto-start-reverse">
              <circle cx="6" cy="6" r="4" fill={ls.stroke} />
            </marker>
          )}
        </defs>
      </svg>

      {/* Background thicker glow path */}
      <path
        id={`${id}-glow`}
        d={edgePath}
        fill="none"
        stroke={selected ? '#fb923c' : (data?.isActiveFlow ? ls.stroke : '#27272a')}
        strokeWidth={selected ? 5 : (data?.isActiveFlow ? 5.5 : 2.5)}
        strokeOpacity={selected ? 0.35 : (data?.isActiveFlow ? 0.6 : 0.05)}
        className="transition-all duration-300 pointer-events-none"
        style={{
          filter: (selected || data?.isActiveFlow) ? `drop-shadow(0 0 5px ${selected ? '#fb923c' : ls.stroke})` : undefined
        }}
      />

      {/* Main Edge Path */}
      <path
        id={id}
        style={{
          ...style,
          stroke: selected ? '#fb923c' : (data?.isActiveFlow ? ls.stroke : '#52525b'),
          strokeWidth: selected ? 2.5 : (data?.isActiveFlow ? 2.2 : 1.2),
          strokeDasharray: dash,
        }}
        className="react-flow__edge-path transition-all duration-300"
        d={edgePath}
        markerEnd={
          ls.end === 'filled' ? `url(#m-filled-${id})`
          : ls.end === 'hollow' ? `url(#m-hollow-${id})`
          : markerEnd
        }
        markerStart={
          ls.structuralStart === 'triangle-filled' ? `url(#m-tri-f-${id})`
          : ls.structuralStart === 'triangle-hollow' ? `url(#m-tri-h-${id})`
          : ls.structuralStart === 'circle-filled' ? `url(#m-cir-f-${id})`
          : ls.start === 'filled' ? `url(#m-sfilled-${id})`
          : undefined
        }
      />

      {/* Thick invisible interaction path to make clicking/hovering easy */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={15}
        className="react-flow__edge-interaction cursor-pointer"
      />

      {/* Moving Signal Particle / Pulse (only on active execution flows) */}
      {data?.isActiveFlow && (
        <circle r="3.5" fill="#ffffff" style={{ filter: 'drop-shadow(0 0 5px #ffffff)' }}>
          <animateMotion
            dur="1.2s"
            repeatCount="indefinite"
            path={edgePath}
            calcMode="linear"
          />
        </circle>
      )}

      {/* Edge label if present */}
      {data?.label && (
        <text className="text-[10px] font-semibold font-mono" fill="#e0e0e0">
          <textPath href={`#${id}`} startOffset="50%" textAnchor="middle">
            {data.label}
          </textPath>
        </text>
      )}

      {/* Condition specification text */}
      {data?.conditionText && (
        <g transform={`translate(${labelX}, ${labelY - 10})`}>
          <rect x="-40" y="-8" width="80" height="16" rx="3" fill="#1e1b4b" stroke="#ec4899" strokeWidth="0.5" opacity="0.9" />
          <text fontSize="8" fontWeight="bold" fill="#fbcfe8" textAnchor="middle" dominantBaseline="middle">
            {data.conditionText}
          </text>
        </g>
      )}
    </>
  );
};
```

- [ ] **Step 2: Create the on-canvas legend**

Create `src/components/entropy/OpmLegend.tsx`:

```tsx
import React, { useState } from 'react';
import { BookOpen, ChevronDown } from 'lucide-react';

interface LegendRow {
  label: string;
  kind:
    | 'solid-filled' | 'solid-hollow' | 'double-filled'
    | 'dashed-filled' | 'dashed-hollow'
    | 'tri-filled' | 'tri-hollow' | 'circle';
}

const Glyph: React.FC<{ kind: LegendRow['kind'] }> = ({ kind }) => {
  const c = '#9ca3af';
  const dashed = kind.startsWith('dashed') ? '4 3' : undefined;
  let head: React.ReactNode;
  if (kind === 'solid-filled' || kind === 'dashed-filled') {
    head = <polygon points="26 4.5, 33 8, 26 11.5" fill={c} />;
  } else if (kind === 'solid-hollow' || kind === 'dashed-hollow') {
    head = <polygon points="26 4.5, 33 8, 26 11.5" fill="#141414" stroke={c} strokeWidth="1.2" />;
  } else if (kind === 'double-filled') {
    head = (
      <>
        <polygon points="26 4.5, 33 8, 26 11.5" fill={c} />
        <polygon points="8 4.5, 1 8, 8 11.5" fill={c} />
      </>
    );
  } else if (kind === 'tri-filled') {
    head = <polygon points="8 2, 1 8, 8 14" fill={c} />;
  } else if (kind === 'tri-hollow') {
    head = <polygon points="8 2, 1 8, 8 14" fill="#141414" stroke={c} strokeWidth="1.2" />;
  } else {
    head = <circle cx="4.5" cy="8" r="3.5" fill={c} />;
  }
  return (
    <svg width="34" height="16" className="shrink-0">
      <line x1="6" y1="8" x2="26" y2="8" stroke={c} strokeWidth="1.5" strokeDasharray={dashed} />
      {head}
    </svg>
  );
};

const SECTIONS: { title: string; rows: LegendRow[] }[] = [
  {
    title: 'Procedural',
    rows: [
      { label: 'Agent — executes', kind: 'solid-filled' },
      { label: 'Instrument — uses', kind: 'solid-hollow' },
      { label: 'Consumption', kind: 'solid-filled' },
      { label: 'Result', kind: 'solid-filled' },
      { label: 'Effect — changes', kind: 'double-filled' },
    ],
  },
  {
    title: 'Event',
    rows: [
      { label: 'Trigger', kind: 'dashed-filled' },
      { label: 'Condition', kind: 'dashed-hollow' },
    ],
  },
  {
    title: 'Structural',
    rows: [
      { label: 'Aggregation (whole)', kind: 'tri-filled' },
      { label: 'Generalization', kind: 'tri-hollow' },
      { label: 'Exhibition', kind: 'circle' },
      { label: 'Satisfies / Verifies', kind: 'dashed-filled' },
    ],
  },
];

export const OpmLegend: React.FC = () => {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="absolute bottom-3 left-3 z-10 flex items-center gap-1.5 bg-[#161616]/90 border border-[#2d2d2d] rounded-md px-2 py-1 text-[10px] text-[#999] hover:text-white shadow-lg"
        title="ISO 19450 OPD notation legend"
      >
        <BookOpen size={11} /> ISO 19450 Notation
      </button>
    );
  }

  return (
    <div className="absolute bottom-3 left-3 z-10 w-56 bg-[#141414]/95 backdrop-blur-md border border-[#2d2d2d] rounded-lg p-2.5 shadow-xl">
      <button
        onClick={() => setOpen(false)}
        className="w-full flex items-center justify-between text-[10px] uppercase font-extrabold tracking-wider text-orange-400 mb-1.5"
      >
        ISO 19450 Notation <ChevronDown size={12} />
      </button>
      {SECTIONS.map(s => (
        <div key={s.title} className="mb-1.5">
          <div className="text-[8px] uppercase text-[#666] font-bold mb-0.5">{s.title}</div>
          {s.rows.map(r => (
            <div key={r.label} className="flex items-center gap-1.5 py-[1px]">
              <Glyph kind={r.kind} />
              <span className="text-[9px] text-[#bbb]">{r.label}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors in `OPMEdgeComponents.tsx` / `OpmLegend.tsx`.

- [ ] **Step 4: Commit** (skip if not a git repo)

```bash
git add src/components/entropy/OPMEdgeComponents.tsx src/components/entropy/OpmLegend.tsx
git commit -m "feat(entropy): ISO 19450 link glyphs and on-canvas notation legend"
```

---

### Task 11: Smart Show panel UI

**Files:**
- Create: `src/components/entropy/SmartShowPanel.tsx`
- Modify: `src/components/entropy/EntropyWorkspace.tsx` (mount the panel; exact edits in Task 12 to keep tasks independent — this task only creates the component)

**Interfaces:**
- Consumes: `deriveStructureView`, `deriveBehaviorView`, `deriveRequirementsView`, `deriveInternalView` from `./OpmViewDeriver`; `OpmSimulationState` from `./OpmSimulationEngine`; `AppNode`, `AppEdge` from `./EntropyTypes`.
- Produces: `SmartShowPanel({ nodes, edges, simState, simRunning, onSelectProcess })` — exported component.

- [ ] **Step 1: Create the component**

Create `src/components/entropy/SmartShowPanel.tsx`:

```tsx
import React, { useMemo, useState } from 'react';
import {
  deriveStructureView,
  deriveBehaviorView,
  deriveRequirementsView,
  deriveInternalView,
  OpmStructureNode,
} from './OpmViewDeriver';
import type { OpmSimulationState } from './OpmSimulationEngine';
import type { AppNode, AppEdge } from './EntropyTypes';
import { Boxes, Network, ListChecks, GitBranch, Activity } from 'lucide-react';

type SmartTab = 'structure' | 'internal' | 'behavior' | 'requirements';

interface SmartShowPanelProps {
  nodes: AppNode[];
  edges: AppEdge[];
  simState: OpmSimulationState;
  simRunning: boolean;
  onSelectProcess?: (processId: string) => void;
}

const StructureTree: React.FC<{ nodes: OpmStructureNode[]; depth?: number }> = ({ nodes, depth = 0 }) => (
  <div style={{ paddingLeft: depth * 14 }}>
    {nodes.map(n => (
      <div key={n.id} className="py-0.5">
        <span className={`text-[11px] font-mono ${n.kind === 'requirement' ? 'text-purple-400' : n.physical ? 'text-emerald-300' : 'text-[#ccc]'}`}>
          {n.kind === 'requirement' ? '◆ ' : n.physical ? '■ ' : '□ '}{n.name}
        </span>
        {n.children.length > 0 && <StructureTree nodes={n.children} depth={depth + 1} />}
      </div>
    ))}
  </div>
);

export const SmartShowPanel: React.FC<SmartShowPanelProps> = ({ nodes, edges, simState, simRunning, onSelectProcess }) => {
  const [tab, setTab] = useState<SmartTab>('structure');
  const [internalProcessId, setInternalProcessId] = useState<string | null>(null);

  const processes = useMemo(() => nodes.filter(n => n.data.type === 'process'), [nodes]);
  const structure = useMemo(() => deriveStructureView(nodes, edges), [nodes, edges]);
  const behavior = useMemo(() => deriveBehaviorView(nodes, edges), [nodes, edges]);
  const requirements = useMemo(() => deriveRequirementsView(nodes, edges), [nodes, edges]);
  const internal = useMemo(
    () => (internalProcessId ? deriveInternalView(nodes, edges, internalProcessId) : null),
    [nodes, edges, internalProcessId]
  );

  const tabs: { id: SmartTab; label: string; icon: React.ReactNode; hint: string }[] = [
    { id: 'structure', label: 'Structure', icon: <Boxes size={11} />, hint: 'replaces BDD' },
    { id: 'internal', label: 'Internal', icon: <Network size={11} />, hint: 'replaces IBD' },
    { id: 'behavior', label: 'Behavior', icon: <GitBranch size={11} />, hint: 'replaces State Machine' },
    { id: 'requirements', label: 'Requirements', icon: <ListChecks size={11} />, hint: 'replaces Req. diagram' },
  ];

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between border-b border-[#2d2d2d] pb-1.5">
        <span className="text-xs uppercase font-extrabold tracking-wider text-sky-400 flex items-center gap-1.5">
          <Activity size={12} /> Smart Show
        </span>
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${simRunning ? 'bg-green-950 text-green-400' : 'bg-[#222] text-[#777]'}`}>
          {simRunning ? `LIVE · t=${simState.tick}` : 'STATIC'}
        </span>
      </div>

      <div className="flex flex-wrap gap-1 py-1.5">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            title={t.hint}
            className={`px-1.5 py-0.5 text-[9px] rounded border transition-colors ${
              tab === t.id
                ? 'bg-sky-950/60 border-sky-500 text-sky-300'
                : 'border-[#333] text-[#888] hover:bg-[#222]'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar text-[11px]">
        {tab === 'structure' && <StructureTree nodes={structure} />}

        {tab === 'internal' && (
          <div className="space-y-2">
            <select
              value={internalProcessId ?? ''}
              onChange={(e) => setInternalProcessId(e.target.value || null)}
              className="w-full bg-[#0f0f0f] border border-[#333] rounded text-[10px] py-1 px-1.5 text-[#ccc]"
            >
              <option value="">— select process —</option>
              {processes.map(p => (
                <option key={p.id} value={p.id}>{p.data.name}</option>
              ))}
            </select>
            {internal && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-[9px] uppercase font-bold text-[#777] mb-1">In</div>
                  {internal.inputs.map((p, i) => (
                    <div key={i} className="bg-[#1a1a1a] rounded px-1.5 py-0.5 mb-0.5 font-mono text-[10px]">
                      <span className="text-sky-400">{p.linkType}</span> ← {p.peerName}
                    </div>
                  ))}
                </div>
                <div>
                  <div className="text-[9px] uppercase font-bold text-[#777] mb-1">Out</div>
                  {internal.outputs.map((p, i) => (
                    <div key={i} className="bg-[#1a1a1a] rounded px-1.5 py-0.5 mb-0.5 font-mono text-[10px]">
                      <span className="text-emerald-400">{p.linkType}</span> → {p.peerName}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'behavior' && behavior.map(b => (
          <div key={b.objectId} className="mb-2">
            <div className="text-[10px] font-bold text-orange-400 mb-0.5">{b.objectName}</div>
            {b.transitions.length === 0 && <div className="text-[10px] text-[#555] pl-2">no transitions</div>}
            {b.transitions.map((t, i) => {
              const toName = t.toStateId ? nodes.find(n => n.id === t.toStateId)?.data.name : '∅';
              const fromName = t.fromStateId ? nodes.find(n => n.id === t.fromStateId)?.data.name : '•';
              const active = t.toStateId ? simState.objectActiveState[b.objectId] === t.toStateId : false;
              return (
                <button
                  key={i}
                  onClick={() => onSelectProcess?.(t.processId)}
                  className={`w-full text-left font-mono text-[10px] px-1.5 py-0.5 rounded mb-0.5 ${
                    active && simRunning ? 'bg-green-950/60 text-green-300' : 'bg-[#1a1a1a] text-[#bbb] hover:bg-[#222]'
                  }`}
                >
                  {fromName} →[{t.processName}]→ {toName}
                </button>
              );
            })}
          </div>
        ))}

        {tab === 'requirements' && (
          <div className="space-y-1.5">
            {requirements.length === 0 && (
              <div className="text-[10px] text-[#555]">No requirement nodes in the model.</div>
            )}
            {requirements.map(r => (
              <div key={r.requirementId} className="border border-[#2d2d2d] rounded p-1.5">
                <div className="text-[10px] font-bold text-purple-400">{r.requirementName}</div>
                {r.requirementText && <div className="text-[10px] text-[#999] italic">{r.requirementText}</div>}
                <div className="text-[9px] text-[#777] mt-0.5">
                  {r.satisfiedBy.length > 0
                    ? `satisfied by: ${r.satisfiedBy.map(s => s.name).join(', ')}`
                    : '⚠ nothing satisfies this requirement yet'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors in `SmartShowPanel.tsx` (pre-existing errors elsewhere are out of scope; if any appear in this file, fix them).

- [ ] **Step 3: Commit** (skip if not a git repo)

```bash
git add src/components/entropy/SmartShowPanel.tsx
git commit -m "feat(entropy): Smart Show derived-views panel"
```

---

### Task 12: Wire the engine, link rules, and Smart Show into EntropyWorkspace + App

**Files:**
- Modify: `src/components/entropy/EntropyWorkspace.tsx`
- Modify: `src/components/entropy/OplParser.ts` (initial-state flag)
- Modify: `src/App.tsx` (EntropyWorkspace props, around line 15978)

**Interfaces:**
- Consumes: `stepSimulation`, `applySimResultToNodes`, `initializeSimulation`, `createSimulationState`, `OpmSimulationState` from `./OpmSimulationEngine`; `validateOpmConnection` from `./OpmLinkRules`; `SmartShowPanel` from `./SmartShowPanel`; `OpmLegend` from `./OpmLegend`; `importSysmlToOpm` from `./SysmlToOpmImporter`; `SysMLDiagramState` from `../../types/sysml_types`.
- Produces: `EntropyWorkspaceProps` gains `sysmlState?: SysMLDiagramState`; right sidebar gains a `smartShow` tab.

- [ ] **Step 1: Add imports and sim-state ref in EntropyWorkspace.tsx**

Add imports after the existing `OplParser` import (line ~19):

```typescript
import {
  OpmSimulationState,
  createSimulationState,
  initializeSimulation,
  stepSimulation,
  applySimResultToNodes,
} from './OpmSimulationEngine';
import { SmartShowPanel } from './SmartShowPanel';
import { OpmLegend } from './OpmLegend';
import { importSysmlToOpm } from './SysmlToOpmImporter';
import { validateOpmConnection } from './OpmLinkRules';
import type { SysMLDiagramState } from '../../types/sysml_types';
```

Extend the props interface:

```typescript
interface EntropyWorkspaceProps {
  // ... existing props unchanged ...
  sysmlState?: SysMLDiagramState;
}
```

and destructure `sysmlState` in the component parameter list.

Add a ref next to the `simRunning` state (line ~183):

```typescript
  const simStateRef = useRef<OpmSimulationState>(createSimulationState());
```

- [ ] **Step 2: Gate `onConnect` with the ISO link rules**

Replace the existing `onConnect` `useCallback` (lines ~442–461) with:

```typescript
  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return;

    const src = nodes.find(n => n.id === connection.source);
    const tgt = nodes.find(n => n.id === connection.target);
    if (!src || !tgt) return;

    // ISO 19450 link-role validation (OpmLinkRules.ts)
    const verdict = validateOpmConnection(activeLinkType, src.data.type, tgt.data.type);
    if (!verdict.allowed) {
      if (onAddError) onAddError('error', `OPM link rejected: ${verdict.reason}`, 'ENTROPY');
      logSim('error', `Link rejected [${activeLinkType}]: ${verdict.reason}`);
      return;
    }

    saveHistory(nodes, edges);

    const newEdge: AppEdge = {
      id: `e-${connection.source}-${connection.sourceHandle || 'std-out'}-${connection.target}-${connection.targetHandle || 'res-in'}`,
      source: connection.source,
      target: connection.target,
      sourceHandle: connection.sourceHandle || undefined,
      targetHandle: connection.targetHandle || undefined,
      type: 'opmEdge',
      data: {
        type: activeLinkType,
      },
    };

    setEdges(prev => addEdge(newEdge, prev));
    logSim('info', `Link [${activeLinkType}] connected: ${src.data.name} → ${tgt.data.name}`);
  }, [activeLinkType, nodes, edges, saveHistory, onAddError]);
```

- [ ] **Step 3: Mark initial states (ISO initial-state dot)**

In `src/components/entropy/OplParser.ts`, inside the `Object [Name] has states ...` handler, add after the `opmStates.push({...})` line:

```typescript
        if (sIdx === 0) {
          (stateNode.data as any).isInitial = true;
        }
```

In `src/components/entropy/EntropyWorkspace.tsx`, inside `handleCanvasClick`'s `if (clickedObject) {` branch, replace the `.concat(newNode))` call with:

```typescript
        }).concat({
          ...newNode,
          data: { ...newNode.data, isInitial: !(clickedObject.data.states || []).length },
        }));
```

- [ ] **Step 4: Replace the ad-hoc tick engine with the OpmSimulationEngine**

Replace the entire `runSimTick` `useCallback` (lines ~901–1071) with:

```typescript
  const runSimTick = useCallback(() => {
    const result = stepSimulation(nodes, edges, simStateRef.current);
    simStateRef.current = result.state;
    setNodes(prev => applySimResultToNodes(prev, result.state, result.firingProcessIds));
    result.logs.forEach(l => logSim(l.type, l.message));
  }, [nodes, edges]);
```

Update `resetSimulation` (line ~1089) to also reset the engine:

```typescript
  const resetSimulation = () => {
    setSimRunning(false);
    simStateRef.current = initializeSimulation(nodes);
    setNodes(prev => applySimResultToNodes(prev, simStateRef.current, []));
    logSim('info', 'Simulation reset: objects initialized to their first state.');
  };
```

Update `toggleSimulation` (line ~1084) so starting the run initializes the engine when it is fresh:

```typescript
  const toggleSimulation = () => {
    if (!simRunning && simStateRef.current.tick === 0) {
      simStateRef.current = initializeSimulation(nodes);
      setNodes(prev => applySimResultToNodes(prev, simStateRef.current, []));
    }
    setSimRunning(!simRunning);
    logSim('info', simRunning ? 'Simulation paused.' : 'Simulation running...');
  };
```

- [ ] **Step 5: Mount Smart Show and the notation legend in the workspace**

Change the right-tab state type (line ~197) from `'simControl' | 'opl'` to:

```typescript
  const [rightTab, setRightTab] = useState<'simControl' | 'opl' | 'smartShow'>('simControl');
```

Add a tab button next to the existing simControl/opl tab buttons in the right sidebar (follow the existing button markup pattern; the existing tab buttons are in the sidebar header section after line ~1700 — reuse their exact className):

```tsx
              <button
                onClick={() => setRightTab('smartShow')}
                className={`px-2 py-1 text-[10px] font-bold rounded transition-colors ${
                  rightTab === 'smartShow' ? 'bg-sky-950/60 text-sky-300 border border-sky-500' : 'text-[#888] border border-[#333] hover:bg-[#222]'
                }`}
              >
                Smart Show
              </button>
```

And render the panel in the tab-content area alongside the existing `simControl`/`opl` panels:

```tsx
              {rightTab === 'smartShow' && (
                <SmartShowPanel
                  nodes={nodes}
                  edges={edges}
                  simState={simStateRef.current}
                  simRunning={simRunning}
                  onSelectProcess={(pid) => {
                    const p = nodes.find(n => n.id === pid);
                    if (p) setSelectedNode(p);
                  }}
                />
              )}
```

Note: `simStateRef.current` does not trigger re-render; the panel re-renders anyway because `nodes`/`edges` change every tick (the canvas repaint drives it). No extra state is needed.

Also mount the ISO 19450 notation legend inside the canvas container (the `<div className="flex-1 h-full" onClick={handleCanvasClick}>` wrapper, directly after `</ReactFlow>`):

```tsx
              <OpmLegend />
```

- [ ] **Step 6: Add the "Import SysML → OPM" toolbar button**

In the top control bar (next to the example-template `<select>`, around line 1255), add:

```tsx
            {sysmlState && (
              <button
                onClick={() => {
                  const { nodes: impNodes, edges: impEdges, warnings } = importSysmlToOpm(sysmlState);
                  saveHistory(nodes, edges);
                  setNodes(impNodes);
                  setEdges(impEdges);
                  setOplText('');
                  warnings.forEach(w => logSim('warning', w));
                  logSim('success', `Imported ${impNodes.length} OPM elements from the SysML model.`);
                  if (onSave) onSave(impNodes, impEdges);
                }}
                className="px-2.5 py-1 text-[10px] border border-purple-700 text-purple-300 rounded hover:bg-purple-950/40"
                title="Migrate the SysML BDD/IBD/Requirements model into this OPM workspace"
              >
                Import SysML → OPM
              </button>
            )}
```

- [ ] **Step 7: Pass the SysML state from App.tsx**

In `src/App.tsx` at the `EntropyWorkspace` usage (line ~15978), add the prop:

```tsx
                <EntropyWorkspace
                  initialNodes={entropyNodes}
                  initialEdges={entropyEdges}
                  availableVariables={variables}
                  onVariablesChange={setVariables}
                  tickMs={tickMs}
                  onTickMsChange={setTickMs}
                  onBack={() => setDiagramMode('statemachine')}
                  onSave={(nodes, edges) => {
                    setEntropyNodes(nodes);
                    setEntropyEdges(edges);
                  }}
                  onAddError={addError}
                  sysmlState={{ blocks, ports, parts, connectors, requirements, relations }}
                />
```

(`blocks`, `ports`, `parts`, `connectors`, `requirements`, `relations` are the existing SysML state variables already in `App.tsx` scope — verify their exact names with a search for `useState` of the SysML state before editing; if they live in one object such as `sysmlState`, pass that object instead.)

Also update the architecture-mode picker entry (line ~16077 area) so the OPM module presents as the standards-based option:

```tsx
    { id: 'entropy', name: 'OPM (ISO 19450)', desc: 'Single-model architecture: structure, behavior & requirements', color: '#e8b74a', icon: '🌐' },
```

(Only change `name`/`desc` of the existing entropy entry; keep its `id`.)

- [ ] **Step 8: Verify tests and type-check**

Run: `npx vitest run src/components/entropy/__tests__/entropy.test.ts src/components/entropy/__tests__/opmSimulationEngine.test.ts src/components/entropy/__tests__/opmViewDeriver.test.ts src/components/entropy/__tests__/sysmlToOpmImporter.test.ts src/components/entropy/__tests__/oplRequirements.test.ts src/components/entropy/__tests__/opmLinkRules.test.ts`
Expected: PASS (all files).

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors introduced by the touched files.

- [ ] **Step 9: Manual smoke test**

Run: `npm run dev` (or the project's electron dev script). In the Architecture mode picker choose **OPM (ISO 19450)**:
1. The default Smart-Home template loads; press ▶ — processes fire, states transition, logs stream in the Sim Control tab.
2. Switch to the **Smart Show** tab — Structure tree shows Home_System → its parts; Behavior tab highlights the active transition in green while running; Internal tab lets you pick a process and see its in/out links; Requirements tab lists any requirement nodes (empty for the default template).
3. Open a project that has SysML blocks/requirements, click **Import SysML → OPM**, confirm objects, requirement nodes, and aggregation/satisfies links appear, and that OPL text regenerates with `Requirement …` / `satisfies …` sentences.
4. Notation check: the **ISO 19450 Notation** legend button sits bottom-left of the canvas; physical objects render with a thick solid border; requirement nodes render purple with `«Requirement»` and their text inside; agent links end in a filled arrowhead while instrument links end in a hollow one; trigger/condition links are dashed; aggregation/generalization/exhibition carry a filled triangle / hollow triangle / filled circle at the source end; the first state of each object shows the initial-state dot.
5. Draw an invalid connection (e.g. Object → Object with the Consumption link selected) — it must be rejected with an error toast and a log entry.

- [ ] **Step 10: Commit** (skip if not a git repo)

```bash
git add src/components/entropy/EntropyWorkspace.tsx src/App.tsx
git commit -m "feat(entropy): wire OpmSimulationEngine + Smart Show into workspace, SysML import, ISO 19450 branding"
```

---

### Task 13: Full regression and documentation

**Files:**
- Modify: `src/HelpData.ts` (System Architecture topic)
- Test: all entropy test files

- [ ] **Step 1: Run the complete entropy test suite**

Run: `npx vitest run src/components/entropy`
Expected: PASS — every file.

- [ ] **Step 2: Update Help text**

In `src/HelpData.ts`, update the "System Architecture (SysML & OPM)" topic `content` string to describe the new workflow:

```
"The Architecture module is built on ENTROPY — a native OPM (Object-Process Methodology, ISO 19450) modeling environment. Instead of authoring SysML BDD, IBD, State Machine, and Requirements diagrams separately, you author a single OPM model of objects, processes, and states; the Smart Show panel derives the structure view (BDD-equivalent), internal view (IBD-equivalent), behavior view (state-machine-equivalent), and requirements traceability view automatically, and the event-driven simulation engine executes the model with trigger/condition/enabler semantics, conflict resolution, and animation detection. Existing SysML models can be migrated with one click via 'Import SysML → OPM'."
```

Keep the topic `title` as is.

- [ ] **Step 3: Type-check and finish**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors in any touched file.

- [ ] **Step 4: Commit** (skip if not a git repo)

```bash
git add src/HelpData.ts
git commit -m "docs: describe ISO 19450 single-model OPM workflow in Help"
```

---

## Self-Review

**1. Spec coverage**
- "Advanced simulation logic" → Tasks 2–4 (event-driven engine: triggers, conditions, enablers, conflict resolution, animation detection, trace).
- "UI connection" → Task 8 (pure ISO link-role rules wired into `onConnect` with reject reasons) + Task 10 (ISO arrowhead/dash glyphs) + Task 10 legend.
- "Shape of the blocks" → Task 9 (ISO object rectangle with thick border for physical things, process ellipse, rounded-rectangle states with initial-state marker, purple requirement shape).
- "What's inside all the blocks" → Task 9 (states + attributes inside objects, requirement text inside requirements, In/Out port summary inside zoomed processes) + Task 11 (Smart Show internal view).
- "Instead of BDD / state machine / IBD / requirements diagrams by SysML, use OPM" → Task 5 (derived views) + Task 11 (Smart Show panel labels each derived view as the BDD/IBD/SM/Req replacement) + Task 6 (migration importer).
- "Smart show for the tool" → Tasks 5 & 11 (auto-derived, simulation-live views).
- "According to the ISO standard" → ISO 19450 semantics documented in the engine header and Global Constraints; OPD notation per ISO 19450 in Tasks 9–10 (colors remain a tool-specific secondary cue; shapes/glyphs carry the standard meaning); requirement support explicitly flagged as an extension; OPL bimodality preserved (Task 7); branding updated (Tasks 12–13).

**2. Placeholder scan** — every code step contains complete code; every test step contains the exact test source; commands and expected outputs are exact.

**3. Type consistency** — `OpmSimulationState` (Task 2) is consumed with the same field names (`objectActiveState`, `pendingEvents`, `tick`, `trace`, `lastChangeTick`, `lastLoggedBlock`, `finished`) in Tasks 3, 4, and 11. `evaluateProcessEligibility` (Task 3) is called with exactly `(nodes, edges, objectActiveState, pendingEvents)` in Task 4. `applySimResultToNodes(nodes, sim, firingProcessIds)` matches between Task 4 definition and Task 12 usage. `validateOpmConnection(linkType, sourceType, targetType)` (Task 8) is called with the same argument order in Task 12. `deriveStructureView` / `deriveBehaviorView` / `deriveRequirementsView` / `deriveInternalView` signatures match between Task 5 and Task 11. `importSysmlToOpm(state)` matches between Task 6 and Task 12. `isInitial?: boolean` (Task 1) is written by the OPL parser and canvas creation (Task 12) and read by `OPMStateNode` (Task 9).
