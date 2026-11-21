/**
 * WP-21 round 6 acceptance (controller).
 * XBV-307 (S1): discrete sample hits are scheduled on integer ticks (Simulink: hit n at t = n*Ts exactly, no accumulated
 * nextTime += Ts). Accumulating 0.1 drifts past the 1e-9 tolerance after 23042 additions, so a discrete integrator of
 * u = 1 with Ts = 0.1 misses a hit from then on. Oracle: forward-Euler discrete integrator y(n) = y(n-1) + Ts*u(n-1),
 * so after N hits y = N * Ts, and every sample k has y(t_k) = k * Ts at t_k = k * Ts (h = Ts) or the latest hit (h < Ts).
 */
import { describe, expect, it } from 'vitest';
import { buildModel, runModel } from '../testkit';

describe('XBV-307: discrete sample hits do not drift on long runs', () => {
  for (const [h, stop] of [[0.1, 3000], [0.05, 2400], [0.01, 5100]] as const) {
    it(`INTEGRATOR_DISCRETE Ts 0.1 driven by 1, solver step ${h}, ${stop} s: y(t) = 0.1 * floor(t / 0.1 + 1e-9) at every sample`, () => {
      const r = runModel(buildModel({
        blocks: [{ id: 'c', type: 'Constant', params: { value: 1 } }, { id: 'i', type: 'INTEGRATOR_DISCRETE', params: { sample_time: 0.1 } }],
        wires: ['c.out -> i.u'],
      }), { solver: 'discrete', dt: h, stopTime: stop, probes: ['i.y'] });
      expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      const ys = r.signals['i.y'].map(Number);
      const y0 = ys[0];
      let bad = -1;
      for (let k = 0; k < ys.length; k++) {
        const hits = Math.floor((k * h) / 0.1 + 1e-9);
        if (Math.abs(ys[k] - y0 - 0.1 * hits) > 1e-6 * Math.max(1, hits * 0.1)) { bad = k; break; }
      }
      expect(bad, bad >= 0 ? `first wrong sample k = ${bad}, t = ${bad * h}: y = ${ys[bad]}` : '').toBe(-1);
    }, 120_000);
  }
});

// XBV-197: RATE_LIMITER legacy aliases risingLimit / fallingLimit set to '' are refused by the embedded validator (an empty
// rate, like XBV-196), instead of validating as 0 and running at the default rate 1.
import { runEmbedded } from '../testkit';
describe('XBV-197: empty legacy slew-rate aliases are refused', () => {
  for (const params of [{ risingLimit: '' }, { fallingLimit: '' }]) {
    it(`RATE_LIMITER ${JSON.stringify(params)}: an error diagnostic whose message says empty`, () => {
      const r = runEmbedded({
        blocks: [{ id: 'c', type: 'Constant', params: { value: 10 } }, { id: 'r', type: 'RATE_LIMITER', params: { ...params, sampleTime: 0.1 } }],
        wires: ['c.out -> r.u'],
      }, { solver: 'discrete', dt: 0.1, steps: 2, probes: ['r.y'] });
      expect(r.diagnostics.filter((d) => d.severity === 'error').map((d) => d.message).join(' | ')).toMatch(/empty/i);
    });
  }
});

// XBV-310 (FUZZY_DEFUZZIFY, found by the WP-03b verifier): an unknown or wrong-case defuzzification method is refused at
// compile (PARAMETER_OPTION_INVALID) instead of silently using the centroid.
import { XbridgesEngine } from '../XbridgesEngine';
describe('XBV-310: FUZZY_DEFUZZIFY.method is validated', () => {
  for (const method of ['zz_unknown', 'MOM']) {
    it(`method '${method}' gives a compile error naming the block`, () => {
      const ds = new XbridgesEngine(buildModel({ blocks: [{ id: 'd', type: 'FUZZY_DEFUZZIFY', params: { method } }], wires: [] })).compile(0);
      expect(ds.some((d) => d.severity === 'error' && (d.blockIds ?? []).includes('d'))).toBe(true);
    });
  }
});

