import type { StateData } from '../../types/sm_types';
import type { AnyStateMachineModel, ModelDiagnostic, StateMachineLayerV4 } from './smModel';
import { parseActions, parseInternalTransitions } from './smExpressions';
import { adaptXBModel } from './xbModelAdapter';

/*
 * Simulation-only (plant) regions. StateData.simulationOnly marks a region of the root parallel
 * layer; the region and everything below it is part of the plant. The simulation runs it, the
 * generated C does not contain it (see pruneSimulationOnlyModel).
 */

const diagnostic = (code: string, message: string, elementId?: string): ModelDiagnostic => ({
  code, message, elementId, severity: 'error',
});

interface PlantContext {
  readonly layerOfJunction: ReadonlyMap<string, StateMachineLayerV4>;
  /** Every state of a correctly placed plant subtree, flags included. */
  readonly inside: ReadonlySet<string>;
  readonly insideLayerIds: ReadonlySet<string>;
}

const flagged = (state: StateData): boolean => state.simulationOnly === true;

const analyse = (model: AnyStateMachineModel): { context: PlantContext; misplaced: StateData[] } => {
  const layerOfState = new Map<string, StateMachineLayerV4>();
  const layerOfJunction = new Map<string, StateMachineLayerV4>();
  for (const layer of model.layers) {
    for (const id of layer.stateIds) if (!layerOfState.has(id)) layerOfState.set(id, layer);
    for (const id of layer.junctionIds) if (!layerOfJunction.has(id)) layerOfJunction.set(id, layer);
  }
  const placedCorrectly = (state: StateData): boolean => {
    const layer = layerOfState.get(state.id);
    if (layer === undefined || layer.decomposition !== 'AND') return false;
    if (layer.parentStateId === null) return true;
    return layerOfState.get(layer.parentStateId)?.parentStateId === null;
  };
  const roots: StateData[] = [];
  const misplaced: StateData[] = [];
  for (const state of model.states) {
    if (!flagged(state)) continue;
    (placedCorrectly(state) ? roots : misplaced).push(state);
  }
  const inside = new Set<string>();
  const insideLayerIds = new Set<string>();
  const queue = roots.map((state) => state.id);
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (inside.has(id)) continue;
    inside.add(id);
    for (const layer of model.layers) {
      if (layer.parentStateId !== id) continue;
      insideLayerIds.add(layer.id);
      queue.push(...layer.stateIds);
    }
  }
  // A flag below a plant region is redundant, not misplaced.
  return {
    context: { layerOfJunction, inside, insideLayerIds },
    misplaced: misplaced.filter((state) => !inside.has(state.id)),
  };
};

export const hasSimulationOnly = (model: Pick<AnyStateMachineModel, 'states'>): boolean =>
  model.states.some(flagged);

/** Ids of every state of a plant subtree (empty when the chart has none). */
export const simulationOnlyStateIds = (model: AnyStateMachineModel): ReadonlySet<string> =>
  analyse(model).context.inside;

