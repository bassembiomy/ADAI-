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

export function pruneMultipleStatesHierarchy(
  targetStateIds: string[],
  model: StateMachineModel,
  navigation: NavigationState
): PruneResult {
  const validStateIds = targetStateIds.filter(id => model.states.some(s => s.id === id));
  if (validStateIds.length === 0) {
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

  const deletedStateIds = new Set<string>();
  const deletedLayerIds = new Set<string>();

  for (const stateId of validStateIds) {
    deletedStateIds.add(stateId);
    const { descendantStateIds, descendantLayerIds } = countDescendants(stateId, model.states, model.layers);
    descendantStateIds.forEach(id => deletedStateIds.add(id));
    descendantLayerIds.forEach(id => deletedLayerIds.add(id));
  }

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
    const parentLayerOfDeletedState = remainingLayers.find(l => validStateIds.some(sid => l.stateIds.includes(sid))) ||
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

export function pruneStateHierarchy(
  targetStateId: string,
  model: StateMachineModel,
  navigation: NavigationState
): PruneResult {
  return pruneMultipleStatesHierarchy([targetStateId], model, navigation);
}

export interface StateMachineExplorerSnapshot {
  states: StateData[];
  layers: Layer[];
  junctions: JunctionData[];
  transitions: TransitionData[];
  diagrams?: import('../../types/sm_types').StateMachineDiagramData[];
  revision?: number;
}

export interface StateMoveImpact {
  valid: boolean;
  preserved: string[];
  crossRegion: string[];
  invalid: string[];
  reason?: string;
}

export function analyzeStateMove(
  snapshot: StateMachineExplorerSnapshot,
  elementIds: string[],
  targetRegionId: string
): StateMoveImpact {
  const targetLayer = snapshot.layers.find(l => l.id === targetRegionId);
  if (!targetLayer) {
    return {
      valid: false,
      preserved: [],
      crossRegion: [],
      invalid: [],
      reason: `Target region '${targetRegionId}' does not exist`,
    };
  }

  const movedIds = new Set(elementIds);

  // Check for circular containment: cannot move a state into its own descendant layer
  for (const elementId of elementIds) {
    const isState = snapshot.states.some(s => s.id === elementId);
    if (isState) {
      const descendants = countDescendants(elementId, snapshot.states, snapshot.layers);
      if (descendants.descendantLayerIds.includes(targetRegionId)) {
        return {
          valid: false,
          preserved: [],
          crossRegion: [],
          invalid: [],
          reason: `Cannot move state '${elementId}' into its own descendant region '${targetRegionId}'`,
        };
      }
    }
  }

  const preserved: string[] = [];
  const crossRegion: string[] = [];
  const invalid: string[] = [];

  // Analyze connected transitions
  for (const transition of snapshot.transitions) {
    const sourceMoving = movedIds.has(transition.sourceId);
    const targetMoving = movedIds.has(transition.targetId);

    if (!sourceMoving && !targetMoving) {
      continue;
    }

    if (sourceMoving && targetMoving) {
      // Both endpoints move together into targetRegionId
      preserved.push(transition.id);
    } else {
      // One endpoint moves, the other stays
      const stationaryId = sourceMoving ? transition.targetId : transition.sourceId;
      // Is stationary endpoint already in targetRegionId?
      const inTarget =
        targetLayer.stateIds.includes(stationaryId) ||
        targetLayer.junctionIds.includes(stationaryId);

      if (inTarget) {
        preserved.push(transition.id);
      } else {
        // Crosses region boundary
        invalid.push(transition.id);
      }
    }
  }

  return {
    valid: true,
    preserved,
    crossRegion,
    invalid,
  };
}

export function moveStateMachineElements(
  snapshot: StateMachineExplorerSnapshot,
  elementIds: string[],
  targetRegionId: string,
  invalidTransitionsToPrune?: string[]
): StateMachineExplorerSnapshot {
  const targetLayer = snapshot.layers.find(l => l.id === targetRegionId);
  if (!targetLayer) {
    throw new Error(`Target region '${targetRegionId}' not found`);
  }

  const movedIds = new Set(elementIds);
  const pruneTransitions = new Set(invalidTransitionsToPrune ?? []);

  // Update states
  const nextStates = snapshot.states.map(s => {
    if (movedIds.has(s.id)) {
      return {
        ...s,
        parentId: targetRegionId,
        regionId: targetRegionId,
      };
    }
    return s;
  });

  // Update junctions
  const nextJunctions = snapshot.junctions.map(j => {
    if (movedIds.has(j.id)) {
      return {
        ...j,
        parentId: targetRegionId,
      };
    }
    return j;
  });

  // Filter transitions
  const nextTransitions = snapshot.transitions.filter(t => !pruneTransitions.has(t.id));

  // Update layers
  const nextLayers = snapshot.layers.map(layer => {
    const isTarget = layer.id === targetRegionId;
    let stateIds = layer.stateIds.filter(id => !movedIds.has(id));
    let junctionIds = layer.junctionIds.filter(id => !movedIds.has(id));
    let transitionIds = layer.transitionIds.filter(id => !pruneTransitions.has(id));

    if (isTarget) {
      for (const id of elementIds) {
        if (snapshot.states.some(s => s.id === id) && !stateIds.includes(id)) {
          stateIds.push(id);
        }
        if (snapshot.junctions.some(j => j.id === id) && !junctionIds.includes(id)) {
          junctionIds.push(id);
        }
      }
    }

    return {
      ...layer,
      stateIds,
      junctionIds,
      transitionIds,
    };
  });

  return {
    ...snapshot,
    states: nextStates,
    layers: nextLayers,
    junctions: nextJunctions,
    transitions: nextTransitions,
    revision: (snapshot.revision ?? 1) + 1,
  };
}
