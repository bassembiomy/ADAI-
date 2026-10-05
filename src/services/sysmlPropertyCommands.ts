import { parseMultiplicity, type BlockDefinition, type PartUsage, type PropertyDefinition, type SysmlRelationship, type SysmlRepository } from '../engine/sysml/model';
import { findPortOwner, findPropertyOwner, isPartProperty, PATH_SEPARATOR, resolveOccurrenceKey, resolvePartLike } from '../engine/sysml/partOccurrences';
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

/** The description of a part to add to a Block: only the fields a part property needs. */
export type PartPropertyInput = Pick<PartUsage, 'name' | 'ownerId' | 'typeId' | 'multiplicity'> & Partial<Pick<PartUsage, 'id' | 'propertyId' | 'aggregation'>>;

/**
 * Format 5: a part is a part/reference property of its owner Block. This plans
 * adding it (no PartUsage record is created). Returns undefined when the owner
 * is not a Block known to the repository.
 */
export function buildCreatePartPropertyCommand(
  repository: SysmlRepository,
  part: PartPropertyInput,
): SysmlMutationCommand | undefined {
  const owner = repository.definitions[part.ownerId];
  if (owner?.kind !== 'block') return undefined;
  const propertyId = createUniquePropertyId(repository, part.ownerId, part.id ?? part.name, part.propertyId);
  return {
    type: 'updateElement',
    elementId: owner.id,
    patch: {
      properties: [...owner.properties, {
        id: propertyId,
        name: part.name,
        kind: part.aggregation === 'reference' ? 'reference' : 'part',
        typeId: part.typeId,
        multiplicity: part.multiplicity,
      }],
    },
  };
}

export function buildBlockPropertyUpdateCommand(
  repository: SysmlRepository,
  elementId: string,
  patch: Record<string, unknown>,
): SysmlMutationPlan {
  const definition = repository.definitions[elementId];
  const hasSatisfactionPatch = Array.isArray(patch.satisfiedReqIds);
  if (!definition || definition.kind !== 'block' || (!Array.isArray(patch.properties) && !hasSatisfactionPatch)) {
    return { type: 'updateElement', elementId, patch };
  }
  const semanticPatch = { ...patch };
  delete semanticPatch.satisfiedReqIds;
  const properties = Array.isArray(patch.properties)
    ? patch.properties.map(property => normalizeProperty(property as Record<string, unknown>))
    : undefined;
  if (properties) semanticPatch.properties = properties;
  const commands: SysmlMutationCommand[] = [];
  if (properties) {
    // Removing a part from the list deletes that part, with the connectors that end in it.
    const keptIds = new Set(properties.map(property => property.id));
    const removedPartIds = definition.properties
      .filter(property => isPartProperty(repository, property) && !keptIds.has(property.id))
      .map(property => property.id);
    if (removedPartIds.length > 0) commands.push({ type: 'deleteElements', elementIds: removedPartIds });
  }
  if (Object.keys(semanticPatch).length > 0) commands.push({ type: 'updateElement', elementId, patch: semanticPatch });

  if (hasSatisfactionPatch) {
    const desiredRequirementIds = new Set((patch.satisfiedReqIds as unknown[]).filter((id): id is string => typeof id === 'string' && Boolean(id)));
    const existingSatisfactions = Object.values(repository.relationships).filter(
      relationship => relationship.kind === 'satisfy' && relationship.sourceId === elementId,
    );
    const unmatchedExisting = [...existingSatisfactions];
    for (const relationship of existingSatisfactions) {
      if (desiredRequirementIds.has(relationship.targetId)) {
        desiredRequirementIds.delete(relationship.targetId);
        unmatchedExisting.splice(unmatchedExisting.indexOf(relationship), 1);
      }
    }
    for (const requirementId of desiredRequirementIds) {
      const reusable = unmatchedExisting.shift();
      if (reusable) {
        commands.push({ type: 'updateElement', elementId: reusable.id, patch: { targetId: requirementId } });
        continue;
      }
      const baseId = `satisfy-${elementId}-${requirementId}`;
      let relationshipId = baseId;
      let suffix = 2;
      while (repository.relationships[relationshipId] || repository.definitions[relationshipId] || repository.requirements[relationshipId]) {
        relationshipId = `${baseId}-${suffix++}`;
      }
      const relationship: SysmlRelationship = {
        id: relationshipId, kind: 'satisfy', sourceId: elementId, targetId: requirementId,
      };
      commands.push({ type: 'createElement', element: relationship });
    }
    for (const relationship of unmatchedExisting) {
      commands.push({ type: 'deleteElements', elementIds: [relationship.id] });
    }
  }
  if (commands.length === 1) return commands[0];
  return { type: 'batch', commands };
}

