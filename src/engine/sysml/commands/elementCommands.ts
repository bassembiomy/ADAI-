import type { SysmlRepositoryV4, SemanticElement, Diagram, DiagramKind, MetaclassKind } from '../domain';
import { evaluateOwnership } from '../capabilities/ownershipPolicy';
import type {
  CreateElementCommand,
  CreateAndPresentElementCommand,
  UpdateElementCommand,
  RenameElementCommand,
  MoveElementCommand,
  DeleteElementCommand,
} from './types';

export function handleCreateElement(
  state: SysmlRepositoryV4,
  cmd: CreateElementCommand
): { success: boolean; code?: string; message?: string; nextState: SysmlRepositoryV4; affectedIds?: string[] } {
  if (state.elements[cmd.element.id]) {
    return {
      success: false,
      code: 'ELEMENT_ID_COLLISION',
      message: `Element with id "${cmd.element.id}" already exists.`,
      nextState: state,
    };
  }

  const owner = cmd.element.ownerId ? state.elements[cmd.element.ownerId] : null;
  if (cmd.element.ownerId && !owner) {
    return {
      success: false,
      code: 'ILLEGAL_OWNERSHIP',
      message: `Owner element "${cmd.element.ownerId}" does not exist.`,
      nextState: state,
    };
  }
  const ownershipDecision = evaluateOwnership(owner ?? null, cmd.element.metaclass);
  if (!ownershipDecision.allowed) {
    return {
      success: false,
      code: ownershipDecision.code ?? 'ILLEGAL_OWNERSHIP',
      message: ownershipDecision.message,
      nextState: state,
    };
  }

  const elements = { ...state.elements, [cmd.element.id]: cmd.element };
  const diagrams = cmd.element.metaclass === 'Diagram'
    ? { ...state.diagrams, [cmd.element.id]: cmd.element as Diagram }
    : state.diagrams;

  // Update indexes
  const byOwner = { ...state.indexes.byOwner };
  const ownerKey = cmd.element.ownerId ?? '__root__';
  const currentChildren = byOwner[ownerKey] || [];
  byOwner[ownerKey] = [...currentChildren, cmd.element.id];

  const byType = { ...state.indexes.byType };
  const currentMetaclass = byType[cmd.element.metaclass] || [];
  byType[cmd.element.metaclass] = [...currentMetaclass, cmd.element.id];

  const byNamespace = { ...state.indexes.byNamespace };
  const nsKey = cmd.element.namespace?.join('::') ?? '';
  byNamespace[nsKey] = [...(byNamespace[nsKey] || []), cmd.element.id];

  const nextState: SysmlRepositoryV4 = {
    ...state,
    revision: state.revision + 1,
    elements,
    diagrams,
    indexes: {
      ...state.indexes,
      byOwner,
      byType,
      byNamespace,
    },
  };

  return { success: true, nextState, affectedIds: [cmd.element.id] };
}

export const DIAGRAM_ALLOWED_METACLASSES: Record<DiagramKind, readonly MetaclassKind[]> = {
  bdd: [
    'Model',
    'Package',
    'Block',
    'InterfaceBlock',
    'ConstraintBlock',
    'AssociationBlock',
    'FlowSpecification',
    'DataType',
    'ValueType',
    'QuantityKind',
    'Unit',
    'Enumeration',
    'Signal',
    'Comment',
    'Rationale',
    'Constraint',
  ],
  ibd: [
    'Block',
    'PartProperty',
    'ReferenceProperty',
    'ValueProperty',
    'ConstraintProperty',
    'FlowProperty',
    'Port',
    'Comment',
    'Rationale',
    'Constraint',
  ],
  requirements: [
    'Requirement',
    'Block',
    'UseCase',
    'TestCase',
    'VerificationCase',
    'Comment',
    'Rationale',
    'Constraint',
  ],
  parametric: [
    'ConstraintBlock',
    'ConstraintProperty',
    'ValueProperty',
    'Parameter',
    'Constraint',
    'Comment',
    'Rationale',
  ],
  rtm: [
    'Requirement',
    'TestCase',
    'VerificationCase',
    'Block',
  ],
  stateMachine: [
    'Comment',
    'Rationale',
    'Constraint',
  ],
};

