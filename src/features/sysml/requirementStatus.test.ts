import { describe, expect, it } from 'vitest';
import { requirementStatusColor } from './requirementStatus';

describe('requirementStatusColor', () => {
  it('resolves canonical lowercase statuses (the projection never capitalises them)', () => {
    expect(requirementStatusColor('verified')).toBe('#4ade80');
    expect(requirementStatusColor('approved')).toBe('#6c9ac6');
    expect(requirementStatusColor('implemented')).toBe('#6c9ac6');
    expect(requirementStatusColor('draft')).toBe('#888');
    expect(requirementStatusColor('failed')).toBe('#c96c8a');
    expect(requirementStatusColor('stale')).toBe('#c96c8a');
  });

  it('is case-insensitive and tolerates a missing status', () => {
    expect(requirementStatusColor('Verified')).toBe('#4ade80');
    expect(requirementStatusColor(' DRAFT ')).toBe('#888');
    expect(requirementStatusColor(undefined)).toBe('#c96c8a');
  });
});
