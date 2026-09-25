import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('requirements diagram scope App integration', () => {
  it('uses the shared scope for requirements persistence, nodes, and relationships without changing the BDD guard', () => {
    const source = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');

    expect(source).toContain("import { getRequirementsDiagramScope } from './engine/sysml/requirementsDiagramScope';");
    expect(source).toContain('getRequirementsDiagramScope(');
    expect(source).toContain('Object.fromEntries(sysmlStore.diagramPresentations.entries())');
    expect(source).toContain('new Set(sysmlDiagramPresentations.requirements?.elementIds ?? [])');
    expect(source).toContain('setSysmlStore(fromRepository(result.repository, result.coordinates, result.diagramPresentations))');
    expect(source).toContain('diagramPresentations={sysmlDiagramPresentations}');
    expect(source).toContain('sysmlDiagramPresentations[contextId]?.elementIds ?? []');
    expect(source).toContain('requirementsDiagramScope.visibleBlockIds.has(b.id)');
    expect(source).toContain('requirementsDiagramScope.visibleBlockIds.has(block.id)');
    expect(source).toContain('requirementsDiagramScope.visibleRelationshipIds.has(r.id)');
    expect(source).toContain('requirementsDiagramScope.visibleRelationshipIds.has(rel.id)');
    expect(source).toContain("if (diagramMode === 'bdd' && isReqRel) return null;");
  });

  it('routes Remove from Diagram through the canonical presentation command', () => {
    const source = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');
    const removeHandlerStart = source.indexOf('const removeFromDiagram = useCallback');
    const removeHandlerEnd = source.indexOf('const createRequirement = useCallback', removeHandlerStart);
    const removeHandler = source.slice(removeHandlerStart, removeHandlerEnd);

    expect(removeHandler).toContain("type: 'removeFromDiagram'");
    expect(removeHandler).not.toContain('setBlocks(prev => prev.filter');
    expect(removeHandler).not.toContain('setRelationships(prev => prev.filter');
  });
});
