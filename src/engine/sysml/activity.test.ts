import { describe, expect, it } from 'vitest';
import {
  createEmptyRepository, type ActivityDefinition, type ActivityEdge, type ActivityNode, type BlockDefinition, type SysmlRepository,
} from './model';
import { activityNestedIds, checkActivityEdge, findActivityElement, validateActivity } from './activity';
import { validateSysmlRepository } from './validation';
import { findUnresolvedEndpoints } from './interchangeReport';

const block = (id: string, extra: Partial<BlockDefinition> = {}): BlockDefinition => ({
  id, kind: 'block', name: id, namespace: [], ownerId: 'model', isAbstract: false, isLeaf: false,
  properties: [], ports: [], operations: [], constraints: [], ...extra,
});

const node = (id: string, kind: ActivityNode['kind'], extra: Partial<ActivityNode> = {}): ActivityNode => ({ id, kind, name: id, ...extra });
const flow = (id: string, sourceId: string, targetId: string, extra: Partial<ActivityEdge> = {}): ActivityEdge =>
  ({ id, kind: 'controlFlow', sourceId, targetId, ...extra });

function repoWith(activity: Partial<ActivityDefinition>, setup?: (repo: SysmlRepository) => void): { repo: SysmlRepository; activity: ActivityDefinition } {
  const repo = createEmptyRepository();
  repo.definitions.Real = { id: 'Real', kind: 'valueType', name: 'Real', namespace: [], ownerId: 'model' };
  repo.definitions.Vehicle = block('Vehicle');
  repo.definitions.Car = block('Car', { supertypeIds: ['Vehicle'] });
  repo.definitions.Wheel = block('Wheel');
  const full: ActivityDefinition = {
    id: 'act', kind: 'activity', name: 'Drive', namespace: [], ownerId: 'model',
    parameters: [], nodes: [], edges: [], partitions: [], ...activity,
  };
  repo.definitions.act = full;
  setup?.(repo);
  return { repo, activity: full };
}

const codes = (repo: SysmlRepository, activity: ActivityDefinition, severity?: 'error' | 'warning') =>
  validateActivity(repo, activity).filter(d => !severity || d.severity === severity).map(d => d.code).sort();

describe('activity rules: initial and final nodes', () => {
  it('allows at most one initial node and warns when there is none', () => {
    const two = repoWith({ nodes: [node('i1', 'initial'), node('i2', 'initial')] });
    expect(codes(two.repo, two.activity, 'error')).toContain('MULTIPLE_INITIAL_NODES');

    const none = repoWith({ nodes: [node('a', 'action')] });
    expect(codes(none.repo, none.activity)).toContain('ACTIVITY_NO_INITIAL_NODE');
    expect(codes(none.repo, none.activity, 'error')).toEqual([]);

    const empty = repoWith({});
    expect(codes(empty.repo, empty.activity)).toEqual([]);
  });

  it('rejects outgoing edges from final nodes and incoming edges to an initial node', () => {
    const { repo, activity } = repoWith({
      nodes: [node('i', 'initial'), node('a', 'action'), node('f', 'activityFinal'), node('g', 'flowFinal')],
      edges: [flow('e1', 'f', 'a'), flow('e2', 'g', 'a'), flow('e3', 'a', 'i')],
    });
    const errors = codes(repo, activity, 'error');
    expect(errors.filter(code => code === 'FINAL_NODE_HAS_OUTGOING')).toHaveLength(2);
    expect(errors).toContain('INITIAL_NODE_HAS_INCOMING');
  });
});

