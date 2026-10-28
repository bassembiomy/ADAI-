import type { VariableType } from '../../../types/sm_types';
import type { ExpressionNode } from '../smExpressions';
import type { SemanticModel } from '../smSemanticModel';

/** Invalid-input policy of a required port (`SMInvalidInputPolicy` of the model's verification configuration). */
export type AutosarInputPolicy = 'reject' | 'default' | 'clamp' | 'diagnostic-fault';

export interface AutosarPort {
  variableId: string;
  /** Port prototype short name: PP_<cName> (provided) or RP_<cName> (required). */
  portName: string;
  interfaceName: string;
  dataElementName: string;
  /** AUTOSAR_Platform implementation data type short name. */
  platformType: string;
  /** Numeric text of the modelled initial value ('1'/'0' for boolean). */
  initValue: string;
  /** C identifier of the variable inside SM_Data_t. */
  cName: string;
  /** Required ports of a model with I/O mappings: the model's policy for failed or invalid reads. */
  invalidInputPolicy?: AutosarInputPolicy;
  /** Provided ports: value published while the core fault is latched (write mapping `safeValue`). */
  safeValue?: number | boolean;
  /** Required ports with policy `clamp`: effective bounds (a bound that cannot restrict the type is absent). */
  clampMin?: number;
  clampMax?: number;
}

export interface AutosarPortModel {
  provided: AutosarPort[];
  required: AutosarPort[];
  /** Model names of variables neither read nor written: no port is derived for them. */
  unused: string[];
  /** true: the model's I/O mappings define the interface; false: directions are inferred from usage. */
  mapped: boolean;
  /** Mapped: names of read-mapped variables assigned by an action (an error). */
  inputsWrittenByModel: string[];
  /** Inferred: names of variables both read and written (direction is a guess). */
  ambiguous: string[];
  /** Mapped: unmapped, never-written, read variables (compiled-in constants, calibration candidates). */
  calibration: string[];
  /** Mapped: unmapped variables the model both writes and reads (internal state, no port). */
  internal: string[];
  /** Mapped: names of write-mapped variables. */
  writeMapped: string[];
  /** Mapped: names of write-mapped variables without a safe value. */
  missingSafeValue: string[];
}

/** Value range of each platform integer type (64 bit: the exact double range, as the core evaluates in double). */
export const INTEGER_RANGES: Record<string, [number, number]> = {
  sint8: [-128, 127],
  uint8: [0, 255],
  sint16: [-32768, 32767],
  uint16: [0, 65535],
  sint32: [-2147483648, 2147483647],
  uint32: [0, 4294967295],
  sint64: [-(2 ** 53 - 1), 2 ** 53 - 1],
  uint64: [0, 2 ** 53 - 1],
};

export const isFloatPortType = (platformType: string): boolean =>
  platformType === 'float32' || platformType === 'float64';

export const toAutosarPlatformType = (type: VariableType): string => {
  switch (type) {
    case 'bool': return 'boolean';
    case 'int8': return 'sint8';
    case 'uint8': return 'uint8';
    case 'int16': return 'sint16';
    case 'uint16': return 'uint16';
    case 'int':
    case 'int32': return 'sint32';
    case 'uint':
    case 'uint32': return 'uint32';
    case 'int64': return 'sint64';
    case 'uint64': return 'uint64';
    case 'float':
    case 'single': return 'float32';
    case 'double':
    default: return 'float64';
  }
};

const numericText = (value: number | boolean, platformType: string): string => {
  if (platformType === 'boolean') return value === true || (typeof value === 'number' && value !== 0) ? '1' : '0';
  const numeric = typeof value === 'boolean' ? (value ? 1 : 0) : value;
  if (!Number.isFinite(numeric)) return '0';
  if (platformType.startsWith('float')) return String(numeric);
  return String(Math.trunc(numeric));
};

/** Variable ids written by any action or X-Bridges output boundary. */
const assignedVariableIds = (ir: SemanticModel): Set<string> => {
  const assigned = new Set<string>();
  for (const state of Object.values(ir.states)) {
    for (const action of [...state.entryActions, ...state.duringActions, ...state.exitActions]) {
      assigned.add(action.target);
    }
    for (const mapping of state.xBridges?.mappings ?? []) {
      if (mapping.direction === 'out') assigned.add(mapping.variableId);
    }
  }
  for (const transition of Object.values(ir.transitions)) {
    for (const action of transition.actions) assigned.add(action.target);
  }
  return assigned;
};

