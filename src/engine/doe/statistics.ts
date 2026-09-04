import type {
  DOEModelResult,
  DOEDiagnostic,
  DOEDeploymentModel,
  RSMDeployment,
  GMDHDeployment,
  TaguchiDeployment,
  RSMTerm
} from './types';
import { GMDHEngine } from '../gmdh/gmdh_core/combi';

export interface DOEInputDataset {
  headers: string[];
  data: number[][];
}

export interface TaguchiOptions {
  objective?: 'larger' | 'smaller' | 'nominal' | 'target';
  targetValue?: number;
}

export interface GMDHOptions {
  polynomialOrder?: 2 | 3;
  maxLayers?: number;
  validationSplit?: number;
}

/**
 * Validates and normalizes input tabular dataset.
 */
export function normalizeInputDataset(
  input: DOEInputDataset
): { valid: boolean; diagnostics: DOEDiagnostic[]; headers: string[]; data: number[][] } {
  const diagnostics: DOEDiagnostic[] = [];

  if (!input || !Array.isArray(input.headers) || input.headers.length < 2) {
    diagnostics.push({
      code: 'INVALID_HEADERS',
      severity: 'error',
      message: 'At least 1 input factor and 1 response header are required.'
    });
    return { valid: false, diagnostics, headers: [], data: [] };
  }

  const seen = new Set<string>();
  for (const h of input.headers) {
    if (seen.has(h)) {
      diagnostics.push({
        code: 'DUPLICATE_HEADER',
        severity: 'error',
        message: `Duplicate header column name "${h}".`
      });
    }
    seen.add(h);
  }

  if (!input.data || !Array.isArray(input.data) || input.data.length === 0) {
    diagnostics.push({
      code: 'EMPTY_DATASET',
      severity: 'error',
      message: 'Dataset contains no rows.'
    });
    return { valid: false, diagnostics, headers: input.headers, data: [] };
  }

  const numCols = input.headers.length;
  for (let r = 0; r < input.data.length; r++) {
    const row = input.data[r];
    if (!Array.isArray(row) || row.length !== numCols) {
      diagnostics.push({
        code: 'RAGGED_ROW',
        severity: 'error',
        row: r + 1,
        message: `Row ${r + 1} has ${row ? row.length : 0} columns; expected ${numCols}.`
      });
      continue;
    }
    for (let c = 0; c < row.length; c++) {
      if (typeof row[c] !== 'number' || !Number.isFinite(row[c])) {
        diagnostics.push({
          code: 'NON_FINITE_INPUT',
          severity: 'error',
          row: r + 1,
          factor: input.headers[c],
          message: `Non-finite or non-numeric value in row ${r + 1}, column "${input.headers[c]}".`
        });
      }
    }
  }

  const hasErrors = diagnostics.some(d => d.severity === 'error');
  return { valid: !hasErrors, diagnostics, headers: input.headers, data: input.data };
}

/**
 * Solves standard ordinary least squares linear system (Z^T * Z) * Beta = Z^T * Y using LU/Gaussian elimination.
 */
function solveOLS(Z: number[][], Y: number[]): { beta: number[]; singular: boolean } {
  const n = Z.length;
  const p = Z[0].length;

  const A: number[][] = Array.from({ length: p }, () => new Array(p).fill(0));
  const b: number[] = new Array(p).fill(0);

  for (let i = 0; i < p; i++) {
    for (let j = 0; j < p; j++) {
      let sum = 0;
      for (let k = 0; k < n; k++) {
        sum += Z[k][i] * Z[k][j];
      }
      A[i][j] = sum;
    }
    let bSum = 0;
    for (let k = 0; k < n; k++) {
      bSum += Z[k][i] * Y[k];
    }
    b[i] = bSum;
  }

  for (let col = 0; col < p; col++) {
    let maxRow = col;
    let maxVal = Math.abs(A[col][col]);
    for (let r = col + 1; r < p; r++) {
      if (Math.abs(A[r][col]) > maxVal) {
        maxVal = Math.abs(A[r][col]);
        maxRow = r;
      }
    }

    if (maxVal < 1e-12) {
      return { beta: new Array(p).fill(0), singular: true };
    }

    if (maxRow !== col) {
      const tempRow = A[col];
      A[col] = A[maxRow];
      A[maxRow] = tempRow;
      const tempB = b[col];
      b[col] = b[maxRow];
      b[maxRow] = tempB;
    }

    const pivot = A[col][col];
    for (let r = col + 1; r < p; r++) {
      const factor = A[r][col] / pivot;
      for (let c = col; c < p; c++) {
        A[r][c] -= factor * A[col][c];
      }
      b[r] -= factor * b[col];
    }
  }

  const beta = new Array(p).fill(0);
  for (let r = p - 1; r >= 0; r--) {
    let sum = b[r];
    for (let c = r + 1; c < p; c++) {
      sum -= A[r][c] * beta[c];
    }
    beta[r] = sum / A[r][r];
  }

  return { beta, singular: false };
}

