// src/engine/vlab/kernel/PhysicalNetworkExtractor.ts
import { Node, Edge } from '@xyflow/react';
import { PhysicalNetwork, PhysicalConnection, Diagnostic } from './types';

class DisjointSet {
  parent: Record<string, string> = {};

  find(x: string): string {
    if (!this.parent[x]) this.parent[x] = x;
    if (this.parent[x] === x) return x;
    this.parent[x] = this.find(this.parent[x]);
    return this.parent[x];
  }

  union(a: string, b: string) {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) {
      this.parent[rootA] = rootB;
    }
  }
}

export class PhysicalNetworkExtractor {
  extract(nodes: Node[], edges: Edge[]): { networks: PhysicalNetwork[]; diagnostics: Diagnostic[] } {
    const diagnostics: Diagnostic[] = [];
    const ds = new DisjointSet();

    const physicalNodes = nodes.filter(n => {
      const type = (n.data as any)?.type || n.type || '';
      return type !== 'solver_config' && !type.startsWith('ps_');
    });

    const solverConfigs = nodes.filter(n => {
      const type = (n.data as any)?.type || n.type || '';
      return type === 'solver_config';
    });

    const connections: PhysicalConnection[] = [];

    // Union the component's internal node ID with all its ports so all ports of a component belong to the same component cluster
    physicalNodes.forEach(n => {
      ds.union(n.id, `${n.id}:p`);
      ds.union(n.id, `${n.id}:n`);
      ds.union(n.id, `${n.id}:default`);
    });

    edges.forEach((edge, idx) => {
      const srcPortId = `${edge.source}:${edge.sourceHandle || 'default'}`;
      const tgtPortId = `${edge.target}:${edge.targetHandle || 'default'}`;
      ds.union(srcPortId, tgtPortId);
      // Also union component IDs directly across the edge
      ds.union(edge.source, edge.target);
      connections.push({
        id: edge.id || `conn_${idx}`,
        fromPortId: srcPortId,
        toPortId: tgtPortId,
        nodeId: ''
      });
    });

    // Group physical components by root
    const networksMap = new Map<string, string[]>();
    physicalNodes.forEach(n => {
      const root = ds.find(n.id);
      if (!networksMap.has(root)) networksMap.set(root, []);
      networksMap.get(root)!.push(n.id);
    });

    const networks: PhysicalNetwork[] = [];
    let netIdx = 1;

    networksMap.forEach((compIds, rootKey) => {
      const netId = `PhysicalNetwork_electrical_${String(netIdx++).padStart(2, '0')}`;
      const netComps = nodes.filter(n => compIds.includes(n.id));

      const hasGround = netComps.some(n => {
        const type = (n.data as any)?.type || n.type || '';
        return type === 'electrical_reference' || type === 'ground';
      });

      if (!hasGround) {
        diagnostics.push({
          id: 'VL-REF-001',
          severity: 'ERROR',
          message: `Physical network "${netId}" has no electrical reference.`,
          networkId: netId,
          componentIds: compIds,
          suggestedAction: 'Add an Electrical Reference block.'
        });
      }

      let assignedSolverConfigId: string | undefined;
      if (solverConfigs.length === 0) {
        diagnostics.push({
          id: 'VL-SOLVER-001',
          severity: 'ERROR',
          message: `Physical network "${netId}" has no Solver Configuration.`,
          networkId: netId,
          suggestedAction: 'Add a Solver Configuration block.'
        });
      } else if (solverConfigs.length > 1) {
        diagnostics.push({
          id: 'VL-SOLVER-002',
          severity: 'ERROR',
          message: `Multiple Solver Configurations detected for network "${netId}".`,
          networkId: netId,
          componentIds: solverConfigs.map(s => s.id),
          suggestedAction: 'Keep exactly one Solver Configuration per network.'
        });
        assignedSolverConfigId = solverConfigs[0].id;
      } else {
        assignedSolverConfigId = solverConfigs[0].id;
      }

      networks.push({
        id: netId,
        domains: ['electrical'],
        componentIds: compIds,
        portIds: [],
        nodeIds: [rootKey],
        referenceNodeIds: hasGround ? ['gnd_node'] : [],
        connections,
        solverConfigurationId: assignedSolverConfigId,
        topologyHash: compIds.sort().join('_')
      });
    });

    return { networks, diagnostics };
  }
}
