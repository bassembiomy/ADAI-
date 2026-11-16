/**
 * WP-21 round 5, batch E5 acceptance (controller).
 * XBV-185: ode23tb treats a Newton iteration that overflows as a failed step (MATLAB ode23tb: a Newton failure shrinks h
 *   and retries), so the Robertson problem runs. Reference (Hairer & Wanner, Robertson at t = 40):
 *   y1 = 0.7158270687, y2 = 9.185534764e-6, y3 = 0.2841637457.
 * XBV-186 / decision D15: fixed-step solvers do not locate zero crossings (Simulink default: 'Enable zero-crossing
 *   detection for fixed-step simulation' off). A block mode changes at a major step, the output grid is k * h, and a
 *   batch run (Solvers.runFixedStep) gives the same numbers as the live canvas step. Step at 0.025 into an Integrator,
 *   h = 0.01, 0.05 s: the Step mode switches at the major step t = 0.03, so x(0.05) = 0.02 (live and batch).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { XbridgesEngine } from '../XbridgesEngine';
import { Solvers } from '../Solvers';
import { buildModel, runModel, type ModelSpec } from '../testkit';

const ROBERTSON: ModelSpec = {
  blocks: [
    { id: 'y1', type: 'Integrator', params: { initialCondition: 1 } }, { id: 'y2', type: 'Integrator' }, { id: 'y3', type: 'Integrator' },
    { id: 'p23', type: 'PRODUCT' }, { id: 'p22', type: 'PRODUCT' },
    { id: 'a1', type: 'GAIN', params: { gain: 0.04 } }, { id: 'b1', type: 'GAIN', params: { gain: 1e4 } }, { id: 'c1', type: 'GAIN', params: { gain: 3e7 } },
    { id: 'd1', type: 'Sum', params: { signs: '-+' } }, { id: 'd2', type: 'Sum', params: { signs: '+--' } },
  ],
  wires: ['y2.out -> p23.in1', 'y3.out -> p23.in2', 'y2.out -> p22.in1', 'y2.out -> p22.in2', 'y1.out -> a1.u', 'p23.y -> b1.u', 'p22.y -> c1.u',
    'a1.y -> d1.in1', 'b1.y -> d1.in2', 'd1.out -> y1.in', 'a1.y -> d2.in1', 'b1.y -> d2.in2', 'c1.y -> d2.in3', 'd2.out -> y2.in', 'c1.y -> y3.in'],
};

describe('XBV-185: ode23tb runs the Robertson problem', () => {
  it('t = 40, RelTol 1e-4, AbsTol 1e-10: no error, y1/y3 within 1e-3 and y2 within 1e-2 relative of the reference', () => {
    const probes = ['y1.out', 'y2.out', 'y3.out'];
    const r = runModel(buildModel(ROBERTSON), { solver: 'ode23tb', dt: 1, stopTime: 40, probes, relTol: 1e-4, absTol: 1e-10 });
    expect(r.diagnostics.filter((d) => d.severity === 'error').map((d) => `${d.code}: ${d.message}`)).toEqual([]);
    expect(r.t.at(-1)).toBeCloseTo(40, 9);
    const ref = [0.7158270687, 9.185534764e-6, 0.2841637457];
    const last = probes.map((p) => Number(r.signals[p].at(-1)));
    expect(Math.abs(last[0] - ref[0]) / ref[0]).toBeLessThanOrEqual(1e-3);
    expect(Math.abs(last[1] - ref[1]) / ref[1]).toBeLessThanOrEqual(1e-2);
    expect(Math.abs(last[2] - ref[2]) / ref[2]).toBeLessThanOrEqual(1e-3);
  }, 240_000);
});

const STEP_INT: ModelSpec = {
  blocks: [{ id: 's', type: 'Step', params: { stepTime: 0.025, initialValue: 0, finalValue: 1 } }, { id: 'j', type: 'Integrator' }],
  wires: ['s.out -> j.in'],
};
const SWITCH_INT: ModelSpec = {
  blocks: [{ id: 'c', type: 'Constant', params: { value: 1 } }, { id: 'i', type: 'Integrator' }, { id: 'sw', type: 'SWITCH', params: { threshold: 0.025, criteria: '>=' } }, { id: 'a', type: 'Constant', params: { value: 5 } }, { id: 'j', type: 'Integrator' }],
  wires: ['c.out -> i.in', 'i.out -> sw.ctrl', 'a.out -> sw.u1', 'c.out -> sw.u2', 'sw.y -> j.in'],
};

describe('XBV-186 / D15: fixed-step solvers change modes at major steps, batch = live', () => {
  for (const solver of ['euler', 'ode2', 'ode3', 'rk4', 'ode5', 'ode14x']) {
    for (const [name, spec, expected] of [['Step', STEP_INT, 0.02], ['Switch', SWITCH_INT, 0.13]] as const) {
      it(`${solver}, ${name}: batch takes 5 steps of 0.01 and x(0.05) = ${expected}, equal to the live run`, () => {
        const e = new XbridgesEngine(buildModel(spec));
        let commits = 0;
        const commit = e.commitStateUpdates.bind(e);
        (e as unknown as { commitStateUpdates: typeof commit }).commitStateUpdates = (m) => { commits++; return commit(m); };
        Solvers.runFixedStep(e, { solver, startTime: 0, stopTime: 0.05, fixedStep: 0.01 } as never);
        expect(e.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
        expect(commits).toBe(5);
        expect(Number(e.getSignalValue('j', 'out'))).toBeCloseTo(expected, 12);
        const live = runModel(buildModel(spec), { solver, dt: 0.01, stopTime: 0.05, probes: ['j.out'] });
        expect(Number(live.signals['j.out'].at(-1))).toBeCloseTo(expected, 12);
      });
    }
  }
  it('no fixed-step solver carries zero-crossing event code (bracketZeroCrossing is gone or unused)', () => {
    const root = join(__dirname, '..');
    for (const f of ['Solvers.ts', 'StiffSolver.ts']) expect(readFileSync(join(root, f), 'utf8'), f).not.toMatch(/bracketZeroCrossing\(/);
  });
});