/**
 * Fits full quadratic Response Surface Methodology (RSM) model.
 */
export function fitRSM(input: DOEInputDataset): DOEModelResult {
  const norm = normalizeInputDataset(input);
  if (!norm.valid) {
    const factorNames = input.headers ? input.headers.slice(0, -1) : [];
    const responseName = input.headers && input.headers.length > 0 ? input.headers[input.headers.length - 1] : 'Response';
    return {
      modelType: 'RSM',
      factorNames,
      responseName,
      diagnostics: norm.diagnostics
    };
  }

  const { headers, data } = norm;
  const k = headers.length - 1;
  const factorNames = headers.slice(0, k);
  const responseName = headers[k];
  const n = data.length;

  const responses = data.map(r => r[k]);
  const meanY = responses.reduce((a, b) => a + b, 0) / n;
  const varianceY = responses.reduce((acc, y) => acc + Math.pow(y - meanY, 2), 0) / (n - 1 || 1);

  const diagnostics: DOEDiagnostic[] = [...norm.diagnostics];

  if (varianceY < 1e-12) {
    diagnostics.push({
      code: 'ZERO_VARIANCE_RESPONSE',
      severity: 'warning',
      message: 'Response variable has zero or near-zero variance.'
    });
  }

  const numTerms = 1 + 2 * k + (k * (k - 1)) / 2;
  if (n < numTerms) {
    diagnostics.push({
      code: 'INSUFFICIENT_DEGREES_OF_FREEDOM',
      severity: 'warning',
      message: `Number of points (${n}) is fewer than required parameters (${numTerms}). Residual degrees of freedom is zero or negative.`
    });
  }

  const factorStats = factorNames.map((_, i) => {
    const col = data.map(r => r[i]);
    return { min: Math.min(...col), max: Math.max(...col) };
  });

  const coding = factorStats.map(s => ({
    mid: (s.max + s.min) / 2,
    scale: (s.max - s.min) / 2 || 1
  }));

  const Z: number[][] = [];
  data.forEach(row => {
    const f = row.slice(0, k);
    const x = f.map((v, i) => (v - coding[i].mid) / coding[i].scale);
    const zRow = [1];
    for (let i = 0; i < k; i++) zRow.push(x[i]);
    for (let i = 0; i < k; i++) zRow.push(x[i] * x[i]);
    for (let i = 0; i < k; i++) {
      for (let j = i + 1; j < k; j++) zRow.push(x[i] * x[j]);
    }
    Z.push(zRow);
  });

  const { beta: Beta_coded, singular } = solveOLS(Z, responses);

  if (singular) {
    diagnostics.push({
      code: 'RANK_DEFICIENT',
      severity: 'error',
      message: 'Design matrix is rank-deficient or collinear. Coefficients cannot be uniquely estimated.'
    });
    return {
      modelType: 'RSM',
      factorNames,
      responseName,
      diagnostics
    };
  }

  const p_terms = numTerms - 1;
  const Beta: number[] = new Array(numTerms).fill(0);

  for (let i = 0; i < k; i++) {
    Beta[k + 1 + i] = Beta_coded[k + 1 + i] / (coding[i].scale ** 2);
  }

  let interIdx = 2 * k + 1;
  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      Beta[interIdx] = Beta_coded[interIdx] / (coding[i].scale * coding[j].scale);
      interIdx++;
    }
  }

  for (let i = 0; i < k; i++) {
    let val = Beta_coded[i + 1] / coding[i].scale;
    val -= 2 * Beta[k + 1 + i] * coding[i].mid;
    let itIdx = 2 * k + 1;
    for (let m = 0; m < k; m++) {
      for (let nIdx = m + 1; nIdx < k; nIdx++) {
        if (m === i) val -= Beta[itIdx] * coding[nIdx].mid;
        if (nIdx === i) val -= Beta[itIdx] * coding[m].mid;
        itIdx++;
      }
    }
    Beta[i + 1] = val;
  }

  let intercept = Beta_coded[0];
  for (let i = 0; i < k; i++) {
    intercept -= (Beta_coded[i + 1] / coding[i].scale) * coding[i].mid;
  }
  for (let i = 0; i < k; i++) {
    intercept += Beta[k + 1 + i] * (coding[i].mid ** 2);
  }
  let iIdx = 2 * k + 1;
  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      intercept += Beta[iIdx] * coding[i].mid * coding[j].mid;
      iIdx++;
    }
  }
  Beta[0] = intercept;

  const Y_pred = Z.map(row => {
    let sum = 0;
    for (let i = 0; i < Beta_coded.length; i++) sum += Beta_coded[i] * row[i];
    return sum;
  });

  const residuals = responses.map((y, i) => y - Y_pred[i]);
  const SSE = residuals.reduce((acc, r) => acc + r * r, 0);
  const SST = responses.reduce((acc, y) => acc + Math.pow(y - meanY, 2), 0);

  const df_total = n - 1;
  const df_model = p_terms;
  const df_error = Math.max(1, n - numTerms);

  const R2 = SST === 0 ? 1 : Math.max(0, 1 - SSE / SST);
  const R2Adj = df_error > 0 && df_total > 0 && SST > 0
    ? Math.max(0, 1 - (SSE / df_error) / (SST / df_total))
    : R2;
  const rmse = Math.sqrt(SSE / n);

  const MS_model = df_model > 0 ? (SST - SSE) / df_model : 0;
  const MS_error = df_error > 0 ? SSE / df_error : 1e-12;
  const F = MS_error > 0 ? MS_model / MS_error : 0;
  const P = fDistPValue(F, df_model, df_error);

  const terms: RSMTerm[] = [];
  for (let i = 0; i < k; i++) {
    terms.push({
      name: factorNames[i],
      factors: [i],
      powers: [1],
      coeff: Beta[i + 1]
    });
  }
  for (let i = 0; i < k; i++) {
    terms.push({
      name: `${factorNames[i]}²`,
      factors: [i],
      powers: [2],
      coeff: Beta[k + 1 + i]
    });
  }
  let crossIdx = 2 * k + 1;
  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      terms.push({
        name: `${factorNames[i]}·${factorNames[j]}`,
        factors: [i, j],
        powers: [1, 1],
        coeff: Beta[crossIdx]
      });
      crossIdx++;
    }
  }

  const factorRanges: Record<string, { min: number; max: number }> = {};
  factorNames.forEach((name, i) => {
    factorRanges[name] = factorStats[i];
  });

  const deployment: DOEDeploymentModel = {
    schemaVersion: 1,
    modelType: 'RSM',
    factorOrder: [...factorNames],
    responseName,
    trainingRowCount: n,
    metrics: {
      rSquared: R2,
      adjustedRSquared: R2Adj,
      rmse,
      fStatistic: F,
      pValue: P
    },
    factorRanges,
    rsm: {
      intercept: Beta[0],
      terms
    }
  };

  let eq = `Y = ${Beta[0].toFixed(4)}`;
  for (let i = 0; i < k; i++) eq += ` ${Beta[i + 1] >= 0 ? '+' : ''} ${Beta[i + 1].toFixed(4)}·${factorNames[i]}`;
  for (let i = 0; i < k; i++) eq += ` ${Beta[k + 1 + i] >= 0 ? '+' : ''} ${Beta[k + 1 + i].toFixed(4)}·${factorNames[i]}²`;
  let aIdx = 2 * k + 1;
  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      eq += ` ${Beta[aIdx] >= 0 ? '+' : ''} ${Beta[aIdx].toFixed(4)}·${factorNames[i]}·${factorNames[j]}`;
      aIdx++;
    }
  }

  return {
    modelType: 'RSM',
    factorNames,
    responseName,
    equation: eq,
    diagnostics,
    deployment,
    predictions: Y_pred,
    residuals,
    rSquared: R2,
    adjustedRSquared: R2Adj,
    rmse,
    fStatistic: F,
    pValue: P,
    details: {
      physicalCoefficients: Beta,
      codedCoefficients: Beta_coded,
      df_model,
      df_error,
      SSE,
      SST
    }
  };
}

