import { parseMultiplicity, type BlockDefinition, type PartUsage, type PropertyDefinition, type SysmlRepository } from '../engine/sysml/model';
import type { SysmlEditorCommand, SysmlMutationCommand } from './sysmlCommandGateway';

type SysmlMutationPlan = SysmlMutationCommand | { type: 'batch'; commands: SysmlMutationCommand[]; coalesceKey?: string };

function normalizeProperty(property: Record<string, unknown>): PropertyDefinition {
  const multiplicityValue = property.multiplicity;
  const multiplicity = typeof multiplicityValue === 'string'
    ? parseMultiplicity(multiplicityValue || '1')
    : multiplicityValue && typeof multiplicityValue === 'object'
      ? multiplicityValue as PropertyDefinition['multiplicity']
      : { lower: 1, upper: 1, ordered: false, unique: true };
  return {
    ...(property as unknown as PropertyDefinition),
    id: String(property.id),
    name: String(property.name ?? ''),
    kind: (['value', 'part', 'reference', 'flow'].includes(String(property.kind)) ? property.kind : 'value') as PropertyDefinition['kind'],
    typeId: String(property.typeId ?? property.type ?? ''),
    multiplicity: {
      ...multiplicity,
      ordered: Boolean((property.ordered as boolean | undefined) ?? multiplicity.ordered),
      unique: Boolean((property.unique as boolean | undefined) ?? multiplicity.unique),
    },
  };
}

function usageForProperty(ownerId: string, property: PropertyDefinition): PartUsage {
  return {
    id: `part-property:${ownerId}:${property.id}`,
    propertyId: property.id,
    kind: 'part',
    name: property.name,
    ownerId,
    typeId: property.typeId,
    aggregation: property.kind === 'reference' ? 'reference' : 'composite',
    multiplicity: property.multiplicity,
  };
}

function createUniquePropertyId(repository: SysmlRepository, ownerId: string, usageId: string, requested?: string): string {
  const nestedIds = Object.values(repository.definitions).flatMap(definition => definition.kind === 'block'
    ? [...definition.properties.map(property => property.id), ...definition.ports.map(port => port.id)]
    : []);
  const topLevelIds = [
    ...Object.keys(repository.packages), ...Object.keys(repository.diagrams), ...Object.keys(repository.definitions),
    ...Object.keys(repository.usages), ...Object.keys(repository.connectors), ...Object.keys(repository.relationships),
    ...Object.keys(repository.requirements), ...Object.keys(repository.verificationCases), ...Object.keys(repository.evidence),
    ...Object.keys(repository.baselines), ...Object.keys(repository.artifacts), ...Object.keys(repository.actors),
    ...Object.keys(repository.subjects), ...Object.keys(repository.useCases), ...Object.keys(repository.extensionPoints),
    ...Object.keys(repository.diagramReferences),
  ];
  const used = new Set([...nestedIds, ...topLevelIds]);
  const base = requested || `property:${ownerId}:${usageId}`;
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) candidate = `${base}:${suffix++}`;
  return candidate;
}

export function buildCreatePartUsageCommand(
  repository: SysmlRepository,
  usage: PartUsage,
  presentation?: { x?: number; y?: number; width?: number; height?: number },
): SysmlMutationPlan {
  const propertyId = createUniquePropertyId(repository, usage.ownerId, usage.id, usage.propertyId);
  const partUsage: PartUsage = { ...usage, propertyId };
  const commands: SysmlMutationCommand[] = [{ type: 'createElement', element: partUsage, presentation }];
  const owner = repository.definitions[usage.ownerId];
  if (owner?.kind === 'block') {
    commands.push({
      type: 'updateElement',
      elementId: owner.id,
      patch: {
        properties: [...owner.properties, {
          id: propertyId,
          name: usage.name,
          kind: usage.aggregation === 'reference' ? 'reference' : 'part',
          typeId: usage.typeId,
          multiplicity: usage.multiplicity,
        }],
      },
    });
  }
  return { type: 'batch', commands };
}

