import { describe, it, expect } from 'vitest';
import { ModelIrBuilder } from './modelIrBuilder';
import { validateModelIr } from './modelIrValidator';
import { diffModelIr, applyModelIrDiff, ModelIrDiff } from './modelIrDiff';
import { EngineeringArchitecturePlan } from '../contracts/architecturePlan';
import { EngineeringModelIR } from '../contracts/modelIr';

describe('ModelIrBuilder', () => {
  const builder = new ModelIrBuilder();

  const mockPlan: EngineeringArchitecturePlan = {
    schemaVersion: '1.0.0',
    planId: 'plan_bldc_1',
    intentId: 'intent_bldc_1',
    system: {
      name: 'BLDC Drive System',
      conceptId: 'concept_bldc_drive',
      description: 'Brushless DC Motor Drive'
    },
    subsystems: [
      {
        id: 'sub_power',
        name: 'Power Stage',
        conceptId: 'concept_power_stage',
        functionalRoles: ['power']
      },
      {
        id: 'sub_control',
        name: 'Control Subsystem',
        conceptId: 'concept_controller',
        functionalRoles: ['control']
      },
      {
        id: 'sub_sensing',
        name: 'Sensing Subsystem',
        conceptId: 'concept_sensor_suite',
        functionalRoles: ['sensing']
      },
      {
        id: 'sub_plant',
        name: 'Plant Subsystem',
        conceptId: 'concept_motor_plant',
        functionalRoles: ['plant']
      }
    ],
    components: [
      {
        id: 'comp_inverter',
        name: '3-Phase Inverter',
        conceptId: 'concept_inverter',
        subsystemId: 'sub_power',
        role: 'actuator',
        designParameters: { dc_bus_voltage: 24 }
      },
      {
        id: 'comp_controller',
        name: 'Speed Controller',
        conceptId: 'concept_speed_controller',
        subsystemId: 'sub_control',
        role: 'controller',
        designParameters: { kp: 1.5, ki: 0.2 }
      },
      {
        id: 'comp_sensor',
        name: 'Hall Effect Sensor',
        conceptId: 'concept_hall_sensor',
        subsystemId: 'sub_sensing',
        role: 'sensor',
        designParameters: {}
      },
      {
        id: 'comp_motor',
        name: 'BLDC Motor',
        conceptId: 'concept_bldc_motor',
        subsystemId: 'sub_plant',
        role: 'plant',
        designParameters: { pole_pairs: 4 }
      }
    ],
    connections: [
      {
        id: 'conn_ctrl_inv',
        fromComponentId: 'comp_controller',
        fromPort: 'pwm_signals',
        toComponentId: 'comp_inverter',
        toPort: 'gate_in',
        semanticType: 'control_signal'
      },
      {
        id: 'conn_sensor_ctrl',
        fromComponentId: 'comp_sensor',
        fromPort: 'rotor_pos',
        toComponentId: 'comp_controller',
        toPort: 'pos_feedback',
        semanticType: 'feedback'
      }
    ],
    designDecisions: [
      {
        id: 'dec_commutation',
        title: 'Motor Commutation Strategy',
        selectedAlternative: 'foc',
        consideredAlternatives: ['foc', 'six_step'],
        rationale: 'FOC provides smoother torque.',
        affectedComponents: ['comp_controller', 'comp_inverter']
      }
    ],
    informationRequirements: [
      {
        id: 'slot_dc_voltage',
        slotName: 'dc_bus_voltage',
        classification: 'DEFAULTABLE',
        reason: 'DC bus voltage',
        affectedDecisions: [],
        candidateValues: [24, 48],
        resolutionState: 'resolved',
        resolvedValue: 24,
        valueSchema: 'number'
      }
    ],
    assumptions: [
      {
        id: 'assump_1',
        statement: 'Balanced 3-phase winding',
        source: 'domain_convention'
      }
    ],
    knowledgeEvidence: [],
    capabilityAssessment: {
      feasible: true,
      coveredConceptIds: [],
      unsupportedConceptIds: []
    },
    rationale: 'BLDC architecture with FOC'
  };

  it('builds Model IR with subsystems, components, ports, connections, and trace links', () => {
    const ir = builder.buildModelIr(mockPlan, 'model_bldc_001', 1);

    expect(ir.modelId).toBe('model_bldc_001');
    expect(ir.baseRevision).toBe(1);
    expect(ir.subsystems).toHaveLength(4);
    expect(ir.components).toHaveLength(4);
    expect(ir.connections).toHaveLength(2);
    expect(ir.traceLinks.length).toBeGreaterThan(0);

    // Verify trace links point to components and subsystems
    expect(ir.traceLinks.some(t => t.architectureElementId === 'comp_inverter')).toBe(true);
    expect(ir.traceLinks.some(t => t.architectureElementId === 'sub_power')).toBe(true);
  });
});