export const validateSimulationOnly = (model: AnyStateMachineModel): ModelDiagnostic[] => {
  if (!hasSimulationOnly(model)) return [];
  const diagnostics: ModelDiagnostic[] = [];
  const { context, misplaced } = analyse(model);
  for (const state of misplaced) {
    diagnostics.push(diagnostic(
      'SM_SIMULATION_ONLY_PLACEMENT',
      `State '${state.name || state.id}' is marked simulation-only but is not a region of the root parallel layer; only a region of the root parallel (AND) layer can be a plant.`,
      state.id,
    ));
  }
  const { inside } = context;
  if (inside.size === 0) return diagnostics;

  const nodeInside = (id: string): boolean => {
    if (inside.has(id)) return true;
    const owner = context.layerOfJunction.get(id)?.parentStateId;
    return owner !== null && owner !== undefined && inside.has(owner);
  };
  for (const transition of model.transitions) {
    if (nodeInside(transition.sourceId) === nodeInside(transition.targetId)) continue;
    diagnostics.push(diagnostic(
      'SM_SIMULATION_ONLY_TRANSITION',
      `Transition '${transition.id}' connects a simulation-only (plant) state with a controller state; a plant region cannot be entered or left by a transition.`,
      transition.id,
    ));
  }

  const idByReference = new Map<string, string>();
  for (const variable of model.variables) {
    idByReference.set(variable.id, variable.id);
    idByReference.set(variable.name, variable.id);
  }
  const writtenBy = { plant: new Map<string, string>(), controller: new Map<string, string>() };
  const note = (side: 'plant' | 'controller', reference: string, owner: string): void => {
    const id = idByReference.get(reference);
    if (id !== undefined && !writtenBy[side].has(id)) writtenBy[side].set(id, owner);
  };
  const noteActions = (side: 'plant' | 'controller', source: string, owner: string): void => {
    try {
      for (const action of parseActions(source)) if (action.kind === 'assign') note(side, action.target, owner);
    } catch { /* reported by the expression validation */ }
  };
  for (const state of model.states) {
    const side = inside.has(state.id) ? 'plant' : 'controller';
    noteActions(side, state.entry, state.id);
    noteActions(side, state.during, state.id);
    noteActions(side, state.exit, state.id);
    try {
      for (const internal of parseInternalTransitions(state.internalTransitions ?? '')) {
        for (const action of internal.actions) if (action.kind === 'assign') note(side, action.target, state.id);
      }
    } catch { /* reported by the expression validation */ }
    if (state.isXBridges === true) {
      const adapted = adaptXBModel(state.xBridgesModel);
      for (const mapping of adapted.model?.mappings ?? []) {
        if (mapping.direction === 'out') note(side, mapping.smVarId, state.id);
      }
    }
  }
  for (const transition of model.transitions) {
    noteActions(nodeInside(transition.sourceId) ? 'plant' : 'controller', transition.action, transition.id);
  }
  for (const mapping of model.hilConfig?.mappings ?? []) {
    if (mapping.direction === 'read') note('controller', mapping.adiaVarId, `I/O mapping '${mapping.id}'`);
  }
  for (const [variableId, plantOwner] of writtenBy.plant) {
    const controllerOwner = writtenBy.controller.get(variableId);
    if (controllerOwner === undefined) continue;
    diagnostics.push(diagnostic(
      'SM_SIMULATION_ONLY_SHARED_WRITE',
      `Variable '${variableId}' is written by the plant ('${plantOwner}') and by the controller ('${controllerOwner}'); a variable must have one writer, the plant or the controller.`,
      variableId,
    ));
  }
  return diagnostics;
};

/**
 * The chart as if the plant regions did not exist: their states, layers, junctions, transitions
 * (and with them actions and X-Bridges diagrams) are removed. Variables stay: those written only
 * by the plant become inputs of the generated chart.
 */
export const pruneSimulationOnlyModel = <T extends AnyStateMachineModel>(model: T): T => {
  const { context } = analyse(model);
  const { inside, insideLayerIds, layerOfJunction } = context;
  if (inside.size === 0) return model;
  const junctionGone = (id: string): boolean => {
    const layer = layerOfJunction.get(id);
    return layer !== undefined && insideLayerIds.has(layer.id);
  };
  const gone = (id: string): boolean => inside.has(id) || junctionGone(id);
  const transitions = model.transitions.filter((t) => !gone(t.sourceId) && !gone(t.targetId));
  const transitionIds = new Set(transitions.map((t) => t.id));
  return {
    ...model,
    states: model.states
      .filter((state) => !inside.has(state.id))
      .map((state) => ({ ...state, children: state.children.filter((id) => !inside.has(id)) })),
    junctions: model.junctions.filter((junction) => !junctionGone(junction.id)),
    transitions,
    layers: model.layers
      .filter((layer) => !insideLayerIds.has(layer.id))
      .map((layer) => ({
        ...layer,
        stateIds: layer.stateIds.filter((id) => !inside.has(id)),
        transitionIds: layer.transitionIds.filter((id) => transitionIds.has(id)),
      })),
  };
};
