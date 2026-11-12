/**
 * V7 / plan 7.2: one scenario corpus, three executions (state-machine simulator, standalone runtime, compiled C),
 * compared per tick on the active configuration, every variable, timers, history and every X-Bridges signal / state slot.
 * Tolerance: booleans, integers and the configuration exact, float64 <= 4 ULP.
 * Expected values come from docs/XBRIDGES_EMBEDDED_CODEGEN.md (Stateflow-style execution order, lifecycle, timing).
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  asXbOwner,
  buildSmModel,
  diffTraces,
  firstActive,
  fixtureOf,
  measureGeneratedC,
  runThree,
  smState,
  smTransition,
  smVar,
  variableTypesOf,
  xbEdge,
  xbMap,
  xbNode,
  xbPort,
  type ScenarioStep,
} from '../../engine/xbridges/testkit';
import type { SemanticTraceFrame } from './smTrace';
import type { StateMachineModelV5 } from './smModel';
import { buildSemanticModel } from './smSemanticBuilder';

const T = 60_000;

/** Asserts the three executions are equal tick by tick and returns the traces. */
const expectAligned = (model: StateMachineModelV5, steps: readonly ScenarioStep[]) => {
  const three = runThree(fixtureOf(model, steps));
  const opts = { variableTypes: variableTypesOf(model) };
  expect(diffTraces(three.sim, three.standalone, opts)).toEqual([]);
  expect(diffTraces(three.sim, three.c, opts)).toEqual([]);
  return three;
};

type BlockState = Record<string, Record<string, number>>;
const bs = (f: SemanticTraceFrame, stateId: string): BlockState =>
  (f.xBridges[stateId]?.blockState ?? {}) as unknown as BlockState;
const integ = (f: SemanticTraceFrame, stateId: string): number => bs(f, stateId).i.y;
/** -0 and +0 are the same integer. */
const norm = (v: number | boolean | undefined): number => Number(v) + 0;
const MEMORY = ['reset', 'retain'] as const;
type Memory = (typeof MEMORY)[number];
const steps = (list: Array<Record<string, number | boolean>>): ScenarioStep[] =>
  list.map((inputs) => ({ kind: 'step', inputs }));
const idle = (n: number): ScenarioStep[] => Array.from({ length: n }, () => ({ kind: 'step' as const }));
const diagnosticsOf = (model: StateMachineModelV5) =>
  buildSemanticModel(model).diagnostics.filter((d) => d.severity === 'error').map((d) => d.code);

/** Memory probe: Constant 1 -> discrete Integrator (IC 0, Ts = solver step) and UNIT_DELAY (IC 5). */
const memoryNodes = (sampleTime = 0.05) => ({
  nodes: [
    xbNode('c', 'Constant', { value: 1 }, [], ['y']),
    xbNode('i', 'INTEGRATOR_DISCRETE', { initialValue: 0, sample_time: sampleTime }, ['u'], ['y']),
    xbNode('d', 'UNIT_DELAY', { initialCondition: 5 }, ['u'], ['y']),
  ],
  edges: [xbEdge('c.y', 'i.u'), xbEdge('c.y', 'd.u')],
});

/* ------------------------------------------------------------------------------------------------ 0 */
describe('XB alignment 0: the comparator is sensitive', () => {
  const base = () => {
    const a = asXbOwner(smState('A', { autostart: true }), {
      nodes: [xbNode('g', 'GAIN', { gain: 2 }, ['u'], ['y'])],
      mappings: [xbMap('u', 'g.u', 'in'), xbMap('y', 'g.y', 'out')],
    });
    return buildSmModel({
      tickMs: 100, states: [a], variables: [smVar('u'), smVar('y')],
      layers: [{ id: 'root', parent: null, states: ['A'] }],
    });
  };

  it('reports a difference in a mapped variable, an X-Bridges signal and the configuration; honours the 4 ULP tolerance', () => {
    const t = runThree(fixtureOf(base(), steps([{ u: 1 }, { u: 2 }]))).sim;
    const clone = (): SemanticTraceFrame[] => JSON.parse(JSON.stringify(t));
    expect(diffTraces(t, clone())).toEqual([]);

    const data = clone();
    data[2].data.y = 4.5;
    expect(diffTraces(t, data).join('\n')).toContain('tick 2: frame.data.y');

    const signal = clone();
    (signal[1].xBridges.A.signals as Record<string, number>)['g:y'] = 3;
    expect(diffTraces(t, signal).join('\n')).toContain('tick 1: frame.xBridges.A.signals.g:y');

    const config = clone();
    config[1].activeStateIds = ['A', 'ghost'];
    expect(diffTraces(t, config).join('\n')).toContain('activeStateIds');

    const ulp = (n: number) => { // n float64 steps above 4
      const f = new Float64Array([4]);
      new BigUint64Array(f.buffer)[0] += BigInt(n);
      return f[0];
    };
    const near = clone();
    near[2].data.y = ulp(4);
    expect(diffTraces(t, near)).toEqual([]);
    near[2].data.y = ulp(5);
    expect(diffTraces(t, near)).not.toEqual([]);
    // integer and boolean variables are exact, whatever the tolerance
    const typed = { variableTypes: { y: 'int32' } };
    near[2].data.y = ulp(1);
    expect(diffTraces(t, near, typed)).not.toEqual([]);
  }, T);
});

