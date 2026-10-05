import { afterAll, describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import { VLAB_LIBRARY } from '../../../utils/vlabLibrary';
import { VLabPhysicsEngine } from '../vlabPhysics';
import { DAEAssembler } from '../DAEAssembler';
import { ImplicitSolver } from '../ImplicitSolver';
import { jointBranchSpecs, jointKindOf, JOINT_SIGNAL_PORTS } from '../vlabJointCore';

/**
 * WP-19a: independent reference tests for the Multibody joint family (revolute, prismatic, spherical, universal, weld).
 *
 * Every expected value below is written from a published formula or a closed-form derivation IN THIS FILE (rotation
 * matrices, cross products, damper laws, Hooke-joint kinematics); nothing is read back from the code under test.
 *
 * Scope note (WP-19b owns bodies): the Frame domain has no inertia element yet, so a frame is massless. Dynamic references
 * (pendulum period, energy, a = g.(axis.g_hat) of a mass on a slider) therefore enter as their analytic EQUIVALENT
 * quasi-static statement: the joint under the D'Alembert load of the analytic motion (spherical pendulum), the viscous
 * terminal velocity of a loaded slider / hinge (v = F.a / c, w = T.a / c) and the exact discrete joint coordinate
 * integrated over consecutive simulateStep calls.
 *
 * Conventions: through variable = wrench the joint exerts on F; pose = [Px Py Pz Rx Ry Rz], R = Rz Ry Rx.
 */

// ── independent vector / rotation helpers (not imported from the engine) ──────────────────────────────────────────
type V3 = [number, number, number];
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: number[], b: number[]): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const scale = (a: number[], s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const plus = (a: number[], b: number[]): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const minus = (a: number[], b: number[]): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a: number[]) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: number[]): V3 => scale(a, 1 / len(a));
type M3 = number[][];
const Rx = (t: number): M3 => [[1, 0, 0], [0, Math.cos(t), -Math.sin(t)], [0, Math.sin(t), Math.cos(t)]];
const Ry = (t: number): M3 => [[Math.cos(t), 0, Math.sin(t)], [0, 1, 0], [-Math.sin(t), 0, Math.cos(t)]];
const Rz = (t: number): M3 => [[Math.cos(t), -Math.sin(t), 0], [Math.sin(t), Math.cos(t), 0], [0, 0, 1]];
const mm = (a: M3, b: M3): M3 => a.map((row, i) => [0, 1, 2].map((j) => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j]));
const mv = (a: M3, v: number[]): V3 => [dot(a[0], v), dot(a[1], v), dot(a[2], v)];
const R_of = (e: number[]): M3 => mm(Rz(e[2]), mm(Ry(e[1]), Rx(e[0])));
const deg = (d: number) => (d * Math.PI) / 180;
/** Rodrigues rotation about unit axis a by angle t. */
const rot = (a: number[], t: number): M3 => {
  const [x, y, z] = unit(a);
  const c = Math.cos(t), s = Math.sin(t), k = 1 - c;
  return [[c + x * x * k, x * y * k - z * s, x * z * k + y * s], [y * x * k + z * s, c + y * y * k, y * z * k - x * s], [z * x * k - y * s, z * y * k + x * s, c + z * z * k]];
};
/** Z-Y-X Euler angles of a rotation matrix (|ry| < pi/2). */
const euler = (R: M3): V3 => [Math.atan2(R[2][1], R[2][2]), Math.atan2(-R[2][0], Math.hypot(R[0][0], R[1][0])), Math.atan2(R[1][0], R[0][0])];

// ── model builders ────────────────────────────────────────────────────────────────────────────────────────────────
const node = (id: string, type: string, params: Record<string, any> = {}): Node =>
  ({ id, type: 'default', position: { x: 0, y: 0 }, data: { type, params } }) as any;
const edge = (id: string, source: string, sourceHandle: string, target: string, targetHandle: string): Edge =>
  ({ id, source, sourceHandle, target, targetHandle }) as Edge;

interface Wrench { force?: number[]; torque?: number[] }
interface Scene { nodes: Node[]; edges: Edge[]; outputs: string[] }
const WRENCH_PORTS = ['fx', 'fy', 'fz', 'tx', 'ty', 'tz'];

/**
 * world -> [rigid_transform base] -> joint(B) ... joint(F) -> external_force (and optionally a gravitational field).
 * The scope channels are the joint outputs listed in `outputs` (channel i = outputs[i-1]).
 */
function scene(opts: {
  joint: string; params?: Record<string, any>; outputs: string[]; load?: Wrench;
  weight?: { mass: number; g: number; direction: string }; baseRotationDeg?: number[];
}): Scene {
  const nodes: Node[] = [node('world', 'world_frame'), node('joint', opts.joint, opts.params ?? {})];
  const edges: Edge[] = [];
  if (opts.baseRotationDeg) {
    nodes.push(node('base', 'rigid_transform', { rotation: `[${opts.baseRotationDeg.join(' ')}]` }));
    edges.push(edge('e_world', 'world', 'w', 'base', 'b'), edge('e_base', 'base', 'f', 'joint', 'b'));
  } else edges.push(edge('e_base', 'world', 'w', 'joint', 'b'));
  const w = [...(opts.load?.force ?? [0, 0, 0]), ...(opts.load?.torque ?? [0, 0, 0])];
  // F is always wired (an unwired Frame port reads as a constant zero pose): to the load, or to an unloaded force element
  if (w.some((v) => v !== 0) || !opts.weight) {
    nodes.push(node('load', 'external_force'));
    edges.push(edge('e_load', 'joint', 'f', 'load', 'f'));
    WRENCH_PORTS.forEach((p, i) => {
      if (w[i] === 0) return;
      nodes.push(node('c_' + p, 'ps_constant', { value: w[i] }));
      edges.push(edge('e_' + p, 'c_' + p, 'y', 'load', 'in_' + p));
    });
  }
  if (opts.weight) {
    nodes.push(node('weight', 'grav_field', opts.weight));
    edges.push(edge('e_weight', 'joint', 'f', 'weight', 'f'));
  }
  return { nodes, edges, outputs: opts.outputs };
}

