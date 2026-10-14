// WP-08a acceptance tests (planner-owned). Contract: docs/superpowers/plans/2026-10-14-trm-simulation-loop.md §2 item 4
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { runSmVerification } from './smRunner';
import type { SimCriterion } from './simCriterion';

const heater = JSON.parse(readFileSync(new URL('../../../inductance_heater.json', import.meta.url), 'utf8'));
const POWER = 'sim:sm/var/6178d014-831f-4339-8dac-f275360b1222';
const UP = 'sim:sm/var/1d1ef5eb-3e8d-4e62-9f78-10f3eeb228a3';
const HEATER = 'sim:sm/var/a002ce43-8aaa-4ebe-b84b-b872033fb4ea';
const STATE_4 = '1e65f0de-9ce7-4062-af8b-a95e8e45d628';
const HEATER_UP = 'bda23ddc-8487-44aa-9274-5be8dba8298b';

const crit = (over: Partial<SimCriterion>): SimCriterion => ({
  id: 'c1', requirementId: 'REQ-1', verificationCaseId: 'VC-1',
  stimuli: [
    { target: POWER, profile: { kind: 'step', before: 0, after: 1, at: 0.005 } },
    { target: UP, profile: { kind: 'step', before: 0, after: 1, at: 0.03 } },
  ],
  observe: HEATER, check: { kind: 'reaches', value: 60, by: 0.1 }, duration: 0.1, step: 0.01, ...over,
});

describe('runSmVerification', () => {
  it('samples at t = 0 and then every step until the duration', () => {
    const r = runSmVerification(heater, crit({}));
    expect(r.trace).toHaveLength(11);
    expect(r.trace[0]).toEqual({ t: 0, value: 0 });
    r.trace.forEach((s, k) => expect(s.t).toBeCloseTo(k * 0.01, 9));
    expect(r.diagnostics).toEqual([]);
  });

  it('drives inputs from the stimuli and passes when the observed variable reaches the value', () => {
    const r = runSmVerification(heater, crit({}));
    expect(r.evaluation.passed).toBe(true);
    expect(r.trace.at(-1)?.value).toBe(60);
  });

  it('fails with the first violating sample when the bound is exceeded', () => {
    const r = runSmVerification(heater, crit({ check: { kind: '<=', value: 55, window: [0, 0.1] } }));
    expect(r.evaluation.passed).toBe(false);
    expect(r.evaluation.firstViolation?.value).toBe(60);
  });

  it('observes a state as 1 while it is active and 0 otherwise', () => {
    const r = runSmVerification(heater, crit({ observe: HEATER_UP, check: { kind: 'reaches', value: 1, by: 0.1 } }));
    expect(r.evaluation.passed).toBe(true);
    expect(r.trace[0].value).toBe(0);
  });

  it('observes a boolean variable as 1/0', () => {
    const r = runSmVerification(heater, crit({ observe: POWER, check: { kind: '<=', value: 1, window: [0, 0.1] } }));
    expect(r.trace[0].value).toBe(0);
    expect(r.trace.every(s => s.value === 0 || s.value === 1)).toBe(true);
  });

  it('writes a stimulus only when its value changes, so the model may reset the variable', () => {
    // A constant POWER=1 is written once; State_4 entry clears POWER, so the machine stays in State_4
    // instead of bouncing back to IDLE on POWER==true.
    const r = runSmVerification(heater, crit({
      stimuli: [{ target: POWER, profile: { kind: 'constant', value: 1 } }],
      observe: STATE_4, check: { kind: '>=', value: 1, window: [0.02, 0.1] },
    }));
    expect(r.evaluation.passed).toBe(true);
  });

  it('does not run an invalid criterion and returns its validation diagnostics', () => {
    const r = runSmVerification(heater, crit({ step: 0 }));
    expect(r.trace).toEqual([]);
    expect(r.evaluation.passed).toBe(false);
    expect(r.diagnostics.map(d => d.code)).toContain('STEP');
  });

  it('reports a target that is not in the model, and one from another engine, without running', () => {
    const missing = runSmVerification(heater, crit({ observe: 'sim:sm/var/nope' }));
    expect(missing.diagnostics).toContainEqual(expect.objectContaining({ code: 'UNKNOWN_TARGET', target: 'sim:sm/var/nope' }));
    expect(missing.trace).toEqual([]);
    const foreign = runSmVerification(heater, crit({ stimuli: [{ target: 'sim:xb/global/b/u', profile: { kind: 'constant', value: 1 } }] }));
    expect(foreign.diagnostics).toContainEqual(expect.objectContaining({ code: 'UNSUPPORTED_TARGET', target: 'sim:xb/global/b/u' }));
    expect(foreign.evaluation.passed).toBe(false);
  });
});
