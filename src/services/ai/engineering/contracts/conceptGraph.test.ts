import { describe, it, expect } from 'vitest';
import {
  ConceptRelationshipSchema,
  computeRelationshipHash,
  ConceptRelationship,
  ConceptRelationTypeEnum
} from './conceptGraph';

describe('conceptGraph contracts', () => {
  it('validates all required relation types', () => {
    const validTypes = [
      'requires',
      'uses',
      'controls',
      'measures',
      'produces',
      'accepts',
      'alternative_to',
      'specializes',
      'composed_of',
      'implemented_by'
    ];
    for (const relType of validTypes) {
      expect(ConceptRelationTypeEnum.safeParse(relType).success).toBe(true);
    }
  });

  it('validates a valid motor control relationship (controller controls inverter)', () => {
    const relData = {
      schemaVersion: '1.0.0',
      id: 'rel.controller.controls.inverter',
      sourceConceptId: 'concept.control.field_oriented_controller',
      relationType: 'controls' as const,
      targetConceptId: 'concept.electrical.three_phase_inverter',
      cardinality: 'one_to_one' as const,
      conditions: ['pwm_frequency >= 10000'],
      priority: 1,
      confidence: 0.99,
      verified: true,
      sourceId: 'source.textbook.electric_drives',
      documentId: 'doc.bldc_guide',
      sectionLocator: 'Chapter 5, page 112',
      contentHash: ''
    };
    relData.contentHash = computeRelationshipHash(relData);

    const parsed = ConceptRelationshipSchema.parse(relData);
    expect(parsed.relationType).toBe('controls');
    expect(parsed.sourceConceptId).toBe('concept.control.field_oriented_controller');
    expect(parsed.contentHash).toHaveLength(64);
  });

  it('validates structural composition and specialization relationships', () => {
    const compRel = {
      schemaVersion: '1.0.0',
      id: 'rel.motor.composed_of.stator',
      sourceConceptId: 'concept.electromechanical.bldc_motor',
      relationType: 'composed_of' as const,
      targetConceptId: 'concept.electromechanical.stator_windings',
      cardinality: 'one_to_one' as const,
      conditions: [],
      priority: 1,
      confidence: 1.0,
      verified: true,
      sourceId: 'source.cad.bldc_spec',
      documentId: 'doc.motor_spec',
      sectionLocator: 'Section 2.1',
      contentHash: ''
    };
    compRel.contentHash = computeRelationshipHash(compRel);
    expect(ConceptRelationshipSchema.safeParse(compRel).success).toBe(true);
  });

  describe('Negative validation', () => {
    it('rejects self-referencing relationship where source == target for non-reflexive relations', () => {
      const invalid = {
        schemaVersion: '1.0.0',
        id: 'rel.invalid.cycle',
        sourceConceptId: 'concept.same',
        relationType: 'requires' as const,
        targetConceptId: 'concept.same', // Self cycle
        cardinality: 'one_to_one' as const,
        conditions: [],
        priority: 1,
        confidence: 0.9,
        verified: true,
        sourceId: 'source.1',
        documentId: 'doc.1',
        sectionLocator: 'sec 1',
        contentHash: 'a'.repeat(64)
      };
      expect(() => ConceptRelationshipSchema.parse(invalid)).toThrow(/self/i);
    });

    it('rejects invalid confidence and unknown fields', () => {
      const invalid = {
        schemaVersion: '1.0.0',
        id: 'rel.bad',
        sourceConceptId: 'concept.a',
        relationType: 'uses' as const,
        targetConceptId: 'concept.b',
        cardinality: 'one_to_one' as const,
        conditions: [],
        priority: 1,
        confidence: 1.2, // invalid
        verified: true,
        sourceId: 'src.1',
        documentId: 'doc.1',
        sectionLocator: '1',
        contentHash: 'b'.repeat(64),
        extraField: 'prohibited'
      };
      expect(() => ConceptRelationshipSchema.parse(invalid)).toThrow();
    });

    it('rejects invalid relationType', () => {
      const invalid = {
        schemaVersion: '1.0.0',
        id: 'rel.bad_type',
        sourceConceptId: 'concept.a',
        relationType: 'invented_relation',
        targetConceptId: 'concept.b',
        conditions: [],
        priority: 1,
        confidence: 0.8,
        verified: false,
        sourceId: 'src.1',
        documentId: 'doc.1',
        sectionLocator: '1',
        contentHash: 'c'.repeat(64)
      };
      expect(() => ConceptRelationshipSchema.parse(invalid)).toThrow();
    });
  });
});
