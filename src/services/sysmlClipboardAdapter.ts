import { qualifiedName, type SysmlRepository, type SysmlEntity } from '../engine/sysml/model';
import type { DiagramPresentation, PresentationCoordinates } from '../engine/sysml/presentationState';
import type { SysmlEditorCommand, SysmlElement } from './sysmlCommandGateway';

export interface SysmlPastePlan {
  command: SysmlEditorCommand;
  pastedIds: string[];
}

function entities(repository: SysmlRepository): SysmlEntity[] {
  return Object.values(repository).flatMap(value =>
    value && typeof value === 'object' && !Array.isArray(value) ? Object.values(value as Record<string, SysmlEntity>) : [],
  ).filter((item): item is SysmlEntity => !!item && typeof item === 'object' && 'id' in item && 'kind' in item);
}

function remapEntity(entity: SysmlEntity, idMap: Map<string, string>): SysmlEntity {
  const clone: Record<string, unknown> = structuredClone(entity) as unknown as Record<string, unknown>;
  clone.id = idMap.get(entity.id)!;
  for (const field of ['ownerId', 'typeId', 'sourceId', 'targetId', 'sourcePortId', 'targetPortId', 'itemFlowId', 'sourceParameterId', 'targetParameterId', 'verificationCaseId', 'requirementId', 'subjectId', 'useCaseId', 'realizedByBlockId', 'representedBlockId', 'classifierId']) {
    const value = clone[field];
    if (typeof value === 'string' && idMap.has(value)) clone[field] = idMap.get(value);
  }
  for (const field of ['verifiesRequirementIds', 'generalizationIds', 'extensionPointIds']) {
    const values = clone[field];
    if (Array.isArray(values)) clone[field] = values.map(value => typeof value === 'string' ? idMap.get(value) ?? value : value);
  }
  for (const field of ['properties', 'ports']) {
    const values = clone[field];
    if (Array.isArray(values)) {
      clone[field] = values.map((raw: unknown) => {
        if (!raw || typeof raw !== 'object' || !('id' in raw)) return raw;
        const item = { ...raw } as Record<string, unknown>;
        const oldId = String(item.id);
        const nextId = idMap.get(oldId) ?? idMap.get(`${entity.id}:${oldId}`);
        if (nextId) item.id = nextId;
        for (const fieldName of ['typeId', 'redefinesId', 'subsetsId', 'inheritedFromId']) {
          const reference = item[fieldName];
          if (typeof reference === 'string' && idMap.has(reference)) item[fieldName] = idMap.get(reference);
        }
        return item;
      });
    }
  }
  return clone as unknown as SysmlEntity;
}

export function buildSysmlPastePlan(
  repository: SysmlRepository,
  diagramPresentations: Record<string, DiagramPresentation>,
  selectedIds: readonly string[],
  diagramId: string,
  createId: () => string,
  offset = 24,
  /** Repository the copies are pasted into (the clipboard may hold an earlier snapshot). */
  targetRepository: SysmlRepository = repository,
): SysmlPastePlan | null {
  const byId = new Map(entities(repository).map(entity => [entity.id, entity]));
  const originals = [...new Set(selectedIds)].map(id => byId.get(id)).filter((item): item is SysmlEntity => item !== undefined);
  if (originals.length === 0) return null;

  const idMap = new Map(originals.map(entity => [entity.id, createId()]));
  for (const entity of originals) {
    const nested = entity as SysmlEntity & { properties?: Array<{ id: string }>; ports?: Array<{ id: string }> };
    for (const item of [...(nested.properties ?? []), ...(nested.ports ?? [])]) {
      const nextId = createId();
      idMap.set(item.id, nextId);
      idMap.set(`${entity.id}:${item.id}`, nextId);
    }
  }

  // Definitions and requirements need a unique qualified name: a copy pasted next to its
  // original is numbered (Motor -> Motor2), a cut element pasted back keeps its name.
  const takenNames = new Set([...Object.values(targetRepository.definitions), ...Object.values(targetRepository.requirements)]
    .map(element => qualifiedName(element.namespace, element.name)));
  const uniqueName = (namespace: readonly string[], base: string) => {
    let name = base;
    for (let index = 2; takenNames.has(qualifiedName(namespace, name)); index += 1) name = `${base}${index}`;
    takenNames.add(qualifiedName(namespace, name));
    return name;
  };
  const isNamedScope = (entity: SysmlEntity) =>
    Boolean(targetRepository.definitions[entity.id] ?? repository.definitions[entity.id] ?? targetRepository.requirements[entity.id] ?? repository.requirements[entity.id]);

  const diagram = diagramPresentations[diagramId];
  const coordinates: Record<string, PresentationCoordinates> = {};
  const commands: Extract<SysmlEditorCommand, { type: 'batch' }>['commands'] = [];
  for (const entity of originals) {
    const clone = remapEntity(entity, idMap) as SysmlEntity & { name?: string; namespace?: string[] };
    if (isNamedScope(entity) && typeof clone.name === 'string' && Array.isArray(clone.namespace)) {
      clone.name = uniqueName(clone.namespace, clone.name);
    }
    commands.push({ type: 'createElement', element: clone as SysmlElement });
    const oldBounds = diagram?.presentations[entity.id]?.bounds ?? {};
    coordinates[idMap.get(entity.id)!] = {
      x: (oldBounds.x ?? 0) + offset,
      y: (oldBounds.y ?? 0) + offset,
      width: oldBounds.width,
      height: oldBounds.height,
    };
  }
  commands.push({ type: 'addToDiagram', diagramId, elementIds: originals.map(entity => idMap.get(entity.id)!), coordinates });
  return {
    command: { type: 'batch', commands },
    pastedIds: originals.map(entity => idMap.get(entity.id)!),
  };
}
