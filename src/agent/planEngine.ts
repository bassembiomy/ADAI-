import { EngineeringSpecification } from './specificationEngine';
import {
  createApprovalRequest,
  validateBlockProposal,
  ExtendedApprovalRequest
} from './approvalGate';

import { ActionKind } from './actionContracts';
import { PlanPreflight, PreflightResult } from '../services/ai/planner/planPreflight';
import { EngineeringModelPlan } from '../services/ai/contracts/engineeringModel';
import { AdiaBlockCatalog } from './adiaBlockCatalog';

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

/** Projects the approved action list into the model contract that preflight checks. */
export function buildEngineeringModelPlanFromExecutionPlan(
  execution: ExecutionPlan,
  specification: EngineeringSpecification,
  baseRevision: number
): EngineeringModelPlan {
  const blocks = execution.actions.filter(a => a.type === 'instantiate_block').map(action => {
    const id = String(action.params.blockId);
    const blockDefinitionId = String(action.params.blockType);
    const definition = AdiaBlockCatalog.findById(blockDefinitionId);
    const parameters = Object.entries(action.params)
      .filter(([key]) => key !== 'blockId' && key !== 'blockType' && key !== 'instanceName')
      .map(([parameterName, value]) => ({ blockId: id, parameterName, value: value as string | number | boolean }));
    return {
      id,
      blockDefinitionId,
      domain: 'xbridges' as const,
      name: String(action.params.instanceName || definition?.name || id),
      parameters
    };
  });
  const connections = execution.actions.filter(a => a.type === 'connect_ports').map((action, index) => ({
    id: `connection_${index}`,
    fromBlockId: String(action.params.sourceNodeId),
    fromPortId: String(action.params.sourcePortId),
    toBlockId: String(action.params.targetNodeId),
    toPortId: String(action.params.targetPortId),
    domain: 'xbridges' as const
  }));
  return {
    schemaVersion: '1.0.0',
    planId: execution.id,
    projectId: specification.taskId,
    baseRevision,
    targetDomain: 'xbridges',
    designRationale: specification.title,
    assumptions: specification.assumptions.map(a => `${a.key}: ${a.value}`),
    blocks,
    connections,
    validationCriteria: []
  };
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

  const isThreePhaseInverter =
    specification.targetSystem === 'three_phase_inverter' ||
    specification.targetSystem.toLowerCase().includes('inverter');

  const isXBridges = specification.targetSystem.toLowerCase().includes('xbridges');

  if (isThreePhaseInverter) {
    const dcBusReq = specification.requirements.find(r => r.sourceAnswerKey === 'dcBusVoltage');
    const dcBusVoltage = dcBusReq ? parseFloat(String(dcBusReq.value)) || 400 : 400;

    const acFreqReq = specification.requirements.find(r => r.sourceAnswerKey === 'targetAcFrequency');
    const acFreq = acFreqReq ? parseFloat(String(acFreqReq.value)) || 50 : 50;

    const switchFreqReq = specification.requirements.find(r => r.sourceAnswerKey === 'switchingFrequency');
    const switchFreq = switchFreqReq ? parseFloat(String(switchFreqReq.value)) || 10000 : 10000;

    // 1. DC Voltage Source
    validateBlockProposal('DC_VOLTAGE_SOURCE');
    actions.push({
      id: `${planId}-act-1`,
      order: 1,
      type: 'instantiate_block',
      title: 'Instantiate DC Voltage Source',
      description: 'Place DC_VOLTAGE_SOURCE into X-BRIDGES workspace canvas',
      blockId: 'DC_VOLTAGE_SOURCE',
      params: { blockId: 'dc_src', blockType: 'DC_VOLTAGE_SOURCE', instanceName: 'dc_src', voltage: dcBusVoltage },
      dependencies: [],
      affectedArtifacts: ['model_blocks.json'],
      expectedEvidence: 'DC Voltage Source component registered in workspace',
      rollbackMetadata: { action: 'delete_block', params: { instanceName: 'dc_src' } }
    });

    // 2. Sine Voltage Reference Generator
    validateBlockProposal('VOLTAGE_REFERENCE_GENERATOR');
    actions.push({
      id: `${planId}-act-2`,
      order: 2,
      type: 'instantiate_block',
      title: 'Instantiate Voltage Reference Generator',
      description: 'Place VOLTAGE_REFERENCE_GENERATOR into X-BRIDGES workspace canvas',
      blockId: 'VOLTAGE_REFERENCE_GENERATOR',
      params: { blockId: 'v_ref', blockType: 'VOLTAGE_REFERENCE_GENERATOR', instanceName: 'v_ref', frequency: acFreq },
      dependencies: [`${planId}-act-1`],
      affectedArtifacts: ['model_blocks.json'],
      expectedEvidence: 'Voltage Reference component registered in workspace',
      rollbackMetadata: { action: 'delete_block', params: { instanceName: 'v_ref' } }
    });

    // 3. Three-Phase PWM Modulator
    validateBlockProposal('THREE_PHASE_PWM');
    actions.push({
      id: `${planId}-act-3`,
      order: 3,
      type: 'instantiate_block',
      title: 'Instantiate 3-Phase PWM Modulator',
      description: 'Place THREE_PHASE_PWM into X-BRIDGES workspace canvas',
      blockId: 'THREE_PHASE_PWM',
      params: { blockId: 'pwm_gen', blockType: 'THREE_PHASE_PWM', instanceName: 'pwm_gen', frequency: switchFreq, method: 'SPWM' },
      dependencies: [`${planId}-act-2`],
      affectedArtifacts: ['model_blocks.json'],
      expectedEvidence: 'PWM Generator component registered in workspace',
      rollbackMetadata: { action: 'delete_block', params: { instanceName: 'pwm_gen' } }
    });

    // 4. Three-Phase Inverter Bridge
    validateBlockProposal('THREE_PHASE_INVERTER');
    actions.push({
      id: `${planId}-act-4`,
      order: 4,
      type: 'instantiate_block',
      title: 'Instantiate 3-Phase Inverter Bridge',
      description: 'Place THREE_PHASE_INVERTER bridge into X-BRIDGES workspace canvas',
      blockId: 'THREE_PHASE_INVERTER',
      params: { blockId: 'inv_bridge', blockType: 'THREE_PHASE_INVERTER', instanceName: 'inv_bridge', Ron: 0.01, Vf: 0.7 },
      dependencies: [`${planId}-act-3`],
      affectedArtifacts: ['model_blocks.json'],
      expectedEvidence: 'Inverter Bridge component registered in workspace',
      rollbackMetadata: { action: 'delete_block', params: { instanceName: 'inv_bridge' } }
    });

    // 5. Three-Phase AC Load
    validateBlockProposal('THREE_PHASE_LOAD');
    actions.push({
      id: `${planId}-act-5`,
      order: 5,
      type: 'instantiate_block',
      title: 'Instantiate 3-Phase AC Load',
      description: 'Place THREE_PHASE_LOAD into X-BRIDGES workspace canvas',
      blockId: 'THREE_PHASE_LOAD',
      params: { blockId: 'ac_load', blockType: 'THREE_PHASE_LOAD', instanceName: 'ac_load', R: 10 },
      dependencies: [`${planId}-act-4`],
      affectedArtifacts: ['model_blocks.json'],
      expectedEvidence: 'Three-Phase Load component registered in workspace',
      rollbackMetadata: { action: 'delete_block', params: { instanceName: 'ac_load' } }
    });

    // Connections
    // DC Rail: pos and neg return
    actions.push({
      id: `${planId}-act-6`,
      order: 6,
      type: 'connect_ports',
      title: 'Connect DC Positive Rail',
      description: 'Connect dc_src:v_pos to inv_bridge:vdc_p',
      params: { sourceNodeId: 'dc_src', sourcePortId: 'v_pos', targetNodeId: 'inv_bridge', targetPortId: 'vdc_p' },
      dependencies: [`${planId}-act-5`],
      affectedArtifacts: ['model_connections.json'],
      expectedEvidence: 'DC positive connection established',
      rollbackMetadata: { action: 'disconnect', params: {} }
    });

    actions.push({
      id: `${planId}-act-7`,
      order: 7,
      type: 'connect_ports',
      title: 'Connect DC Negative Rail Return',
      description: 'Connect dc_src:v_neg to inv_bridge:vdc_n',
      params: { sourceNodeId: 'dc_src', sourcePortId: 'v_neg', targetNodeId: 'inv_bridge', targetPortId: 'vdc_n' },
      dependencies: [`${planId}-act-5`],
      affectedArtifacts: ['model_connections.json'],
      expectedEvidence: 'DC negative return connection established',
      rollbackMetadata: { action: 'disconnect', params: {} }
    });

    // Reference to PWM: va, vb, vc
    actions.push({
      id: `${planId}-act-8`,
      order: 8,
      type: 'connect_ports',
      title: 'Connect Modulation Reference A',
      description: 'Connect v_ref:va to pwm_gen:va_ref',
      params: { sourceNodeId: 'v_ref', sourcePortId: 'va', targetNodeId: 'pwm_gen', targetPortId: 'va_ref' },
      dependencies: [`${planId}-act-5`],
      affectedArtifacts: ['model_connections.json'],
      expectedEvidence: 'Phase A reference connection established',
      rollbackMetadata: { action: 'disconnect', params: {} }
    });

    actions.push({
      id: `${planId}-act-9`,
      order: 9,
      type: 'connect_ports',
      title: 'Connect Modulation Reference B',
      description: 'Connect v_ref:vb to pwm_gen:vb_ref',
      params: { sourceNodeId: 'v_ref', sourcePortId: 'vb', targetNodeId: 'pwm_gen', targetPortId: 'vb_ref' },
      dependencies: [`${planId}-act-5`],
      affectedArtifacts: ['model_connections.json'],
      expectedEvidence: 'Phase B reference connection established',
      rollbackMetadata: { action: 'disconnect', params: {} }
    });

    actions.push({
      id: `${planId}-act-10`,
      order: 10,
      type: 'connect_ports',
      title: 'Connect Modulation Reference C',
      description: 'Connect v_ref:vc to pwm_gen:vc_ref',
      params: { sourceNodeId: 'v_ref', sourcePortId: 'vc', targetNodeId: 'pwm_gen', targetPortId: 'vc_ref' },
      dependencies: [`${planId}-act-5`],
      affectedArtifacts: ['model_connections.json'],
      expectedEvidence: 'Phase C reference connection established',
      rollbackMetadata: { action: 'disconnect', params: {} }
    });

    // PWM to Inverter Gates: ga, gb, gc
    actions.push({
      id: `${planId}-act-11`,
      order: 11,
      type: 'connect_ports',
      title: 'Connect Gate Driver A',
      description: 'Connect pwm_gen:ga to inv_bridge:ga',
      params: { sourceNodeId: 'pwm_gen', sourcePortId: 'ga', targetNodeId: 'inv_bridge', targetPortId: 'ga' },
      dependencies: [`${planId}-act-5`],
      affectedArtifacts: ['model_connections.json'],
      expectedEvidence: 'Gate A connection established',
      rollbackMetadata: { action: 'disconnect', params: {} }
    });

    actions.push({
      id: `${planId}-act-12`,
      order: 12,
      type: 'connect_ports',
      title: 'Connect Gate Driver B',
      description: 'Connect pwm_gen:gb to inv_bridge:gb',
      params: { sourceNodeId: 'pwm_gen', sourcePortId: 'gb', targetNodeId: 'inv_bridge', targetPortId: 'gb' },
      dependencies: [`${planId}-act-5`],
      affectedArtifacts: ['model_connections.json'],
      expectedEvidence: 'Gate B connection established',
      rollbackMetadata: { action: 'disconnect', params: {} }
    });

    actions.push({
      id: `${planId}-act-13`,
      order: 13,
      type: 'connect_ports',
      title: 'Connect Gate Driver C',
      description: 'Connect pwm_gen:gc to inv_bridge:gc',
      params: { sourceNodeId: 'pwm_gen', sourcePortId: 'gc', targetNodeId: 'inv_bridge', targetPortId: 'gc' },
      dependencies: [`${planId}-act-5`],
      affectedArtifacts: ['model_connections.json'],
      expectedEvidence: 'Gate C connection established',
      rollbackMetadata: { action: 'disconnect', params: {} }
    });

    // Inverter to AC Load: va, vb, vc
    actions.push({
      id: `${planId}-act-14`,
      order: 14,
      type: 'connect_ports',
      title: 'Connect AC Phase A Output',
      description: 'Connect inv_bridge:va to ac_load:va',
      params: { sourceNodeId: 'inv_bridge', sourcePortId: 'va', targetNodeId: 'ac_load', targetPortId: 'va' },
      dependencies: [`${planId}-act-5`],
      affectedArtifacts: ['model_connections.json'],
      expectedEvidence: 'AC Phase A connection established',
      rollbackMetadata: { action: 'disconnect', params: {} }
    });

    actions.push({
      id: `${planId}-act-15`,
      order: 15,
      type: 'connect_ports',
      title: 'Connect AC Phase B Output',
      description: 'Connect inv_bridge:vb to ac_load:vb',
      params: { sourceNodeId: 'inv_bridge', sourcePortId: 'vb', targetNodeId: 'ac_load', targetPortId: 'vb' },
      dependencies: [`${planId}-act-5`],
      affectedArtifacts: ['model_connections.json'],
      expectedEvidence: 'AC Phase B connection established',
      rollbackMetadata: { action: 'disconnect', params: {} }
    });

    actions.push({
      id: `${planId}-act-16`,
      order: 16,
      type: 'connect_ports',
      title: 'Connect AC Phase C Output',
      description: 'Connect inv_bridge:vc to ac_load:vc',
      params: { sourceNodeId: 'inv_bridge', sourcePortId: 'vc', targetNodeId: 'ac_load', targetPortId: 'vc' },
      dependencies: [`${planId}-act-5`],
      affectedArtifacts: ['model_connections.json'],
      expectedEvidence: 'AC Phase C connection established',
      rollbackMetadata: { action: 'disconnect', params: {} }
    });
  } else if (isXBridges) {
    // Action 1: Instantiate GAIN Block
    validateBlockProposal('GAIN');
    const act1: PlanAction = {
      id: `${planId}-act-1`,
      order: 1,
      type: 'instantiate_block',
      title: 'Instantiate Gain Block',
      description: 'Place GAIN block into X-BRIDGES workspace canvas',
      blockId: 'GAIN',
      params: { blockId: 'GAIN', blockType: 'GAIN', instanceName: 'MainGain' },
      dependencies: [],
      affectedArtifacts: ['model_blocks.json'],
      expectedEvidence: 'Block instantiation token and layout ID',
      rollbackMetadata: { action: 'delete_block', params: { instanceName: 'MainGain' } }
    };
    actions.push(act1);

    // Action 2: Instantiate Scope Block
    validateBlockProposal('Scope');
    const act2: PlanAction = {
      id: `${planId}-act-2`,
      order: 2,
      type: 'instantiate_block',
      title: 'Instantiate Scope Block',
      description: 'Place Scope block into X-BRIDGES workspace canvas',
      blockId: 'Scope',
      params: { blockId: 'Scope', blockType: 'Scope', instanceName: 'MainScope' },
      dependencies: [act1.id],
      affectedArtifacts: ['model_blocks.json'],
      expectedEvidence: 'Scope block token with input ports',
      rollbackMetadata: { action: 'delete_block', params: { instanceName: 'MainScope' } }
    };
    actions.push(act2);

    // Action 3: Connect Ports
    const act3: PlanAction = {
      id: `${planId}-act-3`,
      order: 3,
      type: 'connect_ports',
      title: 'Connect Gain to Scope',
      description: 'Connect Gain output port y to Scope input port in1',
      params: {
        sourceNodeId: 'MainGain',
        sourcePortId: 'y',
        targetNodeId: 'MainScope',
        targetPortId: 'in1'
      },
      dependencies: [act2.id],
      affectedArtifacts: ['model_connections.json'],
      expectedEvidence: 'Connection registered between nodes',
      rollbackMetadata: { action: 'disconnect', params: {} }
    };
    actions.push(act3);

    // Action 4: Configure Parameters
    const act4: PlanAction = {
      id: `${planId}-act-4`,
      order: 4,
      type: 'configure_parameters',
      title: 'Configure Gain Parameter',
      description: 'Set Gain value parameter to 5',
      params: {
        nodeId: 'MainGain',
        parameters: { gain: 5 }
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
      title: 'Run Signal Closed-Loop Simulation',
      description: 'Execute solver simulation to verify transient behavior',
      params: { durationSeconds: 10, timeStep: 0.001 },
      dependencies: [act4.id],
      affectedArtifacts: ['simulation_results.json'],
      expectedEvidence: 'Simulation trace curves and metrics JSON',
      rollbackMetadata: { action: 'purge_simulation_cache', params: {} }
    };
    actions.push(act5);

    // Action 6: Generate Engineering Report
    const act6: PlanAction = {
      id: `${planId}-act-6`,
      order: 6,
      type: 'generate_report',
      title: 'Generate Verification Engineering Report',
      description: 'Assemble complete verification evidence into report artifact',
      params: { format: 'docx', template: 'engineering_report' },
      dependencies: [act5.id],
      affectedArtifacts: ['reports/xbridges_verification_report.docx'],
      expectedEvidence: 'Cryptographically hashed engineering report file',
      rollbackMetadata: { action: 'remove_generated_report', params: {} }
    };
    actions.push(act6);
  } else {
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
  }

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
  actionId: string,
  projectRevision: number = 0
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
      affectedArtifacts: action.affectedArtifacts,
      expectedEvidence: action.expectedEvidence,
      projectRevision
    }
  );
}

