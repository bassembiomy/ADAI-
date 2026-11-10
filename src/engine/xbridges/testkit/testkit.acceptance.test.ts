/**
 * WP-02 acceptance tests — the X-Bridges verification test kit.
 * Plan: docs/superpowers/plans/2026-11-10-xbridges-full-verification.md (sections 3 Oracles, 5, 7, 8 WP-02).
 *
 * Every later WP builds its tests on this kit, so the kit itself is checked against mathematics that does not
 * depend on the X-Bridges code: closed forms, IEEE-754 bit patterns, and hand-computed model outputs.
 *
 * Public API (src/engine/xbridges/testkit/index.ts):
 *   buildModel(spec)                       -> XModel; spec = { blocks: {id, type, params?}[], wires: 'a.out -> b.u'[] }
 *   runModel(model, options)               -> { t: number[]; signals: Record<'block.port', unknown[]>; diagnostics }
 *       options = { solver, dt, stopTime, startTime?, probes: 'block.port'[] }
 *       samples: index 0 at startTime (after compile and the first output evaluation), then one after every major
 *       step; t[i] = startTime + i * dt computed by multiplication; the run never steps past stopTime.
 *       If compile reports an error diagnostic the model is not stepped: t = [], signals empty, diagnostics returned.
 *   SOLVER_NAMES                           -> the solver names runModel accepts (the 10 canvas solvers)
 *   stimulus(kind, options)                -> (t) => number   kinds: 'step' | 'ramp' | 'sine' | 'square'
 *   SPECIAL_VALUES                         -> the U3/U4 numeric edge values (plan 4.1)
 *   ulpDistance(a, b, format?)             -> number of representable values between a and b ('float64' default | 'float32')
 *   withinTolerance(actual, expected, { rel?, abs?, ulp? }) -> boolean
 *   referenceIntegrate(f, x0, t0, t1, { steps? }) -> number[]   (RK4 with Richardson extrapolation)
 *   mulberry32(seed)                       -> () => number in [0, 1)
 *   randomGraph(seed, { blocks?, types? }) -> a buildModel spec; DEFAULT_RANDOM_GRAPH_TYPES
 *   compileAndRunC({ files, main?, flags?, args? }) -> { ok, compilerOutput, stdout, exitCode }
 */
import { describe, expect, it } from 'vitest';
import { BLOCK_LIBRARY } from '../BlockDefinitions';
import { XbridgesEngine } from '../XbridgesEngine';
import {
  buildModel, runModel, SOLVER_NAMES, stimulus, SPECIAL_VALUES, ulpDistance, withinTolerance, referenceIntegrate,
  mulberry32, randomGraph, DEFAULT_RANDOM_GRAPH_TYPES, compileAndRunC,
} from './index';

const errors = (d: { severity: string }[]) => d.filter((x) => x.severity === 'error');

