import { describe, expect, it } from 'vitest';
import type { BlockData, RelationshipData, ValuePropertyData } from '../types/sysml_types';
import { formatLegacyProperty, validateLegacyBlockEdit, validateLegacyBlockProperties } from './sysmlPropertyRules';

const block = (id: string, stereotype = 'block', properties: ValuePropertyData[] = []): BlockData => ({ id, name: id, stereotype, x: 0, y: 0, width: 100, height: 80, properties, operations: [], constraints: [], classes: [], ports: [] });
const property = (id: string, name: string, kind: ValuePropertyData['kind'], typeId: string, multiplicity = '1'): ValuePropertyData => ({ id, name, kind, typeId, type: typeId, multiplicity });

describe('native BDD property rules', () => {
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
});
