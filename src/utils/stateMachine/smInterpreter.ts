import type { ActionNode, ExpressionNode } from './smExpressions';
import type { VariableType } from '../../types/sm_types';
import type {
  SemanticLayer,
  SemanticModel,
  SemanticState,
  SemanticTransition,
  SemanticTransitionRoute,
} from './smSemanticModel';
import type { SemanticTraceFrame } from './smTrace';
import { xBridgesTraceAction } from './smTrace';
import {
  createXBRuntime,
  enterXBState,
  resetXBState,
  stepXBState,
  type XBRuntime,
} from './xbInterpreter';

export interface SemanticRuntimeError {
  code:
    | 'INVALID_ELAPSED_MS'
    | 'RUNTIME_EVALUATION_ERROR'
    | 'SAFETY_VIOLATION';
  message: string;
}

export interface SemanticRuntime {
  readonly ir: SemanticModel;
  data: Record<string, number | boolean>;
  activeSlots: Array<string | null>;
  stateActive: boolean[];
  stateTimersMs: number[];
  historySlots: Array<string | null>;
  deepHistory: Record<string, string[]>;
  xBridgesByStateId: Record<string, XBRuntime>;
  error: SemanticRuntimeError | null;
  traceSequence: number;
}

interface StepContext {
  runtime: SemanticRuntime;
  actions: string[];
}

interface SelectedTransition {
  transition: SemanticTransition;
  route: SemanticTransitionRoute;
}

const orderedStates = (ir: SemanticModel): SemanticState[] =>
  Object.values(ir.states).sort(
    (left, right) =>
      left.activityIndex - right.activityIndex || left.id.localeCompare(right.id),
  );

const orderedLayers = (ir: SemanticModel): SemanticLayer[] =>
  Object.values(ir.layers).sort((left, right) => {
    const leftSlot = left.activeSlot ?? Number.MAX_SAFE_INTEGER;
    const rightSlot = right.activeSlot ?? Number.MAX_SAFE_INTEGER;
    return leftSlot - rightSlot || left.id.localeCompare(right.id);
  });

const stateActionLabel = (state: SemanticState): string =>
  state.enumName.replace(/^SM_ST_/, '');

const evaluateExpression = (
  runtime: SemanticRuntime,
  expression: ExpressionNode,
): number | boolean => {
  if (expression.kind === 'literal') return expression.value;
  if (expression.kind === 'variable') {
    if (!Object.prototype.hasOwnProperty.call(runtime.data, expression.name)) {
      throw new Error(`variable '${expression.name}' is not present in runtime data`);
    }
    return runtime.data[expression.name];
  }
  if (expression.kind === 'unary') {
    const operand = evaluateExpression(runtime, expression.operand);
    if (expression.operator === '!') return !operand;
    if (expression.operator === '+') return +operand;
    return -Number(operand);
  }

  if (expression.operator === '&&') {
    return Boolean(evaluateExpression(runtime, expression.left))
      && Boolean(evaluateExpression(runtime, expression.right));
  }
  if (expression.operator === '||') {
    return Boolean(evaluateExpression(runtime, expression.left))
      || Boolean(evaluateExpression(runtime, expression.right));
  }

  const left = evaluateExpression(runtime, expression.left);
  const right = evaluateExpression(runtime, expression.right);
  switch (expression.operator) {
    case '==': return left === right;
    case '!=': return left !== right;
    case '<': return left < right;
    case '<=': return left <= right;
    case '>': return left > right;
    case '>=': return left >= right;
    case '+': return Number(left) + Number(right);
    case '-': return Number(left) - Number(right);
    case '*': return Number(left) * Number(right);
    case '/': {
      const divisor = Number(right);
      if (divisor === 0) throw new Error('division by zero');
      return Number(left) / divisor;
    }
    case '%': {
      const divisor = Number(right);
      if (divisor === 0) throw new Error('remainder by zero');
      return Number(left) % divisor;
    }
  }
};

