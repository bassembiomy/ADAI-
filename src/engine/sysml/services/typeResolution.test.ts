import { describe, expect, it } from 'vitest';
import { resolveType } from './typeResolution';
import { createEmptyRepositoryV4, addSemanticElementV4, type Block, type ValueType } from '../domain';

describe('Global Type Resolution & No Silent Creation', () => {
  it('returns TYPE_NOT_FOUND with candidates and explicit CreateNewType action for unknown types', () => {
    const repo = createEmptyRepositoryV4();
    const countBefore = Object.keys(repo.elements).length;

    const result = resolveType('NonExistentType', repo);

    expect(result.found).toBe(false);
    if (!result.found) {
      expect(result.code).toBe('TYPE_NOT_FOUND');
      expect(result.searchedType).toBe('NonExistentType');
      expect(result.action).toEqual({
        actionKind: 'CreateNewType',
        suggestedName: 'NonExistentType',
        targetNamespace: [],
      });
      expect(Array.isArray(result.candidates)).toBe(true);
    }

    // Crucial requirement: unknown type resolution MUST NOT silently synthesize any entity!
    expect(Object.keys(repo.elements).length).toBe(countBefore);
  });

  it('ranks candidates by qualified-name match, simple-name match, and normalized prefix', () => {
    const repo = createEmptyRepositoryV4();

    const exactSimple: Block = {
      id: 'blk-motor',
      name: 'Motor',
      metaclass: 'Block',
      namespace: ['Components'],
      ownerId: null,
    };
    const prefixMatch: Block = {
      id: 'blk-motor-drive',
      name: 'MotorDrive',
      metaclass: 'Block',
      namespace: ['System'],
      ownerId: null,
    };
    const qualifiedExact: Block = {
      id: 'blk-powertrain-motor',
      name: 'Motor',
      metaclass: 'Block',
      namespace: ['Powertrain'],
      ownerId: null,
    };

    addSemanticElementV4(repo, exactSimple);
    addSemanticElementV4(repo, prefixMatch);
    addSemanticElementV4(repo, qualifiedExact);

    // Searching 'Powertrain::Motor' should resolve directly to qualifiedExact
    const directResult = resolveType('Powertrain::Motor', repo);
    expect(directResult.found).toBe(true);
    if (directResult.found) {
      expect(directResult.element.id).toBe('blk-powertrain-motor');
    }

    // Searching 'Moto' should return candidates ranked with prefix match
    const candidateResult = resolveType('Moto', repo);
    expect(candidateResult.found).toBe(false);
    if (!candidateResult.found) {
      expect(candidateResult.candidates.length).toBeGreaterThanOrEqual(2);
      expect(candidateResult.candidates[0].name).toMatch(/^Motor/);
    }
  });

  it('resolves types by ID as well as simple or qualified name', () => {
    const repo = createEmptyRepositoryV4();
    const vt: ValueType = {
      id: 'vt-volts',
      name: 'Voltage',
      metaclass: 'ValueType',
      namespace: ['Units'],
      ownerId: null,
    };
    addSemanticElementV4(repo, vt);

    expect(resolveType('vt-volts', repo).found).toBe(true);
    expect(resolveType('Voltage', repo).found).toBe(true);
    expect(resolveType('Units::Voltage', repo).found).toBe(true);
  });
});
