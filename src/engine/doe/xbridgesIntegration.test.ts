import { describe, it, expect } from 'vitest';
import { createXBridgesDOEBlock } from './integration';
import { evaluateDOEModel } from './modelEvaluator';
import { BLOCK_LIBRARY } from '../xbridges/BlockDefinitions';
import { XbridgesEngine } from '../xbridges/XbridgesEngine';
import { Solvers } from '../xbridges/Solvers';
import type { DOEDeploymentModel, DOEModelResult } from './types';

const base = (modelType: any, factorOrder: string[], extra: any): DOEDeploymentModel => ({
  schemaVersion: 1,
  modelType,
  factorOrder,
  responseName: 'Y',
  trainingRowCount: 10,
  metrics: { rSquared: 0.95 },
  ...extra
});

const rsm = base('RSM', ['x1', 'x2'], {
  rsm: {
    intercept: 2,
    terms: [
      { name: 'x1', factors: [0], powers: [1], coeff: 3 },
      { name: 'x2', factors: [1], powers: [1], coeff: -1 },
      { name: 'x1*x2', factors: [0, 1], powers: [1, 1], coeff: 0.5 }
    ]
  }
});

const gmdh = (polyOrder: 2 | 3) => base('GMDH', ['a', 'b', 'c'], {
  gmdh: {
    polyOrder,
    layers: [
      [
        { inputs: [0, 1], coeffs: [0.1, 0.9, -0.4, 0.03, 0.02, 0.07, 0.011, -0.013, 0.005, 0.008] },
        { inputs: [1, 2], coeffs: [-0.2, 0.3, 0.6, -0.04, 0.05, 0.09, 0.012, 0.014, -0.006, 0.007] }
      ],
      [{ inputs: [0, 1], coeffs: [0.5, 1.1, 0.7, 0.01, -0.02, 0.03, 0.004, 0.002, -0.003, 0.006] }]
    ]
  }
});

const taguchi = base('Taguchi', ['v', 't'], {
  taguchi: {
    grandMean: 45.2,
    factorLevels: [
      { factorName: 'v', levels: [{ level: 110, meanY: 42, snr: 1 }, { level: 220, meanY: 48.4, snr: 2 }] },
      { factorName: 't', levels: [{ level: 10, meanY: 44.1, snr: 1 }, { level: 20, meanY: 46.3, snr: 2 }] }
    ]
  }
});

const toResult = (d: DOEDeploymentModel, equation?: string): DOEModelResult => ({
  modelType: d.modelType,
  factorNames: d.factorOrder,
  responseName: d.responseName,
  equation: equation ?? `Y = f(${d.factorOrder.join(',')})`,
  diagnostics: [],
  deployment: d
} as any);

function exportNode(d: DOEDeploymentModel, id = 'doe1', equation?: string) {
  const n: any = createXBridgesDOEBlock(toResult(d, equation), id);
  expect(n.data).toBeDefined();
  return n;
}

/** Build a runnable model from stored nodes the way XbridgesWorkspace does (BLOCK_LIBRARY rebuild). */
function workspaceBlock(node: any) {
  const d = node.data;
  const fresh = BLOCK_LIBRARY[d.type](d.id, { ...d.params });
  return { ...fresh, id: d.id, state: fresh.state, params: { ...d.params, ...fresh.params } };
}

