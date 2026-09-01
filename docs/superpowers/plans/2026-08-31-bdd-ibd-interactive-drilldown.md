# Interactive BDD ↔ IBD Drill-Down & Multi-Layer Navigation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable interactive drill-down from Block Definition Diagrams (BDD) to Internal Block Diagrams (IBD) and nested sub-IBD structures via double-click, with breadcrumb navigation and zoom/pan controls.

**Architecture:** Pure SVG nodes in `reportDiagrams.ts` are decorated with interactive attributes (`data-node-id`, `has-child-layer`, `ondblclick`) and badges when child structures exist. `reportHierarchyEngine.ts` orchestrates the multi-layer interactive container (`renderInteractiveDiagramHierarchy`), packaging root BDD, child IBDs, and nested sub-IBD/state machine layers with the client navigation script (`generateDiagramScript`).

**Tech Stack:** TypeScript, Vitest, SVG (HTML string generation).

## Global Constraints

- All existing tests in `src/features/reporting/` (53 tests) must continue to pass.
- Diagram functions remain pure (receive data, return HTML strings).
- `escapeHtml` must be applied to all dynamic titles, names, and labels.
- Zero external runtime library dependencies for diagram navigation (pure vanilla JS helper).

---

## File Structure

| File | Responsibility |
|---|---|
| `src/features/reporting/reportDiagrams.ts` | **Modify.** Add interactive node wrapping and child layer detection in `drawLabeledNode`, `renderBddDiagram`, and `renderIbdDiagram`. |
| `src/features/reporting/reportDiagrams.sysml.test.ts` | **Modify.** Tests for interactive BDD block nodes with IBD child layer affordances. |
| `src/features/reporting/reportDiagrams.ibd.test.ts` | **Modify.** Tests for interactive IBD part nodes with sub-part drill-down affordances. |
| `src/features/reporting/reportHierarchyEngine.ts` | **Modify.** Implement `renderInteractiveDiagramHierarchy` compiling multi-layer container views. |
| `src/features/reporting/reportHierarchyEngine.test.ts` | **Modify.** Tests for `renderInteractiveDiagramHierarchy`. |
| `src/features/reporting/index.ts` | **Modify.** Re-export new hierarchy renderer. |
| `src/features/reporting/index.test.ts` | **Modify.** Test facade exports. |

---

## Task 1: Add Interactive Node Support in `drawLabeledNode` & `renderBddDiagram`

**Files:**
- Modify: `src/features/reporting/reportDiagrams.ts`
- Modify: `src/features/reporting/reportDiagrams.sysml.test.ts`

**Interfaces:**
- `LabeledNodeOptions`: `{ stroke?: string; isInteractive?: boolean; childLayerId?: string; childLayerTitle?: string; containerId?: string }`
- `ReportBlockSource`: extended with optional `parts?: readonly PartData[]` and `containerId?: string`.

- [ ] **Step 1: Write failing test for interactive BDD block nodes**

Add to `src/features/reporting/reportDiagrams.sysml.test.ts`:

```typescript
describe('renderBddDiagram — interactive drilldown affordance', () => {
  const blocks = [
    block({ id: 'b1', name: 'Engine' }),
    block({ id: 'b2', name: 'Sensor' }),
  ];
  const parts = [
    { id: 'p1', name: 'piston', blockId: 'b1', typeId: 'b1', x: 0, y: 0, width: 100, height: 50 } as PartData,
  ];

  it('renders interactive double-click attributes and IBD badge for blocks with parts', () => {
    const html = renderBddDiagram({
      blocks,
      relationships: [],
      parts,
      containerId: 'diag-main',
    });
    expect(html).toContain('has-child-layer');
    expect(html).toContain('cursor: pointer');
    expect(html).toContain('ondblclick="window.ADIA_DIAGRAM_NAV.drillDown(\'diag-main\', \'ibd-b1\', \'IBD · Engine\')"');
    expect(html).toContain('⤓ [IBD]');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/reporting/reportDiagrams.sysml.test.ts`
Expected: FAIL — `has-child-layer` and `ondblclick` not found.

- [ ] **Step 3: Implement interactive node decoration in `drawLabeledNode` and `renderBddDiagram`**

