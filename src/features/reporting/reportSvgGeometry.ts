/**
 * Geometry helpers shared by the report diagram renderers and their regression tests:
 * path parsing, segment/box intersection and a content-bounds scan of an SVG fragment.
 * This module must not import from the other reporting diagram modules.
 */

export interface Pt { x: number; y: number }
export interface Box { x: number; y: number; width: number; height: number }

/** Average advance of the report's sans-serif text, as a fraction of the font size. */
export const TEXT_ADVANCE = 0.58;

/** Estimated rendered width of a single line of text. */
export function textWidth(text: string, size = 9): number {
  return Math.ceil(text.length * size * TEXT_ADVANCE);
}

/** Bounding box of a text anchored at (x, baselineY). */
export function textBox(x: number, y: number, text: string, size = 9, anchor: 'start' | 'middle' | 'end' = 'middle'): Box {
  const width = textWidth(text, size);
  const left = anchor === 'middle' ? x - width / 2 : anchor === 'end' ? x - width : x;
  return { x: left, y: y - size, width, height: size + 3 };
}

/** Parses an SVG path `d` into sub-paths of points. Curves are sampled; arcs are not supported. */
export function parsePath(d: string): Pt[][] {
  const tokens = d.match(/[MmLlHhVvCcQqZz]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  const subpaths: Pt[][] = [];
  let current: Pt[] = [];
  let cursor: Pt = { x: 0, y: 0 };
  let start: Pt = { x: 0, y: 0 };
  let i = 0;
  const num = () => Number(tokens[i++]);
  const isNum = () => i < tokens.length && /^[-\d.]/.test(tokens[i]);
  const push = (p: Pt) => { current.push(p); cursor = p; };
  let cmd = '';
  while (i < tokens.length) {
    if (!isNum()) cmd = tokens[i++];
    switch (cmd) {
      case 'M': case 'm': {
        const rel = cmd === 'm';
        const p = { x: num() + (rel ? cursor.x : 0), y: num() + (rel ? cursor.y : 0) };
        if (current.length > 1) subpaths.push(current);
        current = [];
        start = p;
        push(p);
        cmd = rel ? 'l' : 'L';
        break;
      }
      case 'L': case 'l': { const rel = cmd === 'l'; push({ x: num() + (rel ? cursor.x : 0), y: num() + (rel ? cursor.y : 0) }); break; }
      case 'H': push({ x: num(), y: cursor.y }); break;
      case 'h': push({ x: cursor.x + num(), y: cursor.y }); break;
      case 'V': push({ x: cursor.x, y: num() }); break;
      case 'v': push({ x: cursor.x, y: cursor.y + num() }); break;
      case 'Q': case 'q': {
        const rel = cmd === 'q';
        const o = rel ? cursor : { x: 0, y: 0 };
        const c = { x: num() + o.x, y: num() + o.y };
        const e = { x: num() + o.x, y: num() + o.y };
        const s = cursor;
        for (let k = 1; k <= 8; k++) {
          const t = k / 8;
          push({ x: (1 - t) ** 2 * s.x + 2 * (1 - t) * t * c.x + t * t * e.x, y: (1 - t) ** 2 * s.y + 2 * (1 - t) * t * c.y + t * t * e.y });
        }
        break;
      }
      case 'C': case 'c': {
        const rel = cmd === 'c';
        const o = rel ? cursor : { x: 0, y: 0 };
        const c1 = { x: num() + o.x, y: num() + o.y };
        const c2 = { x: num() + o.x, y: num() + o.y };
        const e = { x: num() + o.x, y: num() + o.y };
        const s = cursor;
        for (let k = 1; k <= 12; k++) {
          const t = k / 12;
          const u = 1 - t;
          push({
            x: u ** 3 * s.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t ** 3 * e.x,
            y: u ** 3 * s.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t ** 3 * e.y,
          });
        }
        break;
      }
      case 'Z': case 'z': push({ ...start }); break;
      default: i++; break;
    }
  }
  if (current.length > 1) subpaths.push(current);
  return subpaths;
}

/** True when the open segment a-b passes through the interior of `box` (shrunk by `shrink` px on every side). */
export function segmentCrossesBox(a: Pt, b: Pt, box: Box, shrink = 1): boolean {
  const x0 = box.x + shrink;
  const x1 = box.x + box.width - shrink;
  const y0 = box.y + shrink;
  const y1 = box.y + box.height - shrink;
  if (x1 <= x0 || y1 <= y0) return false;
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const checks: [number, number][] = [[-dx, a.x - x0], [dx, x1 - a.x], [-dy, a.y - y0], [dy, y1 - a.y]];
  for (const [p, q] of checks) {
    if (p === 0) {
      if (q <= 0) return false;
    } else {
      const r = q / p;
      if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
      else { if (r < t0) return false; if (r < t1) t1 = r; }
    }
  }
  return t1 - t0 > 1e-9 || (dx === 0 && dy === 0);
}

export function polylineCrossesBox(points: readonly Pt[], box: Box, shrink = 1): boolean {
  for (let i = 1; i < points.length; i++) if (segmentCrossesBox(points[i - 1], points[i], box, shrink)) return true;
  return false;
}

export function boxContainsPoint(box: Box, p: Pt, slack = 0): boolean {
  return p.x >= box.x - slack && p.x <= box.x + box.width + slack && p.y >= box.y - slack && p.y <= box.y + box.height + slack;
}

export function boxesIntersect(a: Box, b: Box, shrink = 0): boolean {
  return a.x + shrink < b.x + b.width && b.x + shrink < a.x + a.width && a.y + shrink < b.y + b.height && b.y + shrink < a.y + a.height;
}

export function polylineLength(points: readonly Pt[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return total;
}

/** Drops consecutive duplicate points. */
export function simplify(points: readonly Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || last.x !== p.x || last.y !== p.y) out.push(p);
  }
  return out;
}

