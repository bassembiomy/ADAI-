import { describe, it, expect } from 'vitest';
import { migrateSysMLState } from './sysmlIntegrityService';

describe('sysmlIntegrityService - Schema Hydration', () => {
  it('hydrates empty or undefined state with empty arrays', () => {
    const migrated = migrateSysMLState({});
    expect(migrated).toEqual({
      blocks: [],
      ports: [],
      parts: [],
      connectors: [],
      requirements: [],
      relations: [],
    });
  });

  it('populates missing port direction with default "inout"', () => {
    const raw = {
      ports: [{ id: 'p1', name: 'Port 1', blockId: 'b1' }],
    };
    const migrated = migrateSysMLState(raw);
    expect(migrated.ports[0].direction).toBe('inout');
  });

  it('populates missing parentPartId with null', () => {
    const raw = {
      parts: [{ id: 'pt1', name: 'Part 1', typeBlockId: 'b1', parentBlockId: 'b2' }],
    };
    const migrated = migrateSysMLState(raw);
    expect(migrated.parts[0].parentPartId).toBeNull();
  });

  it('canonicalizes relation type "derive" to "deriveReqt"', () => {
    const raw = {
      relations: [{ id: 'r1', sourceId: 'req1', targetId: 'req2', type: 'derive' }],
    };
    const migrated = migrateSysMLState(raw);
    expect(migrated.relations[0].type).toBe('deriveReqt');
  });
});