In `src/features/reporting/reportDiagrams.ts`:
1. Update `drawLabeledNode`:
```typescript
export interface LabeledNodeOptions {
  stroke?: string;
  isInteractive?: boolean;
  childLayerId?: string;
  childLayerTitle?: string;
  containerId?: string;
}

export function drawLabeledNode(
  node: SizedNode,
  pos: PositionedNode,
  optionsOrStroke?: string | LabeledNodeOptions,
): string {
  const opts: LabeledNodeOptions = typeof optionsOrStroke === 'string'
    ? { stroke: optionsOrStroke }
    : (optionsOrStroke ?? {});
  const stroke = opts.stroke ?? NODE_STROKE;

  const lines = node.lines.map((line, i) => {
    const weight = i === 0 ? ' font-weight="600"' : '';
    const fill = i === 0 ? TEXT_COLOR : '#44515e';
    return `<text x="${pos.x + pos.width / 2}" y="${pos.y + 18 + i * 15}" text-anchor="middle" font-size="11"${weight} fill="${fill}">${escapeHtml(line)}</text>`;
  }).join('');

  const rectEl = `<rect x="${pos.x}" y="${pos.y}" width="${pos.width}" height="${pos.height}" rx="6" fill="${NODE_FILL}" stroke="${stroke}" stroke-width="1.2"/>${lines}`;

  if (opts.isInteractive && opts.childLayerId) {
    const containerId = opts.containerId ?? 'diag-container';
    const escapedTitle = escapeHtml(opts.childLayerTitle ?? node.id);
    return `<g class="diagram-node has-child-layer" data-node-id="${escapeHtml(node.id)}" style="cursor: pointer" ondblclick="window.ADIA_DIAGRAM_NAV.drillDown('${escapeHtml(containerId)}', '${escapeHtml(opts.childLayerId)}', '${escapedTitle}')">${rectEl}</g>`;
  }

  return rectEl;
}
```

2. Update `ReportBlockSource`:
```typescript
export interface ReportBlockSource {
  blocks: readonly BlockData[];
  relationships: readonly RelationshipData[];
  parts?: readonly PartData[];
  containerId?: string;
}
```

