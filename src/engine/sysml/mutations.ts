import type { ConnectorUsage, SysmlRepository } from './model';
import { classifyDeletionTarget } from './policy';
import { connectorEndOf } from './connectorEnds';
import { findPortOwner, findPropertyOwner, isPartProperty, PATH_SEPARATOR, resolveOccurrenceKey } from './partOccurrences';
import { activityNestedIds, clearCalledBehaviorReferences } from './activity';
import { clearInteractionReferences, interactionNestedIds, interactionReferencesTo } from './interaction';
import { getNestedRequirementIds } from './requirements';
import { validateSysmlRepository, type SysmlValidationReport } from './validation';

export type SysmlCommand = { kind: 'deleteElements'; elementIds: string[] };

export interface DeletionAuthorization {
  authorizedBaselineIds?: readonly string[];
}

export type ImpactSeverity = 'safe' | 'review' | 'blocked';

export interface MutationImpact {
  requestedElementIds: string[];
  deletedElementIds: string[];
  nestedRequirementIds: string[];
  removedRelationshipIds: string[];
  unresolvedUsageIds: string[];
  invalidatedEvidenceIds: string[];
  affectedRequirementIds: string[];
  affectedBaselineIds: string[];
  blockedBaselineIds: string[];
  /**
   * Presentation-layer impact: `diagramId:elementId` entries for every diagram
   * presentation removed alongside the deleted semantic elements. The engine
   * itself owns no presentation state, so analyzeMutation reports an empty
   * list; the gateway enriches it from its coordinates/diagramPresentations
   * before applying the deletion-confirmation gate.
   */
  affectedPresentationIds: string[];
  /**
   * Behavior content that references a deleted element: Interaction lifelines
   * and messages, and Activity actions that call a deleted behavior. They are
   * kept and lose the reference (a lifeline becomes untyped, an action opaque),
   * so the user should review them before confirming.
   */
  affectedBehaviorElementIds?: string[];
  severity: ImpactSeverity;
  affectedDiagramKinds: Array<'bdd' | 'ibd' | 'requirements' | 'rtm' | 'useCase' | 'package' | 'sequence'>;
}

export interface MutationResult {
  applied: boolean;
  repository: SysmlRepository;
  impact: MutationImpact;
  validation: SysmlValidationReport;
  blockedBaselineIds?: string[];
  diagnostics?: Array<{ code: string; severity: 'error'; elementId?: string; message: string }>;
  forwardPatch?: import('./patches').SysmlPatch;
  inversePatch?: import('./patches').SysmlPatch;
}

export interface MutationHistory {
  past: SysmlRepository[];
  present: SysmlRepository;
  future: SysmlRepository[];
}

export function computeTouchedProtectedBaselines(
  repo: SysmlRepository,
  deletedElementIds: ReadonlySet<string> | readonly string[],
  affectedRequirementIds: ReadonlySet<string> | readonly string[] = [],
): string[] {
  const deleted = deletedElementIds instanceof Set ? deletedElementIds : new Set(deletedElementIds);
  const affectedReqs = affectedRequirementIds instanceof Set ? affectedRequirementIds : new Set(affectedRequirementIds);
  const touched = new Set<string>();
  for (const baseline of Object.values(repo.baselines)) {
    if (!baseline.protected) continue;
    if (deleted.has(baseline.id)) {
      touched.add(baseline.id);
      continue;
    }
    if (baseline.elementHashes && [...deleted].some(id => id in (baseline.elementHashes as Record<string, string>))) {
      touched.add(baseline.id);
      continue;
    }
    // Baselines without a content snapshot fall back to requirement linkage:
    // a protected baseline is touched when a baselined requirement is deleted
    // or otherwise affected by the mutation.
    if (!baseline.elementHashes) {
      for (const id of [...deleted, ...affectedReqs]) {
        if (repo.requirements[id]?.baselineId === baseline.id) {
          touched.add(baseline.id);
          break;
        }
      }
    }
  }
  return [...touched].sort();
}

