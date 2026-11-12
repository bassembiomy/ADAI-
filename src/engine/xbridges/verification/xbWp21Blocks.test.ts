/**
 * WP-21 round 3 acceptance (controller) for findings without an earlier pin.
 * XBV-027: AC_MOTOR_PID_CONTROL with its defaults removes the speed error (integral action): omega settles at w_ref, not at
 *   w_ref / P. Oracle: a PI(D) speed loop with an integrator has zero steady-state error for a constant reference and
 *   load (final value theorem); 1 % band at t = 5 s.
 * XBV-024: PWM_GENERATOR does not log from execute and has no hidden phase offset (two instances with the same parameters
 *   give the same pulses); MPC_CONTROLLER state survives a structured clone (worker snapshot, U11 rule).
 */
import { describe, expect, it, vi } from 'vitest';
import { BLOCK_LIBRARY } from '../BlockDefinitions';
import { buildModel, runModel } from '../testkit';

const num = (v: unknown) => (Array.isArray(v) ? Number((v as unknown[])[0]) : Number(v));

describe('XBV-027: AC_MOTOR_PID_CONTROL tracks its reference', () => {
  it('defaults (w_ref 157 rad/s, no load): |omega(5 s) - 157| <= 1.57 and the reported error is within the same band', () => {
    const r = runModel(buildModel({
      blocks: [{ id: 'w', type: 'Constant', params: { value: 157 } }, { id: 'l', type: 'Constant', params: { value: 0 } }, { id: 'm', type: 'AC_MOTOR_PID_CONTROL' }],
      wires: ['w.out -> m.w_ref', 'l.out -> m.tl'],
    }), { solver: 'rk4', dt: 1e-4, stopTime: 5, probes: ['m.omega', 'm.error'] });
    expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const omega = num(r.signals['m.omega'][r.t.length - 1]);
    const err = num(r.signals['m.error'][r.t.length - 1]);
    expect(Math.abs(omega - 157)).toBeLessThanOrEqual(1.57);
    expect(Math.abs(err)).toBeLessThanOrEqual(1.57);
  }, 120_000);
});

describe('XBV-024: no side effects or hidden state', () => {
  it('PWM_GENERATOR execute writes nothing to the console', () => {
    const spies = (['log', 'info', 'warn', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    try {
      const b = BLOCK_LIBRARY.PWM_GENERATOR('p', {});
      let s = b.state;
      for (let k = 0; k < 50; k++) { const r = b.execute([0.4], b.params, s, k * 0.001); s = r.nextState ?? s; }
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    } finally { spies.forEach((s) => s.mockRestore()); }
  });
  it('two PWM_GENERATOR instances with the same parameters and inputs give the same pulse train (no golden-ratio phase offset)', () => {
    const run = (id: string) => {
      const b = BLOCK_LIBRARY.PWM_GENERATOR(id, {});
      let s = b.state; const out: number[] = [];
      for (let k = 0; k < 200; k++) { const r = b.execute([0.3], b.params, s, k * 0.0005); out.push(num(r.outputs[0])); s = r.nextState ?? s; }
      return out;
    };
    expect(run('p1')).toEqual(run('p2'));
  });
  it('MPC_CONTROLLER: continuing from a structured clone of the state gives the same outputs as continuing from the original', () => {
    // same call shape as xbEquations.control.test.ts section E (x as a flat vector, r as [1], Q [[10]], Nc 1 which runs today)
    const b = BLOCK_LIBRARY.MPC_CONTROLLER('m', { Q: [[10]], Nc: 1 });
    let s = b.state;
    for (let k = 0; k < 3; k++) { const r = b.execute([[0, 0], [1]] as never, b.params, s, k * 0.1); s = r.nextState ?? s; }
    const a = b.execute([[0.1, 0], [1]] as never, b.params, s, 0.3);
    const c = b.execute([[0.1, 0], [1]] as never, b.params, structuredClone(s), 0.3);
    expect(c.outputs).toEqual(a.outputs);
  });
});
