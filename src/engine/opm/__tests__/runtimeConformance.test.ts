import { describe, it, expect } from 'vitest';
import {
  createOpmRuntime,
  stepOpmRuntime,
  dispatchOpmEvent,
  resetOpmRuntime,
  type OpmRuntime,
} from '../runtime';
import type { ExecutableOpmModel } from '../pipeline';
import type { OpmDiagnostic } from '../executableTypes';
import { createDefaultOpmExecutionConfig } from '../executableTypes';
import type { TypedExpressionIr } from '../expressionCompiler';

function boolLit(value: boolean): TypedExpressionIr {
  return { kind: 'literal', type: { kind: 'bool' }, value } as TypedExpressionIr;
}

function intLit(value: number): TypedExpressionIr {
  return { kind: 'literal', type: { kind: 'int32' }, value } as TypedExpressionIr;
}

function divByZeroIr(): TypedExpressionIr {
  return {
    kind: 'binary',
    op: 'divide',
    type: { kind: 'int32' },
    left: intLit(1),
    right: intLit(0),
  } as unknown as TypedExpressionIr;
}

function src(elementId: string, propertyPath = 'assignments') {
  return { elementId, propertyPath };
}

function cyclicWriter(
  id: string,
  order: number,
  targetKey: string,
  ir: TypedExpressionIr,
  priority = 1,
) {
  return {
    enabled: true,
    id,
    name: id,
    cIdentifier: id,
    physical: false,
    order,
    source: src(id, 'name'),
    activation: 'cyclic' as const,
    inputAttributeIds: [],
    outputAttributeIds: [targetKey],
    guardText: '',
    assignments: [
      {
        id: `${id}_a`,
        targetAttributeId: targetKey,
        resolvedTargetCIdentifier: targetKey,
        operator: '=' as const,
        expressionText: 'expr',
        expressionIr: ir,
        enabled: true,
        source: src(id),
      },
    ],
    priority,
    periodMs: 10,
    debounceMs: 0,
    reentrancy: 'reject' as const,
  };
}

function intAttr(id: string, initialValue: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    displayName: id,
    cIdentifier: id,
    type: { kind: 'int32' as const },
    initialValue,
    overflow: 'wrap' as const,
    access: 'readWrite' as const,
    persistent: false,
    ...extra,
  };
}

function modelWithGuardedResultLink(guardPasses: boolean): ExecutableOpmModel {
  const config = createDefaultOpmExecutionConfig();
  return {
    executionEnabled: true,
    fingerprint: 'guarded-result-link',
    settings: config.settings,
    objects: [
      {
        id: 'obj_main',
        name: 'Main',
        cIdentifier: 'Main',
        physical: false,
        order: 0,
        source: src('obj_main', 'name'),
        attributes: [intAttr('scratch', 0), intAttr('output', 0)],
        stateIds: [],
      },
    ],
    states: [],
    processes: [cyclicWriter('proc_fire', 0, 'scratch', intLit(1))],
    links: [
      {
        enabled: true,
        id: 'link_result',
        type: 'result',
        sourceId: 'proc_fire',
        targetId: 'obj_main',
        order: 0,
        source: src('link_result', 'guard'),
        guardText: '',
        guardIr: boolLit(guardPasses),
        assignments: [
          {
            id: 'link_result_a',
            targetAttributeId: 'output',
            resolvedTargetCIdentifier: 'output',
            operator: '=' as const,
            expressionText: '99',
            expressionIr: intLit(99),
            enabled: true,
            source: src('link_result'),
          },
        ],
        priority: 1,
        delayMs: 0,
      },
    ],
    events: [],
    enums: [],
    symbols: {},
    sourceByNormalizedId: {},
  } as unknown as ExecutableOpmModel;
}