export function impactSeverity(
  impact: Pick<MutationImpact, 'affectedBaselineIds' | 'deletedElementIds' | 'requestedElementIds' | 'nestedRequirementIds' | 'removedRelationshipIds' | 'unresolvedUsageIds' | 'invalidatedEvidenceIds' | 'affectedRequirementIds' | 'affectedPresentationIds'> & { affectedBehaviorElementIds?: string[] },
  authorizedBaselineIds: readonly string[] = [],
): ImpactSeverity {
  const authorized = new Set(authorizedBaselineIds);
  if (impact.affectedBaselineIds.some(id => !authorized.has(id))) return 'blocked';
  const requested = new Set(impact.requestedElementIds);
  // Bible §7 matrix: leaf/unreferenced targets (deleted set equals the
  // request, no nested content, no affected bystanders) are safe. A
  // requirement only names itself as affected when it is the requested
  // target, so affected ids beyond the request are what force review.
  // Presentations always force review: deleting a presented element removes
  // visible diagram content even when zero relationships are affected.
  const needsReview =
    impact.deletedElementIds.some(id => !requested.has(id)) ||
    impact.nestedRequirementIds.length > 0 ||
    impact.removedRelationshipIds.some(id => !requested.has(id)) ||
    impact.unresolvedUsageIds.length > 0 ||
    impact.invalidatedEvidenceIds.length > 0 ||
    impact.affectedRequirementIds.some(id => !requested.has(id)) ||
    (impact.affectedPresentationIds ?? []).length > 0 ||
    (impact.affectedBehaviorElementIds ?? []).length > 0;
  return needsReview ? 'review' : 'safe';
}

/** Block features (part properties, ports) among the ids, as `{blockId, propertyId|portId}`, in format 5 where no entity stands for them. */
function featureTargets(repo: SysmlRepository, ids: Iterable<string>): Array<{ id: string; blockId: string; propertyId?: string; portId?: string }> {
  const targets: Array<{ id: string; blockId: string; propertyId?: string; portId?: string }> = [];
  for (const id of ids) {
    if (repo.packages[id] || repo.diagrams[id] || repo.definitions[id] || repo.usages[id] || repo.connectors[id]
      || repo.relationships[id] || repo.requirements[id] || repo.verificationCases[id]) continue;
    if (id.includes(PATH_SEPARATOR)) {
      const occurrence = resolveOccurrenceKey(repo, id);
      if (occurrence) targets.push({ id, blockId: occurrence.declaringBlockId, propertyId: occurrence.propertyId });
      continue;
    }
    const property = findPropertyOwner(repo, id);
    if (property && isPartProperty(repo, property.feature)) { targets.push({ id, blockId: property.block.id, propertyId: id }); continue; }
    const port = findPortOwner(repo, id);
    if (port) targets.push({ id, blockId: port.block.id, portId: id });
  }
  return targets;
}

/** A connector depends on a deleted element when its owner, a path segment or its port is deleted. */
function pathConnectorTouches(connector: ConnectorUsage, deleted: ReadonlySet<string>): boolean {
  for (const side of ['source', 'target'] as const) {
    const end = connectorEndOf(connector, side);
    if (!end) continue;
    if (end.path.some(segment => deleted.has(segment)) || (end.portId && deleted.has(end.portId))) return true;
  }
  return false;
}

