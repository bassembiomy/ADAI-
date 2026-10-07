import type { Edge, Node } from '@xyflow/react';
import { VLAB_LIBRARY } from '../../../utils/vlabLibrary';
import { VLabPhysicsEngine } from '../vlabPhysics';
import { blockEquations } from '../vlabEquations';

// test-local 3-wire mux for the PMSM fixture (the library has no signal mux, F-094); registered once on import
blockEquations.wp31c_mux3 = ({ across, branch, ports }) => ['a', 'b', 'c'].map((p, i) => branch[i] - (across[ports.indexOf(p)] as number));

/** WP-31c: model fixtures and a measuring harness shared by performance.test.ts (every model runs through VLabPhysicsEngine.simulateStep). */

const blocks = VLAB_LIBRARY.flatMap(d => d.blocks);
export const node = (id: string, type: string, params: Record<string, any> = {}, extra: Record<string, any> = {}): Node =>
  ({ id, type: 'default', position: { x: 0, y: 0 }, data: { type, params, label: id, ...extra } }) as Node;
let edgeCount = 0;
export const wire = (a: string, b: string): Edge => {
  const [sa, pa] = a.split('.'); const [sb, pb] = b.split('.');
  return { id: `pe${edgeCount++}`, source: sa, sourceHandle: `${sa}-${pa}`, target: sb, targetHandle: `${sb}-${pb}` } as Edge;
};
export interface Model { nodes: Node[]; edges: Edge[] }
export const constant = (id: string, value: number) => node(id, 'ps_constant', { value });

export interface Stats { residualEvals: number; jacobians: number; factorizations: number; wallMs: number; accepted: number; rejected: number; calls: number; state: any }

/** `calls` consecutive simulateStep calls of `dt`. */
export function measure(m: Model, calls: number, dt: number, opts: { validate?: boolean; mutate?: (engine: VLabPhysicsEngine) => void } = {}): Stats {
  const engine = new VLabPhysicsEngine();
  engine.setStepBudget({ maxStepAttempts: 20000, wallClockMs: 240000 });
  if (opts.validate === false) engine.setTopologyValidation(false);
  opts.mutate?.(engine);
  let state: any = null, accepted = 0, rejected = 0;
  const err = console.error, warn = console.warn;
  console.error = () => {}; console.warn = () => {};
  const t0 = performance.now();
  try {
    for (let k = 0; k < calls; k++) {
      state = engine.simulateStep(m.nodes, m.edges, state, dt);
      accepted += state.acceptedSteps; rejected += state.rejectedSteps;
    }
  } finally { console.error = err; console.warn = warn; }
  const wallMs = performance.now() - t0;
  const { residualEvals, jacobians, factorizations } = engine.solverStats;
  if (process.env.PERF_REPORT) console.log(`[perf] ${m.nodes.length} blocks, ${calls} x ${dt}: ${accepted} accepted, ${rejected} rejected, ${residualEvals} residual evals, ${jacobians} Jacobians, ${wallMs.toFixed(0)} ms`);
  return { residualEvals, jacobians, factorizations, wallMs, accepted, rejected, calls, state };
}
export const at = (s: Stats, name: string) => { const i = s.state.variableNames.indexOf(name); if (i < 0) throw new Error(`no variable ${name}`); return s.state.x[i]; };

// ── fixtures ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Series RLC step response, R = 10, L = 1 mH, C = 10 uF (underdamped: zeta = R/2 sqrt(C/L) = 0.158). */
export const rlc = (): Model => ({
  nodes: [node('v', 'dc_voltage', { V: 10 }), node('r', 'resistor', { R: 10 }), node('l', 'inductor', { L: 1e-3 }), node('c', 'capacitor', { C: 1e-5 }), node('g', 'ground')],
  edges: [wire('v.p', 'r.p'), wire('r.n', 'l.p'), wire('l.n', 'c.p'), wire('c.n', 'g.a'), wire('v.n', 'g.a')],
});

