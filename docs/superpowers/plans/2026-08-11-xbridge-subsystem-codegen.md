# X-Bridges Subsystem C Code Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable C code generation for X-Bridges models containing `Subsystem` blocks by implementing an AST pre-pass flattener, updating block capabilities, and adding end-to-end C conformance tests.

**Architecture:** An AST pre-pass (`flattenXBSubsystems`) will recursively unroll `Subsystem` nodes, promote contained child blocks to top-level container scope, and rewire connected edges directly to internal `Inport` and `Outport` ports prior to semantic model construction in `xbSemanticBuilder.ts`.

**Tech Stack:** TypeScript, Node.js, Vitest, C99 host harness compiler.

## Global Constraints

- Preserve MISRA-C compliance and deterministic shape/signal graph builder rules.
- Maintain existing C emitters for `Inport` and `Outport` boundary pass-through operations.

---

### Task 1: Create `xbSubsystemFlattener.ts` and Unit Tests

**Files:**
- Create: `src/utils/stateMachine/xbSubsystemFlattener.ts`
- Create: `src/utils/stateMachine/xbSubsystemFlattener.test.ts`

**Interfaces:**
- Consumes: `XBPersistedModelV1`, `XBNodeV1`, `XBEdgeV1` from `src/utils/stateMachine/xbModel.ts`
- Produces: `flattenXBSubsystems(model: XBPersistedModelV1): XBPersistedModelV1`

- [ ] **Step 1: Write failing unit test for subsystem flattening**

Create `src/utils/stateMachine/xbSubsystemFlattener.test.ts`:
```typescript
import { describe, expect, it } from 'vitest';
import type { XBPersistedModelV1 } from './xbModel';
import { flattenXBSubsystems } from './xbSubsystemFlattener';

describe('flattenXBSubsystems', () => {
  it('flattens a single-level subsystem and rewires edges to Inport/Outport', () => {
    const model: XBPersistedModelV1 = {
      version: 1,
      solver: { kind: 'euler', stepSeconds: 0.01 },
      nodes: [
        { id: 'const1', type: 'Constant', parameters: { value: 5 }, parentId: 'root' },
        { id: 'sub1', type: 'Subsystem', parameters: { name: 'MySub' }, parentId: 'root' },
        { id: 'in1', type: 'Inport', parameters: {}, parentId: 'sub1' },
        { id: 'gain1', type: 'Gain', parameters: { gain: 2 }, parentId: 'sub1' },
        { id: 'out1', type: 'Outport', parameters: {}, parentId: 'sub1' },
        { id: 'term1', type: 'Terminator', parameters: {}, parentId: 'root' },
      ],
      edges: [
        { id: 'e1', sourceId: 'const1', sourcePort: 'out', targetId: 'sub1', targetPort: 'in1' },
        { id: 'e2', sourceId: 'in1', sourcePort: 'out', targetId: 'gain1', targetPort: 'u' },
        { id: 'e3', sourceId: 'gain1', sourcePort: 'y', targetId: 'out1', targetPort: 'in' },
        { id: 'e4', sourceId: 'sub1', sourcePort: 'out1', targetId: 'term1', targetPort: 'in' },
      ],
    };

    const flattened = flattenXBSubsystems(model);

    expect(flattened.nodes.map(n => n.id)).not.toContain('sub1');
    expect(flattened.nodes.find(n => n.id === 'gain1')?.parentId).toBe('root');

    // Verify rewired edges
    const rewiredE1 = flattened.edges.find(e => e.id === 'e1');
    expect(rewiredE1?.targetId).toBe('in1');

    const rewiredE4 = flattened.edges.find(e => e.id === 'e4');
    expect(rewiredE4?.sourceId).toBe('out1');
  });
});
```

- [ ] **Step 2: Run unit test to verify it fails**

Run: `npx vitest run src/utils/stateMachine/xbSubsystemFlattener.test.ts`
Expected: FAIL with "Cannot find module './xbSubsystemFlattener'"

- [ ] **Step 3: Implement `flattenXBSubsystems` function**

