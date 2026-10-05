/**
 * Structural analysis of an assembled V-Lab DAE (WP-09a, F-025 / F-036).
 *
 *  1. Per-block structural diagnostics: the equation must return exactly one residual row per unknown the assembler
 *     allocated for the block (branches + states) and must not read a branch/state index that was never allocated.
 *     Nothing is padded with 0 or truncated any more; a mismatch is a `DAEStructureError`.
 *  2. A block that is listed in `UNSUPPORTED_BLOCKS` is rejected by vlabTopologyValidation (diagnostic code
 *     `unsupported-block`) naming the missing specification instead of silently simulating a placeholder.
 *  3. Pre-solve structural rank: the sparsity pattern of the assembled Jacobian is detected at generic points and a
 *     maximum bipartite matching (equations <-> unknowns) is computed. A column with no entry is a free multiplier /
 *     branch variable; a deficient matching names the unmatched equations and unknowns together with their blocks.
 *     This runs once per topology next to vlabTopologyValidation, before any Newton iteration.
 */
import type { AssembledSystem, EquationContext } from './types';
import { withStatefulEquationCaches } from './vlabEquations';

export type StructuralCode =
  | 'row-count-mismatch'
  | 'unallocated-index-read'
  | 'free-unknown'
  | 'structural-rank-deficient';

export interface StructuralDiagnostic {
  code: StructuralCode;
  blockId: string;
  blockType: string;
  /** residual rows the allocation requires (branches + states) */
  expectedRows: number;
  /** residual rows the equation returned */
  actualRows: number;
  /** branch/state indices the equation read although they were never allocated, e.g. `branch[2]`; unknown names for rank diagnostics */
  missingIndices: string[];
  reason: string;
}

export class DAEStructureError extends Error {
  readonly diagnostics: StructuralDiagnostic[];
  constructor(diagnostics: StructuralDiagnostic[]) {
    super(
      `Structurally invalid V-Lab model: ${diagnostics.length} problem(s). ` +
      diagnostics.slice(0, 3).map(d => d.reason).join(' | ') +
      (diagnostics.length > 3 ? ` (+${diagnostics.length - 3} more)` : ''),
    );
    this.name = 'DAEStructureError';
    this.diagnostics = diagnostics;
  }
  get diagnostic(): StructuralDiagnostic { return this.diagnostics[0]; }
}

/** Diagnostic for a block whose equation does not match its allocation (rows != unknowns and/or unallocated reads). */
export function rowCountDiagnostic(
  blockId: string, blockType: string, expectedRows: number, actualRows: number, missingIndices: string[],
): StructuralDiagnostic {
  const reads = missingIndices.length ? `; it reads ${missingIndices.join(', ')} which the assembler never allocated` : '';
  const rows = actualRows !== expectedRows
    ? `its equation returns ${actualRows} residual row(s) but the assembler allocated ${expectedRows} unknown(s)`
    : `its equation returns ${actualRows} residual row(s)`;
  return {
    code: actualRows !== expectedRows ? 'row-count-mismatch' : 'unallocated-index-read',
    blockId, blockType, expectedRows, actualRows, missingIndices,
    reason: `Block "${blockId}" (${blockType}): ${rows}${reads}.`,
  };
}

export interface UnsupportedBlockSpec {
  /** work package that owns the missing implementation */
  wp: string;
  /** what is missing, in the vocabulary of the published block (Simscape doc) */
  missingSpec: string;
}

/** Message of the pre-solve diagnostic (vlabTopologyValidation, code `unsupported-block`) for an unsupported block. */
export function unsupportedBlockReason(blockId: string, blockType: string, spec: UnsupportedBlockSpec): string {
  return `Block "${blockId}" (${blockType}) is not supported by the V-Lab solver yet (${spec.wp}): ${spec.missingSpec}.`;
}

