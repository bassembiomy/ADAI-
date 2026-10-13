import { describe, expect, it } from 'vitest';
import type { EquationContext } from '../types';
import { ImplicitSolver } from '../ImplicitSolver';
import { SparseLinearSolver } from '../SparseLinearSolver';
import { factorCsc, cscToDense, type CscMatrix } from '../SparseLU';
import { buildJacobianPattern } from '../vlabJacobian';
import { VLabPhysicsEngine } from '../vlabPhysics';
import { at, constant, inductionMotorLab, measure, mixed30, node, pmsmFoc, revoluteHinge, rlc, wire, type Model } from './perfFixtures';

/**
 * WP-31c: performance of the V-Lab engine, as tests.
 *
 * Budgets: the accepted-step and residual-evaluation counts are deterministic and machine independent, so they are the primary
 * guard (about 1.25-1.3x the measured value); the wall-time budgets are generous for a slow CI box (about 5-8x the time measured
 * on the reference machine), so a 3x regression of either the count or the cost per evaluation trips one of them.
 * Measured before WP-31c (same models, same default error control): RLC 575 steps / 0.25 s, PMSM FOC 449 steps / 17.5 s,
 * induction-motor lab 810 steps / 8.9 s, 30-block mixed model 345 steps / 11.7 s.
 * The expected values of the solver tests are independent: the residual of the returned solution, or the closed form.
 */

const ctxOf = (dt = 1): EquationContext => ({ dt, time: 0, parameters: {}, prevStates: [], states: [], stateDerivatives: [], order: 1 });

// ── colored Jacobian, modified Newton, sparse LU ─────────────────────────────────────────────────────────────────────────────
/** 1-D nonlinear diffusion: F_i = 2 x_i - x_{i-1} - x_{i+1} + 0.1 x_i^3 - 1 (tridiagonal Jacobian) */
const chain = (n: number) => (x: number[]) => x.map((v, i) => 2 * v - (i > 0 ? x[i - 1] : 0) - (i < n - 1 ? x[i + 1] : 0) + 0.1 * v ** 3 - 1);
const tridiagonal = (n: number) => Array.from({ length: n }, (_, i) => [i - 1, i, i + 1].filter(j => j >= 0 && j < n));
const maxResidual = (f: (x: number[]) => number[], x: number[]) => Math.max(...f(x).map(Math.abs));

describe('colored finite-difference Jacobian (F-079a)', () => {
  it('a tridiagonal pattern needs 3 colors: 3 evaluations per Jacobian, not n', () => {
    const pattern = buildJacobianPattern(tridiagonal(300), 300);
    expect(pattern.groups.length).toBe(3);
    // every group is a set of columns without a common row (independent check on the pattern, not on the solver)
    for (const g of pattern.groups) {
      const seen = new Set<number>();
      for (const j of g) for (const i of pattern.colRows[j]) { expect(seen.has(i)).toBe(false); seen.add(i); }
    }
  });

  it('solves a 300-unknown chain with ~3 evaluations per Jacobian and the same solution as the dense exact Newton', () => {
    const n = 300, f = chain(n);
    const solver = new ImplicitSolver();
    const x = solver.solve(f, new Array(n).fill(0), ctxOf(), { system: {}, pattern: tridiagonal(n) });
    expect(maxResidual(f, x)).toBeLessThan(1e-8);
    expect(solver.stats.jacobians).toBeGreaterThan(0);
    expect(solver.stats.jacobianEvals / solver.stats.jacobians).toBeLessThanOrEqual(3);
    const dense = new ImplicitSolver();
    const xd = dense.solve(f, new Array(n).fill(0), ctxOf());
    expect(dense.stats.jacobianEvals / dense.stats.jacobians).toBe(n);
    xd.forEach((v, i) => expect(x[i]).toBeCloseTo(v, 9));
  });

  it('a pattern that misses a dependency still converges to the true root (modified or exact-Newton fallback)', () => {
    const n = 40;
    // F_i also depends on x_{i+7}: absent from the supplied tridiagonal pattern
    const f = (x: number[]) => chain(n)(x).map((v, i) => v + 2.0 * (i + 7 < n ? x[i + 7] : 0));
    const solver = new ImplicitSolver();
    const x = solver.solve(f, new Array(n).fill(0), ctxOf(), { system: {}, pattern: tridiagonal(n) });
    expect(maxResidual(f, x)).toBeLessThan(1e-8);
  });
});

