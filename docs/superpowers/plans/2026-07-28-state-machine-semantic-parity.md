# State-Machine Semantic Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one Stateflow-referenced semantic engine that drives ADIA simulation and generic C99 generation with identical observable behavior.

**Architecture:** Migrate saved charts to explicit OR/AND decomposition, normalize them into a validated semantic IR, and execute that IR with a TypeScript reference interpreter. Generate C99, reports, and standalone simulation artifacts from the same IR, retaining `stateMachineCodeGenerator.ts` as a compatibility facade during migration.

**Tech Stack:** TypeScript 5, React 18, Vitest 4, C99, host GCC, bundled AVR-GCC, esbuild

## Global Constraints

- Follow `docs/superpowers/specs/2026-07-28-state-machine-semantic-parity-design.md`.
- Use MathWorks Stateflow execution semantics as the behavioral reference; do not copy MathWorks source layout.
- Terminal states remain active and quiescent; they never reset the chart.
- Parent/layer decomposition is explicitly `OR` or `AND`.
- Hardware I/O uses explicit mappings only; variable names never imply direction.
- Live application simulation and generated C must produce identical normalized traces.
- Preserve existing uncommitted edits in `src/utils/stateMachineCodeGenerator.ts` and `src/utils/stateMachineCodeGenerator.test.ts`; reconcile them instead of replacing files wholesale.
- Retain `generateMISRACCode()` and the existing generated query/lifecycle concepts through compatibility facades.
- Generated production C must pass `-std=c99 -pedantic-errors -Wall -Wextra -Werror`.
- Do not claim formal MISRA compliance or target verification from local structural checks.

---

## Planned File Structure

### New semantic modules

- `src/utils/stateMachine/smModel.ts` — current persisted model and mapping types.
- `src/utils/stateMachine/smModelMigration.ts` — pure legacy schema migration.
- `src/utils/stateMachine/smSemanticModel.ts` — validated IR and runtime types.
- `src/utils/stateMachine/smSemanticBuilder.ts` — persisted model to IR construction.
- `src/utils/stateMachine/smSemanticValidator.ts` — deterministic model diagnostics.
- `src/utils/stateMachine/smExpressions.ts` — typed expression/action parsing and evaluation.
- `src/utils/stateMachine/smInterpreter.ts` — authoritative TypeScript runtime.
- `src/utils/stateMachine/smTrace.ts` — stable trace schema and comparison.
- `src/utils/stateMachine/smCExpressions.ts` — typed IR expression to C rendering.
- `src/utils/stateMachine/smCGenerator.ts` — C artifact orchestration.
- `src/utils/stateMachine/smReports.ts` — reports from shared analysis results.
- `src/utils/stateMachine/smStandaloneRuntime.ts` — browser entry using the same interpreter.
- `src/utils/stateMachine/smFixtures.ts` — reusable semantic behavior fixtures.

### New tests

- `src/utils/stateMachine/smModelMigration.test.ts`
- `src/utils/stateMachine/smSemanticBuilder.test.ts`
- `src/utils/stateMachine/smExpressions.test.ts`
- `src/utils/stateMachine/smInterpreter.test.ts`
- `src/utils/stateMachine/smInterpreter.parallel-history.test.ts`
- `src/utils/stateMachine/smCGenerator.test.ts`
- `src/utils/stateMachine/smDifferential.test.ts`
- `src/utils/stateMachine/smReports.test.ts`
- `src/utils/stateMachine/smStandaloneRuntime.test.ts`

### Existing integration files

- `src/types/sm_types.ts` — add explicit decomposition compatibility types.
- `src/utils/stateMachineCodeGenerator.ts` — delegate through the new facade.
- `src/utils/smAnalysisEngine.ts` — delegate semantic analysis to IR.
- `src/App.tsx` — replace duplicated simulation execution with interpreter calls.
- `src/engine/hil/hilTypes.ts` — add safe-value mapping metadata.
- `src/engine/hil/hilCodeGenerator.ts` — call the explicit read/step/write cycle.
- `src/components/hil/HILSignalMapper.tsx` — edit explicit safe values and conversions.
- `scripts/build_state_machine_runtime.ts` — bundle the shared standalone interpreter.
- `package.json` — run the standalone runtime build before application builds/tests.

---

### Task 1: Current Model Schema and Legacy Migration

**Files:**
- Create: `src/utils/stateMachine/smModel.ts`
- Create: `src/utils/stateMachine/smModelMigration.ts`
- Create: `src/utils/stateMachine/smModelMigration.test.ts`
- Modify: `src/types/sm_types.ts`

**Interfaces:**
- Produces: `StateDecomposition`, `StateMachineModelV4`, `migrateStateMachineModel(input): MigrationResult`.
- Consumes: current `StateData`, `JunctionData`, `TransitionData`, `VariableDef`, and `Layer`.

- [ ] **Step 1: Write failing migration tests**

```ts
import { describe, expect, it } from 'vitest';
import { migrateStateMachineModel } from './smModelMigration';

describe('migrateStateMachineModel', () => {
  it('migrates consistent legacy siblings to explicit AND', () => {
    const result = migrateStateMachineModel({
      schemaVersion: 3,
      tickMs: 10,
      states: [
        { id: 'a', parentId: 'root', isParallel: true, priority: 1 },
        { id: 'b', parentId: 'root', isParallel: true, priority: 2 }
      ],
      layers: [{ id: 'root', parentStateId: null, stateIds: ['a', 'b'] }],
      junctions: [],
      transitions: [],
      variables: []
    } as any);

    expect(result.diagnostics).toEqual([]);
    expect(result.model.schemaVersion).toBe(4);
    expect(result.model.layers[0].decomposition).toBe('AND');
  });

  it('rejects an ambiguous mixed legacy layer', () => {
    const result = migrateStateMachineModel({
      schemaVersion: 3,
      tickMs: 10,
      states: [
        { id: 'a', parentId: 'root', isParallel: true, priority: 1 },
        { id: 'b', parentId: 'root', isParallel: false, priority: 2 }
      ],
      layers: [{ id: 'root', parentStateId: null, stateIds: ['a', 'b'] }],
      junctions: [],
      transitions: [],
      variables: []
    } as any);

    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'MIGRATION_AMBIGUOUS_DECOMPOSITION',
      elementId: 'root'
    }));
  });
});
```

