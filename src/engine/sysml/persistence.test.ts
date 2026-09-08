import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type BlockDefinition } from './model';
import { compareBaselines, createBaseline, loadRepository, serializeRepository } from './persistence';

const block = (id: string): BlockDefinition => ({
  id, name: id, namespace: [], kind: 'block', isAbstract: false, isLeaf: false,
  properties: [], ports: [], operations: [], constraints: [],
});

describe('versioned SysML persistence and baselines', () => {
  it('serializes deterministically and round-trips all canonical records', () => {
    const repo = createEmptyRepository();
    repo.definitions.z = block('z');
    repo.definitions.a = block('a');
    repo.artifacts.code = { id: 'code', name: 'a.c', kind: 'source', revision: 0, uri: 'src/a.c' };

    const first = serializeRepository(repo);
    const second = serializeRepository(repo);
    const loaded = loadRepository(first);

    expect(first).toBe(second);
    expect(loaded.diagnostics).toEqual([]);
    expect(loaded.repository).toEqual(repo);
  });

  it('detects envelope tampering and fails closed', () => {
    const serialized = serializeRepository(createEmptyRepository());
    const tampered = serialized.replace('"revision":0', '"revision":99');
    const loaded = loadRepository(tampered);

    expect(loaded.diagnostics.map(d => d.code)).toContain('PERSISTENCE_CHECKSUM_MISMATCH');
    expect(loaded.valid).toBe(false);
  });

  it('migrates legacy BDD/IBD/requirement records without losing IDs and metadata', () => {
    const legacy = {
      blocks: [
        { id: 'b', name: 'Controller', stereotype: 'block', properties: [], ports: [] },
        { id: 'r', name: 'Safety', stereotype: 'requirement', reqId: 'REQ-1', description: 'Safe', status: 'Approved', source: 'Customer', priority: 'High', risk: 'Critical' },
      ],
      parts: [{ id: 'p', name: 'controller', blockId: 'b', typeId: 'b', multiplicity: '1' }],
      relationships: [{ id: 's', sourceId: 'b', targetId: 'r', type: 'satisfy', label: '' }],
      connectors: [],
    };

    const loaded = loadRepository(legacy);
    expect(loaded.migrated).toBe(true);
    expect(loaded.repository.definitions.b.id).toBe('b');
    expect(loaded.repository.requirements.r).toMatchObject({ requirementId: 'REQ-1', text: 'Safe', source: 'Customer', priority: 'high', risk: 'critical' });
    expect(loaded.repository.usages.p.id).toBe('p');
    expect(loaded.repository.relationships.s.kind).toBe('satisfy');
  });

  it('creates protected immutable baselines, records audit, and compares revisions', () => {
    let repo = createEmptyRepository();
    repo.definitions.a = block('a');
    const first = createBaseline(repo, { id: 'bl1', name: 'Baseline 1', createdAt: '2026-09-08T00:00:00Z' });
    repo = first.repository;
    repo.definitions.a = { ...(repo.definitions.a as BlockDefinition), name: 'changed' };
    repo.definitions.b = block('b');
    const second = createBaseline(repo, { id: 'bl2', name: 'Baseline 2', createdAt: '2026-09-08T01:00:00Z' });

    expect(first.baseline.protected).toBe(true);
    expect(first.repository.auditTrail.at(-1)?.command).toBe('createBaseline');
    expect(() => { (first.baseline.elementHashes as Record<string, string>).a = 'tampered'; }).toThrow();
    expect(compareBaselines(second.repository, 'bl1', 'bl2')).toEqual({ added: ['b'], removed: [], changed: ['a'] });
  });

  it('rejects edits requested against a protected baseline snapshot', () => {
    const result = createBaseline(createEmptyRepository(), { id: 'locked', name: 'Locked', createdAt: '2026-09-08T00:00:00Z' });
    const loaded = loadRepository(serializeRepository(result.repository));
    expect(loaded.repository.baselines.locked.protected).toBe(true);
    expect(Object.isFrozen(loaded.repository.baselines.locked)).toBe(true);
  });
});