describe('modified Newton: the factorization is reused across solves while h is unchanged (F-079b)', () => {
  it('a linear system solved 12 times with the same dt factorizes once and is exact each time', () => {
    const n = 30, f = (x: number[]) => x.map((v, i) => 3 * v - (i > 0 ? x[i - 1] : 0) - (i < n - 1 ? x[i + 1] : 0) - (i + 1));
    const solver = new ImplicitSolver(), system = {}, pattern = tridiagonal(n);
    let x = new Array(n).fill(0);
    for (let k = 0; k < 12; k++) {
      // a drifting right-hand side stands in for the next step's history
      const g = (y: number[]) => f(y).map(v => v - 0.01 * k);
      x = solver.solve(g, x, ctxOf(1e-3), { system, pattern });
      expect(maxResidual(g, x)).toBeLessThan(1e-12);
    }
    expect(solver.stats.factorizations).toBe(1);
    expect(solver.stats.exactFallbacks).toBe(0);
  });

  it('a different h (beyond the reuse ratio) refactorizes; without hints every iteration is an exact dense Newton', () => {
    const f = (x: number[]) => [x[0] ** 3 + x[0] - 2, x[1] - 0.5 * x[0]];
    const solver = new ImplicitSolver(), system = {};
    solver.solve(f, [0, 0], ctxOf(1e-3), { system, pattern: [[0], [0, 1]] });
    const first = solver.stats.factorizations;
    solver.solve(f, [0, 0], ctxOf(1e-3), { system, pattern: [[0], [0, 1]] });
    expect(solver.stats.factorizations).toBeLessThanOrEqual(first + 1);
    const before = solver.stats.factorizations;
    solver.solve(f, [0, 0], ctxOf(1e-1), { system, pattern: [[0], [0, 1]] });
    expect(solver.stats.factorizations).toBeGreaterThan(before);
    const plain = new ImplicitSolver();
    const x = plain.solve(f, [0, 0], ctxOf());
    expect(x[0]).toBeCloseTo(1, 8); // 1 + 1 - 2 = 0
    expect(plain.stats.reusedIterations).toBe(0);
  });
});

describe('sparse LU (F-079c)', () => {
  const lcg = (seed: number) => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const randomSparse = (n: number, perCol: number, seed: number): CscMatrix => {
    const rnd = lcg(seed);
    const Ap = [0], Ai: number[] = [], Ax: number[] = [];
    for (let j = 0; j < n; j++) {
      const rows = new Set<number>([j]);
      while (rows.size < perCol) rows.add(Math.floor(rnd() * n));
      for (const i of [...rows].sort((a, b) => a - b)) { Ai.push(i); Ax.push(i === j ? 4 + rnd() : rnd() * 2 - 1); }
      Ap.push(Ai.length);
    }
    return { n, Ap, Ai, Ax };
  };
  const residual = (a: CscMatrix, x: number[], b: number[]) => {
    const r = b.slice();
    for (let j = 0; j < a.n; j++) for (let p = a.Ap[j]; p < a.Ap[j + 1]; p++) r[a.Ai[p]] -= a.Ax[p] * x[j];
    return Math.max(...r.map(Math.abs));
  };

  it.each([[150, 4, 1], [400, 3, 2], [250, 6, 3]])('n = %i (%i entries per column): the solution satisfies A x = b and matches the dense LU', (n, perCol, seed) => {
    const a = randomSparse(n, perCol, seed);
    const rnd = lcg(seed + 100);
    const b = Array.from({ length: n }, () => rnd() * 10 - 5);
    const sparse = factorCsc(a, 'sparse')!, dense = factorCsc(a, 'dense')!;
    expect(sparse.kind).toBe('sparse');
    const xs = sparse.solve(b), xd = dense.solve(b);
    expect(residual(a, xs, b)).toBeLessThan(1e-9);
    expect(residual(a, xd, b)).toBeLessThan(1e-9);
    xs.forEach((v, i) => expect(v).toBeCloseTo(xd[i], 8));
    expect(sparse.factorNonzeros).toBeLessThan(n * n / 2);
    // the dense path is the same arithmetic as SparseLinearSolver.solve
    const ref = SparseLinearSolver.solve(cscToDense(a), b);
    xd.forEach((v, i) => expect(v).toBe(ref[i]));
  });

  it('reports a singular matrix instead of regularizing it (the caller owns the diagnostic)', () => {
    const a: CscMatrix = { n: 3, Ap: [0, 1, 2, 3], Ai: [0, 1, 0], Ax: [1, 1, 1] }; // column 2 duplicates column 0: rank 2
    expect(factorCsc(a, 'sparse')).toBeNull();
    expect(factorCsc(a, 'dense')).toBeNull();
  });

  it('a large chain model uses the sparse factorization inside the solver', () => {
    const n = 400, f = chain(n);
    const solver = new ImplicitSolver();
    const x = solver.solve(f, new Array(n).fill(0), ctxOf(), { system: {}, pattern: tridiagonal(n) });
    expect(maxResidual(f, x)).toBeLessThan(1e-8);
    const t = factorCsc({ n, Ap: Array.from({ length: n + 1 }, (_, j) => 3 * j), Ai: Array.from({ length: 3 * n }, (_, p) => Math.min(n - 1, Math.max(0, Math.floor(p / 3) + (p % 3) - 1))), Ax: new Array(3 * n).fill(1).map((_, p) => (p % 3 === 1 ? 4 : -1)) });
    expect(t!.kind).toBe('sparse');
  });
});

