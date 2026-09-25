import type { SysmlRepository, SysmlElement } from '../engine/sysml/model';
import type { PresentationCoordinates } from './sysmlCommandGateway';
import {
  createBlock,
  createRequirement,
  createVerificationCase,
  createUseCase,
} from '../features/modelExplorer/adapters/modelExplorerFactories';

/**
 * Public normative creation kinds for SysML diagrams.
 * Note: 'TestCase' maps to persisted 'verificationCase' in SysmlRepository (ADIA_EXTENSION).
 */
export type DiagramCreationKind = 'Block' | 'Requirement' | 'TestCase' | 'UseCase';

export interface DiagramCreationInput {
  repository: SysmlRepository;
  kind: DiagramCreationKind;
  ownerId: string;
  diagramId: string;
  position: { x: number; y: number };
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
  const collect = (dict?: Record<string, { name?: string }>) => {
    if (!dict) return;
    for (const item of Object.values(dict)) {
      if (item?.name) names.add(item.name);
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
  const ownerExists = input.ownerId === 'model'
    || Boolean(input.repository.packages?.[input.ownerId])
    || Boolean(input.repository.definitions?.[input.ownerId])
    || Boolean(input.repository.requirements?.[input.ownerId]);
  if (!ownerExists) return failure('OWNER_NOT_FOUND', `Owner '${input.ownerId}' does not exist.`);
  if (!input.diagramId) return failure('DIAGRAM_NOT_FOUND', 'An active diagram is required.');

  const names = collectRepositoryNames(input.repository);
  const element = input.kind === 'Block' ? createBlock({ ownerId: input.ownerId, existingNames: names })
    : input.kind === 'Requirement' ? createRequirement({ ownerId: input.ownerId, existingNames: names })
    : input.kind === 'TestCase' ? createVerificationCase({ ownerId: input.ownerId, existingNames: names })
    : createUseCase({ ownerId: input.ownerId });

  return {
    ok: true,
    semanticId: element.id,
    command: {
      type: 'createAndPresent',
      element,
      diagramId: input.diagramId,
      presentation: { x: input.position.x, y: input.position.y, width: 150, height: 100 },
    },
  };
}
