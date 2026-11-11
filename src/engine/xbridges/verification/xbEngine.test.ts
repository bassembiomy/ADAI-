/**
 * WP-13 — engine semantics (plan section 5.2): execution order, output/update split, algebraic loops, multirate
 * hold, subsystems, malformed models, scale.
 * Plan: docs/superpowers/plans/2026-11-10-xbridges-full-verification.md.
 *
 * Oracles: hand-computed sequences (delay ring, sampled ramp), analytic fixed points of linear and piecewise-linear
 * loops, metamorphic equality (block order and ids must not matter; a subsystem equals its flattened content).
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BLOCK_LIBRARY } from '../BlockDefinitions';
import { XbridgesEngine } from '../XbridgesEngine';
import type { XModel } from '../types';
import { buildModel, mulberry32, randomGraph, runModel } from '../testkit';

type Spec = Parameters<typeof buildModel>[0];
const errors = (d: { severity: string }[]) => d.filter((x) => x.severity === 'error');
const at = (r: ReturnType<typeof runModel>, probe: string, i = -1) => r.signals[probe].at(i);

describe('execution order is a property of the graph, not of the file', () => {
  it('seeds 1..30: shuffling block order and renaming every id gives identical signals (rk4, 20 steps)', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const spec = randomGraph(seed, { blocks: 12 });
      const rng = mulberry32(seed * 7919);
      const rename = (id: string) => `n${id.split('').reverse().join('')}_${seed}`;
      const shuffled: Spec = {
        blocks: [...spec.blocks].map((b) => ({ ...b, id: rename(b.id) })).sort(() => rng() - 0.5),
        wires: [...spec.wires].map((w) => w.replace(/([A-Za-z0-9_]+)\.(\S+)\s*->\s*([A-Za-z0-9_]+)\.(\S+)/, (_m, a, p, b, q) => `${rename(a)}.${p} -> ${rename(b)}.${q}`)).sort(() => rng() - 0.5),
      };
      const probes = buildModel(spec).blocks.flatMap((b) => b.outputs.map((o) => `${b.id}.${o.id}`));
      const a = runModel(buildModel(spec), { solver: 'rk4', dt: 0.01, stopTime: 0.2, probes });
      const b = runModel(buildModel(shuffled), {
        solver: 'rk4', dt: 0.01, stopTime: 0.2,
        probes: probes.map((p) => `${rename(p.split('.')[0])}.${p.split('.').slice(1).join('.')}`),
      });
      for (const p of probes) {
        const q = `${rename(p.split('.')[0])}.${p.split('.').slice(1).join('.')}`;
        expect(b.signals[q], `seed ${seed} ${p}`).toEqual(a.signals[p]);
      }
    }
  });
});

describe('execution order is a valid topological order (plan 5.2)', () => {
  it('seeds 1..50 (blocks shuffled): in the executed order, every feed-through dependency outside a loop runs after its source', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const spec = randomGraph(seed, { blocks: 14 });
      const rng = mulberry32(seed * 104729);
      const model = buildModel({ ...spec, blocks: [...spec.blocks].sort(() => rng() - 0.5) });
      const e = new XbridgesEngine(model);
      e.compile(0);
      // Record the order in which blocks actually execute during one output evaluation.
      const executed: string[] = [];
      for (const b of model.blocks) {
        const original = b.execute;
        b.execute = (...args) => { executed.push(b.id); return original(...args); };
      }
      e.computeOutputs(0);
      const pos = new Map(executed.map((id, i) => [id, executed.indexOf(id) === i ? i : executed.indexOf(id)]));
      for (const c of model.connections) {
        const target = model.blocks.find((b) => b.id === c.targetBlock)!;
        const feedthrough = target.directFeedthrough ?? !target.isStateful;
        if (!feedthrough || c.sourceBlock === c.targetBlock || !pos.has(c.sourceBlock) || !pos.has(c.targetBlock)) continue;
        expect(pos.get(c.sourceBlock)!, `seed ${seed}: ${c.sourceBlock} before ${c.targetBlock}`).toBeLessThan(pos.get(c.targetBlock)!);
      }
      expect(new Set(executed).size, `seed ${seed}: every block executed`).toBe(model.blocks.length);
    }
  });
  it('a hand-built chain listed in reverse is still evaluated source first', () => {
    const model = buildModel({
      blocks: [{ id: 't', type: 'TERMINATOR' }, { id: 'g2', type: 'GAIN' }, { id: 'g1', type: 'GAIN' }, { id: 'k', type: 'Constant' }],
      wires: ['k.out -> g1.u', 'g1.y -> g2.u', 'g2.y -> t.u'],
    });
    const e = new XbridgesEngine(model);
    e.compile(0);
    expect(e.executionOrder.map((b) => b.id)).toEqual(['k', 'g1', 'g2', 't']);
  });
});

describe('output/update split (Simulink: outputs of all blocks first, then state updates)', () => {
  it('two unit delays in a ring swap their values every sample: d1 = 1,2,1,2..., d2 = 2,1,2,1...', () => {
    const r = runModel(buildModel({
      blocks: [
        { id: 'd1', type: 'UNIT_DELAY', params: { initialCondition: 1, sampleTime: 0.1 } },
        { id: 'd2', type: 'UNIT_DELAY', params: { initialCondition: 2, sampleTime: 0.1 } },
      ],
      wires: ['d1.y -> d2.u', 'd2.y -> d1.u'],
    }), { solver: 'discrete', dt: 0.1, stopTime: 0.5, probes: ['d1.y', 'd2.y'] });
    expect(errors(r.diagnostics)).toEqual([]);
    expect(r.signals['d1.y'].map(Number)).toEqual([1, 2, 1, 2, 1, 2]);
    expect(r.signals['d2.y'].map(Number)).toEqual([2, 1, 2, 1, 2, 1]);
  });

  it('a unit delay holds between its hits: ramp t sampled every 0.1 s, read every 0.05 s (rk4)', () => {
    const r = runModel(buildModel({
      blocks: [
        { id: 'one', type: 'Constant', params: { value: 1 } },
        { id: 'ramp', type: 'Integrator', params: { initialCondition: 0 } },
        { id: 'd', type: 'UNIT_DELAY', params: { initialCondition: 0, sampleTime: 0.1 } },
      ],
      wires: ['one.out -> ramp.in', 'ramp.out -> d.u'],
    }), { solver: 'rk4', dt: 0.05, stopTime: 0.5, probes: ['d.y'] });
    expect(errors(r.diagnostics)).toEqual([]);
    // y(t) = u at the previous hit: 0 on [0, 0.2), then (k - 1) * 0.1 on [k * 0.1, (k + 1) * 0.1).
    const expected = r.t.map((t) => { const k = Math.floor(t / 0.1 + 1e-9); return k <= 1 ? 0 : (k - 1) * 0.1; });
    r.signals['d.y'].forEach((v, i) => expect(Math.abs(Number(v) - expected[i]), `t = ${r.t[i]}`).toBeLessThan(1e-12));
  });
});

describe('algebraic loops (analytic fixed points)', () => {
  it('vector loop y = [1 2] + 0.5 y gives [2 4]', () => {
    const r = runModel(buildModel({
      blocks: [
        { id: 'c', type: 'Constant', params: { value: '[1 2]' } },
        { id: 's', type: 'Sum', params: { signs: '++' } },
        { id: 'g', type: 'GAIN', params: { gain: 0.5 } },
      ],
      wires: ['c.out -> s.in1', 's.out -> g.u', 'g.y -> s.in2'],
    }), { solver: 'rk4', dt: 0.1, stopTime: 0.2, probes: ['s.out'] });
    expect(errors(r.diagnostics)).toEqual([]);
    const y = at(r, 's.out') as number[];
    expect(Math.abs(y[0] - 2)).toBeLessThan(1e-6);
    expect(Math.abs(y[1] - 4)).toBeLessThan(1e-6);
  });

  it('two coupled loops y1 = 1 + 0.5 y2, y2 = 2 + 0.25 y1 give y1 = 16/7, y2 = 18/7', () => {
    const r = runModel(buildModel({
      blocks: [
        { id: 'c1', type: 'Constant', params: { value: 1 } }, { id: 'c2', type: 'Constant', params: { value: 2 } },
        { id: 's1', type: 'Sum', params: { signs: '++' } }, { id: 's2', type: 'Sum', params: { signs: '++' } },
        { id: 'g1', type: 'GAIN', params: { gain: 0.5 } }, { id: 'g2', type: 'GAIN', params: { gain: 0.25 } },
      ],
      wires: ['c1.out -> s1.in1', 'c2.out -> s2.in1', 's2.out -> g1.u', 'g1.y -> s1.in2', 's1.out -> g2.u', 'g2.y -> s2.in2'],
    }), { solver: 'rk4', dt: 0.1, stopTime: 0.2, probes: ['s1.out', 's2.out'] });
    expect(Math.abs(Number(at(r, 's1.out')) - 16 / 7)).toBeLessThan(1e-6);
    expect(Math.abs(Number(at(r, 's2.out')) - 18 / 7)).toBeLessThan(1e-6);
  });

  it('a loop where plain iteration diverges (y = 1 - 2y) is solved by Newton: y = 1/3', () => {
    const r = runModel(buildModel({
      blocks: [
        { id: 'c', type: 'Constant', params: { value: 1 } },
        { id: 's', type: 'Sum', params: { signs: '+-' } },
        { id: 'g', type: 'GAIN', params: { gain: 2 } },
      ],
      wires: ['c.out -> s.in1', 's.out -> g.u', 'g.y -> s.in2'],
    }), { solver: 'rk4', dt: 0.1, stopTime: 0.2, probes: ['s.out'] });
    expect(errors(r.diagnostics)).toEqual([]);
    expect(Math.abs(Number(at(r, 's.out')) - 1 / 3)).toBeLessThan(1e-6);
  });

  it('a piecewise-linear loop y = sat(1 - 2y, -1, 1) has the unique solution y = 1/3', () => {
    const r = runModel(buildModel({
      blocks: [
        { id: 'c', type: 'Constant', params: { value: 1 } },
        { id: 's', type: 'Sum', params: { signs: '+-' } },
        { id: 'sat', type: 'SATURATION', params: { lowerLimit: -1, upperLimit: 1 } },
        { id: 'g', type: 'GAIN', params: { gain: 2 } },
      ],
      wires: ['c.out -> s.in1', 's.out -> sat.u', 'sat.y -> g.u', 'g.y -> s.in2'],
    }), { solver: 'rk4', dt: 0.1, stopTime: 0.2, probes: ['sat.y'] });
    expect(errors(r.diagnostics)).toEqual([]);
    expect(Math.abs(Number(at(r, 'sat.y')) - 1 / 3)).toBeLessThan(1e-6);
  });

  it('a self-loop on a feed-through block (y = 0.5 y) gives y = 0 and is reported as an algebraic loop', () => {
    const r = runModel(buildModel({ blocks: [{ id: 'g', type: 'GAIN', params: { gain: 0.5 } }], wires: ['g.y -> g.u'] }),
      { solver: 'rk4', dt: 0.1, stopTime: 0.2, probes: ['g.y'] });
    expect(r.diagnostics.map((d) => d.code)).toContain('ALGEBRAIC_LOOP');
    expect(Math.abs(Number(at(r, 'g.y')))).toBeLessThan(1e-9);
  });

  it('a loop with two solutions (y = sat(1 + 2y, -1, 1): y = 1 or y = -1) converges to one of them', () => {
    const r = runModel(buildModel({
      blocks: [
        { id: 'c', type: 'Constant', params: { value: 1 } },
        { id: 's', type: 'Sum', params: { signs: '++' } },
        { id: 'sat', type: 'SATURATION', params: { lowerLimit: -1, upperLimit: 1 } },
        { id: 'g', type: 'GAIN', params: { gain: 2 } },
      ],
      wires: ['c.out -> s.in1', 's.out -> sat.u', 'sat.y -> g.u', 'g.y -> s.in2'],
    }), { solver: 'rk4', dt: 0.1, stopTime: 0.2, probes: ['sat.y'] });
    const y = Number(at(r, 'sat.y'));
    expect(Math.abs(y - Math.min(1, Math.max(-1, 1 + 2 * y)))).toBeLessThan(1e-6);
  });

  it('a loop through a subsystem (y = 1 + 0.5 * [Inport -> Gain -> Outport](y)) gives y = 2', () => {
    const blk = (type: string, id: string, params: Record<string, unknown> = {}, parentId?: string) =>
      Object.assign(BLOCK_LIBRARY[type](id, params), parentId ? { parentId } : {});
    const conn = (sourceBlock: string, sourcePort: string, targetBlock: string, targetPort: string) => ({ sourceBlock, sourcePort, targetBlock, targetPort });
    const e = new XbridgesEngine({
      blocks: [blk('Constant', 'c', { value: 1 }), blk('Sum', 's', { signs: '++' }), blk('Subsystem', 'sub'),
        blk('Inport', 'si', {}, 'sub'), blk('GAIN', 'g', { gain: 0.5 }, 'sub'), blk('Outport', 'so', {}, 'sub')],
      connections: [conn('c', 'out', 's', 'in1'), conn('s', 'out', 'sub', 'si'), conn('si', 'out', 'g', 'u'), conn('g', 'y', 'so', 'in'), conn('sub', 'so', 's', 'in2')],
    });
    expect(errors(e.compile(0))).toEqual([]);
    e.computeOutputs(0);
    // Loop tolerance is relative (algTol 1e-6 on |y| = 2): measured error 1.9e-6.
    expect(Math.abs(Number(e.getSignalValue('s', 'out')) - 2)).toBeLessThan(1e-5);
  });

  // The diagnostic is emitted but the run continues with a meaningless value (Simulink stops).
  it('XBV-030: a loop with no solution (y = 1 + y) stops the run with ALGEBRAIC_LOOP_NOT_CONVERGED', () => {
    const r = runModel(buildModel({
      blocks: [{ id: 'c', type: 'Constant', params: { value: 1 } }, { id: 's', type: 'Sum', params: { signs: '++' } }, { id: 'g', type: 'GAIN', params: { gain: 1 } }],
      wires: ['c.out -> s.in1', 's.out -> g.u', 'g.y -> s.in2'],
    }), { solver: 'rk4', dt: 0.1, stopTime: 0.5, probes: ['s.out'] });
    expect(r.diagnostics.map((d) => d.code)).toContain('ALGEBRAIC_LOOP_NOT_CONVERGED');
    expect(r.t.length).toBeLessThan(6);
  });
});

describe('subsystems', () => {
  const blk = (type: string, id: string, params: Record<string, unknown> = {}, parentId?: string) =>
    Object.assign(BLOCK_LIBRARY[type](id, params), parentId ? { parentId } : {});
  const conn = (sourceBlock: string, sourcePort: string, targetBlock: string, targetPort: string) => ({ sourceBlock, sourcePort, targetBlock, targetPort });
  const run = (model: XModel, probe: [string, string]) => {
    const e = new XbridgesEngine(model);
    const d = e.compile(0);
    expect(errors(d)).toEqual([]);
    e.computeOutputs(0);
    return Number(e.getSignalValue(...probe));
  };
  it('Constant 3 -> [Inport -> Gain 2 -> Outport] -> Terminator equals the flat model (6)', () => {
    const nested = run({
      blocks: [blk('Constant', 'k', { value: 3 }), blk('Subsystem', 'sub'), blk('Inport', 'i1', {}, 'sub'),
        blk('GAIN', 'g', { gain: 2 }, 'sub'), blk('Outport', 'o1', {}, 'sub'), blk('TERMINATOR', 't')],
      connections: [conn('k', 'out', 'sub', 'i1'), conn('i1', 'out', 'g', 'u'), conn('g', 'y', 'o1', 'in'), conn('sub', 'o1', 't', 'u')],
    }, ['o1', 'out']);
    expect(nested).toBe(6);
  });
  it('two nested levels behave like the flat chain (Gain 2 then Gain 5 -> 30)', () => {
    const nested = run({
      blocks: [blk('Constant', 'k', { value: 3 }), blk('Subsystem', 'A'), blk('Inport', 'ai', {}, 'A'), blk('GAIN', 'g2', { gain: 2 }, 'A'),
        blk('Subsystem', 'B', {}, 'A'), blk('Inport', 'bi', {}, 'B'), blk('GAIN', 'g5', { gain: 5 }, 'B'), blk('Outport', 'bo', {}, 'B'),
        blk('Outport', 'ao', {}, 'A'), blk('TERMINATOR', 't')],
      connections: [conn('k', 'out', 'A', 'ai'), conn('ai', 'out', 'g2', 'u'), conn('g2', 'y', 'B', 'bi'), conn('bi', 'out', 'g5', 'u'),
        conn('g5', 'y', 'bo', 'in'), conn('B', 'bo', 'ao', 'in'), conn('A', 'ao', 't', 'u')],
    }, ['ao', 'out']);
    expect(nested).toBe(30);
  });
});

describe('multirate and events', () => {
  it('two delays at 0.1 s and 0.25 s on one ramp each hold their own last sample (rk4, dt 0.05)', () => {
    const r = runModel(buildModel({
      blocks: [
        { id: 'one', type: 'Constant', params: { value: 1 } },
        { id: 'ramp', type: 'Integrator', params: { initialCondition: 0 } },
        { id: 'a', type: 'UNIT_DELAY', params: { initialCondition: 0, sampleTime: 0.1 } },
        { id: 'b', type: 'UNIT_DELAY', params: { initialCondition: 0, sampleTime: 0.25 } },
      ],
      wires: ['one.out -> ramp.in', 'ramp.out -> a.u', 'ramp.out -> b.u'],
    }), { solver: 'rk4', dt: 0.05, stopTime: 1, probes: ['a.y', 'b.y'] });
    expect(errors(r.diagnostics)).toEqual([]);
    const held = (ts: number) => (t: number) => { const k = Math.floor(t / ts + 1e-9); return k <= 1 ? 0 : (k - 1) * ts; };
    r.t.forEach((t, i) => {
      expect(Math.abs(Number(r.signals['a.y'][i]) - held(0.1)(t)), `a at ${t}`).toBeLessThan(1e-12);
      expect(Math.abs(Number(r.signals['b.y'][i]) - held(0.25)(t)), `b at ${t}`).toBeLessThan(1e-12);
    });
  });

  // The probe runs in a child process with a 15 s limit: batch ode45/ode23 hang as soon as they bracket the Step event
  // (step inside the interval, or at the stop time with tight tolerances); no result after 60 s.
  const probe = (solver: string, stepTime: number) => {
    const script = join(__dirname, 'probes', 'stepEventProbe.ts');
    try {
      const out = execFileSync(process.execPath, ['--import', 'tsx', script, solver, String(stepTime)], { timeout: 15_000, encoding: 'utf8' });
      return JSON.parse(out) as { y: number; errors: string[] };
    } catch (e) {
      return { y: Number.NaN, errors: [(e as { killed?: boolean }).killed ? 'TIMEOUT' : String(e)] };
    }
  };
  it('the probe itself works: batch rk4 with the same Step finishes with a finite integral between 0.4 and 0.5', () => {
    const r = probe('rk4', 0.55);
    expect(r.errors).toEqual([]);
    expect(r.y).toBeGreaterThan(0.4);
    expect(r.y).toBeLessThan(0.5);
  }, 30_000);
  for (const solver of ['ode45', 'ode23']) {
    it(`XBV-036: batch ${solver} locates the Step event: integral of Step(0.55) over [0, 1] is 0.45 (finishes in 15 s)`, () => {
      const r = probe(solver, 0.55);
      expect(r.errors).toEqual([]);
      expect(Math.abs(r.y - 0.45)).toBeLessThan(1e-6);
    }, 30_000);
  }

  for (const solver of ['ode14x', 'ode23tb']) {
    // The batch runner stops on STIFF_SOLVER_*; the canvas loop stops only on a fatal flag, which reportError never sets.
    it(`XBV-033: a stiff solver error (${solver}, non-finite derivative) stops the canvas run`, () => {
      const r = runModel(buildModel({ blocks: [{ id: 'k', type: 'Constant', params: { value: 'inf' } }, { id: 'i', type: 'Integrator' }], wires: ['k.out -> i.in'] }),
        { solver, dt: 0.1, stopTime: 0.5, probes: ['i.out'] });
      expect(r.diagnostics.map((d) => d.code)).toContain('STIFF_SOLVER_NONFINITE');
      expect(r.t.length).toBeLessThan(6);
    });
  }

  it('an empty subsystem compiles without error', () => {
    const e = new XbridgesEngine({ blocks: [BLOCK_LIBRARY.Subsystem('sub', {})], connections: [] });
    expect(errors(e.compile(0))).toEqual([]);
  });
});

describe('malformed models', () => {
  const model = (blocks: unknown[], connections: unknown[]) => ({ blocks, connections }) as unknown as XModel;
  it('an empty model compiles and runs', () => {
    const r = runModel({ blocks: [], connections: [] }, { solver: 'rk4', dt: 0.1, stopTime: 0.3, probes: [] });
    expect(errors(r.diagnostics)).toEqual([]);
    expect(r.t).toHaveLength(4);
  });
  it('a connection to a missing block or port does not throw', () => {
    const e = new XbridgesEngine(model([BLOCK_LIBRARY.Constant('k', {}), BLOCK_LIBRARY.GAIN('g', {})], [
      { sourceBlock: 'k', sourcePort: 'out', targetBlock: 'nope', targetPort: 'u' },
      { sourceBlock: 'k', sourcePort: 'out', targetBlock: 'g', targetPort: 'nope' },
    ]));
    expect(() => { e.compile(0); e.computeOutputs(0); }).not.toThrow();
  });
  it('XBV-031: two signals driving one input port is a compile error (Simulink: one driver per input)', () => {
    const e = new XbridgesEngine(model([BLOCK_LIBRARY.Constant('a', { value: 1 }), BLOCK_LIBRARY.Constant('b', { value: 2 }), BLOCK_LIBRARY.GAIN('g', {})], [
      { sourceBlock: 'a', sourcePort: 'out', targetBlock: 'g', targetPort: 'u' },
      { sourceBlock: 'b', sourcePort: 'out', targetBlock: 'g', targetPort: 'u' },
    ]));
    expect(errors(e.compile(0)).length).toBeGreaterThan(0);
  });
  it('XBV-031: two blocks with the same id is a compile error', () => {
    const e = new XbridgesEngine(model([BLOCK_LIBRARY.Constant('x', { value: 1 }), BLOCK_LIBRARY.GAIN('x', {})], []));
    expect(errors(e.compile(0)).length).toBeGreaterThan(0);
  });
  it('XBV-031: an unknown block type is a compile error, not a silent no-op', () => {
    const e = new XbridgesEngine(model([{ id: 'u', type: 'NO_SUCH_BLOCK', params: {}, inputs: [], outputs: [] }], []));
    let threw = false;
    let diags: { severity: string }[] = [];
    try { diags = e.compile(0); } catch { threw = true; }
    expect(threw || errors(diags).length > 0).toBe(true);
  });
});

describe('scale', () => {
  // Measured: 1000 / 2000 / 4000 blocks run in 188 / 435 / 1633 ms (quadratic); 10 000 blocks take about 22 s.
  it('XBV-032: a 10 000-block gain chain compiles in under 5 s and runs 10 rk4 steps in under 5 s with the right value', () => {
    const n = 10_000;
    const blocks: Spec['blocks'] = [{ id: 'k', type: 'Constant', params: { value: 1 } }];
    const wires: string[] = [];
    let prev = 'k.out';
    for (let i = 0; i < n; i++) { blocks.push({ id: `g${i}`, type: 'GAIN', params: { gain: 1 } }); wires.push(`${prev} -> g${i}.u`); prev = `g${i}.y`; }
    const m = buildModel({ blocks, wires });
    const t0 = performance.now();
    const e = new XbridgesEngine(m);
    expect(errors(e.compile(0))).toEqual([]);
    const tc = performance.now() - t0;
    const t1 = performance.now();
    const r = runModel(buildModel({ blocks, wires }), { solver: 'rk4', dt: 0.1, stopTime: 1, probes: [`g${n - 1}.y`] });
    const tr = performance.now() - t1;
    expect(Number(at(r, `g${n - 1}.y`))).toBe(1);
    expect(tc, 'compile ms').toBeLessThan(5000);
    expect(tr, 'compile + run ms').toBeLessThan(5000);
  }, 60_000);
});
