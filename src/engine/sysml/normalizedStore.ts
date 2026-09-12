import type {
  SysmlRepository,
  SysmlDefinition,
  SysmlUsage,
  ConnectorUsage,
  SysmlRelationship,
  RequirementDefinition,
  VerificationCase,
  VerificationEvidence,
  ModelBaseline,
  TraceArtifact,
  ModelChangeRecord,
  Multiplicity,
  BlockDefinition,
  PartUsage,
  SysmlEntity,
  SysmlEntityCollection,
} from './model';
import type {
  PresentationCoordinates,
  LegacySysmlView,
} from '../../services/sysmlCommandGateway';
import type {
  BlockData,
  ConnectorData,
  PartData,
  RelationshipData,
  PortData,
} from '../../types/sysml_types';
import type { WorkerStoreSnapshot } from './workerProtocol';

export interface StoreIndexes {
  ownerId: Map<string, Set<string>>;
  typeId: Map<string, Set<string>>;
  sourceId: Map<string, Set<string>>;
  targetId: Map<string, Set<string>>;
  diagramId: Map<string, Set<string>>;
  requirementId: Map<string, Set<string>>;
  kind: Map<string, Set<string>>;
  byId: Map<string, { collection: SysmlEntityCollection; id: string }>;
}

export interface NormalizedSysmlStore {
  schemaVersion: 2;
  profileId: 'OMG-SysML-1.6-ADIA';
  revision: number;
  definitions: Map<string, SysmlDefinition>;
  usages: Map<string, SysmlUsage>;
  connectors: Map<string, ConnectorUsage>;
  relationships: Map<string, SysmlRelationship>;
  requirements: Map<string, RequirementDefinition>;
  verificationCases: Map<string, VerificationCase>;
  evidence: Map<string, VerificationEvidence>;
  baselines: Map<string, ModelBaseline>;
  artifacts: Map<string, TraceArtifact>;
  auditTrail: ModelChangeRecord[];
  coordinates: Map<string, PresentationCoordinates>;
  diagramPresentations: Map<string, { elementIds: string[] }>;
  indexes: StoreIndexes;
}

function createEmptyIndexes(): StoreIndexes {
  return {
    ownerId: new Map(),
    typeId: new Map(),
    sourceId: new Map(),
    targetId: new Map(),
    diagramId: new Map(),
    requirementId: new Map(),
    kind: new Map(),
    byId: new Map(),
  };
}

function addToIndex(map: Map<string, Set<string>>, key: string, id: string): void {
  let set = map.get(key);
  if (!set) {
    set = new Set();
    map.set(key, set);
  }
  set.add(id);
}

function removeFromIndex(map: Map<string, Set<string>>, key: string, id: string): void {
  const set = map.get(key);
  if (set) {
    set.delete(id);
    if (set.size === 0) {
      map.delete(key);
    }
  }
}

export function createEmptyNormalizedStore(): NormalizedSysmlStore {
  return {
    schemaVersion: 2,
    profileId: 'OMG-SysML-1.6-ADIA',
    revision: 0,
    definitions: new Map(),
    usages: new Map(),
    connectors: new Map(),
    relationships: new Map(),
    requirements: new Map(),
    verificationCases: new Map(),
    evidence: new Map(),
    baselines: new Map(),
    artifacts: new Map(),
    auditTrail: [],
    coordinates: new Map(),
    diagramPresentations: new Map(),
    indexes: createEmptyIndexes(),
  };
}

/**
 * Remove an entity from all secondary indexes.
 */
function unindexEntity(store: NormalizedSysmlStore, id: string, entity: SysmlEntity): void {
  const indexes = store.indexes;
  indexes.byId.delete(id);

  if ('kind' in entity && typeof entity.kind === 'string') {
    removeFromIndex(indexes.kind, entity.kind, id);
  }

  // ownerId
  if ('ownerId' in entity && typeof entity.ownerId === 'string') {
    removeFromIndex(indexes.ownerId, entity.ownerId, id);
  }

  // typeId
  if ('typeId' in entity && typeof entity.typeId === 'string') {
    removeFromIndex(indexes.typeId, entity.typeId, id);
  }

  // sourceId / targetId
  if ('sourceId' in entity && typeof entity.sourceId === 'string') {
    removeFromIndex(indexes.sourceId, entity.sourceId, id);
  }
  if ('targetId' in entity && typeof entity.targetId === 'string') {
    removeFromIndex(indexes.targetId, entity.targetId, id);
  }

  // requirementId
  if ('requirementId' in entity && typeof entity.requirementId === 'string') {
    removeFromIndex(indexes.requirementId, entity.requirementId, id);
  }
  if ('verifiesRequirementIds' in entity && Array.isArray(entity.verifiesRequirementIds)) {
    for (const reqId of entity.verifiesRequirementIds) {
      removeFromIndex(indexes.requirementId, reqId, id);
    }
  }
}

/**
 * Add an entity to all relevant secondary indexes.
 */
