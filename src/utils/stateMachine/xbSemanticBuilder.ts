import { getXBBlockCapability } from './xbCapabilities';
import { resolveGraphShapes } from './xbShapeResolver';
import type { ModelDiagnostic } from './smModel';
import type { SemanticVariable, SemanticVariableSymbol, XBOwnerState } from './smSemanticModel';
import type {
  XBMappingV1,
  XBNodeV1,
  XBParameterValue,
  XBTargetCapabilities,
} from './xbModel';
import type {
  XBOverflowMode,
  XBNumericType,
  XBRoundingMode,
  XBShape,
} from './xbNumeric';
import {
  freezeXBSemanticModel,
  type XBSemanticBuildInput,
  type XBSemanticBuildResult,
  type XBSemanticConversion,
  type XBSemanticMapping,
  type XBSemanticOperation,
  type XBSemanticSchedule,
  type XBSemanticSignal,
  type XBSemanticStateBoundary,
  type XBSemanticStateSlot,
} from './xbSemanticModel';
import { normalizePidParameters } from './xbPidContract';
import { compileEkfVectorExpressions } from './xbEkfExpressions';
import { alignRuntimeThreshold, convertTime } from './smTiming';


type UnknownRecord = Record<string, unknown>;

interface PortDescriptor {
  readonly id: string;
  readonly direction: 'input' | 'output';
  readonly shape: XBShape | null;
  readonly numericType: XBNumericType | null;
}

interface Rational {
  readonly numerator: bigint;
  readonly denominator: bigint;
}

const compareStable = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const diagnostic = (
  code: string,
  message: string,
  elementId?: string,
): ModelDiagnostic => ({
  code,
  message,
  elementId,
  severity: 'error',
});

const cloneParameterValue = (value: XBParameterValue): XBParameterValue => {
  if (Array.isArray(value)) return value.map(cloneParameterValue);
  if (isRecord(value)) {
    const clone: Record<string, XBParameterValue> = {};
    for (const key of Object.keys(value).sort(compareStable)) {
      clone[key] = cloneParameterValue(value[key] as XBParameterValue);
    }
    return clone;
  }
  return value;
};

const cloneParameters = (
  parameters: Readonly<Record<string, XBParameterValue>>,
): Record<string, XBParameterValue> => {
  const clone: Record<string, XBParameterValue> = {};
  for (const key of Object.keys(parameters).sort(compareStable)) {
    clone[key] = cloneParameterValue(parameters[key]);
  }
  return clone;
};

const greatestCommonDivisor = (left: bigint, right: bigint): bigint => {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a;
};

const rationalFromFiniteNumber = (value: number): Rational | null => {
  if (!Number.isFinite(value)) return null;
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(
    value.toString(),
  );
  if (match === null) return null;

  const sign = match[1] === '-' ? -1n : 1n;
  const fraction = match[3] ?? '';
  const exponent = Number(match[4] ?? 0) - fraction.length;
  let numerator = sign * BigInt(`${match[2]}${fraction}`);
  let denominator = 1n;
  if (exponent >= 0) {
    numerator *= 10n ** BigInt(exponent);
  } else {
    denominator = 10n ** BigInt(-exponent);
  }
  const divisor = greatestCommonDivisor(numerator, denominator);
  return {
    numerator: numerator / divisor,
    denominator: denominator / divisor,
  };
};

const multiplyRationalByInteger = (
  value: Rational,
  multiplier: bigint,
): Rational => {
  const numerator = value.numerator * multiplier;
  const divisor = greatestCommonDivisor(numerator, value.denominator);
  return {
    numerator: numerator / divisor,
    denominator: value.denominator / divisor,
  };
};

const exactPositiveIntegerRatio = (
  dividend: Rational,
  divisor: Rational,
): number | null => {
  if (dividend.numerator <= 0n || divisor.numerator <= 0n) return null;
  const numerator = dividend.numerator * divisor.denominator;
  const denominator = dividend.denominator * divisor.numerator;
  if (numerator % denominator !== 0n) return null;
  const quotient = numerator / denominator;
  return quotient <= BigInt(Number.MAX_SAFE_INTEGER)
    ? Number(quotient)
    : null;
};

const integerWidth = (type: string): number | null => {
  const match = /^u?int(8|16|32|64)?$/.exec(type);
  if (match === null) return null;
  return Number(match[1] ?? 32);
};

const numericTypeFrom = (
  rawValue: unknown,
  owner?: UnknownRecord,
): XBNumericType | null => {
  if (isRecord(rawValue)) {
    if (rawValue.kind === 'fixed'
      && typeof rawValue.signed === 'boolean'
      && typeof rawValue.wordLength === 'number'
      && typeof rawValue.fractionLength === 'number') {
      return {
        kind: 'fixed',
        signed: rawValue.signed,
        wordLength: rawValue.wordLength,
        fractionLength: rawValue.fractionLength,
      };
    }
    if (rawValue.kind === 'float'
      && (rawValue.precision === 'float16'
        || rawValue.precision === 'float32'
        || rawValue.precision === 'float64')) {
      return { kind: 'float', precision: rawValue.precision };
    }
    if (rawValue.kind === 'boolean') return { kind: 'boolean' };
    if (rawValue.kind === 'float16'
      || rawValue.kind === 'float32'
      || rawValue.kind === 'float64') {
      return { kind: rawValue.kind };
    }
    return null;
  }
  if (typeof rawValue !== 'string') return null;

  const value = rawValue.toLowerCase();
  if (value === 'auto') return null;
  if (value === 'logical' || value === 'bool' || value === 'boolean') {
    return { kind: 'boolean' };
  }
  if (value === 'continuous'
    || value === 'discrete'
    || value === 'float'
    || value === 'single'
    || value === 'float32') {
    return { kind: 'float32' };
  }
  if (value === 'double' || value === 'float64') return { kind: 'float64' };
  if (value === 'float16') return { kind: 'float16' };

  const width = integerWidth(value);
  if (width !== null) {
    return {
      kind: 'fixed',
      signed: !value.startsWith('u'),
      wordLength: width,
      fractionLength: 0,
    };
  }
  if ((value === 'fixed' || value === 'fixed_point')
    && owner !== undefined
    && typeof owner.wordLength === 'number'
    && typeof owner.fractionLength === 'number') {
    return {
      kind: 'fixed',
      signed: typeof owner.signed === 'boolean' ? owner.signed : true,
      wordLength: owner.wordLength,
      fractionLength: owner.fractionLength,
    };
  }
  return null;
};

