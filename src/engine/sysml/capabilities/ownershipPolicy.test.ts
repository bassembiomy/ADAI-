import { describe, expect, it } from 'vitest';
import type { SemanticElement, Package, Requirement, Block } from '../domain';
import {
  evaluateOwnership,
  getOwnedElementCapabilities,
} from './ownershipPolicy';
import { getSupportedElementKinds } from './catalog';

describe('ownershipPolicy', () => {
  const pkg: Package = {
    id: 'pkg-1',
    name: 'Structure',
    metaclass: 'Package',
    namespace: [],
    ownerId: 'pkg-root',
  };

  const requirement: Requirement = {
    id: 'req-1',
    name: 'SafetyRequirement',
    metaclass: 'Requirement',
    namespace: [],
    ownerId: 'pkg-root',
    requirementId: 'REQ-001',
    text: 'System shall be safe',
    status: 'Approved',
  };

  const block: Block = {
    id: 'block-1',
    name: 'Powertrain',
    metaclass: 'Block',
    namespace: [],
    ownerId: 'pkg-1',
    isAbstract: false,
    isLeaf: false,
    ownedPropertyIds: [],
    ownedPortIds: [],
    ownedOperationIds: [],
    ownedConstraintIds: [],
  };

  it('allows classifiers under packages but not under requirements', () => {
    expect(evaluateOwnership(pkg, 'Block').allowed).toBe(true);
    expect(evaluateOwnership(requirement, 'Block')).toMatchObject({
      allowed: false,
      code: 'ILLEGAL_OWNERSHIP',
    });
  });

  it('allows all declared Block features', () => {
    for (const kind of [
      'PartProperty',
      'ReferenceProperty',
      'ValueProperty',
      'FlowProperty',
      'Port',
      'Operation',
    ] as const) {
      expect(evaluateOwnership(block, kind).allowed).toBe(true);
    }
  });

  it('rejects features under package or requirement', () => {
    expect(evaluateOwnership(pkg, 'PartProperty')).toMatchObject({
      allowed: false,
      code: 'ILLEGAL_OWNERSHIP',
    });
    expect(evaluateOwnership(requirement, 'PartProperty')).toMatchObject({
      allowed: false,
      code: 'ILLEGAL_OWNERSHIP',
    });
  });

  it('allows null owner treating it as Model root', () => {
    expect(evaluateOwnership(null, 'Package').allowed).toBe(true);
    expect(evaluateOwnership(null, 'Block').allowed).toBe(true);
    expect(evaluateOwnership(null, 'PartProperty')).toMatchObject({
      allowed: false,
      code: 'ILLEGAL_OWNERSHIP',
    });
  });

  it('lists owned element capabilities with decision flags', () => {
    const blockCaps = getOwnedElementCapabilities(block);
    const partCap = blockCaps.find((c) => c.metaclass === 'PartProperty');
    expect(partCap?.allowed).toBe(true);

    const reqCap = blockCaps.find((c) => c.metaclass === 'Requirement');
    expect(reqCap?.allowed).toBe(false);
    expect(reqCap?.diagnosticCode).toBe('ILLEGAL_OWNERSHIP');
  });

  it('returns supported element kinds from catalog with valid authorities', () => {
    const kinds = getSupportedElementKinds();
    expect(kinds.length).toBeGreaterThan(10);
    const blockDef = kinds.find((k) => k.metaclass === 'Block');
    expect(blockDef).toBeDefined();
    expect(blockDef?.authority).toBe('OMG_SYSML_1_6');
    expect(blockDef?.category).toBe('element');

    const portDef = kinds.find((k) => k.metaclass === 'Port');
    expect(portDef).toBeDefined();
    expect(portDef?.authority).toBe('UML_FOUNDATION');
    expect(portDef?.category).toBe('feature');
  });
});
