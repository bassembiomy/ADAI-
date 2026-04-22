import { Node, Edge } from 'reactflow';

export class DAEAssembler {
  assemble(nodes: Node[], edges: Edge[]) {
    const nodeMap = new Map<string, number>();
    let nodeCount = 0;

    // Identify unique electrical/physical nodes from connections
    edges.forEach(edge => {
      if (!nodeMap.has(edge.source)) nodeMap.set(edge.source, nodeCount++);
      if (!nodeMap.has(edge.target)) nodeMap.set(edge.target, nodeCount++);
    });

    return {
      nodeMap,
      systemSize: nodeCount
    };
  }
}
