/**
 * Orthogonal connector router for the report's folded state-machine layout: A* over the grid formed by the hug lines
 * of the obstacles, with a bend penalty and a penalty for running along or crossing routes already drawn. A route
 * never enters an obstacle it was not told to start or end in (terminals sit outside every obstacle).
 * Depends on reportSvgGeometry only.
 */
import { Box, Pt, segmentCrossesBox } from './reportSvgGeometry';

export interface RouteObstacle extends Box {
  /** Clearance kept between a route and the box (default 6). */
  inflate?: number;
}

const DEFAULT_INFLATE = 6;
const BEND_COST = 30;
const MID_GAP_MIN = 36;
const OUTER_MARGIN = 18;
/** dx, dy per direction: 0 right, 1 down, 2 left, 3 up */
const DIRS: readonly Pt[] = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }];

export function removeCollinear(points: readonly Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && last.x === p.x && last.y === p.y) continue;
    out.push(p);
    while (out.length >= 3) {
      const a = out[out.length - 3];
      const b = out[out.length - 2];
      const c = out[out.length - 1];
      if ((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y)) out.splice(out.length - 2, 1);
      else break;
    }
  }
  return out;
}

class MinHeap {
  private items: { key: number; value: number }[] = [];
  get size(): number { return this.items.length; }
  push(key: number, value: number): void {
    const a = this.items;
    a.push({ key, value });
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].key <= a[i].key) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): { key: number; value: number } {
    const a = this.items;
    const top = a[0];
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].key < a[m].key) m = l;
        if (r < a.length && a[r].key < a[m].key) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

export class OrthogonalRouter {
  private readonly used: { a: Pt; b: Pt }[] = [];
  constructor(private readonly obstacles: RouteObstacle[]) {}

  addObstacle(o: RouteObstacle): void { this.obstacles.push(o); }

  private inflated(): Box[] {
    return this.obstacles.map(o => {
      const k = o.inflate ?? DEFAULT_INFLATE;
      return { x: o.x - k, y: o.y - k, width: o.width + 2 * k, height: o.height + 2 * k };
    });
  }

