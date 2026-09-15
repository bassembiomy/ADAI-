import type {
  ActorDefinition,
  SubjectDefinition,
  UseCaseDefinition,
  ExtensionPoint,
  DiagramReference,
  UseCaseRelationshipKind,
  SysmlRelationship,
  SysmlRepository,
} from './model';
import type { SysmlDiagnostic } from './validation';

export type {
  ActorDefinition,
  SubjectDefinition,
  UseCaseDefinition,
  ExtensionPoint,
  DiagramReference,
  UseCaseRelationshipKind,
};

export const USE_CASE_RELATIONSHIP_KINDS: readonly UseCaseRelationshipKind[] = [
  'useCaseAssociation',
  'include',
  'extend',
  'useCaseGeneralization',
  'useCaseRefine',
  'useCaseSatisfy',
  'useCaseTrace',
] as const;

export function isUseCaseRelationshipKind(kind: string): kind is UseCaseRelationshipKind {
  return USE_CASE_RELATIONSHIP_KINDS.includes(kind as UseCaseRelationshipKind);
}

export function classifyUseCaseRelationship(kind: string): boolean {
  return isUseCaseRelationshipKind(kind);
}

export interface UseCaseView {
  diagramId?: string;
  actors: ActorDefinition[];
  subjects: SubjectDefinition[];
  useCases: UseCaseDefinition[];
  extensionPoints: ExtensionPoint[];
  relationships: SysmlRelationship[];
  diagramReferences: DiagramReference[];
  diagnostics: SysmlDiagnostic[];
}

/**
 * Detects cycles in a directed graph.
 * Returns the cycle path [A, B, ..., A] if a cycle exists, or null otherwise.
 */