/**
 * Preflights an EngineeringModelPlan against canonical catalog, topology, and revision.
 * Strictly separates planner generation from state mutation.
 */
export function preflightEngineeringModelPlan(
  plan: EngineeringModelPlan,
  currentRevision: number
): PreflightResult {
  return PlanPreflight.preflight(plan, { currentRevision });
}

/**
 * Builds a typed EngineeringModelPlan from an approved EngineeringSpecification
 * and current project revision, ensuring physical canonical compatibility.
 */
export function buildEngineeringModelPlanFromSpecification(
  specification: EngineeringSpecification,
  baseRevision: number
): EngineeringModelPlan {
  const isThreePhaseInverter =
    specification.targetSystem === 'three_phase_inverter' ||
    specification.targetSystem.toLowerCase().includes('inverter');

  if (isThreePhaseInverter) {
    const dcBusReq = specification.requirements.find(r => r.sourceAnswerKey === 'dcBusVoltage');
    const dcBusVoltage = dcBusReq ? parseFloat(String(dcBusReq.value)) || 400 : 400;

    const acFreqReq = specification.requirements.find(r => r.sourceAnswerKey === 'targetAcFrequency');
    const acFreq = acFreqReq ? parseFloat(String(acFreqReq.value)) || 50 : 50;

    const switchFreqReq = specification.requirements.find(r => r.sourceAnswerKey === 'switchingFrequency');
    const switchFreq = switchFreqReq ? parseFloat(String(switchFreqReq.value)) || 10000 : 10000;

    return {
      schemaVersion: '1.0.0',
      planId: `eng-plan-${Date.now()}`,
      projectId: specification.taskId,
      baseRevision,
      targetDomain: 'xbridges',
      designRationale: specification.title,
      assumptions: specification.assumptions.map(a => `${a.key}: ${a.value}`),
      blocks: [
        {
          id: 'dc_src',
          blockDefinitionId: 'DC_VOLTAGE_SOURCE',
          domain: 'xbridges',
          name: 'DC Voltage Source',
          parameters: [{ blockId: 'dc_src', parameterName: 'voltage', value: dcBusVoltage }]
        },
        {
          id: 'v_ref',
          blockDefinitionId: 'VOLTAGE_REFERENCE_GENERATOR',
          domain: 'xbridges',
          name: 'Sine Voltage Reference',
          parameters: [
            { blockId: 'v_ref', parameterName: 'frequency', value: acFreq },
            { blockId: 'v_ref', parameterName: 'amplitude', value: 1 }
          ]
        },
        {
          id: 'pwm_gen',
          blockDefinitionId: 'THREE_PHASE_PWM',
          domain: 'xbridges',
          name: '3-Phase SPWM Modulator',
          parameters: [
            { blockId: 'pwm_gen', parameterName: 'frequency', value: switchFreq },
            { blockId: 'pwm_gen', parameterName: 'method', value: 'SPWM' }
          ]
        },
        {
          id: 'inv_bridge',
          blockDefinitionId: 'THREE_PHASE_INVERTER',
          domain: 'xbridges',
          name: '3-Phase Inverter Bridge',
          parameters: [
            { blockId: 'inv_bridge', parameterName: 'Ron', value: 0.01 },
            { blockId: 'inv_bridge', parameterName: 'Vf', value: 0.7 }
          ]
        },
        {
          id: 'ac_load',
          blockDefinitionId: 'THREE_PHASE_LOAD',
          domain: 'xbridges',
          name: '3-Phase AC Load',
          parameters: [{ blockId: 'ac_load', parameterName: 'R', value: 10 }]
        }
      ],
      connections: [
        {
          id: 'c_dc_p',
          fromBlockId: 'dc_src',
          fromPortId: 'v_pos',
          toBlockId: 'inv_bridge',
          toPortId: 'vdc_p',
          domain: 'xbridges'
        },
        {
          id: 'c_dc_n',
          fromBlockId: 'dc_src',
          fromPortId: 'v_neg',
          toBlockId: 'inv_bridge',
          toPortId: 'vdc_n',
          domain: 'xbridges'
        },
        {
          id: 'c_ref_a',
          fromBlockId: 'v_ref',
          fromPortId: 'va',
          toBlockId: 'pwm_gen',
          toPortId: 'va_ref',
          domain: 'xbridges'
        },
        {
          id: 'c_ref_b',
          fromBlockId: 'v_ref',
          fromPortId: 'vb',
          toBlockId: 'pwm_gen',
          toPortId: 'vb_ref',
          domain: 'xbridges'
        },
        {
          id: 'c_ref_c',
          fromBlockId: 'v_ref',
          fromPortId: 'vc',
          toBlockId: 'pwm_gen',
          toPortId: 'vc_ref',
          domain: 'xbridges'
        },
        {
          id: 'c_pwm_a',
          fromBlockId: 'pwm_gen',
          fromPortId: 'ga',
          toBlockId: 'inv_bridge',
          toPortId: 'ga',
          domain: 'xbridges'
        },
        {
          id: 'c_pwm_b',
          fromBlockId: 'pwm_gen',
          fromPortId: 'gb',
          toBlockId: 'inv_bridge',
          toPortId: 'gb',
          domain: 'xbridges'
        },
        {
          id: 'c_pwm_c',
          fromBlockId: 'pwm_gen',
          fromPortId: 'gc',
          toBlockId: 'inv_bridge',
          toPortId: 'gc',
          domain: 'xbridges'
        },
        {
          id: 'c_out_a',
          fromBlockId: 'inv_bridge',
          fromPortId: 'va',
          toBlockId: 'ac_load',
          toPortId: 'va',
          domain: 'xbridges'
        },
        {
          id: 'c_out_b',
          fromBlockId: 'inv_bridge',
          fromPortId: 'vb',
          toBlockId: 'ac_load',
          toPortId: 'vb',
          domain: 'xbridges'
        },
        {
          id: 'c_out_c',
          fromBlockId: 'inv_bridge',
          fromPortId: 'vc',
          toBlockId: 'ac_load',
          toPortId: 'vc',
          domain: 'xbridges'
        }
      ],
      validationCriteria: []
    };
  }

  return {
    schemaVersion: '1.0.0',
    planId: `eng-plan-${Date.now()}`,
    projectId: specification.taskId,
    baseRevision,
    targetDomain: 'xbridges',
    designRationale: specification.title,
    assumptions: [],
    blocks: [],
    connections: [],
    validationCriteria: []
  };
}

