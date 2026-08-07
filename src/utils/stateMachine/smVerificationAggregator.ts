import type { VerificationStatus } from './smDifferentialEngine';

export type ProductVerificationStatus = 'PASS' | 'FAIL' | 'INCOMPLETE';

export interface StageInputs {
  hostCompile: VerificationStatus;
  runtimeTests: VerificationStatus;
  differential: VerificationStatus;
  coverage: VerificationStatus;
  mcuIntegration: VerificationStatus;
}

export interface AggregatedStatus {
  behavioralGenerationStatus: VerificationStatus;
  targetIntegrationStatus: VerificationStatus;
  productVerificationStatus: ProductVerificationStatus;
}

export function aggregateVerificationStatus(inputs: StageInputs): AggregatedStatus {
  const stages: VerificationStatus[] = [inputs.hostCompile, inputs.runtimeTests, inputs.differential, inputs.coverage];

  let behavioralStatus: VerificationStatus = 'PASS';

  if (stages.some(s => s === 'FAIL')) {
    behavioralStatus = 'FAIL';
  } else if (stages.some(s => s === 'UNSUPPORTED')) {
    behavioralStatus = 'UNSUPPORTED';
  } else if (stages.some(s => s === 'BLOCKED')) {
    behavioralStatus = 'BLOCKED';
  } else if (stages.some(s => s === 'NOT RUN')) {
    behavioralStatus = 'NOT RUN';
  }

  return {
    behavioralGenerationStatus: behavioralStatus,
    targetIntegrationStatus: inputs.mcuIntegration,
    productVerificationStatus: behavioralStatus === 'PASS' && inputs.mcuIntegration === 'PASS' ? 'PASS' : 'INCOMPLETE'
  };
}
