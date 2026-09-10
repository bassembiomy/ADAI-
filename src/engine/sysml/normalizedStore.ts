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
 */
export function toRepository(store: NormalizedSysmlStore): SysmlRepository {
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

/**
 * Project a diagram from the normalized store.
 * When a diagramId is given, only queries elements relevant to that diagram without scanning unrelated model entities.
 */
export function projectNormalizedDiagram(
  store: NormalizedSysmlStore,
  diagramId?: string,
): LegacySysmlView {
  const blocks: BlockData[] = [];
  const parts: PartData[] = [];
  const relationships: RelationshipData[] = [];
  const connectors: ConnectorData[] = [];

  const visibleFilter = diagramId && store.diagramPresentations.has(diagramId)
    ? new Set(store.diagramPresentations.get(diagramId)!.elementIds)
    : null;
  const isVisible = (id: string) => visibleFilter === null || visibleFilter.has(id);

  // Helper to project a definition
  const projectDef = (def: SysmlDefinition) => {
    const coords = store.coordinates.get(def.id) ?? {};
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

      blocks.push({
        id: b.id,
        name: b.name,
        stereotype: 'block',
        isAbstract: b.isAbstract,
        isLeaf: b.isLeaf,
        x: coords.x ?? 0,
        y: coords.y ?? 0,
        width: coords.width ?? 160,
        height: coords.height ?? 100,
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
      });
    } else {
      blocks.push({
        id: def.id,
        name: def.name,
        stereotype: def.kind as 'valueType' | 'interface',
        x: coords.x ?? 0,
        y: coords.y ?? 0,
        width: coords.width ?? 140,
        height: coords.height ?? 80,
        properties: [],
        operations: [],
        constraints: [],
        classes: [],
        ports: [],
      });
    }
  };

  const projectReq = (req: RequirementDefinition) => {
    const coords = store.coordinates.get(req.id) ?? {};
    blocks.push({
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
      x: coords.x ?? 0,
      y: coords.y ?? 0,
      width: coords.width ?? 180,
      height: coords.height ?? 90,
      properties: [],
      operations: [],
      constraints: [],
      classes: [],
      ports: [],
    });
  };

  const projectVc = (vc: VerificationCase) => {
    const coords = store.coordinates.get(vc.id) ?? {};
    blocks.push({
      id: vc.id,
      name: vc.name,
      stereotype: 'verificationCase',
      verificationMethod: vc.method,
      x: coords.x ?? 0,
      y: coords.y ?? 0,
      width: coords.width ?? 160,
      height: coords.height ?? 80,
      properties: [],
      operations: [],
      constraints: [],
      classes: [],
      ports: [],
    });
  };

  const projectPart = (usage: SysmlUsage) => {
    if (usage.kind === 'part') {
      const coords = store.coordinates.get(usage.id) ?? {};
      parts.push({
        id: usage.id,
        name: usage.name,
        blockId: usage.ownerId,
        parentBlockId: usage.ownerId,
        typeId: usage.typeId,
        typeBlockId: usage.typeId,
        multiplicity: formatMultiplicityText(usage.multiplicity),
        x: coords.x ?? 0,
        y: coords.y ?? 0,
        width: coords.width ?? 150,
        height: coords.height ?? 100,
      });
    }
  };

  const projectConn = (conn: ConnectorUsage) => {
    if (!isVisible(conn.id)) {
      const sp = conn.sourcePortId.split('::')[0];
      const tp = conn.targetPortId.split('::')[0];
      if (!isVisible(sp) || !isVisible(tp)) return;
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

    connectors.push({
      id: conn.id,
      kind: conn.kind,
      sourcePartId: src.partId,
      targetPartId: tgt.partId,
      sourcePortId: src.portId,
      targetPortId: tgt.portId,
      itemFlow: conn.itemFlowId,
    });
  };

  const projectRel = (rel: SysmlRelationship) => {
    if (!isVisible(rel.id)) {
      if (!isVisible(rel.sourceId) || !isVisible(rel.targetId)) return;
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

    relationships.push({
      id: rel.id,
      sourceId: rel.sourceId,
      targetId: rel.targetId,
      type: legacyType,
      label: (rel as any).name ?? '',
      sourceMultiplicity: rel.sourceMultiplicity ? formatMultiplicityText(rel.sourceMultiplicity) : undefined,
      targetMultiplicity: rel.targetMultiplicity ? formatMultiplicityText(rel.targetMultiplicity) : undefined,
    });
  };

  if (visibleFilter) {
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
          const conn = store.connectors.get(elemId);
          if (conn) projectConn(conn);
          break;
        }
        case 'relationships': {
          const rel = store.relationships.get(elemId);
          if (rel) projectRel(rel);
          break;
        }
      }
    }

    // Also project any relationships and connectors whose endpoints are both in the diagram
    // by using our secondary indexes!
    for (const elemId of visibleFilter) {
      const outRels = store.indexes.sourceId.get(elemId);
      if (outRels) {
        for (const relId of outRels) {
          if (!visibleFilter.has(relId)) {
            const rel = store.relationships.get(relId);
            if (rel && visibleFilter.has(rel.targetId)) {
              projectRel(rel);
            }
          }
        }
      }
      const outConns = store.indexes.ownerId.get(elemId);
      if (outConns) {
        for (const connId of outConns) {
          if (!visibleFilter.has(connId)) {
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
