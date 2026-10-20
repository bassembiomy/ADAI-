import type { SysmlRepository, VerificationEvidence } from '../sysml/model';
import { deriveEvidenceStatus, recordVerificationEvidence, type EvidenceCurrency } from '../sysml/evidence';
import type { SimCriterion } from './simCriterion';
import type { SimScenario } from './simScenario';
import type { SimScenarioRun } from './simScenarioRunner';
import type { SimSeries } from './simTemporal';
import { parseSimExpression } from './simExpression';

const VIEW_ONLY_KEYS = new Set(['x', 'y', 'width', 'height', 'position', 'positionAbsolute', 'color', 'view', 'selected', 'dragging', 'hasControlPoint', 'measured', 'zIndex']);

function stripView(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripView);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>)) {
      if (VIEW_ONLY_KEYS.has(key)) continue;
      const child = (value as Record<string, unknown>)[key];
      // Parameter containers hold behaviour values whose names may collide with layout keys.
      out[key] = key === 'params' || key === 'parameters' ? child : stripView(child);
    }
    return out;
  }
  return value;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value as Record<string, unknown>).sort().map(key => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

function hash(value: string): string {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) { result ^= value.charCodeAt(index); result = Math.imul(result, 16777619); }
  return (result >>> 0).toString(16).padStart(8, '0');
}

/** Stable fingerprint of a simulated model, ignoring layout and view-only fields. */
export function simModelFingerprint(source: unknown): string {
  return hash(stableStringify(stripView(source)));
}

export interface SimRunLike {
  trace: { t: number; value: number }[];
  evaluation: { passed: boolean; firstViolation?: { t: number; value: number; reason: string } };
  diagnostics: unknown[];
}

export function recordSimulationEvidence(
  repo: SysmlRepository,
  input: { id: string; criterion: SimCriterion; run: SimRunLike; modelFingerprint: string; executedAt: string },
): { repository: SysmlRepository; evidence: VerificationEvidence } {
  const { id, criterion, run, modelFingerprint, executedAt } = input;
  if (run.diagnostics.length > 0 || run.trace.length === 0) throw new Error('Simulation did not run: it produced diagnostics or an empty trace');
  const vc = repo.verificationCases[criterion.verificationCaseId];
  if (!vc) throw new Error(`Verification case ${criterion.verificationCaseId} does not exist`);
  if (vc.method !== 'simulation') throw new Error(`Verification case ${vc.id} method is not simulation`);
  if (!vc.verifiesRequirementIds.includes(criterion.requirementId)) throw new Error(`Verification case ${vc.id} does not verify ${criterion.requirementId}`);
  const recorded = recordVerificationEvidence(repo, {
    id, verificationCaseId: vc.id, requirementId: criterion.requirementId, executedAt,
    result: run.evaluation.passed ? 'passed' : 'failed',
  });
  const simulation = { criterionId: criterion.id, modelFingerprint, trace: run.trace, firstViolation: run.evaluation.firstViolation };
  const evidence: VerificationEvidence = { ...recorded.evidence, simulation };
  recorded.repository.evidence[id] = evidence;
  return { repository: recorded.repository, evidence };
}

export function deriveSimEvidenceStatus(repo: SysmlRepository, evidenceId: string, currentModelFingerprint: string): EvidenceCurrency {
  const evidence = repo.evidence[evidenceId];
  if (!evidence) return 'missing';
  if (deriveEvidenceStatus(repo, evidenceId) !== 'current') return 'stale';
  return evidence.simulation && evidence.simulation.modelFingerprint !== currentModelFingerprint ? 'stale' : 'current';
}

const MAX_SERIES_SAMPLES = 2000;

function assertionAliases(a: SimScenario['assertions'][number]): string[] {
  const out: string[] = [];
  const sources = [a.condition, ...(a.temporal.kind === 'response' ? [a.temporal.trigger] : [])];
  for (const src of sources) {
    const parsed = parseSimExpression(src);
    if (parsed.ok) out.push(...parsed.aliases);
  }
  return out;
}

