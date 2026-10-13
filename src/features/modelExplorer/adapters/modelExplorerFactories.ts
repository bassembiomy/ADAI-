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
  ActorDefinition,
  SubjectDefinition,
  ExtensionPoint,
  SysmlRepository,
  EnumerationDefinition,
  SignalDefinition,
  ConstraintBlockDefinition,
  QuantityKindDefinition,
  UnitDefinition,
  ViewDefinition,
  ActivityDefinition,
  InteractionDefinition,
  ViewpointDefinition,
  StakeholderDefinition,
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
  stereotype?: PackageDefinition['stereotype'];
}): PackageDefinition {
  const chosenId = options.id ?? generateId('pkg');
  const baseName = options.stereotype === 'modelLibrary' ? 'ModelLibrary' : 'Package';
  const chosenName = options.name ?? (options.existingNames ? generateUniqueName(baseName, options.existingNames) : baseName);
  const outcome = createSemanticElement(
    {
      metaclass: 'Package',
      id: chosenId,
      name: chosenName,
      ownerId: options.ownerId,
    },
    DUMMY_REPO
  );
  const el = outcome.ok ? outcome.element : null;
  return {
    id: el?.id ?? chosenId,
    name: el?.name ?? chosenName,
    kind: 'package',
    namespace: el?.namespace ?? [],
    ownerId: options.ownerId,
    ...(options.stereotype ? { stereotype: options.stereotype } : {}),
  };
}

