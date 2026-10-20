import type { JunctionData, Layer, TransitionData } from '../../types/sm_types';

export type StateHistoryType = 'none' | 'shallow' | 'deep';

const HISTORY_JUNCTION_TYPES = new Set(['history', 'deep-history']);

export const isHistoryJunction = (junction: JunctionData): boolean =>
  junction.type !== undefined && HISTORY_JUNCTION_TYPES.has(junction.type);

/** The state's own child region: the layer the canvas opens when entering the state. */
export const findStateRegionLayer = (
  layers: readonly Layer[],
  stateId: string,
): Layer | undefined => layers.find((layer) => layer.parentStateId === stateId);

/** History junctions that belong to the state's own region layer. */
export const findStateHistoryJunctions = (
  layers: readonly Layer[],
  junctions: readonly JunctionData[],
  stateId: string,
): JunctionData[] => {
  const region = findStateRegionLayer(layers, stateId);
  if (!region) return [];
  return junctions.filter(
    (junction) => region.junctionIds.includes(junction.id) && isHistoryJunction(junction),
  );
};

/** The history setting is the junction in the child layer (what the simulator and the C generator read). */
export const getStateHistoryType = (
  layers: readonly Layer[],
  junctions: readonly JunctionData[],
  stateId: string,
): StateHistoryType => {
  const found = findStateHistoryJunctions(layers, junctions, stateId);
  if (found.some((junction) => junction.type === 'deep-history')) return 'deep';
  if (found.length > 0) return 'shallow';
  return 'none';
};

export const historyJunctionTypeOf = (
  history: Exclude<StateHistoryType, 'none'>,
): 'history' | 'deep-history' => (history === 'deep' ? 'deep-history' : 'history');

export const historyJunctionName = (type: 'history' | 'deep-history'): string =>
  type === 'deep-history' ? 'H*' : 'H';

export interface StateHistoryPlan {
  /** Child region to create first, when the state has none yet (same shape as the canvas enterLayer). */
  layerToCreate: Layer | null;
  /** Region layer that must hold the history junction. */
  layerId: string | null;
  /** Existing history junction re-typed in place (keeps the transitions that target it). */
  retype: { id: string; type: 'history' | 'deep-history'; name: string } | null;
  /** History junctions to delete (with their transitions). */
  removeJunctionIds: string[];
  /** Junction type to create in `layerId`. */
  create: 'history' | 'deep-history' | null;
}

export const planStateHistoryChange = (input: {
  layers: readonly Layer[];
  junctions: readonly JunctionData[];
  state: { id: string; name: string };
  newType: StateHistoryType;
  newLayerId: string;
}): StateHistoryPlan => {
  const { layers, junctions, state, newType, newLayerId } = input;
  const region = findStateRegionLayer(layers, state.id);
  const existing = findStateHistoryJunctions(layers, junctions, state.id);

  if (newType === 'none') {
    return {
      layerToCreate: null,
      layerId: region?.id ?? null,
      retype: null,
      removeJunctionIds: existing.map((junction) => junction.id),
      create: null,
    };
  }

  const type = historyJunctionTypeOf(newType);
  if (existing.length > 0) {
    const [keep, ...extra] = existing;
    return {
      layerToCreate: null,
      layerId: region?.id ?? null,
      retype: keep.type === type
        ? null
        : { id: keep.id, type, name: historyJunctionName(type) },
      removeJunctionIds: extra.map((junction) => junction.id),
      create: null,
    };
  }

  const layerToCreate: Layer | null = region
    ? null
    : {
      id: newLayerId,
      name: state.name,
      parentStateId: state.id,
      stateIds: [],
      transitionIds: [],
      junctionIds: [],
    };
  return {
    layerToCreate,
    layerId: region?.id ?? newLayerId,
    retype: null,
    removeJunctionIds: [],
    create: type,
  };
};

/** Removes junctions together with the transitions that start or end at them. */
export const removeJunctionsFromModel = (
  model: {
    layers: readonly Layer[];
    junctions: readonly JunctionData[];
    transitions: readonly TransitionData[];
  },
  junctionIds: readonly string[],
): { layers: Layer[]; junctions: JunctionData[]; transitions: TransitionData[] } => {
  const removed = new Set(junctionIds);
  const removedTransitionIds = new Set(
    model.transitions
      .filter((t) => removed.has(t.sourceId) || removed.has(t.targetId))
      .map((t) => t.id),
  );
  return {
    layers: model.layers.map((layer) => ({
      ...layer,
      junctionIds: layer.junctionIds.filter((id) => !removed.has(id)),
      transitionIds: layer.transitionIds.filter((id) => !removedTransitionIds.has(id)),
    })),
    junctions: model.junctions.filter((junction) => !removed.has(junction.id)),
    transitions: model.transitions.filter((t) => !removedTransitionIds.has(t.id)),
  };
};

export interface StateHistoryModel {
  layers: Layer[];
  junctions: JunctionData[];
  transitions: TransitionData[];
}

/**
 * Applies the History setting of a composite state to the model: the history
 * junction lives in the state's own region layer, created the way the canvas
 * does when entering the state (`parentId` stays null like any canvas junction).
 */
export const applyStateHistoryChange = (
  model: StateHistoryModel,
  state: { id: string; name: string },
  newType: StateHistoryType,
  ids: { newLayerId: string; newJunctionId: string },
  position: { x: number; y: number },
  junctionColor: string,
): StateHistoryModel => {
  const plan = planStateHistoryChange({
    layers: model.layers,
    junctions: model.junctions,
    state,
    newType,
    newLayerId: ids.newLayerId,
  });
  let { layers, junctions, transitions } = removeJunctionsFromModel(model, plan.removeJunctionIds);
  if (plan.layerToCreate) layers = [...layers, plan.layerToCreate];
  if (plan.retype) {
    const { id, type, name } = plan.retype;
    junctions = junctions.map((junction) => junction.id === id ? { ...junction, type, name } : junction);
  }
  if (plan.create && plan.layerId) {
    const created: JunctionData = {
      id: ids.newJunctionId,
      x: position.x,
      y: position.y,
      name: historyJunctionName(plan.create),
      color: junctionColor,
      parentId: null,
      type: plan.create,
      autostart: false,
    };
    junctions = [...junctions, created];
    layers = layers.map((layer) => layer.id === plan.layerId
      ? { ...layer, junctionIds: [...layer.junctionIds, created.id] }
      : layer);
  }
  return { layers, junctions, transitions };
};
