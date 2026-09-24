import type {
  ExplorerDomain,
  ExplorerClipboardPayload,
} from './modelExplorerTypes';

export function copyOwnershipForest(
  domain: ExplorerDomain,
  selectedIds: readonly string[],
  getElement: (id: string) => any,
  getDescendants: (id: string) => any[],
  revision: number
): ExplorerClipboardPayload {
  const selectedSet = new Set(selectedIds);
  const rootIds: string[] = [];
  const snapshots: Record<string, any> = {};

  // Find top-level selected roots (exclude any node whose ancestor is also selected)
  for (const id of selectedIds) {
    let isChildOfSelected = false;
    for (const otherId of selectedIds) {
      if (otherId === id) continue;
      const descendants = getDescendants(otherId) ?? [];
      if (descendants.some((d: any) => d.id === id)) {
        isChildOfSelected = true;
        break;
      }
    }
    if (!isChildOfSelected) {
      rootIds.push(id);
    }
  }

  // Collect snapshot of each root and its entire descendant forest
  for (const rootId of rootIds) {
    const rootEl = getElement(rootId);
    if (!rootEl) continue;
    snapshots[rootId] = structuredClone(rootEl);

    const descendants = getDescendants(rootId) ?? [];
    for (const desc of descendants) {
      if (desc && desc.id) {
        snapshots[desc.id] = structuredClone(desc);
      }
    }
  }

  return {
    domain,
    rootIds,
    snapshots,
    copiedAtRevision: revision,
  };
}

export function remapClipboardPayload(
  payload: ExplorerClipboardPayload,
  idGenerator: (oldId: string) => string
): ExplorerClipboardPayload {
  const idMap = new Map<string, string>();
  for (const oldId of Object.keys(payload.snapshots)) {
    idMap.set(oldId, idGenerator(oldId));
  }

  const remappedSnapshots: Record<string, any> = {};

  for (const [oldId, original] of Object.entries(payload.snapshots)) {
    const newId = idMap.get(oldId)!;
    const cloned = structuredClone(original) as Record<string, any>;
    cloned.id = newId;

    // Rewrite internal references
    if (cloned.ownerId && idMap.has(cloned.ownerId)) {
      cloned.ownerId = idMap.get(cloned.ownerId);
    }
    if (cloned.parentId && idMap.has(cloned.parentId)) {
      cloned.parentId = idMap.get(cloned.parentId);
    }
    if (cloned.sourceId && idMap.has(cloned.sourceId)) {
      cloned.sourceId = idMap.get(cloned.sourceId);
    }
    if (cloned.targetId && idMap.has(cloned.targetId)) {
      cloned.targetId = idMap.get(cloned.targetId);
    }
    if (Array.isArray(cloned.children)) {
      cloned.children = cloned.children.map((cid: string) => idMap.get(cid) ?? cid);
    }
    if (Array.isArray(cloned.stateIds)) {
      cloned.stateIds = cloned.stateIds.map((sid: string) => idMap.get(sid) ?? sid);
    }
    if (Array.isArray(cloned.transitionIds)) {
      cloned.transitionIds = cloned.transitionIds.map((tid: string) => idMap.get(tid) ?? tid);
    }
    if (Array.isArray(cloned.junctionIds)) {
      cloned.junctionIds = cloned.junctionIds.map((jid: string) => idMap.get(jid) ?? jid);
    }

    remappedSnapshots[newId] = cloned;
  }

  return {
    domain: payload.domain,
    rootIds: payload.rootIds.map(id => idMap.get(id) ?? id),
    snapshots: remappedSnapshots,
    copiedAtRevision: payload.copiedAtRevision,
  };
}