/**
 * Blocks whose library ports/equation text promise behaviour the engine cannot represent yet. They are rejected
 * explicitly (never simulated as a placeholder) and each one is mapped to the work package that owns the missing spec.
 */
export const UNSUPPORTED_BLOCKS: Record<string, UnsupportedBlockSpec> = {
  // ── WP-10 (electrical) ──
  phase_splitter: {
    wp: 'WP-10',
    missingSpec: 'composite three-phase port `abc` needs a 3-element (vector) electrical port; the scalar solver ties a, b and c to the one composite node (V_a = V_b = V_c = V_abc), which short-circuits the phases',
  },
  // ── WP-14 (mechanical translational) ──
  lever: {
    wp: 'WP-14',
    missingSpec: 'pivot port `c` has no reaction force and the velocity-ratio sign is unspecified: the library text says v1/L1 = v2/L2, the equation uses v_a = -(L2/L1) v_b and ignores the pivot velocity; needs the published lever kinematics, the moment balance F_a L1 + F_b L2 = 0 and the pivot reaction F_c = -(F_a + F_b)',
  },
  // ── WP-17 (moist air, F-035: allocated outputs that were never driven) ──
  ma_pipe: {
    wp: 'WP-17',
    missingSpec: 'Pipe (MA) pressure-loss law dP = f(L, D, Re) rho v^2/2 with moist-air density, heat exchange through port H, and the `wd` output; only a linear placeholder Pb - Pa = resistance*mdot exists and `wd` is never driven',
  },
  ma_separator: {
    wp: 'WP-17',
    missingSpec: 'Moisture Separator (MA) mass/energy balance with condensation and separation efficiency; the outputs `w` and `d` have no equation and the A-B relation is a placeholder (equal pressure, equal flow)',
  },
  ma_rot_conv: {
    wp: 'WP-17',
    missingSpec: 'Rotational Mechanical Converter (MA) displacement relation (mdot = rho D w, torque = D dp) and the `wd` output; the equation is a heat-transfer placeholder that reads speed and temperatures from the wrong ports and never drives `wd`',
  },
  ma_trans_conv: {
    wp: 'WP-17',
    missingSpec: 'Translational Mechanical Converter (MA) displacement relation (mdot = rho A v, force = A dp) and the `wd` output; the equation is a heat-transfer placeholder that reads velocity and temperatures from the wrong ports and never drives `wd`',
  },
  ma_selector: {
    wp: 'WP-17',
    missingSpec: 'Measurement Selector (MA) takes a composite moist-air measurement on `in` (vector signal) and routes temperature, pressure and humidity to t, p, w; the equation only equates two scalars and the `p` output is never driven',
  },
  ma_pt_sensor: {
    wp: 'WP-17',
    missingSpec: 'Pressure & Temperature Sensor (MA) must report both pressure and temperature of the moist-air node, but the library exposes one scalar output `p`; the equation returns two rows for it and reads `p` itself as the fluid node',
  },
  // ── WP-20 (signal processing, controls, estimators) ──
  bldc_commutation: {
    wp: 'WP-20',
    missingSpec: 'hall-state decoding (3-bit `hall` -> six-step gate pattern, reversed by `dir`) and a 3-wire `abc` output; the equation takes sign(sin(theta)) of the hall input and returns three rows for one scalar port',
  },
  pfc_rectifier_ctrl: {
    wp: 'WP-20',
    missingSpec: 'outer DC-voltage loop (vdc_ref - vdc_sens), inner current loop on vabc_sens/iabc_sens, reactive reference q_ref and the vabc_ref / vis outputs; the equation reads vdc_ref/q_ref/vdc_sens as V_out/V_ref/I_ac, drives one output and leaves `vis` undriven',
  },
  cycloconverter_ctrl: {
    wp: 'WP-20',
    missingSpec: 'per-phase firing-angle generation from v_ref/f_ref with converter feedback (vabc, vcyc, icyc); the equation uses v_ref as the output frequency with a fixed 45 +/- 30 deg sweep and leaves `vis` undriven',
  },
  hysteresis_ctrl_3ph: {
    wp: 'WP-20',
    missingSpec: '3-wire iabc_ref / iabc inputs, a hysteresis-band parameter and per-phase relay memory, and a 3-wire `s` output; the equation indexes six input channels the block does not have (iabc reads 0), returns three rows for one port and outputs 0.5 inside the band instead of holding the previous state',
  },
  im_scalar_ctrl: {
    wp: 'WP-20',
    missingSpec: 'V/f law parameters (rated frequency and voltage, boost) and a 3-wire `vabc` output; the equation hides a 1500 rating, substitutes 1500 when f_ref = 0 and returns a second row for a port that does not exist',
  },
  im_dtc_ctrl: {
    wp: 'WP-20',
    missingSpec: 'stator-flux and torque estimators from vabc/iabc, hysteresis comparators with a switching table and a 6-gate output `g`; the equation reads (flux_ref, tq_ref) and (vabc, iabc) as error pairs and returns two rows for one output',
  },
  im_flux_observer: {
    wp: 'WP-20',
    missingSpec: 'rotor-flux angle `theta`, synchronous speed `we` (slip relation we = wr + (Lm/Tr) iq/psi_r) and stator current in field coordinates `idqsef`, with a 3-wire iabc input; only imr is implemented, so three of the four outputs are undriven',
  },
  quad_decoder: {
    wp: 'WP-20',
    missingSpec: 'A/B/Z edge counting with a position/velocity update from the pulse inputs; the equation never reads a, b or z (state derivative = 0, vel = state, pos = 0)',
  },
  resolver_to_digital: {
    wp: 'WP-20',
    missingSpec: 'tracking loop on the excitation `vp` with the sine/cosine inputs `vx`/`vy` producing `ang` and `vel`; the equation reads vp/vx as sin/cos, drives vel from the angle, holds ang = 0 and keeps a state with zero derivative',
  },
  pmsm_ref_gen: {
    wp: 'WP-20',
    missingSpec: 'torque-to-idq map (MTPA / field weakening with the vdc limit) and the `tq_lim` output; the equation reads w_mech as tq_ref, returns id_ref = 0 and drives two of three outputs',
  },
  park_transform: {
    wp: 'WP-20',
    missingSpec: '3-wire abc input and dq0 output (alpha = (2a - b - c)/3, beta = (b - c)/sqrt(3) need all three phases); the equation reads b, c and theta at across[1..3] although the ports are abc, theta, dq0 (it reads theta as b and its own output as c)',
  },
  inv_park_transform: {
    wp: 'WP-20',
    missingSpec: '3-wire dq0 input and abc output; the equation reads q, zero and theta at across[1..3] although the ports are dq0, theta, abc (theta as q, its own output as zero, theta = 0) and returns three rows for one port',
  },
  sym_comp_transform: {
    wp: 'WP-20',
    missingSpec: 'all three phase channels and the 120-degree operator (V_1 = (V_a + a V_b + a^2 V_c)/3); the equation uses real 0.5 factors and returns three rows for one scalar `seq` port',
  },
};