/* ------------------------------------------------------------------------------------------------ 1 */
describe('XB alignment 1: ordering inside a tick', () => {
  const model = () => {
    const a = asXbOwner(smState('A', { autostart: true }), {
      nodes: [xbNode('g', 'GAIN', { gain: 2 }, ['u'], ['y'])],
      mappings: [xbMap('u', 'g.u', 'in'), xbMap('y', 'g.y', 'out')],
    });
    return buildSmModel({
      tickMs: 100,
      states: [
        a,
        smState('A1', { parentId: 'A', autostart: true }),
        smState('A2', { parentId: 'A', priority: 2 }),
        smState('B', { priority: 2 }),
      ],
      transitions: [
        smTransition('t_a1_a2', 'A1', 'A2', { condition: 'y > 3' }),
        smTransition('t_a_b', 'A', 'B', { condition: 'y > 3' }),
      ],
      variables: [smVar('u'), smVar('y')],
      layers: [
        { id: 'root', parent: null, states: ['A', 'B'], transitions: ['t_a_b'] },
        { id: 'a_children', parent: 'A', states: ['A1', 'A2'], transitions: ['t_a1_a2'] },
      ],
    });
  };

  it('input read -> step -> output written -> inner guard: A1->A2 fires in tick 3 (u = 2, y = 4); outer guard one tick later', () => {
    const three = expectAligned(model(), steps([0, 1, 2, 3, 3, 3].map((u) => ({ u }))));
    // Frame index = tick number (0 = after init). tick1 u=0, tick2 u=1, tick3 u=2 (y = 4), tick4 u=3.
    const fired: Record<string, { y: number[]; inner: number; outer: number }> = {};
    for (const [name, t] of Object.entries(three) as Array<[string, SemanticTraceFrame[]]>) {
      fired[name] = {
        y: t.slice(0, 5).map((f) => Number(f.data.y)),
        inner: firstActive(t, 'A2'),
        outer: firstActive(t, 'B'),
      };
    }
    for (const name of ['sim', 'standalone', 'c']) {
      // tick 4: A exited in its outer-transition phase, before its step, so y holds.
      expect(fired[name].y).toEqual([0, 0, 2, 4, 4]);
      // docs (Stateflow-style order): outer transitions, step, commit, inner transitions: the child sees y = 4 in tick 3.
      expect(fired[name].inner).toBe(3);
      // the parent's outer transition is evaluated before the step, so it sees y = 4 in tick 4.
      expect(fired[name].outer).toBe(4);
    }
  }, T);
});

