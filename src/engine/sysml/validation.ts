import { qualifiedName, type BlockDefinition, type SysmlRepository } from './model';
import { validateRequirementContainment } from './requirements';

export { validateRequirementContainment };

export interface SysmlDiagnostic {
  code: string;
  severity: 'info' | 'warning' | 'error';
  elementId?: string;
  propertyPath?: string;
  message: string;
}

export interface SysmlValidationReport {
  valid: boolean;
  diagnostics: SysmlDiagnostic[];
  canSimulate: boolean;
  canExport: boolean;
  canReport: boolean;
  canVerify: boolean;
}

export function validateSysmlRepository(repo: SysmlRepository): SysmlValidationReport {
  const diagnostics: SysmlDiagnostic[] = [];
  const error = (code: string, elementId: string, propertyPath: string, message: string) => {
    diagnostics.push({ code, severity: 'error', elementId, propertyPath, message });
  };
  const collections = [
    repo.definitions, repo.usages, repo.connectors, repo.relationships, repo.requirements,
    repo.verificationCases, repo.evidence, repo.baselines, repo.artifacts,
  ] as const;
  const nestedFeatures = Object.values(repo.definitions).flatMap(definition => definition.kind === 'block' ? [...definition.properties, ...definition.ports] : []);
  const all = [...collections.flatMap(collection => Object.values(collection)), ...nestedFeatures] as Array<{ id: string }>;
  const ids = new Set<string>();
  const duplicateIds = new Set<string>();
  for (const element of all) {
    if (ids.has(element.id) && !duplicateIds.has(element.id)) {
      error('DUPLICATE_ELEMENT_ID', element.id, 'id', `Element ID ${element.id} is not globally unique`);
      duplicateIds.add(element.id);
    }
    ids.add(element.id);
  }

  const names = new Map<string, string>();
  for (const element of [...Object.values(repo.definitions), ...Object.values(repo.requirements)]) {
    const name = qualifiedName(element.namespace, element.name);
    const previous = names.get(name);
    if (previous && previous !== element.id) {
      error('DUPLICATE_QUALIFIED_NAME', element.id, 'name', `Qualified name ${name} is also used by ${previous}`);
    } else names.set(name, element.id);
  }

  const ownerIds = new Set([...Object.keys(repo.definitions), ...Object.keys(repo.usages), ...all.map(e => e.id)]);
  const blockIds = new Set(Object.values(repo.definitions).filter(d => d.kind === 'block').map(d => d.id));
  for (const usage of Object.values(repo.usages)) {
    if (usage.kind === 'part') {
      if (!ownerIds.has(usage.ownerId)) error('MISSING_USAGE_OWNER', usage.id, 'ownerId', `Owner ${usage.ownerId} does not exist`);
      if (!blockIds.has(usage.typeId)) error('MISSING_USAGE_TYPE', usage.id, 'typeId', `Block type ${usage.typeId} does not exist`);
      validateMultiplicity(usage.id, usage.multiplicity.lower, usage.multiplicity.upper, error);
    } else {
      if (!ownerIds.has(usage.ownerId)) error('MISSING_USAGE_OWNER', usage.id, 'ownerId', `Owner ${usage.ownerId} does not exist`);
      if (!ids.has(usage.definitionId)) error('MISSING_USAGE_TYPE', usage.id, 'definitionId', `Port definition ${usage.definitionId} does not exist`);
    }
  }

  for (const definition of Object.values(repo.definitions)) {
    if (definition.kind !== 'block') continue;
    for (const supertypeId of definition.supertypeIds ?? []) {
      if (!blockIds.has(supertypeId)) error('MISSING_SUPERTYPE', definition.id, 'supertypeIds', `Supertype ${supertypeId} does not exist`);
    }
    for (const property of definition.properties) validateMultiplicity(property.id, property.multiplicity.lower, property.multiplicity.upper, error);
    for (const port of definition.ports) validateMultiplicity(port.id, port.multiplicity.lower, port.multiplicity.upper, error);
  }

  detectCycles(
    Object.values(repo.definitions).filter((d): d is BlockDefinition => d.kind === 'block'),
    d => d.supertypeIds ?? [], 'INHERITANCE_CYCLE', 'supertypeIds', error,
  );
  const compositeParts = Object.values(repo.usages).filter(u => u.kind === 'part' && u.aggregation === 'composite');
  detectCycles(compositeParts, p => [p.ownerId], 'COMPOSITE_CONTAINMENT_CYCLE', 'ownerId', error);

  const compositionOwners = new Map<string, string>();
  for (const relationship of Object.values(repo.relationships)) {
    if (!ids.has(relationship.sourceId)) error('MISSING_RELATIONSHIP_ENDPOINT', relationship.id, 'sourceId', `Source ${relationship.sourceId} does not exist`);
    if (!ids.has(relationship.targetId)) error('MISSING_RELATIONSHIP_ENDPOINT', relationship.id, 'targetId', `Target ${relationship.targetId} does not exist`);
    if (relationship.kind === 'composition') {
      const previous = compositionOwners.get(relationship.targetId);
      if (previous && previous !== relationship.sourceId) {
        error('MULTIPLE_COMPOSITE_OWNERS', relationship.targetId, 'ownerId', `Composite usage is owned by both ${previous} and ${relationship.sourceId}`);
      } else compositionOwners.set(relationship.targetId, relationship.sourceId);
    }
    if (relationship.kind === 'requirementContainment') {
      diagnostics.push(...validateRequirementContainment(repo, relationship.id));
    } else if (!hasValidDirection(relationship.kind, relationship.sourceId, relationship.targetId, repo)) {
      error('INVALID_RELATIONSHIP_DIRECTION', relationship.id, 'kind', `${relationship.kind} has invalid SysML endpoint direction`);
    }
  }

  const hasErrors = diagnostics.some(d => d.severity === 'error');
  return {
    valid: !hasErrors,
    diagnostics,
    canSimulate: !hasErrors,
    canExport: !hasErrors,
    canReport: !hasErrors,
    canVerify: !hasErrors,
  };
}