export function pointsToPath(points: readonly Pt[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
}

/** The longest horizontal segment of a polyline, optionally ignoring the first and last segment. */
export function longestHorizontal(points: readonly Pt[], interiorOnly = false): { a: Pt; b: Pt; length: number } | undefined {
  let best: { a: Pt; b: Pt; length: number } | undefined;
  const to = interiorOnly ? points.length - 2 : points.length - 1;
  for (let i = 1; i <= to; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (Math.abs(a.y - b.y) > 0.5) continue;
    const length = Math.abs(b.x - a.x);
    if (!best || length > best.length) best = { a, b, length };
  }
  return best;
}

function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m ? m[1] : undefined;
}

const numAttr = (tag: string, name: string): number | undefined => {
  const v = attr(tag, name);
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

export function decodeEntities(text: string): string {
  return text.replace(/&(?:amp|lt|gt|quot|#39|#96|#\d+|#x[0-9a-f]+);/gi, '.');
}

export interface SvgText { box: Box; text: string; cls: string; haloed: boolean }

/** Every text element of an svg fragment (textPath texts are skipped: they have no anchor), with an estimated box. */
export function svgTexts(svg: string): SvgText[] {
  const out: SvgText[] = [];
  for (const m of svg.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)) {
    const tag = m[1];
    if (m[2].includes('<textPath')) continue;
    const x = numAttr(tag, 'x');
    const y = numAttr(tag, 'y');
    if (x === undefined || y === undefined) continue;
    const text = decodeEntities(m[2].replace(/<[^>]+>/g, ''));
    const size = numAttr(tag, 'font-size') ?? 11;
    const anchor = (attr(tag, 'text-anchor') ?? 'start') as 'start' | 'middle' | 'end';
    out.push({ box: textBox(x, y, text, size, anchor), text, cls: attr(tag, 'class') ?? '', haloed: attr(tag, 'stroke') === '#ffffff' });
  }
  return out;
}

/** Union bounding box of everything drawn in an svg fragment (paths, shapes, text). Marker defs must be excluded by the caller. */
export function svgContentBounds(svg: string): Box | undefined {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const add = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  };
  const addBox = (b: Box) => { add(b.x, b.y); add(b.x + b.width, b.y + b.height); };
  for (const m of svg.matchAll(/<path\b[^>]*?\sd="([^"]*)"/g)) for (const sp of parsePath(m[1])) for (const p of sp) add(p.x, p.y);
  for (const m of svg.matchAll(/<rect\b[^>]*>/g)) {
    const x = numAttr(m[0], 'x'); const y = numAttr(m[0], 'y'); const w = numAttr(m[0], 'width'); const h = numAttr(m[0], 'height');
    if (x !== undefined && y !== undefined && w !== undefined && h !== undefined) addBox({ x, y, width: w, height: h });
  }
  for (const m of svg.matchAll(/<(?:circle|ellipse)\b[^>]*>/g)) {
    const cx = numAttr(m[0], 'cx'); const cy = numAttr(m[0], 'cy');
    const rx = numAttr(m[0], 'rx') ?? numAttr(m[0], 'r'); const ry = numAttr(m[0], 'ry') ?? numAttr(m[0], 'r');
    if (cx !== undefined && cy !== undefined && rx !== undefined && ry !== undefined) addBox({ x: cx - rx, y: cy - ry, width: 2 * rx, height: 2 * ry });
  }
  for (const m of svg.matchAll(/<line\b[^>]*>/g)) {
    const x1 = numAttr(m[0], 'x1'); const y1 = numAttr(m[0], 'y1'); const x2 = numAttr(m[0], 'x2'); const y2 = numAttr(m[0], 'y2');
    if (x1 !== undefined && y1 !== undefined) add(x1, y1);
    if (x2 !== undefined && y2 !== undefined) add(x2, y2);
  }
  for (const t of svgTexts(svg)) addBox(t.box);
  if (minX === Infinity) return undefined;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function unionBox(a: Box, b: Box): Box {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
}
