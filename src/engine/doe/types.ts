/**
 * Canonical DOE Type Definitions
 * Defines structured model contracts, deployment schemas, and validation diagnostics.
 */

export type DOEModelType = 'RSM' | 'GMDH' | 'Taguchi';

export interface DOEDiagnostic {
  code: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  factor?: string;
  row?: number;
}

export interface DOEMetricSummary {
  rSquared?: number;
  adjustedRSquared?: number;
  rmse?: number;
  fStatistic?: number;
  pValue?: number;
  aic?: number;
  grandMean?: number;
}

export interface DOEInputTable {
  factorNames: string[];
  responseName: string;
  // Matrix of factor values [numRows x numFactors]
  factors: number[][];
  // Vector of response values [numRows]
  responses: number[];
  // Optional run order
  runOrder?: number[];
}

export interface RSMTerm {
  name: string;
  factors: number[]; // 0-indexed factor indices
  powers: number[];  // Exponents corresponding to factors
  coeff: number;
}

export interface RSMDeployment {
  intercept: number;
  terms: RSMTerm[];
}

export interface GMDHNeuron {
  inputs: [number, number]; // indices of inputs from previous layer or input factors
  coeffs: number[];         // [a0, a1, a2, a3, a4, a5] for 2nd order or up to 10 for 3rd
}

export interface GMDHDeployment {
  polyOrder: 2 | 3;
  layers: GMDHNeuron[][];
}

export interface TaguchiLevelMean {
  level: number;
  meanY: number;
  snr?: number;
}

export interface TaguchiFactorLevel {
  factorName: string;
  levels: TaguchiLevelMean[];
}

export interface TaguchiDeployment {
  grandMean: number;
  objective?: 'larger' | 'smaller' | 'nominal' | 'target';
  targetValue?: number;
  factorLevels: TaguchiFactorLevel[];
}

export interface BaseDeploymentModel {
  schemaVersion: 1;
  factorOrder: string[];
  responseName: string;
  trainingRowCount: number;
  metrics: DOEMetricSummary;
  factorRanges?: Record<string, { min: number; max: number }>;
}

export type RSMDeploymentModel = BaseDeploymentModel & {
  modelType: 'RSM';
  rsm: RSMDeployment;
  gmdh?: never;
  taguchi?: never;
};

export type GMDHDeploymentModel = BaseDeploymentModel & {
  modelType: 'GMDH';
  gmdh: GMDHDeployment;
  rsm?: never;
  taguchi?: never;
};

export type TaguchiDeploymentModel = BaseDeploymentModel & {
  modelType: 'Taguchi';
  taguchi: TaguchiDeployment;
  rsm?: never;
  gmdh?: never;
};

export type DOEDeploymentModel = RSMDeploymentModel | GMDHDeploymentModel | TaguchiDeploymentModel;

export interface DOEModelResult {
  modelType: DOEModelType;
  factorNames: string[];
  responseName: string;
  equation?: string;
  diagnostics: DOEDiagnostic[];
  deployment?: DOEDeploymentModel;
  predictions?: number[];
  residuals?: number[];
  rSquared?: number;
  adjustedRSquared?: number;
  rmse?: number;
  fStatistic?: number;
  pValue?: number;
  details?: Record<string, any>;
}

export interface XBridgesDOENode {
  id: string;
  type: 'xblock';
  position: { x: number; y: number };
  data: {
    id: string;
    name: string;
    label: string;
    type: 'DOE_MODEL';
    modelType: DOEModelType;
    equation: string;
    inputNames: string[];
    outputName: string;
    deploymentModel: DOEDeploymentModel;
    inputs: Array<{
      id: string;
      name: string;
      type: string;
      direction: string;
      position: string;
      value: number;
    }>;
    outputs: Array<{
      id: string;
      name: string;
      type: string;
      direction: string;
      position: string;
      value: number;
    }>;
    params: Record<string, any>;
    selected?: boolean;
    execute?: (inputs: any[], params: any, state?: any, time?: number) => { outputs: number[] };
  };
}

export interface VLabDOENode {
  id: string;
  type: 'doe_custom';
  position: { x: number; y: number };
  data: {
    id: string;
    name: string;
    label: string;
    type: 'doe_custom';
    color: string;
    deploymentModel: DOEDeploymentModel;
    params: {
      equation: { label: string; value: string; unit: string };
      modelType: { label: string; value: string; unit: string };
      deploymentModel?: { label: string; value: string; unit: string };
      [key: string]: any;
    };
    ports: Array<{
      id: string;
      label: string;
      type: 'input' | 'output';
      pos: string;
      position: string;
      domain: string;
    }>;
  };
}

export type BlockExportResult<T> = T | { success: false; diagnostics: DOEDiagnostic[] };