describe('buildModel / runModel', () => {
  it('instantiates factories and wires ports by id', () => {
    const model = buildModel({
      blocks: [{ id: 'k', type: 'Constant', params: { value: 3 } }, { id: 'g', type: 'GAIN', params: { gain: 2 } }],
      wires: ['k.out -> g.u'],
    });
    expect(model.blocks.map((b) => b.type)).toEqual(['Constant', 'GAIN']);
    expect(model.connections).toEqual([{ sourceBlock: 'k', sourcePort: 'out', targetBlock: 'g', targetPort: 'u' }]);
  });

  it('rejects an unknown block type, an unknown port and a malformed wire', () => {
    expect(() => buildModel({ blocks: [{ id: 'x', type: 'NO_SUCH_BLOCK' }], wires: [] })).toThrow(/NO_SUCH_BLOCK/);
    expect(() => buildModel({ blocks: [{ id: 'k', type: 'Constant' }, { id: 'g', type: 'GAIN' }], wires: ['k.out -> g.nope'] })).toThrow(/nope/);
    expect(() => buildModel({ blocks: [{ id: 'k', type: 'Constant' }], wires: ['k.out g.u'] })).toThrow();
  });

  it('static chain: Constant 3 -> Gain 2 reads 6 at every sample', () => {
    const r = runModel(buildModel({
      blocks: [{ id: 'k', type: 'Constant', params: { value: 3 } }, { id: 'g', type: 'GAIN', params: { gain: 2 } },
        { id: 't', type: 'TERMINATOR' }],
      wires: ['k.out -> g.u', 'g.y -> t.u'],
    }), { solver: 'rk4', dt: 0.1, stopTime: 0.5, probes: ['g.y'] });
    expect(errors(r.diagnostics)).toEqual([]);
    expect(r.t).toHaveLength(6);
    expect(r.signals['g.y'].map(Number)).toEqual([6, 6, 6, 6, 6, 6]);
  });

  it('time base: t[i] = start + i*dt exactly, first sample at start, last at stop', () => {
    const r = runModel(buildModel({
      blocks: [{ id: 'k', type: 'Constant' }, { id: 't', type: 'TERMINATOR' }], wires: ['k.out -> t.u'],
    }), { solver: 'euler', dt: 0.1, startTime: 2, stopTime: 3, probes: ['k.out'] });
    expect(r.t).toHaveLength(11);
    r.t.forEach((t, i) => expect(t).toBe(2 + i * 0.1));
  });

  it('integrator of a unit constant with rk4: y(t) = t (closed form), y(0) = 0', () => {
    const r = runModel(buildModel({
      blocks: [{ id: 'k', type: 'Constant', params: { value: 1 } }, { id: 'i', type: 'Integrator' }, { id: 't', type: 'TERMINATOR' }],
      wires: ['k.out -> i.in', 'i.out -> t.u'],
    }), { solver: 'rk4', dt: 0.1, stopTime: 1, probes: ['i.out'] });
    expect(errors(r.diagnostics)).toEqual([]);
    const y = r.signals['i.out'].map(Number);
    expect(y[0]).toBe(0);
    y.forEach((v, i) => expect(Math.abs(v - r.t[i])).toBeLessThan(1e-12));
  });

  it('accepts every canvas solver name and refuses an unknown one', () => {
    expect([...SOLVER_NAMES].sort()).toEqual(['discrete', 'euler', 'ode14x', 'ode2', 'ode23', 'ode23tb', 'ode3', 'ode45', 'ode5', 'rk4']);
    const spec = { blocks: [{ id: 'k', type: 'Constant' }, { id: 't', type: 'TERMINATOR' }], wires: ['k.out -> t.u'] };
    for (const solver of SOLVER_NAMES) {
      const r = runModel(buildModel(spec), { solver, dt: 0.1, stopTime: 0.2, probes: ['k.out'] });
      expect(r.t, solver).toHaveLength(3);
    }
    expect(() => runModel(buildModel(spec), { solver: 'ode113', dt: 0.1, stopTime: 0.2, probes: [] })).toThrow(/ode113/);
  });

  it('does not step a model whose compile reports an error', () => {
    const r = runModel(buildModel({
      blocks: [{ id: 'k', type: 'Constant' }, { id: 's', type: 'SATURATION', params: { lowerLimit: 1, upperLimit: -1 } }, { id: 't', type: 'TERMINATOR' }],
      wires: ['k.out -> s.u', 's.y -> t.u'],
    }), { solver: 'rk4', dt: 0.1, stopTime: 1, probes: ['s.y'] });
    expect(errors(r.diagnostics).length).toBeGreaterThan(0);
    expect(r.t).toEqual([]);
  });

  it('builds a fresh model each time (no shared block state between two runs)', () => {
    const spec = {
      blocks: [{ id: 'k', type: 'Constant' }, { id: 'i', type: 'Integrator' }, { id: 't', type: 'TERMINATOR' }],
      wires: ['k.out -> i.in', 'i.out -> t.u'],
    };
    const a = runModel(buildModel(spec), { solver: 'euler', dt: 0.5, stopTime: 1, probes: ['i.out'] });
    const b = runModel(buildModel(spec), { solver: 'euler', dt: 0.5, stopTime: 1, probes: ['i.out'] });
    expect(b.signals['i.out']).toEqual(a.signals['i.out']);
  });
});