- [ ] **Step 2: Run the migration test and confirm failure**

Run:

```powershell
npx vitest run src/utils/stateMachine/smModelMigration.test.ts
```

Expected: FAIL because `smModelMigration` does not exist.

- [ ] **Step 3: Add current schema types**

```ts
export const CURRENT_SM_SCHEMA_VERSION = 4 as const;
export type StateDecomposition = 'OR' | 'AND';

export interface StateMachineLayerV4 extends Layer {
  decomposition: StateDecomposition;
}

export interface StateMachineModelV4 {
  schemaVersion: typeof CURRENT_SM_SCHEMA_VERSION;
  tickMs: number;
  states: StateData[];
  junctions: JunctionData[];
  transitions: TransitionData[];
  variables: VariableDef[];
  layers: StateMachineLayerV4[];
  safetyMode: boolean;
  hilConfig?: HILConfig;
}

export interface ModelDiagnostic {
  code: string;
  message: string;
  elementId?: string;
  severity: 'error' | 'warning';
}
```

- [ ] **Step 4: Implement pure deterministic migration**

```ts
export const migrateStateMachineModel = (input: LegacyStateMachineModel): MigrationResult => {
  if (input.schemaVersion === CURRENT_SM_SCHEMA_VERSION) {
    return { model: structuredClone(input) as StateMachineModelV4, diagnostics: [] };
  }

  const diagnostics: ModelDiagnostic[] = [];
  const statesById = new Map(input.states.map(state => [state.id, state]));
  const layers = input.layers.map(layer => {
    const childFlags = layer.stateIds
      .map(id => statesById.get(id))
      .filter((state): state is StateData => state !== undefined)
      .map(state => state.isParallel === true);
    const hasParallel = childFlags.some(Boolean);
    const hasExclusive = childFlags.some(flag => !flag);
    if (hasParallel && hasExclusive) {
      diagnostics.push({
        code: 'MIGRATION_AMBIGUOUS_DECOMPOSITION',
        message: `Layer '${layer.name}' mixes parallel and exclusive child flags.`,
        elementId: layer.id,
        severity: 'error'
      });
    }
    return {
      ...layer,
      decomposition: hasParallel && !hasExclusive ? 'AND' as const : 'OR' as const
    };
  });

  return {
    model: { ...structuredClone(input), schemaVersion: 4, layers } as StateMachineModelV4,
    diagnostics
  };
};
```

- [ ] **Step 5: Run migration and type checks**

Run:

```powershell
npx vitest run src/utils/stateMachine/smModelMigration.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/types/sm_types.ts src/utils/stateMachine/smModel.ts src/utils/stateMachine/smModelMigration.ts src/utils/stateMachine/smModelMigration.test.ts
git commit -m "feat(state-machine): add explicit decomposition migration"
```

---

### Task 2: Typed Expressions, Semantic IR, and Validation

**Files:**
- Create: `src/utils/stateMachine/smExpressions.ts`
- Create: `src/utils/stateMachine/smExpressions.test.ts`
- Create: `src/utils/stateMachine/smSemanticModel.ts`
- Create: `src/utils/stateMachine/smSemanticBuilder.ts`
- Create: `src/utils/stateMachine/smSemanticBuilder.test.ts`
- Create: `src/utils/stateMachine/smSemanticValidator.ts`
- Create: `src/utils/stateMachine/smFixtures.ts`

**Interfaces:**
- Consumes: `StateMachineModelV4`.
- Produces: `buildSemanticModel(model): SemanticBuildResult`.
- Produces: typed `ExpressionNode` and `ActionNode` structures shared by interpreter and C renderer.

- [ ] **Step 1: Add failing IR and validation tests**

```ts
import { describe, expect, it } from 'vitest';
import { buildSemanticModel } from './smSemanticBuilder';
import { flatOrFixture, nestedAndFixture } from './smFixtures';

describe('buildSemanticModel', () => {
  it('precomputes hierarchy, slots, and transition LCA paths', () => {
    const result = buildSemanticModel(flatOrFixture());
    expect(result.diagnostics).toEqual([]);
    expect(result.ir.layers.root.decomposition).toBe('OR');
    expect(result.ir.states.a.activeSlot).toBe(0);
    expect(result.ir.transitions.t_ab.exitStateIds).toEqual(['a']);
    expect(result.ir.transitions.t_ab.entryStateIds).toEqual(['b']);
  });

  it('assigns deterministic AND execution order', () => {
    const result = buildSemanticModel(nestedAndFixture());
    expect(result.diagnostics).toEqual([]);
    expect(result.ir.layers.parallel.children).toEqual(['region_a', 'region_b']);
  });

  it('rejects an OR layer without exactly one default path', () => {
    const fixture = flatOrFixture();
    fixture.states.forEach(state => { state.autostart = false; });
    const result = buildSemanticModel(fixture);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'OR_DEFAULT_PATH_REQUIRED'
    }));
  });
});
```

- [ ] **Step 2: Add failing expression tests**

```ts
import { describe, expect, it } from 'vitest';
import { parseAction, parseCondition } from './smExpressions';

describe('semantic expressions', () => {
  it('parses division without confusing it with transition action syntax', () => {
    expect(parseAction('ratio = total / count;')).toEqual({
      kind: 'assign',
      target: 'ratio',
      value: expect.objectContaining({ kind: 'binary', operator: '/' })
    });
  });

  it('rejects undeclared symbols before simulation or generation', () => {
    expect(() => parseCondition('missing > 0', new Set(['known']))).toThrow(
      /undeclared symbol 'missing'/
    );
  });
});
```

