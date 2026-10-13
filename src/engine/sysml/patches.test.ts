import { describe, it, expect } from 'vitest';
import {
  applyPatch,
  createSysmlPatch,
  invertPatch,
  createPatchHistory,
  pushPatch,
  undoPatch,
  redoPatch,
  createCheckpoint,
  replayFromCheckpoint,
  estimatePatchBytes,
  type SysmlPatch,
  type PatchOperation,
} from './patches';
import { applyCommand } from './mutations';
import { createEmptyNormalizedStore, upsertEntity, getById, toRepository, fromRepository } from './normalizedStore';
import { generate1kModel } from './largeModelGenerator';
import { createEmptyRepository, type BlockDefinition, type PartUsage, type SysmlRelationship } from './model';

describe('Sysml Patches and Inverse Patch History', () => {
  it('applies add, replace, remove, and batch operations correctly', () => {
    const store = createEmptyNormalizedStore();

    const block: BlockDefinition = {
      id: 'blk_1',
      name: 'InitialBlock',
      namespace: ['System'],
      kind: 'block',
      isAbstract: false,
      isLeaf: false,
      properties: [],
      ports: [],
      operations: [],
      constraints: [],
    };

    // 1. ADD
    const addOp: PatchOperation = {
      op: 'add',
      collection: 'definitions',
      id: 'blk_1',
      value: block,
    };
    applyPatch(store, [addOp]);
    expect(getById(store, 'blk_1')).toBeDefined();
    expect((getById(store, 'blk_1') as BlockDefinition).name).toBe('InitialBlock');

    // 2. REPLACE
    const replaceOp: PatchOperation = {
      op: 'replace',
      collection: 'definitions',
      id: 'blk_1',
      path: ['name'],
      oldValue: 'InitialBlock',
      value: 'RenamedBlock',
    };
    applyPatch(store, [replaceOp]);
    expect((getById(store, 'blk_1') as BlockDefinition).name).toBe('RenamedBlock');

    // 3. REMOVE
    const removeOp: PatchOperation = {
      op: 'remove',
      collection: 'definitions',
      id: 'blk_1',
      oldValue: getById(store, 'blk_1'),
    };
    applyPatch(store, [removeOp]);
    expect(getById(store, 'blk_1')).toBeUndefined();
  });

  it('inverts patches and restores original state cleanly', () => {
    const store = createEmptyNormalizedStore();
    const block: BlockDefinition = {
      id: 'blk_test',
      name: 'Original',
      namespace: ['System'],
      kind: 'block',
      isAbstract: false,
      isLeaf: false,
      properties: [],
      ports: [],
      operations: [],
      constraints: [],
    };
    upsertEntity(store, 'definitions', block);

    const patch = createSysmlPatch({
      revision: 1,
      forward: [{
        op: 'replace',
        collection: 'definitions',
        id: 'blk_test',
        path: ['name'],
        oldValue: 'Original',
        value: 'Modified',
      }],
      inverse: [{
        op: 'replace',
        collection: 'definitions',
        id: 'blk_test',
        path: ['name'],
        oldValue: 'Modified',
        value: 'Original',
      }],
    });

    applyPatch(store, patch.forward);
    expect((getById(store, 'blk_test') as BlockDefinition).name).toBe('Modified');

    applyPatch(store, patch.inverse);
    expect((getById(store, 'blk_test') as BlockDefinition).name).toBe('Original');
  });

  it('manages bounded history and respects maxEntries and maxBytes budgets', () => {
    const history = createPatchHistory({
      maxEntries: 5,
      maxBytes: 2000,
    });

    for (let i = 1; i <= 10; i++) {
      const patch = createSysmlPatch({
        revision: i,
        forward: [{
          op: 'replace',
          collection: 'definitions',
          id: 'blk_1',
          path: ['name'],
          oldValue: `Name_${i - 1}`,
          value: `Name_${i}`,
        }],
        inverse: [{
          op: 'replace',
          collection: 'definitions',
          id: 'blk_1',
          path: ['name'],
          oldValue: `Name_${i}`,
          value: `Name_${i - 1}`,
        }],
      });
      pushPatch(history, patch);
    }

    // Should be capped at maxEntries: 5
    expect(history.past.length).toBeLessThanOrEqual(5);
    expect(history.past[history.past.length - 1].revision).toBe(10);
    expect(history.totalBytes).toBeLessThanOrEqual(2000);
  });

  it('coalesces rapid pointer-move updates sharing a coalesceKey', () => {
    const store = createEmptyNormalizedStore();
    const history = createPatchHistory();

    store.coordinates.set('blk_1', { x: 0, y: 0 });

    // Simulate 5 drag events with the same coalesceKey
    for (let i = 1; i <= 5; i++) {
      const patch = createSysmlPatch({
        revision: i,
        coalesceKey: 'drag_blk_1',
        forward: [{
          op: 'replace',
          collection: 'coordinates',
          id: 'blk_1',
          oldValue: { x: (i - 1) * 10, y: (i - 1) * 10 },
          value: { x: i * 10, y: i * 10 },
        }],
        inverse: [{
          op: 'replace',
          collection: 'coordinates',
          id: 'blk_1',
          oldValue: { x: i * 10, y: i * 10 },
          value: { x: (i - 1) * 10, y: (i - 1) * 10 },
        }],
      });
      applyPatch(store, patch.forward);
      pushPatch(history, patch);
    }

    // Coalesced into 1 entry
    expect(history.past.length).toBe(1);
    expect(store.coordinates.get('blk_1')).toEqual({ x: 50, y: 50 });

    // Undo should restore all the way back to initial { x: 0, y: 0 }
    const undoRes = undoPatch(history, store);
    expect(undoRes).toBeDefined();
    expect(store.coordinates.get('blk_1')).toEqual({ x: 0, y: 0 });

    // Redo should restore to final { x: 50, y: 50 }
    const redoRes = redoPatch(history, store);
    expect(redoRes).toBeDefined();
    expect(store.coordinates.get('blk_1')).toEqual({ x: 50, y: 50 });
  });

  it('restores deletion cascade on undo without full repository clone', () => {
    const { repository, coordinates, diagramPresentations } = generate1kModel(42);
    const store = fromRepository(repository, coordinates, diagramPresentations);
    const history = createPatchHistory();

    // Pick block 1 and its dependent relationships
    const targetBlock = getById(store, 'blk_1') as BlockDefinition;
    const relsWithBlock = store.indexes.sourceId.get('blk_1');
    expect(relsWithBlock?.size).toBeGreaterThan(0);
    const expectedRelCount = relsWithBlock!.size;

    const removedRels = [...(relsWithBlock ?? [])].map(rId => getById(store, rId) as SysmlRelationship);

    // Build cascade delete patch
    const patch = createSysmlPatch({
      revision: store.revision + 1,
      forward: [
        { op: 'remove', collection: 'definitions', id: 'blk_1', oldValue: targetBlock },
        ...removedRels.map(r => ({ op: 'remove' as const, collection: 'relationships' as const, id: r.id, oldValue: r })),
      ],
      inverse: [
        { op: 'add', collection: 'definitions', id: 'blk_1', value: targetBlock },
        ...removedRels.map(r => ({ op: 'add' as const, collection: 'relationships' as const, id: r.id, value: r })),
      ],
    });

    applyPatch(store, patch.forward);
    pushPatch(history, patch);

    expect(getById(store, 'blk_1')).toBeUndefined();
    for (const r of removedRels) {
      expect(getById(store, r.id)).toBeUndefined();
    }

    // Undo restores the block and its relationships and secondary indexes!
    undoPatch(history, store);
    expect(getById(store, 'blk_1')).toBeDefined();
    expect((getById(store, 'blk_1') as BlockDefinition).name).toBe('Block_1');
    for (const r of removedRels) {
      expect(getById(store, r.id)).toBeDefined();
    }
    expect(store.indexes.sourceId.get('blk_1')?.size).toBe(expectedRelCount);
  });

  it('supports multi-step undo and redo across sequential entity updates', () => {
    const store = createEmptyNormalizedStore();
    const history = createPatchHistory();

    const block: BlockDefinition = {
      id: 'blk_chain',
      name: 'V0',
      namespace: ['System'],
      kind: 'block',
      isAbstract: false,
      isLeaf: false,
      properties: [],
      ports: [],
      operations: [],
      constraints: [],
    };
    upsertEntity(store, 'definitions', block);

    // Apply 5 revisions: V1 through V5
    for (let i = 1; i <= 5; i++) {
      const prevName = `V${i - 1}`;
      const nextName = `V${i}`;
      const patch = createSysmlPatch({
        revision: i,
        forward: [{
          op: 'replace',
          collection: 'definitions',
          id: 'blk_chain',
          path: ['name'],
          oldValue: prevName,
          value: nextName,
        }],
        inverse: [{
          op: 'replace',
          collection: 'definitions',
          id: 'blk_chain',
          path: ['name'],
          oldValue: nextName,
          value: prevName,
        }],
      });
      applyPatch(store, patch.forward);
      pushPatch(history, patch);
    }

    expect((getById(store, 'blk_chain') as BlockDefinition).name).toBe('V5');
    expect(history.past).toHaveLength(5);
    expect(history.future).toHaveLength(0);

    // Undo 3 steps -> Should be V2
    undoPatch(history, store); // to V4
    undoPatch(history, store); // to V3
    undoPatch(history, store); // to V2
    expect((getById(store, 'blk_chain') as BlockDefinition).name).toBe('V2');
    expect(history.past).toHaveLength(2);
    expect(history.future).toHaveLength(3);

    // Redo 2 steps -> Should be V4
    redoPatch(history, store); // to V3
    redoPatch(history, store); // to V4
    expect((getById(store, 'blk_chain') as BlockDefinition).name).toBe('V4');
    expect(history.past).toHaveLength(4);
    expect(history.future).toHaveLength(1);
  });

  it('invalidates redo future stack when a new mutation occurs after undo', () => {
    const store = createEmptyNormalizedStore();
    const history = createPatchHistory();

    const block: BlockDefinition = {
      id: 'blk_branch',
      name: 'Initial',
      namespace: ['System'],
      kind: 'block',
      isAbstract: false,
      isLeaf: false,
      properties: [],
      ports: [],
      operations: [],
      constraints: [],
    };
    upsertEntity(store, 'definitions', block);

    const patch1 = createSysmlPatch({
      revision: 1,
      forward: [{ op: 'replace', collection: 'definitions', id: 'blk_branch', path: ['name'], oldValue: 'Initial', value: 'Step1' }],
      inverse: [{ op: 'replace', collection: 'definitions', id: 'blk_branch', path: ['name'], oldValue: 'Step1', value: 'Initial' }],
    });
    applyPatch(store, patch1.forward);
    pushPatch(history, patch1);

    const patch2 = createSysmlPatch({
      revision: 2,
      forward: [{ op: 'replace', collection: 'definitions', id: 'blk_branch', path: ['name'], oldValue: 'Step1', value: 'Step2' }],
      inverse: [{ op: 'replace', collection: 'definitions', id: 'blk_branch', path: ['name'], oldValue: 'Step2', value: 'Step1' }],
    });
    applyPatch(store, patch2.forward);
    pushPatch(history, patch2);

    expect((getById(store, 'blk_branch') as BlockDefinition).name).toBe('Step2');

    // Undo step 2 -> future has patch2
    undoPatch(history, store);
    expect((getById(store, 'blk_branch') as BlockDefinition).name).toBe('Step1');
    expect(history.future).toHaveLength(1);

    // Now introduce a brand new edit -> redo future must be cleared
    const patch3 = createSysmlPatch({
      revision: 3,
      forward: [{ op: 'replace', collection: 'definitions', id: 'blk_branch', path: ['name'], oldValue: 'Step1', value: 'BranchAlternative' }],
      inverse: [{ op: 'replace', collection: 'definitions', id: 'blk_branch', path: ['name'], oldValue: 'BranchAlternative', value: 'Step1' }],
    });
    applyPatch(store, patch3.forward);
    pushPatch(history, patch3);

    expect((getById(store, 'blk_branch') as BlockDefinition).name).toBe('BranchAlternative');
    expect(history.future).toHaveLength(0);

    // Attempting redo does nothing
    const redoRes = redoPatch(history, store);
    expect(redoRes).toBeUndefined();
    expect((getById(store, 'blk_branch') as BlockDefinition).name).toBe('BranchAlternative');
  });

  it('creates periodic checkpoints and supports replaying patches from checkpoint', () => {
    const store = createEmptyNormalizedStore();
    const history = createPatchHistory({
      maxEntries: 50,
      checkpointEvery: 5,
      maxReplayOperations: 10,
    });

    const block: BlockDefinition = {
      id: 'blk_chk',
      name: 'Initial',
      namespace: ['System'],
      kind: 'block',
      isAbstract: false,
      isLeaf: false,
      properties: [],
      ports: [],
      operations: [],
      constraints: [],
    };
    upsertEntity(store, 'definitions', block);

    // Push 12 sequential patches
    store.revision = 0;
    for (let i = 1; i <= 12; i++) {
      const prevName = i === 1 ? 'Initial' : `Name_${i - 1}`;
      const nextName = `Name_${i}`;
      const patch = createSysmlPatch({
        revision: i,
        forward: [{
          op: 'replace',
          collection: 'definitions',
          id: 'blk_chk',
          path: ['name'],
          oldValue: prevName,
          value: nextName,
        }],
        inverse: [{
          op: 'replace',
          collection: 'definitions',
          id: 'blk_chk',
          path: ['name'],
          oldValue: nextName,
          value: prevName,
        }],
      });
      applyPatch(store, patch.forward);
      store.revision = i;
      pushPatch(history, patch, store);
    }

    // Checkpoints should have been created at multiples of checkpointEvery (5 and 10)
    expect(history.checkpoints.length).toBeGreaterThanOrEqual(2);
    const checkpoint = history.checkpoints[history.checkpoints.length - 1];
    expect(checkpoint.revision).toBe(10);

    // Replay onto a fresh store from the last checkpoint
    const replayedStore = createEmptyNormalizedStore();
    replayFromCheckpoint(checkpoint, replayedStore, history.past);

    // Final replayed state must match store at revision 12
    expect(replayedStore.revision).toBe(12);
    expect((getById(replayedStore, 'blk_chk') as BlockDefinition).name).toBe('Name_12');
  });

  it('Task 6: deletion forward/inverse patches round-trip every cascade member and evidence state via undo/redo', () => {
    const block = (id: string): BlockDefinition => ({
      id, name: id, namespace: [], kind: 'block', isAbstract: false, isLeaf: false,
      properties: [], ports: [], operations: [], constraints: [],
    });
    const part = (id: string, ownerId: string, typeId: string, aggregation: PartUsage['aggregation']): PartUsage => ({
      id, ownerId, typeId, aggregation, kind: 'part', name: id,
      multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
    });
    const repo = createEmptyRepository();
    repo.definitions.whole = block('whole');
    repo.definitions.childType = block('childType');
    repo.usages.owned = part('owned', 'whole', 'childType', 'composite');
    repo.usages.nested = part('nested', 'owned', 'childType', 'composite');
    repo.relationships.assoc = { id: 'assoc', kind: 'association', sourceId: 'whole', targetId: 'childType' };
    repo.requirements.r = { id: 'r', name: 'R', namespace: [], kind: 'requirement', requirementId: 'REQ-1', text: 'x', status: 'verified', version: '1' };
    repo.verificationCases.v = { id: 'v', name: 'V', namespace: [], kind: 'verificationCase', method: 'test', verifiesRequirementIds: ['r'] };
    repo.evidence.e = { id: 'e', verificationCaseId: 'v', requirementId: 'r', revision: 0, result: 'passed', executedAt: '2026-09-12', status: 'current' };
    repo.relationships.s = { id: 's', kind: 'satisfy', sourceId: 'owned', targetId: 'r' };

    // Deleting the requirement itself exercises the verifiesRequirementIds
    // invalidation path (the list is filtered, not just the evidence row).
    const deletion = applyCommand(repo, { kind: 'deleteElements', elementIds: ['whole', 'r'] });
    expect(deletion.applied).toBe(true);
    expect(deletion.forwardPatch).toBeDefined();
    expect(deletion.inversePatch).toBeDefined();

    const store = fromRepository(repo);
    const history = createPatchHistory();
    const patch = createSysmlPatch({
      revision: deletion.repository.revision,
      forward: deletion.forwardPatch!.forward,
      inverse: deletion.forwardPatch!.inverse,
      description: 'deleteElements',
    });

    // Apply the atomic deletion through the patch pipeline.
    applyPatch(store, patch.forward);
    pushPatch(history, patch, store);
    expect(getById(store, 'whole')).toBeUndefined();
    expect(getById(store, 'owned')).toBeUndefined();
    expect(getById(store, 'nested')).toBeUndefined();
    expect(getById(store, 'assoc')).toBeUndefined();
    expect(getById(store, 's')).toBeUndefined();
    expect(getById(store, 'e')).toBeUndefined();

    // Undo restores every cascade member AND the evidence invalidation
    // state: the evidence record (with its current/passed status) and the
    // verification case's verifiesRequirementIds list.
    const undone = undoPatch(history, store);
    expect(undone).toBeDefined();
    expect((getById(store, 'whole') as BlockDefinition).name).toBe('whole');
    expect(getById(store, 'owned')).toBeDefined();
    expect(getById(store, 'nested')).toBeDefined();
    expect(getById(store, 'assoc')).toBeDefined();
    expect(getById(store, 's')).toBeDefined();
    expect(getById(store, 'r')).toBeDefined();
    const restoredEvidence = getById(store, 'e') as unknown as Record<string, unknown>;
    expect(restoredEvidence).toBeDefined();
    expect(restoredEvidence.status).toBe('current');
    expect(restoredEvidence.result).toBe('passed');
    const restoredCase = getById(store, 'v') as unknown as { verifiesRequirementIds: string[] };
    expect(restoredCase.verifiesRequirementIds).toEqual(['r']);
    expect(toRepository(store).evidence.e).toEqual(repo.evidence.e);

    // Redo re-applies the full cascade atomically.
    const redone = redoPatch(history, store);
    expect(redone).toBeDefined();
    expect(getById(store, 'whole')).toBeUndefined();
    expect(getById(store, 'e')).toBeUndefined();
    expect((getById(store, 'v') as unknown as { verifiesRequirementIds: string[] }).verifiesRequirementIds).toEqual([]);
  });
});
