import type { MetaclassKind, SemanticElement } from '../../engine/sysml/domain/base';
import type { SysmlRepositoryV4 } from '../../engine/sysml/domain';
import type { CanonicalPortKind } from '../../services/sysmlOwnedFeatureCommands';
import type { TypeSelectionRequest } from '../../components/sysml/typeSelectionTypes';
import type { SysmlEditorCommand, SysmlElement } from '../../services/sysmlCommandGateway';
import {
  resolveInteractionContext,
  type InteractionSource,
  type InteractionContextInput,
} from './interactionContext';
import { resolveSemanticElement } from '../../engine/sysml/capabilities/ownershipPolicy';

export type PropertyMetaclass =
  | 'PartProperty'
  | 'ReferenceProperty'
  | 'ValueProperty'
  | 'FlowProperty'
  | 'ConstraintProperty';

export type ContextualCreationIntent =
  | { metaclass: 'Port'; portKind: CanonicalPortKind | 'standardPort' | string; typeId?: string; name?: string }
  | { metaclass: PropertyMetaclass; typeId?: string; name?: string }
  | {
      metaclass:
        | 'Block'
        | 'InterfaceBlock'
        | 'Package'
        | 'ValueType'
        | 'Operation'
        | 'Constraint'
        | 'Parameter'
        | 'Activity'
        | 'Requirement'
        | 'TestCase'
        | 'UseCase';
      name?: string;
    };

export interface ContextualCreationInput {
  repository: SysmlRepositoryV4 | any;
  source: InteractionSource;
  selectedId?: string;
  inspectorElementId?: string;
  canvasElementId?: string;
  treeElementId?: string;
  intent: ContextualCreationIntent;
  diagramId?: string;
}

export type ContextualCreationPlan =
  | { kind: 'command'; command: SysmlEditorCommand }
  | { kind: 'typeSelection'; request: TypeSelectionRequest }
  | { kind: 'disabled'; code: string; reason: string };

function toResolverInput(input: ContextualCreationInput): InteractionContextInput {
  const selected = input.selectedId;
  return {
    repository: input.repository,
    source: input.source,
    requestedMetaclass: input.intent.metaclass as MetaclassKind,
    inspectorElementId:
      input.source === 'propertyPanel'
        ? input.inspectorElementId ?? selected
        : input.inspectorElementId,
    canvasElementId:
      input.source === 'canvas' ? input.canvasElementId ?? selected : input.canvasElementId,
    treeElementId:
      input.source === 'tree' ? input.treeElementId ?? selected : input.treeElementId,
  };
}

function getCompatibleCandidates(
  repo: any,
  metaclass: string,
  subKind?: string
): Array<{ id: string; name: string; kind?: string }> {
  const result: Array<{ id: string; name: string; kind?: string }> = [];

  if (repo.elements) {
    for (const el of Object.values(repo.elements) as SemanticElement[]) {
      if (metaclass === 'Port' && subKind === 'proxyPort') {
        if (el.metaclass === 'InterfaceBlock') {
          result.push({ id: el.id, name: el.name, kind: 'interface' });
        }
      } else if (metaclass === 'Port' && subKind === 'fullPort') {
        if (el.metaclass === 'Block' || el.metaclass === 'ValueType') {
          result.push({ id: el.id, name: el.name, kind: el.metaclass.toLowerCase() });
        }
      } else if (metaclass === 'Port' && subKind === 'flowPort') {
        if (
          el.metaclass === 'InterfaceBlock' ||
          el.metaclass === 'ValueType' ||
          el.metaclass === 'Signal'
        ) {
          result.push({ id: el.id, name: el.name, kind: el.metaclass.toLowerCase() });
        }
      } else if (metaclass === 'PartProperty') {
        if (el.metaclass === 'Block') {
          result.push({ id: el.id, name: el.name, kind: 'block' });
        }
      } else if (metaclass === 'ValueProperty') {
        if (el.metaclass === 'ValueType') {
          result.push({ id: el.id, name: el.name, kind: 'valueType' });
        }
      }
    }
  }

  if (repo.definitions) {
    for (const def of Object.values(repo.definitions) as any[]) {
      if (metaclass === 'Port' && subKind === 'proxyPort') {
        if (def.kind === 'interface') {
          result.push({ id: def.id, name: def.name, kind: def.kind });
        }
      } else if (metaclass === 'Port' && subKind === 'fullPort') {
        if (def.kind === 'block' || def.kind === 'valueType') {
          result.push({ id: def.id, name: def.name, kind: def.kind });
        }
      } else if (metaclass === 'Port' && subKind === 'flowPort') {
        if (def.kind === 'interface' || def.kind === 'valueType') {
          result.push({ id: def.id, name: def.name, kind: def.kind });
        }
      } else if (metaclass === 'PartProperty') {
        if (def.kind === 'block') {
          result.push({ id: def.id, name: def.name, kind: def.kind });
        }
      } else if (metaclass === 'ValueProperty') {
        if (def.kind === 'valueType') {
          result.push({ id: def.id, name: def.name, kind: def.kind });
        }
      }
    }
  }

  return result;
}

