// OM 501 LA V6 / MR-PLD calibration lab acceptance tests (examples/om501MrPldLab.ts), Powertrain Blockset blocks only.
//   Engine (public data + assumptions): 6 cylinders, B 130 mm, S 150 mm (11.95 L), L 260 mm, CR 17.25, wastegate turbocharger
//   (r_c 0.06 m, A_t_min 7e-4 m^2, A_t_max 4e-3 m^2, A_wg_max 1.5e-3 m^2, J_tc 2e-4), ideal intercooler, no EGR.
//   Bench A (injector flow bench): benchDoe sweeps PW 0.2..4 ms (9 levels) at 800/1200/1800 rpm through benchEcu -> injector
//     (8 x 0.2 mm holes), unit-pump injection pressure from pumpPressureMap (80 / 120 / 160 MPa); injector Info -> benchDoe.
//   Bench B (engine dyno): doe sweeps 800/1200/1800 rpm x 25/50/75/100 % of 185 mg/stroke (qMap -> cylinder m_f directly, the
//     MR-PLD quantity command), full factorial SOI 4..22 deg and wastegate 0..60 % (3 levels), limits P_max 190 bar,
//     T_exh 1000 K, Lambda_min 1.3 (smoke). Euler, 0.02 s.
//   Generated maps are written into PT_CALIBRATION_MAP_2D target blocks map1Soi, map3Duration, map6Smoke, map7FuelLimit,
//   map7Torque and the Mapped CI Engine engineMap.
//   Additions: CI Cylinder Info Lambda (trapped air / (AFR_st * m_f)) and P_map; Fuel Injector Info m_f [mg] and ET [ms];
//   DoE Sweeper params Lambda_min and NOx_max (0 = off): Lambda < Lambda_min -> violation 'Lambda'; NOx > NOx_max -> 'NOx'.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BLOCK_LIBRARY } from '../BlockDefinitions';
import { XbridgesEngine } from '../XbridgesEngine';
import { Solvers } from '../Solvers';
import { makeBus } from '../bus/busCore';
import { getPowertrainSpec } from './index';
import { doeSweeperResults } from './blocks/doeSweeper';
import { baseSoiMap, fullLoadFuelLimit, smokeLimiterMap, injectionDurationMap } from './mrPldMaps';
import { mappedEngineTablesFromResults } from './calibrationExport';
import { OM501_MRPLD_LAB as LAB, OM501_MRPLD_LAB_STEPS as STEPS } from './examples/om501MrPldLab';

const node = (id: string) => LAB.nodes.find(n => n.id === id)!;

