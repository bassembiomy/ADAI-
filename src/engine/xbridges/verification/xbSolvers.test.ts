/**
 * WP-12 part A — solver verification (plan section 5.1): order of convergence, polynomial exactness, stiff stability,
 * algebraic loops under every solver, dispatcher agreement, and edge inputs of the batch runner.
 * Plan: docs/superpowers/plans/2026-11-10-xbridges-full-verification.md.
 *
 * Oracles (plan section 3): closed-form solutions of linear ODEs; Taylor polynomials t^k / k!; the analytic fixed point
 * of an algebraic loop. "Canvas" runs use the test kit, which reproduces the canvas live loop exactly (WP-02).
 * Adaptive error control (decision D3) is WP-12 part B.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { XbridgesEngine } from '../XbridgesEngine';
import { Solvers } from '../Solvers';
import { buildModel, runModel } from '../testkit';

type Spec = Parameters<typeof buildModel>[0];
const last = (r: ReturnType<typeof runModel>, probe: string) => Number(r.signals[probe][r.signals[probe].length - 1]);
const errorsOf = (r: ReturnType<typeof runModel>) => r.diagnostics.filter((d) => d.severity === 'error');

/** x' = -x, x(0) = 1. Exact: x(t) = e^-t. */
const DECAY: Spec = {
  blocks: [{ id: 'x', type: 'Integrator', params: { initialCondition: 1 } }, { id: 'g', type: 'GAIN', params: { gain: -1 } }],
  wires: ['x.out -> g.u', 'g.y -> x.in'],
};
/** x1' = x2, x2' = -x1, (1, 0). Exact: x1 = cos t. */
const OSCILLATOR: Spec = {
  blocks: [
    { id: 'x1', type: 'Integrator', params: { initialCondition: 1 } },
    { id: 'x2', type: 'Integrator', params: { initialCondition: 0 } },
    { id: 'g', type: 'GAIN', params: { gain: -1 } },
  ],
  wires: ['x1.out -> g.u', 'g.y -> x2.in', 'x2.out -> x1.in'],
};
/** x' = sin t, x(0) = 0 (non-autonomous; the source is WaveformGen sine at 1/(2 pi) Hz). Exact: x(1) = 1 - cos 1. */
const FORCED: Spec = {
  blocks: [
    { id: 'w', type: 'WaveformGen', params: { type: 'Sine', amp: 1, freq: 1 / (2 * Math.PI), offset: 0, phase: 0 } },
    { id: 'x', type: 'Integrator', params: { initialCondition: 0 } },
  ],
  wires: ['w.out -> x.in'],
};
/** x' = -x^2, x(0) = 1 (nonlinear). Exact: x(t) = 1 / (1 + t), x(1) = 0.5. */
const NONLINEAR: Spec = {
  blocks: [
    { id: 'x', type: 'Integrator', params: { initialCondition: 1 } },
    { id: 'p', type: 'PRODUCT' },
    { id: 'g', type: 'GAIN', params: { gain: -1 } },
  ],
  wires: ['x.out -> p.in1', 'x.out -> p.in2', 'p.y -> g.u', 'g.y -> x.in'],
};
/** x' = sin t - x, x(0) = 1: f depends on both t and x (kills c_i defects with b_i = 0, e.g. the DP c2).
 *  Exact: x(t) = (sin t - cos t)/2 + 1.5 e^-t. */
const MIXED: Spec = {
  blocks: [
    { id: 'w', type: 'WaveformGen', params: { type: 'Sine', amp: 1, freq: 1 / (2 * Math.PI), offset: 0, phase: 0 } },
    { id: 's', type: 'Sum', params: { signs: '+-' } },
    { id: 'x', type: 'Integrator', params: { initialCondition: 1 } },
  ],
  wires: ['w.out -> s.in1', 'x.out -> s.in2', 's.out -> x.in'],
};
/** Integrator chain driven by 1: x_k(t) = t^k / k!, k = 1..7. */
const CHAIN: Spec = {
  blocks: [
    { id: 'one', type: 'Constant', params: { value: 1 } },
    ...[1, 2, 3, 4, 5, 6, 7].map((k) => ({ id: `x${k}`, type: 'Integrator', params: { initialCondition: 0 } })),
  ],
  wires: ['one.out -> x1.in', ...[2, 3, 4, 5, 6, 7].map((k) => `x${k - 1}.out -> x${k}.in`)],
};
const factorial = (k: number): number => (k <= 1 ? 1 : k * factorial(k - 1));

