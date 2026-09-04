/**
 * Schema adapter between the persisted OPM diagram (React Flow nodes/edges)
 * and the executable OPM model.
 *
 * Rules enforced here:
 * - The adapter never mutates its inputs; every returned structure is a clone.
 * - A diagram without execution payloads is conceptual-only: it stays valid
 *   and `executionEnabled` is false.
 * - Defaults are created only by explicit enable actions (`withExecutableDefaults`
 *   or `withElementExecutableDefaults`), never implicitly by `adaptOpmDiagram`.
 * - Missing or malformed optional execution fields produce source-linked
 *   diagnostics and never throw.
 */

import type {
  OpmEditorNode,
  OpmEditorEdge,
  OpmEditorNodeData,
  OpmEditorEdgeData,
} from './editorBoundaryTypes';
import {
  DEFAULT_OPM_TARGET_SETTINGS,
  createDefaultOpmExecutionConfig,
  createDefaultObjectExecution,
  createDefaultStateExecution,
  createDefaultProcessExecution,
  createDefaultLinkExecution,
  type OpmAttribute,
  type OpmAssignment,
  type OpmDiagnostic,
  type OpmExecutionConfig,
  type OpmTargetSettings,
  type OpmSourceRef,
} from './executableTypes';

export const PROCEDURAL_LINK_TYPES = new Set<string>([
  'agent',
  'instrument',
  'consumption',
  'result',
  'effect',
  'trigger',
  'condition',
]);

export function createDefaultOpmTargetSettings(): OpmTargetSettings {
  return { ...DEFAULT_OPM_TARGET_SETTINGS };
}

export function validateTargetSettings(settings: OpmTargetSettings): {
  settings?: OpmTargetSettings;
  diagnostics: OpmDiagnostic[];
} {
  const diagnostics: OpmDiagnostic[] = [];
  const positiveFields: Array<keyof OpmTargetSettings> = [
    'tickMs', 'eventQueueCapacity', 'maxStagedWrites', 'maxTransitions', 'traceCapacity',
  ];
  for (const field of positiveFields) {
    const value = settings[field];
    const requiresInteger = field !== 'tickMs';
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || (requiresInteger && !Number.isInteger(value))) {
      diagnostics.push({
        code: 'OPM_INVALID_SETTINGS',
        severity: 'error',
        message: `${String(field)} must be a finite positive number.`,
        source: { elementId: 'settings', propertyPath: `settings.${String(field)}` },
      });
    }
  }
  return diagnostics.length > 0 ? { diagnostics } : { settings: { ...settings }, diagnostics };
}

export function isProceduralLink(edge: OpmEditorEdge): boolean {
  const type = edge.data?.type ?? edge.type;
  return typeof type === 'string' && PROCEDURAL_LINK_TYPES.has(type);
}

/** Execution-ready, normalized view of a persisted OPM diagram. */
export interface AdaptedOpmDiagram {
  executionEnabled: boolean;
  config: OpmExecutionConfig;
  settings: OpmTargetSettings;
  nodes: OpmEditorNode[];
  edges: OpmEditorEdge[];
}

export type NormalizedOpmModel = AdaptedOpmDiagram;

export interface AdaptOpmDiagramResult {
  model: AdaptedOpmDiagram;
  diagnostics: OpmDiagnostic[];
}

