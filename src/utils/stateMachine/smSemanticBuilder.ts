import type { StateData } from '../../types/sm_types';
import {
  parseActions,
  parseCondition,
  parseInternalTransitions,
  toCIdentifier,
} from './smExpressions';
import type { StateMachineLayerV4, StateMachineModelV4 } from './smModel';
import type {
  SemanticBuildResult,
  SemanticIOMapping,
  SemanticJunction,
  SemanticLayer,
  SemanticModel,
  SemanticState,
  SemanticTransition,
  SemanticVariable,
} from './smSemanticModel';
import { validateModelStructure } from './smSemanticValidator';

interface HierarchyIndex {
  rootLayerId: string;
  orderedLayerIds: string[];
  orderedStateIds: string[];
  stateById: Map<string, StateData>;
  layerById: Map<string, StateMachineLayerV4>;
  layerByStateId: Map<string, StateMachineLayerV4>;
  parentByStateId: Map<string, string | null>;
  childLayerIdsByStateId: Map<string, string[]>;
}

const byPriorityThenId = (
  left: StateData,
  right: StateData,
): number => left.priority - right.priority || left.id.localeCompare(right.id);

const buildHierarchyIndex = (
  model: StateMachineModelV4,
): HierarchyIndex => {
  const stateById = new Map(model.states.map((state) => [state.id, state]));
  const layerById = new Map(model.layers.map((layer) => [layer.id, layer]));
  const layerByStateId = new Map<string, StateMachineLayerV4>();
  const parentByStateId = new Map<string, string | null>();
  const childLayerIdsByStateId = new Map<string, string[]>();

  for (const layer of model.layers) {
    for (const stateId of layer.stateIds) {
      layerByStateId.set(stateId, layer);
      parentByStateId.set(stateId, layer.parentStateId);
    }
    if (layer.parentStateId !== null) {
      const childLayers = childLayerIdsByStateId.get(layer.parentStateId) ?? [];
      childLayers.push(layer.id);
      childLayerIdsByStateId.set(layer.parentStateId, childLayers);
    }
  }
  for (const childLayers of childLayerIdsByStateId.values()) {
    childLayers.sort((left, right) => left.localeCompare(right));
  }

  const rootLayer = model.layers.find((layer) => layer.parentStateId === null)!;
  const orderedLayerIds: string[] = [];
  const orderedStateIds: string[] = [];
  const visitedLayers = new Set<string>();

  const visitLayer = (layerId: string): void => {
    if (visitedLayers.has(layerId)) return;
    visitedLayers.add(layerId);
    orderedLayerIds.push(layerId);
    const layer = layerById.get(layerId)!;
    const children = layer.stateIds
      .map((id) => stateById.get(id)!)
      .sort(byPriorityThenId);
    for (const child of children) {
      orderedStateIds.push(child.id);
      for (const childLayerId of childLayerIdsByStateId.get(child.id) ?? []) {
        visitLayer(childLayerId);
      }
    }
  };
  visitLayer(rootLayer.id);

  return {
    rootLayerId: rootLayer.id,
    orderedLayerIds,
    orderedStateIds,
    stateById,
    layerById,
    layerByStateId,
    parentByStateId,
    childLayerIdsByStateId,
  };
};

const allocateActiveSlots = (
  hierarchy: HierarchyIndex,
): Map<string, number | null> => {
  const slots = new Map<string, number | null>();
  let nextSlot = 0;
  for (const layerId of hierarchy.orderedLayerIds) {
    const layer = hierarchy.layerById.get(layerId)!;
    if (layer.decomposition === 'OR') {
      slots.set(layerId, nextSlot);
      nextSlot += 1;
    } else {
      slots.set(layerId, null);
    }
  }
  return slots;
};

const ancestorsFromSelf = (
  stateId: string,
  parentByStateId: ReadonlyMap<string, string | null>,
): string[] => {
  const ancestors: string[] = [];
  let current: string | null = stateId;
  while (current !== null) {
    ancestors.push(current);
    current = parentByStateId.get(current) ?? null;
  }
  return ancestors;
};

const isDescendant = (
  candidateId: string,
  ancestorId: string,
  parentByStateId: ReadonlyMap<string, string | null>,
): boolean => {
  let current = parentByStateId.get(candidateId) ?? null;
  while (current !== null) {
    if (current === ancestorId) return true;
    current = parentByStateId.get(current) ?? null;
  }
  return false;
};

