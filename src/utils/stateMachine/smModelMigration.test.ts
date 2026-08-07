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

  it('deep-isolates migrated state arrays from the input', () => {
    const input = {
      schemaVersion: 4,
      tickMs: 10,
      safetyMode: false,
      states: [{
        id: 'parent',
        parentId: 'root',
        children: ['child'],
        isParallel: false,
        priority: 1,
      }],
      layers: [{
        id: 'root',
        parentStateId: null,
        stateIds: ['parent'],
        transitionIds: [],
        junctionIds: [],
        decomposition: 'OR',
      }],
      junctions: [],
      transitions: [],
      variables: [],
    } as any;

    const result = migrateStateMachineModel(input);
    result.model.states[0].children.push('result-only');

    expect(input.states[0].children).toEqual(['child']);
  });

  it('repairs history junction parentId when pointing to a child state in a non-root layer', () => {
    const input = {
      schemaVersion: 4,
      tickMs: 500,
      states: [
        { id: 's1', name: 'State_1', parentId: 'root' },
        { id: 's2', name: 'State_2', parentId: 'root' },
        { id: 's3', name: 'State_3', parentId: 'layer_s2' },
      ],
      junctions: [
        {
          id: 'hj1',
          type: 'history',
          parentId: 's3', // Misassigned to child state s3 instead of container state s2 or layer_s2
        },
      ],
      layers: [
        { id: 'root', parentStateId: null, stateIds: ['s1', 's2'], transitionIds: [], junctionIds: [] },
        { id: 'layer_s2', parentStateId: 's2', stateIds: ['s3'], transitionIds: [], junctionIds: ['hj1'] },
      ],
      transitions: [],
      variables: [],
    } as any;

    const result = migrateStateMachineModel(input);
    const historyJunction = result.model.junctions.find((j: any) => j.id === 'hj1');
    expect(historyJunction?.parentId).toBe('s2');
  });

  it('does not guess a history owner when layer membership is ambiguous', () => {
    const input = {
      schemaVersion: 4,
      tickMs: 10,
      states: [
        { id: 'owner_a', name: 'Owner A', parentId: 'root' },
        { id: 'owner_b', name: 'Owner B', parentId: 'root' },
        { id: 'child_a', name: 'Child A', parentId: 'layer_a' },
        { id: 'child_b', name: 'Child B', parentId: 'layer_b' },
      ],
      junctions: [{
        id: 'history',
        type: 'history',
        parentId: 'child_a',
      }],
      layers: [
        {
          id: 'root',
          parentStateId: null,
          stateIds: ['owner_a', 'owner_b'],
          transitionIds: [],
          junctionIds: [],
        },
        {
          id: 'layer_a',
          parentStateId: 'owner_a',
          stateIds: ['child_a'],
          transitionIds: [],
          junctionIds: ['history'],
        },
        {
          id: 'layer_b',
          parentStateId: 'owner_b',
          stateIds: ['child_b'],
          transitionIds: [],
          junctionIds: ['history'],
        },
      ],
      transitions: [],
      variables: [],
    } as any;

    const result = migrateStateMachineModel(input);

    expect(result.model.junctions[0].parentId).toBe('child_a');
    expect(result.model.layers[1].junctionIds).toEqual(['history']);
    expect(result.model.layers[2].junctionIds).toEqual(['history']);
  });

  it('successfully repairs statemachine.json fixture and passes model validation', () => {
    const input = {
      schemaVersion: 4,
      tickMs: 500,
      states: [
        { id: 's1', name: 'State_1', parentId: 'root', children: [], priority: 10, isParallel: false, autostart: true },
        { id: '367ccc9c-444c-4da0-9cd7-b86d9c4f83ba', name: 'State_2', parentId: 'root', children: [], priority: 20, isParallel: false, autostart: false },
        { id: '9aa3de7c-1c3b-4e19-816c-67c4900df26b', name: 'State_3', parentId: 'b1d66949-ecf8-474b-b35f-6ef94fc68c75', children: [], priority: 10, isParallel: false, autostart: true },
      ],
      junctions: [
        {
          id: '45007fbf-07cd-40f2-bcc6-f9bc4a144e7e',
          name: 'H',
          parentId: '9aa3de7c-1c3b-4e19-816c-67c4900df26b', // Misassigned to State_3 instead of State_2 or layer b1d66949
          type: 'history',
          autostart: false,
        },
      ],
      layers: [
        {
          id: 'root',
          name: 'Root',
          parentStateId: null,
          stateIds: ['s1', '367ccc9c-444c-4da0-9cd7-b86d9c4f83ba'],
          transitionIds: [],
          junctionIds: [],
          decomposition: 'OR',
        },
        {
          id: 'b1d66949-ecf8-474b-b35f-6ef94fc68c75',
          name: 'State_2',
          parentStateId: '367ccc9c-444c-4da0-9cd7-b86d9c4f83ba',
          stateIds: ['9aa3de7c-1c3b-4e19-816c-67c4900df26b'],
          transitionIds: [],
          junctionIds: ['45007fbf-07cd-40f2-bcc6-f9bc4a144e7e'],
          decomposition: 'OR',
        },
      ],
      transitions: [],
      variables: [],
    } as any;

    const result = migrateStateMachineModel(input);
    const historyJunction = result.model.junctions.find((j: any) => j.id === '45007fbf-07cd-40f2-bcc6-f9bc4a144e7e');
    expect(historyJunction?.parentId).toBe('367ccc9c-444c-4da0-9cd7-b86d9c4f83ba');
  });

  it.each([3, 4])(
    'normalizes embedded legacy X-Bridges models while migrating schema V%s',
    (schemaVersion) => {
      const result = migrateStateMachineModel({
        schemaVersion,
        tickMs: 10,
        safetyMode: false,
        states: [{
          id: 'xb-state',
          parentId: 'root',
          isParallel: false,
          priority: 1,
          isXBridges: true,
          xBridgesModel: {
            nodes: [{
              id: 'react-id',
              type: 'xblock',
              data: {
                id: 'stale-data-id',
                type: 'Constant',
                params: { value: 5 },
                inputs: [],
                outputs: [{ id: 'out', direction: 'output', type: 'continuous' }],
                execute: () => ({ outputs: [5] }),
              },
            }],
            edges: [],
          },
        }],
        layers: [{
          id: 'root',
          parentStateId: null,
          stateIds: ['xb-state'],
          transitionIds: [],
          junctionIds: [],
          ...(schemaVersion === 4 ? { decomposition: 'OR' } : {}),
        }],
        junctions: [],
        transitions: [],
        variables: [],
      } as any);

      expect(result.diagnostics).toEqual([]);
      expect(result.model.states[0].xBridgesModel).toMatchObject({
        schemaVersion: 1,
        nodes: [{ id: 'react-id', type: 'Constant' }],
        mappings: [],
        policy: { memory: 'reset', numericFault: 'escalate' },
      });
    },
  );

  it('fails closed when an embedded X-Bridges model cannot be normalized', () => {
    const result = migrateStateMachineModel({
      schemaVersion: 4,
      tickMs: 10,
      safetyMode: false,
      states: [{
        id: 'xb-state',
        parentId: 'root',
        isParallel: false,
        priority: 1,
        isXBridges: true,
        xBridgesModel: {
          nodes: [{ id: 'missing-type', data: { params: {} } }],
          edges: [],
        },
      }],
      layers: [{
        id: 'root',
        parentStateId: null,
        stateIds: ['xb-state'],
        transitionIds: [],
        junctionIds: [],
        decomposition: 'OR',
      }],
      junctions: [],
      transitions: [],
      variables: [],
    } as any);

    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'XB_MODEL_INVALID',
      elementId: 'xb-state',
    }));
    expect(result.model.states[0].xBridgesModel).toBeUndefined();
  });

  it('repairs deterministic blank legacy X-Bridges boundary mappings before adaptation', () => {
    const result = migrateStateMachineModel({
      schemaVersion: 4,
      tickMs: 10,
      safetyMode: false,
      states: [{
        id: 'xb-state',
        parentId: 'root',
        isParallel: false,
        priority: 1,
        isXBridges: true,
        xBridgesModel: {
          nodes: [
            {
              id: 'input', type: 'xblock',
              data: {
                type: 'Inport', params: { smVarId: 'stale' },
                inputs: [{ id: 'in', direction: 'input' }],
                outputs: [{ id: 'out', direction: 'output' }],
              },
            },
            {
              id: 'output', type: 'xblock',
              data: {
                type: 'Outport', params: { smVarId: 'stale' },
                inputs: [{ id: 'in', direction: 'input' }],
                outputs: [{ id: 'out', direction: 'output' }],
              },
            },
          ],
          edges: [],
          mappings: [
            { smVarId: 'x', blockId: '', portId: '', direction: 'in' },
            { smVarId: 'x', blockId: '', portId: '', direction: 'out' },
          ],
        },
      }],
      layers: [{
        id: 'root', parentStateId: null, stateIds: ['xb-state'],
        transitionIds: [], junctionIds: [], decomposition: 'OR',
      }],
      junctions: [],
      transitions: [],
      variables: [{ id: 'x', name: 'x', type: 'number', initialValue: '0' }],
    } as any);

    expect(result.diagnostics).toEqual([]);
    expect(result.model.states[0].xBridgesModel?.mappings).toEqual([
      { smVarId: 'x', blockId: 'input', portId: 'in', direction: 'in' },
      { smVarId: 'x', blockId: 'output', portId: 'out', direction: 'out' },
    ]);
  });

  it('synchronizes xBridgesModel.mappings when an Outport contains smVarId (APP-XB-MAP-001)', () => {
    const rawModel = {
      schemaVersion: 4,
      tickMs: 10,
      states: [
        {
          id: 's1',
          parentId: 'root',
          decomposition: 'OR',
          xBridgesModel: {
            nodes: [
              {
                id: 'XB6-StepOut',
                type: 'Outport',
                params: { smVarId: 'xb6-step-output-0001' },
                inputs: [{ id: 'in', direction: 'input' }],
                outputs: [{ id: 'out', direction: 'output' }],
              },
            ],
            edges: [],
            mappings: [],
          },
        },
      ],
      layers: [{ id: 'root', parentStateId: null, stateIds: ['s1'], decomposition: 'OR' }],
      junctions: [],
      transitions: [],
      variables: [{ id: 'v1', name: 'xb6-step-output-0001', type: 'number', initialValue: '0' }],
    };

    const result = migrateStateMachineModel(rawModel as any);
    const mappings = result.model.states[0].xBridgesModel?.mappings || [];
    expect(mappings).toContainEqual({
      smVarId: 'xb6-step-output-0001',
      blockId: 'XB6-StepOut',
      portId: 'out',
      direction: 'out',
    });
  });
});
