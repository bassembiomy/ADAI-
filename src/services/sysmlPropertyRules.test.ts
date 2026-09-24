import { describe, expect, it } from 'vitest';
import type { BlockData, RelationshipData, ValuePropertyData } from '../types/sysml_types';
import { formatLegacyProperty, introducesNewValidationCodes, syncPartProperty, validateLegacyBlockEdit, validateLegacyBlockProperties } from './sysmlPropertyRules';

const block = (id: string, stereotype = 'block', properties: ValuePropertyData[] = []): BlockData => ({ id, name: id, stereotype, x: 0, y: 0, width: 100, height: 80, properties, operations: [], constraints: [], classes: [], ports: [] });
const property = (id: string, name: string, kind: ValuePropertyData['kind'], typeId: string, multiplicity = '1'): ValuePropertyData => ({ id, name, kind, typeId, type: typeId, multiplicity });

describe('native BDD property rules', () => {
  it('projects a part usage onto its owning block as a SysML part property', () => {
    const owner = block('owner');
    const motor = block('motor');
    motor.name = 'Motor';
    const part = { id: 'part-1', name: 'drive', blockId: owner.id, typeId: motor.id, x: 0, y: 0, width: 10, height: 10, multiplicity: '1..2' };

    const projected = syncPartProperty([owner, motor], part);
    expect(projected.find(item => item.id === owner.id)?.properties).toEqual([
      expect.objectContaining({ id: 'part-1', name: 'drive', type: 'Motor', typeId: 'motor', kind: 'part', multiplicity: '1..2' }),
    ]);

    const renamed = syncPartProperty(projected, { ...part, name: 'leftDrive', multiplicity: '0..*' });
    expect(renamed.find(item => item.id === owner.id)?.properties[0]).toEqual(expect.objectContaining({ name: 'leftDrive', multiplicity: '0..*' }));
  });
  it('rejects malformed block attributes with stable diagnostics', () => {
    const candidate = block('candidate', 'requirement', [
      { id: 'p1', name: '', type: 'Missing', typeId: 'Missing', kind: 'value', multiplicity: '2..1' },
      { id: 'p2', name: '', type: 'Missing', typeId: 'Missing', kind: 'value', multiplicity: '1' },
    ]);
    candidate.name = 'bad name';
    candidate.reqId = '???';
    candidate.status = 'Unknown';
    candidate.operations = ['9bad()'];
    candidate.constraints = ['   '];
    candidate.ports = [{ id: 'p', name: 'bad port', type: '', kind: 'flow', direction: 'sideways' as any }];
    const result = validateLegacyBlockEdit([candidate], [], candidate.id);
    expect(result.valid).toBe(false);
    expect(result.codes).toEqual(expect.arrayContaining([
      'INVALID_BLOCK_NAME', 'INVALID_REQUIREMENT_ID', 'INVALID_REQUIREMENT_STATUS',
      'INVALID_OPERATION_SIGNATURE', 'EMPTY_CONSTRAINT', 'INVALID_PORT_NAME',
      'MISSING_PORT_TYPE', 'INVALID_PORT_DIRECTION', 'DUPLICATE_PROPERTY_NAME',
      'INVALID_MULTIPLICITY', 'INVALID_PROPERTY_TYPE',
    ]));
  });

  it('accepts Cameo-style block attributes', () => {
    const candidate = block('PowerSubsystem', 'block', [{ id: 'p1', name: 'voltage', type: 'Real', typeId: 'Real', kind: 'value', multiplicity: '1..1' }]);
    candidate.namespace = ['Vehicle', 'Power'];
    candidate.operations = ['initializeSystem(): Boolean'];
    candidate.constraints = ['voltage >= 0'];
    candidate.ports = [{ id: 'p', name: 'powerIn', type: 'PowerIF', kind: 'proxy', direction: 'in' }];
    const valueType = block('Real', 'valueType');
    expect(validateLegacyBlockEdit([candidate, valueType], [], candidate.id).valid).toBe(true);
  });

  it('rejects duplicate block names in the same namespace and empty property names', () => {
    const first = block('first');
    first.name = 'Controller';
    const second = block('second', 'block', [{ id: 'p', name: '', type: 'Real', typeId: 'Real', kind: 'value', multiplicity: '1' }]);
    second.name = 'Controller';
    const real = block('Real', 'valueType');
    const result = validateLegacyBlockEdit([first, second, real], [], second.id);
    expect(result.codes).toEqual(expect.arrayContaining(['DUPLICATE_BLOCK_NAME', 'INVALID_PROPERTY_NAME']));
  });


  it('validates property kind/type, multiplicity, duplicate names, redefinition, and subsetting', () => {
    const base = block('base', 'block', [property('base-items', 'items', 'part', 'partType', '1..2')]);
    const partType = block('partType');
    const real = block('real', 'valueType');
    const child = block('child', 'block', [
      { ...property('redefined', 'items', 'value', 'real'), redefinesId: 'base-items' },
      { ...property('subset', 'subset', 'part', 'partType', '0..*'), subsetsId: 'base-items' },
      property('duplicate', 'subset', 'value', 'missing', '-1'),
    ]);
    const relationships: RelationshipData[] = [{ id: 'g', sourceId: 'child', targetId: 'base', type: 'generalization', label: '' }];
    const codes = validateLegacyBlockProperties([base, child, partType, real], relationships, 'child').codes;
    expect(codes).toEqual(expect.arrayContaining(['DUPLICATE_PROPERTY_NAME', 'INVALID_PROPERTY_TYPE', 'INVALID_MULTIPLICITY', 'INCOMPATIBLE_REDEFINITION', 'INVALID_SUBSETTING']));
  });

  it('formats complete SysML property notation', () => {
    expect(formatLegacyProperty({ ...property('p', 'speed', 'flow', 'Velocity', '0..*'), ordered: true, unique: false, isDerived: true, unit: 'm/s', subsetsId: 'base-speed' }))
      .toBe('/speed: Velocity [0..*] {ordered, nonunique} «flow» {unit=m/s} subsets base-speed');
  });

  it('provides readable diagnostic messages for incompatible and missing property types', () => {
    const motor = block('motor-id', 'block');
    motor.name = 'Motor';
    const mainBlock = block('main', 'block', [
      property('p1', 'speed', 'value', 'motor-id'),
      property('p2', 'temp', 'value', 'non-existent-id'),
    ]);
    const result = validateLegacyBlockProperties([motor, mainBlock], [], 'main');
    expect(result.messages).toContain('speed has incompatible type Motor «block» for value property');
    expect(result.messages).toContain('temp references non-existent type non-existent-id');
  });

  it('labels an empty property type as unresolved', () => {
    const owner = block('owner', 'block', [{ id: 'part-2', name: 'part_2', type: '', kind: 'part', multiplicity: '1' }]);
    const result = validateLegacyBlockProperties([owner], [], owner.id);
    expect(result.messages).toContain('part_2 references non-existent type (unresolved)');
  });

  it('allows unrelated edits when they do not introduce a new validation category', () => {
    expect(introducesNewValidationCodes(
      { valid: false, codes: ['INVALID_PROPERTY_TYPE'], messages: ['existing unresolved type'] },
      { valid: false, codes: ['INVALID_PROPERTY_TYPE'], messages: ['same unresolved type after rename'] },
    )).toBe(false);
    expect(introducesNewValidationCodes(
      { valid: false, codes: ['INVALID_PROPERTY_TYPE'], messages: [] },
      { valid: false, codes: ['INVALID_PROPERTY_TYPE', 'INVALID_MULTIPLICITY'], messages: [] },
    )).toBe(true);
  });
});
