import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ConceptStore } from './conceptStore';
import { FactStore } from './factStore';
import { SourceDocumentStore, SourceDocument, computeSourceDocumentHash } from './sourceDocumentStore';
import {
  EngineeringConcept,
  computeConceptHash,
  EngineeringFact,
  computeFactHash
} from '../contracts/engineeringKnowledge';

describe('Knowledge stores (ConceptStore, FactStore, SourceDocumentStore)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adia-test-knowledge-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('ConceptStore', () => {
    it('initializes and saves concept with manifest and checksum', async () => {
      const store = new ConceptStore({ storageDir: tempDir });
      await store.init();

      const concept: EngineeringConcept = {
        schemaVersion: '1.0.0',
        id: 'concept.math.add',
        canonicalName: 'Addition',
        aliases: ['sum'],
        domain: 'arithmetic',
        description: 'Sum of operands',
        functionalRoles: ['compute'],
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
        lifecycle: 'verified',
        confidence: 1.0,
        provenanceIds: ['source.1'],
        contentHash: ''
      };
      concept.contentHash = computeConceptHash(concept);

      await store.put(concept);
      expect(await store.has('concept.math.add')).toBe(true);

      const retrieved = await store.get('concept.math.add');
      expect(retrieved.id).toBe('concept.math.add');
      expect(retrieved.canonicalName).toBe('Addition');
      expect(retrieved.contentHash).toBe(concept.contentHash);
    });

    it('filters by lifecycle and domain deterministically', async () => {
      const store = new ConceptStore({ storageDir: tempDir });
      await store.init();

      const c1: EngineeringConcept = {
        schemaVersion: '1.0.0',
        id: 'c.motor.bldc',
        canonicalName: 'BLDC Motor',
        aliases: [],
        domain: 'electromechanical',
        description: 'BLDC Machine',
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
        lifecycle: 'verified',
        confidence: 0.95,
        provenanceIds: [],
        contentHash: ''
      };
      c1.contentHash = computeConceptHash(c1);

      const c2: EngineeringConcept = {
        ...c1,
        id: 'c.thermal.cooler',
        canonicalName: 'Cooler',
        domain: 'thermal',
        lifecycle: 'quarantined',
        contentHash: ''
      };
      c2.contentHash = computeConceptHash(c2);

      await store.put(c1);
      await store.put(c2);

      const verified = await store.list({ lifecycle: 'verified' });
      expect(verified).toHaveLength(1);
      expect(verified[0].id).toBe('c.motor.bldc');

      const thermal = await store.list({ domain: 'thermal' });
      expect(thermal).toHaveLength(1);
      expect(thermal[0].id).toBe('c.thermal.cooler');
    });

    it('fails closed on path traversal attempt in ID', async () => {
      const store = new ConceptStore({ storageDir: tempDir });
      await store.init();

      const badConcept: any = {
        schemaVersion: '1.0.0',
        id: '../../malicious_concept',
        canonicalName: 'Hack',
        aliases: [],
        domain: 'arithmetic',
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
        lifecycle: 'verified',
        confidence: 1.0,
        provenanceIds: [],
        contentHash: 'a'.repeat(64)
      };

      await expect(store.put(badConcept)).rejects.toThrow(/invalid id|path traversal/i);
      await expect(store.get('../../malicious_concept')).rejects.toThrow(/invalid id|path traversal/i);
    });

    it('fails closed on checksum mismatch (file tampering)', async () => {
      const store = new ConceptStore({ storageDir: tempDir });
      await store.init();

      const c: EngineeringConcept = {
        schemaVersion: '1.0.0',
        id: 'c.tamper',
        canonicalName: 'Original',
        aliases: [],
        domain: 'math',
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
        lifecycle: 'verified',
        confidence: 1.0,
        provenanceIds: [],
        contentHash: ''
      };
      c.contentHash = computeConceptHash(c);
      await store.put(c);

      // Tamper with file directly on disk
      const filePath = path.join(tempDir, 'concepts', 'c.tamper.json');
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      data.canonicalName = 'Tampered Without Updating Hash';
      fs.writeFileSync(filePath, JSON.stringify(data), 'utf8');

      await expect(store.get('c.tamper')).rejects.toThrow(/checksum mismatch/i);
    });
  });

  describe('FactStore', () => {
    it('stores and retrieves engineering facts with subject filtering', async () => {
      const store = new FactStore({ storageDir: tempDir });
      await store.init();

      const fact: EngineeringFact = {
        schemaVersion: '1.0.0',
        id: 'fact.copper.conductivity',
        subjectConceptId: 'concept.materials.copper',
        predicate: 'hasElectricalConductivity',
        object: { type: 'number', value: 5.96e7 },
        conditions: ['temperature == 20 degC'],
        units: 'S/m',
        confidence: 0.99,
        verified: true,
        sourceId: 'src.crc',
        documentId: 'doc.crc.1',
        sectionLocator: 'table 1',
        extractionMethod: 'human_verified',
        review: { status: 'approved' },
        version: 1,
        validFrom: 1000,
        contentHash: ''
      };
      fact.contentHash = computeFactHash(fact);

      await store.put(fact);
      expect(await store.has('fact.copper.conductivity')).toBe(true);

      const found = await store.list({ subjectConceptId: 'concept.materials.copper' });
      expect(found).toHaveLength(1);
      expect(found[0].id).toBe('fact.copper.conductivity');
    });
  });

  describe('SourceDocumentStore', () => {
    it('stores and retrieves source documents', async () => {
      const store = new SourceDocumentStore({ storageDir: tempDir });
      await store.init();

      const doc: SourceDocument = {
        schemaVersion: '1.0.0',
        id: 'source.ieee.standard_motor',
        title: 'IEEE Recommended Practice for Specifying Electric Motors',
        sourceType: 'standard',
        version: '2022',
        publicationDate: '2022-04-15',
        author: 'IEEE Working Group',
        publisher: 'IEEE',
        license: 'IEEE Licensed',
        licenseApproved: true,
        retrievalTimestamp: 1718000000000,
        checksum: 'b'.repeat(64),
        sourceReliability: 0.98,
        sectionLocators: ['Section 4.1', 'Section 5.2'],
        contentHash: ''
      };
      doc.contentHash = computeSourceDocumentHash(doc);

      await store.put(doc);
      expect(await store.has('source.ieee.standard_motor')).toBe(true);

      const retrieved = await store.get('source.ieee.standard_motor');
      expect(retrieved.title).toBe('IEEE Recommended Practice for Specifying Electric Motors');
      expect(retrieved.sourceReliability).toBe(0.98);
    });
  });
});
