import {
  EngineeringConcept,
  computeConceptHash
} from '../contracts/engineeringKnowledge';
import { ExtractedSection } from './documentExtractor';

export interface ConceptExtractionContext {
  documentId: string;
  sourceReliability: number;
}

export class ConceptExtractor {
  public extractConcepts(
    sections: readonly ExtractedSection[],
    context: ConceptExtractionContext
  ): EngineeringConcept[] {
    const concepts: EngineeringConcept[] = [];
    const seen = new Set<string>();

    for (const section of sections) {
      const text = `${section.heading} ${section.content}`.toLowerCase();

      // Rule-based heuristic extraction of engineering concepts from technical text
      if (text.includes('bldc') || text.includes('brushless dc')) {
        const id = 'concept.electromechanical.bldc_motor';
        if (!seen.has(id)) {
          seen.add(id);
          const c: EngineeringConcept = {
            schemaVersion: '1.0.0',
            id,
            canonicalName: 'Brushless DC Motor',
            aliases: ['BLDC', 'BLDC Motor'],
            domain: 'electromechanical',
            description: `Extracted from ${context.documentId}: ${section.locator}`,
            functionalRoles: ['plant', 'actuator'],
            requiredConcepts: ['concept.electrical.three_phase_inverter'],
            optionalConcepts: ['concept.sensing.hall_sensors'],
            alternatives: [],
            inputs: [],
            outputs: [],
            designParameters: [],
            constraints: [],
            assumptions: [],
            applicableMethods: ['six_step_commutation'],
            validationRuleIds: [],
            referenceIds: [],
            lifecycle: 'quarantined', // Mandatory quarantine invariant
            confidence: Math.min(context.sourceReliability * 0.85, 0.9),
            provenanceIds: [context.documentId],
            contentHash: ''
          };
          c.contentHash = computeConceptHash(c);
          concepts.push(c);
        }
      }

      if (text.includes('inverter')) {
        const id = 'concept.electrical.three_phase_inverter';
        if (!seen.has(id)) {
          seen.add(id);
          const c: EngineeringConcept = {
            schemaVersion: '1.0.0',
            id,
            canonicalName: 'Three-Phase Inverter',
            aliases: ['Inverter Bridge'],
            domain: 'electrical',
            description: `Extracted from ${context.documentId}: ${section.locator}`,
            functionalRoles: ['power_conversion'],
            requiredConcepts: [],
            optionalConcepts: [],
            alternatives: [],
            inputs: [],
            outputs: [],
            designParameters: [],
            constraints: [],
            assumptions: [],
            applicableMethods: ['pwm'],
            validationRuleIds: [],
            referenceIds: [],
            lifecycle: 'quarantined',
            confidence: Math.min(context.sourceReliability * 0.85, 0.9),
            provenanceIds: [context.documentId],
            contentHash: ''
          };
          c.contentHash = computeConceptHash(c);
          concepts.push(c);
        }
      }

      if (text.includes('hall sensor') || text.includes('hall sensors')) {
        const id = 'concept.sensing.hall_sensors';
        if (!seen.has(id)) {
          seen.add(id);
          const c: EngineeringConcept = {
            schemaVersion: '1.0.0',
            id,
            canonicalName: 'Hall Effect Sensors',
            aliases: ['Hall Sensors', 'Rotor Position Sensors'],
            domain: 'sensing',
            description: `Extracted from ${context.documentId}: ${section.locator}`,
            functionalRoles: ['sensor', 'rotor_feedback'],
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
            confidence: Math.min(context.sourceReliability * 0.85, 0.9),
            provenanceIds: [context.documentId],
            contentHash: ''
          };
          c.contentHash = computeConceptHash(c);
          concepts.push(c);
        }
      }
    }

    return concepts;
  }
}
