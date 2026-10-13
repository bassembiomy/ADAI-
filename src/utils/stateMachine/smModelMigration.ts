import type { StateData } from '../../types/sm_types';
import {
  CURRENT_SM_SCHEMA_VERSION,
  defaultSMVerificationConfig,
  type LegacyStateMachineModel,
  type MigrationResult,
  type ModelDiagnostic,
  type SMVerificationConfig,
  type StateMachineModelV5,
} from './smModel';
import { adaptXBModel } from './xbModelAdapter';
import { repairLegacyXBBoundaryMappings } from './xbBoundaryMappings';

export { defaultSMVerificationConfig };

const normalizeEmbeddedXBModels = (
  states: StateData[],
  variables: LegacyStateMachineModel['variables'],
): {
  states: StateData[];
  diagnostics: ModelDiagnostic[];
} => {
  const diagnostics: ModelDiagnostic[] = [];
  const validVariableIds = new Set(variables.flatMap((variable) => [variable.id, variable.name]));
  const normalizedStates = states.map((state) => {
    if (state.xBridgesModel === undefined) return state;

    const repaired = repairLegacyXBBoundaryMappings(
      state.xBridgesModel,
      validVariableIds,
    );
    diagnostics.push(...repaired.diagnostics.map((entry) => ({
      ...entry,
      elementId: state.id,
      message: `State '${state.id}': ${entry.message}`,
    })));

    const adapted = adaptXBModel(repaired.model);
    if (adapted.model !== null) {
      return {
        ...state,
        xBridgesModel: adapted.model,
      };
    }

    diagnostics.push(...adapted.diagnostics.map((entry) => ({
      ...entry,
      elementId: state.id,
      message: `State '${state.id}': ${entry.message}`,
    })));
    return {
      ...state,
      xBridgesModel: (repaired.model ?? state.xBridgesModel) as StateData['xBridgesModel'],
    };
  });
  return { states: normalizedStates, diagnostics };
};

const repairHistoryJunctions = (
  junctions: StateMachineModelV5['junctions'] = [],
  layers: StateMachineModelV5['layers'] = [],
): {
  junctions: StateMachineModelV5['junctions'];
  layers: StateMachineModelV5['layers'];
} => {
  const updatedJunctions = junctions.map((junction) => ({ ...junction }));
  const updatedLayers = layers.map((layer) => ({
    ...layer,
    junctionIds: [...(layer.junctionIds ?? [])],
  }));

  for (const junction of updatedJunctions) {
    if (junction.type !== 'history' && junction.type !== 'deep-history') {
      continue;
    }

    const owningLayers = updatedLayers.filter((layer) =>
      layer.junctionIds.includes(junction.id));
    const owner = owningLayers.length === 1 ? owningLayers[0] : undefined;
    if (owner && owner.parentStateId !== null) {
      const isValidParent = junction.parentId === owner.id
        || junction.parentId === owner.parentStateId;
      if (!isValidParent) {
        junction.parentId = owner.parentStateId;
      }
    }
  }

  return { junctions: updatedJunctions, layers: updatedLayers };
};

export const migrateStateMachineModel = (
  input: LegacyStateMachineModel,
): MigrationResult => {
  const normalizedXB = normalizeEmbeddedXBModels(input.states, input.variables);
  const clonedInput = structuredClone({
    ...input,
    states: normalizedXB.states,
    variables: input.variables.map((variable) => ({
      ...variable,
      overflowPolicy: variable.overflowPolicy ?? 'saturate',
    })),
  });

  const verification: SMVerificationConfig = {
    ...defaultSMVerificationConfig(),
    ...(clonedInput.verification ?? {}),
  };
  if (clonedInput.verification?.invalidInputPolicies) {
    verification.invalidInputPolicies = { ...clonedInput.verification.invalidInputPolicies };
  }

  if (clonedInput.schemaVersion === CURRENT_SM_SCHEMA_VERSION) {
    const repaired = repairHistoryJunctions(
      (clonedInput as StateMachineModelV5).junctions,
      (clonedInput as StateMachineModelV5).layers,
    );
    return {
      model: {
        ...(clonedInput as StateMachineModelV5),
        schemaVersion: CURRENT_SM_SCHEMA_VERSION,
        states: clonedInput.states,
        junctions: repaired.junctions,
        layers: repaired.layers,
        verification,
        ...(clonedInput.diagrams !== undefined ? { diagrams: clonedInput.diagrams } : {}),
      },
      diagnostics: normalizedXB.diagnostics,
    };
  }

  const diagnostics: ModelDiagnostic[] = [...normalizedXB.diagnostics];
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

  const repaired = repairHistoryJunctions(
    clonedInput.junctions as StateMachineModelV5['junctions'],
    layers as StateMachineModelV5['layers'],
  );

  return {
    model: {
      ...clonedInput,
      schemaVersion: CURRENT_SM_SCHEMA_VERSION,
      safetyMode: clonedInput.safetyMode ?? false,
      states: clonedInput.states,
      hilConfig,
      layers: repaired.layers,
      junctions: repaired.junctions,
      verification,
      diagrams: clonedInput.diagrams && clonedInput.diagrams.length > 0
        ? clonedInput.diagrams
        : [{ id: 'root', name: 'Root Diagram', ownerId: 'root', contextRegionId: 'root' }],
    } as StateMachineModelV5,
    diagnostics,
  };
};