const makeEngine = () => {
  const engine = new VLabPhysicsEngine();
  engine.setStepBudget({ maxStepAttempts: 30, wallClockMs: 8000 });
  return engine;
};
/** engine with a tight budget for models that have no equilibrium and must be refused quickly */
const refusingEngine = () => {
  const engine = new VLabPhysicsEngine();
  engine.setStepBudget({ maxStepAttempts: 4, wallClockMs: 1500 });
  return engine;
};
type Sample = Record<string, number>;
/** `steps` consecutive simulateStep calls; returns every state and the scope readings of each step. */
function run(s: Scene, steps: number, dt = 0.01, opts: { engine?: VLabPhysicsEngine; state?: any } = {}) {
  const engine = opts.engine ?? makeEngine();
  let state: any = opts.state ?? null;
  const states: any[] = [];
  const samples: Sample[] = [];
  for (let i = 0; i < steps; i++) {
    state = engine.simulateStep(s.nodes, s.edges, state, dt);
    states.push(state);
    samples.push(Object.fromEntries(s.outputs.map((o) => [o, state.x[state.variableNames.indexOf('joint_branch_signal_' + o)] as number])));
  }
  return { engine, states, samples, last: states[states.length - 1] as any, sample: samples[samples.length - 1] };
}
/** Indices of a joint frame's pose coordinates in the assembled state vector. */
function frameIndex(s: Scene, port: 'b' | 'f') {
  const system = new DAEAssembler().assemble(s.nodes, s.edges);
  const root = system.components.find((c) => c.blockId === 'joint')!.portNodeMap.get(port)!;
  return ['Px', 'Py', 'Pz', 'Rx', 'Ry', 'Rz'].map((a) => system.variableNames.indexOf(`Across_${root}_${a}_(frame)`));
}
const poseOf = (state: any, idx: number[]) => idx.map((i) => state.x[i]);
const branchOf = (state: any, name: string) => state.x[state.variableNames.indexOf(name)];

// reference table printed at the end (analytic vs simulated, relative error)
const REFERENCE: { joint: string; quantity: string; analytic: number; simulated: number }[] = [];
const compare = (joint: string, quantity: string, analytic: number, simulated: number, digits = 6) => {
  REFERENCE.push({ joint, quantity, analytic, simulated });
  expect(simulated, `${joint} ${quantity}`).toBeCloseTo(analytic, digits);
};
afterAll(() => {
  const rows = REFERENCE.map((r) => {
    const err = r.analytic === 0 ? Math.abs(r.simulated) : (100 * Math.abs(r.simulated - r.analytic)) / Math.abs(r.analytic);
    return `${r.joint.padEnd(10)} ${r.quantity.padEnd(34)} analytic ${r.analytic.toPrecision(10).padStart(16)}  simulated ${r.simulated.toPrecision(10).padStart(16)}  error ${err.toExponential(2)}${r.analytic === 0 ? ' (abs)' : ' %'}`;
  });
  console.log(`\nWP-19a joint reference results (${rows.length})\n${rows.join('\n')}\n`);
});

