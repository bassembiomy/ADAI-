/**
 * XBV-439 acceptance (WP-439a, plan docs/superpowers/plans/2026-11-25-xbv434-xbv439-implementation.md Part 1).
 *
 * The Gauss-Seidel warm-up passes of XbridgesEngine.solveAlgebraicLoopCore accept y = 3e-12 for y = y + 1e-12 (y^2 + 1),
 * which has no real root (probe: scripts/xbridges-verification/xbv439Probe.ts). Decision D25: no point may leave the
 * warm-up passes without passing the same acceptance as the main solver.
 *
 * ORACLES (hand):
 *  - y = y + k (y^2 + 1), k > 0: y = F(y) means k (y^2 + 1) = 0, impossible for real y. The only correct outcome is
 *    ALGEBRAIC_LOOP_NOT_CONVERGED (fatal), never a value.
 *  - y = 1 + a y, |a| < 1: the unique root is y* = 1 / (1 - a). a = 0.5 -> 2; a = 0.9999 -> 10000; a = -0.5 -> 2/3.
 *    Gauss-Seidel from 0 contracts with rate |a|; the engine's acceptance is algTol (1 + |y|) on the solution, so the
 *    test allows algTol (1 + |y*|) times 1 / (1 - |a|) for the slow case (error = step a / (1 - a)).
 *  - Cost guards (performance, not correctness): a 0.5-contraction converges to 1e-6 in about 21 Gauss-Seidel passes
 *    (0.5^21 ~ 4.8e-7), so 30 loop evaluations leave room for the stopping rule but not for a Jacobian on every pass.
 *    A warm start at the previous root needs one pass plus, after D25, at most one verification (residual + a
 *    one-dimensional central-difference Jacobian = 3 evaluations): at most 6.
 *
 * Evaluations are counted by wrapping the loop GAIN's execute, as xbEngineB describe 'e' does.
 */
import { describe, expect, it } from 'vitest';
import { XbridgesEngine } from '../XbridgesEngine';
import { buildModel, type ModelSpec } from '../testkit';

/** y = y + k (y^2 + 1): Constant 1 -> s2 <- Product(y, y); s2 -> Gain k -> s(y, .). Same wiring as the probe. */
const noRootLoop = (k: number): ModelSpec => ({
  blocks: [
    { id: 'cd', type: 'Constant', params: { value: 1 } }, { id: 'p', type: 'PRODUCT', params: { numInputs: 2 } },
    { id: 's2', type: 'Sum', params: { signs: '++' } }, { id: 'gk', type: 'GAIN', params: { gain: k } },
    { id: 's', type: 'Sum', params: { signs: '++' } },
  ],
  wires: ['s.out -> p.in1', 's.out -> p.in2', 'p.y -> s2.in1', 'cd.out -> s2.in2', 's2.out -> gk.u', 's.out -> s.in1', 'gk.y -> s.in2'],
});

/** y = 1 + a y. */
const linearLoop = (a: number): ModelSpec => ({
  blocks: [
    { id: 'one', type: 'Constant', params: { value: 1 } }, { id: 'gk', type: 'GAIN', params: { gain: a } },
    { id: 's', type: 'Sum', params: { signs: '++' } },
  ],
  wires: ['one.out -> s.in1', 's.out -> gk.u', 'gk.y -> s.in2'],
});

const make = (spec: ModelSpec, opts: Record<string, unknown>) => {
  const model = buildModel(spec);
  const blocks = (model as unknown as { blocks: { id: string; execute: (...a: unknown[]) => unknown }[] }).blocks;
  const gain = blocks.find((b) => b.id === 'gk');
  const counter = { evals: 0 };
  if (gain) {
    const inner = gain.execute.bind(gain);
    gain.execute = (...args: unknown[]) => { counter.evals++; return inner(...args); };
  }
  const e = new XbridgesEngine(model);
  e.options = { solver: 'rk4', fixedStep: 0.1, startTime: 0, stopTime: 0.5, ...opts } as never;
  const compile = e.compile(0);
  const errors = () => [...compile, ...e.diagnostics].filter((d) => d.severity === 'error').map((d) => d.code);
  return { e, counter, errors };
};

const solveOnce = (spec: ModelSpec, opts: Record<string, unknown> = {}) => {
  const { e, counter, errors } = make(spec, opts);
  e.computeOutputs(0);
  return { y: Number(e.getSignalValue('s', 'out')), codes: errors(), fatal: e.hasFatalError(), evals: counter.evals };
};

describe('XBV-439: a loop with no real root is never accepted by the warm-up passes', () => {
  for (const k of [1e-12, 1e-20]) {
    for (const algTol of [1e-6, 1e-3]) {
      for (const algMaxPasses of [2, 50]) {
        it(`y = y + ${k} (y^2 + 1), algTol ${algTol}, algMaxPasses ${algMaxPasses}: ALGEBRAIC_LOOP_NOT_CONVERGED`, () => {
          const r = solveOnce(noRootLoop(k), { algTol, algMaxPasses });
          expect(r.codes, `y = ${r.y}`).toContain('ALGEBRAIC_LOOP_NOT_CONVERGED');
          expect(r.fatal).toBe(true);
        });
      }
    }
  }
});

