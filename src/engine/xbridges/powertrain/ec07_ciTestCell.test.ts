// EC-07 acceptance test: CI engine test cell swept by the DoE Sweeper (engine-calibration-spec.md §2, §3).
// Topology (src/engine/xbridges/powertrain/examples/ciTestCell.ts):
//   Ambient -> Turbocharger (compressor inlet) ; compressor outlet -> charge pipe (Throttle Body, fully open, upstream = P_boost/T_comp)
//   -> Intake Manifold (mdot_in) ; manifold P_map/T_map -> CI Cylinder ; manifold mdot_cyl -> turbo mdot_comp
//   DoE Sweeper NextPoint -> Calibration ECU (DoE override, factorOrder 'SOI,P_rail') -> SOI to cylinder, P_rail and PW to injector,
//   VgtPos to turbo ; Fuel Injector m_f -> cylinder ; cylinder T_brake -> Dyno (speed mode, 2000 rpm) ; dyno N_actual -> cylinder,
//   manifold, injector ; exhaust flow = mdot_cyl + injector mdot_f_mean -> turbo ; cylinder T_exh -> turbo ; turbo P_back -> cylinder P_exh
//   cylinder outputs -> Bus Creator (T_brake, BSFC, P_max, T_exh, NOx) -> sweeper Responses
import { describe, it, expect } from 'vitest';
import { BLOCK_LIBRARY } from '../BlockDefinitions';
import { XbridgesEngine } from '../XbridgesEngine';
import { Solvers } from '../Solvers';
import { buildCiTestCell, CI_TEST_CELL_IDS as ID } from './examples/ciTestCell';
import { doeSweeperResults, bestFeasible, toDoeInputTable } from './blocks/doeSweeper';

describe('CI engine test cell with a DoE sweep', () => {
  it('is built only from registered blocks and wires every powertrain input', () => {
    const { blocks, connections } = buildCiTestCell();
    for (const b of blocks) expect(BLOCK_LIBRARY[b.type], b.type).toBeTypeOf('function');
    for (const id of Object.values(ID)) expect(blocks.some(b => b.id === id), id).toBe(true);
    for (const b of blocks.filter(b => b.type.startsWith('PT_'))) {
      for (const p of b.inputs) expect(connections.some(cn => cn.targetBlock === b.id && cn.targetPort === p.id), `${b.id}.${p.id}`).toBe(true);
    }
  });

  it('sweeps SOI x rail pressure (3 x 3) and finds a feasible BSFC optimum', () => {
    const { blocks, connections } = buildCiTestCell({ design: { factors: 'SOI,P_rail', bounds: [[2, 14], [100, 180]], levels: 3, dwell: 3, averageWindow: 1 },
      limits: { Pmax_limit: 160e5, Texh_limit: 1050 } });
    const e = new XbridgesEngine({ blocks, connections } as any);
    Solvers.runFixedStep(e, { solver: 'ode4', startTime: 0, stopTime: 27.5, fixedStep: 0.01 } as any);
    expect(e.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    expect(e.getSignalValue(ID.sweeper, 'Done')).toBe(1);
    const rows = doeSweeperResults(e.getBlock(ID.sweeper)!.state);
    expect(rows).toHaveLength(9);
    for (const r of rows) {
      expect(r.responses.T_brake, JSON.stringify(r)).toBeGreaterThan(20);
      expect(r.responses.BSFC, JSON.stringify(r)).toBeGreaterThan(170);
      expect(r.responses.BSFC, JSON.stringify(r)).toBeLessThan(330);
      expect(r.responses.T_exh).toBeGreaterThan(450);
      expect(r.responses.T_exh).toBeLessThan(1100);
      expect(r.responses.NOx).toBeGreaterThan(0);
    }
    // earlier injection -> higher peak pressure at every rail pressure (rows: SOI slowest)
    for (let j = 0; j < 3; j++) {
      expect(rows[3 + j].responses.P_max).toBeGreaterThan(rows[j].responses.P_max);
      expect(rows[6 + j].responses.P_max).toBeGreaterThan(rows[3 + j].responses.P_max);
    }
    // more rail pressure at the same pulse width -> more fuel -> more torque
    for (let i = 0; i < 3; i++) expect(rows[3 * i + 2].responses.T_brake).toBeGreaterThan(rows[3 * i].responses.T_brake);
    const best = bestFeasible(rows, 'BSFC');
    expect(best).toBeDefined();
    expect(best!.responses.P_max).toBeLessThanOrEqual(160e5);
    expect(best!.responses.T_exh).toBeLessThanOrEqual(1050);
    const table = toDoeInputTable(rows, ['SOI', 'P_rail'], 'BSFC');
    expect(table.factors).toHaveLength(9);
    // the dyno held the set speed during the sweep
    expect(Math.abs((e.getSignalValue(ID.dyno, 'N_actual') as number) - 2000)).toBeLessThan(20);
  }, 300_000);
});