/* ------------------------------------------------------------------------------------------------ 2 */
describe('XB alignment 2: lifecycle', () => {
  const abModel = (memory: Memory, extra: (s: ReturnType<typeof smState>[]) => void = () => undefined) => {
    const a = asXbOwner(smState('A', { autostart: true }), { ...memoryNodes(), memory });
    const states = [a, smState('B', { priority: 2 })];
    extra(states);
    return buildSmModel({
      tickMs: 100,
      states,
      transitions: [
        smTransition('ab', 'A', 'B', { condition: 'go' }),
        smTransition('ba', 'B', 'A', { condition: 'back' }),
        smTransition('self', 'A', 'A', { condition: 'ping' }),
      ],
      variables: [smVar('go', 'bool', false), smVar('back', 'bool', false), smVar('ping', 'bool', false), smVar('n')],
      layers: [{ id: 'root', parent: null, states: ['A', 'B'], transitions: ['ab', 'ba', 'self'] }],
    });
  };

  it.each(MEMORY)('exit and re-entry A -> B -> A under memory policy %s', (memory) => {
    // tick3 go (A exits), tick4 back (A re-enters, no step in the entry tick), ticks 5, 6 step again.
    const three = expectAligned(abModel(memory), steps([{}, {}, { go: true }, { go: false, back: true }, { back: false }, {}]));
    const f = three.sim;
    expect(f[3].activeStateIds).toEqual(['B']);
    expect(f[4].activeStateIds).toEqual(['A']);
    expect(integ(f[2], 'A')).toBeCloseTo(0.2, 6);
    if (memory === 'reset') {
      // docs: reset policy initialises the slots on every ordinary state entry.
      expect(bs(f[4], 'A')).toEqual(bs(f[0], 'A'));
      expect(bs(f[5], 'A')).toEqual(bs(f[1], 'A'));
      expect(bs(f[6], 'A')).toEqual(bs(f[2], 'A'));
    } else {
      // docs: retain keeps the slots while the owner is inactive and continues on re-entry.
      expect(bs(f[3], 'A')).toEqual(bs(f[2], 'A'));
      expect(bs(f[4], 'A')).toEqual(bs(f[2], 'A'));
      expect(integ(f[5], 'A') - integ(f[4], 'A')).toBeCloseTo(integ(f[1], 'A') - integ(f[0], 'A'), 6);
      expect(integ(f[6], 'A')).toBeCloseTo(0.4, 6);
    }
  }, T);

  it.each(MEMORY)('external self-transition on the owner under %s; internal transition never resets', (memory) => {
    const three = expectAligned(abModel(memory), steps([{}, {}, { ping: true }, { ping: false }, {}]));
    const f = three.sim;
    if (memory === 'reset') expect(bs(f[3], 'A')).toEqual(bs(f[0], 'A')); // exit + entry re-initialises
    else expect(bs(f[3], 'A')).toEqual(bs(f[2], 'A')); // retained, the entry tick does not step
    expect(f[3].activeStateIds).toEqual(['A']);

    // internal transition: the state is not exited, so the memory keeps integrating under both policies
    const internal = abModel(memory, (states) => {
      states[0].internalTransitions = '[ping] / n = n + 1;';
    });
    // the same trigger without the external self-transition (outer transitions take priority over inner ones)
    internal.transitions = internal.transitions.filter((t) => t.id !== 'self');
    internal.layers[0].transitionIds = ['ab', 'ba'];
    const t2 = expectAligned(internal, steps([{}, {}, { ping: true }, { ping: false }, {}])).sim;
    expect(t2[3].data.n).toBe(1);
    expect(integ(t2[3], 'A')).toBeGreaterThan(integ(t2[2], 'A'));
    expect(integ(t2[3], 'A') - integ(t2[2], 'A')).toBeCloseTo(0.1, 6);
  }, T);

  it.each(MEMORY)('SM_Reset / resetRuntime initialises all X-Bridges memory, also under %s', (memory) => {
    const model = abModel(memory, (states) => {
      asXbOwner(states[1], { ...memoryNodes(), memory });
    });
    // run A, move to B (B steps), back to A, then reset
    const list: ScenarioStep[] = [
      ...steps([{}, {}, { go: true }, { go: false }, {}, { back: true }, { back: false }]),
      { kind: 'reset' },
      ...idle(2),
    ];
    const f = expectAligned(model, list).sim;
    const reset = f[8];
    expect(reset.activeStateIds).toEqual(['A']);
    expect(bs(reset, 'A')).toEqual(bs(f[0], 'A'));
    expect(bs(reset, 'B')).toEqual(bs(f[0], 'B'));
    expect(integ(f[7], 'A') !== 0 || integ(f[7], 'B') !== 0).toBe(true); // something was accumulated before the reset
    expect(bs(f[9], 'A')).toEqual(bs(f[1], 'A'));
  }, T);

  it.each(MEMORY)('owner is a parent composite: its model keeps stepping while a child is active and switches (%s)', (memory) => {
    const p = asXbOwner(smState('P', { autostart: true }), { ...memoryNodes(), memory });
    const model = buildSmModel({
      tickMs: 100,
      states: [p, smState('P1', { parentId: 'P', autostart: true }), smState('P2', { parentId: 'P', priority: 2 })],
      transitions: [smTransition('t12', 'P1', 'P2', { condition: 'swap' })],
      variables: [smVar('swap', 'bool', false)],
      layers: [
        { id: 'root', parent: null, states: ['P'] },
        { id: 'p_children', parent: 'P', states: ['P1', 'P2'], transitions: ['t12'] },
      ],
    });
    const f = expectAligned(model, steps([{}, {}, { swap: true }, { swap: false }, {}])).sim;
    expect(f[3].activeStateIds).toEqual(expect.arrayContaining(['P', 'P2']));
    for (let k = 1; k <= 5; k += 1) {
      // 0.1 per tick (2 substeps of Ts 0.05), also in the tick the child changes
      expect(integ(f[k], 'P') - integ(f[k - 1], 'P')).toBeCloseTo(0.1, 6);
    }
  }, T);

  it('two orthogonal regions, each owning an X-Bridges model, step independently and identically', () => {
    const owner = (id: string, gain: number, u: string, y: string) => asXbOwner(
      smState(id, { parentId: 'P', priority: id === 'R1' ? 1 : 2 }),
      {
        nodes: [xbNode('g', 'GAIN', { gain }, ['u'], ['y'])],
        mappings: [xbMap(u, 'g.u', 'in'), xbMap(y, 'g.y', 'out')],
      },
    );
    const model = buildSmModel({
      tickMs: 100,
      states: [smState('P', { autostart: true }), owner('R1', 2, 'u1', 'y1'), owner('R2', 3, 'u2', 'y2')],
      variables: [smVar('u1'), smVar('u2'), smVar('y1'), smVar('y2')],
      layers: [
        { id: 'root', parent: null, states: ['P'] },
        { id: 'p_regions', parent: 'P', kind: 'AND', states: ['R1', 'R2'] },
      ],
    });
    const f = expectAligned(model, steps([{ u1: 1, u2: 10 }, { u1: 2, u2: 20 }, { u1: 3, u2: 10 }])).sim;
    expect(f[1].activeStateIds).toEqual(expect.arrayContaining(['R1', 'R2']));
    expect([1, 2, 3].map((k) => f[k].data.y1)).toEqual([2, 4, 6]);
    expect([1, 2, 3].map((k) => f[k].data.y2)).toEqual([30, 60, 30]);
  }, T);

  describe.each([['shallow', 'history'], ['deep', 'deep-history']] as const)('%s history', (kind, junctionType) => {
    const historyModel = (memory: Memory) => {
      const mk = (id: string, parentId: string, extra: Partial<ReturnType<typeof smState>> = {}) =>
        asXbOwner(smState(id, { parentId, ...extra }), { ...memoryNodes(), memory });
      return buildSmModel({
        tickMs: 100,
        states: [
          smState('W', { autostart: true }),
          smState('O', { priority: 2 }),
          smState('C1', { parentId: 'W', autostart: true }),
          smState('C2', { parentId: 'W', priority: 2 }),
          mk('G1', 'C1', { autostart: true }),
          mk('G2', 'C1', { priority: 2 }),
        ],
        junctions: [{ id: 'H', x: 0, y: 0, name: 'H', color: '#000000', parentId: 'W', type: junctionType }],
        transitions: [
          smTransition('swap', 'G1', 'G2', { condition: 'swap' }),
          smTransition('leave', 'W', 'O', { condition: 'leave' }),
          smTransition('back', 'O', 'H', { condition: 'back' }),
        ],
        variables: [smVar('swap', 'bool', false), smVar('leave', 'bool', false), smVar('back', 'bool', false)],
        layers: [
          { id: 'root', parent: null, states: ['W', 'O'], transitions: ['leave', 'back'] },
          { id: 'w_children', parent: 'W', states: ['C1', 'C2'], junctions: ['H'] },
          { id: 'c1_children', parent: 'C1', states: ['G1', 'G2'], transitions: ['swap'] },
        ],
      });
    };

    it.each(MEMORY)(`${kind} history re-entry, memory policy %s`, (memory) => {
      // t1,t2 G1 runs; t3 swap -> G2; t4 G2 runs; t5 leave W; t6 back -> history; t7,t8 run
      const list = steps([{}, {}, { swap: true }, { swap: false }, { leave: true }, { leave: false, back: true }, { back: false }, {}]);
      const f = expectAligned(historyModel(memory), list).sim;
      expect(f[5].activeStateIds).toEqual(['O']);
      // docs: history restores the state-machine configuration only (shallow: W's last child C1 entered by default -> G1;
      // deep: the exact leaf G2).
      const restored = kind === 'deep' ? 'G2' : 'G1';
      const other = kind === 'deep' ? 'G1' : 'G2';
      expect(f[6].activeStateIds).toEqual(expect.arrayContaining(['W', 'C1', restored]));
      expect(f[6].activeStateIds).not.toContain(other);
      // docs: history plus reset reinitialises the re-entered owner's memory; history plus retain preserves it.
      if (memory === 'reset') expect(bs(f[6], restored)).toEqual(bs(f[0], restored));
      else expect(bs(f[6], restored)).toEqual(bs(f[5], restored));
      if (memory === 'retain') expect(integ(f[5], restored)).toBeGreaterThan(0);
    }, T);
  });
});

