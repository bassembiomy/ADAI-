/**
 * Representative appliance controller model and test fixtures shared across OPM engine tests.
 */

import type { AppNode, AppEdge } from '../../components/entropy/EntropyTypes';
import {
  createDefaultOpmExecutionConfig,
  type OpmAssignmentOperator,
  type OpmAttribute,
  type OpmExecutionConfig,
  type OpmScalarType,
  type OpmTargetSettings,
} from './executableTypes';
import type { OpmEditorLinkType } from './editorBoundaryTypes';
import type { ExecutableOpmModel } from './pipeline';
import type { OpmScenarioStep } from './conformanceTypes';

export function makeApplianceFixture(): {
  nodes: AppNode[];
  edges: AppEdge[];
  config: OpmExecutionConfig;
} {
  const config = createDefaultOpmExecutionConfig();
  config.events = [
    { id: 'ev_start', displayName: 'Start', cIdentifier: 'ev_start' },
    { id: 'ev_stop', displayName: 'Stop', cIdentifier: 'ev_stop' },
    { id: 'ev_door_open', displayName: 'Door Open', cIdentifier: 'ev_door_open' },
  ];
  config.enums = [
    {
      id: 'enum_mode',
      displayName: 'Mode',
      cIdentifier: 'OpmMode',
      members: [
        { id: 'mode_idle', displayName: 'Idle', cIdentifier: 'OPM_MODE_IDLE', value: 0 },
        { id: 'mode_running', displayName: 'Running', cIdentifier: 'OPM_MODE_RUNNING', value: 1 },
        { id: 'mode_fault', displayName: 'Fault', cIdentifier: 'OPM_MODE_FAULT', value: 2 },
      ],
    },
  ];

  const nodes: AppNode[] = [
    {
      id: 'obj_boiler',
      type: 'opmObject',
      position: { x: 100, y: 100 },
      data: {
        name: 'Boiler',
        type: 'object',
        physical: true,
        objectExecution: {
          enabled: true,
          attributes: [
            {
              id: 'temp',
              displayName: 'Temperature',
              cIdentifier: 'temp',
              type: { kind: 'float32' },
              initialValue: 20.0,
              minimum: 0.0,
              maximum: 100.0,
              overflow: 'saturate',
              access: 'readWrite',
              persistent: false,
              hardwareMapping: { direction: 'input', symbol: 'ADC_TEMP' },
            },
            {
              id: 'pressure',
              displayName: 'Pressure',
              cIdentifier: 'pressure',
              type: { kind: 'int32' },
              initialValue: 100,
              overflow: 'wrap',
              access: 'readWrite',
              persistent: false,
            },
            {
              id: 'mode',
              displayName: 'Boiler Mode',
              cIdentifier: 'boiler_mode',
              type: { kind: 'enum', enumId: 'enum_mode' },
              initialValue: 'mode_idle',
              overflow: 'diagnostic',
              access: 'readWrite',
              persistent: false,
            },
          ],
        },
      },
    },
    {
      id: 'st_boiler_off',
      type: 'opmState',
      parentId: 'obj_boiler',
      position: { x: 120, y: 120 },
      data: {
        name: 'Off',
        type: 'state',
        physical: false,
        isInitial: true,
        parentId: 'obj_boiler',
        stateExecution: {
          enabled: true,
          initial: true,
          terminal: false,
          entryAssignments: [
            {
              id: 'asgn_off_mode',
              targetAttributeId: 'mode',
              operator: '=',
              expression: 'mode_idle',
              enabled: true,
            },
          ],
          exitAssignments: [],
        },
      },
    },
    {
      id: 'st_boiler_heating',
      type: 'opmState',
      parentId: 'obj_boiler',
      position: { x: 200, y: 120 },
      data: {
        name: 'Heating',
        type: 'state',
        physical: false,
        isInitial: false,
        parentId: 'obj_boiler',
        stateExecution: {
          enabled: true,
          initial: false,
          terminal: false,
          entryAssignments: [],
          exitAssignments: [],
          timeoutMs: 5000,
          timeoutEventId: 'ev_stop',
        },
      },
    },
    {
      id: 'proc_heat',
      type: 'opmProcess',
      position: { x: 350, y: 100 },
      data: {
        name: 'Heat Water',
        type: 'process',
        physical: false,
        processExecution: {
          enabled: true,
          activation: 'cyclic',
          inputAttributeIds: ['temp'],
          outputAttributeIds: ['temp'],
          guard: 'temp < 90.0',
          assignments: [
            {
              id: 'asgn_heat_temp',
              targetAttributeId: 'temp',
              operator: '+=',
              expression: '0.5',
              enabled: true,
            },
          ],
          priority: 2,
          periodMs: 100,
          debounceMs: 0,
          reentrancy: 'reject',
        },
      },
    },
  ];

  const edges: AppEdge[] = [
    {
      id: 'edge_heat_effect',
      source: 'proc_heat',
      target: 'obj_boiler',
      type: 'effect',
      data: {
        type: 'effect',
        linkExecution: {
          enabled: true,
          guard: '',
          assignments: [],
          priority: 1,
          delayMs: 0,
        },
      },
    },
    {
      id: 'edge_start_trigger',
      source: 'st_boiler_off',
      target: 'proc_heat',
      type: 'trigger',
      data: {
        type: 'trigger',
        linkExecution: {
          enabled: true,
          guard: '',
          eventId: 'ev_start',
          assignments: [],
          transition: {
            ownerObjectId: 'obj_boiler',
            sourceStateId: 'st_boiler_off',
            targetStateId: 'st_boiler_heating',
          },
          priority: 1,
          delayMs: 0,
        },
      },
    },
  ];

  return { nodes, edges, config };
}