function reduceSeries(scenario: SimScenario, series: SimSeries, assertions: SimScenario['assertions'], results: { at?: { t: number } }[]): { series: SimSeries; decimated: boolean } {
  const used = new Set(assertions.flatMap(assertionAliases));
  const aliases = scenario.signals.map(s => s.alias).filter(a => used.has(a) && a in series.values);
  const len = series.times.length;
  let indices: number[];
  let decimated = false;
  if (len <= MAX_SERIES_SAMPLES) indices = series.times.map((_, i) => i);
  else {
    decimated = true;
    const kept = new Set<number>([0, len - 1]);
    for (const r of results) {
      if (!r.at) continue;
      const k = series.times.findIndex(t => t === r.at!.t);
      if (k >= 0) kept.add(k);
    }
    const stride = Math.ceil(len / MAX_SERIES_SAMPLES);
    let strided: number[] = [];
    for (let i = 0; i < len; i += stride) if (!kept.has(i)) strided.push(i);
    while (kept.size + strided.length > MAX_SERIES_SAMPLES && strided.length > 0) {
      const over = kept.size + strided.length - MAX_SERIES_SAMPLES;
      if (over >= strided.length) strided = [];
      else strided = strided.filter((_, j) => j % 2 === 0 || j / 2 >= over);
    }
    indices = [...new Set([...kept, ...strided])].sort((a, b) => a - b);
  }
  const values: Record<string, (number | null)[]> = {};
  for (const a of aliases) values[a] = indices.map(i => series.values[a][i]);
  return { series: { times: indices.map(i => series.times[i]), values }, decimated };
}

export function recordScenarioEvidence(
  repo: SysmlRepository,
  input: { newId: (requirementId: string) => string; scenario: SimScenario; run: SimScenarioRun; executedAt: string },
): { repository: SysmlRepository; evidence: VerificationEvidence[]; skipped: { requirementId: string; reason: string }[] } {
  const { newId, scenario, run, executedAt } = input;
  if (run.diagnostics.some(d => d.severity === 'error') || run.series.times.length === 0) throw new Error('Scenario did not run: it produced error diagnostics or an empty series');
  const vc = repo.verificationCases[scenario.verificationCaseId];
  if (!vc) throw new Error(`Verification case ${scenario.verificationCaseId} does not exist`);
  if (vc.method !== 'simulation') throw new Error(`Verification case ${vc.id} method is not simulation`);
  let repository = repo;
  const evidence: VerificationEvidence[] = [];
  const skipped: { requirementId: string; reason: string }[] = [];
  for (const requirementId of vc.verifiesRequirementIds) {
    const defs = scenario.assertions.filter(a => a.requirementId === requirementId);
    if (defs.length === 0) { skipped.push({ requirementId, reason: 'no assertion for this requirement' }); continue; }
    const results = run.assertions.filter(r => r.requirementId === requirementId);
    const verdict = run.requirements[requirementId]?.verdict;
    if (verdict === 'inconclusive' || verdict === undefined) {
      const why = results.filter(r => r.verdict === 'inconclusive').map(r => r.reason).join('; ');
      skipped.push({ requirementId, reason: `inconclusive: ${why}` });
      continue;
    }
    const id = newId(requirementId);
    const recorded = recordVerificationEvidence(repository, { id, verificationCaseId: vc.id, requirementId, executedAt, result: verdict });
    const reduced = reduceSeries(scenario, run.series, defs, results);
    const failed = results.filter(r => r.verdict === 'failed' && r.at).sort((a, b) => a.at!.t - b.at!.t)[0];
    let firstViolation: { t: number; value: number; reason: string } | undefined;
    if (failed?.at) {
      const def = defs.find(d => d.id === failed.assertionId);
      const alias = def ? assertionAliases({ ...def, temporal: { kind: 'always' } })[0] : undefined;
      const value = alias !== undefined ? failed.at.values[alias] : Object.values(failed.at.values)[0];
      firstViolation = { t: failed.at.t, value, reason: failed.reason };
    }
    const simulation: NonNullable<VerificationEvidence['simulation']> = {
      criterionId: scenario.id, scenarioId: scenario.id, modelFingerprint: run.modelFingerprint, engines: run.engines, trace: [],
      assertions: results, series: reduced.series, decimated: reduced.decimated,
      ...(firstViolation ? { firstViolation } : {}),
    };
    const full: VerificationEvidence = { ...recorded.evidence, simulation };
    recorded.repository.evidence[id] = full;
    repository = recorded.repository;
    evidence.push(full);
  }
  return { repository, evidence, skipped };
}