function indexEntity(
  store: NormalizedSysmlStore,
  collection: SysmlEntityCollection,
  id: string,
  entity: SysmlEntity,
): void {
  const indexes = store.indexes;
  indexes.byId.set(id, { collection, id });

  if ('kind' in entity && typeof entity.kind === 'string') {
    addToIndex(indexes.kind, entity.kind, id);
  }

  // ownerId
  if ('ownerId' in entity && typeof entity.ownerId === 'string') {
    addToIndex(indexes.ownerId, entity.ownerId, id);
  }

  // typeId
  if ('typeId' in entity && typeof entity.typeId === 'string') {
    addToIndex(indexes.typeId, entity.typeId, id);
  }

  // sourceId / targetId
  if ('sourceId' in entity && typeof entity.sourceId === 'string') {
    addToIndex(indexes.sourceId, entity.sourceId, id);
  }
  if ('targetId' in entity && typeof entity.targetId === 'string') {
    addToIndex(indexes.targetId, entity.targetId, id);
  }

  // requirementId
  if ('requirementId' in entity && typeof entity.requirementId === 'string') {
    addToIndex(indexes.requirementId, entity.requirementId, id);
    addToIndex(indexes.requirementId, entity.id, id);
  }
  if ('verifiesRequirementIds' in entity && Array.isArray(entity.verifiesRequirementIds)) {
    for (const reqId of entity.verifiesRequirementIds) {
      addToIndex(indexes.requirementId, reqId, id);
    }
  }
}

/**
 * Initialize a NormalizedSysmlStore from a SysmlRepository and optional presentations.
 */
export function fromRepository(
  repo: SysmlRepository,
  coordinates?: Record<string, PresentationCoordinates>,
  diagramPresentations?: Record<string, { elementIds: string[] }>,
): NormalizedSysmlStore {
  const store = createEmptyNormalizedStore();
  store.schemaVersion = repo.schemaVersion ?? 2;
  store.profileId = repo.profileId ?? 'OMG-SysML-1.6-ADIA';
  store.revision = repo.revision ?? 0;
  store.auditTrail = [...(repo.auditTrail ?? [])];

  for (const [id, def] of Object.entries(repo.definitions ?? {})) {
    store.definitions.set(id, def);
    indexEntity(store, 'definitions', id, def);
  }
  for (const [id, usage] of Object.entries(repo.usages ?? {})) {
    store.usages.set(id, usage);
    indexEntity(store, 'usages', id, usage);
  }
  for (const [id, conn] of Object.entries(repo.connectors ?? {})) {
    store.connectors.set(id, conn);
    indexEntity(store, 'connectors', id, conn);
  }
  for (const [id, rel] of Object.entries(repo.relationships ?? {})) {
    store.relationships.set(id, rel);
    indexEntity(store, 'relationships', id, rel);
  }
  for (const [id, req] of Object.entries(repo.requirements ?? {})) {
    store.requirements.set(id, req);
    indexEntity(store, 'requirements', id, req);
  }
  for (const [id, vc] of Object.entries(repo.verificationCases ?? {})) {
    store.verificationCases.set(id, vc);
    indexEntity(store, 'verificationCases', id, vc);
  }
  for (const [id, ev] of Object.entries(repo.evidence ?? {})) {
    store.evidence.set(id, ev);
    indexEntity(store, 'evidence', id, ev);
  }
  for (const [id, base] of Object.entries(repo.baselines ?? {})) {
    store.baselines.set(id, base);
    indexEntity(store, 'baselines', id, base);
  }
  for (const [id, art] of Object.entries(repo.artifacts ?? {})) {
    store.artifacts.set(id, art);
    indexEntity(store, 'artifacts', id, art);
  }

  if (coordinates) {
    for (const [id, coord] of Object.entries(coordinates)) {
      store.coordinates.set(id, coord);
    }
  }

  if (diagramPresentations) {
    for (const [dId, pres] of Object.entries(diagramPresentations)) {
      store.diagramPresentations.set(dId, pres);
      for (const elemId of pres.elementIds) {
        addToIndex(store.indexes.diagramId, dId, elemId);
      }
    }
  }

  return store;
}

/**
 * Export a NormalizedSysmlStore back to a canonical SysmlRepository (schemaVersion: 2).
 * Keys are emitted in deterministic sorted-id order so serialization is stable
 * across runs; semantic IDs themselves are never rewritten.
 */
export function toRepository(store: NormalizedSysmlStore): SysmlRepository {
  const sortedEntries = <T>(entries: Iterable<[string, T]>): Record<string, T> =>
    Object.fromEntries([...entries].sort(([a], [b]) => a.localeCompare(b)));
  return {
    schemaVersion: 2,
    profileId: store.profileId,
    revision: store.revision,
    definitions: sortedEntries(store.definitions),
    usages: sortedEntries(store.usages),
    connectors: sortedEntries(store.connectors),
    relationships: sortedEntries(store.relationships),
    requirements: sortedEntries(store.requirements),
    verificationCases: sortedEntries(store.verificationCases),
    evidence: sortedEntries(store.evidence),
    baselines: sortedEntries(store.baselines),
    artifacts: sortedEntries(store.artifacts),
    auditTrail: [...store.auditTrail],
  };
}

/**
 * Get an entity by ID from any collection in O(1) time.
 */
export function getById(store: NormalizedSysmlStore, id: string): SysmlEntity | undefined {
  const meta = store.indexes.byId.get(id);
  if (!meta) return undefined;
  switch (meta.collection) {
    case 'definitions':
      return store.definitions.get(id);
    case 'usages':
      return store.usages.get(id);
    case 'connectors':
      return store.connectors.get(id);
    case 'relationships':
      return store.relationships.get(id);
    case 'requirements':
      return store.requirements.get(id);
    case 'verificationCases':
      return store.verificationCases.get(id);
    case 'evidence':
      return store.evidence.get(id);
    case 'baselines':
      return store.baselines.get(id);
    case 'artifacts':
      return store.artifacts.get(id);
  }
}

