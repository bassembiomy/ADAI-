import type { ActionNode, ExpressionNode } from './smExpressions';
import type { SemanticModel, SemanticTransition, SemanticVariable } from './smSemanticModel';

/*
 * Scenario planning for the generated transition tests.
 *
 * A transition test must start from a configuration in which the transition's source state is
 * active (with its ancestors, default descendants and parallel regions), must supply values
 * for the guard's variables and the source state's timer that make the guard true or false,
 * and must predict the observable effect (exit, transition and entry actions) from those
 * values. Everything here is derived from the semantic model only.
 */

export type ScenarioValue = number | boolean;
export type ScenarioEnvironment = Record<string, ScenarioValue>;

export interface ForcedConfiguration {
  /** Active states in activation order (outermost first). */
  readonly activeStateIds: readonly string[];
  /** Active-slot assignments that make the configuration consistent. */
  readonly slots: readonly { slot: number; stateId: string }[];
}

const lexicographicallyLess = (a: readonly number[], b: readonly number[]): boolean => {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return false;
};

const FLOAT_TYPES = new Set(['float', 'single', 'double']);

/** Enter a layer: the chosen child (or the default entry) for OR, every child for AND. */
const buildConfiguration = (
  ir: SemanticModel,
  path: readonly string[],
): ForcedConfiguration | null => {
  const active: string[] = [];
  let failed = false;

  const activate = (stateId: string, pathIndex: number): void => {
    const state = ir.states[stateId];
    if (!state || active.includes(stateId)) {
      failed = failed || !state;
      return;
    }
    active.push(stateId);
    for (const layerId of state.childLayerIds) {
      enterLayer(layerId, pathIndex);
    }
  };

  const enterLayer = (layerId: string, pathIndex: number): void => {
    const layer = ir.layers[layerId];
    if (!layer) {
      failed = true;
      return;
    }
    const pathChild = pathIndex < path.length && layer.children.includes(path[pathIndex])
      ? path[pathIndex]
      : null;
    if (layer.decomposition === 'AND') {
      for (const childId of layer.children) {
        activate(childId, childId === pathChild ? pathIndex + 1 : path.length);
      }
      return;
    }
    const chosen = pathChild ?? (layer.defaultEntryKind === 'state' ? layer.defaultEntryId : null);
    if (!chosen) {
      failed = true;
      return;
    }
    activate(chosen, pathChild ? pathIndex + 1 : path.length);
  };

  enterLayer(ir.rootLayerId, 0);
  if (failed) return null;

  const slots: { slot: number; stateId: string }[] = [];
  for (const stateId of active) {
    const state = ir.states[stateId];
    if (state.activeSlot >= 0) slots.push({ slot: state.activeSlot, stateId });
  }
  return { activeStateIds: active, slots };
};

/** The configuration SM_Init enters, or null when it cannot be derived (junction defaults). */
export const defaultConfiguration = (ir: SemanticModel): ForcedConfiguration | null =>
  buildConfiguration(ir, []);

/** A configuration in which `stateId` is active, entered through its ancestors. */
export const configurationContaining = (
  ir: SemanticModel,
  stateId: string,
): ForcedConfiguration | null => {
  const state = ir.states[stateId];
  if (!state) return null;
  return buildConfiguration(ir, [...state.ancestorStateIds, stateId]);
};

/** Default descendants entered below `stateId` when it is entered as a transition target. */
export const defaultDescendants = (ir: SemanticModel, stateId: string): string[] => {
  const config = configurationContaining(ir, stateId);
  if (!config) return [];
  const own = ir.states[stateId];
  const ancestors = new Set(own?.ancestorStateIds ?? []);
  return config.activeStateIds.filter((id) => {
    if (id === stateId || ancestors.has(id)) return false;
    const state = ir.states[id];
    return state !== undefined && state.ancestorStateIds.includes(stateId);
  });
};

const findVariable = (
  ir: SemanticModel,
  node: { name: string; cName: string },
): SemanticVariable | undefined =>
  ir.variables[node.name]
  ?? Object.values(ir.variables).find((v) => v.id === node.name || v.name === node.name || v.cName === node.cName);

const asNumber = (value: ScenarioValue): number => (typeof value === 'boolean' ? (value ? 1 : 0) : value);

