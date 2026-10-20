// WP-07: simulation criterion model and validation. Contract: plan §2.3
export type SimStimulusProfile =
  | { kind: 'constant'; value: number }
  | { kind: 'step'; before: number; after: number; at: number }
  | { kind: 'ramp'; from: number; slope: number; start: number };

export interface SimStimulus { target: string; profile: SimStimulusProfile }

export type SimCheck =
  | { kind: '<=' | '>='; value: number; window: [number, number] }
  | { kind: 'within'; value: number; tolerance: number; window: [number, number] }
  | { kind: 'reaches'; value: number; by: number; direction?: 'rising' | 'falling' }
  | { kind: 'settles'; value: number; tolerance: number; by: number };

export interface SimCriterion {
  id: string;
  requirementId: string;
  verificationCaseId: string;
  stimuli: SimStimulus[];
  observe: string;
  unit?: string;
  check: SimCheck;
  duration: number;
  step: number;
}

export interface SimCriterionDiagnostic {
  code: 'DURATION' | 'STEP' | 'WINDOW' | 'TOLERANCE' | 'UNIT_MISMATCH' | 'OBSERVE' | 'STIMULUS' | 'VALUE';
  message: string;
}

export function stimulusValue(p: SimStimulusProfile, t: number): number {
  switch (p.kind) {
    case 'constant': return p.value;
    case 'step': return timeGE(t, p.at) ? p.after : p.before;
    case 'ramp': return !timeGE(t, p.start) ? p.from : p.from + p.slope * Math.max(0, t - p.start);
  }
}

export const MAX_SIM_STEPS = 20000;
export const TIME_EPS = 1e-9;
export function stepCount(duration: number, step: number): number { return Math.round(duration / step); }
export function timeLE(a: number, b: number): boolean { return a <= b + TIME_EPS * Math.max(1, Math.abs(b)); }
export function timeGE(a: number, b: number): boolean { return timeLE(b, a); }

export function validateCriterion(c: SimCriterion, observedUnit?: string): SimCriterionDiagnostic[] {
  const out: SimCriterionDiagnostic[] = [];
  const add = (code: SimCriterionDiagnostic['code'], message: string) => out.push({ code, message });
  const fin = Number.isFinite;

  const durOk = fin(c.duration) && c.duration > 0;
  if (!durOk) add('DURATION', 'duration must be a finite number > 0');
  if (!(fin(c.step) && c.step > 0)) add('STEP', 'step must be a finite number > 0');
  else if (durOk && c.step > c.duration) add('STEP', 'step must be <= duration');
  else if (durOk) {
    const n = stepCount(c.duration, c.step);
    if (Math.abs(n * c.step - c.duration) > TIME_EPS * Math.max(1, c.duration)) {
      add('STEP', 'duration must be a whole multiple of step');
    }
    if (n > MAX_SIM_STEPS) add('STEP', `too many steps (${n} > ${MAX_SIM_STEPS})`);
  }

  const inRange = (x: number) => fin(x) && timeGE(x, 0) && (!durOk || timeLE(x, c.duration));
  const k = c.check;
  if ('window' in k) {
    const [t0, t1] = k.window;
    if (!fin(t0) || !fin(t1) || !timeLE(t0, t1)) add('WINDOW', 'window must be finite with start <= end');
    else if (!inRange(t0) || !inRange(t1)) add('WINDOW', 'window must lie within [0, duration]');
  } else if (!inRange(k.by)) {
    add('WINDOW', '"by" must lie within [0, duration]');
  }
  if ((k.kind === 'within' || k.kind === 'settles') && !(fin(k.tolerance) && k.tolerance >= 0)) {
    add('TOLERANCE', 'tolerance must be a finite number >= 0');
  }
  if (!fin(k.value)) add('VALUE', 'check value must be finite');

  if (typeof c.observe !== 'string' || c.observe.trim() === '') add('OBSERVE', 'observe must be non-empty');

  for (const s of c.stimuli) {
    const p = s.profile;
    const nums = p.kind === 'constant' ? [p.value]
      : p.kind === 'step' ? [p.before, p.after, p.at]
      : [p.from, p.slope, p.start];
    if (typeof s.target !== 'string' || s.target.trim() === '') add('STIMULUS', 'stimulus target must be non-empty');
    if (!nums.every(fin)) add('STIMULUS', `stimulus "${s.target}" has non-finite profile numbers`);
  }

  if (c.unit !== undefined && observedUnit !== undefined && c.unit.trim() !== observedUnit.trim()) {
    add('UNIT_MISMATCH', `criterion unit "${c.unit}" differs from observed unit "${observedUnit}"`);
  }
  return out;
}