/**
 * Get the collection name for a given entity ID.
 */
export function getCollectionForId(store: NormalizedSysmlStore, id: string): SysmlEntityCollection | undefined {
  return store.indexes.byId.get(id)?.collection;
}

const EMPTY_SET: ReadonlySet<string> = new Set();

/**
 * Get entity IDs matching a secondary index key.
 */
export function idsByIndex(
  store: NormalizedSysmlStore,
  indexName: keyof StoreIndexes,
  key: string,
): ReadonlySet<string> {
  const indexMap = store.indexes[indexName];
  if (indexMap instanceof Map) {
    const entry = indexMap.get(key);
    if (entry instanceof Set) {
      return entry;
    }
  }
  return EMPTY_SET;
}

/**
 * Insert or update an entity in the store, automatically updating indexes.
 */
export function upsertEntity(
  store: NormalizedSysmlStore,
  collection: SysmlEntityCollection,
  entity: SysmlEntity,
): void {
  const existing = getById(store, entity.id);
  if (existing) {
    unindexEntity(store, entity.id, existing);
  }

  switch (collection) {
    case 'definitions':
      store.definitions.set(entity.id, entity as SysmlDefinition);
      break;
    case 'usages':
      store.usages.set(entity.id, entity as SysmlUsage);
      break;
    case 'connectors':
      store.connectors.set(entity.id, entity as ConnectorUsage);
      break;
    case 'relationships':
      store.relationships.set(entity.id, entity as SysmlRelationship);
      break;
    case 'requirements':
      store.requirements.set(entity.id, entity as RequirementDefinition);
      break;
    case 'verificationCases':
      store.verificationCases.set(entity.id, entity as VerificationCase);
      break;
    case 'evidence':
      store.evidence.set(entity.id, entity as VerificationEvidence);
      break;
    case 'baselines':
      store.baselines.set(entity.id, entity as ModelBaseline);
      break;
    case 'artifacts':
      store.artifacts.set(entity.id, entity as TraceArtifact);
      break;
  }

  indexEntity(store, collection, entity.id, entity);
  store.revision += 1;
}

/**
 * Remove an entity and clean up its secondary indexes.
 */
export function removeEntity(store: NormalizedSysmlStore, id: string): boolean {
  const existing = getById(store, id);
  if (!existing) return false;

  const collection = getCollectionForId(store, id);
  unindexEntity(store, id, existing);

  if (collection) {
    switch (collection) {
      case 'definitions':
        store.definitions.delete(id);
        break;
      case 'usages':
        store.usages.delete(id);
        break;
      case 'connectors':
        store.connectors.delete(id);
        break;
      case 'relationships':
        store.relationships.delete(id);
        break;
      case 'requirements':
        store.requirements.delete(id);
        break;
      case 'verificationCases':
        store.verificationCases.delete(id);
        break;
      case 'evidence':
        store.evidence.delete(id);
        break;
      case 'baselines':
        store.baselines.delete(id);
        break;
      case 'artifacts':
        store.artifacts.delete(id);
        break;
    }
  }

  store.coordinates.delete(id);
  store.revision += 1;
  const cache = entityProjectionCaches.get(store);
  if (cache) {
    cache.blocks.delete(id);
    cache.parts.delete(id);
    cache.connectors.delete(id);
    cache.relationships.delete(id);
  }
  return true;
}

/**
 * Return the element IDs belonging to a diagram or the entire store.
 */
export function projectIds(store: NormalizedSysmlStore, diagramId?: string): string[] {
  if (diagramId && store.diagramPresentations.has(diagramId)) {
    return [...(store.diagramPresentations.get(diagramId)?.elementIds ?? [])];
  }
  return Array.from(store.indexes.byId.keys());
}

function formatMultiplicityText(m?: Multiplicity): string {
  if (!m) return '1';
  if (m.lower === m.upper) return String(m.lower);
  return `${m.lower}..${m.upper === Infinity ? '*' : m.upper}`;
}

interface EntityProjectionCache {
  blocks: Map<string, { entity: SysmlEntity; coords?: PresentationCoordinates; result: BlockData }>;
  parts: Map<string, { entity: SysmlUsage; coords?: PresentationCoordinates; result: PartData }>;
  relationships: Map<string, { entity: SysmlRelationship; result: RelationshipData }>;
  connectors: Map<string, { entity: ConnectorUsage; result: ConnectorData }>;
}

const entityProjectionCaches = new WeakMap<NormalizedSysmlStore, EntityProjectionCache>();

function getEntityProjectionCache(store: NormalizedSysmlStore): EntityProjectionCache {
  let cache = entityProjectionCaches.get(store);
  if (!cache) {
    cache = {
      blocks: new Map(),
      parts: new Map(),
      relationships: new Map(),
      connectors: new Map(),
    };
    entityProjectionCaches.set(store, cache);
  }
  return cache;
}

/**
 * Project a diagram from the normalized store.
 * When a diagramId is given, only queries elements relevant to that diagram without scanning unrelated model entities.
 * Reuses stable object references for unedited entities across projections.
 */
