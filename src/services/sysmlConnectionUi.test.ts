import { describe, expect, it } from 'vitest';
import type { BlockData, RelationshipData } from '../types/sysml_types';
import { getCanvasRelationshipKinds, rejectBlockConnectionChange, rejectUiRelationship } from './sysmlConnectionUi';

const block = (id: string, stereotype = 'block'): BlockData => ({ id, name: id, stereotype, x: 0, y: 0, width: 100, height: 80, properties: [], operations: [], constraints: [], classes: [], ports: [] });
const relation = (type: RelationshipData['type'] = 'composition'): RelationshipData => ({ id: 'rel', sourceId: 'whole', targetId: 'part', type, label: '' });
const model = (stereotype = 'block', relationships: RelationshipData[] = []) => ({ blocks: [block('whole'), block('part', stereotype)], parts: [], relationships });

describe('SysML connection UI admission', () => {
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
});