const ORDER: Record<string, number> = { euler: 1, ode2: 2, ode3: 3, rk4: 4, ode5: 5, ode14x: 4 };

const observedOrder = (solver: string, spec: Spec, probe: string, exact: number, steps: number[]) => {
  const errs = steps.map((dt) => Math.abs(last(runModel(buildModel(spec), { solver, dt, stopTime: 1, probes: [probe] }), probe) - exact));
  return errs.slice(1).map((e, i) => Math.log2(errs[i] / e));
};

describe('order of convergence of the canvas fixed-step solvers', () => {
  // Four problems: linear autonomous (decay, oscillator), non-autonomous (forced) and nonlinear. Linear autonomous
  // problems alone only check b.A^(k-1).e = 1/k! and miss wrong c_i or nonlinear-order conditions (WP-12 verifier).
  const PROBLEMS = {
    decay: { spec: DECAY, probe: 'x.out', exact: Math.exp(-1) },
    oscillator: { spec: OSCILLATOR, probe: 'x1.out', exact: Math.cos(1) },
    forced: { spec: FORCED, probe: 'x.out', exact: 1 - Math.cos(1) },
    nonlinear: { spec: NONLINEAR, probe: 'x.out', exact: 0.5 },
    mixed: { spec: MIXED, probe: 'x.out', exact: (Math.sin(1) - Math.cos(1)) / 2 + 1.5 * Math.exp(-1) },
  } as const;
  // Step sequences in the asymptotic range and clear of round-off (errors stay above about 1e-13 at the finest step),
  // chosen from measured error tables of the current solvers (controller, WP-12 part A rework).
  const DEFAULT_STEPS = [0.1, 0.05, 0.025, 0.0125];
  const STEPS: Record<string, Partial<Record<keyof typeof PROBLEMS, number[]>>> = {
    ode5: { decay: [0.1, 0.05, 0.025], oscillator: [0.1, 0.05, 0.025], forced: [0.2, 0.1, 0.05], nonlinear: [0.1, 0.05, 0.025], mixed: [0.1, 0.05, 0.025] },
    ode14x: { decay: [0.025, 0.0125, 0.00625, 0.003125], oscillator: [0.025, 0.0125, 0.00625, 0.003125], nonlinear: [0.025, 0.0125, 0.00625, 0.003125], mixed: [0.025, 0.0125, 0.00625, 0.003125] },
  };
  for (const [solver, p] of Object.entries(ORDER)) {
    it(`${solver}: order ${p} on linear, forced and nonlinear problems`, () => {
      // Every halving shows at least order p - 0.15 (a lost order fails: verified with single-coefficient mutants of every
      // tableau). The finest pair stays below p + 1: convergence from above (ode5 nonlinear reads 5.56 at 0.05 -> 0.025)
      // is harmless, the bound only catches a broken measurement.
      for (const [name, prob] of Object.entries(PROBLEMS) as [keyof typeof PROBLEMS, (typeof PROBLEMS)[keyof typeof PROBLEMS]][]) {
        const qs = observedOrder(solver, prob.spec, prob.probe, prob.exact, STEPS[solver]?.[name] ?? DEFAULT_STEPS);
        for (const q of qs) expect(q, `${solver} ${name} orders ${qs.join(', ')}`).toBeGreaterThan(p - 0.15);
        expect(qs[qs.length - 1], `${solver} ${name} orders ${qs.join(', ')}`).toBeLessThan(p + 1);
      }
    });
  }
});

describe('polynomial exactness (Butcher-tableau check)', () => {
  // A method of order p integrates the chain exactly up to x_p = t^p / p! and not beyond.
  for (const [solver, p] of Object.entries(ORDER)) {
    it(`${solver}: x_k(1) = 1/k! exactly for k <= ${p}, not for k = ${p + 1}`, () => {
      const probes = [1, 2, 3, 4, 5, 6, 7].map((k) => `x${k}.out`);
      const r = runModel(buildModel(CHAIN), { solver, dt: 0.5, stopTime: 1, probes });
      expect(errorsOf(r)).toEqual([]);
      for (let k = 1; k <= p; k++) expect(Math.abs(last(r, `x${k}.out`) - 1 / factorial(k)), `${solver} x${k}`).toBeLessThan(1e-14);
      expect(Math.abs(last(r, `x${p + 1}.out`) - 1 / factorial(p + 1)), `${solver} x${p + 1} should not be exact`).toBeGreaterThan(1e-10);
    });
  }
});