/** PMSM driven by the field-oriented controller through an averaged two-level inverter (same fixture as review/controllers.test.ts). */
export const pmsmFoc = (): Model => {
  const p = 4, flux = 0.1, w0 = 100, Vdc = 150, tau = 3;
  const phases = ['a', 'b', 'c'];
  const outPort = (id: string) => ({ id, pos: 'right', label: id, domain: 'Physical', direction: 'out', width: 3, channelNames: ['a', 'b', 'c'] });
  const nodes: Node[] = [
    node('dc', 'dc_voltage', { V: Vdc, R_int: 0 }), node('gnd', 'ground'), node('inv', 'pwm_3ph_2level', { model_mode: 'averaged', control_mode: 'three_phase_modulation' }),
    node('sp1', 'phase_splitter'), node('sp2', 'phase_splitter'), node('m', 'pmsm', { pole_pairs: p, J: 0.02, B: 0 }),
    node('w', 'ang_vel_source', { omega: w0 }), node('rref', 'rot_ref'),
    node('mux', 'wp31c_mux3', {}, { ports: [...phases.map(q => ({ id: q, pos: 'left', label: q, domain: 'Physical', direction: 'in' })), outPort('out')] }),
    node('foc', 'pmsm_foc', { pole_pairs: p, Rs: 0.1, Kp: 5, Ki: 100, Ld: 0.005, Lq: 0.005, flux }),
    constant('tq', tau), constant('wm', w0), node('th', 'ps_ramp', { slope: w0, start: 0 }), constant('vdc', Vdc),
    ...phases.map(k => node(`is${k}`, 'i_sensor')),
  ];
  const edges: Edge[] = [
    wire('dc.p', 'inv.p'), wire('dc.n', 'gnd.a'), wire('inv.n', 'gnd.a'), wire('inv.abc', 'sp1.abc'), wire('sp2.abc', 'm.abc'),
    wire('m.r', 'w.r'), wire('w.c', 'rref.r'),
    wire('foc.g', 'inv.vabc'), wire('mux.out', 'foc.iabc_s'), wire('tq.y', 'foc.ref'), wire('wm.y', 'foc.w_s'), wire('th.y', 'foc.th_s'), wire('vdc.y', 'foc.vdc_s'),
    ...phases.flatMap(k => [wire(`sp1.${k}`, `is${k}.p`), wire(`is${k}.n`, `sp2.${k}`), wire(`is${k}.i`, `mux.${k}`)]),
  ];
  return { nodes, edges };
};

const reconstruct = (id: string, blockId: string, label: string, params: Record<string, any> = {}): Node => {
  const base = blocks.find(b => b.id === blockId)!;
  const merged = JSON.parse(JSON.stringify(base.params));
  for (const [k, v] of Object.entries(params)) if (merged[k]) merged[k].value = v;
  return { id, type: 'default', position: { x: 0, y: 0 }, data: { label, type: base.id, icon: base.icon, color: base.color, ports: base.ports, params: merged } } as Node;
};
/** The "PID AC motor" learning lab: speed PID -> 3-phase PWM inverter -> induction motor (labs_sim.test.ts). */
export const inductionMotorLab = (): Model => {
  const raw = (id: string, s: string, sh: string, t: string, th: string): Edge => ({ id, source: s, target: t, sourceHandle: sh, targetHandle: th }) as Edge;
  return {
    nodes: [
      reconstruct('ref_speed', 'ps_constant', 'Ref Speed', { value: 157 }), reconstruct('error_calc', 'ps_subtract', 'Error'),
      reconstruct('speed_pid', 'ps_pid_ctrl', 'Speed PID', { Kp: 2.5, Ki: 1.2 }), reconstruct('dc_bus', 'dc_voltage', 'DC Link', { V: 600 }),
      reconstruct('inverter', 'pwm_3ph_2level', 'Inverter', { control_mode: 'sinusoidal_modulation' }), reconstruct('ac_motor', 'ac_motor', 'Induction Motor', { P: 2 }),
      reconstruct('speed_sensor', 'rot_motion_sensor', 'Encoder'), reconstruct('mech_ref', 'rot_ref', 'Rotational Reference'),
      reconstruct('scope', 'scope', 'PID Response', { time_range: 10 }), reconstruct('gnd', 'ground', 'GND'),
    ],
    edges: [
      raw('pe1', 'ref_speed', 'y_s', 'error_calc', 'u1_t'), raw('pe2', 'speed_sensor', 'w_s', 'error_calc', 'u2_t'), raw('pe3', 'error_calc', 'y_s', 'speed_pid', 'e_t'),
      raw('pe4', 'speed_pid', 'u_s', 'inverter', 'amp_t'), raw('pe5', 'dc_bus', 'p_s', 'inverter', 'p_t'), raw('pe6', 'dc_bus', 'n_s', 'gnd', 'a_t'),
      raw('pe7', 'inverter', 'n_s', 'gnd', 'a_t'), raw('pe8', 'inverter', 'abc_s', 'ac_motor', 'abc_t'), raw('pe12', 'ac_motor', 'r_s', 'speed_sensor', 'r_t'),
      raw('pe13', 'speed_sensor', 'w_s', 'scope', 'in1_t'), raw('pe13_sref', 'speed_sensor', 'c_s', 'mech_ref', 'r_t'),
    ],
  };
};

