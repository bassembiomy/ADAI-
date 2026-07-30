import { getXBBlockCapability } from './xbCapabilities';
import type { ModelDiagnostic } from './smModel';
import type { SemanticVariable } from './smSemanticModel';
import type {
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
} from './xbSemanticModel';

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
): readonly (number | boolean)[] => {
  const parameters = node.parameters as UnknownRecord;
  const defaultValue = signal.numericType.kind === 'boolean' ? false : 0;
  const source = firstPresentParameter(parameters, [
    'initialValue',
    'initialCondition',
    'initial_state',
    'initial',
  ]);
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
): XBSemanticStateBoundary => ({
  outputPhase: 'read-before-update',
  updatePhase: 'after-direct-feedthrough',
  slots: outputSignalIds.map((signalId) => {
    const signal = signals[signalId];
    return {
      id: `${signalId}$state`,
      signalId,
      numericType: signal.numericType,
      shape: signal.shape,
      initialValues: initialValuesForSignal(node, signal, diagnostics),
    };
  }),
});

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
    input.model.mappings
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
      const firstInput = (portsByNode.get(node.id) ?? [])
        .filter((candidate) => candidate.direction === 'input')
        .sort((left, right) => compareStable(left.id, right.id))[0];
      if (firstInput !== undefined) {
        resolved = resolveNumericType(`${node.id}:${firstInput.id}`);
      }
    }
    resolved ??= { kind: 'float32' };
    resolvingTypes.delete(signalId);
    resolvedTypes.set(signalId, resolved);
    return resolved;
  };

  const resolvingShapes = new Set<string>();
  const resolvedShapes = new Map<string, XBShape>();
  const resolveShape = (signalId: string): XBShape => {
    const cached = resolvedShapes.get(signalId);
    if (cached !== undefined) return cached;
    if (resolvingShapes.has(signalId)) return { kind: 'scalar' };
    resolvingShapes.add(signalId);
    const separator = signalId.indexOf(':');
    const nodeId = signalId.slice(0, separator);
    const port = portBySignalId.get(signalId);
    const node = nodeById.get(nodeId);
    let resolved = port?.shape ?? null;
    const sourceSignalId = sourceByInputSignalId.get(signalId);
    if (resolved === null && sourceSignalId !== undefined) {
      resolved = resolveShape(sourceSignalId);
    }
    if (resolved === null && port?.direction === 'output' && node !== undefined) {
      const firstInput = (portsByNode.get(node.id) ?? [])
        .filter((candidate) => candidate.direction === 'input')
        .sort((left, right) => compareStable(left.id, right.id))[0];
      if (firstInput !== undefined) resolved = resolveShape(`${node.id}:${firstInput.id}`);
    }
    resolved ??= { kind: 'scalar' };
    resolvingShapes.delete(signalId);
    resolvedShapes.set(signalId, resolved);
    return resolved;
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
      inputSignalIds: (portsByNode.get(node.id) ?? [])
        .filter((port) => port.direction === 'input')
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
    };
  }

  const mappings: XBSemanticMapping[] = [...input.model.mappings]
    .sort((left, right) =>
      compareStable(left.blockId, right.blockId)
      || compareStable(left.portId, right.portId)
      || compareStable(left.direction, right.direction)
      || compareStable(left.smVarId, right.smVarId))
    .map((mapping) => {
      const signalId = `${mapping.blockId}:${mapping.portId}`;
      return {
        variableId: mapping.smVarId,
        signalId,
        blockId: mapping.blockId,
        portId: mapping.portId,
        direction: mapping.direction,
        numericType: resolveNumericType(signalId),
      };
    });

  if (diagnostics.length > 0) return { diagnostics };
  return {
    diagnostics,
    ir: freezeXBSemanticModel({
      stateId: input.stateId,
      executionOrder: [...executionOrder],
      operations,
      signals,
      mappings,
      solver: {
        kind: input.model.solver.kind,
        substepsPerTick,
      },
      policy: {
        memory: input.model.policy.memory,
        numericFault: input.model.policy.numericFault,
      },
    }),
  };
};
