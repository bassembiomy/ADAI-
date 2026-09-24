import type {
  SysmlRepositoryV4,
  MetaclassKind,
  Multiplicity,
} from '../../engine/sysml/domain';
import {
  dispatchSysmlCommand,
  type CommandResult,
  type CommandContext,
  type SysmlCommand,
} from '../../engine/sysml/commands';
import { createSemanticElement, type CreateElementInput } from '../../engine/sysml/services/elementFactory';

export interface SysmlGatewayLike {
  repository: SysmlRepositoryV4;
  dispatch?: (command: SysmlCommand, context?: CommandContext) => CommandResult;
}

export interface CreateOwnedFeatureRequest {
  ownerId: string;
  featureKind: 'Port' | 'PartProperty' | 'ReferenceProperty' | 'ValueProperty' | 'FlowProperty' | 'ConstraintProperty' | string;
  name?: string;
  portKind?: 'standardPort' | 'proxyPort' | 'fullPort' | 'umlPort';
  typeId?: string;
  typeName?: string;
  direction?: 'in' | 'out' | 'inout';
  aggregation?: 'composite' | 'shared' | 'none';
  multiplicity?: Multiplicity;
  [key: string]: any;
}

export interface UpdateOwnedFeatureRequest {
  featureId: string;
  patch: Record<string, unknown>;
}

export interface DeleteOwnedFeatureRequest {
  featureId: string;
}

export interface FeatureControllerResult extends CommandResult {
  candidates?: Array<{ id: string; name: string; metaclass: string }>;
  createNewTypeAction?: {
    suggestedName: string;
    metaclass: MetaclassKind;
    ownerId?: string | null;
  };
}

export interface FeatureProjectionView {
  view: 'tree' | 'bddCompartment' | 'ibd' | 'specView';
  id: string;
  name: string;
  metaclass: string;
  ownerId: string | null;
  [key: string]: any;
}

export function createOwnedFeature(
  request: CreateOwnedFeatureRequest,
  gateway: SysmlGatewayLike
): FeatureControllerResult {
  const repo = gateway.repository;
  const owner = repo.elements[request.ownerId];

  // Specific check for ProxyPort requiring InterfaceBlock
  if (request.featureKind === 'Port' && request.portKind === 'proxyPort') {
    const candidates = Object.values(repo.elements)
      .filter(el => el.metaclass === 'InterfaceBlock')
      .map(el => ({ id: el.id, name: el.name, metaclass: el.metaclass }));

    const target = request.typeId ? repo.elements[request.typeId] : undefined;
    if (!target || target.metaclass !== 'InterfaceBlock') {
      return {
        success: false,
        code: 'TYPE_NOT_FOUND',
        message: `ProxyPort requires an InterfaceBlock type. Type "${request.typeId || request.typeName}" not found.`,
        revision: repo.revision,
        state: repo,
        affectedIds: [],
        candidates,
        createNewTypeAction: {
          suggestedName: request.typeName || 'NewInterfaceBlock',
          metaclass: 'InterfaceBlock',
          ownerId: owner?.ownerId ?? 'pkg-root',
        },
      };
    }
  }

  const factoryInput: CreateElementInput = {
    ...request,
    metaclass: request.featureKind as MetaclassKind,
    ownerId: request.ownerId,
    name: request.name,
    typeId: request.typeId,
    portKind: request.portKind,
  };

  const outcome = createSemanticElement(factoryInput, repo);
  if (!outcome.ok) {
    return {
      success: false,
      code: outcome.code,
      message: outcome.message,
      revision: repo.revision,
      state: repo,
      affectedIds: [],
      candidates: outcome.candidates,
      createNewTypeAction: outcome.createNewTypeAction,
    };
  }

  const cmd: SysmlCommand = {
    type: 'CreateElement',
    element: outcome.element,
  };

  const context: CommandContext = { source: 'ui' };
  const res = gateway.dispatch ? gateway.dispatch(cmd, context) : dispatchSysmlCommand(repo, cmd, context);
  if (res.success && res.state) {
    gateway.repository = res.state;
  }

  return {
    ...res,
    affectedIds: [outcome.element.id],
  };
}

export function updateOwnedFeature(
  request: UpdateOwnedFeatureRequest,
  gateway: SysmlGatewayLike
): FeatureControllerResult {
  const repo = gateway.repository;
  const cmd: SysmlCommand = {
    type: 'UpdateElement',
    elementId: request.featureId,
    patch: request.patch,
  };

  const context: CommandContext = { source: 'ui' };
  const res = gateway.dispatch ? gateway.dispatch(cmd, context) : dispatchSysmlCommand(repo, cmd, context);
  if (res.success && res.state) {
    gateway.repository = res.state;
  }

  return res;
}

export function deleteOwnedFeature(
  request: DeleteOwnedFeatureRequest,
  gateway: SysmlGatewayLike
): FeatureControllerResult {
  const repo = gateway.repository;
  const cmd: SysmlCommand = {
    type: 'DeleteElement',
    elementId: request.featureId,
  };

  const context: CommandContext = { source: 'ui' };
  const res = gateway.dispatch ? gateway.dispatch(cmd, context) : dispatchSysmlCommand(repo, cmd, context);
  if (res.success && res.state) {
    gateway.repository = res.state;
  }

  return res;
}

export function allFeatureProjections(
  featureId: string,
  gatewayOrRepo: SysmlGatewayLike | SysmlRepositoryV4
): FeatureProjectionView[] {
  const repo = (gatewayOrRepo as any)?.repository ?? gatewayOrRepo;
  const element = repo.elements[featureId];
  if (!element) return [];

  const views: FeatureProjectionView[] = [
    {
      view: 'tree',
      id: element.id,
      name: element.name,
      metaclass: element.metaclass,
      ownerId: element.ownerId,
    },
    {
      view: 'bddCompartment',
      id: element.id,
      name: element.name,
      metaclass: element.metaclass,
      ownerId: element.ownerId,
    },
    {
      view: 'ibd',
      id: element.id,
      name: element.name,
      metaclass: element.metaclass,
      ownerId: element.ownerId,
      portKind: (element as any).portKind,
    },
    {
      view: 'specView',
      id: element.id,
      name: element.name,
      metaclass: element.metaclass,
      ownerId: element.ownerId,
      typeId: (element as any).typeId,
    },
  ];

  return views;
}