describe('stimuli', () => {
  it('step switches at t >= stepTime (Simulink Step)', () => {
    const s = stimulus('step', { time: 1, before: -2, after: 5 });
    expect([s(0), s(0.999999), s(1), s(2)]).toEqual([-2, -2, 5, 5]);
  });
  it('ramp, sine and square follow their closed forms', () => {
    const r = stimulus('ramp', { slope: 2, start: 1, initial: 3 });
    expect([r(0), r(1), r(2.5)]).toEqual([3, 3, 6]);
    const s = stimulus('sine', { amplitude: 2, frequency: 0.5, phase: 0, bias: 1 });
    expect(s(0.5)).toBeCloseTo(1 + 2 * Math.sin(2 * Math.PI * 0.5 * 0.5), 15);
    const q = stimulus('square', { amplitude: 1, period: 2, duty: 0.25 });
    expect([q(0), q(0.49), q(0.5), q(1.9), q(2)]).toEqual([1, 1, -1, -1, 1]);
  });
  it('SPECIAL_VALUES holds the plan 4.1 U3/U4 values', () => {
    for (const v of [0, -0, 1, -1, Number.MAX_VALUE, -Number.MAX_VALUE, Number.MIN_VALUE, 1e-300, -1e-300, 1e300, -1e300, NaN, Infinity, -Infinity]) {
      expect(SPECIAL_VALUES.some((x: number) => Object.is(x, v)), String(v)).toBe(true);
    }
  });
});

describe('tolerances', () => {
  it('ulpDistance counts float64 representable steps', () => {
    expect(ulpDistance(1, 1)).toBe(0);
    expect(ulpDistance(1, 1 + Number.EPSILON)).toBe(1);
    expect(ulpDistance(1, 1 + 2 * Number.EPSILON)).toBe(2);
    expect(ulpDistance(0, -0)).toBe(0);
    expect(ulpDistance(0, Number.MIN_VALUE)).toBe(1);
    expect(ulpDistance(-Number.MIN_VALUE, Number.MIN_VALUE)).toBe(2);
    expect(ulpDistance(NaN, 1)).toBe(Infinity);
    expect(ulpDistance(Infinity, Infinity)).toBe(0);
  });
  it('ulpDistance in float32 counts single-precision steps', () => {
    expect(ulpDistance(1, 1 + 2 ** -23, 'float32')).toBe(1);
    expect(ulpDistance(Math.fround(0.1), Math.fround(0.1), 'float32')).toBe(0);
  });
  it('withinTolerance: rel, abs and ulp criteria (any satisfied criterion passes); NaN only matches NaN', () => {
    expect(withinTolerance(1.0000001, 1, { rel: 1e-6 })).toBe(true);
    expect(withinTolerance(1.00001, 1, { rel: 1e-6 })).toBe(false);
    expect(withinTolerance(1e-13, 0, { abs: 1e-12 })).toBe(true);
    expect(withinTolerance(1 + Number.EPSILON, 1, { ulp: 1 })).toBe(true);
    expect(withinTolerance(1 + 2 * Number.EPSILON, 1, { ulp: 1 })).toBe(false);
    expect(withinTolerance(NaN, NaN, { abs: 0 })).toBe(true);
    expect(withinTolerance(NaN, 0, { abs: 1 })).toBe(false);
    expect(withinTolerance(Infinity, Infinity, { rel: 0 })).toBe(true);
  });
});

describe('referenceIntegrate (oracle 4)', () => {
  it('x\' = -x from 1 gives e^-1 at t = 1', () => {
    expect(Math.abs(referenceIntegrate((_t, x) => [-x[0]], [1], 0, 1)[0] - Math.exp(-1))).toBeLessThan(1e-12);
  });
  it('harmonic oscillator returns to its start after 2*pi', () => {
    const x = referenceIntegrate((_t, s) => [s[1], -s[0]], [1, 0], 0, 2 * Math.PI);
    expect(Math.abs(x[0] - 1)).toBeLessThan(1e-11);
    expect(Math.abs(x[1])).toBeLessThan(1e-11);
  });
  it('time-dependent forcing x\' = cos t gives sin t', () => {
    expect(Math.abs(referenceIntegrate((t) => [Math.cos(t)], [0], 0, 3)[0] - Math.sin(3))).toBeLessThan(1e-12);
  });
});

