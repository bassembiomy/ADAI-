import { afterAll, describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import { VLAB_LIBRARY, type VLabBlock } from '../../../utils/vlabLibrary';
import { getVLabSignalInfo, exportScopeToCSV, formatChannelLabel } from '../../../utils/scopeUtils';
import { normalizeLegacyVLabGraph } from '../../../components/vlab/vlabModelMigration';
import { VLabPhysicsEngine } from '../vlabPhysics';
import { DAEAssembler } from '../DAEAssembler';
import { ImplicitSolver } from '../ImplicitSolver';
import { blockEquations } from '../vlabEquations';
import { buildDomainFixture } from '../vlabDomainFixture';
import { DAEStructureError, UNSUPPORTED_BLOCKS } from '../vlabStructure';
import { BlockEquationError, NonFiniteResidualError } from '../vlabResidualDiagnostics';
import { ScopeReadError, readSolvedVariable, scalarSample } from '../vlabScopeRead';
import { TopologyValidationError } from '../vlabTopologyValidation';
import { SimulationHarness, resolveProbeVariableIndex } from '../whitebox_benchmarks/boundary_generator/SimulationHarness';
import { PORT_QUANTITIES, UNIT_INHERIT } from './portQuantities';

/**
 * WP-09b: scope / probe routing, scalar-only reads, no silent zero / NaN (F-045, F-048, user section 9).
 *  1. every signal-out port has a reviewed quantity + SI unit, committed in the library
 *  2. every signal-out port of every block reaches a scope through VLabPhysicsEngine.simulateStep as a finite value with
 *     the right unit metadata (blocks the solver rejects on purpose are listed with their owner)
 *  3. each output of a multi-output block has its own channel, independent of port / edge / channel order
 *  4. a scope or probe never reads a vector / Frame value as a scalar; it throws
 *  5. a NaN residual or a throwing equation is a diagnostic naming the block, never a zero residual
 *  6. scope channel assignment, labels and units survive the project save / open round trip
 */

const blocks: VLabBlock[] = VLAB_LIBRARY.flatMap(d => d.blocks);
const outPorts = blocks.flatMap(b => b.ports
  .filter(p => p.direction === 'out' && (p.domain ?? '').toLowerCase() === 'physical')
  .map(p => ({ block: b, port: p })));

const quiet = <T>(fn: () => T): T => {
  const e = console.error; const w = console.warn;
  console.error = () => {}; console.warn = () => {};
  try { return fn(); } finally { console.error = e; console.warn = w; }
};

// Blocks that cannot be simulated today. Each is a documented, owned reason; the test asserts the engine still REFUSES them
// (so a block that starts to simulate fails here and must be removed from the list: ratchet).
const NOT_SIMULATED: Record<string, string> = {
  dist_constraint: 'F-012 / WP-19: constraint rows unbalanced in the minimal fixture',
  im_flux_observer: 'F-012 / WP-20: observer collapses the step in the minimal fixture',
  revolute_joint: 'F-045 / WP-19a: equation subtracts Frame vectors as scalars (NaN residual, formerly masked as 0)',
  prismatic_joint: 'F-045 / WP-19a: equation subtracts Frame vectors as scalars (NaN residual, formerly masked as 0)',
  weld_joint: 'F-045 / WP-19a: equation subtracts Frame vectors as scalars (NaN residual, formerly masked as 0)',
};
for (const [id, spec] of Object.entries(UNSUPPORTED_BLOCKS)) NOT_SIMULATED[id] ??= `explicitly unsupported (${spec.wp}): ${spec.missingSpec}`;

const SI_UNITS = new Set(['V', 'A', 'Pa', 'kg/s', 'Wb', 'N', 'rad/s', 'rad', 'N*m', 'm/s', 'm', 'W', 'K', 'kg/m^3', '1', 'deg', UNIT_INHERIT]);

const paramsOf = (b: VLabBlock) => Object.fromEntries(Object.entries(b.params || {}).map(([k, v]) => [k, v.value]));
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

interface ScopeFixtureOptions { reversePorts?: boolean; reverseEdges?: boolean; channelOf?: (i: number) => number; label?: string }

/** The domain fixture of `block`, with the scope rewired so that signal outputs `portIds[i]` feed channel `channelOf(i)+1`. */
function scopeFixture(block: VLabBlock, portIds: string[], opts: ScopeFixtureOptions = {}): { nodes: Node[]; edges: Edge[] } {
  const base = buildDomainFixture(block, paramsOf(block));
  const nodes = clone(base.nodes) as Node[];
  const dut = nodes.find(n => n.id === 'dut')!;
  if (opts.reversePorts) (dut.data as any).ports = [...(dut.data as any).ports].reverse();
  const edges = (clone(base.edges) as Edge[]).filter(e => e.target !== 'diag_scope');
  const n = portIds.length;
  let scope = nodes.find(x => x.id === 'diag_scope');
  if (!scope) { scope = { id: 'diag_scope', type: 'default', position: { x: 400, y: 200 }, data: {} } as Node; nodes.push(scope); }
  scope.data = {
    type: 'scope', label: opts.label ?? 'Diag Scope', params: { numSignals: { value: n } },
    ports: Array.from({ length: n }, (_, i) => ({ id: `in${i + 1}`, pos: 'left', label: `${i + 1}`, domain: 'Physical', direction: 'in' })),
  } as any;
  const channelOf = opts.channelOf ?? ((i: number) => i);
  portIds.forEach((p, i) => edges.push({ id: `e_scope_${p}`, source: 'dut', sourceHandle: `${p}_s`, target: 'diag_scope', targetHandle: `in${channelOf(i) + 1}_t` } as Edge));
  if (opts.reverseEdges) edges.reverse();
  return { nodes, edges };
}

const channelValue = (state: any, channels: number, k: number): number | undefined => {
  const v = state.perScopeValues?.['diag_scope'];
  if (v === undefined) return undefined;
  return channels === 1 && typeof v === 'number' ? v : (typeof v === 'number' ? v : v[`in${k + 1}`]);
};

function simulate(nodes: Node[], edges: Edge[], steps = 2): any {
  const engine = new VLabPhysicsEngine();
  engine.setStepBudget({ maxStepAttempts: 2000, wallClockMs: 3000 });
  let state: any = null;
  quiet(() => { for (let i = 0; i < steps; i++) state = engine.simulateStep(nodes, edges, state, 0.05); });
  return state;
}

const scopeBinding = (nodes: Node[], edges: Edge[]): string[] => {
  const sys = quiet(() => new DAEAssembler().assemble(nodes, edges));
  return (sys.scopeOutputs.get('diag_scope') ?? []).map(i => (i >= 0 ? sys.variableNames[i] : '<unwired>'));
};

// ──────────────────────────────────────────────────────────────────────────
describe('signal-out ports carry a quantity and an SI unit (library metadata)', () => {
  it('every signal-out port has a reviewed entry, and the library equals the table', () => {
    const keys = outPorts.map(o => `${o.block.id}.${o.port.id}`);
    expect(keys.filter(k => !PORT_QUANTITIES[k])).toEqual([]);
    expect(Object.keys(PORT_QUANTITIES).filter(k => !keys.includes(k))).toEqual([]);
    for (const { block, port } of outPorts) {
      const e = PORT_QUANTITIES[`${block.id}.${port.id}`];
      expect(port.quantity, `${block.id}.${port.id} quantity`).toBe(e.quantity);
      expect(port.unit, `${block.id}.${port.id} unit`).toBe(e.unit);
      expect(SI_UNITS.has(port.unit!), `${block.id}.${port.id}: unit "${port.unit}" is not an SI unit`).toBe(true);
    }
  });

  it('only signal outputs carry quantity; inputs and conserving ports never do', () => {
    const wrong = blocks.flatMap(b => b.ports
      .filter(p => p.quantity !== undefined && !(p.direction === 'out' && (p.domain ?? '').toLowerCase() === 'physical'))
      .map(p => `${b.id}.${p.id}`));
    expect(wrong).toEqual([]);
  });

  it('coverage counts', () => {
    const typed = outPorts.filter(o => o.port.unit !== UNIT_INHERIT && !o.port.quantity!.startsWith('unspecified'));
    const inherit = outPorts.filter(o => o.port.unit === UNIT_INHERIT && !o.port.quantity!.startsWith('unspecified'));
    const unspecified = outPorts.filter(o => o.port.quantity!.startsWith('unspecified'));
    // eslint-disable-next-line no-console
    console.log(`signal-out ports ${outPorts.length}: fixed SI unit ${typed.length}, unit follows input ${inherit.length}, unspecified (unsupported blocks) ${unspecified.length}`);
    expect(typed.length + inherit.length + unspecified.length).toBe(outPorts.length);
    expect(outPorts.length).toBeGreaterThan(190);
    expect(unspecified.every(o => NOT_SIMULATED[o.block.id])).toBe(true);
  });

  it('channel label is "<block name>.<port label> - <quantity> [<unit>]"', () => {
    expect(formatChannelLabel('Sensor', 'W', 'angular velocity', 'rad/s')).toBe('Sensor.W — angular velocity [rad/s]');
    expect(formatChannelLabel('Gain', 'Y', 'scaled signal', UNIT_INHERIT)).toBe('Gain.Y — scaled signal [unit of input]');
    expect(formatChannelLabel('B', 'p', undefined, undefined)).toBe('B.p');
  });
});

// ──────────────────────────────────────────────────────────────────────────
describe('every signal-out port reaches a scope through VLabPhysicsEngine.simulateStep', () => {
  for (const { block, port } of outPorts) {
    const key = `${block.id}.${port.id}`;
    const notSimulated = NOT_SIMULATED[block.id];
    it(`${key}${notSimulated ? ' [not simulated: ' + notSimulated.split(':')[0] + ']' : ''}`, () => {
      const { nodes, edges } = scopeFixture(block, [port.id]);
      const info = getVLabSignalInfo('diag_scope', 0, nodes, edges);
      // metadata is reachable from the wiring alone (exact port id, label, quantity, unit)
      expect(info.connected).toBe(true);
      expect(info.portId).toBe(port.id);
      expect(info.quantity).toBe(PORT_QUANTITIES[key].quantity);
      expect(info.unit).toBe(PORT_QUANTITIES[key].unit);
      expect(info.channelLabel).toBe(formatChannelLabel(info.blockLabel, port.label ?? port.id, port.quantity, port.unit));
      expect(info.channelLabel).toContain(port.quantity!);

      let state: any; let error: unknown;
      try { state = simulate(nodes, edges); } catch (e) { error = e; }
      if (notSimulated) {
        expect(error, `${key} now simulates: remove ${block.id} from NOT_SIMULATED`).toBeDefined();
        return;
      }
      expect(error, `${key}: ${(error as Error)?.message}`).toBeUndefined();
      const v = channelValue(state, 1, 0);
      expect(typeof v, `${key} scope sample`).toBe('number');
      expect(Number.isFinite(v as number), `${key} = ${v}`).toBe(true);
    });
  }
});

// ──────────────────────────────────────────────────────────────────────────
describe('multi-output blocks: each output has its own channel, independent of order', () => {
  const byBlock = new Map<string, string[]>();
  for (const { block, port } of outPorts) byBlock.set(block.id, [...(byBlock.get(block.id) ?? []), port.id]);
  const multi = [...byBlock].filter(([id, ports]) => ports.length >= 2 && !NOT_SIMULATED[id]);

  it('there are multi-output blocks to test', () => {
    expect(multi.length).toBeGreaterThanOrEqual(20);
    expect(multi.map(m => m[0])).toEqual(expect.arrayContaining(['rot_motion_sensor', 'trans_motion_sensor', 'ps_sr_flipflop']));
  });

  // a Scope has at most 8 channels: blocks with more outputs are checked in two overlapping groups (first 8, last 8)
  for (const [id, allPorts] of multi) {
    it(`${id} (${allPorts.join(', ')})`, () => {
      const block = blocks.find(b => b.id === id)!;
      for (const ports of allPorts.length <= 8 ? [allPorts] : [allPorts.slice(0, 8), allPorts.slice(-8)]) {
      const n = ports.length;
      // reference: every output on its own single-channel scope
      const single = ports.map(p => {
        const f = scopeFixture(block, [p]);
        return { binding: scopeBinding(f.nodes, f.edges)[0], value: channelValue(simulate(f.nodes, f.edges), 1, 0)! };
      });
      single.forEach((s, i) => expect(Number.isFinite(s.value), `${id}.${ports[i]}`).toBe(true));
      // port k -> channel k; reversed ports + reversed edges + reversed channel assignment
      const variants: ScopeFixtureOptions[] = [
        {},
        { reversePorts: true },
        { reversePorts: true, reverseEdges: true },
        { reverseEdges: true, channelOf: i => n - 1 - i },
        { reversePorts: true, reverseEdges: true, channelOf: i => (i + 1) % n },
      ];
      for (const opts of variants) {
        const channelOf = opts.channelOf ?? ((i: number) => i);
        const f = scopeFixture(block, ports, opts);
        const binding = scopeBinding(f.nodes, f.edges);
        const state = simulate(f.nodes, f.edges);
        ports.forEach((p, i) => {
          const ch = channelOf(i);
          expect(binding[ch], `${id}.${p} -> channel ${ch + 1} binding (${JSON.stringify(opts)})`).toBe(single[i].binding);
          const v = channelValue(state, n, ch);
          expect(v, `${id}.${p} -> channel ${ch + 1} value (${JSON.stringify(opts)})`).toBeCloseTo(single[i].value, 9);
        });
        expect(new Set(binding).size, `${id}: outputs share a variable`).toBe(n);
      }
      }
    });
  }
});

// ──────────────────────────────────────────────────────────────────────────
describe('a scope or probe never reads a vector or a Frame as a scalar', () => {
  const frameModel = (): { nodes: Node[]; edges: Edge[] } => ({
    nodes: [
      { id: 'w', type: 'default', position: { x: 0, y: 0 }, data: { type: 'world_frame' } },
      { id: 'rt', type: 'default', position: { x: 0, y: 0 }, data: { type: 'rigid_transform', params: {} } },
      { id: 'sc', type: 'default', position: { x: 0, y: 0 }, data: { type: 'scope' } },
    ] as Node[],
    edges: [
      { id: 'e1', source: 'w', sourceHandle: 'w_s', target: 'rt', targetHandle: 'b_t' },
      { id: 'e2', source: 'rt', sourceHandle: 'f_s', target: 'sc', targetHandle: 'in1_t' },
    ] as Edge[],
  });

  it('the editor-level rules reject the wire before the solve (WP-07)', () => {
    const { nodes, edges } = frameModel();
    expect(() => new VLabPhysicsEngine().simulateStep(nodes, edges, null, 0.01)).toThrow(TopologyValidationError);
  });

  it('the assembler throws ScopeReadError(frame) if such a wire ever reaches it', () => {
    const { nodes, edges } = frameModel();
    let caught: unknown;
    try { quiet(() => new DAEAssembler().assemble(nodes, edges)); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(ScopeReadError);
    expect((caught as ScopeReadError).diagnostic.code).toBe('frame');
    expect((caught as ScopeReadError).diagnostic.scopeId).toBe('sc');
    expect((caught as ScopeReadError).diagnostic.channel).toBe(1);
  });

  it('the same model with topology validation off is still refused by the engine (not read as [0])', () => {
    const { nodes, edges } = frameModel();
    const engine = new VLabPhysicsEngine();
    engine.setTopologyValidation(false);
    expect(() => quiet(() => engine.simulateStep(nodes, edges, null, 0.01))).toThrow(ScopeReadError);
  });

  it('scalarSample / readSolvedVariable throw for vectors, Frame coordinates, non-finite values and bad indices', () => {
    const ctx = { scopeId: 's', channel: 2 };
    expect(scalarSample(1.5, ctx)).toBe(1.5);
    expect(scalarSample(0, ctx)).toBe(0);
    for (const bad of [[1, 2, 3], new Float64Array(3), [0], NaN, Infinity, undefined, null, '3', { x: 1 }]) {
      expect(() => scalarSample(bad, ctx), String(bad)).toThrow(ScopeReadError);
    }
    expect(() => scalarSample([1, 2, 3], ctx)).toThrow(/vector of 3/);
    const names = ['Across_a_(electrical)', 'Across_f_Px_(frame)', 'Across_g_Rz_(multibodyframe)'];
    const x = [1, 2, 3];
    expect(readSolvedVariable(x, names, 0, ctx)).toBe(1);
    expect(() => readSolvedVariable(x, names, 1, ctx)).toThrow(/Frame coordinate/);
    expect(() => readSolvedVariable(x, names, 2, ctx)).toThrow(ScopeReadError);
    expect(() => readSolvedVariable(x, names, 3, ctx)).toThrow(/outside/);
    expect(() => readSolvedVariable(x, names, -1, ctx)).toThrow(/outside/);
  });

  it('the whitebox probe harness throws instead of reading a missing probe as 0', () => {
    const nodes = [
      { id: 'k', type: 'default', position: { x: 0, y: 0 }, data: { type: 'ps_constant', params: { value: { value: 2, unit: '' } } } },
      { id: 'sc', type: 'default', position: { x: 0, y: 0 }, data: { type: 'scope' } },
    ] as Node[];
    const edges = [{ id: 'e', source: 'k', sourceHandle: 'y_s', target: 'sc', targetHandle: 'in1_t' }] as Edge[];
    const boundary: any = {
      id: 'b', name: 'b', domain: 'signal', nodes, edges, dt: 0.01, totalTime: 0.02,
      excitation: { type: 'constant', sourceNodeId: 'k', amplitude: 1 },
      probes: [{ id: 'p', sourceNodeId: 'k', sourceHandle: 'y_s', variableName: 'y', unit: '1' }],
    };
    const ok = quiet(() => SimulationHarness.runBoundarySimulation(boundary));
    expect(ok.signals.y).toEqual([2, 2]);
    const missing = { ...boundary, probes: [{ id: 'p', sourceNodeId: 'nope', sourceHandle: 'y_s', variableName: 'z', unit: '1' }] };
    expect(() => quiet(() => SimulationHarness.runBoundarySimulation(missing))).toThrow(ScopeReadError);
  });

  it('F-048: probe handles resolve to the EXACT port id (ports that end in _s / _t survive)', () => {
    const node = { id: 'foc', type: 'default', data: { type: 'pmsm_foc' } } as any;
    // vdc_s is a real pmsm_foc port: it must not be stripped to `vdc`
    const names = ['foc_branch_signal_vdc_s', 'foc_branch_signal_vdc', 'foc_branch_signal_g'];
    const probe = (handle: string) => ({ id: 'p', sourceNodeId: 'foc', sourceHandle: handle, variableName: 'v', unit: '' });
    expect(names[resolveProbeVariableIndex([node], probe('vdc_s'), names)]).toBe('foc_branch_signal_vdc_s');
    expect(names[resolveProbeVariableIndex([node], probe('foc-vdc_s'), names)]).toBe('foc_branch_signal_vdc_s');
    // the legacy `<port>_s` suffix is still stripped when the exact id does not exist
    expect(names[resolveProbeVariableIndex([node], probe('g_s'), names)]).toBe('foc_branch_signal_g');
    // a signal output with no branch never falls through to another variable of the block
    expect(() => resolveProbeVariableIndex([node], probe('vis_s'), ['foc_branch_signal_g'])).toThrow(ScopeReadError);
  });
});

// ──────────────────────────────────────────────────────────────────────────
describe('no silent zero: NaN residuals and throwing equations are diagnostics (F-045)', () => {
  const TYPES = ['wp09b_nan_block', 'wp09b_throw_block', 'wp09b_dt_nan_block'] as const;
  let throwCalls = 0;
  (blockEquations as any).wp09b_nan_block = ({ across, branch }: any) => [across[0] - across[1] - branch[0] * NaN];
  (blockEquations as any).wp09b_throw_block = () => { throwCalls++; throw new Error('boom'); };
  // NaN only for step sizes above 2 ms: a step-size problem, recoverable by rejecting the step
  (blockEquations as any).wp09b_dt_nan_block = ({ across, branch, ctx }: any) =>
    [across[0] - across[1] - branch[0] * 1000 + (ctx.dt > 0.002 ? NaN : 0)];
  afterAll(() => { for (const t of TYPES) delete (blockEquations as any)[t]; });

  const twoTerminal = (type: string, withCapacitor = false): { nodes: Node[]; edges: Edge[] } => {
    const ports = [{ id: 'p', pos: 'left', domain: 'Electrical' }, { id: 'n', pos: 'right', domain: 'Electrical' }];
    const nodes = [
      { id: 'src', type: 'default', position: { x: 0, y: 0 }, data: { type: 'dc_voltage', params: { V: { value: 5, unit: 'V' } } } },
      { id: 'dut', type: 'default', position: { x: 0, y: 0 }, data: { type, ports } },
      { id: 'gnd', type: 'default', position: { x: 0, y: 0 }, data: { type: 'ground' } },
      ...(withCapacitor ? [{ id: 'cap', type: 'default', position: { x: 0, y: 0 }, data: { type: 'capacitor', params: { C: { value: 1e-3, unit: 'F' } } } }] : []),
    ] as Node[];
    const e = (id: string, s: string, sh: string, t: string, th: string) => ({ id, source: s, sourceHandle: sh, target: t, targetHandle: th }) as Edge;
    const edges = withCapacitor
      ? [e('e1', 'src', 'p_s', 'dut', 'p_t'), e('e2', 'dut', 'n_s', 'cap', 'p_t'), e('e3', 'cap', 'n_s', 'gnd', 'a_t'), e('e4', 'src', 'n_s', 'gnd', 'a_t')]
      : [e('e1', 'src', 'p_s', 'dut', 'p_t'), e('e2', 'dut', 'n_s', 'gnd', 'a_t'), e('e4', 'src', 'n_s', 'gnd', 'a_t')];
    return { nodes, edges };
  };
  const engineWithoutValidation = () => { const e = new VLabPhysicsEngine(); e.setTopologyValidation(false); return e; };

  it('assembler residuals: a NaN row throws NonFiniteResidualError naming block, type, row and unknown (not 0)', () => {
    const { nodes, edges } = twoTerminal('wp09b_nan_block');
    const sys = quiet(() => new DAEAssembler().assemble(nodes, edges));
    const x = new Array(sys.systemSize).fill(0.5);
    let caught: unknown;
    try { sys.residuals(x, new Array(sys.systemSize).fill(0), { dt: 1e-3, time: 0, parameters: {}, prevStates: x, states: x, stateDerivatives: x, order: 1 } as any); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(NonFiniteResidualError);
    const d = (caught as NonFiniteResidualError).diagnostic;
    expect(d).toMatchObject({ kind: 'non-finite-residual', blockId: 'dut', blockType: 'wp09b_nan_block', rowIndex: 0 });
    expect(Number.isNaN(d.value)).toBe(true);
    expect(d.variable).toBe('dut_branch_current');
    expect((caught as Error).message).toContain('"dut"');
  });

  it('a non-finite input is reported before the equation can mask it with `|| 0`', () => {
    const nodes = [
      { id: 'k', type: 'default', position: { x: 0, y: 0 }, data: { type: 'ps_constant', params: { value: { value: 2, unit: '' } } } },
      { id: 'g', type: 'default', position: { x: 0, y: 0 }, data: { type: 'ps_gain', params: { gain: { value: 3, unit: '' } } } },
      { id: 'sc', type: 'default', position: { x: 0, y: 0 }, data: { type: 'scope' } },
    ] as Node[];
    const edges = [
      { id: 'e1', source: 'k', sourceHandle: 'y_s', target: 'g', targetHandle: 'u_t' },
      { id: 'e2', source: 'g', sourceHandle: 'y_s', target: 'sc', targetHandle: 'in1_t' },
    ] as Edge[];
    const sys = quiet(() => new DAEAssembler().assemble(nodes, edges));
    const ctx: any = { dt: 1e-3, time: 0, parameters: {}, prevStates: new Array(sys.systemSize).fill(0), order: 1 };
    const good = new Array(sys.systemSize).fill(1);
    expect(sys.residuals(good, new Array(sys.systemSize).fill(0), ctx).every(Number.isFinite)).toBe(true);
    const bad = good.slice();
    bad[sys.variableNames.findIndex(n => n.startsWith('Across_') && n.includes('g_u'))] = NaN;
    let caught: unknown;
    try { sys.residuals(bad, new Array(sys.systemSize).fill(0), ctx); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(NonFiniteResidualError);
    expect((caught as NonFiniteResidualError).diagnostics.some(d => d.blockId === 'g' || d.blockType === '' || d.blockId !== '')).toBe(true);
    expect((caught as NonFiniteResidualError).diagnostics.every(d => Number.isNaN(d.value))).toBe(true);
  });

  it('a persistent NaN residual surfaces as a diagnostic from simulateStep, naming the block', () => {
    const { nodes, edges } = twoTerminal('wp09b_nan_block');
    const engine = engineWithoutValidation();
    let caught: unknown;
    try { quiet(() => engine.simulateStep(nodes, edges, null, 0.01)); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(NonFiniteResidualError);
    expect((caught as NonFiniteResidualError).diagnostic).toMatchObject({ blockId: 'dut', blockType: 'wp09b_nan_block' });
  });

  it('an equation that throws is a non-recoverable BlockEquationError (not zeros, not retried)', () => {
    const { nodes, edges } = twoTerminal('wp09b_throw_block');
    const engine = engineWithoutValidation();
    throwCalls = 0;
    let caught: unknown;
    try { quiet(() => engine.simulateStep(nodes, edges, null, 0.01)); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(BlockEquationError);
    expect((caught as BlockEquationError).diagnostic).toMatchObject({ kind: 'equation-threw', blockId: 'dut', blockType: 'wp09b_throw_block', error: 'boom' });
    expect(throwCalls).toBeLessThan(20);
  });

  it('a NaN that depends on the step size rejects the step and halves h, then converges to a finite state', () => {
    const { nodes, edges } = twoTerminal('wp09b_dt_nan_block', true);
    const state = quiet(() => engineWithoutValidation().simulateStep(nodes, edges, null, 0.01));
    expect(state.rejectedSteps).toBeGreaterThan(0);
    expect(state.x.every((v: number) => Number.isFinite(v))).toBe(true);
    // 5 V source -> 1 kOhm -> 1 mF: after 10 ms the capacitor has charged a little, the loop is not stuck at the initial 0
    expect(state.x.some((v: number) => Math.abs(v) > 1)).toBe(true);
  });

  it('ImplicitSolver: a non-finite trial is a failed iterate (damped), not an error or a zero', () => {
    // f(x) = sqrt(x) - 1; Newton from x = 9 overshoots to x = -3 (NaN) and must back off to x = 3, then converge to 1
    const solver = new ImplicitSolver();
    const x = solver.solve(v => [Math.sqrt(v[0]) - 1], [9], { dt: 1, time: 0, parameters: {}, prevStates: [9], states: [9], stateDerivatives: [0] } as any);
    expect(x[0]).toBeCloseTo(1, 6);
  });

  it('ImplicitSolver: a non-finite residual at the base point throws NonFiniteResidualError', () => {
    const ctx = { dt: 1, time: 0, parameters: {}, prevStates: [0], states: [0], stateDerivatives: [0] } as any;
    expect(() => new ImplicitSolver().solve(() => [NaN], [0], ctx)).toThrow(NonFiniteResidualError);
    expect(() => new ImplicitSolver().solve(() => [Math.sqrt(-1)], [1], ctx)).toThrow(NonFiniteResidualError);
    // every damped trial non-finite: report it, do not take a blind 0.1 step
    expect(() => new ImplicitSolver().solve(v => [v[0] === 1 ? 1 : NaN], [1], ctx)).toThrow(NonFiniteResidualError);
  });

  it('catalog: a block whose equation is NaN at the nominal point is a contract failure (finite-residual), never a pass', async () => {
    const { CHECK_IDS } = await import('./contractChecks');
    expect(CHECK_IDS).toContain('finite-residual');
    const { CONTRACT_EXPECTED_FAILURES } = await import('./contractExpectedFailures');
    for (const id of ['revolute_joint', 'prismatic_joint', 'weld_joint']) {
      expect(CONTRACT_EXPECTED_FAILURES[id]?.['finite-residual'], id).toBe('WP-19a');
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
describe('scope channels survive the project save / open round trip', () => {
  const build = (legacyInstancePorts: boolean) => {
    const block = blocks.find(b => b.id === 'rot_motion_sensor')!;
    const f = scopeFixture(block, ['a', 'w'], { label: 'Shaft Scope' }); // channel 1 = angle, channel 2 = angular velocity
    const dut = f.nodes.find(n => n.id === 'dut')!;
    (dut.data as any).label = 'Shaft Sensor';
    if (legacyInstancePorts) {
      // a model saved before WP-09b: instance ports carry no quantity / unit
      (dut.data as any).ports = (dut.data as any).ports.map(({ quantity: _q, unit: _u, ...rest }: any) => rest);
    }
    return f;
  };
  const describeChannels = (nodes: Node[], edges: Edge[]) =>
    [0, 1].map(i => { const s = getVLabSignalInfo('diag_scope', i, nodes, edges); return { portId: s.portId, label: s.channelLabel, quantity: s.quantity, unit: s.unit, connected: s.connected }; });
  // the exact shape App.tsx writes into the project (projectFiles['vlab.json'] = { vlabNodes, vlabEdges }) and reads back
  const roundTrip = (nodes: Node[], edges: Edge[]) => {
    const saved = JSON.stringify({ vlabNodes: nodes, vlabEdges: edges }, null, 2);
    const opened = JSON.parse(saved);
    return normalizeLegacyVLabGraph(opened.vlabNodes, opened.vlabEdges) as { nodes: Node[]; edges: Edge[] };
  };

  for (const legacy of [false, true]) {
    it(`assignment, labels, units and values survive (${legacy ? 'model saved without port metadata' : 'current model'})`, () => {
      const { nodes, edges } = build(legacy);
      const before = describeChannels(nodes, edges);
      expect(before).toEqual([
        { portId: 'a', label: 'Shaft Sensor.A — angle [rad]', quantity: 'angle', unit: 'rad', connected: true },
        { portId: 'w', label: 'Shaft Sensor.W — angular velocity [rad/s]', quantity: 'angular velocity', unit: 'rad/s', connected: true },
      ]);
      const valuesBefore = simulate(nodes, edges).perScopeValues.diag_scope;

      const opened = roundTrip(nodes, edges);
      expect(describeChannels(opened.nodes, opened.edges)).toEqual(before);
      const scope = opened.nodes.find(n => n.id === 'diag_scope')!;
      expect((scope.data as any).params.numSignals.value).toBe(2);
      expect((scope.data as any).label).toBe('Shaft Scope');
      expect((scope.data as any).ports.map((p: any) => p.id)).toEqual(['in1', 'in2']);
      expect(opened.edges.map(e => [e.source, e.sourceHandle, e.target, e.targetHandle]).sort())
        .toEqual(edges.map(e => [e.source, e.sourceHandle, e.target, e.targetHandle]).sort());
      expect(scopeBinding(opened.nodes, opened.edges)).toEqual(scopeBinding(nodes, edges));
      const valuesAfter = simulate(opened.nodes, opened.edges).perScopeValues.diag_scope;
      expect(valuesAfter.in1).toBeCloseTo(valuesBefore.in1, 12);
      expect(valuesAfter.in2).toBeCloseTo(valuesBefore.in2, 12);
      // a second save of the opened model is byte-identical (idempotent)
      const again = roundTrip(opened.nodes, opened.edges);
      expect(JSON.stringify(again)).toBe(JSON.stringify(opened));
    });
  }

  it('the CSV export header carries the channel label with quantity and unit; a missing sample is an empty cell', () => {
    const { nodes, edges } = build(false);
    const infos = [0, 1].map(i => getVLabSignalInfo('diag_scope', i, nodes, edges));
    const csv = exportScopeToCSV('x', [{ time: 0, in1: 1 }, { time: 0.1, in1: 2, in2: 3 }], infos);
    const [header, row1, row2] = csv.split('\n');
    expect(header).toBe('Time (s),"Shaft Sensor.A — angle [rad]","Shaft Sensor.W — angular velocity [rad/s]"');
    expect(row1).toBe('0.000,1,');
    expect(row2).toBe('0.100,2,3');
  });

  it('an unwired channel has no sample (left out), not 0', () => {
    const block = blocks.find(b => b.id === 'rot_motion_sensor')!;
    const f = scopeFixture(block, ['w'], { channelOf: () => 1 }); // only channel 2 is wired
    f.nodes.find(n => n.id === 'diag_scope')!.data = { ...(f.nodes.find(n => n.id === 'diag_scope')!.data as any), params: { numSignals: { value: 2 } } };
    const state = simulate(f.nodes, f.edges);
    const v = state.perScopeValues.diag_scope;
    expect(Number.isFinite(v.in2)).toBe(true);
    expect('in1' in v).toBe(false);
    expect(getVLabSignalInfo('diag_scope', 0, f.nodes, f.edges).connected).toBe(false);
  });
});

// keep imports used even when a describe is filtered
void DAEStructureError;