const transitionPaths = (
  sourceId: string,
  targetId: string,
  kind: SemanticTransition['kind'],
  parentByStateId: ReadonlyMap<string, string | null>,
): Pick<SemanticTransition, 'exitStateIds' | 'entryStateIds'> => {
  if (kind === 'internal-action') {
    return { exitStateIds: [], entryStateIds: [] };
  }
  if (kind === 'external-self') {
    return { exitStateIds: [sourceId], entryStateIds: [targetId] };
  }

  const sourceAncestors = ancestorsFromSelf(sourceId, parentByStateId);
  const targetAncestors = ancestorsFromSelf(targetId, parentByStateId);
  const targetSet = new Set(targetAncestors);
  const lca = sourceAncestors.find((id) => targetSet.has(id)) ?? null;
  if (kind === 'outer' && lca === sourceId) {
    const descendants = targetAncestors
      .slice(0, targetAncestors.indexOf(sourceId))
      .reverse();
    return {
      exitStateIds: [sourceId],
      entryStateIds: [sourceId, ...descendants],
    };
  }
  const exitStateIds = sourceAncestors.slice(
    0,
    lca === null ? sourceAncestors.length : sourceAncestors.indexOf(lca),
  );
  const targetToLca = targetAncestors.slice(
    0,
    lca === null ? targetAncestors.length : targetAncestors.indexOf(lca),
  );
  return {
    exitStateIds,
    entryStateIds: targetToLca.reverse(),
  };
};

const classifyTransition = (
  sourceId: string,
  targetId: string,
  isInternal: boolean,
  parentByStateId: ReadonlyMap<string, string | null>,
): SemanticTransition['kind'] => {
  if (isInternal && sourceId === targetId) return 'internal-action';
  if (isInternal && isDescendant(targetId, sourceId, parentByStateId)) {
    return 'inner';
  }
  if (sourceId === targetId) return 'external-self';
  return 'outer';
};

const normalizeTriggerMode = (
  type: 'condition' | 'after' | 'and' | 'or' | 'internal',
): SemanticTransition['triggerMode'] =>
  type === 'internal' ? 'condition' : type;

