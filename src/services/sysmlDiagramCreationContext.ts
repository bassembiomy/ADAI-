import type { SysmlRepository } from '../engine/sysml/model';
import { isBlockDefinition } from '../engine/sysml/model';

export interface SysmlDiagramCreationContext {
  diagramId: string;
  diagramKind: 'bdd' | 'ibd' | 'requirements' | 'package' | string;
  contextElementId?: string;
}

export type SysmlCreationOwnerResult =
  | { ok: true; ownerId: string }
  | { ok: false; diagnostic: { code: 'OWNER_CONTEXT_REQUIRED' | 'OWNER_NOT_FOUND'; message: string } };

function elementExistsInRepository(repository: SysmlRepository, id: string): boolean {
  if (id === 'model') return Boolean(repository.packages?.model);
  return Boolean(
    repository.packages?.[id] ||
    repository.definitions?.[id] ||
    repository.requirements?.[id] ||
    repository.verificationCases?.[id] ||
    repository.actors?.[id] ||
    repository.subjects?.[id] ||
    repository.useCases?.[id]
  );
}

/**
 * A diagram may be owned by a Block (a block-owned BDD), but a Package or Block
 * created from it cannot be owned by that Block: elements created on the canvas
 * belong to the nearest owning Package. Other owners are kept as they are.
 */
const isBlockLike = (kind?: string): boolean => kind === 'block' || kind === 'constraintBlock' || kind === 'interface' || kind === 'associationBlock';

function nearestOwningPackage(repository: SysmlRepository, ownerId: string): string {
  let current = ownerId;
  const seen = new Set<string>();
  while (isBlockLike(repository.definitions?.[current]?.kind) && !seen.has(current)) {
    seen.add(current);
    const next = repository.definitions[current].ownerId;
    if (!next) return 'model';
    current = next;
  }
  return current;
}

/**
 * Pure resolution of the semantic owner for SysML diagram element creation.
 * Owner policy:
 * - IBD requires a real Block contextElementId.
 * - Package Diagram uses its owning Package or 'model'.
 * - BDD, Requirements, and other diagrams use the explicitly owned diagram's owner or 'model';
 *   a Block-owned diagram resolves to the Block's nearest owning Package.
 */
export function resolveSysmlCreationOwner(
  repository: SysmlRepository,
  context: SysmlDiagramCreationContext,
): SysmlCreationOwnerResult {
  if (context.diagramKind === 'ibd') {
    if (!context.contextElementId) {
      return {
        ok: false,
        diagnostic: {
          code: 'OWNER_CONTEXT_REQUIRED',
          message: 'IBD requires a contextual Block.',
        },
      };
    }
    const def = repository.definitions?.[context.contextElementId];
    if (!def || !isBlockDefinition(def)) {
      return {
        ok: false,
        diagnostic: {
          code: 'OWNER_NOT_FOUND',
          message: `Context element '${context.contextElementId}' was not found as a Block.`,
        },
      };
    }
    return { ok: true, ownerId: context.contextElementId };
  }

  const diagram = repository.diagrams?.[context.diagramId];
  if (diagram?.ownerId) {
    if (elementExistsInRepository(repository, diagram.ownerId)) {
      return { ok: true, ownerId: nearestOwningPackage(repository, diagram.ownerId) };
    }
    return {
      ok: false,
      diagnostic: {
        code: 'OWNER_NOT_FOUND',
        message: `Diagram owner '${diagram.ownerId}' does not exist in repository.`,
      },
    };
  }

  if (context.diagramKind === 'package' && context.contextElementId) {
    if (repository.packages?.[context.contextElementId]) {
      return { ok: true, ownerId: context.contextElementId };
    }
    return {
      ok: false,
      diagnostic: {
        code: 'OWNER_NOT_FOUND',
        message: `Package context '${context.contextElementId}' does not exist.`,
      },
    };
  }

  if (repository.packages?.model) {
    return { ok: true, ownerId: 'model' };
  }

  return {
    ok: false,
    diagnostic: {
      code: 'OWNER_NOT_FOUND',
      message: 'Model root package not found.',
    },
  };
}