/** C-like evaluation; undefined when the expression cannot be evaluated exactly. */
export const evaluateExpression = (
  ir: SemanticModel,
  expr: ExpressionNode,
  env: Readonly<ScenarioEnvironment>,
): ScenarioValue | undefined => {
  switch (expr.kind) {
    case 'literal':
      return expr.value;
    case 'variable': {
      const variable = findVariable(ir, expr);
      return variable ? env[variable.id] : undefined;
    }
    case 'unary': {
      const operand = evaluateExpression(ir, expr.operand, env);
      if (operand === undefined) return undefined;
      if (expr.operator === '!') return asNumber(operand) === 0;
      if (expr.operator === '-') return -asNumber(operand);
      return asNumber(operand);
    }
    case 'call': {
      const arg = evaluateExpression(ir, expr.argument, env);
      if (arg === undefined) return undefined;
      const n = asNumber(arg);
      switch (expr.functionName) {
        case 'abs': return Math.abs(n);
        case 'sqrt': return n < 0 ? undefined : Math.sqrt(n);
        case 'sin': return Math.sin(n);
        case 'cos': return Math.cos(n);
        case 'exp': return Math.exp(n);
        default: return undefined;
      }
    }
    case 'binary': {
      const left = evaluateExpression(ir, expr.left, env);
      const right = evaluateExpression(ir, expr.right, env);
      if (left === undefined || right === undefined) return undefined;
      const l = asNumber(left);
      const r = asNumber(right);
      switch (expr.operator) {
        case '||': return l !== 0 || r !== 0;
        case '&&': return l !== 0 && r !== 0;
        case '==': return l === r;
        case '!=': return l !== r;
        case '<': return l < r;
        case '<=': return l <= r;
        case '>': return l > r;
        case '>=': return l >= r;
        case '+': return l + r;
        case '-': return l - r;
        case '*': return l * r;
        case '/':
          if (r === 0) return undefined;
          return Number.isInteger(l) && Number.isInteger(r) ? Math.trunc(l / r) : l / r;
        case '%':
          return r === 0 ? undefined : l % r;
        default: return undefined;
      }
    }
    default:
      return undefined;
  }
};

const coerceToVariable = (variable: SemanticVariable, value: ScenarioValue): ScenarioValue => {
  if (variable.type === 'bool') return asNumber(value) !== 0;
  const n = asNumber(value);
  return FLOAT_TYPES.has(variable.type) ? n : Math.trunc(n);
};

export const initialEnvironment = (ir: SemanticModel): ScenarioEnvironment => {
  const env: ScenarioEnvironment = {};
  for (const v of Object.values(ir.variables)) env[v.id] = v.initialValue;
  return env;
};

const collectExpression = (
  expr: ExpressionNode,
  variables: Set<string>,
  literals: Set<number>,
  ir: SemanticModel,
): void => {
  switch (expr.kind) {
    case 'literal':
      if (typeof expr.value === 'number') literals.add(expr.value);
      return;
    case 'variable': {
      const variable = findVariable(ir, expr);
      if (variable) variables.add(variable.id);
      return;
    }
    case 'unary':
      collectExpression(expr.operand, variables, literals, ir);
      return;
    case 'call':
      collectExpression(expr.argument, variables, literals, ir);
      return;
    case 'binary':
      collectExpression(expr.left, variables, literals, ir);
      collectExpression(expr.right, variables, literals, ir);
      return;
  }
};

/** Whether `transition` is enabled once the step has advanced the timers of the active states. */
const isEnabled = (
  ir: SemanticModel,
  transition: SemanticTransition,
  env: Readonly<ScenarioEnvironment>,
  timerAfterStepMs: number,
  currentEvent: string | null = null,
): { enabled: boolean; guard: boolean; temporal: boolean } | undefined => {
  // A transition with an event is enabled only in an execution where that event is current.
  if (transition.eventId != null && transition.eventId !== currentEvent) {
    return { enabled: false, guard: false, temporal: false };
  }
  const guardValue = evaluateExpression(ir, transition.guard, env);
  if (guardValue === undefined) return undefined;
  const guard = asNumber(guardValue) !== 0;
  const temporal = transition.temporalThresholdMs === null ? false : timerAfterStepMs >= transition.temporalThresholdMs;
  switch (transition.triggerMode) {
    case 'condition': return { enabled: guard, guard, temporal };
    case 'after': return { enabled: temporal, guard, temporal };
    case 'and': return { enabled: guard && temporal, guard, temporal };
    case 'or': return { enabled: guard || temporal, guard, temporal };
    default: return undefined;
  }
};

export interface TransitionStimulus {
  /** Variable assignments to apply after forcing the configuration (guard variables). */
  readonly variables: ScenarioEnvironment;
  /** Timer of the source state before the step; 0 when it is not set explicitly. */
  readonly sourceTimerMs: number;
  /** Complete variable environment seen by the step. */
  readonly environment: ScenarioEnvironment;
  /** Input events (ids) to post before the step: the transition's own event in a TRUE case, none otherwise. */
  readonly events: readonly string[];
}

