import { DiagramRect, MAX_FIGURE_WIDTH, SizedNode } from './reportDiagramModel';
import { Box, Pt, boxContainsPoint, boxesIntersect, textBox, longestHorizontal, polylineCrossesBox, polylineLength, simplify } from './reportSvgGeometry';

export interface PositionedNode extends DiagramRect {
  id: string;
}

export type LayoutDirection = 'TB' | 'LR';

export interface LayoutOptions {
  hGap?: number;
  vGap?: number;
  rootIds?: string[];
  /** 'LR' (default) puts ranks in columns; 'TB' puts ranks in rows, first rank on top. */
  direction?: LayoutDirection;
  /** TB only: a rank wider than this wraps onto extra rows. Defaults to MAX_FIGURE_WIDTH. */
  maxRowWidth?: number;
}

export function nodeById(nodes: PositionedNode[], id: string): PositionedNode | undefined {
  return nodes.find(n => n.id === id);
}

/** `labelWidth` (LR only): width in px of the edge's label; the rank gap grows to hold it. */
type LayoutEdge = { sourceId: string; targetId: string; labelWidth?: number };

/** Clearance added around a label inside a rank gap (jog stub, arrow head and breathing room). */
export const LABEL_GAP_PADDING = 44;

/**
 * Longest-path ranks. Back edges found by DFS (roots first, then input order) are ignored so
 * cycles cannot inflate ranks; edges into requested roots are ignored so roots stay on rank 0.
 */
export function rankNodes(nodes: readonly { id: string }[], edges: readonly LayoutEdge[], rootIds: readonly string[] = []): Map<string, number> {
  const ids = new Set(nodes.map(n => n.id));
  const rootSet = new Set(rootIds.filter(id => ids.has(id)));
  const succs = new Map<string, string[]>(nodes.map(n => [n.id, []]));
  const hasIncoming = new Set<string>();
  const seenPairs = new Set<string>();
  for (const e of edges) {
    if (!ids.has(e.sourceId) || !ids.has(e.targetId) || e.sourceId === e.targetId || rootSet.has(e.targetId)) continue;
    const key = `${e.sourceId}\u0000${e.targetId}`;
    if (seenPairs.has(key)) continue;
    seenPairs.add(key);
    succs.get(e.sourceId)!.push(e.targetId);
    hasIncoming.add(e.targetId);
  }
  const start = [
    ...rootSet,
    ...nodes.filter(n => !hasIncoming.has(n.id) && !rootSet.has(n.id)).map(n => n.id),
    ...nodes.map(n => n.id),
  ];
  const state = new Map<string, 0 | 1 | 2>(); // 1 = on stack, 2 = done
  const forward = new Map<string, string[]>(nodes.map(n => [n.id, []]));
  const order: string[] = [];
  for (const startId of start) {
    if (state.has(startId)) continue;
    const stack: { id: string; next: number }[] = [{ id: startId, next: 0 }];
    state.set(startId, 1);
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const outs = succs.get(frame.id)!;
      if (frame.next < outs.length) {
        const to = outs[frame.next++];
        const s = state.get(to);
        if (s === 1) continue; // back edge: dropped from ranking
        forward.get(frame.id)!.push(to);
        if (s === undefined) { state.set(to, 1); stack.push({ id: to, next: 0 }); }
      } else {
        state.set(frame.id, 2);
        order.push(frame.id);
        stack.pop();
      }
    }
  }
  const rank = new Map<string, number>(nodes.map(n => [n.id, 0]));
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i];
    for (const to of forward.get(id)!) rank.set(to, Math.max(rank.get(to)!, rank.get(id)! + 1));
  }
  return rank;
}

function countCrossings(ranks: string[][], pairs: [string, string][], rankOf: Map<string, number>): number {
  const index = new Map<string, number>();
  ranks.forEach(r => r.forEach((id, i) => index.set(id, i)));
  const byGap = new Map<number, [number, number][]>();
  for (const [a, b] of pairs) {
    const ra = rankOf.get(a)!;
    const rb = rankOf.get(b)!;
    if (Math.abs(ra - rb) !== 1) continue;
    const [upper, lower] = ra < rb ? [a, b] : [b, a];
    const gap = Math.min(ra, rb);
    byGap.set(gap, [...(byGap.get(gap) ?? []), [index.get(upper)!, index.get(lower)!]]);
  }
  let crossings = 0;
  for (const list of byGap.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const [a1, b1] = list[i];
        const [a2, b2] = list[j];
        if ((a1 - a2) * (b1 - b2) < 0) crossings++;
      }
    }
  }
  return crossings;
}