const explicitPortNumericType = (port: UnknownRecord): XBNumericType | null =>
  numericTypeFrom(
    port.numericType ?? port.dataType ?? port.type,
    port,
  );

const conversionOutputType = (node: XBNodeV1): XBNumericType | null => {
  if (node.type !== 'DATA_TYPE_CONVERSION'
    && node.type !== 'NUMERIC_REPRESENTATION') {
    return null;
  }
  const parameters = node.parameters as UnknownRecord;
  for (const key of [
    'outputType',
    'output_type',
    'destinationType',
    'numericType',
  ]) {
    if (!Object.prototype.hasOwnProperty.call(parameters, key)) continue;
    const resolved = numericTypeFrom(parameters[key], parameters);
    if (resolved !== null) return resolved;
  }
  return null;
};

const canonicalRounding = (
  value: unknown,
): Exclude<XBRoundingMode, 'simplest'> | null => {
  if (value === undefined) return 'floor';
  switch (typeof value === 'string' ? value.toLowerCase() : value) {
    case 'floor':
      return 'floor';
    case 'ceil':
    case 'ceiling':
      return 'ceiling';
    case 'zero':
      return 'zero';
    case 'simplest':
      return 'floor';
    case 'nearest':
      return 'nearest';
    case 'round':
      return 'round';
    case 'convergent':
      return 'convergent';
    default:
      return null;
  }
};

const canonicalOverflow = (value: unknown): XBOverflowMode | null => {
  if (value === undefined) return 'saturate';
  if (typeof value !== 'string') return null;
  const normalized = value.toLowerCase();
  if (normalized === 'saturate'
    || normalized === 'wrap'
    || normalized === 'error') {
    return normalized;
  }
  return null;
};

const firstPresentParameter = (
  parameters: UnknownRecord,
  keys: readonly string[],
): unknown => {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(parameters, key)) {
      return parameters[key];
    }
  }
  return undefined;
};

const conversionForNode = (
  node: XBNodeV1,
  diagnostics: ModelDiagnostic[],
): XBSemanticConversion | null => {
  const isConversion = node.type === 'DATA_TYPE_CONVERSION'
    || node.type === 'NUMERIC_REPRESENTATION';
  if (!isConversion) return null;
  const destinationType = conversionOutputType(node);
  if (destinationType === null) {
    diagnostics.push(diagnostic(
      'XB_CONVERSION_DESTINATION_INVALID',
      `Block '${node.id}' requires an explicit supported conversion destination type.`,
      node.id,
    ));
    return null;
  }
  const parameters = node.parameters as UnknownRecord;
  const rawMode = parameters.conversionMode ?? parameters.mode;
  const reinterpret = parameters.reinterpretStoredInteger === true
    || rawMode === 'reinterpret'
    || rawMode === 'stored-integer-reinterpretation';
  const rounding = canonicalRounding(
    firstPresentParameter(parameters, [
      'rounding',
      'roundingMode',
      'rounding_method',
    ]),
  );
  const overflow = canonicalOverflow(
    firstPresentParameter(parameters, [
      'overflow',
      'overflowMode',
      'overflow_method',
    ]),
  );
  if (rounding === null || overflow === null) {
    diagnostics.push(diagnostic(
      'XB_CONVERSION_POLICY_INVALID',
      `Block '${node.id}' has an unsupported explicit conversion policy.`,
      node.id,
    ));
    return null;
  }
  return {
    destinationType,
    rounding,
    overflow,
    mode: reinterpret
      ? 'stored-integer-reinterpretation'
      : 'real-world-value',
  };
};

const shapeFromPort = (port: UnknownRecord): XBShape | null => {
  const dimensions = Array.isArray(port.dimensions)
    ? port.dimensions.filter((entry): entry is number => typeof entry === 'number')
    : null;
  if (port.shape === 'scalar') return { kind: 'scalar' };
  if (port.shape === 'vector' && dimensions?.length === 1) {
    return { kind: 'vector', length: dimensions[0] };
  }
  if (port.shape === 'matrix' && dimensions?.length === 2) {
    return { kind: 'matrix', rows: dimensions[0], columns: dimensions[1] };
  }
  if (port.shape === undefined && dimensions !== null) {
    if (dimensions.length === 0) return { kind: 'scalar' };
    if (dimensions.length === 1) {
      return { kind: 'vector', length: dimensions[0] };
    }
    if (dimensions.length === 2) {
      return { kind: 'matrix', rows: dimensions[0], columns: dimensions[1] };
    }
  }
  if (port.shape === undefined && dimensions === null) {
    return { kind: 'scalar' };
  }
  return null;
};

const parsePortValues = (
  values: unknown,
  direction: PortDescriptor['direction'],
): PortDescriptor[] => {
  if (!Array.isArray(values)) return [];
  return values
    .filter((value): value is UnknownRecord =>
      isRecord(value)
      && typeof value.id === 'string'
      && (value.direction === undefined || value.direction === direction))
    .map((value) => ({
      id: value.id as string,
      direction,
      shape: shapeFromPort(value),
      numericType: explicitPortNumericType(value),
    }));
};

const portsForNode = (node: XBNodeV1): readonly PortDescriptor[] => {
  const inputs = parsePortValues(node.parameters.inputs, 'input');
  const outputs = parsePortValues(node.parameters.outputs, 'output');
  const generic = Array.isArray(node.parameters.ports)
    ? node.parameters.ports
    : [];
  for (const value of generic) {
    if (!isRecord(value)) continue;
    if (value.direction === 'input') {
      inputs.push(...parsePortValues([value], 'input'));
    } else if (value.direction === 'output') {
      outputs.push(...parsePortValues([value], 'output'));
    }
  }
  return [...inputs, ...outputs].sort((left, right) =>
    compareStable(left.id, right.id)
    || compareStable(left.direction, right.direction));
};

interface SamplePeriodSource {
  readonly kind: 'seconds' | 'hertz';
  readonly value: unknown;
}

const samplePeriodsIn = (
  value: unknown,
  destination: SamplePeriodSource[],
  seen = new Set<unknown>(),
): void => {
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((entry) => samplePeriodsIn(entry, destination, seen));
    return;
  }
  const record = value as UnknownRecord;
  for (const key of ['sampleTime', 'sample_time']) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      destination.push({ kind: 'seconds', value: record[key] });
    }
  }
  if (Object.prototype.hasOwnProperty.call(record, 'sampleRate')) {
    destination.push({ kind: 'hertz', value: record.sampleRate });
  }
  for (const key of Object.keys(record).sort(compareStable)) {
    samplePeriodsIn(record[key], destination, seen);
  }
};

