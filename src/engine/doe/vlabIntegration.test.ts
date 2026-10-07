import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import { VLabPhysicsEngine } from '../vlab/vlabPhysics';
import { validateTopology } from '../vlab/vlabTopologyValidation';
import { blockEquations } from '../vlab/vlabEquations';
import { serializeVLabError } from '../vlab/vlabDiagnostics';
import { normalizeLegacyVLabGraph } from '../../components/vlab/vlabModelMigration';
import { createVLabDOEBlock, deserializeDOEDeploymentModel } from './integration';
import { evaluateDOEModel } from './modelEvaluator';
import type { DOEDeploymentModel } from './types';

const base = { schemaVersion: 1 as const, trainingRowCount: 12, metrics: { rSquared: 0.99 } };

// y = 2 + 3*x1 - x2 + 0.5*x1*x2 + 0.25*x2^2
const rsm: DOEDeploymentModel = {
  ...base, modelType: 'RSM', factorOrder: ['Speed', 'Feed'], responseName: 'Rough',
  rsm: {
    intercept: 2,
    terms: [
      { name: 'Speed', factors: [0], powers: [1], coeff: 3 },
      { name: 'Feed', factors: [1], powers: [1], coeff: -1 },
      { name: 'Feed²', factors: [1], powers: [2], coeff: 0.25 },
      { name: 'Speed·Feed', factors: [0, 1], powers: [1, 1], coeff: 0.5 },
    ],
  },
};
const gmdh: DOEDeploymentModel = {
  ...base, modelType: 'GMDH', factorOrder: ['Temp', 'Pressure'], responseName: 'Yield',
  gmdh: { polyOrder: 2, layers: [[{ inputs: [0, 1], coeffs: [1.0, 0.5, 0.2, 0.05, 0.02, 0.01] }]] },
};
const taguchi: DOEDeploymentModel = {
  ...base, modelType: 'Taguchi', factorOrder: ['Voltage', 'Time'], responseName: 'Strength',
  taguchi: {
    grandMean: 45.2,
    factorLevels: [
      { factorName: 'Voltage', levels: [{ level: 110, meanY: 42, snr: 32 }, { level: 220, meanY: 48.4, snr: 33 }] },
      { factorName: 'Time', levels: [{ level: 10, meanY: 44.1, snr: 32 }, { level: 20, meanY: 46.3, snr: 33 }] },
    ],
  },
};

const node = (id: string, type: string, params: Record<string, unknown> = {}): Node =>
  ({ id, type: 'default', position: { x: 0, y: 0 }, data: { type, params } } as any);
const edge = (id: string, s: string, sh: string, t: string, th: string): Edge =>
  ({ id, source: s, target: t, sourceHandle: sh, targetHandle: th });

const exportBlock = (m: DOEDeploymentModel, id = 'doe1') => {
  const res: any = createVLabDOEBlock(m, id);
  expect(res.success).not.toBe(false);
  return res;
};

const graph = (doeNode: any, inputs: number[]) => {
  const nodes: Node[] = [...inputs.map((v, i) => node(`c${i + 1}`, 'ps_constant', { value: v })), doeNode, node('scope', 'scope')];
  const edges: Edge[] = [
    ...inputs.map((_, i) => edge(`e${i + 1}`, `c${i + 1}`, 'y_s', doeNode.id, `in${i + 1}_t`)),
    edge('eo', doeNode.id, 'out_s', 'scope', 'in1_t'),
  ];
  return { nodes, edges };
};

const solve = (nodes: Node[], edges: Edge[], steps = 2) => {
  const engine = new VLabPhysicsEngine();
  let state: any = null;
  for (let i = 0; i < steps; i++) state = engine.simulateStep(nodes, edges, state, 0.01);
  const raw = state.scopeValues;
  return typeof raw === 'number' ? raw : Number(raw?.value ?? raw);
};

const relErr = (a: number, b: number) => Math.abs(a - b) / Math.max(1, Math.abs(b));

