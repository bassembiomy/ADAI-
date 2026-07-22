# State Validation & Generator Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement model validation (deadlock prevention & reachability analysis), actionable reporting, syntactic completeness, internal transition handling, and generic parallel/hierarchical execution semantics in the ADIA Embedded C state machine engine.

**Architecture:** Extend `StateData` with `isTerminal`, implement graph traversal for deadlocks and reachability in `smAnalysisEngine.ts`, gate `generateMISRACCode` on critical deadlocks, filter test scenarios for unreachable states, and update `stateMachineCodeGenerator.ts` for internal transition semantics and complete `switch` default cases.

**Tech Stack:** TypeScript, Vitest, Node.js.

## Global Constraints

- Preserve all existing public exports and types.
- Follow Test-Driven Development (TDD) — write failing unit tests before implementation code.
- Ensure all generated C code compiles cleanly with GCC (`-fsyntax-only`).

---

### Task 1: Extend State Model & Critical Deadlock Detection (REQ-V-01)

**Files:**
- Modify: `src/types/sm_types.ts:20-40`
- Modify: `src/utils/smAnalysisEngine.ts`
- Test: `src/utils/smAnalysisEngine.test.ts`

**Interfaces:**
- Consumes: `StateData`, `TransitionData`, `JunctionData` from `src/types/sm_types.ts`
- Produces: Updated `StateData` interface with `isTerminal?: boolean`; updated `analyzeStateMachine` returning critical deadlock `CornerCase` entries.

- [ ] **Step 1: Write failing test for deadlock detection with isTerminal override**

Add test in `src/utils/smAnalysisEngine.test.ts`:

```typescript
it('should identify non-terminal states with zero outgoing transitions as critical deadlocks', () => {
  const states: StateData[] = [
    { id: 's1', name: 'Start', parentId: 'root', autostart: true },
    { id: 's2', name: 'DeadEnd', parentId: 'root', isTerminal: false },
    { id: 's3', name: 'FinalState', parentId: 'root', isTerminal: true }
  ];
  const transitions: TransitionData[] = [
    { id: 't1', sourceId: 's1', targetId: 's2', condition: 'x > 0', type: 'normal' }
  ];
  const result = analyzeStateMachine({ tickMs: 10, states, junctions: [], transitions, variables: [], layers: [], safetyMode: true });
  
  const deadlocks = result.cornerCases.filter(c => c.category === 'deadlock');
  expect(deadlocks.length).toBe(1);
  expect(deadlocks[0].elementId).toBe('s2');
  expect(deadlocks[0].severity).toBe('critical');
  expect(deadlocks[0].recommendation).toContain("Add an outgoing transition from State 'DeadEnd'");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cmd /c npx vitest run src/utils/smAnalysisEngine.test.ts`
Expected: FAIL due to missing property or unflagged deadlock.

- [ ] **Step 3: Implement `isTerminal` in `sm_types.ts` & deadlock traversal in `smAnalysisEngine.ts`**

In `src/types/sm_types.ts`:
```typescript
export interface StateData {
  id: string;
  name: string;
  parentId?: string;
  autostart?: boolean;
  isParallel?: boolean;
  isTerminal?: boolean;
  regionId?: string;
  entryAction?: string;
  duringAction?: string;
  exitAction?: string;
}
```

In `src/utils/smAnalysisEngine.ts`, update corner case detection logic:
```typescript
// Deadlock detection: non-composite states with 0 outgoing transitions that are not terminal
states.forEach(st => {
  const isParent = states.some(s => s.parentId === st.id);
  const outgoing = transitions.filter(t => t.sourceId === st.id);
  if (!isParent && outgoing.length === 0 && !st.isTerminal) {
    cornerCases.push({
      id: `cc_deadlock_${st.id}`,
      category: 'deadlock',
      severity: 'critical',
      elementId: st.id,
      elementName: st.name,
      description: `State '${st.name}' has no outgoing transitions and is not marked terminal.`,
      recommendation: `Add an outgoing transition from State '${st.name}' or mark it as an intentional terminal state in the model.`
    });
  }
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cmd /c npx vitest run src/utils/smAnalysisEngine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types/sm_types.ts src/utils/smAnalysisEngine.ts src/utils/smAnalysisEngine.test.ts
git commit -m "feat(analysis): implement REQ-V-01 critical deadlock detection and isTerminal override"
```

