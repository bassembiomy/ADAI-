// MR-PLD style ECU maps (unit-pump diesel) generated from DoE Sweeper results (pure functions).
// Q = fuel quantity per stroke [mg] = Load [%] * qPerLoad. Equations are documented in mrPldMaps.test.ts:
//   map 1 base SOI (best feasible row per operating point), map 7 full-load limit (highest feasible Q per speed),
//   map 6 smoke limiter (Q_s = Q*Lambda/lambdaMin, least-squares line over boost per speed),
//   map 3 injection duration (inverse of the bench fuel mass m_f(PW) per speed).
import { bestFeasible, type DoeRow } from './blocks/doeSweeper';
import { calibrationMapsFromResults } from './calibrationExport';

const opOf = (r: DoeRow): { N: number; Load: number } => r.op ?? { N: 0, Load: 0 };
const uniqueSorted = (v: number[]): number[] => [...new Set(v)].sort((a, b) => a - b);
/** Removes binary representation noise of products such as 25 * 1.85 (12 significant digits). */
const tidy = (v: number): number => Number(v.toPrecision(12));

function checkQ(qPerLoad: number): void {
  if (!(typeof qPerLoad === 'number' && Number.isFinite(qPerLoad) && qPerLoad > 0)) throw new Error('qPerLoad (fuel quantity per percent load) must be > 0');
}

export interface BaseSoiMap { speedBp: number[]; qBp: number[]; soi: number[][]; missing: { N: number; Load: number }[] }

/** Map 1: speed x fuel quantity -> SOI [deg BTDC] of the best feasible row (rows: speed, columns: quantity). */
export function baseSoiMap(rows: DoeRow[], opts: { qPerLoad: number; objective?: string }): BaseSoiMap {
  checkQ(opts.qPerLoad);
  const m = calibrationMapsFromResults(rows, ['SOI'], { objective: opts.objective ?? 'BSFC' });
  return { speedBp: m.speedBp, qBp: m.loadBp.map(L => tidy(L * opts.qPerLoad)), soi: m.maps.SOI, missing: m.missing };
}

export interface FullLoadFuelLimit { speedBp: number[]; qMax: number[]; torque: number[]; limitedBy: string[][] }

/** Map 7: per speed the highest quantity with a feasible row, its torque and the constraints violated one load level higher. */
export function fullLoadFuelLimit(rows: DoeRow[], opts: { qPerLoad: number; objective?: string }): FullLoadFuelLimit {
  checkQ(opts.qPerLoad);
  const objective = opts.objective ?? 'BSFC';
  const speedBp = uniqueSorted(rows.map(r => opOf(r).N));
  const qMax: number[] = [], torque: number[] = [], limitedBy: string[][] = [];
  for (const N of speedBp) {
    const atN = rows.filter(r => opOf(r).N === N);
    const loads = uniqueSorted(atN.map(r => opOf(r).Load));
    let found = -1;
    for (let l = loads.length - 1; l >= 0; l--) {
      if (atN.some(r => opOf(r).Load === loads[l] && r.feasible)) { found = l; break; }
    }
    if (found < 0) throw new Error(`No feasible design point at ${N} rpm`);
    const best = bestFeasible(atN.filter(r => opOf(r).Load === loads[found]), objective);
    const T = best?.responses.T_brake;
    if (!best || T === undefined) throw new Error(`Results need the T_brake response and a feasible ${objective} value at ${N} rpm`);
    qMax.push(tidy(loads[found] * opts.qPerLoad));
    torque.push(T);
    limitedBy.push(found === loads.length - 1 ? []
      : [...new Set(atN.filter(r => opOf(r).Load === loads[found + 1]).flatMap(r => r.violations))].sort());
  }
  return { speedBp, qMax, torque, limitedBy };
}

export interface SmokeLimiterMap { speedBp: number[]; boostBp: number[]; qSmoke: number[][] }

