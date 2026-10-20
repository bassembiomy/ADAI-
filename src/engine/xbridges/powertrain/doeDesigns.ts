// Pure design-of-experiments generators used by the DoE Sweeper block (engine-calibration-spec.md §2).
// References: Montgomery, Design and Analysis of Experiments; McKay, Beckman & Conover 1979 (LHS); Box & Wilson 1951 (CCD).

/** Full factorial: every combination of the given levels, first factor varies slowest. */
export function fullFactorial(levels: number[][]): number[][] {
  let rows: number[][] = [[]];
  for (const lv of levels) {
    const next: number[][] = [];
    for (const r of rows) for (const v of lv) next.push([...r, v]);
    rows = next;
  }
  return levels.length === 0 ? [] : rows;
}

/** Small deterministic PRNG (Tommy Ettinger's mulberry32), uniform in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Latin hypercube sample, n rows x k columns in [0, 1): one point per stratum of every factor, jittered inside the stratum. */
export function latinHypercube(k: number, n: number, seed: number): number[][] {
  const out: number[][] = Array.from({ length: n }, () => new Array<number>(k).fill(0));
  for (let j = 0; j < k; j++) {
    const rng = mulberry32(seed + 9973 * j);
    const perm = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const r = Math.floor(rng() * (i + 1));
      const tmp = perm[i]; perm[i] = perm[r]; perm[r] = tmp;
    }
    for (let i = 0; i < n; i++) out[i][j] = (perm[i] + rng()) / n;
  }
  return out;
}

/** Central composite design in coded units: 2^k corners, 2k axial points (-a then +a per factor), centre points. */
export function centralComposite(k: number, opts: { alpha: 'face' | 'rotatable' | number; centerPoints: number }): number[][] {
  const a = opts.alpha === 'face' ? 1 : opts.alpha === 'rotatable' ? Math.pow(2 ** k, 0.25) : opts.alpha;
  const rows: number[][] = [];
  const nCorner = 2 ** k;
  for (let c = 0; c < nCorner; c++) {
    const r: number[] = [];
    for (let j = 0; j < k; j++) r.push(((c >> (k - 1 - j)) & 1) === 1 ? 1 : -1);
    rows.push(r);
  }
  for (let j = 0; j < k; j++) {
    for (const s of [-1, 1]) {
      const r = new Array<number>(k).fill(0);
      r[j] = s * a;
      rows.push(r);
    }
  }
  for (let c = 0; c < opts.centerPoints; c++) rows.push(new Array<number>(k).fill(0));
  return rows;
}

/** Maps a coded design (-1..1) linearly onto [lo, hi] per factor. */
export function scaleCoded(coded: number[][], bounds: number[][]): number[][] {
  return coded.map(r => r.map((c, j) => bounds[j][0] + ((c + 1) / 2) * (bounds[j][1] - bounds[j][0])));
}

/** Maps a unit design (0..1) linearly onto [lo, hi] per factor. */
export function scaleUnit(unit: number[][], bounds: number[][]): number[][] {
  return unit.map(r => r.map((u, j) => bounds[j][0] + u * (bounds[j][1] - bounds[j][0])));
}
