import type {
  BlockDefinition,
  PortDefinition,
  PropertyDefinition,
  SysmlRepository,
} from '../engine/sysml/model';
import type { CanonicalPortKind } from '../engine/sysml/domain/ports';
import { validatePort } from '../engine/sysml/validation/portRules';

export type { CanonicalPortKind };

export interface PresentationCoordinates {
  x: number;
  y: number;
  width?: number;
  height?: number;
}

export interface CreateOwnedPortIntent {
  ownerBlockId: string;
  portKind: CanonicalPortKind;
  typeId?: string;
  name?: string;
  diagramId?: string;
  presentation?: PresentationCoordinates;
  featureId?: string;
  ownerPortId?: string;
  nestedPortPathIds?: string[];
}

export interface CreateOwnedPropertyIntent {
  ownerBlockId: string;
  propertyKind: 'part' | 'reference' | 'value' | 'flow';
  typeId?: string;
  name?: string;
  diagramId?: string;
  presentation?: PresentationCoordinates;
  featureId?: string;
}

export type OwnedFeatureIntent =
  | {
      featureKind: 'port';
      ownerBlockId: string;
      portKind: CanonicalPortKind;
      typeId?: string;
      name?: string;
      featureId?: string;
      ownerPortId?: string;
      nestedPortPathIds?: string[];
    }
  | {
      featureKind: 'property';
      ownerBlockId: string;
      propertyKind: 'part' | 'reference' | 'value' | 'flow';
      typeId: string;
      name?: string;
      featureId?: string;
    };

export interface CreateOwnedFeatureCommand {
  type: 'createOwnedFeature';
  intent: OwnedFeatureIntent;
  diagramId?: string;
  presentation?: PresentationCoordinates;
}

export const PORT_KIND_MAP: Record<CanonicalPortKind, PortDefinition['kind']> = {
  umlPort: 'standard',
  proxyPort: 'proxy',
  fullPort: 'full',
  flowPort: 'flow',
};

export const PORT_STEREOTYPES: Record<CanonicalPortKind, string[]> = {
  umlPort: [],
  proxyPort: ['ProxyPort'],
  fullPort: ['FullPort'],
  flowPort: ['FlowPort'],
};

export function createPortDefinitionFromIntent(
  owner: BlockDefinition,
  intent: Extract<OwnedFeatureIntent, { featureKind: 'port' }>,
): PortDefinition {
  const portId = intent.featureId || `port-${Math.random().toString(36).slice(2, 9)}`;
  const portName = intent.name || `p${(owner.ports?.length ?? 0) + 1}`;

  return {
    id: portId,
    name: portName,
    kind: PORT_KIND_MAP[intent.portKind],
    portKind: intent.portKind,
    appliedStereotypeIds: PORT_STEREOTYPES[intent.portKind],
    typeId: intent.typeId ?? '',
    direction: 'inout',
    isConjugated: false,
    multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
    ...(intent.ownerPortId ? { ownerPortId: intent.ownerPortId } : {}),
    ...(intent.nestedPortPathIds ? { nestedPortPathIds: intent.nestedPortPathIds } : {}),
  } as PortDefinition;
}

export function createPropertyDefinitionFromIntent(
  owner: BlockDefinition,
  intent: Extract<OwnedFeatureIntent, { featureKind: 'property' }>,
): PropertyDefinition {
  const propId = intent.featureId || `prop-${Math.random().toString(36).slice(2, 9)}`;
  const propName = intent.name || `prop${(owner.properties?.length ?? 0) + 1}`;

  return {
    id: propId,
    name: propName,
    kind: intent.propertyKind,
    typeId: intent.typeId,
    multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
  };
}

export interface TypeCandidate {
  id: string;
  name: string;
}

export interface CreateNewTypeAction {
  kind: 'CreateNewType';
  payload?: {
    suggestedMetaclass?: string;
    suggestedName?: string;
  };
}

export interface CommandBuildResult {
  ok: boolean;
  diagnostics: Array<{ code: string; message: string; elementId?: string }>;
  candidates?: TypeCandidate[];
  action?: CreateNewTypeAction;
  command?: CreateOwnedFeatureCommand;
}

export interface CreateOwnedPortResult {
  element?: { portKind: CanonicalPortKind; id: string; name: string };
  diagnostics: Array<{ code: string; message: string }>;
}

