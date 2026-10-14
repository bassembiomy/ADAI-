// WP-07: criterion evaluation over a sampled trace. Contract: plan §2.3
import type { SimCheck } from './simCriterion';

export interface SimTraceSample { t: number; value: number }
export interface SimViolation { t: number; value: number; reason: string }
export interface SimEvaluation { passed: boolean; samplesChecked: number; firstViolation?: SimViolation }

function noSamples(t: number): SimEvaluation {
  return { passed: false, samplesChecked: 0, firstViolation: { t, value: Number.NaN, reason: 'no samples in range' } };
}

function scan(
  samples: readonly SimTraceSample[],
  ok: (v: number) => boolean,
  describe: (v: number) => string,
): SimEvaluation {
  let n = 0;
  for (const s of samples) {
    n++;
    if (!Number.isFinite(s.value)) {
      return { passed: false, samplesChecked: n, firstViolation: { t: s.t, value: s.value, reason: 'non-finite sample value' } };
    }
    if (!ok(s.value)) {
      return { passed: false, samplesChecked: n, firstViolation: { t: s.t, value: s.value, reason: describe(s.value) } };
    }
  }
  return { passed: true, samplesChecked: n };
}

export function evaluateCriterion(check: SimCheck, trace: readonly SimTraceSample[]): SimEvaluation {
  switch (check.kind) {
    case '<=':
    case '>=':
    case 'within': {
      const [t0, t1] = check.window;
      const inWin = trace.filter(s => s.t >= t0 && s.t <= t1);
      if (inWin.length === 0) return noSamples(t0);
      if (check.kind === '<=') return scan(inWin, v => v <= check.value, v => `${v} > ${check.value}`);
      if (check.kind === '>=') return scan(inWin, v => v >= check.value, v => `${v} < ${check.value}`);
      if (!('tolerance' in check)) return noSamples(t0);
      const { value, tolerance } = check;
      return scan(inWin, v => Math.abs(v - value) <= tolerance, v => `${v} outside ${value} ± ${tolerance}`);
    }
    case 'reaches': {
      const early = trace.filter(s => s.t <= check.by);
      if (early.length === 0) return noSamples(check.by);
      const falling = check.direction === 'falling';
      let n = 0;
      for (const s of early) {
        n++;
        if (Number.isFinite(s.value) && (falling ? s.value <= check.value : s.value >= check.value)) {
          return { passed: true, samplesChecked: n };
        }
      }
      const last = early[early.length - 1];
      return {
        passed: false,
        samplesChecked: n,
        firstViolation: {
          t: last.t,
          value: last.value,
          reason: `did not reach ${check.value} (${falling ? 'falling' : 'rising'}) by t=${check.by}`,
        },
      };
    }
    case 'settles': {
      const late = trace.filter(s => s.t >= check.by);
      if (late.length === 0) return noSamples(check.by);
      return scan(late, v => Math.abs(v - check.value) <= check.tolerance,
        v => `${v} outside ${check.value} ± ${check.tolerance} after t=${check.by}`);
    }
  }
}
