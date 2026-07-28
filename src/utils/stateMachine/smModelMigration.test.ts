import { describe, expect, it } from 'vitest';
import { migrateStateMachineModel } from './smModelMigration';

describe('migrateStateMachineModel', () => {
  it('migrates consistent legacy siblings to explicit AND', () => {
    const result = migrateStateMachineModel({
      schemaVersion: 3,
      tickMs: 10,
      states: [
        { id: 'a', parentId: 'root', isParallel: true, priority: 1 },
        { id: 'b', parentId: 'root', isParallel: true, priority: 2 },
      ],
      layers: [{ id: 'root', parentStateId: null, stateIds: ['a', 'b'] }],
      junctions: [],
      transitions: [],
      variables: [],
    } as any);

    expect(result.diagnostics).toEqual([]);
    expect(result.model.schemaVersion).toBe(4);
    expect(result.model.layers[0].decomposition).toBe('AND');
  });

  it('rejects an ambiguous mixed legacy layer', () => {
    const result = migrateStateMachineModel({
      schemaVersion: 3,
      tickMs: 10,
      states: [
        { id: 'a', parentId: 'root', isParallel: true, priority: 1 },
        { id: 'b', parentId: 'root', isParallel: false, priority: 2 },
      ],
      layers: [{ id: 'root', parentStateId: null, stateIds: ['a', 'b'] }],
      junctions: [],
      transitions: [],
      variables: [],
    } as any);

    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'MIGRATION_AMBIGUOUS_DECOMPOSITION',
      elementId: 'root',
    }));
  });
});
