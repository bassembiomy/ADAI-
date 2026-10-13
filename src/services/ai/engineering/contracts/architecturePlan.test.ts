import { describe, it, expect } from 'vitest';
import {
  EngineeringArchitecturePlanSchema,
  validateArchitecturePlanIntegrity,
  EngineeringArchitecturePlan,
  InformationRequirementSchema
} from './architecturePlan';

describe('architecturePlan contracts', () => {
  const validPlan: EngineeringArchitecturePlan = {
    schemaVersion: '1.0.0',
    planId: 'arch.bldc_system.001',
    intentId: 'intent.create.bldc_speed_control',
    system: {
      name: 'BLDC Closed Loop Speed Drive',
      conceptId: 'concept.system.bldc_drive',
      description: 'Hierarchical BLDC motor drive architecture with speed control and inverter'
    },
    subsystems: [
      {
        id: 'sub.power',
        name: 'Power Stage Subsystem',
        conceptId: 'concept.electrical.power_stage',
        functionalRoles: ['power_conversion'],
        description: 'Converts DC link voltage to three-phase AC'
      },
      {
        id: 'sub.control',
        name: 'Control Subsystem',
        conceptId: 'concept.control.motor_controller',
        functionalRoles: ['feedback_control', 'modulation'],
        description: 'Calculates commutation and PWM duty cycles'
      },
      {
        id: 'sub.plant',
        name: 'Plant Subsystem',
        conceptId: 'concept.electromechanical.plant',
        functionalRoles: ['actuation', 'mechanical_load']
      }
    ],
    components: [
      {
        id: 'comp.inverter',
        name: 'Three-Phase Inverter',
        conceptId: 'concept.electrical.three_phase_inverter',
        subsystemId: 'sub.power',
        role: 'actuator',
        designParameters: { topology: 'six_switch_bridge' }
      },
      {
        id: 'comp.bldc',
        name: 'BLDC Motor',
        conceptId: 'concept.electromechanical.bldc_motor',
        subsystemId: 'sub.plant',
        role: 'plant',
        designParameters: { polePairs: 4 }
      },
      {
        id: 'comp.speed_reg',
        name: 'Speed PI Controller',
        conceptId: 'concept.control.pi_controller',
        subsystemId: 'sub.control',
        role: 'controller',
        designParameters: { kp: 1.2, ki: 0.05 }
      }
    ],
    connections: [
      {
        id: 'conn.pi_to_inverter',
        fromComponentId: 'comp.speed_reg',
        fromPort: 'control_effort',
        toComponentId: 'comp.inverter',
        toPort: 'duty_ref',
        semanticType: 'control_signal',
        domain: 'control'
      },
      {
        id: 'conn.inverter_to_motor',
        fromComponentId: 'comp.inverter',
        fromPort: 'phase_abc',
        toComponentId: 'comp.bldc',
        toPort: 'phase_abc',
        semanticType: 'three_phase_power',
        domain: 'electrical'
      }
    ],
    designDecisions: [
      {
        id: 'dec.commutation_method',
        title: 'Commutation Method',
        selectedAlternative: 'six_step',
        consideredAlternatives: ['six_step', 'foc'],
        rationale: 'Six-step chosen for baseline Hall-based trapezoidal control',
        affectedComponents: ['comp.speed_reg', 'comp.inverter']
      }
    ],
    informationRequirements: [
      {
        id: 'slot.dc_voltage',
        slotName: 'DC Bus Voltage',
        classification: 'REQUIRED',
        reason: 'Required to size power bridge and motor back-EMF limit',
        affectedDecisions: ['dec.commutation_method'],
        candidateValues: [12, 24, 48],
        resolutionState: 'resolved',
        resolvedValue: 24,
        valueSchema: 'number'
      },
      {
        id: 'slot.pwm_freq',
        slotName: 'PWM Carrier Frequency',
        classification: 'DEFAULTABLE',
        reason: 'Default 20kHz is standard for acoustic and ripple performance',
        affectedDecisions: [],
        candidateValues: [10000, 20000],
        defaultProvenance: 'standard_industrial_practice',
        resolutionState: 'defaulted',
        resolvedValue: 20000,
        valueSchema: 'number'
      }
    ],
    assumptions: [
      {
        id: 'asm.constant_temp',
        statement: 'Operating winding temperature assumed constant at 25C',
        source: 'domain_convention'
      }
    ],
    knowledgeEvidence: [
      {
        conceptId: 'concept.electromechanical.bldc_motor',
        factIds: ['fact.bldc.back_emf_trapezoidal'],
        confidence: 0.98,
        citation: 'Standard BLDC Drive Dynamics'
      }
    ],
    capabilityAssessment: {
      feasible: true,
      coveredConceptIds: [
        'concept.electrical.three_phase_inverter',
        'concept.electromechanical.bldc_motor',
        'concept.control.pi_controller'
      ],
      unsupportedConceptIds: [],
      candidateBlockIds: ['xbridges_bldc_motor_v1'], // only permitted in capability assessment!
      notes: 'All core concepts map to available catalog blocks'
    },
    rationale: 'Clean hierarchical decomposition separating power, plant, and control'
  };

  it('validates a complete hierarchical architecture plan', () => {
    const parsed = EngineeringArchitecturePlanSchema.parse(validPlan);
    expect(parsed.subsystems).toHaveLength(3);
    const integrity = validateArchitecturePlanIntegrity(parsed);
    expect(integrity.valid).toBe(true);
    expect(integrity.errors).toHaveLength(0);
  });

  describe('Integrity & Invariant checks', () => {
    it('detects dangling component subsystem references', () => {
      const broken = {
        ...validPlan,
        components: [
          {
            ...validPlan.components[0],
            subsystemId: 'sub.non_existent'
          }
        ]
      };
      const integrity = validateArchitecturePlanIntegrity(broken);
      expect(integrity.valid).toBe(false);
      expect(integrity.errors.some((e) => e.includes('sub.non_existent'))).toBe(true);
    });

    it('detects dangling connection component references', () => {
      const broken = {
        ...validPlan,
        connections: [
          {
            ...validPlan.connections[0],
            fromComponentId: 'comp.ghost'
          }
        ]
      };
      const integrity = validateArchitecturePlanIntegrity(broken);
      expect(integrity.valid).toBe(false);
      expect(integrity.errors.some((e) => e.includes('comp.ghost'))).toBe(true);
    });

    it('rejects ADIA catalog block IDs inside semantic components/subsystems', () => {
      const broken = {
        ...validPlan,
        components: [
          {
            ...validPlan.components[0],
            conceptId: 'xbridges_bldc_block' // Prohibited: catalog ID in conceptId
          }
        ]
      };
      const integrity = validateArchitecturePlanIntegrity(broken);
      expect(integrity.valid).toBe(false);
      expect(integrity.errors.some((e) => e.toLowerCase().includes('catalog block id'))).toBe(true);
    });

    it('rejects REQUIRED information slot marked resolved without a resolvedValue', () => {
      const broken = {
        ...validPlan,
        informationRequirements: [
          {
            id: 'slot.bad',
            slotName: 'Supply Voltage',
            classification: 'REQUIRED' as const,
            reason: 'Mandatory',
            affectedDecisions: [],
            candidateValues: [],
            resolutionState: 'resolved' as const,
            resolvedValue: undefined // Contradiction!
          }
        ]
      };
      expect(() => EngineeringArchitecturePlanSchema.parse(broken)).toThrow();
    });

    it('rejects UNRESOLVED slot that has resolvedValue populated', () => {
      const broken = {
        id: 'slot.bad',
        slotName: 'Supply Voltage',
        classification: 'REQUIRED' as const,
        reason: 'Mandatory',
        affectedDecisions: [],
        candidateValues: [],
        resolutionState: 'unresolved' as const,
        resolvedValue: 48 // Contradiction!
      };
      expect(() => InformationRequirementSchema.parse(broken)).toThrow();
    });
  });
});