function getCompatiblePortCandidates(repo: SysmlRepository, portKind: CanonicalPortKind): TypeCandidate[] {
  const definitions = Object.values(repo.definitions);
  if (portKind === 'proxyPort') {
    return definitions
      .filter(d => d.kind === 'interface' || (d as any).metaclass === 'InterfaceBlock' || (d as any).stereotype === 'interfaceBlock')
      .map(d => ({ id: d.id, name: d.name }));
  }
  if (portKind === 'fullPort') {
    return definitions
      .filter(d => d.kind === 'block' || d.kind === 'valueType' || (d as any).metaclass === 'Block' || (d as any).metaclass === 'ValueType')
      .map(d => ({ id: d.id, name: d.name }));
  }
  return definitions.map(d => ({ id: d.id, name: d.name }));
}

function getCompatiblePropertyCandidates(repo: SysmlRepository, propertyKind: CreateOwnedPropertyIntent['propertyKind']): TypeCandidate[] {
  const definitions = Object.values(repo.definitions);
  if (propertyKind === 'part' || propertyKind === 'reference') {
    return definitions
      .filter(d => d.kind === 'block' || (d as any).metaclass === 'Block')
      .map(d => ({ id: d.id, name: d.name }));
  }
  if (propertyKind === 'value') {
    return definitions
      .filter(d => d.kind === 'valueType' || (d as any).metaclass === 'ValueType')
      .map(d => ({ id: d.id, name: d.name }));
  }
  return definitions.map(d => ({ id: d.id, name: d.name }));
}

export function buildCreateOwnedPortCommand(repo: SysmlRepository, intent: CreateOwnedPortIntent): CommandBuildResult {
  const owner = repo.definitions[intent.ownerBlockId] as BlockDefinition | undefined;
  if (!owner || owner.kind !== 'block') {
    return {
      ok: false,
      diagnostics: [
        {
          code: 'ELEMENT_NOT_FOUND',
          message: `Owner block "${intent.ownerBlockId}" does not exist.`,
          elementId: intent.ownerBlockId,
        },
      ],
    };
  }

  const candidates = getCompatiblePortCandidates(repo, intent.portKind);

  if (!intent.typeId && intent.portKind !== 'umlPort') {
    return {
      ok: false,
      diagnostics: [
        {
          code: 'TYPE_NOT_FOUND',
          message: `A compatible type is required for ${intent.portKind}.`,
          elementId: intent.ownerBlockId,
        },
      ],
      candidates,
      action: {
        kind: 'CreateNewType',
        payload: {
          suggestedMetaclass: intent.portKind === 'proxyPort' ? 'InterfaceBlock' : 'Block',
        },
      },
    };
  }

  const typeDef = intent.typeId ? repo.definitions[intent.typeId] : undefined;
  if (intent.typeId && !typeDef) {
    return {
      ok: false,
      diagnostics: [
        {
          code: 'TYPE_NOT_FOUND',
          message: `Type "${intent.typeId}" not found in repository.`,
          elementId: intent.ownerBlockId,
        },
      ],
      candidates,
      action: { kind: 'CreateNewType' },
    };
  }

  if (intent.portKind === 'proxyPort') {
    const isInterfaceBlock =
      typeDef &&
      (typeDef.kind === 'interface' ||
        (typeDef as any).metaclass === 'InterfaceBlock' ||
        (typeDef as any).stereotype === 'interfaceBlock');
    if (!isInterfaceBlock) {
      return {
        ok: false,
        diagnostics: [
          {
            code: 'INVALID_PROXY_PORT_TYPE',
            message: `ProxyPort must be typed by an InterfaceBlock, but "${typeDef?.name ?? 'unknown'}" is a ${typeDef?.kind ?? 'unknown'}.`,
            elementId: intent.ownerBlockId,
          },
        ],
        candidates,
      };
    }
  }

  const portId = intent.featureId || `port-${Math.random().toString(36).slice(2, 9)}`;
  const portName = intent.name || `p${(owner.ports?.length ?? 0) + 1}`;

  const command: CreateOwnedFeatureCommand = {
    type: 'createOwnedFeature',
    intent: {
      featureKind: 'port',
      ownerBlockId: intent.ownerBlockId,
      portKind: intent.portKind,
      ...(intent.typeId ? { typeId: intent.typeId } : {}),
      name: portName,
      featureId: portId,
      ...(intent.ownerPortId ? { ownerPortId: intent.ownerPortId } : {}),
      ...(intent.nestedPortPathIds ? { nestedPortPathIds: intent.nestedPortPathIds } : {}),
    },
    ...(intent.diagramId ? { diagramId: intent.diagramId } : {}),
    ...(intent.presentation ? { presentation: intent.presentation } : {}),
  };

  return {
    ok: true,
    diagnostics: [],
    command,
  };
}

