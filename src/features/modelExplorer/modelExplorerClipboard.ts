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
  // Block-owned properties and ports are semantic elements with globally
  // unique identities even though they are stored inline. Copying a Block
  // must therefore remap those identities together with top-level entities.
  for (const snapshot of Object.values(payload.snapshots) as Array<Record<string, any>>) {
    for (const feature of [...(snapshot?.properties ?? []), ...(snapshot?.ports ?? [])]) {
      if (feature?.id && !idMap.has(feature.id)) idMap.set(feature.id, idGenerator(feature.id));
    }
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
    if (cloned.typeId && idMap.has(cloned.typeId)) {
      cloned.typeId = idMap.get(cloned.typeId);
    }
    if (cloned.propertyId && idMap.has(cloned.propertyId)) {
      cloned.propertyId = idMap.get(cloned.propertyId);
    }
    if (cloned.definitionId && idMap.has(cloned.definitionId)) {
      cloned.definitionId = idMap.get(cloned.definitionId);
    }
    if (cloned.inheritedFromId && idMap.has(cloned.inheritedFromId)) {
      cloned.inheritedFromId = idMap.get(cloned.inheritedFromId);
    }
    if (Array.isArray(cloned.supertypeIds)) {
      cloned.supertypeIds = cloned.supertypeIds.map((id: string) => idMap.get(id) ?? id);
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
    if (Array.isArray(cloned.properties)) {
      cloned.properties = cloned.properties.map((property: Record<string, any>) => ({
        ...property,
        id: idMap.get(property.id) ?? property.id,
        typeId: idMap.get(property.typeId) ?? property.typeId,
        redefinesId: idMap.get(property.redefinesId) ?? property.redefinesId,
        subsetsId: idMap.get(property.subsetsId) ?? property.subsetsId,
        inheritedFromId: idMap.get(property.inheritedFromId) ?? property.inheritedFromId,
      }));
    }
    if (Array.isArray(cloned.ports)) {
      cloned.ports = cloned.ports.map((port: Record<string, any>) => ({
        ...port,
        id: idMap.get(port.id) ?? port.id,
        typeId: idMap.get(port.typeId) ?? port.typeId,
        inheritedFromId: idMap.get(port.inheritedFromId) ?? port.inheritedFromId,
      }));
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
