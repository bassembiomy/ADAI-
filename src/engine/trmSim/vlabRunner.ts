// WP-08c: V-Lab verification runner. Contract: plan §2 item 4
import { VLabPhysicsEngine } from '../vlab/vlabPhysics';
import { scalarSample } from '../vlab/vlabScopeRead';
import { extractVlabInterface } from './vlabInterface';
import { parseSimTarget } from './simTarget';
import { stepCount, stimulusValue, validateCriterion } from './simCriterion';
import type { SimCriterion } from './simCriterion';
import { evaluateCriterion } from './simEvaluate';
import type { SimEvaluation, SimTraceSample } from './simEvaluate';

type Diag = { code: string; message: string; target?: string };
export interface VlabRunResult { trace: SimTraceSample[]; evaluation: SimEvaluation; diagnostics: Diag[] }

const PROBE = '__trm_probe';

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
  let probePort: string | undefined;
  let varName: string | undefined;
  let observedUnit: string | undefined;
  if (obs.kind === 'solverVariable') {
    varName = obs.name;
  } else if (obs.kind === 'port') {
    const sig = iface.signals.find(s => s.blockId === obs.blockId && s.portId === obs.portId);
    if (!sig) return bad('UNKNOWN_TARGET', `Unknown port "${criterion.observe}"`, criterion.observe);
    if (sig.kind === 'conserving') return bad('NOT_OBSERVABLE', `Port "${criterion.observe}" is conserving; observe it through a sensor block`, criterion.observe);
    if (sig.direction !== 'observe') return bad('NOT_OBSERVABLE', `Port "${criterion.observe}" is an input`, criterion.observe);
    probeNode = obs.blockId; probePort = obs.portId; observedUnit = sig.unit;
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
  const stim: { blockId: string; name: string; profile: SimCriterion['stimuli'][number]['profile'] }[] = [];
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
    stim.push({ blockId: t.blockId, name: t.name, profile: s.profile });
  }

  if (probeNode !== undefined && !source.nodes.some(n => n && n.id === probeNode)) {
    return bad('UNKNOWN_TARGET', `Unknown block "${probeNode}"`, criterion.observe);
  }

  try {
    const engine = new VLabPhysicsEngine();
    const baseEdges: any[] = [...(source.edges ?? [])];
    if (probeNode !== undefined) {
      baseEdges.push({ id: '__trm_probe_e', source: probeNode, sourceHandle: probePort + '_s', target: PROBE, targetHandle: 'in1_t' });
    }
    let state: any = undefined;
    for (let k = 1; k <= N; k++) {
      const tIn = (k - 1) * step;
      const nodes: any[] = source.nodes.map(n => {
        const mine = stim.filter(s => s.blockId === n.id);
        if (mine.length === 0) return n;
        const params = { ...(n.data?.params ?? {}) };
        for (const s of mine) params[s.name] = stimulusValue(s.profile, tIn);
        return { ...n, data: { ...n.data, params } };
      });
      if (probeNode !== undefined) {
        nodes.push({ id: PROBE, type: 'default', position: { x: 0, y: 0 }, data: { type: 'scope', params: { numSignals: 1 } } });
      }
      state = engine.simulateStep(nodes, baseEdges, state, step);
      let raw: unknown;
      if (varName !== undefined) {
        const idx = (state.variableNames ?? []).indexOf(varName);
        if (idx < 0) return bad('UNKNOWN_TARGET', `Unknown solver variable "${varName}"`, criterion.observe);
        raw = state.x[idx];
      } else {
        const pv = state.perScopeValues?.[PROBE];
        raw = pv !== null && typeof pv === 'object' && !Array.isArray(pv) && 'value' in pv ? (pv as any).value : pv;
      }
      const value = scalarSample(raw, { scopeId: PROBE, channel: 0, variable: varName });
      trace.push({ t: k * step, value });
    }
  } catch (e) {
    diagnostics.push({ code: 'RUNTIME_ERROR', message: e instanceof Error ? e.message : String(e) });
    return { trace, evaluation: { passed: false, samplesChecked: trace.length }, diagnostics };
  }

  return { trace, evaluation: evaluateCriterion(criterion.check, trace), diagnostics };
}