export function analyzeMutation(repo: SysmlRepository, command: SysmlCommand): MutationImpact {
  const requested = new Set(command.elementIds);
  const deleted = new Set(command.elementIds);
  // A part reference stands for the property it ends in (and for the usage that still represents it).
  const features = featureTargets(repo, command.elementIds);
  for (const feature of features) {
    if (feature.propertyId) {
      deleted.add(feature.propertyId);
      for (const usage of Object.values(repo.usages)) if (usage.kind === 'part' && usage.propertyId === feature.propertyId) deleted.add(usage.id);
    }
    if (feature.portId) deleted.add(feature.portId);
  }

  // Package ownership is semantic containment. Deleting a Package removes its
  // owned namespace recursively, including diagrams, before edge impact is computed.
  const ownedEntities = [
    ...Object.values(repo.packages), ...Object.values(repo.diagrams), ...Object.values(repo.definitions),
    ...Object.values(repo.usages), ...Object.values(repo.requirements), ...Object.values(repo.verificationCases),
    ...Object.values(repo.artifacts), ...Object.values(repo.actors), ...Object.values(repo.subjects),
    ...Object.values(repo.useCases), ...Object.values(repo.extensionPoints),
  ];
  const ownedBy = new Map<string, string[]>();
  for (const entity of ownedEntities) if (entity.ownerId) {
    ownedBy.set(entity.ownerId, [...(ownedBy.get(entity.ownerId) ?? []), entity.id]);
  }
  const packageQueue = [...command.elementIds].filter(id => Boolean(repo.packages[id]));
  const seenPackages = new Set<string>();
  for (let index = 0; index < packageQueue.length; index++) {
    const packageId = packageQueue[index];
    if (seenPackages.has(packageId)) continue;
    seenPackages.add(packageId);
    for (const childId of ownedBy.get(packageId) ?? []) {
      deleted.add(childId);
      if (repo.packages[childId]) packageQueue.push(childId);
    }
  }

  const nestedRequirementIdsSet = new Set<string>();
  for (const id of command.elementIds) {
    if (repo.requirements[id]) {
      const descendants = getNestedRequirementIds(repo, id);
      for (const descId of descendants) {
        nestedRequirementIdsSet.add(descId);
        deleted.add(descId);
      }
    }
  }

  // Central typed policy is the single source of truth for deletion cascades
  // (composite-owned parts plus lifetime-owned ports, per policy.ts).
  // Mutations drive the closure purely through classifyDeletionTarget with no
  // independent port-ownership loop. Definition-typed usages become unresolved
  // impacts, never implicit children. Shared and reference usages never join
  // the part closure.
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...deleted]) {
      const decision = classifyDeletionTarget(repo, id);
      for (const cascadeId of decision.cascadeIds) {
        if (!deleted.has(cascadeId)) {
          deleted.add(cascadeId);
          changed = true;
        }
      }
    }
  }

  // Properties and ports of a deleted Block go with it; path connectors that run through them are removed too.
  const goneFeatureIds = new Set<string>();
  for (const id of deleted) {
    const definition = repo.definitions[id];
    if (definition?.kind !== 'block') continue;
    for (const property of definition.properties) goneFeatureIds.add(property.id);
    for (const port of definition.ports) goneFeatureIds.add(port.id);
  }
  const goneForConnectors = new Set([...deleted, ...goneFeatureIds]);
  for (const connector of Object.values(repo.connectors)) {
    if (deleted.has(connector.ownerId) || deleted.has(connector.sourcePortId) || deleted.has(connector.targetPortId)
      || pathConnectorTouches(connector, goneForConnectors)) deleted.add(connector.id);
  }
  for (const ref of Object.values(repo.diagramReferences ?? {})) {
    if (ref.sourceElementId && deleted.has(ref.sourceElementId)) {
      deleted.add(ref.id);
    }
  }
  const removedRelationshipIdsSet = new Set<string>();
  const affectedRequirements = new Set<string>();
  // Nodes, pins, partitions and parameters die with their Activity, so the
  // relationships that end on them (e.g. «allocate» from an action) go too.
  const deletedNested = new Set<string>();
  for (const id of deleted) {
    const definition = repo.definitions[id];
    if (definition?.kind === 'activity') activityNestedIds(definition).forEach(nestedId => deletedNested.add(nestedId));
    if (definition?.kind === 'interaction') interactionNestedIds(definition).forEach(nestedId => deletedNested.add(nestedId));
  }
  for (const relationship of Object.values(repo.relationships)) {
    if (deleted.has(relationship.id) || deleted.has(relationship.sourceId) || deleted.has(relationship.targetId)
      || goneFeatureIds.has(relationship.sourceId) || goneFeatureIds.has(relationship.targetId)
      || deletedNested.has(relationship.sourceId) || deletedNested.has(relationship.targetId)) {
      deleted.add(relationship.id);
      removedRelationshipIdsSet.add(relationship.id);
      if (repo.requirements[relationship.sourceId]) affectedRequirements.add(relationship.sourceId);
      if (repo.requirements[relationship.targetId]) affectedRequirements.add(relationship.targetId);
    }
  }
  for (const id of requested) if (repo.requirements[id]) affectedRequirements.add(id);

  const invalidatedEvidence = Object.values(repo.evidence)
    .filter(e => deleted.has(e.id) || deleted.has(e.verificationCaseId) || deleted.has(e.requirementId) || affectedRequirements.has(e.requirementId))
    .map(e => e.id);
  invalidatedEvidence.forEach(id => deleted.add(id));

  const deletedDefinitions = new Set(Object.values(repo.definitions).filter(d => deleted.has(d.id)).map(d => d.id));
  // Unresolved impacts come from the central policy: every definition-typed
  // usage that is not an owned composite cascade child.
  const unresolvedFromPolicy = new Set<string>();
  for (const definitionId of deletedDefinitions) {
    for (const unresolvedId of classifyDeletionTarget(repo, definitionId).unresolvedUsageIds) {
      if (deleted.has(unresolvedId)) continue;
      // A typed property whose own Block is deleted too is not left unresolved.
      const owner = repo.usages[unresolvedId] ? undefined : findPropertyOwner(repo, unresolvedId);
      if (owner && deleted.has(owner.block.id)) continue;
      unresolvedFromPolicy.add(unresolvedId);
    }
  }
  const unresolvedUsageIds = [...unresolvedFromPolicy].sort();

  const diagramKinds = new Set<MutationImpact['affectedDiagramKinds'][number]>();
  if ([...deleted].some(id => repo.definitions[id])) diagramKinds.add('bdd');
  if ([...deleted].some(id => repo.usages[id] || repo.connectors[id]) || features.length > 0) diagramKinds.add('ibd');
  if (affectedRequirements.size || [...deleted].some(id => repo.requirements[id])) diagramKinds.add('requirements');
  if (affectedRequirements.size || invalidatedEvidence.length) diagramKinds.add('rtm');
  const hasUseCaseEntities = [...deleted].some(id =>
    Boolean(repo.actors?.[id] || repo.subjects?.[id] || repo.useCases?.[id] || repo.extensionPoints?.[id] || repo.diagramReferences?.[id])
  );
  const hasUseCaseRel = [...removedRelationshipIdsSet].some(id => {
    const rel = repo.relationships[id];
    return rel && ['useCaseAssociation', 'include', 'extend', 'useCaseGeneralization', 'useCaseSatisfy', 'useCaseRefine', 'useCaseTrace'].includes(rel.kind);
  });
  if (hasUseCaseEntities || hasUseCaseRel) diagramKinds.add('useCase');
  // Lifelines/messages that point at something being deleted keep existing but
  // lose the reference; deleting an Interaction or its diagram affects sequence diagrams too.
  const goneForBehaviors = new Set([...deleted, ...goneFeatureIds]);
  const affectedBehaviorElementIds = [
    ...interactionReferencesTo(repo, goneForBehaviors),
    // Actions that call a deleted Activity/Interaction become opaque actions.
    ...clearCalledBehaviorReferences(repo, goneForBehaviors).flatMap(edit => edit.nodeIds),
    // Test cases whose procedure is deleted keep existing without it.
    ...Object.values(repo.verificationCases)
      .filter(verificationCase => !deleted.has(verificationCase.id) && verificationCase.behaviorId && deleted.has(verificationCase.behaviorId))
      .map(verificationCase => verificationCase.id),
  ].sort();
  if (affectedBehaviorElementIds.length > 0
    || [...deleted].some(id => repo.definitions[id]?.kind === 'interaction' || repo.diagrams[id]?.diagramKind === 'sequence')) {
    diagramKinds.add('sequence');
  }
  if ([...deleted].some(id => repo.packages[id] || repo.diagrams[id]) ||
    [...removedRelationshipIdsSet].some(id => ['packageImport', 'elementImport', 'packageMerge'].includes(repo.relationships[id]?.kind ?? ''))) diagramKinds.add('package');

  // Protected-baseline touch set: only baselines whose frozen content (or
  // baselined requirements) intersect this deletion are affected. A protected
  // baseline never joins the cascade; it blocks the mutation until the caller
  // clones it or presents explicit authorization.
  const affectedBaselineIds = computeTouchedProtectedBaselines(repo, deleted, affectedRequirements);
  const partial: Omit<MutationImpact, 'severity' | 'blockedBaselineIds'> = {
    requestedElementIds: [...requested].sort(),
    deletedElementIds: [...deleted].sort(),
    nestedRequirementIds: [...nestedRequirementIdsSet].sort(),
    removedRelationshipIds: [...removedRelationshipIdsSet].sort(),
    unresolvedUsageIds,
    invalidatedEvidenceIds: invalidatedEvidence.sort(),
    affectedRequirementIds: [...affectedRequirements].sort(),
    affectedBaselineIds,
    affectedDiagramKinds: [...diagramKinds].sort(),
    // Engine-level analysis owns no presentation state; the gateway enriches
    // this list from its coordinates/diagramPresentations before gating.
    affectedPresentationIds: [],
    affectedBehaviorElementIds,
  };
  const severity = impactSeverity(partial);
  return {
    ...partial,
    blockedBaselineIds: [...affectedBaselineIds],
    severity,
  };
}

