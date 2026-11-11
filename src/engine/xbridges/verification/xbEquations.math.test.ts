/**
 * WP-04 — gate V2/V3 for sources, element-wise math, reductions and the trigonometric/hyperbolic family.
 * Plan: docs/superpowers/plans/2026-11-10-xbridges-full-verification.md (sections 2, 3 oracle 1, 4.2).
 *
 * Oracle: closed form from the MATLAB/Simulink definition of each block, written here independently of the block
 * code (MATLAB acot(x) = atan(1/x), asec(x) = acos(1/x), acsc(x) = asin(1/x), acoth(x) = atanh(1/x),
 * asech(x) = acosh(1/x), acsch(x) = asinh(1/x)). Tolerance: 4 ULP for library-function results (plan section 2),
 * exact for arithmetic that is exact in IEEE double.
 */
import { describe, expect, it } from 'vitest';
import { BLOCK_LIBRARY } from '../BlockDefinitions';
import { ulpDistance } from '../testkit';

const out = (type: string, params: Record<string, unknown>, inputs: unknown[], t = 0, port = 0) => {
  const b = BLOCK_LIBRARY[type]('x', params);
  return b.execute(inputs as never, b.params, b.state, t).outputs[port];
};
const close = (actual: unknown, expected: number, ulp = 4) => {
  const a = Number(actual);
  if (Number.isNaN(expected)) return expect(Number.isNaN(a), `expected NaN, got ${a}`).toBe(true);
  return expect(ulpDistance(a, expected), `got ${a}, expected ${expected}`).toBeLessThanOrEqual(ulp);
};
const closeAll = (actual: unknown, expected: number[], ulp = 4) => {
  expect(Array.isArray(actual), `expected an array, got ${JSON.stringify(actual)}`).toBe(true);
  expect((actual as number[]).length).toBe(expected.length);
  expected.forEach((e, i) => close((actual as number[])[i], e, ulp));
};
const D2R = Math.PI / 180;

describe('sources', () => {
  it('Step: initial value before stepTime, final value from stepTime on (Simulink Step)', () => {
    const p = { stepTime: 0.5, initialValue: -2, finalValue: 3 };
    expect([0, 0.25, 0.4999999, 0.5, 2].map((t) => out('Step', p, [], t))).toEqual([-2, -2, -2, 3, 3]);
  });
  it('Constant: scalar, vector and matrix values in MATLAB syntax', () => {
    expect(out('Constant', { value: -0.25 }, [])).toBe(-0.25);
    expect(out('Constant', { value: '[1 2 3]' }, [])).toEqual([1, 2, 3]);
    expect(out('Constant', { value: '[1 2; 3 4]' }, [])).toEqual([[1, 2], [3, 4]]);
  });
  it('WaveformGen Sine: amp * sin(2 pi f t + phase) + offset', () => {
    const p = { type: 'Sine', amp: 2, freq: 0.5, phase: 0.3, offset: -1 };
    for (const t of [0, 0.1, 0.77, 3]) close(out('WaveformGen', p, [], t), 2 * Math.sin(2 * Math.PI * 0.5 * t + 0.3) - 1);
  });
  it('WaveformGen Square: +amp in the first half period, -amp in the second (inside each half)', () => {
    const p = { type: 'Square', amp: 1.5, freq: 1, phase: 0, offset: 0 };
    expect([0.1, 0.4, 0.6, 0.9].map((t) => out('WaveformGen', p, [], t))).toEqual([1.5, 1.5, -1.5, -1.5]);
  });
  // Oracle: a square wave of duty 50 % is +A on [0, T/2) and -A on [T/2, T) (MATLAB square, Simulink pulse/square);
  // never 0. sign(sin) gives 0 at t = 0 and +A at t = T/2 because sin(pi) = 1.2e-16.
  it.fails('XBV-049: WaveformGen Square at the edges: +amp at t = 0, -amp at t = T/2', () => {
    const p = { type: 'Square', amp: 1.5, freq: 1, phase: 0, offset: 0 };
    expect([0, 0.5, 1].map((t) => out('WaveformGen', p, [], t))).toEqual([1.5, -1.5, 1.5]);
  });
  it('XBV-040: WaveformGen with amplitude 0 outputs 0 (amp 0 is replaced by 1)', () => {
    expect(out('WaveformGen', { type: 'Sine', amp: 0, freq: 1, phase: 0.5, offset: 0 }, [], 0.1)).toBe(0);
  });
  for (const t of [0.3, 1.7]) {
    it.fails(`XBV-041: the Sources "Clock" outputs the simulation time, like the Simulink Clock block (t = ${t})`, () => {
      expect(out('Clock', {}, [], t)).toBe(t);
    });
  }
});

