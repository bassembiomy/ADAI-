/**
 * WP-09 — gates V2/V3 for fuzzy logic and learning blocks.
 * Plan: docs/superpowers/plans/2026-11-10-xbridges-full-verification.md (sections 2, 3, 4.2 rows "Fuzzy" and
 * "Learning, optimisation, DOE", 9).
 *
 * Oracles (written here, never read from the code under test):
 *  - MATLAB Fuzzy Logic Toolbox definitions of trimf / trapmf / gaussmf / sigmf (with MATLAB's NaN-ignoring `min`, so
 *    the degenerate shoulders a = b and c = d return 1 at the vertex), probor, defuzz (centroid, bisector, mom, som,
 *    lom) and the Mamdani pipeline (min AND, max OR, min implication, max aggregation, centroid on the same grid);
 *  - the documented Fuzzy PID law (gain scheduling by a Sugeno weighted average of the output centres, gains
 *    = base * (lo + s (hi - lo)), backward-Euler integral and N-filtered derivative) evaluated by hand;
 *  - LMS system identification d = 0.7 x(n) - 0.3 x(n-1) and the LMS update w <- w + lr err x_vec;
 *  - the neuron's documented tanh activation / delta rule and the tabular Q-learning update, by hand;
 *  - Math.random replaced by mulberry32 wherever a block draws random numbers (XBV-023).
 * Known and not re-pinned here: XBV-019 (`||` fallbacks on zero parameters), XBV-023 (unseeded randomness).
 * Product failures are pinned with it.fails and a finding ids (docs/xbridges-verification/ledger.json) (docs/xbridges-verification/ledger.json).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BLOCK_LIBRARY } from '../BlockDefinitions';
import { mulberry32 } from '../testkit';

// ---------------------------------------------------------------------------------------------------------------
// Helpers
const run = (type: string, params: Record<string, unknown>, ins: unknown[], state?: unknown, time = 0) => {
  const b = BLOCK_LIBRARY[type]('x', params);
  const r = b.execute(ins as never, b.params, (state ?? b.state) as never, time);
  return { outputs: r.outputs as unknown[], nextState: r.nextState as any, error: (r as any).error as unknown, block: b };
};
const near = (actual: number, expected: number, tol: number, what = '') =>
  expect(Math.abs(actual - expected), `${what} got ${actual}, expected ${expected}`).toBeLessThanOrEqual(tol);
const arr = (v: unknown): number[] => (v as unknown[]).map(Number);

/** MATLAB min / max ignore NaN (so 0/0 on a degenerate side drops out). */
const mMin = (...v: number[]) => { const k = v.filter((x) => !Number.isNaN(x)); return k.length ? Math.min(...k) : NaN; };
const mMax = (...v: number[]) => { const k = v.filter((x) => !Number.isNaN(x)); return k.length ? Math.max(...k) : NaN; };
const trimf = (x: number, a: number, b: number, c: number) => mMax(mMin((x - a) / (b - a), (c - x) / (c - b)), 0);
const trapmf = (x: number, a: number, b: number, c: number, d: number) =>
  mMax(mMin((x - a) / (b - a), 1, (d - x) / (d - c)), 0);
const gaussmf = (x: number, sigma: number, c: number) => Math.exp(-((x - c) ** 2) / (2 * sigma * sigma));
const sigmf = (x: number, a: number, c: number) => 1 / (1 + Math.exp(-a * (x - c)));

afterEach(() => { vi.restoreAllMocks(); });

