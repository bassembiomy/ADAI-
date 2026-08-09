import {
  xbConvertScalar,
  type XBConversionResult,
  type XBNumericFault,
  type XBNumericType,
} from './xbNumeric';
import { nextGaussianPair } from './xbDeterministicNoise';
import { evaluateEkfVector, computeEkfJacobian } from './xbEkfExpressions';
import {
  matrixAdd,
  matrixSubtract,
  matrixInverseGaussJordan,
  matrixMultiply,
  matrixTranspose,
} from './xbStaticMatrix';
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
  operationFaults: Record<string, { active: boolean; fault: XBNumericFault | null }>;
  numericFaults: Array<{ operationId: string; fault: XBNumericFault }>;
  simTime?: number;
}

interface XBSnapshot {
  readonly signals: Record<string, XBScalar[]>;
  readonly storedIntegers: Record<string, Array<number | null>>;
  readonly stateSlots: Record<string, XBScalar[]>;
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
  const configuredOverflow = operation?.parameters.overflow;
  const result = xbConvertScalar(Number(value), type, {
    rounding: conversion?.rounding ?? 'floor',
    overflow: conversion?.overflow
      ?? (configuredOverflow === 'error' ? 'error' : 'saturate'),
    supportsFloat16: true,
    supportsFloat64: true,
  });
  if (result.fault !== null) faults.push(result.fault);
  return result;
};

export const convertValue = (
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
  runtime.operationFaults = Object.fromEntries(runtime.ir.executionOrder.map((id) => [
    id, { active: false, fault: null },
  ]));
  runtime.numericFaults = [];
  runtime.simTime = 0;
};