Create `src/utils/stateMachine/xbSubsystemFlattener.ts`:
```typescript
import type { XBEdgeV1, XBNodeV1, XBPersistedModelV1 } from './xbModel';

export function flattenXBSubsystems(model: XBPersistedModelV1): XBPersistedModelV1 {
  const subsystemNodes = model.nodes.filter(n => n.type === 'Subsystem');
  if (subsystemNodes.length === 0) return model;

  const subsystemIds = new Set(subsystemNodes.map(n => n.id));
  const newNodes: XBNodeV1[] = [];
  const parentMap = new Map<string, string>(); // subId -> parentId

  for (const sub of subsystemNodes) {
    parentMap.set(sub.id, sub.parentId ?? 'root');
  }

  // 1. Promote child nodes
  for (const node of model.nodes) {
    if (subsystemIds.has(node.id)) continue; // skip Subsystem container nodes

    let currentParent = node.parentId ?? 'root';
    while (subsystemIds.has(currentParent)) {
      currentParent = parentMap.get(currentParent) ?? 'root';
    }

    newNodes.push({
      ...node,
      parentId: currentParent,
    });
  }

  // Build lookup maps for subsystem ports: subId:portName -> realPortId
  const inportMap = new Map<string, string>();  // subId:portId -> internal Inport node.id
  const outportMap = new Map<string, string>(); // subId:portId -> internal Outport node.id

  for (const node of model.nodes) {
    if (node.parentId && subsystemIds.has(node.parentId)) {
      if (node.type === 'Inport') {
        const portName = (node.parameters.name as string) || node.id;
        inportMap.set(`${node.parentId}:${portName}`, node.id);
        inportMap.set(`${node.parentId}:${node.id}`, node.id);
      } else if (node.type === 'Outport') {
        const portName = (node.parameters.name as string) || node.id;
        outportMap.set(`${node.parentId}:${portName}`, node.id);
        outportMap.set(`${node.parentId}:${node.id}`, node.id);
      }
    }
  }

  // 2. Rewire edges
  const newEdges: XBEdgeV1[] = model.edges.map(edge => {
    let targetId = edge.targetId;
    let sourceId = edge.sourceId;

    if (subsystemIds.has(targetId)) {
      const internalInport = inportMap.get(`${targetId}:${edge.targetPort}`);
      if (internalInport) targetId = internalInport;
    }

    if (subsystemIds.has(sourceId)) {
      const internalOutport = outportMap.get(`${sourceId}:${edge.sourcePort}`);
      if (internalOutport) sourceId = internalOutport;
    }

    return {
      ...edge,
      sourceId,
      targetId,
    };
  });

  const nextModel: XBPersistedModelV1 = {
    ...model,
    nodes: newNodes,
    edges: newEdges,
  };

  // Recurse if there were nested subsystems
  return flattenXBSubsystems(nextModel);
}
```

- [ ] **Step 4: Run unit test to verify it passes**

Run: `npx vitest run src/utils/stateMachine/xbSubsystemFlattener.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/xbSubsystemFlattener.ts src/utils/stateMachine/xbSubsystemFlattener.test.ts
git commit -m "feat(stateMachine): add flattenXBSubsystems AST transformation"
```

---

### Task 2: Update `xbCapabilities.ts` and Integrate with `xbSemanticBuilder.ts`

**Files:**
- Modify: `src/utils/stateMachine/xbCapabilities.ts:250-255`
- Modify: `src/utils/stateMachine/xbSemanticBuilder.ts:600-610`
- Test: `src/utils/stateMachine/xbCapabilities.test.ts`

**Interfaces:**
- Consumes: `flattenXBSubsystems` from `xbSubsystemFlattener.ts`
- Produces: `Subsystem`, `Inport`, `Outport` codegen-enabled capabilities in `xbCapabilities.ts`

- [ ] **Step 1: Write failing capability test for Subsystem**

