// Learning lab acceptance tests: V8 common-rail diesel engine mapping, optimisation and calibrated control in X-Bridges,
// built only from Powertrain Blockset blocks (examples/ciV8MappingLab.ts, registered in XBRIDGES_LEARNING_LABS).
//   Engine: 6.6 L V8 (B 103 mm, S 99 mm, CR 16.8, L 165 mm, 8 cylinders), VGT turbocharger, ideal intercooler (manifold inlet
//   temperature = ambient), no EGR. The test cell sweeps a 3 x 3 speed/load grid (1200/1800/2400 rpm x 40/70/100 %) with a
//   3-level full factorial in SOI [2, 18] deg and P_rail [100, 180] MPa (dwell 2 s), limits P_max 135 bar and T_exh 950 K,
//   objective BSFC. Speed x load Calibration Map 2D blocks supply fuel pulse width, throttle angle, burn duration, ignition
//   delay and in-cylinder pressure at injection. Solver euler, fixed step 0.02 s, cylinder crank-angle step 2 deg.
//   CI/SI Cylinder Info buses carry T_brake, BSFC, P_max, T_exh and NOx so the cylinder Info feeds the sweeper directly.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BLOCK_LIBRARY } from '../BlockDefinitions';
import { XbridgesEngine } from '../XbridgesEngine';
import { Solvers } from '../Solvers';
import { getPowertrainSpec } from './index';
import { doeSweeperResults, type DoeRow } from './blocks/doeSweeper';
import { calibrationMapsFromResults } from './calibrationExport';
import { CI_V8_MAPPING_LAB as LAB, CI_V8_MAPPING_LAB_STEPS as STEPS } from './examples/ciV8MappingLab';

const node = (id: string) => LAB.nodes.find(n => n.id === id)!;
const POINTS = 9 * 9, DWELL = 2;

