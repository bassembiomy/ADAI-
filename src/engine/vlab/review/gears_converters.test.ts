import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import { VLAB_LIBRARY } from '../../../utils/vlabLibrary';
import { VLabPhysicsEngine } from '../vlabPhysics';
import { DAEAssembler } from '../DAEAssembler';
import { validateBlockParams } from '../vlabParams';
import { checkEdgeSet, validateConnection } from '../vlabConnectionRules';
import { UNSUPPORTED_BLOCKS } from '../vlabStructure';
import { PORT_QUANTITIES } from './portQuantities';
import { isGenericText } from './contractChecks';

/**
 * WP-13b: gears, belts/cables, lever, wheel-and-axle and the mechanical/domain converters.
 *
 * Every expected value is derived IN THIS FILE from the published relation (Simscape Foundation / Driveline block
 * reference for the block, or the power-conservation derivation named in the comment); nothing is read back from the code
 * under test. Convention (Simscape): a through variable is positive A -> B through the block, across = x_A - x_B; the
 * through variable of a SINGLE-ENDED port is the one INTO the block, so the power into a block is the sum of
 * (through into the block) x (across) over its ports, and an ideal converter has zero net power.
 *
 * F-033 decision (documented, tested below): common_gear and rack_pinion stay SCALAR Rotational / Translational blocks
 * (the Simscape Driveline style, ground-referenced shafts). A Frame can only meet a scalar network through the
 * Rotational / Translational Multibody Interface blocks; the connection rules reject every other scalar <-> Frame wire.
 */

// ── model builders ──────────────────────────────────────────────────────────────────────────────────────────────────
const node = (id: string, type: string, params: Record<string, any> = {}): Node =>
  ({ id, type: 'default', position: { x: 0, y: 0 }, data: { type, params } }) as any;
let edgeCount = 0;
/** wire('a.p', 'b.n') */
const wire = (a: string, b: string): Edge => {
  const [sa, pa] = a.split('.');
  const [sb, pb] = b.split('.');
  return { id: `e${edgeCount++}`, source: sa, sourceHandle: pa, target: sb, targetHandle: pb } as Edge;
};
interface Model { nodes: Node[]; edges: Edge[] }

function simulate(m: Model, steps: number, dt: number) {
  const engine = new VLabPhysicsEngine();
  engine.setStepBudget({ maxStepAttempts: 60, wallClockMs: 20000 });
  let state: any = null;
  const history: any[] = [];
  for (let i = 0; i < steps; i++) {
    state = engine.simulateStep(m.nodes, m.edges, state, dt);
    history.push(state);
  }
  const system = new DAEAssembler().assemble(m.nodes, m.edges);
  const at = (name: string, s: any = state): number => {
    const i = s.variableNames.indexOf(name);
    if (i < 0) throw new Error(`no variable ${name}`);
    return s.x[i];
  };
  /** across variable of one scalar port */
  const across = (block: string, port: string, s: any = state): number => {
    const root = system.components.find((c) => c.blockId === block)!.portNodeMap.get(port)!;
    const i = s.variableNames.findIndex((n: string) => n.startsWith(`Across_${root}_(`));
    if (i < 0) throw new Error(`no across variable of ${block}.${port}`);
    return s.x[i];
  };
  /** the six pose coordinates of a Frame port */
  const pose = (block: string, port: string, s: any = state): number[] => {
    const root = system.components.find((c) => c.blockId === block)!.portNodeMap.get(port)!;
    return ['Px', 'Py', 'Pz', 'Rx', 'Ry', 'Rz'].map((a) => s.x[s.variableNames.indexOf(`Across_${root}_${a}_(frame)`)]);
  };
  return { state, history, at, across, pose };
}

/** Relative closeness for quantities that settle numerically. */
const near = (actual: number, expected: number, rel = 1e-6, label = '') => {
  const tol = rel * Math.max(Math.abs(expected), 1e-12);
  expect(Math.abs(actual - expected), `${label} actual ${actual} expected ${expected}`).toBeLessThanOrEqual(tol);
};

/**
 * Power balance of one block: sum of (through into the block) x (across) over its ports. `loss` is the published
 * dissipation of the block (0 for an ideal converter). |sum - loss| < 1e-9 |P_in| with P_in the largest port power.
 */
const expectPowerBalance = (terms: [number, number][], loss = 0, label = '') => {
  const total = terms.reduce((s, [through, acrossValue]) => s + through * acrossValue, 0);
  const pin = Math.max(...terms.map(([through, acrossValue]) => Math.abs(through * acrossValue)));
  expect(pin, `${label}: block must carry power`).toBeGreaterThan(0);
  expect(Math.abs(total - loss), `${label}: net power ${total} (published loss ${loss}), P_in ${pin}`).toBeLessThan(1e-9 * pin);
};

const block = (id: string) => VLAB_LIBRARY.flatMap((d) => d.blocks).find((b) => b.id === id)!;
const portDomains = (id: string) => Object.fromEntries(block(id).ports.map((p) => [p.id, p.domain]));

const SCOPE_BLOCKS = [
  'gear_box', 'common_gear', 'rack_pinion', 'wheel_axle', 'lever', 'belt_properties', 'belt_end', 'belt_spool', 'pulley',
  'rotational_electromechanical_converter', 'translational_electromechanical_converter', 'em_converter', 'dc_motor',
  'gas_rotational_conv', 'gas_translational_conv', 'rot_multibody_interface', 'trans_multibody_interface',
];

