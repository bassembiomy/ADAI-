// MR-PLD map generation acceptance tests (powertrain/mrPldMaps.ts): ECU maps of a unit-pump diesel (Mercedes MR-PLD style)
// generated from DoE Sweeper results. Q = fuel quantity per stroke [mg] = Load [%] * qPerLoad.
//   baseSoiMap         (map 1)  speed x Q -> SOI [deg BTDC] of the best feasible row (min BSFC) per operating point
//                               (calibrationMapsFromResults semantics, incl. nearest-point fill and `missing`).
//   fullLoadFuelLimit  (map 7)  speed -> highest Q whose operating point has a feasible row; torque = T_brake of the best
//                               feasible row there; limitedBy = sorted unique violations of the rows one load level higher
//                               ([] at the top grid level).
//   smokeLimiterMap    (map 6)  speed x boost -> smoke-limited Q: every row gives Q_s = Q * Lambda / lambdaMin at
//                               boost = P_map / 1e5 [bar abs]; per speed a least-squares line Q_s = a + b * boost over all rows
//                               (feasible or not), evaluated at boostBp and clamped to >= 0.
//   injectionDurationMap (map 3) speed x Q -> energizing time [ms]: per speed the bench rows (factor PW [ms], response m_f [mg])
//                               sorted by m_f and linearly interpolated at each target Q; targets outside the measured
//                               range are clamped to the nearest measured point and listed in `clipped`.
//   toCalibrationMap2D          { X_bp, Y_bp, Z } for a PT_CALIBRATION_MAP_2D block; a 1-D curve becomes Y_bp [0, 1] with two
//                               equal columns.
import { describe, it, expect } from 'vitest';
import type { DoeRow } from './blocks/doeSweeper';
import { calibrationMapsFromResults } from './calibrationExport';
import { baseSoiMap, fullLoadFuelLimit, smokeLimiterMap, injectionDurationMap, toCalibrationMap2D } from './mrPldMaps';

let idx = 0;
const row = (N: number, Load: number, point: number[], responses: Record<string, number>, violations: string[] = []): DoeRow =>
  ({ index: idx++, point, responses, feasible: violations.length === 0, violations, op: { N, Load } });

function engineRows(): DoeRow[] {
  idx = 0;
  const rows: DoeRow[] = [];
  for (const N of [800, 1800]) for (const Load of [50, 100]) for (const soi of [4, 12, 20]) {
    const viol = N === 800 && Load === 100 && soi < 20 ? ['T_exh'] : [];
    const P_map = (1 + Load / 100) * 1e5 * (N === 1800 ? 1.2 : 1);
    rows.push(row(N, Load, [soi, 30], { BSFC: 200 + (soi - (N === 800 ? 12 : 20)) ** 2, T_brake: Load * 15 + soi, Lambda: 2 * P_map / 1e5 / (Load / 50), P_map }, viol));
  }
  return rows;
}

describe('map 1: base SOI', () => {
  it('speed x fuel quantity axes and the best feasible SOI', () => {
    const rows = engineRows();
    const m = baseSoiMap(rows, { qPerLoad: 1.85 });
    expect(m.speedBp).toEqual([800, 1800]);
    expect(m.qBp).toEqual([92.5, 185]);
    expect(m.soi).toEqual(calibrationMapsFromResults(rows, ['SOI'], { objective: 'BSFC' }).maps.SOI);
    expect(m.soi).toEqual([[12, 20], [20, 20]]);
    expect(m.missing).toEqual([]);
  });
});

describe('map 7: full-load fuel limit', () => {
  it('highest feasible fuel quantity per speed with its torque and the limiting constraints', () => {
    const rows = engineRows();
    const f = fullLoadFuelLimit(rows, { qPerLoad: 1.85 });
    expect(f.speedBp).toEqual([800, 1800]);
    expect(f.qMax).toEqual([185, 185]);
    expect(f.torque).toEqual([1520, 1520]);
    expect(f.limitedBy).toEqual([[], []]);
    const tight = rows.map(r => (r.op!.N === 800 && r.op!.Load === 100 ? { ...r, feasible: false, violations: ['Lambda', 'T_exh'] } : r));
    const g = fullLoadFuelLimit(tight, { qPerLoad: 1.85 });
    expect(g.qMax).toEqual([92.5, 185]);
    expect(g.torque).toEqual([762, 1520]);
    expect(g.limitedBy).toEqual([['Lambda', 'T_exh'], []]);
  });
});

describe('map 6: smoke limiter', () => {
  it('least-squares smoke-limited fuel over boost per speed, clamped at zero', () => {
    const rows = engineRows();
    const s = smokeLimiterMap(rows, { qPerLoad: 1.85, lambdaMin: 1.4, boostBp: [0, 1, 2, 3] });
    expect(s.speedBp).toEqual([800, 1800]);
    expect(s.boostBp).toEqual([0, 1, 2, 3]);
    // Q_s = Q * Lambda / 1.4 with Lambda = 2 * boost / (Load / 50) and Q = 1.85 * Load  ->  Q_s = 132.142857... * boost (exactly linear)
    const k = 1.85 * 50 * 2 / 1.4;
    for (let i = 0; i < 2; i++) s.qSmoke[i].forEach((q, j) => expect(q).toBeCloseTo(k * j, 9));
    const neg = smokeLimiterMap(rows.map(r => ({ ...r, responses: { ...r.responses, Lambda: r.responses.Lambda - 3 } })), { qPerLoad: 1.85, lambdaMin: 1.4, boostBp: [0, 3] });
    expect(neg.qSmoke.every(r => r.every(q => q >= 0))).toBe(true);
  });
});

describe('map 3: injection duration', () => {
  it('inverts the bench fuel mass per speed and reports clipped targets', () => {
    idx = 0;
    const bench: DoeRow[] = [];
    for (const N of [800, 1800]) for (const pw of [0.5, 1, 2, 3]) bench.push(row(N, 100, [pw], { m_f: (N === 800 ? 50 : 80) * pw }));
    const d = injectionDurationMap(bench, { qTargets: [50, 100, 185] });
    expect(d.speedBp).toEqual([800, 1800]);
    expect(d.qBp).toEqual([50, 100, 185]);
    expect(d.et[0][0]).toBeCloseTo(1, 12);
    expect(d.et[0][1]).toBeCloseTo(2, 12);
    expect(d.et[0][2]).toBeCloseTo(3, 12); // 185 mg > 150 mg measured at 800 rpm: clamped to the longest measured time
    expect(d.et[1][2]).toBeCloseTo(185 / 80, 12);
    expect(d.clipped).toEqual([{ N: 800, q: 185 }]);
  });
});

describe('Calibration Map 2D parameters', () => {
  it('2-D maps keep their axes; 1-D curves get Y_bp [0, 1] with two equal columns', () => {
    expect(toCalibrationMap2D({ x: [800, 1800], y: [92.5, 185], z: [[1, 2], [3, 4]] })).toEqual({ X_bp: [800, 1800], Y_bp: [92.5, 185], Z: [[1, 2], [3, 4]] });
    expect(toCalibrationMap2D({ x: [800, 1800], z: [185, 170] })).toEqual({ X_bp: [800, 1800], Y_bp: [0, 1], Z: [[185, 185], [170, 170]] });
  });
});
