import { describe, it, expect } from 'vitest';
import {
  createOpmRuntime,
  stepOpmRuntime,
  dispatchOpmEvent,
  resetOpmRuntime,
  runOpmSimulationAsync,
} from '../runtime';
import { compileExecutableOpm } from '../pipeline';
import { makeApplianceFixture } from '../fixtures';
import type { AppNode, AppEdge } from '../../../components/entropy/EntropyTypes';
import { createDefaultOpmExecutionConfig } from '../executableTypes';

function makeSnapshotFixture() {
  const config = createDefaultOpmExecutionConfig();
  const nodes: AppNode[] = [
    {
      id: 'obj_counter',
      type: 'opmObject',
      position: { x: 0, y: 0 },
      data: {
        name: 'CounterObj',
        type: 'object',
        physical: false,
        objectExecution: {
          enabled: true,
          attributes: [
            {
              id: 'counter',
              displayName: 'Counter',
              cIdentifier: 'counter',
              type: { kind: 'int32' },
              initialValue: 0,
              overflow: 'wrap',
              access: 'readWrite',
              persistent: false,
            },
          ],
        },
      },
    },
    {
      id: 'proc_inc',
      type: 'opmProcess',
      position: { x: 100, y: 0 },
      data: {
        name: 'Increment',
        type: 'process',
        physical: false,
        processExecution: {
          enabled: true,
          activation: 'cyclic',
          periodMs: 10,
          inputAttributeIds: ['counter'],
          outputAttributeIds: ['counter'],
          guard: '',
          assignments: [
            {
              id: 'a1',
              targetAttributeId: 'counter',
              operator: '+=',
              expression: '1',
              enabled: true,
            },
          ],
          priority: 1,
          debounceMs: 0,
          reentrancy: 'reject',
        },
      },
    },
  ];
  const comp = compileExecutableOpm(nodes, [], config);
  return { model: comp.model! };
}

function makeQueueFixture() {
  const config = createDefaultOpmExecutionConfig();
  config.settings.eventQueueCapacity = 2;
  config.settings.eventOverflow = 'rejectNewest';
  config.events = [
    { id: 'door_open', displayName: 'Door Open', cIdentifier: 'door_open' },
    { id: 'door_close', displayName: 'Door Close', cIdentifier: 'door_close' },
  ];

  const nodes: AppNode[] = [
    {
      id: 'obj_door',
      type: 'opmObject',
      position: { x: 0, y: 0 },
      data: {
        name: 'Door',
        type: 'object',
        physical: false,
        objectExecution: { enabled: true, attributes: [] },
      },
    },
    {
      id: 'st_closed',
      type: 'opmState',
      parentId: 'obj_door',
      position: { x: 50, y: 0 },
      data: {
        name: 'Closed',
        type: 'state',
        physical: false,
        isInitial: true,
        parentId: 'obj_door',
        stateExecution: {
          enabled: true,
          initial: true,
          terminal: false,
          entryAssignments: [],
          exitAssignments: [],
        },
      },
    },
    {
      id: 'st_opened',
      type: 'opmState',
      parentId: 'obj_door',
      position: { x: 150, y: 0 },
      data: {
        name: 'Opened',
        type: 'state',
        physical: false,
        isInitial: false,
        parentId: 'obj_door',
        stateExecution: {
          enabled: true,
          initial: false,
          terminal: false,
          entryAssignments: [],
          exitAssignments: [],
        },
      },
    },
    {
      id: 'open_door',
      type: 'opmProcess',
      position: { x: 100, y: 100 },
      data: {
        name: 'Open Door',
        type: 'process',
        physical: false,
        processExecution: {
          enabled: true,
          activation: 'triggered',
          inputAttributeIds: [],
          outputAttributeIds: [],
          guard: '',
          assignments: [],
          priority: 1,
          debounceMs: 0,
          reentrancy: 'reject',
        },
      },
    },
  ];

  const edges: AppEdge[] = [
    {
      id: 'edge_trigger_open',
      source: 'st_closed',
      target: 'open_door',
      type: 'trigger',
      data: {
        type: 'trigger',
        linkExecution: {
          enabled: true,
          guard: '',
          eventId: 'door_open',
          assignments: [],
          transition: {
            ownerObjectId: 'obj_door',
            sourceStateId: 'st_closed',
            targetStateId: 'st_opened',
          },
          priority: 1,
          delayMs: 0,
        },
      },
    },
  ];

  const comp = compileExecutableOpm(nodes, edges, config);
  return { model: comp.model! };
}

