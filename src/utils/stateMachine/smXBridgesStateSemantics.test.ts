import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BLOCK_LIBRARY } from '../../engine/xbridges/BlockDefinitions';
import type { StateData, TransitionData, VariableDef } from '../../types/sm_types';
import { compileAndRunCTrace, runInterpreterTrace } from './smCHarness';
import { generateCArtifacts } from './smCGenerator';
import {
  flatOrFixture,
  type DifferentialFixture,
  type DifferentialScenarioStep,
} from './smFixtures';
import type { StateMachineLayerV4, StateMachineModelV5 } from './smModel';
import { buildRandomChart, RANDOM_INPUT_EVENTS, randomStimulus } from './smRandomChartFixture';
import { buildSemanticModel } from './smSemanticBuilder';
import { compareSemanticTraces, type SemanticTraceFrame } from './smTrace';
import type { XBEdgeV1, XBMappingV1, XBNodeV1 } from './xbModel';

/*
 * Semantics of X-Bridges states (a state whose behaviour is an X-Bridges block diagram), as they
 * must hold identically in the simulation (smInterpreter / xbInterpreter) and in the generated C
 * (smCGenerator / xbCGenerator), in every context a chart can put such a state in.
 *
 * An X-Bridges state is a Simulink-like enabled subsystem:
 *  - It executes only while its state is active, once per chart tick, after the state's own
 *    `during` actions and before inner transitions and child layers. Within the tick the solver
 *    runs `tick / stepSeconds` substeps; blocks run in dataflow (execution) order, so a block
 *    downstream of a filter reads the filter's output of the same substep.
 *  - Memory policy 'reset' re-initializes every block state (delays, integrators, filters, step
 *    time) when the state is entered, 'retain' keeps them across exit and re-entry. A chart
 *    reset re-initializes the diagram in both cases.
 *  - Mapped inputs (Inport) read the chart variable at the start of the tick; mapped outputs
 *    (Outport) write the chart variable at the end of the tick. While the state is inactive
 *    nothing executes and the output variable holds its last value, which guards and actions of
 *    the surrounding chart read like any other variable.
 *  - A Step block steps when the state's elapsed time (a tick-granular timer, reset on entry)
 *    reaches the threshold, independently of the solver substep, so it also restarts on
 *    re-entry under 'retain'.
 *  - Sum applies its per-port signs ('+-').
 *  - Numeric faults: 'signal-only' only raises the block's error signal, 'escalate' latches
 *    XBRIDGES_NUMERIC in the chart and takes the safety path.
 */

const float32 = 'float32';

const xbNode = (id: string, type: string, params: Record<string, unknown> = {}): XBNodeV1 => {
  const block = BLOCK_LIBRARY[type](id, params);
  const port = (p: { id: string; direction: string }) => ({
    id: p.id, direction: p.direction, shape: 'scalar', dimensions: [], dataType: float32,
  });
  return {
    id,
    type,
    label: id,
    parameters: {
      ...(block.inputs ? { inputs: block.inputs.map(port) } : {}),
      ...(block.outputs ? { outputs: block.outputs.map(port) } : {}),
      ...params,
    } as XBNodeV1['parameters'],
  };
};

const edge = (from: string, fromPort: string, to: string, toPort: string): XBEdgeV1 => ({
  id: `${from}.${fromPort}->${to}.${toPort}`,
  sourceNodeId: from, sourcePortId: fromPort, targetNodeId: to, targetPortId: toPort,
});

interface XBSpec {
  nodes: XBNodeV1[];
  edges: XBEdgeV1[];
  mappings: XBMappingV1[];
  memory: 'reset' | 'retain';
  numericFault?: 'signal-only' | 'escalate';
  stepSeconds?: number;
}

/** Inport(u) -> blocks -> Outport(y): the usual shape of a state-level diagram. */
const throughput = (
  blocks: XBNodeV1[],
  edges: XBEdgeV1[],
  options: Partial<Pick<XBSpec, 'memory' | 'numericFault' | 'stepSeconds'>> & { source?: 'inport' | XBNodeV1 } = {},
  inVar = 'u',
  outVar = 'y',
): XBSpec => {
  const source = options.source ?? 'inport';
  const nodes = [
    xbNode('out', 'Outport', { smVarId: outVar }),
    ...(source === 'inport' ? [xbNode('in', 'Inport', { smVarId: inVar })] : [source]),
    ...blocks,
  ];
  const sourceId = source === 'inport' ? 'in' : source.id;
  return {
    nodes,
    edges: [edge(sourceId, 'out', blocks[0].id, blocks[0].id === 'sum' ? 'in1' : 'u'), ...edges],
    mappings: [
      { smVarId: outVar, blockId: 'out', portId: 'out', direction: 'out' },
      ...(source === 'inport' ? [{ smVarId: inVar, blockId: 'in', portId: 'in', direction: 'in' as const }] : []),
    ],
    memory: options.memory ?? 'reset',
    numericFault: options.numericFault,
    stepSeconds: options.stepSeconds,
  };
};