export function buildOwnedElementPlan(
  repository: any,
  ownerId: string,
  intent: ContextualCreationIntent,
  diagramId?: string
): ContextualCreationPlan {
  if (intent.metaclass === 'Port') {
    const isUntyped =
      intent.portKind === 'standardPort' ||
      intent.portKind === 'umlPort' ||
      intent.portKind === 'standard';

    if (!isUntyped && !intent.typeId) {
      const candidates = getCompatibleCandidates(repository, 'Port', intent.portKind);
      return {
        kind: 'typeSelection',
        request: {
          ownerId,
          featureKind: (intent.portKind === 'proxyPort' ? 'proxyPort' : intent.portKind) as any,
          candidates,
          action: {
            kind: 'CreateNewType',
            payload: {
              suggestedMetaclass: intent.portKind === 'proxyPort' ? 'InterfaceBlock' : 'Block',
            },
          },
        },
      };
    }

    return {
      kind: 'command',
      command: {
        type: 'createOwnedPort',
        ownerBlockId: ownerId,
        portKind: intent.portKind,
        ...(intent.typeId ? { typeId: intent.typeId } : {}),
        ...(intent.name ? { name: intent.name } : {}),
        ...(diagramId ? { diagramId } : {}),
      },
    };
  }

  if (
    intent.metaclass === 'PartProperty' ||
    intent.metaclass === 'ReferenceProperty' ||
    intent.metaclass === 'ValueProperty' ||
    intent.metaclass === 'FlowProperty' ||
    intent.metaclass === 'ConstraintProperty'
  ) {
    if (!intent.typeId) {
      const candidates = getCompatibleCandidates(repository, intent.metaclass);
      return {
        kind: 'typeSelection',
        request: {
          ownerId,
          featureKind: (intent.metaclass === 'PartProperty'
            ? 'part'
            : intent.metaclass === 'ReferenceProperty'
            ? 'reference'
            : 'value') as any,
          candidates,
          action: {
            kind: 'CreateNewType',
            payload: {
              suggestedMetaclass: intent.metaclass === 'ValueProperty' ? 'ValueType' : 'Block',
            },
          },
        },
      };
    }

    const propKind =
      intent.metaclass === 'PartProperty'
        ? 'part'
        : intent.metaclass === 'ReferenceProperty'
        ? 'reference'
        : intent.metaclass === 'ValueProperty'
        ? 'value'
        : intent.metaclass === 'FlowProperty'
        ? 'flow'
        : 'part';

    return {
      kind: 'command',
      command: {
        type: 'createOwnedFeature',
        intent: {
          featureKind: 'property',
          ownerBlockId: ownerId,
          propertyKind: propKind,
          typeId: intent.typeId,
          ...(intent.name ? { name: intent.name } : {}),
        },
        ...(diagramId ? { diagramId } : {}),
      },
    };
  }

  // Operations and Constraints on a Block
  if (intent.metaclass === 'Operation') {
    const ownerBlock = repository.definitions?.[ownerId] ?? repository.elements?.[ownerId];
    const existingOps = (ownerBlock as any)?.operations || [];
    const opName = intent.name ?? `operation_${existingOps.length + 1}`;
    return {
      kind: 'command',
      command: {
        type: 'updateElement',
        elementId: ownerId,
        patch: { operations: [...existingOps, opName] },
      },
    };
  }

  if (intent.metaclass === 'Constraint') {
    const ownerBlock = repository.definitions?.[ownerId] ?? repository.elements?.[ownerId];
    const existingConstraints = (ownerBlock as any)?.constraints || [];
    const constraintName = intent.name ?? `constraint_${existingConstraints.length + 1}`;
    return {
      kind: 'command',
      command: {
        type: 'updateElement',
        elementId: ownerId,
        patch: { constraints: [...existingConstraints, constraintName] },
      },
    };
  }

  // Canonical packageable definitions
  let element: SysmlElement;
  const uid = Math.random().toString(36).slice(2, 8);

  switch (intent.metaclass) {
    case 'Block':
    case 'InterfaceBlock': {
      element = {
        id: `blk_${Date.now()}_${uid}`,
        name: intent.name ?? (intent.metaclass === 'InterfaceBlock' ? 'InterfaceBlock' : 'Block'),
        kind: 'block',
        isAbstract: false,
        isLeaf: false,
        properties: [],
        ports: [],
        operations: [],
        constraints: [],
        ownerId,
        namespace: [],
      };
      break;
    }
    case 'Package': {
      element = {
        id: `pkg_${Date.now()}_${uid}`,
        name: intent.name ?? 'Package',
        kind: 'package',
        ownerId,
        namespace: [],
      };
      break;
    }
    case 'Requirement': {
      element = {
        id: `req_${Date.now()}_${uid}`,
        requirementId: `REQ-${Date.now().toString().slice(-4)}`,
        name: intent.name ?? 'Requirement',
        text: '',
        status: 'draft',
        version: '1.0',
        kind: 'requirement',
        ownerId,
        namespace: [],
      };
      break;
    }
    case 'ValueType': {
      element = {
        id: `vt_${Date.now()}_${uid}`,
        name: intent.name ?? 'ValueType',
        kind: 'valueType',
        ownerId,
        namespace: [],
      };
      break;
    }
    case 'TestCase': {
      element = {
        id: `vc_${Date.now()}_${uid}`,
        name: intent.name ?? 'TestCase',
        kind: 'verificationCase',
        method: 'automated',
        verifiesRequirementIds: [],
        ownerId,
        namespace: [],
      };
      break;
    }
    case 'UseCase': {
      element = {
        id: `uc_${Date.now()}_${uid}`,
        name: intent.name ?? 'UseCase',
        kind: 'useCase',
        subjectId: '',
        extensionPointIds: [],
        behaviorArtifactIds: [],
        ownerId,
        namespace: [],
      };
      break;
    }
    default: {
      return {
        kind: 'disabled',
        code: 'UNSUPPORTED_CONTEXTUAL_METACLASS',
        reason: `${intent.metaclass} creation is not yet available through the canonical editor gateway.`,
      };
    }
  }

  return {
    kind: 'command',
    command: {
      type: 'createElement',
      element,
      ...(diagramId ? { diagramId } : {}),
    },
  };
}

export function planContextualCreation(input: ContextualCreationInput): ContextualCreationPlan {
  const context = resolveInteractionContext(toResolverInput(input));
  if (context.status === 'disabled') {
    return { kind: 'disabled', code: context.code, reason: context.reason };
  }
  return buildOwnedElementPlan(input.repository, context.ownerId, input.intent, context.diagramId);
}