export const coerceSemanticValue = (
  value: number | boolean,
  type: VariableType,
): number | boolean => {
  if (type === 'bool') return Boolean(value);
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`cannot coerce non-finite value to '${type}'`);
  }
  switch (type) {
    case 'float':
    case 'single':
      return Math.fround(numeric);
    case 'double':
      return numeric;
    case 'int8':
      return (Math.trunc(numeric) << 24) >> 24;
    case 'uint8':
      return Math.trunc(numeric) & 0xFF;
    case 'int16':
      return (Math.trunc(numeric) << 16) >> 16;
    case 'uint16':
      return Math.trunc(numeric) & 0xFFFF;
    case 'int':
    case 'int32':
      return Math.trunc(numeric) | 0;
    case 'uint':
    case 'uint32':
      return Math.trunc(numeric) >>> 0;
    case 'int64':
    case 'uint64': {
      const integer = Math.trunc(numeric);
      if (
        !Number.isSafeInteger(integer)
        || (type === 'uint64' && integer < 0)
      ) {
        throw new Error(`value '${numeric}' is outside deterministic '${type}' range`);
      }
      return integer;
    }
  }
};

const runActions = (
  context: StepContext,
  actions: readonly ActionNode[],
  traceLabel: string,
): void => {
  if (actions.length === 0) return;
  for (const action of actions) {
    const value = evaluateExpression(context.runtime, action.value);
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new Error(`action '${action.target}' produced a non-finite value`);
    }
    const target = context.runtime.ir.variables[action.target];
    if (target === undefined) {
      throw new Error(`action target '${action.target}' is absent from semantic IR`);
    }
    context.runtime.data[action.target] = coerceSemanticValue(
      value,
      target.type,
    );
  }
  context.actions.push(traceLabel);
};

const restoreDataDefaults = (runtime: SemanticRuntime): void => {
  const defaults: Record<string, number | boolean> = {};
  for (const id of Object.keys(runtime.ir.variables).sort((left, right) =>
    left.localeCompare(right))) {
    defaults[id] = runtime.ir.variables[id].initialValue;
  }
  runtime.data = defaults;
};

const clearConfiguration = (runtime: SemanticRuntime): void => {
  runtime.activeSlots.fill(null);
  runtime.stateActive.fill(false);
  runtime.stateTimersMs.fill(0);
};

const saturatingAdd = (value: number, delta: number): number =>
  Math.min(Number.MAX_SAFE_INTEGER, value + delta);

const markStateEntered = (
  context: StepContext,
  stateId: string,
): void => {
  const state = context.runtime.ir.states[stateId];
  context.runtime.stateActive[state.activityIndex] = true;
  context.runtime.stateTimersMs[state.activityIndex] = 0;
  if (state.activeSlot >= 0) {
    context.runtime.activeSlots[state.activeSlot] = state.id;
  }
  const xBridges = context.runtime.xBridgesByStateId[stateId];
  if (xBridges !== undefined) enterXBState(xBridges);
  runActions(
    context,
    state.entryActions,
    `entry:${stateActionLabel(state)}`,
  );
};

const collectActiveStateConfiguration = (
  runtime: SemanticRuntime,
  stateId: string,
  stateIds: string[],
): void => {
  const state = runtime.ir.states[stateId];
  if (!runtime.stateActive[state.activityIndex]) return;
  stateIds.push(stateId);
  for (const childLayerId of state.childLayerIds) {
    for (const childId of runtime.ir.layers[childLayerId].children) {
      collectActiveStateConfiguration(runtime, childId, stateIds);
    }
  }
};

const snapshotDescendantConfiguration = (
  runtime: SemanticRuntime,
  layerId: string,
): string[] => {
  const stateIds: string[] = [];
  for (const childId of runtime.ir.layers[layerId].children) {
    collectActiveStateConfiguration(runtime, childId, stateIds);
  }
  return stateIds;
};

const recordLayerHistory = (
  runtime: SemanticRuntime,
  layerId: string,
): void => {
  const layer = runtime.ir.layers[layerId];
  if (layer.activeSlot !== null) {
    runtime.historySlots[layer.activeSlot] =
      runtime.activeSlots[layer.activeSlot];
  }
  runtime.deepHistory[layerId] =
    snapshotDescendantConfiguration(runtime, layerId);
};

function exitLayerConfiguration(
  context: StepContext,
  layerId: string,
  recordHistory = true,
): void {
  const { runtime } = context;
  const layer = runtime.ir.layers[layerId];
  if (recordHistory) recordLayerHistory(runtime, layerId);
  if (layer.decomposition === 'OR') {
    const childId = layer.activeSlot === null
      ? null
      : runtime.activeSlots[layer.activeSlot];
    if (childId !== null) exitState(context, childId, false);
    return;
  }
  for (const childId of [...layer.children].reverse()) {
    exitState(context, childId, false);
  }
}