const stateData = (id: string, overrides: Partial<StateData> = {}): StateData => ({
  id, name: id, x: 0, y: 0, width: 100, height: 60, entry: '', during: '', exit: '',
  isActive: false, color: '#000000', parentId: null, children: [], priority: 1,
  isParallel: false, regionId: null, autostart: false, ...overrides,
});

const xbState = (id: string, spec: XBSpec, overrides: Partial<StateData> = {}): StateData => stateData(id, {
  isXBridges: true,
  xBridgesModel: {
    schemaVersion: 1,
    nodes: spec.nodes,
    edges: spec.edges,
    mappings: spec.mappings,
    solver: { kind: 'euler', stepSeconds: spec.stepSeconds ?? 0.01 },
    policy: { memory: spec.memory, numericFault: spec.numericFault ?? 'signal-only' },
  } as unknown as StateData['xBridgesModel'],
  ...overrides,
});

let transitionCounter = 0;
const transition = (
  sourceId: string, targetId: string, condition: string, extra: Partial<TransitionData> = {},
): TransitionData => ({
  id: `t${transitionCounter++}`, sourceId, targetId, condition, action: '', afterTicks: null,
  type: 'condition', hasControlPoint: false, order: 1, ...extra,
});

const layer = (
  id: string, parentStateId: string | null, decomposition: 'OR' | 'AND', stateIds: string[], transitions: TransitionData[] = [],
): StateMachineLayerV4 => ({
  id, name: id, parentStateId, decomposition, stateIds, transitionIds: transitions.map((item) => item.id), junctionIds: [],
});

const variable = (name: string, type: VariableDef['type'], initial = '0'): VariableDef => ({
  id: name, name, type, initialValue: initial, currentValue: type === 'bool' ? initial === 'true' : Number(initial), visibleInScope: true,
});

const build = (
  states: StateData[],
  layers: StateMachineLayerV4[],
  transitions: TransitionData[],
  variables: VariableDef[],
): StateMachineModelV5 => {
  const model = flatOrFixture();
  model.states = states;
  model.layers = layers;
  model.transitions = transitions;
  model.junctions = [];
  model.variables = variables;
  return model;
};

const step = (inputs: Record<string, number | boolean> = {}): DifferentialScenarioStep => ({ kind: 'step', inputs });

/** Interpreter and generated C must agree on every tick (exactly, as the random-chart differential does). */
const expectSimEqualsC = (fixture: DifferentialFixture): { sim: SemanticTraceFrame[]; c: SemanticTraceFrame[] } => {
  const sim = runInterpreterTrace(fixture);
  const c = compileAndRunCTrace(fixture);
  expect(compareSemanticTraces(sim, c)).toBeNull();
  if (process.env.XB_DUMP) {
    const rows = sim.map((f, i) => `  ${i} ${f.activeStateIds.join(',')} ${['go', 'u', 'y', 'ya', 'yb'].map((n) => `${n}=${f.data[n]}`).join(' ')}`);
    appendFileSync(process.env.XB_DUMP, `${expect.getState().currentTestName}\n${rows.join('\n')}\n`);
  }
  return { sim, c };
};

const series = (trace: SemanticTraceFrame[], name: string): number[] =>
  trace.map((frame) => Number(frame.data[name]));

/** go <-> inactive toggling between an ordinary state and the X-Bridges state `x`. */
const toggleChart = (spec: XBSpec, variables: VariableDef[] = []): StateMachineModelV5 => {
  const forward = transition('idle', 'x', 'go');
  const back = transition('x', 'idle', '!go');
  return build(
    [stateData('idle', { autostart: true }), xbState('x', spec, { priority: 2 })],
    [layer('root', null, 'OR', ['idle', 'x'], [forward, back])],
    [forward, back],
    [variable('go', 'bool', 'false'), variable('u', 'float'), variable('y', 'float'), ...variables],
  );
};