describe('ModelIrValidator', () => {
  it('validates a correct Model IR without errors', () => {
    const builder = new ModelIrBuilder();
    const plan: EngineeringArchitecturePlan = {
      schemaVersion: '1.0.0',
      planId: 'p1',
      intentId: 'i1',
      system: { name: 'S', conceptId: 'c1', description: '' },
      subsystems: [{ id: 'sub1', name: 'Sub1', conceptId: 'c_sub', functionalRoles: ['calc'] }],
      components: [
        {
          id: 'c1',
          name: 'Comp1',
          conceptId: 'c_concept',
          subsystemId: 'sub1',
          role: 'calc',
          designParameters: { val: 10 }
        }
      ],
      connections: [],
      designDecisions: [],
      informationRequirements: [],
      assumptions: [],
      knowledgeEvidence: [],
      capabilityAssessment: { feasible: true, coveredConceptIds: [], unsupportedConceptIds: [] },
      rationale: ''
    };

    const ir = builder.buildModelIr(plan, 'm1', 0);
    const report = validateModelIr(ir);
    expect(report.valid).toBe(true);
    expect(report.errors).toHaveLength(0);
  });

  it('detects unresolved required parameters and dangling connection ports', () => {
    const badIr: EngineeringModelIR = {
      schemaVersion: '1.0.0',
      modelId: 'bad_model',
      name: 'Bad Model',
      targetDomain: 'electrical',
      baseRevision: 0,
      subsystems: [{ id: 'sub1', name: 'Sub 1' }],
      components: [
        {
          id: 'c1',
          name: 'C1',
          conceptId: 'concept_foo',
          subsystemId: 'sub1',
          parameters: [
            {
              name: 'unresolved_resistance',
              source: 'user',
              confidence: 0,
              resolutionState: 'unresolved'
            }
          ]
        }
      ],
      ports: [
        {
          id: 'p1',
          componentId: 'c1',
          name: 'out1',
          direction: 'out',
          domain: 'electrical',
          dataType: 'voltage'
        }
      ],
      connections: [
        {
          id: 'conn1',
          fromPortId: 'p1',
          toPortId: 'p_non_existent', // Dangling port!
          semanticType: 'signal'
        }
      ],
      assumptions: [],
      unresolvedParameters: ['unresolved_resistance'],
      validationRules: [],
      traceLinks: [],
      rationale: 'Faulty test IR'
    };

    const report = validateModelIr(badIr);
    expect(report.valid).toBe(false);
    expect(report.errors.some(e => e.includes('unresolved_resistance'))).toBe(true);
    expect(report.errors.some(e => e.includes('p_non_existent'))).toBe(true);
  });
});

