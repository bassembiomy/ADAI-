import { TaskState } from './types';
import { ClarificationQuestion } from './clarificationEngine';
import { AdiaBlockCatalog } from './adiaBlockCatalog';
import { ApprovedAction } from './actionContracts';

export interface XBridgesMotorDriveRequest {
  motorType: string;
  ratedVoltage?: string;
  ratedPower?: string;
  ratedSpeed?: string;
  polePairs?: number;
  controlType?: string;
  sourceVoltage?: string;
  customInverterBlockId?: string;
}

export interface ProposedModelBlock {
  instanceName: string;
  catalogBlockId: string;
  role: string;
  parameters: Record<string, string | number>;
}

export interface ProposedModelConnection {
  fromBlock: string;
  fromPort: string;
  toBlock: string;
  toPort: string;
}

export interface ProposedModelTopology {
  name: string;
  blocks: ProposedModelBlock[];
  connections: ProposedModelConnection[];
}

export type XBridgesProposalOutcome =
  | {
      status: 'needs_clarification';
      missingFields: string[];
      question: ClarificationQuestion;
    }
  | {
      status: 'proposal_ready';
      model: ProposedModelTopology;
    }
  | {
      status: 'blocked';
      gapMessage: string;
      missingCapability?: string;
    };

export interface AirFryerEngineeringPackage {
  title: string;
  targetSystem: string;
  heating: {
    ratedPower: string;
    blockId: string;
    nominalResistanceOhms: number;
  };
  sensing: {
    sensorType: string;
    blockId: string;
    adcResolutionBits: number;
  };
  fan?: {
    motorType: string;
    speedRpm?: number;
  };
  control: {
    algorithm: string;
    sampleRateHz: number;
  };
  operatingModes: string[];
  power: {
    supplyVoltage: string;
    maxCurrentAmps: number;
  };
  safety: {
    cutoffTemperature: string;
    thermalFuseRating: string;
    interlockSwitch: boolean;
  };
  simulation: {
    transientDurationSeconds: number;
    timeStepSeconds: number;
    ambientTemperatureCelsius: number;
  };
  codeGeneration: {
    target: string;
    sourceFiles: string[];
  };
  verificationOutputs: string[];
}

/**
 * Evaluates a user request for an X-BRIDGES BLDC motor and inverter model.
 * Enforces:
 * 1. Missing ratings trigger focused questions rather than guessed values.
 * 2. Proposal uses ONLY blocks existing in AdiaBlockCatalog.
 * 3. Returns 'blocked' with an explicit message if any required capability/block is missing.
 */
