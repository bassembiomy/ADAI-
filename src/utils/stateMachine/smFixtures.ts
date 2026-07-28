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

export type ParallelHistoryFixtureName =
  | 'parallel-order'
  | 'parallel-parent-exit'
  | 'parallel-terminal'
  | 'timing-boundary';

const taskFourVariables = (): VariableDef[] => [
  ...variables(),
  {
    id: 'leave',
    name: 'leave',
    type: 'bool',
    initialValue: 'false',
    currentValue: false,
    visibleInScope: true,
  },
];

const parallelShell = (): StateMachineModelV4 => ({
  schemaVersion: CURRENT_SM_SCHEMA_VERSION,
  tickMs: 10,
  states: [
    state('PARENT', {
      name: 'ParallelParent',
      autostart: true,
      entry: '',
      exit: 'total = total + 1;',
    }),
    state('OUTSIDE', {
      name: 'Outside',
      priority: 2,
      entry: 'total = total + 1;',
    }),
    state('R1', {
      name: 'R1',
      parentId: 'PARENT',
      priority: 1,
      during: 'total = total + 1;',
      exit: 'total = total + 1;',
    }),
    state('R2', {
      name: 'R2',
      parentId: 'PARENT',
      priority: 2,
      during: 'total = total + 1;',
      exit: 'total = total + 1;',
    }),
    state('R3', {
      name: 'R3',
      parentId: 'PARENT',
      priority: 3,
      during: 'total = total + 1;',
      exit: 'total = total + 1;',
    }),
  ],
  junctions: [],
  transitions: [],
  variables: taskFourVariables(),
  layers: [
    layer('root', null, 'OR', ['PARENT', 'OUTSIDE']),
    layer('parallel_regions', 'PARENT', 'AND', ['R1', 'R2', 'R3']),
  ],
  safetyMode: false,
});

export const parallelHistoryFixture = (
  name: ParallelHistoryFixtureName,
): StateMachineModelV4 => {
  if (name === 'timing-boundary') {
    return {
      schemaVersion: CURRENT_SM_SCHEMA_VERSION,
      tickMs: 10,
      states: [
        state('TIMED', { autostart: true }),
        state('DONE', { priority: 2 }),
      ],
      junctions: [],
      transitions: [
        transition('after_three', 'TIMED', 'DONE', {
          type: 'after',
          afterTicks: 3,
        }),
      ],
      variables: variables(),
      layers: [layer('root', null, 'OR', ['TIMED', 'DONE'], ['after_three'])],
      safetyMode: false,
    };
  }

  const model = parallelShell();
  if (name === 'parallel-parent-exit') {
    model.transitions.push(
      transition('leave_parent', 'R1', 'OUTSIDE', { condition: 'leave' }),
    );
    model.layers.find((item) => item.id === 'parallel_regions')!
      .transitionIds.push('leave_parent');
    return model;
  }

  if (name === 'parallel-terminal') {
    const terminal = model.states.find((item) => item.id === 'R1')!;
    terminal.id = 'TERMINAL_CHILD';
    terminal.name = 'terminal_child';
    terminal.isTerminalState = true;
    terminal.during = 'total = total + 100;';
    const worker = model.states.find((item) => item.id === 'R2')!;
    worker.id = 'WORKER';
    worker.name = 'worker';
    model.states = model.states.filter((item) => item.id !== 'R3');
    model.layers.find((item) => item.id === 'parallel_regions')!.stateIds = [
      'TERMINAL_CHILD',
      'WORKER',
    ];
  }
  return model;
};

export type HistoryFixtureKind = 'shallow' | 'deep';

const historyVariables = (): VariableDef[] => [
  ...variables(),
  ...['select_a', 'advance_nested', 'advance_left', 'advance_right', 'leave']
    .map((id): VariableDef => ({
      id,
      name: id,
      type: 'bool',
      initialValue: 'false',
      currentValue: false,
      visibleInScope: true,
    })),
];

