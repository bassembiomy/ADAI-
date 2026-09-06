import { describe, expect, it } from 'vitest';
import {
  allocateExternalIdentifiers,
  type ExternalIdentifierInput,
} from './smCIdentifierPolicy';

describe('smCIdentifierPolicy', () => {
  it('allocates distinct C identifiers for UUID-heavy identifiers colliding within 31 characters', () => {
    // Both identifiers share the same initial 35 characters: "state_aaaaaaaa_1111_2222_3333_4444_"
    const id1 = 'state_aaaaaaaa_1111_2222_3333_4444_111111111111';
    const id2 = 'state_aaaaaaaa_1111_2222_3333_4444_222222222222';

    const allocation = allocateExternalIdentifiers([id1, id2], 31);

    const cId1 = allocation.get(id1);
    const cId2 = allocation.get(id2);

    expect(cId1).toBeDefined();
    expect(cId2).toBeDefined();
    expect(cId1).not.toBe(cId2);
    expect(cId1!.length).toBeLessThanOrEqual(31);
    expect(cId2!.length).toBeLessThanOrEqual(31);
    // Identifiers must be valid C identifiers (start with letter/_, followed by alnum/_)
    expect(cId1).toMatch(/^[A-Za-z_][A-Za-z0-9_]*$/);
    expect(cId2).toMatch(/^[A-Za-z_][A-Za-z0-9_]*$/);
  });

  it('combines readable normalized prefix with eight SHA-256 characters by default', () => {
    const item: ExternalIdentifierInput = {
      id: 'custom_state_very_long_name_exceeding_boundaries',
      name: 'Idle Standby Mode',
    };

    const allocation = allocateExternalIdentifiers([item], 31);
    const cId = allocation.get(item.id);

    expect(cId).toBeDefined();
    expect(cId!.length).toBeLessThanOrEqual(31);
    // Should preserve a normalized prefix derived from name or prefix
    expect(cId).toContain('Idle_Standby');
    // Suffix should contain at least 8 hex characters
    expect(cId).toMatch(/_[0-9a-f]{8,}$/);
  });

  it('lengthens hash within fixed limit when hash collisions occur', () => {
    // Two distinct inputs
    const itemA: ExternalIdentifierInput = { id: 'elem_A', prefix: 'elem' };
    const itemB: ExternalIdentifierInput = { id: 'elem_B', prefix: 'elem' };

    // With a small limit (e.g. 16 chars), prefix must shorten to make room for lengthened hash
    const allocation = allocateExternalIdentifiers([itemA, itemB], 16);

    const cIdA = allocation.get('elem_A')!;
    const cIdB = allocation.get('elem_B')!;

    expect(cIdA).toBeDefined();
    expect(cIdB).toBeDefined();
    expect(cIdA).not.toBe(cIdB);
    expect(cIdA.length).toBeLessThanOrEqual(16);
    expect(cIdB.length).toBeLessThanOrEqual(16);
  });

  it('sanitizes illegal characters in names/prefixes', () => {
    const item: ExternalIdentifierInput = {
      id: 'raw-id-with-dashes@#$',
      prefix: '123-invalid.prefix!',
    };

    const allocation = allocateExternalIdentifiers([item], 31);
    const cId = allocation.get(item.id)!;

    expect(cId).toBeDefined();
    expect(cId.length).toBeLessThanOrEqual(31);
    expect(cId).toMatch(/^[A-Za-z_][A-Za-z0-9_]*$/);
  });
});
