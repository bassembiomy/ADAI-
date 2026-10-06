import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import { VLAB_LIBRARY, type VLabBlock } from '../../../utils/vlabLibrary';
import { exportScopeToCSV, getVLabSignalInfo } from '../../../utils/scopeUtils';
import { normalizeLegacyVLabGraph } from '../../../components/vlab/vlabModelMigration';
import { VLabPhysicsEngine } from '../vlabPhysics';
import { DAEAssembler } from '../DAEAssembler';
import { blockEquations } from '../vlabEquations';
import { checkEdgeSet, libraryBlock, validateConnection, type RuleNode } from '../vlabConnectionRules';
import { DAEStructureError, UNSUPPORTED_BLOCKS, assertStructurallyWellPosed } from '../vlabStructure';
import { TopologyValidationError, validateTopology } from '../vlabTopologyValidation';
import { PortWidthMismatchError, portShape, scalarInput, vectorInput, widthOf } from '../vlabVectorPorts';
import { CONTRACT_EXPECTED_FAILURES } from './contractExpectedFailures';
import { VECTOR_PORT_BACKLOG } from './vectorPortPlan';

/**
 * WP-09c: vector / composite port infrastructure (F-046).
 *
 * Every expected value is derived IN THIS FILE from the published relation, independently of the code under test:
 *  - Clarke (amplitude-invariant, Clarke 1943 / Simscape "Clarke Transform"): alpha = (2/3)(a - b/2 - c/2), beta = (b - c)/sqrt(3),
 *    zero = (a + b + c)/3. For the balanced set a = V sin(wt), b = V sin(wt - 120 deg), c = V sin(wt + 120 deg) this gives
 *    alpha = V sin(wt), beta = -V cos(wt), zero = 0 (derived below, not read from the code).
 *  - Park (Simscape "abc to dq0", Park 1929): '90 deg behind A': d = (2/3)[a sin(th) + b sin(th - 2pi/3) + c sin(th + 2pi/3)],
 *    q = (2/3)[a cos(th) + b cos(th - 2pi/3) + c cos(th + 2pi/3)]; 'Aligned with A': d = (2/3)[a cos(th) + ...],
 *    q = -(2/3)[a sin(th) + ...]; zero = (a+b+c)/3.
 *  - Fortescue (1918): V1 = (A + aB + a^2 C)/3, V2 = (A + a^2 B + aC)/3, V0 = (A+B+C)/3 with a = e^(j 2pi/3).
 *  - KCL / Ohm for the phase-splitter network.
 */

const TWO_PI = 2 * Math.PI;
const W = TWO_PI * 50;
const quiet = <T,>(fn: () => T): T => {
  const e = console.error, w = console.warn; console.error = () => {}; console.warn = () => {};
  try { return fn(); } finally { console.error = e; console.warn = w; }
};
const blocks: VLabBlock[] = VLAB_LIBRARY.flatMap(d => d.blocks);

// ── builders ──────────────────────────────────────────────────────────────────────────────────────────────────────
const node = (id: string, type: string, params: Record<string, any> = {}, extra: Record<string, any> = {}): Node =>
  ({ id, type: 'default', position: { x: 0, y: 0 }, data: { type, params, label: extra.label ?? id, ...extra } }) as Node;
const scopeNode = (id = 'scope', n = 1): Node =>
  ({ id, type: 'default', position: { x: 0, y: 0 }, data: { type: 'scope', label: id, params: { numSignals: { value: n } }, ports: Array.from({ length: n }, (_, i) => ({ id: `in${i + 1}`, pos: 'left', label: `${i + 1}`, domain: 'Physical', direction: 'in' })) } }) as Node;
let edgeCount = 0;
/** wire('a.p', 'b.n') using editor handles `<node>-<port>` */
const wire = (a: string, b: string): Edge => {
  const [sa, pa] = a.split('.'); const [sb, pb] = b.split('.');
  return { id: `e${edgeCount++}`, source: sa, sourceHandle: `${sa}-${pa}`, target: sb, targetHandle: `${sb}-${pb}` } as Edge;
};
interface Model { nodes: Node[]; edges: Edge[] }

function run(m: Model, steps: number, dt: number): any[] {
  const engine = new VLabPhysicsEngine();
  engine.setStepBudget({ maxStepAttempts: 200, wallClockMs: 20000 });
  const states: any[] = [];
  let state: any = null;
  quiet(() => { for (let i = 0; i < steps; i++) { state = engine.simulateStep(m.nodes, m.edges, state, dt); states.push(state); } });
  return states;
}
const abcAt = (t: number, V: number): [number, number, number] => [V * Math.sin(W * t), V * Math.sin(W * t - TWO_PI / 3), V * Math.sin(W * t + TWO_PI / 3)];
const trace = (state: any, scope: string, channel: number, names: string[]) => names.map(n => state.perScopeValues[scope][`in${channel}[${n}]`] as number);
const near = (actual: number, expected: number, label: string, tol = 1e-8) =>
  expect(Math.abs(actual - expected), `${label}: ${actual} vs ${expected}`).toBeLessThanOrEqual(tol * Math.max(1, Math.abs(expected)));

/** Residual rows of one block equation fed with the given port values (by port id) and zero branch unknowns: rows = -(outputs). */
function outputsOf(type: string, input: Record<string, number | number[]>, opts: { params?: Record<string, any>; d?: Record<string, number[]>; time?: number; reversePorts?: boolean } = {}): number[] {
  const b = libraryBlock(type)!;
  let ports = b.ports.map(p => p.id);
  if (opts.reversePorts) ports = [...ports].reverse(); // an equation resolves ports by id, never by position
  const across = ports.map(id => input[id] ?? (widthOf(b.ports.find(p => p.id === id)) > 1 ? [0, 0, 0] : 0));
  const dAcross = ports.map(id => opts.d?.[id] ?? (widthOf(b.ports.find(p => p.id === id)) > 1 ? [0, 0, 0] : 0));
  const outWidth = b.ports.filter(p => p.direction === 'out').reduce((s, p) => s + widthOf(p), 0);
  const ctx: any = { dt: 1e-3, time: opts.time ?? 0, parameters: {}, prevStates: [], states: [], stateDerivatives: [], order: 1 };
  const rows = blockEquations[type]({
    across, dAcross, branch: new Array(outWidth).fill(0), dBranch: new Array(outWidth).fill(0), state: [], dState: [], ctx,
    params: { ...Object.fromEntries(Object.entries(b.params).map(([k, v]) => [k, v.value])), ...(opts.params ?? {}) }, ports, nodeId: 'dut',
  });
  return rows.map(r => -r);
}

