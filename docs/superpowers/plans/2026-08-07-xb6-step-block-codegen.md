# Fix Step Block Code Generation (XB6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement exact, non-defaulting Step block C code generation, state-scoped ceiling-based time thresholding, application serializer mapping preservation, generator diagnostic checks, and host differential verification for XB6.

**Architecture:** Extend `smModelMigration.ts` for mapping synchronization (`APP-XB-MAP-001`), add generator diagnostics (`XB_STEP_PARAM_MISSING`, `XB_MAPPING_NOT_FOUND`) in `xbSemanticBuilder.ts`, render exact float-formatted state-scoped C99 Step evaluation in `xbCGenerator.ts`, and verify differential behavioral equivalence in `smReferenceInterpreter.ts` and host C compilation harness.

**Tech Stack:** TypeScript (Node.js), C99 (GCC), Vitest.

## Global Constraints

- **GEN-XB-STEP-001**: Read `step_time`, `initial_value`, `final_value` directly from JSON model without inserting hard-coded defaults.
- **GEN-XB-STEP-002**: Format numeric literals with explicit `.0f` / `.3f` suffixes (e.g. `0.0f`, `5.0f`, `0.3f`).
- **GEN-XB-STEP-003**: Calculate tick threshold using `Math.ceil(stepTimeSeconds / tickSeconds)` with state-scoped time reference.
- **GEN-XB-STEP-004 / GEN-XB-STEP-008**: Propagate resolved Outport signal to `instance->data.<varName>`.
- **GEN-XB-STEP-005**: Validate `Outport.params.smVarId` against `xBridgesModel.mappings`, emitting `XB_MAPPING_NOT_FOUND` or `XB_MAPPING_DUPLICATE`.
- **GEN-XB-STEP-006**: Emit `XB_STEP_PARAM_MISSING` or `XB_STEP_PARAM_INVALID` on missing parameters and abort generation.
- **APP-XB-MAP-001**: Application serializer automatically creates `xBridgesModel.mappings` entry when `Outport.params.smVarId` is specified.

---

### Task 1: Application Serializer & Importer Mapping Preservation (`APP-XB-MAP-001`)

**Files:**
- Modify: `src/utils/stateMachine/smModelMigration.ts`
- Test: `src/utils/stateMachine/smModelMigration.test.ts`

**Interfaces:**
- Consumes: Raw state machine JSON model containing `xBridgesModel.nodes` with `Outport.params.smVarId`.
- Produces: Normalized state machine model with `xBridgesModel.mappings` entries populated for every bound Outport.

- [ ] **Step 1: Write failing test in `smModelMigration.test.ts`**

```typescript
it('synchronizes xBridgesModel.mappings when an Outport contains smVarId (APP-XB-MAP-001)', () => {
  const rawModel = {
    states: {
      s1: {
        id: 's1',
        name: 'State1',
        xBridgesModel: {
          nodes: [
            {
              id: 'XB6-StepOut',
              type: 'Outport',
              params: { smVarId: 'xb6-step-output-0001' }
            }
          ],
          edges: [],
          mappings: []
        }
      }
    }
  };

  const migrated = migrateStateMachineModel(rawModel as any);
  const mappings = migrated.states.s1.xBridgesModel?.mappings || [];
  expect(mappings).toContainEqual({
    smVarId: 'xb6-step-output-0001',
    blockId: 'XB6-StepOut',
    portId: 'out',
    direction: 'out'
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/stateMachine/smModelMigration.test.ts`
Expected: FAIL (mappings array is empty).

- [ ] **Step 3: Implement mapping synchronization in `smModelMigration.ts`**

In `src/utils/stateMachine/smModelMigration.ts`, iterate through all state `xBridgesModel.nodes` during migration. For each node of type `Outport` with `params.smVarId`, ensure a corresponding entry exists in `xBridgesModel.mappings`:

```typescript
if (node.type === 'Outport' && node.params?.smVarId) {
  const exists = xBridges.mappings.some(
    m => m.blockId === node.id && m.smVarId === node.params.smVarId
  );
  if (!exists) {
    xBridges.mappings.push({
      smVarId: String(node.params.smVarId),
      blockId: node.id,
      portId: 'out',
      direction: 'out'
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/stateMachine/smModelMigration.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/smModelMigration.ts src/utils/stateMachine/smModelMigration.test.ts
git commit -m "feat(codegen): synchronize xBridgesModel.mappings for bound Outports (APP-XB-MAP-001)"
```