describe('ModelIrDiff', () => {
  it('computes localized diff for "make it sensorless" modification without rebuilding whole project', () => {
    const builder = new ModelIrBuilder();

    // Base: BLDC with Hall effect sensor
    const basePlan: EngineeringArchitecturePlan = {
      schemaVersion: '1.0.0',
      planId: 'plan_bldc_sensored',
      intentId: 'intent_1',
      system: { name: 'BLDC', conceptId: 'concept_bldc_drive', description: '' },
      subsystems: [
        { id: 'sub_power', name: 'Power', conceptId: 'cp', functionalRoles: ['power'] },
        { id: 'sub_control', name: 'Control', conceptId: 'cc', functionalRoles: ['control'] },
        { id: 'sub_sensing', name: 'Sensing', conceptId: 'cs', functionalRoles: ['sensing'] },
        { id: 'sub_plant', name: 'Plant', conceptId: 'cpl', functionalRoles: ['plant'] }
      ],
      components: [
        { id: 'comp_inv', name: 'Inverter', conceptId: 'concept_inverter', subsystemId: 'sub_power', role: 'actuator', designParameters: {} },
        { id: 'comp_ctrl', name: 'Controller', conceptId: 'concept_speed_controller', subsystemId: 'sub_control', role: 'controller', designParameters: { mode: 'sensored' } },
        { id: 'comp_hall', name: 'Hall Sensor', conceptId: 'concept_hall_sensor', subsystemId: 'sub_sensing', role: 'sensor', designParameters: {} },
        { id: 'comp_motor', name: 'Motor', conceptId: 'concept_bldc_motor', subsystemId: 'sub_plant', role: 'plant', designParameters: {} }
      ],
      connections: [
        { id: 'c_hall_ctrl', fromComponentId: 'comp_hall', fromPort: 'pos', toComponentId: 'comp_ctrl', toPort: 'sensor_in', semanticType: 'feedback' }
      ],
      designDecisions: [],
      informationRequirements: [],
      assumptions: [],
      knowledgeEvidence: [],
      capabilityAssessment: { feasible: true, coveredConceptIds: [], unsupportedConceptIds: [] },
      rationale: ''
    };

    const baseIr = builder.buildModelIr(basePlan, 'model_bldc', 1);

    // Modified: Replace Hall sensor with back-EMF sliding mode observer in Sensing Subsystem
    const modifiedPlan: EngineeringArchitecturePlan = {
      ...basePlan,
      components: [
        { id: 'comp_inv', name: 'Inverter', conceptId: 'concept_inverter', subsystemId: 'sub_power', role: 'actuator', designParameters: {} },
        { id: 'comp_ctrl', name: 'Controller', conceptId: 'concept_speed_controller', subsystemId: 'sub_control', role: 'controller', designParameters: { mode: 'sensorless' } },
        { id: 'comp_smo', name: 'Sliding Mode Observer', conceptId: 'concept_bldc_observer', subsystemId: 'sub_sensing', role: 'sensor', designParameters: {} },
        { id: 'comp_motor', name: 'Motor', conceptId: 'concept_bldc_motor', subsystemId: 'sub_plant', role: 'plant', designParameters: {} }
      ],
      connections: [
        { id: 'c_smo_ctrl', fromComponentId: 'comp_smo', fromPort: 'estimated_pos', toComponentId: 'comp_ctrl', toPort: 'sensor_in', semanticType: 'feedback' }
      ]
    };

    const modifiedIr = builder.buildModelIr(modifiedPlan, 'model_bldc', 2);

    const diff = diffModelIr(baseIr, modifiedIr);

    // Subsystems untouched:
    expect(diff.addedSubsystems).toHaveLength(0);
    expect(diff.removedSubsystems).toHaveLength(0);

    // Only sensing and control components affected:
    expect(diff.removedComponents.map(c => c.id)).toContain('comp_hall');
    expect(diff.addedComponents.map(c => c.id)).toContain('comp_smo');
    expect(diff.modifiedComponents.map(c => c.id)).toContain('comp_ctrl');

    // Inverter and motor untouched:
    expect(diff.unchangedComponentIds).toContain('comp_inv');
    expect(diff.unchangedComponentIds).toContain('comp_motor');

    // Applying diff to baseIr produces modifiedIr:
    const patchedIr = applyModelIrDiff(baseIr, diff);
    expect(patchedIr.components.some(c => c.id === 'comp_smo')).toBe(true);
    expect(patchedIr.components.some(c => c.id === 'comp_hall')).toBe(false);
  });
});
