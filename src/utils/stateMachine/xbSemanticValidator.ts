import { getXBBlockCapability } from './xbCapabilities';
import type { ModelDiagnostic } from './smModel';
import type { SemanticVariable } from './smSemanticModel';
import type {
  XBNodeV1,
  XBParameterValue,
  XBPersistedModelV1,
  XBTargetCapabilities,
} from './xbModel';

type UnknownRecord = Record<string, unknown>;
type PortDirection = 'input' | 'output';
type PortShape = 'scalar' | 'vector' | 'matrix';

interface PortDescriptor {
  readonly id: string;
  readonly direction: PortDirection;
  readonly shape: PortShape;
  readonly dimensions: readonly number[];
  readonly dataType: string | null;
}

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

const parsePortCollection = (
  node: XBNodeV1,
  key: 'inputs' | 'outputs',
  direction: PortDirection,
  diagnostics: ModelDiagnostic[],
): PortDescriptor[] => {
  const rawValues = node.parameters[key];
  if (rawValues === undefined) return [];
  if (!Array.isArray(rawValues)) {
    diagnostics.push(diagnostic(
      'XB_PORT_DANGLING',
      `Block '${node.id}' must declare '${key}' as an array.`,
      node.id,
    ));
    return [];
  }
  const values = rawValues;

  const ports: PortDescriptor[] = [];
  const ids = new Set<string>();
  values.forEach((value, index) => {
    if (!isRecord(value)
      || typeof value.id !== 'string'
      || value.id.trim().length === 0
      || (value.direction !== undefined && value.direction !== direction)) {
      diagnostics.push(diagnostic(
        'XB_PORT_DANGLING',
        `Block '${node.id}' has an invalid ${direction} port at index ${index}.`,
        node.id,
      ));
      return;
    }
    if (ids.has(value.id)) {
      diagnostics.push(diagnostic(
        'XB_PORT_DANGLING',
        `Block '${node.id}' declares duplicate port '${value.id}'.`,
        node.id,
      ));
      return;
    }
    ids.add(value.id);

    const explicitShape = value.shape;
    const rawDimensions = value.dimensions;
    const explicitShapeInvalid = explicitShape !== undefined
      && explicitShape !== 'scalar'
      && explicitShape !== 'vector'
      && explicitShape !== 'matrix';
    let shape: PortShape;
    let dimensions: readonly number[];
    if (explicitShape === 'scalar') {
      shape = 'scalar';
      dimensions = Array.isArray(rawDimensions)
        ? rawDimensions.filter((entry): entry is number => typeof entry === 'number')
        : [];
    } else if (explicitShape === 'vector' || explicitShape === 'matrix') {
      shape = explicitShape;
      dimensions = Array.isArray(rawDimensions)
        ? rawDimensions.filter((entry): entry is number => typeof entry === 'number')
        : [];
    } else if (explicitShapeInvalid) {
      shape = 'scalar';
      dimensions = Array.isArray(rawDimensions)
        ? rawDimensions.filter((entry): entry is number => typeof entry === 'number')
        : [];
    } else if (Array.isArray(rawDimensions)) {
      shape = rawDimensions.length === 0
        ? 'scalar'
        : rawDimensions.length === 1
          ? 'vector'
          : 'matrix';
      dimensions = rawDimensions.filter(
        (entry): entry is number => typeof entry === 'number',
      );
    } else {
      shape = 'scalar';
      dimensions = [];
    }

    const expectedDimensionCount = shape === 'scalar' ? 0 : shape === 'vector' ? 1 : 2;
    const dimensionsInvalid = explicitShapeInvalid
      || (rawDimensions !== undefined && !Array.isArray(rawDimensions))
      || (Array.isArray(rawDimensions)
        && rawDimensions.some((entry) =>
          typeof entry !== 'number'
          || !Number.isInteger(entry)
          || entry <= 0))
      || dimensions.length !== expectedDimensionCount;
    if (dimensionsInvalid) {
      diagnostics.push(diagnostic(
        'XB_DIMENSION_DYNAMIC',
        `Port '${node.id}:${value.id}' must have fixed positive dimensions.`,
        node.id,
      ));
    }

    const dataType = typeof value.dataType === 'string'
      ? value.dataType
      : typeof value.numericType === 'string'
        ? value.numericType
        : typeof value.type === 'string'
          ? value.type
          : isRecord(value.numericType) && typeof value.numericType.kind === 'string'
            ? value.numericType.kind === 'float'
              && typeof value.numericType.precision === 'string'
              ? value.numericType.precision
              : value.numericType.kind
            : null;
    ports.push({ id: value.id, direction, shape, dimensions, dataType });
  });
  return ports;
};

