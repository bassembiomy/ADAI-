import type { SysmlRepository } from '../../engine/sysml/model';
import { resolveDiagramPresentation, type DiagramPresentation } from '../../engine/sysml/presentationState';
import { getRequirementsDiagramScope } from '../../engine/sysml/requirementsDiagramScope';
import { computeBlockDisplayBounds } from '../../components/sysml/blockLayout';
import type { BlockData, RelationshipData } from '../../types/sysml_types';
import { diagramFrameLabel } from '../sysml/diagramFrame';
import { requirementStatusColor } from '../sysml/requirementStatus';
import { sysmlObjectLabel } from '../sysml/sysmlDisplayLabel';
import { DiagramRect, boundsOf, escapeHtml, wrapFigure } from './reportDiagramModel';
import { PositionedNode, layoutLayered, parallelEdgeOffsets } from './reportDiagramLayout';
import { hierarchyRankEdge, renderRequirementsDiagram } from './reportDiagrams';
import { formatLegacyProperty } from '../../services/sysmlPropertyRules';

/**
 * Requirement diagrams as the user drew them (SysML 1.6 §16, Cameo practice): one figure per Requirement
 * diagram of the model, showing exactly the elements presented on it, at their canvas positions, inside the
 * diagram frame `req [Package] Owner [Diagram]`. Every requirement box links to its specification entry.
 */

export interface RequirementDiagramSource {
  repository: SysmlRepository;
  blocks: readonly BlockData[];
  relationships: readonly RelationshipData[];
  /** Per-diagram presentation records (element list and bounds) as saved by the editor. */
  presentations?: Record<string, DiagramPresentation>;
  /** In-document link of an element (requirement specification, block section), when it has one. */
  hrefFor?: (elementId: string) => string | undefined;
}

export interface RequirementDiagramView {
  diagramId: string;
  name: string;
  frameLabel: string;
  /** Elements drawn on this view (requirements and the elements they relate to). */
  elementIds: string[];
  html: string;
}

const NODE_STROKE = '#0b3445';
const REQ_STROKE = '#c2410c';
const REQ_FILL = '#fff7ed';
const BLOCK_FILL = '#f8fafc';
const EDGE = '#546e7a';
const TEXT = '#182231';
const META = '#64748b';
const FRAME_PAD = 28;
const FRAME_HEADER = 24;
const CHAR_W = 5.6;

/** SysML 1.6 keyword of a requirement relationship as Cameo shows it on the path. */
const KEYWORD: Record<string, string> = {
  derive: '«deriveReqt»', deriveReqt: '«deriveReqt»', satisfy: '«satisfy»', verify: '«verify»', refine: '«refine»',
  trace: '«trace»', copy: '«copy»',
};

function isContainment(rel: RelationshipData): boolean {
  return rel.type === 'requirementContainment' || rel.type === 'composition';
}

function wrapText(text: string, width: number, maxLines: number): string[] {
  const perLine = Math.max(8, Math.floor(width / CHAR_W));
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
    .map(word => (word.length > perLine ? `${word.slice(0, perLine - 1)}…` : word));
  const lines: string[] = [];
  let line = '';
  let i = 0;
  for (; i < words.length; i++) {
    const next = line ? `${line} ${words[i]}` : words[i];
    if (next.length <= perLine) { line = next; continue; }
    lines.push(line);
    line = words[i];
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && line) { lines.push(line); i = words.length; }
  if (i < words.length && lines.length > 0) {
    const last = lines[lines.length - 1];
    lines[lines.length - 1] = `${last.length >= perLine ? last.slice(0, perLine - 1) : last}…`;
  }
  return lines;
}

function t(x: number, y: number, text: string, o: { size?: number; weight?: number; fill?: string; anchor?: string; italic?: boolean; mono?: boolean } = {}): string {
  return `<text x="${x}" y="${y}" font-size="${o.size ?? 11}"${o.weight ? ` font-weight="${o.weight}"` : ''}${o.italic ? ' font-style="italic"' : ''}${o.mono ? ' font-family="Consolas,monospace"' : ''} fill="${o.fill ?? TEXT}" text-anchor="${o.anchor ?? 'middle'}">${escapeHtml(text)}</text>`;
}