const exitState = (
  context: StepContext,
  stateId: string,
  recordContainingLayer = true,
): void => {
  const { runtime } = context;
  const state = runtime.ir.states[stateId];
  if (!state || !runtime.stateActive[state.activityIndex]) return;
  if (recordContainingLayer) recordLayerHistory(runtime, state.layerId);

  for (const childLayerId of [...state.childLayerIds].reverse()) {
    exitLayerConfiguration(context, childLayerId);
  }

  runActions(
    context,
    state.exitActions,
    `exit:${stateActionLabel(state)}`,
  );
  runtime.stateActive[state.activityIndex] = false;
  runtime.stateTimersMs[state.activityIndex] = 0;
  if (
    state.activeSlot >= 0
    && runtime.activeSlots[state.activeSlot] === state.id
  ) {
    runtime.activeSlots[state.activeSlot] = null;
  }
};

const transitionIsEnabled = (
  context: StepContext,
  transition: SemanticTransition,
  timerStateId: string,
): boolean => {
  const guard = Boolean(evaluateExpression(context.runtime, transition.guard));
  const timerState = context.runtime.ir.states[timerStateId];
  const timerMs = timerState === undefined
    ? 0
    : context.runtime.stateTimersMs[timerState.activityIndex];
  const temporal = transition.temporalThresholdMs !== null
    && timerMs >= transition.temporalThresholdMs;
  switch (transition.triggerMode) {
    case 'condition': return guard;
    case 'after': return temporal;
    case 'and': return guard && temporal;
    case 'or': return guard || temporal;
  }
};

const routeIsEnabled = (
  context: StepContext,
  route: SemanticTransitionRoute,
  timerStateId: string,
): boolean => route.transitionIds.every((transitionId) =>
  transitionIsEnabled(
    context,
    context.runtime.ir.transitions[transitionId],
    timerStateId,
  ));

const sortedTransitionIds = (
  ir: SemanticModel,
  transitionIds: readonly string[],
): string[] => [...transitionIds].sort((leftId, rightId) => {
  const left = ir.transitions[leftId];
  const right = ir.transitions[rightId];
  return left.priority - right.priority || left.id.localeCompare(right.id);
});

const selectTransitionPath = (
  context: StepContext,
  stateId: string,
  phase: 'outer' | 'inner',
): SelectedTransition | null => {
  const allowedKinds = phase === 'outer'
    ? new Set<SemanticTransition['kind']>(['outer', 'external-self'])
    : new Set<SemanticTransition['kind']>(['inner', 'internal-action']);
  const transitionIds = sortedTransitionIds(
    context.runtime.ir,
    context.runtime.ir.transitionsBySource[stateId] ?? [],
  );

  for (const transitionId of transitionIds) {
    const transition = context.runtime.ir.transitions[transitionId];
    if (!allowedKinds.has(transition.kind)) continue;
    for (const route of transition.routes) {
      if (routeIsEnabled(context, route, stateId)) {
        return { transition, route };
      }
    }
  }
  return null;
};

const exitConflictingConfiguration = (
  context: StepContext,
  entryStateIds: readonly string[],
): void => {
  for (const stateId of entryStateIds) {
    const state = context.runtime.ir.states[stateId];
    if (state.activeSlot < 0) continue;
    const activeStateId = context.runtime.activeSlots[state.activeSlot];
    if (activeStateId !== null && activeStateId !== stateId) {
      exitState(context, activeStateId);
    }
  }
};

const selectJunctionPath = (
  context: StepContext,
  junctionId: string,
  visited = new Set<string>(),
): string[] | null => {
  if (visited.has(junctionId)) return null;
  const nextVisited = new Set(visited);
  nextVisited.add(junctionId);
  const transitionIds = sortedTransitionIds(
    context.runtime.ir,
    context.runtime.ir.transitionsBySource[junctionId] ?? [],
  );
  for (const transitionId of transitionIds) {
    const transition = context.runtime.ir.transitions[transitionId];
    if (!transitionIsEnabled(context, transition, transition.sourceStateId)) {
      continue;
    }
    if (transition.destinationKind === 'state') return [transitionId];
    const destination = context.runtime.ir.junctions[
      transition.destinationStateId
    ];
    if (destination?.kind !== 'junction') continue;
    const suffix = selectJunctionPath(
      context,
      transition.destinationStateId,
      nextVisited,
    );
    if (suffix !== null) return [transitionId, ...suffix];
  }
  return null;
};