const portsForNode = (
  node: XBNodeV1,
  diagnostics: ModelDiagnostic[],
): readonly PortDescriptor[] => {
  const genericValue = node.parameters.ports;
  if (genericValue === undefined
    && (node.parameters.inputs === undefined
      || node.parameters.outputs === undefined)) {
    diagnostics.push(diagnostic(
      'XB_PORT_DANGLING',
      `Block '${node.id}' must declare complete input and output port topology.`,
      node.id,
    ));
  }

  const inputs = parsePortCollection(node, 'inputs', 'input', diagnostics);
  const outputs = parsePortCollection(node, 'outputs', 'output', diagnostics);
  const genericPorts = genericValue;
  if (genericPorts === undefined) return [...inputs, ...outputs];
  if (!Array.isArray(genericPorts)) {
    diagnostics.push(diagnostic(
      'XB_PORT_DANGLING',
      `Block '${node.id}' must declare 'ports' as an array.`,
      node.id,
    ));
    return [...inputs, ...outputs];
  }

  const genericInputs: XBParameterValue[] = [];
  const genericOutputs: XBParameterValue[] = [];
  genericPorts.forEach((value, index) => {
    if (!isRecord(value)
      || (value.direction !== 'input' && value.direction !== 'output')) {
      diagnostics.push(diagnostic(
        'XB_PORT_DANGLING',
        `Block '${node.id}' has an invalid generic port at index ${index}.`,
        node.id,
      ));
      return;
    }
    if (value.direction === 'input') {
      genericInputs.push(value as XBParameterValue);
    } else {
      genericOutputs.push(value as XBParameterValue);
    }
  });

  const genericParameters = {
    inputs: genericInputs,
    outputs: genericOutputs,
  };
  const genericNode: XBNodeV1 = {
    ...node,
    parameters: genericParameters,
  };
  const merged = [
    ...inputs,
    ...outputs,
    ...parsePortCollection(genericNode, 'inputs', 'input', diagnostics),
    ...parsePortCollection(genericNode, 'outputs', 'output', diagnostics),
  ];
  const portIds = new Set<string>();
  for (const port of merged) {
    if (portIds.has(port.id)) {
      diagnostics.push(diagnostic(
        'XB_PORT_DANGLING',
        `Block '${node.id}' declares duplicate port ID '${port.id}'.`,
        node.id,
      ));
    }
    portIds.add(port.id);
  }
  return merged;
};

const visitObjects = (
  value: unknown,
  visitor: (value: UnknownRecord) => void,
  seen = new Set<unknown>(),
): void => {
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((entry) => visitObjects(entry, visitor, seen));
    return;
  }
  const record = value as UnknownRecord;
  visitor(record);
  Object.values(record).forEach((entry) => visitObjects(entry, visitor, seen));
};

const validateFixedAndTargetTypes = (
  node: XBNodeV1,
  target: XBTargetCapabilities,
  diagnostics: ModelDiagnostic[],
): void => {
  visitObjects(node.parameters, (value) => {
    const nestedFixed = value.kind === 'fixed';
    const persistedFixed = value.output_type === 'fixed_point';
    if (nestedFixed || persistedFixed) {
      const wordLength = value.wordLength;
      const fractionLength = value.fractionLength;
      const scale = typeof fractionLength === 'number'
        ? 2 ** fractionLength
        : Number.NaN;
      if ((nestedFixed && typeof value.signed !== 'boolean')
        || typeof wordLength !== 'number'
        || !Number.isInteger(wordLength)
        || wordLength < 1
        || wordLength > 32
        || typeof fractionLength !== 'number'
        || !Number.isInteger(fractionLength)
        || !Number.isFinite(scale)
        || scale === 0) {
        diagnostics.push(diagnostic(
          'XB_FIXED_FORMAT_INVALID',
          `Block '${node.id}' has an invalid fixed-point format.`,
          node.id,
        ));
      }
    }

    const persistedType = value.output_type === 'single'
      ? 'float32'
      : value.output_type === 'double'
        ? 'float64'
        : value.output_type;
    const kind = value.kind === 'float'
      ? value.precision
      : value.kind ?? persistedType;
    const supported = kind === 'float16'
      ? target.supportsFloat16
      : kind === 'float32'
        ? target.supportsFloat32
        : kind === 'float64'
          ? target.supportsFloat64
          : true;
    if (!supported) {
      diagnostics.push(diagnostic(
        'XB_TARGET_CAPABILITY_MISSING',
        `Block '${node.id}' requires unsupported numeric type '${String(kind)}'.`,
        node.id,
      ));
    }
  });
};

