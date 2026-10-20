// Calibration export of DoE Sweeper results (pure): ECU maps, Mapped SI/CI Engine tables and the DOE module table.
// Single-mode rows (no `op`) are treated as one operating point (N = 0, Load = 0), i.e. the ECU-less fallback: speedBp [0], loadBp [0].
import { bestFeasible, type DoeRow } from './blocks/doeSweeper';

export interface OperatingPoint { N: number; Load: number }
export interface CalibrationMaps { speedBp: number[]; loadBp: number[]; maps: Record<string, number[][]>; missing: OperatingPoint[] }
export interface MappedEngineTables {
  f_tbrake_n_bpt: number[]; f_tbrake_t_bpt: number[]; f_tbrake: number[][]; f_fuel: number[][]; f_air: number[][];
}

const TIE_EPS = 1e-12;
const opOf = (r: DoeRow): OperatingPoint => r.op ?? { N: 0, Load: 0 };
const uniqueSorted = (v: number[]): number[] => [...new Set(v)].sort((a, b) => a - b);

interface Grid { speedBp: number[]; loadBp: number[]; best: (DoeRow | undefined)[][]; filled: (DoeRow | undefined)[][]; missing: OperatingPoint[] }

/** Best feasible row (min objective) per operating point; points without one are filled from the nearest point that has one. */
function bestGrid(rows: DoeRow[], objective: string): Grid {
  const speedBp = uniqueSorted(rows.map(r => opOf(r).N));
  const loadBp = uniqueSorted(rows.map(r => opOf(r).Load));
  const best: (DoeRow | undefined)[][] = speedBp.map(() => loadBp.map(() => undefined));
  speedBp.forEach((N, s) => loadBp.forEach((L, l) => {
    best[s][l] = bestFeasible(rows.filter(r => { const o = opOf(r); return o.N === N && o.Load === L; }), objective);
  }));
  const range = (bp: number[]) => { const r = bp[bp.length - 1] - bp[0]; return r === 0 ? 1 : r; };
  const rN = range(speedBp), rL = range(loadBp);
  const filled = best.map(r => [...r]);
  const missing: OperatingPoint[] = [];
  speedBp.forEach((N, s) => loadBp.forEach((L, l) => {
    if (best[s][l]) return;
    if (rows.some(r => { const o = opOf(r); return o.N === N && o.Load === L; })) missing.push({ N, Load: L });
    let pick: { d: number; same: number; s: number; l: number } | undefined;
    speedBp.forEach((_, s2) => loadBp.forEach((_l, l2) => {
      if (!best[s2][l2]) return;
      const d = Math.hypot((speedBp[s2] - N) / rN, (loadBp[l2] - L) / rL);
      const cand = { d, same: s2 === s ? 0 : 1, s: s2, l: l2 };
      if (!pick) { pick = cand; return; }
      if (cand.d < pick.d - TIE_EPS) pick = cand;
      else if (Math.abs(cand.d - pick.d) <= TIE_EPS) {
        if (cand.same !== pick.same ? cand.same < pick.same : cand.s !== pick.s ? cand.s < pick.s : cand.l < pick.l) pick = cand;
      }
    }));
    filled[s][l] = pick ? best[pick.s][pick.l] : undefined;
  }));
  return { speedBp, loadBp, best, filled, missing };
}

/** Row indices of the best feasible row of every operating point (min of the objective). */
export function bestRowIndices(rows: DoeRow[], objective: string): Set<number> {
  const g = bestGrid(rows, objective);
  const out = new Set<number>();
  for (const r of g.best) for (const b of r) if (b) out.add(b.index);
  return out;
}

export function calibrationMapsFromResults(rows: DoeRow[], factorNames: string[], opts: { objective: string }): CalibrationMaps {
  const g = bestGrid(rows, opts.objective);
  const maps: Record<string, number[][]> = {};
  factorNames.forEach((name, k) => {
    maps[name] = g.filled.map(r => r.map(b => {
      if (!b) throw new Error('No feasible design point in any operating point');
      return b.point[k];
    }));
  });
  return { speedBp: g.speedBp, loadBp: g.loadBp, maps, missing: g.missing };
}

/** Mapped SI/CI Engine tables: rows = commanded torque (Load/100*T_ref), columns = speed. */
export function mappedEngineTablesFromResults(rows: DoeRow[], opts: { objective: string; T_ref: number; afr?: number }): MappedEngineTables {
  const afr = opts.afr ?? 22;
  const g = bestGrid(rows, opts.objective);
  const tbrake: number[][] = g.loadBp.map(() => g.speedBp.map(() => 0));
  const fuel: number[][] = g.loadBp.map(() => g.speedBp.map(() => 0));
  g.speedBp.forEach((N, i) => g.loadBp.forEach((_L, j) => {
    const b = g.filled[i][j];
    if (!b) throw new Error('No feasible design point in any operating point');
    const T = b.responses.T_brake, bsfc = b.responses.BSFC;
    if (T === undefined || bsfc === undefined) throw new Error('Results need the T_brake and BSFC responses');
    tbrake[j][i] = T;
    fuel[j][i] = bsfc * T * N * 2 * Math.PI / 60 / 3.6e9;
  }));
  return {
    f_tbrake_n_bpt: [...g.speedBp], f_tbrake_t_bpt: g.loadBp.map(L => L / 100 * opts.T_ref),
    f_tbrake: tbrake, f_fuel: fuel, f_air: fuel.map(r => r.map(f => f * afr)),
  };
}

export function doeModuleTable(rows: DoeRow[], factorNames: string[], responseNames: string[]): { headers: string[]; data: number[][] } {
  const grid = rows.some(r => r.op !== undefined);
  const headers = [...factorNames, ...(grid ? ['N', 'Load'] : []), ...responseNames];
  const data = rows.map(r => [
    ...factorNames.map((_, k) => r.point[k]),
    ...(grid ? [opOf(r).N, opOf(r).Load] : []),
    ...responseNames.map(n => r.responses[n] ?? 0),
  ]);
  return { headers, data };
}