describe('random graphs (plan 7.3)', () => {
  it('mulberry32 is deterministic and in [0, 1)', () => {
    const a = mulberry32(42); const b = mulberry32(42);
    const xs = Array.from({ length: 1000 }, () => a());
    expect(Array.from({ length: 1000 }, () => b())).toEqual(xs);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
  });

  it('DEFAULT_RANDOM_GRAPH_TYPES holds at least 10 library types, including a stateful one', () => {
    expect(DEFAULT_RANDOM_GRAPH_TYPES.length).toBeGreaterThanOrEqual(10);
    for (const t of DEFAULT_RANDOM_GRAPH_TYPES) expect(typeof BLOCK_LIBRARY[t], t).toBe('function');
    expect(DEFAULT_RANDOM_GRAPH_TYPES.some((t: string) => BLOCK_LIBRARY[t]('x', {}).isStateful)).toBe(true);
  });

  it('same seed gives the same graph, different seeds give different graphs', () => {
    expect(randomGraph(7)).toEqual(randomGraph(7));
    expect(randomGraph(7)).not.toEqual(randomGraph(8));
  });

  it('seeds 1..50: every input is driven exactly once, the graph compiles without error or algebraic loop, and runs 10 rk4 steps', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const spec = randomGraph(seed, { blocks: 12 });
      const model = buildModel(spec);
      const driven = new Map<string, number>();
      for (const c of model.connections) driven.set(`${c.targetBlock}.${c.targetPort}`, (driven.get(`${c.targetBlock}.${c.targetPort}`) ?? 0) + 1);
      for (const b of model.blocks) for (const p of b.inputs) expect(driven.get(`${b.id}.${p.id}`), `seed ${seed} ${b.id}.${p.id}`).toBe(1);
      const engine = new XbridgesEngine(buildModel(spec));
      const diags = engine.compile(0);
      expect(errors(diags), `seed ${seed}`).toEqual([]);
      expect(diags.some((d) => d.code === 'ALGEBRAIC_LOOP'), `seed ${seed}`).toBe(false);
      const r = runModel(buildModel(spec), { solver: 'rk4', dt: 0.01, stopTime: 0.1, probes: [] });
      expect(r.t, `seed ${seed}`).toHaveLength(11);
    }
  });
});

describe('compileAndRunC (plan 7.1)', () => {
  it('compiles strict C99 and returns stdout and exit code', () => {
    const r = compileAndRunC({ files: { 'main.c': '#include <stdio.h>\nint main(void) { printf("%.17g\\n", 0.1 + 0.2); return 3; }\n' } });
    expect(r.ok).toBe(true);
    expect(r.exitCode).toBe(3);
    expect(Number(r.stdout.trim())).toBe(0.1 + 0.2);
  });
  it('treats warnings as errors and reports the compiler output', () => {
    const r = compileAndRunC({ files: { 'main.c': 'int main(void) { int unused; return 0; }\n' } });
    expect(r.ok).toBe(false);
    expect(r.compilerOutput).toMatch(/unused/);
  });
  it('links libm and passes extra flags and arguments', () => {
    const r = compileAndRunC({
      files: { 'main.c': '#include <math.h>\n#include <stdio.h>\n#include <stdlib.h>\nint main(int c, char **v) { (void)c; printf("%.17g\\n", sin(atof(v[1]))); return 0; }\n' },
      flags: ['-O2'], args: ['0.5'],
    });
    expect(r.ok).toBe(true);
    expect(ulpDistance(Number(r.stdout.trim()), Math.sin(0.5))).toBeLessThanOrEqual(4);
  });
});