const GO_PATTERN = [true, true, true, true, false, false, false, true, true, true, true, false, true, true];
const toggleSteps = (u: number): DifferentialScenarioStep[] =>
  GO_PATTERN.map((go) => step({ go, u }));

describe('X-Bridges state: memory policy, held outputs and mapped variables', () => {
  const integrator = (memory: 'reset' | 'retain') => throughput(
    [xbNode('int', 'INTEGRATOR_DISCRETE', { initial_condition: 0, sample_time: 0.01, method: 'forward_euler' })],
    [edge('int', 'y', 'out', 'in')],
    { memory },
  );

  /* Trace frame 0 is the initial configuration, frame n + 1 follows step n. The tick that enters the
   * X-Bridges state only runs its entry; the diagram first executes in the next tick. */
  it("'reset' re-initializes block states on every entry, outputs are held while inactive", () => {
    const { sim } = expectSimEqualsC({ name: 'flat-priority', model: toggleChart(integrator('reset')), steps: toggleSteps(2) });
    const y = series(sim, 'y');
    expect(y.slice(2, 5)).toEqual([0, 0.02, 0.04].map(Math.fround));
    // Held while the state is inactive and in the tick that re-enters it.
    expect(y.slice(5, 9)).toEqual([y[4], y[4], y[4], y[4]]);
    // The second activation restarts from the initial condition.
    expect(y.slice(9, 12)).toEqual(y.slice(2, 5));
  });

  it("'retain' keeps block states across exit and re-entry", () => {
    const { sim } = expectSimEqualsC({ name: 'flat-priority', model: toggleChart(integrator('retain')), steps: toggleSteps(2) });
    const y = series(sim, 'y');
    expect(y.slice(5, 9)).toEqual([y[4], y[4], y[4], y[4]]);
    // The re-entered run continues from the held integrator state instead of restarting.
    expect(y[9]).toBeCloseTo(y[4] + 0.02, 6);
    expect(y[11]).toBeCloseTo(y[4] + 0.06, 6);
  });

  it('a chart reset re-initializes the diagram under both policies', () => {
    for (const memory of ['reset', 'retain'] as const) {
      const steps: DifferentialScenarioStep[] = [step({ go: true, u: 2 }), step({ go: true, u: 2 }), { kind: 'reset' }, step({ go: false, u: 2 }), step({ go: true, u: 2 })];
      expectSimEqualsC({ name: 'flat-priority', model: toggleChart(integrator(memory)), steps });
    }
  });

  it('a downstream guard reads the mapped output of the X-Bridges state', () => {
    const spec = integrator('retain');
    const toDone = transition('x', 'done', 'y > 0.05');
    const model = build(
      [stateData('idle', { autostart: true }), xbState('x', spec, { priority: 2 }), stateData('done', { priority: 3 })],
      [layer('root', null, 'OR', ['idle', 'x', 'done'], [transition('idle', 'x', 'true'), toDone])],
      [transition('idle', 'x', 'true'), toDone],
      [variable('u', 'float'), variable('y', 'float')],
    );
    // layers refer to transitions by id; rebuild with the actual objects
    const first = model.transitions[0];
    model.layers[0].transitionIds = [first.id, toDone.id];
    const { sim } = expectSimEqualsC({ name: 'flat-priority', model, steps: Array.from({ length: 8 }, () => step({ u: 2 })) });
    expect(sim.some((frame) => frame.activeStateIds.includes('done'))).toBe(true);
  });
});

describe('X-Bridges state: Sum signs', () => {
  it("applies per-port signs ('+-') in the simulation exactly as the generated C does", () => {
    const spec = throughput(
      [xbNode('sum', 'Sum', { signs: '+-', numInputs: 2 }), xbNode('k', 'Constant', { value: 1 })],
      [edge('k', 'out', 'sum', 'in2'), edge('sum', 'out', 'out', 'in')],
    );
    const model = toggleChart(spec);
    const { sim } = expectSimEqualsC({ name: 'flat-priority', model, steps: toggleSteps(3.5) });
    expect(series(sim, 'y')[2]).toBe(2.5);
  });
});