// ---------------------------------------------------------------------------------------------------------------
describe('1. Membership functions (MATLAB trimf / trapmf / gaussmf / sigmf)', () => {
  const mu = (type: string, params: Record<string, unknown>, x: number) => Number(run(type, params, [x]).outputs[0]);
  const tri = { a: -1, b: 0, c: 2 };

  it('FUZZY_MF_TRIMF: vertices, mid-slopes and outside the support (-1, 0, 2)', () => {
    const cases: [number, number][] = [[-1, 0], [0, 1], [2, 0], [-0.5, 0.5], [1, 0.5], [0.5, 0.75], [-3, 0], [5, 0]];
    for (const [x, e] of cases) {
      near(mu('FUZZY_MF_TRIMF', tri, x), e, 1e-15, `x=${x}`);
      near(trimf(x, -1, 0, 2), e, 1e-15, `reference x=${x}`);
    }
  });
  it('FUZZY_MF_TRIMF: default parameters (-1, 0, 1) give the unit triangle', () => {
    for (const x of [-2, -1, -0.25, 0, 0.75, 1, 3]) near(mu('FUZZY_MF_TRIMF', {}, x), trimf(x, -1, 0, 1), 1e-15, `x=${x}`);
  });
  it('FUZZY_MF_TRIMF: degenerate a = b on the slope (x > a) follows (c-x)/(c-b)', () => {
    for (const x of [0.5, 1, 1.5]) near(mu('FUZZY_MF_TRIMF', { a: 0, b: 0, c: 2 }, x), (2 - x) / 2, 1e-15, `x=${x}`);
  });
  it.fails('XBV-110: FUZZY_MF_TRIMF degenerate a = b / b = c shoulder returns mu = 1 at the vertex (MATLAB trimf)', () => {
    near(trimf(0, 0, 0, 2), 1, 1e-15, 'reference a=b');
    near(trimf(2, 0, 2, 2), 1, 1e-15, 'reference b=c');
    near(mu('FUZZY_MF_TRIMF', { a: 0, b: 0, c: 2 }, 0), 1, 1e-15, 'a=b, x=a');
    near(mu('FUZZY_MF_TRIMF', { a: 0, b: 2, c: 2 }, 2), 1, 1e-15, 'b=c, x=c');
  });

  it('FUZZY_MF_TRAPMF: vertices, plateau, slopes and outside (-2, -1, 1, 2 default; and 0, 1, 3, 5)', () => {
    const d = [[-3, 0], [-2, 0], [-1.5, 0.5], [-1, 1], [0, 1], [1, 1], [1.5, 0.5], [2, 0], [4, 0]];
    for (const [x, e] of d) near(mu('FUZZY_MF_TRAPMF', {}, x), e, 1e-15, `default x=${x}`);
    const q = { a: 0, b: 1, c: 3, d: 5 };
    for (const x of [0.25, 0.5, 2, 4, 4.5, 5, 6]) near(mu('FUZZY_MF_TRAPMF', q, x), trapmf(x, 0, 1, 3, 5), 1e-15, `x=${x}`);
  });
  it('FUZZY_MF_TRAPMF: degenerate b = c is a triangle', () => {
    for (const x of [-0.5, 0, 0.25, 1, 1.5, 2, 3]) {
      near(mu('FUZZY_MF_TRAPMF', { a: 0, b: 1, c: 1, d: 2 }, x), trapmf(x, 0, 1, 1, 2), 1e-15, `x=${x}`);
    }
  });
  it.fails('XBV-111: FUZZY_MF_TRAPMF degenerate a = b / c = d shoulder returns mu = 1 at the vertex (MATLAB trapmf)', () => {
    near(trapmf(0, 0, 0, 1, 2), 1, 1e-15, 'reference a=b');
    near(trapmf(2, 0, 1, 2, 2), 1, 1e-15, 'reference c=d');
    near(mu('FUZZY_MF_TRAPMF', { a: 0, b: 0, c: 1, d: 2 }, 0), 1, 1e-15, 'a=b, x=a');
    near(mu('FUZZY_MF_TRAPMF', { a: 0, b: 1, c: 2, d: 2 }, 2), 1, 1e-15, 'c=d, x=d');
  });

  it('FUZZY_MF_GAUSSMF: exp(-(x-c)^2/(2 sigma^2)) at the centre, one and two sigma, and far away', () => {
    for (const [sigma, c] of [[1, 0], [0.5, 2], [3, -1]]) {
      for (const k of [-3, -2, -1, -0.25, 0, 0.5, 1, 2, 8]) {
        const x = c + k * sigma;
        near(mu('FUZZY_MF_GAUSSMF', { sigma, c }, x), gaussmf(x, sigma, c), 1e-15, `sigma=${sigma} c=${c} x=${x}`);
      }
    }
    near(mu('FUZZY_MF_GAUSSMF', { sigma: 2, c: 1 }, 1), 1, 1e-15, 'peak');
    near(mu('FUZZY_MF_GAUSSMF', { sigma: 2, c: 1 }, 3), Math.exp(-0.5), 1e-15, 'one sigma');
  });
  it('FUZZY_MF_SIGMF: 1/(1+exp(-a(x-c))), 0.5 at the crossover, a < 0 mirrors, saturation far away', () => {
    near(mu('FUZZY_MF_SIGMF', { a: 3, c: 1 }, 1), 0.5, 1e-15, 'crossover');
    for (const [a, c] of [[2, 0], [5, -1], [-4, 2]]) {
      for (const x of [-10, -1, 0, 0.3, 2, 6]) near(mu('FUZZY_MF_SIGMF', { a, c }, x), sigmf(x, a, c), 1e-15, `a=${a} c=${c} x=${x}`);
    }
    expect(mu('FUZZY_MF_SIGMF', { a: 2, c: 0 }, -1e4)).toBe(0);
    expect(mu('FUZZY_MF_SIGMF', { a: 2, c: 0 }, 1e4)).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('2. FUZZY_AND / FUZZY_OR / FUZZY_NOT', () => {
  const grid = [0, 0.1, 0.25, 0.5, 0.8, 1];
  it('FUZZY_AND min and product, FUZZY_OR max and probor, FUZZY_NOT 1-x on [0,1]', () => {
    for (const a of grid) {
      near(Number(run('FUZZY_NOT', {}, [a]).outputs[0]), 1 - a, 1e-15, `not ${a}`);
      for (const b of grid) {
        near(Number(run('FUZZY_AND', { method: 'min' }, [a, b]).outputs[0]), Math.min(a, b), 1e-15, `min ${a},${b}`);
        near(Number(run('FUZZY_AND', { method: 'product' }, [a, b]).outputs[0]), a * b, 1e-15, `prod ${a},${b}`);
        near(Number(run('FUZZY_OR', { method: 'max' }, [a, b]).outputs[0]), Math.max(a, b), 1e-15, `max ${a},${b}`);
        near(Number(run('FUZZY_OR', { method: 'probor' }, [a, b]).outputs[0]), a + b - a * b, 1e-15, `probor ${a},${b}`);
      }
    }
  });
  it('defaults are min for AND and max for OR; a third input is combined (numInputs 3)', () => {
    near(Number(run('FUZZY_AND', {}, [0.4, 0.9]).outputs[0]), 0.4, 1e-15);
    near(Number(run('FUZZY_OR', {}, [0.4, 0.9]).outputs[0]), 0.9, 1e-15);
    near(Number(run('FUZZY_AND', { numInputs: 3, method: 'product' }, [0.5, 0.5, 0.4]).outputs[0]), 0.1, 1e-15);
    near(Number(run('FUZZY_OR', { numInputs: 3, method: 'probor' }, [0.5, 0.5, 0.4]).outputs[0]), 1 - 0.5 * 0.5 * 0.6, 1e-15);
  });
  // MATLAB's fuzzy operators (andmethod 'min', ormethod 'max', etc.) do not clip: min(1.5, 2) = 1.5.
  it.fails('XBV-112: FUZZY_AND does not clip inputs outside [0,1] (MATLAB min(1.5, 2) = 1.5, product 1.5*2 = 3)', () => {
    near(Number(run('FUZZY_AND', { method: 'min' }, [1.5, 2]).outputs[0]), 1.5, 1e-15, 'min');
    near(Number(run('FUZZY_AND', { method: 'product' }, [1.5, 2]).outputs[0]), 3, 1e-15, 'product');
  });
  it.fails('XBV-113: FUZZY_OR does not clip inputs outside [0,1] (MATLAB max(1.5, 2) = 2; negatives kept)', () => {
    near(Number(run('FUZZY_OR', { method: 'max' }, [1.5, 2]).outputs[0]), 2, 1e-15, 'max');
    near(Number(run('FUZZY_OR', { method: 'max' }, [-0.5, -0.25]).outputs[0]), -0.25, 1e-15, 'max negative');
  });
  it.fails('XBV-114: FUZZY_NOT does not clip its input (MATLAB 1 - 1.5 = -0.5, 1 - (-2) = 3)', () => {
    near(Number(run('FUZZY_NOT', {}, [1.5]).outputs[0]), -0.5, 1e-15, '1.5');
    near(Number(run('FUZZY_NOT', {}, [-2]).outputs[0]), 3, 1e-15, '-2');
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('3. FUZZY_RULE', () => {
  const rule = (p: Record<string, unknown>, ins: number[]) => arr(run('FUZZY_RULE', p, ins).outputs);
  it('operator AND takes min, OR takes max of the antecedents (2 and 3 antecedents)', () => {
    expect(rule({ operator: 'AND' }, [0.3, 0.8, 1])[0]).toBe(0.3);
    expect(rule({ operator: 'OR' }, [0.3, 0.8, 1])[0]).toBe(0.8);
    expect(rule({ operator: 'AND', numAntecedents: 3 }, [0.6, 0.2, 0.9, 1])[0]).toBe(0.2);
    expect(rule({ operator: 'OR', numAntecedents: 3 }, [0.6, 0.2, 0.9, 1])[0]).toBe(0.9);
  });
  it("implication 'prod' gives weighted = strength * cons", () => {
    const [s, w] = rule({ operator: 'AND', implication: 'prod' }, [0.4, 0.9, 0.5]);
    near(s, 0.4, 1e-15); near(w, 0.2, 1e-15);
  });
  it.fails("XBV-115: FUZZY_RULE implication 'min' returns strength * cons instead of min(strength, cons)", () => {
    const [, w] = rule({ operator: 'AND', implication: 'min' }, [0.4, 0.9, 0.5]);
    near(w, 0.4, 1e-15, 'weighted (min)');
    const [, w2] = rule({ operator: 'OR' }, [0.2, 0.7, 0.5]);
    near(w2, 0.5, 1e-15, 'weighted (default implication, strength 0.7)');
  });
  it.fails('XBV-116: FUZZY_RULE clips antecedents outside [0,1] (MATLAB does not clip: strength min(1.5, 2) = 1.5)', () => {
    near(rule({ operator: 'AND' }, [1.5, 2, 1])[0], 1.5, 1e-15);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('4. FUZZY_DEFUZZIFY (MATLAB defuzz on the block grid linspace(range_min, range_max, length(agg)))', () => {
  const grid = (lo: number, hi: number, n: number) => Array.from({ length: n }, (_, i) => lo + (i * (hi - lo)) / (n - 1));
  const defuzz = (method: string, agg: number[], lo: number, hi: number) =>
    Number(run('FUZZY_DEFUZZIFY', { method, range_min: lo, range_max: hi }, [agg]).outputs[0]);
  const refCentroid = (x: number[], m: number[]) => m.reduce((s, v, i) => s + x[i] * v, 0) / m.reduce((s, v) => s + v, 0);
  const refBisector = (x: number[], m: number[]) => {
    const half = m.reduce((s, v) => s + v, 0) / 2; let c = 0;
    for (let i = 0; i < m.length; i++) { c += m[i]; if (c >= half) return x[i]; }
    return NaN;
  };
  const argMax = (x: number[], m: number[]) => { const mx = Math.max(...m); return x.filter((_, i) => m[i] === mx); };

  // Aggregate with a plateau of maxima (0.75 at four points) so that mom/som/lom differ.
  const n = 21;
  const x = grid(-1, 1, n);
  const agg = x.map((v) => Math.min(0.75, Math.max(0, 1 - Math.abs(v - 0.2) * 1.5)));
  it('centroid = sum(x mu)/sum(mu)', () => {
    near(defuzz('centroid', agg, -1, 1), refCentroid(x, agg), 1e-12);
  });
  it('bisector, mom, som, lom per MATLAB defuzz', () => {
    near(defuzz('bisector', agg, -1, 1), refBisector(x, agg), 1e-12, 'bisector');
    const top = argMax(x, agg);
    expect(top.length).toBeGreaterThan(1);
    near(defuzz('mom', agg, -1, 1), top.reduce((s, v) => s + v, 0) / top.length, 1e-12, 'mom');
    near(defuzz('som', agg, -1, 1), Math.min(...top), 1e-12, 'som');
    near(defuzz('lom', agg, -1, 1), Math.max(...top), 1e-12, 'lom');
  });
  it('a different range [0, 10] and resolution 11 maps the grid linearly', () => {
    const x2 = grid(0, 10, 11);
    const m = [0, 0, 0.2, 0.6, 1, 1, 0.4, 0.1, 0, 0, 0];
    near(defuzz('centroid', m, 0, 10), refCentroid(x2, m), 1e-12, 'centroid');
    near(defuzz('bisector', m, 0, 10), refBisector(x2, m), 1e-12, 'bisector');
    near(defuzz('mom', m, 0, 10), 4.5, 1e-12, 'mom');
    near(defuzz('som', m, 0, 10), 4, 1e-12, 'som');
    near(defuzz('lom', m, 0, 10), 5, 1e-12, 'lom');
  });
  it('all-zero aggregate: som/lom return the range ends (every point is a maximum), result is finite', () => {
    const z = new Array(11).fill(0);
    expect(defuzz('som', z, 0, 10)).toBe(0);
    expect(defuzz('lom', z, 0, 10)).toBe(10);
    for (const m of ['centroid', 'bisector', 'mom', 'som', 'lom']) expect(Number.isFinite(defuzz(m, z, 0, 10))).toBe(true);
  });
  // MATLAB defuzz centroid: total area 0 -> (min(x) + max(x))/2 with a warning. The block silently returns 0.
  it.fails('XBV-117: FUZZY_DEFUZZIFY centroid of an all-zero aggregate returns the mid-range (MATLAB), not 0', () => {
    expect(defuzz('centroid', new Array(11).fill(0), 0, 10)).toBe(5);
  });
  // MATLAB mom = mean(x(mf == max(mf))); for an all-zero mf every point is a maximum, so the mean is the mid-range.
  it.fails('XBV-118: FUZZY_DEFUZZIFY mom of an all-zero aggregate is the mean of all points (mid-range), not 0', () => {
    expect(defuzz('mom', new Array(11).fill(0), 0, 10)).toBe(5);
  });
  it('characterization (undocumented, not an oracle): the block uses length(agg) as the number of points and ignores `resolution`', () => {
    const m = [0, 1, 0];
    near(Number(run('FUZZY_DEFUZZIFY', { method: 'centroid', range_min: 0, range_max: 2, resolution: 101 }, [m]).outputs[0]), 1, 1e-15);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('5. FUZZY_INFERENCE_SYSTEM (Mamdani, default configuration)', () => {
  const fis = BLOCK_LIBRARY['FUZZY_INFERENCE_SYSTEM']('f', {});
  const P = fis.params as any;
  const evalMf = (x: number, mf: { type: string; params: number[] }) => {
    const q = mf.params;
    if (mf.type === 'trimf') return trimf(x, q[0], q[1], q[2]);
    throw new Error(`unexpected default MF type ${mf.type}`);
  };
  /** Mamdani reference built from the block's default MFs / rules with MATLAB MF semantics. */
  const reference = (x1: number, x2: number) => {
    const xs = [x1, x2];
    const grades = P.inputMFs.map((set: any, i: number) => set.mfs.map((mf: any) => evalMf(xs[i], mf)));
    const strengths: number[] = P.rules.map((r: any) =>
      Math.min(...r.antecedents.map((k: number, i: number) => grades[i][k])) * r.weight);
    const out = P.outputMFs[0];
    const N: number = P.defuzzResolution;
    const [lo, hi] = out.range;
    const u = Array.from({ length: N }, (_, i) => lo + (i * (hi - lo)) / (N - 1));
    const agg = u.map((y) => Math.max(0, ...P.rules.map((r: any, ri: number) => Math.min(strengths[ri], evalMf(y, out.mfs[r.consequent])))));
    const den = agg.reduce((s, v) => s + v, 0);
    const y = den > 0 ? agg.reduce((s, v, i) => s + u[i] * v, 0) / den : (lo + hi) / 2;
    return { y, strengths };
  };
  const exec = (x1: number, x2: number) => {
    const r = run('FUZZY_INFERENCE_SYSTEM', {}, [x1, x2]);
    return { y: Number(r.outputs[0]), strengths: arr(r.outputs[1]), error: r.error };
  };

  it('default configuration: 15 rules, 5x3 input MFs, 5 output MFs, resolution 101, centroid', () => {
    expect(P.rules).toHaveLength(15);   // 5 error MFs x 3 dError MFs
    expect(P.inputMFs.map((s: any) => s.mfs.length)).toEqual([5, 3]);
    expect(P.outputMFs[0].mfs).toHaveLength(5);
    expect(P.defuzzResolution).toBe(101);
    expect(P.defuzzMethod).toBe('centroid');
  });
  it('y and strengths equal the Mamdani reference at 5 input pairs (none touches a shoulder vertex)', () => {
    const pairs: [number, number][] = [[0.5, 0.2], [-0.5, 0.2], [0.5, -0.2], [0, 0], [0.25, 0.1]];
    for (const [a, b] of pairs) {
      const got = exec(a, b); const ref = reference(a, b);
      expect(got.error).toBeUndefined();
      expect(got.strengths).toHaveLength(ref.strengths.length);
      ref.strengths.forEach((s, i) => near(got.strengths[i], s, 1e-12, `strength[${i}] at (${a},${b})`));
      near(got.y, ref.y, 1e-12, `y at (${a},${b})`);
    }
  });
  it('(0, 0): only rule [Z, Z] -> consequent Z fires with strength 1 and y = 0 by symmetry', () => {
    const got = exec(0, 0);
    expect(got.strengths.filter((s) => s > 0)).toEqual([1]);
    near(got.y, 0, 1e-12);
  });
  it('no rule fires (inputs outside every MF): strengths all 0 and y is the mid-range 0 of [-1, 1]', () => {
    const got = exec(10, 10);
    expect(got.strengths.every((s) => s === 0)).toBe(true);
    near(got.y, reference(10, 10).y, 1e-12);
    near(got.y, 0, 1e-12);
  });
  it.fails('XBV-119: FUZZY_INFERENCE_SYSTEM with an empty aggregate (no rule fires) returns 0 instead of the mid-range of the output range [2, 6] (MATLAB evalfis: 4)', () => {
    const cfg = { outputMFs: [{ name: 'O', range: [2, 6], mfs: [{ name: 'A', type: 'trimf', params: [2, 4, 6] }] }],
      inputMFs: [{ name: 'e', range: [0, 1], mfs: [{ name: 'L', type: 'trimf', params: [0, 0.25, 0.5] }] }],
      numInputs: 1, rules: [{ antecedents: [0], consequent: 0, weight: 1 }] };
    expect(Number(run('FUZZY_INFERENCE_SYSTEM', cfg, [0.9]).outputs[0])).toBe(4);
  });
  it.fails('XBV-120: FUZZY_INFERENCE_SYSTEM input shoulder MF (a = b) is 0 at its vertex; MATLAB trimf(-3,[-3 -3 -1]) = 1', () => {
    // error = -3 is the vertex of NB = trimf [-3 -3 -1]; dError = -3 the vertex of N = trimf [-3 -3 0]: rule [NB, N] fires with 1.
    const ref = reference(-3, -3);
    expect(Math.max(...ref.strengths)).toBe(1);
    const got = exec(-3, -3);
    expect(Math.max(...got.strengths)).toBe(1);
    near(got.y, ref.y, 1e-12);
  });
  it.fails('XBV-121: FUZZY_INFERENCE_SYSTEM output shoulder MF (NB = trimf [-1 -1 -0.5]) is 0 at y = -1; MATLAB gives 1 so the centroid differs', () => {
    // (-0.5, -0.2): rule [NS, N] -> NB fires with strength 0.5 * 0.0667 (min of NS = 0.5, N = 0.0667); rule [Z, N] -> NS also fires.
    const got = exec(-0.5, -0.2); const ref = reference(-0.5, -0.2);
    near(got.y, ref.y, 1e-12);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('6. FUZZY_PID_CONTROLLER', () => {
  const base = { Kp_base: 1, Ki_base: 0.5, Kd_base: 0.1 };
  // Documented rule: s = Sugeno average of the output MF centres (centres 0, .25, .5, .75, 1 for 5 MFs);
  // Kx_eff = Kx_base * (lo + s (hi - lo)) with ranges Kp [0.5, 2], Ki [0.1, 1], Kd [0.01, 0.5].
  const gains = (s: number) => [1 * (0.5 + s * 1.5), 0.5 * (0.1 + s * 0.9), 0.1 * (0.01 + s * 0.49)];

  it('e = 0 and de = 0: scale factor 0.5 (rule [Z, Z] -> centre 0.5), gains equal base * mid-range', () => {
    const r = run('FUZZY_PID_CONTROLLER', {}, [0, 0, 1, 0], undefined, 0.1);
    const [kp, ki, kd] = gains(0.5);
    near(kp, 1.25, 1e-15); near(ki, 0.275, 1e-15); near(kd, 0.0255, 1e-15);
    near(Number(r.outputs[2]), kp, 1e-12, 'kp_eff');
    near(Number(r.outputs[3]), ki, 1e-12, 'ki_eff');
    near(Number(r.outputs[4]), kd, 1e-12, 'kd_eff');
    near(Number(r.outputs[0]), 0, 1e-12, 'u');
    near(Number(r.outputs[1]), 0, 1e-12, 'error');
  });
  it('gains stay inside base * [lo, hi] for a sweep of error and derror (errors beyond the universe included)', () => {
    const rnd = mulberry32(7);
    let state: unknown; let prev = 0;
    for (let k = 1; k <= 400; k++) {
      const e = (rnd() * 2 - 1) * 18;   // beyond +-10 on purpose
      const r = run('FUZZY_PID_CONTROLLER', {}, [e, 0, 1, 0], state, k * 0.05);
      state = r.nextState;
      const [kp, ki, kd] = arr(r.outputs).slice(2);
      expect(kp).toBeGreaterThanOrEqual(1 * 0.5 - 1e-12); expect(kp).toBeLessThanOrEqual(1 * 2 + 1e-12);
      expect(ki).toBeGreaterThanOrEqual(0.5 * 0.1 - 1e-12); expect(ki).toBeLessThanOrEqual(0.5 * 1 + 1e-12);
      expect(kd).toBeGreaterThanOrEqual(0.1 * 0.01 - 1e-12); expect(kd).toBeLessThanOrEqual(0.1 * 0.5 + 1e-12);
      expect(arr(r.outputs).every(Number.isFinite), `finite at step ${k} (e=${e}, prev=${prev})`).toBe(true);
      prev = e;
    }
  });
  it('one hand-computed step: e = 1, dt = 1 -> u = Kp e + Ki dt e + Kd N de/(1 + N dt)', () => {
    // e = 1 (r 1, y 0): error MFs centres -10,-5,0,5,10 -> Z 0.8, PS 0.2. de = (1-0)/1 = 1: centres step 2.5 -> Z 0.6, PS 0.4.
    // rule table [2][2]=2 (c .5), [2][3]=2 (c .5), [3][2]=1 (c .25), [3][3]=1 (c .25); strengths min: .6 .4 .2 .2.
    const s = (0.6 * 0.5 + 0.4 * 0.5 + 0.2 * 0.25 + 0.2 * 0.25) / (0.6 + 0.4 + 0.2 + 0.2);
    near(s, 0.6 / 1.4, 1e-15);
    const [kp, ki, kd] = gains(s);
    const N = 100, dt = 1, e = 1;
    const expU = kp * e + ki * e * dt + (kd * N * e) / (1 + N * dt);
    const r = run('FUZZY_PID_CONTROLLER', base, [1, 0, 1, 0], undefined, 1);
    near(Number(r.outputs[2]), kp, 1e-12, 'kp_eff'); near(Number(r.outputs[3]), ki, 1e-12, 'ki_eff');
    near(Number(r.outputs[4]), kd, 1e-12, 'kd_eff'); near(Number(r.outputs[1]), 1, 1e-15, 'error');
    near(Number(r.outputs[0]), expU, 1e-12, 'u');
    near(r.nextState.i_state, ki * e * dt, 1e-12, 'integrator state');
    near(r.nextState.d_state, (kd * N * e) / (1 + N * dt), 1e-12, 'filter state');
  });
  it('with a very large derivative filter N the D term tends to Kd de/dt', () => {
    const r = run('FUZZY_PID_CONTROLLER', { N: 1e9 }, [1, 0, 1, 0], undefined, 1);
    const [kp, ki, kd] = gains(0.6 / 1.4);
    near(Number(r.outputs[0]), kp * 1 + ki * 1 + kd * 1, 1e-6);
  });
  it('enable 0 gives zero outputs, reset 1 gives zero control with the base gains', () => {
    expect(arr(run('FUZZY_PID_CONTROLLER', {}, [1, 0, 0, 0], undefined, 1).outputs)).toEqual([0, 0, 0, 0, 0]);
    expect(arr(run('FUZZY_PID_CONTROLLER', base, [1, 0, 1, 1], undefined, 1).outputs)).toEqual([0, 0, 1, 0.5, 0.1]);
  });
  it('output limits clamp u to [min, max]', () => {
    const r = run('FUZZY_PID_CONTROLLER', { min: -2, max: 2 }, [1000, 0, 1, 0], undefined, 1);
    expect(Number(r.outputs[0])).toBe(2);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('7. LMS_ADAPTIVE_FILTER (tap layout: w1 on x(n), w2 on x(n-1); the w outputs are the weights used for y - characterization, the Simulink DSP LMS Wts timing is not verified)', () => {
  it('one step by hand: w <- w + lr err [x(n), x(n-1)]', () => {
    const r = run('LMS_ADAPTIVE_FILTER', {}, [2, 1, 0.05], { w1: 0.1, w2: 0.2, x_prev: 0.5 });
    const y = 0.1 * 2 + 0.2 * 0.5;                 // 0.3
    const err = 1 - y;                             // 0.7
    near(Number(r.outputs[0]), y, 1e-15, 'y'); near(Number(r.outputs[1]), err, 1e-15, 'err');
    near(Number(r.outputs[2]), 0.1, 1e-15, 'w1 output (weights used for y)');
    near(Number(r.outputs[3]), 0.2, 1e-15, 'w2 output');
    near(r.nextState.w1, 0.1 + 0.05 * err * 2, 1e-15, 'next w1');
    near(r.nextState.w2, 0.2 + 0.05 * err * 0.5, 1e-15, 'next w2');
    expect(r.nextState.x_prev).toBe(2);
  });
  it('learning rate 0 (input port) leaves the weights unchanged', () => {
    const r = run('LMS_ADAPTIVE_FILTER', {}, [1, 3, 0], { w1: 0.4, w2: -0.1, x_prev: 2 });
    expect(r.nextState.w1).toBe(0.4); expect(r.nextState.w2).toBe(-0.1);
  });
  it('system identification d = 0.7 x(n) - 0.3 x(n-1): weights converge to (0.7, -0.3) within 1e-3 in 2000 samples', () => {
    const rnd = mulberry32(2024);
    const b = BLOCK_LIBRARY['LMS_ADAPTIVE_FILTER']('l', {});
    let state: any = b.state; let xPrev = 0; let w1 = 0, w2 = 0, err = 0;
    for (let n = 0; n < 2000; n++) {
      const x = rnd() * 2 - 1;
      const d = 0.7 * x - 0.3 * xPrev; xPrev = x;
      const r = b.execute([x, d, 0.05] as never, b.params, state, n * 0.01);
      state = r.nextState; err = Number((r.outputs as unknown[])[1]);
    }
    w1 = state.w1; w2 = state.w2;
    near(w1, 0.7, 1e-3, 'w1'); near(w2, -0.3, 1e-3, 'w2'); near(err, 0, 1e-3, 'residual error');
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('8. NEURAL_NEURON_LEARNING (y = tanh(w1 x1 + w2 x2 + b), err = t - y, delta rule lr err (1 - y^2) x)', () => {
  it('one gradient step from the default weights (0.5, -0.5, 0) with lr 0.1', () => {
    const x1 = 1, x2 = 0.5, t = 1, lr = 0.1;
    const y = Math.tanh(0.5 * x1 - 0.5 * x2 + 0);  // tanh(0.25)
    const err = t - y; const delta = lr * err * (1 - y * y);
    const r = run('NEURAL_NEURON_LEARNING', {}, [x1, x2, t, lr]);
    near(Number(r.outputs[0]), y, 1e-15, 'y'); near(Number(r.outputs[1]), err, 1e-15, 'err');
    expect(arr(r.outputs).slice(2)).toEqual([0.5, -0.5, 0]);
    near(r.nextState.w1, 0.5 + delta * x1, 1e-15, 'w1');
    near(r.nextState.w2, -0.5 + delta * x2, 1e-15, 'w2');
    near(r.nextState.bias, 0 + delta, 1e-15, 'bias');
  });
  it('the step is a descent direction: squared error 0.5 (t - y)^2 decreases for a small lr', () => {
    const b = BLOCK_LIBRARY['NEURAL_NEURON_LEARNING']('n', {});
    let state: any = b.state; let prev = Infinity;
    for (let k = 0; k < 50; k++) {
      const r = b.execute([1, 1, -1, 0.05] as never, b.params, state, k);
      const e = Number((r.outputs as unknown[])[1]); const cost = 0.5 * e * e;
      expect(cost).toBeLessThanOrEqual(prev + 1e-15); prev = cost; state = r.nextState;
    }
  });
  it('learning rate 0 leaves weights and bias unchanged', () => {
    const r = run('NEURAL_NEURON_LEARNING', {}, [1, 1, 1, 0]);
    expect([r.nextState.w1, r.nextState.w2, r.nextState.bias]).toEqual([0.5, -0.5, 0]);
  });
  it('learns AND (inputs 0/1, bipolar targets -1/+1): |t - y| < 0.1 on all four patterns', () => {
    const patterns: [number, number, number][] = [[0, 0, -1], [0, 1, -1], [1, 0, -1], [1, 1, 1]];
    const b = BLOCK_LIBRARY['NEURAL_NEURON_LEARNING']('n', {});
    let state: any = b.state;
    for (let epoch = 0; epoch < 6000; epoch++) {
      for (const [a, c, t] of patterns) state = b.execute([a, c, t, 0.1] as never, b.params, state, 0).nextState;
    }
    for (const [a, c, t] of patterns) {
      const y = Number((b.execute([a, c, t, 0] as never, b.params, state, 0).outputs as unknown[])[0]);
      expect(Math.abs(t - y), `pattern (${a},${c}) y=${y}`).toBeLessThan(0.1);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('9. RL_Q_LEARNING_CONTROLLER (alpha 0.1, gamma 0.9, 5 states, 3 actions {-1, 0, 1})', () => {
  const seed = (s: number) => vi.spyOn(Math, 'random').mockImplementation(mulberry32(s));
  const stepper = (params: Record<string, unknown>) => {
    const b = BLOCK_LIBRARY['RL_Q_LEARNING_CONTROLLER']('q', params);
    let state: any = b.state;
    return (error: number, reward: number, reset = 0) => {
      const r = b.execute([error, reward, reset] as never, b.params, state, 0);
      state = r.nextState;
      return { action: Number((r.outputs as unknown[])[0]), maxQ: Number((r.outputs as unknown[])[1]), state };
    };
  };

  it('state bins of error: <-1 -> 0, <-0.1 -> 1, [-0.1, 0.1] -> 2, >0.1 -> 3, >1 -> 4 (boundaries belong to the inner bin)', () => {
    // Observable through the Q-table cell updated on the next call: reward 1 from Q = 0 gives Q = alpha = 0.1.
    const cases: [number, number][] = [[-5, 0], [-1.0001, 0], [-1, 1], [-0.5, 1], [-0.1001, 1], [-0.1, 2], [0, 2], [0.1, 2],
      [0.1001, 3], [1, 3], [1.0001, 4], [7, 4]];
    for (const [e, bin] of cases) {
      seed(1);
      const s = stepper({ epsilon: 0 });
      s(e, 0);
      const out = s(0, 1);   // transition from the bin of e: Q[bin][a] += 0.1 (1 + 0.9 max Q[2] - 0)
      expect(out.state.qTable[bin].some((q: number) => Math.abs(q - 0.1) < 1e-15), `error ${e} -> bin ${bin}`).toBe(true);
    }
  });
  it('Q update for three transitions by hand (epsilon 0; tie rule = lowest action index is a characterization: undocumented)', () => {
    seed(3);
    const step = stepper({ epsilon: 0 });
    // call 1: error 0 -> s = 2, Q all 0 -> tie -> action index 0 = -1, no update yet.
    let o = step(0, 0);
    expect(o.action).toBe(-1); expect(o.maxQ).toBe(0);
    // call 2: error 0.5 -> s' = 3, reward 1: Q[2][0] = 0 + 0.1 (1 + 0.9 * 0 - 0) = 0.1; action at s' = 3 (all 0) -> index 0.
    o = step(0.5, 1);
    near(o.state.qTable[2][0], 0.1, 1e-15, 'Q[2][0]');
    expect(o.action).toBe(-1); expect(o.maxQ).toBe(0);
    // call 3: error 0 -> s' = 2, reward 0: Q[3][0] = 0 + 0.1 (0 + 0.9 * max Q[2] - 0) = 0.1 * 0.9 * 0.1 = 0.009; action argmax Q[2] = index 0.
    o = step(0, 0);
    near(o.state.qTable[3][0], 0.009, 1e-15, 'Q[3][0]');
    near(o.state.qTable[2][0], 0.1, 1e-15, 'Q[2][0] unchanged');
    expect(o.action).toBe(-1); near(o.maxQ, 0.1, 1e-15, 'max_q');
    // call 4: error 0, reward -1: Q[2][0] = 0.1 + 0.1 (-1 + 0.9 * 0.1 - 0.1) = 0.1 + 0.1 * (-1.01) = -0.001; now Q[2] = [-0.001, 0, 0]: argmax index 1 -> action 0.
    o = step(0, -1);
    near(o.state.qTable[2][0], -0.001, 1e-15, 'Q[2][0] after penalty');
    expect(o.action).toBe(0); expect(o.maxQ).toBe(0);
  });
  it('epsilon 0 selects argmax Q even when the Q-table is learned toward action +1', () => {
    seed(5);
    const step = stepper({ epsilon: 0, alpha: 0.5, gamma: 0 });
    step(0, 0);                       // s = 2, action 0 (tie -> first)
    step(0, -1);                      // penalise Q[2][0] = 0.5 (-1) = -0.5 ; picks index 1 (0 > -0.5)
    const o = step(0, 0);             // Q[2][1] += 0.5 (0 - 0) = 0 ; argmax over [-0.5, 0, 0] -> first max = index 1
    expect(o.action).toBe(0);
  });
  it('epsilon 1 explores uniformly with Math.random: action index = floor(r2 * nA) from the seeded stream', () => {
    const rnd = mulberry32(11); const ref = mulberry32(11);
    vi.spyOn(Math, 'random').mockImplementation(rnd);
    const step = stepper({ epsilon: 1 });
    for (let k = 0; k < 20; k++) {
      ref();                                  // draw 1: the epsilon comparison, always < 1
      const idx = Math.floor(ref() * 3);      // draw 2: the action index
      expect(step(0, 0).action).toBe([-1, 0, 1][idx]);
    }
  });
  it('same seed gives the same trajectory (determinism)', () => {
    const trace = () => {
      seed(99); const step = stepper({ epsilon: 0.3 }); const out: number[] = [];
      for (let k = 0; k < 60; k++) out.push(step(Math.sin(k), Math.cos(k)).action);
      vi.restoreAllMocks(); return out;
    };
    expect(trace()).toEqual(trace());
  });
  it('reset = 1 clears the Q-table and the pending transition (episode), then acts from the zero table', () => {
    seed(1);
    const step = stepper({ epsilon: 0 });
    step(0, 0); step(0.5, 1); step(0, 1);
    const learned = step(0, 1);
    expect(learned.state.qTable.flat().some((q: number) => q !== 0)).toBe(true);
    const o = step(0, 5, 1);          // reward 5 must NOT be learned on the reset step
    expect(o.state.qTable.flat().every((q: number) => q === 0)).toBe(true);
    expect(o.state.hasPrev).toBe(1);  // the new episode starts with this action as the pending transition
    expect(o.maxQ).toBe(0); expect(o.action).toBe(-1);
  });
  it('alpha 0 leaves Q unchanged and alpha 1, gamma 0 sets Q to the reward', () => {
    seed(1);
    let step = stepper({ epsilon: 0, alpha: 0 });
    step(0, 0); expect(step(0, 3).state.qTable.flat().every((q: number) => q === 0)).toBe(true);
    step = stepper({ epsilon: 0, alpha: 1, gamma: 0 });
    step(0, 0); near(step(0, 3).state.qTable[2][0], 3, 1e-15);
  });
});