/** 30 blocks of mixed domains: a 6-section RC ladder (14), a DC motor drive (7), a thermal chain (5), a signal chain (4). */
export const mixed30 = (): Model => {
  const nodes: Node[] = [node('vs', 'dc_voltage', { V: 5 }), node('gnd', 'ground')];
  const edges: Edge[] = [wire('vs.n', 'gnd.a')];
  let prev = 'vs.p';
  for (let k = 0; k < 6; k++) {
    nodes.push(node(`R${k}`, 'resistor', { R: 100 * (k + 1) }), node(`C${k}`, 'capacitor', { C: 1e-5 / (k + 1) }));
    edges.push(wire(prev, `R${k}.p`), wire(`R${k}.n`, `C${k}.p`), wire(`C${k}.n`, 'gnd.a'));
    prev = `R${k}.n`;
  }
  // DC motor drive (the blender lab): 24 V - motor (K, R) - damper - inertia - speed sensor
  nodes.push(
    node('bat', 'dc_voltage', { V: 24 }), node('mot', 'rotational_electromechanical_converter', { K: 0.05, R: 2 }), node('drag', 'rot_damper', { b: 0.001 }),
    node('jr', 'inertia', { J: 2e-4 }), node('spd', 'rot_motion_sensor'), node('mref', 'rot_ref'), node('gnd2', 'ground'),
  );
  edges.push(
    wire('bat.p', 'mot.p'), wire('mot.n', 'gnd2.a'), wire('bat.n', 'gnd2.a'), wire('mot.r', 'drag.r'), wire('drag.r', 'jr.r'), wire('drag.r', 'spd.r'),
    wire('spd.c', 'mref.r'), wire('mot.c', 'mref.r'), wire('drag.c', 'mref.r'),
  );
  // thermal chain: 350 K environment -> conductance -> 1 kJ/K mass, sensor against the reference
  nodes.push(node('env', 'temp_src', { T: 350 }), node('gk', 'conductive_heat', { k: 2 }), node('tm', 'thermal_mass', { C: 1000, T0: 300 }), node('ts', 'temp_sensor'), node('tref', 'thermal_ref'));
  edges.push(wire('env.a', 'gk.a'), wire('gk.b', 'tm.a'), wire('tm.a', 'ts.a'), wire('ts.b', 'tref.a'));
  // signal chain
  nodes.push(node('sin', 'ps_sine', { amplitude: 1, frequency: 50 }), constant('k1', 0.5), node('sub', 'ps_subtract'), node('gain', 'ps_gain', { gain: 3 }));
  edges.push(wire('sin.y', 'sub.u1'), wire('k1.y', 'sub.u2'), wire('sub.y', 'gain.u'));
  return { nodes, edges };
};


/** Frame-domain model (user section 11 regression): world -> revolute joint (axis [1 2 2], damping 2) -> external wrench (torque [1 2 3], force [0 0 -9.81]); 66 unknowns. */
export const revoluteHinge = (): Model => {
  const nodes: Node[] = [node('world', 'world_frame'), node('joint', 'revolute_joint', { axis: '[1 2 2]', damping: 2 }), node('load', 'external_force')];
  const edges: Edge[] = [wire('world.w', 'joint.b'), wire('joint.f', 'load.f')];
  const wrench: [string, number][] = [['fz', -9.81], ['tx', 1], ['ty', 2], ['tz', 3]];
  for (const [port, value] of wrench) { nodes.push(constant(`c_${port}`, value)); edges.push(wire(`c_${port}.y`, `load.in_${port}`)); }
  return { nodes, edges };
};