const enterLayerDefault = (
  context: StepContext,
  layerId: string,
): void => {
  const layer = context.runtime.ir.layers[layerId];
  if (layer.decomposition === 'AND') {
    for (const childId of layer.children) enterStateDeep(context, childId);
    return;
  }
  if (layer.defaultEntryId === null) return;
  if (layer.defaultEntryKind === 'state') {
    enterStateDeep(context, layer.defaultEntryId);
    return;
  }

  const transitionIds = selectJunctionPath(context, layer.defaultEntryId);
  if (transitionIds === null || transitionIds.length === 0) {
    throw new Error(`default junction '${layer.defaultEntryId}' has no enabled path`);
  }
  for (const transitionId of transitionIds) {
    const transition = context.runtime.ir.transitions[transitionId];
    runActions(
      context,
      transition.actions,
      `transition:${transition.id}`,
    );
  }
  const finalTransition = context.runtime.ir.transitions[
    transitionIds[transitionIds.length - 1]
  ];
  enterStateDeep(context, finalTransition.destinationStateId);
};

const enterChildLayers = (
  context: StepContext,
  stateId: string,
  excludedLayerId: string | null = null,
): void => {
  for (const childLayerId of context.runtime.ir.states[stateId].childLayerIds) {
    if (childLayerId === excludedLayerId) continue;
    enterLayerDefault(context, childLayerId);
  }
};

function enterStateDeep(
  context: StepContext,
  stateId: string,
): void {
  markStateEntered(context, stateId);
  enterChildLayers(context, stateId);
}

const enterStateAlongPath = (
  context: StepContext,
  stateIds: readonly string[],
  index: number,
  excludedFinalLayerId: string | null,
): void => {
  const stateId = stateIds[index];
  markStateEntered(context, stateId);
  const nextStateId = stateIds[index + 1];
  if (nextStateId === undefined) {
    enterChildLayers(context, stateId, excludedFinalLayerId);
    return;
  }

  const selectedLayerId = context.runtime.ir.states[nextStateId].layerId;
  for (const childLayerId of context.runtime.ir.states[stateId].childLayerIds) {
    if (childLayerId === selectedLayerId) {
      enterLayerAlongPath(
        context,
        childLayerId,
        stateIds,
        index + 1,
        excludedFinalLayerId,
      );
    } else {
      enterLayerDefault(context, childLayerId);
    }
  }
};

const enterLayerAlongPath = (
  context: StepContext,
  layerId: string,
  stateIds: readonly string[],
  index: number,
  excludedFinalLayerId: string | null,
): void => {
  const layer = context.runtime.ir.layers[layerId];
  const selectedStateId = stateIds[index];
  if (layer.decomposition === 'OR') {
    enterStateAlongPath(
      context,
      stateIds,
      index,
      excludedFinalLayerId,
    );
    return;
  }

  const hasActiveSibling = layer.children.some((childId) => {
    const child = context.runtime.ir.states[childId];
    return context.runtime.stateActive[child.activityIndex];
  });
  if (hasActiveSibling) {
    enterStateAlongPath(
      context,
      stateIds,
      index,
      excludedFinalLayerId,
    );
    return;
  }

  for (const childId of layer.children) {
    if (childId === selectedStateId) {
      enterStateAlongPath(
        context,
        stateIds,
        index,
        excludedFinalLayerId,
      );
    } else {
      enterStateDeep(context, childId);
    }
  }
};

const enterStatePath = (
  context: StepContext,
  stateIds: readonly string[],
  excludedFinalLayerId: string | null = null,
): void => {
  const firstStateId = stateIds[0];
  if (firstStateId === undefined) return;
  enterLayerAlongPath(
    context,
    context.runtime.ir.states[firstStateId].layerId,
    stateIds,
    0,
    excludedFinalLayerId,
  );
};

const restoreStateFromSnapshot = (
  context: StepContext,
  stateId: string,
  snapshot: ReadonlySet<string>,
): void => {
  markStateEntered(context, stateId);
  const state = context.runtime.ir.states[stateId];
  for (const childLayerId of state.childLayerIds) {
    const childLayer = context.runtime.ir.layers[childLayerId];
    const hasSavedChild = childLayer.children.some((childId) =>
      snapshot.has(childId));
    if (!hasSavedChild) {
      enterLayerDefault(context, childLayerId);
      continue;
    }
    if (childLayer.decomposition === 'OR') {
      const childId = childLayer.children.find((id) => snapshot.has(id));
      if (childId !== undefined) {
        restoreStateFromSnapshot(context, childId, snapshot);
      }
      continue;
    }
    for (const childId of childLayer.children) {
      if (snapshot.has(childId)) {
        restoreStateFromSnapshot(context, childId, snapshot);
      } else {
        enterStateDeep(context, childId);
      }
    }
  }
};