export function handleCreateAndPresentElement(
  state: SysmlRepositoryV4,
  cmd: CreateAndPresentElementCommand
): { success: boolean; code?: string; message?: string; nextState: SysmlRepositoryV4; affectedIds?: string[] } {
  if (cmd.presentation.semanticElementId !== cmd.element.id) {
    return {
      success: false,
      code: 'PRESENTATION_SEMANTIC_ID_MISMATCH',
      message: `Presentation semantic element "${cmd.presentation.semanticElementId}" must match created element "${cmd.element.id}".`,
      nextState: state,
    };
  }

  // 1. Validate ownership
  const owner = cmd.element.ownerId ? state.elements[cmd.element.ownerId] : null;
  if (cmd.element.ownerId && !owner) {
    return {
      success: false,
      code: 'ILLEGAL_OWNERSHIP',
      message: `Owner element "${cmd.element.ownerId}" does not exist.`,
      nextState: state,
    };
  }
  const ownershipDecision = evaluateOwnership(owner ?? null, cmd.element.metaclass);
  if (!ownershipDecision.allowed) {
    return {
      success: false,
      code: ownershipDecision.code ?? 'ILLEGAL_OWNERSHIP',
      message: ownershipDecision.message,
      nextState: state,
    };
  }

  // 2. Validate diagram exists
  const diagram = state.diagrams[cmd.presentation.diagramId];
  if (!diagram) {
    return {
      success: false,
      code: 'DIAGRAM_NOT_FOUND',
      message: `Diagram "${cmd.presentation.diagramId}" does not exist.`,
      nextState: state,
    };
  }

  // 3. Validate diagram compatibility
  const allowedMetaclasses = DIAGRAM_ALLOWED_METACLASSES[diagram.diagramKind];
  if (allowedMetaclasses && !allowedMetaclasses.includes(cmd.element.metaclass)) {
    return {
      success: false,
      code: 'INVALID_DIAGRAM_ELEMENT',
      message: `Metaclass "${cmd.element.metaclass}" is not valid for presentation on a "${diagram.diagramKind}" diagram.`,
      nextState: state,
    };
  }

  // 4. Validate duplicate presentation
  const diagramPresIds = state.indexes.byDiagram[cmd.presentation.diagramId] ?? [];
  const alreadyPresented = diagramPresIds.some((pId) => {
    const pres = state.presentations[pId];
    return pres && pres.semanticElementId === cmd.presentation.semanticElementId;
  });
  if (alreadyPresented) {
    return {
      success: false,
      code: 'ALREADY_PRESENTED',
      message: `Semantic element "${cmd.presentation.semanticElementId}" is already presented on diagram "${cmd.presentation.diagramId}".`,
      nextState: state,
    };
  }

  // 5. Validate ID collision
  if (state.elements[cmd.element.id]) {
    return {
      success: false,
      code: 'ELEMENT_ID_COLLISION',
      message: `Element with id "${cmd.element.id}" already exists.`,
      nextState: state,
    };
  }
  if (state.presentations[cmd.presentation.id]) {
    return {
      success: false,
      code: 'PRESENTATION_ID_COLLISION',
      message: `Presentation with id "${cmd.presentation.id}" already exists.`,
      nextState: state,
    };
  }

  // 6. Atomic state commit
  const repoCopy = structuredClone(state);

  // Add element
  repoCopy.elements[cmd.element.id] = cmd.element;
  if (cmd.element.metaclass === 'Diagram') {
    repoCopy.diagrams[cmd.element.id] = cmd.element as unknown as Diagram;
  }
  const ownerKey = cmd.element.ownerId ?? '__root__';
  repoCopy.indexes.byOwner[ownerKey] = [...(repoCopy.indexes.byOwner[ownerKey] || []), cmd.element.id];
  repoCopy.indexes.byType[cmd.element.metaclass] = [
    ...(repoCopy.indexes.byType[cmd.element.metaclass] || []),
    cmd.element.id,
  ];
  const nsKey = cmd.element.namespace?.join('::') ?? '';
  repoCopy.indexes.byNamespace[nsKey] = [...(repoCopy.indexes.byNamespace[nsKey] || []), cmd.element.id];

  // Add presentation
  repoCopy.presentations[cmd.presentation.id] = cmd.presentation;
  if (!repoCopy.diagrams[cmd.presentation.diagramId].presentationIds.includes(cmd.presentation.id)) {
    repoCopy.diagrams[cmd.presentation.diagramId].presentationIds.push(cmd.presentation.id);
  }
  repoCopy.indexes.byDiagram[cmd.presentation.diagramId] = [
    ...(repoCopy.indexes.byDiagram[cmd.presentation.diagramId] || []),
    cmd.presentation.id,
  ];

  // Increment revision once
  repoCopy.revision = state.revision + 1;

  return {
    success: true,
    nextState: repoCopy,
    affectedIds: [cmd.element.id, cmd.presentation.id],
  };
}

