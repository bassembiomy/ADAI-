import { describe, expect, it } from 'vitest';
import type { SemanticTraceFrame } from './smTrace';
import {
  flatOrFixture,
  nestedAndFixture,
  parallelHistoryFixture,
} from './smFixtures';
import {
  applyMappedInputs,
  createAppSimulationSession,
  createFactoryIOMappings,
  readMappedOutputs,
  traceFrameToAppUpdate,
} from './smAppAdapter';

const frameFixture = (
  overrides: Partial<SemanticTraceFrame> = {},
): SemanticTraceFrame => ({
  sequence: 1,
  elapsedMs: 10,
  activeStateIds: [],
  actions: [],
  data: {},
  stateTimersMs: {},
  history: {},
  error: null,
  ...overrides,
});

describe('state-machine application adapter', () => {
  it('creates and initializes a session from the current React model shape', () => {
    const currentModel = flatOrFixture();
    const legacyLayers = currentModel.layers.map(
      ({ decomposition: _decomposition, ...layer }) => layer,
    );

    const session = createAppSimulationSession({
      ...currentModel,
      schemaVersion: 3,
      layers: legacyLayers,
    });

    expect(session.initialFrame.activeStateIds).toEqual(['a']);
    expect(session.runtime.data.go).toBe(false);
  });

  it('maps a trace frame to the active-state, variable, timer, and transition UI shapes', () => {
    const session = createAppSimulationSession(nestedAndFixture());
    const update = traceFrameToAppUpdate(
      frameFixture({
        activeStateIds: ['parallel', 'region_a', 'region_b'],
        actions: ['during:REGION_A', 'transition:t_parallel'],
        data: { x: 2, enabled: true },
        stateTimersMs: { parallel: 10, region_a: 10, region_b: 10 },
      }),
      session.ir,
    );

    expect(update.activeStates).toEqual({
      root: 'parallel',
      parallel_region_a: 'region_a',
      parallel_region_b: 'region_b',
    });
    expect(update.variableValues).toEqual({ x: 2, enabled: true });
    expect(update.stateTimers).toEqual({
      parallel: 10,
      region_a: 10,
      region_b: 10,
    });
    expect(update.firedTransitions).toEqual({ t_parallel: 1 });
    expect(update.traceEvents).toEqual([
      expect.objectContaining({
        event: 'Transition',
        transitionId: 't_parallel',
      }),
    ]);
    expect(Object.isFrozen(update)).toBe(true);
    expect(Object.isFrozen(update.activeStates)).toBe(true);
  });

  it('maps only explicitly configured Factory I/O directions', () => {
    const model = flatOrFixture();
    const session = createAppSimulationSession(
      model,
      createFactoryIOMappings([
        {
          adiaVarId: 'go',
          factoryTagId: 101,
          type: 'sensor',
        },
        {
          adiaVarId: 'total',
          factoryTagId: 'motor-output',
          type: 'actuator',
        },
      ]),
    );

    applyMappedInputs(session, {
      101: true,
      'motor-output': 999,
      unmapped: 123,
    });
    session.runtime.data.total = 7;

    expect(session.runtime.data.go).toBe(true);
    expect(session.runtime.data.total).toBe(7);
    expect(readMappedOutputs(session)).toEqual({ 'motor-output': 7 });
  });

  it('does not produce a terminal reset event', () => {
    const session = createAppSimulationSession(
      parallelHistoryFixture('parallel-terminal'),
    );
    const update = traceFrameToAppUpdate(
      frameFixture({
        activeStateIds: ['PARENT', 'TERMINAL_CHILD', 'WORKER'],
        actions: [],
      }),
      session.ir,
    );

    expect(
      update.traceEvents.some(
        (event) => event.transitionId === 'TERMINAL_RESET',
      ),
    ).toBe(false);
  });
});