const samplePeriodsForNode = (
  node: XBNodeV1,
): readonly SamplePeriodSource[] => {
  const values: SamplePeriodSource[] = [];
  samplePeriodsIn(node.parameters, values);
  return values;
};

const isDiscreteStatefulType = (type: string): boolean =>
  type !== 'INTEGRATOR_CONTINUOUS' && type !== 'Integrator';

const scheduleForNode = (
  node: XBNodeV1,
  solverStep: Rational,
  stateful: boolean,
  diagnostics: ModelDiagnostic[],
): XBSemanticSchedule => {
  const samplePeriodSources = samplePeriodsForNode(node);
  let periodSubsteps = 1;
  let canonicalPeriod: Rational | null = null;
  let timingInvalid = false;
  for (const samplePeriodSource of samplePeriodSources) {
    const persistedValue = typeof samplePeriodSource.value === 'number'
      ? rationalFromFiniteNumber(samplePeriodSource.value)
      : null;
    const samplePeriod = persistedValue === null
      || persistedValue.numerator <= 0n
      ? null
      : samplePeriodSource.kind === 'hertz'
        ? {
          numerator: persistedValue.denominator,
          denominator: persistedValue.numerator,
        }
        : persistedValue;
    const ratio = samplePeriod === null
      ? null
      : exactPositiveIntegerRatio(samplePeriod, solverStep);
    const conflicts = canonicalPeriod !== null
      && samplePeriod !== null
      && canonicalPeriod.numerator * samplePeriod.denominator
        !== samplePeriod.numerator * canonicalPeriod.denominator;
    if (ratio === null || conflicts) {
      timingInvalid = true;
      continue;
    }
    canonicalPeriod ??= samplePeriod;
    periodSubsteps = ratio;
  }
  if (timingInvalid) {
    diagnostics.push(diagnostic(
      'XB_SAMPLE_TIME_INVALID',
      `Block '${node.id}' has invalid, conflicting, or non-divisible timing annotations.`,
      node.id,
    ));
  }
  const zeroOrderHold = samplePeriodSources.length > 0
    || (stateful && isDiscreteStatefulType(node.type));
  return {
    periodSubsteps,
    offsetSubsteps: 0,
    initialCounter: 0,
    counterIncrement: 1,
    hold: zeroOrderHold ? 'zero-order' : 'none',
  };
};

const deterministicExecutionOrder = (
  nodes: readonly XBNodeV1[],
  edges: XBSemanticBuildInput['model']['edges'],
): readonly string[] | null => {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const dependencies = new Map<string, Set<string>>();
  const dependents = new Map<string, Set<string>>();
  for (const node of nodes) {
    dependencies.set(node.id, new Set());
    dependents.set(node.id, new Set());
  }
  for (const edge of edges) {
    const target = nodeById.get(edge.targetNodeId);
    if (target === undefined
      || getXBBlockCapability(target.type)?.directFeedthrough !== true
      || !nodeById.has(edge.sourceNodeId)) {
      continue;
    }
    dependencies.get(target.id)?.add(edge.sourceNodeId);
    dependents.get(edge.sourceNodeId)?.add(target.id);
  }

  const ready = nodes
    .filter((node) => dependencies.get(node.id)?.size === 0)
    .map((node) => node.id)
    .sort(compareStable);
  const order: string[] = [];
  while (ready.length > 0) {
    const id = ready.shift()!;
    order.push(id);
    for (const dependent of [...(dependents.get(id) ?? [])].sort(compareStable)) {
      const remaining = dependencies.get(dependent)!;
      remaining.delete(id);
      if (remaining.size === 0) {
        ready.push(dependent);
        ready.sort(compareStable);
      }
    }
  }
  return order.length === nodes.length ? order : null;
};

const variableNumericType = (
  variable: SemanticVariable | undefined,
): XBNumericType | null => {
  if (variable === undefined) return null;
  if (variable.type === 'bool') return { kind: 'boolean' };
  if (variable.type === 'double') return { kind: 'float64' };
  if (variable.type === 'float' || variable.type === 'single') {
    return { kind: 'float32' };
  }
  return numericTypeFrom(variable.type);
};

const dimensionsForShape = (shape: XBShape): readonly number[] =>
  shape.kind === 'scalar'
    ? []
    : shape.kind === 'vector'
      ? [shape.length]
      : [shape.rows, shape.columns];

const elementCountForShape = (shape: XBShape): number =>
  shape.kind === 'scalar'
    ? 1
    : shape.kind === 'vector'
      ? shape.length
      : shape.rows * shape.columns;

const targetSupportsType = (
  type: XBNumericType,
  target: XBTargetCapabilities,
): boolean => {
  const precision = type.kind === 'float' ? type.precision : type.kind;
  if (precision === 'float16') return target.supportsFloat16;
  if (precision === 'float32') return target.supportsFloat32;
  if (precision === 'float64') return target.supportsFloat64;
  return true;
};

const flattenInitialValue = (
  value: unknown,
  destination: Array<number | boolean>,
): boolean => {
  if (Array.isArray(value)) {
    return value.every((entry) => flattenInitialValue(entry, destination));
  }
  if (typeof value === 'boolean') {
    destination.push(value);
    return true;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    destination.push(value);
    return true;
  }
  return false;
};

const initialValuesForSignal = (
  node: XBNodeV1,
  signal: XBSemanticSignal,
  diagnostics: ModelDiagnostic[],
  names: readonly string[] = [
    'initialValue',
    'initialCondition',
    'initial_condition',
    'initial_state',
    'initial',
  ],
): readonly (number | boolean)[] => {
  const parameters = node.parameters as UnknownRecord;
  const defaultValue = signal.numericType.kind === 'boolean' ? false : 0;
  const source = firstPresentParameter(parameters, names);
  if (source === undefined) {
    return Array.from({ length: signal.elementCount }, () => defaultValue);
  }

  const values: Array<number | boolean> = [];
  const structurallyValid = flattenInitialValue(source, values);
  const expectsBoolean = signal.numericType.kind === 'boolean';
  const typesValid = values.every((value) =>
    expectsBoolean ? typeof value === 'boolean' : typeof value === 'number');
  if (!structurallyValid
    || values.length !== signal.elementCount
    || !typesValid) {
    diagnostics.push(diagnostic(
      'XB_STATE_INITIAL_VALUE_INVALID',
      `Block '${node.id}' initial state for '${signal.id}' must contain exactly `
        + `${signal.elementCount} ${expectsBoolean ? 'boolean' : 'numeric'} value(s).`,
      node.id,
    ));
    return Array.from({ length: signal.elementCount }, () => defaultValue);
  }
  return values;
};