function validateMultiplicity(
  id: string, lower: number, upper: number | '*',
  error: (code: string, elementId: string, path: string, message: string) => void,
) {
  if (!Number.isSafeInteger(lower) || lower < 0 || (upper !== '*' && (!Number.isSafeInteger(upper) || upper < lower))) {
    error('INVALID_MULTIPLICITY', id, 'multiplicity', `Invalid multiplicity ${lower}..${upper}`);
  }
}

function detectCycles<T extends { id: string }>(
  elements: readonly T[], next: (element: T) => readonly string[], code: string, path: string,
  error: (code: string, elementId: string, path: string, message: string) => void,
) {
  const byId = new Map(elements.map(element => [element.id, element]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const reported = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) {
      if (!reported.has(id)) error(code, id, path, `Cycle includes ${id}`);
      reported.add(id);
      return;
    }
    if (visited.has(id)) return;
    const element = byId.get(id);
    if (!element) return;
    visiting.add(id);
    for (const nextId of next(element)) visit(nextId);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of byId.keys()) visit(id);
}

function hasValidDirection(kind: string, sourceId: string, targetId: string, repo: SysmlRepository): boolean {
  const sourceRequirement = Boolean(repo.requirements[sourceId]);
  const targetRequirement = Boolean(repo.requirements[targetId]);
  switch (kind) {
    case 'deriveReqt':
    case 'copy': return sourceRequirement && targetRequirement;
    case 'composition': return !sourceRequirement && !targetRequirement;
    case 'satisfy': return !sourceRequirement && targetRequirement;
    case 'verify': return Boolean(repo.verificationCases[sourceId]) && targetRequirement;
    case 'refine': return !sourceRequirement && targetRequirement;
    default: return true;
  }
}
