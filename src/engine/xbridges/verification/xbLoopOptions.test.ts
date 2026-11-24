/**
 * Review follow-up of XBV-417 (the Loop Tol / Loop Iter. toolbar fields), acceptance written before the fix.
 *
 * R1: the two fields are saved with the model and come back on reload (they were dropped by toSimulationSettings /
 *     fromSimulationSettings, so a reload reset them to 1e-6 / 100).
 * R2: the engine itself refuses an invalid algTol / maxIter with STIFF_SOLVER_INVALID_OPTION, as the canvas does
 *     (XBV-426 rule: one clear refusal, never a misleading ALGEBRAIC_LOOP_NOT_CONVERGED, a silent run or a silent
 *     rounding of 2.5 to 3).
 */
import { describe, expect, it } from 'vitest';
import { XbridgesEngine } from '../XbridgesEngine';
import { buildModel, type ModelSpec } from '../testkit';
import {
  DEFAULT_SIMULATION_CONFIG, fromSimulationSettings, solverOptionTextsFrom, solverOptionsForSave, toSimulationSettings,
  type SolverOptionTexts,
} from '../simulationConfig';

const texts = (o: Partial<SolverOptionTexts>): SolverOptionTexts => ({
  relative: '1e-3', absolute: '1e-6', extrapolationOrder: '4', newtonIterations: '1', maxStep: '', minStep: '',
  algTol: '1e-6', maxIter: '100', ...o,
});

describe('R1: Loop Tol / Loop Iter. survive save and reload', () => {
  const saveAndReload = (t: SolverOptionTexts) => {
    const config = { ...DEFAULT_SIMULATION_CONFIG, solver: 'rk4', ...solverOptionsForSave(t) };
    const saved = JSON.parse(JSON.stringify(toSimulationSettings(config)));
    return { saved, reloaded: fromSimulationSettings(saved) };
  };
  it('algTol 1e-4 and maxIter 7 are written to the saved settings', () => {
    const { saved } = saveAndReload(texts({ algTol: '1e-4', maxIter: '7' }));
    expect(saved).toMatchObject({ algTol: 1e-4, maxIter: 7 });
  });
  it('and come back as the same toolbar texts after reload', () => {
    const { reloaded } = saveAndReload(texts({ algTol: '1e-4', maxIter: '7' }));
    expect(reloaded).toMatchObject({ algTol: 1e-4, maxIter: 7 });
    expect(solverOptionTextsFrom(reloaded)).toMatchObject({ algTol: '0.0001', maxIter: '7' });
  });
  it('malformed saved values fall back to the defaults (as the other options do)', () => {
    for (const [algTol, maxIter] of [[0, 0], [-1, 2.5], ['x', 'y'], [Number.NaN, -3]] as const) {
      const r = fromSimulationSettings({ solver: 'rk4', startTime: 0, stopTime: 1, fixedStep: 0.1, algTol, maxIter });
      expect(r?.algTol, String(algTol)).toBeUndefined();
      expect(r?.maxIter, String(maxIter)).toBeUndefined();
      expect(solverOptionTextsFrom(r)).toMatchObject({ algTol: '0.000001', maxIter: '100' });
    }
  });
  it('a model saved before XBV-417 (no loop fields) reloads with the defaults', () => {
    const r = fromSimulationSettings({ solver: 'rk4', startTime: 0, stopTime: 1, fixedStep: 0.1 });
    expect(solverOptionTextsFrom(r)).toMatchObject({ algTol: '0.000001', maxIter: '100' });
  });
});

describe('R2: the engine refuses an invalid algTol / maxIter with STIFF_SOLVER_INVALID_OPTION', () => {
  // y = 0.5 y + 1 (fixed point 2): a loop, so the loop solver would otherwise run.
  const loop: ModelSpec = {
    blocks: [
      { id: 'c', type: 'Constant', params: { value: 1 } }, { id: 's', type: 'Sum', params: { signs: '++' } },
      { id: 'g', type: 'GAIN', params: { gain: 0.5 } },
    ],
    wires: ['c.out -> s.in1', 's.out -> g.u', 'g.y -> s.in2'],
  };
  const noLoop: ModelSpec = {
    blocks: [{ id: 'c', type: 'Constant', params: { value: 1 } }, { id: 'g', type: 'GAIN', params: { gain: 2 } }],
    wires: ['c.out -> g.u'],
  };
  const compile = (spec: ModelSpec, solver: string, opts: Record<string, unknown>) => {
    const e = new XbridgesEngine(buildModel(spec));
    e.options = { solver, fixedStep: 0.1, startTime: 0, stopTime: 1, ...opts } as never;
    const diags = e.compile(0);
    const errors = [...diags, ...e.diagnostics].filter((d) => d.severity === 'error').map((d) => d.code);
    return { e, errors: [...new Set(errors)] };
  };
  const BAD: Record<string, unknown>[] = [
    { algTol: 0 }, { algTol: -1 }, { algTol: Number.NaN }, { algTol: Number.POSITIVE_INFINITY },
    { maxIter: 0 }, { maxIter: -1 }, { maxIter: 2.5 }, { maxIter: Number.NaN },
  ];
  for (const solver of ['rk4', 'euler', 'ode45', 'ode23tb', 'ode14x']) {
    for (const o of BAD) {
      it(`${solver} ${Object.entries(o).map(([k, v]) => `${k}=${v}`).join()}: compile refuses with exactly STIFF_SOLVER_INVALID_OPTION`, () => {
        for (const spec of [loop, noLoop]) expect(compile(spec, solver, o).errors).toEqual(['STIFF_SOLVER_INVALID_OPTION']);
      });
    }
    it(`${solver}: valid or unset loop options compile cleanly and the loop solves to 2`, () => {
      for (const o of [{}, { algTol: 1e-8 }, { maxIter: 1 }, { algTol: 1e-3, maxIter: 250 }] as { algTol?: number; maxIter?: number }[]) {
        const { e, errors } = compile(loop, solver, o);
        expect(errors, JSON.stringify(o)).toEqual([]);
        e.computeOutputs(0);
        // accepted within algTol (1 + |y*|), y* = 2
        expect(Math.abs(Number(e.getSignalValue('s', 'out')) - 2), JSON.stringify(o)).toBeLessThanOrEqual((o.algTol ?? 1e-6) * 3);
      }
    });
  }
});
