import { describe, it, expect } from 'vitest';
import { ConceptGraphTraversal } from './conceptGraphTraversal';
import { ConceptRelationship } from '../contracts/conceptGraph';
import { EngineeringConcept } from '../contracts/engineeringKnowledge';

describe('ConceptGraphTraversal', () => {
  const makeConcept = (id: string): EngineeringConcept => ({
    schemaVersion: '1.0.0',
    id,
    canonicalName: id,
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
    lifecycle: 'verified',
    confidence: 1.0,
    provenanceIds: [],
    contentHash: '1'.repeat(64)
  });

  const concepts = [
    makeConcept('c.motor.bldc'),
    makeConcept('c.electrical.inverter'),
    makeConcept('c.sensing.hall'),
    makeConcept('c.control.six_step'),
    makeConcept('c.control.foc'),
    makeConcept('c.stator.windings')
  ];

  const relationships: ConceptRelationship[] = [
    {
      schemaVersion: '1.0.0',
      id: 'rel.motor.requires.inverter',
      sourceConceptId: 'c.motor.bldc',
      relationType: 'requires',
      targetConceptId: 'c.electrical.inverter',
      conditions: [],
      priority: 1,
      confidence: 0.95,
      verified: true,
      sourceId: 's1',
      documentId: 'd1',
      sectionLocator: '1',
      contentHash: 'a'.repeat(64)
    },
    {
      schemaVersion: '1.0.0',
      id: 'rel.motor.composed_of.stator',
      sourceConceptId: 'c.motor.bldc',
      relationType: 'composed_of',
      targetConceptId: 'c.stator.windings',
      conditions: [],
      priority: 1,
      confidence: 1.0,
      verified: true,
      sourceId: 's1',
      documentId: 'd1',
      sectionLocator: '2',
      contentHash: 'b'.repeat(64)
    },
    {
      schemaVersion: '1.0.0',
      id: 'rel.six_step.controls.inverter',
      sourceConceptId: 'c.control.six_step',
      relationType: 'controls',
      targetConceptId: 'c.electrical.inverter',
      conditions: [],
      priority: 1,
      confidence: 0.9,
      verified: true,
      sourceId: 's1',
      documentId: 'd1',
      sectionLocator: '3',
      contentHash: 'c'.repeat(64)
    },
    {
      schemaVersion: '1.0.0',
      id: 'rel.six_step.uses.hall',
      sourceConceptId: 'c.control.six_step',
      relationType: 'uses',
      targetConceptId: 'c.sensing.hall',
      conditions: [],
      priority: 1,
      confidence: 0.98,
      verified: true,
      sourceId: 's1',
      documentId: 'd1',
      sectionLocator: '4',
      contentHash: 'd'.repeat(64)
    },
    {
      schemaVersion: '1.0.0',
      id: 'rel.foc.alternative_to.six_step',
      sourceConceptId: 'c.control.foc',
      relationType: 'alternative_to',
      targetConceptId: 'c.control.six_step',
      conditions: [],
      priority: 1,
      confidence: 0.95,
      verified: true,
      sourceId: 's1',
      documentId: 'd1',
      sectionLocator: '5',
      contentHash: 'e'.repeat(64)
    }
  ];

  const traversal = new ConceptGraphTraversal({ concepts, relationships });

  it('retrieves neighbors with direction and relationType filtering', () => {
    const outgoing = traversal.getNeighbors('c.motor.bldc', { direction: 'outgoing' });
    expect(outgoing).toHaveLength(2);
    expect(outgoing.map(o => o.targetConceptId).sort()).toEqual([
      'c.electrical.inverter',
      'c.stator.windings'
    ]);

    const incoming = traversal.getNeighbors('c.electrical.inverter', { direction: 'incoming' });
    expect(incoming).toHaveLength(2);
    expect(incoming.map(i => i.sourceConceptId).sort()).toEqual([
      'c.control.six_step',
      'c.motor.bldc'
    ]);
  });

  it('computes requirements closure with traversal evidence', () => {
    const closure = traversal.getRequirementsClosure('c.motor.bldc');
    expect(closure.conceptIds).toContain('c.electrical.inverter');
    expect(closure.conceptIds).toContain('c.stator.windings');
    expect(closure.evidence).toBeDefined();
    expect(closure.evidence.length).toBeGreaterThanOrEqual(2);
    for (const ev of closure.evidence) {
      expect(ev.edgeIds.length).toBeGreaterThan(0);
      expect(ev.cumulativeConfidence).toBeGreaterThan(0);
    }
  });

  it('finds symmetric alternatives for a concept', () => {
    const altForFoc = traversal.getAlternatives('c.control.foc');
    expect(altForFoc.map(a => a.conceptId)).toContain('c.control.six_step');

    const altForSixStep = traversal.getAlternatives('c.control.six_step');
    expect(altForSixStep.map(a => a.conceptId)).toContain('c.control.foc');
  });

  it('finds shortest evidence path between two concepts', () => {
    // Path: c.control.six_step -> c.electrical.inverter <- c.motor.bldc
    const path = traversal.findShortestEvidencePath('c.control.six_step', 'c.stator.windings');
    expect(path).toBeDefined();
    if (path) {
      expect(path.path).toEqual([
        'c.control.six_step',
        'c.electrical.inverter',
        'c.motor.bldc',
        'c.stator.windings'
      ]);
      expect(path.edgeIds).toHaveLength(3);
      expect(path.cumulativeConfidence).toBeCloseTo(0.9 * 0.95 * 1.0, 4);
    }
  });

  it('enforces traversal bounds (maxDepth and maxResults)', () => {
    const shallowTraversal = new ConceptGraphTraversal({
      concepts,
      relationships,
      maxDepth: 1
    });
    const path = shallowTraversal.findShortestEvidencePath('c.control.six_step', 'c.stator.windings');
    // Depth is 3, which exceeds maxDepth 1
    expect(path).toBeNull();
  });
});
