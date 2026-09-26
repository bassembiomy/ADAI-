import { describe, it, expect } from 'vitest';
import { EngineeringIntentInterpreter } from './engineeringIntentInterpreter';
import { EngineeringIntentSchema } from '../contracts/semanticIntent';

describe('EngineeringIntentInterpreter', () => {
  const interpreter = new EngineeringIntentInterpreter();

  it('interprets arithmetic addition into semantic intent with operands and sum output without blocks', async () => {
    const result = await interpreter.interpret('Add 15.5 and 4.5');

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      const parsed = EngineeringIntentSchema.parse(result.intent);
      expect(parsed.intent).toBe('create');
      expect(parsed.systemConceptIds).toContain('concept.math.addition');
      expect(parsed.inputs).toContain('15.5');
      expect(parsed.inputs).toContain('4.5');
      expect(parsed.outputs).toContain('sum');
      expect(parsed.operations).toHaveLength(1);
      expect(parsed.operations[0].type).toBe('add');
      expect(parsed.operations[0].parameters).toEqual({ operand1: 15.5, operand2: 4.5 });

      // Verifies no block ID was selected
      expect(JSON.stringify(parsed)).not.toContain('xbridges_');
      expect(JSON.stringify(parsed)).not.toContain('block_');
    }
  });

  it('interprets BLDC speed control into plants, actuators, sensors, and concepts without blocks', async () => {
    const result = await interpreter.interpret(
      'Design closed-loop speed control for a 24V BLDC motor with Hall sensors'
    );

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      const intent = result.intent;
      expect(intent.intent).toBe('create');
      expect(intent.plants).toContain('concept.electromechanical.bldc_motor');
      expect(intent.actuators).toContain('concept.electrical.three_phase_inverter');
      expect(intent.sensors).toContain('concept.sensing.hall_sensors');
      expect(intent.controlledVariables).toContain('speed');
      expect(intent.systemConceptIds).toContain('concept.electromechanical.bldc_motor');
      expect(intent.systemConceptIds).toContain('concept.control.speed_controller');

      // Crucial: no block IDs selected
      expect(JSON.stringify(intent)).not.toContain('xbridges_');
      expect(JSON.stringify(intent)).not.toContain('block_');
    }
  });

  it('preserves unknown terms without inventing parameters', async () => {
    const result = await interpreter.interpret(
      'Control the flux of an exotic hyper-relativistic drive with 500 lumens'
    );

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.intent.unknownTerms.length).toBeGreaterThan(0);
      expect(result.intent.unknownTerms.some((t: string) => t.includes('hyper-relativistic'))).toBe(true);
    }
  });

  it('does not default missing operands to zero when operands are absent', async () => {
    const result = await interpreter.interpret('Create a model adding two numbers');
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      const op = result.intent.operations[0];
      expect(op.parameters).toEqual({});
      expect(result.structuredRequest).toBeDefined();
      expect(result.structuredRequest?.values).toHaveLength(0);
    }
  });
});

