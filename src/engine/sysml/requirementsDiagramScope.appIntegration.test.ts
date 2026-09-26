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
    expect(source).toContain("type: 'createElement'");
    expect(source).toContain("kind: (newRel.type === 'aggregation' ? 'sharedAggregation' : newRel.type)");
    expect(source).toContain('setCanonicalSysmlRepository(transaction.repository)');
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

  it('keeps repository projection complete and scopes only the canvas projection once', () => {
    const source = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');
    const projectionStart = source.indexOf('const projectCanonicalAppView = useCallback(');
    const projectionEnd = source.indexOf('const activeSysmlDiagramId', projectionStart);
    const repositoryProjection = source.slice(projectionStart, projectionEnd);
    const renderBlocksStart = source.indexOf('const renderBlocks = useCallback');
    const renderRelationshipsStart = source.indexOf('const renderRelationships = useCallback', renderBlocksStart);
    const renderBlocks = source.slice(renderBlocksStart, renderRelationshipsStart);
    const projectionEffects = source.match(/useEffect\(\(\) => \{\s*projectCanonicalAppView\(/g) ?? [];

    expect(repositoryProjection).toContain('applyCanonicalSysmlResult({ view: complete })');
    expect(repositoryProjection).not.toContain('projectDiagramScopedCanvasView');
    expect(source).toContain('const sysmlCanvasView = useMemo(');
    expect(renderBlocks).toContain('sysmlCanvasView.blocks');
    expect(projectionEffects).toHaveLength(1);
    expect(source).toContain("blocks.filter(b => b.stereotype === 'block')");
  });
});
