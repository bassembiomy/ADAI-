/**
 * Structural analysis of an assembled V-Lab DAE (WP-09a, F-025 / F-036).
 *
 *  1. Per-block structural diagnostics: the equation must return exactly one residual row per unknown the assembler
 *     allocated for the block (branches + states) and must not read a branch/state index that was never allocated.
 *     Nothing is padded with 0 or truncated any more; a mismatch is a `DAEStructureError`.
 *  2. A block that is listed in `UNSUPPORTED_BLOCKS` is rejected by vlabTopologyValidation (diagnostic code
 *     `unsupported-block`) naming the missing specification instead of silently simulating a placeholder.
 *     Vector nets (WP-09c) are counted per channel: a width-N signal net has N across unknowns / rows and a width-N output
 *     port N signal branches, a composite three-phase node 3 KCL rows, so these checks stay exact.
 *  3. Pre-solve structural rank: the sparsity pattern of the assembled Jacobian is detected at generic points and a
 *     maximum bipartite matching (equations <-> unknowns) is computed. A column with no entry is a free multiplier /
 *     branch variable; a deficient matching names the unmatched equations and unknowns together with their blocks.
 *     This runs once per topology next to vlabTopologyValidation, before any Newton iteration.
 */
import type { AssembledSystem, EquationContext } from './types';
import { floatingNetworkReason } from './vlabElectricalReference';
import { floatingMechanicalReason, openSourcePortReason } from './vlabMechanicalReference';
import { floatingMagneticReason, floatingThermalReason } from './vlabThermalMagneticReference';
import { floatingFluidReason } from './vlabFluidReference';

export type StructuralCode =
  | 'row-count-mismatch'
  | 'unallocated-index-read'
  | 'free-unknown'
  | 'structural-rank-deficient'
  | 'floating-network';

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
  // (phase_splitter: implemented in WP-09c on the composite three-phase port; park / inv_park / sym_comp: implemented
  // on width-3 vector ports in WP-09c)
  // (lever: implemented in WP-13b with the pivot reaction F_C = -(F_A + F_B) and v_A/v_B = -L1/L2 at a fixed pivot)
  // ── WP-17 (moist air, F-035: allocated outputs that were never driven) ──
  // (ma_pipe, ma_rot_conv, ma_trans_conv and ma_pt_sensor: implemented in WP-17 from Darcy-Weisbach friction, the ideal moist-air piston
  // chamber and the psychrometric relations, see vlabEquations.ts / vlabFluidProperties.ts)
  ma_separator: {
    wp: 'WP-17',
    missingSpec: 'Moisture Separator (MA): the library states only an `efficiency` parameter and the outputs `w` and `d` without meaning or unit. Missing: the quantity that is separated (the V-Lab Moist Air ports carry total pressure and mass flow only, there is no liquid-water or condensate fraction on A), the separation relation (mdot_removed = efficiency * mdot_liquid or a saturation criterion), the condensation energy balance, and the definition and unit of the `w` and `d` outputs',
  },
  ma_selector: {
    wp: 'WP-17',
    missingSpec: 'Measurement Selector (MA) selects temperature, pressure and humidity (t, p, w) from a composite moist-air measurement vector on `in`. Missing: the channel layout and width of that vector (for example [T, p, w]) and a sensor that produces it (ma_pt_sensor, ma_thermo_sensor and ma_moisture_sensor output scalars), so the input has no source to select from',
  },
  // (WP-20b: bldc_commutation, pfc_rectifier_ctrl, cycloconverter_ctrl, hysteresis_ctrl_3ph, im_scalar_ctrl, im_dtc_ctrl, im_flux_observer,
  // quad_decoder, resolver_to_digital and pmsm_ref_gen are implemented from their published algorithms, see vlabControllers.ts)
};

// ── pattern detection ──────────────────────────────────────────────────────────

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

/** Nominal magnitude of an unknown for the structural probe: absolute pressure / temperature potentials and states, else 1. */
function probeNominal(name: string): number {
  if (/^Across_.+_\((gas|fluid|isothermal_liquid|moist_air|moistair|hydraulic)\)$/i.test(name) || /_state_(pressure|p)$/i.test(name)) return 101325;
  if (/^Across_.+_\(thermal\)$/i.test(name) || /_state_(temp|T|Tg|T_w|temperature)$/i.test(name)) return 293.15;
  return 1;
}