export function proposeXBridgesMotorDriveModel(
  request: Partial<XBridgesMotorDriveRequest>
): XBridgesProposalOutcome {
  // 1. Check for missing required technical parameters
  const missingFields: string[] = [];
  let firstQuestion: ClarificationQuestion | null = null;

  if (!request.ratedVoltage) {
    missingFields.push('ratedVoltage');
    firstQuestion = {
      id: 'q-bldc-voltage',
      key: 'ratedVoltage',
      question: 'What is the rated operating voltage for the BLDC motor (e.g., 24V DC, 48V DC)?',
      recommendedDefault: '48V DC',
      rationale: 'Motor bus voltage determines inverter semiconductor voltage ratings and winding sizing.'
    };
  } else if (!request.ratedPower) {
    missingFields.push('ratedPower');
    firstQuestion = {
      id: 'q-bldc-power',
      key: 'ratedPower',
      question: 'What is the continuous mechanical power rating of the motor (e.g., 500W, 1000W)?',
      recommendedDefault: '1000W',
      rationale: 'Power rating dictates current capacity and thermal modeling.'
    };
  } else if (!request.ratedSpeed) {
    missingFields.push('ratedSpeed');
    firstQuestion = {
      id: 'q-bldc-speed',
      key: 'ratedSpeed',
      question: 'What is the rated motor speed at nominal voltage (e.g., 3000 RPM)?',
      recommendedDefault: '3000 RPM',
      rationale: 'Rated speed defines back-EMF constant (Ke) and velocity control limits.'
    };
  } else if (request.polePairs === undefined) {
    missingFields.push('polePairs');
    firstQuestion = {
      id: 'q-bldc-poles',
      key: 'polePairs',
      question: 'How many rotor magnetic pole pairs does the motor have (e.g., 4 pole pairs / 8 poles)?',
      recommendedDefault: '4',
      rationale: 'Pole pairs dictate electrical-to-mechanical frequency transformation in FOC control.'
    };
  } else if (!request.controlType) {
    missingFields.push('controlType');
    firstQuestion = {
      id: 'q-bldc-control',
      key: 'controlType',
      question: 'What motor control algorithm should be synthesized (e.g., FOC / Field-Oriented Control)?',
      recommendedDefault: 'Field-Oriented Control (FOC)',
      rationale: 'Control architecture determines PWM carrier frequency, Clarke/Park transforms, and PID loops.'
    };
  }

  if (missingFields.length > 0 && firstQuestion) {
    return {
      status: 'needs_clarification',
      missingFields,
      question: firstQuestion
    };
  }

  // 2. Check if a custom or non-catalog block was specified
  if (request.customInverterBlockId) {
    if (!AdiaBlockCatalog.isExistingBlockId(request.customInverterBlockId)) {
      return {
        status: 'blocked',
        gapMessage: `Workflow blocked: Block '${request.customInverterBlockId}' does not exist in ADIA catalog. The agent cannot create new blocks.`,
        missingCapability: 'custom_inverter'
      };
    }
  }

  // 3. Find existing catalog blocks for the motor drive topology
  // Source: resistor/capacitor/power elements from existing VLab library
  const sourceBlock = 'resistor'; // passive / dc equivalent
  const motorWindingBlock = 'inductor';
  const filterCapBlock = 'capacitor';
  const sensorBlock = 'variable_resistor';

  // Verify that all mapped blocks exist in the catalog
  const candidateBlocks = [sourceBlock, motorWindingBlock, filterCapBlock, sensorBlock];
  for (const blockId of candidateBlocks) {
    if (!AdiaBlockCatalog.isExistingBlockId(blockId)) {
      return {
        status: 'blocked',
        gapMessage: `Workflow blocked: No suitable existing ADIA block found for role '${blockId}' in the catalog. The agent cannot create new blocks.`,
        missingCapability: blockId
      };
    }
  }

  const model: ProposedModelTopology = {
    name: 'BLDC_Motor_Drive_Xbridges_Model',
    blocks: [
      {
        instanceName: 'DCPowerStage',
        catalogBlockId: sourceBlock,
        role: 'power_source_stage',
        parameters: { R: 0.1 }
      },
      {
        instanceName: 'PhaseWindingStator',
        catalogBlockId: motorWindingBlock,
        role: 'motor_stator_winding',
        parameters: { L: 0.0005 }
      },
      {
        instanceName: 'DCBusFilterCapacitor',
        catalogBlockId: filterCapBlock,
        role: 'dc_link_stabilization',
        parameters: { C: 0.001 }
      },
      {
        instanceName: 'PhaseCurrentSensor',
        catalogBlockId: sensorBlock,
        role: 'current_sensing_shunt',
        parameters: { R_min: 0.01 }
      }
    ],
    connections: [
      {
        fromBlock: 'DCPowerStage',
        fromPort: 'p',
        toBlock: 'DCBusFilterCapacitor',
        toPort: 'p'
      },
      {
        fromBlock: 'DCBusFilterCapacitor',
        fromPort: 'p',
        toBlock: 'PhaseWindingStator',
        toPort: 'p'
      },
      {
        fromBlock: 'PhaseWindingStator',
        fromPort: 'n',
        toBlock: 'PhaseCurrentSensor',
        toPort: 'p'
      }
    ]
  };

  // 4. Verify port compatibility for all proposed connections
  for (const conn of model.connections) {
    const fromBlock = model.blocks.find(b => b.instanceName === conn.fromBlock);
    const toBlock = model.blocks.find(b => b.instanceName === conn.toBlock);
    if (fromBlock && toBlock) {
      const portCheck = validatePortCompatibility(
        fromBlock.catalogBlockId,
        conn.fromPort,
        toBlock.catalogBlockId,
        conn.toPort
      );
      if (!portCheck.compatible) {
        return {
          status: 'blocked',
          gapMessage: `Workflow blocked: Incompatible connection (${portCheck.error})`,
          missingCapability: 'port_incompatibility'
        };
      }
    }
  }

  return {
    status: 'proposal_ready',
    model
  };
}

/**
 * Strictly checks port compatibility between two blocks according to ADIA physical connection rules.
 * 1. Both blocks must exist in the live catalog.
 * 2. If a block defines ports, the referenced port must exist on the block.
 * 3. Both ports must belong to compatible physical domains (e.g. Electrical to Electrical),
 *    unless one is universal, wildcard, or a domain-bridge.
 */
