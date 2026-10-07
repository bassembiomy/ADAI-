/**
 * WP-31c (F-079a): structure of the Newton matrix for finite-difference Jacobians.
 *
 * Perturbing one unknown per residual evaluation costs n evaluations per Jacobian. When two columns have no row in common (no
 * residual depends on both unknowns) they can be perturbed together and their effects separated by the sparsity pattern, so the
 * number of evaluations drops to the number of column groups ("colors") (Curtis, Powell and Reid, "On the estimation of sparse
 * Jacobian matrices", J. Inst. Math. Appl. 13, 1974; the greedy largest-first coloring is Coleman and More, SIAM J. Numer. Anal.
 * 20, 1983). The pattern is the structural one detected by vlabStructure.detectJacobianPattern.
 */

export interface JacobianPattern {
  n: number;
  /** rows[i] = columns of row i (sorted) */
  rows: number[][];
  /** colRows[j] = rows of column j (sorted); the compressed-column layout is Ap / Ai */
  colRows: number[][];
  Ap: number[];
  Ai: number[];
  /** groups of columns that share no row: one residual evaluation each */
  groups: number[][];
}

export function buildJacobianPattern(rows: number[][], n: number): JacobianPattern {
  const sortedRows = rows.map(r => [...new Set(r)].filter(j => j >= 0 && j < n).sort((a, b) => a - b));
  const colRows: number[][] = Array.from({ length: n }, () => []);
  sortedRows.forEach((cols, i) => { for (const j of cols) colRows[j].push(i); });
  const Ap = new Array<number>(n + 1);
  const Ai: number[] = [];
  for (let j = 0; j < n; j++) { Ap[j] = Ai.length; for (const i of colRows[j]) Ai.push(i); }
  Ap[n] = Ai.length;
  // greedy coloring, columns with the most rows first (they have the most conflicts); columns without a row are not perturbed
  const order = Array.from({ length: n }, (_, j) => j).filter(j => colRows[j].length > 0)
    .sort((a, b) => colRows[b].length - colRows[a].length || a - b);
  const color = new Int32Array(n).fill(-1);
  const groups: number[][] = [];
  const forbidden: number[] = [];
  for (const j of order) {
    const stamp = j + 1;
    for (const i of colRows[j]) for (const k of sortedRows[i]) {
      const c = color[k];
      if (c >= 0) forbidden[c] = stamp;
    }
    let c = 0;
    while (forbidden[c] === stamp) c++;
    color[j] = c;
    if (c === groups.length) groups.push([]);
    groups[c].push(j);
  }
  groups.forEach(g => g.sort((a, b) => a - b));
  return { n, rows: sortedRows, colRows, Ap, Ai, groups };
}

/** Union of a pattern with additional (row, column) entries; returns the original object when nothing is new. */
export function extendJacobianPattern(pattern: JacobianPattern, entries: [number, number][]): JacobianPattern {
  const rows = pattern.rows.map(r => r.slice());
  const has = rows.map(r => new Set(r));
  let added = false;
  for (const [i, j] of entries) {
    if (!has[i].has(j)) { has[i].add(j); rows[i].push(j); added = true; }
  }
  return added ? buildJacobianPattern(rows, pattern.n) : pattern;
}