/** Layered layout: longest-path ranks, barycentre crossing reduction, centred ranks. */
export function layoutLayered(
  nodes: SizedNode[],
  edges: LayoutEdge[],
  opts: LayoutOptions = {},
): PositionedNode[] {
  const direction = opts.direction ?? 'LR';
  const hGap = opts.hGap ?? (direction === 'TB' ? 40 : 64);
  const vGap = opts.vGap ?? (direction === 'TB' ? 64 : 44);
  const maxRowWidth = opts.maxRowWidth ?? MAX_FIGURE_WIDTH;
  if (nodes.length === 0) return [];
  const rank = rankNodes(nodes, edges, opts.rootIds);
  const ids = new Set(nodes.map(n => n.id));
  const pairs: [string, string][] = edges
    .filter(e => ids.has(e.sourceId) && ids.has(e.targetId) && e.sourceId !== e.targetId)
    .map(e => [e.sourceId, e.targetId]);

  const rankKeys = [...new Set(rank.values())].sort((a, b) => a - b);
  const ranks: string[][] = rankKeys.map(() => []);
  const rankSlot = new Map(rankKeys.map((r, i) => [r, i]));
  const slotOf = new Map<string, number>();
  for (const n of nodes) { const slot = rankSlot.get(rank.get(n.id)!)!; slotOf.set(n.id, slot); ranks[slot].push(n.id); }

  const upNeighbours = new Map<string, string[]>(nodes.map(n => [n.id, []]));
  const downNeighbours = new Map<string, string[]>(nodes.map(n => [n.id, []]));
  for (const [a, b] of pairs) {
    const sa = slotOf.get(a)!;
    const sb = slotOf.get(b)!;
    if (sa === sb) continue;
    if (sa < sb) { downNeighbours.get(a)!.push(b); upNeighbours.get(b)!.push(a); }
    else { downNeighbours.get(b)!.push(a); upNeighbours.get(a)!.push(b); }
  }

  const slotMap = new Map(slotOf);
  let best = ranks.map(r => [...r]);
  let bestCrossings = countCrossings(best, pairs, slotMap);
  const current = ranks.map(r => [...r]);
  const sweep = (slot: number, neighbours: Map<string, string[]>) => {
    const members = current[slot];
    const position = new Map<string, number>();
    current.forEach(r => r.forEach((id, i) => position.set(id, (i + 0.5) / r.length)));
    const keyed = members.map((id, i) => {
      const ns = neighbours.get(id)!;
      const bary = ns.length > 0 ? ns.reduce((sum, n) => sum + position.get(n)!, 0) / ns.length : (i + 0.5) / members.length;
      return { id, bary, i };
    });
    keyed.sort((a, b) => a.bary - b.bary || a.i - b.i);
    current[slot] = keyed.map(k => k.id);
  };
  for (let iteration = 0; iteration < 4 && bestCrossings > 0; iteration++) {
    for (let slot = 1; slot < current.length; slot++) sweep(slot, upNeighbours);
    for (let slot = current.length - 2; slot >= 0; slot--) sweep(slot, downNeighbours);
    const crossings = countCrossings(current, pairs, slotMap);
    if (crossings < bestCrossings) { bestCrossings = crossings; best = current.map(r => [...r]); }
  }

  const byId = new Map(nodes.map(n => [n.id, n]));
  const placed: PositionedNode[] = [];
  if (direction === 'LR') {
    const columns = best.map(r => r.map(id => byId.get(id)!));
    const heights = columns.map(col => col.reduce((sum, n) => sum + n.height, 0) + vGap * (col.length - 1));
    const tallest = Math.max(...heights);
    // The gap after a column grows to hold the widest label of an edge that runs to the next column
    // (or loops within the column), so labels are never squeezed against the target state.
    const finalSlot = new Map<string, number>();
    best.forEach((r, ci) => r.forEach(id => finalSlot.set(id, ci)));
    const gapAfter = columns.map((_, ci) => {
      let gap = hGap;
      for (const e of edges) {
        if (!e.labelWidth) continue;
        const sa = finalSlot.get(e.sourceId);
        const sb = finalSlot.get(e.targetId);
        if (sa === undefined || sb === undefined || sa !== ci) continue;
        if (sb === ci + 1 || (sb === ci && e.sourceId !== e.targetId)) gap = Math.max(gap, e.labelWidth + LABEL_GAP_PADDING);
      }
      return gap;
    });
    let x = 0;
    columns.forEach((col, ci) => {
      let y = (tallest - heights[ci]) / 2;
      for (const n of col) {
        placed.push({ id: n.id, x, y, width: n.width, height: n.height });
        y += n.height + vGap;
      }
      x += Math.max(...col.map(n => n.width)) + gapAfter[ci];
    });
    return placed;
  }

  // TB: wrap each rank onto sub-rows no wider than maxRowWidth, then centre every sub-row.
  const rows: SizedNode[][] = [];
  for (const r of best) {
    let row: SizedNode[] = [];
    let rowWidth = 0;
    for (const id of r) {
      const n = byId.get(id)!;
      const next = row.length === 0 ? n.width : rowWidth + hGap + n.width;
      if (row.length > 0 && next > maxRowWidth) { rows.push(row); row = []; rowWidth = 0; }
      rowWidth = row.length === 0 ? n.width : rowWidth + hGap + n.width;
      row.push(n);
    }
    if (row.length > 0) rows.push(row);
  }
  const widths = rows.map(row => row.reduce((sum, n) => sum + n.width, 0) + hGap * (row.length - 1));
  const widest = Math.max(...widths);
  let y = 0;
  rows.forEach((row, ri) => {
    let x = (widest - widths[ri]) / 2;
    for (const n of row) {
      placed.push({ id: n.id, x, y, width: n.width, height: n.height });
      x += n.width + hGap;
    }
    y += Math.max(...row.map(n => n.height)) + vGap;
  });
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
  /** 'TB' routes bottom/top-centre with rounded orthogonal elbows. Omitted keeps the LR routing. */
  direction?: LayoutDirection;
  /** TB only: horizontal anchor shift in px so parallel edges between the same pair stay distinct. */
  offset?: number;
  /** TB only: overrides `offset` for where the route leaves the source (x shift from its centre). */
  sourceOffset?: number;
  /** TB only: overrides `offset` for where the route enters the target (x shift from its centre). */
  targetOffset?: number;
  /** TB only: every placed node of the figure. Routes that would pass through one of them (other than the two ends) detour around it. */
  obstacles?: readonly DiagramRect[];
}