function modelWithUnfiredSourceResultLink(): ExecutableOpmModel {
  const config = createDefaultOpmExecutionConfig();
  config.events = [{ id: 'ev_go', displayName: 'Go', cIdentifier: 'ev_go' }];
  const proc: unknown = {
    enabled: true,
    id: 'proc_never',
    name: 'Never',
    cIdentifier: 'Never',
    physical: false,
    order: 0,
    source: src('proc_never', 'name'),
    activation: 'triggered' as const,
    inputAttributeIds: [],
    outputAttributeIds: [],
    guardText: '',
    assignments: [],
    priority: 1,
    debounceMs: 0,
    reentrancy: 'reject' as const,
  };
  return {
    executionEnabled: true,
    fingerprint: 'unfired-source-result-link',
    settings: config.settings,
    objects: [
      {
        id: 'obj_main',
        name: 'Main',
        cIdentifier: 'Main',
        physical: false,
        order: 0,
        source: src('obj_main', 'name'),
        attributes: [intAttr('output', 0)],
        stateIds: [],
      },
    ],
    states: [],
    processes: [proc],
    links: [
      {
        enabled: true,
        id: 'link_result',
        type: 'result',
        sourceId: 'proc_never',
        targetId: 'obj_main',
        order: 0,
        source: src('link_result', 'guard'),
        guardText: '',
        guardIr: boolLit(true),
        assignments: [
          {
            id: 'link_result_a',
            targetAttributeId: 'output',
            resolvedTargetCIdentifier: 'output',
            operator: '=' as const,
            expressionText: '99',
            expressionIr: intLit(99),
            enabled: true,
            source: src('link_result'),
          },
        ],
        priority: 1,
        delayMs: 0,
      },
    ],
    events: config.events,
    enums: [],
    symbols: {},
    sourceByNormalizedId: {},
  } as unknown as ExecutableOpmModel;
}

function modelWithDivisionByZero(): ExecutableOpmModel {
  const config = createDefaultOpmExecutionConfig();
  return {
    executionEnabled: true,
    fingerprint: 'div-zero',
    settings: config.settings,
    objects: [
      {
        id: 'obj_main',
        name: 'Main',
        cIdentifier: 'Main',
        physical: false,
        order: 0,
        source: src('obj_main', 'name'),
        attributes: [intAttr('output', 7)],
        stateIds: [],
      },
    ],
    states: [],
    processes: [cyclicWriter('proc_div', 0, 'output', divByZeroIr())],
    links: [],
    events: [],
    enums: [],
    symbols: {},
    sourceByNormalizedId: {},
  } as unknown as ExecutableOpmModel;
}

function triggeredModel(): ExecutableOpmModel {
  const config = createDefaultOpmExecutionConfig();
  config.events = [{ id: 'ev_go', displayName: 'Go', cIdentifier: 'ev_go' }];
  return {
    executionEnabled: true,
    fingerprint: 'triggered-waiting',
    settings: config.settings,
    objects: [],
    states: [],
    processes: [
      {
        enabled: true,
        id: 'proc_wait',
        name: 'Wait',
        cIdentifier: 'Wait',
        physical: false,
        order: 0,
        source: src('proc_wait', 'name'),
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
        sourceId: 'proc_wait',
        targetId: 'proc_wait',
        order: 0,
        source: src('link_trig', 'guard'),
        guardText: '',
        eventId: 'ev_go',
        assignments: [],
        priority: 1,
        delayMs: 0,
      },
    ],
    events: config.events,
    enums: [],
    symbols: {},
    sourceByNormalizedId: {},
  } as unknown as ExecutableOpmModel;
}