describe('X-Bridges state: Step follows the state elapsed time, not the solver substep', () => {
  const stepSpec = (memory: 'reset' | 'retain', stepSeconds: number) => throughput(
    [xbNode('gain', 'GAIN', { gain: 1 })],
    [edge('gain', 'y', 'out', 'in')],
    { memory, stepSeconds, source: xbNode('src', 'Step', { stepTime: 0.03, initialValue: 1, finalValue: 5.5 }) },
  );

  it.each([['reset', 0.01], ['retain', 0.01], ['reset', 0.005], ['retain', 0.005], ['retain', 0.0025]] as const)(
    '%s memory, solver step %s s: switches at the same tick and restarts on re-entry',
    (memory, stepSeconds) => {
      const { sim } = expectSimEqualsC({ name: 'flat-priority', model: toggleChart(stepSpec(memory, stepSeconds)), steps: toggleSteps(0) });
      const y = series(sim, 'y');
      expect(y.slice(2, 5)).toEqual([1, 1, 5.5]);
      // Re-entered: the step source starts over from its initial value.
      expect(y.slice(9, 12)).toEqual([1, 1, 5.5]);
    },
  );
});

describe('X-Bridges state: dataflow order around stateful blocks', () => {
  it('a block downstream of a held filter output sees the new value in the same tick', () => {
    const spec = throughput(
      [
        xbNode('lpf', 'LOW_PASS_FILTER', { cutoff_frequency: 1, sample_time: 0.1, initial_condition: 0 }),
        xbNode('sat', 'SATURATION', { lowerLimit: 0, upperLimit: 4 }),
        xbNode('gain', 'GAIN', { gain: 2 }),
      ],
      [edge('lpf', 'y', 'sat', 'u'), edge('sat', 'y', 'gain', 'u'), edge('gain', 'y', 'out', 'in')],
      { memory: 'retain' },
    );
    const steps = Array.from({ length: 30 }, (_, index) => step({ go: true, u: 2 + (index % 3) }));
    const { sim } = expectSimEqualsC({ name: 'flat-priority', model: toggleChart(spec), steps });
    // The filter output appears on the first tick it is sampled and the gain follows in that tick.
    const y = series(sim, 'y');
    expect(y.find((value) => value !== 0)).toBeGreaterThan(0);
  });
});

describe('X-Bridges state: contexts a chart can put it in', () => {
  it('inside a parallel (AND) region whose guards read the other region\'s output, entered and exited repeatedly', () => {
    const a = throughput(
      [xbNode('int', 'INTEGRATOR_DISCRETE', { initial_condition: 0, sample_time: 0.01 })], [edge('int', 'y', 'out', 'in')], { memory: 'retain' }, 'u', 'ya',
    );
    const b = throughput(
      [xbNode('ud', 'UNIT_DELAY', { initialCondition: 1 })], [edge('ud', 'y', 'out', 'in')], { memory: 'reset' }, 'ya', 'yb',
    );
    const t = [
      transition('a_idle', 'a_x', 'go'),
      transition('a_x', 'a_idle', '!go'),
      transition('b_idle', 'b_x', 'ya > 0.05'),
      transition('b_x', 'b_idle', '!go'),
      transition('off', 'par', 'go'),
      transition('par', 'off', '', { event: 'ev_in_a' }),
    ];
    const model = build(
      [
        stateData('off', { autostart: true }),
        stateData('par', { priority: 2 }),
        stateData('ra', { parentId: 'par', priority: 1 }),
        stateData('rb', { parentId: 'par', priority: 2 }),
        stateData('a_idle', { parentId: 'ra', autostart: true }),
        xbState('a_x', a, { parentId: 'ra', priority: 2 }),
        stateData('b_idle', { parentId: 'rb', autostart: true }),
        xbState('b_x', b, { parentId: 'rb', priority: 2 }),
      ],
      [
        layer('root', null, 'OR', ['off', 'par'], [t[4], t[5]]),
        layer('par_l', 'par', 'AND', ['ra', 'rb']),
        layer('ra_l', 'ra', 'OR', ['a_idle', 'a_x'], [t[0], t[1]]),
        layer('rb_l', 'rb', 'OR', ['b_idle', 'b_x'], [t[2], t[3]]),
      ],
      t,
      [variable('go', 'bool'), variable('u', 'float'), variable('ya', 'float'), variable('yb', 'float')],
    );
    model.events = [{ id: 'ev_in_a', name: 'IN_A', scope: 'input' }];
    const steps: DifferentialScenarioStep[] = Array.from({ length: 60 }, (_, index) => ({
      kind: 'step' as const,
      inputs: { go: index % 17 < 12, u: 1 + (index % 4) },
      ...(index % 23 === 22 ? { events: ['IN_A'] } : {}),
    }));
    const { sim } = expectSimEqualsC({ name: 'flat-priority', model, steps });
    expect(sim.some((frame) => frame.activeStateIds.includes('b_x'))).toBe(true);
  });

  it("'escalate' latches XBRIDGES_NUMERIC on a nested X-Bridges state in the simulation and in C; 'signal-only' does not", () => {
    for (const numericFault of ['signal-only', 'escalate'] as const) {
      const spec = throughput(
        [xbNode('gain', 'GAIN', { gain: 1e30 }), xbNode('gain2', 'GAIN', { gain: 1e30 })],
        [edge('gain', 'y', 'gain2', 'u'), edge('gain2', 'y', 'out', 'in')],
        { memory: 'reset', numericFault },
      );
      const fixture: DifferentialFixture = {
        name: 'flat-priority',
        model: toggleChart(spec),
        steps: [step({ go: true, u: 1e5 }), step({ go: true, u: 1 }), step({ go: true, u: 1 })],
      };
      const { sim } = expectSimEqualsC(fixture);
      expect(sim.some((frame) => frame.error !== null)).toBe(numericFault === 'escalate');
    }
  });
});

