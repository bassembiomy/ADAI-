// WP-10: controller behind the requirement simulation panel. Contract: plan §3 WP-10
import type { SysmlRepository, VerificationCase, VerificationEvidence } from '../sysml/model';
import type { EvidenceCurrency } from '../sysml/evidence';
import { BLOCK_LIBRARY } from '../xbridges/BlockDefinitions';
import type { SimCriterion } from './simCriterion';
import { buildSimExternalElements } from './simExternalElements';
import { projectSimSources } from './simEndpoints';
import { parseSimTarget } from './simTarget';
import { extractSmInterface } from './smInterface';
import { extractXbInterface } from './xbInterface';
import { extractVlabInterface } from './vlabInterface';
import { runSmVerification } from './smRunner';
import { runXbVerification } from './xbRunner';
import { runVlabVerification } from './vlabRunner';
import { deriveSimEvidenceStatus, recordSimulationEvidence, simModelFingerprint } from './simEvidence';
import type { SimEvaluation, SimTraceSample } from './simEvaluate';

import { engineModelOf, engineOfSimTarget } from './simSession';
import type { SimEngine } from './simSession';

export type { SimEngine } from './simSession';

const LINK_KINDS = new Set(['satisfy', 'verify', 'refine', 'trace']);
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);

export interface LinkedSimTarget {
  relationshipId: string;
  target: string;
  name: string;
  kind: string;
  relationship: string;
  engine: SimEngine;
  missing?: true;
}

export function engineOfTarget(target: string): SimEngine {
  return engineOfSimTarget(target);
}

export function linkedSimTargets(repo: SysmlRepository, requirementId: string, project: unknown): LinkedSimTarget[] {
  const elements = new Map(buildSimExternalElements(projectSimSources(project)).map(e => [e.id, e]));
  const out: LinkedSimTarget[] = [];
  for (const rel of Object.values(repo.relationships)) {
    if (!LINK_KINDS.has(rel.kind)) continue;
    let other: string;
    if (rel.targetId === requirementId) other = rel.sourceId;
    else if (rel.sourceId === requirementId) other = rel.targetId;
    else continue;
    const el = elements.get(other);
    const isSim = parseSimTarget(other) !== null;
    if (!el && !isSim) continue;
    out.push(el
      ? { relationshipId: rel.id, target: other, name: el.name, kind: el.kind, relationship: rel.kind, engine: engineOfTarget(other) }
      : { relationshipId: rel.id, target: other, name: other, kind: 'unknown', relationship: rel.kind, engine: engineOfTarget(other), missing: true });
  }
  return out;
}

export function simulationCases(repo: SysmlRepository, requirementId: string): VerificationCase[] {
  return Object.values(repo.verificationCases).filter(c => c.method === 'simulation' && c.verifiesRequirementIds.includes(requirementId));
}

export interface SimCandidate { target: string; name: string; engine: SimEngine; unit?: string }

/** Rebuild X-Bridges nodes without saved ports through the block library, like the runner does. */
function withPorts(nodes: any[]): any[] {
  return nodes.map(n => {
    const d = n && typeof n.data === 'object' && n.data ? n.data : null;
    if (!d || Array.isArray(d.inputs) || Array.isArray(d.outputs) || (n.parameters && typeof n.parameters === 'object')) return n;
    const type = typeof d.type === 'string' ? d.type : n.type;
    const id = typeof d.id === 'string' ? d.id : n.id;
    const make = BLOCK_LIBRARY[type];
    if (!make || typeof id !== 'string') return n;
    try {
      const fresh: any = make(id, JSON.parse(JSON.stringify(d.params ?? {})));
      return { ...n, data: { ...d, inputs: fresh.inputs ?? [], outputs: fresh.outputs ?? [] } };
    } catch {
      return n;
    }
  });
}

export function simCandidates(project: any): { stimulus: SimCandidate[]; observe: SimCandidate[] } {
  const stimulus: SimCandidate[] = [];
  const observe: SimCandidate[] = [];
  const sm = extractSmInterface({
    states: arr(project?.states), transitions: arr(project?.transitions), variables: arr(project?.variables),
    junctions: arr(project?.junctions), hilConfig: project?.hilConfig,
  });
  for (const s of sm.signals) {
    if (s.direction !== 'output') stimulus.push({ target: s.target, name: s.name, engine: 'sm' });
    observe.push({ target: s.target, name: s.name, engine: 'sm' });
  }
  for (const s of sm.states) observe.push({ target: s.target, name: s.name, engine: 'sm' });

  const xbNodes = arr(project?.globalXBridgesNodes);
  if (xbNodes.length > 0) {
    const xb = extractXbInterface({ canvas: 'global', nodes: withPorts(xbNodes), edges: arr(project?.globalXBridgesEdges) });
    for (const s of xb.signals) {
      const c: SimCandidate = { target: s.target, name: s.name, engine: 'xb', ...(s.unit !== undefined ? { unit: s.unit } : {}) };
      if (s.portDirection === 'output') observe.push(c);
      else if (!s.connected) stimulus.push(c);
    }
    for (const p of xb.parameters) stimulus.push({ target: p.target, name: p.name, engine: 'xb' });
  }
  const vlNodes = arr(project?.vlabNodes);
  if (vlNodes.length > 0) {
    const vl = extractVlabInterface({ canvas: 'global', nodes: vlNodes, edges: arr(project?.vlabEdges) });
    for (const s of vl.signals) {
      if (s.kind === 'signal' && s.direction === 'observe') {
        observe.push({ target: s.target, name: s.name, engine: 'vlab', ...(s.unit !== undefined ? { unit: s.unit } : {}) });
      }
    }
    for (const p of vl.parameters) stimulus.push({ target: p.target, name: p.name, engine: 'vlab', ...(p.unit !== undefined ? { unit: p.unit } : {}) });
  }
  return { stimulus, observe };
}

