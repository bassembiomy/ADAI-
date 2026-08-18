# Report Diagram Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every diagram in the ADIA generated report (requirements, BDD, IBD, state machine, X-Bridges, HMI) well laid out, intersection-free, captioned, and print-professional.

**Architecture:** Extract diagram rendering out of `handleGenerateReport` in `src/App.tsx` into three focused modules under `src/features/reporting/`: a pure geometry/model module, a pure layout/edge-routing module, and a renderer module that emits self-contained `<figure>` + SVG strings. `handleGenerateReport` keeps ownership of the surrounding report HTML and calls the new renderers. A new X-Bridges report section is added because the current report never renders X-Bridges at all.

**Tech Stack:** TypeScript 5, Vitest 4, existing ADIA types (`src/types/sm_types.ts`), no new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-08-14-report-diagram-rendering-design.md`

## Global Constraints

- Do not add any new runtime dependency.
- Diagram renderers are pure functions: data in, HTML string out. They must not mutate their inputs.
- All user-facing text in diagrams is HTML-escaped.
- Default node cap per figure: 20 (`MAX_NODES_PER_FIGURE = 20`); split instead of shrinking text below a minimum effective font size of 10px.
- Diagram coordinates are independent display coordinates; project model positions are never written back.
- Empty diagram data renders a formal `No data available` figure.
- Renderer exceptions must surface as an unavailable-evidence note, never as a silent blank area (App integration wraps calls in try/catch).
- Run tests with `npx vitest run <path>`; type check with `npx tsc --noEmit`.

---

## File Structure

- `src/types/sysml_types.ts` (new): SysML/HMI interfaces moved verbatim out of `src/App.tsx` so both `App.tsx` and the reporting modules can import them.
- `src/features/reporting/reportDiagramModel.ts` (new): shared diagram geometry, text measurement, escaping, chunking, SVG marker defs, figure wrapper.
- `src/features/reporting/reportDiagramLayout.ts` (new): deterministic layered layout, grid layout, and edge routing with overlap-free placement guarantees.
- `src/features/reporting/reportDiagrams.ts` (new): the six public renderers (`renderRequirementsDiagram`, `renderBddDiagram`, `renderIbdDiagram`, `renderStateMachineDiagrams`, `renderXbridgesDiagram`, `renderHmiDiagram`).
- `src/App.tsx` (modified): imports the moved types and the renderers; deletes the old inline helpers; adds the X-Bridges report section and figure CSS.
- Tests: one co-located `*.test.ts` per new module.

---

### Task 1: Extract SysML/HMI Types from App.tsx

The renderer module must import `BlockData`, `RelationshipData`, `PartData`, `ConnectorData`, and `HmiComponent` without importing the 17k-line `App.tsx`. These interfaces are currently local to `src/App.tsx` (lines 287–414). Move them verbatim into a shared types file.

**Files:**
- Create: `src/types/sysml_types.ts`
- Modify: `src/App.tsx:287-414`

**Interfaces:**
- Produces: exported `PortData`, `ValuePropertyData`, `BlockData`, `RelationshipData`, `PartData`, `ConnectorData`, `InterfaceRealizationData`, `HmiComponentType`, `HmiComponent`.
- Consumes: `Point` from `src/types/sm_types.ts` (already used by these interfaces in App.tsx).

- [ ] **Step 1: Create the shared types file**

In `src/App.tsx`, cut the interface block starting at the `PortData` interface (line 287) through the end of the `HmiComponent` interface (line 414) — that range contains `PortData`, `ValuePropertyData`, `BlockData`, `RelationshipData`, `PartData`, `ConnectorData`, `InterfaceRealizationData`, `HmiComponentType`, and `HmiComponent`. Paste them verbatim into `src/types/sysml_types.ts`, prefix each `interface`/`type` with `export`, and add the `Point` import at the top:

```ts
import type { Point } from './sm_types';

// ...pasted interfaces, each prefixed with export...
```

If none of the pasted interfaces references `Point`, omit the import. Do not reformat the pasted code.

- [ ] **Step 2: Import the types in App.tsx**

At the top of `src/App.tsx`, next to the existing `sm_types` import (around line 30), add:

```ts
import type {
  PortData, ValuePropertyData, BlockData, RelationshipData, PartData,
  ConnectorData, InterfaceRealizationData, HmiComponentType, HmiComponent,
} from './types/sysml_types';
```

Delete the old local interface declarations (the range cut in Step 1).

- [ ] **Step 3: Verify the type move compiles**

Run: `npx tsc --noEmit`
Expected: PASS with zero diagnostics. If App.tsx has other local declarations inside the cut range that are still referenced, keep them in App.tsx and adjust the cut boundaries.

- [ ] **Step 4: Commit**

```bash
git add src/types/sysml_types.ts src/App.tsx
git commit -m "refactor(types): extract SysML and HMI contracts from App.tsx"
```

---

### Task 2: Diagram Model and Geometry Helpers

Pure shared helpers every renderer uses. Deterministic text measurement (no DOM) keeps layout reproducible in tests and print.

**Files:**
- Create: `src/features/reporting/reportDiagramModel.ts`
- Test: `src/features/reporting/reportDiagramModel.test.ts`

**Interfaces:**
- Produces: `DiagramRect`, `SizedNode`, `DiagramEdgeInput`, `escapeHtml`, `measureNode`, `rectsOverlap`, `boundsOf`, `chunkItems`, `wrapFigure`, `renderEmptyFigure`, `SVG_MARKER_DEFS`, constants `MAX_NODES_PER_FIGURE`, `MAX_FIGURE_WIDTH`.
- Consumes: nothing.

- [ ] **Step 1: Write the failing tests**

Create `src/features/reporting/reportDiagramModel.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  MAX_NODES_PER_FIGURE, boundsOf, chunkItems, escapeHtml, measureNode,
  rectsOverlap, renderEmptyFigure, wrapFigure,
} from './reportDiagramModel';

describe('escapeHtml', () => {
  it('escapes markup-significant characters', () => {
    expect(escapeHtml('<b>"x" & `y` \'')).toBe('&lt;b&gt;&quot;x&quot; &amp; &#96;y&#96; &#39;');
  });
});

describe('measureNode', () => {
  it('sizes from the longest line with padding and enforces minimums', () => {
    const node = measureNode('a', ['Temperature Controller', '«block»'], 'bdd');
    expect(node.width).toBeGreaterThanOrEqual(72);
    expect(node.height).toBeGreaterThanOrEqual(30);
    const wider = measureNode('b', ['A much longer requirement name line'], 'bdd');
    expect(wider.width).toBeGreaterThan(measureNode('c', ['short'], 'bdd').width);
  });
});

describe('rectsOverlap', () => {
  it('detects overlap and separation', () => {
    expect(rectsOverlap({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 5, width: 10, height: 10 })).toBe(true);
    expect(rectsOverlap({ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 0, width: 10, height: 10 })).toBe(false);
  });
});

describe('boundsOf', () => {
  it('computes padded enclosing rect', () => {
    expect(boundsOf([{ x: 10, y: 20, width: 30, height: 40 }], 5))
      .toEqual({ x: 5, y: 15, width: 40, height: 50 });
  });
});

describe('chunkItems', () => {
  it('splits deterministically at the figure node cap', () => {
    const items = Array.from({ length: 41 }, (_, i) => i);
    const chunks = chunkItems(items, MAX_NODES_PER_FIGURE);
    expect(chunks.map(c => c.length)).toEqual([20, 20, 1]);
  });
});