export function nodesWithNames(...names: string[]): AppNode[] {
  return names.map((name, index) => ({
    id: `node_${index}`,
    type: 'opmObject',
    position: { x: index * 100, y: 0 },
    data: {
      name,
      type: 'object',
      physical: false,
      objectExecution: {
        enabled: true,
        attributes: [],
      },
    },
  }));
}

export function twoInitialStates(): { nodes: AppNode[]; edges: AppEdge[]; config: OpmExecutionConfig } {
  const f = makeApplianceFixture();
  // Mark both states as initial
  f.nodes[1].data.isInitial = true;
  f.nodes[1].data.stateExecution!.initial = true;
  f.nodes[2].data.isInitial = true;
  f.nodes[2].data.stateExecution!.initial = true;
  return f;
}

export function noInitialState(): { nodes: AppNode[]; edges: AppEdge[]; config: OpmExecutionConfig } {
  const f = makeApplianceFixture();
  // Mark neither state as initial
  f.nodes[1].data.isInitial = false;
  f.nodes[1].data.stateExecution!.initial = false;
  f.nodes[2].data.isInitial = false;
  f.nodes[2].data.stateExecution!.initial = false;
  return f;
}

export function crossOwnerTransition(): { nodes: AppNode[]; edges: AppEdge[]; config: OpmExecutionConfig } {
  const f = makeApplianceFixture();
  // Transition targets state belonging to another object
  const otherObj: AppNode = {
    id: 'obj_other',
    type: 'opmObject',
    position: { x: 500, y: 100 },
    data: {
      name: 'Other',
      type: 'object',
      physical: false,
      objectExecution: { enabled: true, attributes: [] },
    },
  };
  const otherState: AppNode = {
    id: 'st_other',
    type: 'opmState',
    parentId: 'obj_other',
    position: { x: 520, y: 120 },
    data: {
      name: 'OtherState',
      type: 'state',
      physical: false,
      parentId: 'obj_other',
      stateExecution: {
        enabled: true,
        initial: true,
        terminal: false,
        entryAssignments: [],
        exitAssignments: [],
      },
    },
  };
  f.nodes.push(otherObj, otherState);
  f.edges[1].data!.linkExecution!.transition = {
    ownerObjectId: 'obj_boiler',
    sourceStateId: 'st_boiler_off',
    targetStateId: 'st_other', // Mismatch: st_other belongs to obj_other, not obj_boiler!
  };
  return f;
}

