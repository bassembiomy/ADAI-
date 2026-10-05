import {
  ConceptRepository,
  FactRepository,
  RelationshipRepository
} from './contentAddressedStore';
import { SourceDocumentRepository } from './sourceDocumentStore';
import {
  KnowledgeReviewDecision,
  KnowledgeReviewDecisionSchema
} from './knowledgeReviewSchemas';
import {
  EngineeringConcept,
  EngineeringConceptSchema,
  computeConceptHash,
  EngineeringFact,
  EngineeringFactSchema,
  computeFactHash
} from '../contracts/engineeringKnowledge';
import {
  ConceptRelationship,
  ConceptRelationshipSchema,
  computeRelationshipHash
} from '../contracts/conceptGraph';

export interface KnowledgePromotionServiceOptions {
  conceptStore: ConceptRepository;
  factStore: FactRepository;
  sourceDocumentStore: SourceDocumentRepository;
  conceptGraphStore: RelationshipRepository;
  minSourceReliability?: number;
}

export class KnowledgePromotionService {
  private readonly conceptStore: ConceptRepository;
  private readonly factStore: FactRepository;
  private readonly docStore: SourceDocumentRepository;
  private readonly graphStore: RelationshipRepository;
  private readonly minSourceReliability: number;

  constructor(options: KnowledgePromotionServiceOptions) {
    this.conceptStore = options.conceptStore;
    this.factStore = options.factStore;
    this.docStore = options.sourceDocumentStore;
    this.graphStore = options.conceptGraphStore;
    this.minSourceReliability = options.minSourceReliability ?? 0.7;
  }

  private validateReviewDecision(review: KnowledgeReviewDecision): void {
    KnowledgeReviewDecisionSchema.parse(review);

    if (!review.evidenceChecks.licenseApproved) {
      throw new Error('LICENSE_NOT_APPROVED: Evidence check failed: license is not approved.');
    }
    if (!review.evidenceChecks.sourceReliabilityPassed) {
      throw new Error('RELIABILITY_THRESHOLD_FAILED: Evidence check failed: source reliability check not passed.');
    }
    if (!review.evidenceChecks.validationPassed) {
      throw new Error('VALIDATION_FAILED: Evidence check failed: entity validation not passed.');
    }
    if (!review.evidenceChecks.conflictCheckPassed) {
      throw new Error('CONFLICT_DETECTED: Evidence check failed: conflict check not passed.');
    }
  }

  public async promoteConcept(
    conceptId: string,
    review: KnowledgeReviewDecision
  ): Promise<EngineeringConcept> {
    this.validateReviewDecision(review);

    const concept = await this.conceptStore.get(conceptId);

    // Verify source documents have approved licenses and sufficient reliability
    for (const docId of concept.provenanceIds) {
      if (await this.docStore.has(docId)) {
        const doc = await this.docStore.get(docId);
        if (!doc.licenseApproved) {
          throw new Error(`LICENSE_NOT_APPROVED: Source document '${docId}' has unapproved license.`);
        }
        if (doc.sourceReliability < this.minSourceReliability) {
          throw new Error(
            `RELIABILITY_BELOW_THRESHOLD: Source document '${docId}' reliability ${doc.sourceReliability} is below threshold ${this.minSourceReliability}.`
          );
        }
      }
    }

    const updated: EngineeringConcept = {
      ...concept,
      lifecycle: review.targetLifecycle,
      confidence: Math.max(concept.confidence, review.targetLifecycle === 'verified' ? 0.95 : 0.8),
      contentHash: ''
    };
    updated.contentHash = computeConceptHash(updated);

    return this.conceptStore.put(updated);
  }

  public async promoteFact(
    factId: string,
    review: KnowledgeReviewDecision
  ): Promise<EngineeringFact> {
    this.validateReviewDecision(review);

    const fact = await this.factStore.get(factId);

    if (await this.docStore.has(fact.documentId)) {
      const doc = await this.docStore.get(fact.documentId);
      if (!doc.licenseApproved) {
        throw new Error(`LICENSE_NOT_APPROVED: Source document '${fact.documentId}' has unapproved license.`);
      }
    }

    const updated: EngineeringFact = {
      ...fact,
      verified: review.status === 'approved' && (review.targetLifecycle === 'reviewed' || review.targetLifecycle === 'verified'),
      review: {
        reviewerId: review.reviewerId,
        reviewedAt: review.reviewedAt,
        notes: review.notes,
        status: review.status
      },
      confidence: Math.max(fact.confidence, review.targetLifecycle === 'verified' ? 0.95 : 0.8),
      contentHash: ''
    };
    updated.contentHash = computeFactHash(updated);

    return this.factStore.put(updated);
  }

  public async promoteRelationship(
    relationshipId: string,
    review: KnowledgeReviewDecision
  ): Promise<ConceptRelationship> {
    this.validateReviewDecision(review);

    const rel = await this.graphStore.get(relationshipId);

    const updated: ConceptRelationship = {
      ...rel,
      verified: review.status === 'approved',
      confidence: Math.max(rel.confidence, review.targetLifecycle === 'verified' ? 0.95 : 0.8),
      contentHash: ''
    };
    updated.contentHash = computeRelationshipHash(updated);

    return this.graphStore.put(updated);
  }
}

export function assertRuntimeConceptVerified(concept: EngineeringConcept): void {
  EngineeringConceptSchema.parse(concept);
  if (concept.lifecycle !== 'verified') {
    throw new Error(`CONCEPT_NOT_VERIFIED: Concept '${concept.id}' has lifecycle '${concept.lifecycle}', but 'verified' is required for runtime planning.`);
  }
}

export function assertRuntimeFactVerified(fact: EngineeringFact): void {
  EngineeringFactSchema.parse(fact);
  if (!fact.verified) {
    throw new Error(`FACT_NOT_VERIFIED: Fact '${fact.id}' is not verified and cannot be retrieved for runtime planning.`);
  }
}

export function assertRuntimeRelationshipVerified(rel: ConceptRelationship): void {
  ConceptRelationshipSchema.parse(rel);
  if (!rel.verified) {
    throw new Error(`RELATIONSHIP_NOT_VERIFIED: Relationship '${rel.id}' is not verified and cannot be used in runtime planning.`);
  }
}