/**
 * Sparsity pattern of d(residual)/d(unknown) for the backward-Euler Jacobian the solver builds
 * (dx = (x - xprev)/dt), the union of two generic points. `pattern[i]` lists the columns of row i.
 * Returns null when the residual cannot be evaluated at the generic points (the solver reports that itself).
 */
export function detectJacobianPattern(system: AssembledSystem, points = 2): number[][] | null {
  const n = system.systemSize;
  const rows: Set<number>[] = Array.from({ length: n }, () => new Set<number>());
  // WP-31b (F-098): probe at physically scaled points around the nominal value of each unknown (the same seeds the engine
  // starts from: absolute pressures ~1 atm, absolute temperatures ~293 K), not at p ~ 1 Pa / T ~ 1 K where gas and
  // thermal equations are far from their operating range.
  const nominal = system.variableNames.map(probeNominal);
  for (let k = 0; k < points; k++) {
    const rnd = lcg(0x9e3779b9 + 7919 * k);
    const x0 = Array.from({ length: n }, (_, i) => nominal[i] * (0.35 + 1.3 * rnd()));
    const prev = Array.from({ length: n }, (_, i) => nominal[i] * (0.35 + 1.3 * rnd()));
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
          // 1e-13 (was 1e-10): a stiff row (gas chamber: dp - (R T / V) mdot, coefficients 1 and 8e6) must still show its small coupling
          if (!(d <= 1e-13 * scale)) rows[i].add(j); // NaN counts as a dependency (never reject on missing information)
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
  // F-064: an electrical network with no reference is reported by name, before the (otherwise opaque) rank analysis.
  const floating = system.structure?.floatingElectricalNetworks ?? [];
  if (floating.length) {
    throw new DAEStructureError(floating.map(net => ({
      code: 'floating-network' as const, blockId: net.blocks[0].blockId, blockType: net.blocks[0].blockType,
      expectedRows: 0, actualRows: 0, missingIndices: net.blocks.map(b => b.blockId),
      reason: floatingNetworkReason(net),
    })));
  }
  // WP-13 (F-064): the same for Rotational / Translational networks, and for an ideal torque / force source with an open port.
  const openSources = system.structure?.openSourcePorts ?? [];
  const floatingMech = system.structure?.floatingMechanicalNetworks ?? [];
  if (openSources.length || floatingMech.length) {
    throw new DAEStructureError([
      ...openSources.map(p => ({
        code: 'floating-network' as const, blockId: p.blockId, blockType: p.blockType,
        expectedRows: 0, actualRows: 0, missingIndices: [p.blockId], reason: openSourcePortReason(p),
      })),
      ...floatingMech.map(net => ({
        code: 'floating-network' as const, blockId: net.blocks[0].blockId, blockType: net.blocks[0].blockType,
        expectedRows: 0, actualRows: 0, missingIndices: net.blocks.map(b => b.blockId),
        reason: floatingMechanicalReason(net),
      })),
    ]);
  }
  // WP-15 (F-011, F-064): the same for Thermal and Magnetic networks.
  const floatingThermal = system.structure?.floatingThermalNetworks ?? [];
  const floatingMagnetic = system.structure?.floatingMagneticNetworks ?? [];
  if (floatingThermal.length || floatingMagnetic.length) {
    throw new DAEStructureError([
      ...floatingThermal.map(net => ({
        code: 'floating-network' as const, blockId: net.blocks[0].blockId, blockType: net.blocks[0].blockType,
        expectedRows: 0, actualRows: 0, missingIndices: net.blocks.map(b => b.blockId), reason: floatingThermalReason(net),
      })),
      ...floatingMagnetic.map(net => ({
        code: 'floating-network' as const, blockId: net.blocks[0].blockId, blockType: net.blocks[0].blockType,
        expectedRows: 0, actualRows: 0, missingIndices: net.blocks.map(b => b.blockId), reason: floatingMagneticReason(net),
      })),
    ]);
  }
  // WP-17 (F-064): Fluid / Gas / Isothermal Liquid / Moist Air networks with no pressure datum.
  const floatingFluid = system.structure?.floatingFluidNetworks ?? [];
  if (floatingFluid.length) {
    throw new DAEStructureError(floatingFluid.map(net => ({
      code: 'floating-network' as const, blockId: net.blocks[0].blockId, blockType: net.blocks[0].blockType,
      expectedRows: 0, actualRows: 0, missingIndices: net.blocks.map(b => b.blockId), reason: floatingFluidReason(net.blocks),
    })));
  }
  const full = detectJacobianPattern(system);
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