describe('element-wise math', () => {
  it('Sum: signs, scalar expansion and the "|" spacer', () => {
    expect(out('Sum', { signs: '+-' }, [5, 3])).toBe(2);
    expect(out('Sum', { signs: '-+' }, [5, 3])).toBe(-2);
    expect(out('Sum', { signs: '++' }, [[1, 2, 3], 10])).toEqual([11, 12, 13]);
    expect(out('Sum', { signs: '+-' }, [[1, 2], [3, 5]])).toEqual([-2, -3]);
    expect(out('Sum', { signs: '+++' }, [1, 2, 3])).toBe(6);
  });
  for (const signs of ['+|-', '|+-', '+ -']) {
    it.fails(`XBV-044: Sum signs "${signs}" subtract like "+-" (the spacer only separates ports)`, () => {
      expect(out('Sum', { signs }, [5, 3])).toBe(2);
    });
  }
  it.fails('XBV-045: Sum with one "+" input sums the elements of a vector (Simulink single-input Sum)', () => {
    expect(out('Sum', { signs: '+' }, [[1, 2, 3.5]])).toBe(6.5);
  });
  it('Gain: scalar, element-wise vector gain, matrix input', () => {
    expect(out('GAIN', { gain: -2.5 }, [4])).toBe(-10);
    expect(out('GAIN', { gain: 2 }, [[1, -2, 3]])).toEqual([2, -4, 6]);
    expect(out('GAIN', { gain: '[2 3]' }, [[1, 1]])).toEqual([2, 3]);
    expect(out('GAIN', { gain: 0.5 }, [[[2, 4], [6, 8]]])).toEqual([[1, 2], [3, 4]]);
  });
  it('Product multiply and divide on scalars; 1/0 is IEEE Inf', () => {
    expect(out('PRODUCT', { operation: 'multiply' }, [3, -4])).toBe(-12);
    expect(out('PRODUCT', { operation: 'divide' }, [3, 4])).toBe(0.75);
    expect(out('PRODUCT', { operation: 'divide' }, [1, 0])).toBe(Infinity);
    expect(Number.isNaN(Number(out('PRODUCT', { operation: 'divide' }, [0, 0])))).toBe(true);
  });
  it.fails('XBV-042: Product multiplies vectors element by element (Simulink Product, element-wise mode)', () => {
    expect(out('PRODUCT', { operation: 'multiply' }, [[1, 2, 3], [4, 5, 6]])).toEqual([4, 10, 18]);
  });
  it('VectorAdd/Sub/Mul/Div/Pow: element-wise with scalar expansion', () => {
    expect(out('VectorAdd', {}, [[1, 2], [10, 20]])).toEqual([11, 22]);
    expect(out('VectorSub', {}, [[1, 2], 1])).toEqual([0, 1]);
    expect(out('VectorMul', {}, [[1, 2, 3], [2, 2, 2]])).toEqual([2, 4, 6]);
    expect(out('VectorDiv', {}, [[1, 3], [2, 4]])).toEqual([0.5, 0.75]);
    expect(out('VectorPow', {}, [[2, 3, 0], [3, 2, 0]])).toEqual([8, 9, 1]);
  });
  // Oracle: real-valued power of a negative base with a non-integer exponent is NaN (Simulink Math Function, real output).
  it.fails('XBV-050: VectorPow(-8, 1/3) is a real number (NaN), not a complex object', () => {
    const y = out('VectorPow', {}, [-8, 1 / 3]);
    expect(typeof y).toBe('number');
    expect(Number.isNaN(y as number)).toBe(true);
  });
  it('UnaryNeg and Abs, including -0 and vectors', () => {
    expect(out('UnaryNeg', {}, [[1, -2]])).toEqual([-1, 2]);
    expect(out('Abs', {}, [-3.5])).toBe(3.5);
    expect(Object.is(out('Abs', {}, [-0]), 0)).toBe(true);
    expect(out('Abs', {}, [[-1, 2, -3]])).toEqual([1, 2, 3]);
  });
});

