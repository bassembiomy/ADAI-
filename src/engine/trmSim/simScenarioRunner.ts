// WP-18b: coupled multi-engine scenario runner. Contract: plan §7.7
import type { SysmlRepository, VerificationCase } from '../sysml/model';
import { scenarioSchedule, validateScenario, type SimScenario, type SimScenarioDiagnostic } from './simScenario';
import { createSimSession, engineModelOf, engineOfSimTarget, type SimDiagnostic, type SimEngine, type SimEngineSession } from './simSession';
import { stepCount, stimulusValue } from './simCriterion';
import { aggregateRequirementVerdicts, evaluateAssertion, type SimAssertionResult, type SimSeries, type SimVerdict } from './simTemporal';
import { simModelFingerprint } from './simEvidence';

export interface SimScenarioRun {
  schedule: ReturnType<typeof scenarioSchedule>;
  series: SimSeries;
  assertions: SimAssertionResult[];
  requirements: Record<string, { verdict: SimVerdict; assertionIds: string[] }>;
  diagnostics: SimScenarioDiagnostic[];
  modelFingerprint: string;
  engines: SimEngine[];
}

const ENGINE_KEYS: SimEngine[] = ['sm', 'xb', 'vlab'];

export function scenarioModelFingerprint(project: unknown, engines: SimEngine[]): string {
  const model: Record<string, unknown> = {};
  for (const e of ENGINE_KEYS) if (engines.includes(e)) model[e] = engineModelOf(project, e);
  return simModelFingerprint(model);
}

class RuntimeStop extends Error {
  constructor(readonly diag: SimDiagnostic) { super(diag.message); }
}

export function runSimScenario(
  project: unknown,
  scenario: SimScenario,
  ctx: { repository?: SysmlRepository; verificationCase?: VerificationCase } = {},
): SimScenarioRun {
  const schedule = scenarioSchedule(scenario);
  const engines = schedule.engines;
  const modelFingerprint = scenarioModelFingerprint(project, engines);
  const diagnostics: SimScenarioDiagnostic[] = validateScenario(scenario, { project, ...ctx });
  const series: SimSeries = { times: [], values: {} };
  const result = (): SimScenarioRun => ({ schedule, series, assertions: [], requirements: {}, diagnostics, modelFingerprint, engines });
  if (diagnostics.some(d => d.severity === 'error')) return { ...result(), series: { times: [], values: {} } };

  const uniq = (xs: string[]) => xs.filter((x, i) => xs.indexOf(x) === i);
  const sessions = new Map<SimEngine, SimEngineSession>();
  for (const engine of schedule.order) {
    const observe = uniq([
      ...scenario.signals.filter(s => engineOfSimTarget(s.target) === engine).map(s => s.target),
      ...scenario.couplings.filter(c => engineOfSimTarget(c.from) === engine).map(c => c.from),
    ]);
    const drive = uniq([
      ...scenario.stimuli.filter(s => engineOfSimTarget(s.target) === engine).map(s => s.target),
      ...scenario.couplings.filter(c => engineOfSimTarget(c.to) === engine).map(c => c.to),
    ]);
    const r = createSimSession(engine, project, { observe, drive, step: scenario.step });
    if (!r.session) {
      for (const d of r.diagnostics) diagnostics.push({ severity: 'error', code: d.code, message: d.message, target: d.target });
      return { ...result(), series: { times: [], values: {} } };
    }
    sessions.set(engine, r.session);
  }

  const last = new Map<string, number>();
  const put = (engine: SimEngine, target: string, value: number | null) => {
    if (value === null || last.get(target) === value) return;
    last.set(target, value);
    const d = sessions.get(engine)!.write(target, value);
    if (d) throw new RuntimeStop(d);
  };
  const writeStimuli = (t: number) => {
    for (const s of scenario.stimuli) put(engineOfSimTarget(s.target), s.target, stimulusValue(s.profile, t));
  };
  const writeIncoming = (engine: SimEngine) => {
    for (const c of scenario.couplings) {
      if (engineOfSimTarget(c.to) !== engine) continue;
      put(engine, c.to, sessions.get(engineOfSimTarget(c.from))!.read(c.from));
    }
  };
  for (const s of scenario.signals) series.values[s.alias] = [];
  const sample = (t: number) => {
    for (const s of scenario.signals) series.values[s.alias].push(sessions.get(engineOfSimTarget(s.target))!.read(s.target));
    series.times.push(t);
  };

  try {
    writeStimuli(0);
    for (const engine of schedule.order) {
      writeIncoming(engine);
      const d = sessions.get(engine)!.initialize();
      if (d) throw new RuntimeStop(d);
    }
    sample(0);
    const n = stepCount(scenario.duration, scenario.step);
    for (let k = 1; k <= n; k++) {
      const t = (k - 1) * scenario.step;
      writeStimuli(t);
      for (const engine of schedule.order) {
        writeIncoming(engine);
        const d = sessions.get(engine)!.step(t, scenario.step);
        if (d) throw new RuntimeStop(d);
      }
      sample(k * scenario.step);
    }
  } catch (e) {
    if (!(e instanceof RuntimeStop)) throw e;
    diagnostics.push({ severity: 'error', code: e.diag.code, message: e.diag.message, target: e.diag.target });
    return result();
  }

  const assertions = scenario.assertions.map(a => evaluateAssertion(a, series, scenario.duration));
  return { schedule, series, assertions, requirements: aggregateRequirementVerdicts(assertions), diagnostics, modelFingerprint, engines };
}