// ── pattern detection ──────────────────────────────────────────────────────────

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

/**
 * Sparsity pattern of d(residual)/d(unknown) for the backward-Euler Jacobian the solver builds
 * (dx = (x - xprev)/dt), the union of two generic points. `pattern[i]` lists the columns of row i.
 * Returns null when the residual cannot be evaluated at the generic points (the solver reports that itself).
 */
export function detectJacobianPattern(system: AssembledSystem, points = 2): number[][] | null {
  const n = system.systemSize;
  const rows: Set<number>[] = Array.from({ length: n }, () => new Set<number>());
  for (let k = 0; k < points; k++) {
    const rnd = lcg(0x9e3779b9 + 7919 * k);
    const x0 = Array.from({ length: n }, () => 0.35 + 1.3 * rnd());
    const prev = Array.from({ length: n }, () => 0.35 + 1.3 * rnd());
    const ctx: EquationContext = {
      dt: 1, time: 0.137 + 0.11 * k, parameters: {}, prevStates: prev, states: x0.slice(), stateDerivatives: new Array(n).fill(0), order: 1,
    };
    const quietly = <T>(fn: () => T): T => {
      const e = console.error; const w = console.warn;
      console.error = () => {}; console.warn = () => {};
      try { return fn(); } finally { console.error = e; console.warn = w; }
    };
    try {
      // two-argument form (x, ctx): the assembler derives dx = (x - prevStates) / dt, the same Jacobian the solver builds
      const residuals = system.residuals as unknown as (x: number[], ctx: EquationContext) => number[];
      const f0 = quietly(() => residuals(x0.slice(), ctx));
      for (let j = 0; j < n; j++) {
        const xp = x0.slice();
        const h = 1e-3 * Math.max(1, Math.abs(x0[j]));
        xp[j] += h;
        const fp = quietly(() => residuals(xp, ctx));
        for (let i = 0; i < n; i++) {
          const d = Math.abs(fp[i] - f0[i]);
          const scale = Math.max(1, Math.abs(f0[i]), Math.abs(fp[i]));
          if (!(d <= 1e-10 * scale)) rows[i].add(j); // NaN counts as a dependency (never reject on missing information)
        }
      }
    } catch {
      return null;
    }
  }
  return rows.map(r => [...r]);
}

