import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type BlockDefinition } from './model';
import {
  compareBaselines,
  createBaseline,
  loadRepository,
  serializeRepository,
  serializeToChunks,
  serializeIncrementalChunks,
  hydrateRepositoryFromChunks,
  streamExportChunks,
  atomicWriteFile,
} from './persistence';

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
        { id: 'v', name: 'Safety test', stereotype: 'verificationCase', verificationMethod: 'Test' },
      ],
      parts: [{ id: 'p', name: 'controller', blockId: 'b', typeId: 'b', multiplicity: '1' }],
      relationships: [{ id: 's', sourceId: 'b', targetId: 'r', type: 'satisfy', label: '' }],
      connectors: [{ id: 'c', kind: 'delegation', sourcePartId: 'b', sourcePortId: 'boundary', targetPartId: 'p', targetPortId: 'inner', itemFlow: 'Power' }],
    };

    const loaded = loadRepository(legacy);
    expect(loaded.migrated).toBe(true);
    expect(loaded.repository.definitions.b.id).toBe('b');
    expect(loaded.repository.requirements.r).toMatchObject({ requirementId: 'REQ-1', text: 'Safe', source: 'Customer', priority: 'high', risk: 'critical' });
    expect(loaded.repository.usages.p.id).toBe('p');
    expect(loaded.repository.relationships.s.kind).toBe('satisfy');
    expect(loaded.repository.verificationCases.v.method).toBe('Test');
    expect(loaded.repository.connectors.c).toMatchObject({ kind: 'delegation', itemFlowId: 'Power' });
    expect(loaded.repository.connectors.c.sourcePortId).toBe('b::boundary');
  });

  it('migrates legacy block and part satisfiedReqIds into satisfy relationships', () => {
    const legacy = {
      blocks: [
        { id: 'b1', name: 'PowerController', stereotype: 'block', satisfiedReqIds: ['req1'] },
        { id: 'req1', name: 'SafetyReq', stereotype: 'requirement', reqId: 'REQ-SAFE-1' },
      ],
      parts: [
        { id: 'part1', name: 'subController', blockId: 'b1', satisfiedReqIds: ['req1'] },
      ],
      relationships: [],
    };

    const loaded = loadRepository(legacy);
    const rels = Object.values(loaded.repository.relationships);
    const blockSatisfy = rels.find(r => r.sourceId === 'b1' && r.targetId === 'req1');
    const partSatisfy = rels.find(r => r.sourceId === 'part1' && r.targetId === 'req1');
    expect(blockSatisfy).toBeDefined();
    expect(blockSatisfy?.kind).toBe('satisfy');
    expect(partSatisfy).toBeDefined();
    expect(partSatisfy?.kind).toBe('satisfy');
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

  it('serializes and round-trips requirementContainment relationship deterministically', () => {
    const repo = createEmptyRepository();
    repo.requirements.parent = { id: 'parent', kind: 'requirement', name: 'Parent Req', namespace: [], requirementId: 'REQ-P', text: 'Parent text', status: 'approved', version: '1' };
    repo.requirements.child = { id: 'child', kind: 'requirement', name: 'Child Req', namespace: [], requirementId: 'REQ-C', text: 'Child text', status: 'approved', version: '1' };
    repo.relationships.rel1 = { id: 'rel1', kind: 'requirementContainment' as any, sourceId: 'parent', targetId: 'child' };

    const serialized = serializeRepository(repo);
    const loaded = loadRepository(serialized);
    expect(loaded.valid).toBe(true);
    expect(loaded.repository.relationships.rel1).toMatchObject({
      id: 'rel1',
      kind: 'requirementContainment',
      sourceId: 'parent',
      targetId: 'child',
    });
  });

  it('migrates legacy composition between requirements to requirementContainment with diagnostic', () => {
    const legacy = {
      blocks: [
        { id: 'reqParent', name: 'Parent', stereotype: 'requirement', reqId: 'REQ-P', description: 'Parent Req' },
        { id: 'reqChild', name: 'Child', stereotype: 'requirement', reqId: 'REQ-C', description: 'Child Req' },
        { id: 'blockSys', name: 'System', stereotype: 'block' },
      ],
      parts: [{ id: 'part1', name: 'p1', blockId: 'blockSys', typeId: 'blockSys' }],
      relationships: [
        { id: 'r1', sourceId: 'reqParent', targetId: 'reqChild', type: 'composition', label: '' },
        { id: 'r2', sourceId: 'blockSys', targetId: 'part1', type: 'composition', label: '' },
      ],
    };

    const loaded = loadRepository(legacy);
    expect(loaded.migrated).toBe(true);
    // Requirement composition converted to requirementContainment
    expect(loaded.repository.relationships.r1.kind).toBe('requirementContainment');
    // Block-part composition preserved
    expect(loaded.repository.relationships.r2.kind).toBe('composition');
    expect(loaded.diagnostics.some(d => d.code === 'LEGACY_REQUIREMENT_COMPOSITION_MIGRATED')).toBe(true);
  });

  describe('chunked and incremental persistence', () => {
    it('serializes to chunks with manifest and rehydrates round-trip cleanly', () => {
      const repo = createEmptyRepository();
      repo.definitions.b1 = block('b1');
      repo.definitions.b2 = block('b2');
      repo.requirements.req1 = {
        id: 'req1',
        kind: 'requirement',
        name: 'Req 1',
        namespace: [],
        requirementId: 'REQ-001',
        text: 'System shall be scalable',
        status: 'approved',
        version: '1',
      };
      repo.relationships.r1 = {
        id: 'r1',
        kind: 'satisfy',
        sourceId: 'b1',
        targetId: 'req1',
      };

      const chunked = serializeToChunks(repo);
      expect(chunked.manifest.format).toBe('ADIA-SysML-Chunked');
      expect(chunked.manifest.schemaVersion).toBe(2);
      expect(Object.keys(chunked.chunks).length).toBe(4);

      const rehydrated = hydrateRepositoryFromChunks(chunked.manifest, key => chunked.chunks[key]?.json);
      expect(rehydrated.valid).toBe(true);
      expect(rehydrated.diagnostics).toEqual([]);
      expect(rehydrated.repository.definitions.b1).toEqual(repo.definitions.b1);
      expect(rehydrated.repository.requirements.req1).toEqual(repo.requirements.req1);
      expect(rehydrated.repository.relationships.r1).toEqual(repo.relationships.r1);
    });

    it('incrementally persists only modified chunks and tracks deleted keys', () => {
      const repo = createEmptyRepository();
      repo.definitions.b1 = block('b1');
      repo.definitions.b2 = block('b2');
      const base = serializeToChunks(repo);

      // Modify b1 and delete b2
      repo.definitions.b1 = { ...repo.definitions.b1, name: 'Renamed B1' };
      delete repo.definitions.b2;

      const incremental = serializeIncrementalChunks(repo, ['b1', 'b2'], base.manifest);
      expect(Object.keys(incremental.updatedChunks)).toContain('definitions/b1.json');
      expect(incremental.removedChunkKeys).toContain('definitions/b2.json');
      expect(incremental.manifest.revision).toBe(base.manifest.revision + 1);
      expect(incremental.manifest.chunkIndex['definitions/b1.json']).toBeDefined();
      expect(incremental.manifest.chunkIndex['definitions/b2.json']).toBeUndefined();
    });

    it('detects chunk tampering and checksum mismatch during hydration', () => {
      const repo = createEmptyRepository();
      repo.definitions.b1 = block('b1');
      const chunked = serializeToChunks(repo);

      // Tamper with chunk payload
      const tamperedJson = chunked.chunks['definitions/b1.json'].json.replace('"name":"b1"', '"name":"hacked"');

      const rehydrated = hydrateRepositoryFromChunks(chunked.manifest, key => {
        if (key === 'definitions/b1.json') return tamperedJson;
        return chunked.chunks[key]?.json;
      });

      expect(rehydrated.valid).toBe(false);
      expect(rehydrated.diagnostics.some(d => d.code === 'PERSISTENCE_CHUNK_CHECKSUM_MISMATCH')).toBe(true);
    });

    it('streams export chunks incrementally without large intermediate array buffers', async () => {
      const repo = createEmptyRepository();
      repo.definitions.b1 = block('b1');
      repo.definitions.b2 = block('b2');

      const streamedKeys: string[] = [];
      const { manifest, totalBytes } = await streamExportChunks(repo, chunk => {
        streamedKeys.push(chunk.chunkKey);
      });

      expect(streamedKeys).toContain('definitions/b1.json');
      expect(streamedKeys).toContain('definitions/b2.json');
      expect(totalBytes).toBeGreaterThan(0);
      expect(manifest.chunkIndex['definitions/b1.json']).toBeDefined();
    });

    it('performs atomic writes using temporary swap files', async () => {
      const written: Record<string, string> = {};
      const renames: Array<{ from: string; to: string }> = [];

      const mockAdapter = {
        writeFile: async (p: string, c: string) => { written[p] = c; },
        renameFile: async (from: string, to: string) => { renames.push({ from, to }); },
      };

      await atomicWriteFile('model/project.json', '{"test":true}', mockAdapter);
      expect(renames.length).toBe(1);
      expect(renames[0].to).toBe('model/project.json');
      expect(renames[0].from).toContain('.tmp');
    });
  });
});