export function equalPriorityWrites(): { nodes: AppNode[]; edges: AppEdge[]; config: OpmExecutionConfig } {
  const f = makeApplianceFixture();
  // Add another process with equal priority writing to 'temp'
  const proc2: AppNode = {
    id: 'proc_cool',
    type: 'opmProcess',
    position: { x: 350, y: 250 },
    data: {
      name: 'Cool Water',
      type: 'process',
      physical: false,
      processExecution: {
        enabled: true,
        activation: 'cyclic',
        inputAttributeIds: ['temp'],
        outputAttributeIds: ['temp'],
        guard: '',
        assignments: [
          {
            id: 'asgn_cool_temp',
            targetAttributeId: 'temp',
            operator: '-=',
            expression: '0.5',
            enabled: true,
          },
        ],
        priority: 2, // Equal to proc_heat's priority 2!
        periodMs: 100,
        debounceMs: 0,
        reentrancy: 'reject',
      },
    },
  };
  f.nodes.push(proc2);
  return f;
}

export function unreachableState(): { nodes: AppNode[]; edges: AppEdge[]; config: OpmExecutionConfig } {
  const f = makeApplianceFixture();
  // Add a 3rd state that has no transitions leading to it
  const st3: AppNode = {
    id: 'st_unreachable',
    type: 'opmState',
    parentId: 'obj_boiler',
    position: { x: 250, y: 120 },
    data: {
      name: 'Unreachable',
      type: 'state',
      physical: false,
      isInitial: false,
      parentId: 'obj_boiler',
      stateExecution: {
        enabled: true,
        initial: false,
        terminal: false,
        entryAssignments: [],
        exitAssignments: [],
      },
    },
  };
  f.nodes.push(st3);
  return f;
}

// ---------------------------------------------------------------------------
// Task 5 conformance fixtures: deterministic exercise + contention models for
// TypeScript-vs-C differential parity. Attribute ids equal their C
// identifiers to keep snapshot keying trivial; every expression uses exactly
// representable values so float32 bit-parity holds on both runtimes.
// ---------------------------------------------------------------------------

function conformanceAttr(
  id: string,
  kind: 'bool' | 'int32' | 'float32' | 'enum',
  initialValue: OpmAttribute['initialValue'],
  extra: Partial<OpmAttribute> = {},
): OpmAttribute {
  const type: OpmScalarType =
    kind === 'enum' ? { kind: 'enum', enumId: 'enum_mode' } : { kind };
  return {
    id,
    displayName: id,
    cIdentifier: id,
    type,
    initialValue,
    overflow: kind === 'float32' ? 'saturate' : 'wrap',
    access: 'readWrite',
    persistent: false,
    ...extra,
  };
}

function conformanceProcess(
  id: string,
  displayName: string,
  opts: {
    activation: 'cyclic' | 'triggered' | 'both';
    periodMs?: number;
    debounceMs?: number;
    priority: number;
    guard?: string;
    assignments: { id: string; targetAttributeId: string; operator: OpmAssignmentOperator; expression: string }[];
  },
): AppNode {
  return {
    id,
    type: 'opmProcess',
    position: { x: 0, y: 0 },
    data: {
      name: displayName,
      type: 'process',
      physical: false,
      processExecution: {
        enabled: true,
        activation: opts.activation,
        inputAttributeIds: [],
        outputAttributeIds: opts.assignments.map(a => a.targetAttributeId),
        guard: opts.guard ?? '',
        assignments: opts.assignments.map(a => ({ ...a, enabled: true })),
        priority: opts.priority,
        periodMs: opts.periodMs ?? 100,
        debounceMs: opts.debounceMs ?? 0,
        reentrancy: 'reject',
      },
    },
  };
}

function conformanceState(
  id: string,
  displayName: string,
  parentId: string,
  opts: { initial?: boolean; timeoutMs?: number; timeoutEventId?: string } = {},
): AppNode {
  return {
    id,
    type: 'opmState',
    parentId,
    position: { x: 0, y: 0 },
    data: {
      name: displayName,
      type: 'state',
      physical: false,
      isInitial: opts.initial ?? false,
      parentId,
      stateExecution: {
        enabled: true,
        initial: opts.initial ?? false,
        terminal: false,
        entryAssignments: [],
        exitAssignments: [],
        ...(opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}),
        ...(opts.timeoutEventId !== undefined ? { timeoutEventId: opts.timeoutEventId } : {}),
      },
    },
  };
}