export const createXBRuntime = (ir: XBSemanticModel): XBRuntime => {
  const runtime: XBRuntime = {
    ir,
    signals: {},
    storedIntegers: {},
    stateSlots: {},
    scheduleCounters: {},
    operationFaults: {},
    numericFaults: [],
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
  runtime.signals[signalId] = results.map((result) => (
    operation === null && result.fault !== null
      ? defaultValue(type)
      : result.value
  ));
  runtime.storedIntegers[signalId] = results.map((result) =>
    result.storedInteger);
};

const snapshotOperation = (
  runtime: XBRuntime,
  operation: XBSemanticOperation,
): XBSnapshot => ({
  signals: Object.fromEntries(operation.outputSignalIds.map((signalId) => [
    signalId, [...(runtime.signals[signalId] ?? [])],
  ])),
  storedIntegers: Object.fromEntries(operation.outputSignalIds.map((signalId) => [
    signalId, [...(runtime.storedIntegers[signalId] ?? [])],
  ])),
  stateSlots: Object.fromEntries((operation.state?.slots ?? []).map((slot) => [
    slot.id, [...(runtime.stateSlots[slot.id] ?? slot.initialValues)],
  ])),
});

const operationFaultContract = (
  runtime: XBRuntime,
  operation: XBSemanticOperation,
): NonNullable<XBSemanticOperation['numericFault']> => operation.numericFault ?? {
  fallback: operation.stateful ? 'previous-value' : 'zero',
  errorSignalId: operation.outputSignalIds.find((signalId) => {
    const portId = runtime.ir.signals[signalId]?.portId;
    return portId === 'error' || (
      portId === 'e'
      && operation.type !== 'DATA_TYPE_CONVERSION'
      && operation.type !== 'NUMERIC_REPRESENTATION'
    );
  }) ?? null,
};

const recordOperationFault = (
  runtime: XBRuntime,
  operation: XBSemanticOperation,
  fault: XBNumericFault,
  snapshot: XBSnapshot | null = null,
): void => {
  const current = runtime.operationFaults[operation.id];
  if (current?.active) return;
  runtime.operationFaults[operation.id] = { active: true, fault };
  runtime.numericFaults.push({ operationId: operation.id, fault });
  const contract = operationFaultContract(runtime, operation);
  if (contract.fallback === 'previous-value' && snapshot !== null) {
    Object.assign(runtime.signals, snapshot.signals);
    Object.assign(runtime.storedIntegers, snapshot.storedIntegers);
    Object.assign(runtime.stateSlots, snapshot.stateSlots);
  }
  for (const signalId of operation.outputSignalIds) {
    const signal = runtime.ir.signals[signalId];
    if (signal === undefined) continue;
    if (signalId === contract.errorSignalId) {
      runtime.signals[signalId] = Array.from({ length: signal.elementCount }, () => true);
      runtime.storedIntegers[signalId] = Array.from({ length: signal.elementCount }, () => 1);
      continue;
    }
    if (contract.fallback === 'previous-value') continue;
    runtime.signals[signalId] = Array.from(
      { length: signal.elementCount },
      () => defaultValue(signal.numericType),
    );
    runtime.storedIntegers[signalId] = Array.from(
      { length: signal.elementCount },
      () => signal.numericType.kind === 'fixed' ? 0 : null,
    );
  }
};

const hasSolvePivotFailure = (
  matrix: readonly XBScalar[],
  dimension: number,
): boolean => {
  const values = matrix.map(Number);
  for (let pivot = 0; pivot < dimension; pivot++) {
    let selected = pivot;
    for (let row = pivot + 1; row < dimension; row++) {
      if (Math.abs(values[row * dimension + pivot]) > Math.abs(values[selected * dimension + pivot])) selected = row;
    }
    if (Math.abs(values[selected * dimension + pivot]) <= 1e-12) return true;
    if (selected !== pivot) for (let column = 0; column < dimension; column++) {
      [values[pivot * dimension + column], values[selected * dimension + column]] =
        [values[selected * dimension + column], values[pivot * dimension + column]];
    }
    for (let row = pivot + 1; row < dimension; row++) {
      const factor = values[row * dimension + pivot] / values[pivot * dimension + pivot];
      for (let column = pivot + 1; column < dimension; column++) {
        values[row * dimension + column] -= factor * values[pivot * dimension + column];
      }
    }
  }
  return false;
};

const intrinsicOperationFault = (
  runtime: XBRuntime,
  operation: XBSemanticOperation,
): XBNumericFault | null => {
  const inputs = operation.inputSignalIds.map((id) => signalValues(runtime, id));
  if (operation.type === 'VectorDiv' && inputs[1]?.some((value) => Number(value) === 0)) return 'division-by-zero';
  if (operation.type === 'MatrixSolve') {
    const shape = shapeFor(runtime, operation.inputSignalIds[0] ?? '');
    if (shape?.kind === 'matrix' && hasSolvePivotFailure(inputs[0] ?? [], shape.rows)) return 'solve-pivot-failure';
  }
  return null;
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

const shapeFor = (
  runtime: XBRuntime,
  signalId: string,
) => runtime.ir.signals[signalId]?.shape;

const matrixShape = (
  runtime: XBRuntime,
  signalId: string,
): { rows: number; columns: number } => {
  const shape = shapeFor(runtime, signalId);
  if (shape?.kind !== 'matrix') {
    throw new Error(`X-Bridges '${signalId}' must be a matrix signal`);
  }
  return shape;
};

const vectorShape = (
  runtime: XBRuntime,
  signalId: string,
): { length: number } => {
  const shape = shapeFor(runtime, signalId);
  if (shape?.kind !== 'vector') {
    throw new Error(`X-Bridges '${signalId}' must be a vector signal`);
  }
  return shape;
};

const boundedSolve = (
  matrix: readonly XBScalar[],
  right: readonly XBScalar[],
  dimension: number,
  rightColumns: number,
  maximumDimension: number,
): XBScalar[] => {
  if (!Number.isSafeInteger(maximumDimension) || maximumDimension < 1 || maximumDimension > 8
    || dimension > 8 || rightColumns > 8
    || dimension > maximumDimension || rightColumns > maximumDimension) {
    throw new Error(
      `X-Bridges MatrixSolve dimensions must not exceed static maximum 8 (configured ${maximumDimension})`,
    );
  }
  const a = matrix.map(Number);
  const b = right.map(Number);
  const solution = Array.from({ length: dimension * rightColumns }, () => 0);
  for (let pivot = 0; pivot < dimension; pivot++) {
    let selected = pivot;
    for (let row = pivot + 1; row < dimension; row++) {
      if (Math.abs(a[row * dimension + pivot]) > Math.abs(a[selected * dimension + pivot])) {
        selected = row;
      }
    }
    if (Math.abs(a[selected * dimension + pivot]) <= 1e-12) return solution;
    if (selected !== pivot) {
      for (let column = 0; column < dimension; column++) {
        [a[pivot * dimension + column], a[selected * dimension + column]] =
          [a[selected * dimension + column], a[pivot * dimension + column]];
      }
      for (let column = 0; column < rightColumns; column++) {
        [b[pivot * rightColumns + column], b[selected * rightColumns + column]] =
          [b[selected * rightColumns + column], b[pivot * rightColumns + column]];
      }
    }
    for (let row = pivot + 1; row < dimension; row++) {
      const factor = a[row * dimension + pivot] / a[pivot * dimension + pivot];
      a[row * dimension + pivot] = 0;
      for (let column = pivot + 1; column < dimension; column++) {
        a[row * dimension + column] -= factor * a[pivot * dimension + column];
      }
      for (let column = 0; column < rightColumns; column++) {
        b[row * rightColumns + column] -= factor * b[pivot * rightColumns + column];
      }
    }
  }
  for (let row = dimension - 1; row >= 0; row--) {
    for (let column = 0; column < rightColumns; column++) {
      let value = b[row * rightColumns + column];
      for (let k = row + 1; k < dimension; k++) {
        value -= a[row * dimension + k] * Number(solution[k * rightColumns + column]);
      }
      solution[row * rightColumns + column] = value / a[row * dimension + row];
    }
  }
  return solution;
};

const matrixParameter = (
  operation: XBSemanticOperation,
  name: string,
  fallback: readonly (readonly number[])[],
): readonly (readonly number[])[] => {
  const value = operation.parameters[name];
  if (Array.isArray(value) && value.every((row) =>
    Array.isArray(row) && row.every((entry) => typeof entry === 'number'))) {
    return value as readonly (readonly number[])[];
  }
  return fallback;
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
      // State-machine mappings drive Inport inputs and consume Outport
      // outputs. Propagate the scalar value across the boundary block so the
      // editor model, interpreter, and generated C share one contract.
      return [inputs[0] ?? [0]];
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
    case 'MatrixMul': {
      const leftId = operation.inputSignalIds[0];
      const rightId = operation.inputSignalIds[1];
      const outputId = operation.outputSignalIds[0];
      if (leftId === undefined || rightId === undefined || outputId === undefined) return [[0]];
      const leftShape = matrixShape(runtime, leftId);
      const rightShape = matrixShape(runtime, rightId);
      const outputShape = matrixShape(runtime, outputId);
      if (leftShape.columns !== rightShape.rows
        || outputShape.rows !== leftShape.rows
        || outputShape.columns !== rightShape.columns) {
        throw new Error(`X-Bridges MatrixMul '${operation.id}' has incompatible static shapes`);
      }
      return [Array.from({ length: outputShape.rows * outputShape.columns }, (_, index) => {
        const row = Math.floor(index / outputShape.columns);
        const column = index % outputShape.columns;
        let total = 0;
        for (let k = 0; k < leftShape.columns; k++) {
          total += Number(inputs[0][row * leftShape.columns + k])
            * Number(inputs[1][k * rightShape.columns + column]);
        }
        return total;
      })];
    }
    case 'Transpose': {
      const inputId = operation.inputSignalIds[0];
      const outputId = operation.outputSignalIds[0];
      if (inputId === undefined || outputId === undefined) return [[0]];
      const inputShape = matrixShape(runtime, inputId);
      const outputShape = matrixShape(runtime, outputId);
      if (outputShape.rows !== inputShape.columns || outputShape.columns !== inputShape.rows) {
        throw new Error(`X-Bridges Transpose '${operation.id}' has incompatible static shapes`);
      }
      return [Array.from({ length: outputShape.rows * outputShape.columns }, (_, index) =>
        inputs[0][(index % outputShape.columns) * inputShape.columns
          + Math.floor(index / outputShape.columns)])];
    }
    case 'MatrixConcat': {
      const outputId = operation.outputSignalIds[0];
      if (outputId === undefined) return [[0]];
      const axis = Number(parameter(operation, ['axis'], 0));
      const shapes = operation.inputSignalIds.map((id) => matrixShape(runtime, id));
      const outputShape = matrixShape(runtime, outputId);
      if (axis === 1) {
        if (shapes.some((shape) => shape.rows !== outputShape.rows)
          || shapes.reduce((sum, shape) => sum + shape.columns, 0) !== outputShape.columns) {
          throw new Error(`X-Bridges MatrixConcat '${operation.id}' has incompatible horizontal shapes`);
        }
        return [Array.from({ length: outputShape.rows * outputShape.columns }, (_, index) => {
          const row = Math.floor(index / outputShape.columns);
          let column = index % outputShape.columns;
          for (let inputIndex = 0; inputIndex < shapes.length; inputIndex++) {
            if (column < shapes[inputIndex].columns) return inputs[inputIndex][row * shapes[inputIndex].columns + column];
            column -= shapes[inputIndex].columns;
          }
          return 0;
        })];
      }
      if (shapes.some((shape) => shape.columns !== outputShape.columns)
        || shapes.reduce((sum, shape) => sum + shape.rows, 0) !== outputShape.rows) {
        throw new Error(`X-Bridges MatrixConcat '${operation.id}' has incompatible vertical shapes`);
      }
      return [Array.from({ length: outputShape.rows * outputShape.columns }, (_, index) => {
        let row = Math.floor(index / outputShape.columns);
        const column = index % outputShape.columns;
        for (let inputIndex = 0; inputIndex < shapes.length; inputIndex++) {
          if (row < shapes[inputIndex].rows) return inputs[inputIndex][row * outputShape.columns + column];
          row -= shapes[inputIndex].rows;
        }
        return 0;
      })];
    }
    case 'MatrixDiag': {
      const inputId = operation.inputSignalIds[0];
      const outputId = operation.outputSignalIds[0];
      if (inputId === undefined || outputId === undefined) return [[0]];
      const inputShape = vectorShape(runtime, inputId);
      const outputShape = matrixShape(runtime, outputId);
      if (outputShape.rows !== inputShape.length || outputShape.columns !== inputShape.length) {
        throw new Error(`X-Bridges MatrixDiag '${operation.id}' requires an N-by-N output`);
      }
      return [Array.from({ length: inputShape.length * inputShape.length }, (_, index) =>
        Math.floor(index / inputShape.length) === index % inputShape.length
          ? inputs[0][index % inputShape.length]
          : 0)];
    }
    case 'SubMatrix': {
      const inputId = operation.inputSignalIds[0];
      const outputId = operation.outputSignalIds[0];
      if (inputId === undefined || outputId === undefined) return [[0]];
      const inputShape = matrixShape(runtime, inputId);
      const outputShape = matrixShape(runtime, outputId);
      const rowStart = Number(parameter(operation, ['rowStart'], 0));
      const rowEnd = Number(parameter(operation, ['rowEnd'], inputShape.rows - 1));
      const colStart = Number(parameter(operation, ['colStart'], 0));
      const colEnd = Number(parameter(operation, ['colEnd'], inputShape.columns - 1));
      if (rowEnd - rowStart + 1 !== outputShape.rows || colEnd - colStart + 1 !== outputShape.columns
        || rowStart < 0 || colStart < 0 || rowEnd >= inputShape.rows || colEnd >= inputShape.columns) {
        throw new Error(`X-Bridges SubMatrix '${operation.id}' has invalid static bounds`);
      }
      return [Array.from({ length: outputShape.rows * outputShape.columns }, (_, index) =>
        inputs[0][(rowStart + Math.floor(index / outputShape.columns)) * inputShape.columns
          + colStart + (index % outputShape.columns)])];
    }
    case 'MatrixSolve': {
      const matrixId = operation.inputSignalIds[0];
      const rightId = operation.inputSignalIds[1];
      const outputId = operation.outputSignalIds[0];
      if (matrixId === undefined || rightId === undefined || outputId === undefined) return [[0]];
      const matrix = matrixShape(runtime, matrixId);
      const right = matrixShape(runtime, rightId);
      const output = matrixShape(runtime, outputId);
      if (matrix.rows !== matrix.columns || right.rows !== matrix.rows
        || output.rows !== matrix.rows || output.columns !== right.columns) {
        throw new Error(`X-Bridges MatrixSolve '${operation.id}' has incompatible static shapes`);
      }
      return [boundedSolve(inputs[0], inputs[1], matrix.rows, right.columns,
        Number(parameter(operation, ['maxDimension', 'maximumDimension'], 8)))];
    }
    case 'CLARKE_TRANSFORM': {
      const ia = Number(inputs[0]?.[0] ?? 0);
      const ib = Number(inputs[1]?.[0] ?? 0);
      const ic = Number(inputs[2]?.[0] ?? 0);
      if (operation.parameters.mode === 'power_invariant') {
        const scale = Math.sqrt(2 / 3);
        return [[scale * (ia - 0.5 * ib - 0.5 * ic)], [scale * Math.sqrt(3) * (ib - ic) / 2]];
      }
      return [[ia], [(ia + 2 * ib) / Math.sqrt(3)]];
    }
    case 'PARK_TRANSFORM': {
      const alpha = Number(inputs[0]?.[0] ?? 0);
      const beta = Number(inputs[1]?.[0] ?? 0);
      const theta = Number(inputs[2]?.[0] ?? 0);
      return [[alpha * Math.cos(theta) + beta * Math.sin(theta)], [-alpha * Math.sin(theta) + beta * Math.cos(theta)]];
    }
    case 'INVERSE_PARK': {
      const d = Number(inputs[0]?.[0] ?? 0);
      const q = Number(inputs[1]?.[0] ?? 0);
      const theta = Number(inputs[2]?.[0] ?? 0);
      return [[d * Math.cos(theta) - q * Math.sin(theta)], [d * Math.sin(theta) + q * Math.cos(theta)]];
    }
    case 'INVERSE_CLARKE': {
      const alpha = Number(inputs[0]?.[0] ?? 0);
      const beta = Number(inputs[1]?.[0] ?? 0);
      return [[alpha], [-0.5 * alpha + Math.sqrt(3) * beta / 2], [-0.5 * alpha - Math.sqrt(3) * beta / 2]];
    }
    case 'AND':
      return [[inputs.every((input) => input.every(Boolean))]];
    case 'OR':
      return [[inputs.some((input) => input.some(Boolean))]];
    case 'NOT':
      return [unary(inputs[0] ?? [false], (value) => !value)];
    case 'NAND':
      return [[!inputs.every((input) => input.every(Boolean))]];
    case 'NOR':
      return [[!inputs.some((input) => input.some(Boolean))]];
    case 'XOR': {
      const activeCount = inputs.reduce(
        (count, input) => count + (input.some(Boolean) ? 1 : 0),
        0,
      );
      return [[activeCount % 2 === 1]];
    }
    case 'BitwiseAND':
      return [binary(inputs[0] ?? [0], inputs[1] ?? [0], (left, right) => (Number(left) & Number(right)) >>> 0)];
    case 'BitwiseOR':
      return [binary(inputs[0] ?? [0], inputs[1] ?? [0], (left, right) => (Number(left) | Number(right)) >>> 0)];
    case 'BitwiseXOR':
      return [binary(inputs[0] ?? [0], inputs[1] ?? [0], (left, right) => (Number(left) ^ Number(right)) >>> 0)];
    case 'BitwiseNOT':
      return [unary(inputs[0] ?? [0], (value) => (~Number(value)) >>> 0)];
    case 'ShiftLeft':
      return [binary(inputs[0] ?? [0], inputs[1] ?? [0], (left, right) => (Number(left) << Number(right)) >>> 0)];
    case 'ShiftRight':
      return [binary(inputs[0] ?? [0], inputs[1] ?? [0], (left, right) => (Number(left) >> Number(right)) >>> 0)];
    case 'SWITCH': {
      const cond = inputs[0]?.[0];
      const threshold = Number(parameter(operation, ['threshold', 'Threshold'], 0));
      const pass = Boolean(cond) && Number(cond) >= threshold;
      return [pass ? (inputs[1] ?? [0]) : (inputs[2] ?? [0])];
    }
    case 'IF_ELSE': {
      const cond = inputs[0]?.[0];
      const thresholdParam = operation.parameters.threshold ?? operation.parameters.Threshold;
      let pass = false;
      if (cond !== undefined) {
        if (thresholdParam !== undefined && thresholdParam !== null) {
          const threshold = Number(thresholdParam);
          pass = Boolean(cond) && Number(cond) >= threshold;
        } else {
          pass = typeof cond === 'boolean' ? cond : Number(cond) !== 0;
        }
      }
      return [pass ? (inputs[1] ?? [0]) : (inputs[2] ?? [0])];
    }
    case 'MUX': {
      const result = inputs.flatMap((input) => Array.from(input));
      return [result];
    }
    case 'DEMUX': {
      const input = inputs[0] ?? [0];
      const count = operation.outputSignalIds.length;
      const elementsPerOutput = Math.max(1, Math.floor(input.length / count));
      return Array.from({ length: count }, (_, idx) =>
        input.slice(idx * elementsPerOutput, (idx + 1) * elementsPerOutput),
      );
    }
    case 'SIN': return [unary(inputs[0] ?? [0], Math.sin)];
    case 'COS': return [unary(inputs[0] ?? [0], Math.cos)];
    case 'TAN': return [unary(inputs[0] ?? [0], Math.tan)];
    case 'COT': return [unary(inputs[0] ?? [0], (x) => 1 / Math.tan(x))];
    case 'SEC': return [unary(inputs[0] ?? [0], (x) => 1 / Math.cos(x))];
    case 'COSEC': return [unary(inputs[0] ?? [0], (x) => 1 / Math.sin(x))];
    case 'ASIN': return [unary(inputs[0] ?? [0], Math.asin)];
    case 'ACOS': return [unary(inputs[0] ?? [0], Math.acos)];
    case 'ATAN': return [unary(inputs[0] ?? [0], Math.atan)];
    case 'ACOT': return [unary(inputs[0] ?? [0], (x) => Math.atan(1 / x))];
    case 'ASEC': return [unary(inputs[0] ?? [0], (x) => Math.acos(1 / x))];
    case 'ACOSEC': return [unary(inputs[0] ?? [0], (x) => Math.asin(1 / x))];
    case 'SINH': return [unary(inputs[0] ?? [0], Math.sinh)];
    case 'COSH': return [unary(inputs[0] ?? [0], Math.cosh)];
    case 'TANH': return [unary(inputs[0] ?? [0], Math.tanh)];
    case 'COTH': return [unary(inputs[0] ?? [0], (x) => 1 / Math.tanh(x))];
    case 'SECH': return [unary(inputs[0] ?? [0], (x) => 1 / Math.cosh(x))];
    case 'COSECH': return [unary(inputs[0] ?? [0], (x) => 1 / Math.sinh(x))];
    case 'ASINH': return [unary(inputs[0] ?? [0], Math.asinh)];
    case 'ACOSH': return [unary(inputs[0] ?? [0], Math.acosh)];
    case 'ATANH': return [unary(inputs[0] ?? [0], Math.atanh)];
    case 'ACOTH': return [unary(inputs[0] ?? [0], (x) => Math.atanh(1 / x))];
    case 'ASECH': return [unary(inputs[0] ?? [0], (x) => Math.acosh(1 / x))];
    case 'ACOSECH': return [unary(inputs[0] ?? [0], (x) => Math.asinh(1 / x))];
    case 'TERMINATOR':
      return [];
    case 'SATURATION': {
      const u = Number(inputs[0]?.[0] ?? 0);
      const upper = Number(parameter(operation, ['upper'], 1));
      const lower = Number(parameter(operation, ['lower'], -1));
      return [[Math.max(lower, Math.min(upper, u))]];
    }
    case 'DEADZONE': {
      const u = Number(inputs[0]?.[0] ?? 0);
      const start = Number(parameter(operation, ['start'], 0.5));
      const end = Number(parameter(operation, ['end'], -0.5));
      const y = u > start ? (u - start) : (u < end ? (u - end) : 0);
      return [[y]];
    }
    case 'Step': {
      const stepTime = operation.stepParameters
        ? operation.stepParameters.threshold.milliseconds / 1000
        : Number(parameter(operation, ['step_time', 'stepTime', 'time'], 1));
      const initial = operation.stepParameters?.initialValue
        ?? Number(parameter(operation, ['initial_value', 'initialValue', 'initial'], 0));
      const final = operation.stepParameters?.finalValue
        ?? Number(parameter(operation, ['final_value', 'finalValue', 'final'], 1));
      const t = runtime.simTime ?? 0;
      const beforeThreshold = operation.stepParameters
        ? Math.round((t + runtime.ir.solver.stepSeconds) * 1000)
          < operation.stepParameters.threshold.milliseconds
        : t < stepTime;
      return [[beforeThreshold ? initial : final]];
    }
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
  const faultStart = faults.length;
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
  const errorSignalId = operationFaultContract(runtime, operation).errorSignalId;
  for (const outputSignalId of operation.outputSignalIds) {
    if (outputSignalId === dataOutputId || outputSignalId === errorSignalId) continue;
    writeSignal(runtime, outputSignalId, errors, faults);
  }
  const fault = faults[faultStart];
  if (fault !== undefined) recordOperationFault(runtime, operation, fault);
};

const stateSlotForRole = (
  operation: XBSemanticOperation,
  role: string,
) => (operation.state?.slots ?? []).find((slot) => slot.role === role);

interface PIDValues {
  readonly output: number;
  readonly iState: number;
  readonly dState: number;
  readonly lastE: number;
}

const pidValues = (
  runtime: XBRuntime,
  operation: XBSemanticOperation,
): PIDValues => {
  const iSlot = stateSlotForRole(operation, 'i_state');
  const dSlot = stateSlotForRole(operation, 'd_state');
  const lastESlot = stateSlotForRole(operation, 'last_e');
  if (iSlot === undefined || dSlot === undefined || lastESlot === undefined) {
    throw new Error(`X-Bridges PID_BASIC '${operation.id}' requires i_state, d_state, and last_e slots`);
  }
  const error = Number(signalValues(runtime, operation.inputSignalIds[0] ?? '')[0] ?? 0);
  const enabled = Number(signalValues(runtime, operation.inputSignalIds[1] ?? '')[0] ?? 0);
  const reset = Number(signalValues(runtime, operation.inputSignalIds[2] ?? '')[0] ?? 0);
  const previousI = Number((runtime.stateSlots[iSlot.id] ?? iSlot.initialValues)[0] ?? 0);
  const previousD = Number((runtime.stateSlots[dSlot.id] ?? dSlot.initialValues)[0] ?? 0);
  const previousE = Number((runtime.stateSlots[lastESlot.id] ?? lastESlot.initialValues)[0] ?? 0);
  if (reset > 0.5) return { output: 0, iState: 0, dState: 0, lastE: 0 };
  if (enabled < 0.5) return {
    output: 0, iState: previousI, dState: previousD, lastE: previousE,
  };

  const kp = Number(parameter(operation, ['Kp', 'kp'], 1));
  const ki = Number(parameter(operation, ['Ki', 'ki'], 0));
  const kd = Number(parameter(operation, ['Kd', 'kd'], 0));
  const n = Number(parameter(operation, ['N', 'n'], 100));
  const dt = Number(parameter(operation, ['sampleTime', 'dt'], 1));
  const lower = Number(parameter(operation, ['min', 'minimum'], -100));
  const upper = Number(parameter(operation, ['max', 'maximum'], 100));
  const mode = operation.parameters.mode;
  const method = operation.parameters.method;
  let nextI = previousI;
  let nextD = previousD;
  let derivative = 0;
  if (mode === 'PI' || mode === 'PID' || mode === undefined) {
    if (method === 'forward_euler') nextI = previousI + ki * previousE * dt;
    else if (method === 'backward_euler') nextI = previousI + ki * error * dt;
    else nextI = previousI + ki * (error + previousE) * dt / 2;
  }
  if (mode === 'PD' || mode === 'PID' || mode === undefined) {
    if (method === 'forward_euler') {
      derivative = kd * n * (error - previousD);
      nextD = previousD + n * (error - previousD) * dt;
    } else if (method === 'backward_euler') {
      derivative = kd * n * (error - previousD) / (1 + n * dt);
      nextD = (previousD + n * error * dt) / (1 + n * dt);
    } else {
      derivative = 2 * kd * n * (error - previousD) / (2 + n * dt);
      nextD = (previousD * (2 - n * dt) + 2 * n * error * dt) / (2 + n * dt);
    }
  }
  const unlimited = kp * error + nextI + derivative;
  const output = Math.max(lower, Math.min(upper, unlimited));
  if (ki !== 0 && ((unlimited > upper && error > 0) || (unlimited < lower && error < 0))) {
    nextI = previousI;
  }
  return { output, iState: nextI, dState: nextD, lastE: error };
};

const writeStateOutputs = (
  runtime: XBRuntime,
  operation: XBSemanticOperation,
  faults: XBNumericFault[],
): void => {
  if (operation.id === 'ekf') {
    throw new Error("Reached writeStateOutputs for EKF");
  }
  if (operation.type === 'WHITE_NOISE' || operation.type === 'BAND_LIMITED_NOISE') {
    const rngSlot = stateSlotForRole(operation, 'rng_state');
    const spareSlot = stateSlotForRole(operation, 'spare_normal');
    const hasSpareSlot = stateSlotForRole(operation, 'has_spare_normal');
    const outputId = operation.outputSignalIds[0];
    if (rngSlot && spareSlot && hasSpareSlot && outputId) {
      let state = Number((runtime.stateSlots[rngSlot.id] ?? rngSlot.initialValues)[0] ?? 0);
      let spare = Number((runtime.stateSlots[spareSlot.id] ?? spareSlot.initialValues)[0] ?? 0);
      let hasSpare = Boolean((runtime.stateSlots[hasSpareSlot.id] ?? hasSpareSlot.initialValues)[0] ?? false);
      let gaussian = 0;
      if (hasSpare) {
        gaussian = spare;
        hasSpare = false;
      } else {
        const result = nextGaussianPair(state);
        state = result.state;
        gaussian = result.gaussian;
        spare = result.spare;
        hasSpare = result.hasSpare;
      }
      runtime.stateSlots[rngSlot.id] = [convertValue(state, rngSlot.numericType, faults, operation)];
      runtime.stateSlots[spareSlot.id] = [convertValue(spare, spareSlot.numericType, faults, operation)];
      runtime.stateSlots[hasSpareSlot.id] = [convertValue(hasSpare ? 1 : 0, hasSpareSlot.numericType, faults, operation)];

      const mean = Number(parameter(operation, ['mean'], 0));
      const variance = Number(parameter(operation, ['variance'], 1));
      let y = mean + Math.sqrt(Math.max(0, variance)) * gaussian;

      if (operation.type === 'BAND_LIMITED_NOISE') {
        const filterSlot = stateSlotForRole(operation, 'filter_state');
        if (filterSlot) {
          let filterState = Number((runtime.stateSlots[filterSlot.id] ?? filterSlot.initialValues)[0] ?? 0);
          const dt = Number(parameter(operation, ['sampleTime', 'dt'], 1));
          const fc = Number(parameter(operation, ['fc'], 100));
          const alpha = dt / (1 / (2 * Math.PI * fc) + dt);
          filterState += alpha * (y - filterState);
          y = filterState;
          runtime.stateSlots[filterSlot.id] = [convertValue(filterState, filterSlot.numericType, faults, operation)];
        }
      }
      writeSignal(runtime, outputId, [y], faults, operation);
    }
    return;
  }
  if (operation.type === 'PID_BASIC') {
    const output = operation.outputSignalIds.find((id) => runtime.ir.signals[id]?.portId === 'u');
    if (output !== undefined) writeSignal(runtime, output, [pidValues(runtime, operation).output], faults, operation);
    return;
  }
  if (operation.type === 'DISCRETE_TRANSFER_FUNCTION' || operation.type === 'STATE_SPACE') {
    const xSlot = stateSlotForRole(operation, 'x');
    const ySignalId = operation.outputSignalIds.find((id) => runtime.ir.signals[id]?.portId === 'y');
    if (xSlot !== undefined && ySignalId !== undefined) {
      const x = runtime.stateSlots[xSlot.id] ?? xSlot.initialValues;
      const input = signalValues(runtime, operation.inputSignalIds[0] ?? '');
      const c = matrixParameter(operation, 'C', [[]]);
      const d = matrixParameter(operation, 'D', [[]]);
      const yLength = runtime.ir.signals[ySignalId].elementCount;
      const y = Array.from({ length: yLength }, (_, row) =>
        x.reduce<number>((total, value, column) => total + (c[row]?.[column] ?? 0) * Number(value), 0)
        + input.reduce<number>((total, value, column) => total + (d[row]?.[column] ?? 0) * Number(value), 0));
      writeSignal(runtime, ySignalId, y, faults, operation);
      if (xSlot.signalId !== null) writeSignal(runtime, xSlot.signalId, x, faults, operation);
      return;
    }
  }
  if (operation.type === 'KALMAN_FILTER') {
    const xSlot = stateSlotForRole(operation, 'x');
    const pSlot = stateSlotForRole(operation, 'P');
    const xHatId = operation.outputSignalIds.find((id) => runtime.ir.signals[id]?.portId === 'x_hat');
    const yHatId = operation.outputSignalIds.find((id) => runtime.ir.signals[id]?.portId === 'y_hat');
    const innovationId = operation.outputSignalIds.find((id) => runtime.ir.signals[id]?.portId === 'innovation');
    const kId = operation.outputSignalIds.find((id) => runtime.ir.signals[id]?.portId === 'K');
    if (xSlot !== undefined && pSlot !== undefined) {
      const uId = operation.inputSignalIds.find((id) => runtime.ir.signals[id]?.portId === 'u');
      const yMeasId = operation.inputSignalIds.find((id) => runtime.ir.signals[id]?.portId === 'y_meas');
      const u = uId ? signalValues(runtime, uId) : [0];
      const yMeas = yMeasId ? signalValues(runtime, yMeasId) : [0];
      const xLength = runtime.ir.signals[xSlot.signalId ?? xHatId ?? '']?.elementCount ?? 1;
      const xPrevFlat = runtime.stateSlots[xSlot.id] ?? xSlot.initialValues;
      const pPrevFlat = runtime.stateSlots[pSlot.id] ?? pSlot.initialValues;
      const type = xSlot.numericType;
      
      const xPrev = xPrevFlat.map(v => [Number(v)]);
      const pPrev: number[][] = [];
      for (let i = 0; i < xLength; i++) {
        pPrev.push(pPrevFlat.slice(i * xLength, (i + 1) * xLength).map(Number));
      }
      
      const A = matrixParameter(operation, 'A', [[1]]);
      const B = matrixParameter(operation, 'B', [[0]]);
      const C = matrixParameter(operation, 'C', [[1]]);
      const D = matrixParameter(operation, 'D', [[0]]);
      const Q = matrixParameter(operation, 'Q', [[0]]);
      const R = matrixParameter(operation, 'R', [[1]]);
      const I: number[][] = [];
      for (let i = 0; i < xLength; i++) {
        I[i] = [];
        for (let j = 0; j < xLength; j++) I[i]![j] = i === j ? 1 : 0;
      }
      
      const uVec = u.map(v => [Number(v)]);
      const yMeasVec = yMeas.map(v => [Number(v)]);
      
      // Predict: x = Ax + Bu
      let xPred = matrixAdd(matrixMultiply(A, xPrev, type, faults), matrixMultiply(B, uVec, type, faults), type, faults);
      // P = APA' + Q
      let pPred = matrixAdd(matrixMultiply(matrixMultiply(A, pPrev, type, faults), matrixTranspose(A), type, faults), Q, type, faults);
      
      // Update: innovation = y_meas - (C xPred + D u)
      const yHat = matrixAdd(matrixMultiply(C, xPred, type, faults), matrixMultiply(D, uVec, type, faults), type, faults);
      const innovation = matrixSubtract(yMeasVec, yHat, type, faults);
      
      // K = P_pred C' (C P_pred C' + R)^-1
      const cTrans = matrixTranspose(C);
      const sPre = matrixAdd(matrixMultiply(matrixMultiply(C, pPred, type, faults), cTrans, type, faults), R, type, faults);
      const invRes = matrixInverseGaussJordan(sPre, type, faults);
      
      let xHat = xPrev;
      let pHat = pPrev;
      let K: number[][] = [];
      for (let i = 0; i < xLength; i++) {
        K[i] = [];
        for (let j = 0; j < yMeas.length; j++) K[i]![j] = 0;
      }

      if (invRes.fault) {
        // Fallback: retain state, output default
        if (invRes.fault) faults.push('solve-pivot-failure');
        xHat = xPrev;
        pHat = pPrev;
      } else {
        K = matrixMultiply(matrixMultiply(pPred, cTrans, type, faults), invRes.matrix, type, faults);
        xHat = matrixAdd(xPred, matrixMultiply(K, innovation, type, faults), type, faults);
        const kc = matrixMultiply(K, C, type, faults);
        const ikc = matrixSubtract(I, kc, type, faults);
        pHat = matrixAdd(matrixMultiply(matrixMultiply(ikc, pPred, type, faults), matrixTranspose(ikc), type, faults), matrixMultiply(matrixMultiply(K, R, type, faults), matrixTranspose(K), type, faults), type, faults);
      }
      
      // Write state outputs
      const xHatFlat = xHat.map(r => r[0]!);
      if (xHatId !== undefined) writeSignal(runtime, xHatId, xHatFlat, faults, operation);
      if (yHatId !== undefined) writeSignal(runtime, yHatId, yHat.map(r => r[0]!), faults, operation);
      if (innovationId !== undefined) writeSignal(runtime, innovationId, innovation.map(r => r[0]!), faults, operation);
      if (kId !== undefined) writeSignal(runtime, kId, K.flat(), faults, operation);
      
      // Update internal state directly to avoid re-evaluating
      runtime.stateSlots[xSlot.id] = xHatFlat;
      runtime.stateSlots[pSlot.id] = pHat.flat();
    }
    return;
  }
  if (operation.type === 'EXTENDED_KALMAN_FILTER') {
    const xSlot = stateSlotForRole(operation, 'x');
    const pSlot = stateSlotForRole(operation, 'P');
    const xHatId = operation.outputSignalIds.find((id) => runtime.ir.signals[id]?.portId === 'x_hat');
    const yHatId = operation.outputSignalIds.find((id) => runtime.ir.signals[id]?.portId === 'y_hat');
    const innovationId = operation.outputSignalIds.find((id) => runtime.ir.signals[id]?.portId === 'innovation');
    const kId = operation.outputSignalIds.find((id) => runtime.ir.signals[id]?.portId === 'K');
    if (xSlot !== undefined && pSlot !== undefined) {
      const uId = operation.inputSignalIds.find((id) => runtime.ir.signals[id]?.portId === 'u');
      const yMeasId = operation.inputSignalIds.find((id) => runtime.ir.signals[id]?.portId === 'y_meas');
      const u = uId ? signalValues(runtime, uId).map(Number) : [0];
      const yMeas = yMeasId ? signalValues(runtime, yMeasId).map(Number) : [0];
      const xLength = runtime.ir.signals[xSlot.signalId ?? xHatId ?? '']?.elementCount ?? 1;
      const xPrevFlat = runtime.stateSlots[xSlot.id] ?? xSlot.initialValues;
      const pPrevFlat = runtime.stateSlots[pSlot.id] ?? pSlot.initialValues;
      const type = xSlot.numericType;

      const xPrev = xPrevFlat.map(Number);
      const pPrev: number[][] = [];
      for (let i = 0; i < xLength; i++) {
        pPrev.push(pPrevFlat.slice(i * xLength, (i + 1) * xLength).map(Number));
      }

      const fExprs = (operation.parameters.f as string | string[]) ?? ['x1'];
      const hExprs = (operation.parameters.h as string | string[]) ?? ['x1'];
      const Q = matrixParameter(operation, 'Q', [[0]]);
      const R = matrixParameter(operation, 'R', [[1]]);

      const evalStr = (expr: string, scope: Record<string, number>): number => {
        try {
          let jsExpr = expr;
          for (const [k, v] of Object.entries(scope)) {
            jsExpr = jsExpr.replace(new RegExp(`\\b${k}\\b`, 'g'), String(v));
          }
          const res = Number(new Function(`return (${jsExpr});`)());
          return Number.isFinite(res) ? res : 0;
        } catch {
          return 0;
        }
      };

      const evalVec = (exprs: string | string[], xVal: number[], uVal: number[]): number[] => {
        const scope: Record<string, number> = {};
        for (let i = 0; i < xVal.length; i++) scope[`x${i + 1}`] = xVal[i];
        for (let i = 0; i < uVal.length; i++) scope[`u${i + 1}`] = uVal[i];
        const arr = Array.isArray(exprs) ? exprs : [exprs];
        return arr.map((e) => evalStr(e, scope));
      };

      const computeJacobian = (exprs: string | string[], x0: number[], u0: number[], eps = 1e-6): number[][] => {
        const nx = x0.length;
        const y0 = evalVec(exprs, x0, u0);
        const ny = y0.length;
        const J: number[][] = Array.from({ length: ny }, () => Array.from({ length: nx }, () => 0));
        for (let j = 0; j < nx; j++) {
          const xPlus = [...x0]; xPlus[j] += eps;
          const xMinus = [...x0]; xMinus[j] -= eps;
          const yPlus = evalVec(exprs, xPlus, u0);
          const yMinus = evalVec(exprs, xMinus, u0);
          for (let i = 0; i < ny; i++) J[i][j] = (yPlus[i] - yMinus[i]) / (2 * eps);
        }
        return J;
      };

      // Predict
      const xPredVec = evalVec(fExprs, xPrev, u);
      const xPred = xPredVec.map((v) => [v]);
      const F = computeJacobian(fExprs, xPrev, u);
      const pPred = matrixAdd(
        matrixMultiply(matrixMultiply(F, pPrev, type, faults), matrixTranspose(F), type, faults),
        Q, type, faults,
      );

      // Update
      const H = computeJacobian(hExprs, xPredVec, u);
      const yHatVec = evalVec(hExprs, xPredVec, u);
      const yHat = yHatVec.map((v) => [v]);
      const yMeasVec = yMeas.map((v) => [v]);
      const innovation = matrixSubtract(yMeasVec, yHat, type, faults);

      const hTrans = matrixTranspose(H);
      const sPre = matrixAdd(
        matrixMultiply(matrixMultiply(H, pPred, type, faults), hTrans, type, faults),
        R, type, faults,
      );
      const invRes = matrixInverseGaussJordan(sPre, type, faults);

      let xHat = xPred;
      let pHat = pPred;
      let K: number[][] = [];
      for (let i = 0; i < xLength; i++) {
        K[i] = [];
        for (let j = 0; j < yMeas.length; j++) K[i]![j] = 0;
      }

      if (invRes.fault) {
        if (invRes.fault) faults.push('solve-pivot-failure');
        xHat = xPrev.map((v) => [v]);
        pHat = pPrev;
      } else {
        const I: number[][] = Array.from({ length: xLength }, (_, r) =>
          Array.from({ length: xLength }, (_, c) => (r === c ? 1 : 0)),
        );
        K = matrixMultiply(matrixMultiply(pPred, hTrans, type, faults), invRes.matrix, type, faults);
        xHat = matrixAdd(xPred, matrixMultiply(K, innovation, type, faults), type, faults);
        const kh = matrixMultiply(K, H, type, faults);
        const ikh = matrixSubtract(I, kh, type, faults);
        pHat = matrixAdd(
          matrixMultiply(matrixMultiply(ikh, pPred, type, faults), matrixTranspose(ikh), type, faults),
          matrixMultiply(matrixMultiply(K, R, type, faults), matrixTranspose(K), type, faults),
          type, faults,
        );
      }
      
      const xHatFlat = xHat.map(r => r[0]!);
      if (xHatId !== undefined) writeSignal(runtime, xHatId, xHatFlat, faults, operation);
      if (yHatId !== undefined) writeSignal(runtime, yHatId, yHat.map(r => r[0]!), faults, operation);
      if (innovationId !== undefined) writeSignal(runtime, innovationId, innovation.map(r => r[0]!), faults, operation);
      if (kId !== undefined) writeSignal(runtime, kId, K.flat(), faults, operation);
      
      runtime.stateSlots[xSlot.id] = xHatFlat;
      runtime.stateSlots[pSlot.id] = pHat.flat();
    }
    return;
  }
  if (operation.type === 'RATE_LIMITER') {
    const prevSlot = stateSlotForRole(operation, 'prev_y');
    const outputId = operation.outputSignalIds[0];
    if (prevSlot !== undefined && outputId !== undefined) {
      const u = Number(signalValues(runtime, operation.inputSignalIds[0] ?? '')[0] ?? 0);
      const rising = Number(parameter(operation, ['risingLimit'], 1));
      const falling = Number(parameter(operation, ['fallingLimit'], 1));
      const dt = Number(parameter(operation, ['sampleTime', 'dt'], 1));
      const prev_y = Number((runtime.stateSlots[prevSlot.id] ?? prevSlot.initialValues)[0] ?? 0);
      const y = Math.max(prev_y - falling * dt, Math.min(prev_y + rising * dt, u));
      writeSignal(runtime, outputId, [y], faults, operation);
    }
    return;
  }
  if (operation.type === 'RELAY') {
    const onSlot = stateSlotForRole(operation, 'current_on');
    const outputId = operation.outputSignalIds[0];
    if (onSlot !== undefined && outputId !== undefined) {
      const u = Number(signalValues(runtime, operation.inputSignalIds[0] ?? '')[0] ?? 0);
      const on = Number(parameter(operation, ['switchOn'], 1));
      const off = Number(parameter(operation, ['switchOff'], 0));
      const current_on_prev = Boolean((runtime.stateSlots[onSlot.id] ?? onSlot.initialValues)[0]);
      const current_on = u >= on || (current_on_prev && u > off);
      writeSignal(runtime, outputId, [current_on], faults, operation);
    }
    return;
  }
  if (operation.type === 'DELAY' || operation.type === 'UNIT_DELAY') {
    const bufferSlot = stateSlotForRole(operation, 'buffer');
    const indexSlot = stateSlotForRole(operation, 'index');
    const outputId = operation.outputSignalIds[0];
    if (bufferSlot !== undefined && outputId !== undefined) {
      const buffer = runtime.stateSlots[bufferSlot.id] ?? bufferSlot.initialValues;
      const index = indexSlot ? Number((runtime.stateSlots[indexSlot.id] ?? indexSlot.initialValues)[0] ?? 0) : 0;
      const outputSignal = runtime.ir.signals[outputId];
      const elementCount = outputSignal ? outputSignal.elementCount : 1;
      const start = index * elementCount;
      const outputValues = buffer.slice(start, start + elementCount);
      writeSignal(runtime, outputId, outputValues, faults, operation);
      return;
    }
  }
  for (const slot of operation.state?.slots ?? []) {
    if (slot.signalId === null) continue;
    writeSignal(
      runtime,
      slot.signalId,
      runtime.stateSlots[slot.id] ?? slot.initialValues,
      faults,
      operation,
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
  if (operation.type === 'PID_BASIC') {
    const values = pidValues(runtime, operation);
    const updates: Record<string, XBScalar[]> = {};
    for (const [role, value] of Object.entries({
      i_state: values.iState, d_state: values.dState, last_e: values.lastE,
    })) {
      const slot = stateSlotForRole(operation, role);
      if (slot !== undefined) updates[slot.id] = [convertValue(value, slot.numericType, faults, operation)];
    }
    return updates;
  }
  if (operation.type === 'DISCRETE_TRANSFER_FUNCTION' || operation.type === 'STATE_SPACE') {
    const xSlot = stateSlotForRole(operation, 'x');
    if (xSlot === undefined) throw new Error(`X-Bridges ${operation.type} '${operation.id}' requires an x state slot`);
    const a = matrixParameter(operation, 'A', [[0]]);
    const b = matrixParameter(operation, 'B', [[1]]);
    const state = (runtime.stateSlots[xSlot.id] ?? xSlot.initialValues).map(Number);
    const inputValues = signalValues(runtime, operation.inputSignalIds[0] ?? '').map(Number);
    return {
      [xSlot.id]: state.map((_, row) => convertValue(
        state.reduce((sum, value, column) => sum + (a[row]?.[column] ?? 0) * value, 0)
          + inputValues.reduce((sum, value, column) => sum + (b[row]?.[column] ?? 0) * value, 0),
        xSlot.numericType, faults, operation,
      )),
    };
  }
  if (operation.type === 'RATE_LIMITER') {
    const prevSlot = stateSlotForRole(operation, 'prev_y');
    if (prevSlot === undefined) throw new Error(`X-Bridges RATE_LIMITER '${operation.id}' requires a prev_y state slot`);
    const u = Number(signalValues(runtime, operation.inputSignalIds[0] ?? '')[0] ?? 0);
    const rising = Number(parameter(operation, ['risingLimit'], 1));
    const falling = Number(parameter(operation, ['fallingLimit'], 1));
    const dt = Number(parameter(operation, ['sampleTime', 'dt'], 1));
    const prev_y = Number((runtime.stateSlots[prevSlot.id] ?? prevSlot.initialValues)[0] ?? 0);
    const y = Math.max(prev_y - falling * dt, Math.min(prev_y + rising * dt, u));
    return { [prevSlot.id]: [convertValue(y, prevSlot.numericType, faults, operation)] };
  }
  if (operation.type === 'RELAY') {
    const onSlot = stateSlotForRole(operation, 'current_on');
    if (onSlot === undefined) throw new Error(`X-Bridges RELAY '${operation.id}' requires a current_on state slot`);
    const u = Number(signalValues(runtime, operation.inputSignalIds[0] ?? '')[0] ?? 0);
    const on = Number(parameter(operation, ['switchOn'], 1));
    const off = Number(parameter(operation, ['switchOff'], 0));
    const current_on_prev = Boolean((runtime.stateSlots[onSlot.id] ?? onSlot.initialValues)[0]);
    const current_on = u >= on || (current_on_prev && u > off);
    return { [onSlot.id]: [current_on] };
  }
  if (operation.type === 'WHITE_NOISE' || operation.type === 'BAND_LIMITED_NOISE' || operation.type === 'KALMAN_FILTER' || operation.type === 'EXTENDED_KALMAN_FILTER') {
    return {};
  }
  if (operation.type === 'DELAY' || operation.type === 'UNIT_DELAY') {
    const bufferSlot = stateSlotForRole(operation, 'buffer');
    const indexSlot = stateSlotForRole(operation, 'index');
    if (bufferSlot !== undefined) {
      const buffer = [...(runtime.stateSlots[bufferSlot.id] ?? bufferSlot.initialValues)];
      const index = indexSlot ? Number((runtime.stateSlots[indexSlot.id] ?? indexSlot.initialValues)[0] ?? 0) : 0;
      const inputVals = signalValues(runtime, operation.inputSignalIds[0] ?? '');
      const elementCount = inputVals.length || 1;
      const delayLength = operation.delayParameters?.delayLength ?? Math.max(1, Math.floor(buffer.length / elementCount));

      for (let m = 0; m < elementCount; m++) {
        buffer[index * elementCount + m] = convertValue(inputVals[m] ?? 0, bufferSlot.numericType, faults, operation);
      }
      const updates: Record<string, XBScalar[]> = { [bufferSlot.id]: buffer };

      if (indexSlot !== undefined && delayLength > 1) {
        const nextIndex = (index + 1) % delayLength;
        updates[indexSlot.id] = [nextIndex];
      }
      return updates;
    }
  }
  const input = signalValues(runtime, operation.inputSignalIds[0]);
  const updates: Record<string, XBScalar[]> = {};
  for (const [slotIndex, slot] of (operation.state?.slots ?? []).entries()) {
    const previous = runtime.stateSlots[slot.id] ?? [...slot.initialValues];
    const values = broadcast(input, previous.length, operation.id);
    switch (operation.type) {
      case 'DELAY':
      case 'UNIT_DELAY':
      case 'MEMORY':
        updates[slot.id] = values.map((value) =>
          convertValue(value, slot.numericType, faults, operation));
        break;
      case 'INTEGRATOR_DISCRETE': {
        const dt = Number(parameter(operation, ['sample_time', 'sampleTime', 'dt'], 1));
        const method = String(operation.parameters.method ?? 'forward_euler');
        const uPrevSlot = operation.state?.slots.find(s => s.role === 'u_prev');
        const uPrevValues = uPrevSlot ? (runtime.stateSlots[uPrevSlot.id] ?? uPrevSlot.initialValues) : values;

        if (slot.role === 'u_prev') {
          updates[slot.id] = values.map((val) => convertValue(val, slot.numericType, faults, operation));
        } else {
          updates[slot.id] = previous.map((value, index) => {
            const uCurr = Number(values[index] ?? 0);
            const uPrev = Number(uPrevValues[index] ?? 0);
            let delta = 0;
            if (method === 'backward_euler') {
              delta = dt * uCurr;
            } else if (method === 'trapezoidal' || method === 'tustin') {
              delta = 0.5 * dt * (uCurr + uPrev);
            } else {
              // forward_euler or default
              delta = uPrevSlot ? dt * uPrev : dt * uCurr;
            }
            return convertValue(
              Number(value) + delta,
              slot.numericType,
              faults, operation,
            );
          });
        }
        break;
      }
      case 'PID_CONTROLLER': {
        const reference = Number(signalValues(runtime, operation.inputSignalIds[0] ?? '')[0] ?? 0);
        const feedback = Number(signalValues(runtime, operation.inputSignalIds[1] ?? '')[0] ?? 0);
        const error = reference - feedback;
        const proportional = Number(parameter(operation, ['Kp', 'kp'], 1)) * error;
        const integral = Number(previous[0] ?? 0)
          + Number(parameter(operation, ['Ki', 'ki'], 0)) * error
            * Number(parameter(operation, ['sampleTime', 'dt'], 1));
        const lower = Number(parameter(operation, ['min', 'minimum'], -100));
        const upper = Number(parameter(operation, ['max', 'maximum'], 100));
        const output = Math.max(lower, Math.min(upper, proportional + integral));
        updates[slot.id] = Array.from({ length: previous.length }, () =>
          convertValue(slotIndex === 0 ? output : error, slot.numericType, faults, operation));
        break;
      }
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
    if (runtime.operationFaults[operation.id]?.active) continue;
    if (!forceEvaluation && !scheduledThisSubstep(runtime, operation)) continue;
    if ((operation.type === 'Inport' || operation.type === 'Outport')
      && (operation.inputSignalIds.length === 0
        || operation.outputSignalIds.length === 0)) {
      // Preserve legacy one-sided boundary models whose mapped signal is
      // already the block's only semantic port.
      continue;
    }
    if (
      operation.type === 'DATA_TYPE_CONVERSION'
      || operation.type === 'NUMERIC_REPRESENTATION'
    ) {
      executeConversionOperation(runtime, operation, faults);
      continue;
    }
    const faultStart = faults.length;
    const snapshot = snapshotOperation(runtime, operation);
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
    const intrinsicFault = intrinsicOperationFault(runtime, operation);
    if (intrinsicFault !== null && faults[faultStart] === undefined) faults.push(intrinsicFault);
    const fault = intrinsicFault ?? faults[faultStart];
    if (fault !== undefined) recordOperationFault(runtime, operation, fault, snapshot);
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
      if (slot.signalId === null) {
        throw new Error(`X-Bridges continuous state '${slot.id}' must expose a signal`);
      }
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
  snapshots: ReadonlyMap<string, XBSnapshot>,
): void => {
  slots.forEach((slot, index) => {
    if (runtime.operationFaults[slot.operation.id]?.active) return;
    const values = slot.base.map((value, valueIndex) =>
      Number(value) + scale * Number(derivatives[index][valueIndex]));
    const faultStart = faults.length;
    writeSignal(runtime, slot.signalId, values, faults, slot.operation);
    const fault = faults[faultStart];
    if (fault !== undefined) recordOperationFault(
      runtime, slot.operation, fault, snapshots.get(slot.operation.id),
    );
  });
};

const updateContinuousState = (
  runtime: XBRuntime,
  faults: XBNumericFault[],
): void => {
  const slots = continuousSlots(runtime);
  if (slots.length === 0) return;
  const snapshots = new Map<string, XBSnapshot>();
  for (const slot of slots) {
    if (!snapshots.has(slot.operation.id)) {
      snapshots.set(slot.operation.id, snapshotOperation(runtime, slot.operation));
    }
  }
  const step = runtime.ir.solver.stepSeconds;
  const k1 = continuousDerivatives(runtime, slots);
  if (runtime.ir.solver.kind === 'euler') {
    writeContinuousStage(runtime, slots, k1, step, faults, snapshots);
  } else {
    writeContinuousStage(runtime, slots, k1, step / 2, faults, snapshots);
    executeDirectOperations(runtime, faults, true);
    const k2 = continuousDerivatives(runtime, slots);
    writeContinuousStage(runtime, slots, k2, step / 2, faults, snapshots);
    executeDirectOperations(runtime, faults, true);
    const k3 = continuousDerivatives(runtime, slots);
    writeContinuousStage(runtime, slots, k3, step, faults, snapshots);
    executeDirectOperations(runtime, faults, true);
    const k4 = continuousDerivatives(runtime, slots);
    slots.forEach((slot, index) => {
      if (runtime.operationFaults[slot.operation.id]?.active) return;
      const faultStart = faults.length;
      runtime.stateSlots[slot.slotId] = slot.base.map((value, valueIndex) =>
        convertValue(
          Number(value) + step * (
            Number(k1[index][valueIndex])
            + 2 * Number(k2[index][valueIndex])
            + 2 * Number(k3[index][valueIndex])
            + Number(k4[index][valueIndex])
          ) / 6,
          slot.numericType,
          faults, slot.operation,
        ));
      const fault = faults[faultStart];
      if (fault !== undefined) recordOperationFault(
        runtime, slot.operation, fault, snapshots.get(slot.operation.id),
      );
    });
  }
  if (runtime.ir.solver.kind === 'euler') {
    slots.forEach((slot) => {
      if (runtime.operationFaults[slot.operation.id]?.active) return;
      const faultStart = faults.length;
      runtime.stateSlots[slot.slotId] = signalValues(runtime, slot.signalId)
        .map((value) => convertValue(value, slot.numericType, faults, slot.operation));
      const fault = faults[faultStart];
      if (fault !== undefined) recordOperationFault(
        runtime, slot.operation, fault, snapshots.get(slot.operation.id),
      );
    });
  }
  for (const slot of slots) {
    if (runtime.operationFaults[slot.operation.id]?.active) continue;
    writeSignal(runtime, slot.signalId, runtime.stateSlots[slot.slotId], faults, slot.operation);
  }
  executeDirectOperations(runtime, faults, true);
};

const executeSolverSubstep = (
  runtime: XBRuntime,
  faults: XBNumericFault[],
): void => {
  console.log("EXECUTE SOLVER SUBSTEP", runtime.ir.executionOrder);
  const statefulOperations: XBSemanticOperation[] = [];
  for (const operationId of runtime.ir.executionOrder) {
    const operation = runtime.ir.operations[operationId];
    if (operation === undefined) throw new Error(
      `X-Bridges execution order references missing operation '${operationId}'`,
    );
    console.log("execute loop", operationId, operation.stateful);
    if (!operation.stateful) continue;
    
    if (runtime.operationFaults[operation.id]?.active) {
      console.log("skipping due to active fault", operation.id);
      statefulOperations.push(operation);
      continue;
    }
    const outputSnapshot = snapshotOperation(runtime, operation);
    const faultStart = faults.length;
    console.log("checking scheduledThisSubstep", operation.id);
    const isScheduled = scheduledThisSubstep(runtime, operation);
    console.log("scheduledThisSubstep result:", isScheduled);
    if (isScheduled
      || operation.type === 'INTEGRATOR_CONTINUOUS'
      || operation.type === 'Integrator') {
      console.log("calling writeStateOutputs", operation.id);
      if (operation.id === 'ekf') {
        throw new Error(`EKF is scheduled! stateful=${operation.stateful}, activeFault=${runtime.operationFaults[operation.id]?.active}`);
      }
      writeStateOutputs(runtime, operation, faults);
      const fault = faults[faultStart];
      if (fault !== undefined) recordOperationFault(runtime, operation, fault, outputSnapshot);
    }
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
    if (runtime.operationFaults[operation.id]?.active) continue;
    const snapshot = snapshotOperation(runtime, operation);
    const faultStart = faults.length;
    const updates = statefulUpdate(runtime, operation, faults);
    const fault = faults[faultStart];
    if (fault !== undefined) {
      recordOperationFault(runtime, operation, fault, snapshot);
      continue;
    }
    Object.assign(pendingState, updates);
  }
  for (const [slotId, values] of Object.entries(pendingState)) {
    runtime.stateSlots[slotId] = values;
  }
  updateContinuousState(runtime, faults);
  for (const operation of runtime.ir.executionOrder
    .map((operationId) => runtime.ir.operations[operationId])) {
    if (operation !== undefined) advanceSchedule(runtime, operation);
  }
  runtime.simTime = (runtime.simTime ?? 0) + runtime.ir.solver.stepSeconds;
};

export const stepXBState = (
  runtime: XBRuntime,
  data: Record<string, number | boolean>,
): XBNumericFault[] => {
  const faults: XBNumericFault[] = [];
  runtime.numericFaults = [];
  for (const operationId of runtime.ir.executionOrder) {
    runtime.operationFaults[operationId] = { active: false, fault: null };
    const operation = runtime.ir.operations[operationId];
    const errorSignalId = operation === undefined
      ? null
      : operationFaultContract(runtime, operation).errorSignalId;
    if (errorSignalId !== null) {
      const errorSignal = runtime.ir.signals[errorSignalId];
      if (errorSignal !== undefined) {
        runtime.signals[errorSignalId] = Array.from(
          { length: errorSignal.elementCount },
          () => false,
        );
        runtime.storedIntegers[errorSignalId] = Array.from(
          { length: errorSignal.elementCount },
          () => 0,
        );
      }
    }
  }
  for (const mapping of runtime.ir.mappings) {
    if (mapping.direction !== 'in') continue;
    const varId = mapping.variableId ?? mapping.sourceVariableId ?? mapping.variable?.id;
    if (!Object.prototype.hasOwnProperty.call(data, varId)) {
      throw new Error(
        `X-Bridges input mapping variable '${varId}' is absent`,
      );
    }
    writeSignal(
      runtime,
      mapping.signalId,
      [data[varId]],
      faults,
    );
  }

  for (let substep = 0; substep < runtime.ir.solver.substepsPerTick; substep++) {
    executeSolverSubstep(runtime, faults);
  }

  for (const mapping of runtime.ir.mappings) {
    if (mapping.direction !== 'out') continue;
    const varId = mapping.variableId ?? mapping.sourceVariableId ?? mapping.variable?.id;
    const values = signalValues(runtime, mapping.signalId);
    if (values.length !== 1) {
      throw new Error(
        `X-Bridges state-machine output mapping '${varId}' `
          + 'must be scalar',
      );
    }
    data[varId] = convertValue(
      values[0],
      mapping.numericType,
      faults,
    );
  }
  return faults;
};