// XBV-305 (U1): FLUX_REFERENCE field weakening, standard constant-power region: Id* = value for |w| <= base_speed and
// value * base_speed / |w| above it; constant mode always outputs value. The factory default value stays 0 (PMSM Id* = 0).
describe('XBV-305: FLUX_REFERENCE field weakening', () => {
  const run = (mode: string, w: number, params: Record<string, unknown> = { value: 2, base_speed: 100 }) => Number(runModel(buildModel({
    blocks: [{ id: 'w', type: 'Constant', params: { value: w } }, { id: 'f', type: 'FLUX_REFERENCE', params: { mode, ...params } }],
    wires: ['w.out -> f.speed'],
  }), { solver: 'discrete', dt: 0.01, stopTime: 0.01, probes: ['f.id_ref'] }).signals['f.id_ref'].at(-1));
  it('field_weakening: 2 at 50 and 100 rad/s, 2*100/250 = 0.8 at 250 rad/s and at -250 rad/s', () => {
    expect(run('field_weakening', 50)).toBeCloseTo(2, 12);
    expect(run('field_weakening', 100)).toBeCloseTo(2, 12);
    expect(run('field_weakening', 250)).toBeCloseTo(0.8, 12);
    expect(run('field_weakening', -250)).toBeCloseTo(0.8, 12);
  });
  it('constant: 2 at every speed', () => {
    for (const w of [0, 250, -250]) expect(run('constant', w)).toBeCloseTo(2, 12);
  });
  it('the factory default value is 0, as before (no behaviour change for existing models)', () => {
    expect(BLOCK_LIBRARY_ROUND6['FLUX_REFERENCE']('f', {}).params.value).toBe(0);
  });
});

// XBV-309 (U1): FUZZY_INFERENCE_SYSTEM.orMethod applies to OR rules only (MATLAB fis.OrMethod); rule aggregation stays max
// (MATLAB AggregationMethod default), so a rule base without OR rules gives the same output for max and probor.
import { BLOCK_LIBRARY as BLOCK_LIBRARY_ROUND6 } from '../BlockDefinitions';
describe('XBV-309: FUZZY_INFERENCE_SYSTEM orMethod', () => {
  const fis = (orMethod: string, rules?: unknown[]) => Number(runModel(buildModel({
    blocks: [{ id: 'a', type: 'Constant', params: { value: 0.75 } }, { id: 'b', type: 'Constant', params: { value: 0.2 } }, { id: 'f', type: 'FUZZY_INFERENCE_SYSTEM', params: { orMethod, ...(rules ? { rules } : {}) } }],
    wires: ['a.out -> f.x1', 'b.out -> f.x2'],
  }), { solver: 'discrete', dt: 0.01, stopTime: 0.01, probes: ['f.y'] }).signals['f.y'].at(-1));
  it('default rule base (AND rules only): max and probor give the same output (aggregation is not orMethod)', () => {
    expect(fis('probor')).toBe(fis('max'));
  });
  it('an OR rule: max and probor give different outputs', () => {
    const rules = [{ antecedents: [2, 1], consequent: 3, weight: 1, operator: 'OR' }, { antecedents: [3, 1], consequent: 1, weight: 1 }];
    expect(fis('probor', rules)).not.toBeCloseTo(fis('max', rules), 6);
  });
});

// D17 (U1, XBV-306): MatrixDiag / Diag / DiagExtract / ExtractDiag follow MATLAB diag: a vector input builds a diagonal
// matrix, a matrix input extracts its diagonal. There is no create / extract option (removed from the schema and panel).
import { parameterKind } from '../parameterSchema';
describe('D17: diagonal blocks follow MATLAB diag, no diagMode option', () => {
  for (const type of ['MatrixDiag', 'Diag', 'DiagExtract', 'ExtractDiag']) {
    it(`${type}: no diagMode in the parameter schema or factory params`, () => {
      expect(parameterKind(type, 'diagMode')).toBeUndefined();
      expect(BLOCK_LIBRARY_ROUND6[type]?.('d', {})?.params?.diagMode).toBeUndefined();
    });
  }
  it('MatrixDiag: [1 2] -> [[1 0], [0 2]] and [[1 0], [0 2]] -> [1 2]', () => {
    const b = BLOCK_LIBRARY_ROUND6['MatrixDiag']('d', {});
    expect(b.execute([[1, 2]] as never, b.params, b.state, 0).outputs[0]).toEqual([[1, 0], [0, 2]]);
    expect(b.execute([[[1, 0], [0, 2]]] as never, b.params, b.state, 0).outputs[0]).toEqual([1, 2]);
  });
});