const collectReads = (node: ExpressionNode, reads: Set<string>): void => {
  switch (node.kind) {
    case 'variable':
      reads.add(node.cName);
      reads.add(node.name);
      break;
    case 'binary':
      collectReads(node.left, reads);
      collectReads(node.right, reads);
      break;
    case 'unary':
      collectReads(node.operand, reads);
      break;
    case 'call':
      collectReads(node.argument, reads);
      break;
    default:
      break;
  }
};

/** Names (model and C) of variables read by a guard, an action right-hand side or an X-Bridges input. */
const readVariableNames = (ir: SemanticModel): { names: Set<string>; ids: Set<string> } => {
  const names = new Set<string>();
  const ids = new Set<string>();
  for (const state of Object.values(ir.states)) {
    for (const action of [...state.entryActions, ...state.duringActions, ...state.exitActions]) {
      collectReads(action.value, names);
    }
    for (const mapping of state.xBridges?.mappings ?? []) {
      if (mapping.direction === 'in') ids.add(mapping.variableId);
    }
  }
  for (const transition of Object.values(ir.transitions)) {
    collectReads(transition.guard, names);
    for (const action of transition.actions) collectReads(action.value, names);
  }
  return { names, ids };
};

const normalizeSafeValue = (value: number | boolean, platformType: string): number | boolean => {
  if (platformType === 'boolean') return typeof value === 'boolean' ? value : value !== 0;
  const numeric = typeof value === 'boolean' ? (value ? 1 : 0) : value;
  const range = INTEGER_RANGES[platformType];
  if (range === undefined) return platformType === 'float32' ? Math.fround(numeric) : numeric;
  return Math.min(range[1], Math.max(range[0], Math.trunc(numeric)));
};

/** Effective clamp bounds of a port: a bound that cannot restrict the type is omitted. */
const clampBounds = (
  platformType: string,
  rangeMin: number | undefined,
  rangeMax: number | undefined,
): { clampMin?: number; clampMax?: number } => {
  if (platformType === 'boolean') return {};
  const integer = INTEGER_RANGES[platformType];
  const low = rangeMin === undefined ? undefined : integer === undefined ? rangeMin : Math.ceil(rangeMin);
  const high = rangeMax === undefined ? undefined : integer === undefined ? rangeMax : Math.floor(rangeMax);
  if (low !== undefined && high !== undefined && low > high) return {};
  const bounds: { clampMin?: number; clampMax?: number } = {};
  if (low !== undefined && (integer === undefined || low > integer[0])) {
    bounds.clampMin = platformType === 'float32' ? Math.fround(low) : low;
  }
  if (high !== undefined && (integer === undefined || high < integer[1])) {
    bounds.clampMax = platformType === 'float32' ? Math.fround(high) : high;
  }
  return bounds;
};

const makePort = (
  variable: SemanticModel['variables'][string],
  direction: 'PP' | 'RP',
): AutosarPort => {
  const platformType = toAutosarPlatformType(variable.type);
  return {
    variableId: variable.id,
    portName: `${direction}_${variable.cName}`,
    interfaceName: `SRI_${variable.cName}`,
    dataElementName: variable.cName,
    platformType,
    initValue: numericText(variable.initialValue, platformType),
    cName: variable.cName,
  };
};

/**
 * Derives the AUTOSAR ports. With I/O mappings (the model's explicit declaration, edited in the I/O mapping UI)
 * the mappings are authoritative: `read` is a required port, `write` a provided port, every other variable is
 * internal. Without mappings the direction is inferred from usage (an assigned variable is an output).
 */