function runModel(nodeData: any, inputs: number[], opts: { reverseEdges?: boolean; mode?: 'workspace' | 'engine' } = {}) {
  const doeBlock = opts.mode === 'engine'
    ? { id: nodeData.id, type: nodeData.type, params: nodeData.params, inputs: nodeData.inputs, outputs: nodeData.outputs }
    : workspaceBlock({ data: nodeData });
  const consts = inputs.map((v, i) => ({
    id: `c${i + 1}`, type: 'CONSTANT', params: { value: v }, inputs: [],
    outputs: [{ id: 'out', name: 'out', type: 'auto', direction: 'output', value: v }]
  }));
  const sink = {
    id: 'scope1', type: 'Scope', params: { numSignals: 1, bufferSize: 100 },
    inputs: [{ id: 'in1', name: 'In 1', type: 'auto', direction: 'input' }], outputs: []
  };
  let conns = inputs.map((_, i) => ({ sourceBlock: `c${i + 1}`, sourcePort: 'out', targetBlock: nodeData.id, targetPort: `in${i + 1}` }));
  if (opts.reverseEdges) conns = [...conns].reverse();
  conns.push({ sourceBlock: nodeData.id, sourcePort: 'out', targetBlock: 'scope1', targetPort: 'in1' });
  const engine = new XbridgesEngine({ blocks: [sink, doeBlock, ...consts.reverse()], connections: conns } as any);
  Solvers.runFixedStep(engine, { solver: 'ode4', startTime: 0, stopTime: 0.02, fixedStep: 0.01 } as any);
  const y = engine.getSignalValue(nodeData.id, 'out');
  return { y: Array.isArray(y) ? y[0] : y, engine };
}

const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(1, Math.abs(b));

