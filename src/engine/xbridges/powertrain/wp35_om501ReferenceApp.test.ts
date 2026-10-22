// WP-35 acceptance tests: OM 501 LA engine dynamometer reference application (MathWorks CI Engine Dynamometer reference
// application style), referenceApps/ciEngineDyno.ts.
//   buildCiEngineDynoApp(spec) -> lab { id, name, category, difficulty, description, solverType, fixedStep, stepsPerFrame,
//     nodes (Subsystem containers + blocks with parentId), edges }. Reusable: any CiEngineSpec; OM501_LA_SPEC is the first.
//   Subsystems: sub_engine 'Engine System' and sub_controller 'Engine Controller' contain genuine Powertrain Blockset blocks
//   only (spec source 'simulink-docs'); sub_dyno 'Dynamometer' and sub_test 'Test Sequence' use standard X-Bridges blocks
//   (Constant, GAIN, Sum, Integrator, SWITCH, DEMUX, BUS_CREATOR, BUS_SELECTOR), the genuine Rotational Inertia and the
//   DoE Sweeper (test automation). No calibration-spec blocks (CI Cylinder, Calibration ECU, Engine Dyno, Calibration Map 2D,
//   Throttle Body, Intake Manifold, Turbocharger, Fuel Injector, VVT, SI Cylinder, Ambient).
//   Engine System: ambient Flow Boundary -> compressor -> boostVolume (Control Volume) -> chargeCooler (Heat Exchanger,
//   coolant from the test cell) -> intakeManifold (Control Volume) -> coreEngine (CI Core Engine, characterised OM 501 LA
//   tables) -> exhaustManifold (Control Volume) -> turbine (wastegate) -> exhaustOutlet Flow Boundary; turboShaft Drive Shaft.
//   Node 'mode' (Constant in Test Sequence): 1 = calibration sweep (DoE drives fuel quantity, SOI and wastegate directly
//   through SWITCH blocks), 0 = ECU closed loop (CI Controller drives them from the torque command Load/100 * TqRef).
//   calibrateCiController(rows, spec) -> PT_CI_CONTROLLER params: f_main_soi (map 1), f_inj_dur (map 3, unit-pump Bernoulli
//   characteristic of spec.injector), f_fuel_smoke (map 6), f_fuel_max / f_tq_max (map 7), f_fuel_cmd (torque -> fuel from
//   the best rows), f_wg_area (best wastegate), on SpdBp = opSpeeds, FuelBp = [0, Q levels], TrqBp = [0 .. TqRef].
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BLOCK_LIBRARY } from '../BlockDefinitions';
import { XbridgesEngine } from '../XbridgesEngine';
import { Solvers } from '../Solvers';
import { getPowertrainSpec } from './index';
import { doeSweeperResults, doeSweeperPointCount, type DoeRow } from './blocks/doeSweeper';
import { mappedEngineTablesFromResults } from './calibrationExport';
import { buildCiEngineDynoApp, calibrateCiController, OM501_LA_SPEC, OM501_REFERENCE_APP as APP, OM501_REFERENCE_APP_STEPS as STEPS } from './referenceApps/ciEngineDyno';

const SUBS = { sub_engine: 'Engine System', sub_controller: 'Engine Controller', sub_dyno: 'Dynamometer', sub_test: 'Test Sequence' } as const;
const SPEC_ONLY = ['PT_CI_CYLINDER', 'PT_SI_CYLINDER', 'PT_CALIBRATION_ECU', 'PT_ENGINE_DYNO', 'PT_CALIBRATION_MAP_2D', 'PT_THROTTLE_BODY', 'PT_INTAKE_MANIFOLD', 'PT_TURBOCHARGER', 'PT_FUEL_INJECTOR', 'PT_VVT_VALVETRAIN', 'PT_AMBIENT'];
const STANDARD = ['Constant', 'GAIN', 'Sum', 'Integrator', 'SWITCH', 'DEMUX', 'BUS_CREATOR', 'BUS_SELECTOR', 'PT_ROTATIONAL_INERTIA', 'PT_DOE_SWEEPER'];

