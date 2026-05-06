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

  private buildFeatures(xi: number, xj: number): number[] {
    if (this.config.polynomialOrder === 2) {
      return [1, xi, xj, xi * xi, xj * xj, xi * xj];
    } else {
      return [1, xi, xj, xi * xi, xj * xj, xi * xj, xi * xi * xi, xj * xj * xj, xi * xi * xj, xi * xj * xj];
    }
  }

  private evaluateNeuron(row: number[], neuron: GMDHNeuron): number {
    const xi = row[neuron.inputs[0]];
    const xj = row[neuron.inputs[1]];
    const vals = this.buildFeatures(xi, xj);
    return vals.reduce((sum, v, cIdx) => sum + v * neuron.coeffs[cIdx], 0);
  }

  private calculateRMSE(predictions: number[], actuals: number[]): number {
    const n = predictions.length;
    let sse = 0;
    for (let i = 0; i < n; i++) {
      sse += Math.pow(predictions[i] - actuals[i], 2);
    }
    return Math.sqrt(sse / n);
  }

  // K-Fold Cross-Validation RMSE for a single neuron candidate
  private kFoldRMSE(allInputRows: number[][], Y: number[], iIdx: number, jIdx: number, k: number = 5): number {
    const n = allInputRows.length;
    const foldSize = Math.ceil(n / k);
    let totalSqErr = 0;
    let totalCount = 0;

    for (let fold = 0; fold < k; fold++) {
      const valStart = fold * foldSize;
      const valEnd = Math.min(valStart + foldSize, n);
      
      const trainX: number[][] = [];
      const trainY: number[] = [];
      const valX: number[][] = [];
      const valY: number[] = [];

      for (let i = 0; i < n; i++) {
        const features = this.buildFeatures(allInputRows[i][iIdx], allInputRows[i][jIdx]);
        if (i >= valStart && i < valEnd) {
          valX.push(features);
          valY.push(Y[i]);
        } else {
          trainX.push(features);
          trainY.push(Y[i]);
        }
      }

      if (trainX.length < trainX[0]?.length || valX.length === 0) continue;

      const coeffs = solveLeastSquares(trainX, trainY);
      for (let i = 0; i < valX.length; i++) {
        const pred = valX[i].reduce((sum, v, cIdx) => sum + v * coeffs[cIdx], 0);
        totalSqErr += Math.pow(pred - valY[i], 2);
        totalCount++;
      }
    }

    return totalCount > 0 ? Math.sqrt(totalSqErr / totalCount) : Infinity;
  }

  train(data: number[][], headers: string[]) {
    this.inputNames = headers.slice(0, -1);
    const n = data.length;
    const k = data[0].length - 1;
    const Y = data.map(r => r[k]);

    // Use all data for architecture selection via K-fold CV
    let currentInputs = data.map(r => r.slice(0, -1));

    let bestOverallCriterion = Infinity;
    this.layers = [];

    const numFolds = Math.min(5, n); // adapt for very small datasets

    for (let l = 0; l < this.config.maxLayers; l++) {
      const numInputs = currentInputs[0].length;
      if (numInputs < 2) break;

      const layerNeurons: GMDHNeuron[] = [];

      for (let i = 0; i < numInputs; i++) {
        for (let j = i + 1; j < numInputs; j++) {
          // K-Fold CV for architecture selection
          const cvRmse = this.kFoldRMSE(currentInputs, Y, i, j, numFolds);

          // Full-data fit for the coefficients we'll actually keep
          const X_full = currentInputs.map(row => this.buildFeatures(row[i], row[j]));
          const coeffs = solveLeastSquares(X_full, Y);
          
          // Training RMSE for reporting
          const trainPreds = X_full.map(row => row.reduce((sum, v, cIdx) => sum + v * coeffs[cIdx], 0));
          const trainRmse = this.calculateRMSE(trainPreds, Y);
          
          const aic = n * Math.log(trainRmse * trainRmse + 1e-10) + 2 * coeffs.length;
          layerNeurons.push({ inputs: [i, j], coeffs, rmse: cvRmse, aic });
        }
      }

      if (layerNeurons.length === 0) break;

      // Sort by external criterion
      if (this.config.externalCriterion === 'AIC') {
        layerNeurons.sort((a, b) => a.aic - b.aic);
      } else {
        layerNeurons.sort((a, b) => a.rmse - b.rmse);
      }

      const bestCriterion = this.config.externalCriterion === 'AIC' ? layerNeurons[0].aic : layerNeurons[0].rmse;

      // Adaptive neuron selection: keep neurons within 10% of best
      const threshold = bestCriterion * 1.1;
      const selected = layerNeurons.filter(n => 
        (this.config.externalCriterion === 'AIC' ? n.aic : n.rmse) <= threshold
      ).slice(0, Math.max(3, Math.min(15, numInputs))); // At least 3, at most 15

      if (bestCriterion >= bestOverallCriterion && l > 0) {
        break; // No improvement — stop adding layers
      }

      bestOverallCriterion = bestCriterion;
      this.layers.push(selected);

      // Propagate: compute new input features from selected neurons
      currentInputs = data.map((_, rIdx) =>
        selected.map(neuron => this.evaluateNeuron(currentInputs[rIdx], neuron))
      );
    }

    // Final refit: retrain all layers on full data for minimum training error
    this.refitOnFullData(data);
  }

  private refitOnFullData(data: number[][]) {
    const k = data[0].length - 1;
    const Y = data.map(r => r[k]);
    let currentInputs = data.map(r => r.slice(0, -1));

    for (let l = 0; l < this.layers.length; l++) {
      const layer = this.layers[l];
      for (let nIdx = 0; nIdx < layer.length; nIdx++) {
        const neuron = layer[nIdx];
        const X = currentInputs.map(row => 
          this.buildFeatures(row[neuron.inputs[0]], row[neuron.inputs[1]])
        );
        const newCoeffs = solveLeastSquares(X, Y);
        neuron.coeffs = newCoeffs;
        
        // Update RMSE with full-data fit
        const preds = X.map(row => row.reduce((sum, v, cIdx) => sum + v * newCoeffs[cIdx], 0));
        neuron.rmse = this.calculateRMSE(preds, Y);
      }

      // Propagate for next layer
      currentInputs = data.map((_, rIdx) =>
        layer.map(neuron => this.evaluateNeuron(currentInputs[rIdx], neuron))
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
          const vals = this.buildFeatures(xi, xj);
          return vals.reduce((sum, v, cIdx) => sum + v * neuron.coeffs[cIdx], 0);
        });
      }
      return currentVals[0];
    });
  }

  getEquation(): string {
    if (this.layers.length === 0) return "No model trained";
    const lastLayer = this.layers[this.layers.length - 1];
    const bestNeuron = lastLayer[0];
    const c = bestNeuron.coeffs;
    const [iIdx, jIdx] = bestNeuron.inputs;

    const layerCount = this.layers.length;
    let eq = `GMDH Neural Model (${layerCount} Layers)\n`;
    eq += `------------------------------------\n`;
    eq += `Final output derived from Z${layerCount-1}_${iIdx} and Z${layerCount-1}_${jIdx}\n\n`;
    eq += `Y = ${c[0].toFixed(4)}`;

    const terms = this.config.polynomialOrder === 2
      ? [`z_i`, `z_j`, `z_i²`, `z_j²`, `z_i·z_j`]
      : [`z_i`, `z_j`, `z_i²`, `z_j²`, `z_i·z_j`, `z_i³`, `z_j³`, `z_i²·z_j`, `z_i·z_j²`];

    for (let t = 0; t < terms.length; t++) {
      const coeff = c[t + 1];
      if (Math.abs(coeff) < 1e-6) continue;
      eq += `\n    ${coeff >= 0 ? '+' : '-'} ${Math.abs(coeff).toFixed(4)} * ${terms[t]}`;
    }
    
    eq += `\n\nNote: z_i and z_j are recursive outputs from layer ${layerCount-1}.`;
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
