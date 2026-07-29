import { StateData, Layer, JunctionData, TransitionData } from '../../types/sm_types';

export interface StateMachineModel {
  states: StateData[];
  layers: Layer[];
  junctions: JunctionData[];
  transitions: TransitionData[];
}

export interface NavigationState {
  currentLayerId: string;
  layerStack: string[];
  layerPath: string[];
}

export interface DescendantCounts {
  stateCount: number;
  layerCount: number;
  descendantStateIds: string[];
  descendantLayerIds: string[];
}

export interface PruneResult {
  states: StateData[];
  layers: Layer[];
  junctions: JunctionData[];
  transitions: TransitionData[];
  navigation: NavigationState;
  deletedStateIds: string[];
  deletedLayerIds: string[];
  deletedJunctionIds: string[];
  deletedTransitionIds: string[];
}

export function countDescendants(
  targetStateId: string,
  states: StateData[],
  layers: Layer[]
): DescendantCounts {
  const descendantStateIds = new Set<string>();
  const descendantLayerIds = new Set<string>();

  const queue: string[] = [targetStateId];

  while (queue.length > 0) {
    const currentStateId = queue.shift()!;
    const childLayers = layers.filter(l => l.parentStateId === currentStateId);

    for (const layer of childLayers) {
      descendantLayerIds.add(layer.id);
      const childStates = states.filter(s =>
        s.parentId === layer.id ||
        layer.stateIds.includes(s.id) ||
        s.parentId === currentStateId
      );

      for (const childState of childStates) {
        if (!descendantStateIds.has(childState.id)) {
          descendantStateIds.add(childState.id);
          queue.push(childState.id);
        }
      }
    }
  }

  return {
    stateCount: descendantStateIds.size,
    layerCount: descendantLayerIds.size,
    descendantStateIds: Array.from(descendantStateIds),
    descendantLayerIds: Array.from(descendantLayerIds)
  };
}

export function pruneStateHierarchy(
  targetStateId: string,
  model: StateMachineModel,
  navigation: NavigationState
): PruneResult {
  const targetState = model.states.find(s => s.id === targetStateId);
  if (!targetState) {
    return {
      states: model.states,
      layers: model.layers,
      junctions: model.junctions,
      transitions: model.transitions,
      navigation,
      deletedStateIds: [],
      deletedLayerIds: [],
      deletedJunctionIds: [],
      deletedTransitionIds: []
    };
  }

  const { descendantStateIds, descendantLayerIds } = countDescendants(targetStateId, model.states, model.layers);

  const deletedStateIds = new Set<string>([targetStateId, ...descendantStateIds]);
  const deletedLayerIds = new Set<string>(descendantLayerIds);

  const deletedJunctionIds = new Set<string>();
  model.junctions.forEach(j => {
    if (j.parentId && deletedLayerIds.has(j.parentId)) {
      deletedJunctionIds.add(j.id);
    }
  });
  model.layers.forEach(l => {
    if (deletedLayerIds.has(l.id)) {
      l.junctionIds.forEach(jid => deletedJunctionIds.add(jid));
    }
  });

  const deletedTransitionIds = new Set<string>();
  model.transitions.forEach(t => {
    if (
      deletedStateIds.has(t.sourceId) ||
      deletedStateIds.has(t.targetId) ||
      deletedJunctionIds.has(t.sourceId) ||
      deletedJunctionIds.has(t.targetId)
    ) {
      deletedTransitionIds.add(t.id);
    }
  });
  model.layers.forEach(l => {
    if (deletedLayerIds.has(l.id)) {
      l.transitionIds.forEach(tid => deletedTransitionIds.add(tid));
    }
  });

  const remainingStates = model.states.filter(s => !deletedStateIds.has(s.id));

  const remainingLayers = model.layers
    .filter(l => !deletedLayerIds.has(l.id))
    .map(l => ({
      ...l,
      stateIds: l.stateIds.filter(sid => !deletedStateIds.has(sid)),
      junctionIds: l.junctionIds.filter(jid => !deletedJunctionIds.has(jid)),
      transitionIds: l.transitionIds.filter(tid => !deletedTransitionIds.has(tid))
    }));

  const remainingJunctions = model.junctions.filter(j => !deletedJunctionIds.has(j.id));
  const remainingTransitions = model.transitions.filter(t => !deletedTransitionIds.has(t.id));

  let nextCurrentLayerId = navigation.currentLayerId;
  if (deletedLayerIds.has(navigation.currentLayerId)) {
    const parentLayerOfDeletedState = remainingLayers.find(l => l.stateIds.includes(targetStateId)) ||
      remainingLayers.find(l => l.id === 'root') ||
      remainingLayers[0];
    nextCurrentLayerId = parentLayerOfDeletedState ? parentLayerOfDeletedState.id : 'root';
  }

  const nextLayerStack = navigation.layerStack.filter(lid => !deletedLayerIds.has(lid));
  const validStackIndices = navigation.layerStack
    .map((lid, idx) => (!deletedLayerIds.has(lid) ? idx : -1))
    .filter(idx => idx !== -1);
  const nextLayerPath = navigation.layerPath.filter((_, idx) => validStackIndices.includes(idx));

  return {
    states: remainingStates,
    layers: remainingLayers,
    junctions: remainingJunctions,
    transitions: remainingTransitions,
    navigation: {
      currentLayerId: nextCurrentLayerId,
      layerStack: nextLayerStack.length > 0 ? nextLayerStack : ['root'],
      layerPath: nextLayerPath.length > 0 ? nextLayerPath : ['Root']
    },
    deletedStateIds: Array.from(deletedStateIds),
    deletedLayerIds: Array.from(deletedLayerIds),
    deletedJunctionIds: Array.from(deletedJunctionIds),
    deletedTransitionIds: Array.from(deletedTransitionIds)
  };
}