describe('reductions', () => {
  it('SumElements, Mean, Max over vectors and matrices', () => {
    expect(out('SumElements', {}, [[1, 2, 3.5]])).toBe(6.5);
    expect(out('SumElements', {}, [[[1, 2], [3, 4]]])).toBe(10);
    expect(out('Mean', {}, [[1, 2, 3, 6]])).toBe(3);
    expect(out('Max', {}, [[-5, -2, -9]])).toBe(-2);
    expect(out('Max', { numInputs: 2 }, [[1, 5], [3, 2]])).toEqual([3, 5]);
  });
  it('Max element-wise with negative values and ties', () => {
    expect(out('Max', { numInputs: 2 }, [[-1, -7], -3])).toEqual([-1, -3]);
    expect(out('Max', {}, [[3, 3]])).toBe(3);
  });
  // Oracle: MATLAB max ignores NaN (max(NaN, -3) = -3); Simulink MinMax propagates it. Either is acceptable, 0 is not.
  it.fails('XBV-043: Max of NaN and -3 is -3 or NaN, never 0', () => {
    const n = out('Max', { numInputs: 2 }, [Number.NaN, -3]);
    expect(n === -3 || Number.isNaN(Number(n))).toBe(true);
  });
  // Oracle: MATLAB mean(M) and the Simulink Mean block default ("Each column") give the column means.
  it.fails('XBV-048: Mean of a matrix gives the column means [2 4] (MATLAB / Simulink default), not the mean of all elements', () => {
    expect(out('Mean', {}, [[[1, 2], [3, 6]]])).toEqual([2, 4]);
  });
  it('SumElements of an empty vector is 0 (MATLAB sum([]) = 0)', () => { expect(out('SumElements', {}, [[]])).toBe(0); });
  // MATLAB: mean([]) = NaN; max([]) = [] (empty). Either an empty result or NaN is acceptable; a throw is not.
  it.fails('XBV-051: Mean of an empty vector is NaN (MATLAB mean([]))', () => {
    expect(Number.isNaN(Number(out('Mean', {}, [[]])))).toBe(true);
  });
  it.fails('XBV-051: Max of an empty vector is empty or NaN (MATLAB max([]) = [])', () => {
    const y = out('Max', {}, [[]]);
    expect((Array.isArray(y) && y.length === 0) || Number.isNaN(Number(y))).toBe(true);
  });
});

