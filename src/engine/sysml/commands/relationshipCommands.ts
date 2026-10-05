import type { SysmlRepositoryV4, SemanticRelationship, ItemFlow } from '../domain';
import { validateRelationshipEndpoints } from '../capabilities/relationshipPolicy';
import type {
  CreateRelationshipCommand,
  UpdateRelationshipCommand,
  DeleteRelationshipCommand,
} from './types';

export interface ConnectorEndInput {
  id?: string;
  roleId: string;
  partWithPortId?: string;
  nestedPath?: string[];
}

export interface CreateConnectorTransactionInput {
  id?: string;
  name?: string;
  ownerId: string;
  metaclass?: 'Connector' | 'BindingConnector';
  sourceEnd: ConnectorEndInput;
  targetEnd: ConnectorEndInput;
  itemFlowId?: string;
  conveyedClassifierIds?: string[];
  itemPropertyName?: string;
  itemPropertyId?: string;
}

export interface CreateConnectorTransactionResult {
  success: boolean;
  code?: string;
  message?: string;
  state: SysmlRepositoryV4;
  relationshipId: string;
  itemFlowId?: string;
}

export function createConnectorTransaction(
  state: SysmlRepositoryV4,
  input: CreateConnectorTransactionInput
): CreateConnectorTransactionResult {
  // 1. Validate owner
  const owner = state.elements[input.ownerId];
  if (!owner) {
    return {
      success: false,
      code: 'OWNER_ELEMENT_NOT_FOUND',
      message: `Owner element "${input.ownerId}" does not exist.`,
      state,
      relationshipId: '',
    };
  }

  // 2. Validate roles
  const sourceRole = state.elements[input.sourceEnd.roleId];
  const targetRole = state.elements[input.targetEnd.roleId];
  if (!sourceRole || !targetRole) {
    return {
      success: false,
      code: 'ROLE_ELEMENT_NOT_FOUND',
      message: 'Connector endpoint role element does not exist.',
      state,
      relationshipId: '',
    };
  }

  // 3. Validate nested paths
  if (input.sourceEnd.nestedPath) {
    for (const segment of input.sourceEnd.nestedPath) {
      if (!state.elements[segment]) {
        return {
          success: false,
          code: 'NESTED_PATH_ELEMENT_NOT_FOUND',
          message: `Nested path element "${segment}" does not exist.`,
          state,
          relationshipId: '',
        };
      }
    }
  }

  if (input.targetEnd.nestedPath) {
    for (const segment of input.targetEnd.nestedPath) {
      if (!state.elements[segment]) {
        return {
          success: false,
          code: 'NESTED_PATH_ELEMENT_NOT_FOUND',
          message: `Nested path element "${segment}" does not exist.`,
          state,
          relationshipId: '',
        };
      }
    }
  }

  // 4. Validate conveyed classifiers
  if (input.conveyedClassifierIds && input.conveyedClassifierIds.length > 0) {
    for (const cid of input.conveyedClassifierIds) {
      if (!state.elements[cid]) {
        return {
          success: false,
          code: 'CONVEYED_CLASSIFIER_NOT_FOUND',
          message: `Conveyed classifier "${cid}" does not exist.`,
          state,
          relationshipId: '',
        };
      }
    }
  }

  const relId = input.id ?? `conn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const sourceEndId = input.sourceEnd.id ?? `${relId}-src`;
  const targetEndId = input.targetEnd.id ?? `${relId}-tgt`;

  const relationship: SemanticRelationship = {
    id: relId,
    name: input.name,
    metaclass: input.metaclass ?? 'Connector',
    ownerId: input.ownerId,
    sourceId: input.sourceEnd.roleId,
    targetId: input.targetEnd.roleId,
    sourceEnd: {
      id: sourceEndId,
      roleId: input.sourceEnd.roleId,
      partWithPortId: input.sourceEnd.partWithPortId,
      nestedPath: input.sourceEnd.nestedPath,
    },
    targetEnd: {
      id: targetEndId,
      roleId: input.targetEnd.roleId,
      partWithPortId: input.targetEnd.partWithPortId,
      nestedPath: input.targetEnd.nestedPath,
    },
  };

  let itemFlow: ItemFlow | undefined;
  let itemFlowId: string | undefined;
  if (input.conveyedClassifierIds && input.conveyedClassifierIds.length > 0) {
    itemFlowId = input.itemFlowId ?? `if-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    itemFlow = {
      id: itemFlowId,
      name: input.itemPropertyName,
      realizingRelationshipId: relId,
      conveyedClassifierIds: input.conveyedClassifierIds,
      sourceId: input.sourceEnd.roleId,
      targetId: input.targetEnd.roleId,
      itemPropertyId: input.itemPropertyId,
    };
  }

  const relationships = { ...state.relationships, [relId]: relationship };
  const itemFlows = { ...(state.itemFlows ?? {}) };
  if (itemFlow && itemFlowId) {
    itemFlows[itemFlowId] = itemFlow;
  }

  const bySource = { ...state.indexes.bySourceEndpoint };
  bySource[relationship.sourceId] = [...(bySource[relationship.sourceId] || []), relId];

  const byTarget = { ...state.indexes.byTargetEndpoint };
  byTarget[relationship.targetId] = [...(byTarget[relationship.targetId] || []), relId];

  const byType = { ...state.indexes.byType };
  byType[relationship.metaclass] = [...(byType[relationship.metaclass] || []), relId];

  const byOwner = { ...state.indexes.byOwner };
  byOwner[input.ownerId] = [...(byOwner[input.ownerId] || []), relId];

  const nextState: SysmlRepositoryV4 = {
    ...state,
    revision: state.revision + 1,
    relationships,
    itemFlows,
    indexes: {
      ...state.indexes,
      byType,
      bySourceEndpoint: bySource,
      byTargetEndpoint: byTarget,
      byOwner,
    },
  };

  return {
    success: true,
    state: nextState,
    relationshipId: relId,
    itemFlowId,
  };
}

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

  // Validate endpoints via canonical relationship policy
  const validation = validateRelationshipEndpoints(cmd.relationship, state);
  if (!validation.allowed) {
    return {
      success: false,
      code: validation.code ?? 'INVALID_RELATIONSHIP_ENDPOINTS',
      message: validation.message ?? 'Relationship endpoints are invalid.',
      nextState: state,
    };
  }

  const relationships = { ...state.relationships, [cmd.relationship.id]: cmd.relationship };
  const itemFlows = { ...(state.itemFlows ?? {}) };
  if (cmd.itemFlow) {
    itemFlows[cmd.itemFlow.id] = cmd.itemFlow;
  }

  // Update indexes
  const bySource = { ...state.indexes.bySourceEndpoint };
  bySource[cmd.relationship.sourceId] = [...(bySource[cmd.relationship.sourceId] || []), cmd.relationship.id];

  const byTarget = { ...state.indexes.byTargetEndpoint };
  byTarget[cmd.relationship.targetId] = [...(byTarget[cmd.relationship.targetId] || []), cmd.relationship.id];

  const byType = { ...state.indexes.byType };
  byType[cmd.relationship.metaclass] = [...(byType[cmd.relationship.metaclass] || []), cmd.relationship.id];

  const byOwner = { ...state.indexes.byOwner };
  if (cmd.relationship.ownerId) {
    byOwner[cmd.relationship.ownerId] = [...(byOwner[cmd.relationship.ownerId] || []), cmd.relationship.id];
  }

  const affectedIds = [cmd.relationship.id];
  if (cmd.itemFlow) {
    affectedIds.push(cmd.itemFlow.id);
  }

  const nextState: SysmlRepositoryV4 = {
    ...state,
    revision: state.revision + 1,
    relationships,
    itemFlows,
    indexes: {
      ...state.indexes,
      byType,
      bySourceEndpoint: bySource,
      byTargetEndpoint: byTarget,
      byOwner,
    },
  };

  return { success: true, nextState, affectedIds };
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

  const patch = cmd.patch;

  // Validate endpoints if changed
  if (patch.sourceId !== undefined && patch.sourceId !== current.sourceId) {
    if (!state.elements[patch.sourceId]) {
      return {
        success: false,
        code: 'ENDPOINT_NOT_FOUND',
        message: `Source element "${patch.sourceId}" does not exist.`,
        nextState: state,
      };
    }
  }

  if (patch.targetId !== undefined && patch.targetId !== current.targetId) {
    if (!state.elements[patch.targetId]) {
      return {
        success: false,
        code: 'ENDPOINT_NOT_FOUND',
        message: `Target element "${patch.targetId}" does not exist.`,
        nextState: state,
      };
    }
  }

  if (patch.ownerId !== undefined && patch.ownerId !== current.ownerId && patch.ownerId !== null) {
    if (!state.elements[patch.ownerId]) {
      return {
        success: false,
        code: 'OWNER_ELEMENT_NOT_FOUND',
        message: `Owner element "${patch.ownerId}" does not exist.`,
        nextState: state,
      };
    }
  }

  const updated: SemanticRelationship = { ...current, ...patch, id: current.id, metaclass: current.metaclass };

  if (patch.sourceId !== undefined || patch.targetId !== undefined) {
    const endpointValidation = validateRelationshipEndpoints(updated, state);
    if (!endpointValidation.allowed) {
      return {
        success: false,
        code: endpointValidation.code ?? 'INVALID_RELATIONSHIP_ENDPOINTS',
        message: endpointValidation.message ?? 'Relationship endpoints are invalid.',
        nextState: state,
      };
    }
  }

  // If connector ends exist, keep their roleIds aligned with new source/target
  if (updated.sourceEnd && 'roleId' in updated.sourceEnd && patch.sourceId && patch.sourceId !== current.sourceId) {
    updated.sourceEnd = { ...updated.sourceEnd, roleId: patch.sourceId };
  }
  if (updated.targetEnd && 'roleId' in updated.targetEnd && patch.targetId && patch.targetId !== current.targetId) {
    updated.targetEnd = { ...updated.targetEnd, roleId: patch.targetId };
  }
  if ((updated as any).connectorEnds && (updated as any).connectorEnds.length >= 2) {
    const nextEnds = [...(updated as any).connectorEnds];
    if (patch.sourceId && patch.sourceId !== current.sourceId) {
      nextEnds[0] = { ...nextEnds[0], roleId: patch.sourceId };
    }
    if (patch.targetId && patch.targetId !== current.targetId) {
      nextEnds[1] = { ...nextEnds[1], roleId: patch.targetId };
    }
    (updated as any).connectorEnds = nextEnds;
  }

  const relationships = { ...state.relationships, [cmd.relationshipId]: updated };

  // Also keep any realized item flows consistent with new source/target
  let nextItemFlows = state.itemFlows;
  if (state.itemFlows) {
    let flowsChanged = false;
    const copyFlows = { ...state.itemFlows };
    for (const [flowId, flow] of Object.entries(copyFlows)) {
      if (flow.realizingRelationshipId === cmd.relationshipId) {
        let changed = false;
        const nextFlow = { ...flow };
        if (patch.sourceId && patch.sourceId !== current.sourceId) {
          nextFlow.sourceId = patch.sourceId;
          changed = true;
        }
        if (patch.targetId && patch.targetId !== current.targetId) {
          nextFlow.targetId = patch.targetId;
          changed = true;
        }
        if (changed) {
          copyFlows[flowId] = nextFlow;
          flowsChanged = true;
        }
      }
    }
    if (flowsChanged) {
      nextItemFlows = copyFlows;
    }
  }

  // Update indexes
  const bySource = { ...state.indexes.bySourceEndpoint };
  if (patch.sourceId && patch.sourceId !== current.sourceId) {
    if (bySource[current.sourceId]) {
      bySource[current.sourceId] = bySource[current.sourceId].filter((id) => id !== cmd.relationshipId);
    }
    bySource[patch.sourceId] = [...(bySource[patch.sourceId] || []), cmd.relationshipId];
  }

  const byTarget = { ...state.indexes.byTargetEndpoint };
  if (patch.targetId && patch.targetId !== current.targetId) {
    if (byTarget[current.targetId]) {
      byTarget[current.targetId] = byTarget[current.targetId].filter((id) => id !== cmd.relationshipId);
    }
    byTarget[patch.targetId] = [...(byTarget[patch.targetId] || []), cmd.relationshipId];
  }

  const byOwner = { ...state.indexes.byOwner };
  if (patch.ownerId !== undefined && patch.ownerId !== current.ownerId) {
    if (current.ownerId && byOwner[current.ownerId]) {
      byOwner[current.ownerId] = byOwner[current.ownerId].filter((id) => id !== cmd.relationshipId);
    }
    if (patch.ownerId) {
      byOwner[patch.ownerId] = [...(byOwner[patch.ownerId] || []), cmd.relationshipId];
    }
  }

  const nextState: SysmlRepositoryV4 = {
    ...state,
    revision: state.revision + 1,
    relationships,
    itemFlows: nextItemFlows,
    indexes: {
      ...state.indexes,
      bySourceEndpoint: bySource,
      byTargetEndpoint: byTarget,
      byOwner,
    },
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

  // Also remove any realized item flow
  let nextItemFlows = state.itemFlows;
  if (state.itemFlows) {
    let changed = false;
    const copy = { ...state.itemFlows };
    for (const [id, flow] of Object.entries(copy)) {
      if (flow.realizingRelationshipId === cmd.relationshipId) {
        delete copy[id];
        changed = true;
      }
    }
    if (changed) {
      nextItemFlows = copy;
    }
  }

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

  const byOwner = { ...state.indexes.byOwner };
  if (current.ownerId && byOwner[current.ownerId]) {
    byOwner[current.ownerId] = byOwner[current.ownerId].filter((id) => id !== cmd.relationshipId);
  }

  const nextState: SysmlRepositoryV4 = {
    ...state,
    revision: state.revision + 1,
    relationships: nextRelationships,
    itemFlows: nextItemFlows,
    indexes: {
      ...state.indexes,
      byType,
      bySourceEndpoint: bySource,
      byTargetEndpoint: byTarget,
      byOwner,
    },
  };

  return { success: true, nextState, affectedIds: [cmd.relationshipId] };
}