function twoObjectTransitionModel(maxTransitions: number): ExecutableOpmModel {
  const config = createDefaultOpmExecutionConfig();
  config.settings.maxTransitions = maxTransitions;
  config.events = [
    { id: 'ev_1', displayName: 'E1', cIdentifier: 'ev_1' },
    { id: 'ev_2', displayName: 'E2', cIdentifier: 'ev_2' },
  ];
  const mkObj = (n: string) => ({
    id: `obj_${n}`,
    name: `Obj${n}`,
    cIdentifier: `Obj${n}`,
    physical: false,
    order: 0,
    source: src(`obj_${n}`, 'name'),
    attributes: [],
    stateIds: [`st_${n}_a`, `st_${n}_b`],
    initialStateId: `st_${n}_a`,
  });
  const mkState = (n: string, s: string, initial: boolean, order: number) => ({
    id: `st_${n}_${s}`,
    name: s,
    cIdentifier: s,
    parentObjectId: `obj_${n}`,
    isInitial: initial,
    isTerminal: false,
    order,
    source: src(`st_${n}_${s}`, 'name'),
    entryAssignments: [],
    exitAssignments: [],
  });
  return {
    executionEnabled: true,
    fingerprint: 'two-owner-transitions',
    settings: config.settings,
    objects: [mkObj('1'), mkObj('2')],
    states: [mkState('1', 'a', true, 0), mkState('1', 'b', false, 1), mkState('2', 'a', true, 0), mkState('2', 'b', false, 1)],
    processes: [],
    links: [
      {
        enabled: true,
        id: 'link_t1',
        type: 'trigger',
        sourceId: 'st_1_a',
        targetId: 'st_1_b',
        order: 0,
        source: src('link_t1', 'guard'),
        guardText: '',
        eventId: 'ev_1',
        assignments: [],
        transition: { ownerObjectId: 'obj_1', sourceStateId: 'st_1_a', targetStateId: 'st_1_b' },
        priority: 1,
        delayMs: 0,
      },
      {
        enabled: true,
        id: 'link_t2',
        type: 'trigger',
        sourceId: 'st_2_a',
        targetId: 'st_2_b',
        order: 1,
        source: src('link_t2', 'guard'),
        guardText: '',
        eventId: 'ev_2',
        assignments: [],
        transition: { ownerObjectId: 'obj_2', sourceStateId: 'st_2_a', targetStateId: 'st_2_b' },
        priority: 1,
        delayMs: 0,
      },
    ],
    events: config.events,
    enums: [],
    symbols: {},
    sourceByNormalizedId: {},
  } as unknown as ExecutableOpmModel;
}

