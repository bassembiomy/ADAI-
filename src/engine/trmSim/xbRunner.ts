// WP-08b: headless X-Bridges verification runner. Contract: plan §2 item 4.
import { createSimSessionFromSource } from './simSession';
import { BLOCK_LIBRARY } from '../xbridges/BlockDefinitions';
import { parseSimTarget } from './simTarget';
import { extractXbInterface } from './xbInterface';
import { stepCount, stimulusValue, validateCriterion } from './simCriterion';
import type { SimCriterion } from './simCriterion';
import { evaluateCriterion } from './simEvaluate';
import type { SimEvaluation, SimTraceSample } from './simEvaluate';

export interface XbRunDiagnostic { code: string; message: string; target?: string }
export interface XbRunResult { trace: SimTraceSample[]; evaluation: SimEvaluation; diagnostics: XbRunDiagnostic[] }

type Drive =
  | { kind: 'param'; blockId: string; name: string }
  | { kind: 'input'; blockId: string; portId: string };

const clone = <T,>(v: T): T => {
  try {
    return typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v));
  } catch {
    return JSON.parse(JSON.stringify(v));
  }
};

function fail(diagnostics: XbRunDiagnostic[], reason = 'run not executed'): XbRunResult {
  return {
    trace: [],
    evaluation: { passed: false, samplesChecked: 0, firstViolation: { t: 0, value: Number.NaN, reason } },
    diagnostics,
  };
}