- [ ] **Step 3: Run tests and confirm failure**

```powershell
npx vitest run src/utils/stateMachine/smExpressions.test.ts src/utils/stateMachine/smSemanticBuilder.test.ts
```

Expected: FAIL because the new semantic modules do not exist.

- [ ] **Step 4: Define the IR**

```ts
export interface SemanticState {
  id: string;
  enumName: string;
  parentStateId: string | null;
  layerId: string;
  depth: number;
  priority: number;
  activeSlot: number;
  activityIndex: number;
  terminal: boolean;
  childLayerIds: string[];
  entryActions: ActionNode[];
  duringActions: ActionNode[];
  exitActions: ActionNode[];
}

export interface SemanticTransition {
  id: string;
  sourceStateId: string;
  destinationStateId: string;
  kind: 'outer' | 'inner' | 'internal-action' | 'external-self';
  priority: number;
  guard: ExpressionNode;
  actions: ActionNode[];
  exitStateIds: string[];
  entryStateIds: string[];
}

export interface SemanticModel {
  tickMs: number;
  rootLayerId: string;
  states: Record<string, SemanticState>;
  layers: Record<string, SemanticLayer>;
  transitions: Record<string, SemanticTransition>;
  transitionsBySource: Record<string, string[]>;
  variables: Record<string, SemanticVariable>;
  ioMappings: SemanticIOMapping[];
  activeSlotCount: number;
}
```

- [ ] **Step 5: Implement builder and validator as pure functions**

The builder must:

```ts
export const buildSemanticModel = (model: StateMachineModelV4): SemanticBuildResult => {
  const diagnostics = validateModelStructure(model);
  if (diagnostics.some(item => item.severity === 'error')) {
    return { diagnostics };
  }
  const hierarchy = buildHierarchyIndex(model);
  const slots = allocateActiveSlots(model, hierarchy);
  const transitions = normalizeTransitions(model, hierarchy);
  return {
    ir: freezeSemanticModel(assembleIR(model, hierarchy, slots, transitions)),
    diagnostics
  };
};
```

Validation must emit stable diagnostic codes for duplicate membership, cyclic parents, invalid OR defaults, duplicate AND priorities, dangling paths, invalid history ownership, invalid mappings, and invalid action symbols.

- [ ] **Step 6: Run semantic tests**

```powershell
npx vitest run src/utils/stateMachine/smExpressions.test.ts src/utils/stateMachine/smSemanticBuilder.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/utils/stateMachine
git commit -m "feat(state-machine): build validated semantic IR"
```

---

### Task 3: Reference Interpreter for OR Hierarchy and Transitions

**Files:**
- Create: `src/utils/stateMachine/smInterpreter.ts`
- Create: `src/utils/stateMachine/smInterpreter.test.ts`
- Create: `src/utils/stateMachine/smTrace.ts`
- Modify: `src/utils/stateMachine/smFixtures.ts`

**Interfaces:**
- Consumes: immutable `SemanticModel`.
- Produces: `createRuntime(ir)`, `initializeRuntime()`, `stepRuntime()`, `resetRuntime()`.
- Produces: canonical `SemanticTraceFrame`.

- [ ] **Step 1: Write failing interpreter behavior tests**

```ts
describe('Stateflow-referenced OR execution', () => {
  it('runs exit, transition action, and entry in order', () => {
    const runtime = createRuntime(buildFixture('exit-action-entry'));
    initializeRuntime(runtime);
    runtime.data.go = true;
    const frame = stepRuntime(runtime, 10);
    expect(frame.actions).toEqual([
      'exit:A',
      'transition:t_ab',
      'entry:B'
    ]);
    expect(frame.activeStateIds).toEqual(['b']);
  });

  it('executes outer before during and inner', () => {
    const runtime = createRuntime(buildFixture('outer-during-inner'));
    initializeRuntime(runtime);
    runtime.data.outer = false;
    runtime.data.inner = true;
    const frame = stepRuntime(runtime, 10);
    expect(frame.actions).toEqual(['during:A', 'transition:inner_a']);
  });

  it('distinguishes external self from internal action-only', () => {
    const external = runFixture('external-self');
    expect(external.actions).toEqual(['exit:A', 'entry:A']);
    const internal = runFixture('internal-action');
    expect(internal.actions).toEqual(['transition:internal_a']);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

```powershell
npx vitest run src/utils/stateMachine/smInterpreter.test.ts
```

Expected: FAIL because `smInterpreter` does not exist.

- [ ] **Step 3: Implement runtime state and trace**

```ts
export interface SemanticRuntime {
  readonly ir: SemanticModel;
  data: Record<string, number | boolean>;
  activeSlots: Array<string | null>;
  stateActive: boolean[];
  stateTimersMs: number[];
  historySlots: Array<string | null>;
  error: SemanticRuntimeError | null;
  traceSequence: number;
}

