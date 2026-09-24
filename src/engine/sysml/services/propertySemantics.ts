import type {
  Multiplicity,
  Property,
  PartProperty,
  ReferenceProperty,
  ValueProperty,
  ConstraintProperty,
  FlowProperty,
  SysmlRepositoryV4,
  ValueSpecification,
} from '../domain';

export type PropertyKind =
  | 'PartProperty'
  | 'ReferenceProperty'
  | 'ValueProperty'
  | 'ConstraintProperty'
  | 'FlowProperty';

export interface CreateTypedPropertyOptions {
  id: string;
  name: string;
  propertyKind: PropertyKind;
  ownerId: string;
  typeId: string;
  multiplicity: Multiplicity;
  aggregation?: 'composite' | 'none' | 'shared';
  defaultValue?: ValueSpecification;
  isStatic?: boolean;
  isReadOnly?: boolean;
  isDerived?: boolean;
  redefinesId?: string;
  subsetsId?: string;
  // Specific fields
  associationId?: string;
  quantityKindId?: string;
  unitId?: string;
  constraintBlockId?: string;
  direction?: 'in' | 'out' | 'inout';
}

export function createTypedProperty(options: CreateTypedPropertyOptions): Property {
  const base = {
    id: options.id,
    name: options.name,
    namespace: [],
    ownerId: options.ownerId,
    typeId: options.typeId,
    multiplicity: options.multiplicity,
    defaultValue: options.defaultValue,
    isStatic: options.isStatic,
    isReadOnly: options.isReadOnly,
    isDerived: options.isDerived,
    redefinesId: options.redefinesId,
    subsetsId: options.subsetsId,
  };

  switch (options.propertyKind) {
    case 'PartProperty': {
      const part: PartProperty = {
        ...base,
        metaclass: 'PartProperty',
        aggregation: 'composite',
      };
      return part;
    }
    case 'ReferenceProperty': {
      const ref: ReferenceProperty = {
        ...base,
        metaclass: 'ReferenceProperty',
        aggregation: options.aggregation ?? 'none',
        associationId: options.associationId,
      };
      return ref;
    }
    case 'ValueProperty': {
      const val: ValueProperty = {
        ...base,
        metaclass: 'ValueProperty',
        quantityKindId: options.quantityKindId,
        unitId: options.unitId,
      };
      return val;
    }
    case 'ConstraintProperty': {
      const constr: ConstraintProperty = {
        ...base,
        metaclass: 'ConstraintProperty',
        constraintBlockId: options.constraintBlockId ?? options.typeId,
      };
      return constr;
    }
    case 'FlowProperty': {
      const flow: FlowProperty = {
        ...base,
        metaclass: 'FlowProperty',
        direction: options.direction ?? 'inout',
      };
      return flow;
    }
  }
}

export function formatValueSpecification(spec?: ValueSpecification): string {
  if (!spec) return '';
  switch (spec.kind) {
    case 'literalString':
      return `"${spec.value}"`;
    case 'literalInteger':
    case 'literalReal':
      return String(spec.value);
    case 'literalBoolean':
      return spec.value ? 'true' : 'false';
    case 'opaqueExpression':
      return spec.body;
    case 'instanceValue':
      return spec.instanceId;
  }
}

export interface PropertyValidationResult {
  valid: boolean;
  diagnostics: string[];
}

export function validateProperty(
  repo: SysmlRepositoryV4,
  property: Property
): PropertyValidationResult {
  const diagnostics: string[] = [];

  const targetType = repo.elements[property.typeId];
  if (!targetType) {
    diagnostics.push('PROPERTY_TYPE_NOT_FOUND');
    return { valid: false, diagnostics };
  }

  const owner = property.ownerId ? repo.elements[property.ownerId] : null;

  switch (property.metaclass) {
    case 'PartProperty': {
      if (targetType.metaclass !== 'Block') {
        diagnostics.push('PART_PROPERTY_TYPE_MUST_BE_BLOCK');
      }
      if (property.aggregation !== 'composite') {
        diagnostics.push('PART_PROPERTY_MUST_BE_COMPOSITE');
      }
      break;
    }
    case 'ReferenceProperty': {
      if (targetType.metaclass !== 'Block' && targetType.metaclass !== 'InterfaceBlock') {
        diagnostics.push('REFERENCE_PROPERTY_TYPE_MUST_BE_BLOCK_OR_INTERFACE_BLOCK');
      }
      if (property.aggregation === 'composite') {
        diagnostics.push('REFERENCE_PROPERTY_CANNOT_BE_COMPOSITE');
      }
      break;
    }
    case 'ValueProperty': {
      if (targetType.metaclass !== 'ValueType' && targetType.metaclass !== 'DataType' && targetType.metaclass !== 'Enumeration') {
        diagnostics.push('VALUE_PROPERTY_TYPE_MUST_BE_VALUETYPE_OR_DATATYPE');
      }
      break;
    }
    case 'ConstraintProperty': {
      if (targetType.metaclass !== 'ConstraintBlock') {
        diagnostics.push('CONSTRAINT_PROPERTY_TYPE_MUST_BE_CONSTRAINT_BLOCK');
      }
      break;
    }
    case 'FlowProperty': {
      const legalTypes = ['ValueType', 'DataType', 'Block', 'Signal'];
      if (!legalTypes.includes(targetType.metaclass)) {
        diagnostics.push('FLOW_PROPERTY_TYPE_INVALID');
      }
      if (owner && owner.metaclass !== 'InterfaceBlock' && owner.metaclass !== 'Block') {
        diagnostics.push('FLOW_PROPERTY_OWNER_MUST_BE_INTERFACE_BLOCK_OR_BLOCK');
      }
      break;
    }
  }

  return {
    valid: diagnostics.length === 0,
    diagnostics,
  };
}
