/**
 * WP-07: derivation of the REQUIRED-port tables used by pre-simulation topology validation.
 *
 * Signal inputs (behavioural): port p of block b is required when perturbing across[p] changes the block's residual
 * while p is reported as NOT wired (`connectedPorts` without p). An `inputOrParam` fallback ignores the port when it
 * is unwired, so it is optional; a raw `across[i]` read keeps consuming the unwired port (a silent 0), so it is required.
 * A port the equation never reads cannot cause a silent zero and is optional.
 *
 * Conserving ports (structural): assemble the block alone with the real DAEAssembler, build the residual Jacobian
 * J = dF/dx + (1/h) dF/d(dx) at generic points, and tie every conserving port to a reference by a unit shunt on its across
 * node's row. If J is nonsingular with every port tied, then port k is REQUIRED when leaving only k open (no shunt)
 * makes J singular. A block that is already singular with
 * every port tied cannot be judged per port and is reported in `ill_posed` (no required ports are claimed for it).
 */
import { VLAB_LIBRARY, type VLabBlock } from '../../../utils/vlabLibrary';
import { DAEAssembler } from '../DAEAssembler';
import { blockEquations, type BlockEquationArgs } from '../vlabEquations';
import { assembleSingleBlock, libraryDefaults } from './contractInventory';

const CONSERVING = new Set(['electrical', 'thermal', 'translational', 'rotational', 'magnetic', 'fluid', 'gas', 'isothermal_liquid', 'frame', 'multibodyframe']);
const FRAME = new Set(['frame', 'multibodyframe']);

const quiet = <T>(fn: () => T): T => {
  const e = console.error; const w = console.warn;
  console.error = () => {}; console.warn = () => {};
  try { return fn(); } finally { console.error = e; console.warn = w; }
};

const rng = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

export function requiredSignalInputs(b: VLabBlock): string[] {
  const fn = blockEquations[b.id];
  if (!fn) return [];
  const asm = assembleSingleBlock(b);
  if (!asm.assembled) return [];
  const ports = b.ports.map(p => p.id);
  const inputs = b.ports.filter(p => (p.domain ?? '').toLowerCase() === 'physical' && p.direction === 'in');
  const params = libraryDefaults(b);
  const required: string[] = [];
  for (const inp of inputs) {
    let consumed = false;
    for (let seed = 1; seed <= 4 && !consumed; seed++) {
      const r = rng(seed * 7919);
      const mk = (n: number) => Array.from({ length: n }, () => 0.5 + r());
      const baseAcross = ports.map(id => (FRAME.has(asm.portDomains[id] ?? '') ? mk(6) : 0.5 + r()));
      const branch = mk(asm.allocatedBranches); const state = mk(asm.allocatedStates);
      const dAcross = ports.map(id => (FRAME.has(asm.portDomains[id] ?? '') ? mk(6) : 0.5 + r()));
      const idx = ports.indexOf(inp.id);
      try {
        // everything except across[p] is held fixed between the two evaluations
        const fixed = { dB: mk(asm.allocatedBranches), dS: mk(asm.allocatedStates), prev: mk(asm.systemSize) };
        const call = (across: any[]) => {
          const ctx: any = { dt: 1e-3, time: 0.1, parameters: {}, prevStates: fixed.prev, states: fixed.prev, stateDerivatives: fixed.prev, order: 1 };
          return quiet(() => fn({
            across, dAcross, branch, dBranch: fixed.dB, state, dState: fixed.dS, ctx, params, ports, nodeId: 'dut',
            connectedPorts: ports.filter(id => id !== inp.id),
          } as BlockEquationArgs));
        };
        const a0 = call(baseAcross);
        for (const delta of [1.37, -2.9, 40]) {
          const pert = baseAcross.slice();
          pert[idx] = Array.isArray(pert[idx]) ? (pert[idx] as number[]).map(v => v + delta) : (pert[idx] as number) + delta;
          const a1 = call(pert);
          if (a0.length !== a1.length || a0.some((v, i) => !Object.is(v, a1[i]) && !(Math.abs(v - a1[i]) <= 1e-12 * (1 + Math.abs(v))))) { consumed = true; break; }
        }
      } catch { /* equation threw for the random point: treated as not consumed (conservative: optional) */ }
    }
    if (consumed) required.push(inp.id);
  }
  return required;
}

// ── structural conserving-port analysis ──
type Matrix = number[][];

function rankOf(m: Matrix): number {
  const n = m.length;
  const a = m.map(r => r.slice());
  // equilibrate: rows then columns, so decades-apart parameters (Roff = 1e9) do not hide unit entries
  for (const r of a) { const s = Math.max(...r.map(Math.abs)); if (s > 0) for (let c = 0; c < r.length; c++) r[c] /= s; }
  for (let c = 0; c < (a[0]?.length ?? 0); c++) { const s = Math.max(...a.map(r => Math.abs(r[c]))); if (s > 0) for (const r of a) r[c] /= s; }
  const tol = 1e-9 * n;
  let rank = 0;
  const used = new Array(n).fill(false);
  for (let col = 0; col < (a[0]?.length ?? 0); col++) {
    let best = -1; let bv = tol;
    for (let r = 0; r < n; r++) if (!used[r] && Math.abs(a[r][col]) > bv) { bv = Math.abs(a[r][col]); best = r; }
    if (best < 0) continue;
    used[best] = true; rank++;
    for (let r = 0; r < n; r++) {
      if (r === best) continue;
      const f = a[r][col] / a[best][col];
      if (f !== 0) for (let c = col; c < a[r].length; c++) a[r][c] -= f * a[best][c];
    }
  }
  return rank;
}