export interface SemanticTraceFrame {
  sequence: number;
  elapsedMs: number;
  activeStateIds: string[];
  actions: string[];
  data: Record<string, number | boolean>;
  stateTimersMs: Record<string, number>;
  history: Record<string, string | null>;
  error: string | null;
}
```

- [ ] **Step 4: Implement ordered execution**

```ts
const executeState = (ctx: StepContext, stateId: string): TransitionOutcome => {
  const outer = selectTransitionPath(ctx, stateId, 'outer');
  if (outer) return commitTransition(ctx, outer);

  runActions(ctx, ctx.ir.states[stateId].duringActions, `during:${stateId}`);

  const inner = selectTransitionPath(ctx, stateId, 'inner');
  if (inner) return commitTransition(ctx, inner);

  executeActiveChildren(ctx, stateId);
  return { transitioned: false, exitedContainerIds: [] };
};
```

Implement junction evaluation with a local path stack. Do not update active state or execute transition actions until a complete destination path is selected.

- [ ] **Step 5: Add reset tests and implementation**

```ts
it('reset exits active states and restores all defaults', () => {
  const runtime = createRuntime(buildFixture('reset'));
  initializeRuntime(runtime);
  runtime.data.counter = 99;
  stepRuntime(runtime, 10);
  const frame = resetRuntime(runtime);
  expect(frame.actions[0]).toMatch(/^exit:/);
  expect(runtime.data.counter).toBe(0);
  expect(runtime.stateTimersMs.every(value => value === 0)).toBe(true);
  expect(runtime.historySlots.every(value => value === null)).toBe(true);
});
```

- [ ] **Step 6: Run interpreter tests**

```powershell
npx vitest run src/utils/stateMachine/smInterpreter.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/utils/stateMachine/smInterpreter.ts src/utils/stateMachine/smInterpreter.test.ts src/utils/stateMachine/smTrace.ts src/utils/stateMachine/smFixtures.ts
git commit -m "feat(state-machine): add reference OR interpreter"
```

---

### Task 4: Parallel AND, History, Timing, and Quiescent Terminals

**Files:**
- Create: `src/utils/stateMachine/smInterpreter.parallel-history.test.ts`
- Modify: `src/utils/stateMachine/smInterpreter.ts`
- Modify: `src/utils/stateMachine/smSemanticBuilder.ts`
- Modify: `src/utils/stateMachine/smFixtures.ts`

**Interfaces:**
- Extends the interpreter with deterministic AND entry/execute/exit.
- Extends history storage for shallow and deep configurations.
- Keeps terminal leaves active without automatic reset.

- [ ] **Step 1: Write failing AND and terminal tests**

```ts
it('executes AND children in priority order', () => {
  const runtime = initializedFixture('parallel-order');
  const frame = stepRuntime(runtime, 10);
  expect(frame.actions).toEqual(['during:R1', 'during:R2', 'during:R3']);
});

it('stops later siblings when a transition exits the common AND parent', () => {
  const runtime = initializedFixture('parallel-parent-exit');
  runtime.data.leave = true;
  const frame = stepRuntime(runtime, 10);
  expect(frame.actions).toEqual([
    'exit:R3',
    'exit:R2',
    'exit:R1',
    'exit:ParallelParent',
    'entry:Outside'
  ]);
  expect(frame.actions).not.toContain('during:R2');
});

it('keeps a terminal child active while its AND sibling continues', () => {
  const runtime = initializedFixture('parallel-terminal');
  const first = stepRuntime(runtime, 10);
  const second = stepRuntime(runtime, 10);
  expect(first.activeStateIds).toContain('terminal_child');
  expect(second.activeStateIds).toContain('terminal_child');
  expect(second.actions).toContain('during:worker');
  expect(second.actions).not.toContain('reset:chart');
});
```

- [ ] **Step 2: Write failing shallow/deep history tests**

```ts
it('restores only the direct child for shallow history', () => {
  const runtime = runHistoryScenario('shallow');
  expect(active(runtime, 'parent_a')).toBe(true);
  expect(active(runtime, 'nested_default')).toBe(true);
  expect(active(runtime, 'nested_previous')).toBe(false);
});

it('restores every nested OR and AND region for deep history', () => {
  const runtime = runHistoryScenario('deep');
  expect(active(runtime, 'nested_previous')).toBe(true);
  expect(active(runtime, 'parallel_left_previous')).toBe(true);
  expect(active(runtime, 'parallel_right_previous')).toBe(true);
});
```

- [ ] **Step 3: Run and confirm failures**

```powershell
npx vitest run src/utils/stateMachine/smInterpreter.parallel-history.test.ts
```

Expected: FAIL on AND exit ordering, history restoration, and terminal behavior.

- [ ] **Step 4: Implement AND execution and history snapshots**

```ts
const executeAndLayer = (ctx: StepContext, layer: SemanticLayer): void => {
  for (const childId of layer.childrenByPriority) {
    if (!ctx.runtime.stateActive[ctx.ir.states[childId].activityIndex]) continue;
    executeState(ctx, childId);
    if (!isLayerActive(ctx.runtime, layer.id)) break;
  }
};

const recordDeepHistory = (runtime: SemanticRuntime, layerId: string): void => {
  runtime.deepHistory[layerId] = snapshotDescendantConfiguration(runtime, layerId);
};
```

Terminal handling is only:

```ts
if (state.terminal) {
  return { transitioned: false, exitedContainerIds: [] };
}
```

No interpreter path may call reset based on `terminal`.

- [ ] **Step 5: Implement exact temporal boundaries with saturated counters**

```ts
const saturatingAdd = (value: number, delta: number): number =>
  Math.min(Number.MAX_SAFE_INTEGER, value + delta);
```

Add a test proving `after(3)` at 10 ms fires on the third 10 ms step, not the fourth.

- [ ] **Step 6: Run advanced behavior tests**

```powershell
npx vitest run src/utils/stateMachine/smInterpreter.test.ts src/utils/stateMachine/smInterpreter.parallel-history.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/utils/stateMachine
git commit -m "feat(state-machine): implement parallel history and terminal semantics"
```

---

### Task 5: Replace Live Application Simulation with the Interpreter

**Files:**
- Create: `src/utils/stateMachine/smAppAdapter.ts`
- Create: `src/utils/stateMachine/smAppAdapter.test.ts`
- Modify: `src/App.tsx:9098-9810`
- Modify: `src/App.tsx:6363-6875`

**Interfaces:**
- Consumes: React state-machine model and Factory I/O values.
- Produces: immutable UI updates from `SemanticTraceFrame`.
- Removes live execution inference from `App.tsx`.

- [ ] **Step 1: Write failing adapter tests**

```ts
it('maps a trace frame to current React state shapes', () => {
  const update = traceFrameToAppUpdate(frameFixture({
    activeStateIds: ['a', 'parallel_b'],
    data: { x: 2, enabled: true }
  }));
  expect(update.activeStates).toEqual({
    root: 'a',
    parallel_region_b: 'parallel_b'
  });
  expect(update.variableValues).toEqual({ x: 2, enabled: true });
});

