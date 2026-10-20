// EC-08a acceptance tests: operating-point grid sweeps and calibration export (engine-calibration-spec.md §2 DoE Sweeper row:
// "Optimal Calibration Map exports directly to your existing Mapped SI/CI Engine block", ECU map mode, DOE module).
//   Grid mode (param operatingPoints = 'Grid'): operating points opSpeeds x opLoads (speed slowest), the factor design runs at each
//   operating point; extra outputs N_set [rpm] and Load [%]; global point index = op * nDesign + i; rows carry op = { N, Load }.
//   calibrationMapsFromResults: per operating point the best feasible row (min objective) gives map_<factor>[speed][load];
//     an operating point without a feasible row is listed in `missing` and filled from the nearest operating point that has one
//     (distance on speed/load normalised by their ranges; ties -> same speed first, then lower speed, then lower load).
//   mappedEngineTablesFromResults: Mapped SI/CI Engine tables (rows = commanded torque, cols = speed):
//     f_tbrake_n_bpt = opSpeeds, f_tbrake_t_bpt = opLoads/100 * T_ref, f_tbrake[j][i] = best T_brake, f_fuel[j][i] = BSFC*T*omega/3.6e9.
//   doeModuleTable: headers = factors (+ 'N', 'Load' in grid mode) + responses; one data row per sweep row.
import { describe, it, expect } from 'vitest';
import { BLOCK_LIBRARY } from '../BlockDefinitions';
import { XbridgesEngine } from '../XbridgesEngine';
import { Solvers } from '../Solvers';
import { makeBus } from '../bus/busCore';
import { doeSweeperResults } from './blocks/doeSweeper';
import { calibrationMapsFromResults, mappedEngineTablesFromResults, doeModuleTable } from './calibrationExport';

function gridSweep(PmaxLimit = 1e9) {
  const plant: any = {
    id: 'plant', type: 'TestPlant', params: {},
    inputs: ['x', 'n', 'load'].map(id => ({ id, name: id, type: 'auto', direction: 'input', value: 0 })),
    outputs: [{ id: 'Responses', name: 'Responses', type: 'auto', direction: 'output', value: {} }],
    execute: (ins: any[]) => {
      const soi = Array.isArray(ins[0]) ? ins[0][0] : 0, N = Number(ins[1]), L = Number(ins[2]);
      const best = 4 * N / 1000 + 0.04 * L;
      return { outputs: [makeBus(['T_brake', 'BSFC', 'P_max', 'T_exh', 'NOx'], [2 * L, 200 + (soi - best) ** 2, (N === 2500 && L === 75) ? 2e7 : 8e6, 800, 5])] };
    },
  };
  const sw = BLOCK_LIBRARY.PT_DOE_SWEEPER('sw', { designType: 'Full Factorial', factors: 'SOI', bounds: [[0, 12]], levels: 4, dwell: 1, averageWindow: 0.5,
    operatingPoints: 'Grid', opSpeeds: [1500, 2500], opLoads: [25, 75], Pmax_limit: PmaxLimit, Texh_limit: 1050 });
  const c = (s: string, sp: string, t: string, tp: string) => ({ sourceBlock: s, sourcePort: sp, targetBlock: t, targetPort: tp });
  const e = new XbridgesEngine({ blocks: [sw, plant], connections: [c('sw', 'NextPoint', 'plant', 'x'), c('sw', 'N_set', 'plant', 'n'), c('sw', 'Load', 'plant', 'load'),
    c('plant', 'Responses', 'sw', 'Responses')] } as any);
  Solvers.runFixedStep(e, { solver: 'ode4', startTime: 0, stopTime: 16.5, fixedStep: 0.05 } as any);
  return { e, rows: doeSweeperResults(e.getBlock('sw')!.state) };
}

