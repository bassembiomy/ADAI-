import * as math from 'mathjs';
import type { DOEDeploymentModel, DOEDiagnostic } from './types';

export interface DOEExecutionResult {
  value: number;
  success: boolean;
  diagnostic?: DOEDiagnostic;
}

/**
 * Evaluates a canonical DOEDeploymentModel with detailed execution result and structured diagnostics.
 * Shared between X-Bridges and V-Lab runtimes.
 * Non-finite inputs are never silently substituted.
 */
export function evaluateDOEModelDetailed(
  model: DOEDeploymentModel | unknown,
  inputs: number[]
): DOEExecutionResult {
  if (!model || typeof model !== 'object') {
    return {
      value: NaN,
      success: false,
      diagnostic: {
        code: 'MISSING_MODEL_PAYLOAD',
        severity: 'error',
        message: 'DOE deployment model payload is missing or not an object.'
      }
    };
  }

  const m = model as Partial<DOEDeploymentModel>;
  if (m.schemaVersion !== 1) {
    return {
      value: NaN,
      success: false,
      diagnostic: {
        code: 'UNSUPPORTED_SCHEMA_VERSION',
        severity: 'error',
        message: `Invalid schemaVersion: expected 1, received ${m.schemaVersion}.`
      }
    };
  }

  if (!Array.isArray(m.factorOrder) || m.factorOrder.length === 0) {
    return {
      value: NaN,
      success: false,
      diagnostic: {
        code: 'INVALID_FACTOR_ORDER',
        severity: 'error',
        message: 'DOE deployment model has missing or empty factorOrder.'
      }
    };
  }

  const factorCount = m.factorOrder.length;
  if (!Array.isArray(inputs) || inputs.length < factorCount) {
    return {
      value: NaN,
      success: false,
      diagnostic: {
        code: 'INSUFFICIENT_INPUTS',
        severity: 'error',
        message: `Model expects ${factorCount} input ports (${m.factorOrder.join(', ')}), but received ${inputs?.length ?? 0}.`
      }
    };
  }

  // Strict check: non-finite inputs must not be silently converted to 0
  const cleanIns: number[] = [];
  for (let i = 0; i < factorCount; i++) {
    const raw = inputs[i];
    const n = Number(raw);
    if (typeof raw !== 'number' && typeof raw !== 'string') {
      return {
        value: NaN,
        success: false,
        diagnostic: {
          code: 'NON_NUMERIC_INPUT',
          severity: 'error',
          factor: m.factorOrder[i],
          message: `Input for factor "${m.factorOrder[i]}" (port ${i + 1}) is not a number: ${raw}.`
        }
      };
    }
    if (!Number.isFinite(n)) {
      return {
        value: NaN,
        success: false,
        diagnostic: {
          code: 'NON_FINITE_INPUT',
          severity: 'error',
          factor: m.factorOrder[i],
          message: `Non-finite runtime input (${n}) for factor "${m.factorOrder[i]}" (port ${i + 1}). Non-finite inputs cannot be evaluated.`
        }
      };
    }
    cleanIns.push(n);
  }

  if (m.modelType === 'RSM') {
    if (!m.rsm || !Array.isArray(m.rsm.terms) || !Number.isFinite(m.rsm.intercept)) {
      return {
        value: NaN,
        success: false,
        diagnostic: {
          code: 'INVALID_RSM_PAYLOAD',
          severity: 'error',
          message: 'Invalid RSM deployment payload: missing intercept or terms.'
        }
      };
    }

    let y = m.rsm.intercept;
    for (const term of m.rsm.terms) {
      let termVal = term.coeff;
      for (let i = 0; i < term.factors.length; i++) {
        const factorIdx = term.factors[i];
        if (factorIdx < 0 || factorIdx >= factorCount) {
          return {
            value: NaN,
            success: false,
            diagnostic: {
              code: 'INVALID_FACTOR_INDEX',
              severity: 'error',
              message: `RSM term "${term.name}" references out-of-bounds factor index ${factorIdx}.`
            }
          };
        }
        const power = term.powers[i] || 1;
        const xVal = cleanIns[factorIdx];
        termVal *= Math.pow(xVal, power);
      }
      y += termVal;
    }

    if (!Number.isFinite(y)) {
      return {
        value: NaN,
        success: false,
        diagnostic: {
          code: 'NUMERICAL_OVERFLOW',
          severity: 'error',
          message: 'RSM polynomial evaluation produced a non-finite numerical result.'
        }
      };
    }

    return { value: y, success: true };
  }

  if (m.modelType === 'GMDH') {
    if (!m.gmdh || !Array.isArray(m.gmdh.layers) || m.gmdh.layers.length === 0) {
      return {
        value: NaN,
        success: false,
        diagnostic: {
          code: 'INVALID_GMDH_PAYLOAD',
          severity: 'error',
          message: 'Invalid GMDH deployment payload: layers must be a non-empty array.'
        }
      };
    }

    const polyOrder = m.gmdh.polyOrder || 2;
    let currentVals = [...cleanIns];

    for (let l = 0; l < m.gmdh.layers.length; l++) {
      const layer = m.gmdh.layers[l];
      if (!Array.isArray(layer) || layer.length === 0) {
        return {
          value: NaN,
          success: false,
          diagnostic: {
            code: 'EMPTY_GMDH_LAYER',
            severity: 'error',
            message: `Invalid GMDH deployment: layer ${l} has no neurons.`
          }
        };
      }

      const nextVals: number[] = [];
      for (let nIdx = 0; nIdx < layer.length; nIdx++) {
        const neuron = layer[nIdx];
        if (!neuron || !Array.isArray(neuron.inputs) || neuron.inputs.length !== 2) {
          return {
            value: NaN,
            success: false,
            diagnostic: {
              code: 'INVALID_NEURON_STRUCTURE',
              severity: 'error',
              message: `GMDH layer ${l} neuron ${nIdx} must have exactly 2 inputs.`
            }
          };
        }

        const idxA = neuron.inputs[0];
        const idxB = neuron.inputs[1];
        if (idxA < 0 || idxA >= currentVals.length || idxB < 0 || idxB >= currentVals.length) {
          return {
            value: NaN,
            success: false,
            diagnostic: {
              code: 'INVALID_NEURON_INPUT',
              severity: 'error',
              message: `GMDH layer ${l} neuron ${nIdx} input index out of bounds.`
            }
          };
        }

        const xi = currentVals[idxA];
        const xj = currentVals[idxB];
        let features: number[];
        if (polyOrder === 3) {
          features = [1, xi, xj, xi * xi, xj * xj, xi * xj, xi * xi * xi, xj * xj * xj, xi * xi * xj, xi * xj * xj];
        } else {
          features = [1, xi, xj, xi * xi, xj * xj, xi * xj];
        }
        const coeffs = neuron.coeffs || [];
        let val = 0;
        for (let c = 0; c < features.length; c++) {
          val += features[c] * (coeffs[c] || 0);
        }

        if (!Number.isFinite(val)) {
          return {
            value: NaN,
            success: false,
            diagnostic: {
              code: 'NUMERICAL_OVERFLOW',
              severity: 'error',
              message: `GMDH layer ${l} neuron ${nIdx} evaluation produced a non-finite value.`
            }
          };
        }

        nextVals.push(val);
      }
      currentVals = nextVals;
    }

    const output = currentVals[0];
    if (!Number.isFinite(output)) {
      return {
        value: NaN,
        success: false,
        diagnostic: {
          code: 'NUMERICAL_OVERFLOW',
          severity: 'error',
          message: 'GMDH model evaluation produced a non-finite value.'
        }
      };
    }
    return { value: output, success: true };
  }

  if (m.modelType === 'Taguchi') {
    if (!m.taguchi || !Array.isArray(m.taguchi.factorLevels) || !Number.isFinite(m.taguchi.grandMean)) {
      return {
        value: NaN,
        success: false,
        diagnostic: {
          code: 'INVALID_TAGUCHI_PAYLOAD',
          severity: 'error',
          message: 'Invalid Taguchi deployment payload: missing grandMean or factorLevels.'
        }
      };
    }

    if (m.taguchi.factorLevels.length !== factorCount) {
      return {
        value: NaN,
        success: false,
        diagnostic: {
          code: 'FACTOR_LEVEL_COUNT_MISMATCH',
          severity: 'error',
          message: `Taguchi factorLevels length (${m.taguchi.factorLevels.length}) does not match factorCount (${factorCount}).`
        }
      };
    }

    const grandMean = m.taguchi.grandMean;
    let y = grandMean;

    for (let i = 0; i < m.taguchi.factorLevels.length; i++) {
      const factorDef = m.taguchi.factorLevels[i];
      const val = cleanIns[i];
      const levels = factorDef.levels || [];
      if (levels.length === 0) {
        return {
          value: NaN,
          success: false,
          diagnostic: {
            code: 'EMPTY_FACTOR_LEVELS',
            severity: 'error',
            factor: factorDef.factorName,
            message: `Taguchi factor "${factorDef.factorName}" has no level statistics.`
          }
        };
      }
      const sorted = [...levels].sort((a, b) => Math.abs(a.level - val) - Math.abs(b.level - val));
      const nearest = sorted[0];
      if (!nearest || !Number.isFinite(nearest.meanY)) {
        return {
          value: NaN,
          success: false,
          diagnostic: {
            code: 'NON_FINITE_LEVEL_STATISTIC',
            severity: 'error',
            factor: factorDef.factorName,
            message: `Taguchi factor "${factorDef.factorName}" nearest level has invalid meanY.`
          }
        };
      }
      y += (nearest.meanY - grandMean);
    }

    if (!Number.isFinite(y)) {
      return {
        value: NaN,
        success: false,
        diagnostic: {
          code: 'NUMERICAL_OVERFLOW',
          severity: 'error',
          message: 'Taguchi additive model evaluation produced a non-finite value.'
        }
      };
    }

    return { value: y, success: true };
  }

  return {
    value: NaN,
    success: false,
    diagnostic: {
      code: 'UNSUPPORTED_MODEL_TYPE',
      severity: 'error',
      message: `Unsupported modelType: ${(m as any).modelType}.`
    }
  };
}

