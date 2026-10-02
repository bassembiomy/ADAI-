import { describe, expect, it } from 'vitest';
import { createEmptyRepositoryV4 } from '../../engine/sysml/domain';
import { friendlySysmlKind, resolveSysmlReferenceLabel, sysmlObjectLabel } from './sysmlDisplayLabel';

describe('SysML display labels', () => {
  it('prefers an assigned name and never substitutes the id', () => {
    expect(sysmlObjectLabel({ name: '  Flight Computer  ', metaclass: 'Block' })).toBe('Flight Computer');
    expect(sysmlObjectLabel({ name: '', metaclass: 'Block' })).toBe('Block');
    expect(sysmlObjectLabel({ id: '26bce7fc-f3ae-4030-95a3-917a620a36a4', name: 'Named Association', metaclass: 'Association' })).toBe('Named Association');
    expect(sysmlObjectLabel({ id: 'same-id', name: 'same-id', metaclass: 'Block' })).toBe('same-id');
  });

  it('humanizes metaclass names', () => {
    expect(friendlySysmlKind('ItemFlow')).toBe('Item Flow');
    expect(friendlySysmlKind('sharedAggregation')).toBe('Shared Aggregation');
  });

  it('resolves named, unnamed, and missing references without leaking ids', () => {
    const repository = createEmptyRepositoryV4();
    repository.elements['blk-0fcf4de9'] = { id: 'blk-0fcf4de9', name: 'Controller', metaclass: 'Block', namespace: [], ownerId: 'pkg-root' };
    repository.elements['358925d2-8fba-438e-b11a-523a63c85da5'] = { id: '358925d2-8fba-438e-b11a-523a63c85da5', name: '', metaclass: 'Block', namespace: [], ownerId: 'pkg-root' };
    expect(resolveSysmlReferenceLabel(repository, 'blk-0fcf4de9')).toBe('Controller');
    expect(resolveSysmlReferenceLabel(repository, '358925d2-8fba-438e-b11a-523a63c85da5')).toBe('Block');
    expect(resolveSysmlReferenceLabel(repository, 'missing-uuid', 'Element')).toBe('Element');
  });
});
