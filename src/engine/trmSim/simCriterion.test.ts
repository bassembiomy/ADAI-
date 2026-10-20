// WP-07 acceptance tests (planner-owned). Contract: docs/superpowers/plans/2026-10-14-trm-simulation-loop.md §2.3
import { describe, expect, it } from 'vitest';
import { stimulusValue, validateCriterion, type SimCriterion } from './simCriterion';
import { evaluateCriterion, type SimTraceSample } from './simEvaluate';

const base: SimCriterion = {
  id: 'c1', requirementId: 'REQ-1', verificationCaseId: 'vc1',
  stimuli: [{ target: 'sim:xb/global/ref/$param/value', profile: { kind: 'constant', value: 157 } }],
  observe: 'sim:vlab/global/motor/w', unit: 'rad/s',
  check: { kind: '<=', value: 160, window: [0, 1] },
  duration: 1, step: 0.01,
};
const codes = (c: SimCriterion, unit?: string) => validateCriterion(c, unit).map(d => d.code);
const trace = (pairs: [number, number][]): SimTraceSample[] => pairs.map(([t, value]) => ({ t, value }));

describe('validateCriterion', () => {
  it('accepts a well-formed criterion whose unit matches the observed signal', () => {
    expect(validateCriterion(base, 'rad/s')).toEqual([]);
  });
  it('accepts any unit when the observed signal has none (unknown is not a mismatch)', () => {
    expect(validateCriterion(base, undefined)).toEqual([]);
  });
  it('rejects a unit mismatch', () => {
    expect(codes(base, 'rpm')).toContain('UNIT_MISMATCH');
  });
  it('rejects bad timing, windows, tolerances and a missing observed signal', () => {
    expect(codes({ ...base, duration: 0 })).toContain('DURATION');
    expect(codes({ ...base, step: 0 })).toContain('STEP');
    expect(codes({ ...base, step: 2 })).toContain('STEP');
    expect(codes({ ...base, check: { kind: '<=', value: 1, window: [0.8, 0.2] } })).toContain('WINDOW');
    expect(codes({ ...base, check: { kind: '<=', value: 1, window: [0, 5] } })).toContain('WINDOW');
    expect(codes({ ...base, check: { kind: 'within', value: 1, tolerance: -0.1, window: [0, 1] } })).toContain('TOLERANCE');
    expect(codes({ ...base, observe: '' })).toContain('OBSERVE');
  });
  it('treats zero and negative values as valid limits', () => {
    expect(validateCriterion({ ...base, check: { kind: '>=', value: -5, window: [0, 0] } }, 'rad/s')).toEqual([]);
    expect(validateCriterion({ ...base, check: { kind: 'within', value: 0, tolerance: 0, window: [0, 1] } }, 'rad/s')).toEqual([]);
  });
});

describe('stimulusValue', () => {
  it('evaluates constant, step and ramp profiles', () => {
    expect(stimulusValue({ kind: 'constant', value: 3 }, 9)).toBe(3);
    expect(stimulusValue({ kind: 'step', before: 0, after: 10, at: 0.5 }, 0.49)).toBe(0);
    expect(stimulusValue({ kind: 'step', before: 0, after: 10, at: 0.5 }, 0.5)).toBe(10);
    expect(stimulusValue({ kind: 'ramp', from: 1, slope: 2, start: 1 }, 0.5)).toBe(1);
    expect(stimulusValue({ kind: 'ramp', from: 1, slope: 2, start: 1 }, 3)).toBe(5);
  });
});

describe('evaluateCriterion', () => {
  it('<= passes on the boundary and reports the first sample above it', () => {
    expect(evaluateCriterion({ kind: '<=', value: 160, window: [0, 1] }, trace([[0, 0], [0.5, 160], [1, 159]])).passed).toBe(true);
    const r = evaluateCriterion({ kind: '<=', value: 160, window: [0, 1] }, trace([[0, 0], [0.4, 160.01], [0.6, 170]]));
    expect(r.passed).toBe(false);
    expect(r.firstViolation).toMatchObject({ t: 0.4, value: 160.01 });
  });
  it('>= only checks samples inside the window', () => {
    const r = evaluateCriterion({ kind: '>=', value: 100, window: [0.5, 1] }, trace([[0, 0], [0.5, 100], [1, 120]]));
    expect(r).toMatchObject({ passed: true, samplesChecked: 2 });
  });
  it('within uses an inclusive tolerance band', () => {
    expect(evaluateCriterion({ kind: 'within', value: 10, tolerance: 0.5, window: [0, 1] }, trace([[0, 9.5], [1, 10.5]])).passed).toBe(true);
    expect(evaluateCriterion({ kind: 'within', value: 10, tolerance: 0.5, window: [0, 1] }, trace([[0, 9.5], [1, 10.51]])).firstViolation?.t).toBe(1);
  });
  it('reaches passes when a rising signal meets the value by the deadline, and fails otherwise', () => {
    expect(evaluateCriterion({ kind: 'reaches', value: 150, by: 0.5 }, trace([[0, 0], [0.3, 150], [0.6, 157]])).passed).toBe(true);
    const late = evaluateCriterion({ kind: 'reaches', value: 150, by: 0.5 }, trace([[0, 0], [0.4, 140], [0.6, 157]]));
    expect(late.passed).toBe(false);
    expect(late.firstViolation).toMatchObject({ t: 0.4, value: 140 });
  });
  it('reaches supports a falling direction', () => {
    expect(evaluateCriterion({ kind: 'reaches', value: 20, by: 1, direction: 'falling' }, trace([[0, 80], [0.9, 19]])).passed).toBe(true);
  });
  it('settles requires every sample from the settle time to the end to stay in band', () => {
    const ok = trace([[0, 0], [0.2, 170], [0.5, 157.5], [1, 157]]);
    expect(evaluateCriterion({ kind: 'settles', value: 157, tolerance: 1, by: 0.5 }, ok).passed).toBe(true);
    const ring = trace([[0, 0], [0.5, 157], [0.8, 159], [1, 157]]);
    expect(evaluateCriterion({ kind: 'settles', value: 157, tolerance: 1, by: 0.5 }, ring).firstViolation?.t).toBe(0.8);
  });
  it('fails with a reason when no sample falls in the window or a value is not finite', () => {
    const empty = evaluateCriterion({ kind: '<=', value: 1, window: [2, 3] }, trace([[0, 0], [1, 0]]));
    expect(empty.passed).toBe(false);
    expect(empty.firstViolation?.reason).toMatch(/no samples/i);
    const nan = evaluateCriterion({ kind: '<=', value: 1, window: [0, 1] }, trace([[0, 0], [0.5, Number.NaN]]));
    expect(nan).toMatchObject({ passed: false, firstViolation: { t: 0.5 } });
  });
});
