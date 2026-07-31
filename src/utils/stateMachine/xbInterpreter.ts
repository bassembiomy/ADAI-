import {
  xbConvertScalar,
  type XBNumericFault,
  type XBNumericType,
} from './xbNumeric';
import type {
  XBSemanticModel,
  XBSemanticOperation,
} from './xbSemanticModel';

type XBScalar = number | boolean;

export interface XBRuntime {
  readonly ir: XBSemanticModel;
  signals: Record<string, XBScalar[]>;
  stateSlots: Record<string, XBScalar[]>;
  scheduleCounters: Record<string, number>;
}

const defaultValue = (type: XBNumericType): XBScalar =>
  type.kind === 'boolean' ? false : 0;

const parameter = (
  operation: XBSemanticOperation,
  names: readonly string[],
  fallback: XBScalar,
): XBScalar => {
  for (const name of names) {
    const value = operation.parameters[name];
    if (typeof value === 'number' || typeof value === 'boolean') return value;
  }
  return fallback;
};

const parameterValues = (
  operation: XBSemanticOperation,
  names: readonly string[],
  fallback: readonly XBScalar[],
): readonly XBScalar[] => {
  for (const name of names) {
    const value = operation.parameters[name];
    if (typeof value === 'number' || typeof value === 'boolean') return [value];
    if (
      Array.isArray(value)
      && value.every((entry) =>
        typeof entry === 'number' || typeof entry === 'boolean')
    ) {
      return value as readonly XBScalar[];
    }
  }
  return fallback;
};

const convertValue = (
  value: XBScalar,
  type: XBNumericType,
  faults: XBNumericFault[],
  operation: XBSemanticOperation | null = null,
): XBScalar => {
  const conversion = operation?.conversion;
  const result = xbConvertScalar(Number(value), type, {
    rounding: conversion?.rounding ?? 'floor',
    overflow: conversion?.overflow ?? 'saturate',
    supportsFloat16: true,
    supportsFloat64: true,
  });
  if (result.fault !== null) faults.push(result.fault);
  return result.value;
};

const resetStorage = (runtime: XBRuntime): void => {
  const signals: Record<string, XBScalar[]> = {};
  for (const signalId of Object.keys(runtime.ir.signals).sort((left, right) =>
    left.localeCompare(right))) {
    const signal = runtime.ir.signals[signalId];
    signals[signalId] = Array.from(
      { length: signal.elementCount },
      () => defaultValue(signal.numericType),
    );
  }
  runtime.signals = signals;

  const stateSlots: Record<string, XBScalar[]> = {};
  const scheduleCounters: Record<string, number> = {};
  const initialFaults: XBNumericFault[] = [];
  for (const operationId of runtime.ir.executionOrder) {
    const operation = runtime.ir.operations[operationId];
    scheduleCounters[operationId] = operation.schedule.initialCounter;
    for (const slot of operation.state?.slots ?? []) {
      stateSlots[slot.id] = slot.initialValues.map((value) =>
        convertValue(value, slot.numericType, initialFaults));
    }
  }
  runtime.stateSlots = stateSlots;
  runtime.scheduleCounters = scheduleCounters;
};

export const createXBRuntime = (ir: XBSemanticModel): XBRuntime => {
  const runtime: XBRuntime = {
    ir,
    signals: {},
    stateSlots: {},
    scheduleCounters: {},
  };
  resetStorage(runtime);
  return runtime;
};

export const enterXBState = (runtime: XBRuntime): void => {
  if (runtime.ir.policy.memory === 'reset') resetStorage(runtime);
};

export const resetXBState = (runtime: XBRuntime): void => {
  resetStorage(runtime);
};