/** A requirement or related element drawn as the canvas draws it: keyword, name, divider and compartment. */
function drawNode(block: BlockData, rect: DiagramRect, href?: string): string {
  const isReq = block.stereotype === 'requirement';
  const { x, y, width, height } = rect;
  const name = sysmlObjectLabel(block, isReq ? 'Requirement' : 'Block');
  const parts = [
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${isReq ? REQ_FILL : BLOCK_FILL}" stroke="${isReq ? REQ_STROKE : NODE_STROKE}" stroke-width="1.2"/>`,
    t(x + width / 2, y + 14, `«${block.stereotype || 'block'}»`, { size: 9, fill: META }),
    ...wrapText(name, width - 12, 2).map((line, i) => t(x + width / 2, y + 28 + i * 13, line, { size: 11, weight: 700 })),
  ];
  const nameLines = Math.min(2, wrapText(name, width - 12, 2).length);
  const divider = y + 34 + (nameLines - 1) * 13;
  parts.push(`<line x1="${x}" y1="${divider}" x2="${x + width}" y2="${divider}" stroke="${isReq ? REQ_STROKE : NODE_STROKE}" stroke-width="0.8"/>`);
  if (isReq) {
    parts.push(`<circle cx="${x + width - 9}" cy="${y + 9}" r="3.5" fill="${requirementStatusColor(block.status)}"><title>${escapeHtml(block.status || 'draft')}</title></circle>`);
    parts.push(t(x + 6, divider + 13, `Id = "${block.reqId ?? ''}"`, { size: 9.5, weight: 700, fill: REQ_STROKE, anchor: 'start', mono: true }));
    const room = Math.max(1, Math.floor((y + height - divider - 22) / 11.5));
    const text = block.description?.trim() ? `Text = "${block.description.trim()}"` : 'Text = ""';
    wrapText(text, width - 12, room).forEach((line, i) => parts.push(t(x + 6, divider + 27 + i * 11.5, line, { size: 9, fill: TEXT, anchor: 'start' })));
  } else {
    const room = Math.max(0, Math.floor((y + height - divider - 8) / 12));
    const lines = (block.properties ?? []).map(p => `${formatLegacyProperty(p)}${p.defaultValue ? ` = ${p.defaultValue}` : ''}`);
    const shown = lines.length > room ? [...lines.slice(0, Math.max(0, room - 1)), `… ${lines.length - room + 1} more`] : lines;
    shown.forEach((line, i) => parts.push(t(x + 6, divider + 14 + i * 12, wrapText(line, width - 12, 1)[0] ?? '', { size: 9, fill: TEXT, anchor: 'start', mono: true })));
  }
  const geom = `data-node-id="${escapeHtml(block.id)}" data-x="${x}" data-y="${y}" data-w="${width}" data-h="${height}"`;
  const body = parts.join('');
  return href
    ? `<a class="diagram-node req-node" ${geom} href="${escapeHtml(href)}"><title>${escapeHtml(`${block.reqId ? `${block.reqId} ` : ''}${name} — open specification`)}</title>${body}</a>`
    : `<g class="rf-node" ${geom}>${body}</g>`;
}

/** Where the line from the centre of `r` towards `toward` leaves the rectangle. */
function clip(r: DiagramRect, toward: { x: number; y: number }): { x: number; y: number } {
  const cx = r.x + r.width / 2;
  const cy = r.y + r.height / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const sx = dx === 0 ? Infinity : (r.width / 2) / Math.abs(dx);
  const sy = dy === 0 ? Infinity : (r.height / 2) / Math.abs(dy);
  const s = Math.min(sx, sy);
  return { x: Math.round((cx + dx * s) * 10) / 10, y: Math.round((cy + dy * s) * 10) / 10 };
}