/**
 * Constrained, deterministic evaluator for canonical DOEDeploymentModel payloads.
 * Shared between X-Bridges and V-Lab runtimes. Throws typed Error on failure.
 */
export function evaluateDOEModel(model: DOEDeploymentModel, inputs: number[]): number {
  const res = evaluateDOEModelDetailed(model, inputs);
  if (!res.success) {
    throw new Error(res.diagnostic?.message || 'DOE model evaluation failed.');
  }
  return res.value;
}

/**
 * Detailed legacy fallback parser for projects saved with raw equation text.
 * Strictly blocks malicious identifiers, globals, function calls, and statement injection.
 */
export function evaluateLegacyDOEEquationDetailed(
  equationStr: string,
  factorNames: string[],
  inputs: number[]
): DOEExecutionResult {
  if (!equationStr || typeof equationStr !== 'string') {
    return {
      value: NaN,
      success: false,
      diagnostic: {
        code: 'INVALID_EQUATION_STRING',
        severity: 'error',
        message: 'Equation string is empty or invalid.'
      }
    };
  }

  // Check inputs for non-finite values
  for (let i = 0; i < factorNames.length; i++) {
    const raw = inputs[i];
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      return {
        value: NaN,
        success: false,
        diagnostic: {
          code: 'NON_FINITE_INPUT',
          severity: 'error',
          factor: factorNames[i],
          message: `Non-finite runtime input (${n}) for factor "${factorNames[i]}". Non-finite inputs cannot be evaluated.`
        }
      };
    }
  }

  // Extract equation body if prefixed with [LHS] = [RHS]
  const lines = equationStr.split('\n').filter(l => l.trim() !== '');
  let eqStr = '';
  const firstEqIndex = lines.findIndex(l => l.includes('='));
  if (firstEqIndex >= 0) {
    const parts = lines[firstEqIndex].split('=');
    eqStr = parts.slice(1).join('=').trim();
    lines.slice(firstEqIndex + 1).forEach(line => {
      const trimmed = line.trim();
      if (trimmed.startsWith('+') || trimmed.startsWith('-')) {
        eqStr += ' ' + trimmed;
      }
    });
  } else {
    eqStr = lines.join(' ').trim();
  }

  // Security check on expression body
  const dangerousPattern = /\b(process|require|import|eval|function|global|window|document|constructor|prototype|__proto__|this|class|return|var|let|const)\b|[;{}=>]/i;
  if (dangerousPattern.test(eqStr)) {
    return {
      value: NaN,
      success: false,
      diagnostic: {
        code: 'SECURITY_VALIDATION_FAILED',
        severity: 'error',
        message: 'Security validation failed: equation contains forbidden tokens or code injection.'
      }
    };
  }

  const cleanEq = eqStr
    .replace(/·/g, '*')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/⁴/g, '^4');

  const scope: Record<string, number> = {};
  factorNames.forEach((name, i) => {
    const val = Number(inputs[i]);
    scope[name] = val;
    scope[`X${i + 1}`] = val;
  });

  try {
    const res = math.evaluate(cleanEq, scope);
    const num = Number(res);
    if (!Number.isFinite(num)) {
      return {
        value: NaN,
        success: false,
        diagnostic: {
          code: 'NUMERICAL_OVERFLOW',
          severity: 'error',
          message: 'Legacy equation evaluated to non-finite value.'
        }
      };
    }
    return { value: num, success: true };
  } catch (err: any) {
    return {
      value: NaN,
      success: false,
      diagnostic: {
        code: 'EQUATION_PARSE_ERROR',
        severity: 'error',
        message: `Legacy equation evaluation failed: ${err?.message || err}`
      }
    };
  }
}

/**
 * Validated legacy fallback parser for projects saved with raw equation text.
 * Strictly blocks malicious identifiers, globals, function calls, and statement injection.
 */
export function evaluateLegacyDOEEquation(
  equationStr: string,
  factorNames: string[],
  inputs: number[]
): number {
  const res = evaluateLegacyDOEEquationDetailed(equationStr, factorNames, inputs);
  if (!res.success) {
    throw new Error(res.diagnostic?.message || 'Legacy equation evaluation failed.');
  }
  return res.value;
}