export function applyCommand(repo: SysmlRepository, command: SysmlCommand, authorization: DeletionAuthorization = {}): MutationResult {
  const impact = analyzeMutation(repo, command);
  const authorized = new Set(authorization.authorizedBaselineIds ?? []);
  const unauthorized = impact.affectedBaselineIds.filter(id => !authorized.has(id));
  if (unauthorized.length > 0) {
    return {
      applied: false,
      repository: repo,
      impact: { ...impact, blockedBaselineIds: unauthorized, severity: 'blocked' },
      validation: validateSysmlRepository(repo),
      blockedBaselineIds: unauthorized,
      diagnostics: unauthorized.map(id => ({
        code: 'PROTECTED_BASELINE_REQUIRES_AUTHORIZATION',
        severity: 'error' as const,
        elementId: id,
        message: `Protected baseline ${id} forbids destructive mutation; clone the baseline or authorize explicitly before deleting ${impact.requestedElementIds.join(', ') || 'none'}`,
      })),
    };
  }
  const removed = new Set(impact.deletedElementIds);
  const authorizedImpact: MutationImpact = { ...impact, blockedBaselineIds: [], severity: impactSeverity(impact, [...authorized]) };
  const next = cloneRepository(repo);

  const forwardOps: Array<import('./patches').PatchOperation> = [];
  const inverseOps: Array<import('./patches').PatchOperation> = [];

  for (const id of impact.deletedElementIds) {
    if (repo.packages[id]) {
      forwardOps.push({ op: 'remove', collection: 'packages', id, oldValue: repo.packages[id] });
      inverseOps.push({ op: 'add', collection: 'packages', id, value: repo.packages[id] });
    } else if (repo.diagrams[id]) {
      forwardOps.push({ op: 'remove', collection: 'diagrams', id, oldValue: repo.diagrams[id] });
      inverseOps.push({ op: 'add', collection: 'diagrams', id, value: repo.diagrams[id] });
    } else if (repo.definitions[id]) {
      forwardOps.push({ op: 'remove', collection: 'definitions', id, oldValue: repo.definitions[id] });
      inverseOps.push({ op: 'add', collection: 'definitions', id, value: repo.definitions[id] });
    } else if (repo.usages[id]) {
      forwardOps.push({ op: 'remove', collection: 'usages', id, oldValue: repo.usages[id] });
      inverseOps.push({ op: 'add', collection: 'usages', id, value: repo.usages[id] });
    } else if (repo.connectors[id]) {
      forwardOps.push({ op: 'remove', collection: 'connectors', id, oldValue: repo.connectors[id] });
      inverseOps.push({ op: 'add', collection: 'connectors', id, value: repo.connectors[id] });
    } else if (repo.relationships[id]) {
      forwardOps.push({ op: 'remove', collection: 'relationships', id, oldValue: repo.relationships[id] });
      inverseOps.push({ op: 'add', collection: 'relationships', id, value: repo.relationships[id] });
    } else if (repo.requirements[id]) {
      forwardOps.push({ op: 'remove', collection: 'requirements', id, oldValue: repo.requirements[id] });
      inverseOps.push({ op: 'add', collection: 'requirements', id, value: repo.requirements[id] });
    } else if (repo.verificationCases[id]) {
      forwardOps.push({ op: 'remove', collection: 'verificationCases', id, oldValue: repo.verificationCases[id] });
      inverseOps.push({ op: 'add', collection: 'verificationCases', id, value: repo.verificationCases[id] });
    } else if (repo.evidence[id]) {
      forwardOps.push({ op: 'remove', collection: 'evidence', id, oldValue: repo.evidence[id] });
      inverseOps.push({ op: 'add', collection: 'evidence', id, value: repo.evidence[id] });
    } else if (repo.artifacts[id]) {
      forwardOps.push({ op: 'remove', collection: 'artifacts', id, oldValue: repo.artifacts[id] });
      inverseOps.push({ op: 'add', collection: 'artifacts', id, value: repo.artifacts[id] });
    } else if (repo.actors?.[id]) {
      forwardOps.push({ op: 'remove', collection: 'actors', id, oldValue: repo.actors[id] });
      inverseOps.push({ op: 'add', collection: 'actors', id, value: repo.actors[id] });
    } else if (repo.subjects?.[id]) {
      forwardOps.push({ op: 'remove', collection: 'subjects', id, oldValue: repo.subjects[id] });
      inverseOps.push({ op: 'add', collection: 'subjects', id, value: repo.subjects[id] });
    } else if (repo.useCases?.[id]) {
      forwardOps.push({ op: 'remove', collection: 'useCases', id, oldValue: repo.useCases[id] });
      inverseOps.push({ op: 'add', collection: 'useCases', id, value: repo.useCases[id] });
    } else if (repo.extensionPoints?.[id]) {
      forwardOps.push({ op: 'remove', collection: 'extensionPoints', id, oldValue: repo.extensionPoints[id] });
      inverseOps.push({ op: 'add', collection: 'extensionPoints', id, value: repo.extensionPoints[id] });
    } else if (repo.diagramReferences?.[id]) {
      forwardOps.push({ op: 'remove', collection: 'diagramReferences', id, oldValue: repo.diagramReferences[id] });
      inverseOps.push({ op: 'add', collection: 'diagramReferences', id, value: repo.diagramReferences[id] });
    }
  }

  removeFrom(next.packages, removed);
  removeFrom(next.diagrams, removed);
  removeFrom(next.definitions, removed);
  removeFrom(next.usages, removed);
  removeFrom(next.connectors, removed);
  removeFrom(next.relationships, removed);
  removeFrom(next.requirements, removed);
  removeFrom(next.verificationCases, removed);
  removeFrom(next.evidence, removed);
  removeFrom(next.artifacts, removed);
  if (next.actors) removeFrom(next.actors, removed);
  if (next.subjects) removeFrom(next.subjects, removed);
  if (next.useCases) removeFrom(next.useCases, removed);
  if (next.extensionPoints) removeFrom(next.extensionPoints, removed);
  if (next.diagramReferences) removeFrom(next.diagramReferences, removed);

  // Evidence-invalidation state: filtering verifiesRequirementIds is part of
  // the atomic deletion, so the inverse patch must restore the exact prior
  // lists (not just re-add removed entities). Record a replace pair per
  // touched verification case to keep undo/redo byte-exact.
  for (const verificationCase of Object.values(repo.verificationCases)) {
    if (removed.has(verificationCase.id)) continue;
    // The test procedure (Activity or Interaction) is gone: keep the case, clear the reference.
    if (verificationCase.behaviorId && removed.has(verificationCase.behaviorId)) {
      const { behaviorId, ...cleared } = verificationCase;
      next.verificationCases[verificationCase.id] = cleared;
      forwardOps.push({ op: 'replace', collection: 'verificationCases', id: verificationCase.id, path: ['behaviorId'], oldValue: behaviorId, value: undefined });
      inverseOps.push({ op: 'replace', collection: 'verificationCases', id: verificationCase.id, path: ['behaviorId'], oldValue: undefined, value: behaviorId });
    }
    const before = verificationCase.verifiesRequirementIds;
    const after = before.filter(id => !removed.has(id));
    if (after.length === before.length) continue;
    const updated = { ...next.verificationCases[verificationCase.id], verifiesRequirementIds: after };
    next.verificationCases[verificationCase.id] = updated;
    forwardOps.push({ op: 'replace', collection: 'verificationCases', id: verificationCase.id, path: ['verifiesRequirementIds'], oldValue: before, value: after });
    inverseOps.push({ op: 'replace', collection: 'verificationCases', id: verificationCase.id, path: ['verifiesRequirementIds'], oldValue: after, value: before });
  }
  // A Viewpoint must not keep pointing at a deleted Stakeholder or concern
  // Requirement: filter those references in the same atomic deletion.
  for (const definition of Object.values(repo.definitions)) {
    if (definition.kind !== 'viewpoint' || removed.has(definition.id)) continue;
    let updated = definition;
    for (const key of ['stakeholderIds', 'concernIds'] as const) {
      const before = definition[key];
      const after = before.filter(id => !removed.has(id));
      if (after.length === before.length) continue;
      updated = { ...updated, [key]: after };
      forwardOps.push({ op: 'replace', collection: 'definitions', id: definition.id, path: [key], oldValue: before, value: after });
      inverseOps.push({ op: 'replace', collection: 'definitions', id: definition.id, path: [key], oldValue: after, value: before });
    }
    if (updated !== definition) next.definitions[definition.id] = updated;
  }
  // An Actor must not keep specializing a deleted Actor.
  for (const actor of Object.values(repo.actors ?? {})) {
    if (removed.has(actor.id) || !actor.generalizationIds?.some(id => removed.has(id))) continue;
    const before = actor.generalizationIds;
    const after = before.filter(id => !removed.has(id));
    next.actors[actor.id] = { ...actor, generalizationIds: after };
    forwardOps.push({ op: 'replace', collection: 'actors', id: actor.id, path: ['generalizationIds'], oldValue: before, value: after });
    inverseOps.push({ op: 'replace', collection: 'actors', id: actor.id, path: ['generalizationIds'], oldValue: after, value: before });
  }
  // A Block must not keep receiving a deleted Signal: drop it from `receptions`
  // in the same atomic deletion (the inverse patch restores the exact list).
  for (const definition of Object.values(repo.definitions)) {
    if (definition.kind !== 'block' || removed.has(definition.id) || !definition.receptions?.some(id => removed.has(id))) continue;
    const before = definition.receptions;
    const after = before.filter(id => !removed.has(id));
    next.definitions[definition.id] = { ...definition, receptions: after };
    forwardOps.push({ op: 'replace', collection: 'definitions', id: definition.id, path: ['receptions'], oldValue: before, value: after });
    inverseOps.push({ op: 'replace', collection: 'definitions', id: definition.id, path: ['receptions'], oldValue: after, value: before });
  }
  // Format 5: a deleted part or port is removed from the Block that declares it.
  const removedProperties = new Map<string, Set<string>>();
  const removedPorts = new Map<string, Set<string>>();
  for (const feature of featureTargets(repo, impact.requestedElementIds)) {
    if (removed.has(feature.blockId)) continue;
    const bucket = feature.propertyId ? removedProperties : removedPorts;
    const set = bucket.get(feature.blockId) ?? new Set<string>();
    set.add(feature.propertyId ?? feature.portId!);
    bucket.set(feature.blockId, set);
  }
  for (const blockId of new Set([...removedProperties.keys(), ...removedPorts.keys()])) {
    const block = next.definitions[blockId];
    if (block?.kind !== 'block') continue;
    let updated = block;
    const propertyIds = removedProperties.get(blockId);
    if (propertyIds) {
      const before = block.properties;
      const after = before.filter(property => !propertyIds.has(property.id));
      updated = { ...updated, properties: after };
      forwardOps.push({ op: 'replace', collection: 'definitions', id: blockId, path: ['properties'], oldValue: before, value: after });
      inverseOps.push({ op: 'replace', collection: 'definitions', id: blockId, path: ['properties'], oldValue: after, value: before });
    }
    const portIds = removedPorts.get(blockId);
    if (portIds) {
      const before = block.ports;
      const after = before.filter(port => !portIds.has(port.id));
      updated = { ...updated, ports: after };
      forwardOps.push({ op: 'replace', collection: 'definitions', id: blockId, path: ['ports'], oldValue: before, value: after });
      inverseOps.push({ op: 'replace', collection: 'definitions', id: blockId, path: ['ports'], oldValue: after, value: before });
    }
    next.definitions[blockId] = updated;
  }
  // Interactions keep their lifelines and messages but lose references to
  // anything deleted here (a deleted Block/part leaves the lifeline untyped, a
  // deleted Signal leaves its message unassigned), so no dangling reference
  // is left behind to fail validation for every later edit.
  const goneRefs = new Set<string>(removed);
  for (const id of removed) {
    const definition = repo.definitions[id];
    if (definition?.kind !== 'block') continue;
    definition.properties.forEach(property => goneRefs.add(property.id));
    definition.ports.forEach(port => goneRefs.add(port.id));
  }
  for (const ids of [...removedProperties.values(), ...removedPorts.values()]) ids.forEach(id => goneRefs.add(id));
  for (const edit of clearInteractionReferences(repo, goneRefs)) {
    const before = repo.definitions[edit.interactionId];
    if (before?.kind !== 'interaction') continue;
    next.definitions[edit.interactionId] = { ...before, lifelines: edit.lifelines, messages: edit.messages, ...(edit.uses ? { uses: edit.uses } : {}) };
    const changedKeys = edit.uses ? (['lifelines', 'messages', 'uses'] as const) : (['lifelines', 'messages'] as const);
    for (const key of changedKeys) {
      forwardOps.push({ op: 'replace', collection: 'definitions', id: edit.interactionId, path: [key], oldValue: before[key], value: edit[key] });
      inverseOps.push({ op: 'replace', collection: 'definitions', id: edit.interactionId, path: [key], oldValue: edit[key], value: before[key] });
    }
  }
  for (const edit of clearCalledBehaviorReferences(repo, goneRefs)) {
    const before = repo.definitions[edit.activityId];
    if (before?.kind !== 'activity') continue;
    next.definitions[edit.activityId] = { ...before, nodes: edit.nodes };
    forwardOps.push({ op: 'replace', collection: 'definitions', id: edit.activityId, path: ['nodes'], oldValue: before.nodes, value: edit.nodes });
    inverseOps.push({ op: 'replace', collection: 'definitions', id: edit.activityId, path: ['nodes'], oldValue: edit.nodes, value: before.nodes });
  }
  next.revision = repo.revision + 1;

  const forwardPatch = {
    id: `patch-${next.revision}-delete`,
    revision: next.revision,
    timestamp: new Date().toISOString(),
    forward: forwardOps,
    inverse: inverseOps,
    description: 'deleteElements',
  };
  const inversePatch = {
    id: `invert-patch-${next.revision}-delete`,
    revision: next.revision,
    timestamp: new Date().toISOString(),
    forward: inverseOps,
    inverse: forwardOps,
    description: 'undo deleteElements',
  };

  return {
    applied: true,
    repository: next,
    impact: authorizedImpact,
    validation: validateSysmlRepository(next),
    forwardPatch,
    inversePatch,
  };
}

