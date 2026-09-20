import { describe, it, expect } from 'vitest';
import { parseEngineeringEntities } from './engineeringEntityParser';

describe('EngineeringEntityParser', () => {
  it('parses metric engineering prefixes and units correctly', () => {
    const text = 'create RLC circuit with R=100 ohm, L=10mH and C=100uF';
    const parsed = parseEngineeringEntities(text);

    expect(parsed.resistance).toBe(100);
    expect(parsed.inductance).toBeCloseTo(0.01);
    expect(parsed.capacitance).toBeCloseTo(0.0001);
  });

  it('parses frequency and damping entities', () => {
    const text = 'lowpass filter cutoff 50kHz with gain 2.5 and zeta=0.707';
    const parsed = parseEngineeringEntities(text);

    expect(parsed.frequency).toBe(50000);
    expect(parsed.gain).toBe(2.5);
    expect(parsed.dampingRatio).toBe(0.707);
  });

  it('handles micro with µ symbol and nano / pico units', () => {
    const text = 'C = 47µF, L = 500nH, R = 2.2k';
    const parsed = parseEngineeringEntities(text);

    expect(parsed.capacitance).toBeCloseTo(0.000047);
    expect(parsed.inductance).toBeCloseTo(0.0000005);
    expect(parsed.resistance).toBe(2200);
  });

  it('parses PID gains and setpoints', () => {
    const text = 'closed loop PID with Kp=2.5, Ki=0.8, Kd=0.05 and setpoint=120';
    const parsed = parseEngineeringEntities(text);

    expect(parsed.kp).toBe(2.5);
    expect(parsed.ki).toBe(0.8);
    expect(parsed.kd).toBe(0.05);
    expect(parsed.setpoint).toBe(120);
  });

  it('returns empty object when no entities are matched', () => {
    const text = 'just inspect model';
    const parsed = parseEngineeringEntities(text);

    expect(Object.keys(parsed).length).toBe(0);
  });
});