describe('stiff problems', () => {
  /** x' = -1e4 x, x(0) = 1, dt = 0.01 (h * lambda = -100). Exact x(1) is 0 to machine precision. */
  const STIFF: Spec = {
    blocks: [{ id: 'x', type: 'Integrator', params: { initialCondition: 1 } }, { id: 'g', type: 'GAIN', params: { gain: -1e4 } }],
    wires: ['x.out -> g.u', 'g.y -> x.in'],
  };
  it('the problem is stiff: explicit rk4 diverges at dt = 0.01', () => {
    const x = last(runModel(buildModel(STIFF), { solver: 'rk4', dt: 0.01, stopTime: 1, probes: ['x.out'] }), 'x.out');
    expect(!Number.isFinite(x) || Math.abs(x) > 1e6).toBe(true);
  });
  const stable = (solver: string) => () => {
      const r = runModel(buildModel(STIFF), { solver, dt: 0.01, stopTime: 1, probes: ['x.out'] });
      const xs = r.signals['x.out'].map(Number);
      expect(xs.every(Number.isFinite)).toBe(true);
      expect(Math.abs(xs[xs.length - 1])).toBeLessThan(1e-6);
      for (let i = 1; i < xs.length; i++) expect(Math.abs(xs[i])).toBeLessThanOrEqual(Math.abs(xs[i - 1]) + 1e-15);
  };
  it('ode14x stays stable and decays monotonically to 0 at dt = 0.01', stable('ode14x'));
  // The canvas calls StiffSolver.stepODE23TB once per output step and ignores { accepted: false }: a rejected step
  // leaves the state unchanged, silently, at every step size (x stays 1 for dt = 0.01, 0.001, 1e-4).
  it.fails('XBV-026: ode23tb stays stable and decays monotonically to 0 at dt = 0.01', stable('ode23tb'));
  it.fails('XBV-026: ode23tb also freezes on a non-stiff problem when the first step is rejected (x\' = -x, dt 0.5)', () => {
    const r = runModel(buildModel(DECAY), { solver: 'ode23tb', dt: 0.5, stopTime: 1, probes: ['x.out'] });
    expect(Math.abs(Number(r.signals['x.out'].at(-1)) - Math.exp(-1))).toBeLessThan(1e-2);
  });
});

describe('algebraic loop under every solver', () => {
  /** y = 1 + 0.5 y  =>  y = 2 (analytic fixed point); its integral over [0, 1] is 2. */
  const LOOP: Spec = {
    blocks: [
      { id: 'one', type: 'Constant', params: { value: 1 } },
      { id: 's', type: 'Sum', params: { signs: '++' } },
      { id: 'h', type: 'GAIN', params: { gain: 0.5 } },
      { id: 'i', type: 'Integrator', params: { initialCondition: 0 } },
    ],
    wires: ['one.out -> s.in1', 's.out -> h.u', 'h.y -> s.in2', 's.out -> i.in'],
  };
  for (const solver of ['euler', 'ode2', 'ode3', 'rk4', 'ode5', 'ode23', 'ode45']) {
    it(`${solver}: loop output 2 and integral 2 at t = 1`, () => {
      const r = runModel(buildModel(LOOP), { solver, dt: 0.1, stopTime: 1, probes: ['s.out', 'i.out'] });
      expect(Math.abs(last(r, 's.out') - 2)).toBeLessThan(1e-6);
      expect(Math.abs(last(r, 'i.out') - 2)).toBeLessThan(1e-6);
    });
  }
  for (const solver of ['ode14x', 'ode23tb']) {
    it.fails(`XBV-016: ${solver}: loop output 2 and integral 2 at t = 1`, () => {
      const r = runModel(buildModel(LOOP), { solver, dt: 0.1, stopTime: 1, probes: ['s.out', 'i.out'] });
      expect(Math.abs(last(r, 's.out') - 2)).toBeLessThan(1e-6);
      expect(Math.abs(last(r, 'i.out') - 2)).toBeLessThan(1e-6);
    });
  }
});

