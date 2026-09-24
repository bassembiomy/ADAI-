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
): string {
  // If requested owner is valid and legal, use it
  if (requestedOwnerId && repo.elements[requestedOwnerId]) {
    const decision = evaluateOwnership(repo.elements[requestedOwnerId], metaclass);
    if (decision.allowed) {
      return requestedOwnerId;
    }

    // Traverse upwards through owners to find a legal owner
    let curr = repo.elements[requestedOwnerId];
    while (curr && curr.ownerId && repo.elements[curr.ownerId]) {
      curr = repo.elements[curr.ownerId];
      if (evaluateOwnership(curr, metaclass).allowed) {
        return curr.id;
      }
    }
  }

  // Look for any Package in repository
  const pkg = Object.values(repo.elements).find(
    el => el.metaclass === 'Package' && evaluateOwnership(el, metaclass).allowed
  );
  if (pkg) {
    return pkg.id;
  }

  // Fallback to pkg-root or model root
  return repo.elements['pkg-root'] ? 'pkg-root' : 'model';
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
  const legalOwnerId = findLegalOwner(request.ownerId, metaclass, repo);

  const factoryInput: CreateElementInput = {
    ...request,
    metaclass,
    name: request.name,
    ownerId: legalOwnerId,
    typeId: request.typeId,
    portKind: request.portKind,
    aggregation: request.aggregation,
  };

  const outcome = createSemanticElement(factoryInput, repo);
  if (!outcome.ok) {
    const emptyAffected: any = [];
    emptyAffected.semanticElementId = '';
    emptyAffected.presentationId = '';
    return {
      success: false,
      code: outcome.code,
      message: outcome.message,
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
