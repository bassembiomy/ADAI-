import type { ErrorItem } from '../../types/sm_types';
import type { LegacyStateMachineModel, ModelDiagnostic } from './smModel';
import { migrateStateMachineModel } from './smModelMigration';
import { buildSemanticModel } from './smSemanticBuilder';
import type { SemanticModel } from './smSemanticModel';

/**
 * Shared front end of every C code generator (Generate C/H and Generate AUTOSAR):
 * safe-state precondition -> migration -> semantic build -> diagnostic mapping.
 * One implementation so the two pipelines can never drift apart.
 */
export interface FrontEndOptions {
  requirementLinks?: ReadonlyMap<string, readonly string[]>;
  /** Drops the HIL configuration before migration (AUTOSAR components never touch MCAL). */
  stripHil?: boolean;
}

export interface FrontEndResult {
  ir?: SemanticModel;
  errors: ErrorItem[];
  warnings: string[];
}

export const diagnosticToError = (diagnostic: ModelDiagnostic): ErrorItem => ({
  id: diagnostic.code,
  type: diagnostic.severity,
  message: diagnostic.message,
  timestamp: new Date(),
  source: 'state-machine-semantic-model',
  elementId: diagnostic.elementId,
});

export const runSmFrontEnd = (
  chart: Omit<LegacyStateMachineModel, 'hilConfig'> & { hilConfig?: any },
  options: FrontEndOptions = {},
): FrontEndResult => {
  if (
    chart.safetyMode === true
    && !chart.states.some((state) => state.isSafeState === true)
  ) {
    return {
      errors: [{
        id: 'SAFE_STATE_REQUIRED',
        type: 'error',
        message: 'No Safe State defined while safety mode is enabled.',
        timestamp: new Date(),
        source: 'state-machine-semantic-model',
      }],
      warnings: [],
    };
  }

  let source = chart as LegacyStateMachineModel;
  if (options.stripHil === true) {
    const { hilConfig: ignoredHil, ...withoutHil } = chart;
    void ignoredHil;
    source = withoutHil as LegacyStateMachineModel;
  }
  const migrated = migrateStateMachineModel(source);
  // Legacy HIL callers predate the mandatory invalid-input policy field. Keep
  // those callers compatible while preserving strict validation for authored
  // semantic models that explicitly omit a policy.
  if (migrated.model.hilConfig?.mappings) {
    const policies = { ...(migrated.model.verification?.invalidInputPolicies ?? {}) };
    for (const mapping of migrated.model.hilConfig.mappings) {
      if (mapping.direction === 'read') {
        policies[mapping.id] ??= 'default';
        policies[mapping.channelId] ??= 'default';
        policies[mapping.adiaVarId] ??= 'default';
      }
    }
    migrated.model.verification = {
      ...(migrated.model.verification ?? {}),
      invalidInputPolicies: policies,
    } as typeof migrated.model.verification;
  }
  const built = buildSemanticModel(migrated.model, { requirementLinks: options.requirementLinks });
  const diagnostics = [...migrated.diagnostics, ...built.diagnostics];
  const errors = diagnostics
    .filter((item) => item.severity === 'error')
    .map(diagnosticToError);
  const warnings = diagnostics
    .filter((item) => item.severity === 'warning')
    .map((item) => `[${item.code}] ${item.message}`);
  return {
    ir: built.ir !== undefined && errors.length === 0 ? built.ir : undefined,
    errors,
    warnings,
  };
};
