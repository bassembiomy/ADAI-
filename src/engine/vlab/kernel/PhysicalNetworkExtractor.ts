// src/engine/vlab/kernel/PhysicalNetworkExtractor.ts
import { Node, Edge } from '@xyflow/react';
import { PhysicalNetwork, PhysicalConnection, Diagnostic, PhysicalDomain } from './types';
import { VLAB_LIBRARY } from '../../../utils/vlabLibrary';

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
      const netComps = nodes.filter(n => compIds.includes(n.id));

      const compDomains = new Set<string>();
      netComps.forEach(n => {
        const type = (n.data as any)?.type || n.type || '';
        const d = (n.data as any)?.domain;
        if (d) {
          compDomains.add(d.toLowerCase());
        } else {
          for (const dom of VLAB_LIBRARY) {
            if (dom.blocks.some(b => b.id === type)) {
              compDomains.add(dom.type === 'Isothermal Liquid' ? 'isothermal_liquid' : dom.type.toLowerCase());
              break;
            }
          }
        }
      });

      const isIL = compDomains.has('isothermal_liquid') || netComps.some(n => {
        const type = (n.data as any)?.type || n.type || '';
        return type.endsWith('_il') || type === 'hydraulic_reference_il' || type === 'reservoir_il';
      });

      const netDomain: PhysicalDomain = isIL ? 'isothermal_liquid' : 'electrical';
      const netId = `PhysicalNetwork_${netDomain}_${String(netIdx++).padStart(2, '0')}`;

      let hasRef = false;
      if (isIL) {
        hasRef = netComps.some(n => {
          const type = (n.data as any)?.type || n.type || '';
          return type === 'hydraulic_reference_il' || type === 'reservoir_il';
        });

        if (!hasRef) {
          diagnostics.push({
            id: 'VL-REF-IL-001',
            severity: 'ERROR',
            message: `Isothermal Liquid network has no pressure reference. Add a Hydraulic Reference (IL), Reservoir (IL), or another pressure boundary.`,
            networkId: netId,
            componentIds: compIds,
            suggestedAction: 'Add a Hydraulic Reference (IL) block.'
          });
        }

        // Check for conflicting ideal pressure references connected to the same node
        const refComps = netComps.filter(n => {
          const type = (n.data as any)?.type || n.type || '';
          return type === 'hydraulic_reference_il' || type === 'reservoir_il';
        });

        if (refComps.length > 1) {
          for (let i = 0; i < refComps.length; i++) {
            for (let j = i + 1; j < refComps.length; j++) {
              const r1 = refComps[i];
              const r2 = refComps[j];
              const isDirectlyConnected = edges.some(e =>
                (e.source === r1.id && e.target === r2.id) ||
                (e.source === r2.id && e.target === r1.id)
              );
              if (isDirectlyConnected) {
                const p1 = Number((r1.data as any)?.params?.referencePressure?.value ?? (r1.data as any)?.params?.referencePressure ?? 101325);
                const p2 = Number((r2.data as any)?.params?.referencePressure?.value ?? (r2.data as any)?.params?.referencePressure ?? 101325);
                if (p1 !== p2) {
                  diagnostics.push({
                    id: 'VL-OVERCONSTRAINT-001',
                    severity: 'ERROR',
                    message: `Conflicting ideal pressure references connected to the same node (overconstraint).`,
                    networkId: netId,
                    componentIds: [r1.id, r2.id],
                    suggestedAction: 'Ensure connected pressure references have identical pressures or are separated by a hydraulic component.'
                  });
                }
              }
            }
          }
        }
      } else {
        hasRef = netComps.some(n => {
          const type = (n.data as any)?.type || n.type || '';
          return type === 'electrical_reference' || type === 'ground';
        });

        if (!hasRef) {
          diagnostics.push({
            id: 'VL-REF-001',
            severity: 'ERROR',
            message: `Physical network "${netId}" has no electrical reference.`,
            networkId: netId,
            componentIds: compIds,
            suggestedAction: 'Add an Electrical Reference block.'
          });
        }
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
        domains: [netDomain],
        componentIds: compIds,
        portIds: [],
        nodeIds: [rootKey],
        referenceNodeIds: hasRef ? [isIL ? 'il_ref_node' : 'gnd_node'] : [],
        connections,
        solverConfigurationId: assignedSolverConfigId,
        topologyHash: compIds.sort().join('_')
      });
    });

    return { networks, diagnostics };
  }
}
