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

  it('migrates all-unmarked legacy siblings to explicit OR', () => {
    const result = migrateStateMachineModel({
      schemaVersion: 3,
      tickMs: 10,
      states: [
        { id: 'a', parentId: 'root', isParallel: false, priority: 1 },
        { id: 'b', parentId: 'root', isParallel: false, priority: 2 },
      ],
      layers: [{ id: 'root', parentStateId: null, stateIds: ['a', 'b'] }],
      junctions: [],
      transitions: [],
      variables: [],
    } as any);

    expect(result.diagnostics).toEqual([]);
    expect(result.model.layers[0].decomposition).toBe('OR');
  });

  it('migrates a model without a schema version', () => {
    const result = migrateStateMachineModel({
      tickMs: 10,
      states: [],
      layers: [],
      junctions: [],
      transitions: [],
      variables: [],
    } as any);

    expect(result.model.schemaVersion).toBe(4);
  });

  it('normalizes missing legacy safetyMode to false', () => {
    const result = migrateStateMachineModel({
      schemaVersion: 3,
      tickMs: 10,
      states: [],
      layers: [],
      junctions: [],
      transitions: [],
      variables: [],
    } as any);

    expect(result.model.safetyMode).toBe(false);
  });

  it('preserves and clones a current V4 model', () => {
    const input = {
      schemaVersion: 4,
      tickMs: 10,
      safetyMode: true,
      states: [],
      layers: [{
        id: 'root',
        name: 'Root',
        parentStateId: null,
        stateIds: [],
        transitionIds: [],
        junctionIds: [],
        decomposition: 'OR',
      }],
      junctions: [],
      transitions: [],
      variables: [],
    } as any;

    const result = migrateStateMachineModel(input);

    expect(result.diagnostics).toEqual([]);
    expect(result.model).toEqual(input);
    expect(result.model).not.toBe(input);
  });

  it('deep-isolates migrated layer arrays from the legacy input', () => {
    const input = {
      schemaVersion: 3,
      tickMs: 10,
      states: [{ id: 'a', parentId: 'root', isParallel: false, priority: 1 }],
      layers: [{
        id: 'root',
        name: 'Root',
        parentStateId: null,
        stateIds: ['a'],
        transitionIds: [],
        junctionIds: [],
      }],
      junctions: [],
      transitions: [],
      variables: [],
    } as any;

    const result = migrateStateMachineModel(input);
    result.model.layers[0].stateIds.push('result-only');
    input.layers[0].transitionIds.push('input-only');

    expect(input.layers[0].stateIds).toEqual(['a']);
    expect(result.model.layers[0].transitionIds).toEqual([]);
  });
});