export function projectNormalizedDiagram(
  store: NormalizedSysmlStore,
  diagramId?: string,
): LegacySysmlView {
  const blocks: BlockData[] = [];
  const parts: PartData[] = [];
  const relationships: RelationshipData[] = [];
  const connectors: ConnectorData[] = [];

  const entityCache = getEntityProjectionCache(store);

  const visibleFilter = diagramId && store.diagramPresentations.has(diagramId)
    ? new Set(store.diagramPresentations.get(diagramId)!.elementIds)
    : null;
  const isVisible = (id: string) => visibleFilter === null || visibleFilter.has(id);

  // Helper to project a definition
  const projectDef = (def: SysmlDefinition) => {
    const coords = store.coordinates.get(def.id);
    const cached = entityCache.blocks.get(def.id);
    if (cached && cached.entity === def && cached.coords === coords) {
      blocks.push(cached.result);
      return;
    }

    let result: BlockData;
    if (def.kind === 'block') {
      const b = def as BlockDefinition;
      const legacyPorts: PortData[] = (b.ports ?? []).map(p => ({
        id: p.id,
        name: p.name,
        direction: p.direction,
        type: p.typeId,
        kind: p.kind === 'proxy' ? ('proxy' as const) : ('standard' as const),
        isConjugated: p.isConjugated,
        multiplicity: formatMultiplicityText(p.multiplicity),
      }));

      result = {
        id: b.id,
        name: b.name,
        stereotype: 'block',
        isAbstract: b.isAbstract,
        isLeaf: b.isLeaf,
        x: coords?.x ?? 0,
        y: coords?.y ?? 0,
        width: coords?.width ?? 160,
        height: coords?.height ?? 100,
        properties: (b.properties ?? []).map(prop => ({
          id: prop.id,
          name: prop.name,
          kind: prop.kind,
          type: prop.typeId,
          typeId: prop.typeId,
          multiplicity: formatMultiplicityText(prop.multiplicity),
          unit: (prop as any).unit,
          dimension: (prop as any).dimension,
          isDerived: prop.isDerived,
          redefinesId: prop.redefinesId,
          subsetsId: prop.subsetsId,
        })),
        operations: b.operations ?? [],
        constraints: b.constraints ?? [],
        classes: [],
        ports: legacyPorts,
      };
    } else {
      result = {
        id: def.id,
        name: def.name,
        stereotype: def.kind as 'valueType' | 'interface',
        x: coords?.x ?? 0,
        y: coords?.y ?? 0,
        width: coords?.width ?? 140,
        height: coords?.height ?? 80,
        properties: [],
        operations: [],
        constraints: [],
        classes: [],
        ports: [],
      };
    }
    entityCache.blocks.set(def.id, { entity: def, coords, result });
    blocks.push(result);
  };

  const projectReq = (req: RequirementDefinition) => {
    const coords = store.coordinates.get(req.id);
    const cached = entityCache.blocks.get(req.id);
    if (cached && cached.entity === req && cached.coords === coords) {
      blocks.push(cached.result);
      return;
    }

    const result: BlockData = {
      id: req.id,
      name: req.name,
      stereotype: 'requirement',
      reqId: req.requirementId,
      description: req.text,
      status: req.status,
      priority: req.priority,
      risk: req.risk,
      assignedTo: req.owner,
      source: req.source,
      rationale: req.rationale,
      version: req.version,
      baselineId: req.baselineId,
      x: coords?.x ?? 0,
      y: coords?.y ?? 0,
      width: coords?.width ?? 180,
      height: coords?.height ?? 90,
      properties: [],
      operations: [],
      constraints: [],
      classes: [],
      ports: [],
    };
    entityCache.blocks.set(req.id, { entity: req, coords, result });
    blocks.push(result);
  };

  const projectVc = (vc: VerificationCase) => {
    const coords = store.coordinates.get(vc.id);
    const cached = entityCache.blocks.get(vc.id);
    if (cached && cached.entity === vc && cached.coords === coords) {
      blocks.push(cached.result);
      return;
    }

    const result: BlockData = {
      id: vc.id,
      name: vc.name,
      stereotype: 'verificationCase',
      verificationMethod: vc.method,
      x: coords?.x ?? 0,
      y: coords?.y ?? 0,
      width: coords?.width ?? 160,
      height: coords?.height ?? 80,
      properties: [],
      operations: [],
      constraints: [],
      classes: [],
      ports: [],
    };
    entityCache.blocks.set(vc.id, { entity: vc, coords, result });
    blocks.push(result);
  };

  const projectPart = (usage: SysmlUsage) => {
    if (usage.kind === 'part') {
      const pUsage = usage as PartUsage;
      const coords = store.coordinates.get(pUsage.id);
      const cached = entityCache.parts.get(pUsage.id);
      if (cached && cached.entity === pUsage && cached.coords === coords) {
        parts.push(cached.result);
        return;
      }

      const result: PartData = {
        id: pUsage.id,
        name: pUsage.name,
        blockId: pUsage.ownerId,
        parentBlockId: pUsage.ownerId,
        typeId: pUsage.typeId,
        typeBlockId: pUsage.typeId,
        multiplicity: formatMultiplicityText(pUsage.multiplicity),
        x: coords?.x ?? 0,
        y: coords?.y ?? 0,
        width: coords?.width ?? 150,
        height: coords?.height ?? 100,
      };
      entityCache.parts.set(pUsage.id, { entity: pUsage, coords, result });
      parts.push(result);
    }
  };

  const projectConn = (conn: ConnectorUsage) => {
    if (!isVisible(conn.id)) {
      const sp = conn.sourcePortId.split('::')[0];
      const tp = conn.targetPortId.split('::')[0];
      if (!isVisible(sp) || !isVisible(tp)) return;
    }

    const cached = entityCache.connectors.get(conn.id);
    if (cached && cached.entity === conn) {
      connectors.push(cached.result);
      return;
    }

    const parseEndpoint = (portUsageId: string) => {
      if (portUsageId.includes('::')) {
        const [partId, portId] = portUsageId.split('::');
        return { partId, portId };
      }
      return { partId: conn.ownerId, portId: portUsageId };
    };
    const src = parseEndpoint(conn.sourcePortId);
    const tgt = parseEndpoint(conn.targetPortId);

    const result: ConnectorData = {
      id: conn.id,
      kind: conn.kind,
      sourcePartId: src.partId,
      targetPartId: tgt.partId,
      sourcePortId: src.portId,
      targetPortId: tgt.portId,
      itemFlow: conn.itemFlowId,
    };
    entityCache.connectors.set(conn.id, { entity: conn, result });
    connectors.push(result);
  };

  const projectRel = (rel: SysmlRelationship) => {
    if (!isVisible(rel.id)) {
      if (!isVisible(rel.sourceId) || !isVisible(rel.targetId)) return;
    }

    const cached = entityCache.relationships.get(rel.id);
    if (cached && cached.entity === rel) {
      relationships.push(cached.result);
      return;
    }

    let legacyType: RelationshipData['type'] = 'trace';
    if (rel.kind === 'deriveReqt') legacyType = 'derive';
    else if (rel.kind === 'sharedAggregation') legacyType = 'aggregation';
    else if (
      rel.kind === 'association' ||
      rel.kind === 'composition' ||
      rel.kind === 'generalization' ||
      rel.kind === 'dependency' ||
      rel.kind === 'allocation' ||
      rel.kind === 'satisfy' ||
      rel.kind === 'verify' ||
      rel.kind === 'refine' ||
      rel.kind === 'trace' ||
      rel.kind === 'copy' ||
      rel.kind === 'requirementContainment'
    ) {
      legacyType = rel.kind;
    }

    const result: RelationshipData = {
      id: rel.id,
      sourceId: rel.sourceId,
      targetId: rel.targetId,
      type: legacyType,
      label: (rel as any).name ?? '',
      sourceMultiplicity: rel.sourceMultiplicity ? formatMultiplicityText(rel.sourceMultiplicity) : undefined,
      targetMultiplicity: rel.targetMultiplicity ? formatMultiplicityText(rel.targetMultiplicity) : undefined,
    };
    entityCache.relationships.set(rel.id, { entity: rel, result });
    relationships.push(result);
  };

  if (visibleFilter) {
    const seenRels = new Set<string>();
    const seenConns = new Set<string>();

    // DIAGRAM-SCOPED FAST PATH: Only project elements in the diagram!
    for (const elemId of visibleFilter) {
      const meta = store.indexes.byId.get(elemId);
      if (!meta) continue;
      switch (meta.collection) {
        case 'definitions': {
          const def = store.definitions.get(elemId);
          if (def) projectDef(def);
          break;
        }
        case 'requirements': {
          const req = store.requirements.get(elemId);
          if (req) projectReq(req);
          break;
        }
        case 'verificationCases': {
          const vc = store.verificationCases.get(elemId);
          if (vc) projectVc(vc);
          break;
        }
        case 'usages': {
          const usage = store.usages.get(elemId);
          if (usage) projectPart(usage);
          break;
        }
        case 'connectors': {
          if (!seenConns.has(elemId)) {
            seenConns.add(elemId);
            const conn = store.connectors.get(elemId);
            if (conn) projectConn(conn);
          }
          break;
        }
        case 'relationships': {
          if (!seenRels.has(elemId)) {
            seenRels.add(elemId);
            const rel = store.relationships.get(elemId);
            if (rel) projectRel(rel);
          }
          break;
        }
      }
    }

    // Also project any relationships and connectors whose endpoints are both in the diagram
    for (const elemId of visibleFilter) {
      const outRels = store.indexes.sourceId.get(elemId);
      if (outRels) {
        for (const relId of outRels) {
          if (!seenRels.has(relId)) {
            const rel = store.relationships.get(relId);
            if (rel && visibleFilter.has(rel.targetId)) {
              seenRels.add(relId);
              projectRel(rel);
            }
          }
        }
      }
      const outConns = store.indexes.ownerId.get(elemId);
      if (outConns) {
        for (const connId of outConns) {
          if (!seenConns.has(connId)) {
            seenConns.add(connId);
            const conn = store.connectors.get(connId);
            if (conn) projectConn(conn);
          }
        }
      }
    }
  } else {
    // FULL MODEL PATH
    for (const def of store.definitions.values()) projectDef(def);
    for (const req of store.requirements.values()) projectReq(req);
    for (const vc of store.verificationCases.values()) projectVc(vc);
    for (const usage of store.usages.values()) projectPart(usage);
    for (const conn of store.connectors.values()) projectConn(conn);
    for (const rel of store.relationships.values()) projectRel(rel);
  }

  return { blocks, relationships, parts, connectors };
}

