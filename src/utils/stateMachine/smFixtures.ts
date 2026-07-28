import type { StateData, TransitionData, VariableDef } from '../../types/sm_types';
import {
  CURRENT_SM_SCHEMA_VERSION,
  type StateMachineLayerV4,
  type StateMachineModelV4,
} from './smModel';

const state = (
  id: string,
  overrides: Partial<StateData> = {},
): StateData => ({
  id,
  name: id,
  x: 0,
  y: 0,
  width: 100,
  height: 60,
  entry: '',
  during: '',
  exit: '',
  isActive: false,
  color: '#000000',
  parentId: null,
  children: [],
  priority: 1,
  isParallel: false,
  regionId: null,
  autostart: false,
  ...overrides,
});

const transition = (
  id: string,
  sourceId: string,
  targetId: string,
  overrides: Partial<TransitionData> = {},
): TransitionData => ({
  id,
  sourceId,
  targetId,
  condition: '',
  action: '',
  afterTicks: null,
  type: 'condition',
  hasControlPoint: false,
  order: 1,
  ...overrides,
});

const layer = (
  id: string,
  parentStateId: string | null,
  decomposition: 'OR' | 'AND',
  stateIds: string[],
  transitionIds: string[] = [],
): StateMachineLayerV4 => ({
  id,
  name: id,
  parentStateId,
  decomposition,
  stateIds,
  transitionIds,
  junctionIds: [],
});

const variables = (): VariableDef[] => [
  {
    id: 'go',
    name: 'go',
    type: 'bool',
    initialValue: 'false',
    currentValue: false,
    visibleInScope: true,
  },
  {
    id: 'total',
    name: 'total',
    type: 'double',
    initialValue: '0',
    currentValue: 0,
    visibleInScope: true,
  },
  {
    id: 'count',
    name: 'count',
    type: 'double',
    initialValue: '1',
    currentValue: 1,
    visibleInScope: true,
  },
  {
    id: 'ratio',
    name: 'ratio',
    type: 'double',
    initialValue: '0',
    currentValue: 0,
    visibleInScope: true,
  },
];

const counterVariable = (): VariableDef => ({
  id: 'counter',
  name: 'counter',
  type: 'double',
  initialValue: '0',
  currentValue: 0,
  visibleInScope: true,
});

export const flatOrFixture = (): StateMachineModelV4 => ({
  schemaVersion: CURRENT_SM_SCHEMA_VERSION,
  tickMs: 10,
  states: [
    state('a', { name: 'A', autostart: true, priority: 1 }),
    state('b', { name: 'B', priority: 2 }),
  ],
  junctions: [],
  transitions: [
    transition('t_ab', 'a', 'b', { condition: 'go', action: 'ratio = total / count;' }),
  ],
  variables: variables(),
  layers: [layer('root', null, 'OR', ['a', 'b'], ['t_ab'])],
  safetyMode: false,
});

export const nestedAndFixture = (): StateMachineModelV4 => ({
  schemaVersion: CURRENT_SM_SCHEMA_VERSION,
  tickMs: 10,
  states: [
    state('parallel', { name: 'Parallel', autostart: true, priority: 1 }),
    state('region_b', { name: 'Region B', priority: 2 }),
    state('region_a', { name: 'Region A', priority: 1 }),
  ],
  junctions: [],
  transitions: [],
  variables: variables(),
  layers: [
    layer('root', null, 'OR', ['parallel']),
    layer('parallel', 'parallel', 'AND', ['region_b', 'region_a']),
  ],
  safetyMode: false,
});

export type InterpreterFixtureName =
  | 'exit-action-entry'
  | 'outer-during-inner'
  | 'ancestor-destination'
  | 'transition-priority'
  | 'external-self'
  | 'internal-action'
  | 'atomic-junction'
  | 'reset';