function conformanceLink(
  id: string,
  source: string,
  target: string,
  type: OpmEditorLinkType,
  opts: {
    eventId?: string;
    priority?: number;
    delayMs?: number;
    transition?: { ownerObjectId: string; sourceStateId?: string; targetStateId: string };
    assignments?: { id: string; targetAttributeId: string; operator: OpmAssignmentOperator; expression: string }[];
  } = {},
): AppEdge {
  return {
    id,
    source,
    target,
    type,
    data: {
      type,
      linkExecution: {
        enabled: true,
        guard: '',
        ...(opts.eventId !== undefined ? { eventId: opts.eventId } : {}),
        assignments: (opts.assignments ?? []).map(a => ({ ...a, enabled: true })),
        ...(opts.transition !== undefined ? { transition: opts.transition } : {}),
        priority: opts.priority ?? 1,
        delayMs: opts.delayMs ?? 0,
      },
    },
  };
}

/**
 * Main exercise model: cyclic heating + counting, event-driven transitions,
 * a state timeout, a delayed transition, a triggered pair with debounce,
 * a both-kind waiter, enum state, and queue/numeric overflow windows.
 */
export function makeConformanceExerciseFixture(): {
  nodes: AppNode[];
  edges: AppEdge[];
  config: OpmExecutionConfig;
} {
  const config = createDefaultOpmExecutionConfig();
  config.events = [
    { id: 'ev_delay', displayName: 'ev_delay', cIdentifier: 'ev_delay' },
    { id: 'ev_extra', displayName: 'ev_extra', cIdentifier: 'ev_extra' },
    { id: 'ev_go', displayName: 'ev_go', cIdentifier: 'ev_go' },
    { id: 'ev_late', displayName: 'ev_late', cIdentifier: 'ev_late' },
    { id: 'ev_ping', displayName: 'ev_ping', cIdentifier: 'ev_ping' },
    { id: 'ev_timeout', displayName: 'ev_timeout', cIdentifier: 'ev_timeout' },
  ];
  config.enums = [
    {
      id: 'enum_mode',
      displayName: 'enum_mode',
      cIdentifier: 'OpmMode',
      members: [
        { id: 'm_idle', displayName: 'Idle', cIdentifier: 'OPM_MODE_IDLE', value: 0 },
        { id: 'm_run', displayName: 'Run', cIdentifier: 'OPM_MODE_RUN', value: 1 },
      ],
    },
  ];
  config.settings = {
    ...config.settings,
    eventQueueCapacity: 4,
    eventOverflow: 'rejectNewest',
    maxStagedWrites: 32,
    maxTransitions: 16,
    traceCapacity: 64,
  };

  const objCtrl: AppNode = {
    id: 'obj_ctrl',
    type: 'opmObject',
    position: { x: 100, y: 100 },
    data: {
      name: 'Ctrl',
      type: 'object',
      physical: true,
      objectExecution: {
        enabled: true,
        attributes: [
          conformanceAttr('temp', 'float32', 70, {
            minimum: 0,
            maximum: 99.75,
            hardwareMapping: { direction: 'input', symbol: 'ADC_TEMP' },
          }),
          conformanceAttr('count', 'int32', 0),
          conformanceAttr('flag', 'bool', false),
          conformanceAttr('hold', 'bool', false),
          conformanceAttr('mode', 'enum', 'm_idle', { overflow: 'diagnostic' }),
        ],
      },
    },
  };

  const nodes: AppNode[] = [
    objCtrl,
    conformanceState('st_idle', 'Idle', 'obj_ctrl', { initial: true }),
    conformanceState('st_run', 'Run', 'obj_ctrl', { timeoutMs: 400, timeoutEventId: 'ev_timeout' }),
    conformanceProcess('proc_count', 'Count', {
      activation: 'cyclic',
      periodMs: 300,
      priority: 1,
      assignments: [{ id: 'a_count', targetAttributeId: 'count', operator: '+=', expression: '500000000' }],
    }),
    conformanceProcess('proc_heat', 'Heat', {
      activation: 'cyclic',
      periodMs: 100,
      priority: 2,
      guard: 'temp < 99.75',
      assignments: [{ id: 'a_heat', targetAttributeId: 'temp', operator: '+=', expression: '0.5' }],
    }),
    conformanceProcess('proc_ping', 'Ping', {
      activation: 'triggered',
      priority: 3,
      assignments: [{ id: 'a_ping', targetAttributeId: 'flag', operator: '=', expression: 'true' }],
    }),
    conformanceProcess('proc_deb', 'Debounced', {
      activation: 'triggered',
      priority: 4,
      debounceMs: 250,
      assignments: [{ id: 'a_deb', targetAttributeId: 'count', operator: '+=', expression: '100' }],
    }),
    conformanceProcess('proc_wait', 'Waiter', {
      activation: 'both',
      periodMs: 50000,
      priority: 5,
      assignments: [{ id: 'a_wait', targetAttributeId: 'hold', operator: '=', expression: 'true' }],
    }),
  ];

  const edges: AppEdge[] = [
    conformanceLink('link_delayed', 'st_idle', 'st_run', 'trigger', {
      eventId: 'ev_delay',
      delayMs: 300,
      transition: { ownerObjectId: 'obj_ctrl', sourceStateId: 'st_idle', targetStateId: 'st_run' },
    }),
    conformanceLink('link_go', 'st_idle', 'st_run', 'trigger', {
      eventId: 'ev_go',
      transition: { ownerObjectId: 'obj_ctrl', sourceStateId: 'st_idle', targetStateId: 'st_run' },
      assignments: [{ id: 'a_go', targetAttributeId: 'hold', operator: '=', expression: 'false' }],
    }),
    conformanceLink('link_heat_fx', 'proc_heat', 'obj_ctrl', 'effect', {}),
    conformanceLink('link_late', 'obj_ctrl', 'proc_wait', 'trigger', { eventId: 'ev_late' }),
    conformanceLink('link_ping', 'obj_ctrl', 'proc_ping', 'trigger', { eventId: 'ev_ping' }),
    conformanceLink('link_ping_deb', 'obj_ctrl', 'proc_deb', 'trigger', { eventId: 'ev_ping' }),
    conformanceLink('link_timeout', 'st_run', 'st_idle', 'trigger', {
      eventId: 'ev_timeout',
      transition: { ownerObjectId: 'obj_ctrl', sourceStateId: 'st_run', targetStateId: 'st_idle' },
    }),
  ];

  return { nodes, edges, config };
}