export function handleUpdateElement(
  state: SysmlRepositoryV4,
  cmd: UpdateElementCommand
): { success: boolean; code?: string; message?: string; nextState: SysmlRepositoryV4; affectedIds?: string[] } {
  const current = state.elements[cmd.elementId];
  if (!current) {
    return {
      success: false,
      code: 'ELEMENT_NOT_FOUND',
      message: `Element with id "${cmd.elementId}" not found.`,
      nextState: state,
    };
  }

  const updated = { ...current, ...cmd.patch, id: current.id, metaclass: current.metaclass };
  const elements = { ...state.elements, [cmd.elementId]: updated };

  const nextState: SysmlRepositoryV4 = {
    ...state,
    revision: state.revision + 1,
    elements,
  };

  return { success: true, nextState, affectedIds: [cmd.elementId] };
}

export function handleRenameElement(
  state: SysmlRepositoryV4,
  cmd: RenameElementCommand
): { success: boolean; code?: string; message?: string; nextState: SysmlRepositoryV4; affectedIds?: string[] } {
  const current = state.elements[cmd.elementId];
  if (!current) {
    return {
      success: false,
      code: 'ELEMENT_NOT_FOUND',
      message: `Element with id "${cmd.elementId}" not found.`,
      nextState: state,
    };
  }

  const updated = { ...current, name: cmd.newName };
  const elements = { ...state.elements, [cmd.elementId]: updated };

  const nextState: SysmlRepositoryV4 = {
    ...state,
    revision: state.revision + 1,
    elements,
  };

  return { success: true, nextState, affectedIds: [cmd.elementId] };
}

export function handleMoveElement(
  state: SysmlRepositoryV4,
  cmd: MoveElementCommand
): { success: boolean; code?: string; message?: string; nextState: SysmlRepositoryV4; affectedIds?: string[] } {
  const current = state.elements[cmd.elementId];
  if (!current) {
    return {
      success: false,
      code: 'ELEMENT_NOT_FOUND',
      message: `Element with id "${cmd.elementId}" not found.`,
      nextState: state,
    };
  }

  if (cmd.newOwnerId === cmd.elementId) {
    return {
      success: false,
      code: 'CIRCULAR_OWNERSHIP',
      message: `Element cannot own itself.`,
      nextState: state,
    };
  }

  const newOwner = cmd.newOwnerId === null ? null : state.elements[cmd.newOwnerId];
  if (cmd.newOwnerId !== null && !newOwner) {
    return {
      success: false,
      code: 'OWNER_NOT_FOUND',
      message: `Owner element "${cmd.newOwnerId}" does not exist.`,
      nextState: state,
    };
  }
  const ownershipDecision = evaluateOwnership(newOwner, current.metaclass);
  if (!ownershipDecision.allowed) {
    return {
      success: false,
      code: ownershipDecision.code ?? 'ILLEGAL_OWNERSHIP',
      message: ownershipDecision.message,
      nextState: state,
    };
  }

  // Check circular ownership: cannot move element inside any of its own descendants
  if (cmd.newOwnerId !== null) {
    let ancestorId: string | null = cmd.newOwnerId;
    while (ancestorId) {
      if (ancestorId === cmd.elementId) {
        return {
          success: false,
          code: 'CIRCULAR_OWNERSHIP',
          message: `Cannot move element "${cmd.elementId}" inside one of its descendants "${cmd.newOwnerId}".`,
          nextState: state,
        };
      }
      const ancestor: SemanticElement | undefined = state.elements[ancestorId];
      ancestorId = ancestor?.ownerId ?? null;
    }
  }

  const oldOwnerKey = current.ownerId ?? '__root__';
  const newOwnerKey = cmd.newOwnerId ?? '__root__';

  const byOwner = { ...state.indexes.byOwner };
  byOwner[oldOwnerKey] = (byOwner[oldOwnerKey] || []).filter((id) => id !== cmd.elementId);
  byOwner[newOwnerKey] = [...(byOwner[newOwnerKey] || []), cmd.elementId];

  const updated = { ...current, ownerId: cmd.newOwnerId };
  const elements = { ...state.elements, [cmd.elementId]: updated };

  const nextState: SysmlRepositoryV4 = {
    ...state,
    revision: state.revision + 1,
    elements,
    indexes: {
      ...state.indexes,
      byOwner,
    },
  };

  return { success: true, nextState, affectedIds: [cmd.elementId] };
}

