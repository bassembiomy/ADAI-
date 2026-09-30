import type { SysmlRepository } from '../engine/sysml/model';
import type { PresentationCoordinates } from '../engine/sysml/presentationState';
import type { SysmlEditorCommand, SysmlElement } from './sysmlCommandGateway';

export type SysmlCloneElementsInput = {
  sourceIds: string[];
  diagramId: string;
  drop: Pick<PresentationCoordinates, 'x' | 'y'>;
  repository: SysmlRepository;
  idFactory?: () => string;
};

function findElement(repository: SysmlRepository, id: string): SysmlElement | undefined {
  return repository.packages[id] || repository.diagrams[id] || repository.definitions[id] ||
    repository.usages[id] || repository.connectors[id] || repository.relationships[id] ||
    repository.requirements[id] || repository.verificationCases[id] || repository.evidence[id] ||
    repository.baselines[id] || repository.artifacts[id] || repository.actors?.[id] ||
    repository.subjects?.[id] || repository.useCases?.[id] || repository.extensionPoints?.[id] ||
    repository.diagramReferences?.[id];
}

function uniqueName(names: Set<string>, name: string): string {
  if (!names.has(name)) {
    names.add(name);
    return name;
  }
  let suffix = 1;
  while (names.has(`${name}_${suffix}`)) suffix += 1;
  const next = `${name}_${suffix}`;
  names.add(next);
  return next;
}

/** Builds a repository-first clone transaction. Unsupported/missing IDs are rejected by the gateway. */
export function buildSysmlCloneElementsCommand(input: SysmlCloneElementsInput): SysmlEditorCommand {
  const idFactory = input.idFactory ?? (() => crypto.randomUUID());
  const explicitSources = input.sourceIds.map(sourceId => ({ sourceId, source: findElement(input.repository, sourceId) }));
  const missing = explicitSources.find(entry => !entry.source);
  if (missing) throw new Error(`TYPE_NOT_FOUND: '${missing.sourceId}' cannot be copied because it does not exist.`);
  const sourceElements = explicitSources as Array<{ sourceId: string; source: SysmlElement }>;
  const idMap = new Map(sourceElements.map(({ sourceId }) => [sourceId, idFactory()]));
  // Relationships are derived from the selected endpoint set, rather than
  // requiring users to select the line as well as both nodes.
  const internalRelationships = Object.values(input.repository.relationships)
    .filter(relation => idMap.has(relation.sourceId) && idMap.has(relation.targetId))
    .filter(relation => !idMap.has(relation.id))
    .map(relation => ({ sourceId: relation.id, source: relation as SysmlElement }));
  for (const relation of internalRelationships) idMap.set(relation.sourceId, idFactory());
  const reservedNames = new Set(Object.values(input.repository.definitions).map(item => item.name));
  const commands = [...sourceElements, ...internalRelationships].flatMap(({ sourceId, source }, index) => {
    const cloneId = idMap.get(sourceId)!;
    // Relations only make sense when both endpoints are cloned. This matches
    // Simulink's copy behavior: external connections stay with the source.
    if ('sourceId' in source && 'targetId' in source && (!idMap.has(source.sourceId) || !idMap.has(source.targetId))) return [];
    const clone = structuredClone(source) as SysmlElement;
    clone.id = cloneId;
    if ('sourceId' in clone && idMap.has(clone.sourceId)) clone.sourceId = idMap.get(clone.sourceId)!;
    if ('targetId' in clone && idMap.has(clone.targetId)) clone.targetId = idMap.get(clone.targetId)!;
    if ('name' in clone && typeof clone.name === 'string') clone.name = uniqueName(reservedNames, clone.name);
    return [{
      type: 'createAndPresent' as const,
      element: clone,
      diagramId: input.diagramId,
      presentation: { x: input.drop.x + index * 24, y: input.drop.y + index * 24 },
    }];
  });
  return { type: 'batch', commands };
}
