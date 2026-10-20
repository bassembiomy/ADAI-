import { renderHmiWidgetSvg, resolveHmiReportComponents } from '../hmi/hmiReport';
import type { BlockData, ConnectorData, HmiComponent, PartData, RelationshipData } from '../../types/sysml_types';
import type { JunctionData, Layer, StateData, TransitionData } from '../../types/sm_types';
import { formatLegacyProperty } from '../../services/sysmlPropertyRules';
import {
  DiagramEdgeInput, DiagramRect, MAX_NODES_PER_FIGURE, SizedNode,
  boundsOf, chunkItems, connectionPages, escapeHtml, measureNode, rectsOverlap, renderEmptyFigure, wrapFigure,
} from './reportDiagramModel';
import type { EdgeLabelPoint } from './reportDiagramLayout';
import { PositionedNode, labelPointForPoints, layoutGrid, layoutLayered, nodeById, parallelEdgeOffsets, routeEdgeLabelPoint, routeEdgePath } from './reportDiagramLayout';
import { Box, Pt, boxesIntersect, longestHorizontal, parsePath, pointsToPath, polylineCrossesBox, polylineLength, segmentCrossesBox, simplify, textBox, textWidth } from './reportSvgGeometry';
import { getRequirementsDiagramScope } from '../../engine/sysml/requirementsDiagramScope';

export interface ReportRequirementSource {
  blocks: readonly BlockData[];
  relationships: readonly RelationshipData[];
}

export interface ReportBlockSource {
  blocks: readonly BlockData[];
  relationships: readonly RelationshipData[];
  parts?: readonly PartData[];
  containerId?: string;
  /** When given, blocks with an internal structure link to that section instead of using the script drill-down. */
  linkFor?: LayerLinkResolver;
}

const NODE_FILL = '#ffffff';
const NODE_STROKE = '#0b3445';
const REQ_STROKE = '#f97316';
const EDGE_STROKE = '#546e7a';
const TEXT_COLOR = '#182231';

export interface LabeledNodeOptions {
  stroke?: string;
  isInteractive?: boolean;
  childLayerId?: string;
  childLayerTitle?: string;
  containerId?: string;
  /** In-document link (e.g. `#sec-5-2-1`): the node is wrapped in an SVG anchor instead of a double-click drill-down. */
  href?: string;
  hrefTitle?: string;
}

/** Resolves a child-layer id (`ibd-<blockId>`) to a document anchor, or undefined when that layer has no section. */
export type LayerLinkResolver = (layerId: string) => string | undefined;

export function drawLabeledNode(
  node: SizedNode,
  pos: PositionedNode,
  optionsOrStroke: string | LabeledNodeOptions = NODE_STROKE,
): string {
  const opts: LabeledNodeOptions = typeof optionsOrStroke === 'string'
    ? { stroke: optionsOrStroke }
    : optionsOrStroke;
  const stroke = opts.stroke ?? NODE_STROKE;

  const lines = node.lines.map((line, i) => {
    const weight = i === 0 ? ' font-weight="600"' : '';
    const fill = i === 0 ? TEXT_COLOR : '#44515e';
    return `<text x="${pos.x + pos.width / 2}" y="${pos.y + 18 + i * 15}" text-anchor="middle" font-size="11"${weight} fill="${fill}">${escapeHtml(line)}</text>`;
  }).join('');
  const rect = `<rect x="${pos.x}" y="${pos.y}" width="${pos.width}" height="${pos.height}" rx="6" fill="${NODE_FILL}" stroke="${stroke}" stroke-width="1.2"/>${lines}`;

  // Geometry is published on the wrapper so tests (and reviewers) can read the node rectangles back.
  const geom = `data-x="${pos.x}" data-y="${pos.y}" data-w="${pos.width}" data-h="${pos.height}"`;
  if (opts.href) {
    const title = opts.hrefTitle ? `<title>${escapeHtml(opts.hrefTitle)}</title>` : '';
    return `<a class="diagram-node has-child-layer" data-node-id="${escapeHtml(node.id)}" ${geom} href="${escapeHtml(opts.href)}">${title}${rect}</a>`;
  }

  if (opts.isInteractive && opts.childLayerId) {
    const containerId = opts.containerId ?? 'diag-container';
    const escapedTitle = escapeHtml(opts.childLayerTitle ?? node.id);
    return `<g class="diagram-node has-child-layer" data-node-id="${escapeHtml(node.id)}" ${geom} style="cursor: pointer" ondblclick="window.ADIA_DIAGRAM_NAV.drillDown('${escapeHtml(containerId)}', '${escapeHtml(opts.childLayerId)}', '${escapedTitle}')">${rect}</g>`;
  }

  return `<g class="rf-node" data-node-id="${escapeHtml(node.id)}" ${geom}>${rect}</g>`;
}

const DASHED_REL_TYPES = new Set([
  'derive', 'deriveReqt', 'refine', 'satisfy', 'verify', 'trace', 'dependency',
  'allocation', 'binding', 'copy', 'include', 'extend',
  'packageImport', 'elementImport', 'packageMerge',
]);

/** Label anchor for a path given only as `d`: its longest horizontal run, else the middle of the (curved) path. */
function labelPointForPath(path: string): EdgeLabelPoint {
  const points = parsePath(path)[0] ?? [{ x: 0, y: 0 }];
  const run = longestHorizontal(points);
  if (run && run.length >= 30) return { x: (run.a.x + run.b.x) / 2, y: run.a.y - 4 };
  const mid = points[Math.floor((points.length - 1) / 2)];
  return { x: mid.x, y: mid.y - 6 };
}

