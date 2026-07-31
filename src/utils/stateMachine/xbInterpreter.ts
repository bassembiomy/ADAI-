import {
  xbConvertScalar,
  type XBConversionResult,
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
  storedIntegers: Record<string, Array<number | null>>;
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

const convertScalar = (
  value: XBScalar,
  type: XBNumericType,
  faults: XBNumericFault[],
  operation: XBSemanticOperation | null = null,
): XBConversionResult => {
  const conversion = operation?.conversion;
  const result = xbConvertScalar(Number(value), type, {
    rounding: conversion?.rounding ?? 'floor',
    overflow: conversion?.overflow ?? 'saturate',
    supportsFloat16: true,
    supportsFloat64: true,
  });
  if (result.fault !== null) faults.push(result.fault);
  return result;
};

const convertValue = (
  value: XBScalar,
  type: XBNumericType,
  faults: XBNumericFault[],
  operation: XBSemanticOperation | null = null,
): XBScalar => convertScalar(value, type, faults, operation).value;

const resetStorage = (runtime: XBRuntime): void => {
  const signals: Record<string, XBScalar[]> = {};
  const storedIntegers: Record<string, Array<number | null>> = {};
  const initialFaults: XBNumericFault[] = [];
  for (const signalId of Object.keys(runtime.ir.signals).sort((left, right) =>
    left.localeCompare(right))) {
    const signal = runtime.ir.signals[signalId];
    const results = Array.from(
      { length: signal.elementCount },
      () => convertScalar(
        defaultValue(signal.numericType),
        signal.numericType,
        initialFaults,
      ),
    );
    signals[signalId] = results.map((result) => result.value);
    storedIntegers[signalId] = results.map((result) =>
      result.storedInteger);
  }
  runtime.signals = signals;
  runtime.storedIntegers = storedIntegers;

  const stateSlots: Record<string, XBScalar[]> = {};
  const scheduleCounters: Record<string, number> = {};
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
    storedIntegers: {},
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

const signalStoredIntegers = (
  runtime: XBRuntime,
  signalId: string,
): readonly (number | null)[] => {
  const signal = runtime.ir.signals[signalId];
  if (signal === undefined) {
    throw new Error(`X-Bridges signal '${signalId}' is absent from semantic IR`);
  }
  const sourceId = signal.sourceSignalId ?? signalId;
  const values = runtime.storedIntegers[sourceId];
  if (values === undefined) {
    throw new Error(
      `X-Bridges signal source '${sourceId}' has no stored-integer metadata`,
    );
  }
  return values;
};

const broadcast = <T>(
  values: readonly T[],
  length: number,
  label: string,
): readonly T[] => {
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
  const results = source.map((value) =>
    convertScalar(value, type, faults, operation));
  runtime.signals[signalId] = results.map((result) => result.value);
  runtime.storedIntegers[signalId] = results.map((result) =>
    result.storedInteger);
};

const writeConversionResults = (
  runtime: XBRuntime,
  signalId: string,
  results: readonly XBConversionResult[],
): void => {
  const signal = runtime.ir.signals[signalId];
  if (signal === undefined) {
    throw new Error(`X-Bridges signal '${signalId}' is absent from semantic IR`);
  }
  const values = broadcast(results, signal.elementCount, signalId);
  runtime.signals[signalId] = values.map((result) => result.value);
  runtime.storedIntegers[signalId] = values.map((result) =>
    result.storedInteger);
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
    case 'TERMINATOR':
      return [];
    default:
      throw new Error(
        `X-Bridges operation '${operation.id}' has unsupported type `
          + `'${operation.type}'`,
      );
  }
};

const reinterpretValue = (
  storedInteger: number,
  destinationType: XBNumericType,
): number => destinationType.kind === 'fixed'
  ? storedInteger / (2 ** destinationType.fractionLength)
  : storedInteger;

const executeConversionOperation = (
  runtime: XBRuntime,
  operation: XBSemanticOperation,
  faults: XBNumericFault[],
): void => {
  const conversion = operation.conversion;
  if (conversion === null) {
    throw new Error(
      `X-Bridges conversion operation '${operation.id}' lacks conversion IR`,
    );
  }
  const dataOutputId = operation.outputSignalIds.find((signalId) =>
    runtime.ir.signals[signalId]?.portId === 'y')
    ?? (operation.outputSignalIds.length === 1
      ? operation.outputSignalIds[0]
      : undefined);
  if (dataOutputId === undefined) {
    throw new Error(
      `X-Bridges conversion operation '${operation.id}' lacks a y output`,
    );
  }

  const inputSignalId = operation.inputSignalIds[0];
  if (inputSignalId === undefined) {
    throw new Error(
      `X-Bridges conversion operation '${operation.id}' lacks an input`,
    );
  }
  const inputValues = signalValues(runtime, inputSignalId);
  const storedInputs = signalStoredIntegers(runtime, inputSignalId);
  const results = inputValues.map((value, index) => {
    let conversionInput = Number(value);
    if (conversion.mode === 'stored-integer-reinterpretation') {
      const storedInteger = storedInputs[index];
      if (storedInteger === null || storedInteger === undefined) {
        throw new Error(
          `X-Bridges conversion operation '${operation.id}' requires `
            + 'stored-integer input metadata',
        );
      }
      conversionInput = reinterpretValue(
        storedInteger,
        conversion.destinationType,
      );
    }
    return convertScalar(
      conversionInput,
      conversion.destinationType,
      faults,
      operation,
    );
  });

  writeConversionResults(runtime, dataOutputId, results);
  const errors = results.map((result) => result.quantizationError);
  for (const outputSignalId of operation.outputSignalIds) {
    if (outputSignalId === dataOutputId) continue;
    writeSignal(runtime, outputSignalId, errors, faults);
  }
};

const writeStateOutputs = (
  runtime: XBRuntime,
  operation: XBSemanticOperation,
  faults: XBNumericFault[],
): void => {
  for (const slot of operation.state?.slots ?? []) {
    writeSignal(
      runtime,
      slot.signalId,
      runtime.stateSlots[slot.id] ?? slot.initialValues,
      faults,
    );
  }
};

const scheduledThisSubstep = (
  runtime: XBRuntime,
  operation: XBSemanticOperation,
): boolean => operation.schedule.hold === 'none'
  || runtime.scheduleCounters[operation.id] === 0;

const advanceSchedule = (
  runtime: XBRuntime,
  operation: XBSemanticOperation,
): void => {
  const period = operation.schedule.periodSubsteps;
  if (period <= 1) {
    runtime.scheduleCounters[operation.id] = 0;
    return;
  }
  const previous = runtime.scheduleCounters[operation.id] ?? 0;
  runtime.scheduleCounters[operation.id] = (
    previous + operation.schedule.counterIncrement
  ) % period;
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

const executeDirectOperations = (
  runtime: XBRuntime,
  faults: XBNumericFault[],
  forceEvaluation = false,
): void => {
  for (const operationId of runtime.ir.executionOrder) {
    const operation = runtime.ir.operations[operationId];
    if (operation === undefined) {
      throw new Error(
        `X-Bridges execution order references missing operation '${operationId}'`,
      );
    }
    if (operation.stateful) continue;
    if (!forceEvaluation && !scheduledThisSubstep(runtime, operation)) continue;
    if (
      operation.type === 'DATA_TYPE_CONVERSION'
      || operation.type === 'NUMERIC_REPRESENTATION'
    ) {
      executeConversionOperation(runtime, operation, faults);
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
};

interface ContinuousSlot {
  readonly operation: XBSemanticOperation;
  readonly slotId: string;
  readonly signalId: string;
  readonly numericType: XBNumericType;
  readonly base: readonly XBScalar[];
}

const continuousSlots = (runtime: XBRuntime): ContinuousSlot[] => {
  const slots: ContinuousSlot[] = [];
  for (const operationId of runtime.ir.executionOrder) {
    const operation = runtime.ir.operations[operationId];
    if (
      operation?.type !== 'INTEGRATOR_CONTINUOUS'
      && operation?.type !== 'Integrator'
    ) continue;
    for (const slot of operation.state?.slots ?? []) {
      slots.push({
        operation,
        slotId: slot.id,
        signalId: slot.signalId,
        numericType: slot.numericType,
        base: runtime.stateSlots[slot.id] ?? slot.initialValues,
      });
    }
  }
  return slots;
};

const continuousDerivatives = (
  runtime: XBRuntime,
  slots: readonly ContinuousSlot[],
): XBScalar[][] => slots.map(({ operation, base }) => broadcast(
  signalValues(runtime, operation.inputSignalIds[0]),
  base.length,
  operation.id,
).map(Number));

const writeContinuousStage = (
  runtime: XBRuntime,
  slots: readonly ContinuousSlot[],
  derivatives: readonly (readonly XBScalar[])[],
  scale: number,
  faults: XBNumericFault[],
): void => {
  slots.forEach((slot, index) => {
    const values = slot.base.map((value, valueIndex) =>
      Number(value) + scale * Number(derivatives[index][valueIndex]));
    writeSignal(runtime, slot.signalId, values, faults);
  });
};

const updateContinuousState = (
  runtime: XBRuntime,
  faults: XBNumericFault[],
): void => {
  const slots = continuousSlots(runtime);
  if (slots.length === 0) return;
  const step = runtime.ir.solver.stepSeconds;
  const k1 = continuousDerivatives(runtime, slots);
  if (runtime.ir.solver.kind === 'euler') {
    writeContinuousStage(runtime, slots, k1, step, faults);
  } else {
    writeContinuousStage(runtime, slots, k1, step / 2, faults);
    executeDirectOperations(runtime, faults, true);
    const k2 = continuousDerivatives(runtime, slots);
    writeContinuousStage(runtime, slots, k2, step / 2, faults);
    executeDirectOperations(runtime, faults, true);
    const k3 = continuousDerivatives(runtime, slots);
    writeContinuousStage(runtime, slots, k3, step, faults);
    executeDirectOperations(runtime, faults, true);
    const k4 = continuousDerivatives(runtime, slots);
    slots.forEach((slot, index) => {
      runtime.stateSlots[slot.slotId] = slot.base.map((value, valueIndex) =>
        convertValue(
          Number(value) + step * (
            Number(k1[index][valueIndex])
            + 2 * Number(k2[index][valueIndex])
            + 2 * Number(k3[index][valueIndex])
            + Number(k4[index][valueIndex])
          ) / 6,
          slot.numericType,
          faults,
        ));
    });
    return;
  }
  slots.forEach((slot) => {
    runtime.stateSlots[slot.slotId] = signalValues(runtime, slot.signalId)
      .map((value) => convertValue(value, slot.numericType, faults));
  });
};

const executeSolverSubstep = (
  runtime: XBRuntime,
  faults: XBNumericFault[],
): void => {
  const statefulOperations: XBSemanticOperation[] = [];
  for (const operationId of runtime.ir.executionOrder) {
    const operation = runtime.ir.operations[operationId];
    if (operation === undefined) throw new Error(
      `X-Bridges execution order references missing operation '${operationId}'`,
    );
    if (!operation.stateful) continue;
    writeStateOutputs(runtime, operation, faults);
    statefulOperations.push(operation);
  }
  executeDirectOperations(runtime, faults);
  const pendingState: Record<string, XBScalar[]> = {};
  for (const operation of statefulOperations) {
    if (!scheduledThisSubstep(runtime, operation)) continue;
    if (
      operation.type === 'INTEGRATOR_CONTINUOUS'
      || operation.type === 'Integrator'
    ) continue;
    Object.assign(pendingState, statefulUpdate(runtime, operation, faults));
  }
  for (const [slotId, values] of Object.entries(pendingState)) {
    runtime.stateSlots[slotId] = values;
  }
  updateContinuousState(runtime, faults);
  for (const operation of runtime.ir.executionOrder
    .map((operationId) => runtime.ir.operations[operationId])) {
    if (operation !== undefined) advanceSchedule(runtime, operation);
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

  for (let substep = 0; substep < runtime.ir.solver.substepsPerTick; substep++) {
    executeSolverSubstep(runtime, faults);
  }

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