describe('trigonometric and hyperbolic functions (MATLAB definitions)', () => {
  const ANGLES = [-2.5, -Math.PI / 3, -0.5, 0.1, Math.PI / 6, Math.PI / 4, 1, 2.2];
  const FORWARD: [string, (x: number) => number][] = [
    ['SIN', Math.sin], ['COS', Math.cos], ['TAN', Math.tan],
    ['COT', (x) => 1 / Math.tan(x)], ['SEC', (x) => 1 / Math.cos(x)], ['COSEC', (x) => 1 / Math.sin(x)],
  ];
  for (const [type, f] of FORWARD) {
    it(`${type}: radians and degrees`, () => {
      for (const x of ANGLES) close(out(type, { angle_unit: 'radians' }, [x]), f(x));
      for (const deg of [-150, -30, 15, 30, 60, 135]) close(out(type, { angle_unit: 'degrees' }, [deg]), f(deg * D2R), 8);
    });
  }
  const INVERSE: [string, (x: number) => number, number[]][] = [
    ['ASIN', Math.asin, [-1, -0.5, 0, 0.3, 1]], ['ACOS', Math.acos, [-1, -0.5, 0, 0.3, 1]], ['ATAN', Math.atan, [-10, -1, 0, 0.5, 3]],
    ['ACOT', (x) => Math.atan(1 / x), [-10, -1, 0.5, 3]], ['ASEC', (x) => Math.acos(1 / x), [-10, -1, 1, 2]],
    ['ACOSEC', (x) => Math.asin(1 / x), [-10, -1, 1, 2]],
  ];
  for (const [type, f, xs] of INVERSE) {
    it(`${type}: principal value in radians and in degrees`, () => {
      for (const x of xs) close(out(type, { angle_unit: 'radians' }, [x]), f(x));
      for (const x of xs) close(out(type, { angle_unit: 'degrees' }, [x]), f(x) / D2R, 8);
    });
  }
  const HYPER: [string, (x: number) => number, number[]][] = [
    ['SINH', Math.sinh, [-3, -0.5, 0, 0.7, 2]], ['COSH', Math.cosh, [-3, 0, 0.7, 2]], ['TANH', Math.tanh, [-3, -0.5, 0, 0.7, 20]],
    ['COTH', (x) => 1 / Math.tanh(x), [-3, -0.5, 0.7, 2]], ['SECH', (x) => 1 / Math.cosh(x), [-3, 0, 0.7, 2]],
    ['COSECH', (x) => 1 / Math.sinh(x), [-3, -0.5, 0.7, 2]],
    ['ASINH', Math.asinh, [-3, 0, 0.7, 20]], ['ACOSH', Math.acosh, [1, 1.5, 20]], ['ATANH', Math.atanh, [-0.9, 0, 0.5]],
    ['ACOTH', (x) => Math.atanh(1 / x), [-3, -1.5, 1.5, 4]], ['ASECH', (x) => Math.acosh(1 / x), [0.1, 0.5, 1]],
    ['ACOSECH', (x) => Math.asinh(1 / x), [-3, -0.5, 0.7, 2]],
  ];
  for (const [type, f, xs] of HYPER) {
    it(`${type}: closed form`, () => { for (const x of xs) close(out(type, {}, [x]), f(x)); });
  }
  it('odd functions are exactly odd: sin, tan, asin, atan, sinh, tanh, asinh, atanh', () => {
    for (const type of ['SIN', 'TAN', 'ASIN', 'ATAN', 'SINH', 'TANH', 'ASINH', 'ATANH']) {
      for (const x of [0.1, 0.3, 0.7]) expect(out(type, {}, [-x]), type).toBe(-Number(out(type, {}, [x])));
    }
  });
  for (const [type, f] of [...FORWARD, ...INVERSE.map(([t, g]) => [t, g] as [string, (x: number) => number]), ...HYPER.map(([t, g]) => [t, g] as [string, (x: number) => number])]) {
    it.fails(`XBV-046: ${type} processes a vector input element-wise`, () => {
      // In-domain inputs for every function (asec, acsc, acosh, acoth need |x| >= 1 or x > 1), so the oracle is finite.
      const xs = ['ASEC', 'ACOSEC', 'ACOSH', 'ACOTH'].includes(type) ? [1.5, 2] : [0.5, 0.6];
      closeAll(out(type, {}, [xs]), xs.map(f));
    });
  }
  it('domain edges: asin/acos just outside [-1, 1] and acosh(0.5) give NaN with MATH_DOMAIN_ERROR', () => {
    for (const [type, x] of [['ASIN', 1 + 2 ** -52], ['ACOS', -1 - 2 ** -52], ['ACOSH', 0.5]] as const) {
      const b = BLOCK_LIBRARY[type]('x', {});
      const r = b.execute([x] as never, b.params, b.state, 0);
      expect(Number.isNaN(Number(r.outputs[0])), type).toBe(true);
      expect(r.diagnostic?.code, type).toBe('MATH_DOMAIN_ERROR');
    }
  });
  it('limits and poles follow IEEE: atanh(+-1) = +-Inf, cot(0) = csc(0) = Inf, tan(pi/2) is the finite IEEE value', () => {
    expect(out('ATANH', {}, [1])).toBe(Infinity);
    expect(out('ATANH', {}, [-1])).toBe(-Infinity);
    expect(out('COT', {}, [0])).toBe(Infinity);
    expect(out('COSEC', {}, [0])).toBe(Infinity);
    close(out('TAN', {}, [Math.PI / 2]), 1.633123935319537e16);
  });
  it('large arguments use the full-precision reduction of the platform: sin(1e8), cos(1e8)', () => {
    // Literals from a 60-digit decimal argument reduction (WP-04 verifier), not from Math.sin/cos.
    close(out('SIN', {}, [1e8]), 0.931639027109726);
    close(out('COS', {}, [1e8]), -0.3633850893556905);
  });
});