export function drawStyledEdge(edge: DiagramEdgeInput, path: string, labelPoint?: EdgeLabelPoint): string {
  const dashed = DASHED_REL_TYPES.has(edge.kind) ? ' stroke-dasharray="5 4"' : '';
  let marker = ' marker-end="url(#rf-arrow)"';
  if (edge.kind === 'composition') marker = ' marker-start="url(#rf-diamond-filled)"';
  else if (edge.kind === 'aggregation' || edge.kind === 'sharedAggregation') marker = ' marker-start="url(#rf-diamond-hollow)"';
  else if (edge.kind === 'generalization' || edge.kind === 'useCaseGeneralization') marker = ' marker-end="url(#rf-triangle-hollow)"';
  else if (edge.kind === 'requirementContainment') marker = ' marker-start="url(#requirement-containment-crosshair)"';
  // Labels are always horizontal with a white halo, never set along the path (rotated text on a vertical run is unreadable).
  const at = edge.label ? (labelPoint ?? labelPointForPath(path)) : undefined;
  const label = edge.label && at
    ? `<text class="rf-edge-label" x="${at.x}" y="${at.y}" font-size="9" fill="#65717e" text-anchor="${at.anchor ?? 'middle'}" stroke="#ffffff" stroke-width="3" paint-order="stroke">${escapeHtml(edge.label)}</text>`
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

/**
 * Edge kinds whose SysML source sits BELOW the target in a top-down hierarchy: a generalization's
 * source is the specific block (supertypeIds.ts / effectiveSupertypeIds: "source = specific, target = general"),
 * deriveReqt/copy go derived/copied -> original (relationshipDefinitions.ts directionLabel), and
 * satisfy/verify/refine/trace go design element/test case -> requirement. Their ranking edge is reversed
 * so the target (supertype, source requirement, requirement) lands above. Composition/aggregation and
 * requirementContainment go whole -> part and parent -> child, so they rank source above target.
 */
const SOURCE_BELOW_TARGET_KINDS = new Set([
  'generalization', 'useCaseGeneralization', 'deriveReqt', 'derive', 'copy', 'satisfy', 'verify', 'refine', 'trace',
]);

export function hierarchyRankEdge<T extends { sourceId: string; targetId: string; kind: string }>(edge: T): { sourceId: string; targetId: string } {
  return SOURCE_BELOW_TARGET_KINDS.has(edge.kind)
    ? { sourceId: edge.targetId, targetId: edge.sourceId }
    : { sourceId: edge.sourceId, targetId: edge.targetId };
}

function layoutPage(
  pageNodes: readonly { id: string }[],
  sized: Map<string, SizedNode>,
  edges: DiagramEdgeInput[],
  rootIds?: string[],
  hierarchical = false,
): PageRender {
  const pageIds = new Set(pageNodes.map(n => n.id));
  const pageSized = pageNodes.map(n => sized.get(n.id)!);
  const pageEdges = edges.filter(e => pageIds.has(e.sourceId) && pageIds.has(e.targetId));
  const placed = hierarchical
    ? layoutLayered(pageSized, pageEdges.map(hierarchyRankEdge), { rootIds, direction: 'TB' })
    : layoutLayered(pageSized, pageEdges, { rootIds });
  return { sized: pageSized, edges: pageEdges, placed };
}

export interface ScopedConnection { id: string; sourceId: string; targetId: string; kind: string }

/** Connections touching a page that are not drawn on it, with a reason that names the elements. */
export function omittedForPage(
  scope: readonly ScopedConnection[],
  pageIds: ReadonlySet<string>,
  knownIds: ReadonlySet<string>,
  nameOf: (id: string) => string,
): { id: string; reason: string }[] {
  return scope
    .filter(c => (pageIds.has(c.sourceId) || pageIds.has(c.targetId)) && !(pageIds.has(c.sourceId) && pageIds.has(c.targetId)))
    .map(c => {
      const unresolved = !knownIds.has(c.sourceId) || !knownIds.has(c.targetId);
      return {
        id: c.id,
        reason: `${nameOf(c.sourceId)} → ${nameOf(c.targetId)} (${c.kind}; ${unresolved ? 'an end is not in the model' : 'other end is on another view'})`,
      };
    });
}

function blockName(blocks: ReadonlyMap<string, BlockData>): (id: string) => string {
  return id => {
    const b = blocks.get(id);
    return b ? (b.name?.trim() || b.reqId || 'Unnamed element') : 'Unknown element';
  };
}

function parallelOffsetFor(offsets: Map<string, number>, id: string): number {
  return offsets.get(id) ?? 0;
}

function multiplicityAnchors(src: DiagramRect, tgt: DiagramRect, offset: number): { source: { x: number; y: number }; target: { x: number; y: number } } {
  const sx = src.x + src.width / 2 + offset + 5;
  const tx = tgt.x + tgt.width / 2 + offset + 5;
  if (tgt.y >= src.y + src.height) return { source: { x: sx, y: src.y + src.height + 12 }, target: { x: tx, y: tgt.y - 6 } };
  if (tgt.y + tgt.height <= src.y) return { source: { x: sx, y: src.y - 6 }, target: { x: tx, y: tgt.y + tgt.height + 12 } };
  return { source: { x: src.x + src.width - 4, y: src.y - 6 }, target: { x: tgt.x + 4, y: tgt.y - 6 } };
}

export function renderRequirementsDiagram(source: ReportRequirementSource): string {
  const scope = getRequirementsDiagramScope(source.blocks, source.relationships);
  const reqs = source.blocks.filter(b => b.stereotype === 'requirement' && scope.visibleBlockIds.has(b.id));
  if (reqs.length === 0) return renderEmptyFigure('No requirements defined.');
  const allNodes = source.blocks.filter(b => scope.visibleBlockIds.has(b.id));
  const nodeIds = new Set(allNodes.map(n => n.id));
  const scopeRels = source.relationships.filter(r => scope.visibleRelationshipIds.has(r.id));
  const scopeConnections: ScopedConnection[] = scopeRels.map(r => ({ id: r.id, sourceId: r.sourceId, targetId: r.targetId, kind: r.type }));
  const edges: DiagramEdgeInput[] = scopeRels
    .filter(r => nodeIds.has(r.sourceId) && nodeIds.has(r.targetId))
    .map(r => ({ id: r.id, sourceId: r.sourceId, targetId: r.targetId, label: r.type === 'requirementContainment' ? '«contains»' : (r.label || `«${r.type}»`), kind: r.type }));
  const nameOf = blockName(new Map(source.blocks.map(b => [b.id, b])));
  const pages = connectionPages(allNodes, edges);
  return pages.map((page, pageIndex) => {
    const sized = new Map(page.map(r => [r.id, measureNode(r.id,
      r.stereotype === 'requirement'
        ? [r.reqId ?? 'REQ', r.name ?? '', r.status ? `status: ${r.status}` : '']
        : [`«${r.stereotype ?? 'block'}»`, r.name ?? ''],
      r.stereotype === 'requirement' ? 'req' : 'bdd')]));
    const { edges: pageEdges, placed } = layoutPage(page, sized, edges, undefined, true);
    const offsets = parallelEdgeOffsets(pageEdges);
    const inner = [
      ...pageEdges.map(e => {
        const src = nodeById(placed, e.sourceId)!;
        const tgt = nodeById(placed, e.targetId)!;
        const offset = parallelOffsetFor(offsets, e.id);
        return drawStyledEdge(e, routeEdgePath(src, tgt, { direction: 'TB', offset, obstacles: placed }), routeEdgeLabelPoint(src, tgt, { offset, obstacles: placed }));
      }),
      ...(() => {
        const allNodesMap = new Map(allNodes.map(n => [n.id, n]));
        return placed.map(pos => {
          const node = allNodesMap.get(pos.id);
          const isReq = node?.stereotype === 'requirement';
          return drawLabeledNode(sized.get(pos.id)!, pos, isReq ? REQ_STROKE : NODE_STROKE);
        });
      })(),
    ].join('');
    const viewNote = pages.length > 1 ? ` · view ${pageIndex + 1} of ${pages.length}` : '';
    const requirementCount = page.filter(n => n.stereotype === 'requirement').length;
    const supportingCount = page.length - requirementCount;
    const countNote = supportingCount > 0
      ? `${requirementCount} requirements, ${supportingCount} supporting blocks`
      : `${requirementCount} requirements`;
    const omitted = omittedForPage(scopeConnections, new Set(page.map(n => n.id)), nodeIds, nameOf);
    return wrapFigure(inner, `Requirements diagram${viewNote} (${countNote}, ${pageEdges.length} relationships)`, boundsOf(placed, 24),
      { drawnNodes: page.length, drawnEdges: pageEdges.length, omitted });
  }).join('\n');
}

export function renderBddDiagram(source: ReportBlockSource): string {
  const bddBlocks = source.blocks.filter(b => b.stereotype !== 'requirement');
  if (bddBlocks.length === 0) return renderEmptyFigure('No blocks defined.');
  const bddBlockIds = new Set(bddBlocks.map(b => b.id));
  const connectedReqIds = new Set(source.relationships
    .filter(r => bddBlockIds.has(r.sourceId) || bddBlockIds.has(r.targetId))
    .flatMap(r => [r.sourceId, r.targetId]));
  const allNodes = source.blocks.filter(b => bddBlockIds.has(b.id) || connectedReqIds.has(b.id));
  const nodeIds = new Set(allNodes.map(n => n.id));
  const scopeRels = source.relationships.filter(r => bddBlockIds.has(r.sourceId) || bddBlockIds.has(r.targetId));
  const scopeConnections: ScopedConnection[] = scopeRels.map(r => ({ id: r.id, sourceId: r.sourceId, targetId: r.targetId, kind: r.type }));
  const edges: DiagramEdgeInput[] = scopeRels
    .filter(r => nodeIds.has(r.sourceId) && nodeIds.has(r.targetId))
    .map(r => ({
      id: r.id, sourceId: r.sourceId, targetId: r.targetId,
      label: DASHED_REL_TYPES.has(r.type) ? (r.label?.startsWith('«') ? r.label : `«${r.type}»`) : (r.label ?? ''), kind: r.type,
    }));
  const nameOf = blockName(new Map(source.blocks.map(b => [b.id, b])));
  const pages = connectionPages(allNodes, edges);
  return pages.map((page, pageIndex) => {
    const sized = new Map(page.map(b => {
      const isReq = b.stereotype === 'requirement';
      const hasIbd = !isReq && (source.parts ?? []).some(p => p.blockId === b.id);
      const stereotypePrefix = `«${b.stereotype ?? 'block'}»`;
      const stereotypeLabel = isReq
        ? '«requirement»'
        : hasIbd
          ? `${stereotypePrefix} ⤓ [IBD]`
          : stereotypePrefix;
      const nameLabel = `${b.name ?? ''}${b.isAbstract ? ' {abstract}' : ''}${b.isLeaf ? ' {leaf}' : ''}`;
      return [b.id, measureNode(b.id, [
        stereotypeLabel,
        nameLabel,
        ...(b.properties ?? []).slice(0, 3).map(p => `${formatLegacyProperty(p)}${p.defaultValue ? ` = ${p.defaultValue}` : ''}`),
      ], isReq ? 'req' : 'bdd', 96)];
    }));
    const { edges: pageEdges, placed } = layoutPage(page, sized, edges, undefined, true);
    const offsets = parallelEdgeOffsets(pageEdges);
    const relMap = new Map(source.relationships.map(r => [r.id, r]));
    const edgeEls = pageEdges.map(e => {
      const src = nodeById(placed, e.sourceId)!;
      const tgt = nodeById(placed, e.targetId)!;
      const rel = relMap.get(e.id);
      const sourceRole = (rel as any)?.sourceRole ? `+${(rel as any).sourceRole} ` : '';
      const targetRole = (rel as any)?.targetRole ? `+${(rel as any).targetRole} ` : '';
      const sourceText = `${sourceRole}${rel?.sourceMultiplicity ?? ''}`.trim();
      const targetText = `${targetRole}${rel?.targetMultiplicity ?? ''}`.trim();
      const offset = parallelOffsetFor(offsets, e.id);
      const anchors = multiplicityAnchors(src, tgt, offset);
      return drawStyledEdge(e, routeEdgePath(src, tgt, { direction: 'TB', offset, obstacles: placed }), routeEdgeLabelPoint(src, tgt, { offset, obstacles: placed }))
        + multiplicityLabel(sourceText, anchors.source.x, anchors.source.y)
        + multiplicityLabel(targetText, anchors.target.x, anchors.target.y);
    });
    const inner = [...edgeEls, ...placed.map(pos => {
      const node = allNodes.find(n => n.id === pos.id);
      const isReq = node?.stereotype === 'requirement';
      const hasIbd = !isReq && node && (source.parts ?? []).some(p => p.blockId === node.id);
      const href = hasIbd ? source.linkFor?.(`ibd-${node!.id}`) : undefined;
      const nodeOpts: LabeledNodeOptions = {
        stroke: isReq ? REQ_STROKE : NODE_STROKE,
        isInteractive: Boolean(hasIbd) && !source.linkFor,
        childLayerId: hasIbd ? `ibd-${node!.id}` : undefined,
        childLayerTitle: hasIbd ? `IBD · ${node!.name}` : undefined,
        containerId: source.containerId,
        ...(href ? { href, hrefTitle: `Internal structure of ${node!.name}` } : {}),
      };
      return drawLabeledNode(sized.get(pos.id)!, pos, nodeOpts);
    })].join('');
    const viewNote = pages.length > 1 ? ` · view ${pageIndex + 1} of ${pages.length}` : '';
    const omitted = omittedForPage(scopeConnections, new Set(page.map(n => n.id)), nodeIds, nameOf);
    return wrapFigure(inner, `Block definition diagram${viewNote} (${page.length} blocks, ${pageEdges.length} relationships)`, boundsOf(placed, 24),
      { drawnNodes: page.length, drawnEdges: pageEdges.length, omitted });
  }).join('\n');
}

export interface ReportIbdSource {
  contextBlock: BlockData;
  /** SysML frame header (`ibd [Block] Name [Diagram]`); defaults to `ibd [Block] <context block name>`. */
  frameLabel?: string;
  parts: readonly PartData[];
  connectors: readonly ConnectorData[];
  blocks: readonly BlockData[];
  allParts?: readonly PartData[];
  containerId?: string;
  /** When given, parts whose type has an internal structure link to that section instead of using the script drill-down. */
  linkFor?: LayerLinkResolver;
}

const IBD_FRAME_PADDING = 28;
const IBD_TITLE_HEIGHT = 24;
const IBD_PORT_SIZE = 10;
const IBD_PORT_PITCH = 18;
const IBD_LABEL_SIZE = 9;
const IBD_STUB = 10;
/** Room kept clear on a frame side for boundary-port labels, beyond the label text itself. */
const IBD_BOUNDARY_GUTTER_EXTRA = 24;

type IbdSide = 'left' | 'right';

/** A connector end: where it touches a part or the frame, and which way it leaves (+1 right, -1 left). */
interface IbdEnd { x: number; y: number; dir: 1 | -1; name: string }

interface UsedVertical { x: number; y1: number; y2: number }

/**
 * Orthogonal route between two horizontal-facing ends. Candidates are Z routes through free vertical lanes and
 * routes through a channel above / below the parts; one that crosses no part wins, preferring short, straight
 * routes whose vertical runs do not sit on another connector's.
 */
export function routeIbdConnector(
  from: IbdEnd, to: IbdEnd, parts: readonly DiagramRect[], channels: { top: number; bottom: number }, used: UsedVertical[],
): Pt[] {
  const p1 = { x: from.x + from.dir * IBD_STUB, y: from.y };
  const q1 = { x: to.x + to.dir * IBD_STUB, y: to.y };
  const start = { x: from.x, y: from.y };
  const end = { x: to.x, y: to.y };
  const candidates: Pt[][] = [];
  const lanes = new Set<number>([Math.round((p1.x + q1.x) / 2)]);
  for (const o of parts) { lanes.add(o.x - 12); lanes.add(o.x + o.width + 12); }
  for (const mx of lanes) {
    const okFrom = from.dir > 0 ? mx >= p1.x : mx <= p1.x;
    const okTo = to.dir > 0 ? mx >= q1.x : mx <= q1.x;
    if (okFrom && okTo) candidates.push(simplify([start, { x: mx, y: from.y }, { x: mx, y: to.y }, end]));
  }
  for (const chanY of [channels.top, channels.bottom]) {
    candidates.push(simplify([start, p1, { x: p1.x, y: chanY }, { x: q1.x, y: chanY }, q1, end]));
  }
  let best: Pt[] | undefined;
  let bestCost = Infinity;
  for (const pts of candidates) {
    if (pts.some((_, i) => i > 0 && parts.some(o => segmentCrossesBox(pts[i - 1], pts[i], o, 1)))) continue;
    let cost = polylineLength(pts) + 18 * pts.length;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      if (a.x !== b.x) continue;
      const lo = Math.min(a.y, b.y);
      const hi = Math.max(a.y, b.y);
      if (used.some(u => Math.abs(u.x - a.x) < 6 && lo < u.y2 && u.y1 < hi)) cost += 300;
    }
    if (cost < bestCost) { best = pts; bestCost = cost; }
  }
  const chosen = best ?? candidates[candidates.length - 1];
  for (let i = 1; i < chosen.length; i++) {
    if (chosen[i].x === chosen[i - 1].x) used.push({ x: chosen[i].x, y1: Math.min(chosen[i].y, chosen[i - 1].y), y2: Math.max(chosen[i].y, chosen[i - 1].y) });
  }
  return chosen;
}