/** Map 6: speed x boost [bar abs] -> smoke-limited quantity; least-squares line Q_s = a + b*boost per speed, clamped to >= 0. */
export function smokeLimiterMap(rows: DoeRow[], opts: { qPerLoad: number; lambdaMin: number; boostBp?: number[] }): SmokeLimiterMap {
  checkQ(opts.qPerLoad);
  if (!(Number.isFinite(opts.lambdaMin) && opts.lambdaMin > 0)) throw new Error('lambdaMin must be > 0');
  const boostBp = opts.boostBp ?? [1, 1.5, 2, 2.5, 3];
  if (boostBp.length === 0 || !boostBp.every(b => Number.isFinite(b))) throw new Error('boostBp must be a finite numeric vector');
  const speedBp = uniqueSorted(rows.map(r => opOf(r).N));
  const qSmoke = speedBp.map(N => {
    const pts = rows.filter(r => opOf(r).N === N).map(r => {
      const lam = r.responses.Lambda, pm = r.responses.P_map;
      if (lam === undefined || pm === undefined) throw new Error('Results need the Lambda and P_map responses');
      return { x: pm / 1e5, y: opOf(r).Load * opts.qPerLoad * lam / opts.lambdaMin };
    });
    const n = pts.length;
    const mx = pts.reduce((s, p) => s + p.x, 0) / n, my = pts.reduce((s, p) => s + p.y, 0) / n;
    const sxx = pts.reduce((s, p) => s + (p.x - mx) ** 2, 0), sxy = pts.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0);
    const b = sxx > 0 ? sxy / sxx : 0, a = my - b * mx;
    return boostBp.map(x => Math.max(0, a + b * x));
  });
  return { speedBp, boostBp: [...boostBp], qSmoke };
}

export interface InjectionDurationMap { speedBp: number[]; qBp: number[]; et: number[][]; clipped: { N: number; q: number }[] }

/** Map 3: speed x quantity -> energizing time [ms], from the bench rows (factor PW [ms], response m_f [mg]) by linear interpolation. */
export function injectionDurationMap(rows: DoeRow[], opts: { qTargets: number[] }): InjectionDurationMap {
  const qBp = [...opts.qTargets];
  if (qBp.length === 0 || !qBp.every(q => Number.isFinite(q) && q >= 0)) throw new Error('qTargets must be a numeric vector of values >= 0');
  const speedBp = uniqueSorted(rows.map(r => opOf(r).N));
  const clipped: { N: number; q: number }[] = [];
  const et = speedBp.map(N => {
    const pts = rows.filter(r => opOf(r).N === N).map(r => {
      const m = r.responses.m_f;
      if (m === undefined) throw new Error('Bench results need the m_f response');
      return { m, pw: r.point[0] };
    }).sort((a, b) => a.m - b.m);
    return qBp.map(q => {
      const lo = pts[0], hi = pts[pts.length - 1];
      if (q <= lo.m) { if (q < lo.m) clipped.push({ N, q }); return lo.pw; }
      if (q >= hi.m) { if (q > hi.m) clipped.push({ N, q }); return hi.pw; }
      let k = 1;
      while (pts[k].m < q) k++;
      const a = pts[k - 1], b = pts[k];
      return b.m === a.m ? a.pw : a.pw + (b.pw - a.pw) * (q - a.m) / (b.m - a.m);
    });
  });
  return { speedBp, qBp, et, clipped };
}

/** Parameters of a PT_CALIBRATION_MAP_2D block; a 1-D curve (no y) becomes Y_bp [0, 1] with two equal columns. */
export function toCalibrationMap2D(m: { x: number[]; y?: number[]; z: number[][] | number[] }): { X_bp: number[]; Y_bp: number[]; Z: number[][] } {
  if (m.y) return { X_bp: [...m.x], Y_bp: [...m.y], Z: (m.z as number[][]).map(r => [...r]) };
  return { X_bp: [...m.x], Y_bp: [0, 1], Z: (m.z as number[]).map(v => [v, v]) };
}
