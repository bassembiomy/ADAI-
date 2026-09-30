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

function uniqueName(repository: SysmlRepository, name: string): string {
  const names = new Set(Object.values(repository.definitions).map(item => item.name));
  if (!names.has(name)) return name;
  let suffix = 1;
  while (names.has(`${name}_${suffix}`)) suffix += 1;
  return `${name}_${suffix}`;
}

/** Builds a repository-first clone transaction. Unsupported/missing IDs are rejected by the gateway. */
export function buildSysmlCloneElementsCommand(input: SysmlCloneElementsInput): SysmlEditorCommand {
  const idFactory = input.idFactory ?? (() => crypto.randomUUID());
  const sourceElements = input.sourceIds.map(sourceId => ({ sourceId, source: findElement(input.repository, sourceId) }))
    .filter((entry): entry is { sourceId: string; source: SysmlElement } => Boolean(entry.source));
  const idMap = new Map(sourceElements.map(({ sourceId }) => [sourceId, idFactory()]));
  const commands = sourceElements.flatMap(({ sourceId, source }, index) => {
    const cloneId = idMap.get(sourceId)!;
    // Relations only make sense when both endpoints are cloned. This matches
    // Simulink's copy behavior: external connections stay with the source.
    if ('sourceId' in source && 'targetId' in source && (!idMap.has(source.sourceId) || !idMap.has(source.targetId))) return [];
    const clone = structuredClone(source) as SysmlElement;
    clone.id = cloneId;
    if ('sourceId' in clone && idMap.has(clone.sourceId)) clone.sourceId = idMap.get(clone.sourceId)!;
    if ('targetId' in clone && idMap.has(clone.targetId)) clone.targetId = idMap.get(clone.targetId)!;
    if ('name' in clone && typeof clone.name === 'string') clone.name = uniqueName(input.repository, clone.name);
    return [{
      type: 'createAndPresent' as const,
      element: clone,
      diagramId: input.diagramId,
      presentation: { x: input.drop.x + index * 24, y: input.drop.y + index * 24 },
    }];
  });
  return { type: 'batch', commands };
}
