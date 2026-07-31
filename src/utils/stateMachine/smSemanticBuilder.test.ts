import { describe, expect, it } from 'vitest';
import type { StateMachineModelV4 } from './smModel';
import { buildSemanticModel } from './smSemanticBuilder';
import {
  flatOrFixture,
  historyFixture,
  hybridXBridgesFixture,
  nestedAndFixture,
} from './smFixtures';

const diagnosticCodes = (model: StateMachineModelV4): string[] =>
  buildSemanticModel(model).diagnostics.map((item) => item.code);

describe('buildSemanticModel', () => {
  it('precomputes hierarchy, slots, and transition LCA paths', () => {
    const result = buildSemanticModel(flatOrFixture());

    expect(result.diagnostics).toEqual([]);
    expect(result.ir).toBeDefined();
    expect(result.ir!.layers.root.decomposition).toBe('OR');
    expect(result.ir!.layers.root.defaultEntryId).toBe('a');
    expect(result.ir!.layers.root.defaultEntryKind).toBe('state');
    expect(result.ir!.states.a.activeSlot).toBe(0);
    expect(result.ir!.states.a.depth).toBe(0);
    expect(result.ir!.transitions.t_ab.exitStateIds).toEqual(['a']);
    expect(result.ir!.transitions.t_ab.entryStateIds).toEqual(['b']);
  });

  it('assigns deterministic hierarchy and AND execution order', () => {
    const fixture = nestedAndFixture();
    fixture.states.reverse();
    fixture.layers.reverse();
    const result = buildSemanticModel(fixture);

    expect(result.diagnostics).toEqual([]);
    expect(result.ir).toBeDefined();
    expect(result.ir!.rootLayerId).toBe('root');
    expect(result.ir!.layers.parallel.children).toEqual(['region_a', 'region_b']);
    expect(result.ir!.states.region_a.activityIndex).toBeLessThan(
      result.ir!.states.region_b.activityIndex,
    );
  });

  it('does not allocate an active slot to an empty OR child layer', () => {
    const model = flatOrFixture();
    model.layers.push({
      ...model.layers[0],
      id: 'empty_b_children',
      name: 'empty_b_children',
      parentStateId: 'b',
      stateIds: [],
      transitionIds: [],
      junctionIds: [],
      decomposition: 'OR',
    });

    const result = buildSemanticModel(model);

    expect(result.diagnostics).toEqual([]);
    expect(result.ir).toBeDefined();
    expect(result.ir!.layers.empty_b_children.activeSlot).toBeNull();
    expect(result.ir!.activeSlotCount).toBe(1);
  });

  it('retains trigger combination mode and normalizes temporal thresholds', () => {
    const fixture = flatOrFixture();
    fixture.transitions.push(
      {
        ...fixture.transitions[0],
        id: 't_after',
        type: 'after',
        afterTicks: 2,
        order: 2,
      },
      {
        ...fixture.transitions[0],
        id: 't_and',
        type: 'and',
        afterTicks: 3,
        order: 3,
      },
      {
        ...fixture.transitions[0],
        id: 't_or',
        type: 'or',
        afterTicks: 4,
        order: 4,
      },
    );

    const result = buildSemanticModel(fixture);
    expect(result.diagnostics).toEqual([]);
    expect(result.ir!.transitions.t_ab.triggerMode).toBe('condition');
    expect(result.ir!.transitions.t_after).toMatchObject({
      triggerMode: 'after',
      temporalThresholdMs: 20,
    });
    expect(result.ir!.transitions.t_and.triggerMode).toBe('and');
    expect(result.ir!.transitions.t_or.triggerMode).toBe('or');
  });

  it('deep-freezes the completed semantic model', () => {
    const result = buildSemanticModel(flatOrFixture());
    expect(result.ir).toBeDefined();

    expect(Object.isFrozen(result.ir)).toBe(true);
    expect(Object.isFrozen(result.ir!.states)).toBe(true);
    expect(Object.isFrozen(result.ir!.transitions.t_ab.exitStateIds)).toBe(true);
  });

  it('attaches the frozen X-Bridges semantic model only to its owning state', () => {
    const result = buildSemanticModel(hybridXBridgesFixture());

    expect(result.diagnostics).toEqual([]);
    expect(result.ir).toBeDefined();
    expect(result.ir!.states.ordinary.xBridges).toBeNull();
    expect(result.ir!.states.controller.xBridges).toMatchObject({
      stateId: 'controller',
      executionOrder: [],
      solver: {
        kind: 'euler',
        substepsPerTick: 5,
      },
    });
    expect(Object.isFrozen(result.ir!.states.controller.xBridges)).toBe(true);
    expect(Object.isFrozen(result.ir!.states.controller.xBridges!.solver)).toBe(
      true,
    );
  });

  it('adapts legacy X-Bridges UI nodes without retaining executable closures', () => {
    const fixture = hybridXBridgesFixture();
    fixture.states.find((state) => state.id === 'controller')!.xBridgesModel = {
      nodes: [{
        id: 'constant',
        type: 'xblock',
        data: {
          type: 'Constant',
          params: { value: 2 },
          inputs: [],
          outputs: [{
            id: 'y',
            direction: 'output',
            shape: 'scalar',
            dataType: 'float32',
          }],
          execute: () => ({ outputs: [2] }),
        },
      }],
      edges: [],
      mappings: [],
      solver: { kind: 'euler', stepSeconds: 0.002 },
      policy: { memory: 'reset', numericFault: 'escalate' },
    };

    const result = buildSemanticModel(fixture);

    expect(result.diagnostics).toEqual([]);
    expect(result.ir!.states.controller.xBridges!.executionOrder).toEqual([
      'constant',
    ]);
    expect(result.ir!.states.controller.xBridges!.operations.constant.parameters)
      .not.toHaveProperty('execute');
    expect(JSON.stringify(result.ir!.states.controller.xBridges)).not.toContain(
      'execute',
    );
  });

  it.each([
    [
      'missing model',
      undefined,
      'XB_MODEL_INVALID',
    ],
    [
      'unsupported block',
      {
        schemaVersion: 1,
        nodes: [{
          id: 'host_only',
          type: 'NOT_REGISTERED',
          parameters: {
            inputs: [],
            outputs: [],
          },
        }],
        edges: [],
        mappings: [],
        solver: { kind: 'euler', stepSeconds: 0.002 },
        policy: { memory: 'reset', numericFault: 'escalate' },
      },
      'XB_BLOCK_NOT_CODEGEN_CAPABLE',
    ],
  ])(
    'prefixes the owning state on %s X-Bridges diagnostics',
    (_caseName, xBridgesModel, expectedCode) => {
      const fixture = hybridXBridgesFixture();
      fixture.states.find((state) => state.id === 'controller')!.xBridgesModel =
        xBridgesModel as any;

      const result = buildSemanticModel(fixture);
      const diagnostic = result.diagnostics.find(
        (item) => item.code === expectedCode,
      );

      expect(result.ir).toBeUndefined();
      expect(diagnostic).toBeDefined();
      expect(diagnostic!.code).toBe(expectedCode);
      expect(diagnostic!.message).toContain('controller');
    },
  );

  it('normalizes an internal transition to a descendant as inner', () => {
    const fixture = nestedAndFixture();
    fixture.transitions.push({
      id: 't_inner',
      sourceId: 'parallel',
      targetId: 'region_a',
      condition: '',
      action: '',
      afterTicks: null,
      type: 'internal',
      isInternal: true,
      hasControlPoint: false,
      order: 1,
    });

    const result = buildSemanticModel(fixture);
    expect(result.diagnostics).toEqual([]);
    expect(result.ir!.transitions.t_inner).toMatchObject({
      kind: 'inner',
      exitStateIds: [],
      entryStateIds: ['region_a'],
    });
  });

  it('converts textual internal transitions into typed semantic transitions', () => {
    const fixture = flatOrFixture();
    fixture.states[0].internalTransitions =
      '[total / count > 1] / ratio = total / count;';

    const result = buildSemanticModel(fixture);
    expect(result.diagnostics).toEqual([]);
    const transitionId = result.ir!.states.a.internalTransitionIds[0];
    expect(result.ir!.transitions[transitionId]).toMatchObject({
      sourceStateId: 'a',
      destinationStateId: 'a',
      kind: 'internal-action',
      guard: { kind: 'binary', operator: '>' },
      actions: [
        expect.objectContaining({ kind: 'assign', target: 'ratio' }),
      ],
    });
    expect(result.ir!.transitionsBySource.a).toContain(transitionId);
  });

  it('rejects undeclared symbols in textual internal transitions', () => {
    const fixture = flatOrFixture();
    fixture.states[0].internalTransitions = '[missing] / ratio = 1;';

    expect(diagnosticCodes(fixture)).toContain('INTERNAL_TRANSITION_INVALID');
  });

  it('rejects an internal transition outside its source hierarchy', () => {
    const fixture = nestedAndFixture();
    fixture.states.push({
      ...fixture.states[0],
      id: 'outside',
      name: 'Outside',
      autostart: false,
      priority: 2,
    });
    fixture.layers.find((layer) => layer.id === 'root')!.stateIds.push('outside');
    fixture.transitions.push({
      id: 't_invalid_inner',
      sourceId: 'parallel',
      targetId: 'outside',
      condition: '',
      action: '',
      afterTicks: null,
      type: 'internal',
      isInternal: true,
      hasControlPoint: false,
      order: 1,
    });

    expect(diagnosticCodes(fixture)).toContain('INNER_DESTINATION_INVALID');
  });

  it('rejects an OR layer without exactly one default path', () => {
    const fixture = flatOrFixture();
    fixture.states.forEach((state) => { state.autostart = false; });

    expect(diagnosticCodes(fixture)).toContain('OR_DEFAULT_PATH_REQUIRED');
  });

  it('rejects duplicate state membership', () => {
    const fixture = flatOrFixture();
    fixture.layers.push({
      id: 'duplicate',
      name: 'Duplicate',
      parentStateId: null,
      decomposition: 'OR',
      stateIds: ['a'],
      transitionIds: [],
      junctionIds: [],
    });

    expect(diagnosticCodes(fixture)).toContain('STATE_DUPLICATE_MEMBERSHIP');
  });

  it('rejects cyclic parent ownership', () => {
    const fixture = flatOrFixture();
    fixture.layers[0].parentStateId = 'a';

    expect(diagnosticCodes(fixture)).toContain('PARENT_HIERARCHY_CYCLE');
  });

  it('rejects duplicate AND priorities', () => {
    const fixture = nestedAndFixture();
    fixture.states.find((state) => state.id === 'region_b')!.priority = 1;

    expect(diagnosticCodes(fixture)).toContain('AND_PRIORITY_DUPLICATE');
  });

  it('rejects a transition path with a dangling target', () => {
    const fixture = flatOrFixture();
    fixture.transitions[0].targetId = 'missing';

    expect(diagnosticCodes(fixture)).toContain('TRANSITION_PATH_DANGLING');
  });

  it('rejects history owned by the root layer', () => {
    const fixture = flatOrFixture();
    fixture.junctions.push({
      id: 'history',
      x: 0,
      y: 0,
      name: 'H',
      color: '#000',
      parentId: 'root',
      type: 'history',
    });
    fixture.layers[0].junctionIds.push('history');

    expect(diagnosticCodes(fixture)).toContain('HISTORY_OWNERSHIP_INVALID');
  });

  it('rejects multiple history semantics for the same containing state', () => {
    const fixture = historyFixture('shallow');
    fixture.junctions.push({
      ...fixture.junctions[0],
      id: 'deep_history',
      name: 'H*',
      type: 'deep-history',
    });
    fixture.layers.find((layer) => layer.id === 'workspace_children')!
      .junctionIds.push('deep_history');

    expect(diagnosticCodes(fixture)).toContain('HISTORY_OWNER_AMBIGUOUS');
  });

  it('rejects duplicate or direction-incompatible I/O mappings', () => {
    const fixture = flatOrFixture();
    fixture.hilConfig = {
      enabled: true,
      target: 'Generic',
      clockSpeed: 1,
      commPort: '',
      baudRate: 115200,
      channels: [{
        id: 'out',
        name: 'Output',
        peripheral: 'GPIO',
        pin: '0',
        direction: 'Out',
        dataType: 'float',
        rangeMin: 0,
        rangeMax: 1,
        scalingFactor: 1,
        unit: '',
      }],
      mappings: [
        { id: 'm1', adiaVarId: 'go', channelId: 'out', direction: 'read' },
        { id: 'm2', adiaVarId: 'go', channelId: 'out', direction: 'read' },
      ],
    };

    expect(diagnosticCodes(fixture)).toEqual(expect.arrayContaining([
      'IO_MAPPING_DIRECTION_INVALID',
      'IO_MAPPING_DUPLICATE',
    ]));
  });

  it('resolves existing name-based I/O mappings to stable variable IDs', () => {
    const fixture = flatOrFixture();
    fixture.variables.find((variable) => variable.name === 'go')!.id = 'var_go';
    fixture.hilConfig = {
      enabled: true,
      target: 'Generic',
      clockSpeed: 1,
      commPort: '',
      baudRate: 115200,
      channels: [{
        id: 'input',
        name: 'Input',
        peripheral: 'GPIO',
        pin: '0',
        direction: 'In',
        dataType: 'bool',
        rangeMin: 0,
        rangeMax: 1,
        scalingFactor: 1,
        unit: '',
      }],
      mappings: [
        { id: 'm1', adiaVarId: 'go', channelId: 'input', direction: 'read' },
      ],
    };

    const result = buildSemanticModel(fixture);
    expect(result.diagnostics).toEqual([]);
    expect(result.ir!.ioMappings[0].variableId).toBe('var_go');
  });

  it('reports undeclared action symbols as diagnostics', () => {
    const fixture = flatOrFixture();
    fixture.states[0].entry = 'missing = 1;';

    expect(diagnosticCodes(fixture)).toContain('ACTION_SYMBOL_INVALID');
  });

  it('rejects malformed initial values and expression type mismatches', () => {
    const fixture = flatOrFixture();
    fixture.variables.find((variable) => variable.name === 'count')!.initialValue = 'oops';
    fixture.states[0].entry = 'go = 2;';
    fixture.transitions[0].condition = 'count + 1';

    expect(diagnosticCodes(fixture)).toEqual(expect.arrayContaining([
      'VARIABLE_INITIAL_VALUE_INVALID',
      'ACTION_TYPE_INVALID',
      'GUARD_TYPE_INVALID',
    ]));
  });

  it('rejects IDs ambiguous across endpoint and generated-C namespaces', () => {
    const fixture = flatOrFixture();
    fixture.junctions.push({
      id: 'a',
      x: 0,
      y: 0,
      name: 'J',
      color: '#000',
      parentId: 'root',
    });
    fixture.layers[0].junctionIds.push('a');
    fixture.states[1].id = 'A';
    fixture.layers[0].stateIds[1] = 'A';
    fixture.transitions[0].targetId = 'A';

    expect(diagnosticCodes(fixture)).toEqual(expect.arrayContaining([
      'ENDPOINT_ID_COLLISION',
      'C_IDENTIFIER_COLLISION',
    ]));
  });

  it('rejects cyclic junction graphs even when one branch reaches a state', () => {
    const fixture = flatOrFixture();
    fixture.junctions.push(
      { id: 'j1', x: 0, y: 0, name: 'J1', color: '#000', parentId: 'root' },
      { id: 'j2', x: 0, y: 0, name: 'J2', color: '#000', parentId: 'root' },
    );
    fixture.layers[0].junctionIds.push('j1', 'j2');
    const base = fixture.transitions[0];
    fixture.transitions = [
      { ...base, id: 'to_j1', targetId: 'j1' },
      { ...base, id: 'j1_j2', sourceId: 'j1', targetId: 'j2' },
      { ...base, id: 'j2_j1', sourceId: 'j2', targetId: 'j1' },
      { ...base, id: 'j2_b', sourceId: 'j2', targetId: 'b' },
    ];

    expect(diagnosticCodes(fixture)).toContain('JUNCTION_PATH_CYCLE');
  });

  it('rejects a default junction with no outgoing path', () => {
    const fixture = flatOrFixture();
    fixture.states[0].autostart = false;
    fixture.junctions.push({
      id: 'default',
      x: 0,
      y: 0,
      name: 'Default',
      color: '#000',
      parentId: 'root',
      autostart: true,
    });
    fixture.layers[0].junctionIds.push('default');

    expect(diagnosticCodes(fixture)).toContain('OR_DEFAULT_PATH_DANGLING');
  });

  it('rejects synthesized internal-transition ID collisions', () => {
    const fixture = flatOrFixture();
    fixture.states[0].internalTransitions = '[go] / ratio = 1;';
    fixture.transitions[0].id = '$internal_a_0';
    fixture.layers[0].transitionIds = ['$internal_a_0'];

    expect(diagnosticCodes(fixture)).toContain(
      'INTERNAL_TRANSITION_ID_COLLISION',
    );
  });

  it('rejects ambiguous variable ID and name aliases', () => {
    const fixture = flatOrFixture();
    fixture.variables[0].id = 'var_go';
    fixture.variables[1].id = 'go';

    expect(diagnosticCodes(fixture)).toContain('SYMBOL_ALIAS_COLLISION');
  });

  it('keeps an explicit ancestor-to-descendant transition external', () => {
    const fixture = nestedAndFixture();
    fixture.transitions.push({
      id: 't_external_descendant',
      sourceId: 'parallel',
      targetId: 'region_a',
      condition: '',
      action: '',
      afterTicks: null,
      type: 'condition',
      hasControlPoint: false,
      order: 1,
    });

    const result = buildSemanticModel(fixture);
    expect(result.diagnostics).toEqual([]);
    expect(result.ir!.transitions.t_external_descendant).toMatchObject({
      kind: 'outer',
      exitStateIds: ['parallel'],
      entryStateIds: ['parallel', 'region_a'],
    });
  });

  it('precomputes complete state-junction-state route LCA paths', () => {
    const fixture = flatOrFixture();
    fixture.junctions.push({
      id: 'decision',
      x: 0,
      y: 0,
      name: 'Decision',
      color: '#000',
      parentId: 'root',
    });
    fixture.layers[0].junctionIds.push('decision');
    fixture.transitions[0].targetId = 'decision';
    fixture.transitions.push({
      ...fixture.transitions[0],
      id: 'decision_b',
      sourceId: 'decision',
      targetId: 'b',
      condition: '',
      action: '',
      order: 2,
    });

    const result = buildSemanticModel(fixture);
    expect(result.diagnostics).toEqual([]);
    expect(result.ir!.transitions.t_ab.routes).toEqual([
      expect.objectContaining({
        transitionIds: ['t_ab', 'decision_b'],
        destinationStateId: 'b',
        exitStateIds: ['a'],
        entryStateIds: ['b'],
      }),
    ]);
    expect(result.ir!.transitions.t_ab.exitStateIds).toEqual(['a']);
    expect(result.ir!.transitions.t_ab.entryStateIds).toEqual(['b']);
  });

  it('normalizes an internal state-junction-descendant route as inner', () => {
    const fixture = nestedAndFixture();
    const childLayer = fixture.layers.find((layer) => layer.id === 'parallel')!;
    childLayer.junctionIds.push('inner_decision');
    fixture.junctions.push({
      id: 'inner_decision',
      x: 0,
      y: 0,
      name: 'Inner decision',
      color: '#000',
      parentId: 'parallel',
    });
    fixture.transitions.push(
      {
        id: 't_inner_junction',
        sourceId: 'parallel',
        targetId: 'inner_decision',
        condition: '',
        action: '',
        afterTicks: null,
        type: 'internal',
        isInternal: true,
        hasControlPoint: false,
        order: 1,
      },
      {
        id: 't_inner_destination',
        sourceId: 'inner_decision',
        targetId: 'region_a',
        condition: '',
        action: '',
        afterTicks: null,
        type: 'condition',
        hasControlPoint: false,
        order: 1,
      },
    );

    const result = buildSemanticModel(fixture);
    expect(result.diagnostics).toEqual([]);
    expect(result.ir!.transitions.t_inner_junction).toMatchObject({
      kind: 'inner',
      exitStateIds: [],
      entryStateIds: ['region_a'],
      routes: [
        expect.objectContaining({
          transitionIds: ['t_inner_junction', 't_inner_destination'],
          destinationStateId: 'region_a',
        }),
      ],
    });
  });

  it('normalizes an internal history-junction route without a state guess', () => {
    const fixture = nestedAndFixture();
    const childLayer = fixture.layers.find((layer) => layer.id === 'parallel')!;
    childLayer.junctionIds.push('history_target');
    fixture.junctions.push({
      id: 'history_target',
      x: 0,
      y: 0,
      name: 'H',
      color: '#000',
      parentId: 'parallel',
      type: 'history',
    });
    fixture.transitions.push({
      id: 't_inner_history',
      sourceId: 'parallel',
      targetId: 'history_target',
      condition: '',
      action: '',
      afterTicks: null,
      type: 'internal',
      isInternal: true,
      hasControlPoint: false,
      order: 1,
    });

    const result = buildSemanticModel(fixture);
    expect(result.diagnostics).toEqual([]);
    expect(result.ir!.transitions.t_inner_history).toMatchObject({
      kind: 'inner',
      routes: [{
        transitionIds: ['t_inner_history'],
        destinationKind: 'history',
        destinationStateId: null,
        destinationJunctionId: 'history_target',
        exitStateIds: [],
        entryStateIds: [],
      }],
    });
  });

  it('normalizes an indirect internal decision-to-history route', () => {
    const fixture = nestedAndFixture();
    const childLayer = fixture.layers.find((layer) => layer.id === 'parallel')!;
    childLayer.junctionIds.push('decision', 'history_target');
    fixture.junctions.push(
      {
        id: 'decision',
        x: 0,
        y: 0,
        name: 'Decision',
        color: '#000',
        parentId: 'parallel',
      },
      {
        id: 'history_target',
        x: 0,
        y: 0,
        name: 'H',
        color: '#000',
        parentId: 'parallel',
        type: 'history',
      },
    );
    fixture.transitions.push(
      {
        id: 't_inner_decision',
        sourceId: 'parallel',
        targetId: 'decision',
        condition: '',
        action: '',
        afterTicks: null,
        type: 'internal',
        isInternal: true,
        hasControlPoint: false,
        order: 1,
      },
      {
        id: 't_decision_history',
        sourceId: 'decision',
        targetId: 'history_target',
        condition: '',
        action: '',
        afterTicks: null,
        type: 'condition',
        hasControlPoint: false,
        order: 1,
      },
    );

    const result = buildSemanticModel(fixture);
    expect(result.diagnostics).toEqual([]);
    expect(result.ir!.transitions.t_inner_decision.routes).toEqual([{
      transitionIds: ['t_inner_decision', 't_decision_history'],
      destinationKind: 'history',
      destinationStateId: null,
      destinationJunctionId: 'history_target',
      exitStateIds: [],
      entryStateIds: [],
    }]);
  });

  it.each(['shallow', 'deep'] as const)(
    'normalizes reentry to a state containing %s history',
    (kind) => {
      const model = historyFixture(kind);
      const historyId = `${kind}_history`;
      const restore = model.transitions.find(
        (transition) => transition.id === 'restore_workspace',
      )!;
      restore.targetId = 'workspace';

      const result = buildSemanticModel(model);

      expect(result.diagnostics).not.toContainEqual(expect.objectContaining({
        code: 'HISTORY_JUNCTION_UNWIRED',
      }));
      expect(result.ir).toBeDefined();
      expect(result.ir!.transitions.restore_workspace.routes[0]).toMatchObject({
        destinationKind: 'history',
        destinationStateId: 'workspace',
        destinationJunctionId: historyId,
      });
    },
  );

  it('accepts UI-schema history ownership by parent state ID', () => {
    const fixture = nestedAndFixture();
    const childLayer = fixture.layers.find((layer) => layer.id === 'parallel')!;
    childLayer.id = 'parallel_layer';
    childLayer.name = 'Parallel layer';
    childLayer.decomposition = 'OR';
    fixture.states.find((state) => state.id === 'region_a')!.autostart = true;
    childLayer.junctionIds.push('history');
    fixture.junctions.push({
      id: 'history',
      x: 0,
      y: 0,
      name: 'H',
      color: '#000',
      parentId: 'parallel',
      type: 'history',
    });

    expect(diagnosticCodes(fixture)).not.toContain('HISTORY_OWNERSHIP_INVALID');
  });

  it('rejects negative explicit temporal thresholds', () => {
    const fixture = flatOrFixture();
    fixture.transitions[0].type = 'after';
    fixture.transitions[0].afterTicks = -1;

    expect(diagnosticCodes(fixture)).toContain('TEMPORAL_THRESHOLD_INVALID');
  });

  it('requires thresholds for explicit temporal trigger modes', () => {
    for (const type of ['after', 'and', 'or'] as const) {
      const fixture = flatOrFixture();
      fixture.transitions[0].type = type;
      fixture.transitions[0].afterTicks = null;
      expect(diagnosticCodes(fixture)).toContain('TEMPORAL_THRESHOLD_REQUIRED');
    }
  });

  it('rejects a zero explicit temporal threshold', () => {
    const fixture = flatOrFixture();
    fixture.transitions[0].type = 'after';
    fixture.transitions[0].afterTicks = 0;

    expect(diagnosticCodes(fixture)).toContain('TEMPORAL_THRESHOLD_INVALID');
  });

  it('canonicalizes action targets and expression variables to stable IDs', () => {
    const fixture = flatOrFixture();
    fixture.variables[0].id = 'var_go';
    fixture.states[0].entry = 'go = false;';

    const result = buildSemanticModel(fixture);
    expect(result.diagnostics).toEqual([]);
    expect(result.ir!.states.a.entryActions[0].target).toBe('var_go');
    expect(result.ir!.transitions.t_ab.guard).toMatchObject({
      kind: 'variable',
      name: 'var_go',
      cName: 'go',
    });
  });

  it('rejects a default junction route escaping its OR container subtree', () => {
    const fixture = flatOrFixture();
    const template = fixture.states[1];
    fixture.states.push(
      { ...template, id: 'c', name: 'C', autostart: false, priority: 1 },
      { ...template, id: 'd', name: 'D', autostart: false, priority: 2 },
    );
    fixture.junctions.push({
      id: 'child_default',
      x: 0,
      y: 0,
      name: 'Child Default',
      color: '#000',
      parentId: 'a',
      autostart: true,
    });
    fixture.layers.push({
      id: 'a_children',
      name: 'A children',
      parentStateId: 'a',
      decomposition: 'OR',
      stateIds: ['c', 'd'],
      transitionIds: ['child_default_b'],
      junctionIds: ['child_default'],
    });
    fixture.transitions.push({
      ...fixture.transitions[0],
      id: 'child_default_b',
      sourceId: 'child_default',
      targetId: 'b',
      condition: '',
      action: '',
      order: 2,
    });

    expect(diagnosticCodes(fixture)).toContain(
      'OR_DEFAULT_PATH_ESCAPES_CONTAINER',
    );
  });

  it('rejects conversion output type mismatches and duplicate mapping IDs', () => {
    const fixture = flatOrFixture();
    fixture.hilConfig = {
      enabled: true,
      target: 'Generic',
      clockSpeed: 1,
      commPort: '',
      baudRate: 115200,
      channels: [
        {
          id: 'numeric_in',
          name: 'Numeric input',
          peripheral: 'ADC',
          pin: '0',
          direction: 'In',
          dataType: 'float',
          rangeMin: 0,
          rangeMax: 1,
          scalingFactor: 1,
          unit: '',
        },
        {
          id: 'bool_in',
          name: 'Bool input',
          peripheral: 'GPIO',
          pin: '1',
          direction: 'In',
          dataType: 'bool',
          rangeMin: 0,
          rangeMax: 1,
          scalingFactor: 1,
          unit: '',
        },
      ],
      mappings: [
        {
          id: 'duplicate',
          adiaVarId: 'go',
          channelId: 'numeric_in',
          direction: 'read',
          conversionExpr: 'x + 1',
        },
        {
          id: 'duplicate',
          adiaVarId: 'total',
          channelId: 'bool_in',
          direction: 'read',
        },
      ],
    };

    expect(diagnosticCodes(fixture)).toEqual(expect.arrayContaining([
      'IO_MAPPING_CONVERSION_TYPE_INVALID',
      'IO_MAPPING_ID_DUPLICATE',
    ]));
  });
});
