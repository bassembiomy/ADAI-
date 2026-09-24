import type {
  MetaclassKind,
  SemanticElement,
  Block,
  InterfaceBlock,
  ConstraintBlock,
  AssociationBlock,
  FlowSpecification,
  DataType,
  ValueType,
  QuantityKind,
  Unit,
  Enumeration,
  Signal,
  Requirement,
  TestCase,
  PartProperty,
  ReferenceProperty,
  ValueProperty,
  ConstraintProperty,
  FlowProperty,
  Port,
  UseCase,
  Activity,
  Operation,
  Package,
} from '../domain';
import type { SysmlRepositoryV4 } from '../domain';
import type { SysmlRepository } from '../model';
import { resolveType } from './typeResolution';
import type { TypeCandidate } from '../commands/commandResult';

export interface CreateElementInput {
  metaclass: MetaclassKind;
  id?: string;
  name?: string;
  ownerId?: string | null;
  namespace?: string[];
  typeId?: string;
  requestedTypeName?: string;
  aggregation?: 'composite' | 'shared' | 'none';
  direction?: 'in' | 'out' | 'inout';
  requirementId?: string;
  text?: string;
  verifiesRequirementIds?: string[];
  isAbstract?: boolean;
  isLeaf?: boolean;
  extra?: Record<string, unknown>;
}

export type CreateElementOutcome =
  | {
      ok: true;
      element: SemanticElement;
    }
  | {
      ok: false;
      code: 'TYPE_NOT_FOUND' | 'INVALID_INPUT';
      message: string;
      searchedType?: string;
      candidates?: TypeCandidate[];
      createNewTypeAction?: {
        actionKind: 'CreateNewType';
        suggestedName: string;
        targetNamespace: string[];
      };
    };

function generateId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function getExistingNames(repo: SysmlRepository | SysmlRepositoryV4): Set<string> {
  const names = new Set<string>();
  if ('elements' in repo) {
    for (const el of Object.values(repo.elements)) {
      if (el.name) names.add(el.name);
    }
  } else {
    for (const def of Object.values(repo.definitions)) {
      if (def.name) names.add(def.name);
    }
    for (const u of Object.values(repo.usages)) {
      if (u.name) names.add(u.name);
    }
  }
  return names;
}

function generateUniqueName(baseName: string, existingNames: Set<string>): string {
  if (!existingNames.has(baseName)) {
    return baseName;
  }
  let index = 1;
  while (existingNames.has(`${baseName}_${index}`)) {
    index += 1;
  }
  return `${baseName}_${index}`;
}

