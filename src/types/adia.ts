import type { DOEDeploymentModel, DOEModelResult, DOEModelType } from '../engine/doe/types';

export type ADIADomain = 'Electrical' | 'Mechanical' | 'Thermal' | 'Magnetic' | 'MoistAir';

export interface ADIAVariable {
  id: string;
  name: string;
  unit: string;
  value: number;
}

export interface DOEData {
  factors: string[];
  responses: string[];
  points: number[][];
  activeModel?: DOEModelType;
  results?: DOEModelResult;
  deployment?: DOEDeploymentModel;
  schemaVersion?: number;
}

export * from '../engine/doe/types';