// ── 1. ports, domains, parameters, documentation ───────────────────────────────────────────────────────────────────
describe('WP-13b ports, domains and documentation', () => {
  it('every block of the group has exactly the published port domains', () => {
    const R = 'Rotational', T = 'Translational';
    expect(portDomains('gear_box')).toEqual({ s1: R, s2: R });
    expect(portDomains('common_gear')).toEqual({ b: R, f: R });
    expect(portDomains('rack_pinion')).toEqual({ b: R, f: T });
    expect(portDomains('wheel_axle')).toEqual({ a: R, p: T });
    expect(portDomains('lever')).toEqual({ a: T, b: T, c: T });
    expect(portDomains('belt_spool')).toEqual({ r: R, a: T, p: 'BeltProperty', t: 'Physical' });
    expect(portDomains('pulley')).toEqual({ r: R, a: T, b: T, p: 'BeltProperty', t: 'Physical' });
    expect(portDomains('belt_end')).toEqual({ r: T, e: T, p: 'BeltProperty', f: 'Physical' });
    expect(portDomains('rotational_electromechanical_converter')).toEqual({ p: 'Electrical', n: 'Electrical', r: R, c: R });
    expect(portDomains('translational_electromechanical_converter')).toEqual({ p: 'Electrical', n: 'Electrical', r: T, c: T });
    expect(portDomains('em_converter')).toEqual({ p: 'Electrical', n: 'Electrical', mag_n: 'Magnetic', mag_s: 'Magnetic' });
    expect(portDomains('dc_motor')).toEqual({ p: 'Electrical', n: 'Electrical', r: R });
    expect(portDomains('gas_rotational_conv')).toEqual({ a: 'Gas', h: 'Gas', r: R, c: R });
    expect(portDomains('gas_translational_conv')).toEqual({ a: 'Gas', h: 'Gas', r: T, c: T });
    // the multibody interfaces are the scalar <-> Frame bridges: Frame B/F on one side, a scalar network on the other
    expect(portDomains('rot_multibody_interface')).toEqual({ b: 'Frame', f: 'Frame', r: R, c: R, w: 'Physical' });
    expect(portDomains('trans_multibody_interface')).toEqual({ b: 'Frame', f: 'Frame', r: T, c: T, v: 'Physical' });
  });

  it('F-033: common_gear and rack_pinion have NO Frame port (scalar Simscape Driveline style) and say so', () => {
    for (const id of ['common_gear', 'rack_pinion']) {
      expect(block(id).ports.some((p) => /frame/i.test(p.domain ?? ''))).toBe(false);
      expect(block(id).description).toMatch(/scalar/i);
      expect(block(id).description).toMatch(/Multibody Interface/);
    }
  });

  it('measurable outputs publish the quantity and unit of the reviewed table', () => {
    const expected: Record<string, [string, string]> = {
      'belt_end.f': ['belt tension', 'N'], 'belt_spool.t': ['torque', 'N*m'], 'pulley.t': ['torque', 'N*m'],
      'rot_multibody_interface.w': ['angular velocity', 'rad/s'], 'trans_multibody_interface.v': ['velocity', 'm/s'],
    };
    for (const [key, [quantity, unit]] of Object.entries(expected)) {
      const [id, port] = key.split('.');
      const p = block(id).ports.find((x) => x.id === port)!;
      expect(p.direction, key).toBe('out');
      expect([p.quantity, p.unit], key).toEqual([quantity, unit]);
      expect(PORT_QUANTITIES[key], key).toEqual({ quantity, unit });
    }
    // every signal output of the group is in the table
    for (const id of SCOPE_BLOCKS) {
      for (const p of block(id).ports.filter((x) => x.direction === 'out')) expect(PORT_QUANTITIES[`${id}.${p.id}`], `${id}.${p.id}`).toBeDefined();
    }
  });

  it('library equation and description are specific (no generic label), with units on the governing relation', () => {
    for (const id of SCOPE_BLOCKS) {
      const b = block(id);
      expect(isGenericText(b.equation), `${id} equation`).toBe(false);
      expect(isGenericText(b.description), `${id} description`).toBe(false);
      expect(b.equation, id).toMatch(/=/);
      expect(b.description!.length, id).toBeGreaterThan(80);
    }
    for (const id of ['common_gear', 'rack_pinion', 'gear_box', 'wheel_axle', 'lever', 'belt_spool', 'pulley']) {
      expect(block(id).equation, id).toMatch(/\[(rad\/s|m\/s|N·m|N)|P =|P = /);
    }
  });

  it('a ratio of 0 is rejected (nonZero bound); a negative ratio is a direction reversal and is accepted', () => {
    for (const id of ['gear_box', 'common_gear']) {
      const zero = validateBlockParams('g', id, { ratio: 0 });
      expect(zero, id).toHaveLength(1);
      expect(zero[0].code).toBe('parameter-out-of-range');
      expect(zero[0].reason).toMatch(/!= 0/);
      expect(validateBlockParams('g', id, { ratio: -3 }), id).toHaveLength(0);
      expect(validateBlockParams('g', id, { ratio: 'abc' })[0].code).toBe('invalid-parameter');
    }
  });

  it('radii / arm lengths / Bl-free geometry must be positive (a radius of 0 or below is rejected)', () => {
    const cases: [string, string][] = [
      ['rack_pinion', 'radius'], ['wheel_axle', 'Rw'], ['belt_spool', 'radius'], ['pulley', 'radius'],
      ['lever', 'L1'], ['lever', 'L2'], ['gas_translational_conv', 'A'], ['em_converter', 'N'],
    ];
    for (const [id, key] of cases) {
      expect(validateBlockParams('x', id, { [key]: 0 }), `${id}.${key}=0`).toHaveLength(1);
      expect(validateBlockParams('x', id, { [key]: -0.1 }), `${id}.${key}<0`).toHaveLength(1);
      expect(validateBlockParams('x', id, { [key]: 0.2 }), `${id}.${key}>0`).toHaveLength(0);
    }
    expect(validateBlockParams('x', 'gas_rotational_conv', { D: 0 })).toHaveLength(1);
  });

  it('lever is a supported block now (no longer in UNSUPPORTED_BLOCKS)', () => {
    expect(UNSUPPORTED_BLOCKS.lever).toBeUndefined();
  });
});

// ── 2. scalar <-> Frame wiring ─────────────────────────────────────────────────────────────────────────────────────
describe('WP-13b scalar <-> Frame connection rules', () => {
  const nodes = [
    { id: 'gear', data: { type: 'common_gear' } }, { id: 'rack', data: { type: 'rack_pinion' } },
    { id: 'gbox', data: { type: 'gear_box' } }, { id: 'rj', data: { type: 'revolute_joint' } },
    { id: 'pj', data: { type: 'prismatic_joint' } }, { id: 'w', data: { type: 'world_frame' } },
    { id: 'ri', data: { type: 'rot_multibody_interface' } }, { id: 'ti', data: { type: 'trans_multibody_interface' } },
    { id: 'rref', data: { type: 'rot_ref' } }, { id: 'tref', data: { type: 'trans_ref' } },
  ];
  const wiring = (s: string, sh: string, t: string, th: string) => validateConnection(nodes, [], { source: s, sourceHandle: sh, target: t, targetHandle: th });

  it('rejects a scalar Rotational / Translational port wired directly to a Frame', () => {
    for (const [a, ah, b, bh] of [
      ['gear', 'b', 'rj', 'b'], ['gear', 'f', 'w', 'w'], ['rack', 'b', 'rj', 'f'], ['rack', 'f', 'pj', 'b'], ['gbox', 's1', 'rj', 'b'],
      ['ri', 'r', 'rj', 'b'], ['ri', 'c', 'w', 'w'], ['ti', 'r', 'pj', 'f'], ['ti', 'c', 'w', 'w'],
    ]) {
      const forward = wiring(a, ah, b, bh);
      const backward = wiring(b, bh, a, ah);
      expect(forward.valid, `${a}.${ah} -> ${b}.${bh}`).toBe(false);
      expect(backward.valid, `${b}.${bh} -> ${a}.${ah}`).toBe(false);
      if (!forward.valid) expect(forward.diagnostic.code).toBe('domain-mismatch');
    }
  });

  it('a Frame port of an interface does not accept a scalar reference either', () => {
    expect(wiring('ri', 'b', 'rref', 'r').valid).toBe(false);
    expect(wiring('ti', 'f', 'tref', 'p').valid).toBe(false);
  });

  it('the interfaces ARE accepted on both sides: Frames to Frames, scalars to scalars', () => {
    expect(wiring('ri', 'b', 'rj', 'b').valid).toBe(true);
    expect(wiring('ri', 'f', 'rj', 'f').valid).toBe(true);
    expect(wiring('ri', 'r', 'gear', 'b').valid).toBe(true);
    expect(wiring('ri', 'c', 'rref', 'r').valid).toBe(true);
    expect(wiring('ti', 'b', 'w', 'w').valid).toBe(true);
    expect(wiring('ti', 'r', 'rack', 'f').valid).toBe(true);
    expect(wiring('rack', 'b', 'gear', 'f').valid).toBe(true);
  });

  it('a saved model that wires a gear to a Frame is flagged by the edge-set check', () => {
    const issues = checkEdgeSet(nodes, [{ id: 'bad', source: 'gear', sourceHandle: 'b', target: 'rj', targetHandle: 'b' }]);
    expect(issues.map((i) => i.code)).toContain('domain-mismatch');
  });
});

// ── 3. gears ───────────────────────────────────────────────────────────────────────────────────────────────────────
/** velocity source on `dut.<in>`, damper b on `dut.<out>`; both returns to the rotational reference */
const gearModel = (type: string, params: Record<string, any>, inPort: string, outPort: string, omega: number, b: number): Model => ({
  nodes: [
    node('src', 'ang_vel_source', { omega }), node('dut', type, params), node('load', 'rot_damper', { b }), node('ref', 'rot_ref'),
  ],
  edges: [
    wire('src.r', `dut.${inPort}`), wire('src.c', 'ref.r'), wire(`dut.${outPort}`, 'load.r'), wire('load.c', 'ref.r'),
  ],
});

describe('WP-13b gear_box (Simple Gear, w1 = ratio * w2)', () => {
  for (const ratio of [3, 0.25, -2]) {
    it(`ratio ${ratio}: kinematics, statics and zero net power`, () => {
      const omega = 40, b = 0.5;
      const sim = simulate(gearModel('gear_box', { ratio }, 's1', 's2', omega, b), 3, 0.01);
      // kinematics: w1 = ratio * w2 (a negative ratio reverses the direction)
      const w2 = omega / ratio;
      near(sim.across('dut', 's2'), w2, 1e-9, 'w2');
      // statics: the load damper takes tau = b w2 from S2, so the torque delivered to S2 is b w2 and the torque in at S1 is
      // tau_2 / ratio (delivered torque at S2 = ratio * torque in at S1)
      near(sim.at('dut_branch_torque2'), -b * w2, 1e-8, 'tau2 into the block');
      near(sim.at('dut_branch_torque1'), (b * w2) / ratio, 1e-8, 'tau1 into the block');
      expectPowerBalance([[sim.at('dut_branch_torque1'), omega], [sim.at('dut_branch_torque2'), w2]], 0, `gear_box ${ratio}`);
    });
  }
});

describe('WP-13b common_gear (w_F = ratio * w_B)', () => {
  for (const ratio of [2.5, -0.4]) {
    it(`ratio ${ratio}: kinematics, statics and zero net power`, () => {
      const omega = 10, b = 0.2;
      const sim = simulate(gearModel('common_gear', { ratio }, 'b', 'f', omega, b), 3, 0.01);
      const wF = ratio * omega;
      near(sim.across('dut', 'f'), wF, 1e-9, 'w_F');
      near(sim.at('dut_branch_torque2'), -b * wF, 1e-8, 'follower torque into the block');
      // tau_B,in + ratio * tau_F,in = 0
      near(sim.at('dut_branch_torque1'), ratio * b * wF, 1e-8, 'base torque into the block');
      expectPowerBalance([[sim.at('dut_branch_torque1'), omega], [sim.at('dut_branch_torque2'), wF]], 0, `common_gear ${ratio}`);
    });
  }
});

describe('WP-13b rack_pinion (v = r * w, tau = r * F)', () => {
  it('kinematics, statics and zero net power', () => {
    const r = 0.05, omega = 8, c = 4;
    const m: Model = {
      nodes: [node('src', 'ang_vel_source', { omega }), node('dut', 'rack_pinion', { radius: r }), node('load', 'trans_damper', { b: c }),
        node('rref', 'rot_ref'), node('tref', 'trans_ref')],
      edges: [wire('src.r', 'dut.b'), wire('src.c', 'rref.r'), wire('dut.f', 'load.r'), wire('load.c', 'tref.p')],
    };
    const sim = simulate(m, 3, 0.01);
    const v = r * omega;
    near(sim.across('dut', 'f'), v, 1e-9, 'rack velocity');
    // the rack damper takes F = c v, so the rack force into the block is -c v and the pinion torque into it is r * c * v
    near(sim.at('dut_branch_force'), -c * v, 1e-8, 'rack force into the block');
    near(sim.at('dut_branch_torque'), r * c * v, 1e-8, 'pinion torque into the block');
    expectPowerBalance([[sim.at('dut_branch_torque'), omega], [sim.at('dut_branch_force'), v]], 0, 'rack_pinion');
  });

  it('loaded by a force source on the rack the pinion shaft must supply tau = r * F', () => {
    const r = 0.08, F = 25, bShaft = 2;
    const m: Model = {
      nodes: [node('fs', 'force_source', { F }), node('dut', 'rack_pinion', { radius: r }), node('shaft', 'rot_damper', { b: bShaft }),
        node('rref', 'rot_ref'), node('tref', 'trans_ref')],
      edges: [wire('fs.b', 'dut.f'), wire('fs.a', 'tref.p'), wire('dut.b', 'shaft.r'), wire('shaft.c', 'rref.r')],
    };
    const sim = simulate(m, 3, 0.01);
    // F pushes the rack: torque into the block at B is -r*F, the shaft damper reacts tau = b w with w = -(r F)/b ... (sign: the damper takes b*w from B)
    const tauB = sim.at('dut_branch_torque');
    near(Math.abs(tauB), r * F, 1e-8, '|tau| = r F');
    // damper: tau_in(damper) = b * w and the node balance gives w = -tauB / b; rack velocity v = r w
    near(sim.across('dut', 'b'), -tauB / bShaft, 1e-8, 'w');
    near(sim.across('dut', 'f'), r * sim.across('dut', 'b'), 1e-9, 'v = r w');
  });
});

describe('WP-13b wheel_axle (v = Rw * w, tau = Rw * F)', () => {
  it('torque source on the axle drives the road load: w = T / (Rw^2 c), v = Rw w', () => {
    const Rw = 0.3, T = 6, c = 30;
    const m: Model = {
      nodes: [node('ts', 'torque_source', { T }), node('dut', 'wheel_axle', { Rw }), node('road', 'trans_damper', { b: c }),
        node('rref', 'rot_ref'), node('tref', 'trans_ref')],
      edges: [wire('ts.c', 'dut.a'), wire('ts.r', 'rref.r'), wire('dut.p', 'road.r'), wire('road.c', 'tref.p')],
    };
    const sim = simulate(m, 3, 0.01);
    const v = T / (Rw * c);
    near(sim.across('dut', 'p'), v, 1e-8, 'road speed');
    near(sim.across('dut', 'a'), v / Rw, 1e-8, 'axle speed');
    near(sim.at('dut_branch_torque'), T, 1e-8, 'axle torque into the block');
    near(sim.at('dut_branch_force'), -T / Rw, 1e-8, 'wheel force into the block');
    expectPowerBalance([[sim.at('dut_branch_torque'), v / Rw], [sim.at('dut_branch_force'), v]], 0, 'wheel_axle');
  });
});

// ── 4. lever ───────────────────────────────────────────────────────────────────────────────────────────────────────
describe('WP-13b lever (pivot C between A at L1 and B at L2)', () => {
  const L1 = 0.8, L2 = 0.2, F = 12, c = 5;
  const fixedPivot: Model = {
    nodes: [node('fs', 'force_source', { F }), node('dut', 'lever', { L1, L2 }), node('damp', 'trans_damper', { b: c }), node('tref', 'trans_ref')],
    edges: [wire('fs.b', 'dut.a'), wire('fs.a', 'tref.p'), wire('dut.b', 'damp.r'), wire('damp.c', 'tref.p'), wire('dut.c', 'tref.p')],
  };

  it('fixed pivot: v_A / v_B = -L1/L2, moment balance F_A L1 = F_B L2 and pivot reaction F_C = -(F_A + F_B)', () => {
    const sim = simulate(fixedPivot, 3, 0.01);
    const FA = F, FB = (F * L1) / L2, FC = -(FA + FB);
    // B side: damper takes c v_B = -F_B,in  =>  v_B = -F_B / c ; A side: v_A = -(L1/L2) v_B
    const vB = -FB / c, vA = -(L1 / L2) * vB;
    near(sim.across('dut', 'b'), vB, 1e-8, 'v_B');
    near(sim.across('dut', 'a'), vA, 1e-8, 'v_A');
    near(sim.across('dut', 'c'), 0, 1, 'v_C is the reference');
    near(sim.at('dut_branch_force_a'), FA, 1e-8, 'F_A');
    near(sim.at('dut_branch_force_b'), FB, 1e-8, 'F_B');
    near(sim.at('dut_branch_force_c'), FC, 1e-8, 'pivot reaction F_C');
    expectPowerBalance([[FA, vA], [FB, vB], [sim.at('dut_branch_force_c'), sim.across('dut', 'c')]], 0, 'lever fixed pivot');
  });

  it('long arm moves further: |v_A| / |v_B| = L1 / L2 (the old L2/L1 ratio was inverted)', () => {
    const sim = simulate(fixedPivot, 3, 0.01);
    near(Math.abs(sim.across('dut', 'a')) / Math.abs(sim.across('dut', 'b')), L1 / L2, 1e-8);
    expect(Math.sign(sim.across('dut', 'a'))).toBe(-Math.sign(sim.across('dut', 'b')));
  });

  it('moving pivot (compliant fulcrum): (v_A - v_C) L2 + (v_B - v_C) L1 = 0 and zero net power', () => {
    const m: Model = {
      nodes: [node('fs', 'force_source', { F }), node('dut', 'lever', { L1, L2 }), node('dB', 'trans_damper', { b: c }),
        node('dC', 'trans_damper', { b: 2 * c }), node('tref', 'trans_ref')],
      edges: [wire('fs.b', 'dut.a'), wire('fs.a', 'tref.p'), wire('dut.b', 'dB.r'), wire('dB.c', 'tref.p'), wire('dut.c', 'dC.r'), wire('dC.c', 'tref.p')],
    };
    const sim = simulate(m, 3, 0.01);
    const [vA, vB, vC] = ['a', 'b', 'c'].map((p) => sim.across('dut', p));
    near((vA - vC) * L2 + (vB - vC) * L1, 0, 1, 'kinematic relation');
    expect(Math.abs((vA - vC) * L2 + (vB - vC) * L1)).toBeLessThan(1e-9);
    const FA = sim.at('dut_branch_force_a'), FB = sim.at('dut_branch_force_b'), FC = sim.at('dut_branch_force_c');
    near(FA, F, 1e-8, 'F_A');
    near(FB, (F * L1) / L2, 1e-8, 'F_B = F_A L1 / L2');
    near(FC, -(FA + FB), 1e-8, 'F_C');
    // the compliant pivot carries the reaction: damper 2c at C
    near(vC, -FC / (2 * c), 1e-8, 'v_C');
    expectPowerBalance([[FA, vA], [FB, vB], [FC, vC]], 0, 'lever moving pivot');
  });
});

// ── 5. belts and cables ───────────────────────────────────────────────────────────────────────────────────────────
describe('WP-13b belt_spool / pulley / belt_end / belt_properties', () => {
  it('belt_spool: v = R w, tau = R F, zero net power at constant speed (ideal, no wrapped-belt inertia)', () => {
    const R = 0.1, omega = 5, c = 40;
    const m: Model = {
      nodes: [node('src', 'ang_vel_source', { omega }), node('dut', 'belt_spool', { radius: R, inertia: 0 }), node('load', 'trans_damper', { b: c }),
        node('rref', 'rot_ref'), node('tref', 'trans_ref')],
      edges: [wire('src.r', 'dut.r'), wire('src.c', 'rref.r'), wire('dut.a', 'load.r'), wire('load.c', 'tref.p')],
    };
    const sim = simulate(m, 4, 0.01);
    const v = R * omega;
    near(sim.across('dut', 'a'), v, 1e-9, 'belt speed');
    near(sim.at('dut_branch_force'), -c * v, 1e-8, 'belt force into the block');
    near(sim.at('dut_branch_torque'), R * c * v, 1e-8, 'shaft torque into the block');
    expectPowerBalance([[sim.at('dut_branch_torque'), omega], [sim.at('dut_branch_force'), v]], 0, 'belt_spool');
  });

  it('belt_spool torque balance: first step from rest follows (J + 2 pi rho R^3) dw/dt = T + R F with the wrapped belt', () => {
    const R = 0.1, T = 3, c = 40, inertia = 0.02, rho = 1.1, dt = 0.01;
    const m: Model = {
      nodes: [node('bp', 'belt_properties', { density: rho, youngs: 1e9 }), node('ts', 'torque_source', { T }),
        node('dut', 'belt_spool', { radius: R, inertia }), node('load', 'trans_damper', { b: c }), node('rref', 'rot_ref'), node('tref', 'trans_ref')],
      edges: [wire('bp.p', 'dut.p'), wire('ts.c', 'dut.r'), wire('ts.r', 'rref.r'), wire('dut.a', 'load.r'), wire('load.c', 'tref.p')],
    };
    const sim = simulate(m, 1, dt);
    const J = inertia + 2 * Math.PI * rho * R ** 3;
    // first (backward Euler) step from rest: J (w1 - 0)/dt = T - c R^2 w1
    const w1 = (T * dt) / (J + c * R * R * dt);
    near(sim.across('dut', 'r'), w1, 1e-6, 'w after one step');
    // the tension / torque measurement t is the shaft torque into the spool
    near(sim.at('dut_branch_signal_t'), sim.at('dut_branch_torque'), 1e-9, 'signal t = shaft torque');
  });

  it('pulley: v_A = R w, v_B = -R w, tau = R (F_A - F_B), zero net power', () => {
    const R = 0.15, omega = 12, ca = 30, cb = 10;
    const m: Model = {
      nodes: [node('src', 'ang_vel_source', { omega }), node('dut', 'pulley', { radius: R, inertia: 0 }), node('la', 'trans_damper', { b: ca }),
        node('lb', 'trans_damper', { b: cb }), node('rref', 'rot_ref'), node('tref', 'trans_ref')],
      edges: [wire('src.r', 'dut.r'), wire('src.c', 'rref.r'), wire('dut.a', 'la.r'), wire('la.c', 'tref.p'), wire('dut.b', 'lb.r'), wire('lb.c', 'tref.p')],
    };
    const sim = simulate(m, 4, 0.01);
    near(sim.across('dut', 'a'), R * omega, 1e-9, 'v_A');
    near(sim.across('dut', 'b'), -R * omega, 1e-9, 'v_B');
    const FA = -ca * R * omega, FB = cb * R * omega; // forces into the block at A and B
    near(sim.at('dut_branch_force_a'), FA, 1e-8, 'F_A');
    near(sim.at('dut_branch_force_b'), FB, 1e-8, 'F_B');
    // tau,in + R (F_A,in - F_B,in) = 0
    near(sim.at('dut_branch_torque'), -R * (FA - FB), 1e-8, 'hub torque');
    expectPowerBalance([[sim.at('dut_branch_torque'), omega], [FA, R * omega], [FB, -R * omega]], 0, 'pulley');
  });

  it('belt_end: tension T = F of the pull, stiffness k = E A / L from the wired Belt-Cable Properties', () => {
    const F = 500, E = 2e9, A = 4e-4, L = 2, dt = 0.01;
    const k = (E * A) / L;
    const m: Model = {
      nodes: [node('bp', 'belt_properties', { density: 1.1, youngs: E }), node('fs', 'force_source', { F }),
        node('dut', 'belt_end', { stiffness: 1, length: L, area: A }), node('tref', 'trans_ref')],
      edges: [wire('bp.p', 'dut.p'), wire('dut.r', 'tref.p'), wire('fs.b', 'dut.e'), wire('fs.a', 'tref.p')],
    };
    const sim = simulate(m, 1, dt);
    // tension of the belt pulled by F at E with R fixed is F, whatever the stiffness
    near(sim.at('dut_branch_signal_f'), F, 1e-8, 'tension');
    // E moves away from R: v_E = d(x_E)/dt, x_E = F / k reached in the first step => v_E = F / (k dt)
    near(sim.across('dut', 'e'), F / (k * dt), 1e-6, 'v_E = F/(k dt) fixes k = E A / L');
    // a stiffer (steel) belt stretches 100x less
    const stiff = simulate({ ...m, nodes: m.nodes.map((n) => (n.id === 'bp' ? node('bp', 'belt_properties', { density: 1.1, youngs: 100 * E }) : n)) }, 1, dt);
    near(stiff.across('dut', 'e'), F / (100 * k * dt), 1e-6, 'stiffer belt');
  });

  it('connected group: torque source -> spool -> belt end -> road damper reaches w = -T / (R^2 c) with tension T / R (the spool PULLS the belt)', () => {
    const R = 0.1, T = 4, c = 25;
    const m: Model = {
      nodes: [node('bp', 'belt_properties', { density: 1.1, youngs: 1e8 }), node('ts', 'torque_source', { T: -T }),
        node('spool', 'belt_spool', { radius: R, inertia: 0.01 }), node('belt', 'belt_end', { length: 1, area: 1e-4 }),
        node('load', 'trans_damper', { b: c }), node('rref', 'rot_ref'), node('tref', 'trans_ref')],
      edges: [wire('bp.p', 'spool.p'), wire('bp.p', 'belt.p'), wire('ts.c', 'spool.r'), wire('ts.r', 'rref.r'), wire('spool.a', 'belt.r'),
        wire('belt.e', 'load.r'), wire('load.c', 'tref.p')],
    };
    const sim = simulate(m, 120, 0.02);
    // WP-13 (F-061): a belt is tension-only, so the spool must pull (a pushing spool would leave the belt slack and run away).
    // Reversing the driving torque of the original (mirror-symmetric, linear) group gives w = -T / (R^2 c), belt speed -T / (R c)
    near(sim.across('spool', 'r'), -T / (R * R * c), 1e-4, 'steady shaft speed');
    // the spool pays the belt out backwards (v_A = R w < 0) and so pulls the load: the belt is stretched, tension = +T / R
    near(sim.at('belt_branch_signal_f'), T / R, 1e-4, 'steady belt tension (positive: stretched)');
    near(sim.across('load', 'r'), -T / (R * c), 1e-4, 'steady belt speed');
  });
});
// ── 6. electromechanical converters ───────────────────────────────────────────────────────────────────────────────
describe('WP-13b rotational / translational electromechanical converters (V = R I + K w, tau = K I)', () => {
  const rotational = (K: number, R: number, V: number, b: number): Model => ({
    nodes: [node('vs', 'dc_voltage', { V, R_int: 0 }), node('gnd', 'ground'), node('dut', 'rotational_electromechanical_converter', { K, R }),
      node('load', 'rot_damper', { b }), node('rref', 'rot_ref')],
    edges: [wire('vs.p', 'dut.p'), wire('vs.n', 'gnd.a'), wire('dut.n', 'gnd.a'), wire('dut.r', 'load.r'), wire('dut.c', 'rref.r'), wire('load.c', 'rref.r')],
  });

  for (const K of [0.8, -0.8]) {
    it(`lossy converter K = ${K}: w = K V / (R b + K^2) and the loss is exactly R I^2`, () => {
      const V = 24, R = 0.5, b = 0.1;
      const sim = simulate(rotational(K, R, V, b), 3, 0.01);
      const w = (K * V) / (R * b + K * K);
      const I = (V - K * w) / R;
      near(sim.across('dut', 'r'), w, 1e-8, 'w');
      near(sim.at('dut_branch_current'), I, 1e-8, 'I');
      // torque delivered K I = b w; the branch is the torque INTO the block
      near(sim.at('dut_branch_mechanical_through'), -K * I, 1e-8, 'tau into the block');
      near(K * I, b * w, 1e-8, 'delivered torque balances the damper');
      const vTerminal = sim.across('dut', 'p') - sim.across('dut', 'n');
      expectPowerBalance([[sim.at('dut_branch_current'), vTerminal], [sim.at('dut_branch_mechanical_through'), w]], R * I * I, `rot EM K=${K}`);
    });
  }

  it('R = 0 (ideal): w = V / K and zero net power', () => {
    const V = 12, K = 0.6, b = 0.3;
    const sim = simulate(rotational(K, 0, V, b), 3, 0.01);
    near(sim.across('dut', 'r'), V / K, 1e-8, 'w = V/K');
    near(sim.at('dut_branch_mechanical_through'), -b * (V / K), 1e-8, 'tau');
    const vTerminal = sim.across('dut', 'p') - sim.across('dut', 'n');
    expectPowerBalance([[sim.at('dut_branch_current'), vTerminal], [sim.at('dut_branch_mechanical_through'), V / K]], 0, 'ideal rot EM');
  });

  it('translational converter: v = Bl V / (R c + Bl^2), loss R I^2, reversed polarity reverses the motion', () => {
    for (const Bl of [1.5, -1.5]) {
      const V = 10, R = 2, c = 3;
      const m: Model = {
        nodes: [node('vs', 'dc_voltage', { V, R_int: 0 }), node('gnd', 'ground'), node('dut', 'translational_electromechanical_converter', { Bl, R }),
          node('load', 'trans_damper', { b: c }), node('tref', 'trans_ref')],
        edges: [wire('vs.p', 'dut.p'), wire('vs.n', 'gnd.a'), wire('dut.n', 'gnd.a'), wire('dut.r', 'load.r'), wire('dut.c', 'tref.p'), wire('load.c', 'tref.p')],
      };
      const sim = simulate(m, 3, 0.01);
      const v = (Bl * V) / (R * c + Bl * Bl);
      const I = (V - Bl * v) / R;
      near(sim.across('dut', 'r'), v, 1e-8, 'v');
      near(sim.at('dut_branch_mechanical_through'), -Bl * I, 1e-8, 'F into the block');
      const vTerminal = sim.across('dut', 'p') - sim.across('dut', 'n');
      expectPowerBalance([[sim.at('dut_branch_current'), vTerminal], [sim.at('dut_branch_mechanical_through'), v]], R * I * I, `trans EM Bl=${Bl}`);
    }
  });

  it('em_converter (electrical <-> magnetic): a positive inductance L = N^2 / Rm and V I = mmf dPhi/dt', () => {
    const N = 10, Rm = 1000, V = 5, dt = 0.01, steps = 6;
    const m: Model = {
      nodes: [node('vs', 'dc_voltage', { V, R_int: 0 }), node('gnd', 'ground'), node('dut', 'em_converter', { N }), node('rel', 'reluctance', { R: Rm }), node('mref', 'mag_ref')],
      edges: [wire('vs.p', 'dut.p'), wire('vs.n', 'gnd.a'), wire('dut.n', 'gnd.a'), wire('dut.mag_n', 'rel.n'), wire('rel.s', 'mref.n'), wire('dut.mag_s', 'mref.n')],
    };
    const sim = simulate(m, steps, dt);
    // V = L dI/dt with L = N^2 / Rm: the current ramps UP into the coil (a negative L would run away in the other direction)
    const L = (N * N) / Rm;
    sim.history.forEach((s, k) => {
      const I = sim.at('dut_branch_current', s);
      expect(I, `step ${k + 1} current is drawn from the source`).toBeGreaterThan(0);
      near(I, ((k + 1) * V * dt) / L, 2e-3, `I at step ${k + 1}`);
    });
    // energy: the electrical input power equals the rate of the stored magnetic energy mmf * dPhi_ext/dt (phi_ext = -through at N)
    const prev = sim.history[steps - 2], last = sim.history[steps - 1];
    const dPhiExt = -(sim.at('dut_branch_flux', last) - sim.at('dut_branch_flux', prev)) / dt;
    const mmf = sim.across('dut', 'mag_n') - sim.across('dut', 'mag_s');
    near(mmf, N * sim.at('dut_branch_current', last), 1e-8, 'mmf = N I');
    near(sim.at('dut_branch_current', last) * V, mmf * dPhiExt, 1e-3, 'V I = mmf dPhi/dt');
  });
});

describe('WP-13b dc_motor (V = Ra I + La dI/dt + Ke w, T = Kt I = J dw/dt + B w + tau_shaft)', () => {
  it('connected group: DC motor -> gear -> inertia load settles at the analytic speed, and the energy balances', () => {
    const V = 24, Ra = 2, Ke = 0.05, Kt = 0.05, Bm = 0.001, BL = 0.02;
    for (const ratio of [4, -4]) {
      const m: Model = {
        nodes: [node('vs', 'dc_voltage', { V, R_int: 0 }), node('gnd', 'ground'),
          node('motor', 'dc_motor', { Ra, La: 0.01, Ke, Kt, J: 0.001, B: Bm }), node('gear', 'gear_box', { ratio }),
          node('load', 'inertia', { J: 0.01, B: BL })],
        edges: [wire('vs.p', 'motor.p'), wire('vs.n', 'gnd.a'), wire('motor.n', 'gnd.a'), wire('motor.r', 'gear.s1'), wire('gear.s2', 'load.r')],
      };
      const sim = simulate(m, 160, 0.05);
      // steady state: (Kt/Ra)(V - Ke wm) - B wm = BL wl / ratio with wl = wm / ratio
      const wm = ((Kt * V) / Ra) / ((Kt * Ke) / Ra + Bm + BL / (ratio * ratio));
      near(sim.across('motor', 'r'), wm, 1e-4, `motor speed (ratio ${ratio})`);
      near(sim.across('load', 'r'), wm / ratio, 1e-4, 'load speed (reversed for a negative ratio)');
      const I = (V - Ke * wm) / Ra;
      near(sim.at('motor_branch_current'), I, 1e-4, 'armature current');
      // energy: V I = Ra I^2 + B wm^2 + BL wl^2 (steady state, Kt = Ke)
      near(V * I, Ra * I * I + Bm * wm * wm + BL * (wm / ratio) ** 2, 1e-4, 'input power = losses');
      // gear power balance at steady state
      expectPowerBalance([[sim.at('gear_branch_torque1'), wm], [sim.at('gear_branch_torque2'), wm / ratio]], 0, 'gear in the chain');
    }
  });

  it('shaft torque delivered at stall-free steady state is Kt I - B w', () => {
    const m: Model = {
      nodes: [node('vs', 'dc_voltage', { V: 12, R_int: 0 }), node('gnd', 'ground'), node('motor', 'dc_motor', { Ra: 1, La: 0.01, Ke: 0.1, Kt: 0.1, J: 0.001, B: 0.002 }),
        node('load', 'rot_damper', { b: 0.05 }), node('rref', 'rot_ref')],
      edges: [wire('vs.p', 'motor.p'), wire('vs.n', 'gnd.a'), wire('motor.n', 'gnd.a'), wire('motor.r', 'load.r'), wire('load.c', 'rref.r')],
    };
    const sim = simulate(m, 120, 0.05);
    const w = (0.1 * 12) / 1 / (0.1 * 0.1 / 1 + 0.002 + 0.05);
    near(sim.across('motor', 'r'), w, 1e-4, 'w');
    // torque delivered to the load damper: b w = Kt I - B w
    const I = (12 - 0.1 * w) / 1;
    near(0.05 * w, 0.1 * I - 0.002 * w, 1e-4, 'delivered torque');
    near(sim.at('motor_branch_torque'), 0.05 * w, 1e-4, 'shaft torque');
  });
});

// ── 7. gas converters ─────────────────────────────────────────────────────────────────────────────────────────────
describe('WP-13b gas rotational / translational converters (ideal displacement machines)', () => {
  const R_AIR = 287, T = 293.15, P_REF = 101325;
  const gasModel = (type: 'gas_rotational_conv' | 'gas_translational_conv', params: Record<string, any>, loadB: number, dP: number): Model => {
    const rot = type === 'gas_rotational_conv';
    const forward = dP > 0;
    return {
      nodes: [node('src', 'gas_pressure_source', { P: Math.abs(dP) }), node('gref', 'gas_ref'), node('dut', type, params),
        rot ? node('load', 'rot_damper', { b: loadB }) : node('load', 'trans_damper', { b: loadB }),
        rot ? node('rref', 'rot_ref') : node('rref', 'trans_ref')],
      edges: [
        wire('src.a', 'gref.g'), wire(`src.b`, forward ? 'dut.a' : 'dut.h'), wire(forward ? 'dut.h' : 'dut.a', 'gref.g'),
        wire('dut.r', 'load.r'), wire('load.c', rot ? 'rref.r' : 'rref.p'), wire('dut.c', rot ? 'rref.r' : 'rref.p'),
      ],
    };
  };

  for (const dP of [1e5, -5e4]) {
    it(`rotational, Pa - Ph = ${dP} Pa: w = D dP / b, mdot = rho_A D w, shaft power = pressure power`, () => {
      const D = 0.01, b = 10;
      const sim = simulate(gasModel('gas_rotational_conv', { D, T }, b, dP), 3, 0.01);
      const Pa = sim.across('dut', 'a'), Ph = sim.across('dut', 'h');
      near(Pa - Ph, dP, 1e-8, 'pressure difference');
      const w = (D * dP) / b;
      near(sim.across('dut', 'r'), w, 1e-8, 'w');
      // delivered torque D (Pa - Ph) = b w; the branch is the torque into the block
      near(sim.at('dut_branch_torque'), -D * dP, 1e-8, 'tau into the block');
      const rho = Pa / (R_AIR * T);
      near(sim.at('dut_branch_mass_flow'), rho * D * w, 1e-8, 'mdot');
      // P_shaft,in + P_gas,in = tau_in w + (Pa - Ph) mdot / rho_A = 0
      expectPowerBalance([[sim.at('dut_branch_torque'), w], [sim.at('dut_branch_mass_flow') / rho, Pa - Ph]], 0, `gas rot ${dP}`);
    });

    it(`translational, Pa - Ph = ${dP} Pa: v = A dP / c, mdot = rho_A A v, piston power = pressure power`, () => {
      const A = 1e-3, c = 50;
      const sim = simulate(gasModel('gas_translational_conv', { A, T }, c, dP), 3, 0.01);
      const Pa = sim.across('dut', 'a'), Ph = sim.across('dut', 'h');
      const v = (A * dP) / c;
      near(sim.across('dut', 'r'), v, 1e-8, 'v');
      near(sim.at('dut_branch_force'), -A * dP, 1e-8, 'F into the block');
      const rho = Pa / (R_AIR * T);
      near(sim.at('dut_branch_mass_flow'), rho * A * v, 1e-8, 'mdot');
      expectPowerBalance([[sim.at('dut_branch_force'), v], [sim.at('dut_branch_mass_flow') / rho, Pa - Ph]], 0, `gas trans ${dP}`);
    });
  }

  it('no hydraulic converter, cylinder or pump block with a shaft port exists in the library (pump_il is a pressure source)', () => {
    const blocks = VLAB_LIBRARY.flatMap((d) => d.blocks);
    const mechanicalFluid = blocks.filter((b) =>
      b.ports.some((p) => /fluid|isothermal/i.test(p.domain ?? '')) && b.ports.some((p) => /^(rotational|translational)$/i.test(p.domain ?? '')));
    // the moist-air converters (ma_rot_conv / ma_trans_conv) are explicitly unsupported and owned by WP-17
    expect(mechanicalFluid.map((b) => b.id).filter((id) => !UNSUPPORTED_BLOCKS[id])).toEqual([]);
    expect(block('pump_il').ports.map((p) => p.domain)).not.toContain('Rotational');
  });
});

// ── 8. multibody interfaces (the only scalar <-> Frame bridges) ───────────────────────────────────────────────────
describe('WP-13b rotational / translational multibody interfaces along the configured axis', () => {
  const unit = (v: number[]) => { const n = Math.hypot(...v); return v.map((x) => x / n); };

  /** world -> [rigid_transform] -> joint, interface in parallel; rotational network = torque source on R, C at the reference */
  const rotScene = (axis: string, T: number, damping: number, baseRotationDeg?: number[]): Model => {
    const nodes = [node('world', 'world_frame'), node('joint', 'revolute_joint', { axis, damping }), node('iface', 'rot_multibody_interface', { axis }),
      node('ts', 'torque_source', { T }), node('rref', 'rot_ref')];
    const edges = [wire('joint.f', 'iface.f'), wire('ts.c', 'iface.r'), wire('ts.r', 'rref.r'), wire('iface.c', 'rref.r')];
    if (baseRotationDeg) {
      nodes.push(node('base', 'rigid_transform', { rotation: `[${baseRotationDeg.join(' ')}]` }));
      edges.push(wire('world.w', 'base.b'), wire('base.f', 'joint.b'), wire('base.f', 'iface.b'));
    } else edges.push(wire('world.w', 'joint.b'), wire('world.w', 'iface.b'));
    return { nodes, edges };
  };
  // rotation of B by 90 deg about z maps B-local x to world y
  const Rz90 = (v: number[]) => [-v[1], v[0], v[2]];

  const cases: { name: string; axis: string; world: number[]; base?: number[] }[] = [
    { name: 'y axis (not the hard-coded z)', axis: '[0 1 0]', world: [0, 1, 0] },
    { name: 'x axis', axis: '[1 0 0]', world: [1, 0, 0] },
    { name: 'oblique axis [1 2 2]', axis: '[1 2 2]', world: unit([1, 2, 2]) },
    { name: 'B-local x axis under a 90 deg base rotation = world y', axis: '[1 0 0]', world: Rz90([1, 0, 0]), base: [0, 0, 90] },
  ];
  for (const k of cases) {
    it(`rotational, ${k.name}: network torque T acts as the couple T a on F and the speed about a follows T / c`, () => {
      const T = 2, c = 0.5, dt = 0.01, steps = 5;
      const sim = simulate(rotScene(k.axis, T, c, k.base), steps, dt);
      const w = T / c;
      // joint damping balances the interface torque about the axis: c w = T
      near(sim.at('iface_branch_signal_w'), w, 1e-6, 'w measured at the interface');
      near(sim.across('iface', 'r') - sim.across('iface', 'c'), w, 1e-6, 'network speed follows the Frames');
      near(sim.at('joint_branch_signal_w'), w, 1e-6, 'joint velocity (independent measurement)');
      near(sim.at('joint_branch_signal_q'), w * dt * steps, 1e-6, 'joint angle after the steps');
      // the couple acts along the WORLD axis R_B * axis and has no other component
      near(sim.at('iface_branch_torque'), T, 1e-8, 'network torque');
      ['tx', 'ty', 'tz'].forEach((n, i) => expect(sim.at(`iface_branch_${n}`)).toBeCloseTo(T * k.world[i], 6));
      // lossless: network power T w equals the power handed to the Frames t_F . (w a)
      const tF = ['tx', 'ty', 'tz'].map((n) => sim.at(`iface_branch_${n}`));
      near(tF.reduce((s, t, i) => s + t * w * k.world[i], 0), T * w, 1e-6, 'power delivered to the Frames');
    });
  }

  it('rotational: reversing the torque reverses the speed (direction variant)', () => {
    const sim = simulate(rotScene('[0 0 1]', -3, 0.5), 4, 0.01);
    near(sim.at('iface_branch_signal_w'), -6, 1e-6, 'w');
    near(sim.at('joint_branch_signal_q'), -6 * 0.04, 1e-6, 'q');
  });

  it('rotational: a zero axis is a diagnostic, never a silent default', () => {
    const m = rotScene('[0 0 0]', 1, 0.5);
    expect(() => simulate(m, 1, 0.01)).toThrow(/axis/i);
  });

  const transScene = (axis: string, F: number, damping: number, baseRotationDeg?: number[]): Model => {
    const nodes = [node('world', 'world_frame'), node('joint', 'prismatic_joint', { axis, damping }), node('iface', 'trans_multibody_interface', { axis }),
      node('fs', 'force_source', { F }), node('tref', 'trans_ref')];
    const edges = [wire('joint.f', 'iface.f'), wire('fs.b', 'iface.r'), wire('fs.a', 'tref.p'), wire('iface.c', 'tref.p')];
    if (baseRotationDeg) {
      nodes.push(node('base', 'rigid_transform', { rotation: `[${baseRotationDeg.join(' ')}]` }));
      edges.push(wire('world.w', 'base.b'), wire('base.f', 'joint.b'), wire('base.f', 'iface.b'));
    } else edges.push(wire('world.w', 'joint.b'), wire('world.w', 'iface.b'));
    return { nodes, edges };
  };
  const transCases: { name: string; axis: string; world: number[]; base?: number[] }[] = [
    { name: 'x axis', axis: '[1 0 0]', world: [1, 0, 0] },
    { name: 'y axis (not the hard-coded x)', axis: '[0 1 0]', world: [0, 1, 0] },
    { name: 'oblique axis [2 -1 2]', axis: '[2 -1 2]', world: unit([2, -1, 2]) },
    { name: 'B-local x axis under a 90 deg base rotation = world y', axis: '[1 0 0]', world: Rz90([1, 0, 0]), base: [0, 0, 90] },
  ];
  for (const k of transCases) {
    it(`translational, ${k.name}: network force F acts along R_B a on F and the slide speed follows F / c`, () => {
      const F = 10, c = 5, dt = 0.01, steps = 5;
      const sim = simulate(transScene(k.axis, F, c, k.base), steps, dt);
      const v = F / c;
      near(sim.at('iface_branch_signal_v'), v, 1e-6, 'v at the interface');
      near(sim.across('iface', 'r') - sim.across('iface', 'c'), v, 1e-6, 'network speed follows the Frames');
      near(sim.at('joint_branch_signal_v'), v, 1e-6, 'joint slide rate (independent measurement)');
      near(sim.at('joint_branch_signal_x'), v * dt * steps, 1e-6, 'joint displacement');
      near(sim.at('iface_branch_force'), F, 1e-8, 'network force');
      ['fx', 'fy', 'fz'].forEach((n, i) => expect(sim.at(`iface_branch_${n}`)).toBeCloseTo(F * k.world[i], 6));
      // the force is collinear with the displacement, so the moment of its lever arm on B vanishes
      ['tbx', 'tby', 'tbz'].forEach((n) => expect(Math.abs(sim.at(`iface_branch_${n}`))).toBeLessThan(1e-6));
      const f = ['fx', 'fy', 'fz'].map((n) => sim.at(`iface_branch_${n}`));
      near(f.reduce((s, x, i) => s + x * v * k.world[i], 0), F * v, 1e-6, 'power delivered to the Frames');
    });
  }

  it('translational: the end-to-end pose follows the slide along the configured axis', () => {
    const axis = [0, 1, 0], F = 6, c = 3, dt = 0.02, steps = 4;
    const sim = simulate(transScene('[0 1 0]', F, c), steps, dt);
    const P = sim.pose('iface', 'f');
    near(P[1], (F / c) * dt * steps, 1e-6, 'Py');
    expect(Math.abs(P[0])).toBeLessThan(1e-9);
    expect(Math.abs(P[2])).toBeLessThan(1e-9);
    expect(axis).toHaveLength(3);
  });
});
