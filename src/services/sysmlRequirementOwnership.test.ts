import { describe, expect, it } from 'vitest';
import { computeImpactHash, createSysmlGatewayState, executeSysmlCommand, type SysmlGatewayState } from './sysmlCommandGateway';
import { createEmptyRepository, type RequirementDefinition, type SysmlRepository } from '../engine/sysml/model';
import { createBaseline, loadRepository, serializeRepository } from '../engine/sysml/persistence';
import { hash, stableStringify } from '../engine/sysml/requirements';
import { alignRequirementOwnership } from '../engine/sysml/services/requirementOwnership';
import { validateSysmlRepository } from '../engine/sysml/validation';

const req = (id: string, ownerId = 'model'): RequirementDefinition => ({
  id, kind: 'requirement', name: id, namespace: [], ownerId, requirementId: id.toUpperCase(),
  text: `${id} text`, status: 'draft', version: '1', owner: 'alice',
});

function model(): SysmlGatewayState {
  const repo = createEmptyRepository();
  repo.packages.pkg = { id: 'pkg', kind: 'package', name: 'Pkg', namespace: [], ownerId: 'model' };
  for (const id of ['parent', 'child', 'other']) repo.requirements[id] = req(id, 'pkg');
  return createSysmlGatewayState(repo);
}
const ownerOf = (r: { repository: SysmlRepository }, id: string) => r.repository.requirements[id].ownerId;
const lines = (repo: SysmlRepository) => Object.values(repo.relationships).filter(r => r.kind === 'requirementContainment');

describe('requirement nesting is ownership (D3)', () => {
  it('a new containment line makes the child owned by the parent, in one undo step', () => {
    const state = model();
    const created = executeSysmlCommand(state, {
      type: 'createElement', element: { id: 'c1', kind: 'requirementContainment', sourceId: 'parent', targetId: 'child' },
    });
    expect(created.committed).toBe(true);
    expect(ownerOf(created, 'child')).toBe('parent');
    expect(created.repository.relationships.c1).toBeDefined();
    expect(created.repository.requirements.child.owner).toBe('alice'); // the person, untouched

    const undone = executeSysmlCommand(created, { type: 'undo' });
    expect(undone.repository.relationships.c1).toBeUndefined();
    expect(ownerOf(undone, 'child')).toBe('pkg');
  });

  it('deleting the line returns the child to the parent\'s owner', () => {
    const state = model();
    const created = executeSysmlCommand(state, {
      type: 'createElement', element: { id: 'c1', kind: 'requirementContainment', sourceId: 'parent', targetId: 'child' },
    });
    const proposed = executeSysmlCommand(created, { type: 'deleteElements', elementIds: ['c1'] });
    const deleted = proposed.committed ? proposed : executeSysmlCommand(created, {
      type: 'deleteElements', elementIds: ['c1'],
      confirmedImpactHash: computeImpactHash(proposed.impact!),
    });
    expect(deleted.committed).toBe(true);
    expect(deleted.repository.relationships.c1).toBeUndefined();
    expect(ownerOf(deleted, 'child')).toBe('pkg');
    expect(lines(deleted.repository)).toHaveLength(0);
  });

  it('moving a requirement into another adds its line; moving it out removes the line', () => {
    const state = model();
    const into = executeSysmlCommand(state, { type: 'moveElements', elementIds: ['child'], targetOwnerId: 'parent' });
    expect(into.committed).toBe(true);
    expect(ownerOf(into, 'child')).toBe('parent');
    expect(lines(into.repository).map(r => [r.sourceId, r.targetId])).toEqual([['parent', 'child']]);

    const out = executeSysmlCommand(into, { type: 'moveElements', elementIds: ['child'], targetOwnerId: 'pkg' });
    expect(out.committed).toBe(true);
    expect(ownerOf(out, 'child')).toBe('pkg');
    expect(lines(out.repository)).toHaveLength(0);
  });

  it('moving between requirements swaps the line to the new parent', () => {
    let state = model();
    state = { ...state, ...executeSysmlCommand(state, { type: 'moveElements', elementIds: ['child'], targetOwnerId: 'parent' }) };
    const moved = executeSysmlCommand(state, { type: 'moveElements', elementIds: ['child'], targetOwnerId: 'other' });
    expect(moved.committed).toBe(true);
    expect(lines(moved.repository).map(r => [r.sourceId, r.targetId])).toEqual([['other', 'child']]);
    expect(validateSysmlRepository(moved.repository).diagnostics.map(d => d.code)).not.toContain('MULTIPLE_REQUIREMENT_CONTAINERS');
  });

  it('refuses a cycle atomically and leaves the model untouched', () => {
    let state = model();
    state = { ...state, ...executeSysmlCommand(state, { type: 'moveElements', elementIds: ['child'], targetOwnerId: 'parent' }) };
    const cyc = executeSysmlCommand(state, { type: 'moveElements', elementIds: ['parent'], targetOwnerId: 'child' });
    expect(cyc.committed).toBe(false);
    expect(ownerOf(state as { repository: SysmlRepository }, 'parent')).toBe('pkg');
    expect(lines(state.repository)).toHaveLength(1);
  });
});