const restoreLayerHistory = (
  context: StepContext,
  layerId: string,
  deep: boolean,
  savedShallowStateId: string | null,
  savedDeepStateIds: readonly string[] | null,
): void => {
  const layer = context.runtime.ir.layers[layerId];
  if (deep && savedDeepStateIds !== null && savedDeepStateIds.length > 0) {
    const snapshot = new Set(savedDeepStateIds);
    if (layer.decomposition === 'OR') {
      const stateId = layer.children.find((id) => snapshot.has(id));
      if (stateId !== undefined) {
        restoreStateFromSnapshot(context, stateId, snapshot);
        return;
      }
    } else {
      for (const childId of layer.children) {
        if (snapshot.has(childId)) {
          restoreStateFromSnapshot(context, childId, snapshot);
        } else {
          enterStateDeep(context, childId);
        }
      }
      return;
    }
  }
  if (
    !deep
    && layer.decomposition === 'OR'
    && savedShallowStateId !== null
    && layer.children.includes(savedShallowStateId)
  ) {
    enterStateDeep(context, savedShallowStateId);
    return;
  }
  enterLayerDefault(context, layerId);
};

const topmostExitStateIds = (
  ir: SemanticModel,
  stateIds: readonly string[],
): string[] => {
  const exits = new Set(stateIds);
  return stateIds.filter((stateId) =>
    !ir.states[stateId].ancestorStateIds.some((ancestorId) =>
      exits.has(ancestorId)));
};

const commitTransition = (
  context: StepContext,
  selected: SelectedTransition,
): void => {
  const { transition, route } = selected;
  const historyJunction = route.destinationJunctionId === null
    ? null
    : context.runtime.ir.junctions[route.destinationJunctionId];
  const historyLayer = historyJunction === null
    ? null
    : context.runtime.ir.layers[historyJunction.layerId];
  if (transition.kind !== 'internal-action') {
    for (
      const stateId of topmostExitStateIds(
        context.runtime.ir,
        route.exitStateIds,
      )
    ) {
      exitState(context, stateId);
    }
    exitConflictingConfiguration(context, route.entryStateIds);
  }
  const savedShallowStateId = historyLayer?.activeSlot === null
    || historyLayer?.activeSlot === undefined
    ? null
    : context.runtime.historySlots[historyLayer.activeSlot];
  const savedDeepStateIds = historyLayer === null
    ? null
    : [...(context.runtime.deepHistory[historyLayer.id] ?? [])];
  for (const transitionId of route.transitionIds) {
    const pathTransition = context.runtime.ir.transitions[transitionId];
    runActions(
      context,
      pathTransition.actions,
      `transition:${pathTransition.id}`,
    );
  }
  if (transition.kind !== 'internal-action') {
    if (
      route.destinationKind === 'history'
      && historyJunction !== null
      && historyLayer !== null
    ) {
      enterStatePath(context, route.entryStateIds, historyLayer.id);
      const ownerStateId = historyLayer.parentStateId;
      if (ownerStateId !== null) {
        if (route.entryStateIds.length === 0) {
          exitLayerConfiguration(context, historyLayer.id, false);
        }
      }
      restoreLayerHistory(
        context,
        historyLayer.id,
        historyJunction.kind === 'deep-history',
        savedShallowStateId,
        savedDeepStateIds,
      );
      return;
    }
    if (route.entryStateIds.length > 0) {
      enterStatePath(context, route.entryStateIds);
    } else if (route.destinationStateId !== null) {
      const destination = context.runtime.ir.states[route.destinationStateId];
      if (context.runtime.stateActive[destination.activityIndex]) {
        enterChildLayers(context, destination.id);
      }
    }
  }
};