export const historyFixture = (
  kind: HistoryFixtureKind,
): StateMachineModelV4 => {
  const historyId = `${kind}_history`;
  const transitions = [
    transition('select_a', 'parent_b', 'parent_a', {
      condition: 'select_a',
    }),
    transition('advance_nested', 'nested_default', 'nested_previous', {
      condition: 'advance_nested',
    }),
    transition('advance_left', 'parallel_left_default', 'parallel_left_previous', {
      condition: 'advance_left',
    }),
    transition(
      'advance_right',
      'parallel_right_default',
      'parallel_right_previous',
      { condition: 'advance_right' },
    ),
    transition('leave_workspace', 'workspace', 'outside', {
      condition: 'leave',
    }),
    transition('restore_workspace', 'outside', historyId, {
      condition: 'go',
    }),
  ];

  return {
    schemaVersion: CURRENT_SM_SCHEMA_VERSION,
    tickMs: 10,
    states: [
      state('workspace', { autostart: true }),
      state('outside', { priority: 2 }),
      state('parent_a', { parentId: 'workspace', priority: 1 }),
      state('parent_b', {
        parentId: 'workspace',
        priority: 2,
        autostart: true,
      }),
      state('nested_default', {
        parentId: 'parent_a',
        autostart: true,
      }),
      state('nested_previous', {
        parentId: 'parent_a',
        priority: 2,
      }),
      state('parallel_left', {
        parentId: 'parent_a',
        priority: 1,
      }),
      state('parallel_right', {
        parentId: 'parent_a',
        priority: 2,
      }),
      state('parallel_left_default', {
        parentId: 'parallel_left',
        autostart: true,
      }),
      state('parallel_left_previous', {
        parentId: 'parallel_left',
        priority: 2,
      }),
      state('parallel_right_default', {
        parentId: 'parallel_right',
        autostart: true,
      }),
      state('parallel_right_previous', {
        parentId: 'parallel_right',
        priority: 2,
      }),
    ],
    junctions: [{
      id: historyId,
      x: 0,
      y: 0,
      name: historyId,
      color: '#000000',
      parentId: 'workspace',
      type: kind === 'deep' ? 'deep-history' : 'history',
    }],
    transitions,
    variables: historyVariables(),
    layers: [
      layer(
        'root',
        null,
        'OR',
        ['workspace', 'outside'],
        ['leave_workspace', 'restore_workspace'],
      ),
      {
        ...layer(
          'workspace_children',
          'workspace',
          'OR',
          ['parent_a', 'parent_b'],
          ['select_a'],
        ),
        junctionIds: [historyId],
      },
      layer(
        'nested_choice',
        'parent_a',
        'OR',
        ['nested_default', 'nested_previous'],
        ['advance_nested'],
      ),
      layer(
        'parallel_regions',
        'parent_a',
        'AND',
        ['parallel_left', 'parallel_right'],
      ),
      layer(
        'parallel_left_choice',
        'parallel_left',
        'OR',
        ['parallel_left_default', 'parallel_left_previous'],
        ['advance_left'],
      ),
      layer(
        'parallel_right_choice',
        'parallel_right',
        'OR',
        ['parallel_right_default', 'parallel_right_previous'],
        ['advance_right'],
      ),
    ],
    safetyMode: false,
  };
};

export type DifferentialFixtureName =
  | 'flat-priority'
  | 'nested-cross-boundary'
  | 'external-self'
  | 'internal-action'
  | 'inner-descendant'
  | 'inner-history'
  | 'parallel-independent'
  | 'parallel-parent-exit'
  | 'shallow-history'
  | 'deep-history-and'
  | 'junction-backtracking'
  | 'temporal-exact-boundary'
  | 'terminal-or'
  | 'terminal-and-sibling'
  | 'reset'
  | 'safe-output-fault';

export type DifferentialScenarioStep =
  | {
      kind: 'step';
      elapsedMs?: number;
      inputs?: Readonly<Record<string, number | boolean>>;
    }
  | { kind: 'reset' }
  | { kind: 'fault' };

export interface DifferentialFixture {
  name: DifferentialFixtureName;
  model: StateMachineModelV4;
  steps: readonly DifferentialScenarioStep[];
}

const historySteps = (): DifferentialScenarioStep[] => [
  { kind: 'step', inputs: { select_a: true } },
  { kind: 'step', inputs: { select_a: false, advance_nested: true } },
  { kind: 'step', inputs: { advance_nested: false, advance_left: true } },
  { kind: 'step', inputs: { advance_left: false, advance_right: true } },
  { kind: 'step', inputs: { advance_right: false, leave: true } },
  { kind: 'step', inputs: { leave: false, go: true } },
];

const terminalOrFixture = (): StateMachineModelV4 => {
  const model = flatOrFixture();
  model.states[0].isTerminalState = true;
  model.states[0].during = 'total = total + 100;';
  model.transitions = [];
  model.layers[0].transitionIds = [];
  return model;
};