describe('block additions for the MR-PLD maps', () => {
  it('CI Cylinder Info: Lambda from the trapped air (halves when the fuel doubles) and P_map', () => {
    const b = BLOCK_LIBRARY.PT_CI_CYLINDER('c', {});
    const run = (mf: number) => b.execute([1500, mf, 10, 50, 5, 1.8e5, 320, 1.9e5], b.params, b.state, 0).outputs[0] as any;
    const a = run(40), c = run(80);
    expect(a.Lambda).toBeGreaterThan(1);
    expect(c.Lambda / a.Lambda).toBeCloseTo(0.5, 12);
    expect(a.P_map).toBe(1.8e5);
  });

  it('Fuel Injector Info: m_f [mg] and ET [ms]', () => {
    const b = BLOCK_LIBRARY.PT_FUEL_INJECTOR('i', {});
    const o = b.execute([150, 6e6, 1.2, 1500], b.params, b.state, 0).outputs;
    expect((o[0] as any).m_f).toBe(o[1]);
    expect((o[0] as any).ET).toBe(1.2);
  });

  it('DoE Sweeper Lambda_min marks smoky points infeasible (0 = off)', () => {
    const plant: any = {
      id: 'p', type: 'TestPlant', params: {}, inputs: [{ id: 'x', name: 'x', type: 'auto', direction: 'input', value: 0 }],
      outputs: [{ id: 'R', name: 'R', type: 'auto', direction: 'output', value: {} }],
      execute: (ins: any[]) => ({ outputs: [makeBus(['BSFC', 'Lambda'], [200, Array.isArray(ins[0]) ? ins[0][0] : 0])] }),
    };
    const sweep = (Lambda_min?: number) => {
      const sw = BLOCK_LIBRARY.PT_DOE_SWEEPER('sw', { factors: 'L', bounds: [[1, 2]], levels: 3, dwell: 1, averageWindow: 0.5, ...(Lambda_min !== undefined ? { Lambda_min } : {}) });
      const e = new XbridgesEngine({ blocks: [sw, { ...plant }], connections: [{ sourceBlock: 'sw', sourcePort: 'NextPoint', targetBlock: 'p', targetPort: 'x' }, { sourceBlock: 'p', sourcePort: 'R', targetBlock: 'sw', targetPort: 'Responses' }] } as any);
      Solvers.runFixedStep(e, { solver: 'euler', startTime: 0, stopTime: 3.05, fixedStep: 0.05 } as any);
      return doeSweeperResults(e.getBlock('sw')!.state).map(r => r.violations);
    };
    expect(sweep()).toEqual([[], [], []]);
    expect(sweep(1.6)).toEqual([['Lambda'], ['Lambda'], []]);
    // NOx_max (0 = off): the response NOx above NOx_max is a violation 'NOx' (here NOx = 20 * L)
    const sweepNox = (NOx_max: number) => {
      const p2 = { ...plant, execute: (ins: any[]) => ({ outputs: [makeBus(['BSFC', 'NOx'], [200, 20 * (Array.isArray(ins[0]) ? ins[0][0] : 0)])] }) };
      const sw = BLOCK_LIBRARY.PT_DOE_SWEEPER('sw', { factors: 'L', bounds: [[1, 2]], levels: 3, dwell: 1, averageWindow: 0.5, NOx_max });
      const e = new XbridgesEngine({ blocks: [sw, p2], connections: [{ sourceBlock: 'sw', sourcePort: 'NextPoint', targetBlock: 'p', targetPort: 'x' }, { sourceBlock: 'p', sourcePort: 'R', targetBlock: 'sw', targetPort: 'Responses' }] } as any);
      Solvers.runFixedStep(e, { solver: 'euler', startTime: 0, stopTime: 3.05, fixedStep: 0.05 } as any);
      return doeSweeperResults(e.getBlock('sw')!.state).map(r => r.violations);
    };
    expect(sweepNox(0)).toEqual([[], [], []]);
    expect(sweepNox(25)).toEqual([[], ['NOx'], ['NOx']]);
  });
});

describe('OM 501 LA lab: model', () => {
  it('uses only Powertrain blocks with valid, complete wiring', () => {
    for (const n of LAB.nodes) expect(getPowertrainSpec(n.type), n.type).toBeDefined();
    const blocks = new Map(LAB.nodes.map(n => [n.id, BLOCK_LIBRARY[n.type](n.id, n.params ?? {})]));
    for (const e of LAB.edges) {
      expect(blocks.get(e.source)?.outputs.some(p => p.id === e.sourceHandle), `${e.id} source`).toBe(true);
      expect(blocks.get(e.target)?.inputs.some(p => p.id === e.targetHandle), `${e.id} target`).toBe(true);
    }
    const targets = ['map1Soi', 'map3Duration', 'map6Smoke', 'map7FuelLimit', 'map7Torque', 'engineMap'];
    const open = new Set(['dyno.T_set', 'manifold.mdot_egr', ...targets.flatMap(t => blocks.get(t)!.inputs.map(p => `${t}.${p.id}`))]);
    for (const [id, b] of blocks) for (const p of b.inputs) {
      if (open.has(`${id}.${p.id}`)) continue;
      expect(LAB.edges.some(e => e.target === id && e.targetHandle === p.id), `${id}.${p.id} connected`).toBe(true);
    }
    for (const t of targets.slice(0, 5)) expect(node(t).type).toBe('PT_CALIBRATION_MAP_2D');
    expect(node('engineMap').type).toBe('PT_MAPPED_CI_ENGINE');
  });

  it('OM 501 LA data, test benches and limits', () => {
    const c = node('cylinder').params!;
    expect([c.B, c.S, c.L, c.CR, c.Ncyl, c.dTheta]).toEqual([0.13, 0.15, 0.26, 17.25, 6, 2]);
    expect(Math.abs(node('manifold').params!.Vd_tot - 6 * Math.PI / 4 * 0.13 ** 2 * 0.15) / 11.95e-3).toBeLessThan(0.01);
    expect(node('turbo').params!.mode).toBe('Wastegate');
    const d = node('doe').params!;
    expect([d.opSpeeds, d.opLoads, d.factors, d.bounds, d.levels, d.Pmax_limit, d.Texh_limit, d.Lambda_min, d.NOx_max])
      .toEqual([[800, 1200, 1800], [25, 50, 75, 100], 'SOI,VgtPos', [[4, 22], [0, 60]], 3, 190e5, 1000, 1.3, 30]);
    const b = node('benchDoe').params!;
    expect([b.opSpeeds, b.factors, b.bounds, b.levels]).toEqual([[800, 1200, 1800], 'PW', [[0.2, 4]], 9]);
    expect([LAB.solverType, LAB.fixedStep]).toEqual(['euler', 0.02]);
  });
});