export function createHistory(repository: SysmlRepository): MutationHistory {
  return { past: [], present: cloneRepository(repository), future: [] };
}

export function undo(history: MutationHistory): MutationHistory {
  if (!history.past.length) return history;
  const previous = history.past[history.past.length - 1];
  return { past: history.past.slice(0, -1), present: cloneRepository(previous), future: [cloneRepository(history.present), ...history.future] };
}

export function redo(history: MutationHistory): MutationHistory {
  if (!history.future.length) return history;
  const next = history.future[0];
  return { past: [...history.past, cloneRepository(history.present)], present: cloneRepository(next), future: history.future.slice(1) };
}

function removeFrom<T>(record: Record<string, T>, removed: ReadonlySet<string>) {
  for (const [key, value] of Object.entries(record)) {
    if (removed.has(key) || removed.has((value as { id?: string }).id ?? '')) delete record[key];
  }
}

function cloneRepository(repo: SysmlRepository): SysmlRepository {
  return {
    ...repo,
    definitions: { ...repo.definitions },
    usages: { ...repo.usages },
    connectors: { ...repo.connectors },
    relationships: { ...repo.relationships },
    requirements: { ...repo.requirements },
    verificationCases: { ...repo.verificationCases },
    evidence: { ...repo.evidence },
    baselines: { ...repo.baselines },
    artifacts: { ...repo.artifacts },
    actors: { ...(repo.actors || {}) },
    subjects: { ...(repo.subjects || {}) },
    useCases: { ...(repo.useCases || {}) },
    extensionPoints: { ...(repo.extensionPoints || {}) },
    diagramReferences: { ...(repo.diagramReferences || {}) },
    auditTrail: [...repo.auditTrail],
  };
}
