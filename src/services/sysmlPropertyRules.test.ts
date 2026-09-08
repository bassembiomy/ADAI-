import { describe, expect, it } from 'vitest';
import type { BlockData, RelationshipData, ValuePropertyData } from '../types/sysml_types';
import { formatLegacyProperty, validateLegacyBlockProperties } from './sysmlPropertyRules';

const block = (id: string, stereotype = 'block', properties: ValuePropertyData[] = []): BlockData => ({ id, name: id, stereotype, x: 0, y: 0, width: 100, height: 80, properties, operations: [], constraints: [], classes: [], ports: [] });
const property = (id: string, name: string, kind: ValuePropertyData['kind'], typeId: string, multiplicity = '1'): ValuePropertyData => ({ id, name, kind, typeId, type: typeId, multiplicity });

describe('native BDD property rules', () => {
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