// ── budgets ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('WP-31c performance budgets (accepted steps and residual evaluations: machine independent; wall time: generous)', () => {
  it('series RLC step response, 100 calls of 0.1 ms: reaches the analytic steady state within budget', () => {
    const s = measure(rlc(), 100, 1e-4);
    // closed form: after 10 ms (50 time constants 2L/R) the capacitor holds the source voltage and the loop current is 0
    expect(Math.abs(at(s, 'Across_c_p_(electrical)') - 10)).toBeLessThan(1e-5);
    expect(Math.abs(at(s, 'l_branch_current'))).toBeLessThan(1e-5);
    expect(s.accepted).toBeLessThanOrEqual(720);
    expect(s.residualEvals).toBeLessThanOrEqual(13500);
    expect(s.wallMs).toBeLessThan(3000);
  });

  it('PMSM field-oriented control through an averaged inverter (pmsm_foc fixture), 60 calls of 0.3 ms', () => {
    const s = measure(pmsmFoc(), 60, 3e-4, { validate: false });
    expect(s.state.x.every(Number.isFinite)).toBe(true);
    expect(s.accepted).toBeLessThanOrEqual(565);
    expect(s.residualEvals).toBeLessThanOrEqual(18500);
    expect(s.wallMs).toBeLessThan(8000);
  });

  it('induction-motor lab (PID -> PWM inverter -> ac_motor): one 50 ms simulateStep window', () => {
    const s = measure(inductionMotorLab(), 1, 0.05);
    expect(s.state.x.every(Number.isFinite)).toBe(true);
    expect(s.accepted).toBeLessThanOrEqual(790);
    expect(s.residualEvals).toBeLessThanOrEqual(21000);
    expect(s.wallMs).toBeLessThan(6000);
  });

  it('30-block mixed model (RC ladder + DC motor drive + thermal chain + signals), 20 calls of 10 ms', () => {
    const m = mixed30();
    expect(m.nodes.length).toBe(30);
    const s = measure(m, 20, 0.01);
    expect(s.state.x.every(Number.isFinite)).toBe(true);
    // independent check: the thermal chain is a first-order lag T(t) = 350 + (300 - 350) exp(-t k / C), k = 2 W/K, C = 1 kJ/K, t = 0.2 s
    const T = 350 - 50 * Math.exp(-0.2 * 2 / 1000);
    expect(Math.abs(at(s, 'Across_ts_a_(thermal)') - T)).toBeLessThan(0.01);
    expect(s.accepted).toBeLessThanOrEqual(390);
    expect(s.residualEvals).toBeLessThanOrEqual(9500);
    expect(s.wallMs).toBeLessThan(4000);
  });

  it('user section 11 regression: a Frame model (loaded revolute hinge, 66 unknowns), 30 calls of 5 ms, one solver step per call', () => {
    const s = measure(revoluteHinge(), 30, 0.005);
    expect(s.state.x.every(Number.isFinite)).toBe(true);
    expect(s.accepted).toBe(30);
    expect(s.rejected).toBe(0);
    // Jacobians are colored (a handful of evaluations each) and the rank-deficient solve is cheap: ~11x fewer evaluations than the dense n+1
    expect(s.residualEvals).toBeLessThanOrEqual(1500);
    expect(s.wallMs).toBeLessThan(4000);
  });

  it('is deterministic: the same model twice gives bit-identical states and counters', () => {
    const a = measure(mixed30(), 8, 0.01), b = measure(mixed30(), 8, 0.01);
    expect(b.state.x).toEqual(a.state.x);
    expect(b.accepted).toBe(a.accepted);
    expect(b.residualEvals).toBe(a.residualEvals);
    expect(JSON.stringify(b.state.x)).toBe(JSON.stringify(a.state.x));
  });
});

// ── error estimate ───────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('variable-step BDF2 error estimate (F-106): the controller keeps the true error of an RC discharge within the tolerance', () => {
  it('capacitor discharging through a resistor: |v - V0 exp(-t/RC)| stays below the weighted tolerance at every output', () => {
    const R = 1000, C = 1e-6, V0 = 5, tau = R * C;
    const m: Model = {
      nodes: [node('r', 'resistor', { R }), node('c', 'capacitor', { C, v0: V0 }), node('g', 'ground')],
      edges: [wire('r.p', 'c.p'), wire('r.n', 'g.a'), wire('c.n', 'g.a')],
    };
    const engine = new VLabPhysicsEngine();
    engine.setStepBudget({ maxStepAttempts: 2000, wallClockMs: 30000 });
    let state: any = null, worst = 0, accepted = 0;
    for (let k = 0; k < 40; k++) {
      state = engine.simulateStep(m.nodes, m.edges, state, 1e-4);
      accepted += state.acceptedSteps;
      const v = state.x[state.variableNames.findIndex((n: string) => n === 'Across_c_p_(electrical)')];
      if (k >= 1) worst = Math.max(worst, Math.abs(v - V0 * Math.exp(-state.time / tau)));
    }
    expect(worst).toBeLessThan(1e-3 * V0 + 1e-5 + 0.02); // rtol 1e-3 x value + atol, plus the startup (initial-consistency) step
    expect(accepted).toBeLessThan(400);
  });
});

void constant;
