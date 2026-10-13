import { describe, it, expect } from 'vitest';
import {
  validateConceptGraph,
  ConceptGraphValidationOptions
} from './conceptGraphValidator';
import { ConceptRelationship } from '../contracts/conceptGraph';
import { EngineeringConcept } from '../contracts/engineeringKnowledge';

describe('conceptGraphValidator', () => {
  const c1: EngineeringConcept = {
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
    lifecycle: 'verified',
    confidence: 1.0,
    provenanceIds: [],
    contentHash: '1'.repeat(64)
  };

  const c2: EngineeringConcept = {
    ...c1,
    id: 'c.electrical.inverter',
    canonicalName: 'Inverter',
    domain: 'electrical',
    functionalRoles: ['actuator']
  };

  const c3: EngineeringConcept = {
    ...c1,
    id: 'c.control.foc',
    canonicalName: 'FOC',
    domain: 'control',
    functionalRoles: ['controller']
  };

  const cQuarantined: EngineeringConcept = {
    ...c1,
    id: 'c.quarantined.experimental',
    canonicalName: 'Experimental',
    lifecycle: 'quarantined'
  };

  const concepts = [c1, c2, c3, cQuarantined];

  it('validates a correct graph without cycles or dangling endpoints', () => {
    const relationships: ConceptRelationship[] = [
      {
        schemaVersion: '1.0.0',
        id: 'r1',
        sourceConceptId: 'c.control.foc',
        relationType: 'controls',
        targetConceptId: 'c.electrical.inverter',
        conditions: [],
        priority: 1,
        confidence: 0.99,
        verified: true,
        sourceId: 'src.1',
        documentId: 'doc.1',
        sectionLocator: 'sec 1',
        contentHash: 'a'.repeat(64)
      },
      {
        schemaVersion: '1.0.0',
        id: 'r2',
        sourceConceptId: 'c.motor.bldc',
        relationType: 'requires',
        targetConceptId: 'c.electrical.inverter',
        conditions: [],
        priority: 1,
        confidence: 0.95,
        verified: true,
        sourceId: 'src.1',
        documentId: 'doc.1',
        sectionLocator: 'sec 2',
        contentHash: 'b'.repeat(64)
      }
    ];

    const result = validateConceptGraph(concepts, relationships);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('detects dangling endpoints when relationship references missing concept', () => {
    const relationships: ConceptRelationship[] = [
      {
        schemaVersion: '1.0.0',
        id: 'r_dangling',
        sourceConceptId: 'c.control.foc',
        relationType: 'controls',
        targetConceptId: 'c.ghost.nonexistent',
        conditions: [],
        priority: 1,
        confidence: 0.9,
        verified: true,
        sourceId: 'src.1',
        documentId: 'doc.1',
        sectionLocator: 'sec 1',
        contentHash: 'c'.repeat(64)
      }
    ];

    const result = validateConceptGraph(concepts, relationships);
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.code === 'DANGLING_ENDPOINT')).toBe(true);
  });

  it('detects cycles in hierarchical/dependency relation types (requires, composed_of, specializes)', () => {
    const relationships: ConceptRelationship[] = [
      {
        schemaVersion: '1.0.0',
        id: 'r_cycle_1',
        sourceConceptId: 'c.control.foc',
        relationType: 'requires',
        targetConceptId: 'c.electrical.inverter',
        conditions: [],
        priority: 1,
        confidence: 1.0,
        verified: true,
        sourceId: 'src.1',
        documentId: 'doc.1',
        sectionLocator: '1',
        contentHash: 'd'.repeat(64)
      },
      {
        schemaVersion: '1.0.0',
        id: 'r_cycle_2',
        sourceConceptId: 'c.electrical.inverter',
        relationType: 'requires',
        targetConceptId: 'c.motor.bldc',
        conditions: [],
        priority: 1,
        confidence: 1.0,
        verified: true,
        sourceId: 'src.1',
        documentId: 'doc.1',
        sectionLocator: '2',
        contentHash: 'e'.repeat(64)
      },
      {
        schemaVersion: '1.0.0',
        id: 'r_cycle_3',
        sourceConceptId: 'c.motor.bldc',
        relationType: 'requires',
        targetConceptId: 'c.control.foc', // Cycle!
        conditions: [],
        priority: 1,
        confidence: 1.0,
        verified: true,
        sourceId: 'src.1',
        documentId: 'doc.1',
        sectionLocator: '3',
        contentHash: 'f'.repeat(64)
      }
    ];

    const result = validateConceptGraph(concepts, relationships);
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.code === 'DEPENDENCY_CYCLE_DETECTED')).toBe(true);
  });

  it('enforces lifecycle eligibility when requireVerified is enabled', () => {
    const relationships: ConceptRelationship[] = [
      {
        schemaVersion: '1.0.0',
        id: 'r_unverified',
        sourceConceptId: 'c.control.foc',
        relationType: 'uses',
        targetConceptId: 'c.quarantined.experimental',
        conditions: [],
        priority: 1,
        confidence: 0.8,
        verified: false,
        sourceId: 'src.1',
        documentId: 'doc.1',
        sectionLocator: '1',
        contentHash: '1'.repeat(64)
      }
    ];

    const result = validateConceptGraph(concepts, relationships, { requireVerified: true });
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.code === 'UNVERIFIED_CONTENT_INELIGIBLE')).toBe(true);
  });
});
