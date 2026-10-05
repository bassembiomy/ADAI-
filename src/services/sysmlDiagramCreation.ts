import type { SysmlRepository } from '../engine/sysml/model';
import type { PresentationCoordinates, SysmlElement } from './sysmlCommandGateway';
import { resolveSysmlCreationOwner } from './sysmlDiagramCreationContext';
import {
  createPackage,
  createBlock,
  createRequirement,
  createVerificationCase,
  createUseCase,
} from '../features/modelExplorer/adapters/modelExplorerFactories';

/**
 * Public normative creation kinds for SysML diagrams.
 * Note: 'TestCase' maps to persisted 'verificationCase' in SysmlRepository (ADIA_EXTENSION).
 */
export type DiagramCreationKind = 'Package' | 'ModelLibrary' | 'Block' | 'Requirement' | 'TestCase' | 'UseCase';

export interface DiagramCreationInput {
  repository: SysmlRepository;
  kind: DiagramCreationKind;
  ownerId?: string;
  diagramId: string;
  position: { x: number; y: number };
  diagramKind?: 'bdd' | 'ibd' | 'requirements' | 'package' | string;
  contextElementId?: string;
  /**
   * Package Diagram only: the Package symbol the new element is created
   * inside. UML nesting means that Package owns the element.
   */
  nestedOwnerId?: string;
}

export interface DiagramCreationDiagnostic {
  code: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
}

export type DiagramCreationOutcome =
  | {
      ok: true;
      semanticId: string;
      command: {
        type: 'createAndPresent';
        element: SysmlElement;
        diagramId: string;
        presentation: PresentationCoordinates;
      };
    }
  | {
      ok: false;
      diagnostic: DiagramCreationDiagnostic;
    };

export function collectRepositoryNames(repo: SysmlRepository): Set<string> {
  const names = new Set<string>();
  const collect = (dict?: Record<string, unknown>) => {
    if (!dict) return;
    for (const item of Object.values(dict)) {
      if (item && typeof item === 'object' && 'name' in item && typeof (item as { name?: string }).name === 'string') {
        names.add((item as { name: string }).name);
      }
    }
  };
  collect(repo.packages);
  collect(repo.definitions);
  collect(repo.usages);
  collect(repo.connectors);
  collect(repo.requirements);
  collect(repo.verificationCases);
  collect(repo.actors);
  collect(repo.subjects);
  collect(repo.useCases);
  return names;
}

function failure(code: string, message: string): DiagramCreationOutcome {
  return {
    ok: false,
    diagnostic: {
      code,
      severity: 'error',
      message,
    },
  };
}

export function buildDiagramCreationCommand(input: DiagramCreationInput): DiagramCreationOutcome {
  if (!input.diagramId) return failure('DIAGRAM_NOT_FOUND', 'An active diagram is required.');

  const diagram = input.repository.diagrams?.[input.diagramId];
  const effectiveDiagramKind = input.diagramKind
    ?? diagram?.diagramKind
    ?? (input.diagramId === 'bdd' || input.diagramId === 'ibd' || input.diagramId === 'requirements' || input.diagramId === 'package' ? input.diagramId : 'bdd');

  const ownerResolution = resolveSysmlCreationOwner(input.repository, {
    diagramId: input.diagramId,
    diagramKind: effectiveDiagramKind,
    contextElementId: input.contextElementId,
  });
  if (!ownerResolution.ok) {
    return failure(ownerResolution.diagnostic.code, ownerResolution.diagnostic.message);
  }
  const requestedOwnerExists = input.ownerId === 'model'
    || Boolean(input.ownerId && (
      input.repository.packages?.[input.ownerId]
      || input.repository.definitions?.[input.ownerId]
      || input.repository.requirements?.[input.ownerId]
    ));
  if (input.ownerId && !requestedOwnerExists) {
    return failure('OWNER_NOT_FOUND', `Owner '${input.ownerId}' does not exist.`);
  }
  if (input.ownerId && input.ownerId !== ownerResolution.ownerId) {
    return failure(
      'OWNER_CONTEXT_MISMATCH',
      `Requested owner '${input.ownerId}' does not match the active diagram context owner '${ownerResolution.ownerId}'.`,
    );
  }
  const nestedOwner = effectiveDiagramKind === 'package' && input.nestedOwnerId && input.nestedOwnerId !== 'model'
    ? input.repository.packages?.[input.nestedOwnerId]
    : undefined;
  if (effectiveDiagramKind === 'package' && input.nestedOwnerId && input.nestedOwnerId !== 'model' && !nestedOwner) {
    return failure('OWNER_NOT_FOUND', `Package '${input.nestedOwnerId}' does not exist.`);
  }
  const effectiveOwnerId = nestedOwner?.id ?? ownerResolution.ownerId;

  const ownerExists = effectiveOwnerId === 'model'
    || Boolean(input.repository.packages?.[effectiveOwnerId])
    || Boolean(input.repository.definitions?.[effectiveOwnerId])
    || Boolean(input.repository.requirements?.[effectiveOwnerId]);
  if (!ownerExists) return failure('OWNER_NOT_FOUND', `Owner '${effectiveOwnerId}' does not exist.`);

  if (input.diagramId !== 'bdd' && input.diagramId !== 'requirements' && input.diagramId !== 'ibd' && input.diagramId !== 'rtm' && input.diagramId !== 'package') {
    if (!diagram) return failure('DIAGRAM_NOT_FOUND', `Diagram '${input.diagramId}' does not exist.`);
    // Must match the gateway's Package Diagram addToDiagram allowlist: a Use
    // Case has no Package Diagram presentation, so creating one here would
    // leave an invisible element.
    if (diagram.diagramKind === 'package' && input.kind !== 'Package' && input.kind !== 'ModelLibrary' && input.kind !== 'Block' && input.kind !== 'Requirement' && input.kind !== 'TestCase') {
      return failure('INVALID_DIAGRAM_ELEMENT', `${input.kind} is not supported on Package Diagrams.`);
    }
  }

  const names = collectRepositoryNames(input.repository);
  const element = input.kind === 'Package' ? createPackage({ ownerId: effectiveOwnerId, existingNames: names })
    : input.kind === 'ModelLibrary' ? createPackage({ ownerId: effectiveOwnerId, existingNames: names, stereotype: 'modelLibrary' })
    : input.kind === 'Block' ? createBlock({ ownerId: effectiveOwnerId, existingNames: names })
    : input.kind === 'Requirement' ? createRequirement({ ownerId: effectiveOwnerId, existingNames: names })
    : input.kind === 'TestCase' ? createVerificationCase({ ownerId: effectiveOwnerId, existingNames: names })
    : createUseCase({ ownerId: effectiveOwnerId });

  return {
    ok: true,
    semanticId: element.id,
    command: {
      type: 'createAndPresent',
      element,
      diagramId: input.diagramId,
      presentation: {
        x: input.position.x,
        y: input.position.y,
        width: input.kind === 'Package' || input.kind === 'ModelLibrary' ? 220 : 150,
        height: input.kind === 'Package' || input.kind === 'ModelLibrary' ? 140 : 100,
      },
    },
  };
}