/** Per-edge offsets (px, centred on 0) that fan out edges sharing the same unordered node pair. */
export function parallelEdgeOffsets(edges: readonly { id: string; sourceId: string; targetId: string }[], step = 14): Map<string, number> {
  const groups = new Map<string, string[]>();
  for (const e of edges) {
    const key = [e.sourceId, e.targetId].sort().join('\u0000');
    groups.set(key, [...(groups.get(key) ?? []), e.id]);
  }
  const offsets = new Map<string, number>();
  for (const ids of groups.values()) ids.forEach((id, i) => offsets.set(id, (i - (ids.length - 1) / 2) * step));
  return offsets;
}

function roundedPolyline(points: { x: number; y: number }[], radius = 8): string {
  if (points.length < 3) return `M ${points[0].x} ${points[0].y} L ${points[points.length - 1].x} ${points[points.length - 1].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const next = points[i + 1];
    const lenIn = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    const lenOut = Math.hypot(next.x - cur.x, next.y - cur.y);
    const r = Math.min(radius, lenIn / 2, lenOut / 2);
    if (r < 1) { d += ` L ${cur.x} ${cur.y}`; continue; }
    const a = { x: cur.x - ((cur.x - prev.x) / lenIn) * r, y: cur.y - ((cur.y - prev.y) / lenIn) * r };
    const b = { x: cur.x + ((next.x - cur.x) / lenOut) * r, y: cur.y + ((next.y - cur.y) / lenOut) * r };
    d += ` L ${a.x} ${a.y} Q ${cur.x} ${cur.y} ${b.x} ${b.y}`;
  }
  const last = points[points.length - 1];
  return `${d} L ${last.x} ${last.y}`;
}

function baseTopBottomPoints(source: DiagramRect, target: DiagramRect, offset: number, sourceOffset = offset, targetOffset = offset): Pt[] {
  const clampX = (r: DiagramRect, x: number) => Math.min(r.x + r.width - 6, Math.max(r.x + 6, x));
  const sx = clampX(source, source.x + source.width / 2 + sourceOffset);
  const tx = clampX(target, target.x + target.width / 2 + targetOffset);
  const sourceBottom = source.y + source.height;
  const targetBottom = target.y + target.height;
  if (target.y >= sourceBottom) {
    const midY = Math.round((sourceBottom + target.y) / 2 + offset / 2);
    return [{ x: sx, y: sourceBottom }, { x: sx, y: midY }, { x: tx, y: midY }, { x: tx, y: target.y }];
  }
  if (targetBottom <= source.y) {
    const midY = Math.round((targetBottom + source.y) / 2 + offset / 2);
    return [{ x: sx, y: source.y }, { x: sx, y: midY }, { x: tx, y: midY }, { x: tx, y: targetBottom }];
  }
  // Same row: leave through the facing sides.
  const sy = source.y + source.height / 2 + offset;
  const ty = target.y + target.height / 2 + offset;
  const goingRight = target.x >= source.x + source.width;
  const goingLeft = target.x + target.width <= source.x;
  if (goingRight || goingLeft) {
    const fromX = goingRight ? source.x + source.width : source.x;
    const toX = goingRight ? target.x : target.x + target.width;
    const midX = Math.round((fromX + toX) / 2);
    return [{ x: fromX, y: sy }, { x: midX, y: sy }, { x: midX, y: ty }, { x: toX, y: ty }];
  }
  const below = Math.max(sourceBottom, targetBottom) + 20 + Math.abs(offset);
  return [{ x: sx, y: sourceBottom }, { x: sx, y: below }, { x: tx, y: below }, { x: tx, y: targetBottom }];
}

const sameRect = (a: DiagramRect, b: DiagramRect) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
const centreOf = (r: DiagramRect): Pt => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

/** Obstacles an edge must avoid: everything except the nodes (or the node owning a pin) at its two ends. */
function blockersFor(source: DiagramRect, target: DiagramRect, obstacles: readonly DiagramRect[]): DiagramRect[] {
  const sc = centreOf(source);
  const tc = centreOf(target);
  return obstacles.filter(o => !sameRect(o, source) && !sameRect(o, target) && !boxContainsPoint(o, sc, 1) && !boxContainsPoint(o, tc, 1));
}

function hitsAny(points: readonly Pt[], blockers: readonly DiagramRect[]): boolean {
  return blockers.some(b => polylineCrossesBox(points, b, 1));
}

/**
 * Detour for a top-down edge whose direct route passes through an intermediate node: leave the source into the
 * channel just below (or above) its row, run sideways to a free vertical lane beside the intermediate nodes, and
 * enter the target from its own channel. The cheapest collision-free candidate wins.
 */
function detourTopBottom(source: DiagramRect, target: DiagramRect, sourceOffset: number, targetOffset: number, all: readonly DiagramRect[], blockers: readonly DiagramRect[]): Pt[] | undefined {
  const clampX = (r: DiagramRect, x: number) => Math.min(r.x + r.width - 6, Math.max(r.x + 6, x));
  const sx = clampX(source, source.x + source.width / 2 + sourceOffset);
  const tx = clampX(target, target.x + target.width / 2 + targetOffset);
  const sourceBottom = source.y + source.height;
  const targetBottom = target.y + target.height;
  const rowBottom = (ref: DiagramRect) => Math.max(ref.y + ref.height, ...all.filter(o => Math.abs(o.y - ref.y) < 1).map(o => o.y + o.height));
  const candidates: Pt[][] = [];
  const down = target.y >= sourceBottom;
  const up = targetBottom <= source.y;
  if (down || up) {
    const sY = down ? sourceBottom : source.y;
    const tY = down ? target.y : targetBottom;
    const y1 = down ? rowBottom(source) + 12 : source.y - 12;
    const y2 = down ? target.y - 12 : rowBottom(target) + 12;
    if (down ? y1 > y2 : y1 < y2) return undefined;
    const lo = Math.min(y1, y2);
    const hi = Math.max(y1, y2);
    const lanes = new Set<number>([sx, tx, (sx + tx) / 2]);
    let minX = Math.min(source.x, target.x);
    let maxX = Math.max(source.x + source.width, target.x + target.width);
    for (const o of all) {
      minX = Math.min(minX, o.x);
      maxX = Math.max(maxX, o.x + o.width);
      if (o.y < hi && o.y + o.height > lo) { lanes.add(o.x - 14); lanes.add(o.x + o.width + 14); }
    }
    lanes.add(minX - 14);
    lanes.add(maxX + 14);
    for (const cx of lanes) {
      candidates.push(simplify([{ x: sx, y: sY }, { x: sx, y: y1 }, { x: cx, y: y1 }, { x: cx, y: y2 }, { x: tx, y: y2 }, { x: tx, y: tY }]));
    }
  } else {
    const yb = Math.max(rowBottom(source), rowBottom(target), sourceBottom, targetBottom) + 14;
    const ya = Math.min(source.y, target.y) - 14;
    candidates.push(
      simplify([{ x: sx, y: sourceBottom }, { x: sx, y: yb }, { x: tx, y: yb }, { x: tx, y: targetBottom }]),
      simplify([{ x: sx, y: source.y }, { x: sx, y: ya }, { x: tx, y: ya }, { x: tx, y: target.y }]),
    );
  }
  let best: Pt[] | undefined;
  let bestCost = Infinity;
  for (const pts of candidates) {
    if (hitsAny(pts, blockers)) continue;
    const cost = polylineLength(pts) + 24 * pts.length;
    if (cost < bestCost) { best = pts; bestCost = cost; }
  }
  return best;
}

function topBottomPoints(source: DiagramRect, target: DiagramRect, offset: number, obstacles: readonly DiagramRect[] = [], sourceOffset = offset, targetOffset = offset): Pt[] {
  const base = baseTopBottomPoints(source, target, offset, sourceOffset, targetOffset);
  if (obstacles.length === 0) return base;
  const blockers = blockersFor(source, target, obstacles);
  if (!hitsAny(base, blockers)) return base;
  return detourTopBottom(source, target, sourceOffset, targetOffset, obstacles, blockers) ?? base;
}

/** The polyline a TB-routed edge follows (not for self edges). Same route `routeEdgePath` draws. */
export function routeEdgePoints(source: DiagramRect, target: DiagramRect, opts: RouteOptions = {}): Pt[] {
  const offset = opts.offset ?? 0;
  return topBottomPoints(source, target, offset, opts.obstacles, opts.sourceOffset ?? offset, opts.targetOffset ?? offset);
}

const INFLATE = 1.5;
const clearOf = (box: Box, others: readonly Box[]) => others.every(o => !boxesIntersect(
  { x: box.x - INFLATE, y: box.y - INFLATE, width: box.width + 2 * INFLATE, height: box.height + 2 * INFLATE }, o));

/**
 * First candidate label position whose text box touches neither an obstacle (any node) nor an already placed label;
 * falls back to the first candidate when every one collides. Callers add the chosen box to `taken`.
 */
export function pickLabelPoint(candidates: readonly EdgeLabelPoint[], text: string, avoid: readonly Box[], taken: readonly Box[], size = 9): EdgeLabelPoint {
  const fits = (c: EdgeLabelPoint) => {
    const box = textBox(c.x, c.y, text, size, c.anchor ?? 'middle');
    return clearOf(box, avoid) && clearOf(box, taken);
  };
  return candidates.find(fits) ?? candidates[0];
}

/** Label positions along a route in order of preference: the default anchor, then free spots on every run. */
export function edgeLabelCandidates(points: readonly Pt[]): EdgeLabelPoint[] {
  const out: EdgeLabelPoint[] = [labelPointForPoints(points)];
  if (points.length === 4) {
    const a = points[1];
    const b = points[2];
    if (Math.abs(a.x - b.x) < 12) out.unshift({ x: a.x + 6, y: (a.y + b.y) / 2 + 3, anchor: 'start' });
    else out.unshift({ x: (a.x + b.x) / 2, y: a.y - 4 });
  }
  const segs: { a: Pt; b: Pt; length: number; horizontal: boolean }[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const horizontal = Math.abs(a.y - b.y) < 0.5;
    const length = horizontal ? Math.abs(a.x - b.x) : Math.abs(a.y - b.y);
    if (length >= 12 && (horizontal || Math.abs(a.x - b.x) < 0.5)) segs.push({ a, b, length, horizontal });
  }
  segs.sort((p, q) => q.length - p.length);
  for (const s of segs) {
    for (const f of [0.5, 0.3, 0.7, 0.15, 0.85]) {
      const x = s.a.x + (s.b.x - s.a.x) * f;
      const y = s.a.y + (s.b.y - s.a.y) * f;
      if (s.horizontal) out.push({ x, y: y - 4 }, { x, y: y + 11 });
      else out.push({ x: x + 6, y: y + 3, anchor: 'start' }, { x: x - 6, y: y + 3, anchor: 'end' });
    }
  }
  return out;
}

export interface EdgeLabelPoint { x: number; y: number; anchor?: 'start' | 'middle' | 'end' }

/**
 * Horizontal label anchor for a route: centred (above) on its longest horizontal run, or, when there is none
 * of useful length, beside the middle of its longest vertical run. Never needs text on a path.
 */
export function labelPointForPoints(points: readonly Pt[], minRun = 12): EdgeLabelPoint {
  const run = longestHorizontal(points);
  if (run && run.length >= minRun) return { x: (run.a.x + run.b.x) / 2, y: run.a.y - 4 };
  let best: { a: Pt; b: Pt; length: number } | undefined;
  for (let i = 1; i < points.length; i++) {
    const length = Math.abs(points[i].y - points[i - 1].y);
    if (!best || length > best.length) best = { a: points[i - 1], b: points[i], length };
  }
  if (!best) return { x: points[0].x, y: points[0].y - 4 };
  return { x: best.a.x + 6, y: (best.a.y + best.b.y) / 2 + 3, anchor: 'start' };
}

/** Horizontal-text anchor for a TB-routed edge's label: on its horizontal run, or beside a straight vertical run. */
export function routeEdgeLabelPoint(source: DiagramRect, target: DiagramRect, offsetOrOpts: number | { offset?: number; sourceOffset?: number; targetOffset?: number; obstacles?: readonly DiagramRect[] } = 0): EdgeLabelPoint {
  const opts = typeof offsetOrOpts === 'number' ? { offset: offsetOrOpts } : offsetOrOpts;
  const isSelf = sameRect(source, target);
  if (isSelf) return { x: source.x + source.width / 2, y: source.y - 24 };
  const pts = topBottomPoints(source, target, opts.offset ?? 0, opts.obstacles, opts.sourceOffset, opts.targetOffset);
  if (pts.length === 4) {
    const a = pts[1];
    const b = pts[2];
    if (Math.abs(a.x - b.x) < 12) return { x: a.x + 6, y: (a.y + b.y) / 2 + 3, anchor: 'start' };
    return { x: (a.x + b.x) / 2, y: a.y - 4 };
  }
  return labelPointForPoints(pts);
}

function routeTopBottom(source: DiagramRect, target: DiagramRect, offset: number, obstacles?: readonly DiagramRect[], sourceOffset?: number, targetOffset?: number): string {
  return roundedPolyline(topBottomPoints(source, target, offset, obstacles, sourceOffset, targetOffset));
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
  if (opts.direction === 'TB') return routeTopBottom(source, target, opts.offset ?? 0, opts.obstacles, opts.sourceOffset, opts.targetOffset);
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
    const curveOffset = (opts.index ?? 0) * 16;
    return `M ${sx} ${sy} C ${sx + dx} ${sy + curveOffset}, ${tx - dx} ${ty + curveOffset}, ${tx} ${ty}`;
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