/** Contention model: runtime write conflict (process + link, equal priority) + transition conflict. */
export function makeConformanceContentionFixture(): {
  nodes: AppNode[];
  edges: AppEdge[];
  config: OpmExecutionConfig;
} {
  const config = createDefaultOpmExecutionConfig();
  config.events = [
    { id: 'ev_t1', displayName: 'ev_t1', cIdentifier: 'ev_t1' },
    { id: 'ev_t2', displayName: 'ev_t2', cIdentifier: 'ev_t2' },
    { id: 'ev_t3', displayName: 'ev_t3', cIdentifier: 'ev_t3' },
    { id: 'ev_t4', displayName: 'ev_t4', cIdentifier: 'ev_t4' },
  ];
  config.settings = {
    ...config.settings,
    eventQueueCapacity: 8,
    eventOverflow: 'rejectNewest',
    maxStagedWrites: 4,
    maxTransitions: 4,
    traceCapacity: 64,
  };

  const objC1: AppNode = {
    id: 'obj_c1',
    type: 'opmObject',
    position: { x: 0, y: 0 },
    data: {
      name: 'C1',
      type: 'object',
      physical: false,
      objectExecution: {
        enabled: true,
        attributes: [conformanceAttr('x', 'int32', 0)],
      },
    },
  };
  const objC2: AppNode = {
    id: 'obj_c2',
    type: 'opmObject',
    position: { x: 200, y: 0 },
    data: {
      name: 'C2',
      type: 'object',
      physical: false,
      objectExecution: {
        enabled: true,
        attributes: [conformanceAttr('y', 'int32', 0)],
      },
    },
  };

  const nodes: AppNode[] = [
    objC1,
    objC2,
    conformanceState('s_a1', 'A1', 'obj_c1', { initial: true }),
    conformanceState('s_b1', 'B1', 'obj_c1', {}),
    conformanceState('s_c1', 'C1s', 'obj_c1', {}),
    conformanceState('s_a2', 'A2', 'obj_c2', { initial: true }),
    conformanceState('s_b2', 'B2', 'obj_c2', {}),
    conformanceProcess('proc_w1', 'W1', {
      activation: 'cyclic',
      priority: 5,
      assignments: [{ id: 'a_w1', targetAttributeId: 'x', operator: '=', expression: '1' }],
    }),
    // NOTE: no second equal-priority process writer: the static validator
    // rejects that shape at compile time. The runtime write conflict is
    // exercised via link_t4's link-carried write (priority 5) racing
    // proc_w1 (priority 5) in the same step instead.
    conformanceProcess('proc_w3', 'W3', {
      activation: 'cyclic',
      priority: 1,
      assignments: [{ id: 'a_w3', targetAttributeId: 'x', operator: '=', expression: '3' }],
    }),
  ];

  const edges: AppEdge[] = [
    conformanceLink('link_t1', 's_a1', 's_b1', 'trigger', {
      eventId: 'ev_t1',
      priority: 9,
      transition: { ownerObjectId: 'obj_c1', sourceStateId: 's_a1', targetStateId: 's_b1' },
    }),
    conformanceLink('link_t2', 's_a2', 's_b2', 'trigger', {
      eventId: 'ev_t2',
      priority: 7,
      transition: { ownerObjectId: 'obj_c2', sourceStateId: 's_a2', targetStateId: 's_b2' },
    }),
    conformanceLink('link_t3', 's_a1', 's_c1', 'trigger', {
      eventId: 'ev_t3',
      priority: 9,
      transition: { ownerObjectId: 'obj_c1', sourceStateId: 's_a1', targetStateId: 's_c1' },
    }),
    conformanceLink('link_t4', 's_a1', 's_b1', 'trigger', {
      eventId: 'ev_t4',
      priority: 5,
      transition: { ownerObjectId: 'obj_c1', sourceStateId: 's_a1', targetStateId: 's_b1' },
      assignments: [{ id: 'a_w4', targetAttributeId: 'x', operator: '=', expression: '2' }],
    }),
  ];

  return { nodes, edges, config };
}