const signalValues = (
  runtime: XBRuntime,
  signalId: string,
): readonly XBScalar[] => {
  const signal = runtime.ir.signals[signalId];
  if (signal === undefined) {
    throw new Error(`X-Bridges signal '${signalId}' is absent from semantic IR`);
  }
  const sourceId = signal.sourceSignalId ?? signalId;
  const values = runtime.signals[sourceId];
  if (values === undefined) {
    throw new Error(`X-Bridges signal source '${sourceId}' has no runtime storage`);
  }
  return values;
};

const broadcast = (
  values: readonly XBScalar[],
  length: number,
  label: string,
): readonly XBScalar[] => {
  if (values.length === length) return values;
  if (values.length === 1) {
    return Array.from({ length }, () => values[0]);
  }
  throw new Error(
    `X-Bridges ${label} has ${values.length} values; expected ${length}`,
  );
};

const writeSignal = (
  runtime: XBRuntime,
  signalId: string,
  values: readonly XBScalar[],
  faults: XBNumericFault[],
  operation: XBSemanticOperation | null = null,
): void => {
  const signal = runtime.ir.signals[signalId];
  if (signal === undefined) {
    throw new Error(`X-Bridges signal '${signalId}' is absent from semantic IR`);
  }
  const source = broadcast(values, signal.elementCount, signalId);
  const type = operation?.conversion?.destinationType ?? signal.numericType;
  runtime.signals[signalId] = source.map((value) =>
    convertValue(value, type, faults, operation));
};

const unary = (
  input: readonly XBScalar[],
  evaluate: (value: number) => XBScalar,
): XBScalar[] => input.map((value) => evaluate(Number(value)));

const binary = (
  left: readonly XBScalar[],
  right: readonly XBScalar[],
  evaluate: (leftValue: number, rightValue: number) => XBScalar,
): XBScalar[] => {
  const length = Math.max(left.length, right.length);
  const leftValues = broadcast(left, length, 'left input');
  const rightValues = broadcast(right, length, 'right input');
  return leftValues.map((value, index) =>
    evaluate(Number(value), Number(rightValues[index])));
};

const evaluateDirectOperation = (
  runtime: XBRuntime,
  operation: XBSemanticOperation,
): readonly (readonly XBScalar[])[] => {
  const inputs = operation.inputSignalIds.map((signalId) =>
    signalValues(runtime, signalId));
  switch (operation.type) {
    case 'Constant':
      return [parameterValues(
        operation,
        ['value', 'Value', 'constant'],
        [0],
      )];
    case 'Inport':
    case 'Outport':
      return operation.outputSignalIds.length === 0
        ? []
        : [inputs[0] ?? [0]];
    case 'GAIN': {
      const gain = Number(parameter(
        operation,
        ['gain', 'Gain', 'k', 'value'],
        1,
      ));
      return [unary(inputs[0] ?? [0], (value) => value * gain)];
    }
    case 'Sum':
    case 'SUM_JUNCTION':
    case 'VectorAdd': {
      const result = inputs.reduce<readonly XBScalar[]>(
        (sum, input) => binary(sum, input, (left, right) => left + right),
        [0],
      );
      return [result];
    }
    case 'PRODUCT':
    case 'VectorMul': {
      const result = inputs.reduce<readonly XBScalar[]>(
        (product, input) =>
          binary(product, input, (left, right) => left * right),
        [1],
      );
      return [result];
    }
    case 'VectorSub':
      return [binary(inputs[0] ?? [0], inputs[1] ?? [0],
        (left, right) => left - right)];
    case 'VectorDiv':
      return [binary(inputs[0] ?? [0], inputs[1] ?? [1],
        (left, right) => left / right)];
    case 'UnaryNeg':
      return [unary(inputs[0] ?? [0], (value) => -value)];
    case 'Abs':
      return [unary(inputs[0] ?? [0], Math.abs)];
    case 'AND':
      return [[inputs.every((input) => input.every(Boolean))]];
    case 'OR':
      return [[inputs.some((input) => input.some(Boolean))]];
    case 'NOT':
      return [unary(inputs[0] ?? [false], (value) => !value)];
    case 'DATA_TYPE_CONVERSION':
    case 'NUMERIC_REPRESENTATION':
      return [inputs[0] ?? [0]];
    case 'TERMINATOR':
      return [];
    default:
      throw new Error(
        `X-Bridges operation '${operation.id}' has unsupported type `
          + `'${operation.type}'`,
      );
  }
};

