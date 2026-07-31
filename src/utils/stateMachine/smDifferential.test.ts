import { describe, expect, it } from 'vitest';
import { buildSemanticModel } from './smSemanticBuilder';
import {
  renderConfigHeader,
  renderCoreHeader,
  renderCoreSource,
  renderUserLogicSource,
} from './smCGenerator';
import { flatOrFixture } from './smFixtures';
import {
  compareSemanticTraces,
  type SemanticTraceFrame,
} from './smTrace';
import {
  semanticFixture,
  hybridXBridgesFixture,
  type DifferentialFixtureName,
} from './smFixtures';
import {
  compileAndRunCTrace,
  runInterpreterTrace,
} from './smCHarness';

const frame = (
  sequence: number,
  activeStateIds: string[] = ['a'],
): SemanticTraceFrame => ({
  sequence,
  elapsedMs: 10,
  activeStateIds,
  actions: [],
  data: { go: false },
  stateTimersMs: { a: 10 },
  history: { root: 'a' },
  mappedOutputs: {},
  ioEffects: { safeOutputsApplied: 0, watchdogKicks: 0 },
  error: null,
});

describe('semantic trace comparison', () => {
  it('reports the first differing frame with both values', () => {
    const expected = [frame(0), frame(1), frame(2, ['b'])];
    const actual = [frame(0), frame(1, ['b']), frame(2, ['b'])];

    expect(compareSemanticTraces(expected, actual)).toEqual({
      index: 1,
      expected: expected[1],
      actual: actual[1],
    });
  });

  it('reports a missing frame at the first length difference', () => {
    const expected = [frame(0), frame(1)];
    const actual = [frame(0)];

    expect(compareSemanticTraces(expected, actual)).toEqual({
      index: 1,
      expected: expected[1],
      actual: undefined,
    });
  });

  it('treats record insertion order as semantically irrelevant', () => {
    const expected = frame(0);
    expected.data = { alpha: 1, beta: 2 };
    const actual = frame(0);
    actual.data = { beta: 2, alpha: 1 };

    expect(compareSemanticTraces([expected], [actual])).toBeNull();
  });
});

describe('generated trace instrumentation contract', () => {
  const model = flatOrFixture();
  model.states[0].entry = 'total = total + 1;';
  const built = buildSemanticModel(model);
  if (!built.ir) throw new Error('fixture must build');
  const ir = built.ir;

  it('exposes a test-only trace sink and omits trace storage in production preprocessing', () => {
    const config = renderConfigHeader(ir);
    const header = renderCoreHeader();
    const source = renderCoreSource(ir);
    const userLogic = renderUserLogicSource(ir);

    expect(config).toContain('#ifdef SM_TRACE_ENABLED');
    expect(config).toContain('SM_TraceSink_t trace_sink;');
    expect(header).toContain(
      'void SM_SetTraceSink(ADIA_Instance_t *instance, SM_TraceSink_t sink);',
    );
    expect(source).toContain('#ifdef SM_TRACE_ENABLED');
    expect(source).toContain('SM_TraceAction(instance, "transition:t_ab");');
    expect(userLogic).toContain('SM_TraceAction(instance, "entry:A");');
  });

  it('escapes model-owned transition ids in trace string literals', () => {
    const quotedModel = flatOrFixture();
    quotedModel.transitions[0].id = 'quoted"id';
    quotedModel.layers[0].transitionIds = ['quoted"id'];
    const quotedBuild = buildSemanticModel(quotedModel);
    if (!quotedBuild.ir) throw new Error('quoted fixture must build');

    expect(renderCoreSource(quotedBuild.ir)).toContain(
      'SM_TraceAction(instance, "transition:quoted\\"id");',
    );
  });
});