describe('X-Bridges states in random charts', () => {
  const features = { innerTransitions: true, arithmetic: true, events: true, xBridges: true } as const;

  it('random charts contain X-Bridges states with both memory policies', () => {
    const policies = new Set<string>();
    for (let seed = 7000; seed < 7040; seed += 1) {
      for (const state of buildRandomChart(seed, features).states) {
        if (state.isXBridges) policies.add((state.xBridgesModel as unknown as { policy: { memory: string } }).policy.memory);
      }
    }
    expect([...policies].sort()).toEqual(['reset', 'retain']);
  });

  it('seeds that diverged while the X-Bridges semantics were being aligned stay equal', () => {
    // 6001: Sum signs ignored by the simulation; 6014: filter output read one tick late in C;
    // 6063 and 6071: Step compared the solver time instead of the state elapsed time.
    for (const seed of [6001, 6014, 6063, 6071, 6093]) {
      const model = buildRandomChart(seed, features);
      const fixture: DifferentialFixture = { name: 'flat-priority', model, steps: randomStimulus(seed, 250, RANDOM_INPUT_EVENTS) };
      expect(compareSemanticTraces(runInterpreterTrace(fixture), compileAndRunCTrace(fixture)), `seed ${seed}`).toBeNull();
    }
  }, 300_000);
});

const has = (tool: string) => {
  try { execFileSync(tool, ['--version'], { stdio: 'ignore' }); return true; } catch { return false; }
};

describe('generated X-Bridges code compiles for the embedded targets without warnings', () => {
  const targets: Array<[string, string, string[]]> = [
    ['avr-gcc', 'atmega328p', ['-mmcu=atmega328p']],
    ['arm-none-eabi-gcc', 'cortex-m4', ['-mcpu=cortex-m4', '-mthumb']],
  ];
  for (const [compiler, label, flags] of targets) {
    it.skipIf(!has(compiler))(`${label}: random charts with X-Bridges states compile with -std=c99 -Wall -Wextra -Werror -pedantic`, () => {
      for (const seed of [6001, 6014, 6063]) {
        const model = buildRandomChart(seed, { innerTransitions: true, arithmetic: true, events: true, xBridges: true });
        expect(model.states.some((state) => state.isXBridges)).toBe(true);
        const built = buildSemanticModel(model);
        expect(built.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
        const dir = mkdtempSync(join(tmpdir(), `adia-xb-${label}-`));
        try {
          for (const file of generateCArtifacts(built.ir!).files) {
            const path = join(dir, file.name);
            mkdirSync(dirname(path), { recursive: true });
            writeFileSync(path, file.content);
          }
          const sources = readdirSync(dir).filter((name) => name.endsWith('.c') && !/stub|test|harness/.test(name));
          expect(sources.length).toBeGreaterThan(0);
          for (const source of sources) {
            execFileSync(compiler, ['-std=c99', ...flags, '-Os', '-Wall', '-Wextra', '-Werror', '-pedantic', '-I.', '-c', source, '-o', `${source}.o`], { cwd: dir, stdio: 'pipe' });
          }
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
      }
    }, 300_000);
  }
});