describe('figure wrappers', () => {
  it('wrapFigure emits an SVG figure with escaped caption', () => {
    const html = wrapFigure('<rect/>', 'BDD <Root>', { x: 0, y: 0, width: 200, height: 100 });
    expect(html).toContain('<figure class="report-figure">');
    expect(html).toContain('viewBox="0 0 200 100"');
    expect(html).toContain('BDD &lt;Root&gt;');
    expect(html).toContain('report-figure-caption');
  });

  it('renderEmptyFigure renders a formal no-data statement', () => {
    expect(renderEmptyFigure('No data available for this diagram'))
      .toContain('No data available for this diagram');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/reporting/reportDiagramModel.test.ts`
Expected: FAIL because `./reportDiagramModel` does not exist.

- [ ] **Step 3: Implement the model module**

Create `src/features/reporting/reportDiagramModel.ts`:

```ts
export interface DiagramRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SizedNode {
  id: string;
  lines: string[];
  width: number;
  height: number;
  kind: string;
}

export interface DiagramEdgeInput {
  id: string;
  sourceId: string;
  targetId: string;
  label: string;
  kind: string;
}

export const DIAGRAM_FONT_SIZE = 11;
export const DIAGRAM_LINE_HEIGHT = 15;
export const DIAGRAM_NODE_PADDING_X = 10;
export const DIAGRAM_NODE_PADDING_Y = 8;
export const DIAGRAM_CHAR_WIDTH = 6.5;
export const MAX_NODES_PER_FIGURE = 20;
export const MAX_FIGURE_WIDTH = 780;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\x60/g, '&#96;');
}

export function measureNode(id: string, lines: string[], kind: string, minWidth = 72): SizedNode {
  const clean = lines.filter(line => line.length > 0);
  const textWidth = clean.reduce((max, line) => Math.max(max, line.length * DIAGRAM_CHAR_WIDTH), 0);
  const width = Math.max(minWidth, Math.ceil(textWidth + DIAGRAM_NODE_PADDING_X * 2));
  const height = Math.max(30, clean.length * DIAGRAM_LINE_HEIGHT + DIAGRAM_NODE_PADDING_Y * 2);
  return { id, lines: clean, width, height, kind };
}

export function rectsOverlap(a: DiagramRect, b: DiagramRect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

export function boundsOf(rects: DiagramRect[], padding: number): DiagramRect {
  if (rects.length === 0) return { x: 0, y: 0, width: padding * 2, height: padding * 2 };
  const minX = Math.min(...rects.map(r => r.x));
  const minY = Math.min(...rects.map(r => r.y));
  const maxX = Math.max(...rects.map(r => r.x + r.width));
  const maxY = Math.max(...rects.map(r => r.y + r.height));
  return { x: minX - padding, y: minY - padding, width: maxX - minX + padding * 2, height: maxY - minY + padding * 2 };
}

export function chunkItems<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

export const SVG_MARKER_DEFS = `<defs>
<marker id="rf-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#546e7a"/></marker>
<marker id="rf-diamond-filled" viewBox="0 0 12 10" refX="1" refY="5" markerWidth="10" markerHeight="9" orient="auto"><path d="M 1 5 L 6 1 L 11 5 L 6 9 z" fill="#546e7a"/></marker>
<marker id="rf-diamond-hollow" viewBox="0 0 12 10" refX="1" refY="5" markerWidth="10" markerHeight="9" orient="auto"><path d="M 1 5 L 6 1 L 11 5 L 6 9 z" fill="#ffffff" stroke="#546e7a"/></marker>
<marker id="rf-triangle-hollow" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="11" markerHeight="10" orient="auto"><path d="M 1 1 L 11 6 L 1 11 z" fill="#ffffff" stroke="#546e7a"/></marker>
</defs>`;

export function wrapFigure(svgInner: string, caption: string, viewBox: DiagramRect): string {
  const displayWidth = Math.min(MAX_FIGURE_WIDTH, Math.ceil(viewBox.width));
  return `<figure class="report-figure"><svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.x} ${viewBox.y} ${Math.ceil(viewBox.width)} ${Math.ceil(viewBox.height)}" width="${displayWidth}" role="img">${SVG_MARKER_DEFS}${svgInner}</svg><figcaption class="report-figure-caption">${escapeHtml(caption)}</figcaption></figure>`;
}

export function renderEmptyFigure(message: string): string {
  return `<figure class="report-figure report-figure-empty"><p>${escapeHtml(message)}</p></figure>`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/features/reporting/reportDiagramModel.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/reporting/reportDiagramModel.ts src/features/reporting/reportDiagramModel.test.ts
git commit -m "feat(report): add diagram geometry and figure model"
```

---

### Task 3: Layout Engine and Edge Routing

Deterministic layered layout that is overlap-free by construction, plus edge routing that handles forward, backward, and self edges.

**Files:**
- Create: `src/features/reporting/reportDiagramLayout.ts`
- Test: `src/features/reporting/reportDiagramLayout.test.ts`

**Interfaces:**
- Consumes: `DiagramRect`, `SizedNode`, `rectsOverlap` from `./reportDiagramModel`.
- Produces: `PositionedNode`, `layoutLayered`, `layoutGrid`, `routeEdgePath`, `routeManhattan`, `nodeById`.

- [ ] **Step 1: Write the failing tests**

Create `src/features/reporting/reportDiagramLayout.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SizedNode, measureNode, rectsOverlap } from './reportDiagramModel';
import { layoutGrid, layoutLayered, nodeById, routeEdgePath, routeManhattan } from './reportDiagramLayout';

function assertNoOverlaps(nodes: { id: string; x: number; y: number; width: number; height: number }[]): void {
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      expect(rectsOverlap(nodes[i], nodes[j]), `${nodes[i].id} overlaps ${nodes[j].id}`).toBe(false);
    }
  }
}

const chain = (): { nodes: SizedNode[]; edges: { sourceId: string; targetId: string }[] } => ({
  nodes: ['idle', 'heat', 'cool', 'safe'].map(id => measureNode(id, [id], 'state')),
  edges: [
    { sourceId: 'idle', targetId: 'heat' },
    { sourceId: 'heat', targetId: 'cool' },
    { sourceId: 'cool', targetId: 'safe' },
  ],
});

describe('layoutLayered', () => {
  it('places ranks left to right with no overlapping nodes', () => {
    const { nodes, edges } = chain();
    const placed = layoutLayered(nodes, edges, { rootIds: ['idle'] });
    assertNoOverlaps(placed);
    expect(nodeById(placed, 'idle')!.x).toBeLessThan(nodeById(placed, 'heat')!.x);
    expect(nodeById(placed, 'heat')!.x).toBeLessThan(nodeById(placed, 'cool')!.x);
    expect(nodeById(placed, 'cool')!.x).toBeLessThan(nodeById(placed, 'safe')!.x);
  });

  it('survives cyclic graphs without infinite loops or overlaps', () => {
    const nodes = ['a', 'b', 'c'].map(id => measureNode(id, [id], 'state'));
    const edges = [
      { sourceId: 'a', targetId: 'b' },
      { sourceId: 'b', targetId: 'c' },
      { sourceId: 'c', targetId: 'a' },
    ];
    const placed = layoutLayered(nodes, edges);
    expect(placed).toHaveLength(3);
    assertNoOverlaps(placed);
  });

  it('lays out a dense diamond without overlaps', () => {
    const nodes = ['root', ...Array.from({ length: 9 }, (_, i) => `mid${i}`), 'sink']
      .map(id => measureNode(id, [id], 'state'));
    const edges = [
      ...Array.from({ length: 9 }, (_, i) => ({ sourceId: 'root', targetId: `mid${i}` })),
      ...Array.from({ length: 9 }, (_, i) => ({ sourceId: `mid${i}`, targetId: 'sink' })),
    ];
    assertNoOverlaps(layoutLayered(nodes, edges, { rootIds: ['root'] }));
  });
});

describe('layoutGrid', () => {
  it('places nodes in rows without overlaps', () => {
    const nodes = Array.from({ length: 7 }, (_, i) => measureNode(`n${i}`, [`component ${i}`], 'hmi'));
    const placed = layoutGrid(nodes, 3);
    assertNoOverlaps(placed);
    expect(nodeById(placed, 'n0')!.y).toBe(nodeById(placed, 'n1')!.y);
    expect(nodeById(placed, 'n0')!.y).toBeLessThan(nodeById(placed, 'n3')!.y);
  });
});

describe('routeEdgePath', () => {
  const a = { x: 0, y: 0, width: 100, height: 40 };
  const b = { x: 240, y: 80, width: 100, height: 40 };

  it('routes forward edges as a curve from right edge to left edge', () => {
    expect(routeEdgePath(a, b)).toMatch(/^M 100 20 C /);
    expect(routeEdgePath(a, b)).toMatch(/240 120$/);
  });

  it('routes self loops above the node', () => {
    const path = routeEdgePath(a, a);
    expect(path).toContain('C');
    expect(path).toContain('-30');
  });

  it('routes backward edges below both nodes', () => {
    const path = routeEdgePath(b, a);
    expect(path).toContain(`L ${b.x + 16} 160`);
  });

  it('routes orthogonal edges through the mid channel', () => {
    expect(routeEdgePath(a, b, { orthogonal: true })).toBe('M 100 20 L 170 20 L 170 120 L 240 120');
  });
});

describe('routeManhattan', () => {
  it('offsets parallel connectors by index', () => {
    const p = { x: 10, y: 10 };
    const q = { x: 210, y: 90 };
    expect(routeManhattan(p, q, 0)).not.toBe(routeManhattan(p, q, 1));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/reporting/reportDiagramLayout.test.ts`
Expected: FAIL because `./reportDiagramLayout` does not exist.

- [ ] **Step 3: Implement the layout module**

Create `src/features/reporting/reportDiagramLayout.ts`:

```ts
import { DiagramRect, SizedNode } from './reportDiagramModel';

export interface PositionedNode extends DiagramRect {
  id: string;
}

export interface LayoutOptions {
  hGap?: number;
  vGap?: number;
  rootIds?: string[];
}

export function nodeById(nodes: PositionedNode[], id: string): PositionedNode | undefined {
  return nodes.find(n => n.id === id);
}

export function layoutLayered(
  nodes: SizedNode[],
  edges: { sourceId: string; targetId: string }[],
  opts: LayoutOptions = {},
): PositionedNode[] {
  const hGap = opts.hGap ?? 64;
  const vGap = opts.vGap ?? 44;
  const byId = new Map(nodes.map(n => [n.id, n]));
  const preds = new Map<string, string[]>(nodes.map(n => [n.id, []]));
  const succs = new Map<string, string[]>(nodes.map(n => [n.id, []]));
  for (const edge of edges) {
    if (!byId.has(edge.sourceId) || !byId.has(edge.targetId) || edge.sourceId === edge.targetId) continue;
    preds.get(edge.targetId)!.push(edge.sourceId);
    succs.get(edge.sourceId)!.push(edge.targetId);
  }

  const requestedRoots = (opts.rootIds ?? []).filter(id => byId.has(id));
  const noIncoming = nodes.filter(n => preds.get(n.id)!.length === 0).map(n => n.id);
  const startIds = requestedRoots.length > 0 ? requestedRoots
    : noIncoming.length > 0 ? noIncoming
    : nodes.slice(0, 1).map(n => n.id);

  const rank = new Map<string, number>();
  const queue: string[] = [];
  for (const id of startIds) {
    rank.set(id, 0);
    queue.push(id);
  }
  let head = 0;
  while (head < queue.length) {
    const id = queue[head++];
    for (const next of succs.get(id) ?? []) {
      const candidate = rank.get(id)! + 1;
      if ((rank.get(next) ?? -1) < candidate && candidate <= nodes.length) {
        rank.set(next, candidate);
        queue.push(next);
      }
    }
  }
  for (const node of nodes) if (!rank.has(node.id)) rank.set(node.id, 0);

  const rankKeys = [...new Set(rank.values())].sort((a, b) => a - b);
  const byRank = new Map<number, SizedNode[]>(rankKeys.map(r => [r, []]));
  for (const node of nodes) byRank.get(rank.get(node.id)!)!.push(node);

  // Median-of-predecessors ordering reduces edge crossings between ranks.
  const orderIndex = new Map<string, number>();
  rankKeys.forEach((r, rankPosition) => {
    const members = byRank.get(r)!;
    if (rankPosition === 0) {
      members.forEach((m, i) => orderIndex.set(m.id, i));
      return;
    }
    const keyed = members.map(m => {
      const predOrder = (preds.get(m.id) ?? [])
        .map(p => orderIndex.get(p))
        .filter((v): v is number => v !== undefined)
        .sort((a, b) => a - b);
      const key = predOrder.length === 0
        ? Number.MAX_SAFE_INTEGER
        : predOrder[Math.floor(predOrder.length / 2)];
      return { m, key };
    });
    keyed.sort((a, b) => a.key - b.key);
    keyed.forEach(({ m }, i) => orderIndex.set(m.id, i));
    byRank.set(r, keyed.map(k => k.m));
  });

  const placed: PositionedNode[] = [];
  let x = 0;
  for (const r of rankKeys) {
    const members = byRank.get(r)!;
    const columnWidth = Math.max(...members.map(m => m.width));
    let y = 0;
    for (const member of members) {
      placed.push({ id: member.id, x, y, width: member.width, height: member.height });
      y += member.height + vGap;
    }
    x += columnWidth + hGap;
  }
  return placed;
}

export function layoutGrid(nodes: SizedNode[], columns?: number, hGap = 40, vGap = 32): PositionedNode[] {
  const cols = columns ?? Math.max(1, Math.ceil(Math.sqrt(nodes.length)));
  const placed: PositionedNode[] = [];
  let y = 0;
  for (let rowStart = 0; rowStart < nodes.length; rowStart += cols) {
    const row = nodes.slice(rowStart, rowStart + cols);
    const rowHeight = Math.max(...row.map(n => n.height));
    let x = 0;
    for (const node of row) {
      placed.push({ id: node.id, x, y, width: node.width, height: node.height });
      x += node.width + hGap;
    }
    y += rowHeight + vGap;
  }
  return placed;
}

export interface RouteOptions {
  orthogonal?: boolean;
  index?: number;
}

export function routeEdgePath(source: DiagramRect, target: DiagramRect, opts: RouteOptions = {}): string {
  const isSelf = source.x === target.x && source.y === target.y
    && source.width === target.width && source.height === target.height;
  if (isSelf) {
    const cx = source.x + source.width / 2;
    const y = source.y;
    const w = Math.max(28, source.width * 0.5);
    return `M ${cx - w / 2} ${y} C ${cx - w / 2} ${y - 30}, ${cx + w / 2} ${y - 30}, ${cx + w / 2} ${y}`;
  }
  const sx = source.x + source.width;
  const sy = source.y + source.height / 2;
  const tx = target.x;
  const ty = target.y + target.height / 2;
  if (opts.orthogonal) {
    const midX = Math.round((sx + tx) / 2);
    return `M ${sx} ${sy} L ${midX} ${sy} L ${midX} ${ty} L ${tx} ${ty}`;
  }
  if (tx >= sx) {
    const dx = Math.max(24, (tx - sx) / 2);
    return `M ${sx} ${sy} C ${sx + dx} ${sy}, ${tx - dx} ${ty}, ${tx} ${ty}`;
  }
  const below = Math.max(source.y + source.height, target.y + target.height) + 20 + (opts.index ?? 0) * 14;
  return `M ${sx} ${sy} L ${sx + 16} ${sy} L ${sx + 16} ${below} L ${tx - 16} ${below} L ${tx - 16} ${ty} L ${tx} ${ty}`;
}

export function routeManhattan(
  a: { x: number; y: number },
  b: { x: number; y: number },
  index: number,
): string {
  const midX = Math.round((a.x + b.x) / 2) + index * 12;
  return `M ${a.x} ${a.y} L ${midX} ${a.y} L ${midX} ${b.y} L ${b.x} ${b.y}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/features/reporting/reportDiagramLayout.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/reporting/reportDiagramLayout.ts src/features/reporting/reportDiagramLayout.test.ts
git commit -m "feat(report): add deterministic diagram layout and edge routing"
```

---

### Task 4: Requirements and BDD Renderers

First two public renderers. Both consume the moved SysML types, chunk at the figure cap, and emit styled SVG with relationship notation (composition diamonds, generalization triangles, dashed stereotype edges, multiplicity labels).

**Files:**
- Create: `src/features/reporting/reportDiagrams.ts`
- Test: `src/features/reporting/reportDiagrams.sysml.test.ts`

**Interfaces:**
- Consumes: `BlockData`, `RelationshipData` from `../../types/sysml_types`; everything from `./reportDiagramModel`; `layoutLayered`, `routeEdgePath`, `PositionedNode` from `./reportDiagramLayout`.
- Produces: `ReportRequirementSource`, `ReportBlockSource`, `renderRequirementsDiagram(source: ReportRequirementSource): string`, `renderBddDiagram(source: ReportBlockSource): string`, and the internal `drawLabeledNode`/`drawStyledEdge` helpers reused by later tasks.

- [ ] **Step 1: Write the failing tests**

Create `src/features/reporting/reportDiagrams.sysml.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BlockData, RelationshipData } from '../../types/sysml_types';
import { renderBddDiagram, renderRequirementsDiagram } from './reportDiagrams';

function block(partial: Partial<BlockData> & { id: string }): BlockData {
  return {
    name: partial.id, stereotype: 'block', x: 0, y: 0, width: 160, height: 80,
    properties: [], operations: [], constraints: [], classes: [], ports: [],
    ...partial,
  } as BlockData;
}

function rel(partial: Partial<RelationshipData> & { id: string; sourceId: string; targetId: string }): RelationshipData {
  return { type: 'association', label: '', ...partial } as RelationshipData;
}

const reqBlocks = [
  block({ id: 'r1', name: 'Limit <temperature>', stereotype: 'requirement', reqId: 'REQ-001', status: 'verified' }),
  block({ id: 'r2', name: 'Control fan', stereotype: 'requirement', reqId: 'REQ-002', status: 'open' }),
];
const reqRels = [rel({ id: 'e1', sourceId: 'r1', targetId: 'r2', type: 'deriveReqt' })];

describe('renderRequirementsDiagram', () => {
  it('renders escaped requirement identities and relationship stereotypes', () => {
    const html = renderRequirementsDiagram({ blocks: reqBlocks, relationships: reqRels });
    expect(html).toContain('REQ-001');
    expect(html).toContain('Limit &lt;temperature&gt;');
    expect(html).toContain('report-figure-caption');
    expect(html).toContain('2 requirements');
    expect(html).not.toContain('<temperature>');
  });

  it('renders a formal empty figure when no requirements exist', () => {
    expect(renderRequirementsDiagram({ blocks: [], relationships: [] }))
      .toContain('No requirements defined');
  });

  it('splits large requirement sets into multiple captioned figures', () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      block({ id: `rq${i}`, name: `Requirement ${i}`, stereotype: 'requirement', reqId: `REQ-${i}` }));
    const html = renderRequirementsDiagram({ blocks: many, relationships: [] });
    expect(html).toContain('view 1 of 2');
    expect(html).toContain('view 2 of 2');
  });
});

describe('renderBddDiagram', () => {
  const bddBlocks = [
    block({ id: 'root', name: 'ThermalSystem' }),
    block({ id: 'ctrl', name: 'Controller', properties: [{ id: 'p1', name: 'gain', type: 'Real', value: '1.2' }] as never }),
  ];
  const bddRels = [
    rel({ id: 'c1', sourceId: 'root', targetId: 'ctrl', type: 'composition', sourceMultiplicity: '1', targetMultiplicity: '1..*' }),
  ];

  it('renders stereotypes, composition diamonds, and multiplicities', () => {
    const html = renderBddDiagram({ blocks: bddBlocks, relationships: bddRels });
    expect(html).toContain('&#171;block&#187;');
    expect(html).toContain('ThermalSystem');
    expect(html).toContain('rf-diamond-filled');
    expect(html).toContain('1..*');
    expect(html).toContain('2 blocks');
  });

  it('renders generalization with a hollow triangle', () => {
    const html = renderBddDiagram({
      blocks: bddBlocks,
      relationships: [rel({ id: 'g1', sourceId: 'ctrl', targetId: 'root', type: 'generalization' })],
    });
    expect(html).toContain('rf-triangle-hollow');
  });

  it('renders a formal empty figure when no blocks exist', () => {
    expect(renderBddDiagram({ blocks: [], relationships: [] })).toContain('No blocks defined');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/reporting/reportDiagrams.sysml.test.ts`
Expected: FAIL because `./reportDiagrams` does not exist.

- [ ] **Step 3: Implement the renderers and shared draw helpers**

Create `src/features/reporting/reportDiagrams.ts`:

```ts
import type { BlockData, ConnectorData, HmiComponent, PartData, RelationshipData } from '../../types/sysml_types';
import type { JunctionData, Layer, StateData, TransitionData } from '../../types/sm_types';
import {
  DiagramEdgeInput, DiagramRect, MAX_NODES_PER_FIGURE, SizedNode,
  boundsOf, chunkItems, escapeHtml, measureNode, renderEmptyFigure, wrapFigure,
} from './reportDiagramModel';
import { PositionedNode, layoutLayered, nodeById, routeEdgePath } from './reportDiagramLayout';

export interface ReportRequirementSource {
  blocks: readonly BlockData[];
  relationships: readonly RelationshipData[];
}

export type ReportBlockSource = ReportRequirementSource;

const NODE_FILL = '#ffffff';
const NODE_STROKE = '#0b3445';
const REQ_STROKE = '#f97316';
const EDGE_STROKE = '#546e7a';
const TEXT_COLOR = '#182231';

export function drawLabeledNode(node: SizedNode, pos: PositionedNode, stroke = NODE_STROKE): string {
  const lines = node.lines.map((line, i) => {
    const weight = i === 0 ? ' font-weight="600"' : '';
    const fill = i === 0 ? TEXT_COLOR : '#44515e';
    return `<text x="${pos.x + pos.width / 2}" y="${pos.y + 18 + i * 15}" text-anchor="middle" font-size="11"${weight} fill="${fill}">${escapeHtml(line)}</text>`;
  }).join('');
  return `<rect x="${pos.x}" y="${pos.y}" width="${pos.width}" height="${pos.height}" rx="6" fill="${NODE_FILL}" stroke="${stroke}" stroke-width="1.2"/>${lines}`;
}

const DASHED_REL_TYPES = new Set(['derive', 'deriveReqt', 'refine', 'satisfy', 'verify', 'trace', 'dependency', 'allocation', 'binding']);

export function drawStyledEdge(edge: DiagramEdgeInput, path: string): string {
  const dashed = DASHED_REL_TYPES.has(edge.kind) ? ' stroke-dasharray="5 4"' : '';
  let marker = ' marker-end="url(#rf-arrow)"';
  if (edge.kind === 'composition') marker = ' marker-start="url(#rf-diamond-filled)"';
  else if (edge.kind === 'aggregation') marker = ' marker-start="url(#rf-diamond-hollow)"';
  else if (edge.kind === 'generalization') marker = ' marker-end="url(#rf-triangle-hollow)"';
  const label = edge.label
    ? `<text font-size="9" fill="#65717e" text-anchor="middle"><textPath href="#edge-${edge.id}" startOffset="50%">${escapeHtml(edge.label)}</textPath></text>`
    : '';
  return `<path id="edge-${edge.id}" d="${path}" fill="none" stroke="${EDGE_STROKE}" stroke-width="1.1"${dashed}${marker}/>${label}`;
}

function multiplicityLabel(text: string, x: number, y: number): string {
  return text ? `<text x="${x}" y="${y}" font-size="9" fill="#65717e">${escapeHtml(text)}</text>` : '';
}

interface PageRender {
  sized: SizedNode[];
  edges: DiagramEdgeInput[];
  placed: PositionedNode[];
}

function layoutPage(
  pageNodes: readonly { id: string }[],
  sized: Map<string, SizedNode>,
  edges: DiagramEdgeInput[],
  rootIds?: string[],
): PageRender {
  const pageIds = new Set(pageNodes.map(n => n.id));
  const pageSized = pageNodes.map(n => sized.get(n.id)!);
  const pageEdges = edges.filter(e => pageIds.has(e.sourceId) && pageIds.has(e.targetId));
  return { sized: pageSized, edges: pageEdges, placed: layoutLayered(pageSized, pageEdges, { rootIds }) };
}

export function renderRequirementsDiagram(source: ReportRequirementSource): string {
  const reqs = source.blocks.filter(b => b.stereotype === 'requirement');
  if (reqs.length === 0) return renderEmptyFigure('No requirements defined.');
  const reqIds = new Set(reqs.map(r => r.id));
  const edges: DiagramEdgeInput[] = source.relationships
    .filter(r => reqIds.has(r.sourceId) && reqIds.has(r.targetId))
    .map(r => ({ id: r.id, sourceId: r.sourceId, targetId: r.targetId, label: `«${r.type}»`, kind: r.type }));
  const pages = chunkItems(reqs, MAX_NODES_PER_FIGURE);
  return pages.map((page, pageIndex) => {
    const sized = new Map(page.map(r => [r.id, measureNode(r.id,
      [r.reqId ?? 'REQ', r.name, r.status ? `status: ${r.status}` : ''], 'req')]));
    const { edges: pageEdges, placed } = layoutPage(page, sized, edges);
    const inner = [
      ...pageEdges.map(e => drawStyledEdge(e, routeEdgePath(nodeById(placed, e.sourceId)!, nodeById(placed, e.targetId)!))),
      ...placed.map(pos => drawLabeledNode(sized.get(pos.id)!, pos, REQ_STROKE)),
    ].join('');
    const viewNote = pages.length > 1 ? ` · view ${pageIndex + 1} of ${pages.length}` : '';
    return wrapFigure(inner, `Requirements diagram${viewNote} (${page.length} requirements, ${pageEdges.length} relationships)`, boundsOf(placed, 24));
  }).join('\n');
}

export function renderBddDiagram(source: ReportBlockSource): string {
  const bddBlocks = source.blocks.filter(b => b.stereotype !== 'requirement');
  if (bddBlocks.length === 0) return renderEmptyFigure('No blocks defined.');
  const blockIds = new Set(bddBlocks.map(b => b.id));
  const edges: DiagramEdgeInput[] = source.relationships
    .filter(r => blockIds.has(r.sourceId) && blockIds.has(r.targetId))
    .map(r => ({
      id: r.id, sourceId: r.sourceId, targetId: r.targetId,
      label: DASHED_REL_TYPES.has(r.type) ? `«${r.type}»` : (r.label ?? ''), kind: r.type,
    }));
  const pages = chunkItems(bddBlocks, MAX_NODES_PER_FIGURE);
  return pages.map((page, pageIndex) => {
    const sized = new Map(page.map(b => [b.id, measureNode(b.id, [
      `«${b.stereotype}»`, b.name,
      ...b.properties.slice(0, 3).map(p => `${p.name}: ${p.type}${p.value ? ` = ${p.value}` : ''}`),
    ], 'bdd', 96)]));
    const { edges: pageEdges, placed } = layoutPage(page, sized, edges);
    const edgeEls = pageEdges.map(e => {
      const src = nodeById(placed, e.sourceId)!;
      const tgt = nodeById(placed, e.targetId)!;
      const rel = source.relationships.find(r => r.id === e.id);
      return drawStyledEdge(e, routeEdgePath(src, tgt))
        + multiplicityLabel(rel?.sourceMultiplicity ?? '', src.x + src.width - 4, src.y - 6)
        + multiplicityLabel(rel?.targetMultiplicity ?? '', tgt.x + 4, tgt.y - 6);
    });
    const inner = [...edgeEls, ...placed.map(pos => drawLabeledNode(sized.get(pos.id)!, pos))].join('');
    const viewNote = pages.length > 1 ? ` · view ${pageIndex + 1} of ${pages.length}` : '';
    return wrapFigure(inner, `Block definition diagram${viewNote} (${page.length} blocks, ${pageEdges.length} relationships)`, boundsOf(placed, 24));
  }).join('\n');
}
```

Note: `ConnectorData`, `HmiComponent`, `PartData`, `JunctionData`, `Layer`, `StateData`, `TransitionData`, and `DiagramRect` are imported now for use by Tasks 5–7; if the linter flags unused imports at this checkpoint, add a temporary `export type` re-export line for them and remove it in Task 7. Do not stub the later renderers.

- [ ] **Step 4: Run the tests and type check**

Run: `npx vitest run src/features/reporting/reportDiagrams.sysml.test.ts && npx tsc --noEmit`
Expected: PASS; no diagnostics from the new files.

- [ ] **Step 5: Commit**

```bash
git add src/features/reporting/reportDiagrams.ts src/features/reporting/reportDiagrams.sysml.test.ts
git commit -m "feat(report): render requirements and BDD figures"
```

---

### Task 5: IBD Renderer

One figure per owning block context: dashed context frame, parts on an overlap-free grid, ports snapped to part edges, and orthogonal connectors offset by index so parallel connections never coincide.

**Files:**
- Modify: `src/features/reporting/reportDiagrams.ts`
- Test: `src/features/reporting/reportDiagrams.ibd.test.ts`

**Interfaces:**
- Consumes: `PartData`, `ConnectorData`, `BlockData` from `../../types/sysml_types`; `layoutGrid`, `routeManhattan` from `./reportDiagramLayout`; helpers from Task 4.
- Produces: `ReportIbdSource`, `renderIbdDiagram(source: ReportIbdSource): string`.

- [ ] **Step 1: Write the failing tests**

Create `src/features/reporting/reportDiagrams.ibd.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BlockData, ConnectorData, PartData } from '../../types/sysml_types';
import { renderIbdDiagram } from './reportDiagrams';

const blocks: BlockData[] = [
  {
    id: 'ctrl', name: 'Controller', stereotype: 'block', x: 0, y: 0, width: 160, height: 80,
    properties: [], operations: [], constraints: [], classes: [],
    ports: [{ id: 'p-in', name: 'sensorIn', type: 'Real', direction: 'in' } as never],
  } as BlockData,
  {
    id: 'act', name: 'Actuator', stereotype: 'block', x: 0, y: 0, width: 160, height: 80,
    properties: [], operations: [], constraints: [], classes: [],
    ports: [{ id: 'p-out', name: 'driveOut', type: 'Real', direction: 'out' } as never],
  } as BlockData,
];

const parts: PartData[] = [
  { id: 'part1', name: 'controller', blockId: 'sys', typeId: 'ctrl', x: 0, y: 0, width: 140, height: 70 } as PartData,
  { id: 'part2', name: 'actuator', blockId: 'sys', typeId: 'act', x: 300, y: 0, width: 140, height: 70 } as PartData,
];

const connectors: ConnectorData[] = [
  { id: 'c1', sourcePartId: 'part1', sourcePortId: 'p-in', targetPartId: 'part2', targetPortId: 'p-out', itemFlow: 'temperatureSignal' } as ConnectorData,
];

const contextBlock = {
  id: 'sys', name: 'ThermalSystem', stereotype: 'block', x: 0, y: 0, width: 400, height: 300,
  properties: [], operations: [], constraints: [], classes: [], ports: [],
} as unknown as BlockData;

describe('renderIbdDiagram', () => {
  it('renders the context frame, parts, ports, and connector item flow', () => {
    const html = renderIbdDiagram({ contextBlock, parts, connectors, blocks });
    expect(html).toContain('ibd [Block] ThermalSystem');
    expect(html).toContain('controller');
    expect(html).toContain('actuator');
    expect(html).toContain('sensorIn');
    expect(html).toContain('temperatureSignal');
    expect(html).toContain('report-figure-caption');
  });

  it('offsets parallel connectors so they do not coincide', () => {
    const parallel: ConnectorData[] = [
      ...connectors,
      { id: 'c2', sourcePartId: 'part1', sourcePortId: 'p-in', targetPartId: 'part2', targetPortId: 'p-out' } as ConnectorData,
    ];
    const html = renderIbdDiagram({ contextBlock, parts, connectors: parallel, blocks });
    const paths = [...html.matchAll(/<path id="edge-[^"]*" d="([^"]+)"/g)].map(m => m[1]);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('renders a formal empty figure when the context has no parts', () => {
    expect(renderIbdDiagram({ contextBlock, parts: [], connectors: [], blocks }))
      .toContain('No internal parts');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/reporting/reportDiagrams.ibd.test.ts`
Expected: FAIL — `renderIbdDiagram` is not exported yet.

- [ ] **Step 3: Implement the IBD renderer**

Add to `src/features/reporting/reportDiagrams.ts`. Also add `layoutGrid` and `routeManhattan` to the existing `./reportDiagramLayout` import:

```ts
export interface ReportIbdSource {
  contextBlock: BlockData;
  parts: readonly PartData[];
  connectors: readonly ConnectorData[];
  blocks: readonly BlockData[];
}

const IBD_FRAME_PADDING = 28;
const IBD_TITLE_HEIGHT = 24;

export function renderIbdDiagram(source: ReportIbdSource): string {
  if (source.parts.length === 0) {
    return renderEmptyFigure(`No internal parts for ${source.contextBlock.name}.`);
  }
  const blockById = new Map(source.blocks.map(b => [b.id, b]));
  const sized = new Map(source.parts.map(part => {
    const typeName = part.typeId ? blockById.get(part.typeId)?.name : undefined;
    return [part.id, measureNode(part.id,
      [`${part.name}${typeName ? `: ${typeName}` : ''}`, part.multiplicity ? `[${part.multiplicity}]` : ''], 'ibd', 110)];
  }));
  const placed = layoutGrid([...sized.values()]);
  const placedById = new Map(placed.map(p => [p.id, p]));

  // Ports alternate sides per part so connectors leave/enter on clean edges.
  const portPositions = new Map<string, { x: number; y: number; name: string }>();
  const portEls: string[] = [];
  for (const part of source.parts) {
    const typeBlock = part.typeId ? blockById.get(part.typeId) : undefined;
    const ports = typeBlock?.ports ?? [];
    const rect = placedById.get(part.id)!;
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

  const connectorEls = source.connectors.map((conn, index) => {
    const from = portPositions.get(`${conn.sourcePartId}:${conn.sourcePortId}`);
    const to = portPositions.get(`${conn.targetPartId}:${conn.targetPortId}`);
    if (!from || !to) return '';
    const label = conn.itemFlow ?? conn.label ?? '';
    return `<path id="edge-${conn.id}" d="${routeManhattan(from, to, index)}" fill="none" stroke="${EDGE_STROKE}" stroke-width="1.1" marker-end="url(#rf-arrow)"/>`
      + (label ? `<text font-size="9" fill="#65717e" text-anchor="middle"><textPath href="#edge-${conn.id}" startOffset="50%">${escapeHtml(label)}</textPath></text>` : '');
  });

  const partEls = placed.map(pos => drawLabeledNode(sized.get(pos.id)!, pos));
  const contentBounds = boundsOf([...placed, ...[...portPositions.values()].map(p => ({ x: p.x, y: p.y, width: 1, height: 1 }))], IBD_FRAME_PADDING);
  const frame = `<rect x="${contentBounds.x}" y="${contentBounds.y}" width="${contentBounds.width}" height="${contentBounds.height + IBD_TITLE_HEIGHT}" fill="none" stroke="${NODE_STROKE}" stroke-width="1.2" stroke-dasharray="6 4"/>`
    + `<text x="${contentBounds.x + 8}" y="${contentBounds.y + 16}" font-size="11" font-weight="600" fill="${TEXT_COLOR}">ibd [Block] ${escapeHtml(source.contextBlock.name)}</text>`;
  const shifted = (els: string[]) => els.join('');
  const inner = frame + `<g transform="translate(0 ${IBD_TITLE_HEIGHT})">`
    + shifted(connectorEls) + shifted(partEls) + shifted(portEls) + '</g>';
  const caption = `Internal block diagram · ${source.contextBlock.name} (${source.parts.length} parts, ${source.connectors.length} connectors)`;
  return wrapFigure(inner, caption, { ...contentBounds, height: contentBounds.height + IBD_TITLE_HEIGHT });
}
```

Note: translating the `<g>` group down by `IBD_TITLE_HEIGHT` while the frame grows by the same amount keeps parts clear of the frame title; the viewBox already includes the extra height.

- [ ] **Step 4: Run the tests and type check**

Run: `npx vitest run src/features/reporting/reportDiagrams.ibd.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/reporting/reportDiagrams.ts src/features/reporting/reportDiagrams.ibd.test.ts
git commit -m "feat(report): render port-aware IBD figures"
```

---

### Task 6: State-Machine Renderer

One figure per layer. Leaf states and junctions go through the layered layout (autostart states as roots); parent states become containers sized around their laid-out children; transitions route between final rects with `[guard] / action` labels; oversized layers split into captioned views.

**Files:**
- Modify: `src/features/reporting/reportDiagrams.ts`
- Test: `src/features/reporting/reportDiagrams.sm.test.ts`

**Interfaces:**
- Consumes: `Layer`, `StateData`, `JunctionData`, `TransitionData` from `../../types/sm_types`.
- Produces: `ReportStateMachineSource`, `renderStateMachineDiagrams(source: ReportStateMachineSource): string[]`.

- [ ] **Step 1: Write the failing tests**

Create `src/features/reporting/reportDiagrams.sm.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { JunctionData, Layer, StateData, TransitionData } from '../../types/sm_types';
import { renderStateMachineDiagrams } from './reportDiagrams';

function state(partial: Partial<StateData> & { id: string; name: string }): StateData {
  return {
    x: 0, y: 0, width: 120, height: 60, entry: '', during: '', exit: '',
    isActive: false, color: '#ffffff', parentId: null, children: [], priority: 0,
    isParallel: false, regionId: null, autostart: false,
    ...partial,
  } as StateData;
}

function transition(partial: Partial<TransitionData> & { id: string; sourceId: string; targetId: string }): TransitionData {
  return { condition: '', action: '', afterTicks: null, type: 'condition', hasControlPoint: false, order: 0, ...partial } as TransitionData;
}

const states = [
  state({ id: 'idle', name: 'Idle', autostart: true }),
  state({ id: 'heat', name: 'Heating', entry: 'heater = on' }),
  state({ id: 'op', name: 'Operating', children: ['heat'] }),
  state({ id: 'cool', name: 'Cooling' }),
];
(states.find(s => s.id === 'heat') as StateData).parentId = 'op';

const junctions: JunctionData[] = [
  { id: 'h1', x: 0, y: 0, name: '', color: '#000000', parentId: null, type: 'history' } as JunctionData,
];

const transitions = [
  transition({ id: 't1', sourceId: 'idle', targetId: 'heat', condition: 'temperature < limit', action: 'fan = on' }),
  transition({ id: 't2', sourceId: 'heat', targetId: 'cool', condition: 'temperature > limit' }),
  transition({ id: 't3', sourceId: 'cool', targetId: 'cool', condition: 'recheck' }),
];

const layers: Layer[] = [
  { id: 'l1', name: 'Root Region', parentStateId: null, stateIds: ['idle', 'op', 'heat', 'cool'], transitionIds: ['t1', 't2', 't3'], junctionIds: ['h1'] },
  { id: 'l2', name: 'Safety Region', parentStateId: null, stateIds: [], transitionIds: [], junctionIds: [] },
];

describe('renderStateMachineDiagrams', () => {
  it('renders one figure per layer with escaped guards and actions', () => {
    const figures = renderStateMachineDiagrams({ layers, states, junctions, transitions });
    expect(figures).toHaveLength(2);
    expect(figures[0]).toContain('Root Region');
    expect(figures[0]).toContain('[temperature &lt; limit] / fan = on');
    expect(figures[0]).toContain('heater = on');
    expect(figures[0]).toContain('report-figure-caption');
  });

  it('renders history junctions as labeled circles', () => {
    const figures = renderStateMachineDiagrams({ layers, states, junctions, transitions });
    expect(figures[0]).toContain('<circle');
    expect(figures[0]).toContain('>H<');
  });

  it('renders parent states as containers that enclose their children', () => {
    const figures = renderStateMachineDiagrams({ layers, states, junctions, transitions });
    expect(figures[0]).toContain('Operating');
    const container = figures[0].match(/<rect[^>]*class="sm-container"[^>]*>/);
    expect(container).not.toBeNull();
  });

  it('splits layers with more than 20 nodes into multiple figures', () => {
    const many = Array.from({ length: 22 }, (_, i) => state({ id: `s${i}`, name: `S${i}`, autostart: i === 0 }));
    const manyLayer: Layer[] = [{
      id: 'big', name: 'Big Region', parentStateId: null,
      stateIds: many.map(s => s.id), transitionIds: [], junctionIds: [],
    }];
    const figures = renderStateMachineDiagrams({ layers: manyLayer, states: many, junctions: [], transitions: [] });
    expect(figures).toHaveLength(2);
    expect(figures[0]).toContain('view 1 of 2');
  });

  it('renders a formal empty figure for layers with no states', () => {
    const figures = renderStateMachineDiagrams({ layers, states, junctions, transitions });
    expect(figures[1]).toContain('No states in layer Safety Region');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/reporting/reportDiagrams.sm.test.ts`
Expected: FAIL — `renderStateMachineDiagrams` is not exported yet.

- [ ] **Step 3: Implement the state-machine renderer**

Add to `src/features/reporting/reportDiagrams.ts`:

```ts
export interface ReportStateMachineSource {
  layers: readonly Layer[];
  states: readonly StateData[];
  junctions: readonly JunctionData[];
  transitions: readonly TransitionData[];
}

const JUNCTION_SIZE = 22;
const CONTAINER_PADDING = 18;
const CONTAINER_TITLE = 22;

function stateLines(state: StateData): string[] {
  const lines = [state.name];
  if (state.entry) lines.push(`entry / ${state.entry}`);
  if (state.during) lines.push(`during / ${state.during}`);
  if (state.exit) lines.push(`exit / ${state.exit}`);
  return lines;
}

function transitionLabel(t: TransitionData): string {
  const guard = t.condition ? `[${t.condition}]` : t.afterTicks != null ? `after(${t.afterTicks})` : '';
  return [guard, t.action ? `/ ${t.action}` : ''].filter(Boolean).join(' ');
}

function renderStateMachineLayer(layer: Layer, source: ReportStateMachineSource): string {
  const layerStates = source.states.filter(s => layer.stateIds.includes(s.id));
  if (layerStates.length === 0) return renderEmptyFigure(`No states in layer ${layer.name}.`);
  const layerJunctions = source.junctions.filter(j => layer.junctionIds.includes(j.id));
  const layerTransitions = source.transitions.filter(t => layer.transitionIds.includes(t.id));

  const stateById = new Map(layerStates.map(s => [s.id, s]));
  const layerIds = new Set(layerStates.map(s => s.id));
  const childIds = new Set(layerStates.flatMap(s => s.children).filter(id => layerIds.has(id)));

  // Leaf nodes (states without children in this layer, plus junctions) get layered out.
  const leafStates = layerStates.filter(s => !s.children.some(c => layerIds.has(c)));
  const sized = new Map<string, SizedNode>();
  for (const s of leafStates) sized.set(s.id, measureNode(s.id, stateLines(s), 'state', 96));
  for (const j of layerJunctions) sized.set(j.id, { id: j.id, lines: [], width: JUNCTION_SIZE, height: JUNCTION_SIZE, kind: 'junction' });

  const roots = leafStates.filter(s => s.autostart).map(s => s.id);
  const edges: DiagramEdgeInput[] = layerTransitions.map(t => ({
    id: t.id, sourceId: t.sourceId, targetId: t.targetId, label: transitionLabel(t), kind: 'transition',
  }));
  const leafPlaced = layoutLayered([...sized.values()], edges, { rootIds: roots });
  const placedById = new Map(leafPlaced.map(p => [p.id, p]));

  // Parent containers wrap their laid-out descendants, deepest nesting first.
  const depthOf = (s: StateData): number => (s.parentId && stateById.has(s.parentId)) ? 1 + depthOf(stateById.get(s.parentId)!) : 0;
  const parents = layerStates.filter(s => s.children.some(c => layerIds.has(c))).sort((a, b) => depthOf(b) - depthOf(a));
  for (const parent of parents) {
    const descendants = parent.children.filter(id => placedById.has(id)).map(id => placedById.get(id)!);
    if (descendants.length === 0) continue;
    const inner = boundsOf(descendants, CONTAINER_PADDING);
    placedById.set(parent.id, {
      id: parent.id, x: inner.x, y: inner.y - CONTAINER_TITLE,
      width: inner.width, height: inner.height + CONTAINER_TITLE,
    });
  }

  const allPlaced = [...placedById.values()];
  const rectOf = (id: string): DiagramRect | undefined => placedById.get(id);
  const edgeEls = layerTransitions.map((t, index) => {
    const src = rectOf(t.sourceId);
    const tgt = rectOf(t.targetId);
    if (!src || !tgt) return '';
    return drawStyledEdge(
      { id: t.id, sourceId: t.sourceId, targetId: t.targetId, label: transitionLabel(t), kind: 'transition' },
      routeEdgePath(src, tgt, { index }),
    );
  });

  const containerEls = parents.map(p => {
    const rect = placedById.get(p.id);
    if (!rect) return '';
    return `<rect class="sm-container" x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" rx="8" fill="#f4f6f8" stroke="${NODE_STROKE}" stroke-width="1.2"/>`
      + `<text x="${rect.x + 10}" y="${rect.y + 15}" font-size="11" font-weight="600" fill="${TEXT_COLOR}">${escapeHtml(p.name)}</text>`;
  });

  const stateEls = leafStates.map(s => drawLabeledNode(sized.get(s.id)!, placedById.get(s.id)! as PositionedNode));
  const junctionEls = layerJunctions.map(j => {
    const rect = placedById.get(j.id)!;
    const cx = rect.x + JUNCTION_SIZE / 2;
    const cy = rect.y + JUNCTION_SIZE / 2;
    const label = j.type === 'history' ? 'H' : j.type === 'deep-history' ? 'H*' : '';
    return `<circle cx="${cx}" cy="${cy}" r="${JUNCTION_SIZE / 2}" fill="#ffffff" stroke="${NODE_STROKE}" stroke-width="1.2"/>`
      + (label ? `<text x="${cx}" y="${cy + 3.5}" text-anchor="middle" font-size="9" fill="${TEXT_COLOR}">${label}</text>` : '');
  });

  const inner = [...containerEls, ...edgeEls, ...stateEls, ...junctionEls].join('');
  const caption = `State machine · ${layer.name} (${layerStates.length} states, ${layerTransitions.length} transitions)`;
  return wrapFigure(inner, caption, boundsOf(allPlaced, 24));
}

export function renderStateMachineDiagrams(source: ReportStateMachineSource): string[] {
  return source.layers.flatMap(layer => {
    const layerStates = source.states.filter(s => layer.stateIds.includes(s.id));
    if (layerStates.length <= MAX_NODES_PER_FIGURE) {
      return [renderStateMachineLayer(layer, source)];
    }
    // Oversized layer: chunk states into stable view slices, each with its own figure.
    const chunks = chunkItems(layerStates, MAX_NODES_PER_FIGURE);
    return chunks.map((chunk, i) => {
      const chunkIds = new Set(chunk.map(s => s.id));
      const viewLayer: Layer = {
        ...layer,
        stateIds: chunk.map(s => s.id),
        transitionIds: layer.transitionIds.filter(id => {
          const t = source.transitions.find(tr => tr.id === id);
          return !!t && chunkIds.has(t.sourceId) && chunkIds.has(t.targetId);
        }),
        junctionIds: layer.junctionIds.filter(id => chunkIds.has(id)),
      };
      const html = renderStateMachineLayer(viewLayer, source);
      return html.replace('report-figure-caption">',
        `report-figure-caption">State machine · ${escapeHtml(layer.name)} · view ${i + 1} of ${chunks.length} — `)
        .replace(`State machine · ${escapeHtml(layer.name)} · view ${i + 1} of ${chunks.length} — State machine · ${escapeHtml(layer.name)}`,
          `State machine · ${escapeHtml(layer.name)} · view ${i + 1} of ${chunks.length}`);
    });
  });
}
```

If the caption-rewrite `replace` chain reads awkwardly, an equivalent direct approach is fine: give `renderStateMachineLayer` an optional `captionPrefix` parameter and build the caption as `State machine · ${layer.name}${captionPrefix} (...)`. Use whichever form the tests pin; do not leave both.

- [ ] **Step 4: Run the tests and type check**

Run: `npx vitest run src/features/reporting/reportDiagrams.sm.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/reporting/reportDiagrams.ts src/features/reporting/reportDiagrams.sm.test.ts
git commit -m "feat(report): render per-layer state-machine figures"
```

---

### Task 7: X-Bridges and HMI Renderers

X-Bridges gets a report figure for the first time (the current report never renders it). The HMI figure preserves component positions when they are valid and overlap-free, and falls back to a grid otherwise; it draws factual frames (name, type, binding) instead of fabricated sample values.

**Files:**
- Modify: `src/features/reporting/reportDiagrams.ts`
- Test: `src/features/reporting/reportDiagrams.xhmi.test.ts`

**Interfaces:**
- Consumes: `HmiComponent` from `../../types/sysml_types`.
- Produces: `ReportXBridgesNode`, `ReportXBridgesEdge`, `ReportXBridgesSource`, `renderXbridgesDiagram(source: ReportXBridgesSource): string`, `ReportHmiSource`, `renderHmiDiagram(source: ReportHmiSource): string`, and exported-for-test `computeHmiLayout(components: readonly HmiComponent[]): PositionedNode[]`.

- [ ] **Step 1: Write the failing tests**

Create `src/features/reporting/reportDiagrams.xhmi.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { HmiComponent } from '../../types/sysml_types';
import { rectsOverlap } from './reportDiagramModel';
import { computeHmiLayout, renderHmiDiagram, renderXbridgesDiagram } from './reportDiagrams';

describe('renderXbridgesDiagram', () => {
  it('renders nodes and labeled edges with a caption', () => {
    const html = renderXbridgesDiagram({
      nodes: [
        { id: 'n1', label: 'Sensor <input>', kind: 'source' },
        { id: 'n2', label: 'PID', kind: 'controller' },
      ],
      edges: [{ id: 'e1', sourceId: 'n1', targetId: 'n2', label: 'feedback' }],
    });
    expect(html).toContain('Sensor &lt;input&gt;');
    expect(html).toContain('PID');
    expect(html).toContain('feedback');
    expect(html).toContain('X-Bridges model');
  });

  it('renders a formal empty figure when no model exists', () => {
    expect(renderXbridgesDiagram({ nodes: [], edges: [] })).toContain('No X-Bridges model available');
  });
});

describe('renderHmiDiagram', () => {
  const component = (partial: Partial<HmiComponent> & { id: string }): HmiComponent => ({
    type: 'gauge', name: partial.id, x: 0, y: 0, width: 120, height: 80, variableId: null,
    ...partial,
  } as HmiComponent);

  it('preserves valid non-overlapping positions', () => {
    const html = renderHmiDiagram({
      components: [
        component({ id: 'g1', name: 'Chamber temp', x: 10, y: 20, variableId: 'temp' }),
        component({ id: 'l1', name: 'Door lamp', type: 'lamp', x: 300, y: 20, variableId: 'door' }),
      ],
    });
    expect(html).toContain('Chamber temp');
    expect(html).toContain('Door lamp');
    expect(html).toContain('&#8594; temp');
    expect(html).toContain('HMI layout');
  });

  it('falls back to a grid when persisted positions overlap', () => {
    const components = [
      component({ id: 'a', x: 0, y: 0 }),
      component({ id: 'b', x: 10, y: 10 }),
      component({ id: 'c', x: 5, y: 5 }),
    ];
    const placed = computeHmiLayout(components);
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        expect(rectsOverlap(placed[i], placed[j])).toBe(false);
      }
    }
  });

  it('renders a formal empty figure when no components exist', () => {
    expect(renderHmiDiagram({ components: [] })).toContain('No HMI components configured');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/reporting/reportDiagrams.xhmi.test.ts`
Expected: FAIL — the exports do not exist yet.

- [ ] **Step 3: Implement the renderers**

Add to `src/features/reporting/reportDiagrams.ts`. Add `layoutGrid` (if not already imported) and `rectsOverlap` to the existing imports:

```ts
export interface ReportXBridgesNode {
  id: string;
  label: string;
  kind?: string;
}

export interface ReportXBridgesEdge {
  id: string;
  sourceId: string;
  targetId: string;
  label?: string;
}

export interface ReportXBridgesSource {
  nodes: readonly ReportXBridgesNode[];
  edges: readonly ReportXBridgesEdge[];
}

export function renderXbridgesDiagram(source: ReportXBridgesSource): string {
  if (source.nodes.length === 0) return renderEmptyFigure('No X-Bridges model available.');
  const pages = chunkItems(source.nodes, MAX_NODES_PER_FIGURE);
  return pages.map((page, pageIndex) => {
    const pageIds = new Set(page.map(n => n.id));
    const sized = new Map(page.map(n => [n.id, measureNode(n.id,
      [n.label, n.kind ? `«${n.kind}»` : ''], 'xbridges', 96)]));
    const edges: DiagramEdgeInput[] = source.edges
      .filter(e => pageIds.has(e.sourceId) && pageIds.has(e.targetId))
      .map(e => ({ id: e.id, sourceId: e.sourceId, targetId: e.targetId, label: e.label ?? '', kind: 'association' }));
    const placed = layoutLayered([...sized.values()], edges);
    const inner = [
      ...edges.map(e => drawStyledEdge(e, routeEdgePath(nodeById(placed, e.sourceId)!, nodeById(placed, e.targetId)!, { orthogonal: true }))),
      ...placed.map(pos => drawLabeledNode(sized.get(pos.id)!, pos)),
    ].join('');
    const viewNote = pages.length > 1 ? ` · view ${pageIndex + 1} of ${pages.length}` : '';
    return wrapFigure(inner, `X-Bridges model${viewNote} (${page.length} nodes, ${edges.length} edges)`, boundsOf(placed, 24));
  }).join('\n');
}

export interface ReportHmiSource {
  components: readonly HmiComponent[];
}

const HMI_FALLBACK_WIDTH = 140;
const HMI_FALLBACK_HEIGHT = 70;

export function computeHmiLayout(components: readonly HmiComponent[]): PositionedNode[] {
  const rects = components.map(c => ({
    id: c.id,
    x: Number.isFinite(c.x) ? c.x : 0,
    y: Number.isFinite(c.y) ? c.y : 0,
    width: c.width > 0 ? c.width : HMI_FALLBACK_WIDTH,
    height: c.height > 0 ? c.height : HMI_FALLBACK_HEIGHT,
  }));
  const overlaps = rects.some((a, i) => rects.some((b, j) => j > i && rectsOverlap(a, b)));
  if (!overlaps) {
    const minX = Math.min(...rects.map(r => r.x));
    const minY = Math.min(...rects.map(r => r.y));
    return rects.map(r => ({ ...r, x: r.x - minX, y: r.y - minY }));
  }
  const sized = rects.map(r => ({ id: r.id, lines: [], width: r.width, height: r.height, kind: 'hmi' }));
  return layoutGrid(sized);
}

export function renderHmiDiagram(source: ReportHmiSource): string {
  if (source.components.length === 0) return renderEmptyFigure('No HMI components configured.');
  const placed = computeHmiLayout(source.components);
  const byId = new Map(source.components.map(c => [c.id, c]));
  const els = placed.map(pos => {
    const c = byId.get(pos.id)!;
    const binding = c.variableId ? `&#8594; ${escapeHtml(c.variableId)}` : 'unbound';
    return `<rect x="${pos.x}" y="${pos.y}" width="${pos.width}" height="${pos.height}" rx="6" fill="#ffffff" stroke="${NODE_STROKE}" stroke-width="1.2"/>`
      + `<text x="${pos.x + 8}" y="${pos.y + 16}" font-size="11" font-weight="600" fill="${TEXT_COLOR}">${escapeHtml(c.name)}</text>`
      + `<text x="${pos.x + 8}" y="${pos.y + 31}" font-size="9" fill="#65717e">${escapeHtml(c.type)}</text>`
      + `<text x="${pos.x + 8}" y="${pos.y + 45}" font-size="9" fill="#087d99">${binding}</text>`;
  });
  return wrapFigure(els.join(''),
    `HMI layout (${source.components.length} components)`, boundsOf(placed, 24));
}
```

- [ ] **Step 4: Run the tests and type check**

Run: `npx vitest run src/features/reporting && npx tsc --noEmit`
Expected: all reporting tests PASS; no diagnostics.

- [ ] **Step 5: Commit**

```bash
git add src/features/reporting/reportDiagrams.ts src/features/reporting/reportDiagrams.xhmi.test.ts
git commit -m "feat(report): render X-Bridges and HMI layout figures"
```

---
