// WP-09c acceptance tests: Simulink sorted order (direct feedthrough) and loop resolution.
// Rule: a connection s -> t is a sorting dependency iff t is direct feedthrough
//   (XBlock.directFeedthrough, default !isStateful). Edges OUT of stateful blocks always count.
// Loops: Gauss-Seidel passes over the cycle blocks (any value type, buses included) until outputs settle,
//   then the existing Newton iteration only for loops that do not settle.
import { describe, it, expect } from 'vitest';
import { BLOCK_LIBRARY } from './BlockDefinitions';
import { XbridgesEngine } from './XbridgesEngine';
import { Solvers } from './Solvers';
import { isBus } from './bus/busCore';

const c = (s: string, sp: string, t: string, tp: string) => ({ sourceBlock: s, sourcePort: sp, targetBlock: t, targetPort: tp });

function decay(solver: string, h: number, stop: number) {
  const blocks = [BLOCK_LIBRARY.Integrator('x', { initialCondition: 1 }), BLOCK_LIBRARY.GAIN('g', { gain: -1 })];
  const e = new XbridgesEngine({ blocks, connections: [c('x', 'out', 'g', 'u'), c('g', 'y', 'x', 'in')] } as any);
  Solvers.runFixedStep(e, { solver, startTime: 0, stopTime: stop, fixedStep: h, relTol: 1e-8, absTol: 1e-10 } as any);
  return e.getSignalValue('x', 'out') as number;
}

describe('sorted order: consumers of a stateful block see its current state', () => {
  it('one RK4 step on x\' = -x equals the RK4 polynomial exactly', () => {
    const h = 0.1;
    expect(Math.abs(decay('ode4', h, h) - (1 - h + h * h / 2 - h ** 3 / 6 + h ** 4 / 24))).toBeLessThan(1e-15);
    expect(Math.abs(decay('ode4', h, 10 * h) - (1 - h + h * h / 2 - h ** 3 / 6 + h ** 4 / 24) ** 10)).toBeLessThan(1e-14);
  });

  it.each([
    ['euler', 1, 0.02], ['ode2', 2, 0.05], ['ode3', 3, 0.1], ['ode4', 4, 0.1], ['ode5', 5, 0.25],
  ])('%s converges with order %i on x\' = -x', (solver, order, h) => {
    const e1 = Math.abs(decay(solver as string, h as number, 1) - Math.exp(-1));
    const e2 = Math.abs(decay(solver as string, (h as number) / 2, 1) - Math.exp(-1));
    const ratio = e1 / e2;
    expect(ratio).toBeGreaterThan(0.75 * 2 ** (order as number));
    expect(ratio).toBeLessThan(1.25 * 2 ** (order as number));
  });

  it('ode45 meets a tight tolerance', () => {
    expect(Math.abs(decay('ode45', 0.1, 1) - Math.exp(-1))).toBeLessThan(1e-6);
  });

  it('harmonic oscillator x\'\' = -x with RK4 keeps amplitude over one period', () => {
    const blocks = [
      BLOCK_LIBRARY.Integrator('v', { initialCondition: 0 }),
      BLOCK_LIBRARY.Integrator('x', { initialCondition: 1 }),
      BLOCK_LIBRARY.GAIN('k', { gain: -1 }),
    ];
    const e = new XbridgesEngine({ blocks, connections: [c('v', 'out', 'x', 'in'), c('x', 'out', 'k', 'u'), c('k', 'y', 'v', 'in')] } as any);
    Solvers.runFixedStep(e, { solver: 'ode4', startTime: 0, stopTime: 2 * Math.PI, fixedStep: 2 * Math.PI / 600 } as any);
    expect(Math.abs((e.getSignalValue('x', 'out') as number) - 1)).toBeLessThan(1e-8);
  });

  it('a Scope after Integrator -> Gain records -2*x at the same sample time (no one-step lag)', () => {
    const blocks = [
      BLOCK_LIBRARY.Constant('one', { value: 1 }),
      BLOCK_LIBRARY.Integrator('x', { initialCondition: 0 }),
      BLOCK_LIBRARY.GAIN('g', { gain: -2 }),
      BLOCK_LIBRARY.Scope('sc', { numSignals: 1 }),
    ];
    const e = new XbridgesEngine({ blocks, connections: [c('one', 'out', 'x', 'in'), c('x', 'out', 'g', 'u'), c('g', 'y', 'sc', 'in1')] } as any);
    Solvers.runFixedStep(e, { solver: 'ode4', startTime: 0, stopTime: 0.5, fixedStep: 0.1 } as any);
    const hist = (e.getBlock('sc')!.state as any).history as { t: number; y1: number }[];
    expect(hist.length).toBeGreaterThan(3);
    for (const s of hist) expect(Math.abs(s.y1 - -2 * s.t)).toBeLessThan(1e-12);
  });
});