/**
 * Format 5: a part has no usage record, so an update addressed to a part (its
 * property id or its property path) or to a Block port is an update of the Block
 * that declares it. Returns undefined when the id is neither.
 */
export function buildFeatureUpdateCommand(
  repository: SysmlRepository,
  elementId: string,
  patch: Record<string, unknown>,
): SysmlMutationCommand | undefined {
  const occurrence = elementId.includes(PATH_SEPARATOR) ? resolveOccurrenceKey(repository, elementId) : undefined;
  const propertyId = occurrence?.propertyId ?? elementId;
  const propertyOwner = occurrence
    ? findPropertyOwner(repository, occurrence.propertyId)
    : findPropertyOwner(repository, elementId);
  const owner = occurrence
    ? repository.definitions[occurrence.declaringBlockId]
    : propertyOwner?.block;
  if (owner?.kind === 'block' && owner.properties.some(property => property.id === propertyId && isPartProperty(repository, property))) {
    const properties = owner.properties.map(property => {
      if (property.id !== propertyId) return property;
      const next: PropertyDefinition = { ...property };
      if (typeof patch.name === 'string') next.name = patch.name;
      if (typeof patch.typeId === 'string') next.typeId = patch.typeId;
      if (typeof patch.aggregation === 'string') next.kind = patch.aggregation === 'reference' ? 'reference' : 'part';
      if (patch.kind === 'part' || patch.kind === 'reference') next.kind = patch.kind;
      if (typeof patch.multiplicity === 'string') next.multiplicity = parseMultiplicity(patch.multiplicity || '1');
      else if (patch.multiplicity && typeof patch.multiplicity === 'object') next.multiplicity = patch.multiplicity as PropertyDefinition['multiplicity'];
      return next;
    });
    return { type: 'updateElement', elementId: owner.id, patch: { properties } };
  }
  const portOwner = findPortOwner(repository, elementId);
  if (portOwner) {
    const ports = portOwner.block.ports.map(port => {
      if (port.id !== elementId) return port;
      const next = { ...port };
      if (typeof patch.name === 'string') next.name = patch.name;
      if (typeof patch.typeId === 'string') next.typeId = patch.typeId;
      if (patch.direction === 'in' || patch.direction === 'out' || patch.direction === 'inout') next.direction = patch.direction;
      if (typeof patch.isConjugated === 'boolean') next.isConjugated = patch.isConjugated;
      return next;
    });
    return { type: 'updateElement', elementId: portOwner.block.id, patch: { ports } };
  }
  return undefined;
}

/** An update addressed to a part or port: it edits the Block property/port that declares it. */
export function buildPartUpdateCommand(
  repository: SysmlRepository,
  elementId: string,
  patch: Record<string, unknown>,
): SysmlMutationPlan {
  return buildFeatureUpdateCommand(repository, elementId, patch) ?? { type: 'updateElement', elementId, patch };
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
  // Format 5: the part is the Block property itself (addressed by property id or property path); retyping edits that property.
  const resolved = input.repository ? resolvePartLike(input.repository, input.partId) : undefined;
  const partProperty = resolved?.kind === 'part' && resolved.propertyId && input.repository
    ? findPropertyOwner(input.repository, resolved.propertyId)
    : undefined;
  if (partProperty) {
    commands.push({
      type: 'updateElement',
      elementId: partProperty.block.id,
      patch: {
        properties: partProperty.block.properties.map(property =>
          property.id === partProperty.feature.id ? { ...property, typeId: definition.id } : property),
      },
    });
  }
  return {
    type: 'batch',
    commands,
  };
}

