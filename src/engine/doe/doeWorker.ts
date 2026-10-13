import { fitRSM, fitGMDH, fitTaguchi } from './statistics';
import { evaluateDOEModelDetailed } from './modelEvaluator';
import type {
  DOEWorkerRequest,
  DOEWorkerResponse,
  SurfaceComputeRequest,
  SurfaceComputeResult,
} from './doeWorkerProtocol';

const cancelledRequestIds = new Set<number>();

export function evaluateSurfaceGrid(
  req: SurfaceComputeRequest,
  onProgress?: (progress: number) => void,
  checkCancelled?: () => boolean,
): SurfaceComputeResult {
  const {
    data,
    results,
    factors,
    headers,
    holdValues,
    modelType = 'RSM',
    gridRes = 40,
  } = req;

  const idxX = factors.x;
  const idxY = factors.y;

  const xVals = data.map((r) => r[idxX] ?? 0);
  const yVals = data.map((r) => r[idxY] ?? 0);
  let minX = Math.min(...xVals);
  let maxX = Math.max(...xVals);
  let minY = Math.min(...yVals);
  let maxY = Math.max(...yVals);

  if (minX === maxX) {
    minX -= 1;
    maxX += 1;
  }
  if (minY === maxY) {
    minY -= 1;
    maxY += 1;
  }

  const stepX = (maxX - minX) / gridRes;
  const stepY = (maxY - minY) / gridRes;
  const xRange = Array.from({ length: gridRes + 1 }, (_, i) => minX + i * stepX);
  const yRange = Array.from({ length: gridRes + 1 }, (_, i) => minY + i * stepY);

  const resolvedModelType = modelType || results?.modelType || results?.type || 'RSM';
  const gmdhModel = results?.details?.model || results?.model;
  const gmdhDeployment =
    (results?.deployment?.modelType === 'GMDH' ? results.deployment : null) ||
    (results?.canonicalResult?.deployment?.modelType === 'GMDH' ? results.canonicalResult.deployment : null);

  const k = headers.length - 1;
  const zGrid: number[][] = [];
  const beta = results?.details?.physicalCoefficients || results?.details?.Beta || results?.Beta;

  for (let j = 0; j < yRange.length; j++) {
    if (checkCancelled && checkCancelled()) {
      throw new Error('Surface computation cancelled');
    }

    const rowZ: number[] = [];
    for (let i = 0; i < xRange.length; i++) {
      const currentFactors = [...holdValues];
      while (currentFactors.length < k) currentFactors.push(0);
      currentFactors[idxX] = xRange[i];
      currentFactors[idxY] = yRange[j];

      let z = NaN;
      if (resolvedModelType === 'RSM' && beta) {
        let val = beta[0];
        for (let f = 0; f < k; f++) val += (beta[f + 1] || 0) * currentFactors[f];
        for (let f = 0; f < k; f++) val += (beta[k + 1 + f] || 0) * currentFactors[f] * currentFactors[f];
        let idx = 2 * k + 1;
        for (let f = 0; f < k; f++) {
          for (let g = f + 1; g < k; g++) {
            val += (beta[idx] || 0) * currentFactors[f] * currentFactors[g];
            idx++;
          }
        }
        z = val;
      } else if (resolvedModelType === 'GMDH') {
        if (gmdhModel && typeof gmdhModel.predict === 'function') {
          try {
            const pred = gmdhModel.predict(currentFactors.slice(0, k));
            z = Number.isFinite(pred) ? pred : NaN;
          } catch {
            z = NaN;
          }
        } else if (gmdhDeployment) {
          const evalRes = evaluateDOEModelDetailed(gmdhDeployment, currentFactors.slice(0, k));
          z = evalRes.success && Number.isFinite(evalRes.value) ? evalRes.value : NaN;
        } else if (gmdhModel && Array.isArray(gmdhModel.layers)) {
          // Fallback evaluation from raw layers if predict is not a function
          let currentVals = [...currentFactors.slice(0, k)];
          for (const layer of gmdhModel.layers) {
            currentVals = layer.map((neuron: any) => {
              const xi = currentVals[neuron.inputs[0]];
              const xj = currentVals[neuron.inputs[1]];
              const c = neuron.coeffs;
              return c[0] + c[1] * xi + c[2] * xj + c[3] * xi * xi + c[4] * xj * xj + c[5] * xi * xj;
            });
          }
          z = Number.isFinite(currentVals[0]) ? currentVals[0] : NaN;
        }
      } else if (resolvedModelType === 'Taguchi') {
        const factorLevels = results?.details?.factorLevels || results?.factorLevels || [];
        const grandMean = results?.details?.grandMeanY ?? results?.grandMean ?? 0;
        let val = grandMean;
        factorLevels.forEach((fl: any, fIdx: number) => {
          const curVal = currentFactors[fIdx];
          if (fl.means && fl.means.length > 0) {
            const sorted = [...fl.means].sort(
              (a: any, b: any) => Math.abs(a.level - curVal) - Math.abs(b.level - curVal),
            );
            if (sorted[0]) val += sorted[0].meanY - grandMean;
          }
        });
        z = val;
      }
      rowZ.push(Number.isFinite(z) ? z : NaN);
    }
    zGrid.push(rowZ);

    if (onProgress && j % 5 === 0) {
      onProgress((j + 1) / yRange.length);
    }
  }

  if (onProgress) {
    onProgress(1.0);
  }

  return { xRange, yRange, zGrid };
}