describe('DOE -> V-Lab integration path', () => {
  it('1. port contract: in1..inN (in) + out (out), physical signal; graph validates without errors', () => {
    for (const m of [rsm, gmdh, taguchi]) {
      const blk = exportBlock(m);
      const ports = blk.data.ports as any[];
      expect(ports.map(p => p.id)).toEqual(['in1', 'in2', 'out']);
      expect(ports.map(p => p.direction)).toEqual(['in', 'in', 'out']);
      expect(ports.every(p => p.domain === 'Physical')).toBe(true);
      const { nodes, edges } = graph(blk, [1, 2]);
      const report = validateTopology(nodes, edges);
      expect(report.diagnostics.filter(d => (d as any).severity !== 'warning')).toEqual([]);
      expect(report.valid).toBe(true);
    }
  });

  it('2. equation selects inputs by port id, independent of port order and of the output entry in `across`', () => {
    const blk = exportBlock(rsm);
    const params = { ...blk.data.params };
    const ctx: any = { parameters: {} };
    const call = (ports: string[], across: number[], branch0: number) =>
      blockEquations['doe_custom']({ across, dAcross: across.map(() => 0), branch: [branch0], dBranch: [0], state: [], dState: [], ctx, params, ports, nodeId: 'doe1' } as any);
    const y = evaluateDOEModel(rsm, [1.5, -2]);
    // canonical order
    expect(call(['in1', 'in2', 'out'], [1.5, -2, 99], y)[0]).toBeCloseTo(0, 12);
    // output port declared first: positional reading would have fed `out` into the model
    expect(call(['out', 'in2', 'in1'], [99, -2, 1.5], y)[0]).toBeCloseTo(0, 12);
    // swapped inputs
    expect(call(['in2', 'out', 'in1'], [-2, 99, 1.5], y)[0]).toBeCloseTo(0, 12);
  });

  it.each([['RSM', rsm, [1.7, -0.6]], ['GMDH', gmdh, [3.1, 0.4]], ['Taguchi', taguchi, [220, 10]]] as const)(
    '3. %s: V-Lab solver output equals evaluateDOEModel to 1e-9',
    (_name, model, inputs) => {
      const { nodes, edges } = graph(exportBlock(model), [...inputs]);
      const out = solve(nodes, edges);
      expect(relErr(out, evaluateDOEModel(model, [...inputs]))).toBeLessThan(1e-9);
    });

  it('4. save/open round trip keeps ports, params and numerics', () => {
    const blk = exportBlock(rsm);
    const stored = JSON.parse(JSON.stringify(blk));
    const dep = stored.data.params.deploymentModel.value;
    expect(typeof dep).toBe('string');
    expect(deserializeDOEDeploymentModel(dep)).toEqual(rsm);
    const { nodes, edges } = graph(stored, [1.7, -0.6]);
    const migrated = normalizeLegacyVLabGraph(nodes as any, edges as any);
    const doe = migrated.nodes.find(n => n.id === 'doe1') as any;
    expect(doe.data.ports.map((p: any) => p.id)).toEqual(['in1', 'in2', 'out']);
    expect(doe.data.params.deploymentModel).toBeDefined();
    const out = solve(migrated.nodes as any, migrated.edges as any);
    expect(relErr(out, evaluateDOEModel(rsm, [1.7, -0.6]))).toBeLessThan(1e-9);
  });

  it('4b. legacy node with General-domain ports is migrated to Physical with directions', () => {
    const blk = exportBlock(rsm);
    const legacy = JSON.parse(JSON.stringify(blk));
    legacy.data.ports = legacy.data.ports.map((p: any) => ({ id: p.id, label: p.label, type: p.type, domain: 'General' }));
    const { nodes } = normalizeLegacyVLabGraph([legacy], []);
    const ports = (nodes[0] as any).data.ports;
    expect(ports.map((p: any) => [p.domain, p.direction])).toEqual([['Physical', 'in'], ['Physical', 'in'], ['Physical', 'out']]);
  });

  it('5. legacy RSM synthesis: term order (linear, squares, interactions) matches statistics Beta layout', () => {
    // k=2 Beta layout from statistics.ts: [b0, b1, b2, b11, b22, b12]
    const beta = [1, 2, 3, 0.5, 0.25, 0.125];
    const legacy: any = { type: 'RSM', modelType: 'RSM', headers: ['A', 'B', 'Y'], Beta: beta, equation: 'Y = ...' };
    const blk = exportBlock(legacy as any);
    const dep = blk.data.deploymentModel as DOEDeploymentModel;
    const [a, b] = [1.3, -0.7];
    const expected = beta[0] + beta[1] * a + beta[2] * b + beta[3] * a * a + beta[4] * b * b + beta[5] * a * b;
    expect(evaluateDOEModel(dep, [a, b])).toBeCloseTo(expected, 12);
    expect(dep.factorOrder).toEqual(['A', 'B']);
  });

  it('7b. a DOE block missing a model port fails loudly in the solver (no silent number)', () => {
    const blk = exportBlock(rsm);
    blk.data.ports = blk.data.ports.filter((p: any) => p.id !== 'in2');
    const { nodes, edges } = graph(blk, [1]);
    let err: any;
    try { solve(nodes, edges); } catch (e) { err = e; }
    expect(err).toBeDefined();
    expect(String(err?.message ?? err)).toMatch(/doe1|non-finite|NaN/i);
  });

  it('8. a DOE fault reaches the serialized solver diagnostic with the DOE code and the node id', () => {
    const blk = exportBlock(rsm);
    blk.data.ports = blk.data.ports.filter((p: any) => p.id !== 'in2');
    const { nodes, edges } = graph(blk, [1]);
    let err: any;
    try { solve(nodes, edges); } catch (e) { err = e; }
    expect(err).toBeDefined();
    const d = serializeVLabError(err);
    expect(d.items.some(i => i.code === 'INSUFFICIENT_INPUTS' && i.blockId === 'doe1')).toBe(true);
    expect(d.message).toMatch(/INSUFFICIENT_INPUTS/);
  });

  it('9. legacy equation (no deployment model) evaluates with the real factor names from params.inputNames or port labels', () => {
    const call = (extra: any, portLabels?: Record<string, string>) => {
      const ctx: any = { parameters: {} };
      const params = { equation: 'Y = 2*Temp + Press', ...extra };
      return blockEquations['doe_custom']({ across: [3, 4, 0], dAcross: [0, 0, 0], branch: [0], dBranch: [0], state: [], dState: [], ctx, params, ports: ['in1', 'in2', 'out'], nodeId: 'leg', portLabels } as any);
    };
    expect(call({}, { in1: 'Temp', in2: 'Press', out: 'Y' })[0]).toBeCloseTo(-(2 * 3 + 4), 12);
    // end to end through the assembler: port labels reach the factory
    const blk = exportBlock(rsm);
    blk.data.params = { equation: { label: 'Eq', value: 'Y = 2*Temp + Press', unit: '' } };
    blk.data.ports = blk.data.ports.map((p: any, i: number) => ({ ...p, label: ['Temp', 'Press', 'Y'][i] }));
    const { nodes, edges } = graph(blk, [3, 4]);
    expect(solve(nodes, edges)).toBeCloseTo(10, 9);
    // positional aliases still work
    const ctx: any = { parameters: {} };
    const r = blockEquations['doe_custom']({ across: [3, 4, 0], dAcross: [0, 0, 0], branch: [0], dBranch: [0], state: [], dState: [], ctx, params: { equation: 'Y = 2*X1 + X2' }, ports: ['in1', 'in2', 'out'], nodeId: 'leg' } as any);
    expect(r[0]).toBeCloseTo(-10, 12);
  });

  it('7. wrong wiring/port count yields NaN residual and a `_fault` diagnostic', () => {
    const blk = exportBlock(rsm);
    const params = { ...blk.data.params };
    const ctx: any = { parameters: {} };
    // only in1 declared though the model needs two factors
    const r = blockEquations['doe_custom']({ across: [1, 0], dAcross: [0, 0], branch: [0], dBranch: [0], state: [], dState: [], ctx, params, ports: ['in1', 'out'], nodeId: 'doe1' } as any);
    expect(Number.isNaN(r[0])).toBe(true);
    expect(ctx.parameters['doe1_fault'].code).toBe('INSUFFICIENT_INPUTS');
    const r2 = blockEquations['doe_custom']({ across: [NaN, 1, 0], dAcross: [0, 0, 0], branch: [0], dBranch: [0], state: [], dState: [], ctx, params, ports: ['in1', 'in2', 'out'], nodeId: 'doe1' } as any);
    expect(Number.isNaN(r2[0])).toBe(true);
    expect(ctx.parameters['doe1_fault'].code).toBe('NON_FINITE_INPUT');
  });
});
