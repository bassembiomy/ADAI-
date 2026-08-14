import type { BlockData, RelationshipData } from '../../types/sysml_types';
import {
  DiagramEdgeInput, MAX_NODES_PER_FIGURE, SizedNode,
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
