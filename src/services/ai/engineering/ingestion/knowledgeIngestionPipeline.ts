import { DocumentExtractor, ExtractedSection } from './documentExtractor';
import { ConceptExtractor } from './conceptExtractor';
import { RelationshipExtractor } from './relationshipExtractor';
import { ConceptRepository } from '../knowledge/contentAddressedStore';
import { FactRepository } from '../knowledge/contentAddressedStore';
import { RelationshipRepository } from '../knowledge/contentAddressedStore';
import {
  SourceDocumentRepository,
  SourceDocument,
  computeSourceDocumentHash,
  SourceType
} from '../knowledge/sourceDocumentStore';
import {
  EngineeringFact,
  computeFactHash
} from '../contracts/engineeringKnowledge';
import { sha256Hex } from '../../../../engine/opm/canonicalHash';

export interface DocumentIngestionInput {
  document: {
    id: string;
    title: string;
    sourceType: SourceType;
    version?: string;
    publicationDate?: string;
    author?: string;
    publisher?: string;
    license: string;
    licenseApproved: boolean;
    sourceReliability: number;
  };
  rawContent: string;
}

export interface IngestionResult {
  documentId: string;
  sectionsExtracted: number;
  conceptsCreated: string[];
  relationshipsCreated: string[];
  factsCreated: string[];
}

export interface KnowledgeIngestionPipelineOptions {
  conceptStore: ConceptRepository;
  factStore: FactRepository;
  sourceDocumentStore: SourceDocumentRepository;
  conceptGraphStore: RelationshipRepository;
}

export class KnowledgeIngestionPipeline {
  private readonly conceptStore: ConceptRepository;
  private readonly factStore: FactRepository;
  private readonly docStore: SourceDocumentRepository;
  private readonly graphStore: RelationshipRepository;
  private readonly docExtractor = new DocumentExtractor();
  private readonly conceptExtractor = new ConceptExtractor();
  private readonly relationshipExtractor = new RelationshipExtractor();

  constructor(options: KnowledgeIngestionPipelineOptions) {
    this.conceptStore = options.conceptStore;
    this.factStore = options.factStore;
    this.docStore = options.sourceDocumentStore;
    this.graphStore = options.conceptGraphStore;
  }

  public async ingestDocument(input: DocumentIngestionInput): Promise<IngestionResult> {
    const { document, rawContent } = input;

    // License gatekeeper
    if (!document.licenseApproved) {
      throw new Error(
        `LICENSE_NOT_APPROVED: Ingestion blocked for document '${document.id}'. License '${document.license}' is unapproved.`
      );
    }

    // 1. Safe extraction of sections without executing code/macros/scripts
    const sections = this.docExtractor.extractSections(rawContent);

    // 2. Compute checksum and store SourceDocument
    const checksum = sha256Hex(rawContent);
    const sourceDoc: SourceDocument = {
      schemaVersion: '1.0.0',
      id: document.id,
      title: document.title,
      sourceType: document.sourceType,
      version: document.version,
      publicationDate: document.publicationDate,
      author: document.author,
      publisher: document.publisher,
      license: document.license,
      licenseApproved: document.licenseApproved,
      retrievalTimestamp: Date.now(),
      checksum,
      sourceReliability: document.sourceReliability,
      sectionLocators: sections.map(s => s.locator),
      rawContent,
      contentHash: ''
    };
    sourceDoc.contentHash = computeSourceDocumentHash(sourceDoc);
    await this.docStore.put(sourceDoc);

    // 3. Extract concepts (quarantined)
    const candidateConcepts = this.conceptExtractor.extractConcepts(sections, {
      documentId: document.id,
      sourceReliability: document.sourceReliability
    });

    const conceptsCreated: string[] = [];
    for (const c of candidateConcepts) {
      await this.conceptStore.put(c);
      conceptsCreated.push(c.id);
    }

    // 4. Extract relationships (unverified)
    const candidateRelationships = this.relationshipExtractor.extractRelationships(
      candidateConcepts,
      sections,
      {
        documentId: document.id,
        sourceReliability: document.sourceReliability
      }
    );

    const relationshipsCreated: string[] = [];
    for (const rel of candidateRelationships) {
      await this.graphStore.put(rel);
      relationshipsCreated.push(rel.id);
    }

    // 5. Extract candidate facts (unverified, pending review, strict section provenance)
    const factsCreated: string[] = [];
    for (const section of sections) {
      const text = `${section.heading} ${section.content}`.toLowerCase();
      if (text.includes('six-step commutation') && text.includes('hall')) {
        const factId = `fact.extracted.${document.id}.hall_six_step`;
        const fact: EngineeringFact = {
          schemaVersion: '1.0.0',
          id: factId,
          subjectConceptId: 'concept.sensing.hall_sensors',
          predicate: 'enablesCommutationMethod',
          object: { type: 'string', value: 'six_step' },
          conditions: ['3_hall_sensors_at_120_electrical_deg'],
          confidence: Math.min(document.sourceReliability * 0.8, 0.9),
          verified: false, // Mandatory unverified invariant
          sourceId: document.id,
          documentId: document.id,
          sectionLocator: section.locator,
          extractionMethod: 'rule',
          review: { status: 'pending' },
          version: 1,
          validFrom: Date.now(),
          contentHash: ''
        };
        fact.contentHash = computeFactHash(fact);
        await this.factStore.put(fact);
        factsCreated.push(factId);
      }
    }

    return {
      documentId: document.id,
      sectionsExtracted: sections.length,
      conceptsCreated,
      relationshipsCreated,
      factsCreated
    };
  }
}