const parseInitialValue = (
  type: SemanticVariable['type'],
  source: string,
  fallback: number | boolean,
): number | boolean => {
  if (type === 'bool') {
    if (source.trim().toLowerCase() === 'true' || source.trim() === '1') return true;
    if (source.trim().toLowerCase() === 'false' || source.trim() === '0') return false;
    return Boolean(fallback);
  }
  const parsed = Number(source.replace(/[uUlLfF]+$/, ''));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const deepFreeze = <T>(value: T, seen = new WeakSet<object>()): T => {
  if (value === null || typeof value !== 'object') return value;
  const object = value as object;
  if (seen.has(object)) return value;
  seen.add(object);
  for (const child of Object.values(object)) {
    deepFreeze(child, seen);
  }
  return Object.freeze(value);
};

export const freezeSemanticModel = (
  model: SemanticModel,
): SemanticModel => deepFreeze(model);

export const buildSemanticModel = (
  model: StateMachineModelV4,
): SemanticBuildResult => {
  const diagnostics = validateModelStructure(model);
  if (diagnostics.some((item) => item.severity === 'error')) {
    return { diagnostics };
  }

  const hierarchy = buildHierarchyIndex(model);
  const slots = allocateActiveSlots(hierarchy);
  const activityIndexByStateId = new Map(
    hierarchy.orderedStateIds.map((id, index) => [id, index]),
  );
  const symbols = new Map<string, { id: string; cName: string }>();
  for (const variable of model.variables) {
    const cName = toCIdentifier(variable.name);
    const symbol = { id: variable.id, cName };
    symbols.set(variable.id, symbol);
    symbols.set(variable.name, symbol);
  }

  const states: Record<string, SemanticState> = {};
  for (const stateId of hierarchy.orderedStateIds) {
    const state = hierarchy.stateById.get(stateId)!;
    const containingLayer = hierarchy.layerByStateId.get(state.id)!;
    const parentStateId = hierarchy.parentByStateId.get(state.id) ?? null;
    states[state.id] = {
      id: state.id,
      enumName: `SM_ST_${toCIdentifier(state.id).toUpperCase()}`,
      parentStateId,
      layerId: containingLayer.id,
      depth: ancestorsFromSelf(state.id, hierarchy.parentByStateId).length - 1,
      priority: state.priority,
      activeSlot: slots.get(containingLayer.id) ?? -1,
      activityIndex: activityIndexByStateId.get(state.id)!,
      terminal: state.isTerminalState === true || state.isTerminal === true,
      ancestorStateIds: ancestorsFromSelf(
        state.id,
        hierarchy.parentByStateId,
      ).slice(1),
      childLayerIds: [...(hierarchy.childLayerIdsByStateId.get(state.id) ?? [])],
      internalTransitionIds: [],
      entryActions: parseActions(state.entry, symbols),
      duringActions: parseActions(state.during, symbols),
      exitActions: parseActions(state.exit, symbols),
    };
  }

  const transitionById = new Map(
    model.transitions.map((transition) => [transition.id, transition]),
  );
  const layerIdByJunctionId = new Map<string, string>();
  for (const layer of model.layers) {
    for (const junctionId of layer.junctionIds) {
      layerIdByJunctionId.set(junctionId, layer.id);
    }
  }
  const transitionOrder = [...model.transitions].sort((left, right) =>
    left.order - right.order || left.id.localeCompare(right.id));

  const layers: Record<string, SemanticLayer> = {};
  for (const layerId of hierarchy.orderedLayerIds) {
    const layer = hierarchy.layerById.get(layerId)!;
    const children = layer.stateIds
      .map((id) => hierarchy.stateById.get(id)!)
      .sort(byPriorityThenId)
      .map((state) => state.id);
    layers[layer.id] = {
      id: layer.id,
      name: layer.name,
      parentStateId: layer.parentStateId,
      decomposition: layer.decomposition,
      children,
      transitionIds: layer.transitionIds
        .map((id) => transitionById.get(id))
        .filter((transition): transition is NonNullable<typeof transition> =>
          transition !== undefined)
        .sort((left, right) =>
          left.order - right.order || left.id.localeCompare(right.id))
        .map((transition) => transition.id),
      junctionIds: [...layer.junctionIds].sort((left, right) =>
        left.localeCompare(right)),
      activeSlot: slots.get(layer.id) ?? null,
      defaultEntryId: layer.decomposition === 'OR'
        ? (
          layer.stateIds.find((id) => hierarchy.stateById.get(id)?.autostart)
          ?? layer.junctionIds.find((id) =>
            model.junctions.find((junction) => junction.id === id)?.autostart)
          ?? null
        )
        : null,
      defaultEntryKind: layer.decomposition === 'OR'
        ? (
          layer.stateIds.some((id) => hierarchy.stateById.get(id)?.autostart)
            ? 'state'
            : 'junction'
        )
        : null,
    };
  }

  const stateIds = new Set(model.states.map((state) => state.id));
  const junctionIds = new Set(model.junctions.map((junction) => junction.id));
  const transitions: Record<string, SemanticTransition> = {};
  const transitionsBySource: Record<string, string[]> = {};
  for (const stateId of hierarchy.orderedStateIds) {
    transitionsBySource[stateId] = [];
  }
  for (const junctionId of [...junctionIds].sort((left, right) =>
    left.localeCompare(right))) {
    transitionsBySource[junctionId] = [];
  }
  for (const transition of transitionOrder) {
    const sourceIsState = stateIds.has(transition.sourceId);
    const destinationIsState = stateIds.has(transition.targetId);
    const isInternal = transition.isInternal === true || transition.type === 'internal';
    const kind = sourceIsState && destinationIsState
      ? classifyTransition(
        transition.sourceId,
        transition.targetId,
        isInternal,
        hierarchy.parentByStateId,
      )
      : sourceIsState && isInternal
        ? 'inner'
      : 'outer';
    const paths = sourceIsState && destinationIsState
      ? transitionPaths(
        transition.sourceId,
        transition.targetId,
        kind,
        hierarchy.parentByStateId,
      )
      : { exitStateIds: [], entryStateIds: [] };

    transitions[transition.id] = {
      id: transition.id,
      sourceStateId: transition.sourceId,
      destinationStateId: transition.targetId,
      kind,
      priority: transition.order,
      triggerMode: normalizeTriggerMode(transition.type),
      afterTicks: transition.afterTicks,
      temporalThresholdMs: transition.afterTicks === null
        ? null
        : transition.afterTicks * model.tickMs,
      sourceKind: sourceIsState ? 'state' : 'junction',
      destinationKind: destinationIsState ? 'state' : 'junction',
      guard: parseCondition(transition.condition, symbols),
      actions: parseActions(transition.action, symbols),
      ...paths,
      routes: [],
    };
    transitionsBySource[transition.sourceId].push(transition.id);
  }
  for (const stateId of hierarchy.orderedStateIds) {
    const state = hierarchy.stateById.get(stateId)!;
    const internalTransitions = parseInternalTransitions(
      state.internalTransitions ?? '',
      symbols,
    );
    internalTransitions.forEach((internal, index) => {
      const id = `$internal_${state.id}_${index}`;
      transitions[id] = {
        id,
        sourceStateId: state.id,
        destinationStateId: state.id,
        kind: 'internal-action',
        priority: 1000 + index,
        triggerMode: internal.triggerMode,
        afterTicks: internal.afterTicks,
        temporalThresholdMs: internal.afterTicks === null
          ? null
          : internal.afterTicks * model.tickMs,
        sourceKind: 'state',
        destinationKind: 'state',
        guard: internal.guard,
        actions: internal.actions,
        exitStateIds: [],
        entryStateIds: [],
        routes: [],
      };
      transitionsBySource[state.id].push(id);
      states[state.id].internalTransitionIds.push(id);
    });
  }

  const collectCompleteRoutes = (
    rootTransition: SemanticTransition,
    transitionId: string,
    path: string[],
    visitedJunctions: ReadonlySet<string>,
  ): SemanticTransition['routes'] => {
    const transition = transitions[transitionId];
    const transitionIds = [...path, transitionId];
    if (transition.destinationKind === 'state') {
      const routePaths = transitionPaths(
        rootTransition.sourceStateId,
        transition.destinationStateId,
        rootTransition.kind,
        hierarchy.parentByStateId,
      );
      return [{
        transitionIds,
        destinationKind: 'state',
        destinationStateId: transition.destinationStateId,
        destinationJunctionId: null,
        ...routePaths,
      }];
    }
    const destinationJunction = model.junctions.find(
      (junction) => junction.id === transition.destinationStateId,
    );
    if (
      destinationJunction?.type === 'history'
      || destinationJunction?.type === 'deep-history'
    ) {
      const ownerLayerId = layerIdByJunctionId.get(destinationJunction.id);
      const ownerStateId = ownerLayerId === undefined
        ? null
        : layers[ownerLayerId]?.parentStateId ?? null;
      const routePaths = ownerStateId === null
        ? { exitStateIds: [], entryStateIds: [] }
        : transitionPaths(
          rootTransition.sourceStateId,
          ownerStateId,
          rootTransition.kind,
          hierarchy.parentByStateId,
        );
      return [{
        transitionIds,
        destinationKind: 'history',
        destinationStateId: null,
        destinationJunctionId: destinationJunction.id,
        ...routePaths,
      }];
    }
    if (visitedJunctions.has(transition.destinationStateId)) return [];
    const nextVisited = new Set(visitedJunctions);
    nextVisited.add(transition.destinationStateId);
    return (transitionsBySource[transition.destinationStateId] ?? [])
      .flatMap((nextTransitionId) =>
        collectCompleteRoutes(
          rootTransition,
          nextTransitionId,
          transitionIds,
          nextVisited,
        ));
  };

  for (const transition of Object.values(transitions)) {
    if (transition.sourceKind !== 'state') continue;
    transition.routes = collectCompleteRoutes(
      transition,
      transition.id,
      [],
      new Set(),
    );
    if (transition.destinationKind === 'junction' && transition.routes.length === 1) {
      transition.exitStateIds = [...transition.routes[0].exitStateIds];
      transition.entryStateIds = [...transition.routes[0].entryStateIds];
    }
  }

  const junctions: Record<string, SemanticJunction> = {};
  for (const junction of [...model.junctions].sort((left, right) =>
    left.id.localeCompare(right.id))) {
    junctions[junction.id] = {
      id: junction.id,
      layerId: layerIdByJunctionId.get(junction.id)!,
      kind: junction.type ?? 'junction',
      outgoingTransitionIds: [...(transitionsBySource[junction.id] ?? [])],
    };
  }

  const variables: Record<string, SemanticVariable> = {};
  for (const variable of [...model.variables].sort((left, right) =>
    left.id.localeCompare(right.id))) {
    variables[variable.id] = {
      id: variable.id,
      name: variable.name,
      cName: toCIdentifier(variable.name),
      type: variable.type,
      initialValue: parseInitialValue(
        variable.type,
        variable.initialValue,
        variable.currentValue,
      ),
    };
  }

  const variableIdByReference = new Map<string, string>();
  for (const variable of model.variables) {
    variableIdByReference.set(variable.id, variable.id);
    variableIdByReference.set(variable.name, variable.id);
  }
  const ioMappings: SemanticIOMapping[] = (model.hilConfig?.mappings ?? [])
    .map((mapping) => ({
      id: mapping.id,
      variableId: variableIdByReference.get(mapping.adiaVarId)!,
      channelId: mapping.channelId,
      direction: mapping.direction,
      conversionExpression: mapping.conversionExpr?.trim()
        ? parseCondition(mapping.conversionExpr, new Set(['x']))
        : null,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  return {
    diagnostics,
    ir: freezeSemanticModel({
      tickMs: model.tickMs,
      safetyMode: model.safetyMode,
      safeStateId: model.states.find((state) => state.isSafeState === true)?.id
        ?? null,
      rootLayerId: hierarchy.rootLayerId,
      states,
      layers,
      junctions,
      transitions,
      transitionsBySource,
      variables,
      ioMappings,
      activeSlotCount: [...slots.values()].filter(
        (slot): slot is number => slot !== null,
      ).length,
    }),
  };
};