export function renderIbdDiagram(source: ReportIbdSource): string {
  if (source.parts.length === 0) {
    return renderEmptyFigure(`No internal parts for ${source.contextBlock.name}.`);
  }
  const blockById = new Map(source.blocks.map(b => [b.id, b]));
  const contextPartIds = new Set(source.parts.map(p => p.id));
  const envPortIds = new Set((source.contextBlock.ports ?? []).map(p => p.id));

  const validConnectors = source.connectors.filter(conn => {
    const isSourcePart = contextPartIds.has(conn.sourcePartId);
    const isSourceEnv =
      (!conn.sourcePartId || conn.sourcePartId === source.contextBlock.id) &&
      Boolean(conn.sourcePortId && envPortIds.has(conn.sourcePortId));
    if (!isSourcePart && !isSourceEnv) return false;

    const isTargetPart = contextPartIds.has(conn.targetPartId);
    const isTargetEnv =
      (!conn.targetPartId || conn.targetPartId === source.contextBlock.id) &&
      Boolean(conn.targetPortId && envPortIds.has(conn.targetPortId));
    if (!isTargetPart && !isTargetEnv) return false;

    return true;
  });
  const connectorLabel = (conn: ConnectorData) => conn.itemFlow ?? conn.label ?? '';

  // Ports a part shows are the ones its type declares; sizes reserve a slot per port so none overlap.
  const portsOf = (part: PartData) => (part.typeId ? blockById.get(part.typeId)?.ports ?? [] : []);
  const sized = new Map(source.parts.map(part => {
    const typeName = part.typeId ? blockById.get(part.typeId)?.name : undefined;
    const node = measureNode(part.id,
      [`${part.name}${typeName ? `: ${typeName}` : ''}`, part.multiplicity ? `[${part.multiplicity}]` : ''], 'ibd', 110);
    const slots = Math.max(0, portsOf(part).length);
    return [part.id, { ...node, height: Math.max(node.height, 16 + slots * IBD_PORT_PITCH) }];
  }));
  // The gap between two parts holds both facing port labels and a connector label, so none of them can collide.
  const longestPortLabel = Math.max(0, ...source.parts.flatMap(p => portsOf(p).map(port => textWidth(port.name, IBD_LABEL_SIZE))));
  const longestConnectorLabel = Math.max(0, ...validConnectors.map(c => textWidth(connectorLabel(c), IBD_LABEL_SIZE)));
  const portGutter = Math.min(360, Math.max(64, 2 * longestPortLabel + longestConnectorLabel + 52));

  const partEdges = validConnectors
    .filter(c => contextPartIds.has(c.sourcePartId) && contextPartIds.has(c.targetPartId) && c.sourcePartId !== c.targetPartId)
    .map(c => ({ sourceId: c.sourcePartId, targetId: c.targetPartId }));
  const placed = partEdges.length > 0
    ? layoutLayered([...sized.values()], partEdges, { direction: 'LR', hGap: portGutter, vGap: 36 })
    : layoutGrid([...sized.values()], undefined, portGutter, 32);
  const placedById = new Map(placed.map(p => [p.id, p]));

  // Side of each port: in -> left, out -> right, inout (or undeclared) faces the peer it is connected to.
  const peerCentre = (partId: string, portId: string): number | undefined => {
    for (const c of validConnectors) {
      const otherPart = c.sourcePartId === partId && c.sourcePortId === portId ? c.targetPartId
        : c.targetPartId === partId && c.targetPortId === portId ? c.sourcePartId : undefined;
      const rect = otherPart ? placedById.get(otherPart) : undefined;
      if (rect) return rect.x + rect.width / 2;
    }
    return undefined;
  };
  const portEnds = new Map<string, IbdEnd>();
  const portEls: string[] = [];
  const reserved: Box[] = placed.map(p => ({ x: p.x, y: p.y, width: p.width, height: p.height }));
  const areaRects: Box[] = [...reserved];
  for (const part of source.parts) {
    const rect = placedById.get(part.id);
    if (!rect) continue;
    portEnds.set(`${part.id}:__center`, { x: rect.x + rect.width, y: rect.y + rect.height / 2, dir: 1, name: '' });
    const ports = portsOf(part);
    const sides = new Map<string, IbdSide>();
    const counts = { left: 0, right: 0 };
    for (const port of ports) {
      if (port.direction === 'in') sides.set(port.id, 'left');
      else if (port.direction === 'out') sides.set(port.id, 'right');
    }
    for (const side of sides.values()) counts[side]++;
    for (const port of ports) {
      if (sides.has(port.id)) continue;
      const peer = peerCentre(part.id, port.id);
      const own = rect.x + rect.width / 2;
      const side: IbdSide = peer !== undefined && peer !== own ? (peer < own ? 'left' : 'right') : (counts.left <= counts.right ? 'left' : 'right');
      sides.set(port.id, side);
      counts[side]++;
    }
    const slotOf = { left: 0, right: 0 };
    for (const port of ports) {
      const side = sides.get(port.id)!;
      const slot = slotOf[side]++;
      const leftSide = side === 'left';
      const x = leftSide ? rect.x - IBD_PORT_SIZE / 2 : rect.x + rect.width - IBD_PORT_SIZE / 2;
      const y = rect.y + 10 + slot * IBD_PORT_PITCH;
      portEnds.set(`${part.id}:${port.id}`, { x: x + IBD_PORT_SIZE / 2, y: y + IBD_PORT_SIZE / 2, dir: leftSide ? -1 : 1, name: port.name });
      // The label sits above the line the port's connector leaves along, never on it.
      const lx = leftSide ? x - 4 : x + IBD_PORT_SIZE + 4;
      const label = textBox(lx, y, port.name, IBD_LABEL_SIZE, leftSide ? 'end' : 'start');
      reserved.push(label);
      areaRects.push(label, { x, y, width: IBD_PORT_SIZE, height: IBD_PORT_SIZE });
      portEls.push(
        `<rect x="${x}" y="${y}" width="${IBD_PORT_SIZE}" height="${IBD_PORT_SIZE}" fill="#ffffff" stroke="${NODE_STROKE}" stroke-width="1"/>`,
        `<text class="rf-port-label" x="${lx}" y="${y}" font-size="${IBD_LABEL_SIZE}" fill="#44515e" text-anchor="${leftSide ? 'end' : 'start'}">${escapeHtml(port.name)}</text>`,
      );
    }
  }

  // Boundary (context) ports sit on the frame; the frame is widened by a gutter holding their labels, so labels never meet parts.
  const area = boundsOf(areaRects, 0);
  const envPorts = source.contextBlock.ports ?? [];
  const envSide = (port: (typeof envPorts)[number]): IbdSide => port.side === 'right' ? 'right' : port.side === 'left' ? 'left' : port.direction === 'out' ? 'right' : 'left';
  const labelWidthOn = (side: IbdSide) => Math.max(0, ...envPorts.filter(p => envSide(p) === side).map(p => textWidth(p.name, IBD_LABEL_SIZE)));
  const leftGutter = labelWidthOn('left') > 0 ? labelWidthOn('left') + IBD_BOUNDARY_GUTTER_EXTRA : 0;
  const rightGutter = labelWidthOn('right') > 0 ? labelWidthOn('right') + IBD_BOUNDARY_GUTTER_EXTRA : 0;
  const envNeeded = Math.max(envPorts.filter(p => envSide(p) === 'left').length, envPorts.filter(p => envSide(p) === 'right').length);
  const frameX = area.x - IBD_FRAME_PADDING - leftGutter;
  const frameY = area.y - IBD_FRAME_PADDING - IBD_TITLE_HEIGHT;
  const frameW = area.width + 2 * IBD_FRAME_PADDING + leftGutter + rightGutter;
  const frameH = Math.max(area.height + 2 * IBD_FRAME_PADDING + IBD_TITLE_HEIGHT, 35 + envNeeded * 25 + 10);
  const envSlots = { left: 0, right: 0 };
  envPorts.forEach(port => {
    const side = envSide(port);
    const isLeft = side === 'left';
    const x = isLeft ? frameX : frameX + frameW;
    const y = frameY + 35 + envSlots[side]++ * 25;
    const end: IbdEnd = { x, y, dir: isLeft ? 1 : -1, name: port.name };
    portEnds.set(`:${port.id}`, end);
    portEnds.set(`${source.contextBlock.id}:${port.id}`, end);
    const lx = isLeft ? x + 10 : x - 10;
    reserved.push(textBox(lx, y - 4, port.name, IBD_LABEL_SIZE, isLeft ? 'start' : 'end'));
    portEls.push(
      `<rect x="${x - 4}" y="${y - 4}" width="8" height="8" fill="#ffffff" stroke="${NODE_STROKE}" stroke-width="1.2"/>`,
      `<text class="rf-port-label" x="${lx}" y="${y - 4}" font-size="${IBD_LABEL_SIZE}" fill="#44515e" text-anchor="${isLeft ? 'start' : 'end'}">${escapeHtml(port.name)}</text>`,
    );
  });

  const partName = new Map<string, string>([...(source.allParts ?? []), ...source.parts].map(p => [p.id, p.name]));
  const portName = new Map<string, string>(source.blocks.flatMap(b => (b.ports ?? []).map(p => [p.id, p.name] as [string, string])));
  const endText = (partId: string, portId: string): string => {
    const part = partId === source.contextBlock.id || !partId ? source.contextBlock.name : (partName.get(partId) ?? 'unknown part');
    const port = portName.get(portId);
    return port ? `${part}.${port}` : part;
  };
  const omitted: { id: string; reason: string }[] = [];
  const drawn: { conn: ConnectorData; from: IbdEnd; to: IbdEnd }[] = [];
  const outsideIds = new Set(validConnectors.map(c => c.id));
  for (const conn of source.connectors) {
    if (!outsideIds.has(conn.id)) {
      omitted.push({ id: conn.id, reason: `${endText(conn.sourcePartId, conn.sourcePortId)} → ${endText(conn.targetPartId, conn.targetPortId)} (an end lies outside ${source.contextBlock.name})` });
      continue;
    }
    const from = portEnds.get(`${conn.sourcePartId}:${conn.sourcePortId}`)
      ?? portEnds.get(`:${conn.sourcePortId}`)
      ?? (source.contextBlock.id ? portEnds.get(`${source.contextBlock.id}:${conn.sourcePortId}`) : undefined)
      ?? portEnds.get(`${conn.sourcePartId}:__center`);
    const to = portEnds.get(`${conn.targetPartId}:${conn.targetPortId}`)
      ?? portEnds.get(`:${conn.targetPortId}`)
      ?? (source.contextBlock.id ? portEnds.get(`${source.contextBlock.id}:${conn.targetPortId}`) : undefined)
      ?? portEnds.get(`${conn.targetPartId}:__center`);
    if (!from || !to) {
      omitted.push({ id: conn.id, reason: `${endText(conn.sourcePartId, conn.sourcePortId)} → ${endText(conn.targetPartId, conn.targetPortId)} (an end could not be placed)` });
      continue;
    }
    drawn.push({ conn, from, to });
  }

  // --- connectors: routed around the parts, labels horizontal with a halo on the longest free run -----------
  const partRects: DiagramRect[] = placed.map(p => ({ x: p.x, y: p.y, width: p.width, height: p.height }));
  const channels = { top: area.y - 14, bottom: area.y + area.height + 14 };
  const used: UsedVertical[] = [];
  const labelBoxes: Box[] = [];
  const routes = drawn.map(({ conn, from, to }) => ({ conn, points: routeIbdConnector(from, to, partRects, channels, used) }));
  const frameBox: Box = { x: frameX, y: frameY, width: frameW, height: frameH };
  const connectorEls = routes.map(({ conn, points }) => {
    const label = connectorLabel(conn);
    let labelEl = '';
    if (label) {
      const lw = textWidth(label, IBD_LABEL_SIZE);
      const candidates: EdgeLabelPoint[] = [];
      const runs: { a: Pt; b: Pt; length: number }[] = [];
      for (let i = 1; i < points.length; i++) {
        if (Math.abs(points[i].y - points[i - 1].y) < 0.5) runs.push({ a: points[i - 1], b: points[i], length: Math.abs(points[i].x - points[i - 1].x) });
      }
      runs.sort((p, q) => q.length - p.length);
      for (const run of runs) if (run.length >= lw + 6) candidates.push({ x: (run.a.x + run.b.x) / 2, y: run.a.y - 4 }, { x: (run.a.x + run.b.x) / 2, y: run.a.y + 12 });
      for (let i = 1; i < points.length; i++) {
        if (Math.abs(points[i].x - points[i - 1].x) < 0.5 && Math.abs(points[i].y - points[i - 1].y) >= 12) {
          candidates.push({ x: points[i].x, y: (points[i].y + points[i - 1].y) / 2 + 3 });
        }
      }
      for (const run of runs) candidates.push({ x: (run.a.x + run.b.x) / 2, y: run.a.y - 4 });
      candidates.push(labelPointForPoints(points));
      const free = (c: EdgeLabelPoint) => {
        const box = textBox(c.x, c.y, label, IBD_LABEL_SIZE, c.anchor ?? 'middle');
        return !reserved.some(r => boxesIntersect(r, box, 0)) && !labelBoxes.some(r => boxesIntersect(r, box, 0))
          && box.x >= frameBox.x && box.x + box.width <= frameBox.x + frameBox.width;
      };
      const at = candidates.find(free) ?? candidates[0];
      labelBoxes.push(textBox(at.x, at.y, label, IBD_LABEL_SIZE, at.anchor ?? 'middle'));
      labelEl = `<text class="rf-edge-label" x="${at.x}" y="${at.y}" font-size="${IBD_LABEL_SIZE}" fill="#65717e" text-anchor="${at.anchor ?? 'middle'}" stroke="#ffffff" stroke-width="3" paint-order="stroke">${escapeHtml(label)}</text>`;
    }
    return `<path id="edge-${conn.id}" d="${pointsToPath(points)}" fill="none" stroke="${EDGE_STROKE}" stroke-width="1.1" marker-end="url(#rf-arrow)"/>${labelEl}`;
  });

  const partEls = placed.map(pos => {
    const part = source.parts.find(p => p.id === pos.id);
    const typeBlock = part?.typeId ? blockById.get(part.typeId) : undefined;
    const hasSubParts = Boolean(part?.typeId && (source.allParts ?? []).some(p => p.blockId === part.typeId));
    const typeName = typeBlock?.name ?? '';
    const href = hasSubParts ? source.linkFor?.(`ibd-${part!.typeId}`) : undefined;
    const nodeOpts: LabeledNodeOptions = {
      isInteractive: hasSubParts && !source.linkFor,
      childLayerId: hasSubParts ? `ibd-${part!.typeId}` : undefined,
      childLayerTitle: hasSubParts ? `Internal Sub-Structure · ${part!.name}${typeName ? ` (${typeName})` : ''}` : undefined,
      containerId: source.containerId,
      ...(href ? { href, hrefTitle: `Internal structure of ${typeName || part!.name}` } : {}),
    };
    return drawLabeledNode(sized.get(pos.id)!, pos, nodeOpts);
  });
  // The frame grows to hold any route that had to leave the parts area (channel routes).
  const routeBounds = boundsOf(routes.flatMap(r => r.points.map(p => ({ x: p.x, y: p.y, width: 0, height: 0 }))), 0);
  const fx0 = Math.min(frameX, routes.length ? routeBounds.x - 8 : frameX);
  const fy0 = Math.min(frameY, routes.length ? routeBounds.y - 8 : frameY);
  const fx1 = Math.max(frameX + frameW, routes.length ? routeBounds.x + routeBounds.width + 8 : 0);
  const fy1 = Math.max(frameY + frameH, routes.length ? routeBounds.y + routeBounds.height + 8 : 0);
  const frame = `<rect x="${fx0}" y="${fy0}" width="${fx1 - fx0}" height="${fy1 - fy0}" fill="none" stroke="${NODE_STROKE}" stroke-width="1.2" stroke-dasharray="6 4"/>`
    + `<text x="${fx0 + 8}" y="${fy0 + 16}" font-size="11" font-weight="600" fill="${TEXT_COLOR}">${escapeHtml(source.frameLabel ?? `ibd [Block] ${source.contextBlock.name}`)}</text>`;
  const inner = frame + connectorEls.join('') + partEls.join('') + portEls.join('');
  const caption = `Internal block diagram · ${source.contextBlock.name} (${source.parts.length} parts, ${drawn.length} connectors)`;
  return wrapFigure(inner, caption, { x: fx0, y: fy0, width: fx1 - fx0, height: fy1 - fy0 },
    { drawnNodes: source.parts.length, drawnEdges: drawn.length, omitted });
}