  /** Routes from `from` to `to` (both outside every obstacle). `startDir` (0 right, 1 down, 2 left, 3 up) is the way the route first leaves `from`. */
  route(from: Pt, to: Pt, startDir?: number): Pt[] {
    const boxes = this.inflated();
    const xsSet = new Set<number>([from.x, to.x]);
    const ysSet = new Set<number>([from.y, to.y]);
    let minX = Math.min(from.x, to.x);
    let maxX = Math.max(from.x, to.x);
    let minY = Math.min(from.y, to.y);
    let maxY = Math.max(from.y, to.y);
    for (const b of boxes) {
      xsSet.add(b.x); xsSet.add(b.x + b.width);
      ysSet.add(b.y); ysSet.add(b.y + b.height);
      minX = Math.min(minX, b.x); maxX = Math.max(maxX, b.x + b.width);
      minY = Math.min(minY, b.y); maxY = Math.max(maxY, b.y + b.height);
    }
    xsSet.add(minX - OUTER_MARGIN); xsSet.add(maxX + OUTER_MARGIN);
    ysSet.add(minY - OUTER_MARGIN); ysSet.add(maxY + OUTER_MARGIN);
    const withMids = (set: Set<number>): number[] => {
      const base = [...set].sort((p, q) => p - q);
      const out = [...base];
      for (let i = 1; i < base.length; i++) {
        const gap = base[i] - base[i - 1];
        if (gap <= MID_GAP_MIN) continue;
        // lanes inside a free gap: one in the middle, more when it is wide, so parallel routes can run side by side
        const lanes = gap > 2.5 * MID_GAP_MIN ? [0.25, 0.5, 0.75] : [0.5];
        for (const f of lanes) out.push(base[i - 1] + gap * f);
      }
      return [...new Set(out)].sort((p, q) => p - q);
    };
    const xs = withMids(xsSet);
    const ys = withMids(ysSet);
    const nx = xs.length;
    const ny = ys.length;
    const inside = (p: Pt) => boxes.some(b => p.x > b.x + 0.5 && p.x < b.x + b.width - 0.5 && p.y > b.y + 0.5 && p.y < b.y + b.height - 0.5);
    const free = (i: number, j: number) => !inside({ x: xs[i], y: ys[j] });
    const stepOk = (a: Pt, b: Pt) => !boxes.some(box => segmentCrossesBox(a, b, box, 0.5));
    const penaltyCache = new Map<number, number>();
    const stepPenalty = (a: Pt, b: Pt, key: number): number => {
      const cached = penaltyCache.get(key);
      if (cached !== undefined) return cached;
      const horizontal = a.y === b.y;
      let penalty = 0;
      for (const u of this.used) {
        const uh = u.a.y === u.b.y;
        if (uh === horizontal) {
          if (horizontal ? Math.abs(u.a.y - a.y) < 0.5 : Math.abs(u.a.x - a.x) < 0.5) {
            const lo = horizontal ? Math.max(Math.min(a.x, b.x), Math.min(u.a.x, u.b.x)) : Math.max(Math.min(a.y, b.y), Math.min(u.a.y, u.b.y));
            const hi = horizontal ? Math.min(Math.max(a.x, b.x), Math.max(u.a.x, u.b.x)) : Math.min(Math.max(a.y, b.y), Math.max(u.a.y, u.b.y));
            if (hi - lo > 1) penalty += (hi - lo) * 3 + 20;
          }
        } else {
          const h = horizontal ? { a, b } : u;
          const v = horizontal ? u : { a, b };
          const hy = h.a.y;
          const vx = v.a.x;
          if (vx > Math.min(h.a.x, h.b.x) && vx < Math.max(h.a.x, h.b.x) && hy > Math.min(v.a.y, v.b.y) && hy < Math.max(v.a.y, v.b.y)) penalty += 10;
        }
      }
      penaltyCache.set(key, penalty);
      return penalty;
    };

    const si = xs.indexOf(from.x);
    const sj = ys.indexOf(from.y);
    const ti = xs.indexOf(to.x);
    const tj = ys.indexOf(to.y);
    const stateIndex = (i: number, j: number, d: number) => ((j * nx + i) << 2) | d;
    const total = nx * ny * 4;
    const cost = new Float64Array(total).fill(Infinity);
    const prev = new Int32Array(total).fill(-1);
    const heap = new MinHeap();
    const h = (i: number, j: number) => Math.abs(xs[i] - xs[ti]) + Math.abs(ys[j] - ys[tj]);
    // An unconstrained start is modelled as four equal starts (one per direction).
    const starts = startDir === undefined ? [0, 1, 2, 3] : [startDir];
    for (const d of starts) {
      const s = stateIndex(si, sj, d);
      cost[s] = 0;
      heap.push(h(si, sj), s);
    }
    let goal = -1;
    while (heap.size > 0) {
      const { value: state } = heap.pop();
      const d = state & 3;
      const cell = state >> 2;
      const i = cell % nx;
      const j = (cell - i) / nx;
      if (i === ti && j === tj) { goal = state; break; }
      const base = cost[state];
      for (let nd = 0; nd < 4; nd++) {
        if ((nd + 2) % 4 === d) continue; // no U-turns
        const ni = i + DIRS[nd].x;
        const nj = j + DIRS[nd].y;
        if (ni < 0 || nj < 0 || ni >= nx || nj >= ny || !free(ni, nj)) continue;
        const a = { x: xs[i], y: ys[j] };
        const b = { x: xs[ni], y: ys[nj] };
        if (!stepOk(a, b)) continue;
        const key = nd === 0 || nd === 2 ? (j * nx + Math.min(i, ni)) * 2 : (Math.min(j, nj) * nx + i) * 2 + 1;
        const length = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
        const next = base + length + (nd === d ? 0 : BEND_COST) + stepPenalty(a, b, key);
        const ns = stateIndex(ni, nj, nd);
        if (next < cost[ns]) { cost[ns] = next; prev[ns] = state; heap.push(next + h(ni, nj), ns); }
      }
    }
    let points: Pt[];
    if (goal < 0) {
      points = [from, { x: to.x, y: from.y }, to];
    } else {
      const rev: Pt[] = [];
      for (let s = goal; s >= 0; s = prev[s]) {
        const cell = s >> 2;
        const i = cell % nx;
        rev.push({ x: xs[i], y: ys[(cell - i) / nx] });
      }
      points = rev.reverse();
    }
    points = removeCollinear(points);
    for (let k = 1; k < points.length; k++) this.used.push({ a: points[k - 1], b: points[k] });
    return points;
  }

  /** Records a polyline drawn outside the router (a self loop, an initial arrow) so later routes avoid running along it. */
  markUsed(points: readonly Pt[]): void {
    for (let k = 1; k < points.length; k++) this.used.push({ a: points[k - 1], b: points[k] });
  }
}