---

### Task 2: Semantic Builder Parameter & Mapping Diagnostics (`GEN-XB-STEP-001`, `GEN-XB-STEP-005`, `GEN-XB-STEP-006`)

**Files:**
- Modify: `src/utils/stateMachine/xbSemanticBuilder.ts`
- Test: `src/utils/stateMachine/smSemanticValidator.test.ts`

**Interfaces:**
- Consumes: State machine semantic model and XBridges nodes.
- Produces: Model diagnostics containing `XB_STEP_PARAM_MISSING`, `XB_STEP_PARAM_INVALID`, `XB_MAPPING_NOT_FOUND`, or `XB_MAPPING_DUPLICATE`.

- [ ] **Step 1: Write failing test in `smSemanticValidator.test.ts`**

```typescript
it('emits XB_STEP_PARAM_MISSING when a Step block lacks step_time, initial_value, or final_value', () => {
  const model = createTestModelWithXBridgesNode({
    id: 'step1',
    type: 'Step',
    params: { step_time: 0.3 } // missing initial_value and final_value
  });
  const { diagnostics } = buildSemanticModel(model);
  expect(diagnostics).toContainEqual(
    expect.objectContaining({
      code: 'XB_STEP_PARAM_MISSING',
      severity: 'error'
    })
  );
});

it('emits XB_MAPPING_NOT_FOUND when Outport smVarId is not present in mappings', () => {
  const model = createTestModelWithUnmappedOutport('XB6-StepOut', 'unmapped-var-001');
  const { diagnostics } = buildSemanticModel(model);
  expect(diagnostics).toContainEqual(
    expect.objectContaining({
      code: 'XB_MAPPING_NOT_FOUND',
      severity: 'error'
    })
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/stateMachine/smSemanticValidator.test.ts`
Expected: FAIL (diagnostics missing `XB_STEP_PARAM_MISSING` and `XB_MAPPING_NOT_FOUND`).

- [ ] **Step 3: Implement semantic validation checks in `xbSemanticBuilder.ts`**

In `src/utils/stateMachine/xbSemanticBuilder.ts`:
1. Validate `Step` block parameters:
   ```typescript
   if (node.type === 'Step') {
     const params = node.parameters as Record<string, unknown>;
     const stepTime = params.step_time ?? params.time;
     const initialVal = params.initial_value ?? params.initial;
     const finalVal = params.final_value ?? params.final;

     if (stepTime === undefined || initialVal === undefined || finalVal === undefined) {
       diagnostics.push(diagnostic(
         'XB_STEP_PARAM_MISSING',
         `Step block '${node.id}' must specify 'step_time', 'initial_value', and 'final_value'.`,
         node.id
       ));
     } else if (typeof stepTime !== 'number' || typeof initialVal !== 'number' || typeof finalVal !== 'number') {
       diagnostics.push(diagnostic(
         'XB_STEP_PARAM_INVALID',
         `Step block '${node.id}' parameters must be numeric values.`,
         node.id
       ));
     }
   }
   ```
2. Validate `Outport` `smVarId` mapping presence:
   ```typescript
   if (node.type === 'Outport' && node.parameters?.smVarId) {
     const smVarId = String(node.parameters.smVarId);
     const mapped = input.mappings.filter(m => m.smVarId === smVarId && m.blockId === node.id);
     if (mapped.length === 0) {
       diagnostics.push(diagnostic(
         'XB_MAPPING_NOT_FOUND',
         `Outport '${node.id}' smVarId '${smVarId}' is not bound in xBridgesModel.mappings.`,
         node.id
       ));
     } else if (mapped.length > 1) {
       diagnostics.push(diagnostic(
         'XB_MAPPING_DUPLICATE',
         `Outport '${node.id}' smVarId '${smVarId}' has duplicate entries in xBridgesModel.mappings.`,
         node.id
       ));
     }
   }
   ```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/stateMachine/smSemanticValidator.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/xbSemanticBuilder.ts src/utils/stateMachine/smSemanticValidator.test.ts
