import type { ActionNode, ExpressionNode } from './smExpressions';
import type {
  SemanticLayer,
  SemanticModel,
  SemanticState,
  SemanticTransition,
  SemanticTransitionRoute,
} from './smSemanticModel';
import type { SemanticTraceFrame } from './smTrace';

export interface SemanticRuntimeError {
  code: 'INVALID_ELAPSED_MS' | 'RUNTIME_EVALUATION_ERROR';
  message: string;
}

export interface SemanticRuntime {
  readonly ir: SemanticModel;
  data: Record<string, number | boolean>;
  activeSlots: Array<string | null>;
  stateActive: boolean[];
  stateTimersMs: number[];
  historySlots: Array<string | null>;
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
    context.runtime.data[action.target] = value;
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
  runActions(
    context,
    state.entryActions,
    `entry:${stateActionLabel(state)}`,
  );
};

const exitState = (
  context: StepContext,
  stateId: string,
): void => {
  const { runtime } = context;
  const state = runtime.ir.states[stateId];
  if (!state || !runtime.stateActive[state.activityIndex]) return;

  for (const childLayerId of [...state.childLayerIds].reverse()) {
    const childLayer = runtime.ir.layers[childLayerId];
    if (childLayer.decomposition === 'OR') {
      const childId = childLayer.activeSlot === null
        ? null
        : runtime.activeSlots[childLayer.activeSlot];
      if (childId !== null) exitState(context, childId);
    } else {
      throw new Error(
        `AND layer '${childLayer.id}' requires the parallel interpreter extension`,
      );
    }
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
    throw new Error(
      `AND layer '${layer.id}' requires the parallel interpreter extension`,
    );
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
): void => {
  for (const childLayerId of context.runtime.ir.states[stateId].childLayerIds) {
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

const enterStatePath = (
  context: StepContext,
  stateIds: readonly string[],
): void => {
  for (const stateId of stateIds) markStateEntered(context, stateId);
  const destinationId = stateIds[stateIds.length - 1];
  if (destinationId !== undefined) enterChildLayers(context, destinationId);
};

const commitTransition = (
  context: StepContext,
  selected: SelectedTransition,
): void => {
  const { transition, route } = selected;
  if (transition.kind !== 'internal-action') {
    for (const stateId of route.exitStateIds) exitState(context, stateId);
    exitConflictingConfiguration(context, route.entryStateIds);
  }
  for (const transitionId of route.transitionIds) {
    const pathTransition = context.runtime.ir.transitions[transitionId];
    runActions(
      context,
      pathTransition.actions,
      `transition:${pathTransition.id}`,
    );
  }
  if (transition.kind !== 'internal-action') {
    if (route.destinationKind !== 'state') {
      throw new Error('history destinations are not available in the OR interpreter');
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

  const inner = selectTransitionPath(context, stateId, 'inner');
  if (inner !== null) {
    commitTransition(context, inner);
    return true;
  }

  for (const layerId of state.childLayerIds) {
    if (executeLayer(context, layerId)) return true;
  }
  return false;
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
  throw new Error(
    `AND layer '${layer.id}' requires the parallel interpreter extension`,
  );
}

const incrementActiveTimers = (
  runtime: SemanticRuntime,
  elapsedMs: number,
): void => {
  for (const state of orderedStates(runtime.ir)) {
    if (!runtime.stateActive[state.activityIndex]) continue;
    runtime.stateTimersMs[state.activityIndex] = Math.min(
      Number.MAX_SAFE_INTEGER,
      runtime.stateTimersMs[state.activityIndex] + elapsedMs,
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
  }

  return Object.freeze({
    sequence: runtime.traceSequence++,
    elapsedMs,
    activeStateIds: Object.freeze(activeStateIds),
    actions: Object.freeze([...context.actions]),
    data: Object.freeze(data),
    stateTimersMs: Object.freeze(stateTimersMs),
    history: Object.freeze(history),
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
      for (const stateId of [...rootLayer.children].reverse()) {
        exitState(context, stateId);
      }
    }
  } catch {
    // Reset must still restore a complete default configuration.
  }

  restoreDataDefaults(runtime);
  clearConfiguration(runtime);
  runtime.historySlots.fill(null);
  runtime.error = null;
  try {
    enterLayerDefault(context, runtime.ir.rootLayerId);
  } catch (error) {
    latchEvaluationError(runtime, error);
  }
  return createTraceFrame(context, 0);
};
