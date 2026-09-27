import { Node, Edge } from '@xyflow/react';

export const isSolverConfigurationNode = (node: Node): boolean =>
  ['solver_config', 'solver_configuration'].includes(String(node.data?.type || node.type || ''));

/** Select by connected network; a lone config remains a legacy model-wide default. */
export function selectSolverConfigurationNode(nodes: Node[], edges: Edge[], networkNodeId?: string): Node | undefined {
  const configs = nodes.filter(isSolverConfigurationNode);
  if (configs.length <= 1) return configs[0];

  const adjacency = new Map(nodes.map(node => [node.id, new Set<string>()]));
  for (const edge of edges) {
    if (!adjacency.has(edge.source) || !adjacency.has(edge.target)) continue;
    adjacency.get(edge.source)!.add(edge.target);
    adjacency.get(edge.target)!.add(edge.source);
  }
  const connected = (start: string): Set<string> => {
    const visited = new Set([start]);
    for (const id of visited) {
      for (const neighbor of adjacency.get(id) ?? []) visited.add(neighbor);
    }
    return visited;
  };
  const configIds = new Set(configs.map(node => node.id));
  const network = networkNodeId ? connected(networkNodeId) : undefined;
  const candidates = configs.filter(node => network
    ? network.has(node.id)
    : [...connected(node.id)].some(id => !configIds.has(id)));
  if (candidates.length > 1) {
    throw new Error('Multiple solver configurations match the job. Specify a physical network with exactly one configuration.');
  }
  if (candidates.length === 0) throw new Error('No solver configuration is connected to the physical network.');
  return candidates[0];
}