export interface SimCriterionRun {
  engine: SimEngine;
  run: { trace: SimTraceSample[]; evaluation: SimEvaluation; diagnostics: { code: string; message: string; target?: string }[] };
  modelFingerprint: string;
}

export function runSimCriterion(project: any, criterion: SimCriterion): SimCriterionRun {
  const engine = engineOfTarget(criterion.observe);
  const model: any = engineModelOf(project, engine);
  const run = engine === 'sm' ? runSmVerification(model, criterion)
    : engine === 'xb' ? runXbVerification({ canvas: 'global', nodes: model.globalXBridgesNodes, edges: model.globalXBridgesEdges }, criterion)
    : runVlabVerification({ canvas: 'global', nodes: model.vlabNodes, edges: model.vlabEdges }, criterion);
  return { engine, run, modelFingerprint: simModelFingerprint(model) };
}

export interface VerifyOutcome {
  repository: SysmlRepository;
  evidence?: VerificationEvidence;
  run?: SimCriterionRun['run'];
  engine?: SimEngine;
  error?: string;
}

export function verifyRequirementBySimulation(
  repo: SysmlRepository, project: any, verificationCaseId: string, input: { id: string; executedAt: string },
): VerifyOutcome {
  const criterion = repo.verificationCases[verificationCaseId]?.simulationCriterion;
  if (!criterion) return { repository: repo, error: 'The verification case has no simulation criterion' };
  const res = runSimCriterion(project, criterion);
  if (res.run.diagnostics.length > 0 || res.run.trace.length === 0) {
    const why = res.run.diagnostics.map(d => `${d.code}: ${d.message}`).join('; ') || 'empty trace';
    return { repository: repo, run: res.run, engine: res.engine, error: `Simulation did not run (${why})` };
  }
  try {
    const rec = recordSimulationEvidence(repo, { id: input.id, criterion, run: res.run, modelFingerprint: res.modelFingerprint, executedAt: input.executedAt });
    return { repository: rec.repository, evidence: rec.evidence, run: res.run, engine: res.engine };
  } catch (e) {
    return { repository: repo, run: res.run, engine: res.engine, error: e instanceof Error ? e.message : String(e) };
  }
}

export function simEvidenceStatusFor(repo: SysmlRepository, evidenceId: string, project: unknown): EvidenceCurrency {
  const evidence = repo.evidence[evidenceId];
  if (!evidence) return 'missing';
  const criterion = repo.verificationCases[evidence.verificationCaseId]?.simulationCriterion;
  const fingerprint = criterion ? simModelFingerprint(engineModelOf(project, engineOfTarget(criterion.observe))) : '';
  return deriveSimEvidenceStatus(repo, evidenceId, fingerprint);
}

function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v as object).sort().filter(k => (v as any)[k] !== undefined).map(k => `${JSON.stringify(k)}:${stable((v as any)[k])}`).join(',')}}`;
  return JSON.stringify(v) ?? 'undefined';
}
const sameValue = (a: unknown, b: unknown): boolean => a === b || stable(a) === stable(b);

export type RepositoryChangeCommand =
  | { type: 'createElement'; element: any }
  | { type: 'updateElement'; elementId: string; patch: Record<string, unknown> }
  | { type: 'deleteElements'; elementIds: string[] };

/** Commands (for the SysML gateway) that turn `prev` into `next` for what the panel edits: links, criteria and evidence. */
export function repositoryChangeCommands(prev: SysmlRepository, next: SysmlRepository): RepositoryChangeCommand[] {
  const out: RepositoryChangeCommand[] = [];
  const removed = Object.keys(prev.relationships).filter(id => !next.relationships[id]);
  if (removed.length > 0) out.push({ type: 'deleteElements', elementIds: removed });
  for (const [id, rel] of Object.entries(next.relationships)) if (!prev.relationships[id]) out.push({ type: 'createElement', element: rel });
  for (const [id, vc] of Object.entries(next.verificationCases)) {
    if (prev.verificationCases[id] && !sameValue(prev.verificationCases[id].simulationCriterion, vc.simulationCriterion)) {
      out.push({ type: 'updateElement', elementId: id, patch: { simulationCriterion: vc.simulationCriterion } });
    }
  }
  for (const [id, ev] of Object.entries(next.evidence)) if (!prev.evidence[id]) out.push({ type: 'createElement', element: ev });
  return out;
}
