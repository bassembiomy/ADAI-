import { describe, it, expect } from 'vitest';
import {
  EngineeringModelIRSchema,
  validateModelIrIntegrity,
  EngineeringModelIR,
  BoundEngineeringModelIRSchema
} from './modelIr';

describe('modelIr contracts', () => {
  const validIR: EngineeringModelIR = {
    schemaVersion: '1.0.0',
    modelId: 'ir.model.bldc_drive.001',
    name: 'BLDC Velocity Servo Model IR',
    targetDomain: 'xbridges',
    baseRevision: 0,
    subsystems: [
      { id: 'sub.power', name: 'Power Stage' },
      { id: 'sub.plant', name: 'Motor Plant' }
    ],
    components: [
      {
        id: 'comp.inverter',
        name: 'Inverter Bridge',
        conceptId: 'concept.electrical.three_phase_inverter',
        subsystemId: 'sub.power',
        parameters: [
          {
            name: 'v_dc',
            value: 24.0,
            unit: 'V',
            source: 'user',
            confidence: 1.0,
            resolutionState: 'resolved'
          }
        ]
      },
      {
        id: 'comp.motor',
        name: 'BLDC Machine',
        conceptId: 'concept.electromechanical.bldc_motor',
        subsystemId: 'sub.plant',
        parameters: [
          {
            name: 'resistance',
            value: 0.45,
            unit: 'ohm',
            source: 'catalog',
            confidence: 0.95,
            resolutionState: 'resolved'
          }
        ]
      }
    ],
    ports: [
      {
        id: 'port.inverter.out',
        componentId: 'comp.inverter',
        name: 'ac_out',
        direction: 'out',
        domain: 'electrical',
        dataType: 'three_phase_voltage',
        unit: 'V'
      },
      {
        id: 'port.motor.in',
        componentId: 'comp.motor',
        name: 'ac_in',
        direction: 'in',
        domain: 'electrical',
        dataType: 'three_phase_voltage',
        unit: 'V'
      }
    ],
    connections: [
      {
        id: 'conn.inv_to_mot',
        fromPortId: 'port.inverter.out',
        toPortId: 'port.motor.in',
        semanticType: 'power_bus'
      }
    ],
    assumptions: ['Ideal switching without deadtime'],
    unresolvedParameters: [],
    validationRules: [
      {
        ruleId: 'rule.voltage_match',
        description: 'Inverter output voltage must match motor voltage rating',
        severity: 'error'
      }
    ],
    traceLinks: [
      {
        irEntityId: 'comp.inverter',
        architectureElementId: 'comp.inverter',
        rationale: 'Direct trace from architecture plan'
      }
    ],
    rationale: 'Validated dynamic Model IR before capability compilation'
  };

  it('validates a complete unbound EngineeringModelIR', () => {
    const parsed = EngineeringModelIRSchema.parse(validIR);
    expect(parsed.modelId).toBe('ir.model.bldc_drive.001');
    const integrity = validateModelIrIntegrity(parsed);
    expect(integrity.valid).toBe(true);
    expect(integrity.errors).toHaveLength(0);
  });

  it('validates BoundEngineeringModelIR with deterministic capability bindings', () => {
    const boundIR = {
      ...validIR,
      components: [
        {
          ...validIR.components[0],
          capabilityBinding: {
            catalogBlockId: 'xbridges_inverter_three_phase_v1',
            catalogBlockType: 'ThreePhaseInverter',
            parameterMapping: { v_dc: 'Vdc' },
            portMapping: { ac_out: 'phases_abc' }
          }
        },
        {
          ...validIR.components[1],
          capabilityBinding: {
            catalogBlockId: 'xbridges_bldc_motor_v1',
            catalogBlockType: 'BldcMotor',
            parameterMapping: { resistance: 'Rs' },
            portMapping: { ac_in: 'terminals_abc' }
          }
        }
      ]
    };

    const parsed = BoundEngineeringModelIRSchema.parse(boundIR);
    expect(parsed.components[0].capabilityBinding?.catalogBlockId).toBe('xbridges_inverter_three_phase_v1');
    expect(parsed.components[1].capabilityBinding?.catalogBlockId).toBe('xbridges_bldc_motor_v1');
  });

  describe('Integrity & Invariant checks', () => {
    it('detects dangling port component references', () => {
      const broken = {
        ...validIR,
        ports: [
          {
            ...validIR.ports[0],
            componentId: 'comp.non_existent'
          },
          validIR.ports[1]
        ]
      };
      const integrity = validateModelIrIntegrity(broken);
      expect(integrity.valid).toBe(false);
      expect(integrity.errors.some((e) => e.includes('comp.non_existent'))).toBe(true);
    });

    it('detects dangling connection port references', () => {
      const broken = {
        ...validIR,
        connections: [
          {
            ...validIR.connections[0],
            toPortId: 'port.ghost'
          }
        ]
      };
      const integrity = validateModelIrIntegrity(broken);
      expect(integrity.valid).toBe(false);
      expect(integrity.errors.some((e) => e.includes('port.ghost'))).toBe(true);
    });

    it('rejects parameter with invalid confidence or unknown fields', () => {
      const broken = {
        ...validIR,
        components: [
          {
            ...validIR.components[0],
            parameters: [
              {
                name: 'bad_param',
                value: 10,
                confidence: 2.5, // invalid
                resolutionState: 'resolved' as const,
                source: 'user' as const
              }
            ]
          }
        ]
      };
      expect(() => EngineeringModelIRSchema.parse(broken)).toThrow();
    });

    it('rejects unresolved parameter marked as resolved', () => {
      const broken = {
        ...validIR,
        components: [
          {
            ...validIR.components[0],
            parameters: [
              {
                name: 'unresolved_marked_resolved',
                value: undefined,
                confidence: 0.5,
                resolutionState: 'resolved' as const,
                source: 'user' as const
              }
            ]
          }
        ]
      };
      expect(() => EngineeringModelIRSchema.parse(broken)).toThrow();
    });
  });
});