/** Editor-level reversal of the exercise fixture (normalization sorts it back). */
export function makeReversedConformanceExerciseFixture(): {
  nodes: AppNode[];
  edges: AppEdge[];
  config: OpmExecutionConfig;
} {
  const f = makeConformanceExerciseFixture();
  return {
    nodes: [...f.nodes].reverse(),
    edges: [...f.edges].reverse(),
    config: {
      ...f.config,
      events: [...f.config.events].reverse(),
      enums: [...f.config.enums].reverse(),
      settings: { ...f.config.settings },
    },
  };
}

function steps(count: number, over: Record<number, Omit<OpmScenarioStep, 'deltaMs'>> = {}): OpmScenarioStep[] {
  const out: OpmScenarioStep[] = [];
  for (let i = 0; i < count; i++) {
    out.push({ deltaMs: 100, ...(over[i] ?? {}) });
  }
  return out;
}

/** 110-step exercise choreography (see conformance design notes in goldens). */
export function buildExerciseScenario(_model: ExecutableOpmModel): OpmScenarioStep[] {
  void _model;
  return steps(110, {
    2: { dispatchEventIds: ['ev_go'] },
    8: { dispatchEventIds: ['ev_go'] },
    14: { dispatchEventIds: ['ev_delay'] },
    19: { dispatchEventIds: ['ev_ping'] },
    20: { dispatchEventIds: ['ev_ping'] },
    24: { dispatchEventIds: ['ev_ping', 'ev_go', 'ev_ping', 'ev_extra', 'ev_ping'] },
    30: { dispatchEventIds: ['ev_delay'] },
    31: { dispatchEventIds: ['ev_ping', 'ev_unknown'] },
    49: { inputValues: { mode: 'm_run' } },
    69: { inputValues: { flag: false } },
    99: { dispatchEventIds: ['ev_late'] },
    104: { resetBeforeStep: true },
  });
}

/** 6-step contention choreography: transition conflict, write conflict, transition, reset. */
export function buildContentionScenario(_model: ExecutableOpmModel): OpmScenarioStep[] {
  void _model;
  return steps(6, {
    1: { dispatchEventIds: ['ev_t1', 'ev_t3'] },
    2: { dispatchEventIds: ['ev_t4'] },
    3: { dispatchEventIds: ['ev_t2'] },
    4: { resetBeforeStep: true },
  });
}

/** 12-step reversed-order choreography over the reversed exercise fixture. */
export function buildReversedScenario(_model: ExecutableOpmModel): OpmScenarioStep[] {
  void _model;
  return steps(12, {
    2: { dispatchEventIds: ['ev_go'] },
    8: { dispatchEventIds: ['ev_go'] },
    10: { resetBeforeStep: true },
  });
}

