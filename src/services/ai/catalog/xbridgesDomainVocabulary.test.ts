import { describe, it, expect } from 'vitest';
import {
  resolveDomainOperation,
  resolveDomainKeywords,
  XBRIDGES_DOMAIN_VOCABULARY,
} from './xbridgesDomainVocabulary';
import { buildXbridgesCapabilityIndex } from './xbridgesCapabilityIndex';

describe('X-Bridges Domain Vocabulary & Operation Resolver', () => {
  const catalog = buildXbridgesCapabilityIndex();

  it('contains vocabulary definitions across all 12 core domains', () => {
    expect(Object.keys(XBRIDGES_DOMAIN_VOCABULARY).length).toBeGreaterThanOrEqual(10);
    expect(XBRIDGES_DOMAIN_VOCABULARY['arithmetic']).toBeDefined();
    expect(XBRIDGES_DOMAIN_VOCABULARY['sources']).toBeDefined();
    expect(XBRIDGES_DOMAIN_VOCABULARY['continuous']).toBeDefined();
    expect(XBRIDGES_DOMAIN_VOCABULARY['control']).toBeDefined();
    expect(XBRIDGES_DOMAIN_VOCABULARY['logic']).toBeDefined();
    expect(XBRIDGES_DOMAIN_VOCABULARY['power']).toBeDefined();
    expect(XBRIDGES_DOMAIN_VOCABULARY['sinks']).toBeDefined();
  });

  it('resolves multiplication keywords to VectorMul with correct ports', () => {
    const op1 = resolveDomainOperation('multiply constant 10 by 100', catalog);
    expect(op1).not.toBeNull();
    expect(op1?.operator).toBe('multiply');
    expect(op1?.blockType).toBe('VectorMul');
    expect(op1?.inputPorts).toEqual(['in1', 'in2']);
    expect(op1?.outputPort).toBe('out');

    const op2 = resolveDomainOperation('product of two signals', catalog);
    expect(op2?.operator).toBe('multiply');
    expect(op2?.blockType).toBe('VectorMul');
  });

  it('resolves division, power, and subtraction operations', () => {
    const div = resolveDomainOperation('divide signal by 5', catalog);
    expect(div?.operator).toBe('divide');
    expect(div?.blockType).toBe('VectorDiv');

    const pow = resolveDomainOperation('power of signal to 2', catalog);
    expect(pow?.operator).toBe('power');
    expect(pow?.blockType).toBe('VectorPow');

    const sub = resolveDomainOperation('subtract feedback from reference', catalog);
    expect(sub?.operator).toBe('subtract');
    expect(sub?.blockType).toBe('Sum');
    expect(sub?.defaultParams?.signs).toBe('+-');
  });

  it('resolves domain keywords from natural language sentences', () => {
    const res1 = resolveDomainKeywords('make an inverter model with PWM modulation and scope');
    expect(res1.domains).toContain('power');
    expect(res1.domains).toContain('modulation');
    expect(res1.domains).toContain('sinks');
    expect(res1.matchedKeywords).toContain('inverter');
    expect(res1.matchedKeywords).toContain('pwm');
    expect(res1.matchedKeywords).toContain('scope');
  });
});
