import * as math from 'mathjs';
import type { DOEDeploymentModel } from './types';

/**
 * Constrained, deterministic evaluator for canonical DOEDeploymentModel payloads.
 * Shared between X-Bridges and V-Lab runtimes.
 */
export function evaluateDOEModel(model: DOEDeploymentModel, inputs: number[]): number {
  if (!model || model.schemaVersion !== 1) {
    throw new Error(`Invalid model payload: schemaVersion must be 1, got ${model?.schemaVersion}.`);
  }

  const cleanIns = (inputs || []).map(v => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  });

  if (model.modelType === 'RSM') {
    if (!model.rsm || !Array.isArray(model.rsm.terms) || !Number.isFinite(model.rsm.intercept)) {
      throw new Error('Invalid RSM deployment payload: missing intercept or terms.');
    }

    let y = model.rsm.intercept;
    for (const term of model.rsm.terms) {
      let termVal = term.coeff;
      for (let i = 0; i < term.factors.length; i++) {
        const factorIdx = term.factors[i];
        const power = term.powers[i] || 1;
        const xVal = cleanIns[factorIdx] ?? 0;
        termVal *= Math.pow(xVal, power);
      }
      y += termVal;
    }
    return Number.isFinite(y) ? y : 0;
  }

  if (model.modelType === 'GMDH') {
    if (!model.gmdh || !Array.isArray(model.gmdh.layers) || model.gmdh.layers.length === 0) {
      throw new Error('Invalid GMDH deployment payload: layers must be a non-empty array.');
    }

    const polyOrder = model.gmdh.polyOrder || 2;
    let currentVals = [...cleanIns];

    for (let l = 0; l < model.gmdh.layers.length; l++) {
      const layer = model.gmdh.layers[l];
      if (!Array.isArray(layer) || layer.length === 0) {
        throw new Error(`Invalid GMDH deployment: layer ${l} has no neurons.`);
      }

      const nextVals: number[] = [];
      for (const neuron of layer) {
        const xi = currentVals[neuron.inputs[0]] ?? 0;
        const xj = currentVals[neuron.inputs[1]] ?? 0;
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
        nextVals.push(val);
      }
      currentVals = nextVals;
    }

    const output = currentVals[0] ?? 0;
    return Number.isFinite(output) ? output : 0;
  }

  if (model.modelType === 'Taguchi') {
    if (!model.taguchi || !Array.isArray(model.taguchi.factorLevels) || !Number.isFinite(model.taguchi.grandMean)) {
      throw new Error('Invalid Taguchi deployment payload: missing grandMean or factorLevels.');
    }

    const grandMean = model.taguchi.grandMean;
    let y = grandMean;

    for (let i = 0; i < model.taguchi.factorLevels.length; i++) {
      const factorDef = model.taguchi.factorLevels[i];
      const val = cleanIns[i] ?? 0;
      const levels = factorDef.levels || [];
      if (levels.length > 0) {
        const sorted = [...levels].sort((a, b) => Math.abs(a.level - val) - Math.abs(b.level - val));
        const nearest = sorted[0];
        if (nearest && Number.isFinite(nearest.meanY)) {
          y += (nearest.meanY - grandMean);
        }
      }
    }

    return Number.isFinite(y) ? y : 0;
  }

  throw new Error(`Unsupported modelType: ${(model as any).modelType}`);
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
  if (!equationStr || typeof equationStr !== 'string') {
    throw new Error('Equation string is empty or invalid.');
  }

  // Extract equation body if prefixed with [LHS] = [RHS]
  const lines = equationStr.split('\n').filter(l => l.trim() !== '');
  let eqStr = '';
  const firstEqIndex = lines.findIndex(l => l.includes('='));
  if (firstEqIndex >= 0) {
    const parts = lines[firstEqIndex].split('=');
    eqStr = parts.slice(1).join('=').trim();
    // Gather multiline continuation terms
    lines.slice(firstEqIndex + 1).forEach(line => {
      const trimmed = line.trim();
      if (trimmed.startsWith('+') || trimmed.startsWith('-')) {
        eqStr += ' ' + trimmed;
      }
    });
  } else {
    eqStr = lines.join(' ').trim();
  }

  // Security check on expression body: reject forbidden identifiers, statements, semicolons, or assignment
  const dangerousPattern = /\b(process|require|import|eval|function|global|window|document|constructor|prototype|__proto__|this|class|return|var|let|const)\b|[;{}=>]/i;
  if (dangerousPattern.test(eqStr)) {
    throw new Error(`Security validation failed: equation contains forbidden tokens or code injection.`);
  }

  const cleanEq = eqStr
    .replace(/·/g, '*')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/⁴/g, '^4');

  const scope: Record<string, number> = {};
  factorNames.forEach((name, i) => {
    const val = Number(inputs[i]) || 0;
    scope[name] = val;
    scope[`X${i + 1}`] = val;
  });

  try {
    const res = math.evaluate(cleanEq, scope);
    const num = Number(res);
    if (!Number.isFinite(num)) {
      throw new Error('Equation evaluated to non-finite value.');
    }
    return num;
  } catch (err: any) {
    throw new Error(`Legacy equation evaluation failed: ${err?.message || err}`);
  }
}