const executeState = (
  context: StepContext,
  stateId: string,
): boolean => {
  const state = context.runtime.ir.states[stateId];
  if (state.terminal) return false;

  const outer = selectTransitionPath(context, stateId, 'outer');
  if (outer !== null) {
    commitTransition(context, outer);
    return true;
  }

  runActions(
    context,
    state.duringActions,
    `during:${stateActionLabel(state)}`,
  );

  const xBridges = context.runtime.xBridgesByStateId[stateId];
  if (xBridges !== undefined) {
    const faults = stepXBState(xBridges, context.runtime.data);
    if (
      faults.length > 0
      && xBridges.ir.policy.numericFault === 'escalate'
    ) {
      throw new Error(
        `X-Bridges state '${state.id}' numeric fault: ${faults.join(', ')}`,
      );
    }
    context.actions.push(xBridgesTraceAction(stateActionLabel(state)));
  }

  const inner = selectTransitionPath(context, stateId, 'inner');
  if (inner !== null) {
    commitTransition(context, inner);
    return true;
  }

  let transitioned = false;
  for (const layerId of state.childLayerIds) {
    transitioned = executeLayer(context, layerId) || transitioned;
    if (!context.runtime.stateActive[state.activityIndex]) break;
  }
  return transitioned;
};

function executeLayer(
  context: StepContext,
  layerId: string,
): boolean {
  const layer = context.runtime.ir.layers[layerId];
  if (layer.decomposition === 'OR') {
    if (layer.activeSlot === null) return false;
    const activeStateId = context.runtime.activeSlots[layer.activeSlot];
    return activeStateId === null
      ? false
      : executeState(context, activeStateId);
  }
  let transitioned = false;
  const orderedChildIds = [...layer.children].sort((leftId, rightId) => {
    const left = context.runtime.ir.states[leftId];
    const right = context.runtime.ir.states[rightId];
    return left.priority - right.priority || left.id.localeCompare(right.id);
  });
  for (const childId of orderedChildIds) {
    const child = context.runtime.ir.states[childId];
    if (!context.runtime.stateActive[child.activityIndex]) continue;
    transitioned = executeState(context, childId) || transitioned;
    if (
      layer.parentStateId !== null
      && !context.runtime.stateActive[
        context.runtime.ir.states[layer.parentStateId].activityIndex
      ]
    ) {
      break;
    }
  }
  return transitioned;
}

const incrementActiveTimers = (
  runtime: SemanticRuntime,
  elapsedMs: number,
): void => {
  for (const state of orderedStates(runtime.ir)) {
    if (!runtime.stateActive[state.activityIndex]) continue;
    runtime.stateTimersMs[state.activityIndex] = saturatingAdd(
      runtime.stateTimersMs[state.activityIndex],
      elapsedMs,
    );
  }
};

const errorText = (error: SemanticRuntimeError | null): string | null =>
  error === null ? null : `${error.code}: ${error.message}`;

const createTraceFrame = (
  context: StepContext,
  elapsedMs: number,
): SemanticTraceFrame => {
  const { runtime } = context;
  const activeStateIds = orderedStates(runtime.ir)
    .filter((state) => runtime.stateActive[state.activityIndex])
    .map((state) => state.id);
  const data: Record<string, number | boolean> = {};
  for (const id of Object.keys(runtime.ir.variables).sort((left, right) =>
    left.localeCompare(right))) {
    data[id] = runtime.data[id];
  }
  const stateTimersMs: Record<string, number> = {};
  for (const state of orderedStates(runtime.ir)) {
    stateTimersMs[state.id] = runtime.stateTimersMs[state.activityIndex];
  }
  const history: Record<string, string | null> = {};
  for (const layer of orderedLayers(runtime.ir)) {
    if (layer.activeSlot !== null) {
      history[layer.id] = runtime.historySlots[layer.activeSlot];
    }
    const deepSnapshot = runtime.deepHistory[layer.id];
    if (layer.children.length > 0 && deepSnapshot !== undefined) {
      history[`${layer.id}:deep`] = JSON.stringify(deepSnapshot);
    }
  }

  return Object.freeze({
    sequence: runtime.traceSequence++,
    elapsedMs,
    activeStateIds: Object.freeze(activeStateIds),
    actions: Object.freeze([...context.actions]),
    data: Object.freeze(data),
    stateTimersMs: Object.freeze(stateTimersMs),
    history: Object.freeze(history),
    mappedOutputs: Object.freeze({}),
    ioEffects: Object.freeze({
      safeOutputsApplied: 0,
      watchdogKicks: 0,
    }),
    error: errorText(runtime.error),
  }) as SemanticTraceFrame;
};

