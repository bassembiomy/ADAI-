import { describe, it, expect } from 'vitest';
import {
  proposeXBridgesMotorDriveModel,
  buildAirFryerEngineeringPackage,
  validatePortCompatibility,
  mapProposalToActions,
  XBridgesMotorDriveRequest
} from './xbridgesProposal';
import { AdiaBlockCatalog } from './adiaBlockCatalog';
import { createTaskState, recordAnswer } from './requirementState';
import { buildSpecification } from './specificationEngine';

describe('X-BRIDGES Motor Drive Workflow & Proposal Engine', () => {
  const completeBldcRequest: XBridgesMotorDriveRequest = {
    motorType: 'BLDC',
    ratedVoltage: '48V DC',
    ratedPower: '1000W',
    ratedSpeed: '3000 RPM',
    polePairs: 4,
    controlType: 'Field-Oriented Control (FOC)',
    sourceVoltage: '48V DC'
  };

  it('produces clarification questions instead of guessing values when motor ratings or control data are missing', () => {
    const incompleteRequest: Partial<XBridgesMotorDriveRequest> = {
      motorType: 'BLDC'
      // Missing ratedVoltage, ratedPower, ratedSpeed, polePairs, controlType
    };

    const outcome = proposeXBridgesMotorDriveModel(incompleteRequest);
    expect(outcome.status).toBe('needs_clarification');
    if (outcome.status === 'needs_clarification') {
      expect(outcome.missingFields.length).toBeGreaterThan(0);
      expect(outcome.question).toBeDefined();
      expect(outcome.question.question).toMatch(/voltage|power|speed|pole/i);
    }
  });

  it('proves the proposal contains ONLY existing catalog blocks, required parameters, and port compatibility', () => {
    const outcome = proposeXBridgesMotorDriveModel(completeBldcRequest);

    expect(outcome.status).toBe('proposal_ready');
    if (outcome.status === 'proposal_ready') {
      expect(outcome.model.blocks.length).toBeGreaterThanOrEqual(4);
      for (const b of outcome.model.blocks) {
        expect(AdiaBlockCatalog.isExistingBlockId(b.catalogBlockId)).toBe(true);
        expect(Object.keys(b.parameters).length).toBeGreaterThan(0);
      }

      // Check port compatibility for all connections
      for (const conn of outcome.model.connections) {
        const fromB = outcome.model.blocks.find(b => b.instanceName === conn.fromBlock)!;
        const toB = outcome.model.blocks.find(b => b.instanceName === conn.toBlock)!;
        const check = validatePortCompatibility(
          fromB.catalogBlockId,
          conn.fromPort,
          toB.catalogBlockId,
          conn.toPort
        );
        expect(check.compatible).toBe(true);
      }
    }
  });

  it('maps proposal actions to typed action contract with exact block IDs, port IDs, parameters, and evidence', () => {
    const outcome = proposeXBridgesMotorDriveModel(completeBldcRequest);
    expect(outcome.status).toBe('proposal_ready');

    if (outcome.status === 'proposal_ready') {
      const actions = mapProposalToActions(outcome.model, 'proj-bldc-01', 'appr-bldc-01');

      expect(actions.length).toBeGreaterThanOrEqual(7);

      // Verify instantiate actions
      const instantiates = actions.filter(a => a.kind === 'instantiate_block');
      expect(instantiates.length).toBe(outcome.model.blocks.length);
      for (const inst of instantiates) {
        expect(inst.projectId).toBe('proj-bldc-01');
        expect(inst.approvalId).toBe('appr-bldc-01');
        expect(inst.blockIds.length).toBe(1);
        expect(AdiaBlockCatalog.isExistingBlockId(inst.blockIds[0])).toBe(true);
        expect(inst.expectedEvidence).toContain('instantiated');
      }

      // Verify configure actions
      const configs = actions.filter(a => a.kind === 'configure_parameters');
      expect(configs.length).toBeGreaterThanOrEqual(1);
      for (const cfg of configs) {
        expect(cfg.params.nodeId).toBeDefined();
        expect(cfg.params.parameters).toBeDefined();
      }

      // Verify connect actions
      const connects = actions.filter(a => a.kind === 'connect_ports');
      expect(connects.length).toBe(outcome.model.connections.length);
      for (const conn of connects) {
        expect(conn.params.sourceNode).toBeDefined();
        expect(conn.params.sourcePort).toBeDefined();
        expect(conn.params.targetNode).toBeDefined();
        expect(conn.params.targetPort).toBeDefined();
        expect(conn.expectedEvidence).toContain('Connection registered');
      }
    }
  });

  it('rejects any proposal mapping containing a block ID absent from the live catalog', () => {
    const invalidModel = {
      name: 'Invalid_Model',
      blocks: [
        {
          instanceName: 'FakeBlock',
          catalogBlockId: 'non_existent_bldc_quantum_driver',
          role: 'driver',
          parameters: {}
        }
      ],
      connections: []
    };

    expect(() => mapProposalToActions(invalidModel, 'proj-1', 'appr-1')).toThrow(
      /absent from live ADIA catalog/i
    );
  });

  it('rejects connection whose source/target ports are incompatible or do not exist', () => {
    // Port 'z' doesn't exist on resistor (which only has p, n)
    const check1 = validatePortCompatibility('resistor', 'z', 'capacitor', 'p');
    expect(check1.compatible).toBe(false);
    expect(check1.error).toMatch(/does not exist on source block/i);

    // Mismatched domains: Electrical resistor cannot directly connect to hydraulic pipe without converter
    const check2 = validatePortCompatibility('resistor', 'p', 'pipe', 'p');
    if (AdiaBlockCatalog.isExistingBlockId('pipe')) {
      expect(check2.compatible).toBe(false);
      expect(check2.error).toMatch(/incompatible domains/i);
    }
  });

  it('returns blocked with precise library-gap message when an essential block role has no catalog match', () => {
    const exoticRequest: XBridgesMotorDriveRequest = {
      ...completeBldcRequest,
      customInverterBlockId: 'non_existent_superconducting_inverter_9000'
    };

    const outcome = proposeXBridgesMotorDriveModel(exoticRequest);
    expect(outcome.status).toBe('blocked');
    if (outcome.status === 'blocked') {
      expect(outcome.gapMessage).toContain('non_existent_superconducting_inverter_9000');
      expect(outcome.gapMessage).toMatch(/cannot create new blocks/i);
    }
  });
});