describe('compatibility and loops', () => {
  it('a stateful block without a flag still breaks a loop (no algebraic-loop diagnostic)', () => {
    const blocks = [BLOCK_LIBRARY.UNIT_DELAY('d', { initialCondition: 1, sampleTime: 0.1 }), BLOCK_LIBRARY.GAIN('g', { gain: 0.5 })];
    const e = new XbridgesEngine({ blocks, connections: [c('d', 'y', 'g', 'u'), c('g', 'y', 'd', 'u')] } as any);
    Solvers.runFixedStep(e, { solver: 'ode4', startTime: 0, stopTime: 0.3, fixedStep: 0.1 } as any);
    expect(e.diagnostics.some(d => d.code === 'ALGEBRAIC_LOOP')).toBe(false);
  });

  it('powertrain blocks declare direct feedthrough; a vehicle <-> wheel loop resolves exactly and keeps bus outputs', () => {
    const veh = BLOCK_LIBRARY.PT_VEHICLE_BODY_1DOF('veh', { M: 1200, NF: 2, NR: 2, xdot_o: 15 });
    const wh = BLOCK_LIBRARY.PT_LONGITUDINAL_WHEEL('w', { brakeType: 'None', omega_o: 15 / 0.3 });
    expect(veh.directFeedthrough).toBe(true);
    expect(wh.directFeedthrough).toBe(true);
    const blocks = [
      veh, wh,
      BLOCK_LIBRARY.Constant('trq', { value: 300 }), BLOCK_LIBRARY.Constant('fz', { value: 3000 }),
      BLOCK_LIBRARY.Constant('zero', { value: 0 }), BLOCK_LIBRARY.Constant('wind', { value: '[0 0 0]' }),
      BLOCK_LIBRARY.Constant('temp', { value: 293.15 }),
    ];
    const e = new XbridgesEngine({ blocks, connections: [
      c('trq', 'out', 'w', 'AxlTrq'), c('veh', 'xdot', 'w', 'Vx'), c('fz', 'out', 'w', 'Fz'),
      c('w', 'Fx', 'veh', 'FwF'), c('zero', 'out', 'veh', 'FwR'), c('zero', 'out', 'veh', 'Grade'),
      c('wind', 'out', 'veh', 'WindXYZ'), c('temp', 'out', 'veh', 'Temp'),
    ] } as any);
    Solvers.runFixedStep(e, { solver: 'ode14x', startTime: 0, stopTime: 1, fixedStep: 0.01 } as any);
    const vinfo = e.getSignalValue('veh', 'Info') as any;
    const winfo = e.getSignalValue('w', 'Info') as any;
    expect(isBus(vinfo)).toBe(true);
    expect(isBus(winfo)).toBe(true);
    // consistency at the final time: the wheel saw the vehicle's current speed, the vehicle saw the wheel's current force
    const v = e.getSignalValue('veh', 'xdot') as number;
    const omega = e.getSignalValue('w', 'Omega') as number;
    expect(Math.abs(winfo.Kappa - (0.3 * omega - v) / Math.max(Math.abs(v), 1))).toBeLessThan(1e-12);
    const fx = e.getSignalValue('w', 'Fx') as number;
    expect(Math.abs(vinfo.xddot - (2 * fx - vinfo.Fd) / 1200)).toBeLessThan(1e-9);
    expect(e.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  });
});
