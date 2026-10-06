import { describe, it, expect } from 'vitest';
import type { Node, Edge } from '@xyflow/react';
import { VLAB_LIBRARY } from '../../../utils/vlabLibrary';
import { DAEAssembler } from '../DAEAssembler';
import { blockEquations } from '../vlabEquations';
import { buildDomainFixture } from '../vlabDomainFixture';
import { validateTopology } from '../vlabTopologyValidation';
import { VLabPhysicsEngine } from '../vlabPhysics';
import { DAEStructureError, UNSUPPORTED_BLOCKS, assertStructurallyWellPosed } from '../vlabStructure';
import { libraryDefaults } from './contractInventory';

/** WP-09a: DAE structural mapping (F-025, F-026, F-035, F-036, F-037). */
const quiet = <T,>(fn: () => T): T => {
  const e = console.error, w = console.warn; console.error = () => {}; console.warn = () => {};
  try { return fn(); } finally { console.error = e; console.warn = w; }
};
const CONTAINERS = new Set(['inport', 'Inport', 'outport', 'Outport', 'subsystem', 'Subsystem']);
const blocks = VLAB_LIBRARY.flatMap(d => d.blocks);

describe('every block in its minimal well-posed fixture', () => {
  for (const b of blocks) {
    if (CONTAINERS.has(b.id)) continue;
    const unsupported = UNSUPPORTED_BLOCKS[b.id];
    it(`${b.id}${unsupported ? ' [explicitly unsupported]' : ''}`, () => {
      const { nodes, edges } = buildDomainFixture(b, libraryDefaults(b));
      if (unsupported) {
        const diags = validateTopology(nodes, edges).diagnostics.filter(d => d.code === 'unsupported-block');
        expect(diags).toHaveLength(1);
        expect(diags[0].reason).toContain(unsupported.wp);
        expect(diags[0].reason).toContain(unsupported.missingSpec);
        expect(() => new VLabPhysicsEngine().simulateStep(nodes, edges, null, 1e-3)).toThrow(/not supported by the V-Lab solver/);
        return;
      }
      const sys = quiet(() => new DAEAssembler().assemble(nodes, edges));
      // allocated unknowns == residual rows, for every component (the assembler also throws on a mismatch)
      for (const c of sys.components) {
        const allocated = sys.variableNames.filter(n => n.startsWith(`${c.blockId}_branch_`) || n.startsWith(`${c.blockId}_state_`)).length;
        expect(c.equationCount, `${c.blockId} (${c.blockType})`).toBe(allocated);
      }
      // no unused unknown and full structural rank (throws a diagnostic naming equations/unknowns otherwise)
      expect(() => assertStructurallyWellPosed(sys)).not.toThrow();
      // signal-out ports have branches, signal-in ports do not (single-block network, library direction)
      const alone = quiet(() => new DAEAssembler().assemble([nodes.find(n => n.id === 'dut')!], []));
      for (const p of b.ports) {
        if ((p.domain ?? '').toLowerCase() !== 'physical' || !p.direction) continue;
        const kn = alone.kirchhoffNodes.find(k => k.nodeId === `dut_${p.id}`);
        const driven = !!kn && kn.throughIndices.some(i => alone.variableNames[i].startsWith('dut_branch_'));
        expect(driven, `${b.id}.${p.id} (${p.direction})`).toBe(p.direction === 'out');
      }
    });
  }
});

