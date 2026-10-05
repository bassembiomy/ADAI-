import { qualifiedName, type BlockDefinition, type SysmlRelationship, type SysmlRepository } from './model';
import { validateRequirementContainment } from './requirements';
import { classifyRelationship, parsePolicyDiagnostic } from './policy';
import {
  validateUseCaseElement,
  validateUseCaseRelationship,
  isUseCaseRelationshipKind,
} from './useCases';
import { validateRepositoryPorts } from './validation/portRules';
import { validateDefinitionRules } from './validation/definitionRules';
import { activityNestedIds, validateActivities } from './activity';
import { interactionNestedIds, validateInteractions } from './interaction';
import { isParametricBinding, validateParametricBinding } from './parametric';
import { connectorEndOf, resolveConnectorEnd } from './connectorEnds';
import { resolveRepositoryEndpoint, resolveSemanticEndpoint, type SemanticEndpointContext } from './semanticEndpointIndex';
import { validateAssociationEnds } from './bdd';
import { effectiveSupertypeIds } from './services/supertypes';

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

export function validateSysmlRepository(repo: SysmlRepository, context?: SemanticEndpointContext): SysmlValidationReport {
  const diagnostics: SysmlDiagnostic[] = [];
  const error = (code: string, elementId: string, propertyPath: string, message: string) => {
    diagnostics.push({ code, severity: 'error', elementId, propertyPath, message });
  };
  const collections = [
    repo.packages, repo.diagrams, repo.definitions, repo.usages, repo.connectors, repo.relationships, repo.requirements,
    repo.verificationCases, repo.evidence, repo.baselines, repo.artifacts,
    repo.actors ?? {}, repo.subjects ?? {}, repo.useCases ?? {},
    repo.extensionPoints ?? {}, repo.diagramReferences ?? {},
  ] as const;
  const nestedFeatures = Object.values(repo.definitions).flatMap(definition =>
    definition.kind === 'block' ? [...definition.properties, ...definition.ports]
      : definition.kind === 'constraintBlock' ? definition.parameters
      : definition.kind === 'activity' ? activityNestedIds(definition).map(id => ({ id }))
      : definition.kind === 'interaction' ? interactionNestedIds(definition).map(id => ({ id })) : []);
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
  if (context?.externalEndpoints) {
    for (const extId of context.externalEndpoints.keys()) {
      ids.add(extId);
    }
  }

  for (const pkg of Object.values(repo.packages)) {
    if (pkg.id === 'model') continue;
    if (!pkg.ownerId || !repo.packages[pkg.ownerId]) {
      error('INVALID_PACKAGE_OWNER', pkg.id, 'ownerId', `Package owner ${pkg.ownerId || '(none)'} is not a Package or Model`);
      continue;
    }
    const seen = new Set<string>([pkg.id]);
    let ownerId: string | undefined = pkg.ownerId;
    while (ownerId && ownerId !== 'model' && repo.packages[ownerId]) {
      if (seen.has(ownerId)) {
        error('PACKAGE_OWNERSHIP_CYCLE', pkg.id, 'ownerId', `Package ${pkg.id} participates in an ownership cycle`);
        break;
      }
      seen.add(ownerId);
      ownerId = repo.packages[ownerId].ownerId;
    }
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
    for (const supertypeId of effectiveSupertypeIds(repo, definition.id)) {
      if (!blockIds.has(supertypeId)) error('MISSING_SUPERTYPE', definition.id, 'supertypeIds', `Supertype ${supertypeId} does not exist`);
    }
    for (const property of definition.properties) {
      validateMultiplicity(property.id, property.multiplicity.lower, property.multiplicity.upper, error);
      // Format 5: a part is only its Block property, so the property carries the typing a PartUsage record used to.
      if ((property.kind === 'part' || property.kind === 'reference') && property.typeId && !blockIds.has(property.typeId)) {
        error('MISSING_PROPERTY_TYPE', property.id, 'typeId', `Block type ${property.typeId} of part ${property.name} does not exist`);
      }
    }
    for (const port of definition.ports) validateMultiplicity(port.id, port.multiplicity.lower, port.multiplicity.upper, error);
    for (const signalId of definition.receptions ?? []) {
      if (repo.definitions[signalId]?.kind !== 'signal') {
        error('MISSING_RECEPTION_SIGNAL', definition.id, 'receptions', `Block ${definition.name} receives a Signal that does not exist`);
      }
    }
  }

  // A test case may name the Activity or Interaction that is its procedure. A missing one
  // is a warning: deleting the behavior clears the field, so only legacy data lands here.
  for (const verificationCase of Object.values(repo.verificationCases)) {
    const behavior = verificationCase.behaviorId ? repo.definitions[verificationCase.behaviorId] : undefined;
    if (verificationCase.behaviorId && behavior?.kind !== 'activity' && behavior?.kind !== 'interaction') {
      diagnostics.push({
        code: 'VERIFICATION_BEHAVIOR_MISSING', severity: 'warning', elementId: verificationCase.id, propertyPath: 'behaviorId',
        message: `Verification case ${verificationCase.name} names a test procedure that is not an Activity or Interaction`,
      });
    }
  }

  diagnostics.push(...validateRepositoryPorts(repo));
  diagnostics.push(...validateDefinitionRules(repo));
  diagnostics.push(...validateActivities(repo));
  diagnostics.push(...validateInteractions(repo, context));
  for (const connector of Object.values(repo.connectors)) {
    if (isParametricBinding(connector)) diagnostics.push(...validateParametricBinding(repo, connector));
    else {
      // Format 5: a connector end is a property path plus a port; both must still resolve (a retyped or deleted part would leave it dangling).
      for (const side of ['source', 'target'] as const) {
        const end = connectorEndOf(connector, side);
        if (end) diagnostics.push(...resolveConnectorEnd(repo, connector.ownerId, end, side, connector.id).diagnostics);
      }
    }
  }

  detectCycles(
    Object.values(repo.definitions).filter((d): d is BlockDefinition => d.kind === 'block'),
    d => effectiveSupertypeIds(repo, d.id), 'INHERITANCE_CYCLE', 'supertypeIds', error,
  );
  const compositeParts = Object.values(repo.usages).filter(u => u.kind === 'part' && u.aggregation === 'composite');
  detectCycles(compositeParts, p => [p.ownerId], 'COMPOSITE_CONTAINMENT_CYCLE', 'ownerId', error);

  // Validate UseCase canonical elements
  for (const act of Object.values(repo.actors ?? {})) diagnostics.push(...validateUseCaseElement(repo, act.id));
  for (const sub of Object.values(repo.subjects ?? {})) diagnostics.push(...validateUseCaseElement(repo, sub.id));
  for (const uc of Object.values(repo.useCases ?? {})) diagnostics.push(...validateUseCaseElement(repo, uc.id));
  for (const ep of Object.values(repo.extensionPoints ?? {})) diagnostics.push(...validateUseCaseElement(repo, ep.id));

  const compositionOwners = new Map<string, string>();
  for (const relationship of Object.values(repo.relationships)) {
    const sourceResolved = ids.has(relationship.sourceId);
    const targetResolved = ids.has(relationship.targetId);
    if (!sourceResolved) error('MISSING_RELATIONSHIP_ENDPOINT', relationship.id, 'sourceId', `Source ${relationship.sourceId} does not exist`);
    if (!targetResolved) error('MISSING_RELATIONSHIP_ENDPOINT', relationship.id, 'targetId', `Target ${relationship.targetId} does not exist`);

    if (isUseCaseRelationshipKind(relationship.kind)) {
      diagnostics.push(...validateUseCaseRelationship(repo, relationship));
      continue;
    }

    if (relationship.kind === 'association' || relationship.kind === 'composition' || relationship.kind === 'sharedAggregation') {
      // These end constraints must be enforced by repository validation, not
      // merely displayed in the inspector. Multiplicity bounds are validated
      // below with the repository-wide numeric checks, so retain only the
      // additional role-name and navigability diagnostics here.
      diagnostics.push(...validateAssociationEnds(repo, relationship.id)
        .filter(diagnostic => diagnostic.code !== 'INVALID_MULTIPLICITY'));
    }

    if (relationship.sourceMultiplicity) {
      validateMultiplicity(relationship.id, relationship.sourceMultiplicity.lower, relationship.sourceMultiplicity.upper, error);
      if (relationship.kind === 'composition' && (relationship.sourceMultiplicity.upper === '*' || relationship.sourceMultiplicity.upper > 1)) {
        error('INVALID_MULTIPLICITY', relationship.id, 'sourceMultiplicity', 'Composition composite end multiplicity upper must be at most 1');
      }
    }
    if (relationship.targetMultiplicity) {
      validateMultiplicity(relationship.id, relationship.targetMultiplicity.lower, relationship.targetMultiplicity.upper, error);
    }

    // SysML composition limits the owners of a part *instance*. A composition
    // drawn between Blocks only types a part, so one Block (e.g. a Bolt) may be
    // the part type of many wholes; only a single usage can't have two owners.
    if (relationship.kind === 'composition' && !repo.definitions[relationship.targetId]) {
      const previous = compositionOwners.get(relationship.targetId);
      if (previous && previous !== relationship.sourceId) {
        error('MULTIPLE_COMPOSITE_OWNERS', relationship.targetId, 'ownerId', `Composite usage is owned by both ${previous} and ${relationship.sourceId}`);
      } else compositionOwners.set(relationship.targetId, relationship.sourceId);
    }
    if (relationship.kind === 'requirementContainment') {
      diagnostics.push(...validateRequirementContainment(repo, relationship.id));
    } else {
      const direction = checkRelationshipDirection(repo, relationship);
      if (!direction.valid) {
        const sourceFamily = describeEndpointFamily(repo, relationship.sourceId, context);
        const targetFamily = describeEndpointFamily(repo, relationship.targetId, context);
        error(
          'INVALID_RELATIONSHIP_DIRECTION',
          relationship.id,
          'kind',
          `${relationship.kind} has invalid SysML endpoint direction: ` +
          `source ${relationship.sourceId} (${sourceFamily}) to ` +
          `target ${relationship.targetId} (${targetFamily}). ` +
          `${direction.reason} ${directionCorrectiveAction(relationship.kind)}`,
        );
      }
    }

    // Imported models may contain relationships that are resolvable but no
    // longer legal under the current SysML 1.6 connection policy. Keep those
    // records intact for repair in the editor, while surfacing the same typed
    // policy diagnostics used to block new gateway commands. Missing-endpoint
    // links are handled by persistence quarantine instead.
    if (sourceResolved && targetResolved) {
      const decision = classifyRelationship(repo, relationship.id, context);
      for (const entry of decision.diagnostics) {
        const { code, message } = parsePolicyDiagnostic(entry);
        error(code, relationship.id, 'kind', message);
      }
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

/**
 * Task 4 cross-domain endpoint context: endpoint families in diagnostics are
 * resolved by stable semantic ID through the shared endpoint index authority
 * (repository records plus the caller-supplied external State Machine
 * endpoints). Family labels carried on the relationship record itself are
 * never trusted here, so stale copies cannot mask a broken link.
 */
function describeEndpointFamily(
  repo: SysmlRepository, id: string, context?: SemanticEndpointContext,
): string {
  if (repo.requirements[id]) return 'requirement';
  if (repo.verificationCases[id]) return 'verificationCase';
  return resolveSemanticEndpoint(repo, id, context)?.family ?? 'unknown';
}

function directionCorrectiveAction(kind: string): string {
  switch (kind) {
    case 'satisfy': return 'Connect the design element, Part, or State to a Requirement.';
    case 'verify': return 'Connect a Verification Case to the Requirement it verifies.';
    case 'refine': return 'Connect a model element to the Requirement it refines.';
    case 'deriveReqt':
    case 'copy': return 'Connect the appropriate Requirement endpoints.';
    default: return 'Choose endpoints legal for this relationship kind.';
  }
}

function checkRelationshipDirection(
  repo: SysmlRepository, relationship: SysmlRelationship,
): { valid: boolean; reason: string } {
  const sourceRequirement = Boolean(repo.requirements[relationship.sourceId]);
  const targetRequirement = Boolean(repo.requirements[relationship.targetId]);
  switch (relationship.kind) {
    case 'deriveReqt':
    case 'copy': return sourceRequirement && targetRequirement
      ? { valid: true, reason: '' }
      : { valid: false, reason: `${relationship.kind} requires Requirement to Requirement endpoints.` };
    case 'composition': return !sourceRequirement && !targetRequirement
      ? { valid: true, reason: '' }
      : { valid: false, reason: 'Composition must not involve Requirement endpoints.' };
    case 'satisfy': return !sourceRequirement && targetRequirement
      ? { valid: true, reason: '' }
      : { valid: false, reason: 'Satisfy requires a non-Requirement source and a Requirement target.' };
    case 'verify': return (Boolean(repo.verificationCases[relationship.sourceId]) || resolveRepositoryEndpoint(repo, relationship.sourceId)?.family === 'interaction') && targetRequirement
      ? { valid: true, reason: '' }
      : { valid: false, reason: 'Verify requires a Verification Case or Interaction source and a Requirement target.' };
    case 'refine': return !sourceRequirement && targetRequirement
      ? { valid: true, reason: '' }
      : { valid: false, reason: 'Refine requires a non-Requirement source and a Requirement target.' };
    default: return { valid: true, reason: '' };
  }
}
