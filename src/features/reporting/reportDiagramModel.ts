import { svgContentBounds } from './reportSvgGeometry';

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
  const clean = lines.filter(line => line.length > 0).flatMap(line => {
    const wrapped: string[] = [];
    let rest = line;
    while (rest.length > 36) {
      const space = rest.lastIndexOf(' ', 36);
      const end = space > 12 ? space : 36;
      wrapped.push(rest.slice(0, end));
      rest = rest.slice(end).trimStart();
    }
    wrapped.push(rest);
    return wrapped;
  });
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

/** Add small continuation figures for edges crossing the primary page boundary. */
export function connectionPages<T extends { id: string }>(items: T[], edges: readonly { sourceId: string; targetId: string }[], size = MAX_NODES_PER_FIGURE): T[][] {
  const byId = new Map(items.map(n => [n.id, n]));
  if (!edges.length) return chunkItems(items, size);
  // Group by connectivity, repeating boundary nodes as necessary. Never start
  // with arbitrary array slices, which detach requirements from their blocks.
  const pages: T[][] = [];
  const limit = size;
  if (items.length <= limit) return [items];
  for (const edge of edges) {
    if (pages.some(page => page.some(n => n.id === edge.sourceId) && page.some(n => n.id === edge.targetId))) continue;
    const ends = [...new Set([edge.sourceId, edge.targetId])].map(id => byId.get(id)).filter((n): n is T => !!n);
    if (ends.length !== new Set([edge.sourceId, edge.targetId]).size) continue;
    const page = pages.find(p => p.some(n => ends.some(e => e.id === n.id)) && new Set([...p, ...ends].map(n => n.id)).size <= limit);
    if (page) page.push(...ends.filter(e => !page.some(n => n.id === e.id)));
    else pages.push(ends);
  }
  const covered = new Set(pages.flat().map(n => n.id));
  pages.push(...chunkItems(items.filter(n => !covered.has(n.id)), size));
  return pages;
}

export const SVG_MARKER_DEFS = `<defs>
<marker id="rf-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#546e7a"/></marker>
<marker id="rf-diamond-filled" viewBox="0 0 12 10" refX="1" refY="5" markerWidth="10" markerHeight="9" orient="auto"><path d="M 1 5 L 6 1 L 11 5 L 6 9 z" fill="#546e7a"/></marker>
<marker id="rf-diamond-hollow" viewBox="0 0 12 10" refX="1" refY="5" markerWidth="10" markerHeight="9" orient="auto"><path d="M 1 5 L 6 1 L 11 5 L 6 9 z" fill="#ffffff" stroke="#546e7a"/></marker>
<marker id="rf-triangle-hollow" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="11" markerHeight="10" orient="auto"><path d="M 1 1 L 11 6 L 1 11 z" fill="#ffffff" stroke="#546e7a"/></marker>
<marker id="requirement-containment-crosshair" viewBox="0 0 16 16" refX="8" refY="8" markerWidth="12" markerHeight="12" orient="auto"><circle cx="8" cy="8" r="6" fill="#ffffff" stroke="#546e7a" stroke-width="1.2"/><line x1="8" y1="2" x2="8" y2="14" stroke="#546e7a" stroke-width="1.2"/><line x1="2" y1="8" x2="14" y2="8" stroke="#546e7a" stroke-width="1.2"/></marker>
<marker id="rf-arrow-open" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse"><path d="M 1 1 L 9 5 L 1 9" fill="none" stroke="#546e7a" stroke-width="1.3"/></marker>
<marker id="rf-arrow-filled" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse"><path d="M 0 1 L 10 5 L 0 9 z" fill="#182231" stroke="#182231"/></marker>
</defs>`;

/** Connection accounting for one figure: model connections in scope = drawnEdges + omitted.length. */
export interface FigureAccounting {
  drawnNodes: number;
  drawnEdges: number;
  omitted: { id: string; reason: string }[];
}

const MAX_LISTED_OMISSIONS = 8;

function omittedNote(accounting: FigureAccounting): string {
  const listed = accounting.omitted.slice(0, MAX_LISTED_OMISSIONS).map(o => o.reason);
  const more = accounting.omitted.length - listed.length;
  const count = accounting.omitted.length;
  const text = `${count} connection${count === 1 ? '' : 's'} not drawn in this view: ${listed.join('; ')}${more > 0 ? `; and ${more} more` : ''}`;
  return `<p class="report-figure-omitted">${escapeHtml(text)}</p>`;
}

/** Margin kept between the drawn content and the viewBox edge when the viewBox has to grow. */
const VIEWBOX_MARGIN = 8;

/**
 * The viewBox must contain every drawn path, shape and label, not just the node rectangles the layout
 * placed: edge routes (back edges, detours), stubs and labels extend past them. The requested box is
 * therefore grown to the scanned content bounds. It never shrinks the requested box.
 */
export function fitViewBox(svgInner: string, viewBox: DiagramRect): DiagramRect {
  const content = svgContentBounds(svgInner);
  if (!content) return viewBox;
  const wanted = { x: content.x - VIEWBOX_MARGIN, y: content.y - VIEWBOX_MARGIN, width: content.width + 2 * VIEWBOX_MARGIN, height: content.height + 2 * VIEWBOX_MARGIN };
  const x = Math.min(viewBox.x, wanted.x);
  const y = Math.min(viewBox.y, wanted.y);
  return { x, y, width: Math.max(viewBox.x + viewBox.width, wanted.x + wanted.width) - x, height: Math.max(viewBox.y + viewBox.height, wanted.y + wanted.height) - y };
}

export function wrapFigure(svgInner: string, caption: string, requestedViewBox: DiagramRect, accounting?: FigureAccounting): string {
  const viewBox = fitViewBox(svgInner, requestedViewBox);
  const displayWidth = Math.min(MAX_FIGURE_WIDTH, Math.ceil(viewBox.width));
  const displayHeight = Math.ceil(displayWidth * viewBox.height / viewBox.width);
  const attrs = accounting ? ` data-drawn-edges="${accounting.drawnEdges}" data-omitted-edges="${accounting.omitted.length}"` : '';
  const note = accounting && accounting.omitted.length > 0 ? omittedNote(accounting) : '';
  return `<figure class="report-figure"${attrs}><svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.x} ${viewBox.y} ${Math.ceil(viewBox.width)} ${Math.ceil(viewBox.height)}" width="${displayWidth}" height="${displayHeight}" style="max-width:100%;height:auto" role="img" aria-label="${escapeHtml(caption)}">${SVG_MARKER_DEFS}${svgInner}</svg><figcaption class="report-figure-caption">${escapeHtml(caption)}</figcaption>${note}</figure>`;
}
export function renderEmptyFigure(message: string): string {
  return `<figure class="report-figure report-figure-empty"><p>${escapeHtml(message)}</p></figure>`;
}