export const deriveAutosarPorts = (ir: SemanticModel): AutosarPortModel => {
  const assigned = assignedVariableIds(ir);
  const reads = readVariableNames(ir);
  const provided: AutosarPort[] = [];
  const required: AutosarPort[] = [];
  const unused: string[] = [];
  const ambiguous: string[] = [];
  const calibration: string[] = [];
  const internal: string[] = [];
  const inputsWrittenByModel: string[] = [];
  const writeMapped: string[] = [];
  const missingSafeValue: string[] = [];
  const mapped = ir.ioMappings.length > 0;
  const isReadByModel = (variable: SemanticModel['variables'][string]): boolean =>
    reads.names.has(variable.cName) || reads.names.has(variable.name) || reads.ids.has(variable.id);
  const readMappings = new Map<string, SemanticModel['ioMappings'][number]>();
  const writeMappings = new Map<string, SemanticModel['ioMappings'][number]>();
  for (const mapping of ir.ioMappings) {
    const target = mapping.direction === 'read' ? readMappings : writeMappings;
    if (!target.has(mapping.variableId)) target.set(mapping.variableId, mapping);
  }

  for (const variable of Object.values(ir.variables)) {
    const isAssigned = assigned.has(variable.id);
    const isRead = isReadByModel(variable);
    if (mapped) {
      const readMapping = readMappings.get(variable.id);
      const writeMapping = writeMappings.get(variable.id);
      if (readMapping !== undefined) {
        if (isAssigned) inputsWrittenByModel.push(variable.name);
        const port = makePort(variable, 'RP');
        const policies = ir.verification.invalidInputPolicies;
        port.invalidInputPolicy = policies[readMapping.id] ?? policies[readMapping.channelId] ?? policies[variable.id] ?? 'reject';
        if (port.invalidInputPolicy === 'clamp') {
          Object.assign(port, clampBounds(port.platformType, readMapping.channelRangeMin, readMapping.channelRangeMax));
        }
        required.push(port);
      } else if (writeMapping !== undefined) {
        const port = makePort(variable, 'PP');
        writeMapped.push(variable.name);
        if (writeMapping.safeValue === null) missingSafeValue.push(variable.name);
        else port.safeValue = normalizeSafeValue(writeMapping.safeValue, port.platformType);
        provided.push(port);
      } else if (!isAssigned && !isRead) {
        unused.push(variable.name);
      } else if (!isAssigned) {
        calibration.push(variable.name);
      } else {
        internal.push(variable.name);
      }
      continue;
    }
    if (!isAssigned && !isRead) {
      unused.push(variable.name);
      continue;
    }
    if (isAssigned && isRead) ambiguous.push(variable.name);
    (isAssigned ? provided : required).push(makePort(variable, isAssigned ? 'PP' : 'RP'));
  }
  return {
    provided, required, unused, mapped, inputsWrittenByModel, ambiguous, calibration, internal, writeMapped, missingSafeValue,
  };
};

/** C literal of an initial value for a platform type. */
export const platformInitLiteral = (port: Pick<AutosarPort, 'platformType' | 'initValue'>): string => {
  const { platformType, initValue } = port;
  if (platformType === 'boolean') return initValue === '1' ? 'TRUE' : 'FALSE';
  if (platformType === 'float32' || platformType === 'float64') {
    const text = /[.eE]/.test(initValue) ? initValue : `${initValue}.0`;
    return platformType === 'float32' ? `${text}F` : text;
  }
  const negative = initValue.startsWith('-');
  const digits = negative ? initValue.slice(1) : initValue;
  if (platformType.startsWith('uint')) {
    return `${digits}${platformType === 'uint64' ? 'ULL' : 'U'}`;
  }
  if (negative) {
    return `((${platformType})-${digits}${platformType === 'sint64' ? 'LL' : ''})`;
  }
  return `${digits}${platformType === 'sint64' ? 'LL' : ''}`;
};

/** C literal of an arbitrary value for a platform type (same spelling rules as the init value). */
export const portLiteral = (platformType: string, value: number | boolean): string =>
  platformInitLiteral({ platformType, initValue: numericText(value, platformType) });

/** Core (stdint/bool/double) C type for a variable type. */
export const coreCType = (platformType: string): string => {
  switch (platformType) {
    case 'boolean': return 'bool';
    case 'sint8': return 'int8_t';
    case 'uint8': return 'uint8_t';
    case 'sint16': return 'int16_t';
    case 'uint16': return 'uint16_t';
    case 'sint32': return 'int32_t';
    case 'uint32': return 'uint32_t';
    case 'sint64': return 'int64_t';
    case 'uint64': return 'uint64_t';
    case 'float32': return 'float';
    default: return 'double';
  }
};