describe('OPM runtime conformance (canonical step semantics)', () => {
  it('does not execute a result-link assignment when its source process did not fire', () => {
    const runtime = createOpmRuntime(modelWithGuardedResultLink(false));
    const result = stepOpmRuntime(runtime, 10);
    expect(result.values.output).toBe(0);
    expect(result.traversedLinkIds).toEqual([]);
  });

  it('does not traverse a guard-true result link when its source process never fires', () => {
    const runtime = createOpmRuntime(modelWithUnfiredSourceResultLink());
    const result = stepOpmRuntime(runtime, 10);
    expect(result.firedProcessIds).not.toContain('proc_never');
    expect(result.values.output).toBe(0);
    expect(result.traversedLinkIds).toEqual([]);
  });

  it('executes a result-link assignment when its source process fires and the guard passes', () => {
    const runtime = createOpmRuntime(modelWithGuardedResultLink(true));
    const result = stepOpmRuntime(runtime, 10);
    expect(result.firedProcessIds).toContain('proc_fire');
    expect(result.traversedLinkIds).toContain('link_result');
    expect(result.values.output).toBe(99);
    expect(result.values.scratch).toBe(1);
  });

  it('rejects a failed expression without committing a fabricated zero', () => {
    const runtime = createOpmRuntime(modelWithDivisionByZero());
    const result = stepOpmRuntime(runtime, 10);
    expect(result.values.output).toBe(7);
    expect(result.committedWrites).toEqual([]);
    expect(result.committedWriteIds).toEqual([]);
    expect(result.diagnostics.map(item => item.code)).toContain('OPM_EXPR_DIV_ZERO');
  });

  it('reports waiting while a triggered process has no event', () => {
    const result = stepOpmRuntime(createOpmRuntime(triggeredModel()), 10);
    expect(result.lifecycle).toBe('waiting');
    expect(result.finished).toBe(false);
    expect(result.status).toBe('ok');
    expect(result.firedProcessIds).toEqual([]);
  });

  it('returns a complete machine-readable snapshot', () => {
    const runtime = createOpmRuntime(modelWithGuardedResultLink(false));
    const result = stepOpmRuntime(runtime, 10);
    expect(result.stepIndex).toBe(1);
    expect(result.timeMs).toBe(10);
    expect(result.status).toBeDefined();
    expect(result.lifecycle).toBeDefined();
    expect(result.values).toBeDefined();
    expect(result.activeStates).toBeDefined();
    expect(result.queuedEventIds).toEqual([]);
    expect(result.stateTimersMs).toBeDefined();
    expect(result.processTimersMs).toBeDefined();
    expect(result.firedProcessIds).toBeDefined();
    expect(result.blockedProcessIds).toBeDefined();
    expect(result.traversedLinkIds).toBeDefined();
    expect(result.committedWriteIds).toBeDefined();
    expect(result.transitions).toBeDefined();
    expect(result.diagnostics).toBeDefined();
  });

  it('enforces maxStagedWrites and reports OPM_STAGED_WRITES_OVERFLOW', () => {
    const config = createDefaultOpmExecutionConfig();
    config.settings.maxStagedWrites = 2;
    const model = {
      executionEnabled: true,
      fingerprint: 'staged-cap',
      settings: config.settings,
      objects: [
        {
          id: 'obj_m', name: 'M', cIdentifier: 'M', physical: false, order: 0,
          source: src('obj_m', 'name'),
          attributes: [intAttr('a', 0), intAttr('b', 0), intAttr('c', 0)],
          stateIds: [],
        },
      ],
      states: [],
      processes: [
        cyclicWriter('p_a', 0, 'a', intLit(1)),
        cyclicWriter('p_b', 1, 'b', intLit(2)),
        cyclicWriter('p_c', 2, 'c', intLit(3)),
      ],
      links: [],
      events: [],
      enums: [],
      symbols: {},
      sourceByNormalizedId: {},
    } as unknown as ExecutableOpmModel;
    const runtime = createOpmRuntime(model);
    const result = stepOpmRuntime(runtime, 10);
    expect(result.stagedWrites.length).toBeLessThanOrEqual(2);
    expect(result.diagnostics.map(d => d.code)).toContain('OPM_STAGED_WRITES_OVERFLOW');
  });

  it('enforces maxTransitions and reports OPM_TRANSITIONS_OVERFLOW', () => {
    const runtime = createOpmRuntime(twoObjectTransitionModel(1));
    dispatchOpmEvent(runtime, 'ev_1');
    dispatchOpmEvent(runtime, 'ev_2');
    const result = stepOpmRuntime(runtime, 10);
    expect(result.transitions.length).toBeLessThanOrEqual(1);
    expect(result.diagnostics.map(d => d.code)).toContain('OPM_TRANSITIONS_OVERFLOW');
  });

  it('enforces traceCapacity and reports OPM_TRACE_OVERFLOW', () => {
    const config = createDefaultOpmExecutionConfig();
    config.settings.traceCapacity = 4;
    const model = {
      executionEnabled: true,
      fingerprint: 'trace-cap',
      settings: config.settings,
      objects: [],
      states: [],
      processes: [],
      links: [],
      events: [],
      enums: [],
      symbols: {},
      sourceByNormalizedId: {},
    } as unknown as ExecutableOpmModel;
    const runtime = createOpmRuntime(model);
    const result = stepOpmRuntime(runtime, 10);
    expect(result.trace.length).toBeLessThanOrEqual(4);
    expect(result.diagnostics.map(d => d.code)).toContain('OPM_TRACE_OVERFLOW');
  });

  it('rejectNewest keeps the oldest queued event and reports overflow', () => {
    const config = createDefaultOpmExecutionConfig();
    config.settings.eventQueueCapacity = 1;
    config.settings.eventOverflow = 'rejectNewest';
    config.events = [
      { id: 'ev_a', displayName: 'A', cIdentifier: 'ev_a' },
      { id: 'ev_b', displayName: 'B', cIdentifier: 'ev_b' },
    ];
    const model = {
      executionEnabled: true,
      fingerprint: 'reject-newest',
      settings: config.settings,
      objects: [], states: [], processes: [], links: [],
      events: config.events, enums: [], symbols: {}, sourceByNormalizedId: {},
    } as unknown as ExecutableOpmModel;
    const runtime = createOpmRuntime(model);
    expect(dispatchOpmEvent(runtime, 'ev_a')).toBe('accepted');
    expect(dispatchOpmEvent(runtime, 'ev_b')).toBe('overflow');
    expect(runtime.eventQueue).toEqual(['ev_a']);
  });

  it('dropOldest evicts the oldest queued event to accept the newest', () => {
    const config = createDefaultOpmExecutionConfig();
    config.settings.eventQueueCapacity = 1;
    config.settings.eventOverflow = 'dropOldest';
    config.events = [
      { id: 'ev_a', displayName: 'A', cIdentifier: 'ev_a' },
      { id: 'ev_b', displayName: 'B', cIdentifier: 'ev_b' },
    ];
    const model = {
      executionEnabled: true,
      fingerprint: 'drop-oldest',
      settings: config.settings,
      objects: [], states: [], processes: [], links: [],
      events: config.events, enums: [], symbols: {}, sourceByNormalizedId: {},
    } as unknown as ExecutableOpmModel;
    const runtime = createOpmRuntime(model);
    expect(dispatchOpmEvent(runtime, 'ev_a')).toBe('accepted');
    expect(dispatchOpmEvent(runtime, 'ev_b')).toBe('accepted');
    expect(runtime.eventQueue).toEqual(['ev_b']);
  });

  it('emits OPM_EVENT_QUEUE_OVERFLOW diagnostic on event queue overflow', () => {
    const config = createDefaultOpmExecutionConfig();
    config.settings.eventQueueCapacity = 1;
    config.settings.eventOverflow = 'rejectNewest';
    config.events = [
      { id: 'ev_a', displayName: 'A', cIdentifier: 'ev_a' },
      { id: 'ev_b', displayName: 'B', cIdentifier: 'ev_b' },
    ];
    const model = {
      executionEnabled: true,
      fingerprint: 'event-overflow-diag',
      settings: config.settings,
      objects: [], states: [], processes: [], links: [],
      events: config.events, enums: [], symbols: {}, sourceByNormalizedId: {},
    } as unknown as ExecutableOpmModel;
    const runtime = createOpmRuntime(model);
    const diagnostics: OpmDiagnostic[] = [];
    expect(dispatchOpmEvent(runtime, 'ev_a', diagnostics)).toBe('accepted');
    expect(diagnostics).toEqual([]);
    expect(dispatchOpmEvent(runtime, 'ev_b', diagnostics)).toBe('overflow');
    expect(diagnostics.map(d => d.code)).toContain('OPM_EVENT_QUEUE_OVERFLOW');
  });

  it('fails closed on compound /= by zero without fabricating a value', () => {
    const config = createDefaultOpmExecutionConfig();
    const base = cyclicWriter('p_d', 0, 'x', intLit(0));
    const proc = {
      ...base,
      assignments: base.assignments.map(a => ({ ...a, operator: '/=' as const })),
    };
    const model = {
      executionEnabled: true,
      fingerprint: 'compound-div-zero',
      settings: config.settings,
      objects: [
        {
          id: 'obj_m', name: 'M', cIdentifier: 'M', physical: false, order: 0,
          source: src('obj_m', 'name'),
          attributes: [intAttr('x', 7)],
          stateIds: [],
        },
      ],
      states: [],
      processes: [proc],
      links: [],
      events: [],
      enums: [],
      symbols: {},
      sourceByNormalizedId: {},
    } as unknown as ExecutableOpmModel;
    const result = stepOpmRuntime(createOpmRuntime(model), 10);
    expect(result.values.x).toBe(7);
    expect(result.committedWrites).toEqual([]);
    expect(result.committedWriteIds).toEqual([]);
    expect(result.diagnostics.map(d => d.code)).toContain('OPM_EXPR_DIV_ZERO');
  });

  it('uint32 diagnostic policy preserves negative values without clamping', () => {
    const config = createDefaultOpmExecutionConfig();
    const model = {
      executionEnabled: true,
      fingerprint: 'num-uint32-diagnostic',
      settings: config.settings,
      objects: [
        {
          id: 'obj_m', name: 'M', cIdentifier: 'M', physical: false, order: 0,
          source: src('obj_m', 'name'),
          attributes: [
            { ...intAttr('x', 5, { overflow: 'diagnostic' }), type: { kind: 'uint32' as const } },
          ],
          stateIds: [],
        },
      ],
      states: [],
      processes: [cyclicWriter('p_w', 0, 'x', intLit(-3))],
      links: [],
      events: [],
      enums: [],
      symbols: {},
      sourceByNormalizedId: {},
    } as unknown as ExecutableOpmModel;
    const result = stepOpmRuntime(createOpmRuntime(model), 10);
    expect(result.values.x).toBe(-3);
    expect(result.diagnostics.map(d => d.code)).toContain('OPM_NUMERIC_OVERFLOW');
  });

  it('diagnostic overflow policy reports OPM_NUMERIC_OVERFLOW without clamping', () => {
    const config = createDefaultOpmExecutionConfig();
    const model = {
      executionEnabled: true,
      fingerprint: 'num-diagnostic',
      settings: config.settings,
      objects: [
        {
          id: 'obj_m', name: 'M', cIdentifier: 'M', physical: false, order: 0,
          source: src('obj_m', 'name'),
          attributes: [intAttr('x', 0, { maximum: 100, overflow: 'diagnostic' })],
          stateIds: [],
        },
      ],
      states: [],
      processes: [cyclicWriter('p_w', 0, 'x', intLit(999))],
      links: [],
      events: [],
      enums: [],
      symbols: {},
      sourceByNormalizedId: {},
    } as unknown as ExecutableOpmModel;
    const result = stepOpmRuntime(createOpmRuntime(model), 10);
    expect(result.values.x).toBe(999);
    expect(result.diagnostics.map(d => d.code)).toContain('OPM_NUMERIC_OVERFLOW');
  });

  it('wrap overflow policy wraps int32 past INT32_MAX', () => {
    const config = createDefaultOpmExecutionConfig();
    const model = {
      executionEnabled: true,
      fingerprint: 'num-wrap',
      settings: config.settings,
      objects: [
        {
          id: 'obj_m', name: 'M', cIdentifier: 'M', physical: false, order: 0,
          source: src('obj_m', 'name'),
          attributes: [intAttr('x', 0, { overflow: 'wrap' })],
          stateIds: [],
        },
      ],
      states: [],
      processes: [cyclicWriter('p_w', 0, 'x', intLit(2147483648))],
      links: [],
      events: [],
      enums: [],
      symbols: {},
      sourceByNormalizedId: {},
    } as unknown as ExecutableOpmModel;
    const result = stepOpmRuntime(createOpmRuntime(model), 10);
    expect(result.values.x).toBe(-2147483648);
  });

  it('saturate overflow policy clamps at the declared maximum', () => {
    const config = createDefaultOpmExecutionConfig();
    const model = {
      executionEnabled: true,
      fingerprint: 'num-saturate',
      settings: config.settings,
      objects: [
        {
          id: 'obj_m', name: 'M', cIdentifier: 'M', physical: false, order: 0,
          source: src('obj_m', 'name'),
          attributes: [intAttr('x', 0, { maximum: 100, overflow: 'saturate' })],
          stateIds: [],
        },
      ],
      states: [],
      processes: [cyclicWriter('p_w', 0, 'x', intLit(999))],
      links: [],
      events: [],
      enums: [],
      symbols: {},
      sourceByNormalizedId: {},
    } as unknown as ExecutableOpmModel;
    const result = stepOpmRuntime(createOpmRuntime(model), 10);
    expect(result.values.x).toBe(100);
  });

  it('runs state exit assignments before entry assignments', () => {
    const config = createDefaultOpmExecutionConfig();
    config.events = [{ id: 'ev_go', displayName: 'Go', cIdentifier: 'ev_go' }];
    const model = {
      executionEnabled: true,
      fingerprint: 'exit-before-entry',
      settings: config.settings,
      objects: [
        {
          id: 'obj_m', name: 'M', cIdentifier: 'M', physical: false, order: 0,
          source: src('obj_m', 'name'),
          attributes: [intAttr('out', 0)],
          stateIds: ['st_a', 'st_b'],
          initialStateId: 'st_a',
        },
      ],
      states: [
        {
          id: 'st_a', name: 'A', cIdentifier: 'A', parentObjectId: 'obj_m',
          isInitial: true, isTerminal: false, order: 0, source: src('st_a', 'name'),
          entryAssignments: [],
          exitAssignments: [
            {
              id: 'exit_a', targetAttributeId: 'out', resolvedTargetCIdentifier: 'out',
              operator: '=' as const, expressionText: '1', expressionIr: intLit(1),
              enabled: true, source: src('st_a'),
            },
          ],
        },
        {
          id: 'st_b', name: 'B', cIdentifier: 'B', parentObjectId: 'obj_m',
          isInitial: false, isTerminal: false, order: 1, source: src('st_b', 'name'),
          entryAssignments: [
            {
              id: 'entry_b', targetAttributeId: 'out', resolvedTargetCIdentifier: 'out',
              operator: '=' as const, expressionText: '2', expressionIr: intLit(2),
              enabled: true, source: src('st_b'),
            },
          ],
          exitAssignments: [],
        },
      ],
      processes: [],
      links: [
        {
          enabled: true, id: 'link_ab', type: 'trigger', sourceId: 'st_a', targetId: 'st_b',
          order: 0, source: src('link_ab', 'guard'), guardText: '', eventId: 'ev_go',
          assignments: [],
          transition: { ownerObjectId: 'obj_m', sourceStateId: 'st_a', targetStateId: 'st_b' },
          priority: 1, delayMs: 0,
        },
      ],
      events: config.events,
      enums: [],
      symbols: {},
      sourceByNormalizedId: {},
    } as unknown as ExecutableOpmModel;
    const runtime = createOpmRuntime(model);
    dispatchOpmEvent(runtime, 'ev_go');
    const result = stepOpmRuntime(runtime, 10);
    expect(result.activeStates.obj_m).toBe('st_b');
    expect(result.values.out).toBe(2);
  });

  it('emits OPM_TRANSITION_STALE when a delayed transition source changes first', () => {
    const config = createDefaultOpmExecutionConfig();
    config.events = [{ id: 'ev_d', displayName: 'D', cIdentifier: 'ev_d' }];
    const model = {
      executionEnabled: true,
      fingerprint: 'delayed-stale',
      settings: config.settings,
      objects: [
        {
          id: 'obj_m', name: 'M', cIdentifier: 'M', physical: false, order: 0,
          source: src('obj_m', 'name'),
          attributes: [],
          stateIds: ['st_a', 'st_b', 'st_c'],
          initialStateId: 'st_a',
        },
      ],
      states: [
        { id: 'st_a', name: 'A', cIdentifier: 'A', parentObjectId: 'obj_m', isInitial: true, isTerminal: false, order: 0, source: src('st_a', 'name'), entryAssignments: [], exitAssignments: [] },
        { id: 'st_b', name: 'B', cIdentifier: 'B', parentObjectId: 'obj_m', isInitial: false, isTerminal: false, order: 1, source: src('st_b', 'name'), entryAssignments: [], exitAssignments: [] },
        { id: 'st_c', name: 'C', cIdentifier: 'C', parentObjectId: 'obj_m', isInitial: false, isTerminal: false, order: 2, source: src('st_c', 'name'), entryAssignments: [], exitAssignments: [] },
      ],
      processes: [],
      links: [
        {
          enabled: true, id: 'link_delay', type: 'trigger', sourceId: 'st_a', targetId: 'st_b',
          order: 0, source: src('link_delay', 'guard'), guardText: '', eventId: 'ev_d',
          assignments: [],
          transition: { ownerObjectId: 'obj_m', sourceStateId: 'st_a', targetStateId: 'st_b' },
          priority: 1, delayMs: 10,
        },
      ],
      events: config.events,
      enums: [],
      symbols: {},
      sourceByNormalizedId: {},
    } as unknown as ExecutableOpmModel;
    const runtime = createOpmRuntime(model);
    dispatchOpmEvent(runtime, 'ev_d');
    const s1 = stepOpmRuntime(runtime, 10);
    expect(s1.activeStates.obj_m).toBe('st_a');
    runtime.activeStates.obj_m = 'st_c';
    const s2 = stepOpmRuntime(runtime, 10);
    expect(s2.activeStates.obj_m).toBe('st_c');
    expect(s2.diagnostics.map(d => d.code)).toContain('OPM_TRANSITION_STALE');
  });

  it('consumes duplicate FIFO events one occurrence per step', () => {
    const config = createDefaultOpmExecutionConfig();
    config.settings.eventQueueCapacity = 4;
    config.events = [{ id: 'door_open', displayName: 'Door Open', cIdentifier: 'door_open' }];
    const model = {
      executionEnabled: true,
      fingerprint: 'fifo-dup',
      settings: config.settings,
      objects: [],
      states: [],
      processes: [
        {
          enabled: true, id: 'proc_log', name: 'ProcLog', cIdentifier: 'ProcLog',
          physical: false, order: 0, source: src('proc_log', 'name'),
          activation: 'triggered' as const, inputAttributeIds: [], outputAttributeIds: [],
          guardText: '', assignments: [], priority: 1, debounceMs: 0, reentrancy: 'reject' as const,
        },
      ],
      links: [
        {
          enabled: true, id: 'link_trig', type: 'trigger', sourceId: 'proc_log', targetId: 'proc_log',
          order: 0, source: src('link_trig', 'guard'), guardText: '', eventId: 'door_open',
          assignments: [], priority: 1, delayMs: 0,
        },
      ],
      events: config.events,
      enums: [],
      symbols: {},
      sourceByNormalizedId: {},
    } as unknown as ExecutableOpmModel;
    const runtime = createOpmRuntime(model);
    expect(dispatchOpmEvent(runtime, 'door_open')).toBe('accepted');
    expect(dispatchOpmEvent(runtime, 'door_open')).toBe('accepted');
    const s1 = stepOpmRuntime(runtime, 10);
    expect(s1.consumedEventIds).toEqual(['door_open']);
    expect(s1.queuedEventIds).toEqual(['door_open']);
    const s2 = stepOpmRuntime(runtime, 10);
    expect(s2.consumedEventIds).toEqual(['door_open']);
    expect(s2.queuedEventIds).toEqual([]);
  });

  it('reset reconstructs values, states, timers, queue, debounce, and delayed transitions', () => {
    const config = createDefaultOpmExecutionConfig();
    config.events = [{ id: 'ev_go', displayName: 'Go', cIdentifier: 'ev_go' }];
    const model = {
      executionEnabled: true,
      fingerprint: 'reset-complete',
      settings: config.settings,
      objects: [
        {
          id: 'obj_m', name: 'M', cIdentifier: 'M', physical: false, order: 0,
          source: src('obj_m', 'name'),
          attributes: [intAttr('n', 0)],
          stateIds: ['st_a', 'st_b'],
          initialStateId: 'st_a',
        },
      ],
      states: [
        { id: 'st_a', name: 'A', cIdentifier: 'A', parentObjectId: 'obj_m', isInitial: true, isTerminal: false, order: 0, source: src('st_a', 'name'), entryAssignments: [], exitAssignments: [] },
        { id: 'st_b', name: 'B', cIdentifier: 'B', parentObjectId: 'obj_m', isInitial: false, isTerminal: false, order: 1, source: src('st_b', 'name'), entryAssignments: [], exitAssignments: [] },
      ],
      processes: [cyclicWriter('p_inc', 0, 'n', intLit(1))],
      links: [
        {
          enabled: true, id: 'link_d', type: 'trigger', sourceId: 'st_a', targetId: 'st_b',
          order: 0, source: src('link_d', 'guard'), guardText: '', eventId: 'ev_go',
          assignments: [],
          transition: { ownerObjectId: 'obj_m', sourceStateId: 'st_a', targetStateId: 'st_b' },
          priority: 1, delayMs: 50,
        },
      ],
      events: config.events,
      enums: [],
      symbols: {},
      sourceByNormalizedId: {},
    } as unknown as ExecutableOpmModel;
    const runtime: OpmRuntime = createOpmRuntime(model);
    dispatchOpmEvent(runtime, 'ev_go');
    stepOpmRuntime(runtime, 10);
    expect(runtime.values.n).toBe(1);
    expect(runtime.delayedTransitions.length).toBe(1);
    expect(runtime.stepIndex).toBe(1);
    resetOpmRuntime(runtime);
    expect(runtime.stepIndex).toBe(0);
    expect(runtime.timeMs).toBe(0);
    expect(runtime.values.n).toBe(0);
    expect(runtime.activeStates.obj_m).toBe('st_a');
    expect(runtime.eventQueue).toEqual([]);
    expect(runtime.delayedTransitions).toEqual([]);
    expect(runtime.stateTimeouts).toEqual({});
    expect(runtime.processTimers).toEqual({});
    expect(runtime.processLastFiredTime).toEqual({});
    expect(runtime.ioInputs).toEqual({});
    expect(runtime.ioOutputs).toEqual({});
  });
});