describe('activity rules: decision, merge, fork, join (warnings while drawing)', () => {
  it('decision needs two guarded outgoing edges and one incoming edge', () => {
    const base = {
      nodes: [node('i', 'initial'), node('d', 'decision'), node('a', 'action'), node('b', 'action')],
    };
    const bare = repoWith({ ...base, edges: [flow('e0', 'i', 'd')] });
    expect(codes(bare.repo, bare.activity, 'warning')).toContain('DECISION_NEEDS_BRANCHES');

    const unguarded = repoWith({ ...base, edges: [flow('e0', 'i', 'd'), flow('e1', 'd', 'a'), flow('e2', 'd', 'b', { guard: 'else' })] });
    const diagnostics = validateActivity(unguarded.repo, unguarded.activity);
    expect(diagnostics.filter(d => d.code === 'DECISION_MISSING_GUARD').map(d => d.elementId)).toEqual(['e1']);

    const ok = repoWith({ ...base, edges: [flow('e0', 'i', 'd'), flow('e1', 'd', 'a', { guard: 'x > 0' }), flow('e2', 'd', 'b', { guard: 'else' })] });
    expect(codes(ok.repo, ok.activity)).toEqual([]);
  });

  it('fork, join and merge arities are warnings, never errors', () => {
    const { repo, activity } = repoWith({
      nodes: [node('i', 'initial'), node('fk', 'fork'), node('jn', 'join'), node('mg', 'merge'), node('a', 'action')],
      edges: [flow('e1', 'i', 'fk'), flow('e2', 'fk', 'a'), flow('e3', 'a', 'jn'), flow('e4', 'a', 'mg')],
    });
    expect(codes(repo, activity, 'error')).toEqual([]);
    expect(codes(repo, activity, 'warning')).toEqual(expect.arrayContaining(['FORK_ARITY', 'JOIN_ARITY', 'MERGE_ARITY']));
  });

  it('a well-formed fork/join pair has no diagnostics', () => {
    const { repo, activity } = repoWith({
      nodes: [node('i', 'initial'), node('fk', 'fork'), node('a', 'action'), node('b', 'action'), node('jn', 'join'), node('f', 'activityFinal')],
      edges: [flow('e1', 'i', 'fk'), flow('e2', 'fk', 'a'), flow('e3', 'fk', 'b'), flow('e4', 'a', 'jn'), flow('e5', 'b', 'jn'), flow('e6', 'jn', 'f')],
    });
    expect(codes(repo, activity)).toEqual([]);
  });
});

describe('activity rules: object flows, pins and types', () => {
  const pinsAction = (id: string, pins: ActivityNode['pins']) => node(id, 'action', { pins });

  it('object flows connect object nodes, parameter nodes and pins only', () => {
    const { repo, activity } = repoWith({
      parameters: [{ id: 'p1', name: 'speed', direction: 'in', typeId: 'Real' }],
      nodes: [node('a', 'action'), node('o', 'objectNode', { typeId: 'Real' }), node('pn', 'activityParameterNode', { parameterId: 'p1' })],
      edges: [{ id: 'bad', kind: 'objectFlow', sourceId: 'a', targetId: 'o' }, { id: 'good', kind: 'objectFlow', sourceId: 'pn', targetId: 'o' }],
    });
    const errors = validateActivity(repo, activity).filter(d => d.severity === 'error');
    expect(errors.map(d => `${d.code}:${d.elementId}`)).toEqual(['OBJECT_FLOW_ENDPOINT:bad']);
  });

  it('control flows may not start or end at a pin', () => {
    const { repo, activity } = repoWith({
      nodes: [pinsAction('a', [{ id: 'pi', name: 'in', direction: 'in' }]), node('i', 'initial')],
      edges: [flow('e', 'i', 'pi')],
    });
    expect(codes(repo, activity, 'error')).toEqual(['CONTROL_FLOW_INTO_PIN']);
  });

  it('pin direction: flows leave output pins and enter input pins', () => {
    const { repo, activity } = repoWith({
      nodes: [
        pinsAction('a', [{ id: 'ai', name: 'in', direction: 'in' }, { id: 'ao', name: 'out', direction: 'out' }]),
        pinsAction('b', [{ id: 'bi', name: 'in', direction: 'in' }, { id: 'bo', name: 'out', direction: 'out' }]),
      ],
      edges: [
        { id: 'ok', kind: 'objectFlow', sourceId: 'ao', targetId: 'bi' },
        { id: 'wrongSource', kind: 'objectFlow', sourceId: 'ai', targetId: 'bi' },
        { id: 'wrongTarget', kind: 'objectFlow', sourceId: 'ao', targetId: 'bo' },
      ],
    });
    const errors = validateActivity(repo, activity).filter(d => d.severity === 'error').map(d => d.elementId);
    expect(errors.sort()).toEqual(['wrongSource', 'wrongTarget']);
  });

  it('object flow types must be the same or a subtype of the target (isSameOrSubtype)', () => {
    const make = (sourceType: string, targetType: string) => repoWith({
      nodes: [
        node('a', 'action', { pins: [{ id: 'ao', name: 'out', direction: 'out', typeId: sourceType }] }),
        node('b', 'action', { pins: [{ id: 'bi', name: 'in', direction: 'in', typeId: targetType }] }),
      ],
      edges: [{ id: 'e', kind: 'objectFlow', sourceId: 'ao', targetId: 'bi' }],
    });
    const same = make('Vehicle', 'Vehicle');
    expect(codes(same.repo, same.activity, 'error')).toEqual([]);
    const sub = make('Car', 'Vehicle');
    expect(codes(sub.repo, sub.activity, 'error')).toEqual([]);
    const sup = make('Vehicle', 'Car');
    expect(codes(sup.repo, sup.activity, 'error')).toEqual(['OBJECT_FLOW_TYPE_MISMATCH']);
    const unrelated = make('Wheel', 'Vehicle');
    expect(codes(unrelated.repo, unrelated.activity, 'error')).toEqual(['OBJECT_FLOW_TYPE_MISMATCH']);
    const untyped = repoWith({
      nodes: [node('a', 'action', { pins: [{ id: 'ao', name: 'out', direction: 'out' }] }), node('o', 'objectNode', { typeId: 'Vehicle' })],
      edges: [{ id: 'e', kind: 'objectFlow', sourceId: 'ao', targetId: 'o' }],
    });
    expect(codes(untyped.repo, untyped.activity, 'error')).toEqual([]);
  });

  it('checkActivityEdge is the same rule the editor uses before offering a connection', () => {
    const { repo, activity } = repoWith({ nodes: [node('i', 'initial'), node('a', 'action'), node('f', 'activityFinal')] });
    expect(checkActivityEdge(repo, activity, { kind: 'controlFlow', sourceId: 'i', targetId: 'a' })).toBeUndefined();
    expect(checkActivityEdge(repo, activity, { kind: 'controlFlow', sourceId: 'f', targetId: 'a' })?.code).toBe('FINAL_NODE_HAS_OUTGOING');
    expect(checkActivityEdge(repo, activity, { kind: 'controlFlow', sourceId: 'a', targetId: 'i' })?.code).toBe('INITIAL_NODE_HAS_INCOMING');
    expect(checkActivityEdge(repo, activity, { kind: 'controlFlow', sourceId: 'a', targetId: 'a' })?.code).toBe('ACTIVITY_EDGE_SELF');
    expect(checkActivityEdge(repo, activity, { kind: 'controlFlow', sourceId: 'a', targetId: 'missing' })?.code).toBe('ACTIVITY_EDGE_ENDPOINT_MISSING');
  });

  it('reports a duplicate edge between the same two ends', () => {
    const { repo, activity } = repoWith({
      nodes: [node('a', 'action'), node('b', 'action')],
      edges: [flow('e1', 'a', 'b'), flow('e2', 'a', 'b')],
    });
    expect(codes(repo, activity, 'error')).toEqual(['DUPLICATE_ACTIVITY_EDGE']);
  });
});

