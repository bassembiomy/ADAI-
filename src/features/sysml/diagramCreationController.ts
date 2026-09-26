import type {
  MetaclassKind,
  SysmlRepositoryV4,
  DiagramPresentation,
  Bounds,
} from '../../engine/sysml/domain';
import {
  dispatchSysmlCommand,
  type CommandContext,
  type CommandResult,
  type SysmlCommand,
  type CreateAndPresentElementCommand,
  type DisplayExistingElementCommand,
} from '../../engine/sysml/commands';
import { evaluateOwnership } from '../../engine/sysml/capabilities';
import { createSemanticElement, type CreateElementInput } from '../../engine/sysml/services/elementFactory';

export interface SysmlGatewayLike {
  repository: SysmlRepositoryV4;
  dispatch?: (command: SysmlCommand, context?: CommandContext) => CommandResult;
}

export interface CreateElementOnDiagramRequest {
  metaclass: MetaclassKind | string;
  diagramId: string;
  name?: string;
  ownerId?: string;
  bounds?: Partial<Bounds>;
  typeId?: string;
  portKind?: 'standardPort' | 'proxyPort' | 'fullPort';
  aggregation?: 'composite' | 'shared' | 'reference';
  [key: string]: any;
}

export interface AddExistingElementToDiagramRequest {
  semanticElementId: string;
  diagramId: string;
  bounds?: Partial<Bounds>;
  presentationId?: string;
}

export interface DiagramControllerResult extends CommandResult {
  affectedIds: string[] & {
    semanticElementId: string;
    presentationId: string;
  };
}

function findLegalOwner(
  requestedOwnerId: string | undefined,
  metaclass: MetaclassKind,
  repo: SysmlRepositoryV4
): { ok: true; ownerId: string } | { ok: false; code: string; message: string } {
  const ownerId = requestedOwnerId ?? 'pkg-root';
  const owner = repo.elements[ownerId];
  if (!owner) {
    return { ok: false, code: 'OWNER_NOT_FOUND', message: `Owner element "${ownerId}" does not exist.` };
  }
  const decision = evaluateOwnership(owner, metaclass);
  return decision.allowed
    ? { ok: true, ownerId }
    : { ok: false, code: decision.code ?? 'ILLEGAL_OWNERSHIP', message: decision.message ?? `${metaclass} cannot be owned by ${owner.metaclass}.` };
}

function normalizeMetaclass(raw: string): MetaclassKind {
  const map: Record<string, MetaclassKind> = {
    block: 'Block',
    requirement: 'Requirement',
    usecase: 'UseCase',
    testcase: 'TestCase',
    activity: 'Activity',
    package: 'Package',
    part: 'PartProperty',
    partproperty: 'PartProperty',
    port: 'Port',
    proxyport: 'Port',
    fullport: 'Port',
    interfaceblock: 'InterfaceBlock',
    valuetype: 'ValueType',
  };
  return map[raw.toLowerCase()] ?? (raw as MetaclassKind);
}