/* ------------------------------------------------------------------------------------------------ 3 */
describe('XB alignment 3: timing', () => {
  const timingModel = (opts: { step: number; sample: number; memory?: Memory; tickMs?: number; after?: boolean }) => {
    const a = asXbOwner(smState('A', { autostart: true }), {
      ...memoryNodes(opts.sample),
      solver: { kind: 'euler', stepSeconds: opts.step },
      memory: opts.memory ?? 'reset',
    });
    return buildSmModel({
      tickMs: opts.tickMs ?? 100,
      states: [a, smState('B', { priority: 2 })],
      transitions: [
        smTransition('ab', 'A', 'B', { condition: 'go' }),
        smTransition('ba', 'B', 'A', { condition: 'back' }),
      ],
      variables: [smVar('go', 'bool', false), smVar('back', 'bool', false)],
      layers: [{ id: 'root', parent: null, states: ['A', 'B'], transitions: ['ab', 'ba'] }],
    });
  };
  const substeps = (m: StateMachineModelV5): number | undefined =>
    buildSemanticModel(m).ir?.states.A.xBridges?.solver.substepsPerTick;

  it('base tick 100 ms with solver step 50 ms (2 substeps) and 100 ms (1) give the same discrete integrator, three-way', () => {
    const two = timingModel({ step: 0.05, sample: 0.1 });
    const one = timingModel({ step: 0.1, sample: 0.1 });
    expect(substeps(two)).toBe(2);
    expect(substeps(one)).toBe(1);
    const a = expectAligned(two, idle(4)).sim;
    const b = expectAligned(one, idle(4)).sim;
    // Ts = 0.1 s hits once per tick with either solver step: y(k) = 0.1 k for the integrator (state after tick k).
    for (let k = 0; k <= 4; k += 1) {
      expect(integ(a[k], 'A')).toBeCloseTo(0.1 * k, 6);
      expect(integ(a[k], 'A')).toBe(integ(b[k], 'A'));
    }
  }, T);

  it.each([
    ['0.03 s does not divide 0.1 s', 0.03, 100],
    ['0.2 s is larger than the 0.1 s tick', 0.2, 100],
    ['0.07 s does not divide 0.15 s', 0.07, 150],
  ])('solver step that does not divide the tick is rejected: %s', (_label, step, tickMs) => {
    const m = timingModel({ step, sample: step, tickMs });
    const built = buildSemanticModel(m);
    const errors = built.diagnostics.filter((d) => d.severity === 'error');
    expect(errors.map((d) => d.code)).toEqual(['XB_SAMPLE_TIME_INVALID']);
    expect(errors[0].message).toContain('divide the state-machine base tick');
    expect(built.ir).toBeUndefined();
  });

  it('a sample time that is not a multiple of the solver step is rejected with the same code', () => {
    expect(diagnosticsOf(timingModel({ step: 0.1, sample: 0.15 }))).toContain('XB_SAMPLE_TIME_INVALID');
  });

  it.each(MEMORY)('discrete block with Ts 0.2 s in a 0.1 s tick holds between hits and hits on the same ticks (%s)', (memory) => {
    // ticks 1..3 in A, tick 4 go (A exits), tick 5 back (re-entry), ticks 6..9 in A
    const list = steps([{}, {}, {}, { go: true }, { go: false, back: true }, { back: false }, {}, {}, {}]);
    const f = expectAligned(timingModel({ step: 0.1, sample: 0.2, memory }), list).sim;
    const hit = (k: number) => integ(f[k], 'A') !== integ(f[k - 1], 'A');
    const hits = [1, 2, 3, 6, 7, 8, 9].filter(hit);
    // first hit on entry (tick 1), zero-order hold in tick 2, hit in tick 3
    expect([hit(1), hit(2), hit(3)]).toEqual([true, false, true]);
    if (memory === 'reset') {
      // docs: reset reinitialises on entry, so the schedule restarts: the first tick after re-entry is a hit.
      expect(hits).toEqual([1, 3, 6, 8]);
    } else {
      // The hit counter is part of the retained memory and does not advance while the owner is inactive or in the
      // entry tick (observed, identical in all three executions; the docs do not spell the counter out).
      expect(hits).toEqual([1, 3, 7, 9]);
    }
    expect(integ(f[9], 'A')).toBeCloseTo(memory === 'reset' ? 0.4 : 0.8, 6);
  }, T);

  it('after(n) timer and the X-Bridges time of the same state agree', () => {
    const a = asXbOwner(smState('A', { autostart: true }), {
      nodes: [xbNode('s', 'Step', { step_time: 0.3, initial_value: 0, final_value: 5 }, [], ['y'])],
      mappings: [xbMap('y', 's.y', 'out')],
      solver: { kind: 'euler', stepSeconds: 0.05 },
    });
    const model = buildSmModel({
      tickMs: 100,
      states: [a, smState('B', { priority: 2 })],
      transitions: [smTransition('ab', 'A', 'B', { type: 'after', afterTicks: 5 })],
      variables: [smVar('y')],
      layers: [{ id: 'root', parent: null, states: ['A', 'B'], transitions: ['ab'] }],
    });
    const three = expectAligned(model, idle(7));
    for (const t of [three.sim, three.standalone, three.c]) {
      const stepOn = t.findIndex((f) => f.data.y === 5);
      // D9 (start of tick): frame n follows tick n, whose blocks see t = (n - 1) 100 ms, so the Step (300 ms) is on from
      // tick 4, when the state timer of A reads 400 ms.
      expect(stepOn).toBe(4);
      expect(t[stepOn].stateTimersMs.A).toBe(400);
      // after(5) fires in tick 5, when the timer of A has reached 5 ticks.
      expect(firstActive(t, 'B')).toBe(5);
    }
  }, T);
});

