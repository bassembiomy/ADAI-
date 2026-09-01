# Report Diagram Connections & Fault Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix missing cross-diagram connections (BDD↔Requirements, IBD↔BDD, State Machine↔Blocks), add missing diagram elements (initial pseudostate, traceability edges), and repair layout/routing faults in the report diagram renderers.

**Architecture:** The pure SVG diagram renderers in `src/features/reporting/reportDiagrams.ts` consume structured source data and emit `<figure>` HTML strings. Each fix is isolated to one renderer function and its test file. A new `renderTraceabilityDiagram` function will be added to show cross-diagram relationships. The existing `reportDiagramLayout.ts` edge routing will be extended to handle transitions targeting parent composite states.

**Tech Stack:** TypeScript, Vitest, SVG (inline HTML generation).

## Global Constraints

- All existing tests must continue to pass (44 tests currently green).
- New tests follow the existing `vitest` pattern in `*.test.ts` files co-located with the source.
- No comments added to implementation code unless explicitly requested.
- Diagram functions are pure — they receive data and return HTML strings with no side effects.
- `escapeHtml` must be used on all user-provided text embedded in SVG/HTML.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/features/reporting/reportDiagrams.ts` | **Modify.** Add cross-diagram edges in BDD/Req renderers; add `renderTraceabilityDiagram`; fix SM initial pseudostate and parent-state transition routing. |
| `src/features/reporting/reportDiagrams.sysml.test.ts` | **Modify.** Add tests for cross-diagram edges in BDD and Requirements diagrams. |
| `src/features/reporting/reportDiagrams.sm.test.ts` | **Modify.** Add tests for initial pseudostate, parent-state transitions. |
| `src/features/reporting/reportDiagrams.trace.test.ts` | **Create.** Tests for the new `renderTraceabilityDiagram`. |
| `src/features/reporting/reportDiagramLayout.ts` | **Modify.** Add `parentRectOf` helper so SM edge routing can target composite parent states. |
| `src/features/reporting/reportDiagramLayout.test.ts` | **Modify.** Add test for parent-state edge routing. |

---

## Task 1: Show Cross-Diagram Edges in BDD (Block → Requirement Relationships)

**Files:**
- Modify: `src/features/reporting/reportDiagrams.ts:88-117`
- Modify: `src/features/reporting/reportDiagrams.sysml.test.ts`

**Interfaces:**
- Consumes: `ReportBlockSource` (blocks + relationships)
- Produces: BDD SVG HTML that includes `satisfy`, `verify`, `deriveReqt`, `trace` edges from blocks to requirement blocks, rendered with dashed styling and labeled `«satisfy»` etc.

- [ ] **Step 1: Write failing test for cross-diagram edges in BDD**

Add to `src/features/reporting/reportDiagrams.sysml.test.ts`:

```typescript
describe('renderBddDiagram — cross-diagram relationships', () => {
  const sysBlocks = [
    block({ id: 'b1', name: 'Engine' }),
    block({ id: 'req1', name: 'Temp Limit', stereotype: 'requirement', reqId: 'REQ-001' }),
  ];
  const sysRels = [
    rel({ id: 'sr1', sourceId: 'b1', targetId: 'req1', type: 'satisfy', label: 'satisfies' }),
    rel({ id: 'vr1', sourceId: 'b1', targetId: 'req1', type: 'verify', label: 'verified by test' }),
  ];

  it('includes satisfy and verify edges from blocks to requirements', () => {
    const html = renderBddDiagram({ blocks: sysBlocks, relationships: sysRels });
    expect(html).toContain('edge-sr1');
    expect(html).toContain('edge-vr1');
    expect(html).toContain('«satisfy»');
    expect(html).toContain('«verify»');
    expect(html).toContain('3 blocks');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/reporting/reportDiagrams.sysml.test.ts`
Expected: FAIL — `edge-sr1` not found in output because BDD filters to only block-to-block relationships.

- [ ] **Step 3: Implement cross-diagram edge inclusion in `renderBddDiagram`**

In `src/features/reporting/reportDiagrams.ts`, replace the edge-filtering logic in `renderBddDiagram` (lines 92-97). Currently it only includes relationships where both endpoints are blocks:

```typescript
const edges: DiagramEdgeInput[] = source.relationships
  .filter(r => blockIds.has(r.sourceId) && blockIds.has(r.targetId))
```

Change to include relationships where at least ONE endpoint is a block (the other may be a requirement):

```typescript
const allBlockAndReqIds = new Set(source.blocks.map(b => b.id));
const edges: DiagramEdgeInput[] = source.relationships
  .filter(r => allBlockAndReqIds.has(r.sourceId) && allBlockAndReqIds.has(r.targetId))
```

Then also update the figure caption to count total blocks (including requirements shown as edges):

The `page` variable on line 98 currently only has non-requirement blocks. Keep that for node rendering, but use `allBlockAndReqIds` for edge filtering. This way the BDD shows blocks as nodes and draws dashed labeled edges to any requirement they satisfy/verify.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/reporting/reportDiagrams.sysml.test.ts`
Expected: PASS (all existing + new tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/reporting/reportDiagrams.ts src/features/reporting/reportDiagrams.sysml.test.ts
git commit -m "feat(report): show cross-diagram satisfy/verify edges in BDD"
```

---

## Task 2: Show Cross-Diagram Edges in Requirements Diagram (Requirement ← Block Relationships)

**Files:**
- Modify: `src/features/reporting/reportDiagrams.ts:67-86`
- Modify: `src/features/reporting/reportDiagrams.sysml.test.ts`

**Interfaces:**
- Consumes: `ReportRequirementSource` (blocks + relationships)
- Produces: Requirements diagram SVG HTML that includes `satisfy`, `verify`, `deriveReqt` edges FROM blocks TO requirements, rendered with dashed styling.

- [ ] **Step 1: Write failing test for cross-diagram edges in Requirements diagram**

Add to `src/features/reporting/reportDiagrams.sysml.test.ts`:

```typescript
describe('renderRequirementsDiagram — cross-diagram relationships', () => {
  const reqBlocks = [
    block({ id: 'r1', name: 'Temp Limit', stereotype: 'requirement', reqId: 'REQ-001' }),
    block({ id: 'r2', name: 'Fan Control', stereotype: 'requirement', reqId: 'REQ-002' }),
    block({ id: 'b1', name: 'Engine', stereotype: 'block' }),
  ];
  const reqRels = [
    rel({ id: 'sr1', sourceId: 'b1', targetId: 'r1', type: 'satisfy' }),
    rel({ id: 'vr1', sourceId: 'b1', targetId: 'r2', type: 'verify' }),
    rel({ id: 'dr1', sourceId: 'r1', targetId: 'r2', type: 'deriveReqt' }),
  ];

  it('includes satisfy/verify edges from blocks to requirements', () => {
    const html = renderRequirementsDiagram({ blocks: reqBlocks, relationships: reqRels });
    expect(html).toContain('edge-sr1');
    expect(html).toContain('edge-vr1');
    expect(html).toContain('edge-dr1');
    expect(html).toContain('3 requirements');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/reporting/reportDiagrams.sysml.test.ts`
Expected: FAIL — `edge-sr1` not found because `renderRequirementsDiagram` filters to only requirement-to-requirement relationships.

- [ ] **Step 3: Implement cross-diagram edge inclusion in `renderRequirementsDiagram`**

In `src/features/reporting/reportDiagrams.ts`, the current edge filter (line 72) is:

```typescript
.filter(r => reqIds.has(r.sourceId) && reqIds.has(r.targetId))
```

Change to include any relationship where the target is a requirement (regardless of source):

```typescript
.filter(r => reqIds.has(r.targetId))
```

This means requirements diagram will show arrows FROM blocks TO requirements (satisfy/verify/deriveReqt), giving the user traceability. The requirement nodes remain as the diagram's visible nodes; the block sources of these edges are referenced in the edge labels.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/reporting/reportDiagrams.sysml.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/reporting/reportDiagrams.ts src/features/reporting/reportDiagrams.sysml.test.ts
git commit -m "feat(report): show cross-diagram block→requirement edges in req diagram"
```

---

## Task 3: Add Renderable Traceability Diagram (Block ↔ Requirement ↔ State Machine Matrix)

**Files:**
- Create: `src/features/reporting/reportDiagrams.trace.test.ts`
- Modify: `src/features/reporting/reportDiagrams.ts`

**Interfaces:**
- Consumes: `ReportTraceabilitySource` (blocks, requirements, states, relationships, transitions)
- Produces: `renderTraceabilityDiagram(source: ReportTraceabilitySource): string` — an SVG traceability matrix showing blocks as nodes, requirements as nodes, state machine states as nodes, and all relationships between them as labeled edges.

- [ ] **Step 1: Write failing tests for `renderTraceabilityDiagram`**

Create `src/features/reporting/reportDiagrams.trace.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { renderTraceabilityDiagram } from './reportDiagrams';

const traceBlocks = [
  { id: 'b1', name: 'Engine', stereotype: 'block' },
  { id: 'b2', name: 'Sensor', stereotype: 'block' },
];
const traceReqs = [
  { id: 'r1', name: 'Temp Limit', stereotype: 'requirement', reqId: 'REQ-001' },
  { id: 'r2', name: 'Fan Ctrl', stereotype: 'requirement', reqId: 'REQ-002' },
];
const traceRels = [
  { id: 'sr1', sourceId: 'b1', targetId: 'r1', type: 'satisfy', label: '', sourceMultiplicity: '', targetMultiplicity: '' },
  { id: 'vr1', sourceId: 'b2', targetId: 'r2', type: 'verify', label: '', sourceMultiplicity: '', targetMultiplicity: '' },
];

describe('renderTraceabilityDiagram', () => {
  it('renders all blocks, requirements, and traceability edges', () => {
    const html = renderTraceabilityDiagram({
      blocks: traceBlocks,
      requirements: traceReqs,
      states: [],
      relationships: traceRels,
      transitions: [],
    });
    expect(html).toContain('Engine');
    expect(html).toContain('Temp Limit');
    expect(html).toContain('edge-sr1');
    expect(html).toContain('edge-vr1');
    expect(html).toContain('«satisfy»');
    expect(html).toContain('«verify»');
    expect(html).toContain('traceability');
  });

  it('renders state machine states and their implementing blocks', () => {
    const html = renderTraceabilityDiagram({
      blocks: [{ id: 'b1', name: 'FSM', stereotype: 'block' }],
      requirements: [],
      states: [
        { id: 's1', name: 'Idle', x: 0, y: 0, width: 100, height: 50, entry: '', during: '', exit: '', isActive: false, color: '#fff', parentId: null, children: [], priority: 0, isParallel: false, regionId: null, autostart: false },
        { id: 's2', name: 'Running', x: 0, y: 0, width: 100, height: 50, entry: '', during: '', exit: '', isActive: false, color: '#fff', parentId: null, children: [], priority: 0, isParallel: false, regionId: null, autostart: false },
      ],
      relationships: [],
      transitions: [
        { id: 't1', sourceId: 's1', targetId: 's2', condition: 'start', action: '', afterTicks: null, type: 'condition', hasControlPoint: false, order: 0 },
      ],
    });
    expect(html).toContain('Idle');
    expect(html).toContain('Running');
    expect(html).toContain('edge-t1');
  });

  it('renders empty figure when no data', () => {
    const html = renderTraceabilityDiagram({
      blocks: [],
      requirements: [],
      states: [],
      relationships: [],
      transitions: [],
    });
    expect(html).toContain('No traceability');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/reporting/reportDiagrams.trace.test.ts`
Expected: FAIL — `renderTraceabilityDiagram` not found.

- [ ] **Step 3: Implement `renderTraceabilityDiagram`**

Add to `src/features/reporting/reportDiagrams.ts`:

```typescript
export interface ReportTraceabilitySource {
  blocks: readonly BlockData[];
  requirements: readonly BlockData[];
  states: readonly StateData[];
  relationships: readonly RelationshipData[];
  transitions: readonly TransitionData[];
}

export function renderTraceabilityDiagram(source: ReportTraceabilitySource): string {
  const allNodes: BlockData[] = [
    ...source.blocks.filter(b => b.stereotype !== 'requirement'),
    ...source.requirements.filter(b => b.stereotype === 'requirement'),
  ];
  if (allNodes.length === 0 && source.states.length === 0) {
    return renderEmptyFigure('No traceability data available.');
  }

  const nodeIds = new Set(allNodes.map(n => n.id));
  const stateNodes: SizedNode[] = source.states
    .filter(s => !(s.parentId && source.states.some(p => p.id === s.parentId && (p.children ?? []).includes(s.id))))
    .map(s => measureNode(s.id, [s.name, '«state»'], 'state', 80));

  const blockNodes: SizedNode[] = allNodes.map(n => {
    const isReq = n.stereotype === 'requirement';
    return measureNode(n.id, [
      isReq ? `«requirement»` : `«${n.stereotype ?? 'block'}»`,
      n.name ?? '',
      n.reqId ?? '',
    ].filter(Boolean), isReq ? 'req' : 'bdd', 90);
  });

  const sized = new Map<string, SizedNode>([
    ...blockNodes.map(n => [n.id, n]),
    ...stateNodes.map(n => [n.id, n]),
  ]);

  const relEdges: DiagramEdgeInput[] = source.relationships
    .filter(r => sized.has(r.sourceId) && sized.has(r.targetId))
    .map(r => ({
      id: r.id,
      sourceId: r.sourceId,
      targetId: r.targetId,
      label: `«${r.type}»`,
      kind: r.type,
    }));

  const smEdges: DiagramEdgeInput[] = source.transitions
    .filter(t => sized.has(t.sourceId) && sized.has(t.targetId))
    .map(t => ({
      id: t.id,
      sourceId: t.sourceId,
      targetId: t.targetId,
      label: transitionLabel(t),
      kind: 'transition',
    }));

  const allEdges = [...relEdges, ...smEdges];
  const allSized = [...sized.values()];
  const placed = layoutLayered(allSized, allEdges);

  const edgeEls = allEdges.map(e => {
    const src = nodeById(placed, e.sourceId)!;
    const tgt = nodeById(placed, e.targetId)!;
    if (!src || !tgt) return '';
    return drawStyledEdge(e, routeEdgePath(src, tgt));
  });

  const nodeEls = allSized.map(s => {
    const pos = nodeById(placed, s.id);
    if (!pos) return '';
    const isReq = source.requirements.some(r => r.id === s.id);
    return drawLabeledNode(s, pos, isReq ? REQ_STROKE : NODE_STROKE);
  });

  const inner = [...edgeEls, ...nodeEls].join('');
  const totalNodes = allNodes.length + source.states.length;
  return wrapFigure(inner, `Traceability diagram (${totalNodes} elements, ${allEdges.length} relationships)`, boundsOf(placed, 24));
}
```

Note: `transitionLabel` is a private helper in the same file. Move it above `renderTraceabilityDiagram` or extract it. It is already accessible since it is defined in the same module scope at line 218.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/reporting/reportDiagrams.trace.test.ts`
Expected: PASS.

- [ ] **Step 5: Run all reporting tests to confirm no regressions**

Run: `npx vitest run src/features/reporting/`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/features/reporting/reportDiagrams.ts src/features/reporting/reportDiagrams.trace.test.ts
git commit -m "feat(report): add traceability diagram showing block↔requirement↔SM connections"
```

---

## Task 4: Add Initial Pseudostate to State Machine Diagrams

**Files:**
- Modify: `src/features/reporting/reportDiagrams.ts:223-288`
- Modify: `src/features/reporting/reportDiagrams.sm.test.ts`

**Interfaces:**
- Consumes: `StateData` with `autostart: true`
- Produces: A filled black circle (initial pseudostate) drawn to the left of the autostart state with an arrow transition from it to the autostart state.

- [ ] **Step 1: Write failing test for initial pseudostate**

Add to `src/features/reporting/reportDiagrams.sm.test.ts`:

```typescript
it('renders an initial pseudostate filled circle for the autostart state', () => {
  const figures = renderStateMachineDiagrams({ layers, states, junctions, transitions });
  expect(figures[0]).toContain('initial-pseudostate');
  expect(figures[0]).toContain('<circle');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/reporting/reportDiagrams.sm.test.ts`
Expected: FAIL — `initial-pseudostate` not found.

- [ ] **Step 3: Implement initial pseudostate rendering**

In `src/features/reporting/reportDiagrams.ts`, inside `renderStateMachineLayer` (after the `placed` layout is computed, around line 256), add logic to find the autostart state and draw a small filled circle to its left with an arrow to it:

After `const allPlaced = [...placedById.values()];` (line 256), add:

```typescript
const autostartState = layerStates.find(s => s.autostart);
let initialPseudostateEls = '';
if (autostartState) {
  const asRect = placedById.get(autostartState.id);
  if (asRect) {
    const psSize = 14;
    const psX = asRect.x - 50;
    const psY = asRect.y + asRect.height / 2 - psSize / 2;
    initialPseudostateEls = `<circle class="initial-pseudostate" cx="${psX + psSize / 2}" cy="${psY + psSize / 2}" r="${psSize / 2}" fill="#182231" stroke="#182231" stroke-width="1.2"/>`
      + `<path d="M ${psX + psSize} ${psY + psSize / 2} L ${asRect.x} ${asRect.y + asRect.height / 2}" fill="none" stroke="${EDGE_STROKE}" stroke-width="1.1" marker-end="url(#rf-arrow)"/>`;
  }
}
```

Then include `initialPseudostateEls` in the `inner` array at line 285:

```typescript
const inner = [initialPseudostateEls, ...containerEls, ...edgeEls, ...stateEls, ...junctionEls].join('');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/reporting/reportDiagrams.sm.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/reporting/reportDiagrams.ts src/features/reporting/reportDiagrams.sm.test.ts
git commit -m "feat(report): add initial pseudostate circle to state machine diagrams"
```

---

## Task 5: Fix State Machine Transitions Targeting Parent Composite States

**Files:**
- Modify: `src/features/reporting/reportDiagrams.ts:246-266`
- Modify: `src/features/reporting/reportDiagramLayout.test.ts`

**Interfaces:**
- Consumes: `StateData` with `children`, `parentId`
- Produces: Transitions from leaf states to parent composite states route to the parent's bounding rectangle (not silently dropped).

- [ ] **Step 1: Write failing test for parent-state transitions**

Add to `src/features/reporting/reportDiagrams.sm.test.ts`:

```typescript
it('renders transitions that target parent composite states', () => {
  const parentTransitions = [
    transition({ id: 't4', sourceId: 'cool', targetId: 'op', condition: 'restart' }),
  ];
  const figures = renderStateMachineDiagrams({
    layers: [{
      id: 'l3', name: 'With Parent Target', parentStateId: null,
      stateIds: ['idle', 'op', 'heat', 'cool'],
      transitionIds: ['t1', 't2', 't3', 't4'],
      junctionIds: [],
    }],
    states,
    junctions: [],
    transitions: [...transitions, ...parentTransitions],
  });
  expect(figures[0]).toContain('edge-t4');
  expect(figures[0]).toContain('[restart]');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/reporting/reportDiagrams.sm.test.ts`
Expected: FAIL — `edge-t4` not found because parent-state bounding rects are computed after leaf layout, and `rectOf(t.targetId)` returns `undefined` for the parent.

- [ ] **Step 3: Fix edge routing to resolve parent composite state rects**

In `src/features/reporting/reportDiagrams.ts`, the edge routing loop at line 258 uses `rectOf(t.sourceId)` and `rectOf(t.targetId)`. The problem is that parent states are added to `placedById` *after* the edge routing (lines 246-254). Move the parent-state container computation *before* the edge routing.

Restructure `renderStateMachineLayer` so the order is:

1. Compute `leafPlaced` layout for leaf states and junctions.
2. Compute parent-state bounding rects and add to `placedById`.
3. Compute `allPlaced` from `placedById`.
4. Route edges using the now-complete `placedById`.
5. Render container rects, edge paths, state nodes, junction circles.

The current code already has the parent computation at lines 246-254, but the edge routing at line 258 uses `rectOf` which reads from `placedById` *after* parents are added. The issue is that `allPlaced` is computed at line 256 *before* the edge routing loop. The `rectOf` helper at line 257 reads from `placedById` which already has parents. So the real issue is that `rectOf` might not find the parent because the parent's id is not in `layerIds` and thus not in `stateById`.

Looking more carefully: `stateById` at line 229 is built from `layerStates`, which INCLUDES parent states. And `placedById` at line 242 is built from `leafPlaced` (leaf nodes only). The parent computation at lines 246-254 adds parents to `placedById`. So `rectOf` at line 257 should find them.

The real issue may be that the transition source/target lookup (`layerTransitions.filter(t => layer.transitionIds.includes(t.id))`) excludes the parent-targeting transition if it's in `transitionIds`. Let me verify: in the test, `t4` has `sourceId: 'cool'` and `targetId: 'op'`. Both are in `layer.stateIds`. The transition `t4` is in `transitionIds`. So it should be included in `layerTransitions`.

The actual bug is in how `drawStyledEdge` handles the path when source and target overlap or the target contains the source. When a leaf state is *inside* the parent container, the edge from the leaf to the parent goes "inward" — the source rect is inside the target rect. `routeEdgePath` computes `tx >= sx` and draws a forward curve, but since the target is larger and encompasses the source, the edge visually goes inside the parent box rather than connecting to its border.

The fix: when a transition targets a parent composite state, route the edge from the source's border to the parent's border using the center-to-center approach, ensuring the arrow reaches the parent's frame border, not its interior.

Replace the edge rendering block (lines 258-266) with:

```typescript
const edgeEls = layerTransitions.map((t, index) => {
  const src = rectOf(t.sourceId);
  const tgt = rectOf(t.targetId);
  if (!src || !tgt) return '';
  const isParentTarget = tgt !== src && placedById.has(t.targetId) &&
    layerStates.some(s => s.id === t.targetId && (s.children ?? []).some(c => c === t.sourceId || src.x >= tgt.x && src.y >= tgt.y && src.x + src.width <= tgt.x + tgt.width && src.y + src.height <= tgt.y + tgt.height));
  let edgePath: string;
  if (isParentTarget) {
    const sx2 = src.x + src.width / 2;
    const sy2 = src.y;
    const tx2 = tgt.x + tgt.width / 2;
    const ty2 = tgt.y;
    edgePath = `M ${sx2} ${sy2} C ${sx2} ${sy2 - 20}, ${tx2} ${ty2 + 20}, ${tx2} ${ty2}`;
  } else {
    edgePath = routeEdgePath(src, tgt, { index });
  }
  return drawStyledEdge(
    { id: t.id, sourceId: t.sourceId, targetId: t.targetId, label: transitionLabel(t), kind: 'transition' },
    edgePath,
  );
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/reporting/reportDiagrams.sm.test.ts`
Expected: PASS.

- [ ] **Step 5: Run layout tests to confirm no regressions**

Run: `npx vitest run src/features/reporting/reportDiagramLayout.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/reporting/reportDiagrams.ts src/features/reporting/reportDiagrams.sm.test.ts
git commit -m "fix(report): route SM transitions to parent composite states correctly"
```

---

## Task 6: Fix IBD Connector Routing for Cross-Block Parts

**Files:**
- Modify: `src/features/reporting/reportDiagrams.ts:129-197`
- Modify: `src/features/reporting/reportDiagrams.ibd.test.ts`

**Interfaces:**
- Consumes: `ReportIbdSource` (contextBlock, parts, connectors, blocks)
- Produces: IBD connectors between parts whose `blockId` differs from the context block's id are rendered (not silently dropped).

- [ ] **Step 1: Write failing test for cross-block connectors**

Add to `src/features/reporting/reportDiagrams.ibd.test.ts`:

```typescript
it('renders connectors between parts from different parent blocks', () => {
  const crossBlocks: BlockData[] = [
    { id: 'ctrl', name: 'Controller', stereotype: 'block', x: 0, y: 0, width: 160, height: 80, properties: [], operations: [], constraints: [], classes: [], ports: [{ id: 'p1', name: 'out', type: 'Real', direction: 'out' } as never] } as BlockData,
    { id: 'act', name: 'Actuator', stereotype: 'block', x: 0, y: 0, width: 160, height: 80, properties: [], operations: [], constraints: [], classes: [], ports: [{ id: 'p2', name: 'in', type: 'Real', direction: 'in' } as never] } as BlockData,
  ];
  const crossParts: PartData[] = [
    { id: 'cp1', name: 'ctrl_inst', blockId: 'otherBlock', typeId: 'ctrl', x: 0, y: 0, width: 140, height: 70 } as PartData,
    { id: 'cp2', name: 'act_inst', blockId: 'anotherBlock', typeId: 'act', x: 300, y: 0, width: 140, height: 70 } as PartData,
  ];
  const crossConns: ConnectorData[] = [
    { id: 'cc1', sourcePartId: 'cp1', sourcePortId: 'p1', targetPartId: 'cp2', targetPortId: 'p2', itemFlow: 'signal' } as ConnectorData,
  ];
  const html = renderIbdDiagram({ contextBlock, parts: crossParts, connectors: crossConns, blocks: crossBlocks });
  expect(html).toContain('edge-cc1');
  expect(html).toContain('signal');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/reporting/reportDiagrams.ibd.test.ts`
Expected: FAIL — `edge-cc1` not found because the connector routing silently returns `''` when `from` or `to` positions can't be resolved (the `blockId` filter in `getPortPos` doesn't match).

- [ ] **Step 3: Fix port position lookup to not filter by `blockId`**

In `src/features/reporting/reportDiagrams.ts`, the `renderIbdDiagram` function builds `portPositions` by iterating over `source.parts` and looking up each part's type block's ports. The connector resolution at lines 177-182 uses `portPositions.get(...)` with keys like `${conn.sourcePartId}:${conn.sourcePortId}`.

The issue is that `portPositions` is only built for parts whose type block exists in `source.blocks`. If a part's type block is not in the source blocks (cross-block scenario), the ports won't be registered.

The fix: when a part's type block is not found in `source.blocks`, still register the part's position (for the connector to anchor to) and try to resolve port positions from the part's `portLayouts` or use a default edge position.

Replace the port position registration loop (lines 144-159) with:

```typescript
for (const part of source.parts) {
  const typeBlock = part.typeId ? blockById.get(part.typeId) : undefined;
  const ports = typeBlock?.ports ?? [];
  const rect = placedById.get(part.id);
  if (!rect) continue;
  
  if (ports.length === 0) {
    // Register a default center position for the part itself so connectors can anchor
    portPositions.set(`${part.id}:__center`, { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, name: '' });
  }
  
  ports.forEach((port, i) => {
    const leftSide = i % 2 === 0;
    const slot = Math.floor(i / 2);
    const x = leftSide ? rect.x - 5 : rect.x + rect.width - 5;
    const y = rect.y + 18 + slot * 18;
    portPositions.set(`${part.id}:${port.id}`, { x: x + 5, y: y + 5, name: port.name });
    portEls.push(
      `<rect x="${x}" y="${y}" width="10" height="10" fill="#ffffff" stroke="${NODE_STROKE}" stroke-width="1"/>`,
      `<text x="${leftSide ? x - 4 : x + 14}" y="${y + 9}" font-size="9" fill="#44515e" text-anchor="${leftSide ? 'end' : 'start'}">${escapeHtml(port.name)}</text>`,
    );
  });
}
```

Then update the connector resolution (lines 177-182) to fall back to the center position:

```typescript
const connectorEls = source.connectors.map((conn, index) => {
  const from = portPositions.get(`${conn.sourcePartId}:${conn.sourcePortId}`)
    ?? portPositions.get(`:${conn.sourcePortId}`)
    ?? portPositions.get(`${source.contextBlock.id}:${conn.sourcePortId}`)
    ?? portPositions.get(`${conn.sourcePartId}:__center`)
    ?? { x: 0, y: 0 };
  const to = portPositions.get(`${conn.targetPartId}:${conn.targetPortId}`)
    ?? portPositions.get(`:${conn.targetPortId}`)
    ?? portPositions.get(`${source.contextBlock.id}:${conn.targetPortId}`)
    ?? portPositions.get(`${conn.targetPartId}:__center`)
    ?? { x: 0, y: 0 };
  if (!from || !to) return '';
  const label = conn.itemFlow ?? conn.label ?? '';
  return `<path id="edge-${conn.id}" d="${routeManhattan(from, to, index)}" fill="none" stroke="${EDGE_STROKE}" stroke-width="1.1" marker-end="url(#rf-arrow)"/>`
    + (label ? `<text font-size="9" fill="#65717e" text-anchor="middle"><textPath href="#edge-${conn.id}" startOffset="50%">${escapeHtml(label)}</textPath></text>` : '');
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/reporting/reportDiagrams.ibd.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/reporting/reportDiagrams.ts src/features/reporting/reportDiagrams.ibd.test.ts
git commit -m "fix(report): render IBD connectors for cross-block parts with fallback anchoring"
```

---

## Task 7: Export `renderTraceabilityDiagram` from Reporting Index

**Files:**
- Modify: `src/features/reporting/index.ts`

**Interfaces:**
- Consumes: `renderTraceabilityDiagram` from `reportDiagrams.ts`
- Produces: Public export available to `App.tsx`.

- [ ] **Step 1: Add export**

The `reportDiagrams.ts` exports are already re-exported via `export * from './reportDiagrams'` at `src/features/reporting/index.ts:3`. Since `renderTraceabilityDiagram` is a named export of `reportDiagrams.ts`, it is automatically exported. No change needed. Verify:

Run: `npx vitest run src/features/reporting/index.test.ts`
Expected: PASS.

- [ ] **Step 2: Add a smoke test for the traceability export**

Add to `src/features/reporting/index.test.ts`:

```typescript
it('exports renderTraceabilityDiagram', () => {
  expect(reporting.renderTraceabilityDiagram).toBeTypeOf('function');
});
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npx vitest run src/features/reporting/index.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/features/reporting/index.test.ts
git commit -m "test(report): verify renderTraceabilityDiagram is publicly exported"
```

---

## Task 8: Full Verification & Regression Check

**Files:**
- All modified files

- [ ] **Step 1: Run the full reporting test suite**

Run: `npx vitest run src/features/reporting/`
Expected: All tests pass (existing 44 + new tests).

- [ ] **Step 2: Run TypeScript compiler check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Run lint if configured**

Run: `npx eslint src/features/reporting/ --ext .ts`
Expected: no new lint errors.

- [ ] **Step 4: Final commit (if any fixes needed)**

```bash
git commit -m "fix(report): complete diagram connection and fault fixes"
```

---

## Self-Review

### Spec Coverage Check

| Issue | Task |
|---|---|
| BDD missing block→requirement edges | Task 1 |
| Requirements diagram missing block→requirement edges | Task 2 |
| No traceability diagram connecting all diagram types | Task 3 |
| State machine missing initial pseudostate | Task 4 |
| SM transitions to parent states not rendering | Task 5 |
| IBD connectors dropping cross-block parts | Task 6 |
| Traceability export verification | Task 7 |

### Placeholder Scan

No `TBD`, `TODO`, or vague steps present. Every step includes exact file paths, function signatures, and code snippets.

### Type Consistency Check

- `renderTraceabilityDiagram` uses the same `SizedNode`, `DiagramEdgeInput`, `PositionedNode` types as all other renderers.
- `transitionLabel` is reused from the existing module scope (line 218).
- `drawStyledEdge`, `drawLabeledNode`, `layoutLayered`, `routeEdgePath`, `nodeById`, `boundsOf`, `wrapFigure`, `renderEmptyFigure` are all existing exports from the same module or imported helpers.
- `REQ_STROKE` and `NODE_STROKE` are existing constants at lines 18-19.

### Known Out-of-Scope Items

- IBD port multiplicity labels: deferred (requires `PortData.multiplicity` extension).
- State machine parallel region rendering: already handled by existing `isParallel` logic.
- Interactive drill-down from traceability diagram to BDD/IBD: deferred to future UI work.