export function handleDeleteElement(
  state: SysmlRepositoryV4,
  cmd: DeleteElementCommand
): { success: boolean; code?: string; message?: string; nextState: SysmlRepositoryV4; affectedIds?: string[] } {
  const current = state.elements[cmd.elementId];
  if (!current) {
    return {
      success: false,
      code: 'ELEMENT_NOT_FOUND',
      message: `Element with id "${cmd.elementId}" not found.`,
      nextState: state,
    };
  }

  // Find all elements to delete recursively (descendants)
  const toDeleteElements = new Set<string>([cmd.elementId]);
  const queue = [cmd.elementId];
  while (queue.length > 0) {
    const parentId = queue.shift()!;
    const children = state.indexes.byOwner[parentId] || [];
    for (const childId of children) {
      if (!toDeleteElements.has(childId)) {
        toDeleteElements.add(childId);
        queue.push(childId);
      }
    }
  }

  // Cascade to relationships attached to any deleted element
  const toDeleteRelationships = new Set<string>();
  for (const [relId, rel] of Object.entries(state.relationships)) {
    if (toDeleteElements.has(rel.sourceId) || toDeleteElements.has(rel.targetId)) {
      toDeleteRelationships.add(relId);
    }
  }

  // Cascade to presentations displaying any deleted element
  const toDeletePresentations = new Set<string>();
  for (const [presId, pres] of Object.entries(state.presentations)) {
    const presentedId = pres.semanticElementId || (pres as any).elementId;
    if (toDeleteElements.has(presentedId)) {
      toDeletePresentations.add(presId);
    }
  }

  // Construct new elements
  const nextElements = { ...state.elements };
  for (const id of toDeleteElements) {
    delete nextElements[id];
  }

  // Construct new relationships
  const nextRelationships = { ...state.relationships };
  for (const id of toDeleteRelationships) {
    delete nextRelationships[id];
  }

  // Construct new presentations
  const nextPresentations = { ...state.presentations };
  for (const id of toDeletePresentations) {
    delete nextPresentations[id];
  }

  // Rebuild byOwner index
  const nextByOwner: Record<string, string[]> = {};
  for (const [owner, childList] of Object.entries(state.indexes.byOwner || {})) {
    if (!toDeleteElements.has(owner)) {
      const filtered = childList.filter((id) => !toDeleteElements.has(id));
      if (filtered.length > 0) {
        nextByOwner[owner] = filtered;
      }
    }
  }

  // Rebuild byType index
  const nextByType: Record<string, string[]> = {};
  for (const [meta, idList] of Object.entries(state.indexes.byType || {})) {
    const filtered = idList.filter((id) => !toDeleteElements.has(id));
    if (filtered.length > 0) {
      nextByType[meta] = filtered;
    }
  }

  // Rebuild diagram presentation index
  const nextByDiagram: Record<string, string[]> = {};
  for (const [diagId, presList] of Object.entries(state.indexes.byDiagram || {})) {
    const filtered = presList.filter((id) => !toDeletePresentations.has(id));
    if (filtered.length > 0) {
      nextByDiagram[diagId] = filtered;
    }
  }

  // Rebuild endpoint indexes
  const nextBySource: Record<string, string[]> = {};
  for (const [src, relList] of Object.entries(state.indexes.bySourceEndpoint || {})) {
    if (!toDeleteElements.has(src)) {
      const filtered = relList.filter((id) => !toDeleteRelationships.has(id));
      if (filtered.length > 0) {
        nextBySource[src] = filtered;
      }
    }
  }

  const nextByTarget: Record<string, string[]> = {};
  for (const [tgt, relList] of Object.entries(state.indexes.byTargetEndpoint || {})) {
    if (!toDeleteElements.has(tgt)) {
      const filtered = relList.filter((id) => !toDeleteRelationships.has(id));
      if (filtered.length > 0) {
        nextByTarget[tgt] = filtered;
      }
    }
  }

  const nextState: SysmlRepositoryV4 = {
    ...state,
    revision: state.revision + 1,
    elements: nextElements,
    relationships: nextRelationships,
    presentations: nextPresentations,
    indexes: {
      ...state.indexes,
      byOwner: nextByOwner,
      byType: nextByType,
      byDiagram: nextByDiagram,
      bySourceEndpoint: nextBySource,
      byTargetEndpoint: nextByTarget,
    },
  };

  return {
    success: true,
    nextState,
    affectedIds: [
      ...Array.from(toDeleteElements),
      ...Array.from(toDeleteRelationships),
      ...Array.from(toDeletePresentations),
    ],
  };
}