---

### Task 2: Unreachable State Detection & Test Scenario Guard (REQ-V-02 & REQ-R-01)

**Files:**
- Modify: `src/utils/smAnalysisEngine.ts`
- Test: `src/utils/smAnalysisEngine.test.ts`

**Interfaces:**
- Consumes: Reachability set calculated by `getReachableNodes`.
- Produces: Unreachable `CornerCase` entries; `testScenarios` filtered of unreachable steps.

- [ ] **Step 1: Write failing test for unreachable state detection & test scenario filtering**

Add test in `src/utils/smAnalysisEngine.test.ts`:

```typescript
it('should flag unreachable states and exclude them from test scenarios', () => {
  const states: StateData[] = [
    { id: 's1', name: 'Active', parentId: 'root', autostart: true },
    { id: 's2', name: 'Isolated', parentId: 'root' }
  ];
  const transitions: TransitionData[] = [];
  const result = analyzeStateMachine({ tickMs: 10, states, junctions: [], transitions, variables: [], layers: [], safetyMode: true });

  const unreachable = result.cornerCases.filter(c => c.category === 'unreachable');
  expect(unreachable.length).toBe(1);
  expect(unreachable[0].elementId).toBe('s2');

  const scenariosWithUnreachable = result.testScenarios.filter(ts =>
    ts.steps.some(step => step.action.includes('Isolated'))
  );
  expect(scenariosWithUnreachable.length).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cmd /c npx vitest run src/utils/smAnalysisEngine.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement unreachable corner case flagging and scenario filtering**

In `src/utils/smAnalysisEngine.ts`:
1. Ensure all states not in `reachableSet` produce a `CornerCase` with `category: 'unreachable'`, `severity: 'warning'`, and clear recommendation.
2. In scenario generation, filter steps/scenarios so that states outside `reachableSet` are not included in test path steps.

- [ ] **Step 4: Run test to verify it passes**

Run: `cmd /c npx vitest run src/utils/smAnalysisEngine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/smAnalysisEngine.ts src/utils/smAnalysisEngine.test.ts
git commit -m "feat(analysis): implement REQ-V-02 unreachable state detection and REQ-R-01 test scenario guard"
```

---

### Task 3: Code Generator Deadlock Gate & Syntactic Completeness (REQ-G-03)

**Files:**
- Modify: `src/utils/stateMachineCodeGenerator.ts`
- Test: `src/utils/stateMachineCodeGenerator.test.ts`

**Interfaces:**
- Consumes: `analyzeStateMachine` result.
- Produces: Deadlock halt error in `generateMISRACCode`; complete `switch` default cases; dynamic emission of state during actions (including state `6_2` / `state_active[6U]`).

- [ ] **Step 1: Write failing test for deadlock generation gate & missing state active during-action regression check**

In `src/utils/stateMachineCodeGenerator.test.ts`:

```typescript
it('should halt code generation on critical deadlocks unless allowDeadlocks is true', () => {
  const chart: any = {
    tickMs: 10,
    states: [{ id: 's1', name: 'DeadState', parentId: 'root', autostart: true }],
    junctions: [],
    transitions: [],
    variables: [],
    layers: [],
    safetyMode: true
  };
  const res = generateMISRACCode(chart);
  expect(res.errors.some(e => e.message.includes('Critical Deadlock'))).toBe(true);
});