function checkStructure(app: typeof APP) {
  const subs = app.nodes.filter(n => n.type === 'Subsystem');
  expect(Object.fromEntries(subs.map(s => [s.id, s.label]))).toEqual(SUBS);
  for (const n of app.nodes.filter(n => n.type !== 'Subsystem')) {
    expect(Object.keys(SUBS), n.id).toContain(n.parentId);
    expect(SPEC_ONLY, n.id).not.toContain(n.type);
    if (n.parentId === 'sub_engine' || n.parentId === 'sub_controller') expect(getPowertrainSpec(n.type)?.source, `${n.id} genuine`).toBe('simulink-docs');
    else expect(STANDARD.includes(n.type) || getPowertrainSpec(n.type)?.source === 'simulink-docs', `${n.id} standard`).toBe(true);
  }
  const blocks = new Map(app.nodes.filter(n => n.type !== 'Subsystem').map(n => [n.id, BLOCK_LIBRARY[n.type](n.id, n.params ?? {})]));
  for (const e of app.edges) {
    expect(blocks.get(e.source)?.outputs.some(p => p.id === e.sourceHandle), `${e.id} source`).toBe(true);
    expect(blocks.get(e.target)?.inputs.some(p => p.id === e.targetHandle), `${e.id} target`).toBe(true);
  }
  const open = new Set(['engineMap.TrqCmd', 'engineMap.EngSpd', 'ambient.Flw']);
  for (const [id, b] of blocks) for (const p of b.inputs) {
    if (open.has(`${id}.${p.id}`)) continue;
    expect(app.edges.some(e => e.target === id && e.targetHandle === p.id), `${id}.${p.id} connected`).toBe(true);
  }
  for (const id of ['ambient', 'compressor', 'boostVolume', 'chargeCooler', 'intakeManifold', 'coreEngine', 'exhaustManifold', 'turbine', 'turboShaft', 'exhaustOutlet'])
    expect(app.nodes.find(n => n.id === id)?.parentId, id).toBe('sub_engine');
  expect(app.nodes.find(n => n.id === 'controller')?.type).toBe('PT_CI_CONTROLLER');
  expect(app.nodes.find(n => n.id === 'engineMap')?.type).toBe('PT_MAPPED_CI_ENGINE');
}

