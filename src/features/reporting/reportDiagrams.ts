import { renderHmiWidgetSvg, resolveHmiReportComponents } from '../hmi/hmiReport';
import type { BlockData, ConnectorData, HmiComponent, PartData, RelationshipData } from '../../types/sysml_types';
import type { JunctionData, Layer, StateData, TransitionData } from '../../types/sm_types';
import { formatLegacyProperty } from '../../services/sysmlPropertyRules';
import {
  DiagramEdgeInput, DiagramRect, MAX_NODES_PER_FIGURE, SizedNode,
  boundsOf, chunkItems, connectionPages, escapeHtml, figurePageFit, measureNode, rectsOverlap, renderEmptyFigure, wrapFigure,
} from './reportDiagramModel';
import type { EdgeLabelPoint } from './reportDiagramLayout';
import { PositionedNode, edgeLabelCandidates, labelPointForPoints, layoutGrid, layoutLayered, nodeById, parallelEdgeOffsets, pickLabelPoint, routeEdgeLabelPoint, routeEdgePath, routeEdgePoints } from './reportDiagramLayout';
import { Box, Pt, boxesIntersect, longestHorizontal, parsePath, pointsToPath, polylineCrossesBox, polylineLength, segmentCrossesBox, simplify, textBox, textWidth } from './reportSvgGeometry';
import { OrthogonalRouter, removeCollinear } from './reportStateRouting';
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

