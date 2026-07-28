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
