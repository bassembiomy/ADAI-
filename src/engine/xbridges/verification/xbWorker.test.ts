/**
 * WP-14 — the canvas worker gives the same numbers as the main thread (plan section 5.2 "Worker").
 * Plan: docs/superpowers/plans/2026-11-10-xbridges-full-verification.md.
 *
 * The worker (xbridgesWorker.ts, handleXbridgesWorkerMessage) is driven exactly as the canvas drives it: a compile
 * request with the model, then one step request per frame carrying the node parameters (paramUpdates) and the
 * state-machine Inport values (inportOverrides). The reference is the canvas main-thread loop: applyParameterUpdates
 * for every block, then the canvas stepper for the solver (the mapping is checked equal in xbSolvers.test.ts).
 * Equality is bit for bit: same code, same order of operations.
 */
import { describe, expect, it } from 'vitest';
import { XbridgesEngine } from '../XbridgesEngine';
import { Solvers } from '../Solvers';
import { AdaptiveSolver } from '../AdaptiveSolver';
import { StiffSolver } from '../StiffSolver';
import { handleXbridgesWorkerMessage } from '../xbridgesWorker';
import type { XbridgesWorkerRequest, XbridgesWorkerResponse } from '../xbridgesWorkerProtocol';
import { buildModel, randomGraph } from '../testkit';

type Spec = Parameters<typeof buildModel>[0];

/** The canvas stepper (XbridgesWorkspace.tsx stepLiveSolver). */
const canvasStep = (e: XbridgesEngine, solver: string, t: number, dt: number) => {
  if (solver === 'rk4') Solvers.stepRK4(e, t, dt);
  else if (solver === 'ode2') Solvers.stepODE2(e, t, dt);
  else if (solver === 'ode3') Solvers.stepODE3(e, t, dt);
  else if (solver === 'ode5') Solvers.stepODE5(e, t, dt);
  else if (solver === 'ode23') AdaptiveSolver.stepODE23(e, t, dt);
  else if (solver === 'ode45') AdaptiveSolver.stepODE45(e, t, dt);
  else if (solver === 'ode14x') StiffSolver.stepODE14x(e, t, dt);
  else if (solver === 'ode23tb') StiffSolver.stepODE23TB(e, t, dt, 1e-3, 1e-6);
  else if (solver === 'discrete') Solvers.stepDiscrete(e, t, dt);
  else Solvers.stepEuler(e, t, dt);
};
const SOLVERS = ['euler', 'ode2', 'ode3', 'rk4', 'ode5', 'ode23', 'ode45', 'ode14x', 'ode23tb'];

const paramsOf = (spec: Spec) => Object.fromEntries(spec.blocks.filter((b) => b.params).map((b) => [b.id, b.params!]));
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v ?? null)) as T;

let nextId = 1;
const send = (req: Omit<XbridgesWorkerRequest, 'requestId'>): XbridgesWorkerResponse =>
  // Requests cross a structured-clone boundary in the browser: send a clone, as postMessage would.
  handleXbridgesWorkerMessage({ ...req, requestId: nextId++, model: req.model ? (structuredCloneSafe(req.model)) : undefined });
/** postMessage drops functions; the worker re-creates execute/derivatives from the library (XbridgesEngine constructor). */
const structuredCloneSafe = <T>(v: T): T => {
  const strip = (x: any): any => (Array.isArray(x) ? x.map(strip) : x && typeof x === 'object'
    ? Object.fromEntries(Object.entries(x).filter(([, y]) => typeof y !== 'function').map(([k, y]) => [k, strip(y)])) : x);
  return strip(v);
};

/** Runs n steps on the main thread and in the worker; returns per-step states and outputs of both. */
const both = (spec: Spec, solver: string, dt: number, n: number, edit?: (k: number, params: Record<string, any>) => void) => {
  const main = new XbridgesEngine(buildModel(spec));
  main.options = { solver, fixedStep: dt, startTime: 0, stopTime: n * dt } as never;
  const mainDiags = main.compile(0);
  const compile = send({ type: 'compile', model: buildModel(spec), time: 0, dt, solverType: solver, solverOptions: { solver, fixedStep: dt, startTime: 0, stopTime: n * dt } as never });
  const rows: { main: { states: unknown; outputs: unknown }; worker: { states: unknown; outputs: unknown; ok: boolean } }[] = [];
  const params = clone(paramsOf(spec));
  for (let k = 0; k < n; k++) {
    edit?.(k, params);
    const t = k * dt;
    for (const [id, p] of Object.entries(params)) main.applyParameterUpdates(id, p);
    canvasStep(main, solver, t, dt);
    const r = send({ type: 'step', time: t, dt, solverType: solver, paramUpdates: clone(params) });
    rows.push({
      main: {
        states: clone(Object.fromEntries(main.executionOrder.filter((b) => b.state !== undefined).map((b) => [b.id, b.state]))),
        outputs: clone(Object.fromEntries(main.executionOrder.flatMap((b) => b.outputs.map((o) => [`${b.id}.${o.id}`, main.getSignalValue(b.id, o.id)])).filter(([, v]) => v !== undefined))),
      },
      worker: { states: clone(r.engineSnapshot?.blockStates ?? null), outputs: clone(r.outputValues ?? null), ok: r.ok },
    });
  }
  return { rows, compile, mainDiags };
};

