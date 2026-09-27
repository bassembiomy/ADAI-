import { describe, expect, it } from 'vitest';
import { Edge, Node } from '@xyflow/react';
import { VLabPhysicsEngine } from './vlabPhysics';
import { VLAB_LIBRARY } from '../../utils/vlabLibrary';
import { createVLabDOEBlock } from '../doe/integration';
import { DOEDeploymentModel } from '../doe/types';

type Model = { nodes: Node[]; edges: Edge[]; dt: number; steps: number };

const node = (id: string, type: string, params: Record<string, unknown> = {}): Node =>
  ({ id, type: 'default', position: { x: 0, y: 0 }, data: { type, params } } as any);

const edge = (id: string, source: string, sourceHandle: string, target: string, targetHandle: string): Edge =>
  ({ id, source, target, sourceHandle, targetHandle });

const scalarScopeValue = (value: unknown): number => {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && 'value' in value) return Number((value as any).value);
  throw new Error(`Scope did not return a scalar reading: ${JSON.stringify(value)}`);
};

const run = ({ nodes, edges, dt, steps }: Model) => {
  const engine = new VLabPhysicsEngine();
  let state: any = null;
  const readings: number[] = [];
  for (let index = 0; index < steps; index++) {
    state = engine.simulateStep(nodes, edges, state, dt);
    const reading = scalarScopeValue(state.scopeValues);
    expect(Number.isFinite(reading)).toBe(true);
    expect(state.x.every(Number.isFinite)).toBe(true);
    readings.push(reading);
  }
  return { state, readings };
};

/**
 * Connected integration models exercise the same DAE assembly path used by the
 * workspace: source -> physical network -> sensor -> physical signal -> scope.
 * Unlike an isolated-block smoke test, a non-zero scope reading proves both
 * conservation equations and scope propagation are active.
 */