const stateBoundaryForNode = (
  node: XBNodeV1,
  outputSignalIds: readonly string[],
  signals: Readonly<Record<string, XBSemanticSignal>>,
  diagnostics: ModelDiagnostic[],
): XBSemanticStateBoundary => {
  const boundary = (slots: XBSemanticStateBoundary['slots']): XBSemanticStateBoundary => ({
    outputPhase: 'read-before-update',
    updatePhase: 'after-direct-feedthrough',
    slots,
  });
  const outputByPort = (portId: string): XBSemanticSignal | undefined =>
    outputSignalIds.map((id) => signals[id]).find((signal) => signal?.portId === portId);

  if (node.type === 'PID_BASIC') {
    const control = outputByPort('u') ?? signals[outputSignalIds[0] ?? ''];
    if (control === undefined) return boundary([]);
    return boundary(['i_state', 'd_state', 'last_e'].map((role) => ({
      id: `${node.id}:${role}$state`,
      role,
      signalId: null,
      numericType: control.numericType,
      shape: { kind: 'scalar' },
      initialValues: [control.numericType.kind === 'boolean' ? false : 0],
    })));
  }

  if (node.type === 'PID_CONTROLLER') {
    const control = outputByPort('u') ?? signals[outputSignalIds[0] ?? ''];
    if (control === undefined) return boundary([]);
    return boundary(['i_state', 'd_state', 'last_e', 'last_ed'].map((role) => ({
      id: `${node.id}:${role}$state`,
      role,
      signalId: null,
      numericType: control.numericType,
      shape: { kind: 'scalar' },
      initialValues: [control.numericType.kind === 'boolean' ? false : 0],
    })));
  }

  if (node.type === 'KALMAN_FILTER') {
    const exposedX = outputByPort('x_hat');
    const fallback = exposedX ?? outputByPort('y_hat') ?? signals[outputSignalIds[0] ?? ''];
    if (fallback === undefined) return boundary([]);
    const a = node.parameters.A;
    const dimension = Array.isArray(a) && a.length > 0 ? a.length : 1;
    const x = exposedX ?? {
      ...fallback,
      id: `${node.id}:x$hidden`,
      shape: { kind: 'vector' as const, length: dimension },
      elementCount: dimension,
      dimensions: [dimension],
      layout: 'contiguous' as const,
    };
    const pMatrix = {
      ...fallback,
      id: `${node.id}:p$hidden`,
      shape: { kind: 'matrix' as const, rows: dimension, columns: dimension },
      elementCount: dimension * dimension,
      dimensions: [dimension, dimension],
      layout: 'row-major' as const,
    };
    return boundary([
      {
        id: `${node.id}:x$state`,
        role: 'x',
        signalId: exposedX?.id ?? null,
        numericType: x.numericType,
        shape: x.shape,
        initialValues: initialValuesForSignal(node, x, diagnostics, ['x0']),
      },
      {
        id: `${node.id}:P$state`,
        role: 'P',
        signalId: null,
        numericType: pMatrix.numericType,
        shape: pMatrix.shape,
        initialValues: initialValuesForSignal(node, pMatrix, diagnostics, ['P0']),
      }
    ]);
  }

  if (node.type === 'DISCRETE_TRANSFER_FUNCTION' || node.type === 'STATE_SPACE') {
    const exposedX = outputByPort('x');
    const fallback = exposedX ?? outputByPort('y') ?? signals[outputSignalIds[0] ?? ''];
    if (fallback === undefined) return boundary([]);
    const a = node.parameters.A;
    const dimension = Array.isArray(a) && a.length > 0 ? a.length : 1;
    const x = exposedX ?? {
      ...fallback,
      id: `${node.id}:x$hidden`,
      shape: { kind: 'vector' as const, length: dimension },
      elementCount: dimension,
      dimensions: [dimension],
      layout: 'contiguous' as const,
    };
    return boundary([{
      id: `${node.id}:x$state`,
      role: 'x',
      signalId: exposedX?.id ?? null,
      numericType: x.numericType,
      shape: x.shape,
      initialValues: initialValuesForSignal(node, x, diagnostics, ['x0']),
    }]);
  }

  if (node.type === 'RATE_LIMITER') {
    const control = outputByPort('u') ?? outputByPort('y') ?? signals[outputSignalIds[0] ?? ''];
    if (control === undefined) return boundary([]);
    return boundary([{
      id: `${node.id}:prev_y$state`,
      role: 'prev_y',
      signalId: null,
      numericType: { kind: 'float64' },
      shape: { kind: 'scalar' },
      initialValues: [0],
    }]);
  }

  if (node.type === 'RELAY') {
    const output = outputByPort('y') ?? signals[outputSignalIds[0] ?? ''];
    if (output === undefined) return boundary([]);
    return boundary([{
      id: `${node.id}:current_on$state`,
      role: 'current_on',
      signalId: output.id,
      numericType: { kind: 'boolean' },
      shape: { kind: 'scalar' },
      initialValues: [node.parameters.initialState === true || node.parameters.initialState === 'on'],
    }]);
  }

  if (node.type === 'DFlipFlop' || node.type === 'JKFlipFlop') {
    const q = outputByPort('q') ?? signals[outputSignalIds[0] ?? ''];
    const qbar = outputByPort('qbar');
    if (q === undefined) return boundary([]);
    const initialQ = Number(node.parameters.initialCondition ?? 0);
    const slots = [
      {
        id: `${node.id}:q$state`,
        role: 'q',
        signalId: q.id,
        numericType: q.numericType,
        shape: { kind: 'scalar' as const },
        initialValues: [initialQ],
      },
      {
        id: `${node.id}:lastClk$state`,
        role: 'lastClk',
        signalId: null,
        numericType: q.numericType,
        shape: { kind: 'scalar' as const },
        initialValues: [0],
      }
    ];
    if (qbar) {
      slots.push({
        id: `${node.id}:qbar$state`,
        role: 'qbar',
        signalId: qbar.id,
        numericType: qbar.numericType,
        shape: { kind: 'scalar' as const },
        initialValues: [initialQ ? 0 : 1],
      });
    }
    return boundary(slots);
  }

  if (node.type === 'Register') {
    const out = outputByPort('out') ?? signals[outputSignalIds[0] ?? ''];
    if (out === undefined) return boundary([]);
    const initialValue = Number(node.parameters.initialValue ?? 0);
    return boundary([
      {
        id: `${node.id}:value$state`,
        role: 'value',
        signalId: out.id,
        numericType: out.numericType,
        shape: { kind: 'scalar' as const },
        initialValues: [initialValue],
      },
      {
        id: `${node.id}:lastClk$state`,
        role: 'lastClk',
        signalId: null,
        numericType: out.numericType,
        shape: { kind: 'scalar' as const },
        initialValues: [0],
      }
    ]);
  }

  if (node.type === 'Counter') {
    const out = outputByPort('out') ?? signals[outputSignalIds[0] ?? ''];
    if (out === undefined) return boundary([]);
    const initialCount = Number(node.parameters.initialCount ?? 0);
    return boundary([
      {
        id: `${node.id}:count$state`,
        role: 'count',
        signalId: out.id,
        numericType: out.numericType,
        shape: { kind: 'scalar' as const },
        initialValues: [initialCount],
      },
      {
        id: `${node.id}:lastClk$state`,
        role: 'lastClk',
        signalId: null,
        numericType: out.numericType,
        shape: { kind: 'scalar' as const },
        initialValues: [0],
      }
    ]);
  }

  if (node.type === 'WHITE_NOISE' || node.type === 'BAND_LIMITED_NOISE') {
    const output = outputByPort('y') ?? signals[outputSignalIds[0] ?? ''];
    if (output === undefined) return boundary([]);
    const float64 = { kind: 'float64' } as const;
    const boolean = { kind: 'boolean' } as const;
    const scalar = { kind: 'scalar' } as const;
    const seedRaw = node.parameters.seed;
    const seed = Number(seedRaw !== undefined ? seedRaw : 1831565813);
    const slots = [
      { id: `${node.id}:rng_state$state`, role: 'rng_state', signalId: null, numericType: float64, shape: scalar, initialValues: [seed] },
      { id: `${node.id}:spare_normal$state`, role: 'spare_normal', signalId: null, numericType: float64, shape: scalar, initialValues: [0] },
      { id: `${node.id}:has_spare_normal$state`, role: 'has_spare_normal', signalId: null, numericType: boolean, shape: scalar, initialValues: [false] }
    ];
    if (node.type === 'BAND_LIMITED_NOISE') {
      slots.push({ id: `${node.id}:filter_state$state`, role: 'filter_state', signalId: null, numericType: (output.numericType.kind === 'boolean' ? boolean : float64) as any, shape: scalar, initialValues: [0] });
    }
    return boundary(slots);
  }

  if (node.type === 'DELAY' || node.type === 'UNIT_DELAY') {
    const output = outputByPort('y') ?? outputByPort('out') ?? signals[outputSignalIds[0] ?? ''];
    if (output === undefined) return boundary([]);

    let delayLength = 1;
    if (node.type === 'DELAY') {
      const lengthParam = node.parameters.delay_length ?? node.parameters.delayLength ?? node.parameters.delay_samples ?? node.parameters.N;
      if (lengthParam === undefined || lengthParam === null) {
        diagnostics.push(diagnostic(
          'XB_DELAY_LENGTH_MISSING',
          `DELAY block '${node.id}' is missing required 'delay_length' parameter.`,
          node.id,
        ));
        return boundary([]);
      }
      if (typeof lengthParam !== 'number' || !Number.isInteger(lengthParam) || lengthParam <= 0) {
        diagnostics.push(diagnostic(
          'XB_DELAY_LENGTH_INVALID',
          `DELAY block '${node.id}' parameter 'delay_length' must be a positive integer.`,
          node.id,
        ));
        return boundary([]);
      }
      if (lengthParam > 65536) {
        diagnostics.push(diagnostic(
          'XB_DELAY_STORAGE_LIMIT_EXCEEDED',
          `DELAY block '${node.id}' delay_length '${lengthParam}' exceeds supported limit of 65536.`,
          node.id,
        ));
        return boundary([]);
      }
      delayLength = lengthParam;
    }

    const baseInitialValues = initialValuesForSignal(node, output, diagnostics, [
      'initialValue',
      'initialCondition',
      'initial_condition',
      'initial_state',
      'initial',
    ]);
    const totalBufferValues: Array<number | boolean> = [];
    for (let i = 0; i < delayLength; i++) {
      totalBufferValues.push(...baseInitialValues);
    }

    const totalBufferElements = delayLength * output.elementCount;
    const isUnitDelayNode = node.type === 'UNIT_DELAY';
    const bufferSlot: XBSemanticStateSlot = {
      id: isUnitDelayNode ? `${output.id}$state` : (delayLength === 1 ? `${output.id}$state` : `${node.id}:buffer$state`),
      role: isUnitDelayNode ? output.portId : 'buffer',
      signalId: output.id,
      numericType: output.numericType,
      shape: delayLength === 1 ? output.shape : { kind: 'vector', length: totalBufferElements },
      initialValues: totalBufferValues,
    };

    const slots: XBSemanticStateSlot[] = [bufferSlot];
    if (delayLength > 1) {
      slots.push({
        id: `${node.id}:index$state`,
        role: 'index',
        signalId: null,
        numericType: { kind: 'fixed', wordLength: 32, fractionLength: 0, signed: false },
        shape: { kind: 'scalar' },
        initialValues: [0],
      });
    }

    return boundary(slots);
  }

  return boundary(outputSignalIds.map((signalId) => {
    const signal = signals[signalId];
    return {
      id: `${signalId}$state`,
      role: signal.portId,
      signalId,
      numericType: signal.numericType,
      shape: signal.shape,
      initialValues: initialValuesForSignal(node, signal, diagnostics),
    };
  }));
};

