import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type BlockDefinition, type SysmlRepository } from '../engine/sysml/model';
import { OWNERSHIP_MATRIX } from '../engine/sysml/capabilities/ownershipPolicy';
import { computeImpactHash, createSysmlGatewayState, executeSysmlCommand, validateOwnershipMove, type SysmlGatewayState } from './sysmlCommandGateway';
import { resolveSysmlCreationOwner } from './sysmlDiagramCreationContext';
import { buildFeatureUpdateCommand } from './sysmlPropertyCommands';

const one = { lower: 1, upper: 1, ordered: false, unique: true };
const block = (id: string, name: string, ownerId = 'model', extra: Partial<BlockDefinition> = {}): BlockDefinition => ({
  id, name, kind: 'block', namespace: [], ownerId, isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [], ...extra,
});
const pkg = (id: string, name: string, ownerId = 'model') => ({ id, name, kind: 'package' as const, namespace: [], ownerId });
const run = (state: SysmlGatewayState, command: any) => {
  const result = executeSysmlCommand(state, command);
  return { result, state: result.committed ? { ...state, ...result } as SysmlGatewayState : state };
};

describe('F3.1 moveElements follows the ownership policy', () => {
  it('moves every metaclass the policy allows in a Package from package to package', () => {
    const repo = createEmptyRepository();
    repo.packages.a = pkg('a', 'A'); repo.packages.b = pkg('b', 'B');
    const samples: Record<string, () => void> = {
      Package: () => { repo.packages.x = pkg('x', 'X', 'a'); },
      Block: () => { repo.definitions.x = block('x', 'X', 'a'); },
      InterfaceBlock: () => { repo.definitions.x = { id: 'x', name: 'X', kind: 'interface', namespace: [], ownerId: 'a', features: [] } as any; },
      ConstraintBlock: () => { repo.definitions.x = { id: 'x', name: 'X', kind: 'constraintBlock', namespace: [], ownerId: 'a', parameters: [], expression: '' } as any; },
      ValueType: () => { repo.definitions.x = { id: 'x', name: 'X', kind: 'valueType', namespace: [], ownerId: 'a' } as any; },
      Enumeration: () => { repo.definitions.x = { id: 'x', name: 'X', kind: 'enumeration', namespace: [], ownerId: 'a', literals: [] } as any; },
      Signal: () => { repo.definitions.x = { id: 'x', name: 'X', kind: 'signal', namespace: [], ownerId: 'a' } as any; },
      Requirement: () => { repo.requirements.x = { id: 'x', name: 'X', kind: 'requirement', requirementId: 'R', text: '', status: 'draft', version: '1', namespace: [], ownerId: 'a' } as any; },
      VerificationCase: () => { repo.verificationCases.x = { id: 'x', name: 'X', kind: 'verificationCase', method: 'test', verifiesRequirementIds: [], namespace: [], ownerId: 'a' } as any; },
      UseCase: () => { repo.useCases.x = { id: 'x', name: 'X', kind: 'useCase', extensionPointIds: [], namespace: [], ownerId: 'a' } as any; },
      Diagram: () => { repo.diagrams.x = { id: 'x', name: 'X', kind: 'diagram', diagramKind: 'bdd', namespace: [], ownerId: 'a' } as any; },
    };
    const tested: string[] = [];
    for (const metaclass of OWNERSHIP_MATRIX.Package) {
      const make = samples[metaclass];
      if (!make) continue;
      for (const key of ['definitions', 'requirements', 'verificationCases', 'useCases', 'diagrams', 'packages'] as const) delete (repo[key] as any).x;
      make();
      const moved = run(createSysmlGatewayState(repo), { type: 'moveElements', elementIds: ['x'], targetOwnerId: 'b' });
      expect(moved.result.committed, `${metaclass}: ${JSON.stringify(moved.result.diagnostics)}`).toBe(true);
      tested.push(metaclass);
    }
    expect(tested).toEqual(expect.arrayContaining(['Package', 'Block', 'Enumeration', 'Requirement', 'Diagram']));
  });

  it('rejects what the policy forbids and keeps the cycle check; allows a diagram into a Block', () => {
    const repo = createEmptyRepository();
    repo.packages.a = pkg('a', 'A'); repo.packages.b = pkg('b', 'B', 'a');
    repo.definitions.blk = block('blk', 'Blk');
    repo.diagrams.d = { id: 'd', name: 'D', kind: 'diagram', diagramKind: 'ibd', namespace: [], ownerId: 'blk' } as any;
    repo.diagrams.bdd = { id: 'bdd', name: 'BDD', kind: 'diagram', diagramKind: 'bdd', namespace: [], ownerId: 'a' } as any;
    expect(validateOwnershipMove(repo, 'a', 'b')?.code).toBe('CIRCULAR_OWNERSHIP');
    expect(validateOwnershipMove(repo, 'blk', 'blk')?.code).toBe('CIRCULAR_OWNERSHIP');
    expect(validateOwnershipMove(repo, 'blk', 'blk2')?.code).toBe('DISALLOWED_OWNERSHIP');
    expect(validateOwnershipMove(repo, 'b', 'blk')?.code).toBe('DISALLOWED_OWNERSHIP');
    expect(validateOwnershipMove(repo, 'bdd', 'blk')).toBeNull();
    expect(validateOwnershipMove(repo, 'd', 'a')?.code).toBe('DISALLOWED_OWNERSHIP');
  });

  it('moves a use case, an actor and a subject', () => {
    const repo = createEmptyRepository();
    repo.packages.a = pkg('a', 'A'); repo.packages.b = pkg('b', 'B');
    repo.useCases.uc = { id: 'uc', name: 'UC', kind: 'useCase', extensionPointIds: [], namespace: [], ownerId: 'a' } as any;
    repo.actors.ac = { id: 'ac', name: 'Ac', kind: 'actor', isExternal: true, generalizationIds: [], namespace: [], ownerId: 'a' } as any;
    repo.subjects.sj = { id: 'sj', name: 'Sj', kind: 'subject', namespace: [], ownerId: 'a' } as any;
    const { result, state } = run(createSysmlGatewayState(repo), { type: 'moveElements', elementIds: ['uc', 'ac', 'sj'], targetOwnerId: 'b' });
    expect(result.committed, JSON.stringify(result.diagnostics)).toBe(true);
    expect(state.repository.useCases.uc.ownerId).toBe('b');
    expect(state.repository.actors.ac.ownerId).toBe('b');
    expect(state.repository.subjects.sj.ownerId).toBe('b');
    expect(state.store?.actors.get('ac')).toMatchObject({ ownerId: 'b' });
  });
});