describe('V-Lab connected reference models', () => {
  it('measures an AC resistor load with voltage sensor and scope', () => {
    const result = run({
      dt: 0.0025, steps: 8,
      nodes: [
        node('source', 'ac_voltage', { Vpk: 100, f: 50 }),
        node('load', 'resistor', { R: 100 }),
        node('ground', 'ground'),
        node('sensor', 'v_sensor'),
        node('scope', 'scope'),
      ],
      edges: [
        edge('source-load', 'source', 'p_s', 'load', 'p_t'),
        edge('load-ground', 'load', 'n_s', 'ground', 'a_t'),
        edge('source-ground', 'source', 'n_s', 'ground', 'a_t'),
        edge('load-sensor', 'load', 'p_s', 'sensor', 'p_t'),
        edge('sensor-ground', 'sensor', 'n_s', 'ground', 'a_t'),
        edge('sensor-scope', 'sensor', 'v_s', 'scope', 'in1_t'),
      ],
    });

    // At quarter periods the sensor must show the source peak and change sign.
    expect(Math.max(...result.readings.map(Math.abs))).toBeCloseTo(100, 1);
    expect(result.readings.some(value => value > 1)).toBe(true);
    expect(result.readings.some(value => value < -1)).toBe(true);
  });

  it('measures a thermal source through a conductive path', () => {
    const result = run({
      dt: 0.01, steps: 3,
      nodes: [
        node('source', 'temp_src', { T: 350 }),
        node('link', 'conductive_heat', { k: 2 }),
        node('reference', 'thermal_ref'),
        node('sensor', 'temp_sensor'),
        node('scope', 'scope'),
      ],
      edges: [
        edge('source-link', 'source', 'a_s', 'link', 'a_t'),
        edge('link-reference', 'link', 'b_s', 'reference', 'a_t'),
        edge('source-sensor', 'source', 'a_s', 'sensor', 'a_t'),
        edge('sensor-reference', 'sensor', 'b_s', 'reference', 'a_t'),
        edge('sensor-scope', 'sensor', 't_s', 'scope', 'in1_t'),
      ],
    });
    expect(result.readings.at(-1)).toBeCloseTo(350 - 293.15, 6);
  });

  it('propagates a physical signal through a gain block to the scope', () => {
    const result = run({
      dt: 0.01, steps: 2,
      nodes: [node('constant', 'ps_constant', { value: 4 }), node('gain', 'ps_gain', { gain: 2.5 }), node('scope', 'scope')],
      edges: [
        edge('constant-gain', 'constant', 'y_s', 'gain', 'u_t'),
        edge('gain-scope', 'gain', 'y_s', 'scope', 'in1_t'),
      ],
    });
    expect(result.readings.at(-1)).toBeCloseTo(10, 6);
  });

  it('propagates a signal through a subsystem containing a gain block', () => {
    const result = run({
      dt: 0.01, steps: 2,
      nodes: [
        node('constant', 'ps_constant', { value: 4 }),
        { id: 'sub', type: 'default', position: { x: 0, y: 0 }, data: { type: 'subsystem', params: {} } } as any,
        { id: 'inp', type: 'default', position: { x: 0, y: 0 }, data: { type: 'inport', params: { name: 'In1', port_index: 1 }, parentId: 'sub' } } as any,
        { id: 'gain', type: 'default', position: { x: 0, y: 0 }, data: { type: 'ps_gain', params: { gain: 2.5 }, parentId: 'sub' } } as any,
        { id: 'outp', type: 'default', position: { x: 0, y: 0 }, data: { type: 'outport', params: { name: 'Out1', port_index: 1 }, parentId: 'sub' } } as any,
        node('scope', 'scope'),
      ],
      edges: [
        edge('constant-sub', 'constant', 'y_s', 'sub', 'sub-inp'),
        edge('sub-scope', 'sub', 'sub-outp', 'scope', 'in1_t'),
        edge('inp-gain', 'inp', 'out_s', 'gain', 'u_t'),
        edge('gain-outp', 'gain', 'y_s', 'outp', 'in_t'),
      ],
    });
    expect(result.readings.at(-1)).toBeCloseTo(10, 6);
  });

  it('propagates a signal through nested subsystems (multiple sublayers)', () => {
    const result = run({
      dt: 0.01, steps: 2,
      nodes: [
        node('constant', 'ps_constant', { value: 5 }),
        // Subsystem 1 (parent of sub2)
        { id: 'sub1', type: 'default', position: { x: 0, y: 0 }, data: { type: 'subsystem', params: {} } } as any,
        { id: 'inp1', type: 'default', position: { x: 0, y: 0 }, data: { type: 'inport', params: { name: 'In1', port_index: 1 }, parentId: 'sub1' } } as any,
        { id: 'outp1', type: 'default', position: { x: 0, y: 0 }, data: { type: 'outport', params: { name: 'Out1', port_index: 1 }, parentId: 'sub1' } } as any,
        // Subsystem 2 (nested inside sub1)
        { id: 'sub2', type: 'default', position: { x: 0, y: 0 }, data: { type: 'subsystem', params: {}, parentId: 'sub1' } } as any,
        { id: 'inp2', type: 'default', position: { x: 0, y: 0 }, data: { type: 'inport', params: { name: 'In1', port_index: 1 }, parentId: 'sub2' } } as any,
        { id: 'gain', type: 'default', position: { x: 0, y: 0 }, data: { type: 'ps_gain', params: { gain: 3.0 }, parentId: 'sub2' } } as any,
        { id: 'outp2', type: 'default', position: { x: 0, y: 0 }, data: { type: 'outport', params: { name: 'Out1', port_index: 1 }, parentId: 'sub2' } } as any,
        node('scope', 'scope'),
      ],
      edges: [
        // Constant to sub1
        edge('constant-sub1', 'constant', 'y_s', 'sub1', 'sub1-inp1'),
        // Inside sub1: inp1 to sub2
        edge('inp1-sub2', 'inp1', 'out_s', 'sub2', 'sub2-inp2'),
        // Inside sub2: inp2 to gain to outp2
        edge('inp2-gain', 'inp2', 'out_s', 'gain', 'u_t'),
        edge('gain-outp2', 'gain', 'y_s', 'outp2', 'in_t'),
        // Inside sub1: sub2 to outp1
        edge('sub2-outp1', 'sub2', 'sub2-outp2', 'outp1', 'in_t'),
        // sub1 to scope
        edge('sub1-scope', 'sub1', 'sub1-outp1', 'scope', 'in1_t'),
      ],
    });
    expect(result.readings.at(-1)).toBeCloseTo(15, 6);
  });

  it('propagates signals through a subsystem with multiple inports and outports', () => {
    const result = run({
      dt: 0.01, steps: 2,
      nodes: [
        node('constant1', 'ps_constant', { value: 3 }),
        node('constant2', 'ps_constant', { value: 7 }),
        { id: 'sub', type: 'default', position: { x: 0, y: 0 }, data: { type: 'subsystem', params: {} } } as any,
        { id: 'inp1', type: 'default', position: { x: 0, y: 0 }, data: { type: 'inport', params: { name: 'In1', port_index: 1 }, parentId: 'sub' } } as any,
        { id: 'inp2', type: 'default', position: { x: 0, y: 0 }, data: { type: 'inport', params: { name: 'In2', port_index: 2 }, parentId: 'sub' } } as any,
        { id: 'add', type: 'default', position: { x: 0, y: 0 }, data: { type: 'ps_add', params: {}, parentId: 'sub' } } as any,
        { id: 'outp1', type: 'default', position: { x: 0, y: 0 }, data: { type: 'outport', params: { name: 'Out1', port_index: 1 }, parentId: 'sub' } } as any,
        node('scope', 'scope'),
      ],
      edges: [
        edge('constant1-sub', 'constant1', 'y_s', 'sub', 'sub-inp1'),
        edge('constant2-sub', 'constant2', 'y_s', 'sub', 'sub-inp2'),
        edge('inp1-add', 'inp1', 'out_s', 'add', 'u1_t'),
        edge('inp2-add', 'inp2', 'out_s', 'add', 'u2_t'),
        edge('add-outp1', 'add', 'y_s', 'outp1', 'in_t'),
        edge('sub-scope', 'sub', 'sub-outp1', 'scope', 'in1_t'),
      ],
    });
    expect(result.readings.at(-1)).toBeCloseTo(10, 6);
  });

  it('routes distinct signals to separate scopes on the same model', () => {
    // Two scopes: one reads voltage, the other reads current
    const engine = new VLabPhysicsEngine();
    const testNodes: Node[] = [
      node('source', 'ac_voltage', { Vpk: 100, f: 50 }),
      node('load', 'resistor', { R: 50 }),
      node('ground', 'ground'),
      node('v_sensor', 'v_sensor'),
      node('i_sensor', 'i_sensor'),
      node('scope_v', 'scope'),
      node('scope_i', 'scope'),
    ];
    const testEdges: Edge[] = [
      // source -> load -> ground
      edge('source-isensor', 'source', 'p_s', 'i_sensor', 'p_t'),
      edge('isensor-load', 'i_sensor', 'n_s', 'load', 'p_t'),
      edge('load-ground', 'load', 'n_s', 'ground', 'a_t'),
      edge('source-ground', 'source', 'n_s', 'ground', 'a_t'),
      // voltage sensor across load
      edge('load-vsensor-p', 'load', 'p_s', 'v_sensor', 'p_t'),
      edge('vsensor-ground', 'v_sensor', 'n_s', 'ground', 'a_t'),
      edge('vsensor-scope', 'v_sensor', 'v_s', 'scope_v', 'in1_t'),
      // current sensor to current scope
      edge('isensor-scope', 'i_sensor', 'i_s', 'scope_i', 'in1_t'),
    ];

    let state: any = null;
    for (let i = 0; i < 8; i++) {
      state = engine.simulateStep(testNodes, testEdges, state, 0.0025);
    }

    // perScopeValues must exist and have entries for both scopes
    expect(state.perScopeValues).toBeDefined();
    expect(state.perScopeValues['scope_v']).toBeDefined();
    expect(state.perScopeValues['scope_i']).toBeDefined();

    // The two scopes must read DIFFERENT values (voltage vs current)
    const vReading = typeof state.perScopeValues['scope_v'] === 'number'
      ? state.perScopeValues['scope_v']
      : Number(state.perScopeValues['scope_v']?.value ?? state.perScopeValues['scope_v']);
    const iReading = typeof state.perScopeValues['scope_i'] === 'number'
      ? state.perScopeValues['scope_i']
      : Number(state.perScopeValues['scope_i']?.value ?? state.perScopeValues['scope_i']);

    expect(Number.isFinite(vReading)).toBe(true);
    expect(Number.isFinite(iReading)).toBe(true);
    expect(Math.abs(vReading)).toBeGreaterThan(1);
    expect(Math.abs(iReading)).toBeGreaterThan(0.01);
    // V ≈ 100 * sin(ωt), I ≈ V / 50 -> V and I are quantitatively different numbers
    expect(Math.abs(vReading)).not.toBeCloseTo(Math.abs(iReading), 0.5);
  });

  it('evaluates a canonical DOE model inside a connected V-Lab simulation network', () => {
    const rsmModel: DOEDeploymentModel = {
      schemaVersion: 1,
      modelType: 'RSM',
      responseName: 'Yield',
      factorOrder: ['X1', 'X2'],
      trainingRowCount: 10,
      metrics: { rSquared: 0.99, adjustedRSquared: 0.98, rmse: 0.05, fStatistic: 100, pValue: 0.0001 },
      rsm: {
        intercept: 10,
        terms: [
          { name: 'X1', factors: [0], powers: [1], coeff: 2 },
          { name: 'X2', factors: [1], powers: [1], coeff: 3 },
        ],
      },
    };

    const exportRes = createVLabDOEBlock(rsmModel, 'doe1');
    expect('success' in exportRes && (exportRes as any).success === false).toBe(false);
    const doeNode = exportRes as any;

    // Feed X1 = 4, X2 = 5 into doe1 -> Expected output = 10 + 2*4 + 3*5 = 33
    const result = run({
      dt: 0.01,
      steps: 2,
      nodes: [
        node('const1', 'ps_constant', { value: 4 }),
        node('const2', 'ps_constant', { value: 5 }),
        doeNode,
        node('scope', 'scope'),
      ],
      edges: [
        edge('c1-doe', 'const1', 'y_s', 'doe1', 'in1_t'),
        edge('c2-doe', 'const2', 'y_s', 'doe1', 'in2_t'),
        edge('doe-scope', 'doe1', 'out_s', 'scope', 'in1_t'),
      ],
    });

    expect(result.readings.at(-1)).toBeCloseTo(33, 6);
  });

  it('keeps the catalog testable: every library block is assigned to a connected-model family', () => {
    const families = new Set([
      'Electrical', 'Gas', 'Magnetic', 'Mechanical', 'Fluid', 'Physical', 'Thermal',
      'Consumer Appliances', 'Microwave & Cooking', 'Utilities', 'Fluid / Steam', 'DOE Models',
      'Isothermal Liquid',
    ]);
    const unclassified = VLAB_LIBRARY.flatMap(domain => domain.blocks)
      .filter(block => !families.has(domainForBlock(block.id)))
      .map(block => block.id);
    expect(unclassified).toEqual([]);
  });
});

function domainForBlock(id: string): string {
  const domain = VLAB_LIBRARY.find(candidate => candidate.blocks.some(block => block.id === id))?.type;
  if (domain) return domain;
  return 'Utilities';
}
