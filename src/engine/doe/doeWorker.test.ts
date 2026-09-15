import { describe, it, expect } from 'vitest';
import { handleDOEWorkerMessage } from './doeWorker';
import { fitRSM, fitGMDH, fitTaguchi } from './statistics';
import type { DOEWorkerRequest, SurfaceComputeRequest } from './doeWorkerProtocol';

const SAMPLE_RSM_DATA = {
  headers: ['Factor A', 'Factor B', 'Yield'],
  data: [
    [-1, -1, 12.5],
    [1, -1, 15.8],
    [-1, 1, 14.2],
    [1, 1, 22.4],
    [0, 0, 18.1],
    [0, 0, 18.3],
    [0, 0, 18.0],
    [-1.414, 0, 11.2],
    [1.414, 0, 19.5],
    [0, -1.414, 13.1],
    [0, 1.414, 21.0],
  ],
};

const SAMPLE_TAGUCHI_DATA = {
  headers: ['Factor 1', 'Factor 2', 'Factor 3', 'Output'],
  data: [
    [1, 1, 1, 10],
    [1, 2, 2, 12],
    [1, 3, 3, 15],
    [2, 1, 2, 11],
    [2, 2, 3, 14],
    [2, 3, 1, 13],
    [3, 1, 3, 13],
    [3, 2, 1, 12],
    [3, 3, 2, 16],
  ],
};

describe('doeWorker message handling', () => {
  it('computes RSM equivalence: direct fitRSM vs worker fitRSM', async () => {
    const directResult = fitRSM(SAMPLE_RSM_DATA);
    const request: DOEWorkerRequest = {
      requestId: 101,
      taskType: 'fitRSM',
      payload: { input: SAMPLE_RSM_DATA },
    };

    const response = await handleDOEWorkerMessage(request);
    expect(response.ok).toBe(true);
    expect(response.requestId).toBe(101);
    expect(response.result.modelType).toBe('RSM');
    expect(response.result.rSquared).toBeCloseTo(directResult.rSquared!, 6);
    expect(response.result.fStatistic).toBeCloseTo(directResult.fStatistic!, 6);
    expect(response.result.details.physicalCoefficients).toEqual(directResult.details.physicalCoefficients);
  });

  it('computes GMDH equivalence: direct fitGMDH vs worker fitGMDH', async () => {
    const directResult = fitGMDH(SAMPLE_RSM_DATA, { polynomialOrder: 2, maxLayers: 3 });
    const request: DOEWorkerRequest = {
      requestId: 102,
      taskType: 'fitGMDH',
      payload: { input: SAMPLE_RSM_DATA, options: { polynomialOrder: 2, maxLayers: 3 } },
    };

    const response = await handleDOEWorkerMessage(request);
    expect(response.ok).toBe(true);
    expect(response.result.modelType).toBe('GMDH');
    expect(response.result.rSquared).toBeCloseTo(directResult.rSquared!, 4);
    expect(response.result.rmse).toBeCloseTo(directResult.rmse!, 4);
    expect(response.result.deployment.gmdh.layers.length).toBe(directResult.deployment.gmdh.layers.length);
  });

  it('computes Taguchi equivalence: direct fitTaguchi vs worker fitTaguchi', async () => {
    const directResult = fitTaguchi({ ...SAMPLE_TAGUCHI_DATA, objective: 'larger' });
    const request: DOEWorkerRequest = {
      requestId: 103,
      taskType: 'fitTaguchi',
      payload: { input: { ...SAMPLE_TAGUCHI_DATA, objective: 'larger' } },
    };

    const response = await handleDOEWorkerMessage(request);
    expect(response.ok).toBe(true);
    expect(response.result.modelType).toBe('Taguchi');
    expect(response.result.details.factorLevels.length).toBe(directResult.details.factorLevels.length);
  });

  it('computes 41x41 surface grid and matches reference calculations', async () => {
    const rsmResult = fitRSM(SAMPLE_RSM_DATA);
    const surfaceReq: SurfaceComputeRequest = {
      type: 'surface',
      data: SAMPLE_RSM_DATA.data,
      results: rsmResult,
      factors: { x: 0, y: 1 },
      headers: SAMPLE_RSM_DATA.headers,
      holdValues: [0, 0],
      modelType: 'RSM',
      gridRes: 40,
    };

    const request: DOEWorkerRequest<SurfaceComputeRequest> = {
      requestId: 104,
      taskType: 'computeSurface',
      payload: surfaceReq,
    };

    const response = await handleDOEWorkerMessage(request);
    expect(response.ok).toBe(true);
    expect(response.result.xRange.length).toBe(41);
    expect(response.result.yRange.length).toBe(41);
    expect(response.result.zGrid.length).toBe(41);
    expect(response.result.zGrid[0].length).toBe(41);
    // Center point check (0, 0) should equal Beta[0]
    const midIdx = 20; // 0 is in middle of [-1.414, 1.414]
    expect(response.result.zGrid[midIdx][midIdx]).toBeCloseTo(rsmResult.details.physicalCoefficients[0], 1);
  });

  it('handles cancellation of long-running surface calculation', async () => {
    const rsmResult = fitRSM(SAMPLE_RSM_DATA);
    const surfaceReq: SurfaceComputeRequest = {
      type: 'surface',
      data: SAMPLE_RSM_DATA.data,
      results: rsmResult,
      factors: { x: 0, y: 1 },
      headers: SAMPLE_RSM_DATA.headers,
      holdValues: [0, 0],
      modelType: 'RSM',
      gridRes: 100,
    };

    // Cancel request before execution
    await handleDOEWorkerMessage({
      requestId: 999,
      taskType: 'cancel',
      payload: { targetRequestId: 999 },
    });

    const runPromise = handleDOEWorkerMessage({
      requestId: 999,
      taskType: 'computeSurface',
      payload: surfaceReq,
    });

    await expect(runPromise).rejects.toThrow(/cancelled/i);
  });
});