it('should generate default fallback cases in switch statements and active during action checks', () => {
  const chart: any = {
    tickMs: 10,
    states: [
      { id: 's1', name: 'State_6_1', parentId: 'root', autostart: true },
      { id: 's2', name: 'STATE_6_2', parentId: 'root', duringAction: 'x = 1;' }
    ],
    junctions: [],
    transitions: [{ id: 't1', sourceId: 's1', targetId: 's2', condition: 'true' }],
    variables: [{ id: 'v1', name: 'x', type: 'int', initialValue: '0' }],
    layers: [],
    safetyMode: true
  };
  const res = generateMISRACCode(chart);
  const smCore = res.files.find(f => f.name === 'sm_core.c')?.content || '';
  expect(smCore).toContain('default:');
  expect(smCore).toContain('state_active');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cmd /c npx vitest run src/utils/stateMachineCodeGenerator.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement deadlock gate and generic switch default cases in `stateMachineCodeGenerator.ts`**

In `src/utils/stateMachineCodeGenerator.ts`:
1. Check `analysis.cornerCases` for critical deadlocks at top of `generateMISRACCode`. If found and `!(chart as any).allowDeadlocks`, push an error to `errors` and return early.
2. In all generated `switch` statements, append `default: /* Default fallback */ break;`.
3. Verify all active state during actions across generic layers iterate over all state active flags (`state_active[idx]`).

- [ ] **Step 4: Run test to verify it passes**

Run: `cmd /c npx vitest run src/utils/stateMachineCodeGenerator.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachineCodeGenerator.ts src/utils/stateMachineCodeGenerator.test.ts
git commit -m "feat(generator): implement deadlock halt gate and switch default case completeness"
```

---

### Task 4: Internal Transition Semantics & Generic Hierarchy Execution (REQ-G-01, REQ-G-02)

**Files:**
- Modify: `src/utils/stateMachineCodeGenerator.ts`
- Test: `src/utils/stateMachineCodeGenerator.test.ts`

**Interfaces:**
- Consumes: Transition definitions with `sourceId === targetId` or `type === 'internal'`.
- Produces: C step transition checks that execute actions without invoking state Exit/Entry or resetting state timer.

- [ ] **Step 1: Write failing test for internal transition code generation**

In `src/utils/stateMachineCodeGenerator.test.ts`:

```typescript
it('should correctly generate internal transitions without state exit or entry calls', () => {
  const chart: any = {
    tickMs: 10,
    states: [
      { id: 's1', name: 'Running', parentId: 'root', autostart: true, entryAction: 'entry();', exitAction: 'exit();' }
    ],
    junctions: [],
    transitions: [
      { id: 't1', sourceId: 's1', targetId: 's1', type: 'internal', condition: 'tick_evt', action: 'internal_action();' }
    ],
    variables: [],
    layers: [],
    safetyMode: true
  };
  const res = generateMISRACCode(chart);
  const smCore = res.files.find(f => f.name === 'sm_core.c')?.content || '';
  expect(smCore).toContain('internal_action();');
  // Internal transition must not exit or re-enter state s1
  expect(smCore).not.toMatch(/SM_Running_Exit.*internal_action/s);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cmd /c npx vitest run src/utils/stateMachineCodeGenerator.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement internal transition handling in `stateMachineCodeGenerator.ts`**

In `src/utils/stateMachineCodeGenerator.ts`:
When emitting step transition evaluations for a state:
If `transition.sourceId === transition.targetId` or `transition.type === 'internal'`:
Emit the condition check and action block directly within the during step loop without generating state state-change logic (`Exit`, state index assignment, or `Entry` calls).

- [ ] **Step 4: Run test to verify it passes**

Run: `cmd /c npx vitest run src/utils/stateMachineCodeGenerator.test.ts`
Expected: PASS.

- [ ] **Step 5: Run full test suite & orbital validation check**

Run: `cmd /c npx vitest run src/utils/antigravity`
Run: `cmd /c npx vitest run src/utils/stateMachineCodeGenerator.test.ts`
Expected: ALL PASS.

- [ ] **Step 6: Commit**

```bash
git add src/utils/stateMachineCodeGenerator.ts src/utils/stateMachineCodeGenerator.test.ts
git commit -m "feat(generator): add generic internal transition semantics without exit/entry calls"
```
