import { Box, Pt, boxContainsPoint, boxesIntersect, parsePath, segmentCrossesBox, svgTexts } from './reportSvgGeometry';

/** Test helper: reads a rendered report figure back into geometry (nodes, edge routes, labels, viewBox). */

export interface FigureNode extends Box { kind: string; id: string }
export interface FigureEdge { id: string; points: Pt[] }
export interface FigureLabel { box: Box; text: string; cls: string }
export interface FigureGeometry {
  viewBox: Box;
  nodes: FigureNode[];
  edges: FigureEdge[];
  labels: FigureLabel[];
  /** Every drawn point (all path vertices, shape corners, text box corners) for viewBox containment. */
  extents: { what: string; p: Pt }[];
}

export function figuresOf(html: string): string[] {
  return html.match(/<figure class="report-figure"(?:(?!class="report-figure-empty")[^>])*>[\s\S]*?<\/figure>/g) ?? [];
}

const attr = (tag: string, name: string): string | undefined => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];

export function parseFigure(figure: string): FigureGeometry {
  const vb = /viewBox="([^"]+)"/.exec(figure)![1].split(/\s+/).map(Number);
  const viewBox = { x: vb[0], y: vb[1], width: vb[2], height: vb[3] };
  const svg = figure.replace(/<defs>[\s\S]*?<\/defs>/, '');

  const nodes: FigureNode[] = [];
  for (const m of svg.matchAll(/<(?:g|a)\b[^>]*\sdata-w="[^"]*"[^>]*>/g)) {
    const tag = m[0];
    nodes.push({
      id: attr(tag, 'data-node-id') ?? '', kind: attr(tag, 'data-kind') ?? attr(tag, 'class') ?? '',
      x: Number(attr(tag, 'data-x')), y: Number(attr(tag, 'data-y')), width: Number(attr(tag, 'data-w')), height: Number(attr(tag, 'data-h')),
    });
  }
  const edges: FigureEdge[] = [];
  for (const m of svg.matchAll(/<path\b[^>]*?\sid="([^"]*edge-[^"]*)"[^>]*?\sd="([^"]*)"/g)) {
    edges.push({ id: m[1], points: parsePath(m[2]).flat() });
  }
  // the attribute order is not fixed: also catch `d` before `id`
  for (const m of svg.matchAll(/<path\b[^>]*?\sd="([^"]*)"[^>]*?\sid="([^"]*edge-[^"]*)"/g)) {
    if (!edges.some(e => e.id === m[2])) edges.push({ id: m[2], points: parsePath(m[1]).flat() });
  }
  const texts = svgTexts(svg);
  const labels = texts.filter(t => t.cls.includes('rf-edge-label') || t.cls.includes('rf-port-label')).map(t => ({ box: t.box, text: t.text, cls: t.cls }));

  const extents: { what: string; p: Pt }[] = [];
  for (const m of svg.matchAll(/<path\b[^>]*?\sd="([^"]*)"/g)) for (const sp of parsePath(m[1])) for (const p of sp) extents.push({ what: `path ${m[1].slice(0, 40)}`, p });
  for (const m of svg.matchAll(/<rect\b[^>]*>/g)) {
    const x = Number(attr(m[0], 'x')); const y = Number(attr(m[0], 'y')); const w = Number(attr(m[0], 'width')); const h = Number(attr(m[0], 'height'));
    if ([x, y, w, h].every(Number.isFinite)) { extents.push({ what: 'rect', p: { x, y } }, { what: 'rect', p: { x: x + w, y: y + h } }); }
  }
  for (const t of texts) {
    extents.push({ what: `text "${t.text}"`, p: { x: t.box.x, y: t.box.y } }, { what: `text "${t.text}"`, p: { x: t.box.x + t.box.width, y: t.box.y + t.box.height } });
  }
  return { viewBox, nodes, edges, labels, extents };
}

const inEllipse = (n: Box, p: Pt, inset: number) => {
  const rx = n.width / 2 - inset;
  const ry = n.height / 2 - inset;
  if (rx <= 0 || ry <= 0) return false;
  return ((p.x - (n.x + n.width / 2)) / rx) ** 2 + ((p.y - (n.y + n.height / 2)) / ry) ** 2 < 1;
};

function crossesNode(a: Pt, b: Pt, n: FigureNode): boolean {
  if (n.kind === 'useCase') {
    for (let k = 0; k <= 24; k++) {
      const t = k / 24;
      if (inEllipse(n, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, 3)) return true;
    }
    return false;
  }
  return segmentCrossesBox(a, b, n, 1.5);
}

/** Edges whose route passes through the interior of a node that is not one of their own ends. */
export function edgeNodeCollisions(g: FigureGeometry): string[] {
  const out: string[] = [];
  for (const e of g.edges) {
    if (e.points.length < 2) continue;
    const first = e.points[0];
    const last = e.points[e.points.length - 1];
    for (const n of g.nodes) {
      const own = n.kind === 'useCase'
        ? inEllipse(n, first, -6) || inEllipse(n, last, -6)
        : boxContainsPoint(n, first, 2) || boxContainsPoint(n, last, 2);
      if (own) continue;
      for (let i = 1; i < e.points.length; i++) {
        if (crossesNode(e.points[i - 1], e.points[i], n)) { out.push(`${e.id} crosses node ${n.id || n.kind} (${n.x},${n.y},${n.width}x${n.height})`); break; }
      }
    }
  }
  return out;
}

/** Drawn points that fall outside the figure's viewBox. */
export function outsideViewBox(g: FigureGeometry, tolerance = 0.75): string[] {
  const { viewBox: v } = g;
  return g.extents
    .filter(({ p }) => p.x < v.x - tolerance || p.y < v.y - tolerance || p.x > v.x + v.width + tolerance || p.y > v.y + v.height + tolerance)
    .map(({ what, p }) => `${what} at ${Math.round(p.x)},${Math.round(p.y)} outside viewBox ${v.x} ${v.y} ${v.width} ${v.height}`);
}

/** Edge / port labels that overlap a node or each other. */
export function labelCollisions(g: FigureGeometry): string[] {
  const out: string[] = [];
  g.labels.forEach((l, i) => {
    for (const n of g.nodes) if (boxesIntersect(l.box, n, 1.5)) out.push(`label "${l.text}" overlaps node ${n.id || n.kind}`);
    for (let j = i + 1; j < g.labels.length; j++) if (boxesIntersect(l.box, g.labels[j].box, 1)) out.push(`label "${l.text}" overlaps label "${g.labels[j].text}"`);
  });
  return out;
}
