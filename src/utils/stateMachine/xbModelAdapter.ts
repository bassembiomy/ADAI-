import type { ModelDiagnostic } from './smModel';
import type {
  XBEdgeV1,
  XBMappingV1,
  XBNodeV1,
  XBParameterValue,
  XBPersistedModelV1,
} from './xbModel';
import { flattenXBSubsystems } from './xbSubsystemFlattener';

export interface XBAdaptResult {
  readonly model: XBPersistedModelV1 | null;
  readonly diagnostics: readonly ModelDiagnostic[];
}

const DEFAULT_SOLVER = {
  kind: 'euler',
  stepSeconds: 0.01,
} as const;

const DEFAULT_POLICY = {
  memory: 'reset',
  numericFault: 'escalate',
} as const;

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const invalid = (
  diagnostics: ModelDiagnostic[],
  message: string,
  elementId?: string,
): void => {
  diagnostics.push({
    code: 'XB_MODEL_INVALID',
    message,
    elementId,
    severity: 'error',
  });
};

const nonEmptyString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null;

const cloneParameterValue = (
  value: unknown,
  path: string,
): XBParameterValue => {
  if (value === null
    || typeof value === 'boolean'
    || typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return 0;
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) =>
      cloneParameterValue(entry, `${path}[${index}]`));
  }
  if (isRecord(value)) {
    const cloned: Record<string, XBParameterValue> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (entry === undefined) continue;
      cloned[key] = cloneParameterValue(entry, `${path}.${key}`);
    }
    return cloned;
  }
  throw new TypeError(`${path} is not JSON-compatible.`);
};

const cloneParameters = (
  value: unknown,
  path: string,
): Record<string, XBParameterValue> => {
  if (!isRecord(value)) {
    throw new TypeError(`${path} must be an object.`);
  }
  return cloneParameterValue(value, path) as Record<string, XBParameterValue>;
};

const cloneLegacyPorts = (
  value: unknown,
  expectedDirection: 'input' | 'output',
  path: string,
): readonly XBParameterValue[] | null => {
  if (value === undefined) return null;
  if (!Array.isArray(value)) {
    throw new TypeError(`${path} must be an array.`);
  }

  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new TypeError(`${path}[${index}] must be an object.`);
    }
    const id = nonEmptyString(entry.id);
    if (id === null) {
      throw new TypeError(`${path}[${index}].id must be a non-empty string.`);
    }
    const direction = entry.direction;
    if (direction !== expectedDirection) {
      throw new TypeError(
        `${path}[${index}].direction must be '${expectedDirection}'.`,
      );
    }

    const port: Record<string, XBParameterValue> = {
      id,
      direction: expectedDirection,
    };
    for (const key of [
      'type',
      'shape',
      'dimensions',
      'dataType',
      'numericType',
      'sampleRate',
      'sampleTime',
    ]) {
      if (entry[key] !== undefined) {
        port[key] = cloneParameterValue(entry[key], `${path}[${index}].${key}`);
      }
    }
    return port;
  });
};

const adaptNode = (
  value: unknown,
  diagnostics: ModelDiagnostic[],
  index: number,
  canonicalInput: boolean,
): XBNodeV1 | null => {
  if (!isRecord(value)) {
    invalid(diagnostics, `X-Bridges node at index ${index} must be an object.`);
    return null;
  }

  const data = isRecord(value.data) ? value.data : value;
  const id = nonEmptyString(value.id);
  const type = nonEmptyString(data.type);
  if (id === null || type === null || type === 'xblock') {
    invalid(
      diagnostics,
      `X-Bridges node at index ${index} requires stable 'id' and block 'type'.`,
      id ?? undefined,
    );
    return null;
  }

  try {
    const parameterSource = data.parameters ?? data.params;
    const parameters = cloneParameters(
      parameterSource,
      `nodes[${index}].parameters`,
    );

    if (!canonicalInput) {
      const inputs = cloneLegacyPorts(
        data.inputs,
        'input',
        `nodes[${index}].data.inputs`,
      );
      const outputs = cloneLegacyPorts(
        data.outputs,
        'output',
        `nodes[${index}].data.outputs`,
      );
      if (inputs === null || outputs === null) {
        throw new TypeError(
          `nodes[${index}] requires explicit legacy input and output port collections.`,
        );
      }
      if (Object.prototype.hasOwnProperty.call(parameters, 'inputs')
        || Object.prototype.hasOwnProperty.call(parameters, 'outputs')) {
        throw new TypeError(
          `nodes[${index}] uses reserved parameter keys 'inputs' or 'outputs'.`,
        );
      }
      parameters.inputs = inputs;
      parameters.outputs = outputs;
    }

    const label = nonEmptyString(data.label) ?? nonEmptyString(data.name);
    const parentId = nonEmptyString(data.parentId);
    return {
      id,
      type,
      ...(label === null ? {} : { label }),
      ...(parentId === null ? {} : { parentId }),
      parameters,
    };
  } catch (error) {
    invalid(diagnostics, String(error), id);
    return null;
  }
};