describe('activity rules: behaviors, parameters, partitions', () => {
  it('a call-behavior action needs an existing Activity', () => {
    const missing = repoWith({ nodes: [node('a', 'action', { behaviorId: 'nope' })] });
    expect(codes(missing.repo, missing.activity, 'error')).toEqual(['MISSING_CALLED_BEHAVIOR']);

    const ok = repoWith({ nodes: [node('a', 'action', { behaviorId: 'other' })] }, repo => {
      repo.definitions.other = { id: 'other', kind: 'activity', name: 'Other', namespace: [], ownerId: 'model', parameters: [], nodes: [], edges: [], partitions: [] };
    });
    expect(codes(ok.repo, ok.activity, 'error')).toEqual([]);

    const notActivity = repoWith({ nodes: [node('a', 'action', { behaviorId: 'Vehicle' })] });
    expect(codes(notActivity.repo, notActivity.activity, 'error')).toEqual(['MISSING_CALLED_BEHAVIOR']);
  });

  it('only actions carry behaviors and pins; object nodes need a real type; parameter nodes need a bound parameter', () => {
    const { repo, activity } = repoWith({
      nodes: [
        node('i', 'initial', { pins: [{ id: 'x', name: 'x', direction: 'in' }] }),
        node('o', 'objectNode', { typeId: 'ghost' }),
        node('pn', 'activityParameterNode'),
      ],
    });
    expect(codes(repo, activity, 'error')).toEqual(['ACTIVITY_NODE_INVALID_FEATURE', 'MISSING_ACTIVITY_PARAMETER', 'MISSING_OBJECT_NODE_TYPE']);
  });

  it('a partition may represent a Block or a part of a Block; anything else is an error', () => {
    const withPart = (representsId: string) => repoWith({
      nodes: [node('a', 'action')],
      partitions: [{ id: 'lane', name: 'Driver', representsId, nodeIds: ['a'] }],
    }, repo => {
      repo.definitions.Vehicle = block('Vehicle', {
        properties: [
          { id: 'Vehicle.engine', name: 'engine', kind: 'part', typeId: 'Wheel', multiplicity: { lower: 1, upper: 1, ordered: false, unique: true } },
          { id: 'Vehicle.mass', name: 'mass', kind: 'value', typeId: 'Real', multiplicity: { lower: 1, upper: 1, ordered: false, unique: true } },
        ],
      });
    });
    for (const good of ['Vehicle', 'Vehicle.engine']) expect(codes(withPart(good).repo, withPart(good).activity, 'error')).toEqual([]);
    for (const bad of ['Real', 'Vehicle.mass', 'ghost']) {
      const { repo, activity } = withPart(bad);
      expect(codes(repo, activity, 'error')).toEqual(['MISSING_PARTITION_REPRESENTS']);
    }
  });

  it('a partition may only list nodes of its activity; a node in two lanes is a warning', () => {
    const { repo, activity } = repoWith({
      nodes: [node('a', 'action')],
      partitions: [
        { id: 'l1', name: 'One', nodeIds: ['a', 'ghost'] },
        { id: 'l2', name: 'Two', nodeIds: ['a'] },
      ],
    });
    expect(codes(repo, activity, 'error')).toEqual(['PARTITION_NODE_MISSING']);
    expect(codes(repo, activity, 'warning')).toContain('NODE_IN_MULTIPLE_PARTITIONS');
  });
});

