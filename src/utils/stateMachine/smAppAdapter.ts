import type { ExpressionNode } from './smExpressions';
import {
  createRuntime,
  initializeRuntime,
  type SemanticRuntime,
} from './smInterpreter';
import type {
  LegacyStateMachineModel,
  ModelDiagnostic,
  StateMachineModelV4,
} from './smModel';
import { migrateStateMachineModel } from './smModelMigration';
import { buildSemanticModel } from './smSemanticBuilder';
import type {
  SemanticIOMapping,
  SemanticModel,
  SemanticVariable,
} from './smSemanticModel';
import type { SemanticTraceFrame } from './smTrace';

export type AppSimulationValue = number | boolean;

export interface FactoryIOMapping {
  adiaVarId: string;
  factoryTagId: string | number;
  type: 'sensor' | 'actuator';
}

export interface AppIOMapping {
  variableId: string;
  channelId: string;
  direction: 'read' | 'write';
  conversionExpression?: ExpressionNode | null;
}

export interface AppSimulationSession {
  ir: SemanticModel;
  runtime: SemanticRuntime;
  initialFrame: SemanticTraceFrame;
  ioMappings: readonly AppIOMapping[];
}

export interface AppTraceEvent {
  time: number;
  event: 'Transition';
  group: string;
  state: string;
  transition: string;
  transitionId: string;
}

export interface AppSimulationUpdate {
  activeStates: Readonly<Record<string, string>>;
  variableValues: Readonly<Record<string, AppSimulationValue>>;
  stateTimers: Readonly<Record<string, number>>;
  firedTransitions: Readonly<Record<string, number>>;
  traceEvents: readonly AppTraceEvent[];
  error: string | null;
}

export class SemanticModelError extends Error {
  readonly diagnostics: readonly ModelDiagnostic[];

  constructor(diagnostics: readonly ModelDiagnostic[]) {
    super(
      diagnostics.length > 0
        ? diagnostics.map((item) => `${item.code}: ${item.message}`).join('\n')
        : 'State-machine semantic model could not be built.',
    );
    this.name = 'SemanticModelError';
    this.diagnostics = Object.freeze([...diagnostics]);
  }
}

const freezeRecord = <T>(
  value: Record<string, T>,
): Readonly<Record<string, T>> => Object.freeze({ ...value });

const evaluateConversion = (
  expression: ExpressionNode | null | undefined,
  input: AppSimulationValue,
): AppSimulationValue => {
  if (!expression) return input;
  if (expression.kind === 'literal') return expression.value;
  if (expression.kind === 'variable') {
    if (expression.name !== 'x') {
      throw new Error(
        `I/O conversion may only reference 'x'; received '${expression.name}'.`,
      );
    }
    return input;
  }
  if (expression.kind === 'unary') {
    const operand = evaluateConversion(expression.operand, input);
    if (expression.operator === '!') return !operand;
    if (expression.operator === '+') return Number(operand);
    return -Number(operand);
  }

  if (expression.operator === '&&') {
    return Boolean(evaluateConversion(expression.left, input))
      && Boolean(evaluateConversion(expression.right, input));
  }
  if (expression.operator === '||') {
    return Boolean(evaluateConversion(expression.left, input))
      || Boolean(evaluateConversion(expression.right, input));
  }

  const left = evaluateConversion(expression.left, input);
  const right = evaluateConversion(expression.right, input);
  switch (expression.operator) {
    case '+': return Number(left) + Number(right);
    case '-': return Number(left) - Number(right);
    case '*': return Number(left) * Number(right);
    case '/': return Number(left) / Number(right);
    case '%': return Number(left) % Number(right);
    case '<': return Number(left) < Number(right);
    case '<=': return Number(left) <= Number(right);
    case '>': return Number(left) > Number(right);
    case '>=': return Number(left) >= Number(right);
    case '==': return left === right;
    case '!=': return left !== right;
  }
};

const coerceVariableValue = (
  variable: SemanticVariable,
  value: AppSimulationValue,
): AppSimulationValue =>
  variable.type === 'bool' ? Boolean(value) : Number(value);

const semanticMappings = (ir: SemanticModel): AppIOMapping[] =>
  ir.ioMappings.map((mapping: SemanticIOMapping) => ({
    variableId: mapping.variableId,
    channelId: mapping.channelId,
    direction: mapping.direction,
    conversionExpression: mapping.conversionExpression,
  }));

