import type { SysmlRepositoryV4, AllocateRelationship } from '../domain';

export interface AllocationQueryResult {
  allocatedTo: string[];
  allocatedFrom: string[];
}

export function queryAllocations(
  repo: SysmlRepositoryV4,
  elementId: string
): AllocationQueryResult {
  const allocatedTo: string[] = [];
  const allocatedFrom: string[] = [];

  // Outgoing allocations: element is source/allocatedFrom
  const outgoingRelIds = repo.indexes.bySourceEndpoint[elementId] || [];
  for (const relId of outgoingRelIds) {
    const rel = repo.relationships[relId];
    if (rel && rel.metaclass === 'Allocate') {
      const alloc = rel as AllocateRelationship;
      allocatedTo.push(alloc.allocatedToId ?? alloc.targetId);
    }
  }

  // Incoming allocations: element is target/allocatedTo
  const incomingRelIds = repo.indexes.byTargetEndpoint[elementId] || [];
  for (const relId of incomingRelIds) {
    const rel = repo.relationships[relId];
    if (rel && rel.metaclass === 'Allocate') {
      const alloc = rel as AllocateRelationship;
      allocatedFrom.push(alloc.allocatedFromId ?? alloc.sourceId);
    }
  }

  return {
    allocatedTo,
    allocatedFrom,
  };
}