export interface ConservingAnalysis { required: string[]; illPosed: boolean; sampled: boolean }

export function requiredConservingPorts(b: VLabBlock): ConservingAnalysis {
  const conserving = b.ports.filter(p => CONSERVING.has((p.domain ?? '').toLowerCase()));
  if (conserving.length === 0) return { required: [], illPosed: false, sampled: false };
  let sys: ReturnType<DAEAssembler['assemble']>;
  try {
    const node: any = { id: 'dut', type: 'default', position: { x: 0, y: 0 }, data: { type: b.id, params: libraryDefaults(b), ports: b.ports } };
    sys = quiet(() => new DAEAssembler().assemble([node], []));
  } catch { return { required: [], illPosed: true, sampled: false }; }
  const n = sys.systemSize;
  if (n === 0) return { required: [], illPosed: false, sampled: true };

  const rowsOf = new Map<string, number[]>();
  for (const p of conserving) {
    const rows: number[] = [];
    sys.variableNames.forEach((name, i) => {
      if (name.startsWith(`Across_dut_${p.id}_(`) || new RegExp(`^Across_dut_${p.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_(Px|Py|Pz|Rx|Ry|Rz)_\\(`).test(name)) rows.push(i);
    });
    rowsOf.set(p.id, rows);
  }

  const h = 1e-3;
  const jacobian = (x: number[], dx: number[]): Matrix | null => {
    const ctx = () => ({ dt: h, time: 0.1, parameters: {}, prevStates: x.map(v => v * 0.99), states: x, stateDerivatives: dx, order: 1 }) as any;
    const F = (xv: number[], dxv: number[]) => quiet(() => sys.residuals(xv, dxv, ctx()));
    const J: Matrix = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let j = 0; j < n; j++) {
      const eps = 1e-6 * (1 + Math.abs(x[j]));
      const xp = x.slice(); xp[j] += eps; const xm = x.slice(); xm[j] -= eps;
      const dp = dx.slice(); dp[j] += eps; const dm = dx.slice(); dm[j] -= eps;
      const fxp = F(xp, dx), fxm = F(xm, dx), fdp = F(x, dp), fdm = F(x, dm);
      for (let i = 0; i < n; i++) {
        const v = (fxp[i] - fxm[i]) / (2 * eps) + (1 / h) * (fdp[i] - fdm[i]) / (2 * eps);
        if (!Number.isFinite(v)) return null;
        J[i][j] = v;
      }
    }
    return J;
  };

  // "Tied to a reference" = a unit shunt from the port's across node to a fixed reference potential: it adds
  // d(row)/d(across) = 1 to that node's row, keeps its KCL row, and (unlike a Dirichlet row) does not
  // over-specify an ideal source or hide the block's own through variable.
  const withPins = (J: Matrix, pinned: Set<string>): Matrix => {
    const M = J.map(r => r.slice());
    for (const id of pinned) for (const row of rowsOf.get(id) ?? []) M[row][row] += 1;
    return M;
  };

  const allIds = new Set(conserving.map(p => p.id));
  const conservingRows = new Set([...rowsOf.values()].flat());
  const points: Matrix[] = [];
  for (let seed = 1; seed <= 4; seed++) {
    const r = rng(seed * 104729);
    const x = Array.from({ length: n }, () => 0.5 + r());
    const dx = Array.from({ length: n }, () => 0.5 + r());
    const J = jacobian(x, dx);
    if (J) points.push(J);
  }
  if (points.length === 0) return { required: [], illPosed: true, sampled: true };

  // A row that is identically zero at every sample and is not a conserving node's row is a residual the block
  // does not implement (a DAE allocation defect owned by WP-09, e.g. an unused signal branch). It is the same
  // defect with every port tied or open, so it is pinned and cannot decide which port is required.
  const artefactRows: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!conservingRows.has(i) && points.every(J => J[i].every(v => Math.abs(v) < 1e-12))) artefactRows.push(i);
  }
  const padded = points.map(J => {
    const M = J.map(r => r.slice());
    for (const i of artefactRows) { M[i] = new Array(n).fill(0); M[i][i] = 1; }
    return M;
  });

  const solvable = (open: string | null): boolean => padded.some(J => {
    const pinned = new Set(allIds); if (open) pinned.delete(open);
    return rankOf(withPins(J, pinned)) === n;
  });
  if (!solvable(null)) return { required: [], illPosed: true, sampled: true };
  // Frame ports are never reported: the assembler and ImplicitSolver deliberately accept open frame nodes
  // (floatingFrameNodeIds, sphericalFrameRoots, allowUnderdetermined/preferFreeColumns for free rotation DOFs), so a
  // structurally singular frame system is a supported state, not a failure.
  const required = conserving.filter(p => !FRAME.has((p.domain ?? '').toLowerCase()) && !solvable(p.id)).map(p => p.id);
  return { required, illPosed: false, sampled: true };
}

export interface RequiredTables {
  signal: Record<string, string[]>;
  conserving: Record<string, string[]>;
  illPosed: string[];
}

export function deriveRequiredTables(): RequiredTables {
  const signal: Record<string, string[]> = {}; const conserving: Record<string, string[]> = {}; const illPosed: string[] = [];
  for (const d of VLAB_LIBRARY) for (const b of d.blocks) {
    const s = requiredSignalInputs(b);
    if (s.length) signal[b.id] = s;
    const c = requiredConservingPorts(b);
    if (c.illPosed) illPosed.push(b.id);
    if (c.required.length) conserving[b.id] = c.required;
  }
  const sortObj = <T,>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
  return { signal: sortObj(signal), conserving: sortObj(conserving), illPosed: illPosed.sort() };
}

