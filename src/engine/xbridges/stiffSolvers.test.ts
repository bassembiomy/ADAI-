// WP-09 acceptance tests (Powertrain plan): stiff solvers for X-Bridges, as Simulink offers for drivetrains.
// ode14x (fixed-step implicit extrapolation, Simulink defaults: extrapolation order 4, 1 Newton iteration):
//   for j = 1..order: T[j][1] = j implicit-Euler substeps of size h/j, each solved by `newtonIterations` Newton
//   steps from the previous substep value, Jacobian by finite differences on the global continuous state;
//   T[j][k] = T[j][k-1] + (T[j][k-1] - T[j-1][k-1]) / (j/(j-k+1) - 1),  x(t+h) = T[order][order].
// ode23tb (variable step TR-BDF2, Hosea & Shampine 1996) with relTol/absTol.
// Unknown solver names are an error diagnostic, never a silent Euler run.
import { describe, it, expect } from 'vitest';
import { BLOCK_LIBRARY } from './BlockDefinitions';
import { XbridgesEngine } from './XbridgesEngine';
import { Solvers } from './Solvers';

// x1' = -x1, x2' = -1000*(x2 - x1); x1(0) = 1, x2(0) = 0.
// Exact: x1 = e^-t, x2 = (1000/999) e^-t - (1000/999) e^-1000t.
const exact = (t: number) => ({ x1: Math.exp(-t), x2: (1000 / 999) * (Math.exp(-t) - Math.exp(-1000 * t)) });

function stiffModel() {
  const blocks = [
    BLOCK_LIBRARY.Integrator('x1', { initialCondition: 1 }),
    BLOCK_LIBRARY.GAIN('g1', { gain: -1 }),
    BLOCK_LIBRARY.Integrator('x2', { initialCondition: 0 }),
    BLOCK_LIBRARY.Sum('err', { signs: '+-' }),
    BLOCK_LIBRARY.GAIN('g2', { gain: -1000 }),
  ];
  const c = (s: string, sp: string, t: string, tp: string) => ({ sourceBlock: s, sourcePort: sp, targetBlock: t, targetPort: tp });
  return new XbridgesEngine({ blocks, connections: [
    c('x1', 'out', 'g1', 'u'), c('g1', 'y', 'x1', 'in'),
    c('x2', 'out', 'err', 'in1'), c('x1', 'out', 'err', 'in2'),
    c('err', 'out', 'g2', 'u'), c('g2', 'y', 'x2', 'in'),
  ] } as any);
}
const read = (e: XbridgesEngine) => ({ x1: e.getSignalValue('x1', 'out') as number, x2: e.getSignalValue('x2', 'out') as number });

describe('ode14x (fixed-step implicit extrapolation)', () => {
  it('is stable and accurate at a step 10x beyond the explicit stability limit', () => {
    const e = stiffModel();
    Solvers.runFixedStep(e, { solver: 'ode14x', startTime: 0, stopTime: 1, fixedStep: 0.01 } as any);
    const x = read(e), ex = exact(1);
    expect(Math.abs(x.x1 - ex.x1)).toBeLessThan(1e-8);
    expect(Math.abs(x.x2 - ex.x2)).toBeLessThan(1e-6);
    expect(e.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  });

  it('extrapolation order 1 is plain implicit Euler (first-order accurate, still stable)', () => {
    const e = stiffModel();
    Solvers.runFixedStep(e, { solver: 'ode14x', startTime: 0, stopTime: 1, fixedStep: 0.01, extrapolationOrder: 1 } as any);
    const err = Math.abs(read(e).x1 - exact(1).x1);
    // implicit Euler on x' = -x with h = 0.01: x(1) = (1/1.01)^100
    expect(Math.abs(read(e).x1 - Math.pow(1 / 1.01, 100))).toBeLessThan(1e-12);
    expect(err).toBeGreaterThan(1e-4);
  });

  it('explicit RK4 at the same step blows up (why the stiff solver is needed)', () => {
    const e = stiffModel();
    Solvers.runFixedStep(e, { solver: 'ode4', startTime: 0, stopTime: 0.2, fixedStep: 0.01 } as any);
    expect(Math.abs(read(e).x2)).toBeGreaterThan(1e3);
  });

  it('has a per-step entry point for the live canvas worker', () => {
    const e = stiffModel();
    e.compile(0);
    let t = 0;
    for (let i = 0; i < 100; i++) { (Solvers as any).stepODE14x(e, t, 0.01); t += 0.01; }
    e.computeOutputs(1);
    expect(Math.abs(read(e).x1 - exact(1).x1)).toBeLessThan(1e-8);
  });
});

describe('ode23tb (variable-step TR-BDF2)', () => {
  it('meets the tolerance on the stiff system', () => {
    const e = stiffModel();
    Solvers.runFixedStep(e, { solver: 'ode23tb', startTime: 0, stopTime: 1, relTol: 1e-6, absTol: 1e-9, maxStep: 0.1 } as any);
    const x = read(e), ex = exact(1);
    expect(Math.abs(x.x1 - ex.x1)).toBeLessThan(1e-5);
    expect(Math.abs(x.x2 - ex.x2)).toBeLessThan(1e-5);
  });
});

describe('solver names', () => {
  it.each(['ode15s', 'ode23s', 'ode113', 'nonsense'])('%s is reported as unsupported instead of silently running Euler', (name) => {
    const e = stiffModel();
    Solvers.runFixedStep(e, { solver: name, startTime: 0, stopTime: 0.1, fixedStep: 0.01 } as any);
    expect(e.diagnostics.some(d => d.severity === 'error' && d.code === 'UNSUPPORTED_SOLVER')).toBe(true);
  });

  it('euler / ode1 / fixedStep keep running explicit Euler', () => {
    for (const name of ['euler', 'ode1', 'fixedStep']) {
      const e = stiffModel();
      Solvers.runFixedStep(e, { solver: name, startTime: 0, stopTime: 0.001, fixedStep: 0.0001 } as any);
      expect(e.diagnostics.some(d => d.code === 'UNSUPPORTED_SOLVER')).toBe(false);
    }
  });
});