describe('handles resolve to exact port ids (F-037)', () => {
  const node = (id: string, type: string): Node => ({ id, type: 'default', position: { x: 0, y: 0 }, data: { type } }) as Node;
  const k = (id: string, port: string) => `Across_${id}_${port}`;
  const rootOf = (sys: ReturnType<DAEAssembler['assemble']>, id: string, port: string) =>
    sys.components.find(c => c.blockId === id)!.portNodeMap.get(port);

  it('pmsm_foc ports that really end in _s are not stripped (editor handle <node>-<port>)', () => {
    const nodes = [node('foc', 'pmsm_foc'), node('c1', 'ps_constant'), node('c2', 'ps_constant'), node('c3', 'ps_constant'), node('c4', 'ps_constant')];
    const edges = [
      { id: 'e1', source: 'c1', sourceHandle: 'c1-y', target: 'foc', targetHandle: 'foc-vdc_s' },
      { id: 'e2', source: 'c2', sourceHandle: 'c2-y', target: 'foc', targetHandle: 'foc-iabc_s' },
      { id: 'e3', source: 'c3', sourceHandle: 'c3-y', target: 'foc', targetHandle: 'foc-w_s' },
      { id: 'e4', source: 'c4', sourceHandle: 'c4-y', target: 'foc', targetHandle: 'foc-th_s' },
    ] as Edge[];
    const sys = quiet(() => new DAEAssembler().assemble(nodes, edges));
    const ports = [...sys.components.find(c => c.blockId === 'foc')!.portNodeMap.keys()];
    expect(ports.sort()).toEqual(['g', 'iabc_s', 'ref', 'th_s', 'vdc_s', 'vis', 'w_s']);
    expect(rootOf(sys, 'foc', 'vdc_s')).toBe(rootOf(sys, 'c1', 'y'));
    expect(rootOf(sys, 'foc', 'iabc_s')).toBe(rootOf(sys, 'c2', 'y'));
    expect(rootOf(sys, 'foc', 'w_s')).toBe(rootOf(sys, 'c3', 'y'));
    expect(rootOf(sys, 'foc', 'th_s')).toBe(rootOf(sys, 'c4', 'y'));
    expect(sys.variableNames.some(n => n.startsWith(k('foc', 'vdc')) && !n.startsWith(k('foc', 'vdc_s')))).toBe(false);
  });

  it('legacy <port>_s / <port>_t handles are still stripped when the exact id does not exist, and win only then', () => {
    const nodes = [node('c1', 'ps_constant'), node('g1', 'ps_gain')];
    const edges = [{ id: 'e1', source: 'c1', sourceHandle: 'y_s', target: 'g1', targetHandle: 'u_t' }] as Edge[];
    const sys = quiet(() => new DAEAssembler().assemble(nodes, edges));
    expect(rootOf(sys, 'g1', 'u')).toBe(rootOf(sys, 'c1', 'y'));
    const exact = [{ id: 'e2', source: 'c1', sourceHandle: 'c1-y', target: 'g1', targetHandle: 'g1-u' }] as Edge[];
    const sys2 = quiet(() => new DAEAssembler().assemble(nodes, exact));
    expect(rootOf(sys2, 'g1', 'u')).toBe(rootOf(sys2, 'c1', 'y'));
  });
});

