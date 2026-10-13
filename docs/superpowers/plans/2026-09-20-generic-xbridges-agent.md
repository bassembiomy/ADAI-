# Generic & Intelligent X-Bridges Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the X-Bridges agent into a generic, intelligent systems engineering assistant that handles any block-diagram / ODE demand (including RLC / 2nd-order dynamic models), asks context-sensitive questions, and intelligently explains out-of-domain boundaries (like physical across/through circuits in V-Lab).

**Architecture:** A domain boundary guard in `RequestCollaborator` intercepts physical/out-of-domain demands with educational alternatives. An ontology-driven entity parser and dynamic requirement resolver replace hardcoded inverter/air-fryer questions with structure-aware questions. A dual-tier graph planner pairs deterministic mathematical archetypes (including 2nd-order transfer functions) with catalog-grounded synthesis verified by an isolated sandbox proof engine.

**Tech Stack:** TypeScript, Node.js/Vitest, React, X-Bridges Reactive State Flow, V-Lab Multi-Domain Simulation Engine.

## Global Constraints
- All test suites must run via `npx vitest run <testPath>`.
- Code changes must preserve existing inverter and air-fryer workflows without regressions.
- No external unvetted dependencies; rely strictly on existing libraries and catalog definitions.
- Desktop security guidelines apply to all IPC, state transitions, and file touches.

---

### Task 1: Domain Boundary Guard & Physical Circuit Interception

**Files:**
- Modify: `src/agent/collaborators/requestCollaborator.ts`
- Test: `src/agent/collaborators/requestCollaborator.test.ts`

**Interfaces:**
- Produces: `ClassifiedRequest` with `isSupported: boolean`, `domainGuidance?: string`, `suggestedAlternative?: 'xbridges_transfer_function' | 'vlab_physical'`
- Consumes: User prompt string

- [ ] **Step 1: Write the failing test for domain boundary detection**

Add tests to `src/agent/collaborators/requestCollaborator.test.ts`:
```typescript
it('intercepts physical circuit requests and explains V-Lab boundary while offering X-Bridges transfer function', async () => {
  const collaborator = new RequestCollaborator(new MockLlm());
  const classified = await collaborator.classifyRequest('create rlc circuit');

  expect(classified.isSupported).toBe(true);
  expect(classified.targetSystem).toBe('xbridges_second_order_dynamic');
  expect(classified.domainGuidance).toContain('V-Lab');
  expect(classified.domainGuidance).toContain('transfer function');
});

it('gracefully rejects non-engineering requests with clear capability explanation', async () => {
  const collaborator = new RequestCollaborator(new MockLlm());
  const classified = await collaborator.classifyRequest('write me a poem about summer');

  expect(classified.isSupported).toBe(false);
  expect(classified.unsupportedReason).toContain('engineering');
  expect(classified.unsupportedReason).toContain('X-Bridges');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/agent/collaborators/requestCollaborator.test.ts`
Expected: FAIL due to missing `domainGuidance` or targetSystem defaulting to `xbridges_model`.

- [ ] **Step 3: Implement Domain Boundary Guard in `RequestCollaborator`**

Update `src/agent/collaborators/requestCollaborator.ts` to inspect physical circuit keywords (`rlc`, `resistor`, `capacitor`, `inductor`, `breadboard`, `circuit`) and set:
```typescript
targetSystem = 'xbridges_second_order_dynamic';
domainGuidance = "X-Bridges is a causal signal/block-diagram simulator. Physical component schematics with across/through wiring belong to V-Lab. In X-Bridges, this is modeled as an equivalent continuous transfer function or dynamic state-space block.";
```
And reject non-engineering/creative queries cleanly with specific MBSE guidance.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/agent/collaborators/requestCollaborator.test.ts`
Expected: PASS

- [ ] **Step 5: Commit changes**

```bash
git add src/agent/collaborators/requestCollaborator.ts src/agent/collaborators/requestCollaborator.test.ts
git commit -m "feat(agent): add domain boundary guard and physical circuit guidance"
```

---

### Task 2: Engineering Entity & Unit Parser

**Files:**
- Create: `src/services/ai/planner/engineeringEntityParser.ts`
- Test: `src/services/ai/planner/engineeringEntityParser.test.ts`

**Interfaces:**
- Produces: `parseEngineeringEntities(text: string): ParsedEngineeringEntities`
  - Returns map of extracted units, values, and component symbols (`R`, `L`, `C`, `frequency`, `setpoint`, `gain`).

- [ ] **Step 1: Write the failing test**

Create `src/services/ai/planner/engineeringEntityParser.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { parseEngineeringEntities } from './engineeringEntityParser';