const DECAY: Spec = {
  blocks: [{ id: 'x', type: 'Integrator', params: { initialCondition: 1 } }, { id: 'g', type: 'GAIN', params: { gain: -1 } }],
  wires: ['x.out -> g.u', 'g.y -> x.in'],
};
const MIXED: Spec = {
  blocks: [
    { id: 'w', type: 'WaveformGen', params: { type: 'Sine', amp: 1, freq: 0.3, offset: 0, phase: 0 } },
    { id: 's', type: 'Sum', params: { signs: '+-' } },
    { id: 'x', type: 'Integrator', params: { initialCondition: 1 } },
    { id: 'd', type: 'UNIT_DELAY', params: { initialCondition: 0, sampleTime: 0.1 } },
    { id: 'sat', type: 'SATURATION', params: { lowerLimit: -0.5, upperLimit: 0.5 } },
  ],
  wires: ['w.out -> s.in1', 'x.out -> s.in2', 's.out -> x.in', 'x.out -> d.u', 'd.y -> sat.u'],
};

describe('worker = canvas main thread, step by step', () => {
  for (const solver of SOLVERS) {
    it(`${solver}: decay and mixed models give identical states and outputs for 20 steps`, () => {
      for (const spec of [DECAY, MIXED]) {
        const { rows, compile } = both(spec, solver, 0.05, 20);
        expect(compile.ok, `${solver} compile`).toBe(true);
        rows.forEach((r, k) => {
          expect(r.worker.ok, `${solver} step ${k}`).toBe(true);
          expect(r.worker.states, `${solver} states after step ${k}`).toEqual(r.main.states);
          expect(r.worker.outputs, `${solver} outputs after step ${k}`).toEqual(r.main.outputs);
        });
      }
    });
  }

  it('random graphs, seeds 1..15, rk4: identical states and outputs for 15 steps', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const { rows } = both(randomGraph(seed, { blocks: 12 }), 'rk4', 0.01, 15);
      rows.forEach((r, k) => {
        expect(r.worker.states, `seed ${seed} step ${k}`).toEqual(r.main.states);
        expect(r.worker.outputs, `seed ${seed} step ${k}`).toEqual(r.main.outputs);
      });
    }
  });

  it('a parameter edited during the run takes effect at the same step in both (Gain -1 -> -3 at step 5)', () => {
    const { rows } = both(DECAY, 'rk4', 0.1, 10, (k, p) => { if (k === 5) p.g.gain = -3; });
    rows.forEach((r, k) => expect(r.worker.states, `step ${k}`).toEqual(r.main.states));
    // and the edit really changed the trajectory (exact decay would be e^-1 at t = 1)
    expect(Math.abs(Number((rows[9].main.states as Record<string, unknown>).x) - Math.exp(-1))).toBeGreaterThan(1e-3);
  });
});

