import type { BlockData, ConnectorData, HmiComponent, PartData, RelationshipData } from '../../types/sysml_types';
import type { JunctionData, Layer, StateData, TransitionData } from '../../types/sm_types';
import {
  DiagramEdgeInput, DiagramRect, MAX_NODES_PER_FIGURE, SizedNode,
  boundsOf, chunkItems, escapeHtml, measureNode, rectsOverlap, renderEmptyFigure, wrapFigure,
} from './reportDiagramModel';
import { PositionedNode, layoutGrid, layoutLayered, nodeById, routeEdgePath, routeManhattan } from './reportDiagramLayout';

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
      [r.reqId ?? 'REQ', r.name ?? '', r.status ? `status: ${r.status}` : ''], 'req')]));
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
      `«${b.stereotype ?? 'block'}»`, b.name ?? '',
      ...(b.properties ?? []).slice(0, 3).map(p => `${p.name}: ${p.type}${p.defaultValue ? ` = ${p.defaultValue}` : ''}`),
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

  const leafStates = layerStates.filter(s => !(s.children ?? []).some(c => layerIds.has(c)));
  const sized = new Map<string, SizedNode>();
  for (const s of leafStates) sized.set(s.id, measureNode(s.id, stateLines(s), 'state', 96));
  for (const j of layerJunctions) sized.set(j.id, { id: j.id, lines: [], width: JUNCTION_SIZE, height: JUNCTION_SIZE, kind: 'junction' });

  const roots = leafStates.filter(s => s.autostart).map(s => s.id);
  const edges: DiagramEdgeInput[] = layerTransitions.map(t => ({
    id: t.id, sourceId: t.sourceId, targetId: t.targetId, label: transitionLabel(t), kind: 'transition',
  }));
  const leafPlaced = layoutLayered([...sized.values()], edges, { rootIds: roots });
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