/* ------------------------------------------------------------------------------------------------ 4 */
describe('XB alignment 4: boundary mappings', () => {
  const single = (owner: ReturnType<typeof smState>, vars: ReturnType<typeof smVar>[]) =>
    buildSmModel({ tickMs: 100, states: [owner], variables: vars, layers: [{ id: 'root', parent: null, states: [owner.id] }] });
  const conversion = (id: string, outputType: string, from: string, rounding: string) => {
    const node = xbNode(id, 'DATA_TYPE_CONVERSION', { output_type: outputType, rounding, overflow: 'saturate' }, [], []);
    const p = node.parameters as Record<string, unknown>;
    p.inputs = [xbPort('u', 'input', from)];
    p.outputs = [xbPort('y', 'output', outputType)];
    return node;
  };

  // docs (Numeric behavior): nearest = ties toward +inf; round = ties away from zero; convergent = ties to even.
  const expectedRound: Record<string, (v: number) => number> = {
    floor: Math.floor,
    ceiling: Math.ceil,
    zero: Math.trunc,
    nearest: (v) => Math.floor(v + 0.5),
    round: (v) => Math.sign(v) * Math.floor(Math.abs(v) + 0.5),
    convergent: (v) => {
      const f = Math.floor(v);
      const d = v - f;
      if (d < 0.5) return f;
      if (d > 0.5) return f + 1;
      return f % 2 === 0 ? f : f + 1;
    },
  };

  it.each(Object.keys(expectedRound))('int input -> float model -> int output with rounding %s, three-way', (rounding) => {
    const owner = asXbOwner(smState('A', { autostart: true }), {
      nodes: [conversion('cin', 'float32', 'int32', 'nearest'), xbNode('g', 'GAIN', { gain: 0.5 }, ['u'], ['y']), conversion('cout', 'int32', 'float32', rounding)],
      edges: [xbEdge('cin.y', 'g.u'), xbEdge('g.y', 'cout.u')],
      mappings: [xbMap('n', 'cin.u', 'in'), xbMap('m', 'cout.y', 'out')],
    });
    const model = single(owner, [smVar('n', 'int32', 0), smVar('m', 'int32', 0)]);
    const inputs = [-5, -3, -1, 1, 3, 5, 7];
    const f = expectAligned(model, steps(inputs.map((n) => ({ n })))).sim;
    expect(f.slice(1).map((x) => norm(x.data.m))).toEqual(inputs.map((n) => norm(expectedRound[rounding](n / 2))));
  }, T);

  it('an int variable mapped to a float port without an explicit conversion is rejected (XB_MAPPING_INVALID)', () => {
    const owner = asXbOwner(smState('A', { autostart: true }), {
      nodes: [xbNode('g', 'GAIN', { gain: 2 }, ['u'], ['y'])],
      mappings: [xbMap('n', 'g.u', 'in'), xbMap('y', 'g.y', 'out')],
    });
    expect(diagnosticsOf(single(owner, [smVar('n', 'int32', 0), smVar('y')]))).toEqual(['XB_MAPPING_INVALID']);
  });

  it('SM variables are scalar: a mapping onto a vector port is rejected (vector / matrix variables are not expressible)', () => {
    const node = xbNode('g', 'GAIN', { gain: 2 }, [], []);
    const p = node.parameters as Record<string, unknown>;
    p.inputs = [{ id: 'u', direction: 'input', shape: 'vector', dimensions: [3], dataType: 'float32' }];
    p.outputs = [{ id: 'y', direction: 'output', shape: 'vector', dimensions: [3], dataType: 'float32' }];
    const owner = asXbOwner(smState('A', { autostart: true }), {
      nodes: [node],
      mappings: [xbMap('u', 'g.u', 'in'), xbMap('y', 'g.y', 'out')],
    });
    expect(diagnosticsOf(single(owner, [smVar('u'), smVar('y')]))).toContain('XB_MAPPING_INVALID');
  });

  it('vector (length 3) and matrix (2x2) signals inside the model, driven by a scalar boundary mapping, align three-way', () => {
    const shaped = (id: string, type: string, dims: number[], ins: string[], outs: string[], params: Record<string, unknown> = {}) => {
      const shape = dims.length === 1 ? 'vector' : 'matrix';
      const port = (pid: string, direction: 'input' | 'output') => ({ id: pid, direction, shape, dimensions: dims, dataType: 'float32' });
      return { id, type, parameters: { ...params, inputs: ins.map((x) => port(x, 'input')), outputs: outs.map((x) => port(x, 'output')) } };
    };
    const owner = asXbOwner(smState('A', { autostart: true }), {
      nodes: [
        shaped('v1', 'Constant', [3], [], ['y'], { value: [1, 2, 3] }),
        shaped('v2', 'Constant', [3], [], ['y'], { value: [4, 5, 6] }),
        shaped('vadd', 'VectorAdd', [3], ['a', 'b'], ['y']),
        shaped('vsink', 'TERMINATOR', [3], ['u'], []),
        shaped('m1', 'Constant', [2, 2], [], ['y'], { value: [1, 2, 3, 4] }),
        shaped('m2', 'Constant', [2, 2], [], ['y'], { value: [5, 6, 7, 8] }),
        shaped('mmul', 'MatrixMul', [2, 2], ['a', 'b'], ['y']),
        shaped('msink', 'TERMINATOR', [2, 2], ['u'], []),
        xbNode('g', 'GAIN', { gain: 2 }, ['u'], ['y']),
      ],
      edges: [
        xbEdge('v1.y', 'vadd.a'), xbEdge('v2.y', 'vadd.b'), xbEdge('vadd.y', 'vsink.u'),
        xbEdge('m1.y', 'mmul.a'), xbEdge('m2.y', 'mmul.b'), xbEdge('mmul.y', 'msink.u'),
      ],
      mappings: [xbMap('u', 'g.u', 'in'), xbMap('y', 'g.y', 'out')],
    });
    const f = expectAligned(single(owner, [smVar('u'), smVar('y')]), steps([{ u: 1 }, { u: 2 }])).sim;
    const signals = f[2].xBridges.A.signals;
    expect(signals['vadd:y']).toEqual([5, 7, 9]);
    expect(signals['mmul:y']).toEqual([[19, 22], [43, 50]]);
    expect(f[2].data.y).toBe(4);
  }, T);

  it('unmapped Outport: its value is traced, no SM variable is written; unmapped Inport is a dangling input (no default)', () => {
    const nodes = () => [
      xbNode('ip', 'Inport', {}, ['in'], ['y']),
      xbNode('g', 'GAIN', { gain: 2 }, ['u'], ['y']),
      xbNode('op', 'Outport', {}, ['u'], ['out']),
    ];
    const edges = [xbEdge('ip.y', 'g.u'), xbEdge('g.y', 'op.u')];
    const mapped = asXbOwner(smState('A', { autostart: true }), { nodes: nodes(), edges, mappings: [xbMap('u', 'ip.in', 'in')] });
    const f = expectAligned(single(mapped, [smVar('u')]), steps([{ u: 3 }])).sim;
    expect(f[1].xBridges.A.signals['op:out']).toBe(6);
    expect(f[1].data).toEqual({ u: 3 });
    // docs (Control-port defaults): data inputs have no default; an unmapped Inport input stops generation with XB_PORT_DANGLING.
    const unmapped = asXbOwner(smState('A', { autostart: true }), { nodes: nodes(), edges, mappings: [] });
    expect(diagnosticsOf(single(unmapped, [smVar('u')]))).toEqual(['XB_PORT_DANGLING']);
  }, T);

  it.each([
    ['variable', xbMap('ghost', 'g.u', 'in'), ['XB_MAPPING_INVALID']],
    ['block', xbMap('u', 'ghost.u', 'in'), ['XB_MAPPING_INVALID', 'XB_PORT_DANGLING']],
    ['port', xbMap('u', 'g.zz', 'in'), ['XB_MAPPING_INVALID', 'XB_PORT_DANGLING']],
  ])('a mapping to a deleted %s is a validation error', (_what, mapping, codes) => {
    const owner = asXbOwner(smState('A', { autostart: true }), {
      nodes: [xbNode('g', 'GAIN', { gain: 2 }, ['u'], ['y'])],
      mappings: [mapping, xbMap('y', 'g.y', 'out')],
    });
    expect(diagnosticsOf(single(owner, [smVar('u'), smVar('y')]))).toEqual(codes);
  });
});

