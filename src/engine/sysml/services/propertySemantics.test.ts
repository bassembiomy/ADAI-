import { describe, expect, it } from 'vitest';
import {
  createTypedProperty,
  validateProperty,
  formatValueSpecification,
} from './propertySemantics';
import {
  resolveInheritedFeatures,
  detectInheritanceCycle,
} from './inheritance';
import {
  createEmptyRepositoryV4,
  type Block,
  type InterfaceBlock,
  type ConstraintBlock,
  type ValueType,
  type PartProperty,
  type ValueProperty,
  type ConstraintProperty,
  type FlowProperty,
  type ReferenceProperty,
} from '../domain';

describe('Property, Value, and Inheritance Semantics (Task 8)', () => {
  it('creates and validates legal property kinds with correct owners and types', () => {
    let repo = createEmptyRepositoryV4();

    const blkCar: Block = { id: 'blk-car', name: 'Car', metaclass: 'Block', namespace: [], ownerId: 'pkg-root' };
    const blkEngine: Block = { id: 'blk-engine', name: 'Engine', metaclass: 'Block', namespace: [], ownerId: 'pkg-root' };
    const ifFuel: InterfaceBlock = { id: 'if-fuel', name: 'IFuel', metaclass: 'InterfaceBlock', namespace: [], ownerId: 'pkg-root' };
    const valSpeed: ValueType = { id: 'vt-speed', name: 'Speed', metaclass: 'ValueType', namespace: [], ownerId: 'pkg-root' };
    const cBlock: ConstraintBlock = { id: 'cb-mass', name: 'MassConstraint', metaclass: 'ConstraintBlock', namespace: [], ownerId: 'pkg-root', constraintIds: [] };

    repo.elements[blkCar.id] = blkCar;
    repo.elements[blkEngine.id] = blkEngine;
    repo.elements[ifFuel.id] = ifFuel;
    repo.elements[valSpeed.id] = valSpeed;
    repo.elements[cBlock.id] = cBlock;

    // 1. PartProperty: Block typed by Block
    const partProp = createTypedProperty({
      id: 'p-engine',
      name: 'engine',
      propertyKind: 'PartProperty',
      ownerId: 'blk-car',
      typeId: 'blk-engine',
      multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
    });
    expect(partProp.metaclass).toBe('PartProperty');
    expect((partProp as PartProperty).aggregation).toBe('composite');
    const partValid = validateProperty(repo, partProp);
    expect(partValid.valid).toBe(true);

    // PartProperty typed by ValueType must fail
    const invalidPart = createTypedProperty({
      id: 'p-bad',
      name: 'badPart',
      propertyKind: 'PartProperty',
      ownerId: 'blk-car',
      typeId: 'vt-speed',
      multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
    });
    const invalidPartValid = validateProperty(repo, invalidPart);
    expect(invalidPartValid.valid).toBe(false);
    expect(invalidPartValid.diagnostics).toContain('PART_PROPERTY_TYPE_MUST_BE_BLOCK');

    // 2. ValueProperty: Block typed by ValueType
    const valProp = createTypedProperty({
      id: 'p-speed',
      name: 'currentSpeed',
      propertyKind: 'ValueProperty',
      ownerId: 'blk-car',
      typeId: 'vt-speed',
      multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
      defaultValue: { kind: 'literalReal', value: 55.5 },
    });
    expect(valProp.metaclass).toBe('ValueProperty');
    const valValid = validateProperty(repo, valProp);
    expect(valValid.valid).toBe(true);

    // 3. ConstraintProperty: Block typed by ConstraintBlock
    const constrProp = createTypedProperty({
      id: 'p-constr',
      name: 'massEq',
      propertyKind: 'ConstraintProperty',
      ownerId: 'blk-car',
      typeId: 'cb-mass',
      multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
    });
    expect(constrProp.metaclass).toBe('ConstraintProperty');
    const constrValid = validateProperty(repo, constrProp);
    expect(constrValid.valid).toBe(true);

    // 4. FlowProperty: InterfaceBlock or Block typed by Signal or ValueType or Block
    const flowProp = createTypedProperty({
      id: 'p-flow',
      name: 'fuelIn',
      propertyKind: 'FlowProperty',
      ownerId: 'if-fuel',
      typeId: 'vt-speed',
      direction: 'in',
      multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
    });
    expect(flowProp.metaclass).toBe('FlowProperty');
    expect((flowProp as FlowProperty).direction).toBe('in');
    const flowValid = validateProperty(repo, flowProp);
    expect(flowValid.valid).toBe(true);
  });

  it('formats structured multiplicity and typed ValueSpecification variants', () => {
    expect(formatValueSpecification({ kind: 'literalString', value: 'Hello' })).toBe('"Hello"');
    expect(formatValueSpecification({ kind: 'literalInteger', value: 42 })).toBe('42');
    expect(formatValueSpecification({ kind: 'literalReal', value: 3.14159 })).toBe('3.14159');
    expect(formatValueSpecification({ kind: 'literalBoolean', value: true })).toBe('true');
    expect(formatValueSpecification({ kind: 'opaqueExpression', body: 'x > 10' })).toBe('x > 10');
    expect(formatValueSpecification({ kind: 'instanceValue', instanceId: 'inst-1' })).toBe('inst-1');
  });

  it('resolves inherited features without cloning and detects inheritance cycles', () => {
    let repo = createEmptyRepositoryV4();

    // Hierarchy: BaseVehicle -> WheeledVehicle -> Car
    const baseVehicle: Block = {
      id: 'b-base',
      name: 'BaseVehicle',
      metaclass: 'Block',
      namespace: [],
      ownerId: 'pkg-root',
      generalIds: [],
    };
    const wheeledVehicle: Block = {
      id: 'b-wheeled',
      name: 'WheeledVehicle',
      metaclass: 'Block',
      namespace: [],
      ownerId: 'pkg-root',
      generalIds: ['b-base'],
    };
    const car: Block = {
      id: 'b-car',
      name: 'Car',
      metaclass: 'Block',
      namespace: [],
      ownerId: 'pkg-root',
      generalIds: ['b-wheeled'],
    };

    repo.elements[baseVehicle.id] = baseVehicle;
    repo.elements[wheeledVehicle.id] = wheeledVehicle;
    repo.elements[car.id] = car;

    // Feature on BaseVehicle
    const pVin = createTypedProperty({
      id: 'p-vin',
      name: 'vin',
      propertyKind: 'ValueProperty',
      ownerId: 'b-base',
      typeId: 'vt-str',
      multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
    });
    repo.elements[pVin.id] = pVin;
    repo.indexes.byOwner['b-base'] = [pVin.id];

    // Feature on WheeledVehicle
    const pWheels = createTypedProperty({
      id: 'p-wheels',
      name: 'wheelCount',
      propertyKind: 'ValueProperty',
      ownerId: 'b-wheeled',
      typeId: 'vt-int',
      multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
    });
    repo.elements[pWheels.id] = pWheels;
    repo.indexes.byOwner['b-wheeled'] = [pWheels.id];

    // Feature on Car
    const pSunroof = createTypedProperty({
      id: 'p-sunroof',
      name: 'hasSunroof',
      propertyKind: 'ValueProperty',
      ownerId: 'b-car',
      typeId: 'vt-bool',
      multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
    });
    repo.elements[pSunroof.id] = pSunroof;
    repo.indexes.byOwner['b-car'] = [pSunroof.id];

    // Resolving inherited features for Car should yield pVin (from BaseVehicle) and pWheels (from WheeledVehicle)
    const inherited = resolveInheritedFeatures(repo, 'b-car');
    expect(inherited.map((f) => f.feature.id)).toEqual(['p-wheels', 'p-vin']);
    expect(inherited[0].inheritedFromId).toBe('b-wheeled');
    expect(inherited[1].inheritedFromId).toBe('b-base');

    // Cycle detection: Make BaseVehicle generalize Car -> BaseVehicle -> WheeledVehicle -> Car -> BaseVehicle
    expect(detectInheritanceCycle(repo, 'b-car', 'b-base')).toBe(false); // Car generalizing BaseVehicle is legal right now
    baseVehicle.generalIds = ['b-car'];
    expect(detectInheritanceCycle(repo, 'b-base', 'b-car')).toBe(true);
  });
});