export function runXbVerification(
  source: { canvas: string; nodes: any[]; edges?: any[] },
  criterion: SimCriterion,
): XbRunResult {
  const invalid = validateCriterion(criterion);
  if (invalid.length > 0) return fail(invalid.map(d => ({ code: d.code, message: d.message })), 'invalid criterion');

  const nodes: any[] = Array.isArray(source.nodes) ? source.nodes : [];
  const edges: any[] = Array.isArray(source.edges) ? source.edges : [];

  // Rebuild the model like XbridgesWorkspace does.
  const blocks: any[] = [];
  const unknownBlocks: string[] = [];
  for (const n of nodes) {
    const d = (n && typeof n.data === 'object' && n.data) ? n.data : {};
    const type: string = typeof d.type === 'string' ? d.type : n?.type;
    const id: string = typeof d.id === 'string' ? d.id : n?.id;
    if (typeof id !== 'string') { unknownBlocks.push('(no id)'); continue; }
    if (!BLOCK_LIBRARY[type]) { unknownBlocks.push(`${id} (type "${String(type)}")`); continue; }
    const params = clone(d.params ?? {});
    try {
      const fresh = BLOCK_LIBRARY[type](id, params);
      blocks.push({ ...fresh, id, params: { ...params, ...fresh.params } });
    } catch {
      unknownBlocks.push(`${id} (type "${String(type)}", rebuild failed)`);
    }
  }
  const connections = edges.map(e => ({
    sourceBlock: e.source, sourcePort: e.sourceHandle, targetBlock: e.target, targetPort: e.targetHandle,
  }));
  const blockById = new Map<string, any>(blocks.map(b => [b.id, b]));

  // Resolve targets.
  const diagnostics: XbRunDiagnostic[] = [];
  const bad = (code: string, message: string, target: string) => diagnostics.push({ code, message, target });

  const checkCanvas = (t: Exclude<ReturnType<typeof parseSimTarget>, null>, raw: string): boolean => {
    if (t.domain !== 'xb') { bad('UNSUPPORTED_TARGET', 'target belongs to another engine', raw); return false; }
    if (t.canvas.startsWith('state:') || source.canvas.startsWith('state:')) {
      bad('UNSUPPORTED_TARGET', 'models inside a state run in the state machine runner', raw); return false;
    }
    if (t.canvas !== source.canvas) { bad('UNKNOWN_TARGET', `canvas "${t.canvas}" is not the source canvas`, raw); return false; }
    return true;
  };

  for (const b of unknownBlocks) bad('UNKNOWN_BLOCK', `block ${b} cannot be rebuilt; refusing to run a different model than the canvas`, b.split(' ')[0]);

  const observeRaw = criterion.observe;
  const obs = parseSimTarget(observeRaw);
  let observed: { blockId: string; portId: string } | null = null;
  if (!obs) bad('UNKNOWN_TARGET', 'observe is not a valid sim target', observeRaw);
  else if (checkCanvas(obs, observeRaw)) {
    if (obs.domain === 'xb' && obs.kind === 'port') {
      const b = blockById.get(obs.blockId);
      if (!b) bad('UNKNOWN_TARGET', `block "${obs.blockId}" not found`, observeRaw);
      else if (![...(b.outputs ?? []), ...(b.inputs ?? [])].some((p: any) => p.id === obs.portId)) {
        bad('UNKNOWN_TARGET', `port "${obs.portId}" not found on block "${obs.blockId}"`, observeRaw);
      } else {
        observed = { blockId: obs.blockId, portId: obs.portId };
        const sig = extractXbInterface({ canvas: source.canvas, nodes, edges }).signals
          .find(x => x.blockId === obs.blockId && x.portId === obs.portId);
        for (const d of validateCriterion(criterion, sig?.unit)) {
          if (d.code === 'UNIT_MISMATCH') bad('UNIT_MISMATCH', d.message, observeRaw);
        }
      }
    } else bad('UNKNOWN_TARGET', 'observe must name a block port', observeRaw);
  }

  const drives: { drive: Drive; target: string; profile: SimCriterion['stimuli'][number]['profile'] }[] = [];
  for (const s of criterion.stimuli) {
    const t = parseSimTarget(s.target);
    if (!t) { bad('UNKNOWN_TARGET', 'stimulus is not a valid sim target', s.target); continue; }
    if (!checkCanvas(t, s.target)) continue;
    if (t.domain !== 'xb') continue;
    if (t.kind === 'param') {
      const b = blockById.get(t.blockId);
      if (!b) bad('UNKNOWN_TARGET', `block "${t.blockId}" not found`, s.target);
      else if (!b.params || !(t.name in b.params)) bad('UNKNOWN_TARGET', `parameter "${t.name}" not found on block "${t.blockId}"`, s.target);
      else drives.push({ drive: { kind: 'param', blockId: t.blockId, name: t.name }, target: s.target, profile: s.profile });
    } else if (t.kind === 'port') {
      const b = blockById.get(t.blockId);
      if (!b) { bad('UNKNOWN_TARGET', `block "${t.blockId}" not found`, s.target); continue; }
      const isInput = (b.inputs ?? []).some((p: any) => p.id === t.portId);
      const isOutput = (b.outputs ?? []).some((p: any) => p.id === t.portId);
      if (!isInput && !isOutput) bad('UNKNOWN_TARGET', `port "${t.portId}" not found on block "${t.blockId}"`, s.target);
      else if (!isInput || connections.some(c => c.targetBlock === t.blockId && c.targetPort === t.portId)) {
        bad('NOT_STIMULABLE', 'only unconnected input ports and block parameters can be driven', s.target);
      } else drives.push({ drive: { kind: 'input', blockId: t.blockId, portId: t.portId }, target: s.target, profile: s.profile });
    } else bad('NOT_STIMULABLE', 'stimulus must be a block parameter or an unconnected input port', s.target);
  }
  if (diagnostics.length > 0 || !observed) return fail(diagnostics);

  const runtime = (message: string): XbRunResult => fail([{ code: 'RUNTIME_ERROR', message, target: observeRaw }], message);

  try {
    const created = createSimSessionFromSource('xb', { canvas: source.canvas, nodes, edges }, {
      observe: [observeRaw], drive: drives.map(d => d.target), step: criterion.step,
    });
    if (!created.session) return fail(created.diagnostics);
    const session = created.session;

    const last = new Map<number, number>();
    const apply = (t: number) => {
      drives.forEach((d, i) => {
        const v = stimulusValue(d.profile, t);
        if (last.has(i) && last.get(i) === v) return;
        last.set(i, v);
        session.write(d.target, v);
      });
    };

    const trace: SimTraceSample[] = [];
    let error: string | null = null;
    const sample = (t: number) => {
      const v = session.read(observeRaw);
      if (typeof v !== 'number') {
        error = `observed value at t=${t} is not a number`;
        return;
      }
      trace.push({ t, value: v });
    };

    apply(0);
    const init = session.initialize();
    if (init) return init.details ? fail(init.details, 'compile failed') : runtime(init.message);
    sample(0);
    const n = stepCount(criterion.duration, criterion.step);
    for (let k = 1; k <= n && error === null; k++) {
      apply((k - 1) * criterion.step);
      const err = session.step((k - 1) * criterion.step, criterion.step);
      if (err) return runtime(err.message);
      sample(k * criterion.step);
    }
    if (error !== null) return runtime(error);
    return { trace, evaluation: evaluateCriterion(criterion.check, trace), diagnostics: [] };
  } catch (e) {
    return runtime(e instanceof Error ? e.message : String(e));
  }
}