const withMotorOutput = (
  model: StateMachineModelV4,
): StateMachineModelV4 => {
  model.variables.push({
    id: 'output_enable',
    name: 'output_enable',
    type: 'bool',
    initialValue: 'false',
    currentValue: false,
    visibleInScope: true,
  });
  model.hilConfig = {
    enabled: true,
    target: 'Generic',
    clockSpeed: 1,
    commPort: '',
    baudRate: 115200,
    channels: [{
      id: 'motor',
      name: 'Motor',
      peripheral: 'GPIO',
      pin: '0',
      direction: 'Out',
      dataType: 'bool',
      rangeMin: 0,
      rangeMax: 1,
      scalingFactor: 1,
      unit: '',
    }],
    mappings: [{
      id: 'write_motor',
      adiaVarId: 'output_enable',
      channelId: 'motor',
      direction: 'write',
      safeValue: false,
    }],
  };
  return model;
};

const safeOutputFaultFixture = (): StateMachineModelV4 => {
  const model = withMotorOutput(flatOrFixture());
  model.safetyMode = true;
  model.states[0].id = 'run';
  model.states[0].name = 'Run';
  model.states[0].exit = 'total = total + 1;';
  model.states[1].id = 'safe';
  model.states[1].name = 'Safe';
  model.states[1].isSafeState = true;
  model.states[1].entry = 'total = total + 10;';
  model.transitions = [];
  model.layers[0].stateIds = ['run', 'safe'];
  model.layers[0].transitionIds = [];
  return model;
};

const innerHistoryFixture = (): StateMachineModelV4 => {
  const model = historyFixture('shallow');
  model.transitions.push(
    transition('inner_restore_history', 'workspace', 'shallow_history', {
      condition: 'go',
      type: 'internal',
      isInternal: true,
    }),
  );
  return model;
};

export const semanticFixture = (
  name: DifferentialFixtureName,
): DifferentialFixture => {
  switch (name) {
    case 'flat-priority':
      return {
        name,
        model: interpreterFixture('transition-priority'),
        steps: [{ kind: 'step' }],
      };
    case 'nested-cross-boundary':
      return {
        name,
        model: interpreterFixture('ancestor-destination'),
        steps: [{ kind: 'step', inputs: { go: true } }],
      };
    case 'external-self':
      return {
        name,
        model: interpreterFixture('external-self'),
        steps: [{ kind: 'step', inputs: { go: true } }],
      };
    case 'internal-action':
      return {
        name,
        model: interpreterFixture('internal-action'),
        steps: [{ kind: 'step', inputs: { go: true } }],
      };
    case 'inner-descendant':
      return {
        name,
        model: interpreterFixture('outer-during-inner'),
        steps: [{ kind: 'step', inputs: { inner: true } }],
      };
    case 'inner-history':
      return {
        name,
        model: innerHistoryFixture(),
        steps: [
          { kind: 'step', inputs: { select_a: true } },
          { kind: 'step', inputs: { select_a: false, go: true } },
        ],
      };
    case 'shallow-history':
      return { name, model: historyFixture('shallow'), steps: historySteps() };
    case 'parallel-independent':
      return {
        name,
        model: parallelHistoryFixture('parallel-order'),
        steps: [{ kind: 'step' }, { kind: 'step' }],
      };
    case 'parallel-parent-exit':
      return {
        name,
        model: parallelHistoryFixture('parallel-parent-exit'),
        steps: [{ kind: 'step', inputs: { leave: true } }],
      };
    case 'deep-history-and':
      return { name, model: historyFixture('deep'), steps: historySteps() };
    case 'junction-backtracking':
      return {
        name,
        model: interpreterFixture('atomic-junction'),
        steps: [{ kind: 'step', inputs: { go: true } }],
      };
    case 'temporal-exact-boundary':
      return {
        name,
        model: parallelHistoryFixture('timing-boundary'),
        steps: [{ kind: 'step' }, { kind: 'step' }, { kind: 'step' }],
      };
    case 'terminal-or':
      return {
        name,
        model: terminalOrFixture(),
        steps: [{ kind: 'step' }, { kind: 'step' }],
      };
    case 'terminal-and-sibling':
      return {
        name,
        model: parallelHistoryFixture('parallel-terminal'),
        steps: [{ kind: 'step' }, { kind: 'step' }],
      };
    case 'reset':
      return {
        name,
        model: withMotorOutput(interpreterFixture('reset')),
        steps: [
          {
            kind: 'step',
            inputs: { total: 7, go: true, output_enable: true },
          },
          { kind: 'reset' },
        ],
      };
    case 'safe-output-fault':
      return {
        name,
        model: safeOutputFaultFixture(),
        steps: [
          { kind: 'step', inputs: { output_enable: true } },
          { kind: 'fault' },
        ],
      };
  }
};
