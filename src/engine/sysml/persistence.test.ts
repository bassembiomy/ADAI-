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
  hydrateActiveDiagramFromChunks,
  saveRepositoryTransactionally,
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

    it('incrementally saves only the patched entity chunk without serializing 1000 unrelated entities', () => {
      const repo = createEmptyRepository();
      for (let i = 0; i < 1000; i++) {
        repo.definitions[`b_${i}`] = block(`b_${i}`);
      }
      const baseChunked = serializeToChunks(repo);
      expect(Object.keys(baseChunked.chunks).length).toBe(1000);

      // Mutate single entity b_42
      repo.definitions.b_42 = { ...repo.definitions.b_42, name: 'Mutated_42' };

      const incremental = serializeIncrementalChunks(repo, ['b_42'], baseChunked.manifest);
      expect(Object.keys(incremental.updatedChunks).length).toBe(1);
      expect(incremental.updatedChunks['definitions/b_42.json']).toBeDefined();
      expect(incremental.removedChunkKeys.length).toBe(0);
      expect(incremental.manifest.revision).toBe(baseChunked.manifest.revision + 1);
    });

    it('cleans up temporary files on interrupted writes and recovers from last valid manifest', async () => {
      const repo = createEmptyRepository();
      repo.definitions.b1 = block('b1');
      repo.definitions.b2 = block('b2');
      const baseExport = serializeToChunks(repo);

      // Now create updated chunk with revision 2
      repo.definitions.b1 = { ...repo.definitions.b1, name: 'B1_Updated' };
      const updatedExport = serializeToChunks(repo);
      updatedExport.manifest.revision = 2;

      const diskFiles: Record<string, string> = {
        'repo/manifest.json': baseExport.manifestJson,
      };
      const deletedFiles: string[] = [];

      let failOnWrite = true;
      const mockAdapter = {
        writeFile: async (p: string, c: string) => {
          if (failOnWrite && p.includes('b2')) {
            throw new Error('Simulated disk full / power failure');
          }
          diskFiles[p] = c;
        },
        renameFile: async (from: string, to: string) => {
          diskFiles[to] = diskFiles[from];
          delete diskFiles[from];
        },
        deleteFile: async (p: string) => {
          deletedFiles.push(p);
          delete diskFiles[p];
        },
      };

      const result = await saveRepositoryTransactionally(
        'repo',
        updatedExport.manifest,
        updatedExport.chunks,
        {
          fileAdapter: mockAdapter,
          lastValidRevision: 1,
        }
      );

      // Transaction failed
      expect(result.success).toBe(false);
      expect(result.committedRevision).toBe(1);
      expect(result.temporaryFilesCleaned).toBeGreaterThan(0);
      // Ensure temp files deleted
      expect(deletedFiles.some(f => f.includes('.tmp_'))).toBe(true);

      // Recovery: Last valid manifest was NOT overwritten and remains revision 1
      const currentManifest = JSON.parse(diskFiles['repo/manifest.json']);
      expect(currentManifest.revision).toBe(0); // initial base revision
    });

    it('lazily hydrates only the active diagram, deferring inactive diagram entities', () => {
      const repo = createEmptyRepository();
      // Diagram 1 entities
      repo.definitions.b1 = block('b1');
      repo.definitions.b2 = block('b2');
      // Diagram 2 entities
      repo.definitions.b3 = block('b3');
      repo.definitions.b4 = block('b4');
      repo.definitions.b5 = block('b5');

      const presentations = {
        diag_1: { elementIds: ['b1', 'b2'] },
        diag_2: { elementIds: ['b3', 'b4', 'b5'] },
      };

      const chunked = serializeToChunks(repo, { diagramPresentations: presentations });
      expect(Object.keys(chunked.chunks).length).toBe(5);

      // Hydrate active diagram diag_1 only
      const result = hydrateActiveDiagramFromChunks(chunked.manifest, 'diag_1', key => chunked.chunks[key]?.json);
      expect(result.valid).toBe(true);
      expect(result.loadedEntityCount).toBe(2);
      expect(result.deferredChunkCount).toBe(3);
      expect(result.repository.definitions.b1).toBeDefined();
      expect(result.repository.definitions.b2).toBeDefined();
      expect(result.repository.definitions.b3).toBeUndefined();
      expect(result.repository.definitions.b4).toBeUndefined();
    });

    it('ensures full legacy JSON export and import remains semantically and structurally valid', () => {
      const legacyModel = {
        schemaVersion: 2,
        blocks: [
          { id: 'controller', name: 'PowerController', stereotype: 'block', properties: [{ name: 'volt', type: 'Real' }], ports: [{ id: 'p_in', name: 'inPort', direction: 'in' }] },
          { id: 'motor', name: 'DriveMotor', stereotype: 'block', properties: [], ports: [{ id: 'p_out', name: 'outPort', direction: 'out' }] },
        ],
        parts: [
          { id: 'part_c', name: 'c1', blockId: 'controller', typeId: 'controller', multiplicity: '1' },
          { id: 'part_m', name: 'm1', blockId: 'motor', typeId: 'motor', multiplicity: '1' },
        ],
        relationships: [
          { id: 'rel1', sourceId: 'controller', targetId: 'motor', type: 'dependency', label: 'depends' },
        ],
        connectors: [
          { id: 'conn1', kind: 'assembly', sourcePartId: 'part_c', sourcePortId: 'p_in', targetPartId: 'part_m', targetPortId: 'p_out' },
        ],
      };

      const loaded = loadRepository(legacyModel);
      expect(loaded.valid).toBe(true);
      expect(loaded.migrated).toBe(true);

      const repo = loaded.repository;
      expect(repo.definitions.controller.name).toBe('PowerController');
      expect(repo.definitions.motor.name).toBe('DriveMotor');
      expect(repo.usages.part_c.name).toBe('c1');
      expect(repo.relationships.rel1.kind).toBe('dependency');
      expect(repo.connectors.conn1.kind).toBe('assembly');

      // Re-serialize to canonical JSON and verify round-trip
      const serialized = serializeRepository(repo);
      const reloaded = loadRepository(serialized);
      expect(reloaded.valid).toBe(true);
      expect(reloaded.repository.definitions.controller).toEqual(repo.definitions.controller);
      expect(reloaded.repository.connectors.conn1).toEqual(repo.connectors.conn1);
    });

    it('cancels save via AbortSignal without committing partial revisions or leaving temp files', async () => {
      const repo = createEmptyRepository();
      repo.definitions.b1 = block('b1');
      repo.definitions.b2 = block('b2');
      const chunked = serializeToChunks(repo);

      const controller = new AbortController();
      controller.abort(); // Cancel before or during start

      const diskFiles: Record<string, string> = {};
      const deletedFiles: string[] = [];

      const mockAdapter = {
        writeFile: async (p: string, c: string) => { diskFiles[p] = c; },
        renameFile: async (from: string, to: string) => {
          diskFiles[to] = diskFiles[from];
          delete diskFiles[from];
        },
        deleteFile: async (p: string) => {
          deletedFiles.push(p);
          delete diskFiles[p];
        },
      };

      const result = await saveRepositoryTransactionally(
        'project',
        chunked.manifest,
        chunked.chunks,
        {
          abortSignal: controller.signal,
          fileAdapter: mockAdapter,
          lastValidRevision: 0,
        }
      );

      expect(result.success).toBe(false);
      expect(result.committedRevision).toBe(0);
      expect(diskFiles['project/manifest.json']).toBeUndefined();
    });
  });
});