// models ----------------------------------------------------------------------------------------------------------
const sineClarkeScope = (): Model => ({
  nodes: [node('sine', 'ps_sine_3phase', { Vpk: 100, f: 50 }), node('clarke', 'clarke_transform'), scopeNode('scope')],
  edges: [wire('sine.abc', 'clarke.abc'), wire('clarke.ab0', 'scope.in1')],
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('library metadata: width / channelNames / composite', () => {
  const MARKED = [
    'phase_splitter.abc', 'ps_demux_3.in', 'ps_sine_3phase.abc',
    'clarke_transform.abc', 'clarke_transform.ab0', 'inv_clarke_transform.ab0', 'inv_clarke_transform.abc',
    'park_transform.abc', 'park_transform.dq0', 'inv_park_transform.dq0', 'inv_park_transform.abc',
    'sym_comp_transform.abc', 'sym_comp_transform.seq', 'inv_sym_comp_transform.seq', 'inv_sym_comp_transform.abc',
    'three_phase_source.abc', // WP-12a (F-068): composite three-phase source port
    // WP-12b: stator / AC terminals of the machines and the inverter are composite; the PWM reference vectors are width 3
    'ac_motor.abc', 'pmsm.abc', 'bldc_motor.abc', 'pwm_3ph_2level.abc', 'pwm_3ph_2level.vabc', 'pwm_3ph_3level.vabc',
  ];
  const marked = blocks.flatMap(b => b.ports.filter(p => p.width !== undefined || p.composite !== undefined).map(p => `${b.id}.${p.id}`));

  it('exactly the reviewed ports are marked (ratchet)', () => {
    expect(marked.sort()).toEqual([...MARKED].sort());
  });

  it('every declaration is consistent: composite only on Electrical, width only on Physical signals, one name per channel', () => {
    for (const b of blocks) for (const p of b.ports) {
      if (p.width === undefined && p.composite === undefined) { expect(p.channelNames, `${b.id}.${p.id}`).toBeUndefined(); continue; }
      const shape = portShape(p, `${b.id}.${p.id}`);
      expect(shape.channelNames.length, `${b.id}.${p.id}`).toBe(shape.width);
      if (p.composite) {
        expect((p.domain ?? '').toLowerCase(), `${b.id}.${p.id}`).toBe('electrical');
        expect(shape.channelNames).toEqual(['a', 'b', 'c']);
      } else {
        expect((p.domain ?? '').toLowerCase(), `${b.id}.${p.id}`).toBe('physical');
        expect(shape.width).toBeGreaterThan(1);
      }
    }
  });

  it('inconsistent declarations are errors, never defaulted', () => {
    expect(() => portShape({ width: 3, channelNames: ['a', 'b'] })).toThrow(/2 channel names/);
    expect(() => portShape({ width: 0 })).toThrow(/positive integer/);
    expect(() => portShape({ width: 2.5 })).toThrow(/positive integer/);
    expect(() => portShape({ composite: 'three_phase', width: 2 })).toThrow(/width 3/);
    expect(portShape({ composite: 'three_phase' })).toEqual({ width: 3, channelNames: ['a', 'b', 'c'], composite: 'three_phase' });
    expect(portShape({})).toEqual({ width: 1, channelNames: [] });
  });

  it('ports that are vectors by their label but still run scalar equations are planned, not silently scalar (WP-12 / WP-20)', () => {
    for (const [key, plan] of Object.entries(VECTOR_PORT_BACKLOG)) {
      const [blockId, portId] = key.split('.');
      const port = libraryBlock(blockId)?.ports.find(p => p.id === portId);
      expect(port, `${key} no longer exists: delete its backlog entry`).toBeDefined();
      expect((port!.domain ?? '').toLowerCase(), key).toBe('physical');
      expect(port!.width, `${key} is marked now: delete its backlog entry (owner ${plan.owner})`).toBeUndefined();
      expect(plan.channelNames).toHaveLength(plan.width);
    }
  });

  it('phase_splitter, park, inv_park and sym_comp are no longer explicitly unsupported', () => {
    for (const id of ['phase_splitter', 'park_transform', 'inv_park_transform', 'sym_comp_transform', 'inv_sym_comp_transform', 'clarke_transform', 'inv_clarke_transform', 'ps_sine_3phase']) {
      expect(UNSUPPORTED_BLOCKS[id], id).toBeUndefined();
      expect(CONTRACT_EXPECTED_FAILURES[id]?.unsupported, id).toBeUndefined();
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('width allocation and structural rank', () => {
  it('a width-3 net allocates 3 variables, a width-3 output 3 branches and 3 rows; the structural check stays exact', () => {
    const m = sineClarkeScope();
    const sys = quiet(() => new DAEAssembler().assemble(m.nodes, m.edges));
    const channelVars = sys.variableNames.filter(n => /^Across_.+_ch\d+_\(physical\)$/.test(n));
    expect(channelVars).toHaveLength(6); // abc net + ab0 net, 3 channels each
    expect(sys.variableNames.filter(n => n.startsWith('clarke_branch_'))).toEqual(
      ['clarke_branch_signal_ab0[0]', 'clarke_branch_signal_ab0[1]', 'clarke_branch_signal_ab0[2]']);
    expect(sys.variableNames.filter(n => n.startsWith('sine_branch_'))).toEqual(
      ['sine_branch_signal_abc[0]', 'sine_branch_signal_abc[1]', 'sine_branch_signal_abc[2]', 'sine_branch_signal_wt']);
    // one KCL / signal row per channel of each vector net, each driven by exactly one branch
    const perChannel = sys.kirchhoffNodes.filter(k => k.channel !== undefined);
    expect(perChannel).toHaveLength(6);
    expect(perChannel.map(k => k.channel).sort()).toEqual([0, 0, 1, 1, 2, 2]);
    expect(perChannel.every(k => k.throughIndices.length === 1 || k.throughIndices.length === 0)).toBe(true);
    // unknowns == rows == owners, and the full structural rank check passes
    const ctx: any = { dt: 1e-3, time: 0.01, parameters: {}, prevStates: new Array(sys.systemSize).fill(0), states: [], stateDerivatives: [], order: 1 };
    expect((sys.residuals as any)(new Array(sys.systemSize).fill(0.3), ctx).length).toBe(sys.systemSize);
    expect(sys.structure!.variableOwners).toHaveLength(sys.systemSize);
    expect(() => assertStructurallyWellPosed(sys)).not.toThrow();
  });

  it('an equation that returns 2 rows for a width-3 output is a row-count diagnostic, never padded', () => {
    const m = sineClarkeScope();
    const original = blockEquations.clarke_transform;
    let err: unknown;
    try {
      blockEquations.clarke_transform = (a) => original(a).slice(0, 2);
      try { quiet(() => new DAEAssembler().assemble(m.nodes, m.edges)); } catch (e) { err = e; }
    } finally { blockEquations.clarke_transform = original; }
    expect(err).toBeInstanceOf(DAEStructureError);
    expect((err as DAEStructureError).diagnostic).toMatchObject({ blockId: 'clarke', code: 'row-count-mismatch', expectedRows: 3, actualRows: 2 });
  });

  it('a channel with no equation is a structural-rank diagnostic naming the block', () => {
    const m = sineClarkeScope();
    const original = blockEquations.clarke_transform;
    let err: unknown;
    try {
      blockEquations.clarke_transform = (a) => { const r = original(a); return [r[0], r[1], 0]; };
      const sys = quiet(() => new DAEAssembler().assemble(m.nodes, m.edges));
      try { assertStructurallyWellPosed(sys); } catch (e) { err = e; }
    } finally { blockEquations.clarke_transform = original; }
    expect(err).toBeInstanceOf(DAEStructureError);
    expect((err as DAEStructureError).diagnostics[0].reason).toMatch(/clarke/);
  });

  it('every vector fixture block of the library is structurally well posed (unknowns == rows)', () => {
    for (const id of ['phase_splitter', 'ps_demux_3', 'ps_sine_3phase', 'clarke_transform', 'inv_clarke_transform', 'park_transform', 'inv_park_transform', 'sym_comp_transform', 'inv_sym_comp_transform']) {
      const b = blocks.find(x => x.id === id)!;
      const alone = quiet(() => new DAEAssembler().assemble([{ id: 'dut', type: 'default', position: { x: 0, y: 0 }, data: { type: id, params: {}, ports: b.ports } } as Node], []));
      const c = alone.components.find(k => k.blockId === 'dut')!;
      const allocated = alone.variableNames.filter(n => n.startsWith('dut_branch_') || n.startsWith('dut_state_')).length;
      expect(c.equationCount, id).toBe(allocated);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('width-mismatch diagnostic (both drag directions)', () => {
  const nodes: RuleNode[] = [
    { id: 'k', type: 'default', data: { type: 'ps_constant', label: 'Constant' } },
    { id: 'sine', type: 'default', data: { type: 'ps_sine_3phase', label: 'Sine' } },
    { id: 'clarke', type: 'default', data: { type: 'clarke_transform', label: 'Clarke' } },
    { id: 'gain', type: 'default', data: { type: 'ps_gain', label: 'Gain' } },
    { id: 'scope', type: 'default', data: { type: 'scope', label: 'Scope' } },
  ];
  const connect = (a: string, ap: string, b: string, bp: string) => ({
    ab: validateConnection(nodes, [], { source: a, sourceHandle: `${a}-${ap}`, target: b, targetHandle: `${b}-${bp}` }),
    ba: validateConnection(nodes, [], { source: b, sourceHandle: `${b}-${bp}`, target: a, targetHandle: `${a}-${ap}` }),
  });

  it('scalar output -> width-3 input is rejected with expected 3 / actual 1, identically from either end', () => {
    const { ab, ba } = connect('k', 'y', 'clarke', 'abc');
    for (const r of [ab, ba]) {
      expect(r.valid).toBe(false);
      if (r.valid) continue;
      expect(r.diagnostic).toMatchObject({ code: 'width-mismatch', blockId: 'clarke', portId: 'abc', expectedWidth: 3, actualWidth: 1, otherBlockId: 'k', otherPortId: 'y' });
      expect(r.message).toContain('expected width 3');
      expect(r.message).toContain('got width 1');
      expect(r.message).toMatch(/no implicit broadcast or truncation/);
    }
    expect(JSON.stringify(ab)).toBe(JSON.stringify(ba));
  });

  it('width-3 output -> scalar input is rejected with expected 1 / actual 3, identically from either end', () => {
    const { ab, ba } = connect('sine', 'abc', 'gain', 'u');
    for (const r of [ab, ba]) {
      expect(r.valid).toBe(false);
      if (r.valid) continue;
      expect(r.diagnostic).toMatchObject({ code: 'width-mismatch', blockId: 'gain', portId: 'u', expectedWidth: 1, actualWidth: 3 });
    }
    expect(JSON.stringify(ab)).toBe(JSON.stringify(ba));
  });

  it('equal widths connect (the signal output becomes the source from either end); scopes accept any width', () => {
    const { ab, ba } = connect('sine', 'abc', 'clarke', 'abc');
    expect(ab.valid && ba.valid).toBe(true);
    if (ab.valid && ba.valid) {
      expect(ab.edge).toEqual({ source: 'sine', sourceHandle: 'sine-abc', target: 'clarke', targetHandle: 'clarke-abc' });
      expect(ba.edge).toEqual(ab.edge);
    }
    for (const [n, p] of [['sine', 'abc'], ['k', 'y']] as const) {
      const s = connect(n, p, 'scope', 'in1');
      expect(s.ab.valid && s.ba.valid, `${n}.${p} -> scope`).toBe(true);
    }
  });

  it('the Simulink-PS converter and the probe carry ONE scalar: a width-3 signal is rejected there, a scalar is accepted', () => {
    const more: RuleNode[] = [...nodes,
      { id: 'conv', type: 'default', data: { type: 'ps_simulink_conv', label: 'Conv' } },
      { id: 'probe', type: 'default', data: { type: 'vlab_probe', label: 'Probe' } }];
    for (const [target, port] of [['conv', 'in'], ['probe', 'in']] as const) {
      const vec = validateConnection(more, [], { source: 'sine', sourceHandle: 'sine-abc', target, targetHandle: `${target}-${port}` });
      expect(vec.valid, `${target} with a vector`).toBe(false);
      if (!vec.valid) expect(vec.diagnostic).toMatchObject({ code: 'width-mismatch', expectedWidth: 1, actualWidth: 3 });
      const sca = validateConnection(more, [], { source: 'k', sourceHandle: 'k-y', target, targetHandle: `${target}-${port}` });
      expect(sca.valid, `${target} with a scalar`).toBe(true);
    }
  });

  it('width-3 -> width-3 with different channel names is legal (a vector is a vector): abc into dq0', () => {
    const more: RuleNode[] = [...nodes, { id: 'park', type: 'default', data: { type: 'inv_park_transform', label: 'InvPark' } }];
    const r = validateConnection(more, [], { source: 'sine', sourceHandle: 'sine-abc', target: 'park', targetHandle: 'park-dq0' });
    expect(r.valid).toBe(true);
  });

  it('a loaded model with a scalar edge on a now-vector port is a diagnostic before the solver, and the assembler refuses it too', () => {
    const m: Model = {
      nodes: [node('k', 'ps_constant', { value: 5 }), node('clarke', 'clarke_transform'), scopeNode('scope')],
      edges: [wire('k.y', 'clarke.abc'), wire('clarke.ab0', 'scope.in1')],
    };
    const diags = checkEdgeSet(m.nodes as unknown as RuleNode[], m.edges as any).filter(d => d.code === 'width-mismatch');
    expect(diags).toHaveLength(1);
    expect(diags[0]).toMatchObject({ blockId: 'clarke', portId: 'abc', expectedWidth: 3, actualWidth: 1 });
    expect(() => new VLabPhysicsEngine().simulateStep(m.nodes, m.edges, null, 1e-3)).toThrow(TopologyValidationError);
    let err: unknown;
    try { quiet(() => new DAEAssembler().assemble(m.nodes, m.edges)); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(PortWidthMismatchError);
    expect((err as PortWidthMismatchError).diagnostics[0]).toMatchObject({ code: 'width-mismatch', expectedWidth: 3, actualWidth: 1 });
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('composite three-phase port', () => {
  const nodes: RuleNode[] = [
    { id: 'sp', type: 'default', data: { type: 'phase_splitter', label: 'Splitter' } },
    { id: 'sp2', type: 'default', data: { type: 'phase_splitter', label: 'Splitter 2' } },
    { id: 'r', type: 'default', data: { type: 'resistor', label: 'R' } },
    { id: 'k', type: 'default', data: { type: 'ps_constant', label: 'K' } },
  ];
  const both = (a: string, ap: string, b: string, bp: string) => ({
    ab: validateConnection(nodes, [], { source: a, sourceHandle: `${a}-${ap}`, target: b, targetHandle: `${b}-${bp}` }),
    ba: validateConnection(nodes, [], { source: b, sourceHandle: `${b}-${bp}`, target: a, targetHandle: `${a}-${ap}` }),
  });

  it('composite -> scalar electrical is rejected from either end, with a diagnostic naming both ports and the widths', () => {
    const { ab, ba } = both('sp', 'abc', 'r', 'p');
    for (const r of [ab, ba]) {
      expect(r.valid).toBe(false);
      if (r.valid) continue;
      expect(r.diagnostic.code).toBe('composite-mismatch');
      expect(r.diagnostic).toMatchObject({ expectedWidth: 3, actualWidth: 1 });
      expect(r.message).toContain('Splitter.abc');
      expect(r.message).toContain('R.p');
      expect(r.message).toMatch(/Phase Splitter/);
    }
    expect(JSON.stringify(ab)).toBe(JSON.stringify(ba));
  });

  it('composite -> composite connects, scalar phase -> scalar electrical connects, composite -> signal is a domain error', () => {
    const cc = both('sp', 'abc', 'sp2', 'abc');
    expect(cc.ab.valid && cc.ba.valid).toBe(true);
    const sc = both('sp', 'a', 'r', 'p');
    expect(sc.ab.valid && sc.ba.valid).toBe(true);
    const sig = both('sp', 'abc', 'k', 'y');
    expect(sig.ab.valid).toBe(false);
    if (!sig.ab.valid) expect(sig.ab.diagnostic.code).toBe('domain-mismatch');
  });

  it('a saved model that wires a scalar node into the composite port is a diagnostic, not a crash', () => {
    const m: Model = {
      nodes: [node('v', 'dc_voltage', { V: 10 }), node('sp', 'phase_splitter'), node('gnd', 'ground')],
      edges: [wire('v.p', 'sp.abc'), wire('v.n', 'gnd.a')],
    };
    const report = validateTopology(m.nodes, m.edges);
    expect(report.valid).toBe(false);
    const d = report.diagnostics.find(x => x.code === 'composite-mismatch')!;
    expect(d).toBeDefined();
    expect(d).toMatchObject({ expectedWidth: 3, actualWidth: 1 });
    expect(() => new VLabPhysicsEngine().simulateStep(m.nodes, m.edges, null, 1e-3)).toThrow(TopologyValidationError);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('phase_splitter: KCL per phase with an unbalanced three-phase resistive load', () => {
  // Three grounded sources V_k through Rs_k into splitter 1 (scalar a, b, c), composite abc between the two splitters, then
  // load R_k from each scalar phase of splitter 2 to ground. Each phase is an independent series loop:
  //   I_k = V_k / (R_int + Rs_k + R_k),  V_load,k = I_k R_k,  V_composite,k = V_load,k
  const V = [100, -40, 70];
  const Rint = 1e-3; // dc_voltage library default internal resistance
  const Rs = [2, 5, 3];
  const R = [10, 25, 50];
  const model = (): Model => {
    const ns: Node[] = [node('sp1', 'phase_splitter'), node('sp2', 'phase_splitter'), node('gnd', 'ground')];
    const es: Edge[] = [wire('sp1.abc', 'sp2.abc')];
    ['a', 'b', 'c'].forEach((ph, k) => {
      ns.push(node(`v${ph}`, 'dc_voltage', { V: V[k] }), node(`rs${ph}`, 'resistor', { R: Rs[k] }), node(`rl${ph}`, 'resistor', { R: R[k] }));
      es.push(wire(`v${ph}.p`, `rs${ph}.p`), wire(`rs${ph}.n`, `sp1.${ph}`), wire(`v${ph}.n`, 'gnd.a'), wire(`sp2.${ph}`, `rl${ph}.p`), wire(`rl${ph}.n`, 'gnd.a'));
    });
    return { nodes: ns, edges: es };
  };

  it('each phase carries its own current and voltage (the phases are not short-circuited), for every step', () => {
    const m = model();
    const states = run(m, 5, 1e-3);
    const sys = quiet(() => new DAEAssembler().assemble(m.nodes, m.edges));
    const at = (s: any, name: string) => { const i = s.variableNames.indexOf(name); if (i < 0) throw new Error(`no variable ${name}`); return s.x[i]; };
    const rootOf = (block: string, port: string) => sys.components.find(c => c.blockId === block)!.portNodeMap.get(port)!;
    const I = V.map((v, k) => v / (Rint + Rs[k] + R[k]));
    // the three phase currents really differ (a scalar-tied splitter would force one common current)
    expect(new Set(I.map(i => i.toFixed(6))).size).toBe(3);
    for (const s of states) {
      ['a', 'b', 'c'].forEach((ph, k) => {
        near(at(s, `rl${ph}_branch_current`), I[k], `I_load,${ph}`);
        // through variable is positive p -> n through the block: a source that delivers I_k out of p carries -I_k
        near(at(s, `v${ph}_branch_current`), -I[k], `I_source,${ph}`, 1e-6);
        // splitter 2: current from the composite phase into the block, out through the scalar port = +I_k; splitter 1: -I_k
        near(at(s, `sp2_branch_current_${ph}`), I[k], `sp2 I_${ph}`);
        near(at(s, `sp1_branch_current_${ph}`), -I[k], `sp1 I_${ph}`);
        // phase voltages: composite phase node == both scalar nodes == V_load
        const vLoad = I[k] * R[k];
        near(at(s, `Across_${rootOf('rl' + ph, 'p')}_(electrical)`), vLoad, `V_load,${ph}`);
        near(at(s, `Across_${rootOf('sp1', 'abc')}_ph${ph}_(electrical)`), vLoad, `V_composite,${ph}`);
        near(at(s, `Across_${rootOf('sp1', ph)}_(electrical)`), vLoad, `V_scalar,${ph}`);
      });
      // KCL at the composite node: whatever splitter 1 pushes in, splitter 2 takes out, per phase
      ['a', 'b', 'c'].forEach(ph => near(at(s, `sp1_branch_current_${ph}`) + at(s, `sp2_branch_current_${ph}`), 0, `KCL composite ${ph}`, 1e-9));
    }
    // composite port: 3 KCL rows, one per phase
    expect(sys.kirchhoffNodes.filter(k => k.nodeId === rootOf('sp1', 'abc')).map(k => k.channel)).toEqual([0, 1, 2]);
    expect(() => assertStructurallyWellPosed(sys)).not.toThrow();
  });

  it('an open phase stays open: only the loaded phases carry current', () => {
    const m = model();
    // remove phase b load: that phase has no current path through the composite port, the others are unaffected
    m.nodes = m.nodes.filter(n => n.id !== 'rlb');
    m.edges = m.edges.filter(e => e.source !== 'rlb' && e.target !== 'rlb');
    const states = run(m, 3, 1e-3);
    const s = states[states.length - 1];
    const at = (name: string) => s.x[s.variableNames.indexOf(name)];
    near(at('rla_branch_current'), V[0] / (Rint + Rs[0] + R[0]), 'I_a');
    near(at('rlc_branch_current'), V[2] / (Rint + Rs[2] + R[2]), 'I_c');
    near(at('sp2_branch_current_b'), 0, 'I_b (open)', 1e-9);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('Clarke / inverse Clarke through VLabPhysicsEngine.simulateStep', () => {
  it('balanced set -> alpha = V sin(wt), beta = -V cos(wt), zero = 0, at every step', () => {
    const states = run(sineClarkeScope(), 8, 1e-3);
    for (const s of states) {
      const t = s.time as number;
      const [alpha, beta, zero] = trace(s, 'scope', 1, ['alpha', 'beta', '0']);
      // closed form of the published formulas for the balanced set
      near(alpha, 100 * Math.sin(W * t), 'alpha');
      near(beta, -100 * Math.cos(W * t), 'beta');
      near(zero, 0, 'zero');
      // and the formulas themselves, evaluated here on the same a, b, c
      const [a, b, c] = abcAt(t, 100);
      near(alpha, (2 / 3) * (a - b / 2 - c / 2), 'alpha (formula)');
      near(beta, (b - c) / Math.sqrt(3), 'beta (formula)');
      near(zero, (a + b + c) / 3, 'zero (formula)');
    }
  });

  for (const convention of ['Peak Amp Preserved', 'Power Preserved']) {
    it(`Clarke -> inverse Clarke is the identity (${convention}), also instantaneous power for 'Power Preserved'`, () => {
      const m: Model = {
        nodes: [node('sine', 'ps_sine_3phase', { Vpk: 100, f: 50 }), node('clarke', 'clarke_transform', { convention }), node('inv', 'inv_clarke_transform', { convention }), scopeNode('s_out'), scopeNode('s_ab')],
        edges: [wire('sine.abc', 'clarke.abc'), wire('clarke.ab0', 'inv.ab0'), wire('inv.abc', 's_out.in1'), wire('clarke.ab0', 's_ab.in1')],
      };
      for (const s of run(m, 6, 1e-3)) {
        const t = s.time as number;
        const expected = abcAt(t, 100);
        trace(s, 's_out', 1, ['a', 'b', 'c']).forEach((v, k) => near(v, expected[k], `abc[${k}]`));
        if (convention === 'Power Preserved') {
          const [al, be, ze] = trace(s, 's_ab', 1, ['alpha', 'beta', '0']);
          near(al * al + be * be + ze * ze, expected.reduce((p, x) => p + x * x, 0), 'power invariance');
        }
      }
    });
  }

  it('unbalanced vector, closed-form values (zero sequence present): equation level, by port id', () => {
    // a = 3, b = -1, c = 2: alpha = (2/3)(3 + 1/2 - 1) = 5/3, beta = (-1 - 2)/sqrt(3) = -sqrt(3), zero = 4/3
    const out = outputsOf('clarke_transform', { abc: [3, -1, 2] });
    near(out[0], 5 / 3, 'alpha'); near(out[1], -Math.sqrt(3), 'beta'); near(out[2], 4 / 3, 'zero');
    // inverse recovers a, b, c
    const back = outputsOf('inv_clarke_transform', { ab0: out });
    [3, -1, 2].forEach((v, k) => near(back[k], v, `back[${k}]`));
    // Power Preserved: sqrt(2/3)(a - b/2 - c/2), (b - c)/sqrt(2), (a + b + c)/sqrt(3)
    const pp = outputsOf('clarke_transform', { abc: [3, -1, 2] }, { params: { convention: 'Power Preserved' } });
    near(pp[0], Math.sqrt(2 / 3) * 2.5, 'alpha pp'); near(pp[1], -3 / Math.SQRT2, 'beta pp'); near(pp[2], 4 / Math.sqrt(3), 'zero pp');
    near(pp[0] ** 2 + pp[1] ** 2 + pp[2] ** 2, 9 + 1 + 4, 'power preserved');
  });

  it('an unknown convention is a parameter diagnostic, never a silent default', () => {
    expect(() => outputsOf('clarke_transform', { abc: [1, 2, 3] }, { params: { convention: 'Wrong' } })).toThrow(/convention/);
  });

  it('a scalar handed to a vector port is an error naming the port (never channel 0)', () => {
    const b = libraryBlock('clarke_transform')!;
    expect(() => blockEquations.clarke_transform({
      across: [1, 0], dAcross: [0, 0], branch: [0, 0, 0], dBranch: [], state: [], dState: [], ctx: {} as any,
      params: { convention: 'Peak Amp Preserved' }, ports: b.ports.map(p => p.id), nodeId: 'x',
    })).toThrow(/port "abc" expects a 3-element vector/);
    expect(() => vectorInput({ across: [[1, 2]], ports: ['abc'] }, 'abc', 3)).toThrow(/vector of 2/);
    expect(() => scalarInput({ across: [[1, 2, 3]], ports: ['theta'] }, 'theta')).toThrow(/scalar/);
    expect(() => scalarInput({ across: [1], ports: ['theta'] }, 'nope')).toThrow(/does not exist/);
  });

  it('equations resolve ports by id: reversed port order gives the same outputs', () => {
    const t = 0.0123;
    const forward = outputsOf('park_transform', { abc: abcAt(t, 80), theta: W * t }, { time: t });
    const reversed = outputsOf('park_transform', { abc: abcAt(t, 80), theta: W * t }, { time: t, reversePorts: true });
    expect(reversed).toEqual(forward);
    expect(outputsOf('clarke_transform', { abc: [1, 2, 3] }, { reversePorts: true })).toEqual(outputsOf('clarke_transform', { abc: [1, 2, 3] }));
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('Park / inverse Park through VLabPhysicsEngine.simulateStep', () => {
  const parkModel = (alignment?: string): Model => {
    const params = alignment ? { alignment } : {};
    return {
      nodes: [node('sine', 'ps_sine_3phase', { Vpk: 100, f: 50 }), node('park', 'park_transform', params), node('inv', 'inv_park_transform', params), scopeNode('s_dq'), scopeNode('s_abc')],
      edges: [
        wire('sine.abc', 'park.abc'), wire('sine.wt', 'park.theta'), wire('park.dq0', 'inv.dq0'), wire('sine.wt', 'inv.theta'),
        wire('park.dq0', 's_dq.in1'), wire('inv.abc', 's_abc.in1'),
      ],
    };
  };

  it("'90 deg behind A' (library default): a = V sin(wt) with theta = wt gives d = V, q = 0, zero = 0; Park -> inverse Park is the identity", () => {
    for (const s of run(parkModel(), 8, 1e-3)) {
      const t = s.time as number;
      const [d, q, z] = trace(s, 's_dq', 1, ['d', 'q', '0']);
      near(d, 100, 'd'); near(q, 0, 'q'); near(z, 0, 'zero');
      // published definition evaluated on the same a, b, c
      const th = W * t; const [a, b, c] = abcAt(t, 100);
      near(d, (2 / 3) * (a * Math.sin(th) + b * Math.sin(th - TWO_PI / 3) + c * Math.sin(th + TWO_PI / 3)), 'd (formula)');
      near(q, (2 / 3) * (a * Math.cos(th) + b * Math.cos(th - TWO_PI / 3) + c * Math.cos(th + TWO_PI / 3)), 'q (formula)');
      const expected = abcAt(t, 100);
      trace(s, 's_abc', 1, ['a', 'b', 'c']).forEach((v, k) => near(v, expected[k], `abc[${k}]`));
    }
  });

  it("'Aligned with A': same set gives d = 0, q = -V; round trip still the identity", () => {
    for (const s of run(parkModel('Aligned with A'), 6, 1e-3)) {
      const t = s.time as number;
      const [d, q, z] = trace(s, 's_dq', 1, ['d', 'q', '0']);
      near(d, 0, 'd'); near(q, -100, 'q'); near(z, 0, 'zero');
      const th = W * t; const [a, b, c] = abcAt(t, 100);
      near(d, (2 / 3) * (a * Math.cos(th) + b * Math.cos(th - TWO_PI / 3) + c * Math.cos(th + TWO_PI / 3)), 'd (formula)');
      near(q, -(2 / 3) * (a * Math.sin(th) + b * Math.sin(th - TWO_PI / 3) + c * Math.sin(th + TWO_PI / 3)), 'q (formula)');
      const expected = abcAt(t, 100);
      trace(s, 's_abc', 1, ['a', 'b', 'c']).forEach((v, k) => near(v, expected[k], `abc[${k}]`));
    }
  });

  it('unbalanced set with zero sequence and an arbitrary angle, closed form (both alignments)', () => {
    const th = 0.7; const abc = [3, -1, 2];
    const d90 = (2 / 3) * (abc[0] * Math.sin(th) + abc[1] * Math.sin(th - TWO_PI / 3) + abc[2] * Math.sin(th + TWO_PI / 3));
    const q90 = (2 / 3) * (abc[0] * Math.cos(th) + abc[1] * Math.cos(th - TWO_PI / 3) + abc[2] * Math.cos(th + TWO_PI / 3));
    const out = outputsOf('park_transform', { abc, theta: th });
    near(out[0], d90, 'd'); near(out[1], q90, 'q'); near(out[2], 4 / 3, 'zero');
    const back = outputsOf('inv_park_transform', { dq0: out, theta: th });
    abc.forEach((v, k) => near(back[k], v, `back[${k}]`));
    const al = outputsOf('park_transform', { abc, theta: th }, { params: { alignment: 'Aligned with A' } });
    near(al[0], (2 / 3) * (abc[0] * Math.cos(th) + abc[1] * Math.cos(th - TWO_PI / 3) + abc[2] * Math.cos(th + TWO_PI / 3)), 'd aligned');
    near(al[1], -(2 / 3) * (abc[0] * Math.sin(th) + abc[1] * Math.sin(th - TWO_PI / 3) + abc[2] * Math.sin(th + TWO_PI / 3)), 'q aligned');
    const back2 = outputsOf('inv_park_transform', { dq0: al, theta: th }, { params: { alignment: 'Aligned with A' } });
    abc.forEach((v, k) => near(back2[k], v, `back aligned[${k}]`));
    expect(() => outputsOf('park_transform', { abc, theta: th }, { params: { alignment: 'sideways' } })).toThrow(/alignment/);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('symmetrical components (Fortescue) through VLabPhysicsEngine.simulateStep', () => {
  type C = { re: number; im: number };
  const cmul = (x: C, y: C): C => ({ re: x.re * y.re - x.im * y.im, im: x.re * y.im + x.im * y.re });
  const cadd = (...zs: C[]): C => ({ re: zs.reduce((s, z) => s + z.re, 0), im: zs.reduce((s, z) => s + z.im, 0) });
  const op: C = { re: Math.cos(TWO_PI / 3), im: Math.sin(TWO_PI / 3) }; // a = e^(j 2pi/3)
  const op2 = cmul(op, op);
  const mag = (z: C) => Math.hypot(z.re, z.im);
  /** Fortescue peak magnitudes of the phasors X_k e^(j(w t + phi_k)) */
  const fortescue = (amp: number[], phi: number[]) => {
    const P = amp.map((x, k) => ({ re: x * Math.cos(phi[k]), im: x * Math.sin(phi[k]) }));
    const third = (z: C): C => ({ re: z.re / 3, im: z.im / 3 });
    return [third(cadd(P[0], cmul(op, P[1]), cmul(op2, P[2]))), third(cadd(P[0], cmul(op2, P[1]), cmul(op, P[2]))), third(cadd(P[0], P[1], P[2]))].map(mag);
  };

  // WP-20a (F-063): the dx/dt phasor estimate is gone. The block integrates s_k(t) e^(-j w t) (six states) and reads the window
  // Z(t) - Z(t - T) from the committed history; the closed-form magnitudes through the solver are in signal_blocks.test.ts.
  it('the Fourier integrand of the three sequences is s_k(t) e^(-j w t) with s1 = (A + aB + a^2 C)/3, s2 = (A + a^2 B + aC)/3, s0 = (A + B + C)/3 (equation level)', () => {
    const t0 = 0.0071; const amp = [100, 60, 80]; const phi = [0.3, -2.0, 2.2];
    const x = amp.map((a, k) => a * Math.cos(W * t0 + phi[k]));
    const b = libraryBlock('sym_comp_transform')!;
    const ports = b.ports.map(p => p.id);
    const ctx: any = { dt: 1e-3, time: t0, parameters: {}, prevStates: [], states: [], stateDerivatives: [], order: 1 };
    const rows = blockEquations.sym_comp_transform({
      across: ports.map(id => (id === 'abc' ? x : [0, 0, 0])), dAcross: ports.map(() => [0, 0, 0]), branch: [0, 0, 0], dBranch: [0, 0, 0],
      state: [0, 0, 0, 0, 0, 0], dState: [0, 0, 0, 0, 0, 0], ctx, params: { freq: 50 }, ports, nodeId: 'dut',
    });
    // rows 3..8 are dState - integrand, so with dState = 0 they are -(integrand): [Re z1, Im z1, Re z2, Im z2, Re z0, Im z0]
    const e = { re: Math.cos(-W * t0), im: Math.sin(-W * t0) }; // e^(-j w t)
    const s1 = { re: (x[0] + op.re * x[1] + op2.re * x[2]) / 3, im: (op.im * x[1] + op2.im * x[2]) / 3 };
    const s2 = { re: (x[0] + op2.re * x[1] + op.re * x[2]) / 3, im: (op2.im * x[1] + op.im * x[2]) / 3 };
    const s0 = { re: (x[0] + x[1] + x[2]) / 3, im: 0 };
    [s1, s2, s0].forEach((s, k) => {
      const z = cmul(s, e);
      near(-rows[3 + 2 * k], z.re, `Re z${k}`, 1e-9);
      near(-rows[4 + 2 * k], z.im, `Im z${k}`, 1e-9);
    });
  });

  it('closed form (Fourier fundamental of an unbalanced set): the magnitudes of the phasors of the analytic set (reference of the through-solver tests)', () => {
    const amp = [100, 60, 80]; const phi = [0.3, -2.0, 2.2];
    const want = fortescue(amp, phi);
    // V0 = (A + B + C)/3 by hand: |(100 e^(j0.3) + 60 e^(-j2.0) + 80 e^(j2.2))/3|
    const re = (100 * Math.cos(0.3) + 60 * Math.cos(-2.0) + 80 * Math.cos(2.2)) / 3;
    const im = (100 * Math.sin(0.3) + 60 * Math.sin(-2.0) + 80 * Math.sin(2.2)) / 3;
    near(want[2], Math.hypot(re, im), 'V0', 1e-12);
    // |V1|^2 + |V2|^2 + |V0|^2 = (|A|^2 + |B|^2 + |C|^2)/3 (Parseval of the Fortescue transform)
    near(want[0] ** 2 + want[1] ** 2 + want[2] ** 2, (100 ** 2 + 60 ** 2 + 80 ** 2) / 3, 'Parseval', 1e-9);
  });

  it('through the solver: a balanced positive set from the 3-phase generator reads [Vpk, 0, 0] from one period on, without ripple (running Fourier)', () => {
    const m: Model = {
      nodes: [node('sine', 'ps_sine_3phase', { Vpk: 100, f: 50 }), node('seq', 'sym_comp_transform', { freq: 50 }), scopeNode('scope')],
      edges: [wire('sine.abc', 'seq.abc'), wire('seq.seq', 'scope.in1')],
    };
    const states = run(m, 160, 0.02 / 80);
    // the window is one fundamental period (20 ms); the signal before t = 0 counts as 0, so the output is exact from t = T on
    for (const s of states.filter(x => (x.time as number) >= 0.02 + 1e-9)) {
      const [pos, neg, zero] = trace(s, 'scope', 1, ['pos', 'neg', 'zero']);
      expect(Math.abs(pos - 100), `pos ${pos}`).toBeLessThan(1);
      expect(Math.abs(neg), `neg ${neg}`).toBeLessThan(1);
      expect(Math.abs(zero), `zero ${zero}`).toBeLessThan(1);
    }
  });

  it('inverse synthesis: seq magnitudes -> abc at the base frequency (phase a = cos(wt) reference)', () => {
    const t0 = 0.0042; const seq = [90, 30, 20]; // |V1|, |V2|, |V0|
    const abc = outputsOf('inv_sym_comp_transform', { seq }, { time: t0 });
    const th = W * t0; const sh = TWO_PI / 3;
    near(abc[0], (90 + 30 + 20) * Math.cos(th), 'a');
    near(abc[1], 90 * Math.cos(th - sh) + 30 * Math.cos(th + sh) + 20 * Math.cos(th), 'b');
    near(abc[2], 90 * Math.cos(th + sh) + 30 * Math.cos(th - sh) + 20 * Math.cos(th), 'c');
    // the round trip forward(inverse(seq)) = seq runs through the solver in signal_blocks.test.ts (the analyzer needs one period of history)
  });

  it('through the solver: the inverse block evaluates its synthesis at the solver time', () => {
    const m: Model = {
      nodes: [node('sine', 'ps_sine_3phase', { Vpk: 10, f: 50 }), node('inv', 'inv_sym_comp_transform', { freq: 50 }), scopeNode('scope')],
      edges: [wire('sine.abc', 'inv.seq'), wire('inv.abc', 'scope.in1')],
    };
    for (const s of run(m, 5, 1e-3)) {
      const t = s.time as number;
      const seq = abcAt(t, 10); // the sine set is used as an arbitrary width-3 vector source
      const th = W * t; const sh = TWO_PI / 3;
      const [a, b, c] = trace(s, 'scope', 1, ['a', 'b', 'c']);
      near(a, (seq[0] + seq[1] + seq[2]) * Math.cos(th), 'a');
      near(b, seq[0] * Math.cos(th - sh) + seq[1] * Math.cos(th + sh) + seq[2] * Math.cos(th), 'b');
      near(c, seq[0] * Math.cos(th + sh) + seq[1] * Math.cos(th - sh) + seq[2] * Math.cos(th), 'c');
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('demux of a width-3 vector', () => {
  it('ps_demux_3 splits the vector component by component (y_k = u[k])', () => {
    const m: Model = {
      nodes: [node('sine', 'ps_sine_3phase', { Vpk: 50, f: 50 }), node('dmx', 'ps_demux_3'), scopeNode('scope', 3)],
      edges: [wire('sine.abc', 'dmx.in'), wire('dmx.a', 'scope.in1'), wire('dmx.b', 'scope.in2'), wire('dmx.c', 'scope.in3')],
    };
    for (const s of run(m, 5, 1e-3)) {
      const e = abcAt(s.time as number, 50);
      [1, 2, 3].forEach(k => near(s.perScopeValues.scope[`in${k}`], e[k - 1], `y${k}`));
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('scope: a width-N signal shows N traces with channel names, quantity and unit', () => {
  it('abc on a scope: exactly in1[a], in1[b], in1[c] (no in1, no value alias, nothing taken from [0])', () => {
    const m: Model = { nodes: [node('sine', 'ps_sine_3phase', { Vpk: 100, f: 50 }, { label: 'Sine' }), scopeNode('scope')], edges: [wire('sine.abc', 'scope.in1')] };
    for (const s of run(m, 4, 1e-3)) {
      const v = s.perScopeValues.scope;
      expect(Object.keys(v).sort()).toEqual(['in1[a]', 'in1[b]', 'in1[c]']);
      const e = abcAt(s.time as number, 100);
      trace(s, 'scope', 1, ['a', 'b', 'c']).forEach((x, k) => near(x, e[k], `trace ${k}`));
    }
    const sys = quiet(() => new DAEAssembler().assemble(m.nodes, m.edges));
    const binding = sys.scopeChannels!.get('scope')![0];
    expect(binding).toMatchObject({ channel: 1, width: 3, channelNames: ['a', 'b', 'c'], sourcePortId: 'abc' });
    expect(binding.indices.map(i => sys.variableNames[i])).toEqual(['sine_branch_signal_abc[0]', 'sine_branch_signal_abc[1]', 'sine_branch_signal_abc[2]']);
    // the legacy per-channel list never silently reduces a vector to component 0
    expect(sys.scopeOutputs.get('scope')).toEqual([-1]);
  });

  it('dq0 and alpha-beta-zero outputs are labelled d, q, 0 / alpha, beta, 0 with quantity and unit', () => {
    const m: Model = {
      nodes: [node('sine', 'ps_sine_3phase', { Vpk: 100, f: 50 }), node('park', 'park_transform', {}, { label: 'Park' }), node('clarke', 'clarke_transform', {}, { label: 'Clarke' }), scopeNode('s1'), scopeNode('s2')],
      edges: [wire('sine.abc', 'park.abc'), wire('sine.wt', 'park.theta'), wire('park.dq0', 's1.in1'), wire('sine.abc', 'clarke.abc'), wire('clarke.ab0', 's2.in1')],
    };
    const dq = getVLabSignalInfo('s1', 0, m.nodes, m.edges);
    expect(dq.width).toBe(3);
    expect(dq.traceKeys).toEqual(['in1[d]', 'in1[q]', 'in1[0]']);
    expect(dq.traceLabels).toEqual(['Park.dq0[d] — dq0 components [unit of input]', 'Park.dq0[q] — dq0 components [unit of input]', 'Park.dq0[0] — dq0 components [unit of input]']);
    const ab = getVLabSignalInfo('s2', 0, m.nodes, m.edges);
    expect(ab.traceKeys).toEqual(['in1[alpha]', 'in1[beta]', 'in1[0]']);
    const sine = getVLabSignalInfo('s1', 0, [node('sine', 'ps_sine_3phase', {}, { label: 'Sine' }), scopeNode('s1')], [wire('sine.abc', 's1.in1')]);
    expect(sine.traceLabels).toEqual([
      'Sine.abc[a] — three-phase sine voltage [V]', 'Sine.abc[b] — three-phase sine voltage [V]', 'Sine.abc[c] — three-phase sine voltage [V]',
    ]);
    expect(sine.quantity).toBe('three-phase sine voltage');
    expect(sine.unit).toBe('V');
    // the engine publishes exactly those keys
    const s = run(m, 2, 1e-3)[1];
    expect(Object.keys(s.perScopeValues.s1).sort()).toEqual([...dq.traceKeys].sort());
    expect(Object.keys(s.perScopeValues.s2).sort()).toEqual([...ab.traceKeys].sort());
  });

  it('a scalar channel next to a vector channel keeps its own key; an unwired channel has no sample', () => {
    const m: Model = {
      nodes: [node('sine', 'ps_sine_3phase', { Vpk: 100, f: 50 }), scopeNode('scope', 3)],
      edges: [wire('sine.wt', 'scope.in1'), wire('sine.abc', 'scope.in2')],
    };
    const s = run(m, 2, 1e-3)[1];
    expect(Object.keys(s.perScopeValues.scope).sort()).toEqual(['in1', 'in2[a]', 'in2[b]', 'in2[c]']);
    near(s.perScopeValues.scope['in1'], W * s.time, 'wt');
  });

  it('CSV export writes one column per trace', () => {
    const m: Model = { nodes: [node('sine', 'ps_sine_3phase', {}, { label: 'Sine' }), scopeNode('scope')], edges: [wire('sine.abc', 'scope.in1')] };
    const infos = [getVLabSignalInfo('scope', 0, m.nodes, m.edges)];
    const csv = exportScopeToCSV('x', [{ time: 0, 'in1[a]': 1, 'in1[b]': 2, 'in1[c]': 3 }, { time: 0.1, 'in1[a]': 4, 'in1[c]': 6 }], infos);
    const [header, r1, r2] = csv.split('\n');
    expect(header.split('","').length).toBe(3);
    expect(header).toContain('Sine.abc[a] — three-phase sine voltage [V]');
    expect(header).toContain('Sine.abc[c] — three-phase sine voltage [V]');
    expect(r1).toBe('0.000,1,2,3');
    expect(r2).toBe('0.100,4,,6'); // a missing sample is an empty cell, never 0
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('save / open round trip', () => {
  const roundTrip = (m: Model): Model => {
    const opened = JSON.parse(JSON.stringify({ vlabNodes: m.nodes, vlabEdges: m.edges }));
    const n = normalizeLegacyVLabGraph(opened.vlabNodes, opened.vlabEdges);
    return { nodes: n.nodes as Node[], edges: n.edges as Edge[] };
  };

  it('a vector / composite model survives save and open and simulates to the same values', () => {
    const m: Model = {
      nodes: [node('sine', 'ps_sine_3phase', { Vpk: 100, f: 50 }), node('clarke', 'clarke_transform'), node('inv', 'inv_clarke_transform'), scopeNode('scope', 2)],
      edges: [wire('sine.abc', 'clarke.abc'), wire('clarke.ab0', 'inv.ab0'), wire('inv.abc', 'scope.in1'), wire('clarke.ab0', 'scope.in2')],
    };
    const opened = roundTrip(m);
    expect(opened.edges.map(e => [e.source, e.sourceHandle, e.target, e.targetHandle])).toEqual(m.edges.map(e => [e.source, e.sourceHandle, e.target, e.targetHandle]));
    expect(validateTopology(opened.nodes, opened.edges).diagnostics).toEqual([]);
    const a = run(m, 4, 1e-3); const b = run(opened, 4, 1e-3);
    a.forEach((s, i) => {
      expect(Object.keys(b[i].perScopeValues.scope).sort()).toEqual(Object.keys(s.perScopeValues.scope).sort());
      for (const [k, v] of Object.entries(s.perScopeValues.scope)) near(b[i].perScopeValues.scope[k] as number, v as number, k, 1e-12);
    });
    expect(Object.keys(a[3].perScopeValues.scope).sort()).toEqual(['in1[a]', 'in1[b]', 'in1[c]', 'in2[alpha]', 'in2[beta]', 'in2[0]'].sort());
  });

  it('width / composite metadata comes from the library: an old model whose instance ports carry none still validates against the library', () => {
    // a file saved before the ports became vectors: the node carries its own copy of the old (scalar) port list
    const oldPorts = (type: string) => libraryBlock(type)!.ports.map(({ width: _w, channelNames: _c, composite: _k, ...rest }) => rest);
    const old: Model = {
      nodes: [node('k', 'ps_constant', { value: 5 }), node('clarke', 'clarke_transform', {}, { ports: oldPorts('clarke_transform') }), node('sp', 'phase_splitter', {}, { ports: oldPorts('phase_splitter') }), node('r', 'resistor'), scopeNode('scope')],
      edges: [wire('k.y', 'clarke.abc'), wire('clarke.ab0', 'scope.in1'), wire('r.p', 'sp.abc')],
    };
    const opened = roundTrip(old);
    const diags = validateTopology(opened.nodes, opened.edges).diagnostics;
    expect(diags.find(d => d.code === 'width-mismatch')).toMatchObject({ blockId: 'clarke', portId: 'abc', expectedWidth: 3, actualWidth: 1 });
    expect(diags.find(d => d.code === 'composite-mismatch')).toMatchObject({ expectedWidth: 3, actualWidth: 1 });
    // loading never throws; only simulating reports the diagnostics (as a TopologyValidationError, not a TypeError)
    expect(() => new VLabPhysicsEngine().simulateStep(opened.nodes, opened.edges, null, 1e-3)).toThrow(TopologyValidationError);
  });

  it('the same wiring with metadata-free instance ports of the right width connects', () => {
    const ports = libraryBlock('ps_sine_3phase')!.ports.map(({ width: _w, channelNames: _c, ...rest }) => rest);
    const m: Model = {
      nodes: [node('sine', 'ps_sine_3phase', {}, { ports }), node('clarke', 'clarke_transform'), scopeNode('scope')],
      edges: [wire('sine.abc', 'clarke.abc'), wire('clarke.ab0', 'scope.in1')],
    };
    expect(validateTopology(m.nodes, m.edges).diagnostics).toEqual([]);
  });
});