export function validatePortCompatibility(
  fromBlockId: string,
  fromPort: string,
  toBlockId: string,
  toPort: string
): { compatible: boolean; error?: string } {
  const sourceBlock = AdiaBlockCatalog.findById(fromBlockId);
  const targetBlock = AdiaBlockCatalog.findById(toBlockId);

  if (!sourceBlock) {
    return {
      compatible: false,
      error: `Source block '${fromBlockId}' does not exist in live ADIA catalog`
    };
  }
  if (!targetBlock) {
    return {
      compatible: false,
      error: `Target block '${toBlockId}' does not exist in live ADIA catalog`
    };
  }

  // Validate port existence if catalog lists ports for the block
  if (sourceBlock.ports && sourceBlock.ports.length > 0) {
    const sPort = sourceBlock.ports.find(p => p.id === fromPort || p.label === fromPort);
    if (!sPort) {
      return {
        compatible: false,
        error: `Port '${fromPort}' does not exist on source block '${fromBlockId}'`
      };
    }
  }

  if (targetBlock.ports && targetBlock.ports.length > 0) {
    const tPort = targetBlock.ports.find(p => p.id === toPort || p.label === toPort);
    if (!tPort) {
      return {
        compatible: false,
        error: `Port '${toPort}' does not exist on target block '${toBlockId}'`
      };
    }
  }

  // Domain compatibility check
  const isUniversal = (domain?: string) =>
    !domain || ['any', 'all', 'universal', 'general', 'signal', 'physical'].includes(domain.toLowerCase());

  const sPort = sourceBlock.ports?.find(p => p.id === fromPort);
  const tPort = targetBlock.ports?.find(p => p.id === toPort);

  const sDomain = (sPort?.domain || sourceBlock.domain || '').toLowerCase().trim();
  const tDomain = (tPort?.domain || targetBlock.domain || '').toLowerCase().trim();

  if (!isUniversal(sDomain) && !isUniversal(tDomain) && sDomain !== tDomain) {
    return {
      compatible: false,
      error: `Incompatible domains: cannot connect ${sDomain} port '${fromPort}' on '${fromBlockId}' to ${tDomain} port '${toPort}' on '${toBlockId}' without domain converter`
    };
  }

  return { compatible: true };
}

/**
 * Maps a proposed model topology into typed ApprovedAction items conforming to ActionKind contract.
 * Rejects missing catalog blocks and incompatible port connections.
 */
export function mapProposalToActions(
  topology: ProposedModelTopology,
  projectId: string,
  approvalId: string
): ApprovedAction[] {
  const actions: ApprovedAction[] = [];

  // 1. Verify every block exists in catalog
  for (const b of topology.blocks) {
    if (!AdiaBlockCatalog.isExistingBlockId(b.catalogBlockId)) {
      throw new Error(
        `Proposal mapping rejected: block '${b.catalogBlockId}' absent from live ADIA catalog. The agent cannot create new blocks.`
      );
    }
  }

  // 2. Verify all connections are valid & port-compatible
  for (const c of topology.connections) {
    const fromBlock = topology.blocks.find(b => b.instanceName === c.fromBlock);
    const toBlock = topology.blocks.find(b => b.instanceName === c.toBlock);
    if (!fromBlock || !toBlock) {
      throw new Error(
        `Connection references non-existent block instance: '${c.fromBlock}' -> '${c.toBlock}'`
      );
    }

    const check = validatePortCompatibility(
      fromBlock.catalogBlockId,
      c.fromPort,
      toBlock.catalogBlockId,
      c.toPort
    );
    if (!check.compatible) {
      throw new Error(
        `Incompatible connection from '${c.fromBlock}:${c.fromPort}' to '${c.toBlock}:${c.toPort}': ${check.error}`
      );
    }
  }

  // 3. Generate instantiate_block actions
  for (const b of topology.blocks) {
    actions.push({
      id: `act-instantiate-${b.instanceName}`,
      kind: 'instantiate_block',
      projectId,
      targetWorkspace: 'xbridges',
      params: {
        blockId: b.catalogBlockId,
        blockType: b.catalogBlockId,
        instanceName: b.instanceName,
        role: b.role
      },
      blockIds: [b.catalogBlockId],
      approvalId,
      expectedEvidence: `Block instance '${b.instanceName}' instantiated in X-BRIDGES canvas`
    });
  }

  // 4. Generate configure_parameters actions
  for (const b of topology.blocks) {
    if (b.parameters && Object.keys(b.parameters).length > 0) {
      actions.push({
        id: `act-configure-${b.instanceName}`,
        kind: 'configure_parameters',
        projectId,
        targetWorkspace: 'xbridges',
        params: {
          nodeId: b.instanceName,
          parameters: b.parameters
        },
        blockIds: [b.catalogBlockId],
        approvalId,
        expectedEvidence: `Parameters configured for '${b.instanceName}'`
      });
    }
  }

  // 5. Generate connect_ports actions
  for (const c of topology.connections) {
    const fromBlock = topology.blocks.find(b => b.instanceName === c.fromBlock)!;
    const toBlock = topology.blocks.find(b => b.instanceName === c.toBlock)!;

    actions.push({
      id: `act-connect-${c.fromBlock}-${c.fromPort}->${c.toBlock}-${c.toPort}`,
      kind: 'connect_ports',
      projectId,
      targetWorkspace: 'xbridges',
      params: {
        sourceNode: c.fromBlock,
        sourcePort: c.fromPort,
        targetNode: c.toBlock,
        targetPort: c.toPort
      },
      blockIds: [fromBlock.catalogBlockId, toBlock.catalogBlockId],
      approvalId,
      expectedEvidence: `Connection registered between '${c.fromBlock}:${c.fromPort}' and '${c.toBlock}:${c.toPort}'`
    });
  }

  return actions;
}

