// WP-09d acceptance tests: algebraic loops are solved exactly or reported, never silently wrong.
//   - Gauss-Seidel passes over the loop blocks up to SolverOptions.algMaxPasses (default 50) before Newton;
//     loops that only look algebraic because of block-level feedthrough (state-only outputs) settle in a few passes.
//   - A loop that neither Gauss-Seidel nor Newton converges raises an error diagnostic ALGEBRAIC_LOOP_NOT_CONVERGED.
import { describe, it, expect } from 'vitest';
import { BLOCK_LIBRARY } from './BlockDefinitions';
import { XbridgesEngine } from './XbridgesEngine';
import { Solvers } from './Solvers';
import { buildCiTestCell, CI_TEST_CELL_IDS as ID } from './powertrain/examples/ciTestCell';
import { doeSweeperResults } from './powertrain/blocks/doeSweeper';

const c = (s: string, sp: string, t: string, tp: string) => ({ sourceBlock: s, sourcePort: sp, targetBlock: t, targetPort: tp });

describe('algebraic loops', () => {
  it('solves a real algebraic loop y = 0.5 y + 1 (y = 2)', () => {
    const blocks = [BLOCK_LIBRARY.Constant('one', { value: 1 }), BLOCK_LIBRARY.Sum('sum', { signs: '++' }), BLOCK_LIBRARY.GAIN('half', { gain: 0.5 })];
    const e = new XbridgesEngine({ blocks, connections: [c('one', 'out', 'sum', 'in1'), c('half', 'y', 'sum', 'in2'), c('sum', 'out', 'half', 'u')] } as any);
    Solvers.runFixedStep(e, { solver: 'ode4', startTime: 0, stopTime: 0.03, fixedStep: 0.01 } as any);
    expect(Math.abs((e.getSignalValue('sum', 'out') as number) - 2)).toBeLessThan(1e-6);
    expect(e.diagnostics.some(d => d.code === 'ALGEBRAIC_LOOP_NOT_CONVERGED')).toBe(false);
  });

  it('reports a loop without a solution (y = y + 1) as an error', () => {
    const blocks = [BLOCK_LIBRARY.Constant('one', { value: 1 }), BLOCK_LIBRARY.Sum('sum', { signs: '++' }), BLOCK_LIBRARY.GAIN('g', { gain: 1 })];
    const e = new XbridgesEngine({ blocks, connections: [c('one', 'out', 'sum', 'in1'), c('g', 'y', 'sum', 'in2'), c('sum', 'out', 'g', 'u')] } as any);
    Solvers.runFixedStep(e, { solver: 'ode4', startTime: 0, stopTime: 0.02, fixedStep: 0.01 } as any);
    const d = e.diagnostics.find(x => x.code === 'ALGEBRAIC_LOOP_NOT_CONVERGED');
    expect(d?.severity).toBe('error');
    expect(d?.blockIds).toEqual(expect.arrayContaining(['sum', 'g']));
  });

  it('the CI test cell runs without one-step delay blocks and matches the delayed build', () => {
    const run = (delays: boolean) => {
      const { blocks, connections } = buildCiTestCell({ delays, design: { factors: 'SOI,P_rail', bounds: [[6, 10], [120, 160]], levels: 1, dwell: 3, averageWindow: 1 } });
      if (!delays) expect(blocks.some(b => b.type === 'MEMORY')).toBe(false);
      const e = new XbridgesEngine({ blocks, connections } as any);
      Solvers.runFixedStep(e, { solver: 'ode4', startTime: 0, stopTime: 3.2, fixedStep: 0.01 } as any);
      expect(e.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
      return doeSweeperResults(e.getBlock(ID.sweeper)!.state)[0].responses;
    };
    const direct = run(false), delayed = run(true);
    for (const k of ['T_brake', 'BSFC', 'P_max', 'T_exh'] as const) {
      expect(Math.abs(direct[k] - delayed[k]) / Math.abs(delayed[k]), k).toBeLessThan(0.03);
    }
  }, 300_000);
});