export interface ReportStateMachineSource {
  layers: readonly Layer[];
  states: readonly StateData[];
  junctions: readonly JunctionData[];
  transitions: readonly TransitionData[];
  /** When given, a state that owns a child layer links to that layer's section (state id -> anchor). */
  linkForState?: (stateId: string) => string | undefined;
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

  const stateNodes: SizedNode[] = source.states
    .filter(s => !(s.parentId && source.states.some(p => p.id === s.parentId && (p.children ?? []).includes(s.id))))
    .map(s => measureNode(s.id, [s.name, '«state»'], 'state', 80));

  const blockNodes: SizedNode[] = allNodes.map(n => {
    const isReq = n.stereotype === 'requirement';
    return measureNode(n.id, [
      isReq ? '«requirement»' : `«${n.stereotype ?? 'block'}»`,
      n.name ?? '',
      n.reqId ?? '',
    ].filter(Boolean), isReq ? 'req' : 'bdd', 90);
  });

  const sized = new Map<string, SizedNode>(
    [...blockNodes, ...stateNodes].map(n => [n.id, n]),
  );

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


interface StateMachineView { index: number; count: number }

const STUB_HEIGHT = 22;
const STUB_GAP = 10;
/** Transition labels longer than this are cut with an ellipsis; the full text is in the transitions table. */
export const SM_LABEL_MAX_CHARS = 40;
const SM_LABEL_SIZE = 9;
/** Back / multi-rank / stub edges leave and enter a state this far down its side, clear of the forward slots and the initial arrow. */
const SM_LOW = 0.88;
const SM_CHANNEL_PITCH = 18;

function shortTransitionLabel(t: TransitionData): string {
  const text = transitionLabel(t);
  return text.length > SM_LABEL_MAX_CHARS ? `${text.slice(0, SM_LABEL_MAX_CHARS - 1)}…` : text;
}

type SmEdgeClass = 'self' | 'forward' | 'sameColumn' | 'around' | 'parent';
interface SmPlanned { t: TransitionData; src: DiagramRect; tgt: DiagramRect; cls: SmEdgeClass; label: string }

/** First free interval row of a channel list: rows are bands stacked away from the diagram, each holding disjoint x intervals. */
function allocChannel(levels: [number, number][][], x1: number, x2: number): number {
  for (let i = 0; ; i++) {
    const row = (levels[i] ??= []);
    if (!row.some(([a, b]) => x1 < b && a < x2)) { row.push([x1, x2]); return i; }
  }
}

function renderStateMachineLayer(layer: Layer, source: ReportStateMachineSource, view?: StateMachineView, extraOmitted: { id: string; reason: string }[] = []): string {
  const layerStates = source.states.filter(s => layer.stateIds.includes(s.id));
  if (layerStates.length === 0) return renderEmptyFigure(`No states in layer ${layer.name}.`);
  const layerJunctions = source.junctions.filter(j => layer.junctionIds.includes(j.id));
  const layerTransitions = source.transitions.filter(t => layer.transitionIds.includes(t.id));

  const stateById = new Map(layerStates.map(s => [s.id, s]));
  const layerIds = new Set(layerStates.map(s => s.id));

  const leafStates = layerStates.filter(s => !(s.children ?? []).some(c => layerIds.has(c)));
  const sized = new Map<string, SizedNode>();
  for (const s of leafStates) sized.set(s.id, measureNode(s.id, stateLines(s), 'state', 96));
  for (const j of layerJunctions) sized.set(j.id, { id: j.id, lines: [], width: JUNCTION_SIZE, height: JUNCTION_SIZE, kind: 'junction' });

  const roots = leafStates.filter(s => s.autostart).map(s => s.id);
  // Only transitions with both ends in this layer take part in placement; the rest become stubs.
  const localIds = new Set([...layerIds, ...layerJunctions.map(j => j.id)]);
  // Each edge reports its label width so the gap between two ranks grows to hold the longest label (no clipping, no overlap with the target).
  const layoutEdges = layerTransitions.filter(t => localIds.has(t.sourceId) && localIds.has(t.targetId)).map(t => ({
    sourceId: t.sourceId, targetId: t.targetId, labelWidth: textWidth(shortTransitionLabel(t), SM_LABEL_SIZE),
  }));
  const leafPlaced = layoutLayered([...sized.values()], layoutEdges, { rootIds: roots, vGap: 52 });
  const placedById = new Map(leafPlaced.map(p => [p.id, p]));

  const depthOf = (s: StateData): number => (s.parentId && stateById.has(s.parentId)) ? 1 + depthOf(stateById.get(s.parentId)!) : 0;
  const parents = layerStates.filter(s => (s.children ?? []).some(c => layerIds.has(c))).sort((a, b) => depthOf(b) - depthOf(a));
  for (const parent of parents) {
    const descendants = (parent.children ?? []).filter(id => placedById.has(id)).map(id => placedById.get(id)!);
    if (descendants.length === 0) continue;
    const inner = boundsOf(descendants, CONTAINER_PADDING);
    placedById.set(parent.id, {
      id: parent.id, x: inner.x, y: inner.y - CONTAINER_TITLE,
      width: inner.width, height: inner.height + CONTAINER_TITLE,
    });
  }

  const allPlaced: DiagramRect[] = [...placedById.values()];
  const autostartState = layerStates.find(s => s.autostart);
  const asRect = autostartState ? placedById.get(autostartState.id) : undefined;

  const layerOfState = (id: string): string | undefined => source.layers.find(l => l.stateIds.includes(id))?.name;
  const otherEndName = (id: string): string => {
    const state = source.states.find(s => s.id === id);
    if (state) return state.name;
    const junction = source.junctions.find(j => j.id === id);
    if (junction) return junction.name?.trim() || `${junction.type} junction`;
    return '';
  };
  const stubText = (id: string): string => {
    const name = otherEndName(id);
    const home = layerOfState(id);
    const where = home && home !== layer.name ? ` (layer ${home})` : ' (other view)';
    return `${name}${where}`;
  };

  // --- columns: the gutters between them are free of nodes, so edges that must travel run there -------------
  const leafRects: DiagramRect[] = [...sized.keys()].map(id => placedById.get(id)).filter((r): r is PositionedNode => Boolean(r));
  const colXs = [...new Set(leafRects.map(r => r.x))].sort((a, b) => a - b);
  const colRightX = colXs.map(x => Math.max(...leafRects.filter(r => r.x === x).map(r => r.x + r.width)));
  const colOf = (r: DiagramRect): number => {
    const exact = colXs.indexOf(r.x);
    if (exact >= 0) return exact;
    const cx = r.x + r.width / 2;
    let best = 0;
    let bestDistance = Infinity;
    colXs.forEach((x, i) => {
      const distance = cx < x ? x - cx : cx > colRightX[i] ? cx - colRightX[i] : 0;
      if (distance < bestDistance) { best = i; bestDistance = distance; }
    });
    return best;
  };
  const rightOfColumn = (ci: number, fallback: DiagramRect) => colRightX[ci] ?? fallback.x + fallback.width;
  const leftOfColumn = (ci: number, fallback: DiagramRect) => colXs[ci] ?? fallback.x;

  const rectOf = (id: string): DiagramRect | undefined => placedById.get(id);
  const omitted: { id: string; reason: string }[] = [...extraOmitted];
  const stubs: { t: TransitionData; local: DiagramRect; outgoing: boolean; text: string }[] = [];
  const planned: SmPlanned[] = [];
  layerTransitions.forEach(t => {
    const src = rectOf(t.sourceId);
    const tgt = rectOf(t.targetId);
    const nameFor = (id: string) => otherEndName(id) || 'unknown state';
    if (src && tgt) {
      const isParentTarget = tgt !== src && placedById.has(t.targetId) &&
        layerStates.some(s => s.id === t.targetId && ((s.children ?? []).includes(t.sourceId) ||
          (src.x >= tgt.x && src.y >= tgt.y && src.x + src.width <= tgt.x + tgt.width && src.y + src.height <= tgt.y + tgt.height)));
      const sci = colOf(src);
      const tci = colOf(tgt);
      const cls: SmEdgeClass = t.sourceId === t.targetId ? 'self'
        : isParentTarget ? 'parent'
        : tci === sci + 1 && tgt.x >= src.x + src.width ? 'forward'
        : tci === sci ? 'sameColumn'
        : 'around';
      planned.push({ t, src, tgt, cls, label: shortTransitionLabel(t) });
      return;
    }
    if (src || tgt) {
      const outsideId = src ? t.targetId : t.sourceId;
      if (otherEndName(outsideId)) {
        stubs.push({ t, local: (src ?? tgt)!, outgoing: Boolean(src), text: stubText(outsideId) });
        return;
      }
      omitted.push({ id: t.id, reason: `${src ? nameFor(t.sourceId) : 'unknown state'} → ${tgt ? nameFor(t.targetId) : 'unknown state'} (an end state is not in the model)` });
      return;
    }
    omitted.push({ id: t.id, reason: `${nameFor(t.sourceId)} → ${nameFor(t.targetId)} (both ends lie outside this view)` });
  });

  // --- slots on the sides of a state, so edges that share a side stay distinct ------------------------------
  const centreY = (r: DiagramRect) => r.y + r.height / 2;
  const outs = new Map<string, SmPlanned[]>();
  const ins = new Map<string, SmPlanned[]>();
  for (const p of planned.filter(q => q.cls === 'forward')) {
    outs.set(p.t.sourceId, [...(outs.get(p.t.sourceId) ?? []), p]);
    ins.set(p.t.targetId, [...(ins.get(p.t.targetId) ?? []), p]);
  }
  for (const list of outs.values()) list.sort((a, b) => centreY(a.tgt) - centreY(b.tgt));
  for (const list of ins.values()) list.sort((a, b) => centreY(a.src) - centreY(b.src));
  const slotY = (r: DiagramRect, k: number, n: number) => r.y + (r.height * (k + 1)) / (n + 1);
  const reserveForInitial = (id: string) => (autostartState?.id === id && asRect ? 1 : 0);

  // --- label registry: a label is nudged until it overlaps neither another label nor a state ----------------
  const labelBoxes: Box[] = [];
  const placeLabel = (wanted: EdgeLabelPoint, text: string): EdgeLabelPoint => {
    for (const dy of [0, -11, 11, -22, 22]) {
      const at = { ...wanted, y: wanted.y + dy };
      const box = textBox(at.x, at.y, text, SM_LABEL_SIZE, at.anchor ?? 'middle');
      if (!labelBoxes.some(b => boxesIntersect(b, box)) && !leafRects.some(r => boxesIntersect(r, box))) { labelBoxes.push(box); return at; }
    }
    labelBoxes.push(textBox(wanted.x, wanted.y, text, SM_LABEL_SIZE, wanted.anchor ?? 'middle'));
    return wanted;
  };

  // --- plan every in-view transition -----------------------------------------------------------------------
  const maxBottom = Math.max(...allPlaced.map(r => r.y + r.height));
  const bottomLevels: [number, number][][] = [];
  const useRight = new Map<number, number>();
  const useLeft = new Map<number, number>();
  const bump = (m: Map<number, number>, key: number) => { const n = m.get(key) ?? 0; m.set(key, n + 1); return n; };
  const loopsOn = new Map<string, number>();
  let gutterRight = -Infinity;
  let gutterLeft = Infinity;
  const edgeEls: string[] = [];
  let drawnEdges = 0;

  for (const p of planned) {
    const { t, src, tgt, label } = p;
    const edge = { id: t.id, sourceId: t.sourceId, targetId: t.targetId, label, kind: 'transition' };
    const sR = src.x + src.width;
    let path: string;
    let at: EdgeLabelPoint;
    if (p.cls === 'self') {
      const index = loopsOn.get(t.sourceId) ?? 0;
      loopsOn.set(t.sourceId, index + 1);
      const cx = src.x + src.width / 2;
      const w = Math.max(28, src.width * 0.5);
      const lift = 30 + index * 16;
      path = `M ${cx - w / 2} ${src.y} C ${cx - w / 2} ${src.y - lift}, ${cx + w / 2} ${src.y - lift}, ${cx + w / 2} ${src.y}`;
      at = { x: cx, y: src.y - lift * 0.75 - 5 };
      allPlaced.push({ x: cx - Math.max(w, textWidth(label, SM_LABEL_SIZE)) / 2, y: at.y - 12, width: Math.max(w, textWidth(label, SM_LABEL_SIZE)), height: src.y - at.y + 12 });
    } else if (p.cls === 'parent') {
      const sx2 = src.x + src.width / 2;
      const tx2 = tgt.x + tgt.width / 2;
      path = `M ${sx2} ${src.y} C ${sx2} ${src.y - 20}, ${tx2} ${tgt.y + 20}, ${tx2} ${tgt.y}`;
      at = { x: (sx2 + tx2) / 2, y: (src.y + tgt.y) / 2 - 4 };
    } else {
      let pts: Pt[];
      if (p.cls === 'forward') {
        const outList = outs.get(t.sourceId)!;
        const inList = ins.get(t.targetId)!;
        const sy = slotY(src, outList.indexOf(p), outList.length);
        const ki = inList.indexOf(p) + reserveForInitial(t.targetId);
        const ty = slotY(tgt, ki, inList.length + reserveForInitial(t.targetId));
        const jogX = tgt.x - 12 - Math.min(16, 4 * ki);
        pts = simplify([{ x: sR, y: sy }, { x: jogX, y: sy }, { x: jogX, y: ty }, { x: tgt.x, y: ty }]);
        at = labelPointForPoints(pts, 20);
      } else if (p.cls === 'sameColumn') {
        const ci = colOf(src);
        const gx = rightOfColumn(ci, src) + 12 + 5 * bump(useRight, ci);
        gutterRight = Math.max(gutterRight, gx);
        pts = simplify([{ x: sR, y: src.y + src.height * SM_LOW }, { x: gx, y: src.y + src.height * SM_LOW }, { x: gx, y: tgt.y + tgt.height * SM_LOW }, { x: tgt.x + tgt.width, y: tgt.y + tgt.height * SM_LOW }]);
        at = { x: gx + 5, y: (src.y + tgt.y + (src.height + tgt.height) * SM_LOW) / 2 + 3, anchor: 'start' };
      } else {
        const sci = colOf(src);
        const tci = colOf(tgt);
        const gxS = rightOfColumn(sci, src) + 12 + 5 * bump(useRight, sci);
        const gxT = leftOfColumn(tci, tgt) - 12 - 5 * bump(useLeft, tci);
        gutterRight = Math.max(gutterRight, gxS);
        gutterLeft = Math.min(gutterLeft, gxT);
        const half = textWidth(label, SM_LABEL_SIZE) / 2;
        const cx = (gxS + gxT) / 2;
        const level = allocChannel(bottomLevels, Math.min(gxS, gxT, cx - half) - 4, Math.max(gxS, gxT, cx + half) + 4);
        const chanY = maxBottom + 24 + level * SM_CHANNEL_PITCH;
        const sy = src.y + src.height * SM_LOW;
        const ty = tgt.y + tgt.height * SM_LOW;
        pts = simplify([{ x: sR, y: sy }, { x: gxS, y: sy }, { x: gxS, y: chanY }, { x: gxT, y: chanY }, { x: gxT, y: ty }, { x: tgt.x, y: ty }]);
        at = { x: cx, y: chanY - 4 };
      }
      path = pointsToPath(pts);
    }
    edgeEls.push(drawStyledEdge(edge, path, label ? placeLabel(at, label) : undefined));
    drawnEdges++;
  }

  // --- initial pseudostate: its arrow takes the reserved first slot on the autostart state's left side ------
  let initialPseudostateEls = '';
  if (autostartState && asRect) {
    const psSize = 14;
    const psX = asRect.x - 50;
    const psCy = slotY(asRect, 0, (ins.get(autostartState.id)?.length ?? 0) + 1);
    initialPseudostateEls = `<circle class="initial-pseudostate" cx="${psX + psSize / 2}" cy="${psCy}" r="${psSize / 2}" fill="#182231" stroke="#182231" stroke-width="1.2"/>`
      + `<path id="edge-initial-${escapeHtml(autostartState.id)}" d="M ${psX + psSize} ${psCy} L ${asRect.x} ${psCy}" fill="none" stroke="${EDGE_STROKE}" stroke-width="1.1" marker-end="url(#rf-arrow)"/>`;
    allPlaced.push({ x: psX, y: psCy - psSize / 2, width: psSize, height: psSize });
  }

  // Off-view connectors: a labelled stub in a gutter right of (outgoing) or left of (incoming) the diagram.
  // The route runs along the gutters and a channel above the diagram when the straight way would cross a state.
  const stubEls: string[] = [];
  if (stubs.length > 0) {
    const content = boundsOf(allPlaced, 0);
    const rightEdge = Math.max(content.x + content.width, gutterRight);
    const leftEdge = Math.min(content.x, gutterLeft);
    const topLevels: [number, number][][] = [];
    const placeSide = (list: typeof stubs, outgoing: boolean) => {
      let lastBottom = -Infinity;
      for (const stub of [...list].sort((a, b) => a.local.y - b.local.y)) {
        const label = `${outgoing ? '→ ' : '← '}${stub.text}`;
        const width = Math.max(90, Math.ceil(label.length * 6 + 16));
        const y = Math.max(stub.local.y + stub.local.height / 2 - STUB_HEIGHT / 2, lastBottom + STUB_GAP);
        lastBottom = y + STUB_HEIGHT;
        const rect: DiagramRect = { x: outgoing ? rightEdge + 56 : leftEdge - 56 - width, y, width, height: STUB_HEIGHT };
        const cy = y + STUB_HEIGHT / 2;
        const local = stub.local;
        const lci = colOf(local);
        const ly = local.y + local.height * SM_LOW;
        const gx = outgoing ? rightEdge + 24 : leftEdge - 24;
        const crosses = (pts: Pt[]) => leafRects.some(r => polylineCrossesBox(pts, r, 1));
        const direct = outgoing
          ? simplify([{ x: local.x + local.width, y: ly }, { x: gx, y: ly }, { x: gx, y: cy }, { x: rect.x, y: cy }])
          : simplify([{ x: rect.x + width, y: cy }, { x: gx, y: cy }, { x: gx, y: ly }, { x: local.x, y: ly }]);
        let pts = direct;
        if (crosses(direct)) {
          const exitX = outgoing
            ? rightOfColumn(lci, local) + 12 + 5 * bump(useRight, lci)
            : leftOfColumn(lci, local) - 12 - 5 * bump(useLeft, lci);
          const level = allocChannel(topLevels, Math.min(exitX, gx) - 4, Math.max(exitX, gx) + 4);
          const chanY = content.y - 18 - level * SM_CHANNEL_PITCH;
          pts = outgoing
            ? simplify([{ x: local.x + local.width, y: ly }, { x: exitX, y: ly }, { x: exitX, y: chanY }, { x: gx, y: chanY }, { x: gx, y: cy }, { x: rect.x, y: cy }])
            : simplify([{ x: rect.x + width, y: cy }, { x: gx, y: cy }, { x: gx, y: chanY }, { x: exitX, y: chanY }, { x: exitX, y: ly }, { x: local.x, y: ly }]);
        }
        const text = shortTransitionLabel(stub.t);
        stubEls.push(drawStyledEdge({ id: stub.t.id, sourceId: stub.t.sourceId, targetId: stub.t.targetId, label: text, kind: 'transition' }, pointsToPath(pts),
          text ? placeLabel(labelPointForPoints(pts, 20), text) : undefined));
        stubEls.push(`<g class="sm-stub" data-x="${rect.x}" data-y="${rect.y}" data-w="${rect.width}" data-h="${rect.height}"><rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" rx="11" fill="#f4f6f8" stroke="${NODE_STROKE}" stroke-width="1" stroke-dasharray="3 2"/>`
          + `<text x="${rect.x + rect.width / 2}" y="${rect.y + 15}" text-anchor="middle" font-size="10" fill="${TEXT_COLOR}">${escapeHtml(label)}</text></g>`);
        allPlaced.push(rect);
        drawnEdges++;
      }
    };
    placeSide(stubs.filter(s => s.outgoing), true);
    placeSide(stubs.filter(s => !s.outgoing), false);
  }

  const containerEls = parents.map(p => {
    const rect = placedById.get(p.id);
    if (!rect) return '';
    return `<rect class="sm-container" x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" rx="8" fill="#f4f6f8" stroke="${NODE_STROKE}" stroke-width="1.2"/>`
      + `<text x="${rect.x + 10}" y="${rect.y + 15}" font-size="11" font-weight="600" fill="${TEXT_COLOR}">${escapeHtml(p.name)}</text>`;
  });

  const stateEls = leafStates.map(s => {
    const href = source.linkForState?.(s.id);
    return drawLabeledNode(sized.get(s.id)!, placedById.get(s.id)! as PositionedNode,
      href ? { href, hrefTitle: `Sub-states of ${s.name}` } : NODE_STROKE);
  });
  const junctionEls = layerJunctions.map(j => {
    const rect = placedById.get(j.id)!;
    const cx = rect.x + JUNCTION_SIZE / 2;
    const cy = rect.y + JUNCTION_SIZE / 2;
    const label = j.type === 'history' ? 'H' : j.type === 'deep-history' ? 'H*' : '';
    return `<g class="rf-node" data-x="${rect.x}" data-y="${rect.y}" data-w="${rect.width}" data-h="${rect.height}"><circle cx="${cx}" cy="${cy}" r="${JUNCTION_SIZE / 2}" fill="#ffffff" stroke="${NODE_STROKE}" stroke-width="1.2"/>`
      + (label ? `<text x="${cx}" y="${cy + 3.5}" text-anchor="middle" font-size="9" fill="${TEXT_COLOR}">${label}</text>` : '') + '</g>';
  });

  const inner = [initialPseudostateEls, ...containerEls, ...edgeEls, ...stubEls, ...stateEls, ...junctionEls].join('');
  const viewNote = view ? ` · view ${view.index + 1} of ${view.count}` : '';
  const caption = `State machine · ${layer.name}${viewNote} (${layerStates.length} states, ${layerTransitions.length} transitions)`;
  // The figure's viewBox is the union of the nodes and every route / label drawn (wrapFigure scans the svg).
  return wrapFigure(inner, caption, boundsOf(allPlaced, 24),
    { drawnNodes: leafStates.length + layerJunctions.length, drawnEdges, omitted });
}


export function renderStateMachineDiagrams(source: ReportStateMachineSource): string[] {
  return source.layers.flatMap(layer => {
    const layerStates = source.states.filter(s => layer.stateIds.includes(s.id));
    if (layerStates.length <= MAX_NODES_PER_FIGURE) {
      return [renderStateMachineLayer(layer, source)];
    }
    const chunks = chunkItems(layerStates, MAX_NODES_PER_FIGURE);
    const allLayerTransitions = source.transitions.filter(t => layer.transitionIds.includes(t.id));
    const chunkOf = new Map<string, number>();
    chunks.forEach((chunk, i) => chunk.forEach(s => chunkOf.set(s.id, i)));
    const junctionIds = new Set(layer.junctionIds);
    return chunks.map((chunk, i) => {
      const chunkIds = new Set(chunk.map(s => s.id));
      // A junction travels with the first view that has a transition to or from it.
      const touching = allLayerTransitions.filter(t => chunkIds.has(t.sourceId) || chunkIds.has(t.targetId));
      const chunkJunctions = layer.junctionIds.filter(id => touching.some(t => t.sourceId === id || t.targetId === id)
        && junctionIds.has(id));
      // Transitions touching no state of this layer are reported on the first view (junction-only ones are drawn there).
      const unplaceable = i === 0
        ? allLayerTransitions.filter(t => !chunkOf.has(t.sourceId) && !chunkOf.has(t.targetId))
        : [];
      const junctionOnly = unplaceable.filter(t => junctionIds.has(t.sourceId) && junctionIds.has(t.targetId));
      const viewLayer: Layer = {
        ...layer,
        stateIds: chunk.map(s => s.id),
        transitionIds: [...touching, ...junctionOnly].map(t => t.id),
        junctionIds: [...new Set([...chunkJunctions, ...junctionOnly.flatMap(t => [t.sourceId, t.targetId])])],
      };
      const name = (id: string) => source.states.find(s => s.id === id)?.name ?? source.junctions.find(j => j.id === id)?.name?.trim() ?? 'unknown state';
      const extra = unplaceable
        .filter(t => !junctionOnly.includes(t))
        .map(t => ({ id: t.id, reason: `${name(t.sourceId)} → ${name(t.targetId)} (neither end is a state of ${layer.name})` }));
      return renderStateMachineLayer(viewLayer, source, { index: i, count: chunks.length }, extra);
    });
  });
}

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
  const pages = chunkItems([...source.nodes], MAX_NODES_PER_FIGURE);
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
  if (!components.length) return [];
  const resolved = resolveHmiReportComponents(components);
  const rects = resolved.map(c => ({
    id: c.id,
    x: Number.isFinite(c.x) ? c.x : 0,
    y: Number.isFinite(c.y) ? c.y : 0,
    width: c.width > 0 ? c.width : HMI_FALLBACK_WIDTH,
    height: c.height > 0 ? c.height : HMI_FALLBACK_HEIGHT,
  }));
  const ancestor = (id: string, childId: string): boolean => { const seen = new Set<string>(); let parent = components.find(c => c.id === childId)?.parentId; while (parent && !seen.has(parent)) { if (parent === id) return true; seen.add(parent); parent = components.find(c => c.id === parent)?.parentId; } return false; };
  const overlaps = rects.some((a, i) => rects.some((b, j) => j > i && !ancestor(a.id, b.id) && !ancestor(b.id, a.id) && rectsOverlap(a, b))); 
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
    return `<g transform="translate(${pos.x},${pos.y})">${renderHmiWidgetSvg({ ...c, width: pos.width, height: pos.height })}</g>`;
  });
  return wrapFigure(els.join(''),
    `HMI layout (${source.components.length} components)`, boundsOf(placed, 24));
}