const fixtureMatrix: readonly DifferentialFixtureName[] = [
  'flat-priority',
  'nested-cross-boundary',
  'external-self',
  'internal-action',
  'inner-descendant',
  'inner-history',
  'parallel-independent',
  'parallel-parent-exit',
  'shallow-history',
  'deep-history-and',
  'junction-backtracking',
  'temporal-exact-boundary',
  'terminal-or',
  'terminal-and-sibling',
  'reset',
  'safe-output-fault',
];

describe('TypeScript-versus-generated-C differential gate', () => {
  it.each(fixtureMatrix)(
    '%s matches generated C tick by tick',
    (fixtureName) => {
      const fixture = semanticFixture(fixtureName);
      const expected = runInterpreterTrace(fixture);
      const actual = compileAndRunCTrace(fixture);
      const difference = compareSemanticTraces(expected, actual);

      expect(
        difference,
        difference === null
          ? undefined
          : `first semantic difference at frame ${difference.index}\n`
            + `expected: ${JSON.stringify(difference.expected)}\n`
            + `actual:   ${JSON.stringify(difference.actual)}`,
      ).toBeNull();
    },
    60_000,
  );

  it('uses a distinct inner transition whose destination is history', () => {
    const inner = semanticFixture('inner-history');
    const shallow = semanticFixture('shallow-history');
    const built = buildSemanticModel(inner.model);
    if (!built.ir) throw new Error('inner-history fixture must build');

    expect(inner).not.toEqual(shallow);
    expect(built.ir.transitions.inner_restore_history).toMatchObject({
      kind: 'inner',
      routes: [
        expect.objectContaining({
          destinationKind: 'history',
          destinationJunctionId: 'shallow_history',
        }),
      ],
    });
    const frames = runInterpreterTrace(inner);
    expect(frames.at(-1)?.activeStateIds).toContain('parent_b');
    expect(frames.at(-1)?.activeStateIds).not.toContain('parent_a');
  });

  it('round-trips legal delimiter characters in trace-owned model ids', () => {
    const model = flatOrFixture();
    model.states[0].id = 'a,|;:%';
    model.transitions[0].sourceId = 'a,|;:%';
    model.transitions[0].id = 't,|;:%';
    model.layers[0].stateIds[0] = 'a,|;:%';
    model.layers[0].transitionIds = ['t,|;:%'];
    model.variables[0].id = 'go,|;:%';
    const fixture = {
      name: 'flat-priority' as const,
      model,
      steps: [{ kind: 'step' as const, inputs: { go: true } }],
    };

    expect(
      compareSemanticTraces(
        runInterpreterTrace(fixture),
        compileAndRunCTrace(fixture),
      ),
    ).toBeNull();
  }, 60_000);

  it('observes reset output commitment and watchdog effects', () => {
    const fixture = semanticFixture('reset');
    const expected = runInterpreterTrace(fixture);
    const actual = compileAndRunCTrace(fixture);
    const resetFrame = expected.at(-1) as SemanticTraceFrame & {
      mappedOutputs?: Record<string, number | boolean>;
      ioEffects?: { safeOutputsApplied: number; watchdogKicks: number };
    };

    expect(fixture.model.hilConfig?.mappings).toEqual([
      expect.objectContaining({
        direction: 'write',
        safeValue: false,
      }),
    ]);
    expect(resetFrame.mappedOutputs).toEqual({ motor: false });
    expect(resetFrame.ioEffects).toEqual({
      safeOutputsApplied: 0,
      watchdogKicks: 1,
    });
    expect(compareSemanticTraces(expected, actual)).toBeNull();
  }, 60_000);

  it('observes immediate safe output without a watchdog kick on fault', () => {
    const fixture = semanticFixture('safe-output-fault');
    const expected = runInterpreterTrace(fixture);
    const actual = compileAndRunCTrace(fixture);
    const faultFrame = expected.at(-1) as SemanticTraceFrame & {
      mappedOutputs?: Record<string, number | boolean>;
      ioEffects?: { safeOutputsApplied: number; watchdogKicks: number };
    };

    expect(faultFrame.mappedOutputs).toEqual({ motor: false });
    expect(faultFrame.ioEffects).toEqual({
      safeOutputsApplied: 1,
      watchdogKicks: 0,
    });
    expect(compareSemanticTraces(expected, actual)).toBeNull();
  }, 60_000);

  it('does not truncate action traces for large legal parallel charts', () => {
    const model = flatOrFixture();
    const template = model.states[0];
    model.states = Array.from({ length: 140 }, (_, index) => ({
      ...template,
      id: `parallel_${index}`,
      name: `Parallel ${index}`,
      entry: '',
      during: 'total = total + 1;',
      autostart: false,
      priority: index + 1,
    }));
    model.transitions = [];
    model.layers = [{
      ...model.layers[0],
      decomposition: 'AND',
      stateIds: model.states.map((state) => state.id),
      transitionIds: [],
    }];
    const fixture = {
      name: 'parallel-independent' as const,
      model,
      steps: [{ kind: 'step' as const }],
    };
    const expected = runInterpreterTrace(fixture);

    expect(expected[1].actions).toHaveLength(140);
    expect(
      compareSemanticTraces(expected, compileAndRunCTrace(fixture)),
    ).toBeNull();
  }, 60_000);

  it('coerces numeric stimuli to the declared C integer type', () => {
    const model = flatOrFixture();
    model.variables.push({
      id: 'sample',
      name: 'sample',
      type: 'uint8',
      initialValue: '0',
      currentValue: 0,
      visibleInScope: true,
    });
    model.states[0].during = 'total = sample;';
    model.transitions = [];
    model.layers[0].transitionIds = [];
    const fixture = {
      name: 'flat-priority' as const,
      model,
      steps: [{ kind: 'step' as const, inputs: { sample: 258.75 } }],
    };
    const expected = runInterpreterTrace(fixture);

    expect(expected.at(-1)?.data.sample).toBe(2);
    expect(
      compareSemanticTraces(expected, compileAndRunCTrace(fixture)),
    ).toBeNull();
  }, 60_000);

  it('commits a mapped X-Bridges output before an inner transition in the same tick', () => {
    const model = hybridXBridgesFixture();
    const ordinary = model.states.find((state) => state.id === 'ordinary')!;
    const controller = model.states.find((state) => state.id === 'controller')!;
    ordinary.autostart = false;
    controller.autostart = true;
    controller.during = 'u = 2;';
    controller.internalTransitions = '[y > 3] / u = u;';
    controller.xBridgesModel = {
      schemaVersion: 1,
      nodes: [{
        id: 'gain',
        type: 'GAIN',
        parameters: {
          inputs: [{
            id: 'u',
            direction: 'input',
            shape: 'scalar',
            dataType: 'float32',
          }],
          outputs: [{
            id: 'y',
            direction: 'output',
            shape: 'scalar',
            dataType: 'float32',
          }],
          gain: 2,
        },
      }],
      edges: [],
      mappings: [
        { smVarId: 'u', blockId: 'gain', portId: 'u', direction: 'in' },
        { smVarId: 'y', blockId: 'gain', portId: 'y', direction: 'out' },
      ],
      solver: { kind: 'euler', stepSeconds: 0.002 },
      policy: { memory: 'reset', numericFault: 'escalate' },
    };
    for (const id of ['u', 'y']) {
      model.variables.push({
        id,
        name: id,
        type: 'float',
        initialValue: '0',
        currentValue: 0,
        visibleInScope: true,
      });
    }
    const fixture = {
      name: 'flat-priority' as const,
      model,
      steps: [{ kind: 'step' as const }],
    };
    const expected = runInterpreterTrace(fixture);
    const actual = compileAndRunCTrace(fixture);

    expect(expected.at(-1)?.data.y).toBe(4);
    expect(expected.at(-1)?.actions).toContain(
      'transition:$internal_controller_0',
    );
    expect(compareSemanticTraces(expected, actual)).toBeNull();
  }, 60_000);
});