describe('activity ids are global and can be relationship ends', () => {
  const build = () => repoWith({
    parameters: [{ id: 'p1', name: 'in', direction: 'in' }],
    nodes: [node('n1', 'action', { pins: [{ id: 'pin1', name: 'a', direction: 'in' }] })],
    edges: [],
    partitions: [{ id: 'lane1', name: 'Lane', nodeIds: ['n1'] }],
  });

  it('lists nested ids and finds elements', () => {
    const { repo, activity } = build();
    expect(activityNestedIds(activity).sort()).toEqual(['lane1', 'n1', 'p1', 'pin1']);
    expect(findActivityElement(repo, 'pin1')).toMatchObject({ elementKind: 'pin', nodeId: 'n1' });
    expect(findActivityElement(repo, 'lane1')?.elementKind).toBe('partition');
    expect(findActivityElement(repo, 'nothing')).toBeUndefined();
  });

  it('reports DUPLICATE_ELEMENT_ID when a nested id collides with another element', () => {
    for (const id of ['Vehicle', 'act']) {
      const { repo, activity } = build();
      repo.definitions.act = { ...activity, nodes: [...activity.nodes, node(id, 'initial')] };
      const report = validateSysmlRepository(repo);
      expect(report.diagnostics.filter(d => d.code === 'DUPLICATE_ELEMENT_ID' && d.elementId === id)).toHaveLength(1);
    }
    const { repo, activity } = build();
    repo.definitions.act = { ...activity, nodes: [...activity.nodes, node('pin1', 'initial')] };
    expect(validateSysmlRepository(repo).diagnostics.some(d => d.code === 'DUPLICATE_ELEMENT_ID' && d.elementId === 'pin1')).toBe(true);
  });

  it('«allocate» from an action or a swimlane to a Block resolves and validates', () => {
    const { repo } = build();
    repo.relationships.al1 = { id: 'al1', kind: 'allocation', sourceId: 'n1', targetId: 'Vehicle' };
    repo.relationships.al2 = { id: 'al2', kind: 'allocation', sourceId: 'lane1', targetId: 'Car' };
    const report = validateSysmlRepository(repo);
    expect(report.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    expect(findUnresolvedEndpoints(repo)).toEqual([]);
  });

  it('«satisfy» from an Activity and from an action to a Requirement is accepted', () => {
    const { repo } = build();
    repo.requirements.r1 = { id: 'r1', kind: 'requirement', name: 'R', namespace: [], ownerId: 'model', requirementId: 'R1', text: 't', status: 'draft', version: '1' };
    repo.relationships.s1 = { id: 's1', kind: 'satisfy', sourceId: 'act', targetId: 'r1' };
    repo.relationships.s2 = { id: 's2', kind: 'satisfy', sourceId: 'n1', targetId: 'r1' };
    expect(validateSysmlRepository(repo).diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  });

  it('a relationship to an unknown nested id is still an error', () => {
    const { repo } = build();
    repo.relationships.al = { id: 'al', kind: 'allocation', sourceId: 'nope', targetId: 'Vehicle' };
    expect(validateSysmlRepository(repo).diagnostics.some(d => d.code === 'MISSING_RELATIONSHIP_ENDPOINT')).toBe(true);
  });
});
