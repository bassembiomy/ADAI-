import { describe, expect, it } from 'vitest';
import { createEmptyRepository, parseMultiplicity, qualifiedName, type SysmlRepository } from './model';

describe('canonical SysML repository', () => {
  it('creates a versioned repository with the declared profile', () => {
    const repo = createEmptyRepository();
    expect(repo).toMatchObject({ schemaVersion: 2, profileId: 'OMG-SysML-1.6-ADIA', revision: 0 });
    expect(JSON.parse(JSON.stringify(repo))).toEqual(repo);
  });

  it.each([
    ['1', { lower: 1, upper: 1, ordered: false, unique: true }],
    ['0..1', { lower: 0, upper: 1, ordered: false, unique: true }],
    ['1..*', { lower: 1, upper: '*', ordered: false, unique: true }],
    ['0..* {ordered, nonunique}', { lower: 0, upper: '*', ordered: true, unique: false }],
  ])('parses multiplicity %s', (text, expected) => expect(parseMultiplicity(text)).toEqual(expected));

  it.each(['', '-1', '2..1', 'x', '1..-2'])('rejects invalid multiplicity %s', text => {
    expect(() => parseMultiplicity(text)).toThrow(/multiplicity/i);
  });

  it('builds qualified names without changing stable IDs', () => {
    expect(qualifiedName(['Vehicle', 'Powertrain'], 'Motor')).toBe('Vehicle::Powertrain::Motor');
  });

  it('distinguishes block definitions from typed part usages', () => {
    const repo: SysmlRepository = createEmptyRepository();
    repo.definitions.motor = { id: 'motor', kind: 'block', name: 'Motor', namespace: [], isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [] };
    repo.usages.leftMotor = { id: 'leftMotor', kind: 'part', name: 'leftMotor', ownerId: 'vehicle', typeId: 'motor', aggregation: 'composite', multiplicity: parseMultiplicity('1') };
    expect(repo.definitions.motor.id).toBe('motor');
    expect(repo.usages.leftMotor.typeId).toBe('motor');
  });
});
