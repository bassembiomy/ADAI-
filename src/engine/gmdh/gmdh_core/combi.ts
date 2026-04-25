// src/engine/gmdh/gmdh_core/combi.ts

import * as math from 'mathjs';
import { GMDHConfig, GMDHNeuron, PolynomialModel } from './types';

export function solveLeastSquares(X: number[][], Y: number[]): number[] {
  try {
    const xMat = math.matrix(X);
    const yMat = math.matrix(Y);
    const xT = math.transpose(xMat);
    const xTx = math.multiply(xT, xMat);
    const xTy = math.multiply(xT, yMat);
    
    // Ridge regression fallback for singular matrices
    try {
      const coeffs = math.lusolve(xTx, xTy);
      return (coeffs as any).toArray().map((r: any) => r[0]);
    } catch (e) {
      const lambda = 1e-6;
      const identity = math.identity(X[0].length);
      const penalty = math.multiply(lambda, identity);
      const xTx_ridge = math.add(xTx, penalty) as math.Matrix;
      const coeffs = math.lusolve(xTx_ridge, xTy);
      return (coeffs as any).toArray().map((r: any) => r[0]);
    }
  } catch (e) {
    console.error("GMDH Solve Error:", e);
    return new Array(X[0].length).fill(0);
  }
}

export class GMDHEngine implements PolynomialModel {
  layers: GMDHNeuron[][] = [];
  inputNames: string[] = [];

  constructor(public config: GMDHConfig) {}

  private calculateMetrics(predictions: number[], actuals: number[], k: number): { rmse: number; aic: number } {
    const n = predictions.length;
    let sse = 0;
    for (let i = 0; i < n; i++) {
      sse += Math.pow(predictions[i] - actuals[i], 2);
    }
    const rmse = Math.sqrt(sse / n);
    const aic = n * Math.log(sse / n + 1e-10) + 2 * k;
    return { rmse, aic };
  }

  train(data: number[][], headers: string[]) {
    this.inputNames = headers.slice(0, -1);
    const n = data.length;
    const k = data[0].length - 1;

    const testSize = Math.floor(n * this.config.validationSplit);
    const shuffled = [...data].sort(() => Math.random() - 0.5);
    const validationData = shuffled.slice(0, testSize);
    const trainData = shuffled.slice(testSize);

    let currentInputs = trainData.map(r => r.slice(0, -1));
    let currentValidationInputs = validationData.map(r => r.slice(0, -1));
    const Y_train = trainData.map(r => r[k]);
    const Y_validation = validationData.map(r => r[k]);

    let bestOverallCriterion = Infinity;
    this.layers = [];

    const numFeaturesPerNeuron = this.config.polynomialOrder === 2 ? 6 : 10;

    for (let l = 0; l < this.config.maxLayers; l++) {
      const numInputs = currentInputs[0].length;
      const layerNeurons: GMDHNeuron[] = [];

      for (let i = 0; i < numInputs; i++) {
        for (let j = i + 1; j < numInputs; j++) {
          const buildFeatures = (row: number[]) => {
            const xi = row[i];
            const xj = row[j];
            if (this.config.polynomialOrder === 2) {
              return [1, xi, xj, xi * xi, xj * xj, xi * xj];
            } else {
              return [1, xi, xj, xi * xi, xj * xj, xi * xj, xi * xi * xi, xj * xj * xj, xi * xi * xj, xi * xj * xj];
            }
          };

          const X_neuron = currentInputs.map(buildFeatures);
          const coeffs = solveLeastSquares(X_neuron, Y_train);

          const X_val_neuron = currentValidationInputs.map(buildFeatures);
          const predictions = X_val_neuron.map(row =>
            row.reduce((sum, val, cIdx) => sum + val * coeffs[cIdx], 0)
          );

          const { rmse, aic } = this.calculateMetrics(predictions, Y_validation, numFeaturesPerNeuron);
          layerNeurons.push({ inputs: [i, j], coeffs, rmse, aic });
        }
      }

      if (layerNeurons.length === 0) {
        break;
      }

      if (this.config.externalCriterion === 'AIC') {
        layerNeurons.sort((a, b) => a.aic - b.aic);
      } else {
        layerNeurons.sort((a, b) => a.rmse - b.rmse);
      }

      const selected = layerNeurons.slice(0, 10);
      const layerBestCriterion = this.config.externalCriterion === 'AIC' ? selected[0].aic : selected[0].rmse;

      if (layerBestCriterion >= bestOverallCriterion && l > 0) {
        break;
      }

      bestOverallCriterion = layerBestCriterion;
      this.layers.push(selected);

      currentInputs = trainData.map((_, rIdx) =>
        selected.map(neuron => {
          const row = currentInputs[rIdx];
          const xi = row[neuron.inputs[0]];
          const xj = row[neuron.inputs[1]];
          let vals: number[];
          if (this.config.polynomialOrder === 2) {
            vals = [1, xi, xj, xi * xi, xj * xj, xi * xj];
          } else {
            vals = [1, xi, xj, xi * xi, xj * xj, xi * xj, xi * xi * xi, xj * xj * xj, xi * xi * xj, xi * xj * xj];
          }
          return vals.reduce((sum, v, cIdx) => sum + v * neuron.coeffs[cIdx], 0);
        })
      );

      currentValidationInputs = validationData.map((_, rIdx) =>
        selected.map(neuron => {
          const row = currentValidationInputs[rIdx];
          const xi = row[neuron.inputs[0]];
          const xj = row[neuron.inputs[1]];
          let vals: number[];
          if (this.config.polynomialOrder === 2) {
            vals = [1, xi, xj, xi * xi, xj * xj, xi * xj];
          } else {
            vals = [1, xi, xj, xi * xi, xj * xj, xi * xj, xi * xi * xi, xj * xj * xj, xi * xi * xj, xi * xj * xj];
          }
          return vals.reduce((sum, v, cIdx) => sum + v * neuron.coeffs[cIdx], 0);
        })
      );
    }
  }