/** Diagram data is JSON-serialized on save/load, so JSON round-trip is a faithful deep clone. */
function deepClone<T>(value: T): T {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Explicit whole-diagram enable action: returns upgraded nodes/edges with default
 * execution payloads on every object, state, process and procedural link,
 * leaving all existing OPL fields untouched and the inputs unmutated.
 */
export function withExecutableDefaults<N extends OpmEditorNode = OpmEditorNode, E extends OpmEditorEdge = OpmEditorEdge>(
  nodes: N[],
  edges: E[],
): { nodes: N[]; edges: E[] } {
  const upgradedNodes = deepClone(nodes);
  const upgradedEdges = deepClone(edges);

  for (const node of upgradedNodes) {
    const data = node.data;
    if (!data) continue;
    if (data.type === 'object' && !data.objectExecution) {
      data.objectExecution = createDefaultObjectExecution();
    } else if (data.type === 'state' && !data.stateExecution) {
      data.stateExecution = createDefaultStateExecution(data.isInitial ?? false);
    } else if (data.type === 'process' && !data.processExecution) {
      data.processExecution = createDefaultProcessExecution();
    }
  }

  for (const edge of upgradedEdges) {
    if (isProceduralLink(edge)) {
      if (!edge.data) {
        edge.data = {
          type: (edge.type as any) || 'consumption',
          linkExecution: createDefaultLinkExecution(),
        } as any;
      } else if (!edge.data.linkExecution) {
        edge.data.linkExecution = createDefaultLinkExecution();
      }
    }
  }

  return { nodes: upgradedNodes, edges: upgradedEdges };
}

/**
 * Element-scoped enable action: upgrades only the element with the specified ID
 * and leaves all other elements unchanged.
 */
export function withElementExecutableDefaults<N extends OpmEditorNode = OpmEditorNode, E extends OpmEditorEdge = OpmEditorEdge>(
  nodes: N[],
  edges: E[],
  elementId: string,
): { nodes: N[]; edges: E[] } {
  const upgradedNodes = deepClone(nodes);
  const upgradedEdges = deepClone(edges);

  const targetNode = upgradedNodes.find(n => n.id === elementId);
  if (targetNode && targetNode.data) {
    const data = targetNode.data;
    if (data.type === 'object' && !data.objectExecution) {
      data.objectExecution = createDefaultObjectExecution();
    } else if (data.type === 'state' && !data.stateExecution) {
      data.stateExecution = createDefaultStateExecution(data.isInitial ?? false);
    } else if (data.type === 'process' && !data.processExecution) {
      data.processExecution = createDefaultProcessExecution();
    }
    return { nodes: upgradedNodes, edges: upgradedEdges };
  }

  const targetEdge = upgradedEdges.find(e => e.id === elementId);
  if (targetEdge && isProceduralLink(targetEdge)) {
    if (!targetEdge.data) {
      targetEdge.data = {
        type: (targetEdge.type as any) || 'consumption',
        linkExecution: createDefaultLinkExecution(),
      } as any;
    } else if (!targetEdge.data.linkExecution) {
      targetEdge.data.linkExecution = createDefaultLinkExecution();
    }
  }

  return { nodes: upgradedNodes, edges: upgradedEdges };
}

function isExecutionEnabled(nodes: OpmEditorNode[], edges: OpmEditorEdge[]): boolean {
  const nodeEnabled = nodes.some(node =>
    node.data?.objectExecution?.enabled === true ||
    node.data?.stateExecution?.enabled === true ||
    node.data?.processExecution?.enabled === true
  );
  if (nodeEnabled) return true;
  return edges.some(edge => isProceduralLink(edge) && edge.data?.linkExecution?.enabled === true);
}

function validateAttributes(
  elementId: string,
  elementName: string,
  rawAttributes: unknown,
  propertyPath: string,
  diagnostics: OpmDiagnostic[],
): void {
  if (!Array.isArray(rawAttributes)) {
    diagnostics.push({
      code: 'OPM_SCHEMA_REQUIRED_FIELD',
      severity: 'error',
      message: `Attributes list is required for "${elementName}".`,
      source: { elementId, propertyPath },
    });
    return;
  }

  const seenIdentifiers = new Set<string>();
  rawAttributes.forEach((attr: any, index: number) => {
    const itemPath = `${propertyPath}[${index}]`;
    if (!attr || typeof attr !== 'object') {
      diagnostics.push({
        code: 'OPM_SCHEMA_INVALID_TYPE',
        severity: 'error',
        message: `Attribute at index ${index} must be an object.`,
        source: { elementId, propertyPath: itemPath },
      });
      return;
    }

    if (!attr.id || typeof attr.id !== 'string') {
      diagnostics.push({
        code: 'OPM_SCHEMA_REQUIRED_FIELD',
        severity: 'error',
        message: `Attribute at index ${index} is missing a required "id".`,
        source: { elementId, propertyPath: `${itemPath}.id` },
      });
    }

    if (!attr.cIdentifier) {
      diagnostics.push({
        code: 'OPM_MISSING_C_IDENTIFIER',
        severity: 'error',
        message: `Attribute "${attr.displayName || attr.id || index}" on "${elementName}" has no C identifier.`,
        source: { elementId, propertyPath: `${itemPath}.cIdentifier` },
      });
    } else if (typeof attr.cIdentifier !== 'string') {
      diagnostics.push({
        code: 'OPM_SCHEMA_INVALID_TYPE',
        severity: 'error',
        message: `Attribute "${attr.displayName || attr.id}" C identifier must be a string.`,
        source: { elementId, propertyPath: `${itemPath}.cIdentifier` },
      });
    } else if (seenIdentifiers.has(attr.cIdentifier)) {
      diagnostics.push({
        code: 'OPM_DUPLICATE_C_IDENTIFIER',
        severity: 'error',
        message: `Duplicate C identifier "${attr.cIdentifier}" on "${elementName}".`,
        source: { elementId, propertyPath: `${itemPath}.cIdentifier` },
      });
    } else {
      seenIdentifiers.add(attr.cIdentifier);
    }

    if (!attr.type || typeof attr.type !== 'object') {
      diagnostics.push({
        code: 'OPM_SCHEMA_REQUIRED_FIELD',
        severity: 'error',
        message: `Attribute "${attr.displayName || attr.id || index}" is missing a type definition.`,
        source: { elementId, propertyPath: `${itemPath}.type` },
      });
    } else {
      const kind = attr.type.kind;
      if (!['bool', 'int32', 'uint32', 'float32', 'enum'].includes(kind)) {
        diagnostics.push({
          code: 'OPM_SCHEMA_INVALID_VALUE',
          severity: 'error',
          message: `Invalid scalar kind "${kind}".`,
          source: { elementId, propertyPath: `${itemPath}.type.kind` },
        });
      } else if (kind === 'enum' && (!attr.type.enumId || typeof attr.type.enumId !== 'string')) {
        diagnostics.push({
          code: 'OPM_SCHEMA_REQUIRED_FIELD',
          severity: 'error',
          message: `Enum attribute requires an enumId.`,
          source: { elementId, propertyPath: `${itemPath}.type.enumId` },
        });
      }
    }

    if (attr.initialValue === undefined) {
      diagnostics.push({
        code: 'OPM_SCHEMA_REQUIRED_FIELD',
        severity: 'error',
        message: `Attribute "${attr.displayName || attr.id || index}" is missing an initialValue.`,
        source: { elementId, propertyPath: `${itemPath}.initialValue` },
      });
    }

    if (attr.overflow && !['diagnostic', 'wrap', 'saturate'].includes(attr.overflow)) {
      diagnostics.push({
        code: 'OPM_SCHEMA_INVALID_VALUE',
        severity: 'error',
        message: `Invalid overflow policy "${attr.overflow}".`,
        source: { elementId, propertyPath: `${itemPath}.overflow` },
      });
    }

    if (attr.access && !['readOnly', 'readWrite'].includes(attr.access)) {
      diagnostics.push({
        code: 'OPM_SCHEMA_INVALID_VALUE',
        severity: 'error',
        message: `Invalid access mode "${attr.access}".`,
        source: { elementId, propertyPath: `${itemPath}.access` },
      });
    }
  });
}

function validateAssignments(
  elementId: string,
  elementName: string,
  rawAssignments: unknown,
  propertyPath: string,
  diagnostics: OpmDiagnostic[],
): void {
  if (!Array.isArray(rawAssignments)) {
    diagnostics.push({
      code: 'OPM_SCHEMA_REQUIRED_FIELD',
      severity: 'error',
      message: `Assignments list is required for "${elementName}".`,
      source: { elementId, propertyPath },
    });
    return;
  }

  rawAssignments.forEach((assignment: any, index: number) => {
    const itemPath = `${propertyPath}[${index}]`;
    if (!assignment || typeof assignment !== 'object') {
      diagnostics.push({
        code: 'OPM_SCHEMA_INVALID_TYPE',
        severity: 'error',
        message: `Assignment at index ${index} must be an object.`,
        source: { elementId, propertyPath: itemPath },
      });
      return;
    }

    if (!assignment.id || typeof assignment.id !== 'string') {
      diagnostics.push({
        code: 'OPM_SCHEMA_REQUIRED_FIELD',
        severity: 'error',
        message: `Assignment at index ${index} is missing an "id".`,
        source: { elementId, propertyPath: `${itemPath}.id` },
      });
    }

    if (assignment.targetAttributeId === undefined && assignment.target === undefined) {
      diagnostics.push({
        code: 'OPM_SCHEMA_REQUIRED_FIELD',
        severity: 'error',
        message: `Assignment at index ${index} is missing a target attribute.`,
        source: { elementId, propertyPath: `${itemPath}.targetAttributeId` },
      });
    }

    if (assignment.expression === undefined || typeof assignment.expression !== 'string') {
      diagnostics.push({
        code: 'OPM_SCHEMA_REQUIRED_FIELD',
        severity: 'error',
        message: `Assignment at index ${index} is missing an expression.`,
        source: { elementId, propertyPath: `${itemPath}.expression` },
      });
    }
  });
}

/**
 * Normalize and validate a persisted OPM diagram.
 * Missing execution data is treated as conceptual-only: the model stays valid
 * with executionEnabled false and no error diagnostics.
 */
export function adaptOpmDiagram(
  nodes: OpmEditorNode[],
  edges: OpmEditorEdge[],
  config: OpmExecutionConfig | OpmTargetSettings = createDefaultOpmExecutionConfig(),
): AdaptOpmDiagramResult {
  const modelNodes = deepClone(nodes) || [];
  const modelEdges = deepClone(edges) || [];
  const diagnostics: OpmDiagnostic[] = [];

  // Normalize execution config if caller passed OpmTargetSettings
  let resolvedConfig: OpmExecutionConfig;
  if ('settings' in (config as any) && 'events' in (config as any)) {
    resolvedConfig = deepClone(config as OpmExecutionConfig);
  } else {
    resolvedConfig = {
      version: 1,
      events: [],
      enums: [],
      settings: deepClone(config as OpmTargetSettings),
    };
  }

  diagnostics.push(...validateTargetSettings(resolvedConfig.settings).diagnostics);

  for (const node of modelNodes) {
    const data = node.data;
    if (!data) continue;

    if (data.objectExecution) {
      if (typeof data.objectExecution !== 'object') {
        diagnostics.push({
          code: 'OPM_SCHEMA_INVALID_TYPE',
          severity: 'error',
          message: `Object execution payload on "${data.name}" must be an object.`,
          source: { elementId: node.id, propertyPath: 'objectExecution' },
        });
      } else {
        if (data.objectExecution.enabled === undefined) {
          diagnostics.push({
            code: 'OPM_SCHEMA_REQUIRED_FIELD',
            severity: 'error',
            message: `Object execution payload on "${data.name}" is missing "enabled".`,
            source: { elementId: node.id, propertyPath: 'objectExecution.enabled' },
          });
        }
        if (data.objectExecution.attributes === undefined) {
          diagnostics.push({
            code: 'OPM_SCHEMA_REQUIRED_FIELD',
            severity: 'error',
            message: `Object execution payload on "${data.name}" is missing "attributes".`,
            source: { elementId: node.id, propertyPath: 'objectExecution.attributes' },
          });
        } else {
          validateAttributes(
            node.id,
            data.name || node.id,
            data.objectExecution.attributes,
            'objectExecution.attributes',
            diagnostics,
          );
        }
      }
    }

    if (data.stateExecution) {
      if (typeof data.stateExecution !== 'object') {
        diagnostics.push({
          code: 'OPM_SCHEMA_INVALID_TYPE',
          severity: 'error',
          message: `State execution payload on "${data.name}" must be an object.`,
          source: { elementId: node.id, propertyPath: 'stateExecution' },
        });
      } else {
        if (data.stateExecution.enabled === undefined) {
          diagnostics.push({
            code: 'OPM_SCHEMA_REQUIRED_FIELD',
            severity: 'error',
            message: `State execution payload on "${data.name}" is missing "enabled".`,
            source: { elementId: node.id, propertyPath: 'stateExecution.enabled' },
          });
        }
        if (data.stateExecution.entryAssignments) {
          validateAssignments(
            node.id,
            data.name || node.id,
            data.stateExecution.entryAssignments,
            'stateExecution.entryAssignments',
            diagnostics,
          );
        }
        if (data.stateExecution.exitAssignments) {
          validateAssignments(
            node.id,
            data.name || node.id,
            data.stateExecution.exitAssignments,
            'stateExecution.exitAssignments',
            diagnostics,
          );
        }
      }
    }

    if (data.processExecution) {
      if (typeof data.processExecution !== 'object') {
        diagnostics.push({
          code: 'OPM_SCHEMA_INVALID_TYPE',
          severity: 'error',
          message: `Process execution payload on "${data.name}" must be an object.`,
          source: { elementId: node.id, propertyPath: 'processExecution' },
        });
      } else {
        if (data.processExecution.enabled === undefined) {
          diagnostics.push({
            code: 'OPM_SCHEMA_REQUIRED_FIELD',
            severity: 'error',
            message: `Process execution payload on "${data.name}" is missing "enabled".`,
            source: { elementId: node.id, propertyPath: 'processExecution.enabled' },
          });
        }
        if (data.processExecution.assignments === undefined) {
          diagnostics.push({
            code: 'OPM_SCHEMA_REQUIRED_FIELD',
            severity: 'error',
            message: `Process execution payload on "${data.name}" is missing "assignments".`,
            source: { elementId: node.id, propertyPath: 'processExecution.assignments' },
          });
        } else {
          validateAssignments(
            node.id,
            data.name || node.id,
            data.processExecution.assignments,
            'processExecution.assignments',
            diagnostics,
          );
        }
      }
    }
  }

  for (const edge of modelEdges) {
    const isProcedural = isProceduralLink(edge);
    if (!isProcedural && edge.data?.linkExecution) {
      diagnostics.push({
        code: 'OPM_EXECUTION_ON_NON_PROCEDURAL_LINK',
        severity: 'warning',
        message: `Execution payload is ignored on non-procedural link "${edge.id}".`,
        source: { elementId: edge.id, propertyPath: 'linkExecution' },
      });
    }

    if (isProcedural && edge.data?.linkExecution) {
      const linkExec = edge.data.linkExecution;
      if (typeof linkExec !== 'object') {
        diagnostics.push({
          code: 'OPM_SCHEMA_INVALID_TYPE',
          severity: 'error',
          message: `Link execution payload on edge "${edge.id}" must be an object.`,
          source: { elementId: edge.id, propertyPath: 'linkExecution' },
        });
      } else {
        if (linkExec.enabled === undefined) {
          diagnostics.push({
            code: 'OPM_SCHEMA_REQUIRED_FIELD',
            severity: 'error',
            message: `Link execution payload on edge "${edge.id}" is missing "enabled".`,
            source: { elementId: edge.id, propertyPath: 'linkExecution.enabled' },
          });
        }
        if (linkExec.assignments) {
          validateAssignments(
            edge.id,
            edge.id,
            linkExec.assignments,
            'linkExecution.assignments',
            diagnostics,
          );
        }
      }
    }
  }

  return {
    model: {
      executionEnabled: isExecutionEnabled(modelNodes, modelEdges),
      config: resolvedConfig,
      settings: resolvedConfig.settings,
      nodes: modelNodes,
      edges: modelEdges,
    },
    diagnostics,
  };
}

const C99_RESERVED = new Set([
  'auto', 'break', 'case', 'char', 'const', 'continue', 'default', 'do',
  'double', 'else', 'enum', 'extern', 'float', 'for', 'goto', 'if',
  'inline', 'int', 'long', 'register', 'restrict', 'return', 'short',
  'signed', 'sizeof', 'static', 'struct', 'switch', 'typedef', 'union',
  'unsigned', 'void', 'volatile', 'while', '_Bool', '_Complex', '_Imaginary',
]);

export function sanitizeCIdentifier(rawName: string): string {
  if (!rawName || typeof rawName !== 'string') return '_anon';
  let sanitized = rawName.replace(/[^A-Za-z0-9_]/g, '_');
  if (/^[0-9]/.test(sanitized)) {
    sanitized = `_${sanitized}`;
  }
  if (sanitized === '' || /^_+$/.test(sanitized)) {
    sanitized = '_anon';
  }
  if (C99_RESERVED.has(sanitized)) {
    sanitized = `_${sanitized}`;
  }
  if (/^opm_/i.test(sanitized)) {
    sanitized = `u_${sanitized}`;
  }
  return sanitized;
}

function isValidCIdentifier(rawName: unknown): boolean {
  if (typeof rawName !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(rawName)) return false;
  if (C99_RESERVED.has(rawName) || /^opm_/i.test(rawName)) return false;
  return true;
}

function compareById<T extends { id: string }>(a: T, b: T): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

import type {
  NormalizedOpmObject,
  NormalizedOpmState,
  NormalizedOpmProcess,
  NormalizedOpmLink,
  OpmSymbol,
  OpmCompilationInput,
  NormalizeOpmResult,
} from './executableTypes';

/**
 * Normalizes an OPM diagram into stable, sorted, deterministic tables
 * independent of React Flow array ordering or UI presentation state.
 */
export function normalizeOpmModel(
  nodes: OpmEditorNode[],
  edges: OpmEditorEdge[],
  config: OpmExecutionConfig | OpmTargetSettings = createDefaultOpmExecutionConfig(),
): NormalizeOpmResult {
  const adaptResult = adaptOpmDiagram(nodes, edges, config);
  const diagnostics: OpmDiagnostic[] = [...adaptResult.diagnostics];
  const { model } = adaptResult;

  // Initial values are data, never source text. Reject values that cannot be
  // represented by the declared scalar type before compilation proceeds.
  for (const node of model.nodes) {
    const attrs = node.data?.objectExecution?.attributes ?? [];
    attrs.forEach((attr: any, index: number) => {
      const kind = attr?.type?.kind;
      const value = attr?.initialValue;
      const valid =
        (kind === 'bool' && typeof value === 'boolean') ||
        (kind === 'int32' && typeof value === 'number' && Number.isInteger(value) && Number.isFinite(value)) ||
        (kind === 'uint32' && typeof value === 'number' && Number.isInteger(value) && value >= 0 && Number.isFinite(value)) ||
        (kind === 'float32' && typeof value === 'number' && Number.isFinite(value)) ||
        (kind === 'enum' && typeof value === 'string');
      if (!valid) {
        diagnostics.push({
          code: 'OPM_INVALID_INITIAL_VALUE',
          severity: 'error',
          message: `Initial value for attribute "${attr?.displayName || attr?.id || index}" does not match its declared type.`,
          source: { elementId: node.id, propertyPath: `objectExecution.attributes[${index}].initialValue` },
        });
      }
      if (kind === 'enum' && typeof value === 'string') {
        const enumeration = model.config.enums.find((en: any) => en.id === attr.type.enumId);
        if (enumeration && !enumeration.members.some((member: any) => member.id === value || member.cIdentifier === value)) {
          diagnostics.push({
            code: 'OPM_INVALID_INITIAL_VALUE',
            severity: 'error',
            message: `Enum initial value "${value}" is not a member of "${attr.type.enumId}".`,
            source: { elementId: node.id, propertyPath: `objectExecution.attributes[${index}].initialValue` },
          });
        }
      }
    });
  }

  const seenEventIds = new Set<string>();
  model.config.events.forEach((event, index) => {
    if (seenEventIds.has(event.id)) {
      diagnostics.push({
        code: 'OPM_DUPLICATE_EVENT',
        severity: 'error',
        message: `Duplicate event ID "${event.id}".`,
        source: { elementId: event.id, propertyPath: `events[${index}].id` },
      });
    }
    seenEventIds.add(event.id);
  });

  model.config.enums.forEach((enumeration, enumIndex) => {
    const seenMemberIds = new Set<string>();
    enumeration.members.forEach((member, memberIndex) => {
      if (seenMemberIds.has(member.id)) {
        diagnostics.push({
          code: 'OPM_DUPLICATE_ENUM_MEMBER',
          severity: 'error',
          message: `Duplicate enum member ID "${member.id}".`,
          source: { elementId: enumeration.id, propertyPath: `enums[${enumIndex}].members[${memberIndex}].id` },
        });
      }
      seenMemberIds.add(member.id);
    });
  });

  // Track duplicate IDs
  const seenNodeIds = new Set<string>();
  const duplicateNodeIds = new Set<string>();
  for (const node of nodes) {
    if (seenNodeIds.has(node.id)) {
      duplicateNodeIds.add(node.id);
      diagnostics.push({
        code: 'OPM_DUPLICATE_ID',
        severity: 'error',
        message: `Duplicate node ID "${node.id}".`,
        source: { elementId: node.id, propertyPath: 'id' },
      });
    } else {
      seenNodeIds.add(node.id);
    }
  }

  const seenEdgeIds = new Set<string>();
  for (const edge of edges) {
    if (seenEdgeIds.has(edge.id)) {
      diagnostics.push({
        code: 'OPM_DUPLICATE_ID',
        severity: 'error',
        message: `Duplicate edge ID "${edge.id}".`,
        source: { elementId: edge.id, propertyPath: 'id' },
      });
    } else {
      seenEdgeIds.add(edge.id);
    }
  }

  // Classify nodes
  const rawObjects: OpmEditorNode[] = [];
  const rawProcesses: OpmEditorNode[] = [];
  const rawStateNodes: OpmEditorNode[] = [];

  for (const node of model.nodes) {
    const data = node.data;
    const kind = data?.type || (node.type === 'opmProcess' ? 'process' : node.type === 'opmState' ? 'state' : 'object');

    if (kind === 'process' || node.type === 'opmProcess') {
      rawProcesses.push(node);
    } else if (kind === 'state' || node.type === 'opmState') {
      rawStateNodes.push(node);
    } else if (kind === 'object' || node.type === 'opmObject') {
      rawObjects.push(node);
    }
  }

  const objectIdSet = new Set<string>(rawObjects.map(o => o.id));
  const processIdSet = new Set<string>(rawProcesses.map(p => p.id));
  const stateIdSet = new Set<string>();

  // Resolve state nodes
  interface StateRecord {
    id: string;
    name: string;
    parentObjectId: string;
    isInitial: boolean;
    source: OpmSourceRef;
    execution?: any;
  }

  const stateRecords: StateRecord[] = [];

  // Standalone state nodes
  for (const stNode of rawStateNodes) {
    const topParent = stNode.parentId;
    const dataParent = stNode.data?.parentId;

    if (topParent && dataParent && topParent !== dataParent) {
      diagnostics.push({
        code: 'OPM_STATE_PARENT_MISMATCH',
        severity: 'error',
        message: `State "${stNode.id}" has conflicting parent IDs: parentId="${topParent}" vs data.parentId="${dataParent}".`,
        source: { elementId: stNode.id, propertyPath: 'parentId' },
      });
    }

    const resolvedParent = topParent ?? dataParent;
    if (!resolvedParent) {
      diagnostics.push({
        code: 'OPM_STATE_ORPHAN',
        severity: 'error',
        message: `State "${stNode.id}" has no parent object.`,
        source: { elementId: stNode.id, propertyPath: 'parentId' },
      });
    } else if (!objectIdSet.has(resolvedParent)) {
      diagnostics.push({
        code: 'OPM_STATE_INVALID_PARENT',
        severity: 'error',
        message: `State "${stNode.id}" references non-existent parent object "${resolvedParent}".`,
        source: { elementId: stNode.id, propertyPath: 'parentId' },
      });
    }

    stateIdSet.add(stNode.id);
    stateRecords.push({
      id: stNode.id,
      name: stNode.data?.name || stNode.id,
      parentObjectId: resolvedParent || '',
      isInitial: stNode.data?.isInitial ?? false,
      source: { elementId: stNode.id, propertyPath: 'name' },
      execution: stNode.data?.stateExecution,
    });
  }

  // Embedded states on object nodes (if not already defined as standalone nodes)
  for (const objNode of rawObjects) {
    if (Array.isArray(objNode.data?.states)) {
      objNode.data.states.forEach((st: any, idx: number) => {
        if (!st.id || stateIdSet.has(st.id)) return;
        stateIdSet.add(st.id);
        stateRecords.push({
          id: st.id,
          name: st.name || st.id,
          parentObjectId: objNode.id,
          isInitial: st.isInitial ?? idx === 0,
          source: { elementId: objNode.id, propertyPath: `states[${idx}]` },
          execution: undefined,
        });
      });
    }
  }

  // All known endpoint IDs
  const knownEndpointIds = new Set<string>([
    ...objectIdSet,
    ...processIdSet,
    ...stateIdSet,
  ]);

  // Validate link endpoints
  for (const edge of model.edges) {
    if (!knownEndpointIds.has(edge.source)) {
      diagnostics.push({
        code: 'OPM_LINK_MISSING_ENDPOINT',
        severity: 'error',
        message: `Link "${edge.id}" source "${edge.source}" does not exist.`,
        source: { elementId: edge.id, propertyPath: 'source' },
      });
    }
    if (!knownEndpointIds.has(edge.target)) {
      diagnostics.push({
        code: 'OPM_LINK_MISSING_ENDPOINT',
        severity: 'error',
        message: `Link "${edge.id}" target "${edge.target}" does not exist.`,
        source: { elementId: edge.id, propertyPath: 'target' },
      });
    }

    const linkType = edge.data?.type ?? edge.type;
    if (linkType === 'effect' && objectIdSet.has(edge.source) && processIdSet.has(edge.target)) {
      diagnostics.push({
        code: 'OPM_INVALID_LINK_DIRECTION',
        severity: 'error',
        message: `Effect link "${edge.id}" must originate at a process and target an object or state.`,
        source: { elementId: edge.id, propertyPath: 'source' },
      });
    }

  }

  // Symbols and Collision Detection
  const symbols: Record<string, OpmSymbol> = {};
  const cIdentifierGroups = new Map<string, OpmSymbol[]>();

  function registerSymbol(sym: OpmSymbol): void {
    symbols[sym.id] = sym;
    const existing = cIdentifierGroups.get(sym.cIdentifier) || [];
    existing.push(sym);
    cIdentifierGroups.set(sym.cIdentifier, existing);
  }

  // Objects symbols
  for (const obj of rawObjects) {
    const displayName = obj.data?.name || obj.id;
    const cIdentifier = sanitizeCIdentifier(displayName);
    registerSymbol({
      id: obj.id,
      kind: 'object',
      displayName,
      cIdentifier,
      source: { elementId: obj.id, propertyPath: 'name' },
    });

      if (obj.data?.objectExecution?.attributes) {
      obj.data.objectExecution.attributes.forEach((attr: any, i: number) => {
        const attrDisplayName = attr.displayName || attr.id;
        if (attr.cIdentifier !== undefined && !isValidCIdentifier(attr.cIdentifier)) {
          diagnostics.push({
            code: 'OPM_INVALID_C_IDENTIFIER',
            severity: 'error',
            message: `Invalid C identifier "${String(attr.cIdentifier)}".`,
            source: { elementId: obj.id, propertyPath: `objectExecution.attributes[${i}].cIdentifier` },
          });
        }
        const attrCId = attr.cIdentifier ? sanitizeCIdentifier(attr.cIdentifier) : sanitizeCIdentifier(attrDisplayName);
        registerSymbol({
          id: attr.id,
          kind: 'attribute',
          displayName: attrDisplayName,
          cIdentifier: attrCId,
          source: { elementId: obj.id, propertyPath: `objectExecution.attributes[${i}].cIdentifier` },
        });
      });
    }
  }

  // Processes symbols
  for (const proc of rawProcesses) {
    const displayName = proc.data?.name || proc.id;
    const cIdentifier = sanitizeCIdentifier(displayName);
    registerSymbol({
      id: proc.id,
      kind: 'process',
      displayName,
      cIdentifier,
      source: { elementId: proc.id, propertyPath: 'name' },
    });
  }

  // States symbols
  for (const st of stateRecords) {
    const cIdentifier = sanitizeCIdentifier(st.name);
    registerSymbol({
      id: st.id,
      kind: 'state',
      displayName: st.name,
      cIdentifier,
      source: st.source,
    });
  }

  // Events symbols
  for (const ev of model.config.events || []) {
    const displayName = ev.displayName || ev.id;
    const cIdentifier = sanitizeCIdentifier(ev.cIdentifier || displayName);
    registerSymbol({
      id: ev.id,
      kind: 'event',
      displayName,
      cIdentifier,
      source: { elementId: ev.id, propertyPath: 'events' },
    });
  }

  // Enums symbols
  for (const en of model.config.enums || []) {
    const displayName = en.displayName || en.id;
    const cIdentifier = sanitizeCIdentifier(en.cIdentifier || displayName);
    registerSymbol({
      id: en.id,
      kind: 'enum',
      displayName,
      cIdentifier,
      source: { elementId: en.id, propertyPath: 'enums' },
    });

    for (const mem of en.members || []) {
      const memDisplayName = mem.displayName || mem.id;
      const memCId = sanitizeCIdentifier(mem.cIdentifier || memDisplayName);
      registerSymbol({
        id: mem.id,
        kind: 'enumMember',
        displayName: memDisplayName,
        cIdentifier: memCId,
        source: { elementId: `${en.id}::${mem.id}`, propertyPath: 'enums.members' },
      });
    }
  }

  // Collision detection: emit OPM_SYMBOL_COLLISION for all colliding symbols
  for (const [cId, group] of cIdentifierGroups.entries()) {
    if (group.length > 1) {
      for (const sym of group) {
        diagnostics.push({
          code: 'OPM_SYMBOL_COLLISION',
          severity: 'error',
          message: `Symbol collision: C identifier "${cId}" is generated by multiple elements (${sym.displayName || sym.id}).`,
          source: sym.source,
        });
      }
    }
  }

  // Build sorted normalized tables
  const sortedObjects = [...rawObjects].sort(compareById);
  const sortedProcesses = [...rawProcesses].sort(compareById);
  const sortedStateRecords = [...stateRecords].sort(compareById);
  const sortedEdges = [...model.edges].sort(compareById);
  const sortedEvents = [...(model.config.events || [])].sort(compareById);
  const sortedEnums = [...(model.config.enums || [])].sort(compareById);

  // Group state IDs by parent object
  const stateIdsByObject = new Map<string, string[]>();
  for (const st of sortedStateRecords) {
    if (st.parentObjectId) {
      const list = stateIdsByObject.get(st.parentObjectId) || [];
      list.push(st.id);
      stateIdsByObject.set(st.parentObjectId, list);
    }
  }

  const normalizedObjects: NormalizedOpmObject[] = sortedObjects.map((node, index) => {
    const sym = symbols[node.id];
    const source: OpmSourceRef = { elementId: node.id, propertyPath: 'name' };
    const objStates = stateIdsByObject.get(node.id) || [];
    return Object.freeze({
      id: node.id,
      name: node.data?.name || node.id,
      cIdentifier: sym ? sym.cIdentifier : sanitizeCIdentifier(node.data?.name || node.id),
      physical: Boolean(node.data?.physical),
      order: index,
      source,
      execution: node.data?.objectExecution ? deepClone(node.data.objectExecution) : undefined,
      stateIds: Object.freeze(objStates.sort()),
    });
  });

  const normalizedProcesses: NormalizedOpmProcess[] = sortedProcesses.map((node, index) => {
    const sym = symbols[node.id];
    const source: OpmSourceRef = { elementId: node.id, propertyPath: 'name' };
    return Object.freeze({
      id: node.id,
      name: node.data?.name || node.id,
      cIdentifier: sym ? sym.cIdentifier : sanitizeCIdentifier(node.data?.name || node.id),
      physical: Boolean(node.data?.physical),
      order: index,
      source,
      execution: node.data?.processExecution ? deepClone(node.data.processExecution) : undefined,
    });
  });

  const normalizedStates: NormalizedOpmState[] = sortedStateRecords.map((st, index) => {
    const sym = symbols[st.id];
    return Object.freeze({
      id: st.id,
      name: st.name,
      cIdentifier: sym ? sym.cIdentifier : sanitizeCIdentifier(st.name),
      parentObjectId: st.parentObjectId,
      isInitial: st.isInitial,
      order: index,
      source: st.source,
      execution: st.execution ? deepClone(st.execution) : undefined,
    });
  });

  const normalizedLinks: NormalizedOpmLink[] = sortedEdges.map((edge, index) => {
    const source: OpmSourceRef = { elementId: edge.id, propertyPath: 'type' };
    const isProcedural = isProceduralLink(edge);
    return Object.freeze({
      id: edge.id,
      type: (edge.data?.type ?? edge.type ?? 'consumption') as string,
      sourceId: edge.source,
      targetId: edge.target,
      order: index,
      source,
      execution: isProcedural && edge.data?.linkExecution ? deepClone(edge.data.linkExecution) : undefined,
    });
  });

  const sourceByNormalizedId: Record<string, OpmSourceRef> = {};
  for (const obj of normalizedObjects) sourceByNormalizedId[obj.id] = obj.source;
  for (const proc of normalizedProcesses) sourceByNormalizedId[proc.id] = proc.source;
  for (const st of normalizedStates) sourceByNormalizedId[st.id] = st.source;
  for (const link of normalizedLinks) sourceByNormalizedId[link.id] = link.source;

  const sortedSymbols: Record<string, OpmSymbol> = {};
  for (const k of Object.keys(symbols).sort()) {
    sortedSymbols[k] = symbols[k];
  }

  const input: OpmCompilationInput = Object.freeze({
    executionEnabled: model.executionEnabled,
    settings: Object.freeze(deepClone(model.settings)),
    objects: Object.freeze(normalizedObjects),
    states: Object.freeze(normalizedStates),
    processes: Object.freeze(normalizedProcesses),
    links: Object.freeze(normalizedLinks),
    events: Object.freeze(sortedEvents.map(e => Object.freeze(deepClone(e)))),
    enums: Object.freeze(sortedEnums.map(e => Object.freeze(deepClone(e)))),
    symbols: Object.freeze(sortedSymbols),
    sourceByNormalizedId: Object.freeze(sourceByNormalizedId),
  });

  return {
    input,
    diagnostics,
  };
}