const validateSampleTimes = (
  model: XBPersistedModelV1,
  diagnostics: ModelDiagnostic[],
): void => {
  const step = model.solver.stepSeconds;
  if ((model.solver.kind !== 'euler' && model.solver.kind !== 'rk4')
    || !Number.isFinite(step)
    || step <= 0) {
    diagnostics.push(diagnostic(
      'XB_SAMPLE_TIME_INVALID',
      'The embedded solver requires a finite positive fixed step.',
    ));
    return;
  }

  for (const node of model.nodes) {
    visitObjects(node.parameters, (value) => {
      for (const key of ['sampleTime', 'sample_time', 'sampleRate']) {
        if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
        const sampleTime = value[key];
        const ratio = typeof sampleTime === 'number' ? sampleTime / step : Number.NaN;
        if (!Number.isFinite(ratio)
          || sampleTime as number <= 0
          || Math.abs(ratio - Math.round(ratio)) > 1e-9) {
          diagnostics.push(diagnostic(
            'XB_SAMPLE_TIME_INVALID',
            `Block '${node.id}' has a sample time outside the fixed-step schedule.`,
            node.id,
          ));
        }
      }
    });
  }
};

const canonicalPortType = (type: string | null): string | null => {
  if (type === null || type === 'auto') return null;
  if (['logical', 'bool', 'boolean'].includes(type)) return 'boolean';
  if (['continuous', 'discrete', 'float', 'single', 'float32'].includes(type)) {
    return 'float32';
  }
  if (['double', 'float64'].includes(type)) return 'float64';
  if (type === 'float16') return 'float16';
  if (/^u?int(?:8|16|32|64)?$/.test(type) || type === 'fixed') return 'fixed';
  return type;
};

const canonicalVariableType = (variable: SemanticVariable): string => {
  if (variable.type === 'bool') return 'boolean';
  if (variable.type === 'double') return 'float64';
  if (variable.type === 'float' || variable.type === 'single') return 'float32';
  return 'fixed';
};