/* ------------------------------------------------------------------------------------------------ 5 */
describe('XB alignment 5: numeric fault policy', () => {
  // Scalar division is VectorDiv (PRODUCT only multiplies in the SM embedded path); the model sits in state B so the fault
  // happens at a scripted tick: tick 1 A runs, tick 2 go (B entered), tick 3 B steps -> division by zero.
  const faultModel = (numericFault: 'signal-only' | 'escalate') => {
    const vec = (id: string, dir: 'input' | 'output') => ({ id, direction: dir, shape: 'vector', dimensions: [2], dataType: 'float32' });
    const b = asXbOwner(smState('B', { priority: 2 }), {
      nodes: [
        { id: 'num', type: 'Constant', parameters: { value: [1, 1], inputs: [], outputs: [vec('y', 'output')] } },
        { id: 'den', type: 'Constant', parameters: { value: [0, 0], inputs: [], outputs: [vec('y', 'output')] } },
        { id: 'div', type: 'VectorDiv', parameters: { inputs: [vec('a', 'input'), vec('b', 'input')], outputs: [vec('y', 'output')] } },
        { id: 'sink', type: 'TERMINATOR', parameters: { inputs: [vec('u', 'input')], outputs: [] } },
      ],
      edges: [xbEdge('num.y', 'div.a'), xbEdge('den.y', 'div.b'), xbEdge('div.y', 'sink.u')],
      numericFault,
    });
    return buildSmModel({
      tickMs: 100,
      states: [smState('A', { autostart: true }), b],
      transitions: [smTransition('ab', 'A', 'B', { condition: 'go' })],
      variables: [smVar('go', 'bool', false)],
      layers: [{ id: 'root', parent: null, states: ['A', 'B'], transitions: ['ab'] }],
    });
  };

  it('signal-only: fault indicated, documented fallback 0 published, the state machine keeps running; same in all three', () => {
    const f = expectAligned(faultModel('signal-only'), steps([{}, { go: true }, {}, {}])).sim;
    expect(f.map((x) => x.error)).toEqual([null, null, null, null, null]);
    const faults = f.map((x) => x.xBridges.B?.faults ?? []);
    expect(faults.map((x) => x.length > 0)).toEqual([false, false, false, true, true]);
    expect(faults[3]).toEqual(['div']);
    expect(f[3].xBridges.B.signals['div:y']).toEqual([0, 0]);
    expect(f[4].activeStateIds).toEqual(['B']);
  }, T);

  it('escalate: the state machine is faulted in the same tick (tick 3) with XBRIDGES_NUMERIC in all three; fault flag compared', () => {
    const three = expectAligned(faultModel('escalate'), steps([{}, { go: true }, {}]));
    for (const t of [three.sim, three.standalone, three.c]) {
      expect(t.map((x) => x.error)).toEqual([null, null, null, 'XBRIDGES_NUMERIC: X-Bridges numeric fault']);
      expect(t[3].xBridges.B.faults).toEqual(['div']);
    }
  }, T);
});