/**
 * Fits Group Method of Data Handling (GMDH) Polynomial Network.
 */
export function fitGMDH(input: DOEInputDataset & GMDHOptions, options: GMDHOptions = {}): DOEModelResult {
  const norm = normalizeInputDataset(input);
  if (!norm.valid) {
    const factorNames = input.headers ? input.headers.slice(0, -1) : [];
    const responseName = input.headers && input.headers.length > 0 ? input.headers[input.headers.length - 1] : 'Response';
    return {
      modelType: 'GMDH',
      factorNames,
      responseName,
      diagnostics: norm.diagnostics
    };
  }

  const { headers, data } = norm;
  const k = headers.length - 1;
  const factorNames = headers.slice(0, k);
  const responseName = headers[k];
  const n = data.length;

  const polynomialOrder = options.polynomialOrder || input.polynomialOrder || 2;
  const maxLayers = options.maxLayers || input.maxLayers || 6;
  const validationSplit = options.validationSplit || input.validationSplit || 0.3;

  const engine = new GMDHEngine({
    algorithm: 'MIA',
    polynomialOrder,
    maxLayers,
    externalCriterion: 'RMSE',
    validationSplit
  });

  engine.train(data, headers);

  const Y = data.map(r => r[k]);
  const Y_pred = data.map(r => {
    try {
      return engine.predict(r.slice(0, k));
    } catch {
      return 0;
    }
  });

  const meanY = Y.reduce((a, b) => a + b, 0) / n;
  let SSE = 0, SST = 0;
  for (let i = 0; i < n; i++) {
    SSE += Math.pow(Y[i] - Y_pred[i], 2);
    SST += Math.pow(Y[i] - meanY, 2);
  }
  const R2 = SST === 0 ? 1 : Math.max(0, 1 - SSE / SST);
  const rmse = Math.sqrt(SSE / n);

  const layers = (engine.layers || []).map(layer =>
    layer.map(neuron => ({
      inputs: [neuron.inputs[0], neuron.inputs[1]] as [number, number],
      coeffs: [...neuron.coeffs]
    }))
  );

  const deployment: DOEDeploymentModel = {
    schemaVersion: 1,
    modelType: 'GMDH',
    factorOrder: [...factorNames],
    responseName,
    trainingRowCount: n,
    metrics: {
      rSquared: R2,
      rmse
    },
    gmdh: {
      polyOrder: polynomialOrder,
      layers
    }
  };

  const eq = engine.getEquation ? engine.getEquation() : 'GMDH Neural Model';

  return {
    modelType: 'GMDH',
    factorNames,
    responseName,
    equation: eq,
    diagnostics: [...norm.diagnostics],
    deployment,
    predictions: Y_pred,
    residuals: Y.map((y, i) => y - Y_pred[i]),
    rSquared: R2,
    rmse,
    details: {
      model: engine
    }
  };
}

