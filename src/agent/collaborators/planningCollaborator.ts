import { EngineeringSpecification } from '../specificationEngine';
import { ExecutionPlan, PlanAction } from '../planEngine';
import { EngineeringModelPlanV2, XbridgesAction } from '../../services/ai/contracts/engineeringModel';
import {
  planGeneralXbridgesModel,
  PlanningContext,
  PlanningOutcome,
  EngineeringPattern
} from '../../services/ai/planner/generalGraphPlanner';
import { XbridgesCapabilityIndex } from '../../services/ai/catalog/xbridgesCapabilityIndex';
import { ModelSnapshot } from '../../services/ai/adapters/liveXbridgesModelAdapter';
import { GeneralEngineeringRequest } from '../../services/ai/planner/generalIntent';
import { AdiaBlockCatalog } from '../adiaBlockCatalog';

export class PlanningCollaborator {
  public planGeneralModel(
    request: GeneralEngineeringRequest,
    context: {
      projectId: string;
      baseRevision: number;
      activeSnapshot: ModelSnapshot;
      catalog: XbridgesCapabilityIndex;
      patterns?: EngineeringPattern[];
    }
  ): PlanningOutcome {
    const planningContext: PlanningContext = {
      projectId: context.projectId,
      baseRevision: context.baseRevision,
      activeSnapshot: context.activeSnapshot,
      catalog: context.catalog,
      patterns: context.patterns || []
    };

    return planGeneralXbridgesModel(request, planningContext);
  }

  public convertModelPlanToExecutionPlan(
    plan: EngineeringModelPlanV2,
    specification: EngineeringSpecification
  ): ExecutionPlan {
    const planId = plan.planId;
    const actions: PlanAction[] = [];

    let order = 1;
    for (const act of plan.actions) {
      if (act.kind === 'add_block') {
        const blockDef = AdiaBlockCatalog.findById(act.blockType);
        actions.push({
          id: act.id || `${planId}-act-${order}`,
          order,
          type: 'instantiate_block',
          title: `Instantiate ${blockDef?.name || act.blockType}`,
          description: `Place ${act.blockType} into X-BRIDGES workspace canvas`,
          blockId: act.blockType,
          params: {
            blockId: act.blockId,
            blockType: act.blockType,
            instanceName: act.blockId,
            ...(act.parameters || {})
          },
          dependencies: order > 1 ? [`${planId}-act-${order - 1}`] : [],
          affectedArtifacts: ['model_blocks.json'],
          expectedEvidence: `Block ${act.blockId} (${act.blockType}) instantiated in workspace`,
          rollbackMetadata: { action: 'delete_block', params: { instanceName: act.blockId } }
        });
        order++;
      } else if (act.kind === 'connect_ports') {
        actions.push({
          id: act.id || `${planId}-act-${order}`,
          order,
          type: 'connect_ports',
          title: `Connect ${act.sourceBlockId}:${act.sourcePortId} → ${act.targetBlockId}:${act.targetPortId}`,
          description: `Connect port ${act.sourcePortId} on ${act.sourceBlockId} to port ${act.targetPortId} on ${act.targetBlockId}`,
          params: {
            sourceNodeId: act.sourceBlockId,
            sourcePortId: act.sourcePortId,
            targetNodeId: act.targetBlockId,
            targetPortId: act.targetPortId
          },
          dependencies: order > 1 ? [`${planId}-act-${order - 1}`] : [],
          affectedArtifacts: ['model_connections.json'],
          expectedEvidence: `Connection ${act.sourceBlockId} -> ${act.targetBlockId} established`,
          rollbackMetadata: { action: 'disconnect', params: {} }
        });
        order++;
      } else if (act.kind === 'set_parameter') {
        actions.push({
          id: act.id || `${planId}-act-${order}`,
          order,
          type: 'configure_parameters',
          title: `Configure Parameters for ${act.blockId}`,
          description: `Update parameter ${act.parameterName} on block ${act.blockId}`,
          params: {
            blockId: act.blockId,
            parameterName: act.parameterName,
            value: act.value
          },
          dependencies: order > 1 ? [`${planId}-act-${order - 1}`] : [],
          affectedArtifacts: ['model_blocks.json'],
          expectedEvidence: `Parameter ${act.parameterName} updated on ${act.blockId}`,
          rollbackMetadata: { action: 'restore_parameters', params: {} }
        });
        order++;
      }
    }

    return {
      id: planId,
      specificationId: specification.id,
      title: `Execution Plan for ${specification.title}`,
      targetSystem: specification.targetSystem,
      actions,
      status: 'awaiting_approval',
      approved: false,
      createdAt: new Date().toISOString()
    };
  }
}
