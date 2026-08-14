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
