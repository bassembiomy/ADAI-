import { describe, expect, it } from 'vitest';
import type { BlockData, RelationshipData } from '../../types/sysml_types';
import { getRequirementsDiagramScope } from './requirementsDiagramScope';

function block(id: string, stereotype: string, layerId = 'root'): BlockData {
  return {
    id,
    name: id,
    stereotype,
    x: 0,
    y: 0,
    width: 160,
    height: 80,
    properties: [],
    operations: [],
    constraints: [],
    classes: [],
    ports: [],
    layerId,
  };
}

function relationship(
  id: string,
  sourceId: string,
  targetId: string,
  type: RelationshipData['type'],
): RelationshipData {
  return { id, sourceId, targetId, type, label: '' };
}

describe('getRequirementsDiagramScope', () => {
  it('includes connected test cases and blocks but excludes unrelated BDD elements', () => {
    const blocks = [
      block('req-1', 'requirement'),
      block('test-1', 'testCase'),
      block('block-1', 'block'),
      block('unrelated-block', 'block'),
    ];
    const relationships = [
      relationship('verify-1', 'test-1', 'req-1', 'verify'),
      relationship('satisfy-1', 'block-1', 'req-1', 'satisfy'),
      relationship('bdd-only-1', 'block-1', 'unrelated-block', 'association'),
    ];

    const scope = getRequirementsDiagramScope(blocks, relationships);

    expect(scope.visibleBlockIds).toEqual(new Set(['req-1', 'test-1', 'block-1']));
    expect(scope.visibleRelationshipIds).toEqual(new Set(['verify-1', 'satisfy-1']));
  });

  it('excludes BDD-only relationships and endpoints from another requirements layer', () => {
    const blocks = [
      block('req-1', 'requirement', 'layer-a'),
      block('test-1', 'testCase', 'layer-a'),
      block('block-1', 'block', 'layer-a'),
      block('cross-layer-block', 'block', 'layer-b'),
      block('unrelated-block', 'block', 'layer-a'),
    ];
    const relationships = [
      relationship('verify-1', 'test-1', 'req-1', 'verify'),
      relationship('satisfy-1', 'block-1', 'req-1', 'satisfy'),
      relationship('cross-layer-satisfy', 'cross-layer-block', 'req-1', 'satisfy'),
      relationship('bdd-only-1', 'block-1', 'unrelated-block', 'composition'),
    ];

    const scope = getRequirementsDiagramScope(blocks, relationships, 'layer-a');

    expect(scope.visibleBlockIds).toEqual(new Set(['req-1', 'test-1', 'block-1']));
    expect(scope.visibleRelationshipIds).toEqual(new Set(['verify-1', 'satisfy-1']));
  });
});