const legacyViewCache = new WeakMap<
  NormalizedSysmlStore,
  Map<string, { revision: number; view: LegacySysmlView }>
>();

/**
 * Get a cached legacy diagram projection keyed by store revision and diagramId.
 * Guarantees O(1) performance when no changes have occurred.
 */
export function getCachedLegacyView(
  store: NormalizedSysmlStore,
  diagramId?: string,
): LegacySysmlView {
  let storeCache = legacyViewCache.get(store);
  if (!storeCache) {
    storeCache = new Map();
    legacyViewCache.set(store, storeCache);
  }
  const key = diagramId ?? '__full__';
  const entry = storeCache.get(key);
  if (entry && entry.revision === store.revision) {
    return entry.view;
  }
  const view = projectNormalizedDiagram(store, diagramId);
  storeCache.set(key, { revision: store.revision, view });
  return view;
}

/**
 * Clear legacy view and entity projection caches.
 */
export function clearLegacyViewCache(store?: NormalizedSysmlStore): void {
  if (store) {
    legacyViewCache.delete(store);
    entityProjectionCaches.delete(store);
  }
}

/**
 * Select an entity by ID with O(1) performance.
 */
export function selectEntityById<T extends SysmlEntity = SysmlEntity>(
  store: NormalizedSysmlStore,
  id: string,
): T | undefined {
  return getById(store, id) as T | undefined;
}

