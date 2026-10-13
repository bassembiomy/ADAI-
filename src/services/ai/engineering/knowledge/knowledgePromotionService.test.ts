import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ConceptStore } from './conceptStore';
import { FactStore } from './factStore';
import { SourceDocumentStore } from './sourceDocumentStore';
import { ConceptGraphStore } from '../graph/conceptGraphStore';
import {
  KnowledgePromotionService,
  assertRuntimeFactVerified,
  assertRuntimeConceptVerified,
  assertRuntimeRelationshipVerified
} from './knowledgePromotionService';
import {
  EngineeringConcept,
  computeConceptHash,
  EngineeringFact,
  computeFactHash
} from '../contracts/engineeringKnowledge';
import {
  ConceptRelationship,
  computeRelationshipHash
} from '../contracts/conceptGraph';
import { SourceDocument, computeSourceDocumentHash } from './sourceDocumentStore';
import { KnowledgeReviewDecision } from './knowledgeReviewSchemas';

describe('KnowledgePromotionService & Review Gates', () => {
  let tempDir: string;
  let conceptStore: ConceptStore;
  let factStore: FactStore;
  let docStore: SourceDocumentStore;
  let graphStore: ConceptGraphStore;
  let promotionService: KnowledgePromotionService;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adia-test-promotion-'));
    conceptStore = new ConceptStore({ storageDir: tempDir });
    factStore = new FactStore({ storageDir: tempDir });
    docStore = new SourceDocumentStore({ storageDir: tempDir });
    graphStore = new ConceptGraphStore({ storageDir: tempDir });

    await conceptStore.init();
    await factStore.init();
    await docStore.init();
    await graphStore.init();

    promotionService = new KnowledgePromotionService({
      conceptStore,
      factStore,
      sourceDocumentStore: docStore,
      conceptGraphStore: graphStore,
      minSourceReliability: 0.75
    });

    const doc: SourceDocument = {
      schemaVersion: '1.0.0',
      id: 'doc.bldc.ieee',
      title: 'IEEE Motor Standards',
      sourceType: 'standard',
      license: 'IEEE Licensed',
      licenseApproved: true,
      retrievalTimestamp: 1000,
      checksum: 'a'.repeat(64),
      sourceReliability: 0.95,
      sectionLocators: ['Section 1', 'Section 2'],
      contentHash: ''
    };
    doc.contentHash = computeSourceDocumentHash(doc);
    await docStore.put(doc);
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Concept Promotion', () => {
    it('promotes quarantined concept to verified with valid review', async () => {
      const concept: EngineeringConcept = {
        schemaVersion: '1.0.0',
        id: 'c.motor.bldc',
        canonicalName: 'BLDC Motor',
        aliases: [],
        domain: 'electromechanical',
        description: '',
        functionalRoles: ['plant'],
        requiredConcepts: [],
        optionalConcepts: [],
        alternatives: [],
        inputs: [],
        outputs: [],
        designParameters: [],
        constraints: [],
        assumptions: [],
        applicableMethods: [],
        validationRuleIds: [],
        referenceIds: [],
        lifecycle: 'quarantined',
        confidence: 0.85,
        provenanceIds: ['doc.bldc.ieee'],
        contentHash: ''
      };
      concept.contentHash = computeConceptHash(concept);
      await conceptStore.put(concept);

      const decision: KnowledgeReviewDecision = {
        reviewerId: 'engineer.lead.bassem',
        reviewedAt: Date.now(),
        status: 'approved',
        targetLifecycle: 'verified',
        notes: 'Verified against IEEE standard specifications',
        evidenceChecks: {
          licenseApproved: true,
          sourceReliabilityPassed: true,
          conflictCheckPassed: true,
          validationPassed: true
        }
      };

      const promoted = await promotionService.promoteConcept('c.motor.bldc', decision);
      expect(promoted.lifecycle).toBe('verified');
      expect(promoted.contentHash).not.toBe(concept.contentHash);

      // Verify assertRuntimeConceptVerified passes
      expect(() => assertRuntimeConceptVerified(promoted)).not.toThrow();
    });

    it('rejects promotion when license is not approved in evidence checks', async () => {
      const concept: EngineeringConcept = {
        schemaVersion: '1.0.0',
        id: 'c.bad.license',
        canonicalName: 'Test',
        aliases: [],
        domain: 'test',
        description: '',
        functionalRoles: [],
        requiredConcepts: [],
        optionalConcepts: [],
        alternatives: [],
        inputs: [],
        outputs: [],
        designParameters: [],
        constraints: [],
        assumptions: [],
        applicableMethods: [],
        validationRuleIds: [],
        referenceIds: [],
        lifecycle: 'quarantined',
        confidence: 0.85,
        provenanceIds: ['doc.bldc.ieee'],
        contentHash: ''
      };
      concept.contentHash = computeConceptHash(concept);
      await conceptStore.put(concept);

      const decision: KnowledgeReviewDecision = {
        reviewerId: 'engineer.lead',
        reviewedAt: Date.now(),
        status: 'approved',
        targetLifecycle: 'verified',
        notes: 'Cannot promote without license check',
        evidenceChecks: {
          licenseApproved: false, // Fails check!
          sourceReliabilityPassed: true,
          conflictCheckPassed: true,
          validationPassed: true
        }
      };

      await expect(promotionService.promoteConcept('c.bad.license', decision))
        .rejects.toThrow(/license_not_approved|evidence check failed/i);
    });
  });

  describe('Fact Promotion & Runtime Quarantine Gate', () => {
    it('promotes fact from pending to verified, and prevents runtime use of unverified facts', async () => {
      const fact: EngineeringFact = {
        schemaVersion: '1.0.0',
        id: 'fact.test.bldc_commutation',
        subjectConceptId: 'c.motor.bldc',
        predicate: 'usesCommutation',
        object: { type: 'string', value: 'six_step' },
        conditions: [],
        confidence: 0.85,
        verified: false,
        sourceId: 'doc.bldc.ieee',
        documentId: 'doc.bldc.ieee',
        sectionLocator: 'Section 1',
        extractionMethod: 'rule',
        review: { status: 'pending' },
        version: 1,
        validFrom: 1000,
        contentHash: ''
      };
      fact.contentHash = computeFactHash(fact);
      await factStore.put(fact);

      // Runtime assertion must fail for unverified fact
      expect(() => assertRuntimeFactVerified(fact)).toThrow(/not verified/i);

      const decision: KnowledgeReviewDecision = {
        reviewerId: 'engineer.lead.bassem',
        reviewedAt: Date.now(),
        status: 'approved',
        targetLifecycle: 'verified',
        notes: 'Standard commutation rule',
        evidenceChecks: {
          licenseApproved: true,
          sourceReliabilityPassed: true,
          conflictCheckPassed: true,
          validationPassed: true
        }
      };

      const promoted = await promotionService.promoteFact('fact.test.bldc_commutation', decision);
      expect(promoted.verified).toBe(true);
      expect(promoted.review.status).toBe('approved');
      expect(promoted.review.reviewerId).toBe('engineer.lead.bassem');

      // Runtime assertion passes after promotion
      expect(() => assertRuntimeFactVerified(promoted)).not.toThrow();
    });
  });

  describe('Relationship Promotion', () => {
    it('promotes relationship to verified', async () => {
      const rel: ConceptRelationship = {
        schemaVersion: '1.0.0',
        id: 'rel.motor.inverter',
        sourceConceptId: 'c.motor.bldc',
        relationType: 'requires',
        targetConceptId: 'c.electrical.inverter',
        conditions: [],
        priority: 1,
        confidence: 0.9,
        verified: false,
        sourceId: 'doc.bldc.ieee',
        documentId: 'doc.bldc.ieee',
        sectionLocator: 'Section 2',
        contentHash: ''
      };
      rel.contentHash = computeRelationshipHash(rel);
      await graphStore.put(rel);

      expect(() => assertRuntimeRelationshipVerified(rel)).toThrow(/not verified/i);

      const decision: KnowledgeReviewDecision = {
        reviewerId: 'engineer.lead.bassem',
        reviewedAt: Date.now(),
        status: 'approved',
        targetLifecycle: 'verified',
        notes: 'Standard motor inverter requirement',
        evidenceChecks: {
          licenseApproved: true,
          sourceReliabilityPassed: true,
          conflictCheckPassed: true,
          validationPassed: true
        }
      };

      const promoted = await promotionService.promoteRelationship('rel.motor.inverter', decision);
      expect(promoted.verified).toBe(true);
      expect(() => assertRuntimeRelationshipVerified(promoted)).not.toThrow();
    });
  });
});