/**
 * Fits Taguchi Orthogonal Array Model with SNR objectives and replicate handling.
 */
export function fitTaguchi(
  input: DOEInputDataset & TaguchiOptions,
  options: TaguchiOptions = {}
): DOEModelResult {
  const norm = normalizeInputDataset(input);
  if (!norm.valid) {
    const factorNames = input.headers ? input.headers.slice(0, -1) : [];
    const responseName = input.headers && input.headers.length > 0 ? input.headers[input.headers.length - 1] : 'Response';
    return {
      modelType: 'Taguchi',
      factorNames,
      responseName,
      diagnostics: norm.diagnostics
    };
  }

  const { headers, data } = norm;
  const k = headers.length - 1;
  const factorNames = headers.slice(0, k);
  const responseName = headers[k];
  const n = data.length;

  const objective = options.objective || input.objective || 'nominal';
  const targetValue = options.targetValue !== undefined
    ? options.targetValue
    : (input.targetValue !== undefined ? input.targetValue : 0);

  const trialsMap = new Map<string, number[]>();
  data.forEach(row => {
    const factorsKey = row.slice(0, k).join('|');
    if (!trialsMap.has(factorsKey)) trialsMap.set(factorsKey, []);
    trialsMap.get(factorsKey)!.push(row[k]);
  });

  const trials = Array.from(trialsMap.entries()).map(([key, vals]) => {
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const variance = vals.length > 1
      ? vals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (vals.length - 1)
      : 0;
    return {
      factors: key.split('|').map(Number),
      mean,
      variance,
      count: vals.length,
      responses: vals
    };
  });

  const snRatios = trials.map(t => {
    const count = t.count;
    const y = t.responses;
    if (objective === 'larger') {
      const sumSqInv = y.reduce((acc, val) => acc + 1 / (val * val + 1e-12), 0);
      return -10 * Math.log10(sumSqInv / count);
    } else if (objective === 'smaller') {
      const sumSq = y.reduce((acc, val) => acc + val * val, 0);
      return -10 * Math.log10(sumSq / count);
    } else if (objective === 'target') {
      const sumSqDev = y.reduce((acc, val) => acc + Math.pow(val - targetValue, 2), 0);
      return -10 * Math.log10((sumSqDev / count) + 1e-12);
    } else {
      // 'nominal'
      if (t.variance === 0) return 10 * Math.log10(Math.pow(t.mean, 2) / 1e-6);
      return 10 * Math.log10(Math.pow(t.mean, 2) / t.variance);
    }
  });

  const factorLevels = factorNames.map((fName, factorIdx) => {
    const levels = Array.from(new Set(trials.map(t => t.factors[factorIdx]))).sort((a, b) => a - b);
    const means = levels.map(lvl => {
      const matchingTrialsIndices = trials
        .map((t, i) => (t.factors[factorIdx] === lvl ? i : -1))
        .filter(idx => idx !== -1);
      const levelMeanY = matchingTrialsIndices.reduce((acc, idx) => acc + trials[idx].mean, 0) / matchingTrialsIndices.length;
      const meanSN = matchingTrialsIndices.reduce((acc, idx) => acc + snRatios[idx], 0) / matchingTrialsIndices.length;
      return { level: lvl, meanY: levelMeanY, snr: meanSN };
    });
    const deltaSN = Math.max(...means.map(m => m.snr)) - Math.min(...means.map(m => m.snr));
    const deltaY = Math.max(...means.map(m => m.meanY)) - Math.min(...means.map(m => m.meanY));
    return {
      factorName: fName,
      levels,
      means,
      delta: deltaSN,
      deltaY
    };
  });

  const grandMeanY = trials.reduce((a, t) => a + t.mean, 0) / trials.length;
  const grandMeanSN = snRatios.reduce((a, b) => a + b, 0) / snRatios.length;

  const Y_all = data.map(r => r[k]);
  const fits = data.map(row => {
    let pred = grandMeanY;
    factorLevels.forEach((fl, fIdx) => {
      const val = row[fIdx];
      const sorted = [...fl.means].sort((a, b) => Math.abs(a.level - val) - Math.abs(b.level - val));
      const nearest = sorted[0];
      if (nearest) pred += (nearest.meanY - grandMeanY);
    });
    return pred;
  });

  const SSE = Y_all.reduce((acc, y, i) => acc + Math.pow(y - fits[i], 2), 0);
  const SST = Y_all.reduce((acc, y) => acc + Math.pow(y - grandMeanY, 2), 0);
  const R2 = SST === 0 ? 1 : Math.max(0, 1 - SSE / SST);
  const rmse = Math.sqrt(SSE / n);

  const deployment: DOEDeploymentModel = {
    schemaVersion: 1,
    modelType: 'Taguchi',
    factorOrder: [...factorNames],
    responseName,
    trainingRowCount: n,
    metrics: {
      rSquared: R2,
      rmse,
      grandMean: grandMeanY
    },
    taguchi: {
      grandMean: grandMeanY,
      objective,
      targetValue,
      factorLevels: factorLevels.map(fl => ({
        factorName: fl.factorName,
        levels: fl.means.map(m => ({
          level: m.level,
          meanY: m.meanY,
          snr: m.snr
        }))
      }))
    }
  };

  return {
    modelType: 'Taguchi',
    factorNames,
    responseName,
    equation: `Taguchi Model (R² = ${(R2 * 100).toFixed(2)}%, Objective: ${objective})`,
    diagnostics: [...norm.diagnostics],
    deployment,
    predictions: fits,
    residuals: Y_all.map((y, i) => y - fits[i]),
    rSquared: R2,
    rmse,
    details: {
      snRatios,
      factorLevels,
      grandMeanY,
      grandMeanSN,
      objective,
      targetValue
    }
  };
}

