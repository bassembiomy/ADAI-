import { describe, expect, it } from 'vitest';
import {
  createEmptyRepository, isDefinitionKind,
  type BlockDefinition, type QuantityKindDefinition, type SysmlRepository, type UnitDefinition, type ValueTypeDefinition,
} from './model';
import { createSysmlGatewayState, executeSysmlCommand, projectLegacyDiagram } from '../../services/sysmlCommandGateway';
import { compareBaselines, createBaseline, loadRepository, serializeRepository } from './persistence';
import { validateSysmlRepository } from './validation';
import { migrateV3ToV4 } from './persistence/migrateV3ToV4';
import { formatLegacyProperty } from '../../services/sysmlPropertyRules';
import { resolvedPropertyUnitSymbol, resolveValueTypeMeasure } from './units';
import { getInspectorSchema } from '../../features/sysml/inspectorSchema';

const one = { lower: 1, upper: 1 as const, ordered: false, unique: true };
const quantityKind = (id: string, name = id): QuantityKindDefinition => ({ id, kind: 'quantityKind', name, namespace: [], ownerId: 'model' });
const unit = (id: string, symbol: string, quantityKindId?: string, name = id): UnitDefinition =>
  ({ id, kind: 'unit', name, namespace: [], ownerId: 'model', symbol, quantityKindId });
const valueType = (id: string, extra: Partial<ValueTypeDefinition> = {}): ValueTypeDefinition =>
  ({ id, kind: 'valueType', name: id, namespace: [], ownerId: 'model', ...extra });
const car = (): BlockDefinition => ({
  id: 'car', name: 'Car', namespace: [], kind: 'block', ownerId: 'model', isAbstract: false, isLeaf: false,
  properties: [{ id: 'car.mass', name: 'mass', kind: 'value', typeId: 'mass', multiplicity: one }],
  ports: [], operations: [], constraints: [],
});

function model(): SysmlRepository {
  const repo = createEmptyRepository();
  repo.definitions.qkMass = quantityKind('qkMass', 'Mass');
  repo.definitions.kg = unit('kg', 'kg', 'qkMass', 'Kilogram');
  repo.definitions.mass = valueType('mass', { unitId: 'kg', quantityKindId: 'qkMass' });
  repo.definitions.car = car();
  return repo;
}
const codes = (repo: SysmlRepository) => validateSysmlRepository(repo).diagnostics.map(d => d.code);

describe('Unit and QuantityKind are stored definitions', () => {
  it('knows both kinds as definition kinds', () => {
    expect(isDefinitionKind('unit')).toBe(true);
    expect(isDefinitionKind('quantityKind')).toBe(true);
  });

  it('creates each through the gateway as a definition, with one undo step', () => {
    for (const element of [quantityKind('q1'), unit('u1', 'm')]) {
      const created = executeSysmlCommand(createSysmlGatewayState(createEmptyRepository()), { type: 'createElement', element: element as never });
      expect(created.committed).toBe(true);
      expect(created.repository.definitions[element.id].kind).toBe(element.kind);
      expect(executeSysmlCommand(created, { type: 'undo' }).repository.definitions[element.id]).toBeUndefined();
    }
  });

  it('updates a ValueType reference through updateElement and undoes it', () => {
    let state = createSysmlGatewayState(model());
    const created = executeSysmlCommand(state, { type: 'createElement', element: unit('s', 's') as never });
    expect(created.committed).toBe(true);
    const updated = executeSysmlCommand(created, { type: 'updateElement', elementId: 'mass', patch: { unitId: 's' } });
    expect(updated.committed).toBe(true);
    expect((updated.repository.definitions.mass as ValueTypeDefinition).unitId).toBe('s');
    const undone = executeSysmlCommand(updated, { type: 'undo' });
    expect((undone.repository.definitions.mass as ValueTypeDefinition).unitId).toBe('kg');
    state = undone;
    expect(state.repository.definitions.s).toBeDefined();
  });

  it('round-trips every new field through save and load unchanged', () => {
    const loaded = loadRepository(serializeRepository(model()));
    expect(loaded.valid).toBe(true);
    expect(loaded.repository.definitions.qkMass).toMatchObject({ kind: 'quantityKind', name: 'Mass' });
    expect(loaded.repository.definitions.kg).toMatchObject({ kind: 'unit', symbol: 'kg', quantityKindId: 'qkMass' });
    expect(loaded.repository.definitions.mass).toMatchObject({ unitId: 'kg', quantityKindId: 'qkMass' });
    expect(loaded.diagnostics.map(d => d.code)).not.toContain('VALUE_TYPE_UNITS_LINKED');
  });

  it('appears in the V4 view with its own metaclasses and references', () => {
    const v4 = migrateV3ToV4(model());
    expect(v4.elements.kg).toMatchObject({ metaclass: 'Unit', symbol: 'kg', quantityKindId: 'qkMass' });
    expect(v4.elements.qkMass.metaclass).toBe('QuantityKind');
    expect(v4.elements.mass).toMatchObject({ metaclass: 'ValueType', unitId: 'kg', quantityKindId: 'qkMass' });
  });
});

