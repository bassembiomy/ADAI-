import { describe, expect, it } from 'vitest';
import { createEmptyRepository } from '../engine/sysml/model';
import { ensureDefaultSysmlDiagrams } from './sysmlDiagramWorkspace';
import { fromRepository, type NormalizedSysmlStore } from '../engine/sysml/normalizedStore';
import { createSysmlGatewayState, executeSysmlCommand, computeImpactHash, type SysmlGatewayState } from './sysmlCommandGateway';

function assertStoreMatchesRepository(store: NormalizedSysmlStore, state: SysmlGatewayState) {
  const fresh = fromRepository(state.repository, state.coordinates, state.diagramPresentations);

  // 1. Definition entities count and IDs match
  expect(Array.from(store.definitions.keys()).sort()).toEqual(Array.from(fresh.definitions.keys()).sort());
  for (const [id, def] of store.definitions.entries()) {
    expect(def).toEqual(fresh.definitions.get(id));
  }

  // 2. Package entities match
  expect(Array.from(store.packages.keys()).sort()).toEqual(Array.from(fresh.packages.keys()).sort());
  for (const [id, pkg] of store.packages.entries()) {
    expect(pkg).toEqual(fresh.packages.get(id));
  }

  // 3. Relationships match
  expect(Array.from(store.relationships.keys()).sort()).toEqual(Array.from(fresh.relationships.keys()).sort());
  for (const [id, rel] of store.relationships.entries()) {
    expect(rel).toEqual(fresh.relationships.get(id));
  }

  // 4. Coordinates match
  expect(Object.fromEntries(store.coordinates)).toEqual(Object.fromEntries(fresh.coordinates));

  // 5. Diagram presentations match
  expect(Object.fromEntries(store.diagramPresentations)).toEqual(Object.fromEntries(fresh.diagramPresentations));

  // 6. Owner index matches
  for (const [ownerId, children] of store.indexes.ownerId.entries()) {
    expect(Array.from(children).sort()).toEqual(Array.from(fresh.indexes.ownerId.get(ownerId) ?? []).sort());
  }
}

describe('Gateway store consistency against fromRepository', () => {
  it('proves result.store matches fromRepository across create, update, move, connect, disconnect, delete, undo, redo', () => {
    const initialRepo = ensureDefaultSysmlDiagrams(createEmptyRepository()).repository;
    let state = createSysmlGatewayState(initialRepo);

    // 1. Create package
    let res = executeSysmlCommand(state, {
      type: 'createElement',
      element: { id: 'pkg-a', kind: 'package', name: 'SubsystemA', namespace: ['model'], ownerId: 'model' } as any,
    });
    expect(res.committed).toBe(true);
    state = { ...state, ...res };
    const pkgId = 'pkg-a';
    assertStoreMatchesRepository(res.store!, state);

    // 2. Create block in package
    res = executeSysmlCommand(state, {
      type: 'createElement',
      element: {
        id: 'blk-motor', kind: 'block', name: 'Motor', namespace: ['model', 'SubsystemA'], ownerId: pkgId,
        isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
      } as any,
    });
    expect(res.committed).toBe(true);
    state = { ...state, ...res };
    const motorId = 'blk-motor';
    assertStoreMatchesRepository(res.store!, state);

    // 3. Create second block
    res = executeSysmlCommand(state, {
      type: 'createElement',
      element: {
        id: 'blk-controller', kind: 'block', name: 'Controller', namespace: ['model'], ownerId: 'model',
        isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
      } as any,
    });
    expect(res.committed).toBe(true);
    state = { ...state, ...res };
    const controllerId = 'blk-controller';
    assertStoreMatchesRepository(res.store!, state);

    // 4. Update block properties / rename
    res = executeSysmlCommand(state, {
      type: 'updateElement',
      elementId: motorId,
      patch: { name: 'DriveMotor' },
    });
    expect(res.committed).toBe(true);
    state = { ...state, ...res };
    expect(state.repository.definitions[motorId]?.name).toBe('DriveMotor');
    assertStoreMatchesRepository(res.store!, state);

    // 5. Connect blocks with a relationship
    res = executeSysmlCommand(state, {
      type: 'createElement',
      element: {
        id: 'rel-1',
        kind: 'association',
        name: 'Controller : Motor',
        sourceId: controllerId,
        targetId: motorId,
        ownerId: 'model',
      } as any,
    });
    expect(res.committed).toBe(true);
    state = { ...state, ...res };
    const relId = 'rel-1';
    assertStoreMatchesRepository(res.store!, state);

    // 6. Move block
    res = executeSysmlCommand(state, {
      type: 'moveElements',
      elementIds: [controllerId],
      targetOwnerId: pkgId,
    });
    expect(res.committed).toBe(true);
    state = { ...state, ...res };
    expect(state.repository.definitions[controllerId]?.ownerId).toBe(pkgId);
    assertStoreMatchesRepository(res.store!, state);

    // 7. Add to diagram and update presentation coordinates
    res = executeSysmlCommand(state, {
      type: 'addToDiagram',
      diagramId: 'adia-default-bdd',
      elementIds: [motorId],
    });
    expect(res.committed).toBe(true);
    state = { ...state, ...res };
    assertStoreMatchesRepository(res.store!, state);

    res = executeSysmlCommand(state, {
      type: 'updatePresentation',
      diagramId: 'adia-default-bdd',
      elementId: motorId,
      presentation: { x: 150, y: 220, width: 180, height: 120 },
    });
    expect(res.committed).toBe(true);
    state = { ...state, ...res };
    assertStoreMatchesRepository(res.store!, state);

    // 8. Disconnect (delete relationship)
    res = executeSysmlCommand(state, {
      type: 'deleteElements',
      elementIds: [relId],
    });
    expect(res.committed).toBe(true);
    state = { ...state, ...res };
    expect(state.repository.relationships[relId]).toBeUndefined();
    assertStoreMatchesRepository(res.store!, state);

    // 9. Undo disconnect
    res = executeSysmlCommand(state, { type: 'undo' });
    expect(res.committed).toBe(true);
    state = { ...state, ...res };
    expect(state.repository.relationships[relId]).toBeDefined();
    assertStoreMatchesRepository(res.store!, state);

    // 10. Redo disconnect
    res = executeSysmlCommand(state, { type: 'redo' });
    expect(res.committed).toBe(true);
    state = { ...state, ...res };
    expect(state.repository.relationships[relId]).toBeUndefined();
    assertStoreMatchesRepository(res.store!, state);

    // 11. Delete element (with preflight and confirmed hash)
    const preflight = executeSysmlCommand(state, {
      type: 'deleteElements',
      elementIds: [motorId],
    });
    const hash = preflight.impact ? computeImpactHash(preflight.impact) : undefined;
    res = executeSysmlCommand(state, {
      type: 'deleteElements',
      elementIds: [motorId],
      confirmedImpactHash: hash,
    });
    expect(res.committed).toBe(true);
    state = { ...state, ...res };
    expect(state.repository.definitions[motorId]).toBeUndefined();
    assertStoreMatchesRepository(res.store!, state);

    // 12. Undo delete
    res = executeSysmlCommand(state, { type: 'undo' });
    expect(res.committed).toBe(true);
    state = { ...state, ...res };
    expect(state.repository.definitions[motorId]).toBeDefined();
    assertStoreMatchesRepository(res.store!, state);
  });
});