function drawEdge(rel: RelationshipData, src: DiagramRect, tgt: DiagramRect, offset: number, index: number): string {
  const sc = { x: src.x + src.width / 2, y: src.y + src.height / 2 };
  const tc = { x: tgt.x + tgt.width / 2, y: tgt.y + tgt.height / 2 };
  const len = Math.hypot(tc.x - sc.x, tc.y - sc.y) || 1;
  const ox = (-(tc.y - sc.y) / len) * offset;
  const oy = ((tc.x - sc.x) / len) * offset;
  const start = clip(src, { x: tc.x + ox, y: tc.y + oy });
  const end = clip(tgt, { x: sc.x + ox, y: sc.y + oy });
  const a = { x: start.x + ox, y: start.y + oy };
  const b = { x: end.x + ox, y: end.y + oy };
  const containment = isContainment(rel);
  const marker = containment ? ' marker-start="url(#requirement-containment-crosshair)"' : ' marker-end="url(#rf-arrow-open)"';
  const dash = containment ? '' : ' stroke-dasharray="5 4"';
  const path = `<path id="edge-req-${index}" d="M ${a.x} ${a.y} L ${b.x} ${b.y}" fill="none" stroke="${EDGE}" stroke-width="1.1"${dash}${marker}/>`;
  const keyword = containment ? '' : (KEYWORD[rel.type] ?? (rel.label?.startsWith('«') ? rel.label : `«${rel.type}»`));
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const label = keyword
    ? `<text class="rf-edge-label" x="${mid.x}" y="${mid.y - 4}" font-size="9" fill="${META}" text-anchor="middle" stroke="#ffffff" stroke-width="3" paint-order="stroke">${escapeHtml(keyword)}</text>`
    : '';
  return path + label;
}

function hasPosition(bounds: { x?: number; y?: number } | undefined): boolean {
  return Number.isFinite(bounds?.x) && Number.isFinite(bounds?.y);
}

