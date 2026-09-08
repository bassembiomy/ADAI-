import { describe, expect, it } from 'vitest';
import {
  createEmptyRepository,
  type BlockDefinition,
  type PropertyDefinition,
  type SysmlRepository,
} from './model';
import { deriveBddView, resolveInheritedFeatures, validateBlockDefinition } from './bdd';

const multiplicity = (lower = 1, upper: number | '*' = 1) => ({ lower, upper, ordered: false, unique: true });
const property = (
  id: string,
  name: string,
  kind: PropertyDefinition['kind'],
  typeId: string,
  extra: Partial<PropertyDefinition> = {},
): PropertyDefinition => ({ id, name, kind, typeId, multiplicity: multiplicity(), ...extra });
const block = (id: string, extra: Partial<BlockDefinition> = {}): BlockDefinition => ({
  id,
  name: id,
  namespace: ['Vehicle'],
  kind: 'block',
  isAbstract: false,
  isLeaf: false,
  properties: [],
  ports: [],
  operations: [],
  constraints: [],
  ...extra,
});
const repo = (): SysmlRepository => {
  const value = createEmptyRepository();
  value.definitions.Real = { id: 'Real', name: 'Real', namespace: [], kind: 'valueType', unit: 'm/s', dimension: 'velocity' };
  value.definitions.IF = { id: 'IF', name: 'PowerIF', namespace: [], kind: 'interface', features: ['voltage'] };
  return value;
};

describe('canonical BDD semantics', () => {
  it('resolves inherited properties, ports, operations, constraints, redefinition, and subsetting', () => {
    const model = repo();
    model.definitions.base = block('base', {
      isAbstract: true,
      properties: [
        property('mass', 'mass', 'value', 'Real'),
        property('wheels', 'wheels', 'part', 'wheel', { multiplicity: multiplicity(1, '*') }),
      ],
      ports: [{ id: 'power', name: 'power', kind: 'proxy', typeId: 'IF', direction: 'inout', isConjugated: false, multiplicity: multiplicity() }],
      operations: ['start()'],
      constraints: ['mass > 0'],
    });
    model.definitions.wheel = block('wheel');
    model.definitions.car = block('car', {
      supertypeIds: ['base'],
      properties: [
        property('car-mass', 'mass', 'value', 'Real', { redefinesId: 'mass' }),
        property('front-wheels', 'frontWheels', 'part', 'wheel', { subsetsId: 'wheels', multiplicity: multiplicity(1, 2) }),
      ],
      operations: ['stop()'],
    });

    const resolved = resolveInheritedFeatures(model, 'car');

    expect(resolved.diagnostics).toEqual([]);
    expect(resolved.properties.map(p => p.id)).toEqual(['car-mass', 'wheels', 'front-wheels']);
    expect(resolved.ports.map(p => p.id)).toEqual(['power']);
    expect(resolved.operations).toEqual(['start()', 'stop()']);
    expect(resolved.constraints).toEqual(['mass > 0']);
  });

  it('diagnoses incompatible redefinition and invalid subsetting multiplicity', () => {
    const model = repo();
    model.definitions.base = block('base', {
      properties: [property('base-p', 'items', 'part', 'base', { multiplicity: multiplicity(1, 2) })],
    });
    model.definitions.child = block('child', {
      supertypeIds: ['base'],
      properties: [
        property('bad-redefine', 'items', 'value', 'Real', { redefinesId: 'base-p' }),
        property('bad-subset', 'subset', 'part', 'base', { subsetsId: 'base-p', multiplicity: multiplicity(0, '*') }),
      ],
    });

    const codes = validateBlockDefinition(model, 'child').map(d => d.code);
    expect(codes).toContain('INCOMPATIBLE_REDEFINITION');
    expect(codes).toContain('INVALID_SUBSETTING_MULTIPLICITY');
  });

  it('enforces feature typing, unique names, and leaf specialization', () => {
    const model = repo();
    model.definitions.leaf = block('leaf', { isLeaf: true });
    model.definitions.child = block('child', {
      supertypeIds: ['leaf'],
      properties: [
        property('x1', 'x', 'value', 'missing'),
        property('x2', 'x', 'flow', 'Real'),
      ],
      ports: [{ id: 'bad-port', name: 'p', kind: 'proxy', typeId: 'missing', direction: 'in', isConjugated: false, multiplicity: multiplicity() }],
    });

    const codes = validateBlockDefinition(model, 'child').map(d => d.code);
    expect(codes).toEqual(expect.arrayContaining([
      'LEAF_SPECIALIZATION', 'DUPLICATE_FEATURE_NAME', 'MISSING_PROPERTY_TYPE', 'MISSING_PORT_TYPE',
    ]));
  });

  it('projects only BDD definitions and BDD relationships with notation metadata', () => {
    const model = repo();
    model.definitions.a = block('a');
    model.definitions.b = block('b');
    model.requirements.r = { id: 'r', name: 'R', namespace: [], kind: 'requirement', requirementId: 'REQ-1', text: 'x', status: 'draft', version: '1' };
    model.relationships.composition = { id: 'composition', kind: 'composition', sourceId: 'a', targetId: 'b', sourceMultiplicity: multiplicity(), targetMultiplicity: multiplicity(0, '*') };
    model.relationships.generalization = { id: 'generalization', kind: 'generalization', sourceId: 'b', targetId: 'a' };
    model.relationships.satisfy = { id: 'satisfy', kind: 'satisfy', sourceId: 'a', targetId: 'r' };

    const view = deriveBddView(model);

    expect(view.elements.map(e => e.id).sort()).toEqual(['IF', 'Real', 'a', 'b']);
    expect(view.relationships.map(r => r.id).sort()).toEqual(['composition', 'generalization']);
    expect(view.relationships.find(r => r.id === 'composition')?.notation).toBe('filled-diamond');
    expect(view.relationships.find(r => r.id === 'generalization')?.notation).toBe('hollow-triangle');
  });
});