/* ------------------------------------------------------------------------------------------------ 6 */
describe('XB alignment 6: events - a continuous Integrator crossing a guard', () => {
  const crossing = (kind: 'euler' | 'rk4') => {
    const p = asXbOwner(smState('P', { autostart: true }), {
      nodes: [
        xbNode('c', 'Constant', { value: 1 }, [], ['y']),
        xbNode('i', 'INTEGRATOR_CONTINUOUS', { initialValue: 0 }, ['u'], ['y']),
      ],
      edges: [xbEdge('c.y', 'i.u')],
      mappings: [xbMap('y', 'i.y', 'out')],
      solver: { kind, stepSeconds: 0.05 },
    });
    return buildSmModel({
      tickMs: 100,
      states: [p, smState('P1', { parentId: 'P', autostart: true }), smState('P2', { parentId: 'P', priority: 2 })],
      transitions: [smTransition('t12', 'P1', 'P2', { condition: 'y >= 0.35' })],
      variables: [smVar('y')],
      layers: [
        { id: 'root', parent: null, states: ['P'] },
        { id: 'p_children', parent: 'P', states: ['P1', 'P2'], transitions: ['t12'] },
      ],
    });
  };

  it.each(['euler', 'rk4'] as const)('guard on the Integrator output fires in the same tick, solver %s', (kind) => {
    const three = expectAligned(crossing(kind), idle(6));
    const ticks = [three.sim, three.standalone, three.c].map((t) => firstActive(t, 'P2'));
    // D9: two substeps of 0.05 s per tick, output then update per substep, so the published y after tick k is the output of
    // its last substep, y = 0.1 k - 0.05: y >= 0.35 first holds after tick 4 (0.35) and the inner transition fires in tick 4.
    expect(ticks).toEqual([4, 4, 4]);
    expect(three.sim[3].data.y).toBeCloseTo(0.25, 6);
    expect(three.sim[4].data.y).toBeCloseTo(0.35, 6);
  }, T);
});