const statefulUpdate = (
  runtime: XBRuntime,
  operation: XBSemanticOperation,
  faults: XBNumericFault[],
): Record<string, XBScalar[]> => {
  const input = signalValues(runtime, operation.inputSignalIds[0]);
  const updates: Record<string, XBScalar[]> = {};
  for (const slot of operation.state?.slots ?? []) {
    const previous = runtime.stateSlots[slot.id] ?? [...slot.initialValues];
    const values = broadcast(input, previous.length, operation.id);
    switch (operation.type) {
      case 'DELAY':
      case 'UNIT_DELAY':
      case 'MEMORY':
        updates[slot.id] = values.map((value) =>
          convertValue(value, slot.numericType, faults));
        break;
      case 'INTEGRATOR_DISCRETE':
      case 'INTEGRATOR_CONTINUOUS':
      case 'Integrator':
        updates[slot.id] = previous.map((value, index) =>
          convertValue(
            Number(value) + Number(values[index]),
            slot.numericType,
            faults,
          ));
        break;
      default:
        throw new Error(
          `X-Bridges stateful operation '${operation.id}' has unsupported `
            + `type '${operation.type}'`,
        );
    }
  }
  return updates;
};

const executeOperations = (
  runtime: XBRuntime,
  faults: XBNumericFault[],
): void => {
  const pendingState: Record<string, XBScalar[]> = {};
  const statefulOperations: XBSemanticOperation[] = [];
  for (const operationId of runtime.ir.executionOrder) {
    const operation = runtime.ir.operations[operationId];
    if (operation === undefined) {
      throw new Error(
        `X-Bridges execution order references missing operation '${operationId}'`,
      );
    }
    if (operation.stateful) {
      for (const slot of operation.state?.slots ?? []) {
        writeSignal(
          runtime,
          slot.signalId,
          runtime.stateSlots[slot.id] ?? slot.initialValues,
          faults,
        );
      }
      statefulOperations.push(operation);
      continue;
    }

    const outputs = evaluateDirectOperation(runtime, operation);
    operation.outputSignalIds.forEach((signalId, index) => {
      writeSignal(
        runtime,
        signalId,
        outputs[index] ?? outputs[0] ?? [0],
        faults,
        operation,
      );
    });
  }
  for (const operation of statefulOperations) {
    Object.assign(pendingState, statefulUpdate(runtime, operation, faults));
  }
  for (const [slotId, values] of Object.entries(pendingState)) {
    runtime.stateSlots[slotId] = values;
  }
};

export const stepXBState = (
  runtime: XBRuntime,
  data: Record<string, number | boolean>,
): XBNumericFault[] => {
  const faults: XBNumericFault[] = [];
  for (const mapping of runtime.ir.mappings) {
    if (mapping.direction !== 'in') continue;
    if (!Object.prototype.hasOwnProperty.call(data, mapping.variableId)) {
      throw new Error(
        `X-Bridges input mapping variable '${mapping.variableId}' is absent`,
      );
    }
    writeSignal(
      runtime,
      mapping.signalId,
      [data[mapping.variableId]],
      faults,
    );
  }

  executeOperations(runtime, faults);

  for (const mapping of runtime.ir.mappings) {
    if (mapping.direction !== 'out') continue;
    const values = signalValues(runtime, mapping.signalId);
    if (values.length !== 1) {
      throw new Error(
        `X-Bridges state-machine output mapping '${mapping.variableId}' `
          + 'must be scalar',
      );
    }
    data[mapping.variableId] = convertValue(
      values[0],
      mapping.numericType,
      faults,
    );
  }
  return faults;
};
