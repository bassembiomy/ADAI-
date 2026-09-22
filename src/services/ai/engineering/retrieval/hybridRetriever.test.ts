import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ConceptStore } from '../knowledge/conceptStore';
import { FactStore } from '../knowledge/factStore';
import { ConceptGraphStore } from '../graph/conceptGraphStore';
import { HybridRetriever } from './hybridRetriever';
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

// Hybrid retrieval unit tests
describe('HybridRetriever', () => {
  let tempDir: string;
  let conceptStore: ConceptStore;
  let factStore: FactStore;
  let graphStore: ConceptGraphStore;
  let retriever: HybridRetriever;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adia-test-retrieval-'));
    conceptStore = new ConceptStore({ storageDir: tempDir });
    factStore = new FactStore({ storageDir: tempDir });
    graphStore = new ConceptGraphStore({ storageDir: tempDir });

    await conceptStore.init();
    await factStore.init();
    await graphStore.init();

    // 1. Arithmetic Adder (verified)
    const adder: EngineeringConcept = {
      schemaVersion: '1.0.0',
      id: 'concept.math.addition',
      canonicalName: 'Addition Operator',
      aliases: ['adder', 'sum', 'plus'],
      domain: 'arithmetic',
      description: 'Calculates the sum of numeric inputs',
      functionalRoles: ['compute', 'summation'],
      requiredConcepts: [],
      optionalConcepts: [],
      alternatives: [],
      inputs: [{ name: 'u1', domain: 'signal' }, { name: 'u2', domain: 'signal' }],
      outputs: [{ name: 'y', domain: 'signal' }],
      designParameters: [],
      constraints: [],
      assumptions: [],
      applicableMethods: [],
      validationRuleIds: [],
      referenceIds: [],
      lifecycle: 'verified',
      confidence: 1.0,
      provenanceIds: ['source.standard'],
      contentHash: ''
    };
    adder.contentHash = computeConceptHash(adder);
    await conceptStore.put(adder);

    // 2. BLDC Motor (verified)
    const bldc: EngineeringConcept = {
      schemaVersion: '1.0.0',
      id: 'concept.electromechanical.bldc_motor',
      canonicalName: 'Brushless DC Motor',
      aliases: ['BLDC', 'permanent magnet motor'],
      domain: 'electromechanical',
      description: 'Synchronous electric machine driven by inverter',
      functionalRoles: ['plant', 'actuator'],
      requiredConcepts: ['concept.electrical.inverter'],
      optionalConcepts: ['concept.sensing.hall_sensors'],
      alternatives: [],
      inputs: [{ name: 'va', domain: 'electrical' }],
      outputs: [{ name: 'omega', domain: 'mechanical' }],
      designParameters: [],
      constraints: [],
      assumptions: [],
      applicableMethods: ['foc', 'six_step'],
      validationRuleIds: [],
      referenceIds: [],
      lifecycle: 'verified',
      confidence: 0.98,
      provenanceIds: ['source.standard'],
      contentHash: ''
    };
    bldc.contentHash = computeConceptHash(bldc);
    await conceptStore.put(bldc);

    // 3. Three-Phase Inverter (verified)
    const inverter: EngineeringConcept = {
      schemaVersion: '1.0.0',
      id: 'concept.electrical.inverter',
      canonicalName: 'Three-Phase Inverter',
      aliases: ['inverter bridge', 'dc-ac converter'],
      domain: 'electrical',
      description: 'Converts DC link power to 3-phase AC for motor drive',
      functionalRoles: ['actuator', 'power_conversion'],
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
      confidence: 0.98,
      provenanceIds: ['source.standard'],
      contentHash: ''
    };
    inverter.contentHash = computeConceptHash(inverter);
    await conceptStore.put(inverter);

    // 4. Experimental Concept (QUARANTINED)
    const experimental: EngineeringConcept = {
      schemaVersion: '1.0.0',
      id: 'concept.experimental.cold_fusion_drive',
      canonicalName: 'Cold Fusion Motor',
      aliases: ['fusion drive'],
      domain: 'electromechanical',
      description: 'Unverified motor concept',
      functionalRoles: ['actuator'],
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
      lifecycle: 'quarantined', // Quarantined!
      confidence: 0.2,
      provenanceIds: [],
      contentHash: ''
    };
    experimental.contentHash = computeConceptHash(experimental);
    await conceptStore.put(experimental);

    // Relationship: BLDC requires Inverter (verified)
    const rel: ConceptRelationship = {
      schemaVersion: '1.0.0',
      id: 'rel.bldc.inverter',
      sourceConceptId: 'concept.electromechanical.bldc_motor',
      relationType: 'requires',
      targetConceptId: 'concept.electrical.inverter',
      conditions: [],
      priority: 1,
      confidence: 0.98,
      verified: true,
      sourceId: 'source.standard',
      documentId: 'doc.std',
      sectionLocator: 'sec 1',
      contentHash: ''
    };
    rel.contentHash = computeRelationshipHash(rel);
    await graphStore.put(rel);

    // Verified Fact
    const fact: EngineeringFact = {
      schemaVersion: '1.0.0',
      id: 'fact.bldc.back_emf',
      subjectConceptId: 'concept.electromechanical.bldc_motor',
      predicate: 'hasTrapezoidalBackEmf',
      object: { type: 'boolean', value: true },
      conditions: [],
      confidence: 0.95,
      verified: true,
      sourceId: 'source.standard',
      documentId: 'doc.std',
      sectionLocator: 'table 2',
      extractionMethod: 'human_verified',
      review: { status: 'approved' },
      version: 1,
      validFrom: 1000,
      contentHash: ''
    };
    fact.contentHash = computeFactHash(fact);
    await factStore.put(fact);

    retriever = new HybridRetriever({
      conceptStore,
      factStore,
      conceptGraphStore: graphStore
    });
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('retrieves arithmetic adder with exact alias bonus and lexical score', async () => {
    const bundle = await retriever.retrieve({
      query: 'add two numbers sum',
      runtimePlanning: true
    });

    expect(bundle.concepts.length).toBeGreaterThanOrEqual(1);
    const top = bundle.concepts[0];
    expect(top.concept.id).toBe('concept.math.addition');
    expect(top.scoreBreakdown.exactAliasBonus).toBeGreaterThan(0);
    expect(top.scoreBreakdown.lexicalScore).toBeGreaterThan(0);
    expect(top.evidence).toContain('concept.math.addition');
  });

  it('expands graph neighborhood for bldc motor and retrieves connected inverter and facts', async () => {
    const bundle = await retriever.retrieve({
      query: 'bldc motor',
      runtimePlanning: true,
      expandGraph: true
    });

    const conceptIds = bundle.concepts.map((c: any) => c.concept.id);
    expect(conceptIds).toContain('concept.electromechanical.bldc_motor');
    expect(conceptIds).toContain('concept.electrical.inverter');

    // Verified fact attached to bldc motor should be retrieved
    const factIds = bundle.facts.map((f: any) => f.fact.id);
    expect(factIds).toContain('fact.bldc.back_emf');

    // Graph relationship should be retrieved
    const relIds = bundle.relationships.map((r: any) => r.relationship.id);
    expect(relIds).toContain('rel.bldc.inverter');
  });

  it('strictly quarantines unverified knowledge from runtime planning retrieval', async () => {
    const bundle = await retriever.retrieve({
      query: 'cold fusion motor drive',
      runtimePlanning: true // Runtime mode!
    });

    // Experimental quarantined concept must NEVER appear
    const ids = bundle.concepts.map((c: any) => c.concept.id);
    expect(ids).not.toContain('concept.experimental.cold_fusion_drive');
  });

  it('breaks ties deterministically by concept ID', async () => {
    const bundle1 = await retriever.retrieve({ query: 'motor', runtimePlanning: true });
    const bundle2 = await retriever.retrieve({ query: 'motor', runtimePlanning: true });

    expect(bundle1.concepts.map((c: any) => c.concept.id)).toEqual(
      bundle2.concepts.map((c: any) => c.concept.id)
    );
  });
});