/**
 * Select a block definition by ID.
 */
export function selectBlockById(
  store: NormalizedSysmlStore,
  id: string,
): BlockDefinition | undefined {
  const def = store.definitions.get(id);
  return def && def.kind === 'block' ? (def as BlockDefinition) : undefined;
}

/**
 * Select a definition by ID.
 */
export function selectDefinitionById(
  store: NormalizedSysmlStore,
  id: string,
): SysmlDefinition | undefined {
  return store.definitions.get(id);
}

/**
 * Select a requirement definition by ID.
 */
export function selectRequirementById(
  store: NormalizedSysmlStore,
  id: string,
): RequirementDefinition | undefined {
  return store.requirements.get(id);
}

/**
 * Select all usages owned by a parent element using secondary indexes.
 */
export function selectUsagesByOwner(
  store: NormalizedSysmlStore,
  ownerId: string,
): SysmlUsage[] {
  const ids = idsByIndex(store, 'ownerId', ownerId);
  const result: SysmlUsage[] = [];
  for (const id of ids) {
    const u = store.usages.get(id);
    if (u) result.push(u);
  }
  return result;
}

/**
 * Select all connectors owned by a parent element using secondary indexes.
 */
export function selectConnectorsByOwner(
  store: NormalizedSysmlStore,
  ownerId: string,
): ConnectorUsage[] {
  const ids = idsByIndex(store, 'ownerId', ownerId);
  const result: ConnectorUsage[] = [];
  for (const id of ids) {
    const c = store.connectors.get(id);
    if (c) result.push(c);
  }
  return result;
}

/**
 * Select all relationships where the element is source or target using secondary indexes.
 */
export function selectRelationshipsByEndpoint(
  store: NormalizedSysmlStore,
  endpointId: string,
): SysmlRelationship[] {
  const sourceIds = idsByIndex(store, 'sourceId', endpointId);
  const targetIds = idsByIndex(store, 'targetId', endpointId);
  const seen = new Set<string>();
  const result: SysmlRelationship[] = [];
  for (const id of sourceIds) {
    seen.add(id);
    const r = store.relationships.get(id);
    if (r) result.push(r);
  }
  for (const id of targetIds) {
    if (!seen.has(id)) {
      const r = store.relationships.get(id);
      if (r) result.push(r);
    }
  }
  return result;
}

/**
 * Select evidence records linked to a requirement using secondary indexes.
 */
export function selectEvidenceForRequirement(
  store: NormalizedSysmlStore,
  requirementId: string,
): VerificationEvidence[] {
  const ids = idsByIndex(store, 'requirementId', requirementId);
  const result: VerificationEvidence[] = [];
  for (const id of ids) {
    const e = store.evidence.get(id);
    if (e) result.push(e);
  }
  return result;
}

/**
 * Select suspect links for an entity or across the entire store.
 */
export function selectSuspectLinks(
  store: NormalizedSysmlStore,
  entityId?: string,
): SysmlRelationship[] {
  if (entityId) {
    return selectRelationshipsByEndpoint(store, entityId).filter(r => r.suspect);
  }
  const result: SysmlRelationship[] = [];
  for (const r of store.relationships.values()) {
    if (r.suspect) result.push(r);
  }
  return result;
}

/**
 * Select visible element IDs for a diagram or all IDs if no diagram specified.
 */
export function selectVisibleElementIds(
  store: NormalizedSysmlStore,
  diagramId?: string,
): ReadonlySet<string> {
  if (diagramId && store.diagramPresentations.has(diagramId)) {
    return new Set(store.diagramPresentations.get(diagramId)!.elementIds);
  }
  return new Set(store.indexes.byId.keys());
}

/**
 * Select the active diagram's element IDs as an array.
 */
export function selectActiveDiagramElementIds(
  store: NormalizedSysmlStore,
  diagramId?: string,
): string[] {
  return projectIds(store, diagramId);
}

/**
 * Select visible blocks for a given set of IDs or active diagram.
 */
export function selectVisibleBlocks(
  store: NormalizedSysmlStore,
  visibleIds?: ReadonlySet<string> | Set<string> | string[],
  activeDiagramId?: string,
): BlockData[] {
  const view = getCachedLegacyView(store, activeDiagramId);
  if (!visibleIds) return view.blocks;
  const set = visibleIds instanceof Set ? visibleIds : new Set(visibleIds);
  return view.blocks.filter(b => set.has(b.id));
}