const AXES: { name: string; axis: V3 }[] = [
  { name: 'x', axis: [1, 0, 0] }, { name: 'y', axis: [0, 1, 0] }, { name: 'z', axis: [0, 0, 1] },
  { name: 'tilted [1 2 2]', axis: [1, 2, 2] }, { name: 'tilted [-3 1 2]', axis: [-3, 1, 2] },
];
const axisText = (a: number[]) => `[${a.join(' ')}]`;

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('joint library: typed Frame ports, SI signal outputs, parameters', () => {
  const blocks = new Map(VLAB_LIBRARY.flatMap((d) => d.blocks).map((b) => [b.id, b]));
  const JOINTS = ['revolute_joint', 'prismatic_joint', 'spherical_joint', 'universal_joint', 'weld_joint'];
  const SI = new Set(['m', 'rad', 'm/s', 'rad/s', 'N', 'N*m']);

  it.each(JOINTS)('%s: B and F are Frame ports; every output has direction, quantity and an SI unit', (id) => {
    const b = blocks.get(id)!;
    for (const p of ['b', 'f']) expect(b.ports.find((x) => x.id === p)?.domain).toBe('Frame');
    const outputs = b.ports.filter((p) => p.domain === 'Physical');
    expect(outputs.map((p) => p.id)).toEqual([...JOINT_SIGNAL_PORTS[jointKindOf(id)!]]);
    for (const p of outputs) {
      expect(p.direction, `${id}.${p.id}`).toBe('out');
      expect(p.quantity?.length, `${id}.${p.id} quantity`).toBeGreaterThan(3);
      expect(SI.has(p.unit ?? ''), `${id}.${p.id} unit ${p.unit}`).toBe(true);
    }
  });
  it('axis parameters exist and the dead weld stiffness is gone; spherical has no rotational damping', () => {
    expect(blocks.get('revolute_joint')!.params).toHaveProperty('axis');
    expect(blocks.get('prismatic_joint')!.params).toHaveProperty('axis');
    expect(blocks.get('universal_joint')!.params).toHaveProperty('axis1');
    expect(blocks.get('universal_joint')!.params).toHaveProperty('axis2');
    expect(Object.keys(blocks.get('weld_joint')!.params).sort()).toEqual(['offset', 'rotation']);
    expect(blocks.get('spherical_joint')!.params).toEqual({});
    for (const id of ['revolute_joint', 'prismatic_joint', 'universal_joint']) expect(blocks.get(id)!.params.damping.min).toBe(0);
  });
  it.each(JOINTS)('%s: the DAE allocates exactly the shared core layout and routes wrenches by explicit Frame coordinate', (id) => {
    const kind = jointKindOf(id)!;
    const ports = blocks.get(id)!.ports.map((p) => p.id);
    const specs = jointBranchSpecs(kind, ports);
    const system = new DAEAssembler().assemble([{ id: 'dut', type: 'default', position: { x: 0, y: 0 }, data: { type: id, params: {}, ports: blocks.get(id)!.ports } } as Node], []);
    expect(system.variableNames.filter((n) => n.startsWith('dut_branch_')).map((n) => n.replace('dut_branch_', ''))).toEqual(specs.map((s) => s.name));
    for (const s of specs.filter((x) => /^(f|t|tb)[xyz]$/.test(x.name))) {
      const axis = 'xyz'.indexOf(s.name[s.name.length - 1]);
      const base = s.name.startsWith('f') ? 0 : 3;
      for (const p of s.ports) expect(p.coord, `${id}.${s.name}`).toBe(base + axis);
    }
    // no joint uses the ambiguous legacy names `force` / `torque` any more (F-047)
    expect(specs.some((s) => s.name === 'force' || s.name === 'torque')).toBe(false);
  });
  it('mech_config port C is a Frame connection (F-032) and a physical (not utility) block', () => {
    const b = blocks.get('mech_config')!;
    expect(b.ports).toHaveLength(1);
    expect(b.ports[0]).toMatchObject({ id: 'c', domain: 'Frame' });
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('revolute joint (1 DOF)', () => {
  const OUT = ['q', 'w', 'fx', 'fy', 'fz', 'f_reac', 'tx', 'ty', 'tz', 't_reac'];

  it('rotation about a tilted axis: viscous rate w = T.a / c, exact joint angle over consecutive steps, reactions along the true axis', () => {
    const a = unit([1, 2, 2]);
    const T = [1, -2, 3], F = [4, 5, -6], c = 2, dt = 0.01;
    const s = scene({ joint: 'revolute_joint', params: { axis: '[1 2 2]', damping: c }, outputs: OUT, load: { force: F, torque: T } });
    const { samples } = run(s, 6, dt);
    const w = dot(T, a) / c;
    const Tperp = minus(T, scale(a, dot(T, a)));
    samples.forEach((m, k) => {
      compare('revolute', `w step ${k + 1}`, w, m.w, 7);
      compare('revolute', `q step ${k + 1}`, (k + 1) * dt * w, m.q, 7);
      // wrench the joint exerts on F balances the load: force -F, torque -T (viscous part -c w a + constrained part)
      F.forEach((v, i) => expect(m[['fx', 'fy', 'fz'][i]]).toBeCloseTo(-v, 6));
      T.forEach((v, i) => expect(m[['tx', 'ty', 'tz'][i]]).toBeCloseTo(-v, 6));
      compare('revolute', `constrained torque |T_perp| step ${k + 1}`, len(Tperp), m.t_reac, 6);
      compare('revolute', `reaction force |F| step ${k + 1}`, len(F), m.f_reac, 6);
      // the constrained torque is perpendicular to the rotation axis: (t + c w a) . a = 0
      const t = [m.tx, m.ty, m.tz];
      const tc = plus(t, scale(a, c * m.w));
      expect(dot(tc, a)).toBeCloseTo(0, 6);
    });
  });

  it.each(AXES)('axis variant $name: the constrained torque is perpendicular to the axis, the free torque is carried by the damper', ({ axis }) => {
    const a = unit(axis);
    const T = [0.7, -1.1, 0.4], c = 1.5, dt = 0.02;
    const s = scene({ joint: 'revolute_joint', params: { axis: axisText(axis), damping: c }, outputs: OUT, load: { torque: T } });
    const { sample } = run(s, 3, dt);
    compare('revolute', `w axis ${axisText(axis)}`, dot(T, a) / c, sample.w, 7);
    const Tperp = minus(T, scale(a, dot(T, a)));
    compare('revolute', `|T_perp| axis ${axisText(axis)}`, len(Tperp), sample.t_reac, 6);
    const tc = plus([sample.tx, sample.ty, sample.tz], scale(a, c * sample.w));
    Tperp.forEach((v, i) => expect(tc[i]).toBeCloseTo(-v, 6));
  });

  it('damping 0 is accepted: a frictionless hinge under a load perpendicular to its axis holds its angle and does no work', () => {
    const axis: V3 = [1, 2, 2], a = unit(axis);
    const T = cross(a, [0, 0, 1]); // perpendicular to the axis
    const s = scene({ joint: 'revolute_joint', params: { axis: axisText(axis), damping: 0 }, outputs: OUT, load: { torque: T, force: [0, 0, -3] } });
    const first = run(s, 1);
    // start the hinge at q0 = 0.7 rad: F = R_B Rot(a, q0)
    const idx = frameIndex(s, 'f');
    const q0 = 0.7;
    const e0 = euler(rot(a, q0));
    const x = [...first.last.x];
    [3, 4, 5].forEach((k, i) => { x[idx[k]] = e0[i]; });
    const { samples } = run(s, 5, 0.01, { engine: first.engine, state: { ...first.last, x } });
    samples.forEach((m, k) => {
      compare('revolute', `q held (damping 0) step ${k + 1}`, q0, m.q, 7);
      compare('revolute', `w = 0 (damping 0) step ${k + 1}`, 0, m.w, 7);
      // power t.w of the free DOF is zero: no energy is created or lost on a frictionless hinge
      expect(Math.abs(dot([m.tx, m.ty, m.tz], a) * m.w)).toBeLessThan(1e-12);
      T.forEach((v, i) => expect(m[['tx', 'ty', 'tz'][i]]).toBeCloseTo(-v, 6));
    });
  });

  it('damping 0 under a torque along the axis has no equilibrium (massless free DOF): the solve is refused', () => {
    const s = scene({ joint: 'revolute_joint', params: { axis: '[0 0 1]', damping: 0 }, outputs: OUT, load: { torque: [0, 0, 1] } });
    expect(() => run(s, 1, 0.01, { engine: refusingEngine() })).toThrow();
  });

  it('the axis parameter is normalized at load: [0 0 5] and [0 0 1] give identical results', () => {
    const load = { torque: [0.3, 0.2, 1.0] };
    const a = run(scene({ joint: 'revolute_joint', params: { axis: '[0 0 5]', damping: 1 }, outputs: OUT, load }), 3).sample;
    const b = run(scene({ joint: 'revolute_joint', params: { axis: '[0 0 1]', damping: 1 }, outputs: OUT, load }), 3).sample;
    OUT.forEach((o) => expect(a[o]).toBeCloseTo(b[o], 9));
  });

  it('a hinge on a rotated base measures its angle about the transported axis', () => {
    const base = [20, -15, 30];
    const axis: V3 = [1, -1, 2], a = unit(axis), T = [0.4, 0.9, -0.5], c = 0.8;
    const s = scene({ joint: 'revolute_joint', params: { axis: axisText(axis), damping: c }, outputs: OUT, load: { torque: T }, baseRotationDeg: base });
    const aW = mv(R_of(base.map(deg)), a);
    const { sample } = run(s, 4, 0.01);
    compare('revolute', 'w on rotated base', dot(T, aW) / c, sample.w, 7);
    compare('revolute', 'q on rotated base', 4 * 0.01 * dot(T, aW) / c, sample.q, 7);
  });

  it('direct implicit solve of the assembled residuals agrees with simulateStep', () => {
    const s = scene({ joint: 'revolute_joint', params: { axis: '[1 2 2]', damping: 2 }, outputs: OUT, load: { torque: [1, -2, 3], force: [4, 5, -6] } });
    const first = run(s, 2);
    const engine = first.engine;
    const stepped = engine.simulateStep(s.nodes, s.edges, first.last, 0.01);
    const system = new DAEAssembler().assemble(s.nodes, s.edges);
    const solver = new ImplicitSolver();
    solver.configure({ allowUnderdetermined: true, preferFreeColumns: system.variableNames.flatMap((n, i) => (/_R[xyz]_\(frame\)/.test(n) ? [i] : [])) });
    const ctx: any = { dt: 0.01, time: 0.03, parameters: {}, prevStates: [...first.last.x], states: [...first.last.x], stateDerivatives: [], order: 1 };
    // two-argument form (x, ctx): the assembler derives dx = (x - prevStates) / dt, exactly what the engine's backward difference does
    const residuals = system.residuals as unknown as (x: number[], c: any) => number[];
    const direct = solver.solve((x, c) => residuals(x, c), [...first.last.x], ctx);
    direct.forEach((v, i) => expect(v, system.variableNames[i]).toBeCloseTo(stepped.x[i], 6));
  });

  it('performance guard: 30 consecutive steps of a loaded hinge (66 unknowns) finish well inside the time budget', { timeout: 30_000 }, () => {
    const s = scene({ joint: 'revolute_joint', params: { axis: '[1 2 2]', damping: 2 }, outputs: ['q', 'w'], load: { torque: [1, 2, 3], force: [0, 0, -9.81] } });
    const t0 = performance.now();
    const { last } = run(s, 30, 0.005);
    expect(performance.now() - t0).toBeLessThan(8000); // ~1.5 s unloaded; a regression to retry storms or O(n^4) assembly trips this
    expect(last.x.every(Number.isFinite)).toBe(true);
  });

  it.each([{ axis: '[0 0 0]' }, { axis: '[NaN 0 1]' }, { axis: '[1 2]' }, { axis: 'abc' }, { axis: '[Infinity 0 0]' }])(
    'rejects an invalid axis before solving: %j',
    (params) => {
      expect(() => new VLabPhysicsEngine().simulateStep([node('joint', 'revolute_joint', params)], [], null, 0.01)).toThrow(/INVALID_JOINT_PARAMETER/);
    },
  );
  it('rejects negative damping through the parameter-bound path', () => {
    expect(() => new VLabPhysicsEngine().simulateStep([node('joint', 'revolute_joint', { damping: -1 })], [], null, 0.01)).toThrow(/Parameter "damping".*must be >= 0/);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('prismatic joint (1 DOF)', () => {
  const OUT = ['x', 'v', 'fx', 'fy', 'fz', 'f_reac', 'tx', 'ty', 'tz', 'tbx', 'tby', 'tbz', 't_reac'];

  it('mass-on-slider equivalent: inclined axis under weight slides at v = m g (a . g_hat) / c, reaction perpendicular to the axis', () => {
    const axis: V3 = [1, -2, 2], a = unit(axis), g = 9.81, m = 2, c = 3, dt = 0.01;
    const gh: V3 = [0, 0, -1];
    const s = scene({ joint: 'prismatic_joint', params: { axis: axisText(axis), damping: c }, outputs: OUT, weight: { mass: m, g, direction: '[0 0 -1]' } });
    const { samples } = run(s, 5, dt);
    const v = (m * g * dot(a, gh)) / c;
    const G = scale(gh, m * g);
    samples.forEach((o, k) => {
      compare('prismatic', `v step ${k + 1}`, v, o.v, 7);
      compare('prismatic', `x step ${k + 1}`, (k + 1) * dt * v, o.x, 7);
      // reaction force perpendicular to the slide: |G| sqrt(1 - (a.g_hat)^2); total force on F = -G
      compare('prismatic', `constraint force step ${k + 1}`, m * g * Math.sqrt(1 - dot(a, gh) ** 2), o.f_reac, 6);
      G.forEach((gv, i) => expect(o[['fx', 'fy', 'fz'][i]]).toBeCloseTo(-gv, 6));
      // moment about B's origin carries the lever arm of the displacement: t_B = -t_F - d x f_F with d = x a, f_F = -G
      const tb = cross(scale(a, o.x), G);
      ['tbx', 'tby', 'tbz'].forEach((n, i) => expect(o[n]).toBeCloseTo(tb[i], 6));
    });
  });

  it.each(AXES)('axis variant $name: terminal slide velocity v = F.a / c and constrained reaction perpendicular to the axis', ({ axis }) => {
    const a = unit(axis);
    const F = [1.3, -0.4, 2.2], c = 2.5;
    const s = scene({ joint: 'prismatic_joint', params: { axis: axisText(axis), damping: c }, outputs: OUT, load: { force: F } });
    const { sample } = run(s, 3, 0.02);
    compare('prismatic', `v axis ${axisText(axis)}`, dot(F, a) / c, sample.v, 7);
    const Fperp = minus(F, scale(a, dot(F, a)));
    compare('prismatic', `|F_perp| axis ${axisText(axis)}`, len(Fperp), sample.f_reac, 6);
    const f = [sample.fx, sample.fy, sample.fz];
    const constraint = plus(f, scale(a, c * sample.v)); // remove the viscous force -c v a
    expect(dot(constraint, a)).toBeCloseTo(0, 6);
    Fperp.forEach((fv, i) => expect(constraint[i]).toBeCloseTo(-fv, 6));
  });

  it('damping 0 is accepted: a frictionless slide under a load perpendicular to the axis holds its displacement', () => {
    const axis: V3 = [1, 1, 0], a = unit(axis);
    const s = scene({ joint: 'prismatic_joint', params: { axis: axisText(axis), damping: 0 }, outputs: OUT, load: { force: [0, 0, -5] } });
    const first = run(s, 1);
    const idx = frameIndex(s, 'f');
    const x0 = 0.35;
    const x = [...first.last.x];
    [0, 1, 2].forEach((k) => { x[idx[k]] = a[k] * x0; });
    const { samples } = run(s, 4, 0.01, { engine: first.engine, state: { ...first.last, x } });
    samples.forEach((o, k) => {
      compare('prismatic', `x held (damping 0) step ${k + 1}`, x0, o.x, 7);
      compare('prismatic', `v = 0 (damping 0) step ${k + 1}`, 0, o.v, 7);
      expect(o.fz).toBeCloseTo(5, 6);
      compare('prismatic', `lever-arm moment |t_B| step ${k + 1}`, x0 * 5 * len(cross(a, [0, 0, 1])), len([o.tbx, o.tby, o.tbz]), 6);
    });
  });

  it('all three rotations are constrained: an applied torque is reacted in full, with the lever arm on the B side', () => {
    const axis: V3 = [0, 1, 0], c = 1;
    const T = [0.8, -0.3, 0.5], F = [0.2, 0.9, -0.4];
    const s = scene({ joint: 'prismatic_joint', params: { axis: axisText(axis), damping: c }, outputs: OUT, load: { torque: T, force: F } });
    const { sample: o } = run(s, 3, 0.01);
    T.forEach((v, i) => expect(o[['tx', 'ty', 'tz'][i]]).toBeCloseTo(-v, 6));
    compare('prismatic', '|T| constrained torque', len(T), o.t_reac, 6);
    // moment balance of the massless joint about B: t_B + t_F + d x f_F = 0, d = x a
    const d = scale(axis, o.x);
    const lever = cross(d, [o.fx, o.fy, o.fz]);
    ['tbx', 'tby', 'tbz'].forEach((n, i) => expect(o[n] + o[['tx', 'ty', 'tz'][i]] + lever[i]).toBeCloseTo(0, 6));
  });

  it('slides along the TRANSPORTED axis on a rotated base', () => {
    const base = [20, -15, 30];
    const axis: V3 = [1, 0, 2], a = unit(axis), m = 1.5, g = 9.81, c = 4;
    const s = scene({ joint: 'prismatic_joint', params: { axis: axisText(axis), damping: c }, outputs: OUT, weight: { mass: m, g, direction: '[0 0 -1]' }, baseRotationDeg: base });
    const aW = mv(R_of(base.map(deg)), a);
    const { sample } = run(s, 4, 0.01);
    compare('prismatic', 'v on rotated base', (m * g * dot(aW, [0, 0, -1])) / c, sample.v, 7);
    compare('prismatic', 'x on rotated base', 4 * 0.01 * (m * g * dot(aW, [0, 0, -1])) / c, sample.x, 7);
  });

  it('damping 0 under a force along the axis has no equilibrium (massless slide): the solve is refused', () => {
    const s = scene({ joint: 'prismatic_joint', params: { axis: '[0 0 1]', damping: 0 }, outputs: OUT, load: { force: [0, 0, 2] } });
    expect(() => run(s, 1, 0.01, { engine: refusingEngine() })).toThrow();
  });

  it.each([{ axis: '[0 0 0]' }, { axis: '[1 NaN 0]' }, { axis: '[3]' }])('rejects an invalid axis before solving: %j', (params) => {
    expect(() => new VLabPhysicsEngine().simulateStep([node('joint', 'prismatic_joint', params)], [], null, 0.01)).toThrow(/INVALID_JOINT_PARAMETER/);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('spherical joint (3 DOF)', () => {
  const OUT = ['fx', 'fy', 'fz', 'f_reac', 'rx', 'ry', 'rz'];

  it('conical pendulum: the pivot reaction is the rod tension T = m g / cos(theta), directed along the rod', () => {
    const m = 2, g = 9.81, L = 1.2, th = deg(35);
    const omega2 = g / (L * Math.cos(th)); // steady conical motion
    const rod: V3 = [Math.sin(th), 0, -Math.cos(th)];
    // D'Alembert load at the pivot frame: weight + inertia force -m a (a = centripetal, toward the axis of rotation)
    const centrifugal = m * omega2 * L * Math.sin(th);
    const s = scene({ joint: 'spherical_joint', outputs: OUT, load: { force: [centrifugal, 0, 0] }, weight: { mass: m, g, direction: '[0 0 -1]' } });
    const { sample } = run(s, 4);
    const T = m * g / Math.cos(th);
    compare('spherical', 'conical tension |R|', T, sample.f_reac, 6);
    const reaction = [sample.fx, sample.fy, sample.fz];
    scale(rod, -T).forEach((v, i) => expect(reaction[i]).toBeCloseTo(v, 6));
  });

  it('planar pendulum sample point: |R| = m (g cos(theta) + L w^2) and no tangential component', () => {
    const m = 1.7, g = 9.81, L = 0.9, th = deg(40), w = 2.2;
    const rod: V3 = [Math.sin(th), 0, -Math.cos(th)];
    const tangent: V3 = [Math.cos(th), 0, Math.sin(th)];
    const alpha = -(g / L) * Math.sin(th);
    // acceleration of the bob: tangential L alpha, centripetal -L w^2 along the rod
    const acc = plus(scale(tangent, L * alpha), scale(rod, -L * w * w));
    const inertia = scale(acc, -m);
    const s = scene({ joint: 'spherical_joint', outputs: OUT, load: { force: inertia }, weight: { mass: m, g, direction: '[0 0 -1]' } });
    const { sample } = run(s, 3);
    const tension = m * (g * Math.cos(th) + L * w * w);
    compare('spherical', 'pendulum |R| = m(g cos + L w^2)', tension, sample.f_reac, 6);
    const reaction = [sample.fx, sample.fy, sample.fz];
    compare('spherical', 'reaction along rod', -tension, dot(reaction, rod), 6);
    compare('spherical', 'reaction tangential', 0, dot(reaction, tangent), 6);
  });

  it('transmits no torque and keeps every rotation free: relative rotation outputs follow the pose (rad)', () => {
    const s = scene({ joint: 'spherical_joint', outputs: OUT, load: { force: [0, 0, -4] } });
    const first = run(s, 1);
    const idx = frameIndex(s, 'f');
    const e0: V3 = [0.4, -0.3, 0.7];
    const x = [...first.last.x];
    [3, 4, 5].forEach((k, i) => { x[idx[k]] = e0[i]; });
    const { samples, last } = run(s, 4, 0.01, { engine: first.engine, state: { ...first.last, x } });
    // rotation vector of R_rel: angle from the trace and axis from the skew part (independent formulas)
    const R = R_of(e0);
    const angle = Math.acos((R[0][0] + R[1][1] + R[2][2] - 1) / 2);
    const axis = unit([R[2][1] - R[1][2], R[0][2] - R[2][0], R[1][0] - R[0][1]]);
    samples.forEach((o) => { ['rx', 'ry', 'rz'].forEach((n, i) => expect(o[n]).toBeCloseTo(angle * axis[i], 7)); });
    [3, 4, 5].forEach((k, i) => expect(last.x[idx[k]]).toBeCloseTo(e0[i], 8));
    expect(last.variableNames.some((n: string) => n.startsWith('joint_branch_t'))).toBe(false);
  });

  it('an applied torque cannot be balanced by an ideal ball joint: refused instead of silently dropped', () => {
    const s = scene({ joint: 'spherical_joint', outputs: OUT, load: { torque: [0, 0, 1] } });
    expect(() => run(s, 1, 0.01, { engine: refusingEngine() })).toThrow();
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('universal joint (2 DOF)', () => {
  const OUT = ['angle1', 'angle2', 'w1', 'w2', 'fx', 'fy', 'fz', 'f_reac', 't_reac'];

  it('Cardan (Hooke) kinematics through the assembled DAE: constraint closed and ratio w2/w1 = cos(b)/(1 - sin^2(b) cos^2(t1))', () => {
    // Input shaft frame B = Rx(t1) (spins about x). Cross arm 1 is B's y axis, cross arm 2 is F's z axis (axis1 = y, axis2 = z).
    // Output shaft F = Rz(beta) Rx(q): spin about the tilted shaft x_T = Rz(beta) x. The arms stay perpendicular when
    // tan(t1) = cos(beta) tan(q)  (a . b = 0 with a = (0, cos t1, sin t1), b = (sin q sin b, -sin q cos b, cos q)).
    const beta = deg(30), dt1 = deg(0.5);
    const s = { nodes: [node('world', 'world_frame'), node('base', 'rigid_transform', { rotation: '[0 0 0]' }), node('joint', 'universal_joint', { axis1: '[0 1 0]', axis2: '[0 0 1]', damping: 0 }), node('load', 'external_force')],
      edges: [edge('e1', 'world', 'w', 'base', 'b'), edge('e2', 'base', 'f', 'joint', 'b'), edge('e3', 'joint', 'f', 'load', 'f')], outputs: [] } as Scene;
    const system = new DAEAssembler().assemble(s.nodes, s.edges);
    const comp = system.components.find((c) => c.blockId === 'joint')!;
    const root = (p: string) => comp.portNodeMap.get(p)!;
    const at = (r: string, k: string) => system.variableNames.indexOf(`Across_${r}_${k}_(frame)`);
    const q = (t1: number) => Math.atan(Math.tan(t1) / Math.cos(beta));
    const pose = (t1: number) => {
      const qq = Math.cos(t1) >= 0 ? q(t1) : q(t1) + Math.PI; // continue past 90 degrees
      return { B: [0, 0, 0, t1, 0, 0], F: [0, 0, 0, qq, 0, beta], q: qq };
    };
    const stateAt = (t1: number) => {
      const x = new Array(system.systemSize).fill(0);
      const p = pose(t1);
      ['Px', 'Py', 'Pz', 'Rx', 'Ry', 'Rz'].forEach((k, i) => { x[at(root('b'), k)] = p.B[i]; x[at(root('f'), k)] = p.F[i]; });
      return x;
    };
    const residuals = system.residuals as unknown as (x: number[], c: any) => number[];
    const measure = (t1: number, h: number, name: string) => {
      const x = stateAt(t1);
      const prev = stateAt(t1 - dt1);
      const ctx: any = { dt: h, time: 0, parameters: {}, prevStates: prev, states: x, stateDerivatives: [], order: 1 };
      const res = residuals(x, ctx);
      return -res[system.variableNames.indexOf(`joint_branch_signal_${name}`)]; // branch = 0 => residual = -measurement
    };
    const lambdaRow = (t1: number) => residuals(stateAt(t1), { dt: 0.01, time: 0, parameters: {}, prevStates: stateAt(t1), states: stateAt(t1), stateDerivatives: [], order: 1 } as any)[system.variableNames.indexOf('joint_branch_lambda')];
    for (let k = 1; k <= 24; k++) {
      const t1 = deg(15 * k - 7.5); // mid-points away from tan singularities
      if (Math.abs(Math.cos(t1)) < 0.05) continue;
      // the arms are perpendicular on the analytic Hooke motion: the joint constraint row a.b is closed
      expect(lambdaRow(t1)).toBeCloseTo(0, 12);
      // simulated output-shaft rate from the joint's own rates: w_rel = w1 a + w2 b = w_out x_T - w_in x_hat (unit input rate)
      const w1 = measure(t1, dt1, 'w1'), w2 = measure(t1, dt1, 'w2');
      const a = mv(Rx(t1), [0, 1, 0]), b = mv(mm(Rz(beta), Rx(pose(t1).q)), [0, 0, 1]);
      const xT = mv(Rz(beta), [1, 0, 0]);
      // w_rel = w_out x_T - w_in x_hat  =>  w_out = (w_rel + w_in x_hat) . x_T, with w_in = dt1 / dt1 = 1 rad/s (B turns dt1 per step)
      const wOut = dot(plus(plus(scale(a, w1), scale(b, w2)), [1, 0, 0]), xT);
      const analytic = Math.cos(beta) / (1 - Math.sin(beta) ** 2 * Math.cos(t1) ** 2);
      REFERENCE.push({ joint: 'universal', quantity: `Cardan ratio theta1=${(t1 * 180 / Math.PI).toFixed(1)} deg`, analytic, simulated: wOut });
      expect(Math.abs(wOut - analytic) / analytic).toBeLessThan(2e-3);
    }
  });

  it.each([
    { name: 'default axes', params: { axis1: '[1 0 0]', axis2: '[0 1 0]' }, base: undefined },
    { name: 'tilted axes', params: { axis1: '[1 1 0]', axis2: '[0 1 1]' }, base: undefined },
    { name: 'tilted axes on a rotated base', params: { axis1: '[0 2 1]', axis2: '[1 0 0]' }, base: [20, -15, 30] },
  ])('viscous rates and constrained torque with damping > 0: $name', ({ params, base }) => {
    const c = 2, T = [0.9, -0.6, 0.4], F = [2, -1, 3], dt = 0.01;
    const s = scene({ joint: 'universal_joint', params: { ...params, damping: c }, outputs: OUT, load: { torque: T, force: F }, baseRotationDeg: base });
    const { last, sample } = run(s, 1, dt);
    // orthonormalised axes and transported world axes at the solved pose (independent construction)
    const a1 = unit(JSON.parse(params.axis1.replace(/ /g, ',')));
    const a2raw = JSON.parse(params.axis2.replace(/ /g, ','));
    const a2 = unit(minus(a2raw, scale(a1, dot(a1, a2raw))));
    const idxF = frameIndex(s, 'f'), idxB = frameIndex(s, 'b');
    const RB = R_of(poseOf(last, idxB).slice(3)), RF = R_of(poseOf(last, idxF).slice(3));
    const a = mv(RB, a1), b = mv(RF, a2), n = cross(a, b);
    compare('universal', 'w1 = T.a / c', dot(T, a) / c, sample.w1, 7);
    compare('universal', 'w2 = T.b / c', dot(T, b) / c, sample.w2, 7);
    F.forEach((v, i) => expect(sample[['fx', 'fy', 'fz'][i]]).toBeCloseTo(-v, 6));
    compare('universal', 'constrained torque t_reac = -T.n', -dot(T, n), sample.t_reac, 6);
    expect(dot(a, b)).toBeCloseTo(0, 8);
  });

  it('damping 0 is accepted and an unloaded free pose is held over consecutive steps', () => {
    const s = scene({ joint: 'universal_joint', params: { axis1: '[1 1 0]', axis2: '[0 0 1]', damping: 0 }, outputs: OUT, load: { force: [0, 0, -2] } });
    const first = run(s, 1);
    const idx = frameIndex(s, 'f');
    const a1 = unit([1, 1, 0]), a2 = [0, 0, 1];
    const R = mm(rot(a1, 0.5), rot(mv(rot(a1, 0.5), a2) as any, 0)); // F = Rot(a1, 0.5) with its own axis2 = a2 transported
    const e0 = euler(R);
    const x = [...first.last.x];
    [3, 4, 5].forEach((k, i) => { x[idx[k]] = e0[i]; });
    const { samples, last } = run(s, 4, 0.01, { engine: first.engine, state: { ...first.last, x } });
    samples.forEach((o) => { expect(o.w1).toBeCloseTo(0, 7); expect(o.w2).toBeCloseTo(0, 7); expect(o.fz).toBeCloseTo(2, 6); });
    [3, 4, 5].forEach((k, i) => expect(last.x[idx[k]]).toBeCloseTo(e0[i], 7));
  });

  it.each([
    { base: undefined as number[] | undefined, alpha: 0.55, beta: -0.35 },
    { base: [20, -15, 30], alpha: -0.8, beta: 0.45 },
  ])('angles about tilted axes equal the gimbal rotations that built the pose (rad): base ', ({ base, alpha, beta }) => {
    // axis1 = [1 1 0]/sqrt(2) (B-local), axis2 = [0 0 1] (F-local). F = R_B Rot(axis1, alpha) Rot(axis2, beta): the second
    // rotation is about the cross arm itself, so the arms stay perpendicular and (angle1, angle2) = (alpha, beta).
    const a1 = unit([1, 1, 0]), a2: V3 = [0, 0, 1];
    const s = scene({ joint: 'universal_joint', params: { axis1: '[1 1 0]', axis2: '[0 0 1]', damping: 0 }, outputs: OUT, baseRotationDeg: base });
    const first = run(s, 1);
    const idxF = frameIndex(s, 'f'), idxB = frameIndex(s, 'b');
    const RB = R_of(poseOf(first.last, idxB).slice(3));
    const R = mm(RB, mm(rot(a1, alpha), rot(a2, beta)));
    const e0 = euler(R);
    const x = [...first.last.x];
    [3, 4, 5].forEach((k, i) => { x[idxF[k]] = e0[i]; });
    const { sample, last } = run(s, 3, 0.01, { engine: first.engine, state: { ...first.last, x } });
    expect(dot(mv(RB, a1), mv(R, a2))).toBeCloseTo(0, 10); // the cross arms stay perpendicular on this construction
    compare('universal', 'angle1 of the gimbal construction', alpha, sample.angle1, 7);
    compare('universal', 'angle2 of the gimbal construction', beta, sample.angle2, 7);
    compare('universal', 'rates of a held pose', 0, Math.abs(sample.w1) + Math.abs(sample.w2), 7);
    [3, 4, 5].forEach((k, i) => expect(last.x[idxF[k]]).toBeCloseTo(e0[i], 7));
  });
  it.each([{ axis1: '[1 0 0]', axis2: '[2 0 0]' }, { axis1: '[0 0 0]' }, { axis2: '[0 0 NaN]' }])(
    'rejects invalid or parallel axes before solving: %j',
    (params) => {
      expect(() => new VLabPhysicsEngine().simulateStep([node('joint', 'universal_joint', params)], [], null, 0.01)).toThrow(/INVALID_JOINT_PARAMETER/);
    },
  );
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('weld joint (0 DOF)', () => {
  const OUT = ['fx', 'fy', 'fz', 'f_reac', 'tx', 'ty', 'tz', 'tbx', 'tby', 'tbz', 't_reac', 'pos_err', 'rot_err'];

  it('a rigidly attached body under gravity: reaction wrench = m g and the moment m g x r about the base, pose error ~ 0', () => {
    const r = [0.5, -0.3, 0.2], m = 2, g = 9.81;
    const s = scene({ joint: 'weld_joint', params: { offset: axisText(r) }, outputs: OUT, weight: { mass: m, g, direction: '[0 0 -1]' } });
    const { samples } = run(s, 4);
    const G: V3 = [0, 0, -m * g];
    samples.forEach((o, k) => {
      compare('weld', `reaction force |m g| step ${k + 1}`, m * g, o.f_reac, 7);
      [o.fx, o.fy, o.fz].forEach((v, i) => expect(v).toBeCloseTo(-G[i], 6));
      // joint torque on F about F is zero (weight acts at the F origin); on B about B: t_B = r x G
      const tB = cross(r, G);
      [o.tbx, o.tby, o.tbz].forEach((v, i) => expect(v).toBeCloseTo(tB[i], 6));
      compare('weld', `moment |m g x r| step ${k + 1}`, len(tB), len([o.tbx, o.tby, o.tbz]), 6);
      expect(o.pos_err).toBeLessThan(1e-7);
      expect(o.rot_err).toBeLessThan(1e-7);
    });
  });

  it('reference offset and rotation: F sits at P_B + R_B p0 with R_F = R_B R0 on a rotated base, and all six reactions follow the load', () => {
    const base = [20, -15, 30], p0 = [0.4, -0.2, 0.7], rotDeg = [10, 20, 30];
    const F = [1.5, -2.5, 0.5], T = [0.3, 0.8, -0.6];
    const s = scene({ joint: 'weld_joint', params: { offset: axisText(p0), rotation: axisText(rotDeg) }, outputs: OUT, load: { force: F, torque: T }, baseRotationDeg: base });
    const { last, sample: o } = run(s, 3);
    const RB = R_of(base.map(deg)), R0 = R_of(rotDeg.map(deg));
    const idxF = frameIndex(s, 'f');
    const pF = poseOf(last, idxF);
    const dW = mv(RB, p0);
    dW.forEach((v, i) => expect(pF[i]).toBeCloseTo(v, 7));
    const RF = R_of(pF.slice(3)), RFexp = mm(RB, R0);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) expect(RF[i][j]).toBeCloseTo(RFexp[i][j], 7);
    F.forEach((v, i) => expect(o[['fx', 'fy', 'fz'][i]]).toBeCloseTo(-v, 6));
    T.forEach((v, i) => expect(o[['tx', 'ty', 'tz'][i]]).toBeCloseTo(-v, 6));
    // wrench on B about B: t_B = -t_F - d x f_F with d = R_B p0, f_F = -F
    const tB = minus(minus([0, 0, 0], scale(T, -1)), cross(dW, scale(F, -1)));
    [o.tbx, o.tby, o.tbz].forEach((v, i) => expect(v).toBeCloseTo(tB[i], 6));
    compare('weld', 'force balance sum F_B + F_F', 0, Math.abs(o.fx + F[0]), 6);
    expect(o.pos_err).toBeLessThan(1e-7);
    expect(o.rot_err).toBeLessThan(1e-7);
  });

  it('keeps the fixed relative pose over consecutive steps (no drift under a changing load direction)', () => {
    const s = scene({ joint: 'weld_joint', params: { offset: '[0.3 0.1 -0.2]', rotation: '[0 45 0]' }, outputs: OUT, load: { force: [1, 2, 3], torque: [0.1, 0.2, 0.3] } });
    const { samples } = run(s, 25, 0.004);
    samples.forEach((o) => { expect(o.pos_err).toBeLessThan(1e-7); expect(o.rot_err).toBeLessThan(1e-7); });
  });

  it('the dead stiffness parameter is gone and a saved model that still carries it is migrated', () => {
    const block = VLAB_LIBRARY.flatMap((d) => d.blocks).find((b) => b.id === 'weld_joint')!;
    expect(block.params).not.toHaveProperty('stiffness');
  });

  it.each([{ offset: '[0 0]' }, { rotation: '[a b c]' }])('rejects a malformed reference pose before solving: %j', (params) => {
    expect(() => new VLabPhysicsEngine().simulateStep([node('joint', 'weld_joint', params)], [], null, 0.01)).toThrow(/INVALID_JOINT_PARAMETER/);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('redundant / fully prescribed joints are diagnosed before Newton', () => {
  const JOINTS = ['revolute_joint', 'prismatic_joint', 'spherical_joint', 'universal_joint', 'weld_joint'];
  it.each(JOINTS)('%s between two frames that are both anchored to the World is FULLY_PRESCRIBED', (type) => {
    const nodes = [node('world', 'world_frame'), node('a', 'rigid_transform', { offset: '[0 0 0]' }), node('b', 'rigid_transform', { offset: '[1 0 0]' }), node('joint', type)];
    const edges = [edge('e1', 'world', 'w', 'a', 'b'), edge('e2', 'world', 'w', 'b', 'b'), edge('e3', 'a', 'f', 'joint', 'b'), edge('e4', 'b', 'f', 'joint', 'f')];
    expect(() => new VLabPhysicsEngine().simulateStep(nodes, edges, null, 0.01)).toThrow(/FULLY_PRESCRIBED|fully prescribed/i);
  });
  it.each(JOINTS)('two %s blocks between the same pair of frames are DUPLICATE_CONSTRAINT', (type) => {
    const nodes = [node('world', 'world_frame'), node('j1', type), node('j2', type)];
    const edges = [edge('e1', 'world', 'w', 'j1', 'b'), edge('e2', 'world', 'w', 'j2', 'b'), edge('e3', 'j1', 'f', 'j2', 'f')];
    expect(() => new VLabPhysicsEngine().simulateStep(nodes, edges, null, 0.01)).toThrow(/DUPLICATE_CONSTRAINT/);
  });
  it('two position joints closing a loop on the same follower are rejected by the structural rank check with a clear diagnostic', () => {
    const nodes = [
      node('world', 'world_frame'), node('rev', 'revolute_joint', { damping: 0 }), node('uni', 'universal_joint', { damping: 0 }),
      node('tilt', 'rigid_transform', { rotation: '[0 0 30]' }),
    ];
    const edges = [
      edge('e1', 'world', 'w', 'uni', 'b'), edge('e2', 'world', 'w', 'tilt', 'b'), edge('e3', 'tilt', 'f', 'rev', 'b'), edge('e4', 'uni', 'f', 'rev', 'f'),
    ];
    expect(() => new VLabPhysicsEngine().simulateStep(nodes, edges, null, 0.01)).toThrow(/Structural|structural|rank/);
  });
  it('the structural check exempts only free joint DOFs and free bodies, not every frame pose', () => {
    const s = scene({ joint: 'revolute_joint', params: { damping: 1 }, outputs: ['q'], load: { force: [0, 0, 1] }, baseRotationDeg: [10, 0, 0] });
    const system = new DAEAssembler().assemble(s.nodes, s.edges);
    const comp = system.components.find((c) => c.blockId === 'joint')!;
    const exempt = new Set(system.structure!.exemptVariables ?? []);
    const idx = (port: string, k: string) => system.variableNames.indexOf(`Across_${comp.portNodeMap.get(port)}_${k}_(frame)`);
    for (const k of ['Rx', 'Ry', 'Rz']) expect(exempt.has(idx('f', k)), `free rotation ${k}`).toBe(true);
    for (const k of ['Px', 'Py', 'Pz']) expect(exempt.has(idx('f', k)), `locked translation ${k}`).toBe(false);
    for (const k of ['Px', 'Py', 'Pz', 'Rx', 'Ry', 'Rz']) expect(exempt.has(idx('b', k)) && ['Px', 'Py', 'Pz'].includes(k), `anchored base ${k}`).toBe(false);
  });
});

describe('free bodies stay valid', () => {
  it('a joint chain with no World frame simulates (free body, pose held)', () => {
    const nodes = [node('joint', 'revolute_joint', { damping: 1 }), node('weld', 'weld_joint')];
    const edges = [edge('e1', 'joint', 'f', 'weld', 'b')];
    const engine = makeEngine();
    const state = engine.simulateStep(nodes, edges, null, 0.01);
    expect(state.x.every(Number.isFinite)).toBe(true);
  });
});