describe('F3.2 namespace follows ownership', () => {
  it('moving B from A into C makes C::B resolve and A::B not', () => {
    const repo = createEmptyRepository();
    repo.packages.a = pkg('a', 'A'); repo.packages.c = pkg('c', 'C');
    repo.definitions.b = block('b', 'B', 'a', { namespace: ['A'] });
    repo.diagrams.d = { id: 'd', name: 'D', kind: 'diagram', diagramKind: 'ibd', namespace: ['A'], ownerId: 'b' } as any;
    const moved = run(createSysmlGatewayState(repo), { type: 'moveElements', elementIds: ['b'], targetOwnerId: 'c' });
    expect(moved.result.committed).toBe(true);
    expect(moved.state.repository.definitions.b.namespace).toEqual(['C']);
    expect(moved.state.repository.diagrams.d.namespace).toEqual(['C', 'B']);
    expect(moved.state.store?.definitions.get('b')).toMatchObject({ namespace: ['C'] });
    const qnames = Object.values(moved.state.repository.definitions).map(d => [...d.namespace, d.name].join('::'));
    expect(qnames).toContain('C::B');
    expect(qnames).not.toContain('A::B');
    const undone = run(moved.state, { type: 'undo' });
    expect(undone.state.repository.definitions.b.namespace).toEqual(['A']);
  });

  it('renaming a package re-derives the namespace of what it owns', () => {
    const repo = createEmptyRepository();
    repo.packages.a = pkg('a', 'A');
    repo.definitions.b = block('b', 'B', 'a', { namespace: ['A'] });
    const { result, state } = run(createSysmlGatewayState(repo), { type: 'updateElement', elementId: 'a', patch: { name: 'Z' } });
    expect(result.committed, JSON.stringify(result.diagnostics)).toBe(true);
    expect(state.repository.definitions.b.namespace).toEqual(['Z']);
    expect(state.store?.definitions.get('b')).toMatchObject({ namespace: ['Z'] });
  });
});

