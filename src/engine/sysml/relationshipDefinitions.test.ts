import { describe, it, expect } from 'vitest';
import {
  RELATIONSHIP_DEFINITIONS,
  getRelationshipDefinition,
  type RequirementRelationshipKind,
} from './relationshipDefinitions';

describe('relationshipDefinitions', () => {
  const KINDS: RequirementRelationshipKind[] = [
    'requirementContainment',
    'deriveReqt',
    'copy',
    'refine',
    'trace',
    'satisfy',
    'verify',
  ];

  it('defines metadata for all seven requirement relationships', () => {
    for (const kind of KINDS) {
      const def = getRelationshipDefinition(kind);
      expect(def).toBeDefined();
      expect(def.label).toBeTruthy();
      expect(def.displayLabel).toMatch(/^«.+»|«contains»$/);
      expect(def.directionLabel).toContain('→');
      expect(['solid', 'dashed']).toContain(def.lineStyle);
    }
  });

  it('marks containment, deriveReqt, and copy as acyclic', () => {
    expect(RELATIONSHIP_DEFINITIONS.requirementContainment.acyclic).toBe(true);
    expect(RELATIONSHIP_DEFINITIONS.deriveReqt.acyclic).toBe(true);
    expect(RELATIONSHIP_DEFINITIONS.copy.acyclic).toBe(true);
    expect(RELATIONSHIP_DEFINITIONS.refine.acyclic).toBe(false);
    expect(RELATIONSHIP_DEFINITIONS.trace.acyclic).toBe(false);
    expect(RELATIONSHIP_DEFINITIONS.satisfy.acyclic).toBe(false);
    expect(RELATIONSHIP_DEFINITIONS.verify.acyclic).toBe(false);
  });
});