const latchEvaluationError = (
  runtime: SemanticRuntime,
  error: unknown,
): void => {
  runtime.error = {
    code: 'RUNTIME_EVALUATION_ERROR',
    message: error instanceof Error ? error.message : String(error),
  };
};

export const createRuntime = (ir: SemanticModel): SemanticRuntime => {
  const stateCount = orderedStates(ir).reduce(
    (count, state) => Math.max(count, state.activityIndex + 1),
    0,
  );
  const runtime: SemanticRuntime = {
    ir,
    data: {},
    activeSlots: Array.from({ length: ir.activeSlotCount }, () => null),
    stateActive: Array.from({ length: stateCount }, () => false),
    stateTimersMs: Array.from({ length: stateCount }, () => 0),
    historySlots: Array.from({ length: ir.activeSlotCount }, () => null),
    deepHistory: {},
    xBridgesByStateId: Object.fromEntries(
      orderedStates(ir)
        .filter((state) => state.xBridges !== null)
        .map((state) => [state.id, createXBRuntime(state.xBridges!)]),
    ),
    error: null,
    traceSequence: 0,
  };
  restoreDataDefaults(runtime);
  return runtime;
};

export const initializeRuntime = (
  runtime: SemanticRuntime,
): SemanticTraceFrame => {
  restoreDataDefaults(runtime);
  clearConfiguration(runtime);
  runtime.historySlots.fill(null);
  runtime.deepHistory = {};
  for (const xBridges of Object.values(runtime.xBridgesByStateId)) {
    resetXBState(xBridges);
  }
  runtime.error = null;
  runtime.traceSequence = 0;
  const context: StepContext = { runtime, actions: [] };
  try {
    enterLayerDefault(context, runtime.ir.rootLayerId);
  } catch (error) {
    latchEvaluationError(runtime, error);
  }
  return createTraceFrame(context, 0);
};

export const stepRuntime = (
  runtime: SemanticRuntime,
  elapsedMs: number,
): SemanticTraceFrame => {
  const context: StepContext = { runtime, actions: [] };
  if (runtime.error !== null) return createTraceFrame(context, elapsedMs);
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    runtime.error = {
      code: 'INVALID_ELAPSED_MS',
      message: `elapsed time must be finite and non-negative; received ${elapsedMs}`,
    };
    return createTraceFrame(context, elapsedMs);
  }

  try {
    incrementActiveTimers(runtime, elapsedMs);
    executeLayer(context, runtime.ir.rootLayerId);
  } catch (error) {
    latchEvaluationError(runtime, error);
  }
  return createTraceFrame(context, elapsedMs);
};

export const resetRuntime = (
  runtime: SemanticRuntime,
): SemanticTraceFrame => {
  const context: StepContext = { runtime, actions: [] };
  try {
    const rootLayer = runtime.ir.layers[runtime.ir.rootLayerId];
    if (rootLayer.decomposition === 'OR' && rootLayer.activeSlot !== null) {
      const rootStateId = runtime.activeSlots[rootLayer.activeSlot];
      if (rootStateId !== null) exitState(context, rootStateId);
    } else {
      exitLayerConfiguration(context, rootLayer.id);
    }
  } catch {
    // Reset must still restore a complete default configuration.
  }

  restoreDataDefaults(runtime);
  clearConfiguration(runtime);
  runtime.historySlots.fill(null);
  runtime.deepHistory = {};
  for (const xBridges of Object.values(runtime.xBridgesByStateId)) {
    resetXBState(xBridges);
  }
  runtime.error = null;
  try {
    enterLayerDefault(context, runtime.ir.rootLayerId);
  } catch (error) {
    latchEvaluationError(runtime, error);
  }
  return createTraceFrame(context, 0);
};

export const faultRuntime = (
  runtime: SemanticRuntime,
): SemanticTraceFrame => {
  const context: StepContext = { runtime, actions: [] };
  try {
    exitLayerConfiguration(context, runtime.ir.rootLayerId);
    const safeStateId = runtime.ir.safeStateId;
    if (runtime.ir.safetyMode && safeStateId !== null) {
      enterStatePath(context, [
        ...[...runtime.ir.states[safeStateId].ancestorStateIds].reverse(),
        safeStateId,
      ]);
    }
  } catch (error) {
    latchEvaluationError(runtime, error);
    return createTraceFrame(context, 0);
  }
  runtime.error = {
    code: 'SAFETY_VIOLATION',
    message: 'safety violation',
  };
  return createTraceFrame(context, 0);
};