export function buildCreateOwnedPropertyCommand(repo: SysmlRepository, intent: CreateOwnedPropertyIntent): CommandBuildResult {
  const owner = repo.definitions[intent.ownerBlockId] as BlockDefinition | undefined;
  if (!owner || owner.kind !== 'block') {
    return {
      ok: false,
      diagnostics: [
        {
          code: 'ELEMENT_NOT_FOUND',
          message: `Owner block "${intent.ownerBlockId}" does not exist.`,
          elementId: intent.ownerBlockId,
        },
      ],
    };
  }

  const candidates = getCompatiblePropertyCandidates(repo, intent.propertyKind);

  if (!intent.typeId) {
    return {
      ok: false,
      diagnostics: [
        {
          code: 'TYPE_NOT_FOUND',
          message: `A compatible type is required for ${intent.propertyKind} property.`,
          elementId: intent.ownerBlockId,
        },
      ],
      candidates,
      action: {
        kind: 'CreateNewType',
        payload: {
          suggestedMetaclass: intent.propertyKind === 'value' ? 'ValueType' : 'Block',
        },
      },
    };
  }

  const typeDef = repo.definitions[intent.typeId];
  if (!typeDef) {
    return {
      ok: false,
      diagnostics: [
        {
          code: 'TYPE_NOT_FOUND',
          message: `Type "${intent.typeId}" not found in repository.`,
          elementId: intent.ownerBlockId,
        },
      ],
      candidates,
      action: { kind: 'CreateNewType' },
    };
  }

  if ((intent.propertyKind === 'part' || intent.propertyKind === 'reference') && typeDef.kind !== 'block') {
    return {
      ok: false,
      diagnostics: [
        {
          code: 'INVALID_PROPERTY_TYPE',
          message: `${intent.propertyKind} property must be typed by a Block, but "${typeDef.name}" is a ${typeDef.kind}.`,
          elementId: intent.ownerBlockId,
        },
      ],
      candidates,
    };
  }

  if (intent.propertyKind === 'value' && typeDef.kind !== 'valueType') {
    return {
      ok: false,
      diagnostics: [
        {
          code: 'INVALID_PROPERTY_TYPE',
          message: `Value property must be typed by a ValueType, but "${typeDef.name}" is a ${typeDef.kind}.`,
          elementId: intent.ownerBlockId,
        },
      ],
      candidates,
    };
  }

  const propId = intent.featureId || `prop-${Math.random().toString(36).slice(2, 9)}`;
  const propName = intent.name || `prop${(owner.properties?.length ?? 0) + 1}`;

  const command: CreateOwnedFeatureCommand = {
    type: 'createOwnedFeature',
    intent: {
      featureKind: 'property',
      ownerBlockId: intent.ownerBlockId,
      propertyKind: intent.propertyKind,
      typeId: typeDef.id,
      name: propName,
      featureId: propId,
    },
    ...(intent.diagramId ? { diagramId: intent.diagramId } : {}),
    ...(intent.presentation ? { presentation: intent.presentation } : {}),
  };

  return {
    ok: true,
    diagnostics: [],
    command,
  };
}

export function createOwnedPort(repo: SysmlRepository, intent: CreateOwnedPortIntent): CreateOwnedPortResult {
  const buildResult = buildCreateOwnedPortCommand(repo, intent);
  if (!buildResult.ok || !buildResult.command) {
    return { diagnostics: buildResult.diagnostics };
  }
  const cmd = buildResult.command;
  if (cmd.intent.featureKind !== 'port') {
    return { diagnostics: [{ code: 'PORT_CREATION_FAILED', message: 'Command intent is not a port.' }] };
  }
  const owner = repo.definitions[cmd.intent.ownerBlockId] as BlockDefinition;
  const port = createPortDefinitionFromIntent(owner, cmd.intent);

  const portForValidation = {
    ...port,
    metaclass: 'Port' as const,
    portKind: intent.portKind,
    namespace: [],
    ownerId: intent.ownerBlockId,
  };
  const valDiags = validatePort(portForValidation as any, {
    getElement: (id: string) => repo.definitions[id] as any,
  });
  const errors = valDiags.filter(d => d.severity === 'error');
  if (errors.length > 0) {
    return { diagnostics: errors };
  }

  return {
    element: {
      id: port.id,
      name: port.name,
      portKind: intent.portKind,
    },
    diagnostics: [],
  };
}