/* ------------------------------------------------------------------------------------------------ 7 */
describe('XB alignment 7: scale', () => {
  const N = 50;
  const scaleModel = () => {
    const states = Array.from({ length: N }, (_, i) => asXbOwner(
      smState(`S${i}`, { autostart: i === 0, priority: i + 1 }),
      {
        nodes: [
          xbNode('g', 'GAIN', { gain: i + 1 }, ['u'], ['y']),
          xbNode('d', 'UNIT_DELAY', { initialCondition: 0 }, ['u'], ['y']),
        ],
        edges: [xbEdge('g.y', 'd.u')],
        mappings: [xbMap('u', 'g.u', 'in'), xbMap('y', 'd.y', 'out')],
        memory: i % 2 === 0 ? 'reset' : 'retain',
      },
    ));
    return buildSmModel({
      tickMs: 100,
      states,
      transitions: states.map((s, i) => smTransition(`t${i}`, s.id, states[(i + 1) % N].id, { type: 'after', afterTicks: 2 })),
      variables: [smVar('u'), smVar('y')],
      layers: [{ id: 'root', parent: null, states: states.map((s) => s.id), transitions: states.map((_, i) => `t${i}`) }],
    });
  };

  it('50 states, each owning Gain + UNIT_DELAY, 100 ticks: three executions equal; C size and RAM reported', () => {
    const model = scaleModel();
    const list = steps(Array.from({ length: 100 }, (_, k) => ({ u: k % 7 })));
    const three = expectAligned(model, list);
    // every state was visited: S(k) is active in ticks 2k..2k+1 (after(2))
    const visited = new Set(three.sim.flatMap((f) => f.activeStateIds));
    expect(visited.size).toBe(N);
    expect(three.c.length).toBe(101);
    const footprint = measureGeneratedC(model);
    // eslint-disable-next-line no-console
    console.info(`XB-ALIGN-SCALE sm_core.c=${footprint.coreCBytes} bytes, all .c=${footprint.allCBytes} bytes, sizeof(ADIA_Instance_t)=${footprint.instanceBytes} bytes`);
    expect(footprint.instanceBytes).toBeGreaterThan(0);
  }, 180_000);
});

/* ------------------------------------------------------------------------------------------------ 8 */
const haveTools = ['gcc', 'clang', 'gcov', 'make'].every((tool) => spawnSync(tool, ['--version'], { stdio: 'ignore' }).status === 0);
describe('XB alignment 8: AUTOSAR path', () => {
  it.skipIf(!haveTools)('npm run -s verify:autosar runs the state machine with an X-Bridges owner (runnable step = plain C step)', () => {
    const directory = mkdtempSync(join(tmpdir(), 'xbv-autosar-'));
    try {
      const a = asXbOwner(smState('A', { autostart: true }), {
        nodes: [xbNode('g', 'GAIN', { gain: 2 }, ['u'], ['y'])],
        mappings: [xbMap('u', 'g.u', 'in'), xbMap('y', 'g.y', 'out')],
      });
      const chart = buildSmModel({
        tickMs: 100,
        states: [a, smState('B', { priority: 2 })],
        transitions: [smTransition('t', 'A', 'B', { condition: 'y > 3' })],
        variables: [smVar('u'), smVar('y')],
        layers: [{ id: 'root', parent: null, states: ['A', 'B'], transitions: ['t'] }],
      });
      const chartPath = join(directory, 'chart.json');
      writeFileSync(chartPath, JSON.stringify(chart));
      const run = spawnSync('npm', ['run', '-s', 'verify:autosar', '--', '--chart', chartPath, '--out', join(directory, 'out'), '--swc', 'XbAlign'], {
        encoding: 'utf8', timeout: 600_000,
      });
      // eslint-disable-next-line no-console
      console.info(`XB-ALIGN-AUTOSAR exit=${run.status}\n${run.stdout}${run.stderr}`);
      expect(run.status).toBe(0);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 620_000);
});
