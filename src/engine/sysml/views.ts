import type { SysmlRepository, StakeholderDefinition, ViewDefinition, ViewpointDefinition } from './model';

/**
 * SysML 1.6 §7.3.2 View / Viewpoint queries. The Viewpoint a View conforms to is
 * not stored on the View: it is derived from its «conform» relationship so there
 * is a single source of truth.
 */

export function conformRelationshipsOf(repo: SysmlRepository, viewId: string) {
  return Object.values(repo.relationships)
    .filter(relationship => relationship.kind === 'conform' && relationship.sourceId === viewId)
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** The Viewpoint `viewId` conforms to (the first, by id, if the model wrongly has several). */
export function viewpointOf(repo: SysmlRepository, viewId: string): ViewpointDefinition | undefined {
  if (repo.definitions[viewId]?.kind !== 'view') return undefined;
  for (const relationship of conformRelationshipsOf(repo, viewId)) {
    const target = repo.definitions[relationship.targetId];
    if (target?.kind === 'viewpoint') return target;
  }
  return undefined;
}

/** Views that conform to `viewpointId`, sorted by name. */
export function viewsConformingTo(repo: SysmlRepository, viewpointId: string): ViewDefinition[] {
  const views: ViewDefinition[] = [];
  for (const relationship of Object.values(repo.relationships)) {
    if (relationship.kind !== 'conform' || relationship.targetId !== viewpointId) continue;
    const source = repo.definitions[relationship.sourceId];
    if (source?.kind === 'view') views.push(source);
  }
  return views.sort((a, b) => a.name.localeCompare(b.name));
}

/** Ids of the elements `viewId` exposes, in relationship-id order. */
export function exposedElementIds(repo: SysmlRepository, viewId: string): string[] {
  return Object.values(repo.relationships)
    .filter(relationship => relationship.kind === 'expose' && relationship.sourceId === viewId)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(relationship => relationship.targetId);
}

/** Stakeholders of a Viewpoint that resolve, in declared order. */
export function stakeholdersOf(repo: SysmlRepository, viewpointId: string): StakeholderDefinition[] {
  const viewpoint = repo.definitions[viewpointId];
  if (viewpoint?.kind !== 'viewpoint') return [];
  return viewpoint.stakeholderIds
    .map(id => repo.definitions[id])
    .filter((definition): definition is StakeholderDefinition => definition?.kind === 'stakeholder');
}

/** All concerns a Viewpoint frames as display text: its own, its Requirements' names, and its Stakeholders'. */
export function viewpointConcernTexts(repo: SysmlRepository, viewpointId: string): string[] {
  const viewpoint = repo.definitions[viewpointId];
  if (viewpoint?.kind !== 'viewpoint') return [];
  const texts: string[] = [];
  for (const concern of viewpoint.concerns ?? []) if (concern.trim()) texts.push(concern.trim());
  for (const id of viewpoint.concernIds) {
    const requirement = repo.requirements[id];
    if (requirement) texts.push(requirement.name);
  }
  for (const stakeholder of stakeholdersOf(repo, viewpointId)) {
    for (const concern of stakeholder.concerns) if (concern.trim() && !texts.includes(concern.trim())) texts.push(concern.trim());
  }
  return texts;
}