it('does not produce a terminal reset event', () => {
  const update = traceFrameToAppUpdate(frameFixture({
    activeStateIds: ['terminal'],
    actions: []
  }));
  expect(update.traceEvents.some(event => event.transitionId === 'TERMINAL_RESET')).toBe(false);
});
```

- [ ] **Step 2: Run and confirm failure**

```powershell
npx vitest run src/utils/stateMachine/smAppAdapter.test.ts
```

Expected: FAIL because `smAppAdapter` does not exist.

- [ ] **Step 3: Add the adapter**

```ts
export interface AppSimulationSession {
  ir: SemanticModel;
  runtime: SemanticRuntime;
}

export const createAppSimulationSession = (
  model: StateMachineModelV4
): AppSimulationSession => {
  const built = buildSemanticModel(model);
  if (!built.ir) throw new SemanticModelError(built.diagnostics);
  const runtime = createRuntime(built.ir);
  initializeRuntime(runtime);
  return { ir: built.ir, runtime };
};
```

- [ ] **Step 4: Replace `simulationStep`**

`App.tsx` must perform:

```ts
const inputValues = await readFactoryInputs();
applyMappedInputs(simulationSession.runtime, inputValues);
const frame = stepRuntime(simulationSession.runtime, tickMs);
applySimulationFrameToReact(frame);
await writeFactoryOutputs(readMappedOutputs(simulationSession.runtime));
```

Delete the local implementations of transition parsing, condition evaluation, recursive entry/exit, history inference, and terminal reset from `simulationStep`.

- [ ] **Step 5: Replace start and reset behavior**

`startSimulation()` creates one session after validation. The Reset UI calls `resetRuntime(session.runtime)` and applies the returned frame. Do not reimplement default entry in React.

- [ ] **Step 6: Run application adapter and existing generator behavior tests**

```powershell
npx vitest run src/utils/stateMachine/smAppAdapter.test.ts src/utils/stateMachineCodeGenerator.behavior.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/App.tsx src/utils/stateMachine/smAppAdapter.ts src/utils/stateMachine/smAppAdapter.test.ts
git commit -m "refactor(simulation): execute shared semantic interpreter"
```

---

### Task 6: Bundle the Shared Interpreter for Standalone Simulation

**Files:**
- Create: `src/utils/stateMachine/smStandaloneRuntime.ts`
- Create: `src/utils/stateMachine/smStandaloneRuntime.test.ts`
- Create: `scripts/build_state_machine_runtime.ts`
- Create: `src/generated/stateMachineRuntimeBundle.ts`
- Modify: `src/App.tsx:12980-13890`
- Modify: `package.json`

**Interfaces:**
- Produces: `window.ADIAStateMachineRuntime` from the same interpreter modules.
- Removes the second state-machine implementation embedded in exported HTML.

- [ ] **Step 1: Write a failing standalone parity test**

```ts
it('standalone runtime produces the same trace as the module interpreter', async () => {
  const model = nestedAndHistoryFixture();
  const moduleFrames = runModuleScenario(model, scenarioInputs);
  const bundledFrames = await runStandaloneScenario(model, scenarioInputs);
  expect(bundledFrames).toEqual(moduleFrames);
});
```

- [ ] **Step 2: Run and confirm failure**

```powershell
npx vitest run src/utils/stateMachine/smStandaloneRuntime.test.ts
```

Expected: FAIL because the standalone bundle does not exist.

- [ ] **Step 3: Add the standalone entry**

```ts
import {
  applyInputs,
  createRuntime,
  initializeRuntime,
  resetRuntime,
  stepRuntime
} from './smInterpreter';
import { buildSemanticModel } from './smSemanticBuilder';

export const ADIAStateMachineRuntime = {
  buildSemanticModel,
  createRuntime,
  initializeRuntime,
  applyInputs,
  stepRuntime,
  resetRuntime
};
```

- [ ] **Step 4: Add deterministic esbuild bundling**

```ts
await build({
  entryPoints: ['src/utils/stateMachine/smStandaloneRuntime.ts'],
  bundle: true,
  format: 'iife',
  globalName: 'ADIAStateMachineRuntime',
  platform: 'browser',
  target: ['es2020'],
  write: false
});
```

The script serializes the single output string into `src/generated/stateMachineRuntimeBundle.ts`.

- [ ] **Step 5: Replace embedded exported simulation logic**

Inject `STATE_MACHINE_RUNTIME_BUNDLE`, the migrated model, and a thin DOM adapter. Delete the duplicated entry/exit, transition, history, parallel, terminal-reset, and timer code from the exported HTML string.

- [ ] **Step 6: Add build script and run tests**

```json
{
  "scripts": {
    "build:sm-runtime": "tsx scripts/build_state_machine_runtime.ts",
    "audit:prebuild": "npm audit --audit-level=critical || echo [WARNING] Review audit output",
    "prebuild": "npm run build:sm-runtime && npm run audit:prebuild"
  }
}
```

Run:

```powershell
npm run build:sm-runtime
npx vitest run src/utils/stateMachine/smStandaloneRuntime.test.ts
npx tsc --noEmit
```

Expected: PASS and no semantic execution loop remains in the exported HTML template.

- [ ] **Step 7: Commit**

```powershell
git add package.json scripts/build_state_machine_runtime.ts src/generated/stateMachineRuntimeBundle.ts src/utils/stateMachine/smStandaloneRuntime.ts src/utils/stateMachine/smStandaloneRuntime.test.ts src/App.tsx
git commit -m "refactor(simulation): share interpreter with standalone export"
```

---

### Task 7: Structured C99 Backend from Semantic IR

**Files:**
- Create: `src/utils/stateMachine/smCExpressions.ts`
- Create: `src/utils/stateMachine/smCGenerator.ts`
- Create: `src/utils/stateMachine/smCGenerator.test.ts`
- Modify: `src/utils/stateMachineCodeGenerator.ts`
- Modify: `src/utils/stateMachineCodeGenerator.test.ts`
- Modify: `src/utils/stateMachineCodeGenerator.phase2.test.ts`
- Modify: `src/utils/stateMachineCodeGenerator.golden.test.ts`
- Modify: `src/utils/__snapshots__/stateMachineCodeGenerator.golden.test.ts.snap`

**Interfaces:**
- Consumes: validated `SemanticModel`.
- Produces: the existing `{ files, errors, warnings }` result.
- Keeps `generateMISRACCode()` as a delegating facade.

- [ ] **Step 1: Add failing renderer tests for reviewed defects**

```ts
it('never generates terminal-driven SM_Reset calls', () => {
  const core = generateCoreC(terminalFixture());
  expect(core).not.toMatch(/SM_Is_Terminal_State[\s\S]*SM_Reset/);
  expect(core).not.toContain('Terminal / End State: auto-reset');
});

