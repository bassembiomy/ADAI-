import { BoundEngineeringModelIR } from '../contracts/modelIr';
import {
  EngineeringModelPlanV2,
  XbridgesAction,
  LogicalBlock,
  LogicalConnection
} from '../../contracts/engineeringModel';
import { XbridgesCapabilityIndex } from '../../catalog/xbridgesCapabilityIndex';
import { canonicalJson, sha256Hex } from '../../../../engine/opm/canonicalHash';

export interface CompileContext {
  projectId: string;
  baseRevision: number;
  catalog: XbridgesCapabilityIndex;
  expectedBeforeHash?: string;
}

export class ModelIrCompiler {
  /**
   * Deterministically compiles a BoundEngineeringModelIR into an executable EngineeringModelPlanV2.
   */
  public compile(
    ir: BoundEngineeringModelIR,
    context: CompileContext
  ): EngineeringModelPlanV2 {
    const planId = `plan_v2_${ir.modelId}_rev${context.baseRevision}`;
    const actions: XbridgesAction[] = [];
    const blocks: LogicalBlock[] = [];
    const connections: LogicalConnection[] = [];

    // Sort components deterministically by ID
    const sortedComponents = [...ir.components].sort((a, b) => a.id.localeCompare(b.id));

    // 1. Generate add_block actions and LogicalBlocks
    sortedComponents.forEach((comp, idx) => {
      const binding = comp.capabilityBinding;
      if (!binding) {
        throw new Error(`Component '${comp.id}' is missing capabilityBinding in BoundEngineeringModelIR`);
      }

      const paramRecord: Record<string, unknown> = {};
      for (const param of comp.parameters) {
        if (param.value !== undefined) {
          const mappedName = binding.parameterMapping[param.name] || param.name;
          paramRecord[mappedName] = param.value;
        }
      }

      actions.push({
        id: `act_${comp.id}_add`,
        kind: 'add_block',
        blockId: comp.id,
        blockType: binding.catalogBlockId,
        parameters: Object.keys(paramRecord).length > 0 ? paramRecord : undefined,
        position: { x: 100 + (idx % 4) * 180, y: 100 + Math.floor(idx / 4) * 120 }
      });

      blocks.push({
        id: comp.id,
        blockDefinitionId: binding.catalogBlockId,
        domain: 'xbridges',
        name: comp.name,
        parameters: Object.entries(paramRecord).map(([parameterName, value]) => ({
          blockId: comp.id,
          parameterName,
          value: value as any
        }))
      });
    });

    // 2. Generate connect_ports actions and LogicalConnections
    const portMap = new Map(ir.ports.map(p => [p.id, p]));
    const compMap = new Map(ir.components.map(c => [c.id, c]));

    const sortedConnections = [...ir.connections].sort((a, b) => a.id.localeCompare(b.id));

    sortedConnections.forEach(conn => {
      const fromPort = portMap.get(conn.fromPortId);
      const toPort = portMap.get(conn.toPortId);

      if (!fromPort || !toPort) {
        const missing = !fromPort && !toPort
          ? `source port '${conn.fromPortId}' and target port '${conn.toPortId}'`
          : !fromPort
            ? `source port '${conn.fromPortId}'`
            : `target port '${conn.toPortId}'`;
        throw new Error(`Cannot compile connection '${conn.id}': missing ${missing}`);
      }

      const sourceBlockId = fromPort.componentId;
      const targetBlockId = toPort.componentId;

      const sourceComp = compMap.get(sourceBlockId);
      const targetComp = compMap.get(targetBlockId);

      // Port mapping from capability bindings
      let sourcePortId = fromPort.name;
      if (sourceComp?.capabilityBinding?.portMapping[sourcePortId]) {
        sourcePortId = sourceComp.capabilityBinding.portMapping[sourcePortId];
      }

      let targetPortId = toPort.name;
      if (targetComp?.capabilityBinding?.portMapping[targetPortId]) {
        targetPortId = targetComp.capabilityBinding.portMapping[targetPortId];
      }

      actions.push({
        id: `act_${conn.id}_connect`,
        kind: 'connect_ports',
        sourceBlockId,
        sourcePortId,
        targetBlockId,
        targetPortId
      });

      connections.push({
        id: conn.id,
        fromBlockId: sourceBlockId,
        fromPortId: sourcePortId,
        toBlockId: targetBlockId,
        toPortId: targetPortId,
        domain: 'xbridges'
      });
    });

    // 3. Compute deterministic expectedAfterDelta
    const expectedAfterDelta = {
      addedBlocks: blocks.map(b => b.id).sort(),
      removedBlocks: [],
      modifiedBlocks: [],
      addedConnections: connections
        .map(c => ({ from: `${c.fromBlockId}:${c.fromPortId}`, to: `${c.toBlockId}:${c.toPortId}` }))
        .sort((a, b) => `${a.from}->${a.to}`.localeCompare(`${b.from}->${b.to}`)),
      removedConnections: []
    };

    const expectedBeforeHash = context.expectedBeforeHash || sha256Hex(canonicalJson({ revision: context.baseRevision }));

    // 4. Compute deterministic planHash
    const planHashPayload = {
      planId,
      projectId: context.projectId,
      baseRevision: context.baseRevision,
      catalogFingerprint: context.catalog.catalogFingerprint,
      expectedBeforeHash,
      actions,
      expectedAfterDelta
    };
    const planHash = sha256Hex(canonicalJson(planHashPayload));

    return {
      schemaVersion: '2.0.0',
      planId,
      planHash,
      projectId: context.projectId,
      baseRevision: context.baseRevision,
      catalogFingerprint: context.catalog.catalogFingerprint,
      expectedBeforeHash,
      expectedAfterDelta,
      actions,
      blocks,
      connections
    };
  }
}
