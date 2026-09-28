import type {
  BlockDefinition,
  PortDefinition,
  PropertyDefinition,
  SysmlDefinition,
  SysmlRepository,
} from '../engine/sysml/model';
import type { CanonicalPortKind } from '../engine/sysml/domain/ports';
import { validatePort } from '../engine/sysml/validation/portRules';
import type { TypeSelectionRequest, TypedFeatureKind } from '../components/sysml/typeSelectionTypes';

export type { CanonicalPortKind };

export interface PresentationCoordinates {
  x: number;
  y: number;
  width?: number;
  height?: number;
}

export interface CreateOwnedPortIntent {
  ownerBlockId?: string;
  activeBlockId?: string;
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
  ownerBlockId?: string;
  activeBlockId?: string;
  propertyKind: 'part' | 'reference' | 'value' | 'flow';
  typeId?: string;
  name?: string;
  diagramId?: string;
  presentation?: PresentationCoordinates;
  featureId?: string;
  usageId?: string;
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
      usageId?: string;
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

/**
 * Task 2 explicit compatibility predicates (spec sections 3.2, 4.1, 4.2).
 *
 * Candidate filtering uses the same semantic checks as the domain
 * validators (notably `validatePort` in validation/portRules.ts): definition
 * kind plus the InterfaceBlock/Block/ValueType markers. Candidate lists
 * never use element names, diagram family, or type ordering as
 * compatibility evidence, and repository insertion order is preserved.
 * The repository validator remains authoritative; these predicates only
 * filter the chooser.
 */
type DefinitionWithLegacyMarkers = SysmlDefinition & {
  metaclass?: unknown;
  stereotype?: unknown;
};

/** Matches the InterfaceBlock check in `validatePort`: kind or declared markers. */
export function isInterfaceBlockDefinition(definition: SysmlDefinition | undefined): boolean {
  if (!definition) return false;
  const record = definition as DefinitionWithLegacyMarkers;
  return (
    definition.kind === 'interface' ||
    record.metaclass === 'InterfaceBlock' ||
    record.stereotype === 'interfaceBlock'
  );
}

export function isBlockDefinitionKind(definition: SysmlDefinition | undefined): boolean {
  if (!definition) return false;
  const record = definition as DefinitionWithLegacyMarkers;
  return definition.kind === 'block' || record.metaclass === 'Block';
}

export function isValueTypeDefinitionKind(definition: SysmlDefinition | undefined): boolean {
  if (!definition) return false;
  const record = definition as DefinitionWithLegacyMarkers;
  return definition.kind === 'valueType' || record.metaclass === 'ValueType';
}

/** Every definition that can legally type a feature (legacy FlowPort included). */
export function isTypeBearingDefinition(definition: SysmlDefinition | undefined): boolean {
  return (
    isInterfaceBlockDefinition(definition) ||
    isBlockDefinitionKind(definition) ||
    isValueTypeDefinitionKind(definition)
  );
}

/**
 * Port type compatibility by semantic kind. ProxyPort accepts only
 * InterfaceBlocks; FullPort accepts Blocks and ValueTypes (never an
 * InterfaceBlock, so a FullPort cannot silently become a ProxyPort);
 * Standard UML Ports and legacy FlowPorts accept any type-bearing
 * definition while the repository validator stays authoritative.
 */
export function isCompatiblePortType(definition: SysmlDefinition | undefined, portKind: CanonicalPortKind): boolean {
  switch (portKind) {
    case 'proxyPort':
      return isInterfaceBlockDefinition(definition);
    case 'fullPort':
      return isBlockDefinitionKind(definition) || isValueTypeDefinitionKind(definition);
    case 'flowPort':
    case 'umlPort':
      return isTypeBearingDefinition(definition);
  }
}

/** Property type compatibility by semantic kind. */
export function isCompatiblePropertyType(
  definition: SysmlDefinition | undefined,
  propertyKind: CreateOwnedPropertyIntent['propertyKind'],
): boolean {
  switch (propertyKind) {
    case 'part':
    case 'reference':
      return isBlockDefinitionKind(definition);
    case 'value':
      return isValueTypeDefinitionKind(definition);
    case 'flow':
      return isTypeBearingDefinition(definition);
  }
}

/** Canonical metaclass suggested when no compatible type exists yet. */
export function suggestedMetaclassForPortKind(portKind: CanonicalPortKind): string {
  return portKind === 'proxyPort' ? 'InterfaceBlock' : 'Block';
}

/** Canonical metaclass suggested when no compatible type exists yet. */
export function suggestedMetaclassForPropertyKind(propertyKind: CreateOwnedPropertyIntent['propertyKind']): string {
  return propertyKind === 'value' ? 'ValueType' : 'Block';
}

export function getCompatiblePortCandidates(repo: SysmlRepository, portKind: CanonicalPortKind): TypeCandidate[] {
  return Object.values(repo.definitions)
    .filter(definition => isCompatiblePortType(definition, portKind))
    .map(definition => ({ id: definition.id, name: definition.name }));
}

export function getCompatiblePropertyCandidates(repo: SysmlRepository, propertyKind: CreateOwnedPropertyIntent['propertyKind']): TypeCandidate[] {
  return Object.values(repo.definitions)
    .filter(definition => isCompatiblePropertyType(definition, propertyKind))
    .map(definition => ({ id: definition.id, name: definition.name }));
}

export function buildCreateOwnedPortCommand(repo: SysmlRepository, intent: CreateOwnedPortIntent): CommandBuildResult {
  const resolvedOwnerId = intent.ownerBlockId || intent.activeBlockId;
  if (!resolvedOwnerId) {
    return {
      ok: false,
      diagnostics: [
        {
          code: 'ELEMENT_NOT_FOUND',
          message: 'No owner block specified or active.',
        },
      ],
    };
  }
  const owner = repo.definitions[resolvedOwnerId] as BlockDefinition | undefined;
  if (!owner || owner.kind !== 'block') {
    return {
      ok: false,
      diagnostics: [
        {
          code: 'ELEMENT_NOT_FOUND',
          message: `Owner block "${resolvedOwnerId}" does not exist.`,
          elementId: resolvedOwnerId,
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
          suggestedMetaclass: suggestedMetaclassForPortKind(intent.portKind),
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
    // Same InterfaceBlock check as the domain `validatePort` rule.
    if (!isInterfaceBlockDefinition(typeDef)) {
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
      ownerBlockId: resolvedOwnerId,
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
  const resolvedOwnerId = intent.ownerBlockId || intent.activeBlockId;
  if (!resolvedOwnerId) {
    return {
      ok: false,
      diagnostics: [
        {
          code: 'ELEMENT_NOT_FOUND',
          message: 'No owner block specified or active.',
        },
      ],
    };
  }
  const owner = repo.definitions[resolvedOwnerId] as BlockDefinition | undefined;
  if (!owner || owner.kind !== 'block') {
    return {
      ok: false,
      diagnostics: [
        {
          code: 'ELEMENT_NOT_FOUND',
          message: `Owner block "${resolvedOwnerId}" does not exist.`,
          elementId: resolvedOwnerId,
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
          elementId: resolvedOwnerId,
        },
      ],
      candidates,
      action: {
        kind: 'CreateNewType',
        payload: {
          suggestedMetaclass: suggestedMetaclassForPropertyKind(intent.propertyKind),
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
          elementId: resolvedOwnerId,
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
          elementId: resolvedOwnerId,
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
          elementId: resolvedOwnerId,
        },
      ],
      candidates,
    };
  }

  const propId = intent.featureId || `prop-${Math.random().toString(36).slice(2, 9)}`;
  const propName = intent.name || `prop${(owner.properties?.length ?? 0) + 1}`;
  const canonicalUsageId = intent.usageId || (intent.propertyKind === 'part' || intent.propertyKind === 'reference' ? `part-${propId}` : undefined);

  const command: CreateOwnedFeatureCommand = {
    type: 'createOwnedFeature',
    intent: {
      featureKind: 'property',
      ownerBlockId: resolvedOwnerId,
      propertyKind: intent.propertyKind,
      typeId: typeDef.id,
      name: propName,
      featureId: propId,
      ...(canonicalUsageId ? { usageId: canonicalUsageId } : {}),
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

/**
 * Task 2 surface-agnostic creation plans (spec sections 3.2, 4.1, 4.2).
 *
 * Tree and canvas entry points share these planners so both surfaces
 * produce the same pending type-selection request
 * (`TypeSelectionRequest`: owner identity, feature kind, compatible
 * candidate IDs, explicit `CreateNewType` action) and the same canonical
 * `createOwnedFeature` gateway command. Standard UML Port is the explicit
 * no-type exception: it plans an immediate untyped command on both
 * surfaces and is never converted into a SysML stereotype. Every other
 * kind without an explicit `typeId` plans type-selection — never a silent
 * first-candidate or implicit type creation. Planning is pure: it never
 * mutates the repository, so cancelling selection leaves no trace.
 */
const PORT_KIND_TO_TYPED_FEATURE_KIND: Record<CanonicalPortKind, TypedFeatureKind> = {
  umlPort: 'standardPort',
  proxyPort: 'proxyPort',
  fullPort: 'fullPort',
  flowPort: 'flowPort',
};

const PROPERTY_KIND_TO_TYPED_FEATURE_KIND: Record<CreateOwnedPropertyIntent['propertyKind'], TypedFeatureKind> = {
  part: 'part',
  reference: 'reference',
  value: 'valueProperty',
  // Legacy FlowProperty has no dedicated chooser kind in the shared
  // vocabulary; it reuses the legacy-flow member while candidates stay
  // type-bearing definitions and the validator stays authoritative.
  flow: 'flowPort',
};

export type OwnedPortCreationPlan =
  | { outcome: 'command'; command: CreateOwnedFeatureCommand }
  | { outcome: 'typeSelection'; request: TypeSelectionRequest }
  | {
      outcome: 'error';
      diagnostics: CommandBuildResult['diagnostics'];
      candidates?: TypeCandidate[];
      action?: CreateNewTypeAction;
    };

export type OwnedPropertyCreationPlan = OwnedPortCreationPlan;

function toTypeSelectionOutcome(
  ownerId: string,
  featureKind: TypedFeatureKind,
  result: CommandBuildResult,
): OwnedPortCreationPlan {
  return {
    outcome: 'typeSelection',
    request: {
      ownerId,
      featureKind,
      candidates: result.candidates ?? [],
      // The builder always attaches the explicit CreateNewType action on
      // TYPE_NOT_FOUND paths; the fallback keeps the contract total.
      action: result.action ?? { kind: 'CreateNewType' },
    },
  };
}

function toErrorOutcome(result: CommandBuildResult): OwnedPortCreationPlan {
  return {
    outcome: 'error',
    diagnostics: result.diagnostics,
    ...(result.candidates ? { candidates: result.candidates } : {}),
    ...(result.action ? { action: result.action } : {}),
  };
}

export function planOwnedPortCreation(repo: SysmlRepository, intent: CreateOwnedPortIntent): OwnedPortCreationPlan {
  const result = buildCreateOwnedPortCommand(repo, intent);
  if (result.ok && result.command) {
    return { outcome: 'command', command: result.command };
  }
  const resolvedOwnerId = intent.ownerBlockId || intent.activeBlockId;
  // Mirror the tree preflight rule: type-selection is offered only when no
  // type was chosen yet. An explicitly chosen but unresolvable or
  // incompatible type is a structured error, never a silent substitution.
  if (!intent.typeId && result.diagnostics.some(diagnostic => diagnostic.code === 'TYPE_NOT_FOUND') && result.action) {
    return toTypeSelectionOutcome(resolvedOwnerId ?? '', PORT_KIND_TO_TYPED_FEATURE_KIND[intent.portKind], result);
  }
  return toErrorOutcome(result);
}

export function planOwnedPropertyCreation(
  repo: SysmlRepository,
  intent: CreateOwnedPropertyIntent,
): OwnedPropertyCreationPlan {
  const result = buildCreateOwnedPropertyCommand(repo, intent);
  if (result.ok && result.command) {
    return { outcome: 'command', command: result.command };
  }
  const resolvedOwnerId = intent.ownerBlockId || intent.activeBlockId;
  if (!intent.typeId && result.diagnostics.some(diagnostic => diagnostic.code === 'TYPE_NOT_FOUND') && result.action) {
    return toTypeSelectionOutcome(
      resolvedOwnerId ?? '',
      PROPERTY_KIND_TO_TYPED_FEATURE_KIND[intent.propertyKind],
      result,
    );
  }
  return toErrorOutcome(result);
}
