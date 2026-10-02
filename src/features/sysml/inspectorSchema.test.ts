import { describe, expect, it } from 'vitest';
import { createEmptyRepositoryV4 } from '../../engine/sysml/domain';
import {
  getInspectorSchema,
  type InspectorSelection,
} from './inspectorSchema';

export const supportedInspectorFixtures: Array<{ metaclass: string; selection: InspectorSelection }> = (() => {
  const repo = createEmptyRepositoryV4();

  repo.elements['pkg-1'] = { id: 'pkg-1', name: 'Pkg1', metaclass: 'Package', namespace: [], ownerId: 'pkg-root' };
  repo.elements['block-1'] = { id: 'block-1', name: 'Block1', metaclass: 'Block', namespace: [], ownerId: 'pkg-1' };
  repo.elements['prop-1'] = { id: 'prop-1', name: 'prop1', metaclass: 'PartProperty', namespace: [], ownerId: 'block-1', typeId: 'block-1', multiplicity: { lower: 1, upper: 1, ordered: false, unique: true }, aggregation: 'composite' } as any;
  repo.elements['ref-1'] = { id: 'ref-1', name: 'ref1', metaclass: 'ReferenceProperty', namespace: [], ownerId: 'block-1', typeId: 'block-1', multiplicity: { lower: 1, upper: 1, ordered: false, unique: true }, aggregation: 'none' } as any;
  repo.elements['val-1'] = { id: 'val-1', name: 'val1', metaclass: 'ValueProperty', namespace: [], ownerId: 'block-1', typeId: 'Real', multiplicity: { lower: 1, upper: 1, ordered: false, unique: true } } as any;
  repo.elements['port-1'] = { id: 'port-1', name: 'port1', metaclass: 'Port', namespace: [], ownerId: 'block-1', portKind: 'proxyPort', typeId: 'if-1', direction: 'in', isConjugated: false, multiplicity: { lower: 1, upper: 1, ordered: false, unique: true } } as any;
  repo.elements['req-1'] = { id: 'req-1', name: 'req1', metaclass: 'Requirement', namespace: [], ownerId: 'pkg-1', requirementId: 'REQ-1', text: 'Specification', status: 'draft', version: '1' } as any;
  repo.elements['tc-1'] = { id: 'tc-1', name: 'tc1', metaclass: 'TestCase', namespace: [], ownerId: 'pkg-1', verifiesRequirementIds: ['req-1'] } as any;
  repo.elements['act-1'] = { id: 'act-1', name: 'act1', metaclass: 'Activity', namespace: [], ownerId: 'pkg-1', parameterIds: [], nodeIds: [], partitionIds: [] } as any;
  repo.elements['uc-1'] = { id: 'uc-1', name: 'uc1', metaclass: 'UseCase', namespace: [], ownerId: 'pkg-1', subjectIds: [], extensionPointIds: [] } as any;

  repo.diagrams['diag-1'] = { id: 'diag-1', name: 'Diagram1', diagramKind: 'bdd', ownerId: 'pkg-1' } as any;

  repo.relationships['conn-1'] = {
    id: 'conn-1',
    name: 'conn1',
    metaclass: 'Connector',
    sourceId: 'port-1',
    targetId: 'port-2',
    sourceEnd: { id: 'end-1', roleId: 'port-1' },
    targetEnd: { id: 'end-2', roleId: 'port-2' },
  };
  repo.relationships['alloc-1'] = {
    id: 'alloc-1',
    name: 'alloc1',
    metaclass: 'Allocate',
    sourceId: 'block-1',
    targetId: 'subsystem-1',
  };

  return [
    { metaclass: 'Package', selection: { repository: repo, elementId: 'pkg-1' } },
    { metaclass: 'Block', selection: { repository: repo, elementId: 'block-1' } },
    { metaclass: 'PartProperty', selection: { repository: repo, elementId: 'prop-1' } },
    { metaclass: 'ReferenceProperty', selection: { repository: repo, elementId: 'ref-1' } },
    { metaclass: 'ValueProperty', selection: { repository: repo, elementId: 'val-1' } },
    { metaclass: 'Port', selection: { repository: repo, elementId: 'port-1' } },
    { metaclass: 'Requirement', selection: { repository: repo, elementId: 'req-1' } },
    { metaclass: 'TestCase', selection: { repository: repo, elementId: 'tc-1' } },
    { metaclass: 'Activity', selection: { repository: repo, elementId: 'act-1' } },
    { metaclass: 'UseCase', selection: { repository: repo, elementId: 'uc-1' } },
    { metaclass: 'Diagram', selection: { repository: repo, elementId: 'diag-1' } },
    { metaclass: 'Connector', selection: { repository: repo, relationshipId: 'conn-1' } },
    { metaclass: 'Allocate', selection: { repository: repo, relationshipId: 'alloc-1' } },
  ];
})();