/**
 * Select visible parts for a given set of IDs or active diagram.
 */
export function selectVisibleParts(
  store: NormalizedSysmlStore,
  visibleIds?: ReadonlySet<string> | Set<string> | string[],
  activeDiagramId?: string,
): PartData[] {
  const view = getCachedLegacyView(store, activeDiagramId);
  if (!visibleIds) return view.parts;
  const set = visibleIds instanceof Set ? visibleIds : new Set(visibleIds);
  return view.parts.filter(p => set.has(p.id));
}

/**
 * Select relationships whose endpoints are in the given visible node IDs using indexed endpoint lookups.
 */
export function selectRelationshipsForVisibleNodes(
  store: NormalizedSysmlStore,
  visibleNodeIds?: ReadonlySet<string> | Set<string> | string[],
  activeDiagramId?: string,
): RelationshipData[] {
  if (visibleNodeIds) {
    const set = visibleNodeIds instanceof Set ? visibleNodeIds : new Set(visibleNodeIds);
    const rels: RelationshipData[] = [];
    const seenRels = new Set<string>();
    const entityCache = getEntityProjectionCache(store);

    for (const nodeId of set) {
      const sourceRels = store.indexes.sourceId.get(nodeId);
      if (sourceRels) {
        for (const relId of sourceRels) {
          if (!seenRels.has(relId)) {
            const rel = store.relationships.get(relId);
            if (rel && set.has(rel.targetId)) {
              seenRels.add(relId);
              const cached = entityCache.relationships.get(rel.id);
              if (cached && cached.entity === rel) {
                rels.push(cached.result);
              } else {
                let legacyType: RelationshipData['type'] = 'trace';
                if (rel.kind === 'deriveReqt') legacyType = 'derive';
                else if (rel.kind === 'sharedAggregation') legacyType = 'aggregation';
                else if (
                  rel.kind === 'association' ||
                  rel.kind === 'composition' ||
                  rel.kind === 'generalization' ||
                  rel.kind === 'dependency' ||
                  rel.kind === 'allocation' ||
                  rel.kind === 'satisfy' ||
                  rel.kind === 'verify' ||
                  rel.kind === 'refine' ||
                  rel.kind === 'trace' ||
                  rel.kind === 'copy' ||
                  rel.kind === 'requirementContainment'
                ) {
                  legacyType = rel.kind;
                }
                const result: RelationshipData = {
                  id: rel.id,
                  sourceId: rel.sourceId,
                  targetId: rel.targetId,
                  type: legacyType,
                  label: (rel as any).name ?? '',
                  sourceMultiplicity: rel.sourceMultiplicity ? formatMultiplicityText(rel.sourceMultiplicity) : undefined,
                  targetMultiplicity: rel.targetMultiplicity ? formatMultiplicityText(rel.targetMultiplicity) : undefined,
                };
                entityCache.relationships.set(rel.id, { entity: rel, result });
                rels.push(result);
              }
            }
          }
        }
      }
    }
    return rels;
  }
  const view = getCachedLegacyView(store, activeDiagramId);
  return view.relationships;
}

/**
 * Select connectors whose parts are in the given visible part IDs using owner/endpoint indexes.
 */
export function selectConnectorsForVisibleParts(
  store: NormalizedSysmlStore,
  visiblePartIds?: ReadonlySet<string> | Set<string> | string[],
  activeDiagramId?: string,
): ConnectorData[] {
  if (visiblePartIds) {
    const set = visiblePartIds instanceof Set ? visiblePartIds : new Set(visiblePartIds);
    const connectors: ConnectorData[] = [];
    const seenConns = new Set<string>();
    const entityCache = getEntityProjectionCache(store);

    const parseEndpoint = (portUsageId: string, ownerId: string) => {
      if (portUsageId.includes('::')) {
        const [partId, portId] = portUsageId.split('::');
        return { partId, portId };
      }
      return { partId: ownerId, portId: portUsageId };
    };

    for (const partId of set) {
      const ownerConns = store.indexes.ownerId.get(partId);
      if (ownerConns) {
        for (const connId of ownerConns) {
          if (!seenConns.has(connId)) {
            seenConns.add(connId);
            const conn = store.connectors.get(connId);
            if (conn) {
              const src = parseEndpoint(conn.sourcePortId, conn.ownerId);
              const tgt = parseEndpoint(conn.targetPortId, conn.ownerId);
              if (set.has(src.partId) && set.has(tgt.partId)) {
                const cached = entityCache.connectors.get(conn.id);
                if (cached && cached.entity === conn) {
                  connectors.push(cached.result);
                } else {
                  const result: ConnectorData = {
                    id: conn.id,
                    kind: conn.kind,
                    sourcePartId: src.partId,
                    targetPartId: tgt.partId,
                    sourcePortId: src.portId,
                    targetPortId: tgt.portId,
                    itemFlow: conn.itemFlowId,
                  };
                  entityCache.connectors.set(conn.id, { entity: conn, result });
                  connectors.push(result);
                }
              }
            }
          }
        }
      }
    }
    return connectors;
  }
  const view = getCachedLegacyView(store, activeDiagramId);
  return view.connectors;
}

/**
 * Targeted entity update in store. Replaces only the specified entity and updates indexes.
 */
