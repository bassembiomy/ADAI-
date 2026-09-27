import {
  StructuredEngineeringRequest,
  UnresolvedRequirement
} from '../contracts/structuredEngineeringRequest';

export const CONFIDENCE_THRESHOLDS = {
  READY: 0.85,
  CLARIFICATION: 0.70
} as const;

export interface ConfidenceComponents {
  lexicalMatch: number;
  valueSchemaValidity: number;
  referenceResolution: number;
  catalogResolution: number;
  overallScore: number;
}

export interface ClarificationQuestion {
  targetSlotId: string;
  question: string;
  reason: string;
  recommendedValue?: unknown;
}

export type ConfidencePolicyOutcome =
  | {
      status: 'ready';
      confidence: number;
      components: ConfidenceComponents;
      assumptions: string[];
    }
  | {
      status: 'clarification_required';
      confidence: number;
      components: ConfidenceComponents;
      clarificationQuestion: ClarificationQuestion;
      reason: string;
    }
  | {
      status: 'unsupported';
      confidence: number;
      components: ConfidenceComponents;
      reason: string;
      unsupportedCapabilities: string[];
    }
  | {
      status: 'invalid';
      confidence: number;
      components: ConfidenceComponents;
      reason: string;
      validationErrors: string[];
    };

export function computeDeterministicConfidence(
  request: StructuredEngineeringRequest
): ConfidenceComponents {
  const lexicalMatch = request.operations.length > 0 ? 1.0 : 0.5;

  let valueSchemaValidity = 1.0;
  if (request.values.length > 0) {
    const validCount = request.values.filter(
      v => v.normalizedValue !== undefined && v.confidence > 0
    ).length;
    valueSchemaValidity = validCount / request.values.length;
  }

  const referenceResolution = 1.0;

  let catalogResolution = 1.0;
  if (request.entities.length > 0) {
    const groundedCount = request.entities.filter(
      e => e.catalogBlockId !== undefined
    ).length;
    catalogResolution = groundedCount / request.entities.length;
  }

  const overallScore =
    Math.round(
      (0.35 * lexicalMatch +
        0.25 * valueSchemaValidity +
        0.2 * referenceResolution +
        0.2 * catalogResolution) *
        1000
    ) / 1000;

  return {
    lexicalMatch,
    valueSchemaValidity,
    referenceResolution,
    catalogResolution,
    overallScore
  };
}

export class RequestConfidencePolicy {
  public evaluate(request: StructuredEngineeringRequest): ConfidencePolicyOutcome {
    const components = computeDeterministicConfidence(request);

    // 1. Missing REQUIRED requirements are strictly blocking regardless of confidence score
    const blockingReq = request.unresolvedRequirements.find(
      r => r.classification === 'REQUIRED' && r.status === 'unresolved'
    );
    if (blockingReq) {
      return {
        status: 'clarification_required',
        confidence: components.overallScore,
        components,
        clarificationQuestion: {
          targetSlotId: blockingReq.id,
          question: blockingReq.prompt,
          reason: blockingReq.reason,
          recommendedValue: blockingReq.resolvedValue
        },
        reason: blockingReq.reason
      };
    }

    // 2. Explicit assumptions for non-required slots
    const nonRequired = request.unresolvedRequirements.filter(
      r => r.classification !== 'REQUIRED'
    );
    const assumptions = nonRequired.map(
      r => `Slot '${r.slotName}' (${r.classification}): ${r.reason}`
    );

    // 3. Threshold evaluation
    const score = components.overallScore;

    if (score >= CONFIDENCE_THRESHOLDS.READY) {
      return {
        status: 'ready',
        confidence: score,
        components,
        assumptions
      };
    }

    if (score >= CONFIDENCE_THRESHOLDS.CLARIFICATION) {
      return {
        status: 'clarification_required',
        confidence: score,
        components,
        clarificationQuestion: {
          targetSlotId: 'slot_ambiguity',
          question: 'The request details are partially ambiguous. Please confirm the intended configuration.',
          reason: 'Confidence score below ready threshold'
        },
        reason: 'Ambiguous request below ready threshold'
      };
    }

    return {
      status: 'invalid',
      confidence: score,
      components,
      reason: `Confidence score ${score} is below minimum threshold ${CONFIDENCE_THRESHOLDS.CLARIFICATION}`,
      validationErrors: ['Low confidence in request interpretation']
    };
  }

  public evaluateWithScore(
    score: number,
    unresolvedRequirements: readonly UnresolvedRequirement[] = []
  ): ConfidencePolicyOutcome {
    const dummyReq: StructuredEngineeringRequest = {
      schemaVersion: '1.0.0',
      requestId: 'dummy',
      originalText: 'dummy',
      normalizedText: 'dummy',
      intent: 'create',
      operations: ['create'],
      entities: [],
      values: [],
      relationships: [],
      requestedOutputs: [],
      constraints: [],
      unresolvedRequirements: [...unresolvedRequirements],
      confidence: score,
      evidence: [{ source: 'user', description: 'dummy' }]
    };

    const components: ConfidenceComponents = {
      lexicalMatch: 1.0,
      valueSchemaValidity: 1.0,
      referenceResolution: 1.0,
      catalogResolution: 1.0,
      overallScore: score
    };

    const blockingReq = unresolvedRequirements.find(
      r => r.classification === 'REQUIRED' && r.status === 'unresolved'
    );
    if (blockingReq) {
      return {
        status: 'clarification_required',
        confidence: score,
        components,
        clarificationQuestion: {
          targetSlotId: blockingReq.id,
          question: blockingReq.prompt,
          reason: blockingReq.reason
        },
        reason: blockingReq.reason
      };
    }

    if (score >= CONFIDENCE_THRESHOLDS.READY) {
      return {
        status: 'ready',
        confidence: score,
        components,
        assumptions: []
      };
    }

    if (score >= CONFIDENCE_THRESHOLDS.CLARIFICATION) {
      return {
        status: 'clarification_required',
        confidence: score,
        components,
        clarificationQuestion: {
          targetSlotId: 'slot_ambiguity',
          question: 'The request is partially ambiguous. Please clarify.',
          reason: 'Score between thresholds'
        },
        reason: 'Ambiguous'
      };
    }

    return {
      status: 'invalid',
      confidence: score,
      components,
      reason: `Score ${score} below threshold`,
      validationErrors: ['Low confidence']
    };
  }
}
