/**
 * WP-B3 review (XBV-436): a loop whose function is undefined on one side of the iterate must still be solved.
 *
 * The WP-B3 verifier found that the NLEQ-ERR port dropped the old engine's one-sided finite-difference fallback: for
 * y = sqrt(y) + c from a zero start, F(-h) is NaN, the central-difference Jacobian is null and the solve stops at once with
 * ALGEBRAIC_LOOP_NOT_CONVERGED. The engine before WP-B3 (6b5f2875~1) solved every case below.
 *
 * ORACLE (hand): with w = sqrt(y), y = w + c gives w^2 - w - c = 0, so w = (1 -/+ sqrt(1 + 4c)) / 2 and y = w^2. For
 * c < 0 both roots are real and positive; the engine may land on either, so the test accepts either root, within
 * algTol (1 + |y*|), and also checks the residual |y - sqrt(y) - c| directly so a non-root can never pass.
 */
import { describe, expect, it } from 'vitest';
import { XbridgesEngine } from '../XbridgesEngine';
import { buildModel, type ModelSpec } from '../testkit';

const sqrtLoop = (c: number): ModelSpec => ({
  blocks: [
    { id: 'e', type: 'Constant', params: { value: 0.5 } }, { id: 'c', type: 'Constant', params: { value: c } },
    { id: 'pw', type: 'VectorPow' }, { id: 's', type: 'Sum', params: { signs: '++' } },
  ],
  wires: ['s.out -> pw.in1', 'e.out -> pw.in2', 'pw.out -> s.in1', 'c.out -> s.in2'],
});

const roots = (c: number) => [(1 - Math.sqrt(1 + 4 * c)) / 2, (1 + Math.sqrt(1 + 4 * c)) / 2].filter((w) => w >= 0).map((w) => w * w);

const solve = (spec: ModelSpec, algTol = 1e-6) => {
  const e = new XbridgesEngine(buildModel(spec));
  e.options = { solver: 'rk4', fixedStep: 0.1, startTime: 0, stopTime: 0.5, algTol } as never;
  const compile = e.compile(0);
  e.computeOutputs(0);
  const codes = [...compile, ...e.diagnostics].filter((d) => d.severity === 'error').map((d) => d.code);
  return { y: Number(e.getSignalValue('s', 'out')), codes, fatal: e.hasFatalError() };
};

describe('loops undefined on one side of the iterate (y = sqrt(y) + c from a zero start)', () => {
  it('the oracle: each listed root satisfies y = sqrt(y) + c', () => {
    for (const c of [-0.001, -0.0031, -0.1, -0.2, 0.1]) for (const y of roots(c)) expect(Math.abs(Math.sqrt(y) + c - y), `c ${c} y ${y}`).toBeLessThan(1e-15);
  });
  for (const c of [-0.001, -0.0031, -0.1, -0.2, 0.1]) {
    it(`c = ${c}: converges to a root (one of ${roots(c).map((r) => r.toPrecision(6)).join(', ')}), no error`, () => {
      const r = solve(sqrtLoop(c));
      expect(r.codes, `y = ${r.y}`).toEqual([]);
      expect(r.fatal).toBe(false);
      const nearest = roots(c).reduce((a, b) => (Math.abs(b - r.y) < Math.abs(a - r.y) ? b : a));
      expect(Math.abs(r.y - nearest), `y = ${r.y}, nearest root ${nearest}`).toBeLessThanOrEqual(1e-6 * (1 + nearest));
      expect(r.y).toBeGreaterThanOrEqual(0);
      // residual g = F(y) - y = sqrt(y) + c - y; a solution error delta gives |g| ~ |F'(y) - 1| delta with F' = 1 / (2 sqrt y),
      // so the bound is (1 + |F'|) algTol (1 + |y*|) (about 475x near the small root of c = -0.001).
      const slope = 1 / (2 * Math.sqrt(Math.max(r.y, Number.MIN_VALUE)));
      expect(Math.abs(Math.sqrt(r.y) + c - r.y), 'residual').toBeLessThanOrEqual((1 + slope) * 1e-6 * (1 + nearest));
    });
  }
});