export function createSemanticElement(
  input: CreateElementInput,
  repo: SysmlRepository | SysmlRepositoryV4
): CreateElementOutcome {
  const existingNames = getExistingNames(repo);
  const ownerId = input.ownerId ?? null;
  const namespace = input.namespace ?? [];

  // 1. Resolve type if requested or required
  let resolvedTypeId = input.typeId ?? '';
  if (input.requestedTypeName) {
    const outcome = resolveType(input.requestedTypeName, repo);
    if (!outcome.found) {
      return {
        ok: false,
        code: 'TYPE_NOT_FOUND',
        message: outcome.message,
        searchedType: outcome.searchedType,
        candidates: outcome.candidates,
        createNewTypeAction: outcome.action,
      };
    }
    resolvedTypeId = outcome.element.id;
  }

  const baseName = input.name ?? input.metaclass;
  const finalName = input.name ?? generateUniqueName(baseName, existingNames);
  const elementId = input.id ?? generateId(input.metaclass.toLowerCase().slice(0, 4));

  switch (input.metaclass) {
    case 'Block': {
      const block: Block = {
        id: elementId,
        name: finalName,
        metaclass: 'Block',
        namespace,
        ownerId,
        isAbstract: input.isAbstract ?? false,
        isLeaf: input.isLeaf ?? false,
        ownedPropertyIds: [],
        ownedPortIds: [],
        ownedOperationIds: [],
        ownedConstraintIds: [],
      };
      return { ok: true, element: block };
    }

    case 'InterfaceBlock': {
      const ib: InterfaceBlock = {
        id: elementId,
        name: finalName,
        metaclass: 'InterfaceBlock',
        namespace,
        ownerId,
        isAbstract: input.isAbstract ?? false,
        isLeaf: input.isLeaf ?? false,
        flowPropertyIds: [],
        providedInterfaceIds: [],
        requiredInterfaceIds: [],
      };
      return { ok: true, element: ib };
    }

    case 'ConstraintBlock': {
      const cb: ConstraintBlock = {
        id: elementId,
        name: finalName,
        metaclass: 'ConstraintBlock',
        namespace,
        ownerId,
        isAbstract: input.isAbstract ?? false,
        isLeaf: input.isLeaf ?? false,
        constraintIds: [],
      };
      return { ok: true, element: cb };
    }

    case 'AssociationBlock': {
      const ab: AssociationBlock = {
        id: elementId,
        name: finalName,
        metaclass: 'AssociationBlock',
        namespace,
        ownerId,
        associationId: '',
      };
      return { ok: true, element: ab };
    }

    case 'FlowSpecification': {
      const fs: FlowSpecification = {
        id: elementId,
        name: finalName,
        metaclass: 'FlowSpecification',
        namespace,
        ownerId,
        flowPropertyIds: [],
      };
      return { ok: true, element: fs };
    }

    case 'Package':
    case 'Model': {
      const pkg: Package = {
        id: elementId,
        name: finalName,
        metaclass: input.metaclass,
        namespace,
        ownerId,
      };
      return { ok: true, element: pkg };
    }

    case 'DataType': {
      const dt: DataType = {
        id: elementId,
        name: finalName,
        metaclass: 'DataType',
        namespace,
        ownerId,
      };
      return { ok: true, element: dt };
    }

    case 'ValueType': {
      const vt: ValueType = {
        id: elementId,
        name: finalName,
        metaclass: 'ValueType',
        namespace,
        ownerId,
      };
      return { ok: true, element: vt };
    }

    case 'QuantityKind': {
      const qk: QuantityKind = {
        id: elementId,
        name: finalName,
        metaclass: 'QuantityKind',
        namespace,
        ownerId,
      };
      return { ok: true, element: qk };
    }

    case 'Unit': {
      const u: Unit = {
        id: elementId,
        name: finalName,
        metaclass: 'Unit',
        namespace,
        ownerId,
      };
      return { ok: true, element: u };
    }

    case 'Enumeration': {
      const en: Enumeration = {
        id: elementId,
        name: finalName,
        metaclass: 'Enumeration',
        namespace,
        ownerId,
        literalIds: [],
      };
      return { ok: true, element: en };
    }

    case 'Signal': {
      const sig: Signal = {
        id: elementId,
        name: finalName,
        metaclass: 'Signal',
        namespace,
        ownerId,
      };
      return { ok: true, element: sig };
    }

    case 'Requirement': {
      const reqNum = Math.floor(100 + Math.random() * 900);
      const req: Requirement = {
        id: elementId,
        name: finalName,
        metaclass: 'Requirement',
        namespace,
        ownerId,
        requirementId: input.requirementId ?? `REQ-${reqNum}`,
        text: input.text ?? '',
        status: 'draft',
        version: '1.0',
        priority: 'medium',
        risk: 'low',
      };
      return { ok: true, element: req };
    }

    case 'TestCase': {
      const tc: TestCase = {
        id: elementId,
        name: finalName,
        metaclass: 'TestCase',
        namespace,
        ownerId,
        verifiesRequirementIds: input.verifiesRequirementIds ?? [],
        testCaseKind: 'test',
        status: 'draft',
      };
      return { ok: true, element: tc };
    }

    case 'PartProperty': {
      const part: PartProperty = {
        id: elementId,
        name: finalName,
        metaclass: 'PartProperty',
        namespace,
        ownerId,
        typeId: resolvedTypeId,
        aggregation: 'composite',
        multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
      };
      return { ok: true, element: part };
    }

    case 'ReferenceProperty': {
      const ref: ReferenceProperty = {
        id: elementId,
        name: finalName,
        metaclass: 'ReferenceProperty',
        namespace,
        ownerId,
        typeId: resolvedTypeId,
        aggregation: input.aggregation === 'shared' ? 'shared' : 'none',
        multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
      };
      return { ok: true, element: ref };
    }

    case 'ValueProperty': {
      const vp: ValueProperty = {
        id: elementId,
        name: finalName,
        metaclass: 'ValueProperty',
        namespace,
        ownerId,
        typeId: resolvedTypeId || 'Real',
        multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
      };
      return { ok: true, element: vp };
    }

    case 'ConstraintProperty': {
      const cp: ConstraintProperty = {
        id: elementId,
        name: finalName,
        metaclass: 'ConstraintProperty',
        namespace,
        ownerId,
        typeId: resolvedTypeId,
        multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
      };
      return { ok: true, element: cp };
    }

    case 'FlowProperty': {
      const fp: FlowProperty = {
        id: elementId,
        name: finalName,
        metaclass: 'FlowProperty',
        namespace,
        ownerId,
        typeId: resolvedTypeId,
        direction: input.direction ?? 'inout',
        multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
      };
      return { ok: true, element: fp };
    }

    case 'Port': {
      // Normative UML Port without implicit SysML stereotypes
      const port: Port = {
        id: elementId,
        name: finalName,
        metaclass: 'Port',
        namespace,
        ownerId,
        typeId: resolvedTypeId,
        direction: input.direction ?? 'inout',
        isConjugated: false,
        isBehavior: false,
        isService: true,
        multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
      };
      return { ok: true, element: port };
    }

    case 'UseCase': {
      const uc: UseCase = {
        id: elementId,
        name: finalName,
        metaclass: 'UseCase',
        namespace,
        ownerId,
        subjectIds: [],
        extensionPointIds: [],
      };
      return { ok: true, element: uc };
    }

    case 'Activity': {
      const act: Activity = {
        id: elementId,
        name: finalName,
        metaclass: 'Activity',
        namespace,
        ownerId,
        parameterIds: [],
        nodeIds: [],
        partitionIds: [],
      };
      return { ok: true, element: act };
    }

    case 'Operation': {
      const op: Operation = {
        id: elementId,
        name: finalName,
        metaclass: 'Operation',
        namespace,
        ownerId,
        parameterIds: [],
      };
      return { ok: true, element: op };
    }

    default: {
      const generic: SemanticElement = {
        id: elementId,
        name: finalName,
        metaclass: input.metaclass,
        namespace,
        ownerId,
      };
      return { ok: true, element: generic };
    }
  }
}