const hasAlgebraicCycle = (
  model: XBPersistedModelV1,
  nodesById: ReadonlyMap<string, XBNodeV1>,
): boolean => {
  const directNodeIds = new Set(
    model.nodes
      .filter((node) => getXBBlockCapability(node.type)?.directFeedthrough === true)
      .map((node) => node.id),
  );
  const adjacency = new Map<string, string[]>();
  directNodeIds.forEach((id) => adjacency.set(id, []));
  for (const edge of model.edges) {
    if (directNodeIds.has(edge.sourceNodeId)
      && directNodeIds.has(edge.targetNodeId)
      && nodesById.has(edge.sourceNodeId)
      && nodesById.has(edge.targetNodeId)) {
      adjacency.get(edge.sourceNodeId)?.push(edge.targetNodeId);
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const next of adjacency.get(id) ?? []) {
      if (visit(next)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  return [...directNodeIds].some(visit);
};

export const validateXBModel = (
  model: XBPersistedModelV1,
  variables: Readonly<Record<string, SemanticVariable>>,
  target: XBTargetCapabilities,
): ModelDiagnostic[] => {
  const diagnostics: ModelDiagnostic[] = [];
  const nodesById = new Map<string, XBNodeV1>();
  const portsByNode = new Map<string, readonly PortDescriptor[]>();

  for (const node of model.nodes) {
    if (nodesById.has(node.id)) {
      diagnostics.push(diagnostic(
        'XB_PORT_DANGLING',
        `X-Bridges block ID '${node.id}' is duplicated.`,
        node.id,
      ));
      continue;
    }
    nodesById.set(node.id, node);
    const capability = getXBBlockCapability(node.type);
    if (capability === null || capability.codegen !== true) {
      diagnostics.push(diagnostic(
        'XB_BLOCK_NOT_CODEGEN_CAPABLE',
        capability?.reason
          ?? `Block type '${node.type}' is not in the embedded capability registry.`,
        node.id,
      ));
    } else {
      for (const requirement of capability.requiredTargetCapabilities ?? []) {
        if (requirement === 'math-library' && !target.supportsMathLibrary) {
          diagnostics.push(diagnostic(
            'XB_TARGET_CAPABILITY_MISSING',
            `Block '${node.id}' requires target math-library support.`,
            node.id,
          ));
        }
      }
    }
    const parameters = node.parameters as Record<string, unknown>;
    if (node.type === 'MatrixSolve') {
      const maximum = parameters.maxDimension ?? parameters.maximumDimension ?? 8;
      if (!Number.isSafeInteger(maximum) || (maximum as number) < 1 || (maximum as number) > 8) {
        diagnostics.push(diagnostic(
          'XB_MATRIX_SOLVE_BOUND_INVALID',
          `MatrixSolve '${node.id}' maxDimension must be an integer from 1 through 8.`,
          node.id,
        ));
      }
    }
    if (node.type === 'PID_BASIC' && !(typeof parameters.sampleTime === 'number' && parameters.sampleTime > 0)) {
      diagnostics.push(diagnostic(
        'XB_DISCRETE_SAMPLE_TIME_REQUIRED',
        `PID_BASIC '${node.id}' requires a positive discrete sampleTime for embedded generation.`,
        node.id,
      ));
    }
    if (node.type === 'STATE_SPACE' && parameters.representation !== 'discrete') {
      diagnostics.push(diagnostic(
        'XB_DISCRETE_REPRESENTATION_REQUIRED',
        `STATE_SPACE '${node.id}' requires representation: 'discrete' for embedded generation.`,
        node.id,
      ));
    }

    const ports = portsForNode(node, diagnostics);
    portsByNode.set(node.id, ports);
    if (capability?.codegen === true) {
      for (const port of ports) {
        const allowedShapes = port.direction === 'input'
          ? capability.inputShapes ?? capability.shapes
          : capability.outputShapes ?? capability.shapes;
        if (!allowedShapes.includes(port.shape)) {
          diagnostics.push(diagnostic(
            'XB_BLOCK_NOT_CODEGEN_CAPABLE',
            `Block '${node.id}' does not support ${port.shape} signals in embedded code.`,
            node.id,
          ));
        }
      }
    }
    for (const port of ports) {
      if ((port.shape === 'vector'
        && port.dimensions[0] > target.maxVectorLength)
        || (port.shape === 'matrix'
          && port.dimensions.some((dimension) =>
            dimension > target.maxMatrixDimension))) {
        diagnostics.push(diagnostic(
          'XB_TARGET_CAPABILITY_MISSING',
          `Port '${node.id}:${port.id}' exceeds target dimension limits.`,
          node.id,
        ));
      }
      const numericType = canonicalPortType(port.dataType);
      if ((numericType === 'float16' && !target.supportsFloat16)
        || (numericType === 'float32' && !target.supportsFloat32)
        || (numericType === 'float64' && !target.supportsFloat64)) {
        diagnostics.push(diagnostic(
          'XB_TARGET_CAPABILITY_MISSING',
          `Port '${node.id}:${port.id}' requires unsupported ${numericType}.`,
          node.id,
        ));
      }
    }
    validateFixedAndTargetTypes(node, target, diagnostics);
  }

  const edgeIds = new Set<string>();
  const scalarDriverCounts = new Map<string, number>();
  for (const edge of model.edges) {
    if (edgeIds.has(edge.id)) {
      diagnostics.push(diagnostic(
        'XB_PORT_DANGLING',
        `X-Bridges edge ID '${edge.id}' is duplicated.`,
        edge.id,
      ));
    }
    edgeIds.add(edge.id);

    const sourcePorts = portsByNode.get(edge.sourceNodeId) ?? [];
    const targetPorts = portsByNode.get(edge.targetNodeId) ?? [];
    const source = sourcePorts.find(
      (port) => port.id === edge.sourcePortId && port.direction === 'output',
    );
    const destination = targetPorts.find(
      (port) => port.id === edge.targetPortId && port.direction === 'input',
    );
    if (!nodesById.has(edge.sourceNodeId)
      || !nodesById.has(edge.targetNodeId)
      || source === undefined
      || destination === undefined) {
      diagnostics.push(diagnostic(
        'XB_PORT_DANGLING',
        `Edge '${edge.id}' references a missing block or directional port handle.`,
        edge.id,
      ));
      continue;
    }
    if (destination.shape === 'scalar') {
      const inputKey = `${edge.targetNodeId}:${edge.targetPortId}`;
      scalarDriverCounts.set(
        inputKey,
        (scalarDriverCounts.get(inputKey) ?? 0) + 1,
      );
    }
  }

  const mappingKeys = new Set<string>();
  const outputVariables = new Set<string>();
  for (const mapping of model.mappings) {
    const node = nodesById.get(mapping.blockId);
    const variable = Object.prototype.hasOwnProperty.call(variables, mapping.smVarId)
      ? variables[mapping.smVarId]
      : undefined;
    const ports = portsByNode.get(mapping.blockId) ?? [];
    const port = ports.find((candidate) => candidate.id === mapping.portId);
    const mappedDirectionValid = port !== undefined && node !== undefined
      && (mapping.direction === 'in'
        ? port.direction === 'input'
          || (node.type === 'Inport' && port.direction === 'output')
        : port.direction === 'output'
          || (node.type === 'Outport' && port.direction === 'input'));
    const mappingKey = `${mapping.blockId}:${mapping.portId}:${mapping.direction}`;
    const duplicate = mappingKeys.has(mappingKey)
      || (mapping.direction === 'out' && outputVariables.has(mapping.smVarId));
    mappingKeys.add(mappingKey);
    if (mapping.direction === 'out') outputVariables.add(mapping.smVarId);

    const portType = canonicalPortType(port?.dataType ?? null);
    const variableType = variable === undefined
      ? null
      : canonicalVariableType(variable);
    const explicitConversion = node?.type === 'DATA_TYPE_CONVERSION'
      || node?.type === 'NUMERIC_REPRESENTATION';
    const typeCompatible = portType === null
      || variableType === null
      || portType === variableType
      || explicitConversion;
    const shapeCompatible = port === undefined || port.shape === 'scalar';
    if (mapping.direction === 'in'
      && mappedDirectionValid
      && port?.direction === 'input'
      && port.shape === 'scalar') {
      const inputKey = `${mapping.blockId}:${mapping.portId}`;
      scalarDriverCounts.set(
        inputKey,
        (scalarDriverCounts.get(inputKey) ?? 0) + 1,
      );
    }

    if (node === undefined
      || variable === undefined
      || !mappedDirectionValid
      || duplicate
      || !typeCompatible
      || !shapeCompatible) {
      diagnostics.push(diagnostic(
        'XB_MAPPING_INVALID',
        `Mapping '${mapping.smVarId}:${mapping.blockId}:${mapping.portId}' is invalid or requires an explicit conversion.`,
        mapping.blockId,
      ));
    }
  }

  for (const [nodeId, ports] of portsByNode) {
    for (const port of ports) {
      if (port.direction !== 'input' || port.shape !== 'scalar') continue;
      const inputKey = `${nodeId}:${port.id}`;
      const driverCount = scalarDriverCounts.get(inputKey) ?? 0;
      if (driverCount !== 1) {
        diagnostics.push(diagnostic(
          'XB_PORT_DANGLING',
          `Scalar input '${inputKey}' requires exactly one driver; found ${driverCount}.`,
          nodeId,
        ));
      }
    }
  }

  validateSampleTimes(model, diagnostics);
  if (hasAlgebraicCycle(model, nodesById)) {
    diagnostics.push(diagnostic(
      'XB_ALGEBRAIC_LOOP_UNSUPPORTED',
      'The X-Bridges graph contains a pure direct-feedthrough algebraic loop.',
    ));
  }

  return diagnostics;
};