export function createElementOnDiagram(
  request: CreateElementOnDiagramRequest,
  gateway: SysmlGatewayLike
): DiagramControllerResult {
  const repo = gateway.repository;
  const metaclass = normalizeMetaclass(request.metaclass);
  const ownerResult = findLegalOwner(request.ownerId, metaclass, repo);
  if (!ownerResult.ok) {
    const emptyAffected: any = [];
    emptyAffected.semanticElementId = '';
    emptyAffected.presentationId = '';
    return {
      success: false,
      code: ownerResult.code,
      message: ownerResult.message,
      revision: repo.revision,
      state: repo,
      affectedIds: emptyAffected,
    };
  }

  const factoryInput: CreateElementInput = {
    ...request,
    metaclass,
    name: request.name,
    ownerId: ownerResult.ownerId,
    typeId: request.typeId,
    portKind: request.portKind,
    aggregation: (request.aggregation === 'reference' ? 'none' : request.aggregation) as any,
  };

  const outcome = createSemanticElement(factoryInput, repo);
  if (!outcome.ok) {
    const emptyAffected: any = [];
    emptyAffected.semanticElementId = '';
    emptyAffected.presentationId = '';
    return {
      success: false,
      code: (outcome as any).code,
      message: (outcome as any).message,
      revision: repo.revision,
      state: repo,
      affectedIds: emptyAffected,
    };
  }

  const presentationId = request.presentationId ?? `pres_${request.diagramId}_${outcome.element.id}`;
  const presentation: DiagramPresentation = {
    id: presentationId,
    diagramId: request.diagramId,
    semanticElementId: outcome.element.id,
    bounds: {
      x: request.bounds?.x ?? 0,
      y: request.bounds?.y ?? 0,
      width: request.bounds?.width ?? 160,
      height: request.bounds?.height ?? 100,
    },
  };

  const cmd: CreateAndPresentElementCommand = {
    type: 'CreateAndPresentElement',
    element: outcome.element,
    presentation,
  };

  const context: CommandContext = { source: 'ui' };
  const res = gateway.dispatch ? gateway.dispatch(cmd, context) : dispatchSysmlCommand(repo, cmd, context);
  if (res.success && res.state) {
    gateway.repository = res.state;
  }

  const affected: any = [outcome.element.id, presentation.id];
  affected.semanticElementId = outcome.element.id;
  affected.presentationId = presentation.id;

  return {
    ...res,
    affectedIds: affected,
  };
}

export function addExistingElementToDiagram(
  request: AddExistingElementToDiagramRequest,
  gateway: SysmlGatewayLike
): DiagramControllerResult {
  const repo = gateway.repository;
  const element = repo.elements[request.semanticElementId];
  if (!element) {
    const emptyAffected: any = [];
    emptyAffected.semanticElementId = request.semanticElementId;
    emptyAffected.presentationId = '';
    return {
      success: false,
      code: 'ELEMENT_NOT_FOUND',
      message: `Semantic element ${request.semanticElementId} not found.`,
      revision: repo.revision,
      state: repo,
      affectedIds: emptyAffected,
    };
  }

  const presentationId = request.presentationId ?? `pres_${request.diagramId}_${request.semanticElementId}`;
  const presentation: DiagramPresentation = {
    id: presentationId,
    diagramId: request.diagramId,
    semanticElementId: request.semanticElementId,
    bounds: {
      x: request.bounds?.x ?? 0,
      y: request.bounds?.y ?? 0,
      width: request.bounds?.width ?? 160,
      height: request.bounds?.height ?? 100,
    },
  };

  const cmd: DisplayExistingElementCommand = {
    type: 'DisplayExistingElement',
    presentation,
  };

  const context: CommandContext = { source: 'ui' };
  const res = gateway.dispatch ? gateway.dispatch(cmd, context) : dispatchSysmlCommand(repo, cmd, context);
  if (res.success && res.state) {
    gateway.repository = res.state;
  }

  const affected: any = [request.semanticElementId, presentation.id];
  affected.semanticElementId = request.semanticElementId;
  affected.presentationId = presentation.id;

  return {
    ...res,
    affectedIds: affected,
  };
}

export function presentationsFor(
  elementId: string,
  gatewayOrRepo?: SysmlGatewayLike | SysmlRepositoryV4
): DiagramPresentation[] {
  const repo = (gatewayOrRepo as any)?.repository ?? gatewayOrRepo;
  if (!repo || !repo.presentations) return [];
  return Object.values(repo.presentations as Record<string, DiagramPresentation>).filter(
    p => p.semanticElementId === elementId
  );
}

export function requirementsRequest(
  metaclass: MetaclassKind | string,
  overrides?: Partial<CreateElementOnDiagramRequest>
): CreateElementOnDiagramRequest {
  return {
    metaclass,
    diagramId: 'requirements-a',
    ...overrides,
  };
}

export function bddRequest(
  metaclass: MetaclassKind | string,
  overrides?: Partial<CreateElementOnDiagramRequest>
): CreateElementOnDiagramRequest {
  return {
    metaclass,
    diagramId: 'bdd-a',
    ...overrides,
  };
}