export const interpreterFixture = (
  name: InterpreterFixtureName,
): StateMachineModelV4 => {
  const model = flatOrFixture();
  model.variables.push(counterVariable());

  switch (name) {
    case 'exit-action-entry':
      model.states[0].exit = 'counter = counter + 1;';
      model.states[1].entry = 'counter = counter + 100;';
      model.transitions[0].action = 'counter = counter + 10;';
      return model;

    case 'outer-during-inner':
      model.variables.push(
        {
          id: 'outer',
          name: 'outer',
          type: 'bool',
          initialValue: 'false',
          currentValue: false,
          visibleInScope: true,
        },
        {
          id: 'inner',
          name: 'inner',
          type: 'bool',
          initialValue: 'false',
          currentValue: false,
          visibleInScope: true,
        },
      );
      model.states[0].during = 'counter = counter + 1;';
      model.states.push(
        state('a1', { name: 'A1', parentId: 'a', autostart: true }),
        state('a2', { name: 'A2', parentId: 'a', priority: 2 }),
      );
      model.layers.push(
        layer('a_children', 'a', 'OR', ['a1', 'a2'], ['inner_a']),
      );
      model.transitions[0].condition = 'outer';
      model.transitions.push(
        transition('inner_a', 'a', 'a2', {
          condition: 'inner',
          action: 'counter = counter + 10;',
          type: 'internal',
          isInternal: true,
        }),
      );
      return model;

    case 'ancestor-destination':
      model.states.push(
        state('a1', {
          name: 'A1',
          parentId: 'a',
          autostart: true,
          entry: 'counter = counter + 1;',
          exit: 'counter = counter + 10;',
        }),
      );
      model.layers.push(
        layer('a_children', 'a', 'OR', ['a1'], ['to_ancestor']),
      );
      model.transitions = [
        transition('to_ancestor', 'a1', 'a', {
          condition: 'go',
          action: 'counter = counter + 100;',
        }),
      ];
      model.layers[0].transitionIds = [];
      return model;

    case 'transition-priority':
      model.states.push(state('c', { name: 'C', priority: 3 }));
      model.layers[0].stateIds.push('c');
      model.transitions[0].order = 2;
      model.transitions[0].condition = 'true';
      model.transitions.push(
        transition('t_ac', 'a', 'c', {
          condition: 'true',
          order: 1,
        }),
      );
      model.layers[0].transitionIds.push('t_ac');
      return model;

    case 'external-self':
      model.states[0].entry = 'counter = counter + 10;';
      model.states[0].exit = 'counter = counter + 1;';
      model.transitions[0] = transition('external_a', 'a', 'a', {
        condition: 'go',
      });
      model.layers[0].transitionIds = ['external_a'];
      return model;

    case 'internal-action':
      model.transitions[0] = transition('internal_a', 'a', 'a', {
        condition: 'go',
        action: 'counter = counter + 1;',
        type: 'internal',
        isInternal: true,
      });
      model.layers[0].transitionIds = ['internal_a'];
      return model;

    case 'atomic-junction':
      model.states.push(state('c', { name: 'C', priority: 3 }));
      model.layers[0].stateIds.push('c');
      model.junctions.push(
        {
          id: 'decision',
          x: 0,
          y: 0,
          name: 'Decision',
          color: '#000000',
          parentId: 'root',
        },
        {
          id: 'dead_end',
          x: 0,
          y: 0,
          name: 'Dead end',
          color: '#000000',
          parentId: 'root',
        },
      );
      model.layers[0].junctionIds.push('decision', 'dead_end');
      model.transitions = [
        transition('to_decision', 'a', 'decision', {
          condition: 'go',
          action: 'counter = counter + 1;',
        }),
        transition('rejected_branch', 'decision', 'dead_end', {
          condition: 'true',
          action: 'counter = counter + 100;',
          order: 1,
        }),
        transition('dead_end_rejects', 'dead_end', 'c', {
          condition: 'false',
          order: 1,
        }),
        transition('selected_branch', 'decision', 'b', {
          condition: 'true',
          action: 'counter = counter + 10;',
          order: 2,
        }),
      ];
      model.layers[0].transitionIds = model.transitions.map(
        (item) => item.id,
      );
      return model;

    case 'reset':
      model.states[0].entry = 'ratio = 2;';
      model.states[0].exit = 'ratio = 1;';
      model.transitions = [];
      model.layers[0].transitionIds = [];
      return model;
  }
};
