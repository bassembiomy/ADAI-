import { VLAB_LIBRARY } from '../../utils/vlabLibrary';
import type { VLabEdge, VLabNode } from './VLabWorkspaceTypes';

const LEGACY_REMOVED_BLOCKS = new Set(['gas_properties']);

const effectiveBlockType = (node: VLabNode): string =>
  String(node.data?.type ?? node.type ?? '').toLowerCase();

export const normalizeLegacyVLabGraph = (
  nodes: VLabNode[],
  edges: VLabEdge[],
): { nodes: VLabNode[]; edges: VLabEdge[] } => {
  const removedNodeIds = new Set(
    nodes
      .filter((node) => LEGACY_REMOVED_BLOCKS.has(effectiveBlockType(node)))
      .map((node) => node.id),
  );

  return {
    nodes: nodes
      .filter((node) => !removedNodeIds.has(node.id))
      .map((node) => {
        const type = effectiveBlockType(node);
        if (type !== 'spherical_joint' && type !== 'universal_joint')
          return node;
        const block = VLAB_LIBRARY.flatMap((domain) => domain.blocks).find(
          (block) => block.id === type,
        )!;
        if (type === 'universal_joint') {
          const params = { ...node.data.params };
          for (const name of ['axis1', 'axis2', 'damping'])
            if (params[name] === undefined)
              params[name] = { ...block.params[name] };
          return {
            ...node,
            data: {
              ...node.data,
              params,
              ports: block.ports.map((port) => ({ ...port })),
            },
          };
        }
        const { damping: _legacyDamping, ...params } = node.data.params ?? {};
        return {
          ...node,
          data: {
            ...node.data,
            params,
            ports: block.ports.map((port) => ({ ...port })),
          },
        };
      }),
    edges: edges.filter(
      (edge) =>
        !removedNodeIds.has(edge.source) && !removedNodeIds.has(edge.target),
    ),
  };
};
