import { EngineeringSpecification } from './specificationEngine';
import {
  createApprovalRequest,
  validateBlockProposal,
  ExtendedApprovalRequest
} from './approvalGate';

import { ActionKind } from './actionContracts';

export type PlanActionType = ActionKind;

export interface PlanAction {
  id: string;
  order: number;
  type: PlanActionType;
  title: string;
  description: string;
  blockId?: string;
  params: Record<string, unknown>;
  dependencies: string[];
  affectedArtifacts: string[];
  expectedEvidence: string;
  rollbackMetadata: { action: string; params: Record<string, unknown> };
}

export interface ExecutionPlan {
  id: string;
  specificationId: string;
  title: string;
  targetSystem: string;
  actions: PlanAction[];
  status: 'draft' | 'awaiting_approval' | 'approved' | 'rejected';
  approved: boolean;
  createdAt: string;
}

/**
 * Builds a deterministic execution plan from an approved EngineeringSpecification.
 * Strictly requires that the specification is approved before construction.
 */
export function buildExecutionPlan(specification: EngineeringSpecification): ExecutionPlan {
  if (!specification.approved) {
    throw new Error(
      `Cannot construct execution plan: specification '${specification.id}' must be approved first`
    );
  }

  const now = new Date().toISOString();
  const planId = `plan-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const actions: PlanAction[] = [];

  // Action 1: Instantiate Heating Element (resistor)
  validateBlockProposal('resistor');
  const act1: PlanAction = {
    id: `${planId}-act-1`,
    order: 1,
    type: 'instantiate_block',
    title: 'Instantiate Heating Resistor Block',
    description: 'Place electrical heating resistor block into model canvas',
    blockId: 'resistor',
    params: { blockId: 'resistor', blockType: 'resistor', instanceName: 'MainHeatingElement' },
    dependencies: [],
    affectedArtifacts: ['model_blocks.json'],
    expectedEvidence: 'Block instantiation token and layout ID',
    rollbackMetadata: { action: 'delete_block', params: { instanceName: 'MainHeatingElement' } }
  };
  actions.push(act1);

  // Action 2: Instantiate Sensing Element (variable_resistor)
  validateBlockProposal('variable_resistor');
  const act2: PlanAction = {
    id: `${planId}-act-2`,
    order: 2,
    type: 'instantiate_block',
    title: 'Instantiate Temperature Sensor Block',
    description: 'Place variable resistance thermal transducer block for temperature sensing',
    blockId: 'variable_resistor',
    params: { blockId: 'variable_resistor', blockType: 'variable_resistor', instanceName: 'ChamberTempSensor' },
    dependencies: [act1.id],
    affectedArtifacts: ['model_blocks.json'],
    expectedEvidence: 'Sensor block token with input and output terminals',
    rollbackMetadata: { action: 'delete_block', params: { instanceName: 'ChamberTempSensor' } }
  };
  actions.push(act2);

  // Action 3: Connect Ports
  const act3: PlanAction = {
    id: `${planId}-act-3`,
    order: 3,
    type: 'connect_ports',
    title: 'Connect Heater and Sensor Ports',
    description: 'Connect electrical and thermal terminals between heater and sensor feedback',
    params: {
      sourceNode: 'MainHeatingElement',
      sourcePort: 'p',
      targetNode: 'ChamberTempSensor',
      targetPort: 't_in'
    },
    dependencies: [act2.id],
    affectedArtifacts: ['model_connections.json'],
    expectedEvidence: 'Connection line registered between nodes',
    rollbackMetadata: { action: 'disconnect', params: {} }
  };
  actions.push(act3);

  // Action 4: Configure Parameters
  const act4: PlanAction = {
    id: `${planId}-act-4`,
    order: 4,
    type: 'configure_parameters',
    title: 'Configure Component Parameters',
    description: 'Assign approved power, resistance, and sensor rating parameters to placed blocks',
    params: {
      nodeId: 'MainHeatingElement',
      parameters: { R: 28.8, P_rated: 1800 }
    },
    dependencies: [act3.id],
    affectedArtifacts: ['model_parameters.json'],
    expectedEvidence: 'Parameter validation report matching specification',
    rollbackMetadata: { action: 'reset_parameters', params: {} }
  };
  actions.push(act4);

  // Action 5: Run Verification Simulation
  const act5: PlanAction = {
    id: `${planId}-act-5`,
    order: 5,
    type: 'run_simulation',
    title: 'Run Thermal Closed-Loop Simulation',
    description: 'Execute local solver simulation to verify rise time and temperature overshoot limits',
    params: { durationSeconds: 300, timeStep: 0.01 },
    dependencies: [act4.id],
    affectedArtifacts: ['simulation_results.json'],
    expectedEvidence: 'Simulation trace curves and performance metrics JSON',
    rollbackMetadata: { action: 'purge_simulation_cache', params: {} }
  };
  actions.push(act5);

  // Action 6: Generate Engineering Report
  const act6: PlanAction = {
    id: `${planId}-act-6`,
    order: 6,
    type: 'generate_report',
    title: 'Generate Verification Engineering Report',
    description: 'Assemble complete verification evidence, parameters, and simulation charts into report',
    params: { format: 'docx', template: 'engineering_report' },
    dependencies: [act5.id],
    affectedArtifacts: ['reports/air_fryer_report.docx'],
    expectedEvidence: 'Cryptographically hashed engineering report file',
    rollbackMetadata: { action: 'remove_generated_report', params: {} }
  };
  actions.push(act6);

  return {
    id: planId,
    specificationId: specification.id,
    title: `Execution Plan for ${specification.title}`,
    targetSystem: specification.targetSystem,
    actions,
    status: 'draft',
    approved: false,
    createdAt: now
  };
}

/**
 * Creates an individual action-level change approval request.
 * Strictly requires an approved execution plan.
 */
export function createChangeApprovalRequest(
  plan: ExecutionPlan,
  actionId: string
): ExtendedApprovalRequest {
  if (!plan.approved) {
    throw new Error(`Cannot create change approval: plan '${plan.id}' must be approved first`);
  }

  const action = plan.actions.find(a => a.id === actionId);
  if (!action) {
    throw new Error(`Action '${actionId}' not found in plan '${plan.id}'`);
  }

  return createApprovalRequest(
    'change',
    `Approve Execution: ${action.title}`,
    action.description,
    {
      planId: plan.id,
      actionId: action.id,
      actionType: action.type,
      blockId: action.blockId,
      params: action.params,
      affectedArtifacts: action.affectedArtifacts
    }
  );
}