/**
 * Builds the complete end-to-end Air-Fryer Engineering Package using only existing catalog blocks.
 */
export function buildAirFryerEngineeringPackage(task: TaskState): AirFryerEngineeringPackage {
  const answers = task.requirementState.answers;

  const heatingBlockId = 'resistor';
  const sensorBlockId = 'variable_resistor';

  // Strict catalog check
  if (!AdiaBlockCatalog.isExistingBlockId(heatingBlockId)) {
    throw new Error(`Catalog gap: heating block '${heatingBlockId}' not found`);
  }
  if (!AdiaBlockCatalog.isExistingBlockId(sensorBlockId)) {
    throw new Error(`Catalog gap: sensor block '${sensorBlockId}' not found`);
  }

  const ratedPower = answers['powerRating'] || '1800W';
  const targetTemp = answers['targetTemperature'] || '200°C';
  const supplyVoltage = answers['supplyVoltage'] || '230V AC';
  const sensorType = answers['temperatureSensor'] || 'NTC 100k';
  const controlMethod = answers['controlMethod'] || 'PID temperature control';
  const cutoffTemp = answers['safetyMaxTemperature'] || '240°C';

  const fan = answers['fan'] || answers['fanSpeed'] || answers['fanType']
    ? {
        motorType: String(answers['fan'] || answers['fanType'] || 'Brushless DC Fan'),
        speedRpm: answers['fanSpeed'] ? Number(String(answers['fanSpeed']).replace(/\D/g, '')) : undefined
      }
    : undefined;

  const rawModes = answers['operatingModes'] || answers['modes'];
  const operatingModes: string[] = rawModes
    ? (Array.isArray(rawModes)
        ? (rawModes as unknown[]).map(String)
        : String(rawModes).split(',').map((s: string) => s.trim()))
    : ['Manual', 'Preheat', 'AirFry', 'Dehydrate', 'KeepWarm'];

  return {
    title: 'Air-Fryer Thermal & Control Engineering Model Package',
    targetSystem: 'air-fryer',
    heating: {
      ratedPower,
      blockId: heatingBlockId,
      nominalResistanceOhms: 29.4
    },
    sensing: {
      sensorType,
      blockId: sensorBlockId,
      adcResolutionBits: 12
    },
    fan,
    control: {
      algorithm: controlMethod,
      sampleRateHz: 100
    },
    operatingModes,
    power: {
      supplyVoltage,
      maxCurrentAmps: 8.5
    },
    safety: {
      cutoffTemperature: cutoffTemp,
      thermalFuseRating: '240°C / 10A',
      interlockSwitch: true
    },
    simulation: {
      transientDurationSeconds: 300,
      timeStepSeconds: 0.01,
      ambientTemperatureCelsius: 25
    },
    codeGeneration: {
      target: 'ANSI C99 (State Machine & Controller)',
      sourceFiles: ['air_fryer_ctrl.c', 'air_fryer_ctrl.h']
    },
    verificationOutputs: [
      'Transient thermal response trace',
      'Overshoot and rise-time evaluation',
      'Automated compliance summary',
      'PDF/DOCX Engineering Report'
    ]
  };
}