Modify `src/utils/stateMachine/xbCapabilities.test.ts` to assert that `'Subsystem'`, `'Inport'`, and `'Outport'` report `codegen: true`:
```typescript
it('classifies Subsystem, Inport, and Outport as supported codegen blocks', () => {
  expect(getXBBlockCapability('Subsystem').codegen).toBe(true);
  expect(getXBBlockCapability('Inport').codegen).toBe(true);
  expect(getXBBlockCapability('Outport').codegen).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/stateMachine/xbCapabilities.test.ts`
Expected: FAIL with `expected false to be true`

- [ ] **Step 3: Update `xbCapabilities.ts` and `xbSemanticBuilder.ts`**

In `src/utils/stateMachine/xbCapabilities.ts`:
Remove `'Subsystem'` from `UNCLASSIFIED_HOST_ONLY` list and add explicit entry:
```typescript
  Subsystem: passThrough,
  Inport: passThrough,
  Outport: passThrough,
```

In `src/utils/stateMachine/xbSemanticBuilder.ts`:
Import `flattenXBSubsystems` and invoke it at top of `buildXBSemanticModel`:
```typescript
import { flattenXBSubsystems } from './xbSubsystemFlattener';

// Inside buildXBSemanticModel(input: XBSemanticBuildInput):
const model = flattenXBSubsystems(input.model);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/utils/stateMachine/xbCapabilities.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/xbCapabilities.ts src/utils/stateMachine/xbSemanticBuilder.ts src/utils/stateMachine/xbCapabilities.test.ts
git commit -m "feat(stateMachine): enable Subsystem block capability and integrate pre-flattening in semantic builder"
```

---

### Task 3: Add `subsystem_gain_sum` C Conformance Case

**Files:**
- Modify: `src/utils/stateMachine/xbCConformanceCases.ts`
- Test: `src/utils/stateMachine/xbCGenerator.test.ts`

**Interfaces:**
- Consumes: `cConformanceCaseIds` in `xbCConformanceCases.ts`
- Produces: `subsystem_gain_sum` conformance case

- [ ] **Step 1: Write failing conformance test for Subsystem model**

Add `subsystem_gain_sum` to `src/utils/stateMachine/xbCConformanceCases.ts`:
```typescript
  {
    id: 'subsystem_gain_sum',
    description: 'Subsystem block containing Inport, Gain, Sum, and Outport',
    model: {
      version: 1,
      solver: { kind: 'euler', stepSeconds: 0.01 },
      nodes: [
        { id: 'const1', type: 'Constant', parameters: { value: 10 }, parentId: 'root' },
        { id: 'sub1', type: 'Subsystem', parameters: { name: 'GainSub' }, parentId: 'root' },
        { id: 'in1', type: 'Inport', parameters: { name: 'in1' }, parentId: 'sub1' },
        { id: 'gain1', type: 'Gain', parameters: { gain: 3 }, parentId: 'sub1' },
        { id: 'out1', type: 'Outport', parameters: { name: 'out1' }, parentId: 'sub1' },
      ],
      edges: [
        { id: 'e1', sourceId: 'const1', sourcePort: 'out', targetId: 'sub1', targetPort: 'in1' },
        { id: 'e2', sourceId: 'in1', sourcePort: 'out', targetId: 'gain1', targetPort: 'u' },
        { id: 'e3', sourceId: 'gain1', sourcePort: 'y', targetId: 'out1', targetPort: 'in' },
      ],
      mappings: [],
    },
    expectedOutputs: {
      out1: [30],
    },
  },
```

- [ ] **Step 2: Run C generator conformance test suite**

Run: `npx vitest run src/utils/stateMachine/xbCGenerator.test.ts`
Expected: PASS with clean compilation and numerical match for `subsystem_gain_sum`.

- [ ] **Step 3: Run all stateMachine vitest suites**

Run: `npx vitest run src/utils/stateMachine/`
Expected: All stateMachine tests PASS cleanly.

- [ ] **Step 4: Commit**

```bash
git add src/utils/stateMachine/xbCConformanceCases.ts
git commit -m "test(stateMachine): register subsystem_gain_sum C conformance case"
```