describe('EngineeringEntityParser', () => {
  it('parses metric engineering prefixes and units correctly', () => {
    const text = 'create RLC circuit with R=100 ohm, L=10mH and C=100uF';
    const parsed = parseEngineeringEntities(text);

    expect(parsed.resistance).toBe(100);
    expect(parsed.inductance).toBe(0.01);
    expect(parsed.capacitance).toBe(0.0001);
  });

  it('parses frequency and damping entities', () => {
    const text = 'lowpass filter cutoff 50kHz with gain 2.5';
    const parsed = parseEngineeringEntities(text);

    expect(parsed.frequency).toBe(50000);
    expect(parsed.gain).toBe(2.5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/ai/planner/engineeringEntityParser.test.ts`
Expected: FAIL with `parseEngineeringEntities not defined`.

- [ ] **Step 3: Implement `engineeringEntityParser.ts`**

Implement regex and scaling logic for standard SI prefixes (`p`, `n`, `u`/`µ`, `m`, `k`, `M`, `G`) and common component identifiers (`R`, `L`, `C`, `freq`, `cutoff`, `setpoint`, `Kp`, `Ki`, `Kd`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/services/ai/planner/engineeringEntityParser.test.ts`
Expected: PASS

- [ ] **Step 5: Commit changes**

```bash
git add src/services/ai/planner/engineeringEntityParser.ts src/services/ai/planner/engineeringEntityParser.test.ts
git commit -m "feat(planner): add engineering entity and unit parser"
```

---

### Task 3: Context-Sensitive Dynamic Clarification Engine

**Files:**
- Modify: `src/services/ai/planner/requirementResolver.ts`
- Test: `src/services/ai/planner/requirementResolver.test.ts`

**Interfaces:**
- Consumes: `TaskState` or `GeneralEngineeringRequest`, `XbridgesCapabilityIndex`
- Produces: `RequirementResolution` (with questions relevant only to the system's mathematical archetype)

- [ ] **Step 1: Write the failing test**

In `src/services/ai/planner/requirementResolver.test.ts`:
```typescript
it('does NOT ask for DC bus voltage or motor load when resolving 2nd-order dynamic/RLC systems', () => {
  const state: any = {
    requirementState: {
      objective: 'create rlc circuit',
      targetSystem: 'xbridges_second_order_dynamic',
      answers: {},
      constraints: []
    }
  };
  const catalog = buildXbridgesCapabilityIndex();
  const resolution = resolveRequirements(state, catalog);

  expect(resolution.complete).toBe(false);
  expect(resolution.nextQuestion?.key).toBe('component_values');
  expect(resolution.nextQuestion?.question).not.toContain('DC bus');
  expect(resolution.nextQuestion?.question).not.toContain('inverter');
});

it('marks requirement resolution complete immediately if parameters are present', () => {
  const state: any = {
    requirementState: {
      objective: 'create rlc circuit with R=10, L=1mH, C=10uF',
      targetSystem: 'xbridges_second_order_dynamic',
      answers: { component_values: 'R=10, L=1mH, C=10uF' },
      constraints: []
    }
  };
  const catalog = buildXbridgesCapabilityIndex();
  const resolution = resolveRequirements(state, catalog);

  expect(resolution.complete).toBe(true);
  expect(resolution.nextQuestion).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/ai/planner/requirementResolver.test.ts`
Expected: FAIL because fallback currently asks for `source_voltage` and `load_specification`.

- [ ] **Step 3: Implement Dynamic Archetype Routing in `requirementResolver.ts`**

Update `resolveRequirements`:
- Check for 2nd-order / dynamic systems, PID control loops, filters, and arithmetic networks.
- Only prompt for missing structural questions specific to that archetype.
- Never default unknown models to inverter power conversion.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/services/ai/planner/requirementResolver.test.ts`
Expected: PASS

- [ ] **Step 5: Commit changes**

```bash
git add src/services/ai/planner/requirementResolver.ts src/services/ai/planner/requirementResolver.test.ts
git commit -m "feat(planner): implement context-sensitive dynamic requirement clarification"
```

---

### Task 4: Expanded Canonical Archetypes in General Graph Planner

**Files:**
- Modify: `src/services/ai/planner/generalGraphPlanner.ts`
- Test: `src/services/ai/planner/generalGraphPlanner.test.ts`

**Interfaces:**
- Produces: `PlanningOutcome` with synthesized `blocks` and `connections` for 2nd-order/RLC systems and general dynamic models.

- [ ] **Step 1: Write the failing test**

In `src/services/ai/planner/generalGraphPlanner.test.ts`:
```typescript
it('plans a 2nd-order dynamic RLC transfer function model with Step source and Scope sink', () => {
  const request: GeneralEngineeringRequest = {
    intent: 'create',
    objective: 'create rlc circuit transfer function with R=10, L=0.01, C=0.0001',
    targetBehaviors: ['second_order_dynamic', 'transfer_function'],
    inputs: [],
    outputs: [],
    constraints: []
  };
  const context: PlanningContext = {
    projectId: 'test',
    baseRevision: 1,
    activeSnapshot: { projectId: 'test', revision: 1, nodes: [], edges: [], stateHash: 'hash', timestamp: 0 },
    catalog: buildXbridgesCapabilityIndex(),
    patterns: []
  };

  const outcome = planGeneralXbridgesModel(request, context);
  expect(outcome.status).toBe('planned');
  expect(outcome.plan).toBeDefined();
  expect(outcome.plan?.blocks.some(b => b.blockDefinitionId === 'TRANSFER_FUNCTION')).toBe(true);
  expect(outcome.plan?.blocks.some(b => b.blockDefinitionId === 'Scope')).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/ai/planner/generalGraphPlanner.test.ts`
Expected: FAIL because 2nd-order RLC archetype is not recognized and defaults to generic fallback.

- [ ] **Step 3: Implement 2nd-Order & General Dynamic Archetypes**

In `src/services/ai/planner/generalGraphPlanner.ts`:
- In `getCanonicalArchetype`, add support for `second_order`, `rlc`, `transfer_function`, `resonant`, computing polynomial coefficients $[L \cdot C, R \cdot C, 1]$.
- Wire input excitation (`Step` or `Sine`) to `TRANSFER_FUNCTION.in`, and `TRANSFER_FUNCTION.out` to `Scope.in1`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/services/ai/planner/generalGraphPlanner.test.ts`
Expected: PASS

- [ ] **Step 5: Commit changes**

```bash
git add src/services/ai/planner/generalGraphPlanner.ts src/services/ai/planner/generalGraphPlanner.test.ts
git commit -m "feat(planner): add 2nd-order dynamic and RLC transfer function canonical archetype"
```

---

### Task 5: End-to-End Orchestrator Integration & Regression Verification

**Files:**
- Modify: `src/agent/agentOrchestrator.ts`
- Test: `src/agent/agentOrchestrator.test.ts`, `src/services/ai/benchmarks/generalXbridgesCorpus.test.ts`

**Interfaces:**
- Verifies complete lifecycle: Prompt -> Boundary/Guidance -> Clarification -> Specification -> Approval -> Plan -> Proof -> Execution.

- [ ] **Step 1: Write the failing integration test**

Add to `src/agent/agentOrchestrator.test.ts`:
```typescript
it('handles "create rlc circuit" through complete lifecycle without inverter confusion', async () => {
  const orchestrator = new AgentOrchestrator();
  const resp1 = await orchestrator.handle('create rlc circuit');

  // Should offer guidance and ask for component values or proceed with defaults
  expect(resp1.status).toBe('clarifying');
  expect(resp1.message).toContain('component values');
  expect(resp1.message).not.toContain('400V');

  // User provides or accepts defaults
  const resp2 = await orchestrator.handle('R=10, L=10mH, C=100uF');
  expect(resp2.status).toBe('awaiting_specification_approval');

  // Approve specification
  const resp3 = await orchestrator.approve(resp2.pendingApproval!.id);
  expect(resp3.status).toBe('awaiting_plan_approval');
  expect(resp3.executionPlan?.actions.length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/agent/agentOrchestrator.test.ts`
Expected: FAIL

- [ ] **Step 3: Update `AgentOrchestrator` & Collaborators**

Wire the new `domainGuidance` and dynamic archetype resolution through `AgentOrchestrator.handle`. Ensure messages presented to user include helpful domain explanations when relevant.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/agent/agentOrchestrator.test.ts`
Expected: PASS

- [ ] **Step 5: Run full regression suite**

Run:
```bash
npx vitest run src/services/ai/benchmarks/generalXbridgesCorpus.test.ts
npx vitest run src/agent/clarificationEngine.test.ts
npx vitest run src/agent/generalOrchestratorWorkflow.test.ts
```
Expected: All tests pass with zero regressions.

- [ ] **Step 6: Commit changes**

```bash
git add src/agent/agentOrchestrator.ts src/agent/agentOrchestrator.test.ts
git commit -m "feat(agent): complete end-to-end generic engineering agent workflow"
```
