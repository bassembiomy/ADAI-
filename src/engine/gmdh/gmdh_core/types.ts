// src/engine/gmdh/gmdh_core/types.ts

export type GMDHAlgorithm = 'COMBI' | 'MIA' | 'OSA';
export type PolynomialOrder = 2 | 3;
export type ExternalCriterion = 'RMSE' | 'AIC' | 'CV';

export interface GMDHConfig {
  algorithm: GMDHAlgorithm;
  polynomialOrder: PolynomialOrder;
  maxLayers: number;
  externalCriterion: ExternalCriterion;
  validationSplit: number;
}

export interface GMDHNeuron {
  inputs: number[];
  coeffs: number[];
  rmse: number;
  aic: number;
}

export interface PolynomialModel {
  layers: GMDHNeuron[][];
  inputNames: string[];
  predict: (input: number[]) => number;
  predictBatch: (inputs: number[][]) => number[];
  getEquation: () => string;
}

export interface GMDHResult {
  model: PolynomialModel;
  metrics: {
    r2: number;
    rmse: number;
    aic: number;
  };
  structure: any; // Simplified for Phase 1
  code: {
    matlab: string;
    c: string;
    fmu: string;
  };
}
