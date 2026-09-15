import { describe, expect, it } from 'vitest';
import type { BlockData, RelationshipData } from '../../types/sysml_types';
import { getRequirementsDiagramScope } from './requirementsDiagramScope';

function block(id: string, stereotype: string, layerId?: string): BlockData {
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
    ...(layerId === undefined ? {} : { layerId }),
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
  it('includes every supported requirement relationship and its visible endpoints', () => {
    const blocks = [
      block('req-1', 'requirement'),
      block('req-2', 'requirement'),
      block('test-1', 'testCase'),
      block('block-1', 'block'),
      block('unconnected-same-layer', 'block'),
      block('unconnected-same-layer-test-case', 'testCase'),
      block('state-1', 'stateMachine'),
      block('artifact-1', 'artifact'),
      block('copy-1', 'requirement'),
      block('derived-1', 'requirement'),
    ];
    const relationships = [
      relationship('verify-1', 'test-1', 'req-1', 'verify'),
      relationship('satisfy-1', 'block-1', 'req-1', 'satisfy'),
      relationship('refine-1', 'req-1', 'state-1', 'refine'),
      relationship('trace-1', 'req-1', 'artifact-1', 'trace'),
      relationship('derive-1', 'req-2', 'req-1', 'derive'),
      relationship('derive-reqt-1', 'derived-1', 'req-2', 'deriveReqt'),
      relationship('copy-1', 'copy-1', 'req-1', 'copy'),
      relationship('containment-1', 'req-1', 'req-2', 'requirementContainment'),
    ];

    const scope = getRequirementsDiagramScope(blocks, relationships);

    expect(scope.visibleBlockIds).toEqual(
      new Set(['req-1', 'req-2', 'test-1', 'block-1', 'state-1', 'artifact-1', 'copy-1', 'derived-1']),
    );
    expect(scope.visibleBlockIds).not.toContain('unconnected-same-layer');
    expect(scope.visibleBlockIds).not.toContain('unconnected-same-layer-test-case');
    expect(scope.visibleRelationshipIds).toEqual(
      new Set(['verify-1', 'satisfy-1', 'refine-1', 'trace-1', 'derive-1', 'derive-reqt-1', 'copy-1', 'containment-1']),
    );
  });

  it.each(['association', 'generalization', 'composition', 'aggregation', 'allocation', 'binding', 'dependency'] as const)(
    'rejects unsupported BDD-only relationship type %s',
    type => {
      const blocks = [block('req-1', 'requirement'), block('bdd-1', 'block')];
      const scope = getRequirementsDiagramScope(blocks, [relationship(`unsupported-${type}`, 'bdd-1', 'req-1', type)]);

      expect(scope.visibleBlockIds).toEqual(new Set(['req-1']));
      expect(scope.visibleRelationshipIds).toEqual(new Set());
    },
  );

  it('hides requirements and endpoints from another requirements layer', () => {
    const blocks = [
      block('req-1', 'requirement', 'layer-a'),
      block('test-1', 'testCase', 'layer-a'),
      block('block-1', 'block', 'layer-a'),
      block('cross-layer-requirement', 'requirement', 'layer-b'),
      block('cross-layer-block', 'block', 'layer-b'),
    ];
    const relationships = [
      relationship('verify-1', 'test-1', 'req-1', 'verify'),
      relationship('satisfy-1', 'block-1', 'req-1', 'satisfy'),
      relationship('cross-layer-satisfy', 'cross-layer-block', 'req-1', 'satisfy'),
      relationship('cross-layer-requirement-link', 'cross-layer-requirement', 'req-1', 'trace'),
    ];

    const scope = getRequirementsDiagramScope(blocks, relationships, 'layer-a');

    expect(scope.visibleBlockIds).toEqual(new Set(['req-1', 'test-1', 'block-1']));
    expect(scope.visibleRelationshipIds).toEqual(new Set(['verify-1', 'satisfy-1']));
  });

  it('treats a missing layerId as the root layer', () => {
    const blocks = [block('req-root', 'requirement'), block('test-root', 'testCase')];
    const relationships = [relationship('verify-root', 'test-root', 'req-root', 'verify')];

    const scope = getRequirementsDiagramScope(blocks, relationships, 'root');

    expect(scope.visibleBlockIds).toEqual(new Set(['req-root', 'test-root']));
    expect(scope.visibleRelationshipIds).toEqual(new Set(['verify-root']));
  });
});