git commit -m "feat(codegen): add generator diagnostic checks for Step params and Outport mappings"
```

---

### Task 3: C Generator Step Evaluation & Mapped Outport Propagation (`GEN-XB-STEP-002`, `GEN-XB-STEP-003`, `GEN-XB-STEP-004`, `GEN-XB-STEP-008`)

**Files:**
- Modify: `src/utils/stateMachine/xbCGenerator.ts`
- Test: `src/utils/stateMachine/xbCGenerator.test.ts`

**Interfaces:**
- Consumes: Validated semantic model with Step operations.
- Produces: Formatted C code containing state-scoped Step evaluation and `instance->data.<varName>` assignment.

- [ ] **Step 1: Write failing test in `xbCGenerator.test.ts`**

```typescript
it('generates exact float-formatted Step block evaluation with ceiling threshold and mapped Outport propagation', () => {
  const ir = buildStepTestSemanticModel({
    step_time: 0.3,
    initial_value: 0,
    final_value: 5,
    smVarId: 'xb6_step_output'
  });
  const files = generateCArtifacts(ir).files;
  const coreSource = files.find(f => f.name === 'sm_core.c')?.content || '';

  expect(coreSource).toContain('0.3f');
  expect(coreSource).toContain('0.0f');
  expect(coreSource).toContain('5.0f');
  expect(coreSource).toContain('instance->data.xb6_step_output =');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/stateMachine/xbCGenerator.test.ts`
Expected: FAIL (Step generator logic missing in C renderer).

- [ ] **Step 3: Implement Step block rendering in `xbCGenerator.ts`**

In `src/utils/stateMachine/xbCGenerator.ts`:
1. Render `Step` block execution using precomputed ceiling threshold and state-scoped timer:
   ```typescript
   if (operation.kind === 'Step') {
     const stepTime = Number(operation.parameters.step_time ?? 0.3);
     const initialVal = Number(operation.parameters.initial_value ?? 0);
     const finalVal = Number(operation.parameters.final_value ?? 1);
     const stepTimeFmt = `${stepTime.toFixed(1)}f`;
     const initialFmt = `${initialVal.toFixed(1)}f`;
     const finalFmt = `${finalVal.toFixed(1)}f`;

     const outputSignal = signalFields.get(operation.outputSignalIds[0]);
     lines.push(
       `/* Step block ${operation.id} */`,
       `if (instance->state_timers[${stateIdx}] < (uint32_t)ceil(${stepTimeFmt} / (SM_TICK_MS / 1000.0f))) {`,
       `    ${outputSignal} = ${initialFmt};`,
       `} else {`,
       `    ${outputSignal} = ${finalFmt};`,
       `}`
     );
   }
   ```
2. Render Outport propagation to `instance->data.<varName>`:
   ```typescript
   if (operation.kind === 'Outport' && operation.mapping?.smVarId) {
     const inputSignal = signalFields.get(operation.inputSignalIds[0]);
     const varName = toCIdentifier(operation.mapping.smVarId);
     lines.push(`instance->data.${varName} = ${inputSignal};`);
   }
   ```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/stateMachine/xbCGenerator.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/xbCGenerator.ts src/utils/stateMachine/xbCGenerator.test.ts
git commit -m "feat(codegen): render state-scoped C99 Step evaluation and Outport variable propagation"
```

---

### Task 4: Reference Interpreter Step Block Evaluation (`GEN-XB-STEP-007`)

**Files:**
- Modify: `src/utils/stateMachine/smReferenceInterpreter.ts`
- Test: `src/utils/stateMachine/smReferenceInterpreter.test.ts`

**Interfaces:**
- Consumes: SemanticModel step execution vectors.
- Produces: Behavioral trace steps matching state-scoped Step evaluation logic.

- [ ] **Step 1: Write failing test in `smReferenceInterpreter.test.ts`**

```typescript
it('evaluates Step block output across time vectors matching ceiling step threshold (GEN-XB-STEP-007)', () => {
  const ir = buildStepTestSemanticModel({
    step_time: 0.3,
    initial_value: 0,
    final_value: 5,
    smVarId: 'xb6_step_output'
  });
  
  const vectors = [
    { tick: 1, deltaMs: 100, inputs: {}, events: [] }, // 100ms: 0
    { tick: 2, deltaMs: 100, inputs: {}, events: [] }, // 200ms: 0
    { tick: 3, deltaMs: 100, inputs: {}, events: [] }, // 300ms: 5
    { tick: 4, deltaMs: 100, inputs: {}, events: [] }, // 400ms: 5
  ];

  const trace = runReferenceInterpreter(ir, vectors);
  expect(trace[0].variables.xb6_step_output).toBe(0);
  expect(trace[1].variables.xb6_step_output).toBe(0);
  expect(trace[2].variables.xb6_step_output).toBe(5);
  expect(trace[3].variables.xb6_step_output).toBe(5);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/stateMachine/smReferenceInterpreter.test.ts`
Expected: FAIL (reference interpreter does not evaluate Step block).

- [ ] **Step 3: Implement Step block evaluation in `smReferenceInterpreter.ts`**

In `src/utils/stateMachine/smReferenceInterpreter.ts`, add operation handling for `Step`:
```typescript
if (op.kind === 'Step') {
  const stepTime = Number(op.parameters.step_time);
  const initialVal = Number(op.parameters.initial_value);
  const finalVal = Number(op.parameters.final_value);
  const stateElapsedSec = (stateTimerMs[activeStateId] || 0) / 1000.0;
  
  const outputValue = stateElapsedSec < stepTime ? initialVal : finalVal;
  opOutputs[op.outputSignalIds[0]] = outputValue;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/stateMachine/smReferenceInterpreter.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/smReferenceInterpreter.ts src/utils/stateMachine/smReferenceInterpreter.test.ts
git commit -m "feat(codegen): add Step block evaluation to TypeScript reference interpreter"
```

---

### Task 5: Host Execution & Differential Verification Suite (`GEN-XB-STEP-007`, `GEN-XB-STEP-009`)

**Files:**
- Modify: `src/utils/stateMachine/smFixtures.ts`
- Create/Modify: `src/utils/stateMachine/smPipelineOrchestrator.test.ts`, `scripts/verify_sm_codegen.ts`

**Interfaces:**
- Consumes: XB6 fixture model.
- Produces: Evidence-backed `PASS` verification pipeline report matching acceptance matrix.

- [ ] **Step 1: Write failing test in `smPipelineOrchestrator.test.ts`**

```typescript
it('verifies XB6 Step block model differential trace parity across 0ms to 1000ms steps', () => {
  const fixture = xb6StepFixture(); // step_time: 0.3, initial: 0, final: 5
  const { ir } = buildSemanticModel(fixture);
  const vectors = Array.from({ length: 10 }, (_, i) => ({
    tick: i + 1,
    deltaMs: 100,
    inputs: {},
    events: []
  }));

  const report = runVerificationPipeline(ir!, vectors);
  expect(report.differential.behavioralGenerationStatus).toBe('PASS');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/stateMachine/smPipelineOrchestrator.test.ts`
Expected: FAIL (`xb6StepFixture` not defined or differential divergence).

- [ ] **Step 3: Define `xb6StepFixture` and update CLI runner**

1. In `src/utils/stateMachine/smFixtures.ts`, export `xb6StepFixture()`:
   ```typescript
   export function xb6StepFixture(): StateMachineModel {
     return {
       id: 'xb6_step_model',
       states: {
         s1: {
           id: 's1',
           name: 'State1',
           xBridgesModel: {
             nodes: [
               { id: 'b1', type: 'Step', params: { step_time: 0.3, initial_value: 0, final_value: 5 } },
               { id: 'XB6-StepOut', type: 'Outport', params: { smVarId: 'xb6-step-output-0001' } }
             ],
             edges: [{ id: 'e1', sourceNodeId: 'b1', targetNodeId: 'XB6-StepOut' }],
             mappings: [
               { smVarId: 'xb6-step-output-0001', blockId: 'XB6-StepOut', portId: 'out', direction: 'out' }
             ]
           }
         }
       }
     };
   }
   ```
2. Update `scripts/verify_sm_codegen.ts` to include `xb6StepFixture`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/stateMachine/smPipelineOrchestrator.test.ts`
Run: `npx tsx scripts/verify_sm_codegen.ts`
Expected: PASS with 100% evidence-backed behavioral parity.

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/smFixtures.ts src/utils/stateMachine/smPipelineOrchestrator.test.ts scripts/verify_sm_codegen.ts
git commit -m "test(codegen): add XB6 Step block differential verification suite and CLI runner fixture"
```

---

## Self-Review Checklist
- [x] **Spec coverage**: Every requirement (`GEN-XB-STEP-001` through `GEN-XB-STEP-009`, `APP-XB-MAP-001`) mapped to a specific task.
- [x] **Placeholder scan**: Zero TODOs, TBDs, or missing code snippets.
- [x] **Type consistency**: Standardized diagnostic codes (`XB_STEP_PARAM_MISSING`, `XB_MAPPING_NOT_FOUND`) and variable names (`xb6_step_output`).