describe('inspectorSchema', () => {
  it.each(supportedInspectorFixtures)('$metaclass exposes no fake editable controls', ({ selection }) => {
    const schema = getInspectorSchema(selection);
    expect(schema).toBeDefined();
    for (const field of schema!.fields) {
      if (field.mode === 'editable') expect(field.toCommand).toBeTypeOf('function');
      if (field.mode === 'readOnly') expect(field.readOnlyReason).toBeTruthy();
    }
    for (const action of schema!.actions.filter(action => action.enabled)) {
      expect(action.toCommand).toBeTypeOf('function');
    }
  });

  it('uses names and metaclasses in titles without exposing identity fields', () => {
    const repository = createEmptyRepositoryV4();
    repository.elements['block-1'] = { id: 'block-1', name: 'Block1', metaclass: 'Block', namespace: [], ownerId: 'pkg-root' };
    repository.elements['unnamed-block'] = { id: 'unnamed-block', name: '  ', metaclass: 'Block', namespace: [], ownerId: 'pkg-root' };
    repository.relationships['anonymous-association'] = {
      id: 'anonymous-association', name: '', metaclass: 'Association', sourceId: 'block-1', targetId: 'pkg-root',
    };
    repository.relationships['named-association'] = {
      id: 'named-association', name: ' connects ', metaclass: 'Association', sourceId: 'block-1', targetId: 'pkg-root',
    };
    repository.itemFlows!['flow-1'] = {
      id: 'flow-1', name: '', sourceId: 'block-1', targetId: 'pkg-root',
      realizingRelationshipId: 'named-association', conveyedClassifierIds: ['block-1'],
    };
    repository.diagrams['diagram-1'] = {
      id: 'diagram-1', name: '', metaclass: 'Diagram', diagramKind: 'bdd', namespace: [], ownerId: 'pkg-root', presentationIds: [],
    };

    const selections = [
      { elementId: 'block-1', title: 'Block: Block1' },
      { elementId: 'unnamed-block', title: 'Block' },
      { relationshipId: 'anonymous-association', title: 'Association' },
      { relationshipId: 'named-association', title: 'Association: connects' },
      { itemFlowId: 'flow-1', title: 'Item Flow' },
      { elementId: 'diagram-1', title: 'Diagram' },
    ];
    for (const { title, ...selection } of selections) {
      const schema = getInspectorSchema({ repository, ...selection })!;
      expect(schema.title).toBe(title);
      expect(schema.fields.map(field => field.key)).not.toContain('id');
      expect(schema.fields.map(field => field.label)).not.toContain('ID');
      expect(schema.fields.some(field => field.key === 'name')).toBe(true);
    }
  });

  it('provides named reference options while retaining ID command values', () => {
    const repository = createEmptyRepositoryV4();
    repository.elements['block-1'] = { id: 'block-1', name: 'Block1', metaclass: 'Block', namespace: [], ownerId: 'pkg-root' };
    repository.elements['block-2'] = { id: 'block-2', name: 'Block2', metaclass: 'Block', namespace: [], ownerId: 'pkg-root' };
    repository.elements['part-1'] = { id: 'part-1', name: 'Part1', metaclass: 'PartProperty', namespace: [], ownerId: 'block-1', typeId: 'block-1' } as any;
    repository.relationships['connector-1'] = {
      id: 'connector-1', name: '', metaclass: 'Connector', sourceId: 'block-1', targetId: 'block-2',
      sourceEnd: { id: 'end-1', roleId: 'block-1' }, targetEnd: { id: 'end-2', roleId: 'block-2' },
    };
    repository.itemFlows!['flow-1'] = {
      id: 'flow-1', name: '', sourceId: 'block-1', targetId: 'block-2',
      realizingRelationshipId: 'connector-1', conveyedClassifierIds: ['block-1', 'block-2'],
    };

    const part = getInspectorSchema({ repository, elementId: 'part-1' })!;
    for (const key of ['ownerId', 'typeId']) {
      const field = part.fields.find(candidate => candidate.key === key)!;
      expect(field).toMatchObject({ valueType: 'select', options: expect.arrayContaining([{ label: 'Block1', value: 'block-1' }]) });
      expect(field.label).not.toContain('ID');
    }
    expect(part.fields.find(field => field.key === 'ownerId')?.toCommand?.('block-2')).toMatchObject({
      type: 'MoveElement', newOwnerId: 'block-2',
    });

    const connector = getInspectorSchema({ repository, relationshipId: 'connector-1' })!;
    for (const [key, label] of [['sourceId', 'Source'], ['targetId', 'Target'], ['sourceEndRoleId', 'Source End Role'], ['targetEndRoleId', 'Target End Role']]) {
      const field = connector.fields.find(candidate => candidate.key === key)!;
      expect(field).toMatchObject({ label, valueType: 'select' });
      expect(field.options).toContainEqual({ label: 'Block1', value: 'block-1' });
    }
    expect(connector.fields.find(field => field.key === 'sourceId')?.toCommand?.('block-2')).toMatchObject({
      type: 'UpdateRelationship', relationshipId: 'connector-1', patch: { sourceId: 'block-2' },
    });

    const flow = getInspectorSchema({ repository, itemFlowId: 'flow-1' })!;
    for (const key of ['sourceId', 'targetId', 'realizingRelationshipId', 'conveyedClassifierIds']) {
      const field = flow.fields.find(candidate => candidate.key === key)!;
      expect(field.options).toContainEqual({ label: 'Block1', value: 'block-1' });
      expect(field.label).not.toContain('ID');
    }
    expect(flow.fields.find(field => field.key === 'realizingRelationshipId')?.options).toContainEqual({ label: 'Connector', value: 'connector-1' });
  });
});