describe('Air-Fryer Complete Vertical Workflow Package', () => {
  it('implements air-fryer specification requirements for heater, sensor, controller, fan, safety limits, modes, and acceptance criteria without guessed values', () => {
    let task = createTaskState('Design air fryer heating and control', 'air-fryer');
    task = recordAnswer(task, 'targetTemperature', '200°C');
    task = recordAnswer(task, 'powerRating', '1800W');
    task = recordAnswer(task, 'supplyVoltage', '230V AC');
    task = recordAnswer(task, 'temperatureSensor', 'NTC 100k');
    task = recordAnswer(task, 'controlMethod', 'PID temperature control');
    task = recordAnswer(task, 'safetyMaxTemperature', '240°C');
    task = recordAnswer(task, 'successCriteria', 'Heat to 200°C in < 4 minutes');
    task = recordAnswer(task, 'fan', 'High-velocity convection blower');
    task = recordAnswer(task, 'fanSpeed', '2800 RPM');
    task = recordAnswer(task, 'operatingModes', 'Preheat, AirFry, Roast, Dehydrate');

    // 1. Engineering Package verification
    const pkg = buildAirFryerEngineeringPackage(task);

    expect(pkg.heating.ratedPower).toBe('1800W');
    expect(pkg.heating.blockId).toBe('resistor');
    expect(AdiaBlockCatalog.isExistingBlockId(pkg.heating.blockId)).toBe(true);

    expect(pkg.sensing.sensorType).toBe('NTC 100k');
    expect(pkg.sensing.blockId).toBe('variable_resistor');
    expect(AdiaBlockCatalog.isExistingBlockId(pkg.sensing.blockId)).toBe(true);

    expect(pkg.control.algorithm).toBe('PID temperature control');
    expect(pkg.safety.cutoffTemperature).toBe('240°C');
    expect(pkg.fan?.motorType).toBe('High-velocity convection blower');
    expect(pkg.fan?.speedRpm).toBe(2800);
    expect(pkg.operatingModes).toEqual(['Preheat', 'AirFry', 'Roast', 'Dehydrate']);

    // 2. Formal Specification verification
    const spec = buildSpecification(task);
    expect(spec.requirements.some(r => r.sourceAnswerKey === 'powerRating' && r.value === '1800W')).toBe(true);
    expect(spec.requirements.some(r => r.sourceAnswerKey === 'temperatureSensor' && r.value === 'NTC 100k')).toBe(true);
    expect(spec.requirements.some(r => r.sourceAnswerKey === 'controlMethod' && r.value === 'PID temperature control')).toBe(true);
    expect(spec.requirements.some(r => r.sourceAnswerKey === 'fan' && r.value === 'High-velocity convection blower')).toBe(true);
    expect(spec.safetyLimits).toContain('240°C');
    expect(spec.successCriteria).toContain('Heat to 200°C in < 4 minutes');
    expect(spec.requirements.some(r => r.sourceAnswerKey === 'operatingModes')).toBe(true);
  });
});
