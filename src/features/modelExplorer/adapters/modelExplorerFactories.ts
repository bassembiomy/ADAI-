import type {
  BlockDefinition,
  PackageDefinition,
  ValueTypeDefinition,
  InterfaceDefinition,
  RequirementDefinition,
  VerificationCase,
  PartUsage,
  PortDefinition,
  PropertyDefinition,
  ModelDiagramDefinition,
} from '../../../engine/sysml/model';

export function generateUniqueName(baseName: string, existingNames: Iterable<string>): string {
  const set = new Set(existingNames);
  if (!set.has(baseName)) {
    return baseName;
  }
  let index = 1;
  while (set.has(`${baseName}_${index}`)) {
    index += 1;
  }
  return `${baseName}_${index}`;
}

export function generateId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createPackage(options: {
  id?: string;
  name?: string;
  ownerId: string;
  existingNames?: Iterable<string>;
}): PackageDefinition {
  const name = options.name ?? generateUniqueName('Package', options.existingNames ?? []);
  return {
    id: options.id ?? generateId('pkg'),
    name,
    kind: 'package',
    namespace: [],
    ownerId: options.ownerId,
  };
}

export function createBlock(options: {
  id?: string;
  name?: string;
  ownerId: string;
  existingNames?: Iterable<string>;
}): BlockDefinition {
  const name = options.name ?? generateUniqueName('Block', options.existingNames ?? []);
  return {
    id: options.id ?? generateId('blk'),
    name,
    kind: 'block',
    namespace: [],
    ownerId: options.ownerId,
    isAbstract: false,
    isLeaf: false,
    properties: [],
    ports: [],
    operations: [],
    constraints: [],
  };
}

export function createValueType(options: {
  id?: string;
  name?: string;
  ownerId: string;
  existingNames?: Iterable<string>;
  unit?: string;
  dimension?: string;
}): ValueTypeDefinition {
  const name = options.name ?? generateUniqueName('ValueType', options.existingNames ?? []);
  return {
    id: options.id ?? generateId('vt'),
    name,
    kind: 'valueType',
    namespace: [],
    ownerId: options.ownerId,
    unit: options.unit,
    dimension: options.dimension,
  };
}

export function createInterface(options: {
  id?: string;
  name?: string;
  ownerId: string;
  existingNames?: Iterable<string>;
}): InterfaceDefinition {
  const name = options.name ?? generateUniqueName('Interface', options.existingNames ?? []);
  return {
    id: options.id ?? generateId('if'),
    name,
    kind: 'interface',
    namespace: [],
    ownerId: options.ownerId,
    features: [],
  };
}

export function createRequirement(options: {
  id?: string;
  name?: string;
  ownerId: string;
  existingNames?: Iterable<string>;
  text?: string;
}): RequirementDefinition {
  const name = options.name ?? generateUniqueName('Requirement', options.existingNames ?? []);
  const reqNum = Math.floor(100 + Math.random() * 900);
  return {
    id: options.id ?? generateId('req'),
    name,
    kind: 'requirement',
    namespace: [],
    ownerId: options.ownerId,
    requirementId: `REQ-${reqNum}`,
    text: options.text ?? '',
    status: 'draft',
    version: '1.0',
    priority: 'medium',
    risk: 'low',
  };
}

export function createVerificationCase(options: {
  id?: string;
  name?: string;
  ownerId: string;
  existingNames?: Iterable<string>;
}): VerificationCase {
  const name = options.name ?? generateUniqueName('VerificationCase', options.existingNames ?? []);
  return {
    id: options.id ?? generateId('vc'),
    name,
    kind: 'verificationCase',
    namespace: [],
    ownerId: options.ownerId,
    method: 'Test',
    verifiesRequirementIds: [],
  };
}

export function createPartUsage(options: {
  id?: string;
  name?: string;
  ownerId: string;
  typeId: string;
  aggregation?: 'composite' | 'shared' | 'reference';
  existingNames?: Iterable<string>;
}): PartUsage {
  const name = options.name ?? generateUniqueName('part', options.existingNames ?? []);
  return {
    id: options.id ?? generateId('part'),
    name,
    kind: 'part',
    ownerId: options.ownerId,
    typeId: options.typeId,
    aggregation: options.aggregation ?? 'composite',
    multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
  };
}

export function createPortDefinition(options: {
  id?: string;
  name?: string;
  kind?: 'full' | 'proxy';
  typeId?: string;
  existingNames?: Iterable<string>;
}): PortDefinition {
  const kind = options.kind ?? 'proxy';
  const name = options.name ?? generateUniqueName(kind === 'proxy' ? 'proxyPort' : 'fullPort', options.existingNames ?? []);
  return {
    id: options.id ?? generateId('port'),
    name,
    kind,
    typeId: options.typeId ?? '',
    direction: 'inout',
    isConjugated: false,
    multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
  };
}

export function createValueProperty(options: {
  id?: string;
  name?: string;
  typeId?: string;
  existingNames?: Iterable<string>;
}): PropertyDefinition {
  const name = options.name ?? generateUniqueName('property', options.existingNames ?? []);
  return {
    id: options.id ?? generateId('prop'),
    name,
    kind: 'value',
    typeId: options.typeId ?? 'Real',
    multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
  };
}

export function createDiagramDefinition(options: {
  id?: string;
  name?: string;
  ownerId: string;
  diagramKind: 'bdd' | 'ibd' | 'requirements' | 'rtm' | 'stateMachine';
  existingNames?: Iterable<string>;
  contextElementId?: string;
}): ModelDiagramDefinition {
  const defaultBase = options.diagramKind.toUpperCase();
  const name = options.name ?? generateUniqueName(defaultBase, options.existingNames ?? []);
  return {
    id: options.id ?? generateId('diag'),
    name,
    kind: 'diagram',
    diagramKind: options.diagramKind,
    namespace: [],
    ownerId: options.ownerId,
    contextElementId: options.contextElementId,
  };
}