describe('migrations carry baselines instead of marking everything modified', () => {
  it('keeps a baseline matching after requirement ownership and supertypes are migrated', () => {
    const repo = createEmptyRepository();
    repo.requirements.a = req('a');
    repo.requirements.b = req('b');
    repo.relationships.legacy = { id: 'legacy', kind: 'requirementContainment', sourceId: 'a', targetId: 'b' };
    repo.definitions.base = { id: 'base', kind: 'block', name: 'Base', namespace: [], ownerId: 'model', isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [] };
    repo.definitions.sub = { ...(repo.definitions.base as object), id: 'sub', name: 'Sub', supertypeIds: ['base'] } as never;
    const { repository: withBaseline } = createBaseline(repo, { id: 'bl', name: 'BL', createdAt: '2026-01-01T00:00:00.000Z' });

    const loaded = loadRepository(serializeRepository(withBaseline)).repository;
    const hashes = loaded.baselines.bl.elementHashes!;
    const current = (id: string, value: unknown) => hash(stableStringify(value));
    expect(hashes.b).toBe(current('b', loaded.requirements.b));
    expect(hashes.sub).toBe(current('sub', loaded.definitions.sub));
    // The relationship created from the already-baselined Block is recorded too.
    const generalization = Object.values(loaded.relationships).find(r => r.kind === 'generalization')!;
    expect(hashes[generalization.id]).toBe(current(generalization.id, generalization));
    // An untouched element keeps its original hash, and the baseline stays protected.
    expect(hashes.a).toBe(withBaseline.baselines.bl.elementHashes!.a);
    expect(loaded.baselines.bl.protected).toBe(true);
    expect(loaded.baselines.bl.contentHash).toBe(hash(stableStringify(hashes)));
    // Re-saving and reloading changes nothing further.
    const again = loadRepository(serializeRepository(loaded)).repository;
    expect(again.baselines.bl.elementHashes).toEqual(hashes);
  });
});

describe('loading aligns ownership with containment lines', () => {
  it('adopts a legacy containment line as ownership, and creates a line for owned requirements', () => {
    const repo = createEmptyRepository();
    repo.requirements.a = req('a');
    repo.requirements.b = req('b');
    repo.requirements.c = req('c', 'a'); // owned by a, no line yet
    repo.relationships.legacy = { id: 'legacy', kind: 'requirementContainment', sourceId: 'a', targetId: 'b' };
    const loaded = loadRepository(serializeRepository(repo));
    expect(loaded.repository.requirements.b.ownerId).toBe('a');
    expect(lines(loaded.repository).map(r => `${r.sourceId}>${r.targetId}`).sort()).toEqual(['a>b', 'a>c']);
    expect(loaded.diagnostics.map(d => d.code)).toContain('REQUIREMENT_OWNERSHIP_ALIGNED');
    // Idempotent
    const again = loadRepository(serializeRepository(loaded.repository));
    expect(again.diagnostics.map(d => d.code)).not.toContain('REQUIREMENT_OWNERSHIP_ALIGNED');
  });

  it('leaves a second parent and a cycle for validation instead of deleting anything', () => {
    const repo = createEmptyRepository();
    for (const id of ['a', 'b', 'x']) repo.requirements[id] = req(id);
    repo.relationships.r1 = { id: 'r1', kind: 'requirementContainment', sourceId: 'a', targetId: 'x' };
    repo.relationships.r2 = { id: 'r2', kind: 'requirementContainment', sourceId: 'b', targetId: 'x' };
    alignRequirementOwnership(repo);
    expect(repo.requirements.x.ownerId).toBe('a');
    expect(Object.keys(repo.relationships)).toEqual(expect.arrayContaining(['r1', 'r2']));
    expect(validateSysmlRepository(repo).diagnostics.map(d => d.code)).toContain('MULTIPLE_REQUIREMENT_CONTAINERS');
  });
});