describe('rules for Unit, QuantityKind and ValueType references', () => {
  it('accepts a well-formed model', () => {
    expect(validateSysmlRepository(model()).diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  });

  it('rejects a ValueType whose unit or quantity kind does not resolve (or resolves to the wrong kind)', () => {
    const repo = model();
    repo.definitions.mass = valueType('mass', { unitId: 'nowhere', quantityKindId: 'kg' });
    expect(codes(repo)).toEqual(expect.arrayContaining(['MISSING_UNIT', 'MISSING_QUANTITY_KIND']));
  });

  it('rejects a Unit with an empty symbol or an unknown quantity kind', () => {
    const repo = model();
    repo.definitions.kg = unit('kg', '  ', 'nowhere', 'Kilogram');
    expect(codes(repo)).toEqual(expect.arrayContaining(['EMPTY_UNIT_SYMBOL', 'MISSING_QUANTITY_KIND']));
  });

  it('warns when the unit measures a different quantity kind than the ValueType declares', () => {
    const repo = model();
    repo.definitions.qkLength = quantityKind('qkLength', 'Length');
    repo.definitions.mass = valueType('mass', { unitId: 'kg', quantityKindId: 'qkLength' });
    const diagnostic = validateSysmlRepository(repo).diagnostics.find(d => d.code === 'UNIT_QUANTITY_KIND_MISMATCH');
    expect(diagnostic?.severity).toBe('warning');
    expect(codes(model())).not.toContain('UNIT_QUANTITY_KIND_MISMATCH');
  });

  it('does not warn when the ValueType declares no quantity kind of its own', () => {
    const repo = model();
    repo.definitions.mass = valueType('mass', { unitId: 'kg' });
    expect(codes(repo)).not.toContain('UNIT_QUANTITY_KIND_MISMATCH');
  });
});

describe('load-time linking of free-text ValueType units', () => {
  const legacy = (): SysmlRepository => {
    const repo = createEmptyRepository();
    repo.definitions.kg = unit('kg', 'kg', undefined, 'Kilogram');
    repo.definitions.metre = unit('metre', 'm', undefined, 'Metre');
    repo.definitions.byName = valueType('byName', { unit: 'metre' });
    repo.definitions.bySymbol = valueType('bySymbol', { unit: 'kg' });
    repo.definitions.unknown = valueType('unknown', { unit: 'furlong' });
    repo.definitions.explicit = valueType('explicit', { unit: 'kg', unitId: 'metre' });
    return repo;
  };

  it('links by symbol or name, leaves unknown text and explicit links alone, and never creates Units', () => {
    const loaded = loadRepository(serializeRepository(legacy()));
    const defs = loaded.repository.definitions;
    expect((defs.byName as ValueTypeDefinition).unitId).toBe('metre');
    expect((defs.bySymbol as ValueTypeDefinition).unitId).toBe('kg');
    expect((defs.unknown as ValueTypeDefinition).unitId).toBeUndefined();
    expect((defs.unknown as ValueTypeDefinition).unit).toBe('furlong');
    expect((defs.explicit as ValueTypeDefinition).unitId).toBe('metre');
    expect(Object.values(defs).filter(d => d.kind === 'unit')).toHaveLength(2);
    const info = loaded.diagnostics.find(d => d.code === 'VALUE_TYPE_UNITS_LINKED');
    expect(info?.severity).toBe('info');
    expect(info?.message).toContain('2 ');
    expect(loaded.migrated).toBe(true);
  });

  it('is idempotent: a second load changes nothing and reports nothing', () => {
    const first = loadRepository(serializeRepository(legacy()));
    const second = loadRepository(serializeRepository(first.repository));
    expect(second.repository.definitions).toEqual(first.repository.definitions);
    expect(second.diagnostics.map(d => d.code)).not.toContain('VALUE_TYPE_UNITS_LINKED');
  });

  it('does not link when the text matches more than one Unit', () => {
    const repo = legacy();
    repo.definitions.kg2 = unit('kg2', 'kg', undefined, 'Kilogram force');
    const loaded = loadRepository(serializeRepository(repo));
    expect((loaded.repository.definitions.bySymbol as ValueTypeDefinition).unitId).toBeUndefined();
  });

  it('carries an existing baseline through the link instead of marking the value type modified', () => {
    const { repository: withBaseline } = createBaseline(legacy(), { id: 'b1', name: 'Baseline 1' });
    const loaded = loadRepository(serializeRepository(withBaseline));
    expect((loaded.repository.definitions.byName as ValueTypeDefinition).unitId).toBe('metre');
    const { repository: later } = createBaseline(loaded.repository, { id: 'b2', name: 'Baseline 2' });
    expect(compareBaselines(later, 'b1', 'b2').changed).not.toContain('byName');
  });
});

describe('value property rows show the resolved Unit', () => {
  it('resolves a ValueType measure, falling back to the Unit quantity kind', () => {
    const repo = model();
    repo.definitions.mass = valueType('mass', { unitId: 'kg' });
    const measure = resolveValueTypeMeasure(repo, 'mass');
    expect(measure.unit?.id).toBe('kg');
    expect(measure.quantityKind?.id).toBe('qkMass');
    expect(resolveValueTypeMeasure(repo, 'car')).toEqual({});
    expect(resolvedPropertyUnitSymbol(repo, 'mass')).toBe('kg');
    expect(resolvedPropertyUnitSymbol(repo, undefined)).toBeUndefined();
  });

  const propertyOf = (repo: SysmlRepository) => {
    const view = projectLegacyDiagram(repo);
    return view.blocks.find(block => block.id === 'car')!.properties[0];
  };

  it('prints {unit=<symbol>} from the resolved Unit on a BDD value property row', () => {
    const property = propertyOf(model());
    expect(property.unit).toBe('kg');
    expect(formatLegacyProperty(property)).toContain('{unit=kg}');
  });

  it('falls back to the legacy text when the type has no Unit', () => {
    const repo = model();
    (repo.definitions.car as BlockDefinition).properties[0].unit = 'lb';
    repo.definitions.mass = valueType('mass');
    expect(formatLegacyProperty(propertyOf(repo))).toContain('{unit=lb}');
  });
});

describe('inspector exposes Unit and QuantityKind as references', () => {
  const schema = (id: string) => getInspectorSchema({ repository: migrateV3ToV4(model()), elementId: id })!;

  it('gives a ValueType Unit and Quantity Kind pickers that list only those elements', () => {
    const fields = schema('mass').fields;
    const unitField = fields.find(f => f.key === 'unitId')!;
    expect(unitField.valueType).toBe('select');
    expect(unitField.options!.map(o => o.value)).toEqual(['', 'kg']);
    expect(fields.find(f => f.key === 'quantityKindId')!.options!.map(o => o.value)).toEqual(['', 'qkMass']);
    expect(unitField.toCommand!('')).toMatchObject({ type: 'UpdateElement', elementId: 'mass', patch: { unitId: undefined } });
    expect(unitField.toCommand!('kg')).toMatchObject({ patch: { unitId: 'kg' } });
  });

  it('gives a Unit a symbol and a Quantity Kind picker', () => {
    const fields = schema('kg').fields;
    expect(fields.find(f => f.key === 'symbol')!.value).toBe('kg');
    expect(fields.find(f => f.key === 'symbol')!.validate!('  ')).toMatchObject({ valid: false });
    expect(fields.find(f => f.key === 'quantityKindId')!.value).toBe('qkMass');
  });

  it('gives a QuantityKind a symbol and a description', () => {
    expect(schema('qkMass').fields.map(f => f.key)).toEqual(expect.arrayContaining(['symbol', 'description']));
  });
});
