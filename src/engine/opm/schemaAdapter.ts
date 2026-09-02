/**
 * Schema adapter between the persisted OPM diagram (React Flow nodes/edges)
 * and the executable OPM model.
 *
 * Rules enforced here:
 * - The adapter never mutates its inputs; every returned structure is a clone.
 * - A diagram without execution payloads is conceptual-only: it stays valid
 *   and `executionEnabled` is false.
 * - Defaults are created only by `withExecutableDefaults` (the explicit
 *   enable action), never by `adaptOpmDiagram`.
 */

import type { AppNode, AppEdge } from '../../components/entropy/EntropyTypes';
import {
  DEFAULT_OPM_TARGET_SETTINGS,
  type OpmAttribute,
  type OpmDiagnostic,
  type OpmTargetSettings,
} from './executableTypes';

/** Execution-ready, normalized view of a persisted OPM diagram. */
export interface NormalizedOpmModel {
  executionEnabled: boolean;
  settings: OpmTargetSettings;
  nodes: AppNode[];
  edges: AppEdge[];
}

export interface AdaptOpmDiagramResult {
  model: NormalizedOpmModel;
  diagnostics: OpmDiagnostic[];
}

/** Diagram data is JSON-serialized on save/load, so JSON round-trip is a faithful deep clone. */
function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Explicit enable action: returns upgraded nodes/edges with default
 * execution payloads on every object, state, process and link, leaving all
 * existing OPL fields untouched and the inputs unmutated.
 */
export function withExecutableDefaults(
  nodes: AppNode[],
  edges: AppEdge[],
): { nodes: AppNode[]; edges: AppEdge[] } {
  const upgradedNodes = deepClone(nodes);
  const upgradedEdges = deepClone(edges);

  for (const node of upgradedNodes) {
    const data = node.data;
    if (data.type === 'object' && !data.objectExecution) {
      data.objectExecution = { enabled: true, attributes: [] };
    } else if (data.type === 'state' && !data.stateExecution) {
      data.stateExecution = { enabled: true, valueExpression: '' };
    } else if (data.type === 'process' && !data.processExecution) {
      data.processExecution = { enabled: true, assignments: [] };
    }
    // 'requirement' nodes are conceptual-only and never get execution payloads.
  }

  for (const edge of upgradedEdges) {
    if (edge.data && !edge.data.linkExecution) {
      edge.data.linkExecution = { enabled: true, conditionExpression: '' };
    }
  }

  return { nodes: upgradedNodes, edges: upgradedEdges };
}

function isExecutionEnabled(nodes: AppNode[], edges: AppEdge[]): boolean {
  const nodeEnabled = nodes.some(node =>
    node.data.objectExecution?.enabled === true ||
    node.data.stateExecution?.enabled === true ||
    node.data.processExecution?.enabled === true
  );
  if (nodeEnabled) return true;
  return edges.some(edge => edge.data?.linkExecution?.enabled === true);
}

function validateAttributes(
  node: AppNode,
  attributes: OpmAttribute[],
  propertyPath: string,
  diagnostics: OpmDiagnostic[],
): void {
  const seenIdentifiers = new Set<string>();
  attributes.forEach((attribute, index) => {
    const source = {
      elementId: node.id,
      propertyPath: `${propertyPath}.${index}.cIdentifier`,
    };
    if (!attribute.cIdentifier) {
      diagnostics.push({
        code: 'OPM_MISSING_C_IDENTIFIER',
        severity: 'error',
        message: `Attribute "${attribute.displayName || attribute.id}" on "${node.data.name}" has no C identifier.`,
        source,
      });
      return;
    }
    if (seenIdentifiers.has(attribute.cIdentifier)) {
      diagnostics.push({
        code: 'OPM_DUPLICATE_C_IDENTIFIER',
        severity: 'error',
        message: `Duplicate C identifier "${attribute.cIdentifier}" on "${node.data.name}".`,
        source,
      });
      return;
    }
    seenIdentifiers.add(attribute.cIdentifier);
  });
}

/**
 * Normalize a persisted OPM diagram for consumption by later execution
 * stages. Missing execution data is treated as conceptual-only: the model
 * stays valid with `executionEnabled` false and no error diagnostics.
 */
export function adaptOpmDiagram(
  nodes: AppNode[],
  edges: AppEdge[],
  settings: OpmTargetSettings = DEFAULT_OPM_TARGET_SETTINGS,
): AdaptOpmDiagramResult {
  const modelNodes = deepClone(nodes);
  const modelEdges = deepClone(edges);
  const diagnostics: OpmDiagnostic[] = [];

  for (const node of modelNodes) {
    if (node.data.objectExecution?.enabled) {
      validateAttributes(node, node.data.objectExecution.attributes, 'objectExecution.attributes', diagnostics);
    }
  }

  return {
    model: {
      executionEnabled: isExecutionEnabled(modelNodes, modelEdges),
      settings: deepClone(settings),
      nodes: modelNodes,
      edges: modelEdges,
    },
    diagnostics,
  };
}
