// WP-13 acceptance tests (planner-owned). Contract: docs/superpowers/plans/2026-10-14-trm-simulation-loop.md §7.1
import { describe, expect, it } from 'vitest';
import { MAX_SIM_STEPS, stepCount, stimulusValue, timeGE, timeLE, validateCriterion, type SimCriterion } from './simCriterion';
import { evaluateCriterion } from './simEvaluate';
import { runSmVerification } from './smRunner';
import { runXbVerification } from './xbRunner';
import { runVlabVerification } from './vlabRunner';
import { thermostatProject, T } from './__fixtures__/thermostatProject';

const base = (over: Partial<SimCriterion>): SimCriterion => ({
  id: 'c', requirementId: 'r', verificationCaseId: 'v', stimuli: [], observe: 'x',
  check: { kind: '>=', value: 0, window: [0, 1] }, duration: 1, step: 0.1, ...over,
});

/** A chart whose only state counts interpreter ticks in its during action. */
const counterChart = (tickMs = 10) => ({
  schemaVersion: 5, tickMs, safetyMode: false,
  states: [{ id: 'a', name: 'A', x: 0, y: 0, width: 100, height: 60, entry: '', during: 'n=n+1;', exit: '', isActive: false, color: '#000', parentId: null, children: [], priority: 1, isParallel: false, regionId: null, autostart: true }],
  junctions: [], transitions: [],
  variables: [{ id: 'n', name: 'n', type: 'double', initialValue: '0', currentValue: 0, visibleInScope: true }],
  layers: [{ id: 'root', name: 'root', parentStateId: null, decomposition: 'OR', stateIds: ['a'], transitionIds: [], junctionIds: [] }],
});

describe('time base helpers', () => {
  it('counts steps by rounding and compares times with a relative epsilon', () => {
    expect(stepCount(0.3, 0.1)).toBe(3);
    expect(stepCount(30, 0.01)).toBe(3000);
    expect(timeLE(0.1 * 3, 0.3)).toBe(true);
    expect(timeGE(0.3, 0.1 * 3)).toBe(true);
    expect(timeLE(0.31, 0.3)).toBe(false);
    expect(MAX_SIM_STEPS).toBe(20000);
  });

  it('rejects a duration that is not a whole multiple of the step', () => {
    expect(validateCriterion(base({ duration: 1, step: 0.3 })).map(d => d.code)).toContain('STEP');
    expect(validateCriterion(base({ duration: 1, step: 0.4 })).map(d => d.code)).toContain('STEP');
    expect(validateCriterion(base({ duration: 0.3, step: 0.1, check: { kind: '>=', value: 0, window: [0, 0.3] } }))).toEqual([]);
    expect(validateCriterion(base({ duration: 30, step: 0.01, check: { kind: '>=', value: 0, window: [0, 30] } }))).toEqual([]);
  });

  it('rejects more than MAX_SIM_STEPS steps', () => {
    const d = validateCriterion(base({ duration: 30, step: 0.001, check: { kind: '>=', value: 0, window: [0, 30] } }));
    expect(d.map(x => x.code)).toContain('STEP');
  });
});

describe('stimulus switching times are compared with the same epsilon', () => {
  it('a step at 0.33 s switches at k = 11 with step 0.03 (11*0.03 = 0.32999999999999996)', () => {
    expect(11 * 0.03).toBeLessThan(0.33);
    expect(stimulusValue({ kind: 'step', before: 0, after: 1, at: 0.33 }, 11 * 0.03)).toBe(1);
    expect(stimulusValue({ kind: 'step', before: 0, after: 1, at: 0.33 }, 10 * 0.03)).toBe(0);
  });

  it('a ramp starts at the same epsilon-tolerant time and never goes backwards', () => {
    const r = { kind: 'ramp' as const, from: 2, slope: 10, start: 0.33 };
    expect(stimulusValue(r, 11 * 0.03)).toBe(2);
    expect(stimulusValue(r, 12 * 0.03)).toBeCloseTo(2.3, 12);
    expect(stimulusValue(r, 0.1)).toBe(2);
  });
});

describe('evaluator keeps boundary samples produced by k*step', () => {
  const trace = [0, 1, 2, 3].map(k => ({ t: k * 0.1, value: k }));

  it('includes t = 0.1*3 in a window ending at 0.3', () => {
    expect(trace[3].t).toBeGreaterThan(0.3); // 0.30000000000000004
    const r = evaluateCriterion({ kind: '<=', value: 2, window: [0, 0.3] }, trace);
    expect(r.passed).toBe(false);
    expect(r.firstViolation?.t).toBeCloseTo(0.3, 12);
    expect(r.samplesChecked).toBe(4);
  });

  it('includes t = 0.1*3 in "reaches by 0.3"', () => {
    expect(evaluateCriterion({ kind: 'reaches', value: 3, by: 0.3 }, trace).passed).toBe(true);
  });

  it('includes a window that starts at a k*step boundary', () => {
    const r = evaluateCriterion({ kind: '>=', value: 3, window: [0.3, 0.3] }, trace);
    expect(r.passed).toBe(true);
    expect(r.samplesChecked).toBe(1);
  });
});

