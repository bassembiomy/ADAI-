import { describe, expect, it } from 'vitest';
import type { SemanticTraceFrame } from './smTrace';
import {
  flatOrFixture,
  nestedAndFixture,
  parallelHistoryFixture,
} from './smFixtures';
import {
  applyMappedInputs,
  applyAppFrameAndCommitOutputs,
  commitAppOutputRequest,
  createAppSimulationLifecycle,
  createAppSimulationSession,
  createFactoryIOMappings,
  createSimulationModelKey,
  readMappedOutputs,
  resetAppSimulationSession,
  SemanticModelError,
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

  it('commits reset-time mapped outputs from restored runtime defaults', async () => {
    const session = createAppSimulationSession(
      flatOrFixture(),
      createFactoryIOMappings([{
        adiaVarId: 'total',
        factoryTagId: 'motor-output',
        type: 'actuator',
      }]),
    );
    session.runtime.data.total = 99;
    const committed: Array<Readonly<Record<string, number | boolean>>> = [];

    const frame = await resetAppSimulationSession(
      session,
      async (outputs) => {
        committed.push(outputs);
      },
    );

    expect(frame.data.total).toBe(0);
    expect(committed).toEqual([{ 'motor-output': 0 }]);
  });

  it('serializes operations until an invalidated operation actually finishes', async () => {
    const lifecycle = createAppSimulationLifecycle();
    const initialGeneration = lifecycle.currentGeneration();
    const first = lifecycle.begin();

    expect(first).not.toBeNull();
    expect(lifecycle.begin()).toBeNull();

    lifecycle.invalidate();
    expect(lifecycle.isGenerationCurrent(initialGeneration)).toBe(false);
    expect(lifecycle.isCurrent(first!)).toBe(false);
    expect(lifecycle.begin()).toBeNull();

    const idle = lifecycle.whenIdle();
    lifecycle.finish(first!);
    await idle;
    const second = lifecycle.begin();
    expect(second).not.toBeNull();
    expect(lifecycle.isCurrent(second!)).toBe(true);
    lifecycle.finish(second!);
    expect(lifecycle.begin()).not.toBeNull();
  });

  it('keys semantic model identity without runtime-only React values', () => {
    const model = flatOrFixture();
    const first = createSimulationModelKey(model, []);
    model.states[0].isActive = true;
    model.variables[0].currentValue = true;

    expect(createSimulationModelKey(model, [])).toBe(first);

    model.transitions[0].condition = 'false';
    expect(createSimulationModelKey(model, [])).not.toBe(first);
  });

  it.each([
    {
      name: 'duplicate channel IDs',
      mappings: [
        { variableId: 'go', channelId: 'shared', direction: 'read' as const },
        { variableId: 'total', channelId: 'shared', direction: 'write' as const },
      ],
      code: 'APP_IO_CHANNEL_DUPLICATE',
    },
    {
      name: 'duplicate reads for one variable',
      mappings: [
        { variableId: 'go', channelId: 'sensor-a', direction: 'read' as const },
        { variableId: 'go', channelId: 'sensor-b', direction: 'read' as const },
      ],
      code: 'APP_IO_VARIABLE_DIRECTION_DUPLICATE',
    },
    {
      name: 'conflicting read and write directions for one variable',
      mappings: [
        { variableId: 'go', channelId: 'sensor', direction: 'read' as const },
        { variableId: 'go', channelId: 'actuator', direction: 'write' as const },
      ],
      code: 'APP_IO_VARIABLE_DIRECTION_CONFLICT',
    },
  ])('rejects $name', ({ mappings, code }) => {
    expect(() => createAppSimulationSession(flatOrFixture(), mappings))
      .toThrowError(SemanticModelError);
    try {
      createAppSimulationSession(flatOrFixture(), mappings);
    } catch (error) {
      expect((error as SemanticModelError).diagnostics)
        .toEqual(expect.arrayContaining([expect.objectContaining({ code })]));
    }
  });

  it('projects the advanced frame before awaiting output commitment', async () => {
    const events: string[] = [];
    let rejectOutput!: (reason: Error) => void;
    const outputPending = new Promise<void>((_resolve, reject) => {
      rejectOutput = reject;
    });

    const operation = applyAppFrameAndCommitOutputs(
      () => {
        events.push('ui');
      },
      async () => {
        events.push('output');
        await outputPending;
      },
    );

    expect(events).toEqual(['ui', 'output']);
    rejectOutput(new Error('physical output failed'));
    await expect(operation).rejects.toThrow('physical output failed');
  });

  it.each([
    {
      name: 'backend error responses',
      send: async () => ({ error: 'PLC disconnected' }),
      message: 'PLC disconnected',
    },
    {
      name: 'thrown IPC failures',
      send: async () => {
        throw new Error('IPC channel closed');
      },
      message: 'IPC channel closed',
    },
  ])('propagates $name from output commitment', async ({ send, message }) => {
    await expect(commitAppOutputRequest(send))
      .rejects.toThrow(`Factory I/O output commit failed: ${message}`);
  });
});