describe('DoE Sweeper grid mode', () => {
  it('adds N_set and Load outputs only in grid mode', () => {
    expect(BLOCK_LIBRARY.PT_DOE_SWEEPER('a', {}).outputs.map(p => p.id)).toEqual(['Info', 'NextPoint', 'PointIndex', 'Done']);
    expect(BLOCK_LIBRARY.PT_DOE_SWEEPER('b', { operatingPoints: 'Grid' }).outputs.map(p => [p.id, p.unit]))
      .toEqual([['Info', 'bus'], ['NextPoint', '1'], ['PointIndex', '1'], ['Done', '1'], ['N_set', 'rpm'], ['Load', '%']]);
  });

  it('runs the design at every operating point, speed slowest', () => {
    const { e, rows } = gridSweep();
    expect(e.getSignalValue('sw', 'Done')).toBe(1);
    expect(rows).toHaveLength(16);
    expect(rows.map(r => [r.op!.N, r.op!.Load, r.point[0]]).slice(0, 5)).toEqual([[1500, 25, 0], [1500, 25, 4], [1500, 25, 8], [1500, 25, 12], [1500, 75, 0]]);
    expect(rows[15].op).toEqual({ N: 2500, Load: 75 });
  });
});

describe('calibration export', () => {
  it('ECU maps take the best feasible factor value per operating point', () => {
    const { rows } = gridSweep();
    const m = calibrationMapsFromResults(rows, ['SOI'], { objective: 'BSFC' });
    expect(m.speedBp).toEqual([1500, 2500]);
    expect(m.loadBp).toEqual([25, 75]);
    expect(m.maps.SOI).toEqual([[8, 8], [12, 12]]);
    expect(m.missing).toEqual([]);
  });

  it('fills an operating point without feasible rows from the nearest one and reports it', () => {
    const { rows } = gridSweep(1e7);
    const m = calibrationMapsFromResults(rows, ['SOI'], { objective: 'BSFC' });
    expect(m.missing).toEqual([{ N: 2500, Load: 75 }]);
    expect(m.maps.SOI[1][1]).toBe(12); // from (2500, 25)
  });

  it('Mapped Engine tables: torque axis from load, fuel from BSFC', () => {
    const { rows } = gridSweep();
    const t = mappedEngineTablesFromResults(rows, { objective: 'BSFC', T_ref: 200 });
    expect(t.f_tbrake_n_bpt).toEqual([1500, 2500]);
    expect(t.f_tbrake_t_bpt).toEqual([50, 150]);
    expect(t.f_tbrake).toEqual([[50, 50], [150, 150]]);
    const fuel = (bsfc: number, T: number, N: number) => bsfc * T * N * 2 * Math.PI / 60 / 3.6e9;
    // best rows: (1500,25) SOI 8 -> BSFC 200 + (8-7)^2 = 201; (2500,75) SOI 12 -> 200 + (12-13)^2 = 201
    expect(t.f_fuel[0][0]).toBeCloseTo(fuel(201, 50, 1500), 15);
    expect(t.f_fuel[1][1]).toBeCloseTo(fuel(201, 150, 2500), 15);
  });

  it('DOE module table with operating-point columns', () => {
    const { rows } = gridSweep();
    const d = doeModuleTable(rows, ['SOI'], ['BSFC', 'T_brake']);
    expect(d.headers).toEqual(['SOI', 'N', 'Load', 'BSFC', 'T_brake']);
    expect(d.data).toHaveLength(16);
    expect(d.data[2]).toEqual([8, 1500, 25, 201, 50]);
  });
});

describe('powertrain blocks follow parameters edited in place (canvas main-thread path uses Object.assign)', () => {
  it('a changed ratio takes effect on the next evaluation', () => {
    const b = BLOCK_LIBRARY.PT_OPEN_DIFFERENTIAL('d', { Ndiff: 4, eta: 1, bw: 0 });
    const r1 = b.execute([100, 50, 50], b.params, b.state, 0);
    Object.assign(b.params, { Ndiff: 5 });
    const r2 = b.execute([100, 50, 50], b.params, b.state, 0);
    expect(r1.outputs[1]).toBe(200);
    expect(r2.outputs[1]).toBe(250);
  });
});
