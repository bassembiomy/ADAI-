import { describe, it, expect } from 'vitest';
import {
  EngineeringIntentSchema,
  EngineeringIntent,
  IntentKindEnum
} from './semanticIntent';

describe('semanticIntent contracts', () => {
  it('validates all intent kinds', () => {
    const kinds = ['create', 'modify', 'inspect', 'validate', 'simulate', 'optimize'];
    for (const kind of kinds) {
      expect(IntentKindEnum.safeParse(kind).success).toBe(true);
    }
  });

  it('validates an arithmetic create intent without block IDs', () => {
    const intent: EngineeringIntent = {
      schemaVersion: '1.0.0',
      id: 'intent.create.add_two_numbers',
      intent: 'create',
      objective: 'Add two numeric values 12.5 and 4.2 with sum output',
      domainCandidates: ['arithmetic', 'signal'],
      systemConceptIds: ['concept.math.addition'],
      operations: [
        {
          type: 'add',
          parameters: { operand1: 12.5, operand2: 4.2 },
          targetConceptId: 'concept.math.addition'
        }
      ],
      controlledVariables: [],
      actuators: [],
      plants: [],
      sensors: [],
      inputs: ['12.5', '4.2'],
      outputs: ['sum'],
      constraints: ['exact numerical addition'],
      requestedFidelity: 'symbolic',
      references: [],
      confidence: 1.0,
      unknownTerms: [],
      unresolvedReferences: [],
      evidence: [
        { sourceId: 'user_prompt', description: 'Explicit arithmetic expression provided' }
      ]
    };

    const parsed = EngineeringIntentSchema.parse(intent);
    expect(parsed.intent).toBe('create');
    expect(parsed.systemConceptIds).toContain('concept.math.addition');
    // Ensure no block ID was invented
    expect(JSON.stringify(parsed)).not.toContain('xbridges_');
  });

  it('validates a BLDC speed control intent with functional roles', () => {
    const intent: EngineeringIntent = {
      schemaVersion: '1.0.0',
      id: 'intent.create.bldc_speed_control',
      intent: 'create',
      objective: 'Design closed loop speed control for a 24V BLDC motor with Hall feedback',
      domainCandidates: ['electromechanical', 'control'],
      systemConceptIds: [
        'concept.electromechanical.bldc_motor',
        'concept.control.speed_controller',
        'concept.electrical.three_phase_inverter',
        'concept.sensing.hall_sensors'
      ],
      operations: [],
      controlledVariables: ['rotor_speed'],
      actuators: ['concept.electrical.three_phase_inverter'],
      plants: ['concept.electromechanical.bldc_motor'],
      sensors: ['concept.sensing.hall_sensors'],
      inputs: ['speed_setpoint', 'dc_bus_voltage'],
      outputs: ['actual_speed', 'stator_currents'],
      constraints: ['dc_voltage == 24V', 'speed_ripple <= 2%'],
      requestedFidelity: 'dynamic',
      references: ['it', 'bldc motor'],
      confidence: 0.95,
      unknownTerms: [],
      unresolvedReferences: [],
      evidence: [
        { sourceId: 'user_prompt', description: 'User requested 24V BLDC speed control loop' }
      ]
    };

    const parsed = EngineeringIntentSchema.parse(intent);
    expect(parsed.plants).toContain('concept.electromechanical.bldc_motor');
    expect(parsed.sensors).toContain('concept.sensing.hall_sensors');
  });

  describe('Negative validation', () => {
    it('rejects invalid confidence and forbidden fields', () => {
      const invalid = {
        schemaVersion: '1.0.0',
        id: 'intent.test',
        intent: 'create',
        objective: 'test',
        domainCandidates: [],
        systemConceptIds: [],
        operations: [],
        controlledVariables: [],
        actuators: [],
        plants: [],
        sensors: [],
        inputs: [],
        outputs: [],
        constraints: [],
        requestedFidelity: 'dynamic',
        references: [],
        confidence: -0.5, // invalid
        unknownTerms: [],
        unresolvedReferences: [],
        evidence: [],
        forbiddenExtra: 'not_allowed'
      };
      expect(() => EngineeringIntentSchema.parse(invalid)).toThrow();
    });
  });
});
