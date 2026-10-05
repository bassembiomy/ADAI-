import { PatternStore } from '../patternStore';
import { EngineeringPattern, EngineeringPatternSchema } from '../patternSchemas';
import { XbridgesCapabilityIndex } from '../../catalog/xbridgesCapabilityIndex';
import { validatePatternCatalogCompatibility } from '../validation/patternCatalogValidator';

export interface PatternProofResult {
  status: 'proved' | 'failed';
  engineRunId?: string;
  observables?: Record<string, unknown>;
  message?: string;
}

export type PatternProofRunner = (pattern: EngineeringPattern, catalog: XbridgesCapabilityIndex) => Promise<PatternProofResult>;

export interface PatternReviewDecision {
  reviewer: string;
  notes: string;
  approvedTargetLifecycle: 'reviewed' | 'verified';
}

export async function proveAndReviewPattern(
  patternId: string,
  store: PatternStore,
  catalog: XbridgesCapabilityIndex,
  proofRunner: PatternProofRunner,
  review: PatternReviewDecision,
): Promise<EngineeringPattern> {
  const pattern = await store.get(patternId);
  if (pattern.lifecycle !== 'quarantined' && pattern.lifecycle !== 'reviewed') throw new Error(`PROMOTION_STATE_INVALID: '${pattern.lifecycle}'.`);
  if (!pattern.provenance.licenseApproved) throw new Error('LICENSE_NOT_APPROVED: Pattern requires license approval before promotion.');
  const compatibility = validatePatternCatalogCompatibility(pattern, catalog);
  if (!compatibility.valid) throw new Error(`PATTERN_NOT_COMPATIBLE: ${compatibility.diagnostics.map(d => d.code).join(',')}`);
  const proof = await proofRunner(pattern, catalog);
  if (proof.status !== 'proved' || !proof.engineRunId) throw new Error(`PATTERN_PROOF_FAILED: ${proof.message || 'A genuine engine run ID is required.'}`);
  const payload: Omit<EngineeringPattern, 'id' | 'contentHash'> = {
    ...pattern,
    lifecycle: review.approvedTargetLifecycle,
    provenance: { ...pattern.provenance, licenseApproved: true },
    evidence: {
      ...pattern.evidence,
      proofStatus: 'proved',
      catalogFingerprint: catalog.catalogFingerprint,
      engineRunId: proof.engineRunId,
      measuredAt: Date.now(),
      qualityScore: Math.max(pattern.evidence.qualityScore, review.approvedTargetLifecycle === 'verified' ? 0.95 : 0.75),
    },
  };
  return store.put(payload);
}

export function assertRuntimePatternVerified(pattern: EngineeringPattern, catalog: XbridgesCapabilityIndex): void {
  EngineeringPatternSchema.parse(pattern);
  if (pattern.lifecycle !== 'verified' || !pattern.provenance.licenseApproved || pattern.evidence.proofStatus !== 'proved' || pattern.evidence.catalogFingerprint !== catalog.catalogFingerprint) {
    throw new Error(`PATTERN_NOT_EXECUTABLE: '${pattern.id}' is not currently verified against the active catalog.`);
  }
}