const candidateValues = (variable: SemanticVariable, literals: readonly number[]): ScenarioValue[] => {
  if (variable.type === 'bool') {
    return [variable.initialValue as boolean, !(variable.initialValue as boolean)];
  }
  const float = FLOAT_TYPES.has(variable.type);
  const values: number[] = [Number(variable.initialValue), 0, 1, -1];
  for (const literal of literals) {
    values.push(literal, literal - 1, literal + 1);
    if (float) values.push(literal - 0.5, literal + 0.5);
  }
  const unique: number[] = [];
  for (const value of values) {
    if (!unique.includes(value) && Number.isFinite(value)) unique.push(value);
  }
  return unique.slice(0, 14);
};

/**
 * Finds a stimulus under which `transition` is enabled (want === true) or disabled
 * (want === false) while no other transition of the active configuration fires.
 * Returns null when no such stimulus exists (for example `after(1)` can never be held off).
 */
export const findTransitionStimulus = (
  ir: SemanticModel,
  transition: SemanticTransition,
  configuration: ForcedConfiguration,
  want: boolean,
): TransitionStimulus | null => {
  const tick = ir.tickMs;
  // One input event at most is posted: the transition's own in a TRUE case. A local event is
  // only ever current after a send(), which a single stimulus does not provide.
  const eventDef = transition.eventId == null
    ? undefined
    : (ir.events ?? []).find((event) => event.id === transition.eventId);
  if (want && transition.eventId != null && eventDef?.scope !== 'input') return null;
  const currentEvent = want ? transition.eventId ?? null : null;
  const sourceId = transition.sourceStateId;
  const source = ir.states[sourceId];
  if (!source) return null;
  const active = new Set(configuration.activeStateIds);

  const variableIds = new Set<string>();
  const literals = new Set<number>();
  collectExpression(transition.guard, variableIds, literals, ir);
  const others = Object.values(ir.transitions).filter((t) =>
    t.id !== transition.id && t.sourceKind === 'state' && active.has(t.sourceStateId));
  for (const other of others) collectExpression(other.guard, new Set<string>(), literals, ir);
  const guardVariables = [...variableIds].filter((id) => ir.variables[id]).slice(0, 4);

  const literalList = [...literals].slice(0, 4);
  const candidateLists = guardVariables.map((id) => candidateValues(ir.variables[id], literalList));
  const ms = transition.temporalThresholdMs;
  const timerCandidates: number[] = [0];
  if (ms !== null) {
    for (const t of [ms - 2 * tick, ms - tick, ms, ms + tick]) {
      if (t >= 0 && !timerCandidates.includes(t)) timerCandidates.push(t);
    }
  }

  // Transitions that run before the tested one: ancestors' transitions and same-source ones of
  // higher precedence. They must stay disabled for the test to isolate the transition.
  const ancestorIds = new Set(source.ancestorStateIds);
  const precedes = (other: SemanticTransition): boolean => {
    if (ancestorIds.has(other.sourceStateId)) return true;
    if (other.sourceStateId !== sourceId) return false;
    if (other.priority !== transition.priority) return other.priority < transition.priority;
    return other.id.localeCompare(transition.id) < 0;
  };

  const timerAfterStep = (stateId: string, sourceTimer: number): number =>
    (stateId === sourceId ? sourceTimer : 0) + tick;

  const othersDisabled = (
    env: ScenarioEnvironment,
    sourceTimer: number,
    subset: readonly SemanticTransition[],
  ): boolean => subset.every((other) => {
    const result = isEnabled(ir, other, env, timerAfterStep(other.sourceStateId, sourceTimer), currentEvent);
    return result !== undefined && !result.enabled;
  });

  const preceding = others.filter(precedes);
  const strictSets: readonly (readonly SemanticTransition[])[] = [others, preceding];

  const base = initialEnvironment(ir);

  for (const subset of strictSets) {
    let best: { stimulus: TransitionStimulus; score: number[] } | null = null;
    const indices = guardVariables.map(() => 0);
    let evaluations = 0;
    const advance = (): boolean => {
      for (let i = indices.length - 1; i >= 0; i--) {
        indices[i] += 1;
        if (indices[i] < candidateLists[i].length) return true;
        indices[i] = 0;
      }
      return false;
    };
    do {
      const env: ScenarioEnvironment = { ...base };
      let changed = 0;
      guardVariables.forEach((id, i) => {
        const value = candidateLists[i][indices[i]];
        env[id] = value;
        if (value !== base[id]) changed += 1;
      });
      for (const timer of timerCandidates) {
        evaluations += 1;
        const result = isEnabled(ir, transition, env, timerAfterStep(sourceId, timer), currentEvent);
        if (!result || result.enabled !== want) continue;
        if (!othersDisabled(env, timer, subset)) continue;
        // Prefer a stimulus that isolates the part under test: a TRUE case of an `or` fires by its
        // guard alone, a FALSE case of an `and` fails by its guard while the time has elapsed.
        let partsRank = 0;
        if (transition.triggerMode === 'or' && want) partsRank = result.guard && !result.temporal ? 0 : 1;
        if (transition.triggerMode === 'and' && !want) partsRank = !result.guard && result.temporal ? 0 : 1;
        const boundary = ms === null ? 0 : (want ? Math.abs(timer - (ms - tick)) : Math.abs(timer - (ms - 2 * tick)));
        const score = [partsRank, changed, boundary, timer];
        if (best === null || lexicographicallyLess(score, best.score)) {
          const variables: ScenarioEnvironment = {};
          for (const id of guardVariables) variables[id] = env[id];
          best = {
            stimulus: {
              variables,
              sourceTimerMs: timer,
              environment: env,
              events: currentEvent === null ? [] : [currentEvent],
            },
            score,
          };
        }
      }
    } while (evaluations < 40000 && advance());
    if (best) return best.stimulus;
  }
  return null;
};

