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
  const clonedInput = structuredClone(input);

  if (clonedInput.schemaVersion === CURRENT_SM_SCHEMA_VERSION) {
    return {
      model: clonedInput as StateMachineModelV4,
      diagnostics: [],
    };
  }

  const diagnostics: ModelDiagnostic[] = [];
  const statesById = new Map(clonedInput.states.map((state) => [state.id, state]));
  const hilConfig = clonedInput.hilConfig === undefined
    ? undefined
    : {
      ...clonedInput.hilConfig,
      mappings: clonedInput.hilConfig.mappings.map((mapping, index) => ({
        ...mapping,
        id: typeof mapping.id === 'string' && mapping.id.trim().length > 0
          ? mapping.id
          : `$io_${mapping.channelId}_${mapping.adiaVarId}_${mapping.direction}_${index}`,
      })),
    };
  const layers = clonedInput.layers.map((layer) => {
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
      ...clonedInput,
      schemaVersion: CURRENT_SM_SCHEMA_VERSION,
      safetyMode: clonedInput.safetyMode ?? false,
      hilConfig,
      layers,
    } as StateMachineModelV4,
    diagnostics,
  };
};
