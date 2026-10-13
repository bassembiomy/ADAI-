import {
  createRuntime,
  coerceSemanticValue,
  initializeRuntime,
  resetRuntime,
  snapshotRuntime,
  stepRuntime,
  type SemanticRuntime,
} from './smInterpreter';
import { buildSemanticModel } from './smSemanticBuilder';
import { parseHmiVariableValue } from '../../features/hmi/hmiModel';

export type StandaloneInputValue = number | boolean;

export const applyInputs = (
  runtime: SemanticRuntime,
  inputs: Readonly<Record<string, StandaloneInputValue>>,
): void => {
  for (const [reference, input] of Object.entries(inputs)) {
    const variable = runtime.ir.variables[reference]
      ?? Object.values(runtime.ir.variables).find(
        (candidate) => candidate.name === reference,
      );
    if (!variable) continue;
    runtime.data[variable.id] = coerceSemanticValue(input, variable.type);
  }
};

export {
  parseHmiVariableValue,
  buildSemanticModel,
  createRuntime,
  initializeRuntime,
  resetRuntime,
  snapshotRuntime,
  stepRuntime,
};

export const ADIAStateMachineRuntime = Object.freeze({
  parseHmiVariableValue,
  buildSemanticModel,
  createRuntime,
  initializeRuntime,
  applyInputs,
  stepRuntime,
  snapshotRuntime,
  resetRuntime,
});