describe('worker protocol', () => {
  it('a batch of 10 steps equals 10 single steps sent with the canvas time base (accumulated, XBV-017)', () => {
    const spec = MIXED;
    send({ type: 'compile', model: buildModel(spec), time: 0, dt: 0.05, solverType: 'rk4' });
    let single: XbridgesWorkerResponse | undefined;
    let t = 0;
    for (let k = 0; k < 10; k++) { single = send({ type: 'step', time: t, dt: 0.05, solverType: 'rk4' }); t += 0.05; }
    send({ type: 'compile', model: buildModel(spec), time: 0, dt: 0.05, solverType: 'rk4' });
    const batch = send({ type: 'batch', time: 0, dt: 0.05, batchSize: 10, solverType: 'rk4' });
    expect(batch.ok).toBe(true);
    expect(batch.engineSnapshot?.blockStates).toEqual(single!.engineSnapshot?.blockStates);
    expect(batch.outputValues).toEqual(single!.outputValues);
  });

  it('a snapshot taken after 5 steps and restored into a fresh worker engine continues exactly like an uninterrupted run', () => {
    const spec = MIXED;
    send({ type: 'compile', model: buildModel(spec), time: 0, dt: 0.05, solverType: 'rk4' });
    let r: XbridgesWorkerResponse | undefined;
    for (let k = 0; k < 10; k++) r = send({ type: 'step', time: k * 0.05, dt: 0.05, solverType: 'rk4' });
    const uninterrupted = r!;

    send({ type: 'compile', model: buildModel(spec), time: 0, dt: 0.05, solverType: 'rk4' });
    for (let k = 0; k < 5; k++) r = send({ type: 'step', time: k * 0.05, dt: 0.05, solverType: 'rk4' });
    const snapshot = clone(r!.engineSnapshot!);
    send({ type: 'reset', time: 0, dt: 0.05 });
    send({ type: 'compile', model: buildModel(spec), time: 0.25, dt: 0.05, solverType: 'rk4', engineSnapshot: snapshot });
    for (let k = 5; k < 10; k++) r = send({ type: 'step', time: k * 0.05, dt: 0.05, solverType: 'rk4' });
    expect(r!.engineSnapshot?.blockStates).toEqual(uninterrupted.engineSnapshot?.blockStates);
    expect(r!.outputValues).toEqual(uninterrupted.outputValues);
  });

  // Inport.execute returns its own (unconnected) input, whose default value is 0, so the override written by
  // setSignalValue is overwritten at the next evaluation. The main-thread canvas path uses the same code.
  it.fails('XBV-039: a state-machine Inport value (inportOverrides) drives the model like a Constant of that value', () => {
    const viaInport = (() => {
      send({ type: 'compile', model: buildModel({ blocks: [{ id: 'in', type: 'Inport' }, { id: 'x', type: 'Integrator' }], wires: ['in.out -> x.in'] }), time: 0, dt: 0.1, solverType: 'rk4' });
      let r: XbridgesWorkerResponse | undefined;
      for (let k = 0; k < 10; k++) r = send({ type: 'step', time: k * 0.1, dt: 0.1, solverType: 'rk4', inportOverrides: { in: 2.5 } });
      return r!;
    })();
    expect(Math.abs(Number(viaInport.outputValues?.['x.out']) - 2.5 * 0.9)).toBeLessThan(1e-12);
    expect(Math.abs(Number(viaInport.engineSnapshot?.blockStates.x) - 2.5)).toBeLessThan(1e-12);
  });

  it('a block that raises an exception fails the step with BLOCK_RUNTIME_FAULT, and the worker accepts a new model afterwards', () => {
    send({ type: 'compile', model: buildModel({ blocks: [{ id: 'k', type: 'Constant' }, { id: 'm', type: 'MatrixConcat' }], wires: ['k.out -> m.in1'] }), time: 0, dt: 0.1, solverType: 'rk4' });
    const failed = send({ type: 'step', time: 0, dt: 0.1, solverType: 'rk4' });
    expect(failed.ok).toBe(false);
    expect((failed.diagnostics ?? []).map((d) => d.code)).toContain('BLOCK_RUNTIME_FAULT');
    const ok = send({ type: 'compile', model: buildModel(DECAY), time: 0, dt: 0.1, solverType: 'rk4' });
    expect(ok.ok).toBe(true);
    expect(send({ type: 'step', time: 0, dt: 0.1, solverType: 'rk4' }).ok).toBe(true);
  });

  it('a model with a compile error is refused with its diagnostics and no step runs', () => {
    const r = send({ type: 'compile', model: buildModel({ blocks: [{ id: 's', type: 'SATURATION', params: { lowerLimit: 1, upperLimit: -1 } }], wires: [] }), time: 0, dt: 0.1, solverType: 'rk4' });
    expect(r.ok).toBe(false);
    expect((r.diagnostics ?? []).some((d) => d.severity === 'error')).toBe(true);
  });

  it('cancel is acknowledged and leaves the engine usable', () => {
    send({ type: 'compile', model: buildModel(DECAY), time: 0, dt: 0.1, solverType: 'rk4' });
    expect(send({ type: 'cancel', time: 0, dt: 0.1 }).ok).toBe(true);
    expect(send({ type: 'step', time: 0, dt: 0.1, solverType: 'rk4' }).ok).toBe(true);
  });
});
