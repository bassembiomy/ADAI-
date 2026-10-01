import type { VLabEdge, VLabNode } from './VLabWorkspaceTypes';

const LEGACY_REMOVED_BLOCKS = new Set(['gas_properties']);

const effectiveBlockType = (node: VLabNode): string =>
  String(node.data?.type ?? node.type ?? '').toLowerCase();

export const normalizeLegacyVLabGraph = (
  nodes: VLabNode[],
  edges: VLabEdge[],
): { nodes: VLabNode[]; edges: VLabEdge[] } => {
  const removedNodeIds = new Set(
    nodes.filter((node) => LEGACY_REMOVED_BLOCKS.has(effectiveBlockType(node))).map((node) => node.id),
  );

  return {
    nodes: nodes.filter((node) => !removedNodeIds.has(node.id)),
    edges: edges.filter((edge) => !removedNodeIds.has(edge.source) && !removedNodeIds.has(edge.target)),
  };
};
