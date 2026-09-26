import {
  ConceptRelationship,
  computeRelationshipHash
} from '../contracts/conceptGraph';
import { EngineeringConcept } from '../contracts/engineeringKnowledge';
import { ExtractedSection } from './documentExtractor';

export interface RelationshipExtractionContext {
  documentId: string;
  sourceReliability: number;
}

export class RelationshipExtractor {
  public extractRelationships(
    concepts: readonly EngineeringConcept[],
    sections: readonly ExtractedSection[],
    context: RelationshipExtractionContext
  ): ConceptRelationship[] {
    const relationships: ConceptRelationship[] = [];
    const conceptIds = new Set(concepts.map(c => c.id));

    for (const section of sections) {
      const text = `${section.heading} ${section.content}`.toLowerCase();

      // Heuristic extraction for requires / uses
      if (conceptIds.has('concept.electromechanical.bldc_motor') &&
          conceptIds.has('concept.electrical.three_phase_inverter')) {
        if (text.includes('requires') && text.includes('inverter')) {
          const id = `rel.extracted.${context.documentId}.bldc_requires_inverter`;
          const rel: ConceptRelationship = {
            schemaVersion: '1.0.0',
            id,
            sourceConceptId: 'concept.electromechanical.bldc_motor',
            relationType: 'requires',
            targetConceptId: 'concept.electrical.three_phase_inverter',
            conditions: [],
            priority: 1,
            confidence: Math.min(context.sourceReliability * 0.8, 0.9),
            verified: false, // Mandatory unverified invariant
            sourceId: context.documentId,
            documentId: context.documentId,
            sectionLocator: section.locator,
            contentHash: ''
          };
          rel.contentHash = computeRelationshipHash(rel);
          relationships.push(rel);
        }
      }

      if (conceptIds.has('concept.sensing.hall_sensors') &&
          (text.includes('measure') || text.includes('position'))) {
        const id = `rel.extracted.${context.documentId}.hall_measures_position`;
        if (conceptIds.has('concept.electromechanical.bldc_motor')) {
          const rel: ConceptRelationship = {
            schemaVersion: '1.0.0',
            id,
            sourceConceptId: 'concept.sensing.hall_sensors',
            relationType: 'measures',
            targetConceptId: 'concept.electromechanical.bldc_motor',
            conditions: ['rotor_angle'],
            priority: 2,
            confidence: Math.min(context.sourceReliability * 0.8, 0.9),
            verified: false,
            sourceId: context.documentId,
            documentId: context.documentId,
            sectionLocator: section.locator,
            contentHash: ''
          };
          rel.contentHash = computeRelationshipHash(rel);
          relationships.push(rel);
        }
      }
    }

    // Deduplicate by ID
    const unique = new Map<string, ConceptRelationship>();
    for (const r of relationships) {
      unique.set(r.id, r);
    }
    return Array.from(unique.values());
  }
}