function sanitizeGmdhModel(result: any) {
  if (result?.modelType === 'GMDH' && result.details?.model) {
    const rawModel = result.details.model;
    result.details.model = {
      layers: rawModel.layers ? JSON.parse(JSON.stringify(rawModel.layers)) : [],
      config: rawModel.config ? JSON.parse(JSON.stringify(rawModel.config)) : {},
      inputNames: rawModel.inputNames ? [...rawModel.inputNames] : [],
    };
  }
  return result;
}

export async function handleDOEWorkerMessage(
  request: DOEWorkerRequest,
  postProgress?: (progress: number) => void,
): Promise<DOEWorkerResponse> {
  const { requestId, taskType, payload } = request;

  if (taskType === 'cancel') {
    const targetId = payload?.targetRequestId ?? requestId;
    cancelledRequestIds.add(targetId);
    return {
      requestId,
      taskType: 'cancel',
      ok: true,
      result: { cancelledId: targetId },
    };
  }

  if (cancelledRequestIds.has(requestId)) {
    cancelledRequestIds.delete(requestId);
    throw new Error(`Request ${requestId} was cancelled`);
  }

  try {
    let result: any;
    switch (taskType) {
      case 'fitRSM':
        result = fitRSM(payload.input);
        break;
      case 'fitGMDH':
        result = sanitizeGmdhModel(fitGMDH(payload.input, payload.options));
        break;
      case 'fitTaguchi':
        result = fitTaguchi(payload.input, payload.options);
        break;
      case 'computeSurface':
        result = evaluateSurfaceGrid(
          payload,
          postProgress,
          () => cancelledRequestIds.has(requestId),
        );
        break;
      default:
        throw new Error(`Unknown task type: ${taskType}`);
    }

    if (cancelledRequestIds.has(requestId)) {
      cancelledRequestIds.delete(requestId);
      throw new Error(`Request ${requestId} was cancelled`);
    }

    return {
      requestId,
      taskType,
      ok: true,
      result,
    };
  } catch (error: any) {
    if (cancelledRequestIds.has(requestId)) {
      cancelledRequestIds.delete(requestId);
    }
    throw error;
  }
}

// In Worker runtime, register message listener
if (typeof self !== 'undefined' && typeof (self as any).postMessage === 'function' && typeof window === 'undefined') {
  self.onmessage = async (event: MessageEvent<DOEWorkerRequest>) => {
    const request = event.data;
    if (!request || typeof request.requestId !== 'number') return;

    try {
      const response = await handleDOEWorkerMessage(request, (progress) => {
        (self as any).postMessage({
          requestId: request.requestId,
          taskType: request.taskType,
          ok: true,
          progress,
        });
      });
      (self as any).postMessage(response);
    } catch (err: any) {
      (self as any).postMessage({
        requestId: request.requestId,
        taskType: request.taskType,
        ok: false,
        error: {
          message: err?.message || 'DOE Worker computation error',
          stack: err?.stack,
        },
      });
    }
  };
}