function run(paramOverrides: Record<string, Record<string, any>> = {}) {
  const blocks = LAB.nodes.map(n => BLOCK_LIBRARY[n.type](n.id, { ...(n.params ?? {}), ...(paramOverrides[n.id] ?? {}) }));
  const connections = LAB.edges.map(e => ({ sourceBlock: e.source, sourcePort: e.sourceHandle, targetBlock: e.target, targetPort: e.targetHandle }));
  const e = new XbridgesEngine({ blocks, connections } as any);
  Solvers.runFixedStep(e, { solver: LAB.solverType, startTime: 0, stopTime: POINTS * DWELL + LAB.fixedStep, fixedStep: LAB.fixedStep } as any);
  expect(e.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  expect(e.getSignalValue('doe', 'Done')).toBe(1);
  return doeSweeperResults(e.getBlock('doe')!.state);
}
const byOp = (rows: DoeRow[]) => {
  const m = new Map<string, DoeRow[]>();
  for (const r of rows) { const k = `${r.op!.N}/${r.op!.Load}`; m.set(k, [...(m.get(k) ?? []), r]); }
  return m;
};
const best = (rs: DoeRow[]) => rs.filter(r => r.feasible).sort((a, b) => a.responses.BSFC - b.responses.BSFC)[0];

describe('CI cylinder Info carries the DoE responses', () => {
  it('T_brake, BSFC, P_max, T_exh and NOx equal the outputs (CI and SI)', () => {
    const b = BLOCK_LIBRARY.PT_CI_CYLINDER('c', {});
    const o = b.execute([2000, 40, 8, 50, 5, 1.5e5, 320, 1.6e5], b.params, b.state, 0).outputs;
    const info = o[0] as any;
    expect([info.T_brake, info.BSFC, info.T_exh, info.P_max, info.NOx]).toEqual([o[1], o[4], o[5], o[6], o[7]]);
    const s = BLOCK_LIBRARY.PT_SI_CYLINDER('s', {});
    const so = s.execute([2000, 20, 0.02, 0.0014, 1, 0.8e5, 300, 1.05e5], s.params, s.state, 0).outputs;
    const si = so[0] as any;
    expect([si.T_brake, si.BSFC, si.T_exh, si.P_max, si.NOx]).toEqual([so[1], so[2], so[4], so[7], so[8]]);
  });
});

describe('V8 diesel mapping lab: model', () => {
  it('uses only Powertrain Blockset blocks, valid ports, and connects every input that the model needs', () => {
    for (const n of LAB.nodes) expect(getPowertrainSpec(n.type), n.type).toBeDefined();
    const blocks = new Map(LAB.nodes.map(n => [n.id, BLOCK_LIBRARY[n.type](n.id, n.params ?? {})]));
    for (const e of LAB.edges) {
      expect(blocks.get(e.source)?.outputs.some(p => p.id === e.sourceHandle), `${e.id} source`).toBe(true);
      expect(blocks.get(e.target)?.inputs.some(p => p.id === e.targetHandle), `${e.id} target`).toBe(true);
    }
    const intentionallyOpen = new Set(['dyno.T_set', 'manifold.mdot_egr', 'engineMap.TrqCmd', 'engineMap.EngSpd']);
    for (const [id, b] of blocks) for (const p of b.inputs) {
      const k = `${id}.${p.id}`;
      if (intentionallyOpen.has(k)) continue;
      expect(LAB.edges.some(e => e.target === id && e.targetHandle === p.id), `${k} connected`).toBe(true);
    }
    expect(new Set(LAB.edges.map(e => e.id)).size).toBe(LAB.edges.length);
  });

  it('compiles without unit warnings: the Calibration Map 2D ports inherit the units of the connected signals', () => {
    const map = BLOCK_LIBRARY.PT_CALIBRATION_MAP_2D('m', {});
    expect([...map.inputs, ...map.outputs].map(p => p.unit)).toEqual(['inherit', 'inherit', 'inherit']);
    const blocks = LAB.nodes.map(n => BLOCK_LIBRARY[n.type](n.id, n.params ?? {}));
    const e = new XbridgesEngine({ blocks, connections: LAB.edges.map(x => ({ sourceBlock: x.source, sourcePort: x.sourceHandle, targetBlock: x.target, targetPort: x.targetHandle })) } as any);
    Solvers.runFixedStep(e, { solver: 'euler', startTime: 0, stopTime: 0.04, fixedStep: 0.02 } as any);
    expect(e.diagnostics.filter(d => d.code === 'UNIT_INCONSISTENCY')).toEqual([]);
  });

  it('is an 8-cylinder 6.6 L engine with consistent cylinder, injector and manifold data', () => {
    const c = node('cylinder').params!;
    expect([c.B, c.S, c.L, c.CR, c.Ncyl, c.dTheta]).toEqual([0.103, 0.099, 0.165, 16.8, 8, 2]);
    expect(node('injector').params!.N_cyl).toBe(8);
    const vd = 8 * Math.PI / 4 * 0.103 ** 2 * 0.099;
    expect(Math.abs(node('manifold').params!.Vd_tot - vd) / vd).toBeLessThan(0.01);
    expect(node('engineMap').type).toBe('PT_MAPPED_CI_ENGINE');
    expect([LAB.solverType, LAB.fixedStep]).toEqual(['euler', 0.02]);
    const d = node('doe').params!;
    expect([d.operatingPoints, d.opSpeeds, d.opLoads, d.factors, d.bounds, d.levels, d.dwell, d.Pmax_limit, d.Texh_limit, d.objective])
      .toEqual(['Grid', [1200, 1800, 2400], [40, 70, 100], 'SOI,P_rail', [[2, 18], [100, 180]], 3, DWELL, 135e5, 950, 'BSFC']);
  });
});

describe('V8 diesel mapping lab: DoE, optimisation and calibrated control', () => {
  it('sweeps the grid, finds a feasible optimum at every operating point and controls the engine with the exported maps', () => {
    const rows = run();
    expect(rows).toHaveLength(POINTS);
    const ops = byOp(rows);
    expect(ops.size).toBe(9);
    for (const [k, rs] of ops) {
      const b = best(rs);
      expect(b, k).toBeDefined();
      expect(b.responses.BSFC, k).toBeGreaterThan(170);
      expect(b.responses.BSFC, k).toBeLessThan(215);
    }
    for (const N of [1200, 1800, 2400]) expect(best(ops.get(`${N}/100`)!).responses.T_brake).toBeGreaterThan(best(ops.get(`${N}/40`)!).responses.T_brake);
    // both limits shape the optimum somewhere on the grid
    expect(rows.some(r => r.violations.includes('P_max'))).toBe(true);
    expect(rows.some(r => r.violations.includes('T_exh'))).toBe(true);

    // write the optimum to the ECU (as the DoE panel does) and run the calibrated engine over the same grid
    const m = calibrationMapsFromResults(rows, ['SOI', 'P_rail'], { objective: 'BSFC' });
    expect(m.missing).toEqual([]);
    const ecu = { mode: 'Map', speedBp: m.speedBp, loadBp: m.loadBp, map_SOI: m.maps.SOI, map_P_rail: m.maps.P_rail };
    const controlled = byOp(run({ ecu }));
    for (const [k, rs] of ops) {
      const target = best(rs).responses.BSFC;
      for (const r of controlled.get(k)!) {
        expect(r.feasible, k).toBe(true);
        expect(Math.abs(r.responses.BSFC - target) / target, k).toBeLessThan(0.01);
      }
    }
  }, 600_000);
});

describe('V8 diesel mapping lab: learning lab registration', () => {
  it('is listed in the X-Bridges learning labs with its guided steps and solver settings', () => {
    expect(LAB.id).toBe('ci_v8_engine_mapping');
    expect(STEPS.length).toBeGreaterThanOrEqual(5);
    const empty = { nodes: [], edges: [], isSimulating: false, openScopes: [], selectedNodeId: null, fixedStep: 0.02 };
    for (const s of STEPS) {
      expect(typeof s.title).toBe('string');
      expect(s.objectives.length).toBeGreaterThan(0);
      for (const o of s.objectives) expect(o.check(empty)).toBe(false);
    }
    const ws = readFileSync(join(__dirname, '../../../components/xbridges/XbridgesWorkspace.tsx'), 'utf8');
    expect(ws).toMatch(/CI_V8_MAPPING_LAB\b/);
    expect(ws).toMatch(/CI_V8_MAPPING_LAB_STEPS/);
    expect(ws).toMatch(/lab\.solverType/);
    expect(ws).toMatch(/lab\.fixedStep/);
    expect(ws).toMatch(/label: n\.label/); // the lab labels (e.g. 'Fuel Demand Map (ms)') name the blocks on the canvas
  });
});
