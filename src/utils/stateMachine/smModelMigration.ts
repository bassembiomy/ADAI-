import type { StateData } from '../../types/sm_types';
import {
  CURRENT_SM_SCHEMA_VERSION,
  type LegacyStateMachineModel,
  type MigrationResult,
  type ModelDiagnostic,
  type StateMachineModelV4,
} from './smModel';

export const migrateStateMachineModel = (
  input: LegacyStateMachineModel,
): MigrationResult => {
  if (input.schemaVersion === CURRENT_SM_SCHEMA_VERSION) {
    return {
      model: structuredClone(input) as StateMachineModelV4,
      diagnostics: [],
    };
  }

  const diagnostics: ModelDiagnostic[] = [];
  const statesById = new Map(input.states.map((state) => [state.id, state]));
  const layers = input.layers.map((layer) => {
    const childFlags = layer.stateIds
      .map((id) => statesById.get(id))
      .filter((state): state is StateData => state !== undefined)
      .map((state) => state.isParallel === true);
    const hasParallel = childFlags.some(Boolean);
    const hasExclusive = childFlags.some((flag) => !flag);

    if (hasParallel && hasExclusive) {
      diagnostics.push({
        code: 'MIGRATION_AMBIGUOUS_DECOMPOSITION',
        message: `Layer '${layer.name}' mixes parallel and exclusive child flags.`,
        elementId: layer.id,
        severity: 'error',
      });
    }

    return {
      ...layer,
      decomposition: hasParallel && !hasExclusive ? 'AND' as const : 'OR' as const,
    };
  });

  return {
    model: {
      ...structuredClone(input),
      schemaVersion: CURRENT_SM_SCHEMA_VERSION,
      layers,
    } as StateMachineModelV4,
    diagnostics,
  };
};
