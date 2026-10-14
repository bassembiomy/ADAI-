import type { SysmlRepository, VerificationEvidence } from '../sysml/model';
import { deriveEvidenceStatus, recordVerificationEvidence, type EvidenceCurrency } from '../sysml/evidence';
import type { SimCriterion } from './simCriterion';

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