describe('state machine runner: one major step = step/tickMs ticks', () => {
  const counter = (step: number, duration = 0.1) => runSmVerification(counterChart(), base({
    observe: 'sim:sm/var/n', step, duration, check: { kind: '>=', value: 0, window: [0, duration] },
  }));

  it('runs 5 ticks per 50 ms step on a 10 ms chart', () => {
    const r = counter(0.05);
    expect(r.diagnostics).toEqual([]);
    expect(r.trace.map(s => s.value)).toEqual([0, 5, 10]);
    r.trace.forEach((s, k) => expect(s.t).toBeCloseTo(k * 0.05, 12));
  });

  it('runs exactly one tick per step when step equals the chart tick', () => {
    expect(counter(0.01).trace.map(s => s.value)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('refuses a step that is not a whole number of chart ticks', () => {
    const r = counter(0.015, 0.045);
    expect(r.trace).toEqual([]);
    expect(r.evaluation.passed).toBe(false);
    expect(r.diagnostics.map(d => d.code)).toEqual(['STEP_NOT_TICK_MULTIPLE']);
  });

  it('writes a stimulus once per major step (held for all its ticks)', () => {
    const p = thermostatProject();
    const r = runSmVerification(p, base({
      stimuli: [{ target: T.enable, profile: { kind: 'step', before: 0, after: 1, at: 0.1 } }],
      observe: T.heaterOn, duration: 0.3, step: 0.05, check: { kind: '>=', value: 0, window: [0, 0.3] },
    }));
    expect(r.diagnostics).toEqual([]);
    // enable becomes 1 for the step starting at t = 0.1, so heaterOn is first seen at t = 0.15.
    expect(r.trace.map(s => s.value)).toEqual([0, 0, 0, 1, 1, 1, 1]);
  });
});

describe('X-Bridges and V-Lab runners never run past the duration', () => {
  it('X-Bridges: duration 1 / step 0.4 is refused instead of running to t = 1.2', () => {
    const p = thermostatProject();
    const r = runXbVerification({ canvas: 'global', nodes: p.globalXBridgesNodes, edges: p.globalXBridgesEdges }, base({
      observe: T.gainOut, duration: 1, step: 0.4, check: { kind: '>=', value: 0, window: [0, 0.8] },
    }));
    expect(r.trace).toEqual([]);
    expect(r.diagnostics.map(d => d.code)).toContain('STEP');
  });

  it('V-Lab: duration 1 / step 0.4 is refused instead of running to t = 1.2', () => {
    const p = thermostatProject();
    const r = runVlabVerification({ canvas: 'global', nodes: p.vlabNodes, edges: p.vlabEdges }, base({
      observe: T.chamberOut, duration: 1, step: 0.4, check: { kind: '>=', value: 0, window: [0, 0.8] },
    }));
    expect(r.trace).toEqual([]);
    expect(r.diagnostics.map(d => d.code)).toContain('STEP');
  });

  it('V-Lab: the last sample is exactly at the duration', () => {
    const p = thermostatProject();
    const r = runVlabVerification({ canvas: 'global', nodes: p.vlabNodes, edges: p.vlabEdges }, base({
      stimuli: [{ target: T.powerValue, profile: { kind: 'constant', value: 100 } }],
      observe: T.chamberOut, duration: 0.3, step: 0.1, check: { kind: '>=', value: 0, window: [0, 0.3] },
    }));
    expect(r.diagnostics).toEqual([]);
    expect(r.trace).toHaveLength(3);
    expect(r.trace[2].t).toBeCloseTo(0.3, 12);
    // First sample after one 0.1 s step of the T = 5 s low-pass from rest: between one backward-Euler step
    // (100 * 0.1 / 5.1) and the exact solution 100 * (1 - exp(-0.1 / 5)); V-Lab refines large steps internally.
    expect(r.trace[0].value).toBeGreaterThanOrEqual(100 * (0.1 / 5.1) - 1e-9);
    expect(r.trace[0].value).toBeLessThanOrEqual(100 * (1 - Math.exp(-0.1 / 5)) + 1e-9);
  });
});