export function buildBlockPropertyUpdateCommand(
  repository: SysmlRepository,
  elementId: string,
  patch: Record<string, unknown>,
): SysmlMutationPlan {
  const definition = repository.definitions[elementId];
  if (!definition || definition.kind !== 'block' || !Array.isArray(patch.properties)) {
    return { type: 'updateElement', elementId, patch };
  }
  const properties = patch.properties.map(property => normalizeProperty(property as Record<string, unknown>));
  const commands: Extract<SysmlEditorCommand, { type: 'batch' }>['commands'] = [
    { type: 'updateElement', elementId, patch: { ...patch, properties } },
  ];
  const desired = new Map(properties.filter(property => property.kind === 'part' || property.kind === 'reference').map(property => [property.id, usageForProperty(elementId, property)]));
  const retainedUsageIds = new Set<string>();
  for (const [usageId, usage] of Object.entries(repository.usages)) {
    if (usage.kind !== 'part' || usage.ownerId !== elementId) continue;
    const [propertyId, next] = [...desired.entries()].find(([id, candidate]) => id === usage.propertyId || (!usage.propertyId && candidate.id === usageId)) ?? [];
    if (!next || propertyId === undefined) commands.push({ type: 'deleteElements', elementIds: [usageId] });
    else {
      desired.delete(propertyId);
      retainedUsageIds.add(usageId);
      const updatedUsage = { ...next, id: usageId };
      if (JSON.stringify(usage) !== JSON.stringify(updatedUsage)) commands.push({ type: 'updateElement', elementId: usageId, patch: updatedUsage as unknown as Record<string, unknown> });
    }
  }
  for (const usage of desired.values()) {
    if (!retainedUsageIds.has(usage.id)) commands.push({ type: 'createElement', element: usage });
  }
  return { type: 'batch', commands };
}

export function buildPartUsageUpdateCommand(
  repository: SysmlRepository,
  elementId: string,
  patch: Record<string, unknown>,
): SysmlMutationPlan {
  const usage = repository.usages[elementId];
  if (!usage || usage.kind !== 'part') return { type: 'updateElement', elementId, patch };
  const canonicalPatch: Record<string, unknown> = { ...patch };
  if (typeof patch.multiplicity === 'string') canonicalPatch.multiplicity = parseMultiplicity(patch.multiplicity || '1');
  const commands: Extract<SysmlEditorCommand, { type: 'batch' }>['commands'] = [
    { type: 'updateElement', elementId, patch: canonicalPatch },
  ];
  const owner = repository.definitions[usage.ownerId];
  if (owner?.kind === 'block') {
    const propertyId = usage.propertyId ?? elementId;
    const property = owner.properties.find(item => item.id === propertyId);
    if (property) {
      const nextProperties = owner.properties.map(item => item.id !== propertyId ? item : {
        ...item,
        ...(typeof patch.name === 'string' ? { name: patch.name } : {}),
        ...(typeof patch.typeId === 'string' ? { typeId: patch.typeId } : {}),
        ...(typeof patch.aggregation === 'string' ? { kind: patch.aggregation === 'reference' ? 'reference' : 'part' as const } : {}),
        ...(typeof canonicalPatch.multiplicity === 'object' ? { multiplicity: canonicalPatch.multiplicity as PropertyDefinition['multiplicity'] } : {}),
      });
      commands.push({ type: 'updateElement', elementId: owner.id, patch: { properties: nextProperties } });
    }
  }
  return { type: 'batch', commands };
}

export function buildCreatePartDefinitionCommand(input: {
  partId: string;
  definitionId: string;
  definitionName: string;
  ownerId?: string;
  repository?: SysmlRepository;
}): SysmlEditorCommand {
  const ownerId = input.ownerId || 'model';
  const definition: BlockDefinition = {
    id: input.definitionId,
    name: input.definitionName,
    kind: 'block',
    namespace: ownerId === 'model' ? ['model'] : [ownerId],
    ownerId,
    isAbstract: false,
    isLeaf: false,
    properties: [],
    ports: [],
    operations: [],
    constraints: [],
  };
  const commands: Extract<SysmlEditorCommand, { type: 'batch' }>['commands'] = [
      { type: 'createElement', element: definition },
    ];
  const part = input.repository?.usages[input.partId];
  const owner = part?.kind === 'part' ? input.repository?.definitions[part.ownerId] : undefined;
  let propertyId = part?.kind === 'part' ? part.propertyId : undefined;
  if (part?.kind === 'part' && input.repository) {
    const existingProperty = owner?.kind === 'block'
      ? owner.properties.find(property => property.id === part.propertyId)
      : undefined;
    propertyId = existingProperty?.id ?? createUniquePropertyId(input.repository, part.ownerId, part.id, propertyId);
    commands.push({ type: 'updateElement', elementId: part.id, patch: { typeId: definition.id, propertyId } });
  }
  if (part?.kind === 'part' && owner?.kind === 'block' && input.repository) {
    const existing = owner.properties.find(property => property.id === part.propertyId);
    const newProperty: PropertyDefinition = existing
      ? { ...existing, typeId: definition.id }
      : {
        id: propertyId!,
        name: part.name,
        kind: part.aggregation === 'reference' ? 'reference' : 'part',
        typeId: definition.id,
        multiplicity: part.multiplicity,
      };
    if (existing || newProperty) commands.push({
      type: 'updateElement',
      elementId: owner.id,
      patch: { properties: [...owner.properties.filter(property => property.id !== newProperty.id), newProperty] },
    });
  }
  return {
    type: 'batch',
    commands,
  };
}