/**
 * Continued fraction evaluation for incomplete beta (Numerical Recipes betacf).
 */
function betacf(a: number, b: number, x: number): number {
  const MAXIT = 200;
  const EPS = 1e-12;
  const FPMIN = 1e-30;
  const qab = a + b;
  const qap = a + 1.0;
  const qam = a - 1.0;
  let c = 1.0;
  let d = 1.0 - qab * x / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1.0 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1.0 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1.0 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1.0 / d;
    h *= d * c;

    aa = -((a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1.0 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1.0 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1.0 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1.0) < EPS) break;
  }
  return h;
}

function lnGamma(z: number): number {
  const c = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.001208650973866179, -0.000005395239384953
  ];
  let x = z;
  let y = z;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j <= 5; j++) ser += c[j] / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

function incBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lbeta = lnGamma(a) + lnGamma(b) - lnGamma(a + b);
  const bt = Math.exp(a * Math.log(x) + b * Math.log(1 - x) - lbeta);
  if (x < (a + 1) / (a + b + 2)) {
    return (bt * betacf(a, b, x)) / a;
  } else {
    return 1 - (bt * betacf(b, a, 1 - x)) / b;
  }
}

/**
 * Calculates survival probability P(F' > F) for Snedecor's F-distribution.
 */
export function fDistPValue(F: number, df1: number, df2: number): number {
  if (F <= 0 || df1 <= 0 || df2 <= 0 || !Number.isFinite(F)) return 1.0;
  const x = df2 / (df2 + df1 * F);
  return incBeta(x, df2 / 2, df1 / 2);
}

/**
 * Two-tailed critical t-value approximation for degrees of freedom df and significance alpha.
 */
export function tDistCritical(df: number, alpha: number = 0.05): number {
  if (df <= 0) return 1.96;
  const p = 1 - alpha / 2;
  const t = Math.sqrt(-2 * Math.log(1 - p));
  const c0 = 2.515517;
  const c1 = 0.802853;
  const c2 = 0.010328;
  const d1 = 1.432788;
  const d2 = 0.189269;
  const d3 = 0.001308;
  const z = t - (c0 + c1 * t + c2 * t * t) / (1 + d1 * t + d2 * t * t + d3 * t * t * t);

  const z2 = z * z;
  const z3 = z2 * z;
  const z5 = z3 * z2;
  return z + (z3 + z) / (4 * df) + (5 * z5 + 16 * z3 + 3 * z) / (96 * df * df);
}