describe('the three solver dispatchers agree (plan F2)', () => {
  const root = join(__dirname, '../../../..');
  /** Extracts "name -> stepper" pairs such as `solverType === 'ode3') Solvers.stepODE3` or `solver === 'ode3') { this.runODE3`. */
  const mapping = (file: string, variable: string) => {
    const text = readFileSync(join(root, file), 'utf8');
    const pairs: Record<string, string> = {};
    const re = new RegExp(`${variable} === '([A-Za-z0-9]+)'(?: \\|\\| ${variable} === '([A-Za-z0-9]+)')*\\)\\s*\\{?\\s*(?:this|Solvers|AdaptiveSolver|StiffSolver)\\.(?:step|run)([A-Za-z0-9]+)`, 'g');
    for (const m of text.matchAll(re)) {
      const names = [...m[0].matchAll(/'([A-Za-z0-9]+)'/g)].map((x) => x[1]);
      for (const n of names) pairs[n] = m[3].toUpperCase();
    }
    return pairs;
  };
  it('canvas (XbridgesWorkspace.tsx), worker (xbridgesWorker.ts) and batch (Solvers.runFixedStep) map each canvas solver to the same method', () => {
    const canvas = mapping('src/components/xbridges/XbridgesWorkspace.tsx', 'solverType');
    const worker = mapping('src/engine/xbridges/xbridgesWorker.ts', 'solver');
    const batch = mapping('src/engine/xbridges/Solvers.ts', 'solver');
    const names = ['rk4', 'ode2', 'ode3', 'ode5', 'ode23', 'ode45', 'ode14x', 'ode23tb', 'discrete'];
    for (const n of names) {
      expect(canvas[n], `canvas ${n}`).toBeDefined();
      expect(worker[n], `worker ${n}`).toBe(canvas[n]);
      expect(batch[n], `batch ${n}`).toBe(canvas[n]);
    }
    expect(batch.euler).toBe('EULER');
  });

  it('canvas and worker pass the same arguments to every stepper (e.g. ode23tb tolerances)', () => {
    const calls = (file: string, engineVar: string) => {
      const text = readFileSync(join(root, file), 'utf8');
      return [...text.matchAll(/(Solvers|AdaptiveSolver|StiffSolver)\.(step[A-Za-z0-9]+)\(([^;]*?)\);/g)]
        .map((m) => `${m[1]}.${m[2]}(${m[3].replace(new RegExp(`\\b${engineVar}\\b`, 'g'), 'E').replace(/\b(t|currentTime|timeRef\.current)\b/g, 'T').replace(/\b(dt|stepNow)\b/g, 'H').replace(/\s+/g, '')})`);
    };
    const canvas = new Set(calls('src/components/xbridges/XbridgesWorkspace.tsx', 'engine'));
    const worker = new Set(calls('src/engine/xbridges/xbridgesWorker.ts', 'workerEngine'));
    expect(canvas.size, 'canvas stepper calls parsed').toBe(10);
    expect(worker.size, 'worker stepper calls parsed').toBe(10);
    for (const c of worker) expect(canvas.has(c), `worker call ${c} has no identical canvas call`).toBe(true);
  });

  it.fails('XBV-028: canvas and worker refuse an unknown solver name instead of silently running Euler (decision D3)', () => {
    for (const file of ['src/components/xbridges/XbridgesWorkspace.tsx', 'src/engine/xbridges/xbridgesWorker.ts']) {
      const text = readFileSync(join(root, file), 'utf8');
      expect(/else\s+Solvers\.stepEuler\(/.test(text), `${file} falls back to Euler`).toBe(false);
    }
  });
});

describe('batch runner edge inputs (Solvers.runFixedStep)', () => {
  const run = (options: Record<string, unknown>) => {
    const engine = new XbridgesEngine(buildModel(DECAY));
    Solvers.runFixedStep(engine, { solver: 'rk4', startTime: 0, stopTime: 1, fixedStep: 0.1, ...options } as never);
    return engine;
  };
  for (const fixedStep of [0, -0.1, Number.NaN]) {
    it(`fixed step ${fixedStep} is refused with FIXED_STEP_INVALID`, () => {
      expect(run({ fixedStep }).diagnostics.filter((d) => d.severity === 'error').map((d) => d.code)).toContain('FIXED_STEP_INVALID');
    });
  }
  it('stop before start is refused with STOP_TIME_BEFORE_START', () => {
    expect(run({ startTime: 1, stopTime: 0.5 }).diagnostics.map((d) => d.code)).toContain('STOP_TIME_BEFORE_START');
  });
  it('an unknown solver name is refused with UNSUPPORTED_SOLVER', () => {
    expect(run({ solver: 'ode113' }).diagnostics.map((d) => d.code)).toContain('UNSUPPORTED_SOLVER');
  });
  it('a non-zero start time integrates over [start, stop] only: x(3) = e^-(3-2) from x(2) = 1', () => {
    const engine = run({ startTime: 2, stopTime: 3, fixedStep: 0.01 });
    expect(engine.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(Math.abs(Number(engine.getSignalValue('x', 'out')) - Math.exp(-1))).toBeLessThan(1e-9);
  });
});
