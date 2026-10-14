// WP-08a: state machine verification runner. Contract: plan §2 item 4
import { createSimSessionFromSource } from './simSession';
import { parseSimTarget } from './simTarget';
import { stepCount, stimulusValue, validateCriterion } from './simCriterion';
import type { SimCriterion } from './simCriterion';
import { evaluateCriterion } from './simEvaluate';
import type { SimEvaluation, SimTraceSample } from './simEvaluate';

export interface SmRunDiagnostic { code: string; message: string; target?: string }
export interface SmRunResult { trace: SimTraceSample[]; evaluation: SimEvaluation; diagnostics: SmRunDiagnostic[] }

const failed = (diagnostics: SmRunDiagnostic[]): SmRunResult => ({
  trace: [],
  evaluation: { passed: false, samplesChecked: 0 },
  diagnostics,
});

export function runSmVerification(model: any, criterion: SimCriterion): SmRunResult {
  const invalid = validateCriterion(criterion);
  if (invalid.length > 0) return failed(invalid.map(d => ({ code: d.code, message: d.message })));

  const varIds = new Set<string>((model?.variables ?? []).map((v: any) => v.id));
  const stateIds = new Set<string>((model?.states ?? []).map((s: any) => s.id));
  const diagnostics: SmRunDiagnostic[] = [];

  const stimuli: { id: string; target: string; profile: SimCriterion['stimuli'][number]['profile'] }[] = [];
  for (const s of criterion.stimuli) {
    const p = parseSimTarget(s.target);
    if (!p || p.domain !== 'sm' || p.kind !== 'variable') {
      diagnostics.push({ code: 'UNSUPPORTED_TARGET', message: `stimulus target "${s.target}" is not a state machine variable`, target: s.target });
    } else if (!varIds.has(p.id)) {
      diagnostics.push({ code: 'UNKNOWN_TARGET', message: `variable "${p.id}" is not in the model`, target: s.target });
    } else stimuli.push({ id: p.id, target: s.target, profile: s.profile });
  }

  let observed: { kind: 'var' | 'state'; id: string } | null = null;
  const parsed = parseSimTarget(criterion.observe);
  if (parsed) {
    if (parsed.domain !== 'sm' || parsed.kind !== 'variable') {
      diagnostics.push({ code: 'UNSUPPORTED_TARGET', message: `observe target "${criterion.observe}" is not supported`, target: criterion.observe });
    } else if (!varIds.has(parsed.id)) {
      diagnostics.push({ code: 'UNKNOWN_TARGET', message: `variable "${parsed.id}" is not in the model`, target: criterion.observe });
    } else observed = { kind: 'var', id: parsed.id };
  } else if (criterion.observe.startsWith('sim:')) {
    diagnostics.push({ code: 'UNSUPPORTED_TARGET', message: `observe target "${criterion.observe}" is not supported`, target: criterion.observe });
  } else if (stateIds.has(criterion.observe)) {
    observed = { kind: 'state', id: criterion.observe };
  } else {
    diagnostics.push({ code: 'UNKNOWN_TARGET', message: `state "${criterion.observe}" is not in the model`, target: criterion.observe });
  }
  if (diagnostics.length > 0 || !observed) return failed(diagnostics);

  const trace: SimTraceSample[] = [];
  const runtimeError = (message: string): SmRunResult => ({
    trace,
    evaluation: { passed: false, samplesChecked: 0 },
    diagnostics: [{ code: 'RUNTIME_ERROR', message }],
  });

  try {
    const created = createSimSessionFromSource('sm', model, {
      observe: [criterion.observe], drive: stimuli.map(s => s.target), step: criterion.step,
    });
    if (!created.session) return failed(created.diagnostics);
    const session = created.session;
    const last = new Map<string, number>();
    const writeStimuli = (t: number) => {
      stimuli.forEach((s, i) => {
        const v = stimulusValue(s.profile, t);
        const key = String(i);
        if (last.get(key) === v) return;
        last.set(key, v);
        session.write(s.target, v);
      });
    };
    const sample = (t: number) => {
      trace.push({ t, value: session.read(criterion.observe) as number });
    };

    writeStimuli(0);
    const init = session.initialize();
    if (init) return runtimeError(init.message);
    sample(0);
    const n = stepCount(criterion.duration, criterion.step);
    for (let k = 1; k <= n; k++) {
      const t = k * criterion.step;
      writeStimuli((k - 1) * criterion.step);
      const err = session.step((k - 1) * criterion.step, criterion.step);
      if (err) return runtimeError(err.message);
      sample(t);
    }
  } catch (e) {
    return runtimeError(e instanceof Error ? e.message : String(e));
  }

  return { trace, evaluation: evaluateCriterion(criterion.check, trace), diagnostics: [] };
}