it('emits layer constants from one slot allocation', () => {
  const config = generateConfigH(nestedAndFixture());
  expect(config).toContain('#define SM_LYR_ROOT_IDX 0U');
  expect(config).toContain('#define SM_NUM_ACTIVE_SLOTS');
});

it('does not require post-generation brace or regex repair', () => {
  const source = readFileSync('src/utils/stateMachine/smCGenerator.ts', 'utf8');
  expect(source).not.toContain('Syntactic Auto-Repair');
  expect(source).not.toMatch(/\\.replace\\([\\s\\S]*SM_Sync_IO/);
});
```

- [ ] **Step 2: Run and confirm failure**

```powershell
npx vitest run src/utils/stateMachine/smCGenerator.test.ts
```

Expected: FAIL because the new backend does not exist.

- [ ] **Step 3: Implement typed expression rendering**

```ts
export const renderCExpression = (node: ExpressionNode): string => {
  switch (node.kind) {
    case 'variable': return `instance->data.${node.cName}`;
    case 'literal': return renderTypedLiteral(node);
    case 'binary':
      return `(${renderCExpression(node.left)} ${node.operator} ${renderCExpression(node.right)})`;
    case 'unary':
      return `(${node.operator}${renderCExpression(node.operand)})`;
  }
};
```

No global search-and-replace pass may alter emitted identifiers or numeric tokens.

- [ ] **Step 4: Implement structured file renderers**

Create dedicated render functions:

```ts
renderConfigHeader(ir)
renderCoreHeader(ir)
renderCoreSource(ir)
renderSafetyHeader(ir)
renderSafetySource(ir)
renderUserLogicHeader(ir)
renderUserLogicSource(ir)
renderMcalHeader(ir, options)
```

The core source must generate the same runtime order as `smInterpreter.ts`: outer, during, inner, children; LCA exit/action/entry; AND priority order; reverse AND exit; shallow/deep history; quiescent terminal.

- [ ] **Step 5: Convert the legacy facade**

```ts
export const generateMISRACCode = (chart: LegacyChart, options = {}) => {
  const migrated = migrateStateMachineModel(chart);
  const built = buildSemanticModel(migrated.model);
  const diagnostics = [...migrated.diagnostics, ...built.diagnostics];
  if (!built.ir || diagnostics.some(item => item.severity === 'error')) {
    return diagnosticsToLegacyResult(diagnostics);
  }
  return generateCArtifacts(built.ir, options);
};
```

Keep `validateInitialValue` exported through the facade until callers migrate.

- [ ] **Step 6: Run C generator and snapshot tests**

```powershell
npx vitest run src/utils/stateMachine/smCGenerator.test.ts src/utils/stateMachineCodeGenerator.test.ts src/utils/stateMachineCodeGenerator.phase2.test.ts src/utils/stateMachineCodeGenerator.golden.test.ts
npx tsc --noEmit
```

Expected: PASS. Update snapshots only after reviewing semantic changes.

- [ ] **Step 7: Commit**

```powershell
git add src/utils/stateMachine src/utils/stateMachineCodeGenerator.ts src/utils/stateMachineCodeGenerator.test.ts src/utils/stateMachineCodeGenerator.phase2.test.ts src/utils/stateMachineCodeGenerator.golden.test.ts src/utils/__snapshots__/stateMachineCodeGenerator.golden.test.ts.snap
git commit -m "refactor(generator): render C99 from semantic IR"
```

---

### Task 8: Explicit MCU I/O, Complete Reset, and Safe Fault Handling

**Files:**
- Modify: `src/utils/stateMachine/smModel.ts`
- Modify: `src/utils/stateMachine/smSemanticValidator.ts`
- Modify: `src/utils/stateMachine/smCGenerator.ts`
- Modify: `src/utils/stateMachine/smCGenerator.test.ts`
- Modify: `src/engine/hil/hilTypes.ts`
- Modify: `src/engine/hil/hilCodeGenerator.ts`
- Modify: `src/engine/hil/hil.test.ts`
- Modify: `src/engine/hil/hilCompilation.test.ts`
- Modify: `src/components/hil/HILSignalMapper.tsx`

**Interfaces:**
- Produces: public `SM_ReadInputs`, `SM_Step`, and `SM_WriteOutputs`.
- Produces: MCAL prototypes in every build mode.
- Produces: immediate safe-output commitment on fault.

- [ ] **Step 1: Add failing I/O contract tests**

```ts
it('maps only explicitly configured variables', () => {
  const files = generate(mappedIoFixture({
    variables: ['x', 'y', 'motor_active'],
    mappings: [{ variableId: 'motor_active', direction: 'write', channelId: 'motor' }]
  }));
  const core = file(files, 'sm_core.c');
  expect(core).not.toContain('instance->data.x = MCAL');
  expect(core).not.toContain('instance->data.y = MCAL');
  expect(core).toContain('MCAL_Dio_WriteChannel(MCAL_CH_MOTOR');
});

it('custom MCAL mode retains declarations and compiles', () => {
  const header = file(generate(mappedIoFixture()), 'mcal_dio.h');
  expect(header).toContain('bool MCAL_Dio_ReadChannel(uint32_t channel);');
  expect(header).toContain('void MCAL_Dio_WriteChannel(uint32_t channel, bool level);');
  expect(header).not.toMatch(/#ifndef MCAL_CUSTOM_DIO[\\s\\S]*bool MCAL_Dio_ReadChannel\\(uint32_t channel\\);/);
});
```

- [ ] **Step 2: Add failing reset and safe-output runtime tests**

```c
SM_Init(&inst);
inst.data.output_enable = true;
SM_WriteOutputs(&inst);
SM_Reset(&inst);
CHECK(inst.data.output_enable == false, "reset restores output default");
CHECK(last_output_level == false, "reset commits output default");

inst.data.output_enable = true;
inst.error_status = SM_ERR_SAFETY_VIOLATION;
SM_Step(&inst, SM_TICK_MS);
CHECK(safe_outputs_applied == 1U, "fault applies safe outputs immediately");
```

- [ ] **Step 3: Run and confirm failures**

```powershell
npx vitest run src/utils/stateMachine/smCGenerator.test.ts src/engine/hil/hil.test.ts src/engine/hil/hilCompilation.test.ts
```

Expected: FAIL on explicit mappings, custom MCAL compile, reset output, and fault output.

- [ ] **Step 4: Generate stable MCU contracts**

The generated header must always declare:

```c
bool MCAL_Dio_ReadChannel(uint32_t channel);
void MCAL_Dio_WriteChannel(uint32_t channel, bool level);
void MCAL_ApplySafeOutputs(void);
void MCAL_Watchdog_Kick(void);
```

When `includeTestShims` is true, emit implementations in `mcal_dio_test_stubs.c`; do not use silent inline production stubs.

- [ ] **Step 5: Implement complete reset and fault sequence**

Generated `SM_Reset()` must exit active states, reinitialize all data/timers/history/activity/errors, enter the root default configuration, and call `SM_WriteOutputs()`.

Generated fault handling must:

```c
SM_Exit_All(instance);
SM_Enter_Safe_State(instance);
MCAL_ApplySafeOutputs();
instance->fault_latched = true;
return instance->error_status;
```

Kick the watchdog after a successful step and output commit, not before safety validation.

- [ ] **Step 6: Update HIL scheduling**

Generated HIL loops must use:

```c
(void)SM_ReadInputs(&sm_instance);
(void)SM_Step(&sm_instance, SM_TICK_MS);
(void)SM_WriteOutputs(&sm_instance);
```

Add `safeValue` to output mappings and expose it in `HILSignalMapper`.

- [ ] **Step 7: Run strict compile variants**

```powershell
npx vitest run src/utils/stateMachine/smCGenerator.test.ts src/engine/hil/hil.test.ts src/engine/hil/hilCompilation.test.ts
npx tsc --noEmit
```

Expected: PASS for safety on/off, test stubs, and custom MCAL.

- [ ] **Step 8: Commit**

```powershell
git add src/utils/stateMachine src/engine/hil src/components/hil/HILSignalMapper.tsx
git commit -m "fix(generator): enforce explicit IO and safe fault outputs"
```

---

### Task 9: Differential TypeScript-versus-C Trace Gate

**Files:**
- Create: `src/utils/stateMachine/smDifferential.test.ts`
- Create: `src/utils/stateMachine/smCHarness.ts`
- Modify: `src/utils/stateMachine/smTrace.ts`
- Modify: `src/utils/stateMachine/smFixtures.ts`
- Modify: `src/utils/stateMachineCodeGenerator.behavior.test.ts`

**Interfaces:**
- Consumes: one fixture and one input sequence.
- Produces: normalized TypeScript and C trace arrays.
- Fails on the first semantic difference.

- [ ] **Step 1: Write the failing matrix test**

```ts
const fixtures = [
  'flat-priority',
  'nested-cross-boundary',
  'external-self',
  'internal-action',
  'inner-descendant',
  'inner-history',
  'parallel-independent',
  'parallel-parent-exit',
  'shallow-history',
  'deep-history-and',
  'junction-backtracking',
  'temporal-exact-boundary',
  'terminal-or',
  'terminal-and-sibling',
  'reset',
  'safe-output-fault'
] as const;

it.each(fixtures)('%s matches generated C tick by tick', fixtureName => {
  const fixture = semanticFixture(fixtureName);
  const tsTrace = runInterpreterTrace(fixture);
  const cTrace = compileAndRunCTrace(fixture);
  expect(cTrace).toEqual(tsTrace);
}, 60_000);
```

- [ ] **Step 2: Run and confirm the gate exposes remaining mismatches**

```powershell
npx vitest run src/utils/stateMachine/smDifferential.test.ts --reporter=verbose
```

Expected: At least one fixture fails until C trace output is implemented.

- [ ] **Step 3: Add generated trace hooks under a test macro**

Generated C under `SM_TRACE_ENABLED` exposes:

```c
typedef void (*SM_TraceSink_t)(const SM_TraceEvent_t *event);
void SM_SetTraceSink(ADIA_Instance_t *instance, SM_TraceSink_t sink);
```

The harness serializes stable lines:

```text
FRAME|3|active=a,b|actions=during:a,during:b|data=x:1;y:0|timers=a:30;b:30|error=0
```

Production builds without `SM_TRACE_ENABLED` contain no trace storage or calls.

- [ ] **Step 4: Normalize and compare traces**

```ts
export const compareSemanticTraces = (
  expected: SemanticTraceFrame[],
  actual: SemanticTraceFrame[]
): TraceDifference | null => {
  for (let index = 0; index < Math.max(expected.length, actual.length); index += 1) {
    if (!deepEqual(expected[index], actual[index])) {
      return { index, expected: expected[index], actual: actual[index] };
    }
  }
  return null;
};
```

- [ ] **Step 5: Run the full differential matrix**

```powershell
npx vitest run src/utils/stateMachine/smDifferential.test.ts --reporter=verbose
```

Expected: PASS for every fixture.

- [ ] **Step 6: Retire redundant host behavior implementations**

Keep coverage-specific tests in `stateMachineCodeGenerator.behavior.test.ts`, but replace duplicated fixture/harness logic with imports from `smFixtures.ts` and `smCHarness.ts`.

- [ ] **Step 7: Commit**

```powershell
git add src/utils/stateMachine src/utils/stateMachineCodeGenerator.behavior.test.ts
git commit -m "test(generator): gate C output against interpreter traces"
```

---

### Task 10: Shared Reports, Analysis, Compatibility, and Final Verification

**Files:**
- Create: `src/utils/stateMachine/smReports.ts`
- Create: `src/utils/stateMachine/smReports.test.ts`
- Modify: `src/utils/smAnalysisEngine.ts`
- Modify: `src/utils/smAnalysisEngine.test.ts`
- Modify: `src/utils/stateMachineCodeGenerator.ts`
- Modify: `src/utils/stateMachineCodeGenerator.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/HelpData.ts`
- Modify: `docs/superpowers/specs/2026-07-28-state-machine-semantic-parity-design.md` only if implementation reveals an approved clarification

**Interfaces:**
- Consumes: validated IR, shared analysis result, and verification result.
- Produces: non-contradictory reports and compatibility diagnostics.

- [ ] **Step 1: Write failing report-integrity tests**

```ts
it('uses one reachability result in every report section', () => {
  const report = generateSemanticReport(analyzeSemanticModel(unreachableFixture()));
  expect(report.testing.reachabilityPercent).toBe(report.staticMetrics.reachabilityPercent);
});

it('labels verification evidence honestly', () => {
  const report = renderTestingReport({
    structural: 'pass',
    semantic: 'pass',
    hostCompile: 'pass',
    hostRuntime: 'pass',
    differential: 'pass',
    embeddedCompile: 'not-run',
    targetHardware: 'pending'
  });
  expect(report).toContain('Embedded compilation: NOT RUN');
  expect(report).toContain('Target hardware: PENDING');
  expect(report).not.toContain('MISRA compliant');
});
```

- [ ] **Step 2: Run and confirm failure**

```powershell
npx vitest run src/utils/stateMachine/smReports.test.ts src/utils/smAnalysisEngine.test.ts
```

Expected: FAIL because reports still derive independent results.

- [ ] **Step 3: Delegate analysis to semantic IR**

```ts
export const analyzeStateMachine = (legacyModel: LegacyStateMachineModel) => {
  const migrated = migrateStateMachineModel(legacyModel);
  const built = buildSemanticModel(migrated.model);
  if (!built.ir) return diagnosticsOnlyAnalysis(migrated.diagnostics, built.diagnostics);
  return analyzeSemanticModel(built.ir);
};
```

- [ ] **Step 4: Render reports from one result**

`smReports.ts` creates testing and static metrics sections from the same `SemanticAnalysisResult`. Remove separate reachability and terminal calculations from `stateMachineCodeGenerator.ts`.

- [ ] **Step 5: Update user documentation**

Document:

- Explicit OR/AND decomposition.
- Legacy migration diagnostics.
- Explicit Signal Mapper requirement.
- Recommended `ReadInputs → Step → WriteOutputs` scheduler.
- Quiescent terminal behavior.
- Shallow/deep history semantics.
- Meaning of structural, runtime, differential, embedded, and target-pending report labels.

- [ ] **Step 6: Run focused and full verification**

```powershell
npm run build:sm-runtime
npx vitest run src/utils/stateMachine src/utils/stateMachineCodeGenerator.test.ts src/utils/stateMachineCodeGenerator.phase2.test.ts src/utils/stateMachineCodeGenerator.behavior.test.ts src/utils/stateMachineCodeGenerator.golden.test.ts src/utils/smAnalysisEngine.test.ts src/engine/hil
npx tsc --noEmit
npm run build
```

Expected:

- All named tests pass.
- TypeScript reports zero errors.
- Production build succeeds.
- Strict host and AVR compile gates pass.

- [ ] **Step 7: Inspect generated review fixture**

Generate the original reviewed chart and confirm:

```text
- x is not mapped without an explicit input mapping.
- no terminal path calls SM_Reset.
- custom MCAL prototypes remain visible.
- SM_Reset restores data, timers, history, and outputs.
- faults apply safe outputs immediately.
- root/layer indices match the IR allocation.
- parent/region consistency maps contain actual hierarchy.
- simulator and C differential traces match.
```

- [ ] **Step 8: Commit**

```powershell
git add src/utils/stateMachine src/utils/smAnalysisEngine.ts src/utils/smAnalysisEngine.test.ts src/utils/stateMachineCodeGenerator.ts src/utils/stateMachineCodeGenerator.test.ts src/App.tsx src/HelpData.ts
git commit -m "feat(state-machine): complete semantic parity pipeline"
```

---

## Final Review Checkpoint

Before integration:

1. Review every commit independently.
2. Confirm no unrelated dirty-worktree files were staged.
3. Run `git diff --check`.
4. Run the complete verification commands from Task 10.
5. Review one generated C package as an embedded engineer would: headers, lifecycle, scheduler, MCAL contract, safe outputs, RAM use, and reports.
6. Compare the original reviewed model in live simulation and generated C using the differential trace gate.
