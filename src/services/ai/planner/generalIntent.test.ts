import { describe, it, expect } from 'vitest';
import {
  parseGeneralEngineeringRequest,
  normalizeEngineeringUnits,
  type GeneralEngineeringRequest,
  type XbridgesIntent,
} from './generalIntent';

describe('generalIntent (LLM Intent & Requirement Extraction)', () => {
  it('extracts all six canonical intents cleanly from structured LLM outputs', () => {
    const intents: XbridgesIntent[] = ['create', 'inspect', 'modify', 'diagnose', 'repair', 'optimize'];
    for (const intent of intents) {
      const parsed = parseGeneralEngineeringRequest({
        intent,
        objective: `${intent} high-performance closed-loop motor drive`,
        targetBehaviors: ['stable regulation', 'low ripple'],
        inputs: [{ name: 'Vdc', value: 400, unit: 'V' }],
        outputs: [{ name: 'speed', value: 1500, unit: 'rpm' }],
        constraints: [{ name: 'max_current', type: 'max', target: 'I_phase', value: 20, unit: 'A' }],
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.intent).toBe(intent);
        expect(parsed.data.objective).toContain(intent);
      }
    }
  });

  it('handles malformed Ollama JSON without crashing and returns structured error', () => {
    const malformedPayloads = [
      null,
      undefined,
      'not json string',
      { intent: 'invalid_unsupported_intent' },
      { intent: 'create', objective: 12345 }, // invalid type
      { intent: 'create', objective: 'Build inverter', inputs: 'should be an array' },
    ];

    for (const bad of malformedPayloads) {
      const parsed = parseGeneralEngineeringRequest(bad);
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error).toBeDefined();
        expect(parsed.error.length).toBeGreaterThan(0);
      }
    }
  });

  it('normalizes engineering units and standardizes unit aliases deterministically', () => {
    expect(normalizeEngineeringUnits('kHz')).toBe('kHz');
    expect(normalizeEngineeringUnits('KHZ')).toBe('kHz');
    expect(normalizeEngineeringUnits('volts')).toBe('V');
    expect(normalizeEngineeringUnits('Vdc')).toBe('V');
    expect(normalizeEngineeringUnits('amps')).toBe('A');
    expect(normalizeEngineeringUnits('amperes')).toBe('A');
    expect(normalizeEngineeringUnits('rpm')).toBe('rpm');
    expect(normalizeEngineeringUnits('RPM')).toBe('rpm');
    expect(normalizeEngineeringUnits('degC')).toBe('°C');
    expect(normalizeEngineeringUnits('celsius')).toBe('°C');
  });

  it('preserves user source text for audit without using raw text as block ID', () => {
    const parsed = parseGeneralEngineeringRequest({
      intent: 'create',
      objective: 'Please make a super fancy inverter for me!',
      targetBehaviors: ['inversion'],
      inputs: [{ name: 'dc_rail', value: 48, unit: 'V', sourceText: '48V DC battery supply' }],
      outputs: [],
      constraints: [],
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.inputs[0].sourceText).toBe('48V DC battery supply');
      // Must not allow arbitrary raw string to be block identifier
      expect(parsed.data.inputs[0].name).toBe('dc_rail');
    }
  });
});