/**
 * WP-439b verifier (FAIL 1 and 2): a rate measured over ALL loop values is fooled when the drifting value sits next to a
 * value that settles (or contracts) fast: the max-norm change is dominated by the settling part, so q looks small while
 * y keeps drifting at rate 1. The second loop is disjoint, so the oracle is the same: y has no real root, whatever x does.
 *  - saturated: x1 = 1 + sat(G x1), sat upper U; for G = 100, U = 60 it settles at x1 = 61 after two sweeps (hand:
 *    pass 0 change 100, pass 1 change 59.4, q = 0.594; pass 2 change ~1e-12 from y alone).
 *  - contracting: x = 1 + a x with a = 0.5.
 */
const withSaturatedLoop = (k: number, first: boolean): ModelSpec => {
  const b = noRootLoop(k);
  const extra = [
    { id: 'sat', type: 'SATURATION', params: { lowerLimit: -1e12, upperLimit: 60 } }, { id: 'x1', type: 'Sum', params: { signs: '++' } },
    { id: 'c1', type: 'Constant', params: { value: 1 } }, { id: 'x2', type: 'GAIN', params: { gain: 100 } },
  ];
  const w = ['x2.y -> sat.u', 'sat.y -> x1.in1', 'c1.out -> x1.in2', 'x1.out -> x2.u'];
  return { blocks: first ? [...extra, ...b.blocks] : [...b.blocks, ...extra], wires: first ? [...w, ...b.wires] : [...b.wires, ...w] };
};
const withContractingLoop = (k: number, a: number): ModelSpec => {
  const b = noRootLoop(k);
  return {
    blocks: [...b.blocks, { id: 'one', type: 'Constant', params: { value: 1 } }, { id: 'ga', type: 'GAIN', params: { gain: a } }, { id: 'x', type: 'Sum', params: { signs: '++' } }],
    wires: [...b.wires, 'one.out -> x.in1', 'x.out -> ga.u', 'ga.y -> x.in2'],
  };
};

describe('XBV-439: the drift is not hidden by another loop value that settles or contracts', () => {
  for (const k of [1e-8, 1e-12, 1e-16]) {
    for (const first of [true, false]) {
      it(`y = y + ${k} (y^2 + 1) next to a saturated loop (${first ? 'first' : 'last'}): ALGEBRAIC_LOOP_NOT_CONVERGED`, () => {
        const r = solveOnce(withSaturatedLoop(k, first), { algTol: 1e-6 });
        expect(r.codes, `y = ${r.y}`).toContain('ALGEBRAIC_LOOP_NOT_CONVERGED');
        expect(r.fatal).toBe(true);
      });
    }
  }
  for (const a of [0.5, 0.25]) {
    it(`y = y + 1e-12 (y^2 + 1) next to x = 1 + ${a} x: ALGEBRAIC_LOOP_NOT_CONVERGED`, () => {
      const r = solveOnce(withContractingLoop(1e-12, a), { algTol: 1e-6 });
      expect(r.codes, `y = ${r.y}`).toContain('ALGEBRAIC_LOOP_NOT_CONVERGED');
      expect(r.fatal).toBe(true);
    });
  }
});

describe('XBV-439: contractions are still solved, and cheaply', () => {
  it('y = 1 + 0.5 y -> 2, by the fast path (at most 30 loop evaluations)', () => {
    const r = solveOnce(linearLoop(0.5), { algTol: 1e-6 });
    expect(r.codes).toEqual([]);
    expect(Math.abs(r.y - 2)).toBeLessThanOrEqual(1e-6 * 3);
    expect(r.evals).toBeLessThanOrEqual(30);
  });

  it('y = 1 + 0.9999 y -> 10000 (slow contraction)', () => {
    const r = solveOnce(linearLoop(0.9999), { algTol: 1e-6 });
    expect(r.codes).toEqual([]);
    expect(Math.abs(r.y - 1e4) / (1e-6 * 10001)).toBeLessThanOrEqual(1 / (1 - 0.9999));
    // the residual says the same independently of the stopping rule: |1 + a y - y| = (1 - a) |y - y*|
    expect(Math.abs(1 + 0.9999 * r.y - r.y)).toBeLessThanOrEqual(1e-6 * 10001);
  });

  it('y = 1 - 0.5 y -> 2/3 (alternating)', () => {
    const r = solveOnce(linearLoop(-0.5), { algTol: 1e-6 });
    expect(r.codes).toEqual([]);
    expect(Math.abs(r.y - 2 / 3)).toBeLessThanOrEqual(1e-6 * (5 / 3));
  });

  it('warm start: the second solve of y = 1 + 0.5 y at the next time costs at most 6 loop evaluations', () => {
    const { e, counter, errors } = make(linearLoop(0.5), { algTol: 1e-6 });
    e.computeOutputs(0);
    const y0 = Number(e.getSignalValue('s', 'out'));
    const before = counter.evals;
    e.computeOutputs(0.1);
    expect(errors()).toEqual([]);
    expect(Math.abs(Number(e.getSignalValue('s', 'out')) - 2)).toBeLessThanOrEqual(1e-6 * 3);
    expect(Math.abs(y0 - 2)).toBeLessThanOrEqual(1e-6 * 3);
    expect(counter.evals - before).toBeLessThanOrEqual(6);
  });
});