function multiplicityLabel(text: string, at: EdgeLabelPoint): string {
  if (!text) return '';
  const anchor = at.anchor && at.anchor !== 'start' ? ` text-anchor="${at.anchor}"` : '';
  return `<text class="rf-multiplicity" x="${at.x}" y="${at.y}" font-size="9" fill="#65717e"${anchor}>${escapeHtml(text)}</text>`;
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
  maxRowWidth?: number,
): PageRender {
  const pageIds = new Set(pageNodes.map(n => n.id));
  const pageSized = pageNodes.map(n => sized.get(n.id)!);
  const pageEdges = edges.filter(e => pageIds.has(e.sourceId) && pageIds.has(e.targetId));
  const placed = hierarchical
    ? layoutLayered(pageSized, pageEdges.map(hierarchyRankEdge), { rootIds, direction: 'TB', maxRowWidth })
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

/**
 * Portrait page budget. Width in SVG user units: the print box is 680px, so up to 720 units keeps the scale >= 0.9
 * (min font 9 -> >= 8px, with headroom). Height is the whole printed figure (scaled svg + caption + the "not drawn in
 * this view" note) against the 979px print box, less a safety margin.
 */
export const PORTRAIT_VIEW_MAX_WIDTH = 720;
export const PORTRAIT_FIGURE_MAX_HEIGHT = 950;
const PRINT_BOX_WIDTH = 680;
/** A wrapped TB rank must leave room for the 24 unit viewBox padding on both sides. */
const PORTRAIT_ROW_WIDTH = PORTRAIT_VIEW_MAX_WIDTH - 2 * 24 - 4;

/** Rendered size of a wrapped figure: viewBox width and the estimated printed height (svg, caption, omitted note). */
function printedSizeOf(figure: string): { width: number; height: number } {
  const m = /viewBox="[-\d.]+ [-\d.]+ ([\d.]+) ([\d.]+)"/.exec(figure);
  if (!m) return { width: 0, height: 0 };
  const width = Number(m[1]);
  const scale = Math.min(1, PRINT_BOX_WIDTH / width);
  const note = /report-figure-omitted">([^<]*)</.exec(figure)?.[1];
  const overhead = 32 + (note ? 22 + 15 * Math.ceil(note.length / 95) : 0);
  return { width, height: Number(m[2]) * scale + overhead };
}

/**
 * Splits pages whose rendered figure would not fit one portrait page at a legible scale. A page is re-split
 * (boundary nodes repeat, every connection stays on some view) until each view fits or has two nodes.
 */
function splitToPageBudget<T extends { id: string }>(
  pages: T[][],
  edges: readonly { sourceId: string; targetId: string }[],
  renderPage: (page: T[]) => string,
): T[][] {
  const fits = (page: T[]) => {
    const { width, height } = printedSizeOf(renderPage(page));
    return width <= PORTRAIT_VIEW_MAX_WIDTH && height <= PORTRAIT_FIGURE_MAX_HEIGHT;
  };
  const split = (page: T[]): T[][] => {
    if (page.length <= 2 || fits(page)) return [page];
    const ids = new Set(page.map(n => n.id));
    const pageEdges = edges.filter(e => ids.has(e.sourceId) && ids.has(e.targetId));
    for (let size = Math.ceil(page.length * 0.6); size >= 2; size = size > 2 ? Math.max(2, Math.ceil(size * 0.8)) : 1) {
      const parts = connectionPages(page, pageEdges, size);
      if (parts.length > 1) return parts.flatMap(split);
    }
    return [page];
  };
  return pages.flatMap(split);
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
  const allNodesMap = new Map(allNodes.map(n => [n.id, n]));
  const renderPage = (page: BlockData[], viewNote: string): string => {
    const sized = new Map(page.map(r => [r.id, measureNode(r.id,
      r.stereotype === 'requirement'
        ? [r.reqId ?? 'REQ', r.name ?? '', r.status ? `status: ${r.status}` : '']
        : [`«${r.stereotype ?? 'block'}»`, r.name ?? ''],
      r.stereotype === 'requirement' ? 'req' : 'bdd')]));
    const { edges: pageEdges, placed } = layoutPage(page, sized, edges, undefined, true, PORTRAIT_ROW_WIDTH);
    const offsets = parallelEdgeOffsets(pageEdges);
    // Every label avoids every node (not only its own ends) and the labels already placed.
    const taken: Box[] = [];
    const edgeEls = pageEdges.map(e => {
      const src = nodeById(placed, e.sourceId)!;
      const tgt = nodeById(placed, e.targetId)!;
      const offset = parallelOffsetFor(offsets, e.id);
      const path = routeEdgePath(src, tgt, { direction: 'TB', offset, obstacles: placed });
      let at: EdgeLabelPoint | undefined;
      if (e.label) {
        at = src === tgt
          ? routeEdgeLabelPoint(src, tgt, { offset, obstacles: placed })
          : pickLabelPoint(edgeLabelCandidates(routeEdgePoints(src, tgt, { offset, obstacles: placed })), e.label, placed, taken);
        taken.push(textBox(at.x, at.y, e.label, 9, at.anchor ?? 'middle'));
      }
      return drawStyledEdge(e, path, at);
    });
    const inner = [
      ...edgeEls,
      ...placed.map(pos => {
        const node = allNodesMap.get(pos.id);
        const isReq = node?.stereotype === 'requirement';
        return drawLabeledNode(sized.get(pos.id)!, pos, isReq ? REQ_STROKE : NODE_STROKE);
      }),
    ].join('');
    const requirementCount = page.filter(n => n.stereotype === 'requirement').length;
    const supportingCount = page.length - requirementCount;
    const countNote = supportingCount > 0
      ? `${requirementCount} requirements, ${supportingCount} supporting blocks`
      : `${requirementCount} requirements`;
    const omitted = omittedForPage(scopeConnections, new Set(page.map(n => n.id)), nodeIds, nameOf);
    return wrapFigure(inner, `Requirements diagram${viewNote} (${countNote}, ${pageEdges.length} relationships)`, boundsOf(placed, 24),
      { drawnNodes: page.length, drawnEdges: pageEdges.length, omitted });
  };
  const pages = splitToPageBudget(connectionPages(allNodes, edges), edges, page => renderPage(page, ''));
  return pages.map((page, pageIndex) => renderPage(page, pages.length > 1 ? ` · view ${pageIndex + 1} of ${pages.length}` : '')).join('\n');
}

/** Gap kept between neighbouring edge stems on a node side, beyond the widest multiplicity label there. */
const PORT_GAP = 10;
const PORT_MIN_STEP = 14;
const MAX_FAN_NODE_WIDTH = 520;

interface PortEntry { edgeId: string; end: 'source' | 'target'; otherX: number; labelWidth: number }
type EdgeEndOffsets = Map<string, { sourceOffset?: number; targetOffset?: number }>;

/** Which node side an edge uses at each end in a top-down layout (same-row edges use the facing sides: no fan). */
function endSides(src: DiagramRect, tgt: DiagramRect): { source: 'top' | 'bottom'; target: 'top' | 'bottom' } | undefined {
  if (tgt.y >= src.y + src.height) return { source: 'bottom', target: 'top' };
  if (tgt.y + tgt.height <= src.y) return { source: 'top', target: 'bottom' };
  return undefined;
}

function collectPorts(
  placed: PositionedNode[],
  edges: readonly DiagramEdgeInput[],
  texts: ReadonlyMap<string, { source: string; target: string }>,
): Map<string, PortEntry[]> {
  const groups = new Map<string, PortEntry[]>();
  for (const e of edges) {
    const src = nodeById(placed, e.sourceId);
    const tgt = nodeById(placed, e.targetId);
    if (!src || !tgt || src === tgt) continue;
    const sides = endSides(src, tgt);
    if (!sides) continue;
    const t = texts.get(e.id) ?? { source: '', target: '' };
    const add = (nodeId: string, side: string, entry: PortEntry) => {
      const key = `${nodeId}|${side}`;
      groups.set(key, [...(groups.get(key) ?? []), entry]);
    };
    add(src.id, sides.source, { edgeId: e.id, end: 'source', otherX: tgt.x + tgt.width / 2, labelWidth: textWidth(t.source) });
    add(tgt.id, sides.target, { edgeId: e.id, end: 'target', otherX: src.x + src.width / 2, labelWidth: textWidth(t.target) });
  }
  return groups;
}

const portNodeId = (key: string) => key.slice(0, key.lastIndexOf('|'));
const portStep = (entries: readonly PortEntry[]) => Math.max(PORT_MIN_STEP, Math.max(...entries.map(p => p.labelWidth)) + PORT_GAP);

/** Node width needed so every stem on each side gets its own slot wide enough for its multiplicity label. */
function fanWidths(groups: Map<string, PortEntry[]>): Map<string, number> {
  const widths = new Map<string, number>();
  for (const [key, entries] of groups) {
    if (entries.length < 2) continue;
    const needed = Math.min(MAX_FAN_NODE_WIDTH, Math.ceil((entries.length - 1) * portStep(entries) + 12 + PORT_GAP));
    widths.set(portNodeId(key), Math.max(widths.get(portNodeId(key)) ?? 0, needed));
  }
  return widths;
}

/** Spreads the stems of a node side evenly (ordered by where they go, so they do not cross) across its width. */
function assignPortOffsets(groups: Map<string, PortEntry[]>, placed: PositionedNode[]): EdgeEndOffsets {
  const out: EdgeEndOffsets = new Map();
  for (const [key, entries] of groups) {
    const node = nodeById(placed, portNodeId(key))!;
    const sorted = [...entries].sort((a, b) => a.otherX - b.otherX);
    const n = sorted.length;
    const step = n > 1 ? Math.min(portStep(sorted), (node.width - 12) / (n - 1)) : 0;
    sorted.forEach((p, i) => {
      const offset = (i - (n - 1) / 2) * step;
      const cur = out.get(p.edgeId) ?? {};
      out.set(p.edgeId, p.end === 'source' ? { ...cur, sourceOffset: offset } : { ...cur, targetOffset: offset });
    });
  }
  return out;
}

/** Candidate spots for a multiplicity label at one end of a route: beside the stem (right, then left), then further along it. */
function endLabelCandidates(points: readonly Pt[], atStart: boolean): EdgeLabelPoint[] {
  const pts = simplify(points);
  const p = atStart ? pts[0] : pts[pts.length - 1];
  const q = atStart ? pts[1] : pts[pts.length - 2];
  if (!q) return [{ x: p.x + 6, y: p.y - 4, anchor: 'start' }];
  if (Math.abs(p.x - q.x) < 0.5) {
    const dir = Math.sign(q.y - p.y) || 1;
    const out: EdgeLabelPoint[] = [];
    for (const d of dir > 0 ? [11, 21] : [-4, -14]) {
      out.push({ x: p.x + 6, y: p.y + d, anchor: 'start' }, { x: p.x - 6, y: p.y + d, anchor: 'end' });
    }
    return out;
  }
  const dir = Math.sign(q.x - p.x);
  return [-4, 11].map(dy => ({ x: p.x + dir * 4, y: p.y + dy, anchor: dir > 0 ? 'start' as const : 'end' as const }));
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
  const relMap = new Map(source.relationships.map(r => [r.id, r]));
  const multiplicityTexts = new Map(edges.map(e => {
    const rel = relMap.get(e.id);
    const sourceRole = (rel as any)?.sourceRole ? `+${(rel as any).sourceRole} ` : '';
    const targetRole = (rel as any)?.targetRole ? `+${(rel as any).targetRole} ` : '';
    return [e.id, {
      source: `${sourceRole}${rel?.sourceMultiplicity ?? ''}`.trim(),
      target: `${targetRole}${rel?.targetMultiplicity ?? ''}`.trim(),
    }];
  }));
  const sizeNodes = (page: BlockData[], minWidths: ReadonlyMap<string, number>) => new Map(page.map(b => {
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
    ], isReq ? 'req' : 'bdd', Math.max(96, minWidths.get(b.id) ?? 0))];
  }));
  const renderPage = (page: BlockData[], viewNote: string): string => {
    // Layout twice: the first pass tells which nodes fan out many edges, the second gives those nodes room for one
    // stem (and one multiplicity label) per edge.
    let sized = sizeNodes(page, new Map());
    let laid = layoutPage(page, sized, edges, undefined, true, PORTRAIT_ROW_WIDTH);
    const wider = fanWidths(collectPorts(laid.placed, laid.edges, multiplicityTexts));
    if (wider.size > 0) {
      sized = sizeNodes(page, wider);
      laid = layoutPage(page, sized, edges, undefined, true, PORTRAIT_ROW_WIDTH);
    }
    const { edges: pageEdges, placed } = laid;
    const portOffsets = assignPortOffsets(collectPorts(placed, pageEdges, multiplicityTexts), placed);
    const offsets = parallelEdgeOffsets(pageEdges);
    const routes = pageEdges.map(e => {
      const src = nodeById(placed, e.sourceId)!;
      const tgt = nodeById(placed, e.targetId)!;
      const route = { direction: 'TB' as const, offset: parallelOffsetFor(offsets, e.id), obstacles: placed, ...(portOffsets.get(e.id) ?? {}) };
      return { e, src, tgt, route, points: src === tgt ? [] : routeEdgePoints(src, tgt, route) };
    });
    // Multiplicity labels first (they sit at the node sides), each at its own free spot beside its edge end;
    // edge labels then avoid nodes and every label placed so far.
    const taken: Box[] = [];
    const mults = new Map<string, { source?: EdgeLabelPoint; target?: EdgeLabelPoint }>();
    const placeMultiplicity = (text: string, candidates: EdgeLabelPoint[]) => {
      if (!text) return undefined;
      const at = pickLabelPoint(candidates, text, placed, taken);
      taken.push(textBox(at.x, at.y, text, 9, at.anchor ?? 'start'));
      return at;
    };
    for (const { e, src, tgt, points } of routes) {
      const t = multiplicityTexts.get(e.id)!;
      mults.set(e.id, src === tgt
        ? {
          source: placeMultiplicity(t.source, [{ x: src.x + src.width - 4, y: src.y - 6, anchor: 'start' }]),
          target: placeMultiplicity(t.target, [{ x: tgt.x + 4, y: tgt.y - 6, anchor: 'start' }]),
        }
        : { source: placeMultiplicity(t.source, endLabelCandidates(points, true)), target: placeMultiplicity(t.target, endLabelCandidates(points, false)) });
    }
    const edgeEls = routes.map(({ e, src, tgt, route, points }) => {
      let at: EdgeLabelPoint | undefined;
      if (e.label) {
        at = src === tgt
          ? routeEdgeLabelPoint(src, tgt, route)
          : pickLabelPoint(edgeLabelCandidates(points), e.label, placed, taken);
        taken.push(textBox(at.x, at.y, e.label, 9, at.anchor ?? 'middle'));
      }
      const m = mults.get(e.id) ?? {};
      const t = multiplicityTexts.get(e.id)!;
      return drawStyledEdge(e, routeEdgePath(src, tgt, route), at)
        + (m.source ? multiplicityLabel(t.source, m.source) : '')
        + (m.target ? multiplicityLabel(t.target, m.target) : '');
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
    const omitted = omittedForPage(scopeConnections, new Set(page.map(n => n.id)), nodeIds, nameOf);
    return wrapFigure(inner, `Block definition diagram${viewNote} (${page.length} blocks, ${pageEdges.length} relationships)`, boundsOf(placed, 24),
      { drawnNodes: page.length, drawnEdges: pageEdges.length, omitted });
  };
  const pages = splitToPageBudget(connectionPages(allNodes, edges), edges, page => renderPage(page, ''));
  return pages.map((page, pageIndex) => renderPage(page, pages.length > 1 ? ` · view ${pageIndex + 1} of ${pages.length}` : '')).join('\n');
}

export interface ReportIbdSource {
  contextBlock: BlockData;
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
interface UsedHorizontal { y: number; x1: number; x2: number }

/** Optional routing aids: extra horizontal channels / vertical lanes, port labels to keep clear, and horizontal runs already taken. */
export interface IbdRouteAids {
  /** Extra horizontal channel y positions (e.g. the gaps between rows of parts). */
  ys?: readonly number[];
  /** Extra vertical lane x positions (e.g. the free middle of a gap between two columns). */
  xs?: readonly number[];
  /** Port label boxes a route should not run through. */
  labels?: readonly Box[];
  usedHorizontal?: UsedHorizontal[];
}

/**
 * Orthogonal route between two horizontal-facing ends. Candidates are Z routes through free vertical lanes and
 * routes through a channel above / below / between the parts; one that crosses no part wins, preferring short, straight
 * routes whose runs do not sit on another connector's or on a port label.
 */
export function routeIbdConnector(
  from: IbdEnd, to: IbdEnd, parts: readonly DiagramRect[], channels: { top: number; bottom: number }, used: UsedVertical[],
  aids: IbdRouteAids = {},
): Pt[] {
  const start = { x: from.x, y: from.y };
  const end = { x: to.x, y: to.y };
  const p1 = { x: from.x + from.dir * IBD_STUB, y: from.y };
  const q1 = { x: to.x + to.dir * IBD_STUB, y: to.y };
  const labelBoxes = aids.labels ?? [];
  const usedH = aids.usedHorizontal ?? (aids.usedHorizontal = []);

  // A search over the grid of useful lines: lanes beside every part, the free middle of gaps, channels between rows.
  const xSet = new Set<number>([p1.x, q1.x, Math.round((p1.x + q1.x) / 2), ...(aids.xs ?? []).map(Math.round)]);
  const ySet = new Set<number>([p1.y, q1.y, channels.top, channels.bottom, ...(aids.ys ?? [])]);
  for (const o of parts) {
    for (const d of [12, 19]) { xSet.add(o.x - d); xSet.add(o.x + o.width + d); }
    ySet.add(o.y - 10); ySet.add(o.y + o.height + 10);
  }
  const X = [...xSet].sort((m, n) => m - n);
  const Y = [...ySet].sort((m, n) => m - n);
  const nx = X.length;
  const ny = Y.length;
  const segCost = (a: Pt, b: Pt): number => {
    if (parts.some(o => segmentCrossesBox(a, b, o, 1))) return Infinity;
    let cost = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    if (labelBoxes.some(o => segmentCrossesBox(a, b, o, 0))) cost += 150;
    if (a.x === b.x) {
      const lo = Math.min(a.y, b.y);
      const hi = Math.max(a.y, b.y);
      if (used.some(u => Math.abs(u.x - a.x) < 5 && lo < u.y2 && u.y1 < hi)) cost += 150;
      if (usedH.some(u => u.y > lo && u.y < hi && a.x > u.x1 && a.x < u.x2)) cost += 10;
    } else {
      const lo = Math.min(a.x, b.x);
      const hi = Math.max(a.x, b.x);
      if (usedH.some(u => Math.abs(u.y - a.y) < 5 && lo < u.x2 && u.x1 < hi)) cost += 150;
      if (used.some(u => u.x > lo && u.x < hi && a.y > u.y1 && a.y < u.y2)) cost += 10;
    }
    return cost;
  };
  const idx = (i: number, j: number, d: number) => (i * ny + j) * 2 + d;
  const dist = new Float64Array(nx * ny * 2).fill(Infinity);
  const prev = new Int32Array(nx * ny * 2).fill(-1);
  const heap: [number, number][] = [];
  const push = (cost: number, node: number) => {
    heap.push([cost, node]);
    let k = heap.length - 1;
    while (k > 0) { const par = (k - 1) >> 1; if (heap[par][0] <= heap[k][0]) break; [heap[par], heap[k]] = [heap[k], heap[par]]; k = par; }
  };
  const pop = (): [number, number] => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1; const r = l + 1; let m = k;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k], heap[m]]; k = m;
      }
    }
    return top;
  };
  const si = X.indexOf(p1.x);
  const sj = Y.indexOf(p1.y);
  const ti = X.indexOf(q1.x);
  const tj = Y.indexOf(q1.y);
  const TURN = 24;
  dist[idx(si, sj, 0)] = 0;
  push(0, idx(si, sj, 0));
  let goal = -1;
  while (heap.length > 0) {
    const [cost, node] = pop();
    if (cost > dist[node]) continue;
    const d = node & 1;
    const cell = node >> 1;
    const i = Math.floor(cell / ny);
    const j = cell % ny;
    if (i === ti && j === tj) { goal = node; break; }
    const moves: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [di, dj] of moves) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) continue;
      const nd = di !== 0 ? 0 : 1;
      if (i === si && j === sj && di === -from.dir && dj === 0 && cost === 0) continue;
      const a = { x: X[i], y: Y[j] };
      const b = { x: X[ni], y: Y[nj] };
      let c = segCost(a, b);
      if (!Number.isFinite(c)) continue;
      if (nd !== d) c += TURN;
      if (ni === ti && nj === tj && nd === 1) c += TURN;
      const total = cost + c;
      const to2 = idx(ni, nj, nd);
      if (total < dist[to2]) { dist[to2] = total; prev[to2] = node; push(total, to2); }
    }
  }
  let chosen: Pt[];
  if (goal >= 0) {
    const path: Pt[] = [];
    for (let node = goal; node >= 0; node = prev[node]) {
      const cell = node >> 1;
      path.push({ x: X[Math.floor(cell / ny)], y: Y[cell % ny] });
    }
    path.reverse();
    chosen = dropCollinear([start, p1, ...path, q1, end]);
  } else {
    chosen = dropCollinear([start, p1, { x: p1.x, y: channels.bottom }, { x: q1.x, y: channels.bottom }, q1, end]);
  }
  for (let i = 1; i < chosen.length; i++) {
    if (chosen[i].x === chosen[i - 1].x) used.push({ x: chosen[i].x, y1: Math.min(chosen[i].y, chosen[i - 1].y), y2: Math.max(chosen[i].y, chosen[i - 1].y) });
    else if (chosen[i].y === chosen[i - 1].y) usedH.push({ y: chosen[i].y, x1: Math.min(chosen[i].x, chosen[i - 1].x), x2: Math.max(chosen[i].x, chosen[i - 1].x) });
  }
  return chosen;
}

