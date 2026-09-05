import type { ResolvedSMVerificationConfig } from './smSemanticModel';

export type SMTestSuite =
  | 'initialization'
  | 'transitions'
  | 'actions'
  | 'timing'
  | 'safety'
  | 'io'
  | 'reset'
  | 'robustness'
  | 'hierarchy';

export const SM_TEST_SUITE_ORDER: readonly SMTestSuite[] = Object.freeze([
  'initialization',
  'transitions',
  'actions',
  'timing',
  'safety',
  'io',
  'reset',
  'robustness',
  'hierarchy',
]);

export type SMApplicability =
  | { status: 'applicable' }
  | { status: 'not-applicable'; reason: string };

export interface SMTestTraceability {
  modelId: string;
  stateIds: readonly string[];
  transitionIds: readonly string[];
  requirementIds: readonly string[];
  generatedFunctions: readonly string[];
  testCaseId: string;
}

export type SMTestOperation =
  | { kind: 'init' }
  | { kind: 'reset'; authorized?: boolean }
  | { kind: 'step'; deltaMs?: number }
  | { kind: 'set-variable'; variableId: string; value: unknown }
  | { kind: 'set-input'; mappingId: string; rawValue: unknown }
  | {
      kind: 'corrupt-field';
      field: 'activeState' | 'history' | 'stateTimers' | 'executionSlot';
      targetId: string;
      invalidValue: unknown;
    }
  | { kind: 'set-timer'; stateId: string; valueMs: number }
  | { kind: 'repeat-step'; cycles: number; deltaMs?: number };

export type SMTestExpectation =
  | { kind: 'active-state'; layerId: string; stateId: string }
  | { kind: 'inactive-state'; stateId: string }
  | { kind: 'active-slot'; slot: number; stateId: string }
  | { kind: 'variable'; variableId: string; value: unknown }
  | { kind: 'timer'; stateId: string; expectedMs: number; toleranceMs?: number }
  | { kind: 'error'; code: string | null }
  | { kind: 'fault-latched'; latched: boolean }
  | { kind: 'transition-fired'; transitionId: string }
  | { kind: 'action-executed'; action: string; order?: number }
  | { kind: 'mcal-call'; functionName: string; channel?: number; value?: unknown; order?: number }
  | { kind: 'mcal-call-count'; functionName: string; count: number }
  | { kind: 'watchdog-kicks'; count: number };

export interface SMTestCase {
  id: string;
  suite: SMTestSuite;
  name: string;
  applicability: SMApplicability;
  operations: readonly SMTestOperation[];
  expectations: readonly SMTestExpectation[];
  traceability: SMTestTraceability;
}

export interface SMTestManifest {
  schemaVersion: 1;
  modelId: string;
  modelHash: string;
  verification: ResolvedSMVerificationConfig;
  cases: readonly SMTestCase[];
}

/**
 * Sorts test cases deterministically by canonical suite order and ID.
 */
export const sortSMTestCases = (cases: readonly SMTestCase[]): SMTestCase[] => {
  const suiteRank = (suite: SMTestSuite): number => {
    const idx = SM_TEST_SUITE_ORDER.indexOf(suite);
    return idx >= 0 ? idx : 999;
  };

  return [...cases].sort((a, b) => {
    const rankDiff = suiteRank(a.suite) - suiteRank(b.suite);
    if (rankDiff !== 0) return rankDiff;
    return a.id.localeCompare(b.id);
  });
};

/**
 * Validates the canonical SMTestManifest structure, returning diagnostic error strings if invalid.
 */
export const validateSMTestManifest = (manifest: SMTestManifest): string[] => {
  const diagnostics: string[] = [];

  if (!manifest || typeof manifest !== 'object') {
    return ['Manifest must be a non-null object'];
  }

  if (manifest.schemaVersion !== 1) {
    diagnostics.push(`Invalid schemaVersion ${String(manifest.schemaVersion)}; expected 1.`);
  }

  if (!manifest.modelId || typeof manifest.modelId !== 'string') {
    diagnostics.push('Manifest modelId must be a non-empty string.');
  }

  if (!manifest.modelHash || typeof manifest.modelHash !== 'string') {
    diagnostics.push('Manifest modelHash must be a non-empty string.');
  }

  if (!manifest.verification || typeof manifest.verification !== 'object') {
    diagnostics.push('Manifest verification configuration must be present.');
  }

  if (!Array.isArray(manifest.cases)) {
    diagnostics.push('Manifest cases must be an array.');
  } else {
    for (let i = 0; i < manifest.cases.length; i++) {
      const tc = manifest.cases[i];
      if (!tc.id || typeof tc.id !== 'string') {
        diagnostics.push(`Case at index ${i} has missing or invalid id.`);
      }
      if (!SM_TEST_SUITE_ORDER.includes(tc.suite)) {
        diagnostics.push(`Case ${tc.id ?? i} has invalid suite: ${String(tc.suite)}.`);
      }
      if (!tc.applicability || !['applicable', 'not-applicable'].includes(tc.applicability.status)) {
        diagnostics.push(`Case ${tc.id ?? i} has invalid applicability status.`);
      }
      if (!tc.traceability || typeof tc.traceability !== 'object') {
        diagnostics.push(`Case ${tc.id ?? i} is missing traceability information.`);
      }
    }
  }

  return diagnostics;
};

/**
 * Serializes manifest to a deterministic formatted JSON string.
 */
export const serializeSMTestManifest = (manifest: SMTestManifest): string => {
  const normalized: SMTestManifest = {
    ...manifest,
    cases: sortSMTestCases(manifest.cases),
  };
  return JSON.stringify(normalized, null, 2);
};

/**
 * Deserializes manifest from JSON.
 */
export const deserializeSMTestManifest = (json: string): SMTestManifest => {
  const parsed = JSON.parse(json) as SMTestManifest;
  const diags = validateSMTestManifest(parsed);
  if (diags.length > 0) {
    throw new Error(`Failed to deserialize SMTestManifest: ${diags.join('; ')}`);
  }
  return parsed;
};
