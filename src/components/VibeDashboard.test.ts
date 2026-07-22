import { describe, it, expect } from 'vitest';
import { getOrbDetails } from './VibeDashboard';

describe('VibeDashboard Helper', () => {
  it('returns Zero-G orb status for ZERO_G status', () => {
    const orb = getOrbDetails('ZERO_G');
    expect(orb.icon).toBe('🌕');
    expect(orb.label).toContain('Zero-G');
  });

  it('returns Re-entry Failed orb status for REENTRY_FAILED status', () => {
    const orb = getOrbDetails('REENTRY_FAILED');
    expect(orb.icon).toBe('☄️');
    expect(orb.label).toContain('Re-entry Failed');
  });
});