const applyActions = (
  ir: SemanticModel,
  actions: readonly ActionNode[],
  env: ScenarioEnvironment,
  assigned: Set<string>,
  unknown: Set<string>,
): void => {
  for (const action of actions) {
    if (action.kind === 'send') continue;
    const variable = ir.variables[action.target];
    if (!variable) continue;
    assigned.add(variable.id);
    const value = evaluateExpression(ir, action.value, env);
    if (value === undefined) {
      unknown.add(variable.id);
      delete env[variable.id];
    } else {
      env[variable.id] = coerceToVariable(variable, value);
      unknown.delete(variable.id);
    }
  }
};

export interface FiredPrediction {
  readonly assigned: ReadonlySet<string>;
  readonly known: ScenarioEnvironment;
  readonly unknown: ReadonlySet<string>;
  readonly entered: readonly string[];
  readonly exited: readonly string[];
}

/** Effect of the transition firing from `environment`: exit actions, transition actions, entry actions. */
export const predictFiredEffect = (
  ir: SemanticModel,
  transition: SemanticTransition,
  configuration: ForcedConfiguration,
  environment: Readonly<ScenarioEnvironment>,
): FiredPrediction => {
  const env: ScenarioEnvironment = { ...environment };
  const assigned = new Set<string>();
  const unknown = new Set<string>();

  const entered: string[] = [...transition.entryStateIds];
  for (const id of defaultDescendants(ir, transition.destinationStateId)) {
    if (!entered.includes(id)) entered.push(id);
  }
  const exited: string[] = [...transition.exitStateIds];
  const source = ir.states[transition.sourceStateId];
  if (source) {
    for (const id of configuration.activeStateIds) {
      const state = ir.states[id];
      if (state && state.ancestorStateIds.includes(source.id) && !exited.includes(id)) {
        // Descendants exit before their ancestors.
        exited.unshift(id);
      }
    }
  }

  for (const id of exited) applyActions(ir, ir.states[id]?.exitActions ?? [], env, assigned, unknown);
  applyActions(ir, transition.actions, env, assigned, unknown);
  for (const id of entered) applyActions(ir, ir.states[id]?.entryActions ?? [], env, assigned, unknown);

  return { assigned, known: env, unknown, entered, exited };
};

/** Variables assigned by during actions of states that stay active and run in the step. */
export const duringAssignedVariables = (
  ir: SemanticModel,
  configuration: ForcedConfiguration,
): Set<string> => {
  const result = new Set<string>();
  for (const id of configuration.activeStateIds) {
    for (const action of ir.states[id]?.duringActions ?? []) {
      if (action.kind === 'assign' && ir.variables[action.target]) result.add(action.target);
    }
  }
  return result;
};

/**
 * Whether stepping from `configuration` can send a local event: a send() among the actions of the
 * transition, of the states it exits or enters, or the during actions of the active states. The
 * follow-up executions it triggers are not predicted, so no transition test is generated then.
 */
export const effectSendsLocalEvent = (
  ir: SemanticModel,
  transition: SemanticTransition,
  configuration: ForcedConfiguration,
): boolean => {
  if ((ir.events ?? []).length === 0) return false;
  const stateIds = new Set<string>([
    ...configuration.activeStateIds,
    ...transition.exitStateIds,
    ...transition.entryStateIds,
    ...defaultDescendants(ir, transition.destinationStateId),
  ]);
  const actions: ActionNode[] = [...transition.actions];
  for (const id of stateIds) {
    const state = ir.states[id];
    if (state) actions.push(...state.entryActions, ...state.duringActions, ...state.exitActions);
  }
  return actions.some((action) => action.kind === 'send');
};