const normalizeMappings = (
  ir: SemanticModel,
  mappings: readonly AppIOMapping[] | undefined,
): readonly AppIOMapping[] => {
  const source = mappings ?? semanticMappings(ir);
  const normalized = source.map((mapping) => {
    const variableId = ir.variables[mapping.variableId]
      ? mapping.variableId
      : Object.values(ir.variables).find(
        (variable) => variable.name === mapping.variableId,
      )?.id;
    if (!variableId) {
      throw new SemanticModelError([{
        code: 'APP_IO_VARIABLE_UNKNOWN',
        message: `I/O mapping references unknown variable '${mapping.variableId}'.`,
        elementId: mapping.variableId,
        severity: 'error',
      }]);
    }
    return Object.freeze({ ...mapping, variableId });
  });
  return Object.freeze(normalized);
};

export const createFactoryIOMappings = (
  mappings: readonly FactoryIOMapping[],
): AppIOMapping[] =>
  mappings.map((mapping) => ({
    variableId: mapping.adiaVarId,
    channelId: String(mapping.factoryTagId),
    direction: mapping.type === 'sensor' ? 'read' : 'write',
  }));

export const createAppSimulationSession = (
  model: StateMachineModelV4 | LegacyStateMachineModel,
  mappings?: readonly AppIOMapping[],
): AppSimulationSession => {
  const migrated = migrateStateMachineModel(model);
  const migrationErrors = migrated.diagnostics.filter(
    (item) => item.severity === 'error',
  );
  if (migrationErrors.length > 0) throw new SemanticModelError(migrationErrors);

  const built = buildSemanticModel(migrated.model);
  if (!built.ir) throw new SemanticModelError(built.diagnostics);

  const runtime = createRuntime(built.ir);
  const initialFrame = initializeRuntime(runtime);
  return {
    ir: built.ir,
    runtime,
    initialFrame,
    ioMappings: normalizeMappings(built.ir, mappings),
  };
};

export const applyMappedInputs = (
  session: AppSimulationSession,
  inputValues: Readonly<Record<string, AppSimulationValue>>,
): void => {
  for (const mapping of session.ioMappings) {
    if (
      mapping.direction !== 'read'
      || !Object.prototype.hasOwnProperty.call(inputValues, mapping.channelId)
    ) {
      continue;
    }
    const variable = session.ir.variables[mapping.variableId];
    const converted = evaluateConversion(
      mapping.conversionExpression,
      inputValues[mapping.channelId],
    );
    session.runtime.data[mapping.variableId] = coerceVariableValue(
      variable,
      converted,
    );
  }
};

export const readMappedOutputs = (
  session: AppSimulationSession,
): Readonly<Record<string, AppSimulationValue>> => {
  const outputs: Record<string, AppSimulationValue> = {};
  for (const mapping of session.ioMappings) {
    if (mapping.direction !== 'write') continue;
    outputs[mapping.channelId] = evaluateConversion(
      mapping.conversionExpression,
      session.runtime.data[mapping.variableId],
    );
  }
  return freezeRecord(outputs);
};

export const traceFrameToAppUpdate = (
  frame: SemanticTraceFrame,
  ir: SemanticModel,
): AppSimulationUpdate => {
  const activeStates: Record<string, string> = {};
  for (const stateId of frame.activeStateIds) {
    const state = ir.states[stateId];
    if (!state) continue;
    const layer = ir.layers[state.layerId];
    const key = layer.decomposition === 'AND'
      ? `${layer.id}_${state.id}`
      : layer.id;
    activeStates[key] = state.id;
  }

  const firedTransitions: Record<string, number> = {};
  const traceEvents = frame.actions
    .filter((action) => action.startsWith('transition:'))
    .map((action): AppTraceEvent => {
      const transitionId = action.slice('transition:'.length);
      const transition = ir.transitions[transitionId];
      firedTransitions[transitionId] = frame.sequence;
      return Object.freeze({
        time: frame.elapsedMs / 1000,
        event: 'Transition',
        group: transition?.sourceStateId
          ? ir.states[transition.sourceStateId]?.layerId ?? 'ALL'
          : 'ALL',
        state: transition?.destinationStateId ?? '',
        transition: transition
          ? `${transition.sourceStateId} -> ${transition.destinationStateId}`
          : transitionId,
        transitionId,
      });
    });

  return Object.freeze({
    activeStates: freezeRecord(activeStates),
    variableValues: freezeRecord(frame.data),
    stateTimers: freezeRecord(frame.stateTimersMs),
    firedTransitions: freezeRecord(firedTransitions),
    traceEvents: Object.freeze(traceEvents),
    error: frame.error,
  });
};