export function createBlock(options: {
  id?: string;
  name?: string;
  ownerId: string;
  existingNames?: Iterable<string>;
}): BlockDefinition {
  const chosenId = options.id ?? generateId('blk');
  const chosenName = options.name ?? (options.existingNames ? generateUniqueName('Block', options.existingNames) : 'Block');
  const outcome = createSemanticElement(
    {
      metaclass: 'Block',
      id: chosenId,
      name: chosenName,
      ownerId: options.ownerId,
    },
    DUMMY_REPO
  );
  const el = outcome.ok ? (outcome.element as Block) : null;
  return {
    id: el?.id ?? chosenId,
    name: el?.name ?? chosenName,
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
  const chosenName = options.name ?? (options.existingNames ? generateUniqueName('ValueType', options.existingNames) : 'ValueType');
  const outcome = createSemanticElement(
    {
      metaclass: 'ValueType',
      id: chosenId,
      name: chosenName,
      ownerId: options.ownerId,
    },
    DUMMY_REPO
  );
  const el = outcome.ok ? (outcome.element as ValueType) : null;
  return {
    id: el?.id ?? chosenId,
    name: el?.name ?? chosenName,
    kind: 'valueType',
    namespace: el?.namespace ?? [],
    ownerId: options.ownerId,
    unit: options.unit,
    dimension: options.dimension,
  };
}

export function createEnumeration(options: {
  id?: string;
  name?: string;
  ownerId: string;
  existingNames?: Iterable<string>;
  literals?: string[];
}): EnumerationDefinition {
  const name = options.name ?? (options.existingNames ? generateUniqueName('Enumeration', options.existingNames) : 'Enumeration');
  return { id: options.id ?? generateId('enum'), name, kind: 'enumeration', namespace: [], ownerId: options.ownerId, literals: options.literals ?? [] };
}

export function createSignal(options: {
  id?: string;
  name?: string;
  ownerId: string;
  existingNames?: Iterable<string>;
}): SignalDefinition {
  const name = options.name ?? (options.existingNames ? generateUniqueName('Signal', options.existingNames) : 'Signal');
  return { id: options.id ?? generateId('sig'), name, kind: 'signal', namespace: [], ownerId: options.ownerId };
}

export function createQuantityKind(options: {
  id?: string;
  name?: string;
  ownerId: string;
  existingNames?: Iterable<string>;
  symbol?: string;
}): QuantityKindDefinition {
  const name = options.name ?? (options.existingNames ? generateUniqueName('QuantityKind', options.existingNames) : 'QuantityKind');
  return { id: options.id ?? generateId('qk'), name, kind: 'quantityKind', namespace: [], ownerId: options.ownerId, symbol: options.symbol };
}

/** A Unit needs a symbol (validated), so a new one starts with its name as the symbol until the user edits it. */
export function createUnit(options: {
  id?: string;
  name?: string;
  ownerId: string;
  existingNames?: Iterable<string>;
  symbol?: string;
  quantityKindId?: string;
}): UnitDefinition {
  const name = options.name ?? (options.existingNames ? generateUniqueName('Unit', options.existingNames) : 'Unit');
  return {
    id: options.id ?? generateId('unit'), name, kind: 'unit', namespace: [], ownerId: options.ownerId,
    symbol: options.symbol ?? name, quantityKindId: options.quantityKindId,
  };
}

export function createView(options: {
  id?: string;
  name?: string;
  ownerId: string;
  existingNames?: Iterable<string>;
}): ViewDefinition {
  const name = options.name ?? (options.existingNames ? generateUniqueName('View', options.existingNames) : 'View');
  return { id: options.id ?? generateId('view'), name, kind: 'view', namespace: [], ownerId: options.ownerId };
}

export function createViewpoint(options: {
  id?: string;
  name?: string;
  ownerId: string;
  existingNames?: Iterable<string>;
}): ViewpointDefinition {
  const name = options.name ?? (options.existingNames ? generateUniqueName('Viewpoint', options.existingNames) : 'Viewpoint');
  return {
    id: options.id ?? generateId('vpt'), name, kind: 'viewpoint', namespace: [], ownerId: options.ownerId,
    stakeholderIds: [], concernIds: [], concerns: [], purpose: '', languages: [], presentation: [],
  };
}

export function createStakeholder(options: {
  id?: string;
  name?: string;
  ownerId: string;
  existingNames?: Iterable<string>;
}): StakeholderDefinition {
  const name = options.name ?? (options.existingNames ? generateUniqueName('Stakeholder', options.existingNames) : 'Stakeholder');
  return { id: options.id ?? generateId('stk'), name, kind: 'stakeholder', namespace: [], ownerId: options.ownerId, concerns: [] };
}

export function createConstraintBlock(options: {
  id?: string;
  name?: string;
  ownerId: string;
  existingNames?: Iterable<string>;
  parameters?: ConstraintBlockDefinition['parameters'];
  constraints?: string[];
}): ConstraintBlockDefinition {
  const name = options.name ?? (options.existingNames ? generateUniqueName('ConstraintBlock', options.existingNames) : 'ConstraintBlock');
  return {
    id: options.id ?? generateId('cblk'), name, kind: 'constraintBlock', namespace: [], ownerId: options.ownerId,
    parameters: options.parameters ?? [], constraints: options.constraints ?? [],
  };
}

export function createActivity(options: {
  id?: string;
  name?: string;
  ownerId: string;
  existingNames?: Iterable<string>;
}): ActivityDefinition {
  const name = options.name ?? (options.existingNames ? generateUniqueName('Activity', options.existingNames) : 'Activity');
  return {
    id: options.id ?? generateId('act'), name, kind: 'activity', namespace: [], ownerId: options.ownerId,
    parameters: [], nodes: [], edges: [], partitions: [],
  };
}

export function createInteraction(options: {
  id?: string;
  name?: string;
  ownerId: string;
  existingNames?: Iterable<string>;
}): InteractionDefinition {
  const name = options.name ?? (options.existingNames ? generateUniqueName('Interaction', options.existingNames) : 'Interaction');
  return {
    id: options.id ?? generateId('int'), name, kind: 'interaction', namespace: [], ownerId: options.ownerId,
    lifelines: [], messages: [], fragments: [],
  };
}

export function createInterface(options: {
  id?: string;
  name?: string;
  ownerId: string;
  existingNames?: Iterable<string>;
}): InterfaceDefinition {
  const chosenId = options.id ?? generateId('if');
  const chosenName = options.name ?? (options.existingNames ? generateUniqueName('Interface', options.existingNames) : 'Interface');
  const outcome = createSemanticElement(
    {
      metaclass: 'InterfaceBlock',
      id: chosenId,
      name: chosenName,
      ownerId: options.ownerId,
    },
    DUMMY_REPO
  );
  const el = outcome.ok ? (outcome.element as InterfaceBlock) : null;
  return {
    id: el?.id ?? chosenId,
    name: el?.name ?? chosenName,
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
  const chosenName = options.name ?? (options.existingNames ? generateUniqueName('Requirement', options.existingNames) : 'Requirement');
  const outcome = createSemanticElement(
    {
      metaclass: 'Requirement',
      id: chosenId,
      name: chosenName,
      ownerId: options.ownerId,
      text: options.text,
    },
    DUMMY_REPO
  );
  const el = outcome.ok ? (outcome.element as Requirement) : null;
  return {
    id: el?.id ?? chosenId,
    name: el?.name ?? chosenName,
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
  const chosenName = options.name ?? (options.existingNames ? generateUniqueName('VerificationCase', options.existingNames) : 'VerificationCase');
  const outcome = createSemanticElement(
    {
      metaclass: 'TestCase',
      id: chosenId,
      name: chosenName,
      ownerId: options.ownerId,
    },
    DUMMY_REPO
  );
  const el = outcome.ok ? (outcome.element as TestCase) : null;
  return {
    id: el?.id ?? chosenId,
    name: el?.name ?? chosenName,
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
  existingNames?: Iterable<string>;
}): UseCaseDefinition {
  const chosenId = options.id ?? generateId('uc');
  const chosenName = options.name ?? (options.existingNames ? generateUniqueName('UseCase', options.existingNames) : 'Use Case');
  const outcome = createSemanticElement(
    {
      metaclass: 'UseCase',
      id: chosenId,
      name: chosenName,
      ownerId: options.ownerId,
    },
    DUMMY_REPO
  );
  const el = outcome.ok ? (outcome.element as UseCase) : null;
  return {
    id: el?.id ?? chosenId,
    name: el?.name ?? chosenName,
    kind: 'useCase',
    namespace: el?.namespace ?? [],
    ownerId: options.ownerId,
    subjectId: el?.subjectIds?.[0],
    extensionPointIds: el?.extensionPointIds ?? [],
    behaviorArtifactIds: [],
  };
}

export function createActor(options: {
  id?: string;
  name?: string;
  ownerId: string;
  existingNames?: Iterable<string>;
  isExternal?: boolean;
}): ActorDefinition {
  return {
    id: options.id ?? generateId('actor'),
    name: options.name ?? (options.existingNames ? generateUniqueName('Actor', options.existingNames) : 'Actor'),
    kind: 'actor',
    namespace: [],
    ownerId: options.ownerId,
    isExternal: options.isExternal ?? true,
    generalizationIds: [],
  };
}

export function createSubject(options: {
  id?: string;
  name?: string;
  ownerId: string;
  existingNames?: Iterable<string>;
}): SubjectDefinition {
  return {
    id: options.id ?? generateId('subject'),
    name: options.name ?? (options.existingNames ? generateUniqueName('Subject', options.existingNames) : 'Subject'),
    kind: 'subject',
    namespace: [],
    ownerId: options.ownerId,
  };
}

export function createExtensionPoint(options: {
  id?: string;
  name?: string;
  useCaseId: string;
  existingNames?: Iterable<string>;
  location?: string;
}): ExtensionPoint {
  return {
    id: options.id ?? generateId('ep'),
    name: options.name ?? (options.existingNames ? generateUniqueName('extensionPoint', options.existingNames) : 'extensionPoint'),
    kind: 'extensionPoint',
    namespace: [],
    useCaseId: options.useCaseId,
    ...(options.location ? { location: options.location } : {}),
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
  diagramKind: ModelDiagramDefinition['diagramKind'];
  existingNames?: Iterable<string>;
  contextElementId?: string;
}): ModelDiagramDefinition {
  const defaultBase = options.diagramKind === 'useCase' ? 'UseCaseDiagram'
    : options.diagramKind === 'activity' ? 'ActivityDiagram'
    : options.diagramKind === 'sequence' ? 'SequenceDiagram'
    : options.diagramKind.toUpperCase();
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