export type RelationshipUpdateOutcome =
  | { ok: true; command: { type: 'updateElement'; elementId: string; patch: Record<string, unknown> } }
  | { ok: false; diagnostic: { code: string; message: string } };

export function buildRelationshipUpdateCommand(
  repository: SysmlRepository,
  relationshipId: string,
  patch: Record<string, unknown>,
): RelationshipUpdateOutcome {
  const existing = repository.relationships?.[relationshipId];
  if (!existing) {
    return {
      ok: false,
      diagnostic: {
        code: 'RELATIONSHIP_NOT_FOUND',
        message: `Relationship '${relationshipId}' does not exist in repository.`,
      },
    };
  }

  const normalizedPatch: Record<string, unknown> = {};

  if (typeof patch.name === 'string') {
    normalizedPatch.name = patch.name;
  }
  if (typeof patch.label === 'string' && patch.name === undefined) {
    normalizedPatch.name = patch.label;
  }
  if (typeof patch.kind === 'string') {
    normalizedPatch.kind = patch.kind === 'aggregation' ? 'sharedAggregation' : patch.kind === 'derive' ? 'deriveReqt' : patch.kind;
  }
  if (typeof patch.type === 'string' && patch.kind === undefined) {
    normalizedPatch.kind = patch.type === 'aggregation' ? 'sharedAggregation' : patch.type === 'derive' ? 'deriveReqt' : patch.type;
  }
  if ('sourceRole' in patch) {
    normalizedPatch.sourceRole = typeof patch.sourceRole === 'string' && patch.sourceRole.trim() !== '' ? patch.sourceRole.trim() : undefined;
  }
  if ('targetRole' in patch) {
    normalizedPatch.targetRole = typeof patch.targetRole === 'string' && patch.targetRole.trim() !== '' ? patch.targetRole.trim() : undefined;
  }
  if (typeof patch.sourceNavigable === 'boolean') {
    normalizedPatch.sourceNavigable = patch.sourceNavigable;
  }
  if (typeof patch.targetNavigable === 'boolean') {
    normalizedPatch.targetNavigable = patch.targetNavigable;
  }
  if (typeof patch.sourceAggregation === 'string') {
    normalizedPatch.sourceAggregation = patch.sourceAggregation;
  }
  if (typeof patch.targetAggregation === 'string') {
    normalizedPatch.targetAggregation = patch.targetAggregation;
  }

  if ('sourceMultiplicity' in patch) {
    if (patch.sourceMultiplicity === undefined || patch.sourceMultiplicity === null || patch.sourceMultiplicity === '') {
      normalizedPatch.sourceMultiplicity = undefined;
    } else if (typeof patch.sourceMultiplicity === 'string') {
      try {
        normalizedPatch.sourceMultiplicity = parseMultiplicity(patch.sourceMultiplicity);
      } catch (err) {
        return {
          ok: false,
          diagnostic: {
            code: 'INVALID_MULTIPLICITY',
            message: `Invalid source multiplicity: ${(err as Error).message}`,
          },
        };
      }
    } else if (typeof patch.sourceMultiplicity === 'object') {
      normalizedPatch.sourceMultiplicity = patch.sourceMultiplicity;
    }
  }

  if ('targetMultiplicity' in patch) {
    if (patch.targetMultiplicity === undefined || patch.targetMultiplicity === null || patch.targetMultiplicity === '') {
      normalizedPatch.targetMultiplicity = undefined;
    } else if (typeof patch.targetMultiplicity === 'string') {
      try {
        normalizedPatch.targetMultiplicity = parseMultiplicity(patch.targetMultiplicity);
      } catch (err) {
        return {
          ok: false,
          diagnostic: {
            code: 'INVALID_MULTIPLICITY',
            message: `Invalid target multiplicity: ${(err as Error).message}`,
          },
        };
      }
    } else if (typeof patch.targetMultiplicity === 'object') {
      normalizedPatch.targetMultiplicity = patch.targetMultiplicity;
    }
  }

  // Preserve immutable sourceId and targetId unchanged
  delete normalizedPatch.sourceId;
  delete normalizedPatch.targetId;

  return {
    ok: true,
    command: {
      type: 'updateElement',
      elementId: relationshipId,
      patch: normalizedPatch,
    },
  };
}

