import type { ModelTreeNode, ExplorerDomain } from './modelExplorerTypes';
import { SYSML_CHILDREN } from './modelExplorerCapabilities';

export const MIME_TYPE_MODEL_ELEMENT = 'application/x-adia-model-element';

export interface ModelExplorerDragPayload {
  nodeId: string;
  semanticId: string;
  semanticIds?: string[];
  domain: ExplorerDomain;
  kind: string;
  label: string;
  secondaryLabel?: string;
  source: 'modelExplorer';
}

export interface TreeDropClassification {
  allowed: boolean;
  type?: 'reparent' | 'no-op';
  reason?: string;
}

export interface ClassifyTreeDropTargetOptions {
  draggedNode: ModelTreeNode;
  targetNode: ModelTreeNode;
  nodesById: Record<string, ModelTreeNode> | Map<string, ModelTreeNode>;
}

/**
 * Checks if target metatype can semantically contain the dragged element metatype.
 */
export function canContainMetatype(
  targetKind: string,
  targetDomain: ExplorerDomain,
  draggedKind: string,
  draggedDomain: ExplorerDomain
): boolean {
  if (targetDomain !== draggedDomain) return false;

  if (targetDomain === 'sysml') {
    const allowed = SYSML_CHILDREN[targetKind];
    if (allowed) {
      if (allowed.includes(draggedKind)) return true;
      // Allow general properties inside block
      if (targetKind === 'block' && ['part', 'port', 'property', 'constraint'].includes(draggedKind)) {
        return true;
      }
    }
    // SysML root package/model can contain packages, blocks, requirements, diagrams
    if (['model', 'package'].includes(targetKind)) {
      return ['package', 'block', 'requirement', 'stateMachine', 'valueType', 'diagram'].includes(
        draggedKind
      );
    }
    return false;
  }

  if (targetDomain === 'stateMachine') {
    switch (targetKind) {
      case 'stateMachine':
        return draggedKind === 'region';
      case 'region':
        return ['state', 'pseudostate', 'junction', 'choice', 'initial', 'final'].includes(
          draggedKind
        );
      case 'state':
        return draggedKind === 'region';
      default:
        return false;
    }
  }

  return false;
}

/**
 * Validates whether dropping draggedNode onto targetNode forms a valid reparenting operation.
 */
export function classifyTreeDropTarget({
  draggedNode,
  targetNode,
  nodesById,
}: ClassifyTreeDropTargetOptions): TreeDropClassification {
  // 1. Cannot drop onto self
  if (draggedNode.nodeId === targetNode.nodeId) {
    return {
      allowed: false,
      reason: 'Cannot drop an element onto itself',
      type: 'no-op',
    };
  }

  // 2. No-op if target is already the parent
  if (targetNode.nodeId === draggedNode.parentNodeId) {
    return {
      allowed: false,
      reason: 'Element is already contained in this parent',
      type: 'no-op',
    };
  }

  // 3. Cycle check: target cannot be a descendant of draggedNode
  const nodeMap: Record<string, ModelTreeNode> =
    nodesById instanceof Map ? Object.fromEntries(nodesById.entries()) : nodesById;

  let current: ModelTreeNode | undefined = targetNode;
  while (current && current.parentNodeId) {
    if (current.parentNodeId === draggedNode.nodeId) {
      return {
        allowed: false,
        reason: 'Cannot move an element into its own descendant (containment cycle)',
      };
    }
    current = nodeMap[current.parentNodeId];
  }

  // 4. Metatype compatibility
  const compatible = canContainMetatype(
    targetNode.kind,
    targetNode.domain,
    draggedNode.kind,
    draggedNode.domain
  );

  if (!compatible) {
    return {
      allowed: false,
      reason: `Target ${targetNode.kind} cannot contain ${draggedNode.kind}`,
    };
  }

  return {
    allowed: true,
    type: 'reparent',
  };
}

/**
 * Creates standardized drag payload for cross-component / canvas drops.
 */
export function createModelExplorerDragPayload(
  node: ModelTreeNode,
  selectedSemanticIds?: string[]
): ModelExplorerDragPayload {
  const ids = selectedSemanticIds && selectedSemanticIds.includes(node.semanticId)
    ? selectedSemanticIds
    : [node.semanticId];
  return {
    nodeId: node.nodeId,
    semanticId: node.semanticId,
    semanticIds: ids,
    domain: node.domain,
    kind: node.kind,
    label: node.label,
    secondaryLabel: node.secondaryLabel,
    source: 'modelExplorer',
  };
}

/**
 * Parses drag payload from standard DataTransfer interface.
 */
export function parseModelExplorerDragData(dataTransfer: {
  getData: (format: string) => string;
} | null | undefined): ModelExplorerDragPayload | null {
  if (!dataTransfer) return null;

  try {
    const raw = dataTransfer.getData(MIME_TYPE_MODEL_ELEMENT);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && (parsed.source === 'modelExplorer' || parsed.domain) && (parsed.semanticId || parsed.semanticIds)) {
      if (!parsed.semanticIds && parsed.semanticId) {
        parsed.semanticIds = [parsed.semanticId];
      }
      if (!parsed.semanticId && parsed.semanticIds?.[0]) {
        parsed.semanticId = parsed.semanticIds[0];
      }
      return parsed as ModelExplorerDragPayload;
    }
  } catch {
    return null;
  }

  return null;
}