const adaptEdge = (
  value: unknown,
  diagnostics: ModelDiagnostic[],
  index: number,
): XBEdgeV1 | null => {
  if (!isRecord(value)) {
    invalid(diagnostics, `X-Bridges edge at index ${index} must be an object.`);
    return null;
  }

  const id = nonEmptyString(value.id);
  const sourceNodeId = nonEmptyString(value.sourceNodeId)
    ?? nonEmptyString(value.source);
  const sourcePortId = nonEmptyString(value.sourcePortId)
    ?? nonEmptyString(value.sourceHandle);
  const targetNodeId = nonEmptyString(value.targetNodeId)
    ?? nonEmptyString(value.target);
  const targetPortId = nonEmptyString(value.targetPortId)
    ?? nonEmptyString(value.targetHandle);
  if (id === null
    || sourceNodeId === null
    || sourcePortId === null
    || targetNodeId === null
    || targetPortId === null) {
    invalid(
      diagnostics,
      `X-Bridges edge at index ${index} requires an ID and explicit endpoint handles.`,
      id ?? undefined,
    );
    return null;
  }

  return { id, sourceNodeId, sourcePortId, targetNodeId, targetPortId };
};

const adaptMapping = (
  value: unknown,
  diagnostics: ModelDiagnostic[],
  index: number,
): XBMappingV1 | null => {
  if (!isRecord(value)) {
    invalid(diagnostics, `X-Bridges mapping at index ${index} must be an object.`);
    return null;
  }
  const smVarId = nonEmptyString(value.smVarId);
  const blockId = nonEmptyString(value.blockId);
  const portId = nonEmptyString(value.portId);
  const direction = value.direction;
  if (smVarId === null
    || blockId === null
    || portId === null
    || (direction !== 'in' && direction !== 'out')) {
    invalid(
      diagnostics,
      `X-Bridges mapping at index ${index} requires stable IDs and direction.`,
    );
    return null;
  }
  return { smVarId, blockId, portId, direction };
};

export const adaptXBModel = (input: unknown): XBAdaptResult => {
  const diagnostics: ModelDiagnostic[] = [];
  if (!isRecord(input)) {
    invalid(diagnostics, 'X-Bridges model must be an object.');
    return { model: null, diagnostics };
  }

  const canonicalInput = input.schemaVersion === 1;
  if (input.schemaVersion !== undefined && !canonicalInput) {
    invalid(
      diagnostics,
      `Unsupported X-Bridges schema version '${String(input.schemaVersion)}'.`,
    );
    return { model: null, diagnostics };
  }
  if (!Array.isArray(input.nodes) || !Array.isArray(input.edges)) {
    invalid(diagnostics, "X-Bridges model requires 'nodes' and 'edges' arrays.");
    return { model: null, diagnostics };
  }
  if (canonicalInput && !Array.isArray(input.mappings)) {
    invalid(diagnostics, "Canonical X-Bridges model requires a 'mappings' array.");
    return { model: null, diagnostics };
  }

  const mappingInput = input.mappings === undefined ? [] : input.mappings;
  if (!Array.isArray(mappingInput)) {
    invalid(diagnostics, "X-Bridges model 'mappings' must be an array.");
    return { model: null, diagnostics };
  }

  const nodes = input.nodes.map((entry, index) =>
    adaptNode(entry, diagnostics, index, canonicalInput));
  const edges = input.edges.map((entry, index) =>
    adaptEdge(entry, diagnostics, index));
  const mappings = mappingInput.map((entry, index) =>
    adaptMapping(entry, diagnostics, index));

  const solver = input.solver === undefined
    ? canonicalInput
      ? null
      : DEFAULT_SOLVER
    : isRecord(input.solver)
      ? {
        kind: input.solver.kind ?? (canonicalInput ? undefined : DEFAULT_SOLVER.kind),
        stepSeconds: input.solver.stepSeconds
          ?? (canonicalInput ? undefined : DEFAULT_SOLVER.stepSeconds),
      }
      : null;
  const policy = input.policy === undefined
    ? canonicalInput
      ? null
      : DEFAULT_POLICY
    : isRecord(input.policy)
      ? {
        memory: input.policy.memory
          ?? (canonicalInput ? undefined : DEFAULT_POLICY.memory),
        numericFault: input.policy.numericFault
          ?? (canonicalInput ? undefined : DEFAULT_POLICY.numericFault),
      }
      : null;

  if (solver === null
    || (solver.kind !== 'euler' && solver.kind !== 'rk4')
    || typeof solver.stepSeconds !== 'number') {
    invalid(diagnostics, 'X-Bridges solver must select Euler or RK4 with an explicit step.');
  }
  if (policy === null
    || (policy.memory !== 'reset' && policy.memory !== 'retain')
    || (policy.numericFault !== 'signal-only' && policy.numericFault !== 'escalate')) {
    invalid(diagnostics, 'X-Bridges memory and numeric-fault policies are invalid.');
  }

  if (diagnostics.length > 0
    || nodes.some((entry) => entry === null)
    || edges.some((entry) => entry === null)
    || mappings.some((entry) => entry === null)
    || solver === null
    || policy === null) {
    return { model: null, diagnostics };
  }

  return {
    model: flattenXBSubsystems({
      schemaVersion: 1,
      nodes: nodes as XBNodeV1[],
      edges: edges as XBEdgeV1[],
      mappings: mappings as XBMappingV1[],
      solver: solver as XBPersistedModelV1['solver'],
      policy: policy as XBPersistedModelV1['policy'],
    }),
    diagnostics: [],
  };
};
