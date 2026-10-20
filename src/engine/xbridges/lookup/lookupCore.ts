// Pure numerics for Simulink-equivalent lookup tables (1-D to 4-D).
// Prelookup: zero-based index k and fraction f. Interpolation: linear (multilinear), flat, nearest.
// Linear extrapolation extends the edge cell's multilinear patch; clip clamps the fraction to [0, 1].

export type LutInterp = 'linear' | 'linear-lagrange' | 'flat' | 'nearest';
export type LutExtrap = 'clip' | 'linear';
export interface LutKF { k: number; f: number }
export interface LutOptions { interp: LutInterp; extrap: LutExtrap }
export type LutTable = number[] | number[][] | number[][][] | number[][][][];

export function validateBreakpoints(bp: number[]): string | null {
  if (!Array.isArray(bp)) return 'Breakpoints must be a numeric vector';
  for (const v of bp) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return 'Breakpoints must be finite numbers';
  }
  if (bp.length < 2) return 'Breakpoints need at least two values';
  for (let i = 1; i < bp.length; i++) {
    if (!(bp[i] > bp[i - 1])) return 'Breakpoints must be strictly increasing';
  }
  return null;
}

export function prelookup(
  bp: number[],
  u: number,
  opts: { extrap: LutExtrap; useLastBreakpoint?: boolean }
): LutKF {
  const n = bp.length;
  if (n < 2) throw new RangeError('Breakpoints need at least two values');
  if (!Number.isFinite(u)) throw new RangeError('Prelookup input must be finite');
  const linear = opts.extrap === 'linear';
  const useLast = opts.useLastBreakpoint === true;
  if (u < bp[0]) {
    if (!linear) return { k: 0, f: 0 };
    return { k: 0, f: (u - bp[0]) / (bp[1] - bp[0]) };
  }
  if (u === bp[0]) return { k: 0, f: 0 };
  if (u >= bp[n - 1]) {
    if (u === bp[n - 1] || !linear) return useLast ? { k: n - 1, f: 0 } : { k: n - 2, f: 1 };
    return { k: n - 2, f: (u - bp[n - 2]) / (bp[n - 1] - bp[n - 2]) };
  }
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (bp[mid] <= u) lo = mid; else hi = mid;
  }
  return { k: lo, f: (u - bp[lo]) / (bp[lo + 1] - bp[lo]) };
}

function normalise(size: number, kf: LutKF, extrap: LutExtrap): LutKF {
  let { k, f } = kf;
  if (size < 2) return { k: 0, f: 0 };
  if (k >= size - 1) { k = size - 2; f = 1; }
  if (k < 0) { k = 0; }
  if (extrap === 'clip') f = f < 0 ? 0 : f > 1 ? 1 : f;
  return { k, f };
}

export function interpolateNd(table: LutTable, kf: LutKF[], opts: LutOptions): number {
  const dims = kf.length;
  const sizes: number[] = [];
  let probe: any = table;
  for (let d = 0; d < dims; d++) {
    if (!Array.isArray(probe)) throw new RangeError('Table has fewer dimensions than indices');
    sizes.push(probe.length);
    probe = probe[0];
  }
  const nk = kf.map((p, d) => normalise(sizes[d], p, opts.extrap));
  const at = (t: any, d: number): number => {
    if (d === dims) return t as number;
    const { k, f } = nk[d];
    if (sizes[d] < 2) return at(t[0], d + 1);
    if (opts.interp === 'flat') return at(t[f >= 1 ? k + 1 : k], d + 1);
    if (opts.interp === 'nearest') return at(t[f >= 0.5 ? k + 1 : k], d + 1);
    const a = at(t[k], d + 1);
    if (f === 0) return a;
    const b = at(t[k + 1], d + 1);
    return opts.interp === 'linear-lagrange' ? (1 - f) * a + f * b : a + f * (b - a);
  };
  return at(table, 0);
}

export function lookupNd(table: LutTable, breakpoints: number[][], inputs: number[], opts: LutOptions): number {
  const kf = breakpoints.map((bp, d) => prelookup(bp, inputs[d], { extrap: opts.extrap }));
  return interpolateNd(table, kf, opts);
}

export function validateTable(table: unknown, breakpoints: number[][]): string | null {
  const n = breakpoints.length;
  const expected = breakpoints.map(b => b.length);
  const found: number[] = [];
  let probe: any = table;
  for (let d = 0; d < n; d++) {
    if (!Array.isArray(probe)) { found.push(0); break; }
    found.push(probe.length);
    probe = probe[0];
  }
  const sizeMsg = () => `Table size [${found.join(' x ')}] does not match breakpoint sizes [${expected.join(' x ')}]`;
  if (found.length !== n || found.some((s, i) => s !== expected[i])) return sizeMsg();
  let bad: string | null = null;
  const walk = (t: any, d: number) => {
    if (bad) return;
    if (d === n) {
      if (typeof t !== 'number' || !Number.isFinite(t)) bad = 'Table must contain only finite numbers';
      return;
    }
    if (!Array.isArray(t) || t.length !== expected[d]) { bad = sizeMsg(); return; }
    for (const c of t) walk(c, d + 1);
  };
  walk(table, 0);
  return bad;
}