  predict(input: number[]): number {
    return this.predictBatch([input])[0];
  }

  predictBatch(inputs: number[][]): number[] {
    return inputs.map(row => {
      let currentVals = [...row];
      for (const layer of this.layers) {
        currentVals = layer.map(neuron => {
          const xi = currentVals[neuron.inputs[0]];
          const xj = currentVals[neuron.inputs[1]];
          let vals: number[];
          if (this.config.polynomialOrder === 2) {
            vals = [1, xi, xj, xi * xi, xj * xj, xi * xj];
          } else {
            vals = [1, xi, xj, xi * xi, xj * xj, xi * xj, xi * xi * xi, xj * xj * xj, xi * xi * xj, xi * xj * xj];
          }
          return vals.reduce((sum, v, cIdx) => sum + v * neuron.coeffs[cIdx], 0);
        });
      }
      return currentVals[0];
    });
  }

  getEquation(): string {
    if (this.layers.length === 0) return "No model trained";
    const bestNeuron = this.layers[this.layers.length - 1][0];
    const c = bestNeuron.coeffs;
    const [iIdx, jIdx] = bestNeuron.inputs;

    const xi = this.inputNames[iIdx] || `X${iIdx + 1}`;
    const xj = this.inputNames[jIdx] || `X${jIdx + 1}`;

    let eq = `Y = ${c[0].toFixed(4)}`;

    const terms = this.config.polynomialOrder === 2
      ? [xi, xj, `${xi}²`, `${xj}²`, `${xi}·${xj}`]
      : [xi, xj, `${xi}²`, `${xj}²`, `${xi}·${xj}`, `${xi}³`, `${xj}³`, `${xi}²·${xj}`, `${xi}·${xj}²`];

    for (let t = 0; t < terms.length; t++) {
      const coeff = c[t + 1];
      if (Math.abs(coeff) < 1e-8) continue;
      eq += `\n    ${coeff >= 0 ? '+' : '−'} ${Math.abs(coeff).toFixed(4)} · ${terms[t]}`;
    }

    return eq;
  }

  getMetricsSummary(): { rmse: number; layers: number; inputs: string[] } {
    if (this.layers.length === 0) return { rmse: 0, layers: 0, inputs: [] };
    const bestNeuron = this.layers[this.layers.length - 1][0];
    const [iIdx, jIdx] = bestNeuron.inputs;
    return {
      rmse: bestNeuron.rmse,
      layers: this.layers.length,
      inputs: [this.inputNames[iIdx] || `X${iIdx + 1}`, this.inputNames[jIdx] || `X${jIdx + 1}`]
    };
  }
}
