import { describe, expect, it } from 'vitest';
import { PHYSICAL_DOMAINS } from './types';
import { isValidVLabPortDomain } from './vlabPortDomains';

describe('V-Lab port domains', () => {
  it('uses the canonical engine list for physical domains regardless of case', () => {
    expect(PHYSICAL_DOMAINS).toContain('gas');
    expect(PHYSICAL_DOMAINS).toContain('magnetic');
    expect(isValidVLabPortDomain('Gas')).toBe(true);
    expect(isValidVLabPortDomain('Magnetic')).toBe(true);
  });

  it('accepts explicit metadata domains and rejects unknown domains', () => {
    expect(isValidVLabPortDomain('Any')).toBe(true);
    expect(isValidVLabPortDomain('BeltProperty')).toBe(true);
    expect(isValidVLabPortDomain('UnknownDomain')).toBe(false);
  });
});