/** Maximum bipartite matching rows -> columns (Kuhn, iterative). matchRow[i] = column or -1. */
export function maximumMatching(pattern: number[][], n: number): { matchRow: number[]; matchCol: number[] } {
  const matchRow = new Array(n).fill(-1);
  const matchCol = new Array(n).fill(-1);
  // greedy start
  for (let i = 0; i < n; i++) {
    for (const j of pattern[i]) if (matchCol[j] === -1) { matchRow[i] = j; matchCol[j] = i; break; }
  }
  const stamp = new Array(n).fill(-1);
  for (let start = 0; start < n; start++) {
    if (matchRow[start] !== -1) continue;
    // iterative DFS for an augmenting path
    const stackRow: number[] = [start];
    const stackIdx: number[] = [0];
    const viaCol: number[] = [];
    let found = false;
    while (stackRow.length) {
      const i = stackRow[stackRow.length - 1];
      const idx = stackIdx[stackIdx.length - 1];
      if (idx >= pattern[i].length) { stackRow.pop(); stackIdx.pop(); viaCol.pop(); continue; }
      stackIdx[stackIdx.length - 1] = idx + 1;
      const j = pattern[i][idx];
      if (stamp[j] === start) continue;
      stamp[j] = start;
      if (matchCol[j] === -1) {
        // augment along the stack
        viaCol.push(j);
        for (let s = stackRow.length - 1; s >= 0; s--) {
          const row = stackRow[s]; const col = viaCol[s];
          matchRow[row] = col; matchCol[col] = row;
        }
        found = true;
        break;
      }
      viaCol.push(j);
      stackRow.push(matchCol[j]);
      stackIdx.push(0);
    }
    void found;
  }
  return { matchRow, matchCol };
}

/** `Across_<root>_<Px|Py|Pz|Rx|Ry|Rz>_(frame|multibodyframe)` */
const FRAME_POSE_VARIABLE = /^Across_.+_(?:Px|Py|Pz|Rx|Ry|Rz)_\((?:frame|multibodyframe)\)$/;

const ownerOf = (system: AssembledSystem, kind: 'variable' | 'row', idx: number): { blockId: string; blockType: string } => {
  const o = kind === 'variable' ? system.structure?.variableOwners[idx] : system.structure?.rowOwners[idx];
  return o ?? { blockId: '', blockType: '' };
};