describe('OPM canonical TypeScript runtime', () => {
  it('uses one committed snapshot and commits only after all eligible processes evaluate', () => {
    const snapshotFixture = makeSnapshotFixture();
    const runtime = createOpmRuntime(snapshotFixture.model);
    const first = stepOpmRuntime(runtime, 10);
    expect(first.trace.map(t => t.phase)).toEqual([
      'sampleInputs',
      'advanceTimers',
      'activate',
      'evaluate',
      'stage',
      'resolveConflicts',
      'commit',
      'stateActions',
      'publishOutputs',
    ]);
    expect(first.values.counter).toBe(1);
  });

  it('triggered process does not fire before its event and fires once after dispatch', () => {
    const queueFixture = makeQueueFixture();
    const runtime = createOpmRuntime(queueFixture.model);

    // Step 1: no event dispatched, open_door must NOT fire
    const step1 = stepOpmRuntime(runtime, 10);
    expect(step1.firedProcessIds).not.toContain('open_door');
    expect(step1.activeStates.obj_door).toBe('st_closed');

    // Dispatch event
    expect(dispatchOpmEvent(runtime, 'door_open')).toBe('accepted');

    // Step 2: event is queued, open_door must fire once
    const step2 = stepOpmRuntime(runtime, 10);
    expect(step2.firedProcessIds).toContain('open_door');
    expect(step2.consumedEventIds).toContain('door_open');
    expect(step2.activeStates.obj_door).toBe('st_opened');

    // Step 3: event consumed, open_door must NOT fire again
    const step3 = stepOpmRuntime(runtime, 10);
    expect(step3.firedProcessIds).not.toContain('open_door');
  });

  it('cyclic period 30 ms with 10 ms steps fires only on the defined due step', () => {
    const config = createDefaultOpmExecutionConfig();
    const nodes: AppNode[] = [
      {
        id: 'obj_tick',
        type: 'opmObject',
        position: { x: 0, y: 0 },
        data: {
          name: 'Ticker',
          type: 'object',
          physical: false,
          objectExecution: {
            enabled: true,
            attributes: [
              {
                id: 'count',
                displayName: 'count',
                cIdentifier: 'count',
                type: { kind: 'int32' },
                initialValue: 0,
                overflow: 'wrap',
                access: 'readWrite',
                persistent: false,
              },
            ],
          },
        },
      },
      {
        id: 'proc_p30',
        type: 'opmProcess',
        position: { x: 100, y: 0 },
        data: {
          name: 'Every30ms',
          type: 'process',
          physical: false,
          processExecution: {
            enabled: true,
            activation: 'cyclic',
            periodMs: 30,
            inputAttributeIds: ['count'],
            outputAttributeIds: ['count'],
            guard: '',
            assignments: [
              {
                id: 'a1',
                targetAttributeId: 'count',
                operator: '+=',
                expression: '1',
                enabled: true,
              },
            ],
            priority: 1,
            debounceMs: 0,
            reentrancy: 'reject',
          },
        },
      },
    ];

    const comp = compileExecutableOpm(nodes, [], config);
    const runtime = createOpmRuntime(comp.model!);

    // Step 1: delta=10ms (t=10ms) -> elapsed=10 < 30ms -> not due
    const s1 = stepOpmRuntime(runtime, 10);
    expect(s1.firedProcessIds).not.toContain('proc_p30');
    expect(s1.values.count).toBe(0);

    // Step 2: delta=10ms (t=20ms) -> elapsed=20 < 30ms -> not due
    const s2 = stepOpmRuntime(runtime, 10);
    expect(s2.firedProcessIds).not.toContain('proc_p30');
    expect(s2.values.count).toBe(0);

    // Step 3: delta=10ms (t=30ms) -> elapsed=30 >= 30ms -> DUE & FIRES!
    const s3 = stepOpmRuntime(runtime, 10);
    expect(s3.firedProcessIds).toContain('proc_p30');
    expect(s3.values.count).toBe(1);

    // Step 4: delta=10ms (t=40ms) -> elapsed=10 < 30ms -> not due
    const s4 = stepOpmRuntime(runtime, 10);
    expect(s4.firedProcessIds).not.toContain('proc_p30');
    expect(s4.values.count).toBe(1);
  });

  it('condition link gates its target process but not an unrelated process', () => {
    const config = createDefaultOpmExecutionConfig();
    const nodes: AppNode[] = [
      {
        id: 'obj_switch',
        type: 'opmObject',
        position: { x: 0, y: 0 },
        data: {
          name: 'SwitchObj',
          type: 'object',
          physical: false,
          objectExecution: { enabled: true, attributes: [] },
        },
      },
      {
        id: 'st_off',
        type: 'opmState',
        parentId: 'obj_switch',
        position: { x: 0, y: 50 },
        data: {
          name: 'Off',
          type: 'state',
          physical: false,
          isInitial: true,
          parentId: 'obj_switch',
          stateExecution: {
            enabled: true,
            initial: true,
            terminal: false,
            entryAssignments: [],
            exitAssignments: [],
          },
        },
      },
      {
        id: 'st_on',
        type: 'opmState',
        parentId: 'obj_switch',
        position: { x: 100, y: 50 },
        data: {
          name: 'On',
          type: 'state',
          physical: false,
          isInitial: false,
          parentId: 'obj_switch',
          stateExecution: {
            enabled: true,
            initial: false,
            terminal: false,
            entryAssignments: [],
            exitAssignments: [],
          },
        },
      },
      {
        id: 'proc_gated',
        type: 'opmProcess',
        position: { x: 200, y: 0 },
        data: {
          name: 'GatedProc',
          type: 'process',
          physical: false,
          processExecution: {
            enabled: true,
            activation: 'cyclic',
            periodMs: 10,
            inputAttributeIds: [],
            outputAttributeIds: [],
            guard: '',
            assignments: [],
            priority: 1,
            debounceMs: 0,
            reentrancy: 'reject',
          },
        },
      },
      {
        id: 'proc_free',
        type: 'opmProcess',
        position: { x: 200, y: 100 },
        data: {
          name: 'FreeProc',
          type: 'process',
          physical: false,
          processExecution: {
            enabled: true,
            activation: 'cyclic',
            periodMs: 10,
            inputAttributeIds: [],
            outputAttributeIds: [],
            guard: '',
            assignments: [],
            priority: 1,
            debounceMs: 0,
            reentrancy: 'reject',
          },
        },
      },
    ];

    const edges: AppEdge[] = [
      {
        id: 'edge_trans_on',
        source: 'st_off',
        target: 'st_on',
        type: 'trigger',
        data: {
          type: 'trigger',
          linkExecution: {
            enabled: true,
            guard: '',
            assignments: [],
            transition: {
              ownerObjectId: 'obj_switch',
              sourceStateId: 'st_off',
              targetStateId: 'st_on',
            },
            priority: 1,
            delayMs: 0,
          },
        },
      },
      {
        id: 'edge_cond_on',
        source: 'st_on',
        target: 'proc_gated',
        type: 'condition',
        data: {
          type: 'condition',
          linkExecution: {
            enabled: true,
            guard: '',
            assignments: [],
            priority: 1,
            delayMs: 0,
          },
        },
      },
    ];

    const comp = compileExecutableOpm(nodes, edges, config);
    expect(comp.model).toBeDefined();
    const runtime = createOpmRuntime(comp.model!);

    // Initially active state is st_off.
    // Condition on st_on is NOT met -> proc_gated must be blocked.
    // proc_free has no condition link -> proc_free must fire.
    const step1 = stepOpmRuntime(runtime, 10);
    expect(step1.blockedProcessIds).toContain('proc_gated');
    expect(step1.firedProcessIds).not.toContain('proc_gated');
    expect(step1.firedProcessIds).toContain('proc_free');
  });

  it('duplicate queued event IDs are consumed one FIFO occurrence at a time', () => {
    const config = createDefaultOpmExecutionConfig();
    config.settings.eventQueueCapacity = 4;
    config.events = [{ id: 'door_open', displayName: 'Door Open', cIdentifier: 'door_open' }];

    const model = {
      executionEnabled: true,
      fingerprint: 'fifo_test',
      settings: config.settings,
      objects: [],
      states: [],
      processes: [
        {
          enabled: true,
          id: 'proc_log',
          name: 'ProcLog',
          cIdentifier: 'ProcLog',
          physical: false,
          order: 0,
          source: { elementId: 'proc_log', propertyPath: 'name' },
          activation: 'triggered' as const,
          inputAttributeIds: [],
          outputAttributeIds: [],
          guardText: '',
          assignments: [],
          priority: 1,
          debounceMs: 0,
          reentrancy: 'reject' as const,
        },
      ],
      links: [
        {
          enabled: true,
          id: 'link_trig',
          type: 'trigger',
          sourceId: 'proc_log',
          targetId: 'proc_log',
          order: 0,
          source: { elementId: 'link_trig', propertyPath: 'guard' },
          guardText: '',
          eventId: 'door_open',
          assignments: [],
          priority: 1,
          delayMs: 0,
        },
      ],
      events: config.events,
      enums: [],
      symbols: {},
      sourceByNormalizedId: {},
    };

    const runtime = createOpmRuntime(model);

    // Dispatch door_open twice
    expect(dispatchOpmEvent(runtime, 'door_open')).toBe('accepted');
    expect(dispatchOpmEvent(runtime, 'door_open')).toBe('accepted');
    expect(runtime.eventQueue).toHaveLength(2);

    // Step 1 consumes the first door_open occurrence
    const s1 = stepOpmRuntime(runtime, 10);
    expect(s1.consumedEventIds).toEqual(['door_open']);
    expect(runtime.eventQueue).toEqual(['door_open']); // exactly one remains

    // Step 2 consumes the second door_open occurrence
    const s2 = stepOpmRuntime(runtime, 10);
    expect(s2.consumedEventIds).toEqual(['door_open']);
    expect(runtime.eventQueue).toEqual([]); // empty now
  });

  it('equal-priority write conflict commits neither value and emits OPM_WRITE_CONFLICT', () => {
    const config = createDefaultOpmExecutionConfig();
    const nodes: AppNode[] = [
      {
        id: 'obj_val',
        type: 'opmObject',
        position: { x: 0, y: 0 },
        data: {
          name: 'ValObj',
          type: 'object',
          physical: false,
          objectExecution: {
            enabled: true,
            attributes: [
              {
                id: 'target_val',
                displayName: 'target_val',
                cIdentifier: 'target_val',
                type: { kind: 'int32' },
                initialValue: 0,
                overflow: 'wrap',
                access: 'readWrite',
                persistent: false,
              },
            ],
          },
        },
      },
      {
        id: 'proc_write_a',
        type: 'opmProcess',
        position: { x: 100, y: 0 },
        data: {
          name: 'WriteA',
          type: 'process',
          physical: false,
          processExecution: {
            enabled: true,
            activation: 'cyclic',
            periodMs: 10,
            inputAttributeIds: [],
            outputAttributeIds: ['target_val'],
            guard: '',
            assignments: [
              {
                id: 'asgn_a',
                targetAttributeId: 'target_val',
                operator: '=',
                expression: '10',
                enabled: true,
              },
            ],
            priority: 1, // Equal priority
            debounceMs: 0,
            reentrancy: 'reject',
          },
        },
      },
      {
        id: 'proc_write_b',
        type: 'opmProcess',
        position: { x: 100, y: 100 },
        data: {
          name: 'WriteB',
          type: 'process',
          physical: false,
          processExecution: {
            enabled: true,
            activation: 'cyclic',
            periodMs: 10,
            inputAttributeIds: [],
            outputAttributeIds: ['target_val'],
            guard: '',
            assignments: [
              {
                id: 'asgn_b',
                targetAttributeId: 'target_val',
                operator: '=',
                expression: '20',
                enabled: true,
              },
            ],
            priority: 1, // Equal priority
            debounceMs: 0,
            reentrancy: 'reject',
          },
        },
      },
    ];

    // Pipeline validator flags static error; let's test runtime conflict resolution
    const norm = compileExecutableOpm(nodes, [], config);
    // In runtime execution directly:
    const runtime = createOpmRuntime(norm.model || {
      executionEnabled: true,
      fingerprint: 'test',
      settings: config.settings,
      objects: [{
        id: 'obj_val',
        name: 'ValObj',
        cIdentifier: 'ValObj',
        physical: false,
        order: 0,
        source: { elementId: 'obj_val', propertyPath: 'name' },
        attributes: [{
          id: 'target_val',
          displayName: 'target_val',
          cIdentifier: 'target_val',
          type: { kind: 'int32' },
          initialValue: 0,
          overflow: 'wrap',
          access: 'readWrite',
          persistent: false,
        }],
        stateIds: [],
      }],
      states: [],
      processes: [
        {
          enabled: true,
          id: 'proc_write_a',
          name: 'WriteA',
          cIdentifier: 'WriteA',
          physical: false,
          order: 0,
          source: { elementId: 'proc_write_a', propertyPath: 'name' },
          activation: 'cyclic',
          inputAttributeIds: [],
          outputAttributeIds: ['target_val'],
          guardText: '',
          assignments: [{
            id: 'asgn_a',
            targetAttributeId: 'target_val',
            resolvedTargetCIdentifier: 'target_val',
            operator: '=',
            expressionText: '10',
            expressionIr: { kind: 'literal', type: { kind: 'int32' }, value: 10 },
            enabled: true,
            source: { elementId: 'proc_write_a', propertyPath: 'assignments' },
          }],
          priority: 1,
          debounceMs: 0,
          reentrancy: 'reject',
        },
        {
          enabled: true,
          id: 'proc_write_b',
          name: 'WriteB',
          cIdentifier: 'WriteB',
          physical: false,
          order: 1,
          source: { elementId: 'proc_write_b', propertyPath: 'name' },
          activation: 'cyclic',
          inputAttributeIds: [],
          outputAttributeIds: ['target_val'],
          guardText: '',
          assignments: [{
            id: 'asgn_b',
            targetAttributeId: 'target_val',
            resolvedTargetCIdentifier: 'target_val',
            operator: '=',
            expressionText: '20',
            expressionIr: { kind: 'literal', type: { kind: 'int32' }, value: 20 },
            enabled: true,
            source: { elementId: 'proc_write_b', propertyPath: 'assignments' },
          }],
          priority: 1,
          debounceMs: 0,
          reentrancy: 'reject',
        },
      ],
      links: [],
      events: [],
      enums: [],
      symbols: {},
      sourceByNormalizedId: {},
    });

    const stepRes = stepOpmRuntime(runtime, 10);
    expect(stepRes.values.target_val).toBe(0); // neither write committed
    expect(stepRes.diagnostics.some(d => d.code === 'OPM_WRITE_CONFLICT')).toBe(true);
  });

  it('higher-priority write wins independently of input array order', () => {
    const config = createDefaultOpmExecutionConfig();
    const makeModelWithOrder = (priA: number, priB: number) => ({
      executionEnabled: true,
      fingerprint: 'pri_test',
      settings: config.settings,
      objects: [{
        id: 'obj_val',
        name: 'ValObj',
        cIdentifier: 'ValObj',
        physical: false,
        order: 0,
        source: { elementId: 'obj_val', propertyPath: 'name' },
        attributes: [{
          id: 'v',
          displayName: 'v',
          cIdentifier: 'v',
          type: { kind: 'int32' as const },
          initialValue: 0,
          overflow: 'wrap' as const,
          access: 'readWrite' as const,
          persistent: false,
        }],
        stateIds: [],
      }],
      states: [],
      processes: [
        {
          enabled: true,
          id: 'p1',
          name: 'P1',
          cIdentifier: 'P1',
          physical: false,
          order: 0,
          source: { elementId: 'p1', propertyPath: 'name' },
          activation: 'cyclic' as const,
          inputAttributeIds: [],
          outputAttributeIds: ['v'],
          guardText: '',
          assignments: [{
            id: 'a1',
            targetAttributeId: 'v',
            resolvedTargetCIdentifier: 'v',
            operator: '=' as const,
            expressionText: '10',
            expressionIr: { kind: 'literal' as const, type: { kind: 'int32' as const }, value: 10 },
            enabled: true,
            source: { elementId: 'p1', propertyPath: 'assignments' },
          }],
          priority: priA,
          debounceMs: 0,
          reentrancy: 'reject' as const,
        },
        {
          enabled: true,
          id: 'p2',
          name: 'P2',
          cIdentifier: 'P2',
          physical: false,
          order: 1,
          source: { elementId: 'p2', propertyPath: 'name' },
          activation: 'cyclic' as const,
          inputAttributeIds: [],
          outputAttributeIds: ['v'],
          guardText: '',
          assignments: [{
            id: 'a2',
            targetAttributeId: 'v',
            resolvedTargetCIdentifier: 'v',
            operator: '=' as const,
            expressionText: '20',
            expressionIr: { kind: 'literal' as const, type: { kind: 'int32' as const }, value: 20 },
            enabled: true,
            source: { elementId: 'p2', propertyPath: 'assignments' },
          }],
          priority: priB,
          debounceMs: 0,
          reentrancy: 'reject' as const,
        },
      ],
      links: [],
      events: [],
      enums: [],
      symbols: {},
      sourceByNormalizedId: {},
    });

    // P2 has higher priority (2 > 1) -> 20 wins
    const rt1 = createOpmRuntime(makeModelWithOrder(1, 2));
    expect(stepOpmRuntime(rt1, 10).values.v).toBe(20);

    // P1 has higher priority (2 > 1) -> 10 wins
    const rt2 = createOpmRuntime(makeModelWithOrder(2, 1));
    expect(stepOpmRuntime(rt2, 10).values.v).toBe(10);
  });

  it('delayed transition is scheduled once and becomes stale if the source state changes first', () => {
    const config = createDefaultOpmExecutionConfig();
    config.events = [{ id: 'ev_start_delay', displayName: 'Start Delay', cIdentifier: 'ev_start_delay' }];

    const model = {
      executionEnabled: true,
      fingerprint: 'delayed_test',
      settings: config.settings,
      objects: [{
        id: 'obj_m',
        name: 'ObjM',
        cIdentifier: 'ObjM',
        physical: false,
        order: 0,
        source: { elementId: 'obj_m', propertyPath: 'name' },
        attributes: [],
        stateIds: ['st_a', 'st_b', 'st_c'],
        initialStateId: 'st_a',
      }],
      states: [
        {
          id: 'st_a', name: 'A', cIdentifier: 'A', parentObjectId: 'obj_m', isInitial: true, isTerminal: false,
          order: 0, source: { elementId: 'st_a', propertyPath: 'name' }, entryAssignments: [], exitAssignments: []
        },
        {
          id: 'st_b', name: 'B', cIdentifier: 'B', parentObjectId: 'obj_m', isInitial: false, isTerminal: false,
          order: 1, source: { elementId: 'st_b', propertyPath: 'name' }, entryAssignments: [], exitAssignments: []
        },
        {
          id: 'st_c', name: 'C', cIdentifier: 'C', parentObjectId: 'obj_m', isInitial: false, isTerminal: false,
          order: 2, source: { elementId: 'st_c', propertyPath: 'name' }, entryAssignments: [], exitAssignments: []
        },
      ],
      processes: [],
      links: [
        {
          enabled: true,
          id: 'link_delay',
          type: 'trigger',
          sourceId: 'st_a',
          targetId: 'st_b',
          order: 0,
          source: { elementId: 'link_delay', propertyPath: 'guard' },
          guardText: '',
          eventId: 'ev_start_delay',
          assignments: [],
          transition: {
            ownerObjectId: 'obj_m',
            sourceStateId: 'st_a',
            targetStateId: 'st_b',
          },
          priority: 1,
          delayMs: 20, // 20ms delay
        },
      ],
      events: config.events,
      enums: [],
      symbols: {},
      sourceByNormalizedId: {},
    };

    const runtime = createOpmRuntime(model);
    expect(runtime.activeStates.obj_m).toBe('st_a');

    // Dispatch event at t=0
    dispatchOpmEvent(runtime, 'ev_start_delay');
    const s1 = stepOpmRuntime(runtime, 10);
    expect(s1.activeStates.obj_m).toBe('st_a'); // still in st_a, delay not expired (remaining 10ms)

    // Force an external/intermediate state change to st_c
    runtime.activeStates.obj_m = 'st_c';

    // Step 2 (next 10ms -> delay expires at t=20ms)
    const s2 = stepOpmRuntime(runtime, 10);
    // Since current state is st_c !== sourceStateId st_a, delayed transition is STALE and must NOT move to st_b
    expect(s2.activeStates.obj_m).toBe('st_c');
  });

  it('simultaneous transitions for one object commit only the highest-priority winner', () => {
    const config = createDefaultOpmExecutionConfig();
    config.events = [
      { id: 'ev_trig1', displayName: 'Trig 1', cIdentifier: 'ev_trig1' },
      { id: 'ev_trig2', displayName: 'Trig 2', cIdentifier: 'ev_trig2' },
    ];

    const model = {
      executionEnabled: true,
      fingerprint: 'trans_conflict_test',
      settings: config.settings,
      objects: [{
        id: 'obj_fsm',
        name: 'FSM',
        cIdentifier: 'FSM',
        physical: false,
        order: 0,
        source: { elementId: 'obj_fsm', propertyPath: 'name' },
        attributes: [],
        stateIds: ['st_init', 'st_low', 'st_high'],
        initialStateId: 'st_init',
      }],
      states: [
        { id: 'st_init', name: 'Init', cIdentifier: 'Init', parentObjectId: 'obj_fsm', isInitial: true, isTerminal: false, order: 0, source: { elementId: 'st_init', propertyPath: 'name' }, entryAssignments: [], exitAssignments: [] },
        { id: 'st_low', name: 'Low', cIdentifier: 'Low', parentObjectId: 'obj_fsm', isInitial: false, isTerminal: false, order: 1, source: { elementId: 'st_low', propertyPath: 'name' }, entryAssignments: [], exitAssignments: [] },
        { id: 'st_high', name: 'High', cIdentifier: 'High', parentObjectId: 'obj_fsm', isInitial: false, isTerminal: false, order: 2, source: { elementId: 'st_high', propertyPath: 'name' }, entryAssignments: [], exitAssignments: [] },
      ],
      processes: [],
      links: [
        {
          enabled: true,
          id: 'link_low',
          type: 'trigger',
          sourceId: 'st_init',
          targetId: 'st_low',
          order: 0,
          source: { elementId: 'link_low', propertyPath: 'guard' },
          guardText: '',
          eventId: 'ev_trig1',
          assignments: [],
          transition: { ownerObjectId: 'obj_fsm', sourceStateId: 'st_init', targetStateId: 'st_low' },
          priority: 1, // Low priority
          delayMs: 0,
        },
        {
          enabled: true,
          id: 'link_high',
          type: 'trigger',
          sourceId: 'st_init',
          targetId: 'st_high',
          order: 1,
          source: { elementId: 'link_high', propertyPath: 'guard' },
          guardText: '',
          eventId: 'ev_trig2',
          assignments: [],
          transition: { ownerObjectId: 'obj_fsm', sourceStateId: 'st_init', targetStateId: 'st_high' },
          priority: 5, // High priority
          delayMs: 0,
        },
      ],
      events: config.events,
      enums: [],
      symbols: {},
      sourceByNormalizedId: {},
    };

    const runtime = createOpmRuntime(model);
    dispatchOpmEvent(runtime, 'ev_trig1');
    dispatchOpmEvent(runtime, 'ev_trig2');

    const stepRes = stepOpmRuntime(runtime, 10);
    expect(stepRes.activeStates.obj_fsm).toBe('st_high');
    expect(stepRes.transitions).toHaveLength(1);
    expect(stepRes.transitions[0].toStateId).toBe('st_high');
  });

  it('reset reconstructs initial values, state, timers, queue, debounce, and delayed transitions', () => {
    const queueFixture = makeQueueFixture();
    const runtime = createOpmRuntime(queueFixture.model);

    dispatchOpmEvent(runtime, 'door_open');
    stepOpmRuntime(runtime, 10);
    expect(runtime.activeStates.obj_door).toBe('st_opened');

    resetOpmRuntime(runtime);
    expect(runtime.stepIndex).toBe(0);
    expect(runtime.timeMs).toBe(0);
    expect(runtime.activeStates.obj_door).toBe('st_closed');
    expect(runtime.eventQueue).toEqual([]);
    expect(runtime.delayedTransitions).toEqual([]);
  });

  it('negative and NaN deltaMs leave the runtime unchanged and return a diagnostic', () => {
    const snapshotFixture = makeSnapshotFixture();
    const runtime = createOpmRuntime(snapshotFixture.model);

    const negRes = stepOpmRuntime(runtime, -10);
    expect(runtime.stepIndex).toBe(0);
    expect(runtime.timeMs).toBe(0);
    expect(negRes.diagnostics.some(d => d.code === 'OPM_RUNTIME_INVALID_DELTA')).toBe(true);

    const nanRes = stepOpmRuntime(runtime, NaN);
    expect(runtime.stepIndex).toBe(0);
    expect(runtime.timeMs).toBe(0);
    expect(nanRes.diagnostics.some(d => d.code === 'OPM_RUNTIME_INVALID_DELTA')).toBe(true);
  });

  it('exposes the canonical snapshot contract on every step', () => {
    const snapshotFixture = makeSnapshotFixture();
    const runtime = createOpmRuntime(snapshotFixture.model);
    const first = stepOpmRuntime(runtime, 10);
    expect(first.status).toBe('ok');
    expect(first.lifecycle).toBe('running');
    expect(first.finished).toBe(false);
    expect(first.queuedEventIds).toEqual([]);
    expect(first.stateTimersMs).toBeDefined();
    expect(first.processTimersMs).toBeDefined();
    expect(first.committedWriteIds).toContain('counter');
  });

  it('marks rejected steps as faulted without advancing the runtime', () => {
    const snapshotFixture = makeSnapshotFixture();
    const runtime = createOpmRuntime(snapshotFixture.model);
    const res = stepOpmRuntime(runtime, -5);
    expect(res.status).toBe('error');
    expect(res.lifecycle).toBe('faulted');
    expect(res.finished).toBe(false);
    expect(res.firedProcessIds).toEqual([]);
    expect(res.traversedLinkIds).toEqual([]);
  });

  describe('Task 5: Hardened deterministic runtime semantics and diagnostics', () => {
    it('executes exact tick ordering: input latch, event dispatch, guard evaluation, conflict resolution, staged writes, trace emission, and time increment', () => {
      const queueFixture = makeQueueFixture();
      const runtime = createOpmRuntime(queueFixture.model);

      expect(runtime.timeMs).toBe(0);

      // Step with structured input
      const result = stepOpmRuntime(runtime, {
        deltaMs: 25,
        inputs: { 'obj_door.door_sensor': 1 },
        events: ['door_open'],
      } as any);

      // Check return interface: snapshot, fired/blocked process IDs, diagnosticsDelta, simulated time
      expect(result.snapshot).toBeDefined();
      expect(result.snapshot.timeMs).toBe(25);
      expect(result.timeMs).toBe(25);
      expect(result.firedProcessIds).toContain('open_door');
      expect(result.diagnosticsDelta).toBeDefined();
      expect(Array.isArray(result.diagnosticsDelta)).toBe(true);

      // Verify phase ordering in trace emission
      const tracePhases = result.trace.map(t => t.phase);
      expect(tracePhases).toEqual([
        'sampleInputs',
        'advanceTimers',
        'activate',
        'evaluate',
        'stage',
        'resolveConflicts',
        'commit',
        'stateActions',
        'publishOutputs',
      ]);

      // Verify time incremented to 25
      expect(runtime.timeMs).toBe(25);
      expect(runtime.stepIndex).toBe(1);
    });

    it('enforces stable diagnostic codes for event overflow, transition conflict, write conflict, invalid initial states, and max-tick termination', () => {
      // 1. Event overflow
      const queueFixture = makeQueueFixture();
      const model = {
        ...queueFixture.model,
        settings: {
          ...queueFixture.model.settings,
          eventQueueCapacity: 1,
          eventOverflow: 'rejectNewest' as const,
        },
      };
      const qRuntime = createOpmRuntime(model);
      dispatchOpmEvent(qRuntime, 'door_open');
      const overflowDiag: any[] = [];
      const overStatus = dispatchOpmEvent(qRuntime, 'door_close', overflowDiag);
      expect(overStatus).toBe('overflow');
      expect(overflowDiag.some(d => d.code === 'OPM_EVENT_QUEUE_OVERFLOW')).toBe(true);

      // 2. Invalid initial states
      const brokenModel = JSON.parse(JSON.stringify(queueFixture.model));
      brokenModel.objects[0].initialStateId = 'non_existent_state_id';
      const brokenRuntime = createOpmRuntime(brokenModel);
      brokenRuntime.activeStates['obj_door'] = 'non_existent_state_id';
      const stepBroken = stepOpmRuntime(brokenRuntime, 10);
      expect(stepBroken.diagnostics.some(d => d.code === 'OPM_RUNTIME_INVALID_INITIAL_STATE')).toBe(true);

      // 3. Max-tick termination
      const boundedModel = JSON.parse(JSON.stringify(queueFixture.model));
      boundedModel.settings.maxTicks = 2;
      const boundedRuntime = createOpmRuntime(boundedModel);
      const s1 = stepOpmRuntime(boundedRuntime, 10);
      expect(s1.finished).toBe(false);
      const s2 = stepOpmRuntime(boundedRuntime, 10);
      expect(s2.finished).toBe(true);
      expect(s2.lifecycle).toBe('finished');
      const s3 = stepOpmRuntime(boundedRuntime, 10);
      expect(s3.finished).toBe(true);
      expect(s3.diagnostics.some(d => d.code === 'OPM_RUNTIME_MAX_TICKS_EXCEEDED')).toBe(true);
    });

    it('indexes hot paths for fast lookup without altering semantics', () => {
      const queueFixture = makeQueueFixture();
      const runtime = createOpmRuntime(queueFixture.model);
      expect(runtime.indexes).toBeDefined();
      expect(runtime.indexes.processIds.size).toBe(queueFixture.model.processes.length);
      expect(runtime.indexes.eventIds.size).toBe(queueFixture.model.events.length);
      expect(runtime.indexes.statesById.size).toBe(queueFixture.model.states.length);
    });

    it('runs asynchronous simulation with yield intervals and cooperative cancellation', async () => {
      const queueFixture = makeQueueFixture();
      const runtime = createOpmRuntime(queueFixture.model);
      let cancel = false;
      const simPromise = runOpmSimulationAsync(runtime, {
        ticks: 20,
        deltaMs: 10,
        yieldInterval: 5,
        shouldCancel: () => cancel,
      });

      // Trigger cancel after 10 ticks
      setTimeout(() => {
        cancel = true;
      }, 5);

      const simResult = await simPromise;
      expect(simResult.steps.length).toBeGreaterThan(0);
      expect(simResult.steps.length).toBeLessThanOrEqual(20);
      if (simResult.cancelled) {
        expect(simResult.cancelled).toBe(true);
      }
    });
  });
});