/** Removes duplicate and collinear interior points so a straight route is one run. */
function dropCollinear(points: Pt[]): Pt[] {
  const pts = simplify(points);
  return pts.filter((p, i) => {
    if (i === 0 || i === pts.length - 1) return true;
    const a = pts[i - 1];
    const b = pts[i + 1];
    return !((a.x === p.x && p.x === b.x) || (a.y === p.y && p.y === b.y));
  });
}

/** Longest a part-box text line gets before it wraps onto the next line (keeps parts narrow). */
const IBD_NAME_WRAP = 24;
/** Target width of the whole figure so it prints legibly on a portrait page. */
const IBD_FIGURE_WIDTH = 630;
const IBD_BAND_GAP = 36;
const IBD_MAX_COLUMN_HEIGHT = 420;

/** Wraps a part / type name at spaces, separators and camelCase humps; hard-cuts only when nothing else fits. */
function wrapIbdText(text: string, max = IBD_NAME_WRAP): string[] {
  const out: string[] = [];
  let rest = text.trim();
  while (rest.length > max) {
    const win = rest.slice(0, max + 1);
    let cut = win.lastIndexOf(' ');
    if (cut < 8) {
      cut = -1;
      for (let i = max; i > 8; i--) {
        if ('_:-.'.includes(win[i - 1]) || (/[a-z0-9]/.test(win[i - 1]) && /[A-Z]/.test(win[i]))) { cut = i; break; }
      }
    }
    if (cut < 0) cut = max;
    out.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  out.push(rest);
  return out;
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
  // Names wrap onto extra lines instead of widening the box.
  const portsOf = (part: PartData) => (part.typeId ? blockById.get(part.typeId)?.ports ?? [] : []);
  const sized = new Map(source.parts.map(part => {
    const typeName = part.typeId ? blockById.get(part.typeId)?.name : undefined;
    const node = measureNode(part.id,
      [...wrapIbdText(`${part.name}${typeName ? `: ${typeName}` : ''}`), part.multiplicity ? `[${part.multiplicity}]` : ''], 'ibd', 110);
    const slots = Math.max(0, portsOf(part).length);
    return [part.id, { ...node, height: Math.max(node.height, 16 + slots * IBD_PORT_PITCH) }];
  }));
  const connectorLabelWidth = (c: ConnectorData) => textWidth(connectorLabel(c), IBD_LABEL_SIZE);

  // Boundary (context) ports sit on the frame; their labels need a gutter on that side.
  const envPorts = source.contextBlock.ports ?? [];
  const envSide = (port: (typeof envPorts)[number]): IbdSide => port.side === 'right' ? 'right' : port.side === 'left' ? 'left' : port.direction === 'out' ? 'right' : 'left';
  const labelWidthOn = (side: IbdSide) => Math.max(0, ...envPorts.filter(p => envSide(p) === side).map(p => textWidth(p.name, IBD_LABEL_SIZE)));
  const leftGutter = labelWidthOn('left') > 0 ? labelWidthOn('left') + IBD_BOUNDARY_GUTTER_EXTRA : 0;
  const rightGutter = labelWidthOn('right') > 0 ? labelWidthOn('right') + IBD_BOUNDARY_GUTTER_EXTRA : 0;

  // Columns: ranks of the connected parts (left to right); unconnected parts are one column each and wrap into rows.
  const partEdges = validConnectors
    .filter(c => contextPartIds.has(c.sourcePartId) && contextPartIds.has(c.targetPartId) && c.sourcePartId !== c.targetPartId)
    .map(c => ({ sourceId: c.sourcePartId, targetId: c.targetPartId }));
  let columns: string[][];
  if (partEdges.length > 0) {
    const ranked = layoutLayered([...sized.values()], partEdges, { direction: 'LR', hGap: 40, vGap: 36 });
    const xs = [...new Set(ranked.map(r => r.x))].sort((p, q) => p - q);
    columns = xs.map(x => ranked.filter(r => r.x === x).sort((p, q) => p.y - q.y).map(r => r.id));
  } else {
    columns = source.parts.map(p => [p.id]);
  }
  // A column taller than a page share is split into side-by-side columns so the figure stays compact.
  columns = columns.flatMap(col => {
    const total = col.reduce((sum, id) => sum + sized.get(id)!.height + 32, -32);
    const pieces = Math.ceil(total / IBD_MAX_COLUMN_HEIGHT);
    if (pieces <= 1) return [col];
    const per = Math.ceil(col.length / pieces);
    return Array.from({ length: Math.ceil(col.length / per) }, (_, k) => col.slice(k * per, (k + 1) * per));
  });
  const colOf = new Map<string, number>();
  columns.forEach((col, ci) => col.forEach(id => colOf.set(id, ci)));
  const colWidth = columns.map(col => Math.max(...col.map(id => sized.get(id)!.width)));
  // Side of each port: in -> left, out -> right, inout (or undeclared) faces the column of the peer it is connected to,
  // an unconnected one goes left. Decided from the columns so the gaps can be sized to the labels that face each other.
  const portSides = new Map<string, Map<string, IbdSide>>();
  for (const part of source.parts) {
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
      const peerPart = validConnectors.map(c => c.sourcePartId === part.id && c.sourcePortId === port.id ? c.targetPartId
        : c.targetPartId === part.id && c.targetPortId === port.id ? c.sourcePartId : undefined).find(id => id !== undefined && colOf.has(id));
      const peer = peerPart !== undefined ? colOf.get(peerPart) : undefined;
      const own = colOf.get(part.id)!;
      const side: IbdSide = peer !== undefined && peer !== own ? (peer < own ? 'left' : 'right')
        : peer !== undefined ? (counts.left <= counts.right ? 'left' : 'right') : 'left';
      sides.set(port.id, side);
      counts[side]++;
    }
    portSides.set(part.id, sides);
  }
  const partsById = new Map(source.parts.map(p => [p.id, p]));
  const sideLabelWidth = (ids: readonly string[], side: IbdSide) => Math.max(0, ...ids.flatMap(id => portsOf(partsById.get(id)!)
    .filter(port => portSides.get(id)!.get(port.id) === side).map(port => textWidth(port.name, IBD_LABEL_SIZE))));
  // The gap after a column holds the port labels facing each other plus the widest connector label crossing it.
  const facingAfter: number[] = [];
  const gapAfter = columns.map((col, ci) => {
    if (ci === columns.length - 1) { facingAfter.push(0); return 0; }
    const flows = validConnectors.filter(c => {
      const a = colOf.get(c.sourcePartId);
      const b = colOf.get(c.targetPartId);
      return a !== undefined && b !== undefined && Math.min(a, b) === ci && Math.max(a, b) === ci + 1;
    });
    const flow = Math.min(90, Math.max(0, ...flows.map(connectorLabelWidth)));
    const labels = sideLabelWidth(col, 'right') + sideLabelWidth(columns[ci + 1], 'left');
    facingAfter.push(labels);
    return Math.min(300, Math.max(56, labels + 32 + flow));
  });
  // Bands: consecutive columns share a row of parts until the figure width budget is used, then the next row starts.
  const budget = Math.max(260, IBD_FIGURE_WIDTH - 2 * IBD_FRAME_PADDING - leftGutter - rightGutter - sideLabelWidth(source.parts.map(p => p.id), 'left') + sideLabelWidth(source.parts.map(p => p.id), 'right') + 28);
  const bands: number[][] = [];
  let bandWidth = 0;
  columns.forEach((_, ci) => {
    const w = colWidth[ci];
    const last = bands[bands.length - 1];
    if (last && bandWidth + gapAfter[last[last.length - 1]] + w <= budget) { bandWidth += gapAfter[last[last.length - 1]] + w; last.push(ci); }
    else { bands.push([ci]); bandWidth = w; }
  });
  const partConnectorCount = validConnectors.filter(c => contextPartIds.has(c.sourcePartId) && contextPartIds.has(c.targetPartId)).length;
  const bandGap = Math.min(96, IBD_BAND_GAP + 6 * partConnectorCount);
  const placed: PositionedNode[] = [];
  const bandRows: { y: number; height: number }[] = [];
  const laneXs: number[] = [];
  let bandY = 0;
  for (const band of bands) {
    const heights = band.map(ci => columns[ci].reduce((sum, id) => sum + sized.get(id)!.height, 0) + 32 * (columns[ci].length - 1));
    const tallest = Math.max(...heights);
    let x = 0;
    band.forEach((ci, k) => {
      let y = bandY + (tallest - heights[k]) / 2;
      for (const id of columns[ci]) {
        const n = sized.get(id)!;
        placed.push({ id, x, y, width: n.width, height: n.height });
        y += n.height + 32;
      }
      const gap = k < band.length - 1 ? gapAfter[ci] : 0;
      if (gap > 0) {
        const free = Math.max(0, gap - facingAfter[ci] - 8);
        const mid = x + colWidth[ci] + gap / 2;
        for (let d = 0; d <= free / 2 - 2; d += 7) { laneXs.push(mid + d); if (d > 0) laneXs.push(mid - d); }
      }
      x += colWidth[ci] + gap;
    });
    bandRows.push({ y: bandY, height: tallest });
    bandY += tallest + bandGap;
  }
  const placedById = new Map(placed.map(p => [p.id, p]));

  const portEnds = new Map<string, IbdEnd>();
  const portEls: string[] = [];
  const reserved: Box[] = placed.map(p => ({ x: p.x, y: p.y, width: p.width, height: p.height }));
  const areaRects: Box[] = [...reserved];
  for (const part of source.parts) {
    const rect = placedById.get(part.id);
    if (!rect) continue;
    portEnds.set(`${part.id}:__center`, { x: rect.x + rect.width, y: rect.y + rect.height / 2, dir: 1, name: '' });
    const ports = portsOf(part);
    const sides = portSides.get(part.id)!;
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
  // Channels: the gaps between rows of parts, several lanes each, plus extra lanes above and below everything.
  const channelYs: number[] = [];
  const laneCount = Math.max(1, Math.floor((bandGap - 14) / 14));
  bandRows.slice(0, -1).forEach(row => {
    const mid = row.y + row.height + bandGap / 2;
    for (let k = 0; k < laneCount; k++) channelYs.push(mid + (k % 2 === 0 ? 1 : -1) * Math.ceil(k / 2) * 7);
  });
  for (let k = 1; k <= 3; k++) channelYs.push(channels.top - 7 * k, channels.bottom + 7 * k);
  const outerXs = [area.x - 7, area.x - 14, area.x + area.width + 7, area.x + area.width + 14];
  const aids: IbdRouteAids = { ys: channelYs, xs: [...laneXs, ...outerXs], labels: reserved.slice(placed.length), usedHorizontal: [] };
  const routes = drawn.map(({ conn, from, to }) => ({ conn, points: routeIbdConnector(from, to, partRects, channels, used, aids) }));
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
      for (const run of runs) {
        if (run.length < lw + 6) continue;
        const mid = (run.a.x + run.b.x) / 2;
        const room = (run.length - lw - 6) / 2;
        for (let d = 0; d <= room; d += 8) {
          for (const dx of d === 0 ? [0] : [d, -d]) candidates.push({ x: mid + dx, y: run.a.y - 4 }, { x: mid + dx, y: run.a.y + 12 });
        }
      }
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
    + `<text x="${fx0 + 8}" y="${fy0 + 16}" font-size="11" font-weight="600" fill="${TEXT_COLOR}">ibd [Block] ${escapeHtml(source.contextBlock.name)}</text>`;
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

type SmEdgeClass = 'self' | 'forward' | 'sameColumn' | 'around' | 'parent' | 'routed';
interface SmPlanned { t: TransitionData; src: DiagramRect; tgt: DiagramRect; cls: SmEdgeClass; label: string }

/** First free interval row of a channel list: rows are bands stacked away from the diagram, each holding disjoint x intervals. */
function allocChannel(levels: [number, number][][], x1: number, x2: number): number {
  for (let i = 0; ; i++) {
    const row = (levels[i] ??= []);
    if (!row.some(([a, b]) => x1 < b && a < x2)) { row.push([x1, x2]); return i; }
  }
}

/** Folded (top-down) layout: a rank wider than this wraps onto a further row. */
const SM_FOLD_ROW_WIDTH = 520;

/** How well a rendered figure fits its page: 2 legible on a portrait page, 1 legible on a landscape page, 0 illegible. */
function smFigureFit(figure: string): { rank: number; scale: number } | undefined {
  const vb = /viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/.exec(figure);
  const font = /data-min-font="([\d.]+)"/.exec(figure);
  if (!vb || !font) return undefined;
  const fit = figurePageFit({ width: Number(vb[3]), height: Number(vb[4]) }, Number(font[1]));
  return { rank: fit.legible ? (fit.orientation === 'portrait' ? 2 : 1) : 0, scale: fit.scale };
}

/**
 * Left-to-right layout first (the compact, familiar picture). When that cannot be printed legibly on a portrait page
 * the layer is laid out top-down instead, wrapping wide ranks, and the better fitting of the two is used.
 */
function renderStateMachineLayer(layer: Layer, source: ReportStateMachineSource, view?: StateMachineView, extraOmitted: { id: string; reason: string }[] = []): string {
  const natural = renderStateMachineLayerCore(layer, source, view, extraOmitted, false);
  const naturalFit = smFigureFit(natural);
  if (!naturalFit || naturalFit.rank === 2) return natural;
  const folded = renderStateMachineLayerCore(layer, source, view, extraOmitted, true);
  const foldedFit = smFigureFit(folded);
  if (!foldedFit) return natural;
  return foldedFit.rank > naturalFit.rank || (foldedFit.rank === naturalFit.rank && foldedFit.scale > naturalFit.scale) ? folded : natural;
}

function renderStateMachineLayerCore(layer: Layer, source: ReportStateMachineSource, view: StateMachineView | undefined, extraOmitted: { id: string; reason: string }[], folded: boolean): string {
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
  const leafPlaced = folded
    ? layoutLayered([...sized.values()], layoutEdges, { rootIds: roots, direction: 'TB', hGap: 56, vGap: 72, maxRowWidth: SM_FOLD_ROW_WIDTH })
    : layoutLayered([...sized.values()], layoutEdges, { rootIds: roots, vGap: 52 });
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
        : folded ? 'routed'
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

  // --- folded layout: ports on the state sides and orthogonal routes around every state --------------------
  type SmSide = 'top' | 'bottom' | 'left' | 'right';
  const SIDE_DIR: Record<SmSide, number> = { right: 0, bottom: 1, left: 2, top: 3 };
  const routedPts = new Map<string, Pt[]>();
  const foldedStubs: { stub: (typeof stubs)[number]; rect: DiagramRect; label: string; pts: Pt[] }[] = [];
  const deferredEdges: { into: string[]; index: number; edge: DiagramEdgeInput; pts: Pt[]; text: string }[] = [];
  const allRoutes: Pt[][] = [];
  let foldedPsCy: number | undefined;
  if (folded) {
    const loopNodes = new Map<string, number>();
    for (const p of planned) if (p.cls === 'self') loopNodes.set(p.t.sourceId, (loopNodes.get(p.t.sourceId) ?? 0) + 1);
    const ports = new Map<string, { key: string; order: number }[]>();
    const addPort = (id: string, side: SmSide, key: string, order: number) => {
      const k = `${id}|${side}`;
      ports.set(k, [...(ports.get(k) ?? []), { key, order }]);
    };
    const isVertical = (side: SmSide) => side === 'top' || side === 'bottom';
    const sidesFor = (src: DiagramRect, tgt: DiagramRect): [SmSide, SmSide] => {
      if (tgt.y >= src.y + src.height + 8) return ['bottom', 'top'];
      if (tgt.y + tgt.height <= src.y - 8) return ['top', 'bottom'];
      return tgt.x + tgt.width / 2 >= src.x + src.width / 2 ? ['right', 'left'] : ['left', 'right'];
    };
    const mid = (r: DiagramRect, side: SmSide) => (isVertical(side) ? r.x + r.width / 2 : r.y + r.height / 2);
    const routed = planned.filter(p => p.cls === 'routed');
    const sideMap = new Map<string, [SmSide, SmSide]>();
    for (const p of routed) {
      const [a, b] = sidesFor(p.src, p.tgt);
      sideMap.set(p.t.id, [a, b]);
      addPort(p.t.sourceId, a, `${p.t.id}:s`, mid(p.tgt, a));
      addPort(p.t.targetId, b, `${p.t.id}:t`, mid(p.src, b));
    }
    // off-view connectors: a labelled stub in a gutter left or right of the whole diagram
    const nodesBox = boundsOf(allPlaced, 0);
    const leftLimit = Math.min(nodesBox.x, asRect ? asRect.x - 50 : Infinity);
    for (const outgoing of [true, false]) {
      let lastBottom = -Infinity;
      for (const stub of stubs.filter(q => q.outgoing === outgoing).sort((a, b) => a.local.y - b.local.y)) {
        const label = `${outgoing ? '→ ' : '← '}${stub.text}`;
        const width = Math.max(90, Math.ceil(label.length * 6 + 16));
        const y = Math.max(stub.local.y + stub.local.height / 2 - STUB_HEIGHT / 2, lastBottom + STUB_GAP);
        lastBottom = y + STUB_HEIGHT;
        const rect: DiagramRect = { x: outgoing ? nodesBox.x + nodesBox.width + 48 : leftLimit - 48 - width, y, width, height: STUB_HEIGHT };
        foldedStubs.push({ stub, rect, label, pts: [] });
        addPort(outgoing ? stub.t.sourceId : stub.t.targetId, outgoing ? 'right' : 'left', `${stub.t.id}:stub`, y + STUB_HEIGHT / 2);
        allPlaced.push(rect);
        labelBoxes.push(rect);
      }
    }
    const phantomOn = (id: string, side: SmSide) => (side === 'left' && autostartState?.id === id && asRect ? 1 : 0);
    const portAt = (id: string, rect: DiagramRect, side: SmSide, key: string): Pt => {
      const list = [...(ports.get(`${id}|${side}`) ?? [])].sort((a, b) => a.order - b.order);
      const index = list.findIndex(e => e.key === key);
      const phantom = phantomOn(id, side);
      let frac = (index + phantom + 1) / (list.length + phantom + 1);
      if (side === 'top' && loopNodes.has(id)) frac = index % 2 === 0 ? 0.1 + 0.06 * (index / 2) : 0.9 - 0.06 * ((index - 1) / 2);
      return isVertical(side)
        ? { x: rect.x + rect.width * frac, y: side === 'top' ? rect.y : rect.y + rect.height }
        : { x: side === 'left' ? rect.x : rect.x + rect.width, y: rect.y + rect.height * frac };
    };
    const away = (pt: Pt, side: SmSide, by = 12): Pt => ({ x: pt.x + [by, 0, -by, 0][SIDE_DIR[side]], y: pt.y + [0, by, 0, -by][SIDE_DIR[side]] });
    if (autostartState && asRect) foldedPsCy = slotY(asRect, 0, (ports.get(`${autostartState.id}|left`)?.length ?? 0) + 1);

    const router = new OrthogonalRouter(leafRects.map(r => ({ x: r.x, y: r.y, width: r.width, height: r.height })));
    for (const [id, count] of loopNodes) {
      const r = rectOf(id)!;
      const w = Math.max(28, r.width * 0.5);
      const lift = 30 + (count - 1) * 16;
      router.addObstacle({ x: r.x + r.width / 2 - w / 2, y: r.y - lift - 4, width: w, height: lift + 4, inflate: 3 });
    }
    if (asRect && foldedPsCy !== undefined) {
      router.addObstacle({ x: asRect.x - 50, y: foldedPsCy - 1, width: 50, height: 2, inflate: 3 });
      router.addObstacle({ x: asRect.x - 50, y: foldedPsCy - 7, width: 14, height: 14, inflate: 3 });
    }
    for (const fs of foldedStubs) router.addObstacle(fs.rect);
    const span = (p: SmPlanned) => Math.abs(centreY(p.src) - centreY(p.tgt)) + Math.abs(p.src.x - p.tgt.x);
    for (const p of [...routed].sort((a, b) => span(a) - span(b))) {
      const [a, b] = sideMap.get(p.t.id)!;
      const from = portAt(p.t.sourceId, p.src, a, `${p.t.id}:s`);
      const to = portAt(p.t.targetId, p.tgt, b, `${p.t.id}:t`);
      routedPts.set(p.t.id, removeCollinear([from, ...router.route(away(from, a), away(to, b), SIDE_DIR[a]), to]));
    }
    for (const fs of foldedStubs) {
      const outgoing = fs.stub.outgoing;
      const side: SmSide = outgoing ? 'right' : 'left';
      const localId = outgoing ? fs.stub.t.sourceId : fs.stub.t.targetId;
      const from = portAt(localId, fs.stub.local, side, `${fs.stub.t.id}:stub`);
      const cy = fs.rect.y + fs.rect.height / 2;
      const end: Pt = { x: outgoing ? fs.rect.x : fs.rect.x + fs.rect.width, y: cy };
      const route = removeCollinear([from, ...router.route(away(from, side), away(end, outgoing ? 'left' : 'right'), SIDE_DIR[side]), end]);
      fs.pts = outgoing ? route : [...route].reverse();
    }
    allRoutes.push(...routedPts.values(), ...foldedStubs.map(f => f.pts));
  }

  // A label for a folded route: beside or above one of its runs, clear of states, other labels and every route.
  const placeRoutedLabel = (pts: Pt[], text: string): EdgeLabelPoint => {
    const candidates = edgeLabelCandidates(pts);
    for (const c of candidates) {
      const box = textBox(c.x, c.y, text, SM_LABEL_SIZE, c.anchor ?? 'middle');
      const padded = { x: box.x - 1.5, y: box.y - 1.5, width: box.width + 3, height: box.height + 3 };
      if (labelBoxes.some(b => boxesIntersect(b, padded)) || leafRects.some(r => boxesIntersect(r, padded))
        || allRoutes.some(r => polylineCrossesBox(r, padded, 0))) continue;
      labelBoxes.push(box);
      return c;
    }
    return placeLabel(candidates[0], text);
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
    if (p.cls === 'routed') {
      deferredEdges.push({ into: edgeEls, index: edgeEls.push('') - 1, edge, pts: routedPts.get(t.id)!, text: label });
      drawnEdges++;
      continue;
    }
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
    const psCy = foldedPsCy ?? slotY(asRect, 0, (ins.get(autostartState.id)?.length ?? 0) + 1);
    initialPseudostateEls = `<circle class="initial-pseudostate" cx="${psX + psSize / 2}" cy="${psCy}" r="${psSize / 2}" fill="#182231" stroke="#182231" stroke-width="1.2"/>`
      + `<path id="edge-initial-${escapeHtml(autostartState.id)}" d="M ${psX + psSize} ${psCy} L ${asRect.x} ${psCy}" fill="none" stroke="${EDGE_STROKE}" stroke-width="1.1" marker-end="url(#rf-arrow)"/>`;
    allPlaced.push({ x: psX, y: psCy - psSize / 2, width: psSize, height: psSize });
  }

  // Off-view connectors: a labelled stub in a gutter right of (outgoing) or left of (incoming) the diagram.
  // The route runs along the gutters and a channel above the diagram when the straight way would cross a state.
  const stubEls: string[] = [];
  if (folded) {
    for (const fs of foldedStubs) {
      const { rect } = fs;
      const text = shortTransitionLabel(fs.stub.t);
      deferredEdges.push({ into: stubEls, index: stubEls.push('') - 1, edge: { id: fs.stub.t.id, sourceId: fs.stub.t.sourceId, targetId: fs.stub.t.targetId, label: text, kind: 'transition' }, pts: fs.pts, text });
      stubEls.push(`<g class="sm-stub" data-x="${rect.x}" data-y="${rect.y}" data-w="${rect.width}" data-h="${rect.height}"><rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" rx="11" fill="#f4f6f8" stroke="${NODE_STROKE}" stroke-width="1" stroke-dasharray="3 2"/>`
        + `<text x="${rect.x + rect.width / 2}" y="${rect.y + 15}" text-anchor="middle" font-size="10" fill="${TEXT_COLOR}">${escapeHtml(fs.label)}</text></g>`);
      drawnEdges++;
    }
    for (const d of deferredEdges) d.into[d.index] = drawStyledEdge(d.edge, pointsToPath(d.pts), d.text ? placeRoutedLabel(d.pts, d.text) : undefined);
  } else if (stubs.length > 0) {
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
  /** Used to print variable / state names instead of raw ids in the widget binding lines. */
  variables?: readonly { id: string; name?: string }[];
  states?: readonly { id: string; name?: string }[];
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
  const named = (list: readonly { id: string; name?: string }[] | undefined) =>
    Object.fromEntries((list ?? []).filter(item => item.name).map(item => [item.id, item.name as string]));
  const runtime = { variableNames: named(source.variables), stateNames: named(source.states) };
  const els = placed.map(pos => {
    const c = byId.get(pos.id)!;
    return `<g transform="translate(${pos.x},${pos.y})">${renderHmiWidgetSvg({ ...c, width: pos.width, height: pos.height }, {}, runtime)}</g>`;
  });
  return wrapFigure(els.join(''),
    `HMI layout (${source.components.length} components)`, boundsOf(placed, 24));
}
