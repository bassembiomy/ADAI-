/**
 * WP-21 batch E acceptance (controller): engine core and solvers.
 * XBV-002 one solver dispatch: the batch runner (Solvers.runFixedStep) and the canvas loop (testkit runModel, which
 *   mirrors XbridgesWorkspace.stepLiveSolver) give the same trajectory for every fixed-step solver; the workspace and the
 *   worker do not keep their own copy of the solver switch.
 * XBV-003 / D3: the canvas variable-step solvers control the error with RelTol / AbsTol. Oracle: x' = cos(10 t), x(0) = 0,
 *   x(t) = sin(10 t) / 10 (closed form); output step 0.1 s is far too coarse for one uncontrolled step (omega h = 1).
 * XBV-005 / D2: SATURATION, DEADZONE, RELAY, SWITCH, Abs and the PWM carrier blocks declare zero-crossing functions,
 *   and a variable-step canvas run locates the kink of |sin(10 t)| (closed form of its integral).
 * XBV-004 / D3: an unimplemented solver name is refused with UNSUPPORTED_SOLVER by the batch runner.
 * XBV-155: a vector input with a scalar initial condition is scalar-expanded by every integrator on every solver.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BLOCK_LIBRARY } from '../BlockDefinitions';
import { XbridgesEngine } from '../XbridgesEngine';
import { Solvers } from '../Solvers';
import { buildModel, runModel, type ModelSpec } from '../testkit';

const COS10 = { type: 'WaveformGen', params: { type: 'Sine', amp: 1, freq: 10 / (2 * Math.PI), phase: Math.PI / 2, offset: 0 } };
const last = (r: { signals: Record<string, unknown[]> }, p: string) => r.signals[p][r.signals[p].length - 1];
const flat = (v: unknown): number[] => (Array.isArray(v) ? (v as unknown[]).flatMap(flat) : [Number(v)]);

describe('XBV-002: one solver dispatch for canvas, worker and batch', () => {
  // nonlinear, time-varying: x' = -x^2 + cos(10 t), x(0) = 0.5
  const spec: ModelSpec = {
    blocks: [
      { id: 'w', ...COS10 },
      { id: 'sq', type: 'PRODUCT', params: { numInputs: 2, operation: 'multiply' } },
      { id: 's', type: 'Sum', params: { signs: '-+' } },
      { id: 'i', type: 'Integrator', params: { initialCondition: 0.5 } },
    ],
    wires: ['i.out -> sq.in1', 'i.out -> sq.in2', 'sq.y -> s.in1', 'w.out -> s.in2', 's.out -> i.in'],
  };
  for (const solver of ['euler', 'ode2', 'ode3', 'rk4', 'ode5', 'ode14x'] as const) {
    it(`${solver}: batch runner final state equals the canvas loop (|d| <= 1e-12) at t = 1, h = 0.01`, () => {
      const canvas = runModel(buildModel(spec), { solver, dt: 0.01, stopTime: 1, probes: ['i.out'] });
      expect(canvas.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      const engine = new XbridgesEngine(buildModel(spec));
      Solvers.runFixedStep(engine, { solver, fixedStep: 0.01, startTime: 0, stopTime: 1 });
      expect(engine.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      const a = flat(last(canvas, 'i.out'))[0];
      const b = Number(engine.getSignalValue('i', 'out'));
      expect(Math.abs(a - b)).toBeLessThanOrEqual(1e-12);
    });
  }
  it('the workspace and the worker contain no solver switch of their own (they call the shared dispatch)', () => {
    const root = join(__dirname, '..', '..', '..', '..');
    for (const f of ['src/components/xbridges/XbridgesWorkspace.tsx', 'src/engine/xbridges/xbridgesWorker.ts']) {
      const src = readFileSync(join(root, f), 'utf8');
      expect(src, f).not.toMatch(/(===|case)\s*['"]ode5['"]/);
      expect(src, f).not.toMatch(/(===|case)\s*['"]ode23tb['"]/);
    }
  });
});

describe('XBV-003 / D3: canvas variable-step solvers control the error with RelTol / AbsTol', () => {
  const spec: ModelSpec = { blocks: [{ id: 'w', ...COS10 }, { id: 'i', type: 'Integrator', params: { initialCondition: 0 } }], wires: ['w.out -> i.in'] };
  const cases: [string, number, number, number][] = [
    ['ode45', 1e-9, 1e-12, 1e-7],
    ['ode23', 1e-7, 1e-10, 1e-5],
    ['ode23tb', 1e-7, 1e-10, 1e-4],
  ];
  for (const [solver, relTol, absTol, bound] of cases) {
    it(`${solver} RelTol ${relTol}: every logged sample within ${bound} of sin(10 t)/10 (output step 0.1)`, () => {
      const r = runModel(buildModel(spec), { solver, dt: 0.1, stopTime: 2, probes: ['i.out'], relTol, absTol });
      expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      expect(r.t.length).toBeGreaterThan(15);
      r.t.forEach((t, k) => expect(Math.abs(flat(r.signals['i.out'][k])[0] - Math.sin(10 * t) / 10), `t = ${t}`).toBeLessThanOrEqual(bound));
    });
  }
});

describe('XBV-005 / D2: zero crossings of the discontinuous blocks', () => {
  // carrier comparators (D2): their output switches when the reference crosses the carrier
  const PWM = ['PWM_GENERATOR', 'THREE_PHASE_PWM', 'SVPWM_GATE_GENERATOR'];
  for (const type of ['SATURATION', 'DEADZONE', 'RELAY', 'SWITCH', 'Abs', ...PWM]) {
    it(`${type} declares a ZeroCrossingFn`, () => {
      const b = BLOCK_LIBRARY[type](`${type}_1`, {}) as { ZeroCrossingFn?: unknown };
      expect(typeof b.ZeroCrossingFn).toBe('function');
    });
  }
  it('ode45 canvas run locates the kinks of |sin(10 t)|: integral at every output sample within 1e-7 of the closed form', () => {
    const SIN10 = { type: 'WaveformGen', params: { type: 'Sine', amp: 1, freq: 10 / (2 * Math.PI), phase: 0, offset: 0 } };
    const spec: ModelSpec = {
      blocks: [{ id: 'w', ...SIN10 }, { id: 'a', type: 'Abs' }, { id: 'i', type: 'Integrator', params: { initialCondition: 0 } }],
      wires: ['w.out -> a.in', 'a.out -> i.in'],
    };
    const exact = (t: number) => { const k = Math.floor((10 * t) / Math.PI); return (2 * k + (k % 2 === 0 ? 1 - Math.cos(10 * t) : 1 + Math.cos(10 * t))) / 10; };
    const r = runModel(buildModel(spec), { solver: 'ode45', dt: 0.1, stopTime: 1.5, probes: ['i.out'], relTol: 1e-10, absTol: 1e-12 });
    expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    r.t.forEach((t, k) => expect(Math.abs(flat(r.signals['i.out'][k])[0] - exact(t)), `t = ${t}`).toBeLessThanOrEqual(1e-7));
  });
});

describe('XBV-004 / D3: only implemented solvers', () => {
  for (const solver of ['ode113', 'ode23s', 'ode15s']) {
    it(`batch runner refuses '${solver}' with UNSUPPORTED_SOLVER`, () => {
      const engine = new XbridgesEngine(buildModel({ blocks: [{ id: 'c', type: 'Constant', params: { value: 1 } }, { id: 'i', type: 'Integrator' }], wires: ['c.out -> i.in'] }));
      Solvers.runFixedStep(engine, { solver: solver as never, fixedStep: 0.01, startTime: 0, stopTime: 0.1 });
      expect(engine.diagnostics.map((d) => d.code)).toContain('UNSUPPORTED_SOLVER');
    });
  }
});

describe('XBV-155: scalar initial condition expanded over a vector input', () => {
  for (const [type, inPort, outPort, ic] of [['Integrator', 'in', 'out', 'initialCondition'], ['INTEGRATOR', 'u', 'y', 'initialCondition'], ['INTEGRATOR_CONTINUOUS', 'u', 'y', 'initial_condition']] as const) {
    for (const solver of ['euler', 'rk4', 'ode45', 'ode14x', 'ode23tb'] as const) {
      it(`${type} IC 0.5, u = [1 2], ${solver}: y(1) = [1.5 2.5] and y(0) = [0.5 0.5]`, () => {
        const spec: ModelSpec = { blocks: [{ id: 'c', type: 'Constant', params: { value: [1, 2] } }, { id: 'i', type, params: { [ic]: 0.5 } }], wires: [`c.out -> i.${inPort}`] };
        const r = runModel(buildModel(spec), { solver, dt: 0.01, stopTime: 1, probes: [`i.${outPort}`] });
        expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
        expect(flat(r.signals[`i.${outPort}`][0])).toEqual([0.5, 0.5]);
        const y = flat(last(r, `i.${outPort}`));
        expect(y.length).toBe(2);
        expect(Math.abs(y[0] - 1.5)).toBeLessThanOrEqual(1e-6);
        expect(Math.abs(y[1] - 2.5)).toBeLessThanOrEqual(1e-6);
      });
    }
  }
});