describe('F3.3 deleting a Block leaves no ghosts', () => {
  it('cascades its diagrams and clears dangling typeIds', () => {
    const repo = createEmptyRepository();
    repo.definitions.eng = block('eng', 'Eng');
    repo.definitions.veh = block('veh', 'Veh', 'model', { properties: [
      { id: 'veh-eng', name: 'eng', kind: 'part', typeId: 'eng', multiplicity: one },
      { id: 'veh-val', name: 'val', kind: 'value', typeId: 'eng', multiplicity: one },
    ] });
    repo.diagrams.ibd = { id: 'ibd', name: 'IBD', kind: 'diagram', diagramKind: 'ibd', namespace: [], ownerId: 'eng' } as any;
    repo.diagrams.ctx = { id: 'ctx', name: 'Ctx', kind: 'diagram', diagramKind: 'bdd', namespace: [], ownerId: 'model', contextElementId: 'eng' } as any;
    let state = createSysmlGatewayState(repo);
    state = { ...state, diagramPresentations: { ...state.diagramPresentations, ibd: { elementIds: ['eng'], presentations: {} }, ctx: { elementIds: ['eng'], presentations: {} } } };
    const preview = executeSysmlCommand(state, { type: 'deleteElements', elementIds: ['eng'] });
    expect(preview.impact?.deletedElementIds).toEqual(expect.arrayContaining(['eng', 'ibd', 'ctx']));
    const hash = computeImpactHash(preview.impact!);
    const { result, state: after } = run(state, { type: 'deleteElements', elementIds: ['eng'], confirmedImpactHash: hash });
    expect(result.committed, JSON.stringify(result.diagnostics)).toBe(true);
    expect(after.repository.diagrams.ibd).toBeUndefined();
    expect(after.repository.diagrams.ctx).toBeUndefined();
    expect(after.diagramPresentations?.ibd).toBeUndefined();
    const veh = after.repository.definitions.veh as BlockDefinition;
    expect(veh.properties.map(p => p.typeId)).toEqual(['', '']);
    expect((after.store?.definitions.get('veh') as BlockDefinition).properties[0].typeId).toBe('');
    const undone = run(after, { type: 'undo' });
    expect((undone.state.repository.definitions.veh as BlockDefinition).properties[0].typeId).toBe('eng');
    expect(undone.state.repository.diagrams.ibd).toBeDefined();
  });
});

