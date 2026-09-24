import type { SysmlRepositoryV4 } from '../domain';
import type {
  CreateRelationshipCommand,
  UpdateRelationshipCommand,
  DeleteRelationshipCommand,
} from './types';

export function handleCreateRelationship(
  state: SysmlRepositoryV4,
  cmd: CreateRelationshipCommand
): { success: boolean; code?: string; message?: string; nextState: SysmlRepositoryV4; affectedIds?: string[] } {
  if (state.relationships[cmd.relationship.id]) {
    return {
      success: false,
      code: 'RELATIONSHIP_ID_COLLISION',
      message: `Relationship with id "${cmd.relationship.id}" already exists.`,
      nextState: state,
    };
  }

  // Ensure source and target elements exist
  if (!state.elements[cmd.relationship.sourceId]) {
    return {
      success: false,
      code: 'SOURCE_ELEMENT_NOT_FOUND',
      message: `Source element "${cmd.relationship.sourceId}" does not exist.`,
      nextState: state,
    };
  }

  if (!state.elements[cmd.relationship.targetId]) {
    return {
      success: false,
      code: 'TARGET_ELEMENT_NOT_FOUND',
      message: `Target element "${cmd.relationship.targetId}" does not exist.`,
      nextState: state,
    };
  }

  const relationships = { ...state.relationships, [cmd.relationship.id]: cmd.relationship };

  // Update indexes
  const bySource = { ...state.indexes.bySourceEndpoint };
  bySource[cmd.relationship.sourceId] = [...(bySource[cmd.relationship.sourceId] || []), cmd.relationship.id];

  const byTarget = { ...state.indexes.byTargetEndpoint };
  byTarget[cmd.relationship.targetId] = [...(byTarget[cmd.relationship.targetId] || []), cmd.relationship.id];

  const byType = { ...state.indexes.byType };
  byType[cmd.relationship.metaclass] = [...(byType[cmd.relationship.metaclass] || []), cmd.relationship.id];

  const nextState: SysmlRepositoryV4 = {
    ...state,
    revision: state.revision + 1,
    relationships,
    indexes: {
      ...state.indexes,
      byType,
      bySourceEndpoint: bySource,
      byTargetEndpoint: byTarget,
    },
  };

  return { success: true, nextState, affectedIds: [cmd.relationship.id] };
}

export function handleUpdateRelationship(
  state: SysmlRepositoryV4,
  cmd: UpdateRelationshipCommand
): { success: boolean; code?: string; message?: string; nextState: SysmlRepositoryV4; affectedIds?: string[] } {
  const current = state.relationships[cmd.relationshipId];
  if (!current) {
    return {
      success: false,
      code: 'RELATIONSHIP_NOT_FOUND',
      message: `Relationship with id "${cmd.relationshipId}" not found.`,
      nextState: state,
    };
  }

  const updated = { ...current, ...cmd.patch, id: current.id, metaclass: current.metaclass };
  const relationships = { ...state.relationships, [cmd.relationshipId]: updated };

  const nextState: SysmlRepositoryV4 = {
    ...state,
    revision: state.revision + 1,
    relationships,
  };

  return { success: true, nextState, affectedIds: [cmd.relationshipId] };
}

export function handleDeleteRelationship(
  state: SysmlRepositoryV4,
  cmd: DeleteRelationshipCommand
): { success: boolean; code?: string; message?: string; nextState: SysmlRepositoryV4; affectedIds?: string[] } {
  const current = state.relationships[cmd.relationshipId];
  if (!current) {
    return {
      success: false,
      code: 'RELATIONSHIP_NOT_FOUND',
      message: `Relationship with id "${cmd.relationshipId}" not found.`,
      nextState: state,
    };
  }

  const nextRelationships = { ...state.relationships };
  delete nextRelationships[cmd.relationshipId];

  // Update indexes
  const bySource = { ...state.indexes.bySourceEndpoint };
  if (bySource[current.sourceId]) {
    bySource[current.sourceId] = bySource[current.sourceId].filter((id) => id !== cmd.relationshipId);
  }

  const byTarget = { ...state.indexes.byTargetEndpoint };
  if (byTarget[current.targetId]) {
    byTarget[current.targetId] = byTarget[current.targetId].filter((id) => id !== cmd.relationshipId);
  }

  const byType = { ...state.indexes.byType };
  if (byType[current.metaclass]) {
    byType[current.metaclass] = byType[current.metaclass].filter((id) => id !== cmd.relationshipId);
  }

  const nextState: SysmlRepositoryV4 = {
    ...state,
    revision: state.revision + 1,
    relationships: nextRelationships,
    indexes: {
      ...state.indexes,
      byType,
      bySourceEndpoint: bySource,
      byTargetEndpoint: byTarget,
    },
  };

  return { success: true, nextState, affectedIds: [cmd.relationshipId] };
}
