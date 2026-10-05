import { describe, it, expect } from 'vitest';
import { XbridgesAnalysisClient, computeRootLocus } from '../../services/xbridgesAnalysisWorker';

describe('X-Bridges Root Locus Analysis & Stale Handling', () => {
  it('computes open-loop poles and closed-loop trajectories accurately', () => {
    // 1 / (s^2 + 2s + 1)
    const result = computeRootLocus({
      numerator: [1],
      denominator: [1, 2, 1],
      maxGain: 10,
      numPoints: 20,
    });

    expect(result.olPoles).toHaveLength(2);
    expect(result.olPoles[0].re).toBeCloseTo(-1, 2);
    expect(result.olPoles[1].re).toBeCloseTo(-1, 2);
    expect(result.trajectories).toHaveLength(2);
    expect(result.trajectories[0].length).toBeGreaterThan(0);
    expect(result.allPolesMap.length).toBeGreaterThan(0);
  });

  it('proves root-locus calculation is deferred and stale calculations cannot replace newer parameters', async () => {
    const client = new XbridgesAnalysisClient(null);

    // Attach catch handler to req1 immediately to avoid unhandled rejection in node
    const req1 = client.computeRootLocusAsync({
      numerator: [1],
      denominator: [1, 2, 1],
      maxGain: 10,
    });
    const req1Assertion = expect(req1).rejects.toThrow(/stale|superseded|cancelled/i);

    // Dispatch second calculation immediately for system B (superseding system A)
    const req2 = client.computeRootLocusAsync({
      numerator: [1],
      denominator: [1, 4, 3], // roots at -1 and -3
      maxGain: 10,
    });

    const res2 = await req2;
    expect(res2.olPoles.map(p => Math.round(p.re)).sort((a, b) => a - b)).toEqual([-3, -1]);

    await req1Assertion;
  });
});