describe('F3.4 createDiagram owner rules', () => {
  const repo = (): SysmlRepository => {
    const r = createEmptyRepository();
    r.packages.a = pkg('a', 'A');
    r.definitions.blk = block('blk', 'Blk');
    r.requirements.req = { id: 'req', name: 'Req', kind: 'requirement', requirementId: 'R', text: '', status: 'draft', version: '1', namespace: [], ownerId: 'a' } as any;
    return r;
  };
  const create = (diagramKind: string, ownerId: string) => executeSysmlCommand(createSysmlGatewayState(repo()), {
    type: 'createDiagram', diagram: { id: 'dx', kind: 'diagram', diagramKind, name: 'DX', namespace: [], ownerId } as any,
  });
  it('accepts legal owners', () => {
    for (const [kind, owner] of [['bdd', 'model'], ['bdd', 'a'], ['bdd', 'blk'], ['ibd', 'blk'], ['requirements', 'a'], ['requirements', 'req'], ['rtm', 'model']]) {
      const res = create(kind, owner);
      expect(res.committed, `${kind} in ${owner}: ${JSON.stringify(res.diagnostics)}`).toBe(true);
    }
  });
  it('rejects illegal owners', () => {
    for (const [kind, owner] of [['ibd', 'a'], ['ibd', 'model'], ['bdd', 'req'], ['requirements', 'blk'], ['rtm', 'blk']]) {
      const res = create(kind, owner);
      expect(res.committed, `${kind} in ${owner}`).toBe(false);
      expect(res.diagnostics.some(d => d.code === 'INVALID_DIAGRAM_OWNER')).toBe(true);
    }
  });
});

describe('F3.5 creation owner on a block-owned BDD', () => {
  it('resolves to the nearest owning package', () => {
    const r = createEmptyRepository();
    r.packages.a = pkg('a', 'A');
    r.definitions.blk = block('blk', 'Blk', 'a');
    r.diagrams.bdd1 = { id: 'bdd1', name: 'B', kind: 'diagram', diagramKind: 'bdd', namespace: [], ownerId: 'blk' } as any;
    expect(resolveSysmlCreationOwner(r, { diagramId: 'bdd1', diagramKind: 'bdd' })).toEqual({ ok: true, ownerId: 'a' });
  });
});

describe('F3.6 every Block property kind', () => {
  const setup = () => {
    const r = createEmptyRepository();
    r.definitions.vt = { id: 'vt', name: 'VT', kind: 'valueType', namespace: [], ownerId: 'model' } as any;
    r.definitions.vt2 = { id: 'vt2', name: 'VT2', kind: 'valueType', namespace: [], ownerId: 'model' } as any;
    r.definitions.ecu = block('ecu', 'ECU', 'model', { properties: [{ id: 'ecu::label', name: 'label', kind: 'value', typeId: 'vt', multiplicity: one }] });
    return createSysmlGatewayState(r);
  };
  it('renames and retypes a value property', () => {
    const state = setup();
    const { result, state: after } = run(state, { type: 'updateElement', elementId: 'ecu::label', patch: { name: 'tag', typeId: 'vt2' } });
    expect(result.committed, JSON.stringify(result.diagnostics)).toBe(true);
    expect((after.repository.definitions.ecu as BlockDefinition).properties[0]).toMatchObject({ name: 'tag', typeId: 'vt2', kind: 'value' });
  });
  it('does not turn a value property into a part', () => {
    const cmd = buildFeatureUpdateCommand(setup().repository, 'ecu::label', { kind: 'part', aggregation: 'composite' }) as any;
    expect(cmd.patch.properties[0].kind).toBe('value');
  });
  it('deletes a value property', () => {
    const state = setup();
    const { result, state: after } = run(state, { type: 'deleteElements', elementIds: ['ecu::label'] });
    expect(result.committed, JSON.stringify(result.diagnostics)).toBe(true);
    expect((after.repository.definitions.ecu as BlockDefinition).properties).toEqual([]);
  });
  it('renames an Activity Partition', () => {
    const r = createEmptyRepository();
    r.definitions.act = { id: 'act', name: 'Act', kind: 'activity', namespace: [], ownerId: 'model', nodes: [], edges: [], partitions: [{ id: 'lane', name: 'Lane', nodeIds: [] }], parameters: [] } as any;
    const { result, state } = run(createSysmlGatewayState(r), { type: 'updateElement', elementId: 'lane', patch: { name: 'Operator' } });
    expect(result.committed, JSON.stringify(result.diagnostics)).toBe(true);
    expect((state.repository.definitions.act as any).partitions[0].name).toBe('Operator');
  });
});
