// WP-08c: V-Lab verification runner. Contract: plan §2 item 4
import { createSimSessionFromSource } from './simSession';
import { extractVlabInterface } from './vlabInterface';
import { parseSimTarget } from './simTarget';
import { stepCount, stimulusValue, validateCriterion } from './simCriterion';
import type { SimCriterion } from './simCriterion';
import { evaluateCriterion } from './simEvaluate';
import type { SimEvaluation, SimTraceSample } from './simEvaluate';

type Diag = { code: string; message: string; target?: string };
export interface VlabRunResult { trace: SimTraceSample[]; evaluation: SimEvaluation; diagnostics: Diag[] }

export function runVlabVerification(source: { canvas: string; nodes: any[]; edges?: any[] }, criterion: SimCriterion): VlabRunResult {
  const trace: SimTraceSample[] = [];
  const diagnostics: Diag[] = [];
  const fail = (): VlabRunResult => ({
    trace: [], evaluation: { passed: false, samplesChecked: 0 }, diagnostics,
  });
  const bad = (code: string, message: string, target?: string): VlabRunResult => {
    diagnostics.push(target === undefined ? { code, message } : { code, message, target });
    return fail();
  };

  const iface = extractVlabInterface(source);
  const canvasOk = (t: { canvas: string }) => t.canvas === source.canvas;

  // observe
  const obs = parseSimTarget(criterion.observe);
  if (!obs) return bad('UNKNOWN_TARGET', `Cannot parse observe target "${criterion.observe}"`, criterion.observe);
  if (obs.domain !== 'vlab') return bad('UNSUPPORTED_TARGET', `Target "${criterion.observe}" is not a V-Lab target`, criterion.observe);
  if (!canvasOk(obs)) return bad('UNKNOWN_TARGET', `Canvas "${obs.canvas}" is not "${source.canvas}"`, criterion.observe);
  let probeNode: string | undefined;
  let observedUnit: string | undefined;
  if (obs.kind === 'solverVariable') {
    // solver variables need no probe
  } else if (obs.kind === 'port') {
    const sig = iface.signals.find(s => s.blockId === obs.blockId && s.portId === obs.portId);
    if (!sig) return bad('UNKNOWN_TARGET', `Unknown port "${criterion.observe}"`, criterion.observe);
    if (sig.kind === 'conserving') return bad('NOT_OBSERVABLE', `Port "${criterion.observe}" is conserving; observe it through a sensor block`, criterion.observe);
    if (sig.direction !== 'observe') return bad('NOT_OBSERVABLE', `Port "${criterion.observe}" is an input`, criterion.observe);
    probeNode = obs.blockId; observedUnit = sig.unit;
  } else {
    return bad('UNKNOWN_TARGET', `Target "${criterion.observe}" is not an observable signal or solver variable`, criterion.observe);
  }

  const crit = validateCriterion(criterion, observedUnit);
  if (crit.length > 0) {
    for (const d of crit) diagnostics.push({ code: d.code, message: d.message });
    return fail();
  }

  // stimuli
  const N = stepCount(criterion.duration, criterion.step);
  const step = criterion.step;
  const stim: { blockId: string; name: string; target: string; profile: SimCriterion['stimuli'][number]['profile'] }[] = [];
  for (const s of criterion.stimuli) {
    const t = parseSimTarget(s.target);
    if (!t) return bad('UNKNOWN_TARGET', `Cannot parse stimulus target "${s.target}"`, s.target);
    if (t.domain !== 'vlab') return bad('UNSUPPORTED_TARGET', `Target "${s.target}" is not a V-Lab target`, s.target);
    if (!canvasOk(t)) return bad('UNKNOWN_TARGET', `Canvas "${t.canvas}" is not "${source.canvas}"`, s.target);
    if (t.kind === 'port') {
      if (!iface.signals.some(x => x.blockId === t.blockId && x.portId === t.portId)) return bad('UNKNOWN_TARGET', `Unknown port "${s.target}"`, s.target);
      return bad('NOT_STIMULABLE', `Port "${s.target}" cannot be driven; drive a parameter instead`, s.target);
    }
    if (t.kind !== 'param') return bad('NOT_STIMULABLE', `Target "${s.target}" cannot be driven`, s.target);
    const p = iface.parameters.find(x => x.blockId === t.blockId && x.key === t.name);
    if (!p) return bad('UNKNOWN_TARGET', `Unknown parameter "${s.target}"`, s.target);
    for (let k = 1; k <= N; k++) {
      const v = stimulusValue(s.profile, (k - 1) * step);
      const violates = !Number.isFinite(v)
        || (p.min !== undefined && (p.exclusiveMin ? v <= p.min : v < p.min))
        || (p.max !== undefined && (p.exclusiveMax ? v >= p.max : v > p.max))
        || (p.nonZero === true && v === 0);
      if (violates) return bad('OUT_OF_BOUNDS', `Value ${v} at t=${(k - 1) * step} violates the bounds of "${s.target}"`, s.target);
    }
    stim.push({ blockId: t.blockId, name: t.name, target: s.target, profile: s.profile });
  }

  if (probeNode !== undefined && !source.nodes.some(n => n && n.id === probeNode)) {
    return bad('UNKNOWN_TARGET', `Unknown block "${probeNode}"`, criterion.observe);
  }

  try {
    const created = createSimSessionFromSource('vlab', source, {
      observe: [criterion.observe], drive: stim.map(s => s.target), step,
    });
    if (!created.session) {
      diagnostics.push(...created.diagnostics);
      return fail();
    }
    const session = created.session;
    session.initialize();
    for (let k = 1; k <= N; k++) {
      const tIn = (k - 1) * step;
      for (const s of stim) {
        const w = session.write(s.target, stimulusValue(s.profile, tIn));
        if (w) return bad(w.code, w.message, w.target);
      }
      const err = session.step(tIn, step);
      if (err) {
        if (err.code === 'RUNTIME_ERROR') {
          // the session names its probe scope per observed port; the runner always had a single probe
          diagnostics.push({ code: 'RUNTIME_ERROR', message: err.message.split('__trm_probe_0').join('__trm_probe') });
          return { trace, evaluation: { passed: false, samplesChecked: trace.length }, diagnostics };
        }
        return bad(err.code, err.message, err.target);
      }
      trace.push({ t: k * step, value: session.read(criterion.observe) as number });
    }
  } catch (e) {
    diagnostics.push({ code: 'RUNTIME_ERROR', message: e instanceof Error ? e.message : String(e) });
    return { trace, evaluation: { passed: false, samplesChecked: trace.length }, diagnostics };
  }

  return { trace, evaluation: evaluateCriterion(criterion.check, trace), diagnostics };
}
