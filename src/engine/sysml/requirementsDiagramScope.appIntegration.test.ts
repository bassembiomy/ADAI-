import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('requirements diagram scope App integration', () => {
  it('uses the shared scope for requirements persistence, nodes, and relationships without changing the BDD guard', () => {
    const source = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');

    expect(source).toContain("import { getRequirementsDiagramScope } from './engine/sysml/requirementsDiagramScope';");
    expect(source).toContain('getRequirementsDiagramScope(blocks, relationships, currentLayerId)');
    expect(source).toContain('requirementsDiagramScope.visibleBlockIds.has(b.id)');
    expect(source).toContain('requirementsDiagramScope.visibleBlockIds.has(block.id)');
    expect(source).toContain('requirementsDiagramScope.visibleRelationshipIds.has(r.id)');
    expect(source).toContain('requirementsDiagramScope.visibleRelationshipIds.has(rel.id)');
    expect(source).toContain("if (diagramMode === 'bdd' && isReqRel) return null;");
  });
});
