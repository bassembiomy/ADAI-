import {
  type ActivityEvidence,
  type VerificationActivity,
  type VerificationBundle,
  type VerificationStatus,
} from './smVerificationEvidence';

export {
  type ActivityEvidence,
  type VerificationActivity,
  type VerificationBundle,
  type VerificationStatus,
};

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

export interface AcceptanceOptions {
  requireMcdc?: boolean;
  requireTargetCompile?: boolean;
}

export function deriveAcceptance(
  bundle: VerificationBundle,
  options?: AcceptanceOptions,
): VerificationBundle {
  const activities = { ...bundle.activities };
  let overallStatus: VerificationStatus = 'PASS';
  let accepted = true;

  // 1. Any FAIL across any activity immediately rejects
  for (const activity of Object.values(activities)) {
    if (activity.status === 'FAIL') {
      overallStatus = 'FAIL';
      accepted = false;
      break;
    }
  }

  // 2. Mandatory gates that must be PASS
  const mandatoryGates: VerificationActivity[] = [
    'structural',
    'semantic',
    'test-generation',
    'host-compilation',
    'host-runtime',
    'sanitizers',
    'statement-coverage',
    'branch-coverage',
    'differential',
  ];

  for (const gate of mandatoryGates) {
    const act = activities[gate];
    if (!act || act.status !== 'PASS') {
      if (overallStatus !== 'FAIL') {
        overallStatus = act?.status === 'NOT_RUN' ? 'NOT_RUN' : (act?.status ?? 'FAIL');
      }
      accepted = false;
    }
  }

  // 3. MC/DC check:
  const mcdc = activities['mcdc-coverage'];
  if (options?.requireMcdc) {
    if (!mcdc || mcdc.status !== 'PASS') {
      overallStatus = 'FAIL';
      accepted = false;
    }
  } else {
    // If not required for safety, NOT_APPLICABLE or PASS is allowed
    if (mcdc && mcdc.status !== 'PASS' && mcdc.status !== 'NOT_APPLICABLE') {
      if (overallStatus !== 'FAIL') overallStatus = mcdc.status;
      accepted = false;
    }
  }

  // 4. Target compilation check:
  const target = activities['target-compilation'];
  if (options?.requireTargetCompile) {
    if (!target || target.status !== 'PASS') {
      if (overallStatus !== 'FAIL') overallStatus = target?.status ?? 'NOT_RUN';
      accepted = false;
    }
  } else {
    if (target && target.status === 'FAIL') {
      overallStatus = 'FAIL';
      accepted = false;
    }
  }

  // 5. Static / MISRA check:
  for (const gate of ['static-analysis', 'misra-analysis'] as const) {
    const act = activities[gate];
    if (act) {
      if (act.status === 'FAIL') {
        overallStatus = 'FAIL';
        accepted = false;
      } else if (act.status === 'NOT_RUN' && act.details !== null) {
        if (overallStatus !== 'FAIL') overallStatus = 'NOT_RUN';
        accepted = false;
      }
    }
  }

  // 6. Hardware can never be PASS without hardware test execution
  if (activities['hardware']?.status === 'PASS' && !activities['hardware'].command) {
    activities['hardware'] = {
      ...activities['hardware'],
      status: 'PENDING',
      summary: 'Hardware execution pending physical bench test.',
    };
  }

  return {
    ...bundle,
    activities,
    overallStatus,
    acceptance: accepted,
  };
}

export function aggregateVerificationStatus(inputs: StageInputs): AggregatedStatus {
  const stages: VerificationStatus[] = [
    inputs.hostCompile,
    inputs.runtimeTests,
    inputs.differential,
    inputs.coverage,
  ];

  let behavioralStatus: VerificationStatus = 'PASS';

  if (stages.some((s) => s === 'FAIL')) {
    behavioralStatus = 'FAIL';
  } else if (stages.some((s) => s === 'NOT_RUN')) {
    behavioralStatus = 'NOT_RUN';
  }

  return {
    behavioralGenerationStatus: behavioralStatus,
    targetIntegrationStatus: inputs.mcuIntegration,
    productVerificationStatus: behavioralStatus === 'PASS' && inputs.mcuIntegration === 'PASS' ? 'PASS' : 'INCOMPLETE',
  };
}
