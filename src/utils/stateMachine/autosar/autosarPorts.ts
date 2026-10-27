import type { VariableType } from '../../../types/sm_types';
import type { ExpressionNode } from '../smExpressions';
import type { SemanticModel } from '../smSemanticModel';

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
}

export interface AutosarPortModel {
  provided: AutosarPort[];
  required: AutosarPort[];
  /** Model names of variables neither read nor written: no port is derived for them. */
  unused: string[];
}

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

export const deriveAutosarPorts = (ir: SemanticModel): AutosarPortModel => {
  const assigned = assignedVariableIds(ir);
  const reads = readVariableNames(ir);
  const provided: AutosarPort[] = [];
  const required: AutosarPort[] = [];
  const unused: string[] = [];
  for (const variable of Object.values(ir.variables)) {
    const isProvided = assigned.has(variable.id);
    const isRead = reads.names.has(variable.cName)
      || reads.names.has(variable.name)
      || reads.ids.has(variable.id);
    if (!isProvided && !isRead) {
      unused.push(variable.name);
      continue;
    }
    const platformType = toAutosarPlatformType(variable.type);
    const port: AutosarPort = {
      variableId: variable.id,
      portName: `${isProvided ? 'PP' : 'RP'}_${variable.cName}`,
      interfaceName: `SRI_${variable.cName}`,
      dataElementName: variable.cName,
      platformType,
      initValue: numericText(variable.initialValue, platformType),
      cName: variable.cName,
    };
    (isProvided ? provided : required).push(port);
  }
  return { provided, required, unused };
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
