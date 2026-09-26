export * from './base';
export * from './classifiers';
export * from './properties';
export * from './ports';
export * from './requirements';
export * from './behaviors';
export * from './relationships';
export * from './presentations';

import type { SemanticElement } from './base';
import type { Diagram, DiagramPresentation } from './presentations';
import type { SemanticRelationship } from './relationships';

export interface RepositoryIndexesV4 {
  byOwner: Record<string, string[]>;
  byType: Record<string, string[]>;
  byNamespace: Record<string, string[]>;
  bySourceEndpoint: Record<string, string[]>;
  byTargetEndpoint: Record<string, string[]>;
  byDiagram: Record<string, string[]>;
}

export interface SysmlRepositoryV4 {
  schemaVersion: 4;
  profileId: 'OMG-SysML-1.6-ADIA';
  revision: number;
  elements: Record<string, SemanticElement>;
  relationships: Record<string, SemanticRelationship>;
  diagrams: Record<string, Diagram>;
  presentations: Record<string, DiagramPresentation>;
  indexes: RepositoryIndexesV4;
  metadata?: Record<string, unknown>;
}

export function createEmptyRepositoryV4(): SysmlRepositoryV4 {
  return {
    schemaVersion: 4,
    profileId: 'OMG-SysML-1.6-ADIA',
    revision: 0,
    elements: {
      'pkg-root': {
        id: 'pkg-root',
        name: 'Model',
        metaclass: 'Model',
        namespace: [],
        ownerId: null,
      },
    },
    relationships: {},
    diagrams: {},
    presentations: {},
    indexes: {
      byOwner: {},
      byType: { Model: ['pkg-root'] },
      byNamespace: { '': ['pkg-root'] },
      bySourceEndpoint: {},
      byTargetEndpoint: {},
      byDiagram: {},
    },
  };
}

export function validateNoGlobalIdCollision(repo: SysmlRepositoryV4, id: string): void {
  if (
    repo.elements[id] !== undefined ||
    repo.relationships[id] !== undefined ||
    repo.diagrams[id] !== undefined ||
    repo.presentations[id] !== undefined
  ) {
    throw new Error(`Global ID collision detected for ID: "${id}"`);
  }
}

export function addSemanticElementV4<T extends SemanticElement>(repo: SysmlRepositoryV4, element: T): void {
  validateNoGlobalIdCollision(repo, element.id);
  repo.elements[element.id] = element;

  // If element is also a Diagram, register in diagrams collection
  if (element.metaclass === 'Diagram') {
    repo.diagrams[element.id] = element as unknown as Diagram;
  }

  // Index by owner
  if (element.ownerId) {
    if (!repo.indexes.byOwner[element.ownerId]) {
      repo.indexes.byOwner[element.ownerId] = [];
    }
    repo.indexes.byOwner[element.ownerId].push(element.id);
  }

  // Index by type (metaclass)
  if (!repo.indexes.byType[element.metaclass]) {
    repo.indexes.byType[element.metaclass] = [];
  }
  repo.indexes.byType[element.metaclass].push(element.id);

  // Index by namespace
  const nsKey = element.namespace.join('::');
  if (!repo.indexes.byNamespace[nsKey]) {
    repo.indexes.byNamespace[nsKey] = [];
  }
  repo.indexes.byNamespace[nsKey].push(element.id);
}

export function addSemanticRelationshipV4(repo: SysmlRepositoryV4, relationship: SemanticRelationship): void {
  validateNoGlobalIdCollision(repo, relationship.id);
  repo.relationships[relationship.id] = relationship;

  // Index by type (metaclass)
  if (!repo.indexes.byType[relationship.metaclass]) {
    repo.indexes.byType[relationship.metaclass] = [];
  }
  repo.indexes.byType[relationship.metaclass].push(relationship.id);

  // Index by source
  if (!repo.indexes.bySourceEndpoint[relationship.sourceId]) {
    repo.indexes.bySourceEndpoint[relationship.sourceId] = [];
  }
  repo.indexes.bySourceEndpoint[relationship.sourceId].push(relationship.id);

  // Index by target
  if (!repo.indexes.byTargetEndpoint[relationship.targetId]) {
    repo.indexes.byTargetEndpoint[relationship.targetId] = [];
  }
  repo.indexes.byTargetEndpoint[relationship.targetId].push(relationship.id);
}

export function addDiagramPresentationV4(repo: SysmlRepositoryV4, presentation: DiagramPresentation): void {
  validateNoGlobalIdCollision(repo, presentation.id);
  repo.presentations[presentation.id] = presentation;

  // Index by diagram
  if (!repo.indexes.byDiagram[presentation.diagramId]) {
    repo.indexes.byDiagram[presentation.diagramId] = [];
  }
  repo.indexes.byDiagram[presentation.diagramId].push(presentation.id);
}
