import { describe, expect, it } from 'vitest';
import type { BlockData, RelationshipData } from '../types/sysml_types';
import {
  classifyBddRelationshipPresentation,
  getCanvasRelationshipKinds,
  getDirectBddPropertyRelationshipKind,
  rejectBlockConnectionChange,
  rejectUiRelationship,
  resolveUiConnectionEndpoint,
} from './sysmlConnectionUi';

const block = (id: string, stereotype = 'block'): BlockData => ({ id, name: id, stereotype, x: 0, y: 0, width: 100, height: 80, properties: [], operations: [], constraints: [], classes: [], ports: [] });
const relation = (type: RelationshipData['type'] = 'composition'): RelationshipData => ({ id: 'rel', sourceId: 'whole', targetId: 'part', type, label: '' });
const model = (stereotype = 'block', relationships: RelationshipData[] = []) => ({ blocks: [block('whole'), block('part', stereotype)], parts: [], relationships });

describe('SysML connection UI admission', () => {
  it('does not use an unresolved endpoint ID as a name or diagnostic text', () => {
    const id = '65cb033e-421d-41e0-b789-87931d991010';
    const endpoint = resolveUiConnectionEndpoint(model(), id);
    expect(endpoint.name).toBe('Element');
    const rejection = rejectUiRelationship(model(), { ...relation(), targetId: id }, 'bdd')!;
    expect(rejection.diagnostic.message).not.toContain(id);
  });
  it('selects Association directly when a BDD property targets its declared Block type', () => {
    const owner = block('owner');
    owner.properties = [{ id: 'motor-property', name: 'motor', kind: 'part', type: 'Motor', typeId: 'motor', multiplicity: '1' }];
    const state = { blocks: [owner, block('motor')], parts: [], relationships: [] };

    expect(getDirectBddPropertyRelationshipKind(state, 'motor-property', 'motor')).toBe('association');
    expect(getDirectBddPropertyRelationshipKind(state, 'motor-property', 'owner')).toBeUndefined();
  });

  it('rejects Block to ValueType composition with actionable endpoint details', () => {
    const state = model('valueType');
    const before = JSON.stringify(state);
    const rejection = rejectUiRelationship(state, relation(), 'bdd');
    expect(rejection?.diagnostic.code).toBe('INVALID_AGGREGATION_ENDPOINTS');
    expect(rejection?.diagnostic.correctiveAction).toContain('value property');
    expect(rejection?.target.family).toBe('valueType');
    expect(JSON.stringify(state)).toBe(before);
  });

  it('does not default to association when the diagram has no legal relationship', () => {
    expect(getCanvasRelationshipKinds(model(), 'whole', 'part', 'ibd')).toEqual([]);
  });

  it('offers legal BDD choices for value types without composition or generalization', () => {
    expect(getCanvasRelationshipKinds(model('valueType'), 'whole', 'part', 'bdd')).toEqual(['association', 'dependency', 'allocation']);
  });

  it('rejects a kind update without changing the existing relationship', () => {
    const current = relation('association');
    const state = model('valueType', [current]);
    expect(rejectUiRelationship(state, { ...current, type: 'composition' }, 'bdd')).toBeDefined();
    expect(state.relationships).toEqual([relation('association')]);
  });

  it('rejects a composed Block stereotype change atomically', () => {
    const state = model('block', [relation()]);
    const candidate = { ...state.blocks[1], stereotype: 'valueType', name: 'changed' };
    const rejection = rejectBlockConnectionChange(state, candidate);
    expect(rejection?.diagnostic.code).toBe('INVALID_AGGREGATION_ENDPOINTS');
    expect(rejection?.diagnostic.message).toContain('stereotype');
    expect(state.blocks[1]).toEqual(block('part'));
    expect(state.relationships).toEqual([relation()]);
  });

  it('checks every connected relationship, including outgoing links', () => {
    const state = model('block', [relation('dependency'), { ...relation(), id: 'out', sourceId: 'part', targetId: 'whole' }]);
    expect(rejectBlockConnectionChange(state, { ...state.blocks[1], stereotype: 'valueType' })?.relationshipKind).toBe('composition');
  });

  it('allows non-stereotype edits when legacy invalid links exist', () => {
    const state = model('valueType', [relation()]);
    expect(rejectBlockConnectionChange(state, { ...state.blocks[1], name: 'renamed' })).toBeUndefined();
  });

  it('allows a valid stereotype change and excludes graph-invalid canvas choices', () => {
    const state = model('block', [relation('association')]);
    expect(rejectBlockConnectionChange(state, { ...state.blocks[1], stereotype: 'valueType' })).toBeUndefined();
    expect(getCanvasRelationshipKinds(state, 'whole', 'part', 'bdd')).not.toContain('association');
  });

  it('returns actionable duplicate and missing-endpoint rejections', () => {
    expect(rejectUiRelationship(model('block', [relation()]), { ...relation(), id: 'duplicate' }, 'bdd')?.diagnostic.code).toBe('DUPLICATE_RELATIONSHIP');
    expect(rejectUiRelationship(model(), { ...relation(), targetId: 'missing' }, 'bdd')?.diagnostic.code).toBe('MISSING_RELATIONSHIP_ENDPOINT');
  });

  it('returns all legal requirement-canvas choices between requirements', () => {
    const state = { ...model(), blocks: [block('whole', 'requirement'), block('part', 'requirement')] };
    expect(getCanvasRelationshipKinds(state, 'whole', 'part', 'requirements')).toEqual(
      expect.arrayContaining(['requirementContainment', 'deriveReqt', 'copy', 'refine', 'trace'])
    );
  });

  it('returns satisfy, refine, and trace from Block to Requirement', () => {
    const state = { ...model(), blocks: [block('whole', 'block'), block('part', 'requirement')] };
    expect(getCanvasRelationshipKinds(state, 'whole', 'part', 'requirements')).toEqual(['satisfy', 'refine', 'trace']);
  });

  it('returns verify, refine, and trace from TestCase to Requirement', () => {
    const state = { ...model(), blocks: [block('whole', 'testCase'), block('part', 'requirement')] };
    expect(getCanvasRelationshipKinds(state, 'whole', 'part', 'requirements')).toEqual(['verify', 'refine', 'trace']);
  });

  it('returns satisfy, verify, refine, and trace from State to Requirement', () => {
    const state = {
      ...model(),
      blocks: [block('req-1', 'requirement')],
      states: [{ id: 'state-active', name: 'Active' }],
    };
    expect(getCanvasRelationshipKinds(state, 'state-active', 'req-1', 'requirements'))
      .toEqual(['satisfy', 'verify', 'refine', 'trace']);
  });

  it('resolves nested Block properties by semantic ID with family property', () => {
    const blockWithProp: BlockData = {
      ...block('b1'),
      properties: [{ id: 'prop-123', name: 'sensor', type: 'SensorBlock', kind: 'part' }],
    };
    const state = { blocks: [blockWithProp, block('b2')], parts: [], relationships: [] };
    const endpoint = resolveUiConnectionEndpoint(state, 'prop-123');
    expect(endpoint.family).toBe('property');
    expect(endpoint.id).toBe('prop-123');
    expect(endpoint.name).toBe('sensor');
    expect(endpoint.ownerId).toBe('b1');

    const kinds = getCanvasRelationshipKinds(state, 'prop-123', 'b2', 'bdd');
    expect(kinds).toContain('association');
    expect(kinds).toContain('dependency');
    expect(kinds).toContain('allocation');
    expect(kinds).not.toContain('generalization');
  });

  it('connects Property to Block using Property and Block semantic IDs and allows explicit relationship kind selection', () => {
    const blockWithProp: BlockData = {
      ...block('b1'),
      properties: [{ id: 'prop-engine-1', name: 'engine', type: 'EngineBlock', kind: 'part' }],
    };
    const targetBlock = block('b2');
    const state = { blocks: [blockWithProp, targetBlock], parts: [], relationships: [] };

    // Resolve source endpoint by Property semantic ID
    const sourceEndpoint = resolveUiConnectionEndpoint(state, 'prop-engine-1');
    expect(sourceEndpoint.id).toBe('prop-engine-1');
    expect(sourceEndpoint.family).toBe('property');

    // Resolve target endpoint by Block semantic ID
    const targetEndpoint = resolveUiConnectionEndpoint(state, 'b2');
    expect(targetEndpoint.id).toBe('b2');
    expect(targetEndpoint.family).toBe('block');

    // Canvas offers legal choices: association, dependency, allocation
    const kinds = getCanvasRelationshipKinds(state, 'prop-engine-1', 'b2', 'bdd');
    expect(kinds).toEqual(expect.arrayContaining(['association', 'dependency', 'allocation']));
    // Does not default silently or offer invalid kinds
    expect(kinds).not.toContain('generalization');
    expect(kinds).not.toContain('composition');

    // Valid relationship with explicit choice passes UI admission
    const validRel: RelationshipData = {
      id: 'rel-prop-b2',
      sourceId: 'prop-engine-1',
      targetId: 'b2',
      type: 'association',
      label: 'engineAssociation',
    };
    expect(rejectUiRelationship(state, validRel, 'bdd')).toBeUndefined();
  });

  describe('classifyBddRelationshipPresentation', () => {
    it('classifies Block-to-Block association as blockAssociation', () => {
      const state = {
        blocks: [block('sourceBlock'), block('targetBlock')],
        parts: [],
        relationships: [],
      };
      const rel: RelationshipData = {
        id: 'rel-b2b',
        sourceId: 'sourceBlock',
        targetId: 'targetBlock',
        type: 'association',
        label: '',
      };
      expect(classifyBddRelationshipPresentation(state, rel)).toEqual({
        kind: 'blockAssociation',
      });
    });

    it('classifies valid property-to-Block association as propertyAssociation with property and ownerBlock ids', () => {
      const owner = block('ownerBlock');
      owner.properties = [
        { id: 'prop-engine', name: 'engine', kind: 'part', type: 'Motor', typeId: 'targetBlock', multiplicity: '1' },
      ];
      const state = {
        blocks: [owner, block('targetBlock')],
        parts: [],
        relationships: [],
      };
      const rel: RelationshipData = {
        id: 'rel-prop',
        sourceId: 'prop-engine',
        targetId: 'targetBlock',
        type: 'association',
        label: '',
      };
      expect(classifyBddRelationshipPresentation(state, rel)).toEqual({
        kind: 'propertyAssociation',
        propertyId: 'prop-engine',
        ownerBlockId: 'ownerBlock',
      });
    });

    it('rejects invalid property typing for property-to-Block association returning undefined', () => {
      const owner = block('ownerBlock');
      owner.properties = [
        { id: 'prop-engine', name: 'engine', kind: 'part', type: 'Motor', typeId: 'correctTarget', multiplicity: '1' },
      ];
      const state = {
        blocks: [owner, block('correctTarget'), block('wrongTarget')],
        parts: [],
        relationships: [],
      };
      const rel: RelationshipData = {
        id: 'rel-wrong',
        sourceId: 'prop-engine',
        targetId: 'wrongTarget',
        type: 'association',
        label: '',
      };
      expect(classifyBddRelationshipPresentation(state, rel)).toBeUndefined();
    });

    it('classifies other canonical BDD relationship kinds correctly', () => {
      const state = {
        blocks: [block('b1'), block('b2')],
        parts: [],
        relationships: [],
      };
      expect(classifyBddRelationshipPresentation(state, { id: 'r1', sourceId: 'b1', targetId: 'b2', type: 'composition', label: '' }))
        .toEqual({ kind: 'composition' });
      expect(classifyBddRelationshipPresentation(state, { id: 'r2', sourceId: 'b1', targetId: 'b2', type: 'aggregation', label: '' }))
        .toEqual({ kind: 'aggregation' });
      expect(classifyBddRelationshipPresentation(state, { id: 'r3', sourceId: 'b1', targetId: 'b2', type: 'generalization', label: '' }))
        .toEqual({ kind: 'generalization' });
      expect(classifyBddRelationshipPresentation(state, { id: 'r4', sourceId: 'b1', targetId: 'b2', type: 'dependency', label: '' }))
        .toEqual({ kind: 'dependency' });
      expect(classifyBddRelationshipPresentation(state, { id: 'r5', sourceId: 'b1', targetId: 'b2', type: 'allocation', label: '' }))
        .toEqual({ kind: 'allocation' });
    });
  });
});