/** One figure per Requirement diagram of the repository; empty when the model has none. */
export function renderRequirementDiagramViews(source: RequirementDiagramSource): RequirementDiagramView[] {
  const repo = source.repository;
  const diagrams = Object.values(repo.diagrams ?? {})
    .filter(d => d.diagramKind === 'requirements')
    .sort((a, b) => (a.id === 'adia-default-requirements' ? -1 : b.id === 'adia-default-requirements' ? 1 : a.name.localeCompare(b.name)));
  const blocksById = new Map(source.blocks.map(b => [b.id, b]));
  const views: RequirementDiagramView[] = [];

  const presentedOf = (diagramId: string): string[] =>
    (resolveDiagramPresentation(diagramId, source.presentations ?? {})?.elementIds ?? []).filter(id => blocksById.has(id));
  const othersHaveContent = (diagramId: string) => diagrams.some(d => d.id !== diagramId && presentedOf(d.id).length > 0);

  for (const diagram of diagrams) {
    const presentation = resolveDiagramPresentation(diagram.id, source.presentations ?? {});
    const presented = presentedOf(diagram.id);
    if (presented.length === 0) {
      // Nothing is placed on this diagram, so the canvas falls back to every requirement of the model. In a document that
      // is one unreadable figure: point to the diagrams that hold the requirements, or page the overview when there are none.
      const name = sysmlObjectLabel(diagram, 'Requirements Diagram');
      const frameLabel = diagramFrameLabel(repo, diagram.id) ?? `req [Model] Model [${name}]`;
      if (othersHaveContent(diagram.id)) {
        views.push({ diagramId: diagram.id, name, frameLabel, elementIds: [], html: '<p class="muted">No element is placed on this diagram; the requirements are shown on the requirement diagrams that follow.</p>' });
      } else {
        const reqIds = source.blocks.filter(b => b.stereotype === 'requirement').map(b => b.id);
        views.push({ diagramId: diagram.id, name, frameLabel, elementIds: reqIds, html: renderRequirementsDiagram({ blocks: source.blocks, relationships: source.relationships }) });
      }
      continue;
    }
    const scope = getRequirementsDiagramScope(source.blocks, source.relationships, undefined, presented);
    const nodes = source.blocks.filter(b => scope.visibleBlockIds.has(b.id));
    if (!nodes.some(n => n.stereotype === 'requirement')) continue;
    const rels = source.relationships.filter(r => scope.visibleRelationshipIds.has(r.id));

    // Sizes as the canvas computes them; positions from the diagram's own presentation.
    const rects = new Map<string, DiagramRect>();
    const unplaced: { id: string; lines: string[]; width: number; height: number; kind: string }[] = [];
    for (const node of nodes) {
      const bounds = presentation?.presentations[node.id]?.bounds;
      const sized = computeBlockDisplayBounds({
        ...node, width: bounds?.width ?? node.width, height: bounds?.height ?? node.height,
        properties: node.properties ?? [], operations: node.operations ?? [], ports: node.ports ?? [],
      });
      const width = Math.max(sized.width, 170);
      const height = Math.max(sized.height, node.stereotype === 'requirement' ? 100 : 60);
      if (hasPosition(bounds)) rects.set(node.id, { x: bounds!.x!, y: bounds!.y!, width, height });
      else unplaced.push({ id: node.id, lines: [], width, height, kind: 'req' });
    }
    if (unplaced.length > 0) {
      // Elements without saved positions are laid out (requirements above the elements that satisfy them) below the placed ones.
      const ids = new Set(unplaced.map(n => n.id));
      const edges = rels.filter(r => ids.has(r.sourceId) && ids.has(r.targetId))
        .map(r => hierarchyRankEdge({ sourceId: r.sourceId, targetId: r.targetId, kind: r.type === 'derive' ? 'deriveReqt' : r.type }));
      const placed: PositionedNode[] = layoutLayered(unplaced, edges, { direction: 'TB', hGap: 36, vGap: 56, maxRowWidth: 900 });
      const below = rects.size > 0 ? boundsOf([...rects.values()], 0) : { x: 0, y: 0, width: 0, height: 0 };
      const dy = rects.size > 0 ? below.y + below.height + 60 : 0;
      const dx = rects.size > 0 ? below.x : 0;
      for (const p of placed) rects.set(p.id, { x: p.x + dx, y: p.y + dy, width: p.width, height: p.height });
    }

    const offsets = parallelEdgeOffsets(rels.map(r => ({ id: r.id, sourceId: r.sourceId, targetId: r.targetId })), 14);
    const edgeEls = rels.map((r, i) => {
      const s = rects.get(r.sourceId);
      const g = rects.get(r.targetId);
      if (!s || !g) return '';
      const sign = r.sourceId < r.targetId ? 1 : -1;
      return drawEdge(r, s, g, (offsets.get(r.id) ?? 0) * sign, i);
    });
    const nodeEls = nodes.map(n => drawNode(n, rects.get(n.id)!, source.hrefFor?.(n.id)));

    const content = boundsOf([...rects.values()], 0);
    const frameLabel = diagramFrameLabel(repo, diagram.id) ?? `req [Model] Model [${diagram.name}]`;
    const frame: DiagramRect = {
      x: content.x - FRAME_PAD, y: content.y - FRAME_PAD - FRAME_HEADER,
      width: Math.max(content.width + FRAME_PAD * 2, frameLabel.length * 6.4 + 40), height: content.height + FRAME_PAD * 2 + FRAME_HEADER,
    };
    const tabW = Math.min(frame.width - 10, frameLabel.length * 6.2 + 26);
    const frameEl = `<g class="diagram-frame"><rect x="${frame.x}" y="${frame.y}" width="${frame.width}" height="${frame.height}" fill="#ffffff" stroke="${NODE_STROKE}" stroke-width="1.2"/>`
      + `<path d="M ${frame.x} ${frame.y + 20} H ${frame.x + tabW - 10} L ${frame.x + tabW} ${frame.y + 10} V ${frame.y}" fill="#f1f5f9" stroke="${NODE_STROKE}" stroke-width="1"/>`
      + t(frame.x + 6, frame.y + 14, frameLabel, { size: 10.5, weight: 600, anchor: 'start' }) + '</g>';

    const reqCount = nodes.filter(n => n.stereotype === 'requirement').length;
    const others = nodes.length - reqCount;
    const caption = `Requirements diagram · ${frameLabel} (${reqCount} requirement${reqCount === 1 ? '' : 's'}${others ? `, ${others} related element${others === 1 ? '' : 's'}` : ''}, ${rels.length} relationship${rels.length === 1 ? '' : 's'})`;
    const html = wrapFigure(frameEl + edgeEls.join('') + nodeEls.join(''), caption, { x: frame.x - 6, y: frame.y - 6, width: frame.width + 12, height: frame.height + 12 },
      { drawnNodes: nodes.length, drawnEdges: rels.length, omitted: [] });
    views.push({ diagramId: diagram.id, name: sysmlObjectLabel(diagram, 'Requirements Diagram'), frameLabel, elementIds: nodes.map(n => n.id), html });
  }
  return views;
}