export function targetedUpdateEntity<T extends SysmlEntity>(
  store: NormalizedSysmlStore,
  id: string,
  patch: Partial<T>,
): { success: boolean; entity?: T } {
  const existing = getById(store, id);
  if (!existing) return { success: false };
  const collection = getCollectionForId(store, id);
  if (!collection) return { success: false };
  const updated = { ...existing, ...patch } as T;
  upsertEntity(store, collection, updated);
  return { success: true, entity: updated };
}

/**
 * Targeted coordinate update in store.
 */
export function targetedUpdatePresentation(
  store: NormalizedSysmlStore,
  id: string,
  coords: PresentationCoordinates,
): void {
  const existing = store.coordinates.get(id) ?? {};
  store.coordinates.set(id, { ...existing, ...coords });
  store.revision += 1;
}

/**
 * Convert a NormalizedSysmlStore into a transferable WorkerStoreSnapshot.
 * Plain objects only, ensuring safe serialization across WebWorker postMessage boundaries.
 */
export function toWorkerSnapshot(
  store: NormalizedSysmlStore,
  targetDiagramId?: string,
  scopeOnlyToDiagram?: boolean
): WorkerStoreSnapshot {
  const activeDiagramElementIds = targetDiagramId
    ? store.diagramPresentations.get(targetDiagramId)?.elementIds ?? []
    : undefined;

  if (scopeOnlyToDiagram && targetDiagramId && activeDiagramElementIds && activeDiagramElementIds.length > 0) {
    const activeSet = new Set(activeDiagramElementIds);
    const defs: Record<string, SysmlDefinition> = {};
    const usages: Record<string, SysmlUsage> = {};
    const coords: Record<string, any> = {};

    for (const id of activeSet) {
      const def = store.definitions.get(id);
      if (def) defs[id] = def;
      const usage = store.usages.get(id);
      if (usage) usages[id] = usage;
      const c = store.coordinates.get(id);
      if (c) coords[id] = c;
    }

    const rels: Record<string, SysmlRelationship> = {};
    for (const [id, rel] of store.relationships.entries()) {
      if (activeSet.has(id) || (activeSet.has(rel.sourceId) && activeSet.has(rel.targetId))) {
        rels[id] = rel;
      }
    }

    const conns: Record<string, ConnectorUsage> = {};
    for (const [id, conn] of store.connectors.entries()) {
      if (activeSet.has(id) || activeSet.has(conn.ownerId) || activeSet.has(conn.sourcePortId) || activeSet.has(conn.targetPortId)) {
        conns[id] = conn;
      }
    }

    const reqs: Record<string, RequirementDefinition> = {};
    for (const id of activeSet) {
      const req = store.requirements.get(id);
      if (req) reqs[id] = req;
    }

    return {
      schemaVersion: 2,
      profileId: store.profileId,
      revision: store.revision,
      definitions: defs,
      usages,
      connectors: conns,
      relationships: rels,
      requirements: reqs,
      verificationCases: {},
      evidence: {},
      baselines: {},
      artifacts: {},
      auditTrail: [],
      coordinates: coords,
      diagramPresentations: {
        [targetDiagramId]: store.diagramPresentations.get(targetDiagramId)!,
      },
      activeDiagramId: targetDiagramId,
      activeDiagramElementIds,
    };
  }

  return {
    schemaVersion: 2,
    profileId: store.profileId,
    revision: store.revision,
    definitions: Object.fromEntries(store.definitions),
    usages: Object.fromEntries(store.usages),
    connectors: Object.fromEntries(store.connectors),
    relationships: Object.fromEntries(store.relationships),
    requirements: Object.fromEntries(store.requirements),
    verificationCases: Object.fromEntries(store.verificationCases),
    evidence: Object.fromEntries(store.evidence),
    baselines: Object.fromEntries(store.baselines),
    artifacts: Object.fromEntries(store.artifacts),
    auditTrail: [...store.auditTrail],
    coordinates: Object.fromEntries(store.coordinates),
    diagramPresentations: Object.fromEntries(store.diagramPresentations),
    activeDiagramId: targetDiagramId,
    activeDiagramElementIds,
  };
}

/**
 * Hydrate a NormalizedSysmlStore from a WorkerStoreSnapshot with schema and revision validation.
 */
export function fromWorkerSnapshot(snapshot: unknown): NormalizedSysmlStore {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new Error('Malformed worker snapshot: payload must be a non-null object');
  }

  const snap = snapshot as WorkerStoreSnapshot;
  if (snap.schemaVersion !== 2) {
    throw new Error(`Unsupported worker snapshot schemaVersion: ${snap.schemaVersion} (expected 2)`);
  }

  if (typeof snap.revision !== 'number' || isNaN(snap.revision)) {
    throw new Error(`Invalid worker snapshot revision: ${snap.revision}`);
  }

  const repo: SysmlRepository = {
    schemaVersion: snap.schemaVersion,
    profileId: snap.profileId ?? 'OMG-SysML-1.6-ADIA',
    revision: snap.revision,
    definitions: snap.definitions ?? {},
    usages: snap.usages ?? {},
    connectors: snap.connectors ?? {},
    relationships: snap.relationships ?? {},
    requirements: snap.requirements ?? {},
    verificationCases: snap.verificationCases ?? {},
    evidence: snap.evidence ?? {},
    baselines: snap.baselines ?? {},
    artifacts: snap.artifacts ?? {},
    auditTrail: snap.auditTrail ?? [],
  };

  return fromRepository(repo, snap.coordinates, snap.diagramPresentations);
}