describe('OM 501 LA lab: map generation', () => {
  it('runs both benches and generates maps 1, 3, 6, 7 and the Mapped Engine tables', () => {
    const blocks = LAB.nodes.map(n => BLOCK_LIBRARY[n.type](n.id, n.params ?? {}));
    const e = new XbridgesEngine({ blocks, connections: LAB.edges.map(x => ({ sourceBlock: x.source, sourcePort: x.sourceHandle, targetBlock: x.target, targetPort: x.targetHandle })) } as any);
    Solvers.runFixedStep(e, { solver: 'euler', startTime: 0, stopTime: 108 * 2 + 0.02, fixedStep: 0.02 } as any);
    expect(e.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    const bench = doeSweeperResults(e.getBlock('benchDoe')!.state), rows = doeSweeperResults(e.getBlock('doe')!.state);
    expect(bench).toHaveLength(27);
    expect(rows).toHaveLength(108);

    const q = 1.85;
    const d = injectionDurationMap(bench, { qTargets: [46.25, 92.5, 138.75, 185] });
    for (const r of d.et) for (let j = 1; r && j < r.length; j++) expect(r[j]).toBeGreaterThan(r[j - 1]);
    for (let j = 0; j < 4; j++) expect(d.et[2][j]).toBeLessThan(d.et[0][j]); // higher pump pressure at 1800 rpm -> shorter time
    expect(d.clipped).toEqual([]);

    const s = baseSoiMap(rows, { qPerLoad: q });
    expect(s.qBp).toEqual([46.25, 92.5, 138.75, 185]);
    for (const r of s.soi) for (const v of r) { expect(v).toBeGreaterThanOrEqual(4); expect(v).toBeLessThanOrEqual(22); }
    // the NOx limit retards the injection where advanced timing makes too much NOx (low speed), so the map is not flat
    expect(s.soi[0].every(v => v < 22)).toBe(true);
    expect(s.soi[2].some(v => v === 22)).toBe(true);
    expect(rows.some(r => r.violations.includes('NOx'))).toBe(true);

    const f = fullLoadFuelLimit(rows, { qPerLoad: q });
    f.qMax.forEach(v => { expect(v).toBeGreaterThan(0); expect(v).toBeLessThanOrEqual(185); });
    f.torque.forEach(t => { expect(t).toBeGreaterThan(300); expect(t).toBeLessThan(2500); });

    const sm = smokeLimiterMap(rows, { qPerLoad: q, lambdaMin: 1.3, boostBp: [1, 1.5, 2, 2.5] });
    for (const r of sm.qSmoke) for (let j = 1; j < r.length; j++) expect(r[j]).toBeGreaterThan(r[j - 1]);

    const t = mappedEngineTablesFromResults(rows, { objective: 'BSFC', T_ref: Math.max(...f.torque) });
    expect(t.f_tbrake_n_bpt).toEqual([800, 1200, 1800]);
  }, 600_000);
});

describe('OM 501 LA lab: registration and scenario', () => {
  it('is listed in the learning labs with its scenario steps', () => {
    expect(LAB.id).toBe('om501_mrpld_calibration');
    expect(STEPS.length).toBeGreaterThanOrEqual(6);
    const empty = { nodes: [], edges: [], isSimulating: false, openScopes: [], selectedNodeId: null, fixedStep: 0.02 };
    for (const s of STEPS) for (const o of s.objectives) expect(o.check(empty)).toBe(false);
    const text = STEPS.map(s => s.instructions).join('\n');
    for (const m of ['Base SOI', 'Injection Duration', 'Smoke Limiter', 'Full-Load', 'Cold Start', 'BIP', 'Sensor']) expect(text).toMatch(new RegExp(m, 'i'));
    const ws = readFileSync(join(__dirname, '../../../components/xbridges/XbridgesWorkspace.tsx'), 'utf8');
    expect(ws).toMatch(/OM501_MRPLD_LAB\b/);
    expect(ws).toMatch(/OM501_MRPLD_LAB_STEPS/);
  });
});
