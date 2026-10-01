import { describe, it, expect } from 'vitest';
import { ReferenceResolver } from './referenceResolver';

// Unit tests for semantic pronoun reference resolution
describe('ReferenceResolver', () => {
  const resolver = new ReferenceResolver();

  it('resolves pronouns like "it" to the single active model/concept in memory', () => {
    const memory = {
      activeModel: {
        id: 'model.bldc_drive.001',
        name: 'BLDC Motor Speed Controller',
        primaryConceptId: 'concept.electromechanical.bldc_motor'
      },
      recentConcepts: ['concept.electromechanical.bldc_motor']
    };

    const resolution = resolver.resolveReference('it', memory);
    expect(resolution.resolved).toBe(true);
    expect(resolution.targetConceptId).toBe('concept.electromechanical.bldc_motor');
    expect(resolution.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('returns ambiguity diagnostic when multiple candidate entities exist without disambiguation', () => {
    const memory = {
      activeModel: null,
      recentConcepts: [
        'concept.electromechanical.bldc_motor',
        'concept.hydraulic.cylinder'
      ]
    };

    const resolution = resolver.resolveReference('it', memory);
    expect(resolution.resolved).toBe(false);
    expect(resolution.candidates).toHaveLength(2);
    expect(resolution.diagnostics).toBeDefined();
    expect(resolution.diagnostics?.[0].code).toBe('AMBIGUOUS_PRONOUN_REFERENCE');
  });

  it('handles unresolved reference when memory is empty', () => {
    const resolution = resolver.resolveReference('it', { recentConcepts: [] });
    expect(resolution.resolved).toBe(false);
    expect(resolution.diagnostics?.[0].code).toBe('UNRESOLVED_REFERENCE');
  });
});