3. Update `renderBddDiagram`:
Detect if each block has child parts in `source.parts`. If so, append `⤓ [IBD]` to its stereotype line and pass `{ isInteractive: true, childLayerId: `ibd-${b.id}`, childLayerTitle: `IBD · ${b.name}`, containerId: source.containerId }` to `drawLabeledNode`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/reporting/reportDiagrams.sysml.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/reporting/reportDiagrams.ts src/features/reporting/reportDiagrams.sysml.test.ts
git commit -m "feat(report): add interactive BDD node drilldown to IBD"
```

---

## Task 2: Add Sub-Structure Drill-Down on IBD Part Nodes

**Files:**
- Modify: `src/features/reporting/reportDiagrams.ts`
- Modify: `src/features/reporting/reportDiagrams.ibd.test.ts`

**Interfaces:**
- `ReportIbdSource`: extended with optional `containerId?: string`.

- [ ] **Step 1: Write failing test for interactive IBD part nodes with sub-parts**

Add to `src/features/reporting/reportDiagrams.ibd.test.ts`:

```typescript
describe('renderIbdDiagram — sub-structure drilldown affordance', () => {
  it('renders interactive double-click attributes for parts that have nested sub-parts', () => {
    const subParts: PartData[] = [
      { id: 'p1', name: 'ctrl', blockId: 'sys', typeId: 'ctrlBlock', x: 0, y: 0, width: 140, height: 70 } as PartData,
      { id: 'sp1', name: 'sub_chip', blockId: 'ctrlBlock', typeId: 'chipBlock', x: 0, y: 0, width: 100, height: 50 } as PartData,
    ];
    const ctrlBlock = { id: 'ctrlBlock', name: 'Controller', stereotype: 'block', ports: [] } as unknown as BlockData;
    const html = renderIbdDiagram({
      contextBlock,
      parts: subParts.filter(p => p.blockId === 'sys'),
      connectors: [],
      blocks: [contextBlock, ctrlBlock],
      allParts: subParts,
      containerId: 'diag-main',
    });
    expect(html).toContain('has-child-layer');
    expect(html).toContain('ondblclick="window.ADIA_DIAGRAM_NAV.drillDown(\'diag-main\', \'ibd-ctrlBlock\', \'Internal Sub-Structure · ctrl (Controller)\')"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/reporting/reportDiagrams.ibd.test.ts`
Expected: FAIL — `ondblclick` not found.

- [ ] **Step 3: Implement sub-structure drill-down in `renderIbdDiagram`**

1. Extend `ReportIbdSource`:
```typescript
export interface ReportIbdSource {
  contextBlock: BlockData;
  parts: readonly PartData[];
  connectors: readonly ConnectorData[];
  blocks: readonly BlockData[];
  allParts?: readonly PartData[];
  containerId?: string;
}
```

2. In `renderIbdDiagram`:
When rendering each part in `partEls`, check if `source.allParts` contains parts with `blockId === part.typeId`. If so, pass `{ isInteractive: true, childLayerId: `ibd-${part.typeId}`, childLayerTitle: `Internal Sub-Structure · ${part.name} (${typeName})`, containerId: source.containerId }` to `drawLabeledNode`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/reporting/reportDiagrams.ibd.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/reporting/reportDiagrams.ts src/features/reporting/reportDiagrams.ibd.test.ts
git commit -m "feat(report): add interactive IBD part sub-structure drilldown"
```

---

## Task 3: Implement `renderInteractiveDiagramHierarchy` in `reportHierarchyEngine.ts`

**Files:**
- Modify: `src/features/reporting/reportHierarchyEngine.ts`
- Modify: `src/features/reporting/reportHierarchyEngine.test.ts`

**Interfaces:**
- `renderInteractiveDiagramHierarchy(model: HierarchySourceModel, options?: { containerId?: string; title?: string }): string`

- [ ] **Step 1: Write failing test for `renderInteractiveDiagramHierarchy`**

Add to `src/features/reporting/reportHierarchyEngine.test.ts`:

```typescript
describe('renderInteractiveDiagramHierarchy', () => {
  const model: HierarchySourceModel = {
    blocks: [
      { id: 'b1', name: 'ThermalSystem', stereotype: 'block', x: 0, y: 0, width: 160, height: 80, properties: [], operations: [], constraints: [], classes: [], ports: [] } as BlockData,
      { id: 'b2', name: 'Controller', stereotype: 'block', x: 0, y: 0, width: 160, height: 80, properties: [], operations: [], constraints: [], classes: [], ports: [] } as BlockData,
    ],
    parts: [
      { id: 'p1', name: 'ctrl_inst', blockId: 'b1', typeId: 'b2', x: 0, y: 0, width: 140, height: 70 } as PartData,
    ],
    connectors: [],
    relationships: [],
    states: [],
    layers: [],
    transitions: [],
    junctions: [],
  };

  it('renders interactive container with root BDD, child IBD views, breadcrumbs and script', () => {
    const html = renderInteractiveDiagramHierarchy(model, { containerId: 'test-diag-1', title: 'System Architecture' });
    expect(html).toContain('id="test-diag-1"');
    expect(html).toContain('id="bc-test-diag-1"');
    expect(html).toContain('id="layer-bdd-root"');
    expect(html).toContain('id="layer-ibd-b1"');
    expect(html).toContain('ADIA_DIAGRAM_NAV.initContainer');
    expect(html).toContain('ThermalSystem');
    expect(html).toContain('ctrl_inst');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/reporting/reportHierarchyEngine.test.ts`
Expected: FAIL — `renderInteractiveDiagramHierarchy` is not defined.

- [ ] **Step 3: Implement `renderInteractiveDiagramHierarchy`**

In `src/features/reporting/reportHierarchyEngine.ts`:
1. Build hierarchy registry using `buildReportHierarchy(model)`.
2. Generate root BDD SVG using `renderBddDiagram({ ...model, parts: model.parts, containerId })`.
3. For each registered IBD layer (e.g. `ibd-${block.id}`), find context block and render IBD SVG using `renderIbdDiagram({ contextBlock, parts: blockParts, connectors: blockConnectors, blocks: model.blocks, allParts: model.parts, containerId })`.
4. Wrap in `<div class="diagram-card" id="${containerId}">`:
   - Header with `<div id="bc-${containerId}" class="diagram-breadcrumbs"></div>` and zoom/reset controls.
   - Body with root layer `<div id="layer-bdd-root" class="diagram-layer-view active">${rootBddSvg}</div>` and child layers `<div id="layer-${layerId}" class="diagram-layer-view" style="display:none">${layerSvg}</div>`.
   - Script with `generateDiagramScript(registry)` + auto-initialization call `window.ADIA_DIAGRAM_NAV.initContainer('${containerId}', 'bdd-root', '${escapeHtml(title)}');`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/reporting/reportHierarchyEngine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/reporting/reportHierarchyEngine.ts src/features/reporting/reportHierarchyEngine.test.ts
git commit -m "feat(report): implement renderInteractiveDiagramHierarchy with full drilldown"
```

---

## Task 4: Re-Export & Facade Smoke Test

**Files:**
- Modify: `src/features/reporting/index.ts`
- Modify: `src/features/reporting/index.test.ts`

- [ ] **Step 1: Add assertion in `src/features/reporting/index.test.ts`**

```typescript
expect(reporting.renderInteractiveDiagramHierarchy).toBeTypeOf('function');
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run src/features/reporting/index.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/features/reporting/index.ts src/features/reporting/index.test.ts
git commit -m "test(report): verify renderInteractiveDiagramHierarchy export"
```

---

## Task 5: Full Verification & Typecheck

**Files:**
- All modified files

- [ ] **Step 1: Run full vitest test suite**

Run: `npx vitest run src/features/reporting/`
Expected: All tests pass.

- [ ] **Step 2: Run TypeScript compiler check**

Run: `npx tsc --noEmit`
Expected: 0 errors.

---

## Self-Review Checklist

- **Spec Coverage:** BDD $\rightarrow$ IBD drill-down, nested sub-IBD drill-down, visual indicators, breadcrumbs, zoom/pan, standalone HTML & preview modal compatibility.
- **No Placeholders:** All code snippets, file paths, test cases, and commands are fully specified.
- **Type Consistency:** `HierarchySourceModel`, `ReportBlockSource`, `ReportIbdSource`, `LabeledNodeOptions` are strictly typed and compatible across all modules.