export const buildXBSemanticModel = (
  input: XBSemanticBuildInput,
): XBSemanticBuildResult => {
  const diagnostics: ModelDiagnostic[] = [];
  const solverStep = rationalFromFiniteNumber(input.model.solver.stepSeconds);
  const baseTick = rationalFromFiniteNumber(input.baseTickMs);
  const solverStepMs = solverStep === null
    ? null
    : multiplyRationalByInteger(solverStep, 1000n);
  const substepsPerTick = baseTick === null || solverStepMs === null
    ? null
    : exactPositiveIntegerRatio(baseTick, solverStepMs);
  if (substepsPerTick === null) {
    diagnostics.push(diagnostic(
      'XB_SAMPLE_TIME_INVALID',
      'The solver step must divide the state-machine base tick exactly.',
      input.stateId,
    ));
    return { diagnostics };
  }

  const executionOrder = deterministicExecutionOrder(
    input.model.nodes,
    input.model.edges,
  );
  if (executionOrder === null) {
    return {
      diagnostics: [diagnostic(
        'XB_ALGEBRAIC_LOOP_UNSUPPORTED',
        'The X-Bridges graph contains a pure direct-feedthrough algebraic loop.',
        input.stateId,
      )],
    };
  }

  const nodeById = new Map(input.model.nodes.map((node) => [node.id, node]));
  const portsByNode = new Map(
    input.model.nodes.map((node) => [node.id, portsForNode(node)]),
  );

  const effectiveMappings: XBMappingV1[] = [...input.model.mappings];
  const sourceByInputSignalId = new Map<string, string>();
  for (const edge of input.model.edges) {
    const inputSignalId = `${edge.targetNodeId}:${edge.targetPortId}`;
    if (sourceByInputSignalId.has(inputSignalId)) {
      diagnostics.push(diagnostic(
        'XB_PORT_DANGLING',
        `Input '${inputSignalId}' has more than one signal driver.`,
        edge.targetNodeId,
      ));
      continue;
    }
    sourceByInputSignalId.set(
      inputSignalId,
      `${edge.sourceNodeId}:${edge.sourcePortId}`,
    );
  }
  if (diagnostics.length > 0) return { diagnostics };
  const inputMappingBySignalId = new Map(
    effectiveMappings
      .filter((mapping) => mapping.direction === 'in')
      .map((mapping) => [
        `${mapping.blockId}:${mapping.portId}`,
        mapping,
      ]),
  );
  const portBySignalId = new Map<string, PortDescriptor>();
  for (const [nodeId, ports] of portsByNode) {
    for (const port of ports) portBySignalId.set(`${nodeId}:${port.id}`, port);
  }

  const resolvingTypes = new Set<string>();
  const resolvedTypes = new Map<string, XBNumericType>();
  const isConvertedDataOutput = (
    node: XBNodeV1,
    port: PortDescriptor | undefined,
  ): boolean => {
    if (port?.direction !== 'output'
      || (node.type !== 'DATA_TYPE_CONVERSION'
        && node.type !== 'NUMERIC_REPRESENTATION')) {
      return false;
    }
    const outputPorts = (portsByNode.get(node.id) ?? []).filter(
      (candidate) => candidate.direction === 'output',
    );
    return port.id === 'y'
      || (outputPorts.length === 1 && outputPorts[0].id === port.id);
  };
  const resolveNumericType = (signalId: string): XBNumericType => {
    const cached = resolvedTypes.get(signalId);
    if (cached !== undefined) return cached;
    if (resolvingTypes.has(signalId)) return { kind: 'float32' };
    resolvingTypes.add(signalId);

    const separator = signalId.indexOf(':');
    const nodeId = signalId.slice(0, separator);
    const port = portBySignalId.get(signalId);
    const node = nodeById.get(nodeId);
    let resolved = node !== undefined && isConvertedDataOutput(node, port)
      ? conversionOutputType(node)
      : null;
    resolved ??= port?.numericType ?? null;
    const sourceSignalId = sourceByInputSignalId.get(signalId);
    if (resolved === null && sourceSignalId !== undefined) {
      resolved = resolveNumericType(sourceSignalId);
    }
    const mapping = inputMappingBySignalId.get(signalId);
    if (resolved === null && mapping !== undefined) {
      resolved = variableNumericType(input.variables[mapping.smVarId]);
    }
    if (resolved === null && port?.direction === 'output' && node !== undefined) {
      if (node.type === 'IF_ELSE' || node.type === 'SWITCH') {
        const inputPorts = (portsByNode.get(node.id) ?? []).filter(
          (candidate) => candidate.direction === 'input',
        );
        const dataInputPorts = node.type === 'IF_ELSE'
          ? inputPorts.filter((p) => {
              const id = p.id.toLowerCase();
              return id.includes('true') || id.includes('false') || id === 'u1' || id === 'u2' || id === 'in1' || id === 'in2';
            })
          : inputPorts.filter((p) => {
              const id = p.id.toLowerCase();
              return id === 'u1' || id === 'u2' || id === 'in1' || id === 'in2' || id === 'pass' || id === 'fail';
            });
        const candidatePorts = dataInputPorts.length > 0 ? dataInputPorts : inputPorts;
        for (const candidatePort of candidatePorts) {
          const t = resolveNumericType(`${node.id}:${candidatePort.id}`);
          if (t !== null && t !== undefined) {
            resolved = t;
            break;
          }
        }
      }
      const firstInput = (portsByNode.get(node.id) ?? [])
        .filter((candidate) => candidate.direction === 'input')
        .sort((left, right) => compareStable(left.id, right.id))[0];
      if (resolved === null && firstInput !== undefined) {
        resolved = resolveNumericType(`${node.id}:${firstInput.id}`);
      }
    }
    resolved ??= { kind: 'float32' };
    resolvingTypes.delete(signalId);
    resolvedTypes.set(signalId, resolved);
    return resolved;
  };

  const graphShapeResult = resolveGraphShapes(input.model);

  const resolveShape = (signalId: string): XBShape => {
    const semShape = graphShapeResult.portShapes.get(signalId);
    if (semShape && semShape.kind === 'vector') {
      return { kind: 'vector', length: semShape.elementCount };
    }
    if (semShape && semShape.kind === 'matrix') {
      return {
        kind: 'matrix',
        rows: semShape.dimensions[0] ?? 1,
        columns: semShape.dimensions[1] ?? 1,
      };
    }
    return { kind: 'scalar' };
  };

  const signals: Record<string, XBSemanticSignal> = {};
  for (const signalId of [...portBySignalId.keys()].sort(compareStable)) {
    const port = portBySignalId.get(signalId)!;
    const separator = signalId.indexOf(':');
    const nodeId = signalId.slice(0, separator);
    const shape = resolveShape(signalId);
    const numericType = resolveNumericType(signalId);
    if (!targetSupportsType(numericType, input.target)) {
      diagnostics.push(diagnostic(
        'XB_TARGET_CAPABILITY_MISSING',
        `Signal '${signalId}' requires an unsupported numeric type.`,
        nodeId,
      ));
    }
    signals[signalId] = {
      id: signalId,
      nodeId,
      portId: port.id,
      direction: port.direction,
      sourceSignalId: port.direction === 'input'
        ? sourceByInputSignalId.get(signalId) ?? null
        : null,
      shape,
      dimensions: dimensionsForShape(shape),
      elementCount: elementCountForShape(shape),
      layout: shape.kind === 'matrix'
        ? 'row-major'
        : shape.kind === 'vector'
          ? 'contiguous'
          : 'scalar',
      numericType,
      storage: numericType.kind === 'fixed' ? 'stored-integer' : 'native',
    };
  }

  const orderedInputPorts = (node: XBNodeV1, ports: readonly PortDescriptor[]): PortDescriptor[] => {
    const inputs = ports.filter((p) => p.direction === 'input');
    if (node.type === 'SWITCH') {
      const findPort = (kw: string[]) =>
        inputs.find((p) => kw.some((k) => p.id.toLowerCase() === k));
      const u1 = findPort(['u1', 'in1', 'pass', 'u_true']);
      const u2 = findPort(['u2', 'in2', 'fail', 'u_false']);
      const ctrl = findPort(['ctrl', 'control', 'cond', 'condition', 'u3']);
      if (u1 && u2 && ctrl) {
        const rest = inputs.filter((p) => p !== u1 && p !== u2 && p !== ctrl);
        return [u1, ctrl, u2, ...rest];
      }
    } else if (node.type === 'IF_ELSE') {
      const findPort = (kw: string[]) =>
        inputs.find((p) => kw.some((k) => p.id.toLowerCase() === k));
      const cond = findPort(['cond', 'condition', 'ctrl', 'control']);
      const uTrue = findPort(['u_true', 'true_val', 'u1', 'in1', 'pass']);
      const uFalse = findPort(['u_false', 'false_val', 'u2', 'in2', 'fail']);
      if (cond && uTrue && uFalse) {
        const rest = inputs.filter((p) => p !== cond && p !== uTrue && p !== uFalse);
        return [cond, uTrue, uFalse, ...rest];
      }
    } else if (node.type === 'SIX_STEP_COMMUTATION') {
      const h1 = inputs.find((p) => p.id === 'h1');
      const h2 = inputs.find((p) => p.id === 'h2');
      const h3 = inputs.find((p) => p.id === 'h3');
      if (h1 && h2 && h3) {
        const rest = inputs.filter((p) => p !== h1 && p !== h2 && p !== h3);
        return [h1, h2, h3, ...rest];
      }
    }
    return [...inputs];
  };

  const operations: Record<string, XBSemanticOperation> = {};
  for (const nodeId of executionOrder) {
    const node = nodeById.get(nodeId)!;
    const capability = getXBBlockCapability(node.type);
    if (capability === null || capability.codegen !== true) {
      diagnostics.push(diagnostic(
        'XB_BLOCK_NOT_CODEGEN_CAPABLE',
        `Block type '${node.type}' is not in the embedded capability registry.`,
        node.id,
      ));
      continue;
    }
    const stateful = capability.directFeedthrough === false;
    const outputSignalIds = (portsByNode.get(node.id) ?? [])
      .filter((port) => port.direction === 'output')
      .map((port) => `${node.id}:${port.id}`);
    operations[node.id] = {
      id: node.id,
      type: node.type,
      inputSignalIds: orderedInputPorts(node, portsByNode.get(node.id) ?? [])
        .map((port) => `${node.id}:${port.id}`),
      outputSignalIds,
      parameters: cloneParameters(node.parameters),
      directFeedthrough: capability.directFeedthrough,
      stateful,
      conversion: conversionForNode(node, diagnostics),
      state: stateful
        ? stateBoundaryForNode(node, outputSignalIds, signals, diagnostics)
        : null,
      schedule: scheduleForNode(node, solverStep!, stateful, diagnostics),
      numericFault: {
        fallback: stateful ? 'previous-value' : 'zero',
        errorSignalId: outputSignalIds.find((signalId) => {
          const portId = signals[signalId]?.portId;
          return portId === 'error' || (
            portId === 'e'
            && node.type !== 'DATA_TYPE_CONVERSION'
            && node.type !== 'NUMERIC_REPRESENTATION'
          );
        }) ?? null,
      },
      pidParameters: node.type === 'PID_CONTROLLER' ? normalizePidParameters(node.parameters, solverStep as any) : undefined,
    };

    if (node.type === 'DELAY' || node.type === 'UNIT_DELAY') {
      const schedule = operations[node.id].schedule;
      const lengthParam = node.type === 'UNIT_DELAY'
        ? 1
        : (node.parameters.delay_length ?? node.parameters.delayLength ?? node.parameters.delay_samples ?? node.parameters.N);
      const delayLength = typeof lengthParam === 'number' && lengthParam > 0 ? lengthParam : 1;
      const icParam = node.parameters.initialCondition ?? node.parameters.initial_condition ?? node.parameters.ic ?? 0;
      const initialCondition = typeof icParam === 'number' ? icParam : (icParam === true ? 1 : 0);
      const stepSec = solverStep ? Number(solverStep.numerator) / Number(solverStep.denominator) : 0.001;
      const samplePeriod = schedule.periodSubsteps * stepSec;
      operations[node.id] = {
        ...operations[node.id],
        delayParameters: {
          delayLength,
          initialCondition,
          samplePeriod,
          isUnitDelay: delayLength === 1,
        },
      };
    }

    if (node.type === 'Step') {
      const stepTime = node.parameters.step_time ?? node.parameters.time;
      const initialVal = node.parameters.initial_value ?? node.parameters.initial;
      const finalVal = node.parameters.final_value ?? node.parameters.final;

      if (stepTime === undefined || initialVal === undefined || finalVal === undefined) {
        diagnostics.push(diagnostic(
          'XB_STEP_PARAM_MISSING',
          `Step block '${node.id}' must specify 'step_time', 'initial_value', and 'final_value'.`,
          node.id,
        ));
      } else if (typeof stepTime !== 'number' || typeof initialVal !== 'number' || typeof finalVal !== 'number') {
        diagnostics.push(diagnostic(
          'XB_STEP_PARAM_INVALID',
          `Step block '${node.id}' parameters must be numeric values.`,
          node.id,
        ));
      } else {
        const timeMs = convertTime(stepTime, 'seconds', 'milliseconds', input.baseTickMs);
        const { thresholdMs } = alignRuntimeThreshold(timeMs, input.baseTickMs, 'ceil-to-tick');
        const ownerSt = input.ownerState ?? {
          stateId: input.stateId,
          stateName: input.stateId,
          cIndexSymbol: `SM_ST_${input.stateId.replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase()}_IDX`,
          numericIndex: 0,
        };
        operations[node.id] = {
          ...operations[node.id],
          stepParameters: {
            initialValue: initialVal,
            finalValue: finalVal,
            threshold: {
              milliseconds: thresholdMs,
              alignment: 'ceil-to-tick',
            },
            timerSource: {
              kind: 'stateElapsedTime',
              stateId: ownerSt.stateId,
              stateIndexSymbol: ownerSt.cIndexSymbol,
            },
          },
        };
      }
    }

    if (node.type === 'Outport' && node.parameters?.smVarId) {
      const smVarId = String(node.parameters.smVarId);
      const mapped = effectiveMappings.filter((m) => m.smVarId === smVarId && m.blockId === node.id);
      const variableExists = input.variables[smVarId] !== undefined
        || input.variableSymbols?.has(smVarId) === true;
      if (mapped.length === 0 && variableExists) {
        // Auto-repair: create the missing mapping entry (APP-XB-MAP-001)
        const defaultPortId = (portsByNode.get(node.id) ?? []).find(p => p.direction === 'input')?.id
          ?? (portsByNode.get(node.id) ?? [])[0]?.id
          ?? 'in';
        effectiveMappings.push({
          smVarId,
          blockId: node.id,
          portId: defaultPortId,
          direction: 'out',
        });

      } else if (mapped.length > 1) {
        diagnostics.push(diagnostic(
          'XB_MAPPING_DUPLICATE',
          `Outport '${node.id}' smVarId '${smVarId}' has duplicate entries in xBridgesModel.mappings.`,
          node.id,
        ));
      }
    }
    
    if (node.type === 'EXTENDED_KALMAN_FILTER') {
      const f = Array.isArray(node.parameters.f) ? node.parameters.f as string[] : [];
      const h = Array.isArray(node.parameters.h) ? node.parameters.h as string[] : [];
      const P0 = Array.isArray(node.parameters.P0) ? node.parameters.P0 : [[]];
      const nStates = P0.length;
      const uPort = (portsByNode.get(node.id) ?? []).find(p => p.id === 'u');
      const yPort = (portsByNode.get(node.id) ?? []).find(p => p.id === 'y_meas');
      const uSignalId = uPort ? `${node.id}:${uPort.id}` : null;
      const ySignalId = yPort ? `${node.id}:${yPort.id}` : null;
      const uShape = uSignalId ? resolveShape(uSignalId) : { kind: 'scalar' };
      const yShape = ySignalId ? resolveShape(ySignalId) : { kind: 'scalar' };
      const mInputs = uShape.kind === 'vector' ? (uShape as any).length : (uShape.kind === 'scalar' ? 1 : 0);
      const pOutputs = yShape.kind === 'vector' ? (yShape as any).length : (yShape.kind === 'scalar' ? 1 : 0);
      
      if (f.length !== nStates) {
        diagnostics.push(diagnostic('XB_EKF_DIMENSION_MISMATCH', `EKF 'f' must have ${nStates} expressions.`, node.id));
      }
      if (h.length !== pOutputs) {
        diagnostics.push(diagnostic('XB_EKF_DIMENSION_MISMATCH', `EKF 'h' must have ${pOutputs} expressions.`, node.id));
      }
      
      const symbols = new Set(['dt']);
      for (let i = 0; i < nStates; i++) symbols.add(`x${i}`);
      for (let i = 0; i < mInputs; i++) symbols.add(`u${i}`);
      
      try {
        const limits = { maxNodes: 1000, maxExpressions: Math.max(nStates, pOutputs) };
        (operations[node.id].parameters as any).fAst = compileEkfVectorExpressions(f, symbols, limits);
        (operations[node.id].parameters as any).hAst = compileEkfVectorExpressions(h, symbols, limits);
      } catch (err) {
        diagnostics.push(diagnostic('XB_EKF_INVALID_EXPRESSION', String(err), node.id));
      }
    }
  }

  const ownerState: XBOwnerState = input.ownerState ?? {
    stateId: input.stateId,
    stateName: input.stateId,
    cIndexSymbol: `SM_ST_${input.stateId.replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase()}_IDX`,
    numericIndex: 0,
  };

  const rawMappings = effectiveMappings.sort((left, right) =>
    compareStable(left.blockId, right.blockId)
    || compareStable(left.portId, right.portId)
    || compareStable(left.direction, right.direction)
    || compareStable(left.smVarId, right.smVarId));

  const mappings: XBSemanticMapping[] = [];
  for (const mapping of rawMappings) {
    const signalId = `${mapping.blockId}:${mapping.portId}`;
    const resolvedSymbol = input.variableSymbols?.get(mapping.smVarId)
      ?? (input.variables[mapping.smVarId] ? {
        id: mapping.smVarId,
        modelName: input.variables[mapping.smVarId].name,
        cIdentifier: input.variables[mapping.smVarId].cName,
        semanticType: 'float64',
        cType: 'double',
      } : undefined);

    const symbolToUse: SemanticVariableSymbol = resolvedSymbol ?? {
      id: mapping.smVarId,
      modelName: mapping.smVarId,
      cIdentifier: mapping.smVarId.replace(/[^a-zA-Z0-9_]/g, '_'),
      semanticType: 'float64',
      cType: 'double',
    };

    mappings.push({
      sourceVariableId: mapping.smVarId,
      variable: symbolToUse,
      variableId: mapping.smVarId,
      signalId,
      blockId: mapping.blockId,
      portId: mapping.portId,
      direction: mapping.direction,
      numericType: resolveNumericType(signalId),
    });
  }

  if (diagnostics.length > 0) return { diagnostics };
  return {
    diagnostics,
    ir: freezeXBSemanticModel({
      stateId: input.stateId,
      ownerState,
      executionOrder: [...executionOrder],
      operations,
      signals,
      mappings,
      solver: {
        kind: input.model.solver.kind,
        stepSeconds: input.model.solver.stepSeconds,
        substepsPerTick,
      },
      policy: {
        memory: input.model.policy.memory,
        numericFault: input.model.policy.numericFault,
      },
    }),
  };
};
