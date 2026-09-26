import { PatternStore } from '../patternStore';
import {
  SourceCandidate,
  SourceCandidateSchema,
  QuarantinedPattern,
  PromotionReview,
  PromotionReviewSchema
} from './ingestionSchemas';
import { evaluateSourcePolicy } from './sourcePolicy';
import { EngineeringPattern, computePatternContentHash } from '../patternSchemas';

function sanitizeText(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\0/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function ingestCandidate(
  candidate: SourceCandidate,
  store: PatternStore
): Promise<QuarantinedPattern> {
  const validatedCandidate = SourceCandidateSchema.parse(candidate);

  // 1. Policy check
  const policyResult = evaluateSourcePolicy(validatedCandidate);
  if (policyResult.verdict === 'reject') {
    throw new Error(`Policy check failed: ${policyResult.reason}`);
  }

  // 2. Duplicate detection by originalSourceHash
  const existingPatterns = await store.list();
  const duplicate = existingPatterns.find(
    p => p.provenance.originalSourceHash === validatedCandidate.checksum
  );

  if (duplicate) {
    return {
      ...duplicate,
      lifecycle: 'quarantined',
      quarantineMetadata: {
        sourceCandidateChecksum: validatedCandidate.checksum,
        sourceUrl: validatedCandidate.sourceUrl,
        evaluatedAt: Date.now(),
        policyVerdict: policyResult.verdict,
        rawLicense: validatedCandidate.license
      }
    };
  }

  // 3. Parse content
  let parsedContent: any = {};
  if (!validatedCandidate.metadataOnly) {
    try {
      parsedContent = JSON.parse(validatedCandidate.content);
    } catch {
      throw new Error('MALFORMED_CONTENT: Ingestion candidate content is not valid JSON');
    }
  }

  const name = sanitizeText(parsedContent.name || validatedCandidate.title || 'Ingested Candidate');
  const description = sanitizeText(parsedContent.description || (validatedCandidate.metadataOnly ? validatedCandidate.content.slice(0, 500) : 'Quarantined external reference'));
  const domain = sanitizeText(parsedContent.domain || 'general');

  const patternPayload: Omit<EngineeringPattern, 'contentHash' | 'id'> = {
    version: 1,
    name,
    description,
    domain,
    provenance: {
      source: validatedCandidate.sourceUrl,
      author: validatedCandidate.author,
      license: policyResult.effectiveLicense,
      licenseApproved: policyResult.isPermissive,
      ingestedAt: validatedCandidate.retrievedAt,
      originalSourceHash: validatedCandidate.checksum
    },
    lifecycle: 'quarantined',
    requirements: {
      targetSystem: parsedContent.requirements?.targetSystem || 'general',
      targetBehaviors: parsedContent.requirements?.targetBehaviors || [],
      requiredInputs: parsedContent.requirements?.requiredInputs || [],
      requiredOutputs: parsedContent.requirements?.requiredOutputs || [],
      operatingRanges: parsedContent.requirements?.operatingRanges
    },
    topology: {
      blocks: parsedContent.topology?.blocks || [],
      connections: parsedContent.topology?.connections || []
    },
    exactMappings: parsedContent.exactMappings || {},
    simulationContract: {
      minDuration: parsedContent.simulationContract?.minDuration || 0.1,
      stepSize: parsedContent.simulationContract?.stepSize || 0.001,
      expectedObservables: parsedContent.simulationContract?.expectedObservables || []
    },
    evidence: {
      proofStatus: 'unproved',
      catalogFingerprint: 'quarantined_unproved',
      qualityScore: 0.5
    }
  };

  const stored = await store.put(patternPayload);

  return {
    ...stored,
    lifecycle: 'quarantined',
    quarantineMetadata: {
      sourceCandidateChecksum: validatedCandidate.checksum,
      sourceUrl: validatedCandidate.sourceUrl,
      evaluatedAt: Date.now(),
      policyVerdict: policyResult.verdict,
      rawLicense: validatedCandidate.license
    }
  };
}

export async function promoteQuarantinedPattern(
  patternId: string,
  store: PatternStore,
  review: PromotionReview
): Promise<EngineeringPattern> {
  const validatedReview = PromotionReviewSchema.parse(review);
  const pattern = await store.get(patternId);

  if (pattern.lifecycle !== 'quarantined') {
    throw new Error(`CANNOT_PROMOTE: Pattern '${patternId}' is not quarantined (current: ${pattern.lifecycle})`);
  }

  const { id: _oldId, contentHash: _oldHash, ...cleanPattern } = pattern;

  const promotedPayload: Omit<EngineeringPattern, 'contentHash' | 'id'> = {
    ...cleanPattern,
    lifecycle: validatedReview.approvedTargetLifecycle,
    provenance: {
      ...cleanPattern.provenance,
      licenseApproved: true
    },
    evidence: {
      proofStatus: 'proved',
      catalogFingerprint: validatedReview.catalogFingerprint,
      engineRunId: validatedReview.proofEvidenceRunId,
      measuredAt: validatedReview.reviewedAt,
      qualityScore: Math.max(cleanPattern.evidence.qualityScore, 0.95)
    }
  };

  return await store.put(promotedPayload);
}