function run(app: typeof APP, overrides: Record<string, Record<string, any>> = {}) {
  const nodes = app.nodes.filter(n => n.type !== 'Subsystem');
  const blocks = nodes.map(n => BLOCK_LIBRARY[n.type](n.id, { ...(n.params ?? {}), ...(overrides[n.id] ?? {}) }));
  const e = new XbridgesEngine({ blocks, connections: app.edges.map(x => ({ sourceBlock: x.source, sourcePort: x.sourceHandle, targetBlock: x.target, targetPort: x.targetHandle })) } as any);
  const doe = blocks.find(b => b.id === 'doe')!;
  const n = doeSweeperPointCount(doe.params);
  Solvers.runFixedStep(e, { solver: app.solverType, startTime: 0, stopTime: n * doe.params.dwell + app.fixedStep, fixedStep: app.fixedStep } as any);
  expect(e.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  const rows = doeSweeperResults(e.getBlock('doe')!.state);
  expect(rows).toHaveLength(n);
  return rows;
}
const byOp = (rows: DoeRow[]) => { const m = new Map<string, DoeRow[]>(); for (const r of rows) { const k = `${r.op!.N}/${r.op!.Load}`; m.set(k, [...(m.get(k) ?? []), r]); } return m; };

describe('OM 501 LA reference application: structure', () => {
  it('four subsystems, genuine Powertrain engine and controller, standard dynamometer and test sequence', () => checkStructure(APP));

  it('is reusable: the builder makes a valid application for another CI engine specification', () => {
    const other = buildCiEngineDynoApp({ ...OM501_LA_SPEC, id: 'other_ci', name: 'Other CI engine', sweep: { ...OM501_LA_SPEC.sweep, opSpeeds: [900, 1500, 2100] } });
    checkStructure(other);
    expect(other.id).not.toBe(APP.id);
    expect(other.nodes.find(n => n.id === 'doe')!.params!.opSpeeds).toEqual([900, 1500, 2100]);
  });

  it('OM 501 LA data, characterised core engine and calibration-sweep mode', () => {
    const core = APP.nodes.find(n => n.id === 'coreEngine')!.params!;
    expect(core.Ncyl).toBe(6);
    expect(Math.abs(core.Vd - 11.95e-3) / 11.95e-3).toBeLessThan(0.01);
    expect(Math.max(...core.f_soi_opt.flat())).toBeGreaterThan(Math.min(...core.f_soi_opt.flat())); // characterised, not flat placeholders
    expect(APP.nodes.find(n => n.id === 'mode')!.params!.value).toBe(1);
    expect(APP.stepsPerFrame).toBeGreaterThanOrEqual(1);
  });
});

describe('OM 501 LA reference application: calibration and calibrated control', () => {
  it('generates the CI Controller maps from the dyno sweep and the calibrated ECU controls the engine', () => {
    const rows = run(APP);
    const ops = byOp(rows);
    for (const [k, rs] of ops) expect(rs.some(r => r.feasible), k).toBe(true);
    expect(rows.some(r => r.violations.includes('NOx'))).toBe(true);

    const ctl = calibrateCiController(rows, OM501_LA_SPEC);
    const sw = OM501_LA_SPEC.sweep;
    expect(ctl.SpdBp).toEqual(sw.opSpeeds);
    expect(ctl.FuelBp[0]).toBe(0);
    const soi = ctl.f_main_soi.flat();
    expect(Math.max(...soi)).toBeGreaterThan(Math.min(...soi)); // NOx-shaped, not constant
    for (const r of ctl.f_inj_dur) for (let j = 1; j < r.length; j++) expect(r[j]).toBeGreaterThan(r[j - 1]);
    for (const r of ctl.f_fuel_smoke) for (let j = 1; j < r.length; j++) expect(r[j]).toBeGreaterThanOrEqual(r[j - 1]);
    for (const r of ctl.f_fuel_cmd) for (let j = 1; j < r.length; j++) expect(r[j]).toBeGreaterThanOrEqual(r[j - 1]);
    ctl.f_tq_max.forEach((t: number) => { expect(t).toBeGreaterThan(1000); expect(t).toBeLessThan(2600); });
    const ecuBlock = BLOCK_LIBRARY.PT_CI_CONTROLLER('c', ctl);
    expect(ecuBlock.execute([1000, 1400 * Math.PI / 30, 2e5], ecuBlock.params, ecuBlock.state, 0).error).toBeUndefined();

    // closed loop with the calibrated ECU, one point per speed/load
    const closed = run(APP, { mode: { value: 0 }, controller: ctl, doe: { levels: 1 } });
    const TqRef = APP.nodes.find(n => n.id === 'trqRef')!.params!.gain * 100;
    for (const r of closed) {
      const req = r.op!.Load / 100 * TqRef, lim = Math.min(...[ctl.SpdBp.indexOf(r.op!.N)].map(i => ctl.f_tq_max[i]));
      expect(r.feasible, `${r.op!.N}/${r.op!.Load}`).toBe(true);
      if (req < 0.95 * lim) expect(Math.abs(r.responses.T_brake - req) / req, `track ${r.op!.N}/${r.op!.Load}`).toBeLessThan(0.05);
      else expect(r.responses.T_brake).toBeLessThanOrEqual(lim * 1.03);
    }
    const t = mappedEngineTablesFromResults(closed, { objective: 'BSFC', T_ref: TqRef });
    expect(t.f_tbrake_n_bpt).toEqual(sw.opSpeeds);
  }, 600_000);
});

describe('OM 501 LA reference application: registration and scenario', () => {
  it('is listed in the learning labs with its scenario and real-time stepping', () => {
    expect(APP.id).toBe('om501_reference_app');
    expect(STEPS.length).toBeGreaterThanOrEqual(6);
    const empty = { nodes: [], edges: [], isSimulating: false, openScopes: [], selectedNodeId: null, fixedStep: 0.01 };
    for (const s of STEPS) for (const o of s.objectives) expect(o.check(empty)).toBe(false);
    const ws = readFileSync(join(__dirname, '../../../components/xbridges/XbridgesWorkspace.tsx'), 'utf8');
    expect(ws).toMatch(/OM501_REFERENCE_APP\b/);
    expect(ws).toMatch(/OM501_REFERENCE_APP_STEPS/);
    expect(ws).toMatch(/lab\.stepsPerFrame/);
    expect(ws).toMatch(/batchSize/);
  });
});