describe('structural diagnostics', () => {
  const withEquation = <T,>(id: string, fn: typeof blockEquations[string], run: () => T): T => {
    const original = blockEquations[id];
    blockEquations[id] = fn;
    try { return run(); } finally { blockEquations[id] = original; }
  };
  const resistorFixture = (): { nodes: Node[]; edges: Edge[] } => ({
    nodes: [
      { id: 'r1', type: 'default', position: { x: 0, y: 0 }, data: { type: 'resistor', params: { R: 10 } } },
      { id: 'v1', type: 'default', position: { x: 0, y: 0 }, data: { type: 'dc_voltage', params: { V: 5 } } },
      { id: 'g', type: 'default', position: { x: 0, y: 0 }, data: { type: 'ground' } },
    ] as Node[],
    edges: [
      { id: 'a', source: 'v1', sourceHandle: 'v1-p', target: 'r1', targetHandle: 'r1-p' },
      { id: 'b', source: 'r1', sourceHandle: 'r1-n', target: 'v1', targetHandle: 'v1-n' },
      { id: 'c', source: 'v1', sourceHandle: 'v1-n', target: 'g', targetHandle: 'g-a' },
    ] as Edge[],
  });

  it('a surplus residual row is a diagnostic, never silently dropped', () => {
    const { nodes, edges } = resistorFixture();
    const orig = blockEquations.resistor;
    const err = withEquation('resistor', (a) => [...orig(a), 0], () => { try { quiet(() => new DAEAssembler().assemble(nodes, edges)); } catch (e) { return e; } });
    expect(err).toBeInstanceOf(DAEStructureError);
    expect((err as DAEStructureError).diagnostic).toMatchObject({ blockId: 'r1', blockType: 'resistor', expectedRows: 1, actualRows: 2, code: 'row-count-mismatch' });
  });

  it('a missing residual row is a diagnostic, never zero-filled', () => {
    const { nodes, edges } = resistorFixture();
    const err = withEquation('resistor', () => [], () => { try { quiet(() => new DAEAssembler().assemble(nodes, edges)); } catch (e) { return e; } });
    expect((err as DAEStructureError).diagnostic).toMatchObject({ blockId: 'r1', expectedRows: 1, actualRows: 0 });
  });

  it('reading a branch index that was never allocated names the missing index', () => {
    const { nodes, edges } = resistorFixture();
    const err = withEquation('resistor', ({ branch }) => [branch[0] - branch[3]], () => { try { quiet(() => new DAEAssembler().assemble(nodes, edges)); } catch (e) { return e; } });
    expect((err as DAEStructureError).diagnostic).toMatchObject({ blockId: 'r1', code: 'unallocated-index-read' });
    expect((err as DAEStructureError).diagnostic.missingIndices).toContain('branch[3]');
  });

  it('an under-determined unknown is reported with its equations and blocks (structural rank)', () => {
    const { nodes, edges } = resistorFixture();
    const sys = withEquation('resistor', () => [0], () => quiet(() => new DAEAssembler().assemble(nodes, edges)));
    let err: unknown;
    try { withEquation('resistor', () => [0], () => assertStructurallyWellPosed(sys)); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(DAEStructureError);
    expect((err as DAEStructureError).diagnostics.length).toBeGreaterThan(0);
    expect((err as DAEStructureError).diagnostics[0].reason).toMatch(/r1|resistor/);
  });

  it('the engine refuses a structurally deficient model before any Newton step', () => {
    const { nodes, edges } = resistorFixture();
    const engine = new VLabPhysicsEngine();
    const err = withEquation('resistor', () => [0], () => { try { quiet(() => engine.simulateStep(nodes, edges, null, 1e-3)); } catch (e) { return e; } });
    expect(err).toBeInstanceOf(DAEStructureError);
  });

  it('a well-posed circuit passes the structural rank check', () => {
    const { nodes, edges } = resistorFixture();
    expect(() => assertStructurallyWellPosed(quiet(() => new DAEAssembler().assemble(nodes, edges)))).not.toThrow();
  });
});

describe('fixed blocks (allocation == equation)', () => {
  const alloc = (id: string) => {
    const b = blocks.find(x => x.id === id)!;
    const sys = quiet(() => new DAEAssembler().assemble([{ id: 'dut', type: 'default', position: { x: 0, y: 0 }, data: { type: id, params: libraryDefaults(b), ports: b.ports } } as Node], []));
    return sys.variableNames.filter(n => n.startsWith('dut_branch_') || n.startsWith('dut_state_')).map(n => n.replace('dut_', ''));
  };
  it('signal branches follow port direction, not port name', () => {
    expect(alloc('switch')).toEqual(['branch_current']);              // `v` is an input
    expect(alloc('gas_flow_source')).toEqual(['branch_mass_flow']);   // `m` is an input
    // `abc` input has no branch; the width-3 `ab0` output allocates one signal branch per channel (WP-09c)
    expect(alloc('clarke_transform')).toEqual(['branch_signal_ab0[0]', 'branch_signal_ab0[1]', 'branch_signal_ab0[2]']);
    expect(alloc('ps_smith_predictor')).toEqual(['branch_signal_u', 'state_y']);
    expect(alloc('hysteresis_ctrl_3ph')).toEqual(['branch_signal_s']);
    expect(alloc('ma_pt_sensor')).toEqual(['branch_signal_p', 'branch_signal_t']);
    expect(alloc('ps_demux_3')).toEqual(['branch_signal_a', 'branch_signal_b', 'branch_signal_c']);
    expect(alloc('im_foc_ctrl')).toEqual(['branch_signal_g', 'branch_signal_vabc', 'branch_signal_vis']);
  });
  it('busbar: one current per terminal, n-1 equalities + a current balance', () => {
    expect(alloc('busbar')).toEqual(['branch_current_1', 'branch_current_2']);
    expect(blockEquations.busbar({ across: [3, 3], dAcross: [0, 0], branch: [2, -2], dBranch: [], state: [], dState: [], ctx: {} as any, params: {}, ports: ['1', '2'], nodeId: 'b' })).toEqual([0, 0]);
  });
  it('fluid_ref has no through variable; fluid_inertance no spurious state; conn_label no rows', () => {
    expect(alloc('fluid_ref')).toEqual([]);
    expect(alloc('fluid_inertance')).toEqual(['branch_mass_flow']);
    expect(alloc('conn_label')).toEqual([]);
    expect(alloc('ps_integrator_gen')).toEqual(['branch_signal_y', 'state_y']);
    // WP-20a: the moving average is an N-sample mean of the committed input history, not a lag state; the RMS keeps Q = int u^2
    expect(alloc('ps_moving_avg')).toEqual(['branch_signal_y']);
    expect(alloc('ps_rms')).toEqual(['branch_signal_y', 'state_Q']);
    expect(alloc('sym_comp_transform')).toEqual([
      'branch_signal_seq[0]', 'branch_signal_seq[1]', 'branch_signal_seq[2]',
      'state_re1', 'state_im1', 'state_re2', 'state_im2', 'state_re0', 'state_im0',
    ]);
  });
  it('unsupported blocks name their missing spec and owner', () => {
    // WP-17 implemented ma_pipe / ma_rot_conv / ma_trans_conv / ma_pt_sensor; what is still unsupported names its owner and spec
    expect(Object.keys(UNSUPPORTED_BLOCKS)).toEqual(expect.arrayContaining(['ma_separator', 'ma_selector']));
    for (const id of ['ma_separator', 'ma_selector']) {
      expect(UNSUPPORTED_BLOCKS[id].wp).toBe('WP-17');
      expect(UNSUPPORTED_BLOCKS[id].missingSpec.length).toBeGreaterThan(30);
    }
  });
});
