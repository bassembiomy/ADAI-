import { DiagnosisReport } from '../diagnosis/xbridgesDiagnosis';
import { ModelSnapshot } from '../adapters/liveXbridgesModelAdapter';
import { XbridgesCapabilityIndex } from '../catalog/xbridgesCapabilityIndex';
import {
  EngineeringModelPlanV2,
  XbridgesAction,
  LogicalBlock,
  LogicalConnection
} from '../contracts/engineeringModel';
import { sha256Hex, canonicalJson } from '../../../engine/opm/canonicalHash';

export interface RepairContext {
  snapshot: ModelSnapshot;
  catalog: XbridgesCapabilityIndex;
  projectId: string;
  baseRevision: number;
}

export interface RepairCandidate {
  id: string;
  description: string;
  plan: EngineeringModelPlanV2;
  estimatedDelta: number;
}

export async function proposeRepairs(
  report: DiagnosisReport,
  context: RepairContext
): Promise<RepairCandidate[]> {
  if (report.diagnostics.length === 0) {
    return [];
  }

  const candidates: RepairCandidate[] = [];

  // Group diagnostics by entity
  const paramDiagnostics = report.diagnostics.filter(d => d.code === 'INVALID_PARAMETER_VALUE');
  const unconnectedDiagnostics = report.diagnostics.filter(d => d.code === 'UNCONNECTED_REQUIRED_INPUT');

  // Strategy 1: Bounded parameter repairs
  if (paramDiagnostics.length > 0) {
    const actions: XbridgesAction[] = [];
    for (const diag of paramDiagnostics) {
      if (diag.entityId && diag.fieldPath && diag.expected !== undefined) {
        actions.push({
          id: `repair_param_${diag.entityId}_${diag.fieldPath}`,
          kind: 'set_parameter',
          blockId: diag.entityId,
          parameterName: diag.fieldPath,
          value: diag.expected
        });
      }
    }

    if (actions.length > 0) {
      const plan = buildRepairPlan(actions, context, 'Clamp invalid parameters to safe bounds');
      candidates.push({
        id: `repair_clamp_params_${candidates.length + 1}`,
        description: 'Clamp invalid parameters to safe bounds',
        plan,
        estimatedDelta: actions.length
      });
    }
  }

  // Strategy 2: Connect missing input to Step or Constant source if unambiguous
  if (unconnectedDiagnostics.length > 0 && candidates.length < 3) {
    // Only propose if we can add a default step/constant source deterministically
    const actions: XbridgesAction[] = [];
    let sourceCount = 0;

    for (const diag of unconnectedDiagnostics) {
      if (diag.entityId && diag.portId) {
        sourceCount++;
        const newSourceId = `source_repair_${sourceCount}`;
        actions.push({
          id: `add_repair_source_${sourceCount}`,
          kind: 'add_block',
          blockId: newSourceId,
          blockType: 'Step',
          position: { x: 50, y: 50 * sourceCount },
          parameters: { time: 1.0, value: 1.0 }
        });

        actions.push({
          id: `connect_repair_${sourceCount}`,
          kind: 'connect_ports',
          sourceBlockId: newSourceId,
          sourcePortId: 'out',
          targetBlockId: diag.entityId,
          targetPortId: diag.portId
        });
      }
    }

    if (actions.length > 0) {
      const plan = buildRepairPlan(actions, context, 'Provide standard signal sources for unconnected inputs');
      candidates.push({
        id: `repair_add_sources_${candidates.length + 1}`,
        description: 'Provide standard signal sources for unconnected inputs',
        plan,
        estimatedDelta: actions.length
      });
    }
  }

  // Hard limit to 3 candidates sorted deterministically by estimatedDelta, then id
  return candidates
    .sort((a, b) => a.estimatedDelta - b.estimatedDelta || a.id.localeCompare(b.id))
    .slice(0, 3);
}

function buildRepairPlan(
  actions: XbridgesAction[],
  context: RepairContext,
  description: string
): EngineeringModelPlanV2 {
  // Convert existing nodes/edges into logical blocks and connections
  const blocks: LogicalBlock[] = context.snapshot.nodes.map(n => ({
    id: n.id,
    blockDefinitionId: n.type,
    domain: 'xbridges',
    name: (n.data as any)?.label || n.id,
    parameters: Object.entries((n.data as any)?.params || {}).map(([pName, pVal]) => ({
      blockId: n.id,
      parameterName: pName,
      value: pVal as any
    }))
  }));

  const connections: LogicalConnection[] = context.snapshot.edges.map((e, idx) => ({
    id: e.id || `conn_${idx}`,
    fromBlockId: e.source,
    fromPortId: e.sourceHandle || 'out',
    toBlockId: e.target,
    toPortId: e.targetHandle || 'in',
    domain: 'xbridges'
  }));

  const addedBlocks: string[] = [];
  const removedBlocks: string[] = [];
  const modifiedBlocks: string[] = [];
  const addedConnections: Array<{ from: string; to: string }> = [];
  const removedConnections: Array<{ from: string; to: string }> = [];

  for (const act of actions) {
    if (act.kind === 'add_block') addedBlocks.push(act.blockId);
    else if (act.kind === 'remove_block') removedBlocks.push(act.blockId);
    else if (act.kind === 'set_parameter') modifiedBlocks.push(act.blockId);
    else if (act.kind === 'connect_ports') {
      addedConnections.push({ from: `${act.sourceBlockId}:${act.sourcePortId}`, to: `${act.targetBlockId}:${act.targetPortId}` });
    } else if (act.kind === 'disconnect_ports') {
      removedConnections.push({ from: `${act.sourceBlockId}:${act.sourcePortId}`, to: `${act.targetBlockId}:${act.targetPortId}` });
    }
  }

  const expectedAfterDelta = {
    addedBlocks: addedBlocks.sort(),
    removedBlocks: removedBlocks.sort(),
    modifiedBlocks: [...new Set(modifiedBlocks)].sort(),
    addedConnections: addedConnections.sort((a, b) => `${a.from}->${a.to}`.localeCompare(`${b.from}->${b.to}`)),
    removedConnections: removedConnections.sort((a, b) => `${a.from}->${a.to}`.localeCompare(`${b.from}->${b.to}`))
  };

  const planId = `plan_repair_${context.projectId}_${Date.now()}`;
  const planPayload = {
    schemaVersion: '2.0.0' as const,
    planId,
    projectId: context.projectId,
    baseRevision: context.baseRevision,
    catalogFingerprint: context.catalog.catalogFingerprint,
    expectedBeforeHash: context.snapshot.stateHash,
    expectedAfterDelta,
    actions,
    blocks,
    connections,
    validationCriteria: []
  };

  const planHash = sha256Hex(canonicalJson(planPayload));

  return {
    ...planPayload,
    planHash
  };
}
