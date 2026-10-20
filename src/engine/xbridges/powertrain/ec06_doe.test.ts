// EC-06 acceptance tests: DoE designs and the DoE Sweeper & Constraint Evaluator (engine-calibration-spec.md §2).
// Sweeper timing: point i is active for t in [i*dwell, (i+1)*dwell); responses are averaged over the last `averageWindow`
// seconds of each dwell (samples at the macro steps the block sees); after the last point Done = 1 and the last point is held.
import { describe, it, expect } from 'vitest';
import { BLOCK_LIBRARY } from '../BlockDefinitions';
import { XbridgesEngine } from '../XbridgesEngine';
import { Solvers } from '../Solvers';
import { fullFactorial, latinHypercube, centralComposite, scaleCoded, scaleUnit } from './doeDesigns';
import { doeSweeperResults, bestFeasible, toDoeInputTable } from './blocks/doeSweeper';
import { makeBus } from '../bus/busCore';

describe('doeDesigns', () => {
  it('full factorial enumerates every level combination, first factor slowest', () => {
    const d = fullFactorial([[0, 8, 16], [100, 200]]);
    expect(d).toEqual([[0, 100], [0, 200], [8, 100], [8, 200], [16, 100], [16, 200]]);
  });

  it('Latin hypercube: each factor hits every stratum once; seeded and reproducible', () => {
    const k = 3, n = 12;
    const d = latinHypercube(k, n, 7);
    expect(d).toHaveLength(n);
    for (let j = 0; j < k; j++) {
      const strata = d.map(r => Math.floor(r[j] * n)).sort((a, b) => a - b);
      expect(strata).toEqual(Array.from({ length: n }, (_, i) => i));
      for (const r of d) { expect(r[j]).toBeGreaterThanOrEqual(0); expect(r[j]).toBeLessThan(1); }
    }
    expect(latinHypercube(k, n, 7)).toEqual(d);
    expect(latinHypercube(k, n, 8)).not.toEqual(d);
  });

  it('central composite: 2^k corners, 2k axial points at +-alpha, centre points', () => {
    const face = centralComposite(2, { alpha: 'face', centerPoints: 2 });
    expect(face).toHaveLength(4 + 4 + 2);
    expect(face.slice(0, 4)).toEqual([[-1, -1], [-1, 1], [1, -1], [1, 1]]);
    expect(face.slice(4, 8)).toEqual([[-1, 0], [1, 0], [0, -1], [0, 1]]);
    expect(face.slice(8)).toEqual([[0, 0], [0, 0]]);
    const rot = centralComposite(3, { alpha: 'rotatable', centerPoints: 1 });
    expect(rot).toHaveLength(8 + 6 + 1);
    expect(rot[8][0]).toBeCloseTo(-Math.pow(8, 0.25), 14);
  });

  it('scaling maps coded [-1, 1] and unit [0, 1] designs onto the bounds', () => {
    expect(scaleCoded([[-1, 1], [0, 0]], [[0, 16], [100, 200]])).toEqual([[0, 200], [8, 150]]);
    expect(scaleUnit([[0, 0.5]], [[0, 16], [100, 200]])).toEqual([[0, 150]]);
  });
});

describe('PT_DOE_SWEEPER', () => {
  it('ports and parameters', () => {
    const b = BLOCK_LIBRARY.PT_DOE_SWEEPER('s', {});
    expect(b.inputs.map(p => [p.id, p.unit])).toEqual([['Responses', 'bus']]);
    expect(b.outputs.map(p => [p.id, p.unit])).toEqual([['Info', 'bus'], ['NextPoint', '1'], ['PointIndex', '1'], ['Done', '1']]);
    for (const k of ['designType', 'factors', 'bounds', 'levels', 'samples', 'seed', 'ccdAlpha', 'centerPoints', 'dwell', 'averageWindow', 'Pmax_limit', 'Texh_limit', 'objective'])
      expect(b.params, k).toHaveProperty(k);
  });

  it('sweeps a full factorial design on a toy plant, flags constraint violations and finds the feasible optimum', () => {
    // toy plant computed from the sweeper's own NextPoint (test-side block)
    const plant: any = {
      id: 'plant', type: 'TestPlant', params: {}, inputs: [{ id: 'x', name: 'x', type: 'auto', direction: 'input', value: [0, 0] }],
      outputs: [{ id: 'Responses', name: 'Responses', type: 'auto', direction: 'output', value: {} }],
      execute: (ins: any[]) => {
        const [soi, prail] = (ins[0] as number[]) ?? [0, 0];
        return { outputs: [makeBus(['T_brake', 'BSFC', 'P_max', 'T_exh', 'NOx'],
          [150, 200 + (soi - 8) ** 2 + 0.001 * (prail - 150) ** 2, 60e5 + soi * 5e5 + prail * 1e4, 800 - 5 * soi, 2 + 0.3 * soi])] };
      },
    };
    const sw = BLOCK_LIBRARY.PT_DOE_SWEEPER('sw', { designType: 'Full Factorial', factors: 'SOI,P_rail', bounds: [[0, 16], [100, 200]], levels: 3,
      dwell: 1, averageWindow: 0.5, Pmax_limit: 120e5, Texh_limit: 1050, objective: 'BSFC' });
    const e = new XbridgesEngine({ blocks: [sw, plant], connections: [
      { sourceBlock: 'sw', sourcePort: 'NextPoint', targetBlock: 'plant', targetPort: 'x' },
      { sourceBlock: 'plant', sourcePort: 'Responses', targetBlock: 'sw', targetPort: 'Responses' }] } as any);
    Solvers.runFixedStep(e, { solver: 'ode4', startTime: 0, stopTime: 9.5, fixedStep: 0.05 } as any);
    expect(e.getSignalValue('sw', 'Done')).toBe(1);
    const rows = doeSweeperResults(e.getBlock('sw')!.state);
    expect(rows).toHaveLength(9);
    expect(rows.map(r => r.point)).toEqual([[0, 100], [0, 150], [0, 200], [8, 100], [8, 150], [8, 200], [16, 100], [16, 150], [16, 200]]);
    const r8 = rows[4];
    expect(r8.responses.BSFC).toBeCloseTo(200, 12);
    expect(r8.feasible).toBe(true);
    expect(rows[8].feasible).toBe(false);
    expect(rows[8].violations).toContain('P_max');
    const best = bestFeasible(rows, 'BSFC')!;
    expect(best.point).toEqual([8, 150]);
    const table = toDoeInputTable(rows, ['SOI', 'P_rail'], 'BSFC');
    expect(table.factorNames).toEqual(['SOI', 'P_rail']);
    expect(table.factors).toHaveLength(9);
    expect(table.responses[4]).toBeCloseTo(200, 12);
  });

  it('outputs the first design point at t = 0 and holds the last one after Done', () => {
    const b = BLOCK_LIBRARY.PT_DOE_SWEEPER('s', { designType: 'Full Factorial', factors: 'A', bounds: [[1, 3]], levels: 3, dwell: 1 });
    const first = b.execute([{}], b.params, b.state, 0);
    expect(first.outputs[1]).toEqual([1]);
    expect(first.outputs[2]).toBe(0);
    expect(first.outputs[3]).toBe(0);
  });
});