/**
 * Throws DAEStructureError when an unknown appears in no residual (free multiplier / branch variable) or when the
 * structural rank of the Jacobian is deficient. Returns silently when the residual cannot be probed.
 */
export function assertStructurallyWellPosed(system: AssembledSystem): void {
  const n = system.systemSize;
  if (n === 0) return;
  const full = withStatefulEquationCaches(() => detectJacobianPattern(system));
  if (!full) return;
  const diagnostics: StructuralDiagnostic[] = [];

  // Multibody frame poses are NOT blanket-exempt any more (WP-19a, F-047). The assembler declares exactly what may stay
  // undetermined (system.structure.exemptVariables): the frames of a free body (no World / reference frame in their
  // connected set), the coordinates a joint leaves free (rotation of revolute / universal / spherical, slide of prismatic)
  // and the indeterminate multipliers of a self-referential constraint. The solver resolves those from the previous step.
  // A system assembled without that information falls back to the old behaviour for pose variables only.
  const declared = system.structure?.exemptVariables;
  const exempt = system.variableNames.map(name => !declared && FRAME_POSE_VARIABLE.test(name));
  (declared ?? []).forEach(j => { exempt[j] = true; });
  const pattern = full.map(cols => cols.filter(j => !exempt[j]));

  const used = new Array(n).fill(false);
  pattern.forEach(r => r.forEach(j => { used[j] = true; }));
  for (let j = 0; j < n; j++) {
    if (used[j] || exempt[j]) continue;
    const o = ownerOf(system, 'variable', j);
    diagnostics.push({
      code: 'free-unknown', blockId: o.blockId, blockType: o.blockType, expectedRows: 1, actualRows: 0, missingIndices: [system.variableNames[j]],
      reason: `Unknown "${system.variableNames[j]}"${o.blockId ? ` of block "${o.blockId}" (${o.blockType})` : ''} appears in no residual: it is a free variable.`,
    });
  }
  if (diagnostics.length) throw new DAEStructureError(diagnostics);

  const { matchRow, matchCol } = maximumMatching(pattern, n);
  const unmatchedRows: number[] = []; const unmatchedCols: number[] = [];
  for (let i = 0; i < n; i++) if (matchRow[i] === -1) unmatchedRows.push(i);
  for (let j = 0; j < n; j++) if (matchCol[j] === -1 && !exempt[j]) unmatchedCols.push(j);
  if (unmatchedCols.length === 0) return; // every determined unknown has its own equation

  const describeVar = (j: number) => system.variableNames[j];
  const describeRow = (i: number) => {
    const o = ownerOf(system, 'row', i);
    return o.blockId ? `${o.blockId} (${o.blockType}) row for ${system.variableNames[i]}` : `row for ${system.variableNames[i]}`;
  };
  const blocks = new Map<string, string>();
  for (const i of unmatchedRows) { const o = ownerOf(system, 'row', i); if (o.blockId) blocks.set(o.blockId, o.blockType); }
  for (const j of unmatchedCols) { const o = ownerOf(system, 'variable', j); if (o.blockId) blocks.set(o.blockId, o.blockType); }
  const first = [...blocks.entries()][0] ?? ['', ''];
  diagnostics.push({
    code: 'structural-rank-deficient', blockId: first[0], blockType: first[1],
    expectedRows: n, actualRows: n - unmatchedCols.length,
    missingIndices: unmatchedCols.map(describeVar),
    reason:
      `Structural rank ${n - unmatchedCols.length} < ${n}: unmatched equation(s) [${unmatchedRows.slice(0, 6).map(describeRow).join('; ')}] ` +
      `and unmatched unknown(s) [${unmatchedCols.slice(0, 6).map(describeVar).join('; ')}]` +
      (blocks.size ? `; blocks involved: ${[...blocks.entries()].map(([id, t]) => `${id} (${t})`).join(', ')}` : '') + '.',
  });
  throw new DAEStructureError(diagnostics);
}
