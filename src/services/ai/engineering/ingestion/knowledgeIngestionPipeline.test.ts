import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ConceptStore } from '../knowledge/conceptStore';
import { FactStore } from '../knowledge/factStore';
import { SourceDocumentStore } from '../knowledge/sourceDocumentStore';
import { ConceptGraphStore } from '../graph/conceptGraphStore';
import { KnowledgeIngestionPipeline } from './knowledgeIngestionPipeline';
import { DocumentExtractor } from './documentExtractor';

describe('Knowledge Ingestion Pipeline & Safety Guards', () => {
  let tempDir: string;
  let conceptStore: ConceptStore;
  let factStore: FactStore;
  let docStore: SourceDocumentStore;
  let graphStore: ConceptGraphStore;
  let pipeline: KnowledgeIngestionPipeline;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adia-test-ingestion-'));
    conceptStore = new ConceptStore({ storageDir: tempDir });
    factStore = new FactStore({ storageDir: tempDir });
    docStore = new SourceDocumentStore({ storageDir: tempDir });
    graphStore = new ConceptGraphStore({ storageDir: tempDir });

    await conceptStore.init();
    await factStore.init();
    await docStore.init();
    await graphStore.init();

    pipeline = new KnowledgeIngestionPipeline({
      conceptStore,
      factStore,
      sourceDocumentStore: docStore,
      conceptGraphStore: graphStore
    });
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('DocumentExtractor security & parsing', () => {
    it('extracts sections cleanly from markdown text without scripts', () => {
      const markdown = `
# Section 1: Inverter Topology
The three-phase inverter converts DC link voltage to variable frequency AC.

## Section 1.1: Switching Frequency
Typical switching frequency ranges from 10 kHz to 50 kHz.
`;
      const extractor = new DocumentExtractor();
      const sections = extractor.extractSections(markdown);
      expect(sections.length).toBeGreaterThanOrEqual(2);
      expect(sections[0].heading).toContain('Section 1');
      expect(sections[0].locator).toBe('Section 1: Inverter Topology');
    });

    it('rejects executable scripts, active content, and macro code', () => {
      const malicious = `
# Innocent Heading
<script>alert("pwned");</script>
Some normal text.
`;
      const extractor = new DocumentExtractor();
      expect(() => extractor.extractSections(malicious)).toThrow(/active script|malicious/i);
    });

    it('rejects binary / macro payload signatures', () => {
      const binaryPayload = `
# Test Document
Sub AutoOpen()
    Shell "powershell.exe"
End Sub
`;
      const extractor = new DocumentExtractor();
      expect(() => extractor.extractSections(binaryPayload)).toThrow(/macro|executable/i);
    });
  });

  describe('Pipeline execution and quarantine invariant', () => {
    it('ingests document and marks all extracted concepts and facts as quarantined/unverified', async () => {
      const docInput = {
        id: 'doc.bldc.appnote',
        title: 'AN-102: Brushless DC Motor Control Fundamentals',
        sourceType: 'application_note' as const,
        license: 'Permissive Technical Guide',
        licenseApproved: true,
        author: 'Semiconductor Application Engineering',
        sourceReliability: 0.95
      };

      const rawContent = `
# Section 1: Overview
The BLDC motor requires a three-phase inverter for commutation.

# Section 2: Commutation Strategy
Hall sensors measure rotor position for six-step commutation.
`;

      const result = await pipeline.ingestDocument({
        document: docInput,
        rawContent
      });

      expect(result.documentId).toBe('doc.bldc.appnote');
      expect(result.conceptsCreated.length).toBeGreaterThan(0);
      expect(result.factsCreated.length).toBeGreaterThan(0);

      // Verify all created concepts are in quarantined state
      for (const conceptId of result.conceptsCreated) {
        const concept = await conceptStore.get(conceptId);
        expect(concept.lifecycle).toBe('quarantined');
        expect(concept.provenanceIds).toContain('doc.bldc.appnote');
      }

      // Verify all created facts are unverified with pending review
      for (const factId of result.factsCreated) {
        const fact = await factStore.get(factId);
        expect(fact.verified).toBe(false);
        expect(fact.review.status).toBe('pending');
        expect(fact.documentId).toBe('doc.bldc.appnote');
        expect(fact.sectionLocator).toBeDefined();
        expect(fact.sectionLocator.length).toBeGreaterThan(0);
      }

      // Verify all relationships are unverified
      for (const relId of result.relationshipsCreated) {
        const rel = await graphStore.get(relId);
        expect(rel.verified).toBe(false);
      }
    });

    it('rejects document with unapproved license', async () => {
      const docInput = {
        id: 'doc.unlicensed',
        title: 'Unlicensed Proprietary Code',
        sourceType: 'internal_document' as const,
        license: 'Proprietary Restricted',
        licenseApproved: false, // Not approved!
        author: 'Unknown',
        sourceReliability: 0.5
      };

      await expect(pipeline.ingestDocument({
        document: docInput,
        rawContent: '# Test\nContent'
      })).rejects.toThrow(/LICENSE_NOT_APPROVED|license_required/i);
    });
  });
});
