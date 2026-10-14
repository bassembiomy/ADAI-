// WP-08a: state machine verification runner. Contract: plan §2 item 4
import { createAppSimulationSession, setSessionVariableValue, stepAppSimulationSession } from '../../utils/stateMachine/smAppAdapter';
import { parseSimTarget } from './simTarget';
import { stimulusValue, validateCriterion } from './simCriterion';
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

  const stimuli: { id: string; profile: SimCriterion['stimuli'][number]['profile'] }[] = [];
  for (const s of criterion.stimuli) {
    const p = parseSimTarget(s.target);
    if (!p || p.domain !== 'sm' || p.kind !== 'variable') {
      diagnostics.push({ code: 'UNSUPPORTED_TARGET', message: `stimulus target "${s.target}" is not a state machine variable`, target: s.target });
    } else if (!varIds.has(p.id)) {
      diagnostics.push({ code: 'UNKNOWN_TARGET', message: `variable "${p.id}" is not in the model`, target: s.target });
    } else stimuli.push({ id: p.id, profile: s.profile });
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
    const session = createAppSimulationSession(model);
    const last = new Map<string, number>();
    const writeStimuli = (t: number) => {
      stimuli.forEach((s, i) => {
        const v = stimulusValue(s.profile, t);
        const key = String(i);
        if (last.get(key) === v) return;
        last.set(key, v);
        setSessionVariableValue(session, s.id, v);
      });
    };
    const sample = (t: number, frame: typeof session.initialFrame) => {
      let value: number;
      if (observed!.kind === 'state') value = frame.activeStateIds.includes(observed!.id) ? 1 : 0;
      else {
        const raw = t === 0 ? session.runtime.data[observed!.id] : frame.data[observed!.id];
        value = typeof raw === 'boolean' ? (raw ? 1 : 0) : Number(raw);
      }
      trace.push({ t, value });
    };

    writeStimuli(0);
    if (session.initialFrame.error) return runtimeError(session.initialFrame.error);
    sample(0, session.initialFrame);
    const n = Math.floor(criterion.duration / criterion.step + 1e-9);
    for (let k = 1; k <= n; k++) {
      const t = k * criterion.step;
      writeStimuli((k - 1) * criterion.step);
      const frame = stepAppSimulationSession(session, criterion.step * 1000);
      if (frame.error) return runtimeError(frame.error);
      sample(t, frame);
    }
  } catch (e) {
    return runtimeError(e instanceof Error ? e.message : String(e));
  }

  return { trace, evaluation: evaluateCriterion(criterion.check, trace), diagnostics: [] };
}