describe('DOE -> X-Bridges integration', () => {
  it('RSM equation y = 2 + 3x1 - x2 + 0.5 x1 x2 evaluates end to end in the real engine', () => {
    const node = exportNode(rsm, 'doe1', 'Y = 2 + 3*x1 - x2 + 0.5*x1*x2');
    const { y } = runModel(node.data, [1.5, -2]);
    expect(rel(y, 2 + 3 * 1.5 + 2 + 0.5 * 1.5 * -2)).toBeLessThan(1e-9);
    expect(rel(y, evaluateDOEModel(rsm, [1.5, -2]))).toBeLessThan(1e-9);
  });

  it.each([
    ['GMDH order 2', gmdh(2), [0.7, -1.3, 2.1]],
    ['GMDH order 3', gmdh(3), [0.7, -1.3, 2.1]],
    ['Taguchi', taguchi, [200, 12]]
  ] as const)('%s output equals evaluateDOEModel', (_n, dep, ins) => {
    const node = exportNode(dep as any);
    const { y } = runModel(node.data, [...ins]);
    expect(rel(y, evaluateDOEModel(dep as any, [...ins]))).toBeLessThan(1e-9);
  });

  it('ports are identical (id/order) to the exported node and inputs follow port id, not edge insertion order', () => {
    const node = exportNode(gmdh(3));
    const block = workspaceBlock(node);
    expect(block.inputs.map((p: any) => p.id)).toEqual(node.data.inputs.map((p: any) => p.id));
    expect(block.inputs.map((p: any) => p.name)).toEqual(node.data.inputs.map((p: any) => p.name));
    expect(block.outputs.map((p: any) => p.id)).toEqual(['out']);
    const ins = [0.7, -1.3, 2.1];
    const fwd = runModel(node.data, ins).y;
    const rev = runModel(node.data, ins, { reverseEdges: true }).y;
    expect(rev).toBe(fwd);
    expect(rel(rev, evaluateDOEModel(gmdh(3), ins))).toBeLessThan(1e-9);
  });

  it('engine-side rehydration of a raw stored node (no execute, wrapper params) matches workspace path', () => {
    for (const dep of [rsm, gmdh(2), gmdh(3), taguchi]) {
      const node = exportNode(dep);
      const ins = dep.factorOrder.map((_, i) => 1.1 + i * 0.9);
      const a = runModel(node.data, ins, { mode: 'engine' }).y;
      expect(rel(a, evaluateDOEModel(dep, ins))).toBeLessThan(1e-9);
    }
  });

  it('save/open round trip (JSON stringify/parse) gives the same output', () => {
    for (const dep of [rsm, gmdh(3), taguchi]) {
      const node = exportNode(dep);
      const reopened = JSON.parse(JSON.stringify(node));
      const ins = dep.factorOrder.map((_, i) => 0.6 + i * 1.7);
      expect(runModel(reopened.data, ins).y).toBe(runModel(node.data, ins).y);
      expect(runModel(reopened.data, ins, { mode: 'engine' }).y).toBe(runModel(node.data, ins).y);
    }
  });

  it('legacy params branches agree with modelEvaluator (GMDH order 2/3, Taguchi)', () => {
    for (const order of [2, 3] as const) {
      const dep = gmdh(order);
      const blk = BLOCK_LIBRARY['DOE_MODEL']('legacy_g', {
        modelType: 'GMDH', inputNames: dep.factorOrder, layers: dep.gmdh!.layers, polyOrder: order
      });
      const ins = [0.7, -1.3, 2.1];
      const r = blk.execute(ins, blk.params, blk.state, 0);
      expect(rel(r.outputs[0] as number, evaluateDOEModel(dep, ins))).toBeLessThan(1e-12);
    }
    const blk = BLOCK_LIBRARY['DOE_MODEL']('legacy_t', {
      modelType: 'Taguchi', inputNames: ['v', 't'], grandMean: 45.2,
      factorLevels: [
        { factor: 'v', means: [{ level: 110, meanY: 42 }, { level: 220, meanY: 48.4 }] },
        { factor: 't', means: [{ level: 10, meanY: 44.1 }, { level: 20, meanY: 46.3 }] }
      ]
    });
    const r = blk.execute([200, 12], blk.params, blk.state, 0);
    expect(rel(r.outputs[0] as number, evaluateDOEModel(taguchi, [200, 12]))).toBeLessThan(1e-12);
  });

  it('wrong input count / NaN produce NaN output + error + lastFault', () => {
    const node = exportNode(rsm);
    const blk: any = workspaceBlock(node);
    const short = blk.execute([1], blk.params, blk.state, 0);
    expect(short.outputs[0]).toBeNaN();
    expect(short.error).toMatch(/expects 2 input/);
    expect(short.nextState.lastFault.code).toBe('INSUFFICIENT_INPUTS');
    const nan = blk.execute([NaN, 1], blk.params, blk.state, 0);
    expect(nan.outputs[0]).toBeNaN();
    expect(nan.nextState.lastFault.code).toBe('NON_FINITE_INPUT');
    const ok = blk.execute([1, 1], blk.params, nan.nextState, 0);
    expect(ok.nextState.lastFault).toBeNull();
  });

  it('engine surfaces a DOE_MODEL runtime fault as one BLOCK_RUNTIME_FAULT diagnostic per block', () => {
    const node = exportNode(rsm);
    const blk: any = workspaceBlock(node);
    blk.inputs = blk.inputs.slice(0, 1); // wrong input count
    const engine = new XbridgesEngine({
      blocks: [
        { id: 'c1', type: 'CONSTANT', params: { value: 1 }, inputs: [], outputs: [{ id: 'out', name: 'out', type: 'auto', direction: 'output', value: 1 }] },
        blk
      ],
      connections: [{ sourceBlock: 'c1', sourcePort: 'out', targetBlock: 'doe1', targetPort: 'in1' }]
    } as any);
    Solvers.runFixedStep(engine, { solver: 'ode4', startTime: 0, stopTime: 0.05, fixedStep: 0.01 } as any);
    const faults = engine.diagnostics.filter(d => d.code === 'BLOCK_RUNTIME_FAULT');
    expect(faults).toHaveLength(1);
    expect(faults[0].severity).toBe('error');
    expect(faults[0].blockIds).toEqual(['doe1']);
    expect(faults[0].message).toMatch(/INSUFFICIENT_INPUTS|expects 2 input/);
  });

  it('stale inputNames cannot desync ports from the deployment factorOrder', () => {
    const node = exportNode(gmdh(2));
    const params = { ...node.data.params, inputNames: { label: 'Inputs', value: ['only'] } };
    const blk = BLOCK_LIBRARY['DOE_MODEL']('stale', params);
    expect(blk.inputs.map(p => p.id)).toEqual(['in1', 'in2', 'in3']);
  });

  it('LAPLACE pre-sync ignores GMDH/Taguchi sources but still syncs RSM', () => {
    const mk = (dep: DOEDeploymentModel, eq: string) => {
      const d = exportNode(dep, 'doe1', eq).data;
      return new XbridgesEngine({
        blocks: [
          { id: 'doe1', type: 'DOE_MODEL', params: d.params, inputs: d.inputs, outputs: d.outputs },
          { id: 'lap', type: 'LAPLACE_TRANSFORM', params: { mappingType: 'denominator', maxDegree: 2, denominator: [1, 2, 3], numerator: [1] }, inputs: [], outputs: [] }
        ],
        connections: [{ sourceBlock: 'doe1', sourcePort: 'out', targetBlock: 'lap', targetPort: 'doe' }]
      } as any).getBlock('lap')!;
    };
    expect(mk(gmdh(2), 'Y = f_GMDH(a, b, c)').params.denominator).toEqual([1, 2, 3]);
    expect(mk(taguchi, 'Y = f_Taguchi(v, t)').params.denominator).toEqual([1, 2, 3]);
    const oneFactor = base('RSM', ['x1'], { rsm: { intercept: 5, terms: [{ name: 'x1', factors: [0], powers: [1], coeff: 3 }, { name: 'x1^2', factors: [0], powers: [2], coeff: 2 }] } });
    const lap = mk(oneFactor, 'Y = 5 + 3*x1 + 2*x1^2');
    expect(lap.params.denominator[0]).toBeCloseTo(2, 6);
    expect(lap.params.denominator[2]).toBeCloseTo(5, 6);
  });

  it('repeated exports get unique ids, staggered positions and carry R2 metrics', () => {
    const a: any = createXBridgesDOEBlock(toResult(rsm));
    const b: any = createXBridgesDOEBlock(toResult(rsm));
    expect(a.id).not.toBe(b.id);
    expect(a.position).not.toEqual(b.position);
    expect(a.data.metrics.R2).toBe(0.95);
  });

  describe('legacy result synthesis (no fabricated placeholders)', () => {
    const legacy = (modelType: string, extra: any): any => {
      const common = { modelType, factorNames: ['A', 'B'], responseName: 'Y', diagnostics: [] };
      if (modelType === 'RSM') return { ...common, Beta: [1, 2, 3, 0, 0, 0], ...extra };
      if (modelType === 'GMDH') return { ...common, model: { polynomialOrder: 2, layers: [] }, ...extra };
      return {
        ...common,
        factorLevels: [{ factor: 'A', means: [{ level: 1, meanY: 1, meanSN: 1 }, { level: 2, meanY: 2, meanSN: 2 }] }],
        ...extra
      };
    };
    const dep = (r: any) => {
      const out: any = createXBridgesDOEBlock(r);
      expect(out.success).not.toBe(false);
      return { ...out.data, deployment: out.data.deploymentModel };
    };

    for (const mt of ['RSM', 'GMDH', 'Taguchi']) {
      it(`${mt}: trainingRowCount equals real row count and R2/adjR2 are carried`, () => {
        const d = dep(legacy(mt, { actuals: [1, 2, 3, 4, 5, 6, 7], rSquared: 0.9, adjustedRSquared: 0.8 }));
        expect(d.deployment.trainingRowCount).toBe(7);
        expect(d.deployment.metrics.rSquared).toBe(0.9);
        expect(d.deployment.metrics.adjustedRSquared).toBe(0.8);
        expect(d.metrics.R2).toBe(0.9);
        expect(d.metrics.R2Adj).toBe(0.8);
      });

      it(`${mt}: no data -> trainingRowCount 0 and no rSquared key`, () => {
        const d = dep(legacy(mt, {}));
        expect(d.deployment.trainingRowCount).toBe(0);
        expect('rSquared' in d.deployment.metrics).toBe(false);
        expect('adjustedRSquared' in d.deployment.metrics).toBe(false);
        expect(d.metrics.R2).toBeUndefined();
      });
    }

    it('falls back to predictions length and legacy R2 field', () => {
      const d = dep(legacy('RSM', { predictions: [1, 2, 3], R2: 0.5 }));
      expect(d.deployment.trainingRowCount).toBe(3);
      expect(d.deployment.metrics.rSquared).toBe(0.5);
    });
  });
});
