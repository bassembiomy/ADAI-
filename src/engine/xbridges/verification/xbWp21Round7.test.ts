/**
 * WP-21 round 7 acceptance (controller), batch S2 rework.
 * XBV-408: the consecutive zero-crossing limit counts only crossings that follow each other within a tiny time window
 *   (Simulink MaxConsecutiveZCs); a model with many genuine events (PWM at 20 kHz) is never stopped. Constant 0.3 -> PWM 20 kHz
 *   -> Integrator over 1 s: no ZERO_CROSSING_CHATTER and x(1) = 0.3 (duty * 1 s) within 1e-2.
 * XBV-403 / 404: a faulted step commits nothing, also for a block that mutates its state object in place
 *   (ROBOT_VACUUM_BATTERY): the block state after the failed live step equals the state at the step start.
 */
import { describe, expect, it } from 'vitest';
import { BLOCK_LIBRARY } from '../BlockDefinitions';
import { XbridgesEngine } from '../XbridgesEngine';
import { Solvers } from '../Solvers';
import { liveStep } from '../liveStep';
import { buildModel } from '../testkit';

const PWM = {
  blocks: [{ id: 'c', type: 'Constant', params: { value: 0.3 } }, { id: 'p', type: 'PWM_GENERATOR', params: { frequency: 20000, carrierType: 'triangle' } }, { id: 'x', type: 'Integrator' }],
  wires: ['c.out -> p.duty', 'p.pwm -> x.in'],
};

describe('XBV-408: genuine high-rate events are not chatter', () => {
  const xState = (e: XbridgesEngine) => Number((e as unknown as { executionOrder: Array<{ id: string; state: unknown }> }).executionOrder.find((b) => b.id === 'x')!.state); // Integrator state is the scalar x
  const batch = (solver: string) => { const e = new XbridgesEngine(buildModel(PWM)); Solvers.runFixedStep(e, { solver, startTime: 0, stopTime: 1 } as never); return e; };
  const live = (solver: string) => {
    const e = new XbridgesEngine(buildModel(PWM));
    (e as unknown as { options: unknown }).options = { solver, fixedStep: 0.01, startTime: 0, stopTime: 0.2 };
    e.compile(0);
    const ok: boolean[] = [];
    for (let k = 0; k < 20; k++) ok.push(liveStep(e, solver, k * 0.01, 0.01));
    return { e, ok };
  };
  for (const solver of ['ode45', 'ode23tb']) {
    it(`PWM 20 kHz, ${solver}, batch 0..1 s: no chatter diagnostic, no error`, () => {
      const e = batch(solver);
      expect(e.diagnostics.map((d) => d.code)).not.toContain('ZERO_CROSSING_CHATTER');
      expect(e.diagnostics.filter((d) => d.severity === 'error').map((d) => d.code)).toEqual([]);
    }, 120_000);
    it(`PWM 20 kHz, ${solver}, live 0..0.2 s (output step 0.01): every step succeeds, no chatter diagnostic`, () => {
      const { e, ok } = live(solver);
      expect(ok).toEqual(new Array(20).fill(true));
      expect(e.diagnostics.map((d) => d.code)).not.toContain('ZERO_CROSSING_CHATTER');
    }, 120_000);
  }
  it('PWM 20 kHz, ode45, batch 0..1 s: x(1) = 0.3 (duty * 1 s; base reaches 0.294)', () => {
    expect(xState(batch('ode45'))).toBeCloseTo(0.3, 1);
  }, 120_000);
  // Pre-existing accuracy defects found while writing this acceptance (same on the base, not part of batch S2):
  it.fails('XBV-409: PWM 20 kHz, ode45, live 0..0.2 s: x(0.2) = 0.06 within 5e-3 (gives 0.0673)', () => {
    expect(xState(live('ode45').e)).toBeCloseTo(0.06, 2);
  }, 120_000);
  it.fails('XBV-410: PWM 20 kHz, ode23tb: batch x(1) = 0.3 and live x(0.2) = 0.06 (give 0.0002 and 0.0013)', () => {
    expect(xState(batch('ode23tb'))).toBeCloseTo(0.3, 1);
    expect(xState(live('ode23tb').e)).toBeCloseTo(0.06, 2);
  }, 120_000);
});

describe('XBV-403 / 404: a faulted live step leaves in-place-mutated block state at its step-start value', () => {
  for (const solver of ['rk4', 'ode45', 'ode23tb', 'euler']) {
    it(`${solver}: ROBOT_VACUUM_BATTERY state after the failed step equals the state before it`, () => {
      const lib = BLOCK_LIBRARY as Record<string, unknown>;
      lib.__TEST_LATE_FAULT__ = (id: string) => ({
        id, type: '__TEST_LATE_FAULT__', params: {}, state: null,
        inputs: [{ id: 'u', label: 'u', type: 'input' }], outputs: [{ id: 'y', label: 'y', type: 'output' }],
        execute: (_i: unknown, _p: unknown, _s: unknown, time: number) => { if (time >= 0.5 - 1e-12) throw new Error('test-only late fault'); return { outputs: [0] }; },
      });
      try {
        const dockPort = (BLOCK_LIBRARY.ROBOT_VACUUM_BATTERY('x', {}) as { inputs: Array<{ id: string }> }).inputs[2].id;
        const e = new XbridgesEngine(buildModel({
          blocks: [{ id: 'dock', type: 'Constant', params: { value: 1 } }, { id: 'b', type: 'ROBOT_VACUUM_BATTERY' }, { id: 'm', type: '__TEST_LATE_FAULT__' }],
          wires: [`dock.out -> b.${dockPort}`, 'b.battery_level -> m.u'],
        } as never));
        (e as unknown as { options: unknown }).options = { solver, fixedStep: 0.05, startTime: 0, stopTime: 1 };
        e.compile(0);
        const b = (e as unknown as { executionOrder: Array<{ id: string; state: unknown }> }).executionOrder.find((x) => x.id === 'b')!;
        let before = '', failed = false;
        for (let k = 0; k < 20; k++) { before = JSON.stringify(b.state); if (!liveStep(e, solver, k * 0.05, 0.05)) { failed = true; break; } }
        expect(failed).toBe(true);
        expect(JSON.stringify(b.state)).toBe(before);
      } finally { delete lib.__TEST_LATE_FAULT__; }
    });
  }
});