export function detectUseCaseCycles(edges: Array<{ from: string; to: string }>): string[] | null {
  const adj = new Map<string, string[]>();
  for (const { from, to } of edges) {
    if (!adj.has(from)) adj.set(from, []);
    adj.get(from)!.push(to);
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();
  const stack: string[] = [];

  function dfs(node: string): string[] | null {
    visited.add(node);
    inStack.add(node);
    stack.push(node);

    const neighbors = adj.get(node) || [];
    for (const next of neighbors) {
      if (!visited.has(next)) {
        const cycle = dfs(next);
        if (cycle) return cycle;
      } else if (inStack.has(next)) {
        const cycleStartIdx = stack.indexOf(next);
        return [...stack.slice(cycleStartIdx), next];
      }
    }

    stack.pop();
    inStack.delete(node);
    return null;
  }

  // Iterate over all nodes in deterministic order
  const allNodes = Array.from(new Set(edges.flatMap(e => [e.from, e.to]))).sort();
  for (const node of allNodes) {
    if (!visited.has(node)) {
      const cycle = dfs(node);
      if (cycle) return cycle;
    }
  }

  return null;
}

/**
 * Validates a single use-case canonical entity.
 */
export function validateUseCaseElement(
  repo: SysmlRepository,
  elementId: string
): SysmlDiagnostic[] {
  const diagnostics: SysmlDiagnostic[] = [];

  // Check Actor
  const actor = repo.actors?.[elementId];
  if (actor) {
    for (const genId of actor.generalizationIds || []) {
      if (!repo.actors?.[genId]) {
        diagnostics.push({
          code: 'MISSING_ACTOR_GENERALIZATION',
          severity: 'error',
          elementId,
          propertyPath: 'generalizationIds',
          message: `Actor ${elementId} references non-existent general actor ${genId}`,
        });
      }
    }

    // Check for actor generalization cycle
    const actorEdges = Object.values(repo.actors || {}).flatMap(a =>
      (a.generalizationIds || []).map(target => ({ from: a.id, to: target }))
    );
    const cycle = detectUseCaseCycles(actorEdges);
    if (cycle && cycle.includes(elementId)) {
      diagnostics.push({
        code: 'ACTOR_GENERALIZATION_CYCLE',
        severity: 'error',
        elementId,
        propertyPath: 'generalizationIds',
        message: `Actor generalization cycle detected: ${cycle.join(' -> ')}`,
      });
    }
    return diagnostics;
  }

  // Check Subject
  const subject = repo.subjects?.[elementId];
  if (subject) {
    if (subject.realizedByBlockId) {
      const block = repo.definitions?.[subject.realizedByBlockId];
      if (!block || block.kind !== 'block') {
        diagnostics.push({
          code: 'MISSING_SUBJECT_REALIZATION_BLOCK',
          severity: 'error',
          elementId,
          propertyPath: 'realizedByBlockId',
          message: `Subject ${elementId} references invalid realization block ${subject.realizedByBlockId}`,
        });
      }
    }
    return diagnostics;
  }

  // Check UseCase
  const useCase = repo.useCases?.[elementId];
  if (useCase) {
    if (useCase.subjectId) {
      if (!repo.subjects?.[useCase.subjectId]) {
        diagnostics.push({
          code: 'MISSING_USE_CASE_SUBJECT',
          severity: 'error',
          elementId,
          propertyPath: 'subjectId',
          message: `Use case ${elementId} references non-existent subject ${useCase.subjectId}`,
        });
      }
    }

    const seenEpNames = new Map<string, string>();
    for (const epId of useCase.extensionPointIds || []) {
      const ep = repo.extensionPoints?.[epId];
      if (!ep) {
        diagnostics.push({
          code: 'MISSING_EXTENSION_POINT_DEF',
          severity: 'error',
          elementId,
          propertyPath: 'extensionPointIds',
          message: `Use case ${elementId} references non-existent extension point ${epId}`,
        });
        continue;
      }
      if (ep.useCaseId !== elementId) {
        diagnostics.push({
          code: 'EXTENSION_POINT_OWNER_MISMATCH',
          severity: 'error',
          elementId,
          propertyPath: 'extensionPointIds',
          message: `Extension point ${epId} indicates owner ${ep.useCaseId} but is referenced by ${elementId}`,
        });
      }
      if (seenEpNames.has(ep.name)) {
        diagnostics.push({
          code: 'DUPLICATE_EXTENSION_POINT_NAME',
          severity: 'error',
          elementId,
          propertyPath: 'extensionPointIds',
          message: `Duplicate extension point name "${ep.name}" on use case ${elementId}`,
        });
      } else {
        seenEpNames.set(ep.name, epId);
      }
    }

    return diagnostics;
  }

  // Check ExtensionPoint
  const ep = repo.extensionPoints?.[elementId];
  if (ep) {
    if (!repo.useCases?.[ep.useCaseId]) {
      diagnostics.push({
        code: 'MISSING_EXTENSION_POINT_USE_CASE',
        severity: 'error',
        elementId,
        propertyPath: 'useCaseId',
        message: `Extension point ${elementId} references non-existent owner use case ${ep.useCaseId}`,
      });
    }
    return diagnostics;
  }

  return diagnostics;
}

/**
 * Validates use case relationships according to SysML 1.6 rules.
 */
export function validateUseCaseRelationship(
  repo: SysmlRepository,
  rel: SysmlRelationship
): SysmlDiagnostic[] {
  const diagnostics: SysmlDiagnostic[] = [];
  const { id, kind, sourceId, targetId } = rel;

  if (!isUseCaseRelationshipKind(kind)) {
    return diagnostics;
  }

  switch (kind) {
    case 'useCaseAssociation': {
      const isSourceActor = !!repo.actors?.[sourceId];
      const isTargetActor = !!repo.actors?.[targetId];
      const isSourceUc = !!repo.useCases?.[sourceId];
      const isTargetUc = !!repo.useCases?.[targetId];

      const validEndpoints =
        (isSourceActor && isTargetUc) || (isSourceUc && isTargetActor);

      if (!validEndpoints) {
        diagnostics.push({
          code: 'INVALID_USE_CASE_RELATIONSHIP_ENDPOINTS',
          severity: 'error',
          elementId: id,
          message: `Use-case association must connect an Actor and a UseCase (got ${sourceId} -> ${targetId})`,
        });
      }
      break;
    }

    case 'include': {
      const isSourceUc = !!repo.useCases?.[sourceId];
      const isTargetUc = !!repo.useCases?.[targetId];

      if (!isSourceUc || !isTargetUc) {
        diagnostics.push({
          code: 'INVALID_USE_CASE_RELATIONSHIP_ENDPOINTS',
          severity: 'error',
          elementId: id,
          message: `Include relationship must connect two UseCases (got ${sourceId} -> ${targetId})`,
        });
        break;
      }

      if (sourceId === targetId) {
        diagnostics.push({
          code: 'INCLUDE_SELF_LOOP',
          severity: 'error',
          elementId: id,
          message: `Use case ${sourceId} cannot include itself`,
        });
        break;
      }

      // Cycle check across all include relationships
      const existingIncludes = Object.values(repo.relationships || {})
        .filter(r => r.kind === 'include' && r.id !== id)
        .map(r => ({ from: r.sourceId, to: r.targetId }));
      existingIncludes.push({ from: sourceId, to: targetId });

      const cycle = detectUseCaseCycles(existingIncludes);
      if (cycle && cycle.includes(sourceId)) {
        diagnostics.push({
          code: 'INCLUDE_CYCLE',
          severity: 'error',
          elementId: id,
          message: `Include cycle detected: ${cycle.join(' -> ')}`,
        });
      }
      break;
    }

    case 'extend': {
      const isSourceUc = !!repo.useCases?.[sourceId];
      const isTargetUc = !!repo.useCases?.[targetId];

      if (!isSourceUc || !isTargetUc) {
        diagnostics.push({
          code: 'INVALID_USE_CASE_RELATIONSHIP_ENDPOINTS',
          severity: 'error',
          elementId: id,
          message: `Extend relationship must connect two UseCases (got ${sourceId} -> ${targetId})`,
        });
        break;
      }

      if (sourceId === targetId) {
        diagnostics.push({
          code: 'EXTEND_SELF_LOOP',
          severity: 'error',
          elementId: id,
          message: `Use case ${sourceId} cannot extend itself`,
        });
        break;
      }

      if (!rel.extensionPointId) {
        diagnostics.push({
          code: 'MISSING_EXTENSION_POINT',
          severity: 'error',
          elementId: id,
          propertyPath: 'extensionPointId',
          message: `Extend relationship ${id} must specify target extensionPointId`,
        });
      } else {
        const targetUc = repo.useCases[targetId];
        if (!targetUc?.extensionPointIds?.includes(rel.extensionPointId)) {
          diagnostics.push({
            code: 'INVALID_EXTENSION_POINT',
            severity: 'error',
            elementId: id,
            propertyPath: 'extensionPointId',
            message: `Target use case ${targetId} does not define extension point ${rel.extensionPointId}`,
          });
        }
      }
      break;
    }

    case 'useCaseGeneralization': {
      const isSourceActor = !!repo.actors?.[sourceId];
      const isTargetActor = !!repo.actors?.[targetId];
      const isSourceUc = !!repo.useCases?.[sourceId];
      const isTargetUc = !!repo.useCases?.[targetId];

      const sameActorFamily = isSourceActor && isTargetActor;
      const sameUcFamily = isSourceUc && isTargetUc;

      if (!sameActorFamily && !sameUcFamily) {
        diagnostics.push({
          code: 'INVALID_GENERALIZATION_FAMILY',
          severity: 'error',
          elementId: id,
          message: `Generalization must connect elements of the same metaclass (both actors or both use cases)`,
        });
        break;
      }

      if (sourceId === targetId) {
        diagnostics.push({
          code: 'GENERALIZATION_SELF_LOOP',
          severity: 'error',
          elementId: id,
          message: `Element ${sourceId} cannot generalize itself`,
        });
        break;
      }

      // Check cycles
      const existingGens = Object.values(repo.relationships || {})
        .filter(r => r.kind === 'useCaseGeneralization' && r.id !== id)
        .map(r => ({ from: r.sourceId, to: r.targetId }));
      existingGens.push({ from: sourceId, to: targetId });

      const cycle = detectUseCaseCycles(existingGens);
      if (cycle && cycle.includes(sourceId)) {
        diagnostics.push({
          code: 'GENERALIZATION_CYCLE',
          severity: 'error',
          elementId: id,
          message: `Generalization cycle detected: ${cycle.join(' -> ')}`,
        });
      }
      break;
    }

    case 'useCaseSatisfy':
    case 'useCaseRefine':
    case 'useCaseTrace': {
      const isSourceUc = !!repo.useCases?.[sourceId];
      const isTargetReq = !!repo.requirements?.[targetId];
      const isSourceReq = !!repo.requirements?.[sourceId];
      const isTargetUc = !!repo.useCases?.[targetId];

      const validTrace = (isSourceUc && isTargetReq) || (isSourceReq && isTargetUc);

      if (!validTrace) {
        diagnostics.push({
          code: 'INVALID_TRACEABILITY_ENDPOINTS',
          severity: 'error',
          elementId: id,
          message: `Traceability relationship ${kind} must connect a UseCase and a Requirement`,
        });
      }
      break;
    }
  }

  return diagnostics;
}

/**
 * Derives a projection view of use cases for diagram rendering and inspection.
 */
export function deriveUseCaseView(
  repo: SysmlRepository,
  options?: { diagramId?: string; subjectId?: string }
): UseCaseView {
  const diagnostics: SysmlDiagnostic[] = [];

  let actors = Object.values(repo.actors || {});
  let subjects = Object.values(repo.subjects || {});
  let useCases = Object.values(repo.useCases || {});
  let extensionPoints = Object.values(repo.extensionPoints || {});
  let relationships = Object.values(repo.relationships || {}).filter(r =>
    isUseCaseRelationshipKind(r.kind)
  );
  let diagramReferences = Object.values(repo.diagramReferences || {});

  if (options?.subjectId) {
    subjects = subjects.filter(s => s.id === options.subjectId);
    useCases = useCases.filter(u => u.subjectId === options.subjectId);
    const useCaseIds = new Set(useCases.map(u => u.id));
    extensionPoints = extensionPoints.filter(ep => useCaseIds.has(ep.useCaseId));
    relationships = relationships.filter(
      r => useCaseIds.has(r.sourceId) || useCaseIds.has(r.targetId)
    );
  }

  // Stable deterministic sorting by id
  actors.sort((a, b) => a.id.localeCompare(b.id));
  subjects.sort((a, b) => a.id.localeCompare(b.id));
  useCases.sort((a, b) => a.id.localeCompare(b.id));
  extensionPoints.sort((a, b) => a.id.localeCompare(b.id));
  relationships.sort((a, b) => a.id.localeCompare(b.id));
  diagramReferences.sort((a, b) => a.diagramId.localeCompare(b.diagramId));

  // Collect diagnostics for entities in the view
  for (const a of actors) diagnostics.push(...validateUseCaseElement(repo, a.id));
  for (const s of subjects) diagnostics.push(...validateUseCaseElement(repo, s.id));
  for (const u of useCases) diagnostics.push(...validateUseCaseElement(repo, u.id));
  for (const ep of extensionPoints) diagnostics.push(...validateUseCaseElement(repo, ep.id));
  for (const r of relationships) diagnostics.push(...validateUseCaseRelationship(repo, r));

  return {
    diagramId: options?.diagramId,
    actors,
    subjects,
    useCases,
    extensionPoints,
    relationships,
    diagramReferences,
    diagnostics,
  };
}
