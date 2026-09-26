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
  UseCaseDefinition,
  SysmlRepository,
} from '../../../engine/sysml/model';
import type {
  Block,
  InterfaceBlock,
  Requirement,
  TestCase,
  PartProperty,
  ValueProperty,
  Port,
  ValueType,
  UseCase,
} from '../../../engine/sysml/domain';
import { createSemanticElement } from '../../../engine/sysml/services/elementFactory';
import { createEmptyRepository } from '../../../engine/sysml/model';

const DUMMY_REPO: SysmlRepository = createEmptyRepository();

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
  const chosenId = options.id ?? generateId('pkg');
  const outcome = createSemanticElement(
    {
      metaclass: 'Package',
      id: chosenId,
      name: options.name,
      ownerId: options.ownerId,
    },
    DUMMY_REPO
  );
  const el = outcome.ok ? outcome.element : null;
  return {
    id: el?.id ?? chosenId,
    name: el?.name ?? options.name ?? 'Package',
    kind: 'package',
    namespace: el?.namespace ?? [],
    ownerId: options.ownerId,
  };
}

export function createBlock(options: {
  id?: string;
  name?: string;
  ownerId: string;
  existingNames?: Iterable<string>;
}): BlockDefinition {
  const chosenId = options.id ?? generateId('blk');
  const outcome = createSemanticElement(
    {
      metaclass: 'Block',
      id: chosenId,
      name: options.name,
      ownerId: options.ownerId,
    },
    DUMMY_REPO
  );
  const el = outcome.ok ? (outcome.element as Block) : null;
  return {
    id: el?.id ?? chosenId,
    name: el?.name ?? options.name ?? 'Block',
    kind: 'block',
    namespace: el?.namespace ?? [],
    ownerId: options.ownerId,
    isAbstract: el?.isAbstract ?? false,
    isLeaf: el?.isLeaf ?? false,
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
  const chosenId = options.id ?? generateId('vt');
  const outcome = createSemanticElement(
    {
      metaclass: 'ValueType',
      id: chosenId,
      name: options.name,
      ownerId: options.ownerId,
    },
    DUMMY_REPO
  );
  const el = outcome.ok ? (outcome.element as ValueType) : null;
  return {
    id: el?.id ?? chosenId,
    name: el?.name ?? options.name ?? 'ValueType',
    kind: 'valueType',
    namespace: el?.namespace ?? [],
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
  const chosenId = options.id ?? generateId('if');
  const outcome = createSemanticElement(
    {
      metaclass: 'InterfaceBlock',
      id: chosenId,
      name: options.name,
      ownerId: options.ownerId,
    },
    DUMMY_REPO
  );
  const el = outcome.ok ? (outcome.element as InterfaceBlock) : null;
  return {
    id: el?.id ?? chosenId,
    name: el?.name ?? options.name ?? 'Interface',
    kind: 'interface',
    namespace: el?.namespace ?? [],
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
  const chosenId = options.id ?? generateId('req');
  const outcome = createSemanticElement(
    {
      metaclass: 'Requirement',
      id: chosenId,
      name: options.name,
      ownerId: options.ownerId,
      text: options.text,
    },
    DUMMY_REPO
  );
  const el = outcome.ok ? (outcome.element as Requirement) : null;
  return {
    id: el?.id ?? chosenId,
    name: el?.name ?? options.name ?? 'Requirement',
    kind: 'requirement',
    namespace: el?.namespace ?? [],
    ownerId: options.ownerId,
    requirementId: el?.requirementId ?? 'REQ-001',
    text: el?.text ?? options.text ?? '',
    status: el?.status ?? 'draft',
    version: el?.version ?? '1.0',
    priority: el?.priority ?? 'medium',
    risk: el?.risk ?? 'low',
  };
}

export function createVerificationCase(options: {
  id?: string;
  name?: string;
  ownerId: string;
  existingNames?: Iterable<string>;
}): VerificationCase {
  const chosenId = options.id ?? generateId('vc');
  const outcome = createSemanticElement(
    {
      metaclass: 'TestCase',
      id: chosenId,
      name: options.name,
      ownerId: options.ownerId,
    },
    DUMMY_REPO
  );
  const el = outcome.ok ? (outcome.element as TestCase) : null;
  return {
    id: el?.id ?? chosenId,
    name: el?.name ?? options.name ?? 'VerificationCase',
    kind: 'verificationCase',
    namespace: el?.namespace ?? [],
    ownerId: options.ownerId,
    method: 'Test',
    verifiesRequirementIds: el?.verifiesRequirementIds ?? [],
  };
}

export function createUseCase(options: {
  id?: string;
  name?: string;
  ownerId: string;
}): UseCaseDefinition {
  const chosenId = options.id ?? generateId('uc');
  const outcome = createSemanticElement(
    {
      metaclass: 'UseCase',
      id: chosenId,
      name: options.name,
      ownerId: options.ownerId,
    },
    DUMMY_REPO
  );
  const el = outcome.ok ? (outcome.element as UseCase) : null;
  return {
    id: el?.id ?? chosenId,
    name: el?.name ?? options.name ?? 'Use Case',
    kind: 'useCase',
    namespace: el?.namespace ?? [],
    ownerId: options.ownerId,
    subjectId: el?.subjectIds?.[0],
    extensionPointIds: el?.extensionPointIds ?? [],
    behaviorArtifactIds: [],
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
  const outcome = createSemanticElement(
    {
      metaclass: 'PartProperty',
      id: options.id,
      name: options.name,
      ownerId: options.ownerId,
      typeId: options.typeId,
    },
    DUMMY_REPO
  );
  const el = outcome.ok ? (outcome.element as PartProperty) : null;
  return {
    id: el?.id ?? options.id ?? generateId('part'),
    name: el?.name ?? options.name ?? 'part',
    kind: 'part',
    ownerId: options.ownerId,
    typeId: options.typeId,
    aggregation: options.aggregation ?? 'composite',
    multiplicity: el?.multiplicity ?? { lower: 1, upper: 1, ordered: false, unique: true },
  };
}

export function createPortDefinition(options: {
  id?: string;
  name?: string;
  kind?: PortDefinition['kind'];
  typeId?: string;
  existingNames?: Iterable<string>;
}): PortDefinition {
  const kind = options.kind ?? 'standard';
  const outcome = createSemanticElement(
    {
      metaclass: 'Port',
      id: options.id,
      name: options.name,
      typeId: options.typeId,
    },
    DUMMY_REPO
  );
  const el = outcome.ok ? (outcome.element as Port) : null;
  return {
    id: el?.id ?? options.id ?? generateId('port'),
    name: el?.name ?? options.name ?? (
      kind === 'proxy' ? 'proxyPort' : kind === 'full' ? 'fullPort' : kind === 'flow' ? 'flowPort' : 'port'
    ),
    kind,
    typeId: el?.typeId ?? options.typeId ?? '',
    direction: el?.direction ?? 'inout',
    isConjugated: false,
    multiplicity: el?.multiplicity ?? { lower: 1, upper: 1, ordered: false, unique: true },
  };
}

export function createValueProperty(options: {
  id?: string;
  name?: string;
  typeId?: string;
  existingNames?: Iterable<string>;
}): PropertyDefinition {
  const outcome = createSemanticElement(
    {
      metaclass: 'ValueProperty',
      id: options.id,
      name: options.name,
      typeId: options.typeId,
    },
    DUMMY_REPO
  );
  const el = outcome.ok ? (outcome.element as ValueProperty) : null;
  return {
    id: el?.id ?? options.id ?? generateId('prop'),
    name: el?.name ?? options.name ?? 'property',
    kind: 'value',
    typeId: el?.typeId ?? options.typeId ?? 'Real',
    multiplicity: el?.multiplicity ?? { lower: 1, upper: 1, ordered: false, unique: true },
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
