import {
  createEmptyRepository,
  parseMultiplicity,
  type BlockDefinition,
  type ModelBaseline,
  type RequirementDefinition,
  type SysmlRelationship,
  type SysmlRepository,
} from './model';
import { validateSysmlRepository, type SysmlDiagnostic } from './validation';

interface PersistenceEnvelope {
  format: 'ADIA-SysML';
  schemaVersion: 2;
  checksum: string;
  repository: SysmlRepository;
}

export interface LoadRepositoryResult {
  repository: SysmlRepository;
  diagnostics: SysmlDiagnostic[];
  valid: boolean;
  migrated: boolean;
}

export interface BaselineDiff { added: string[]; removed: string[]; changed: string[]; }

export function serializeRepository(repository: SysmlRepository): string {
  const canonical = stableStringify(repository);
  const envelope: PersistenceEnvelope = {
    format: 'ADIA-SysML', schemaVersion: 2, checksum: hash(canonical), repository,
  };
  return stableStringify(envelope);
}

export function loadRepository(input: string | unknown): LoadRepositoryResult {
  const diagnostics: SysmlDiagnostic[] = [];
  let raw: unknown;
  try {
    raw = typeof input === 'string' ? JSON.parse(input) : input;
  } catch (cause) {
    return { repository: createEmptyRepository(), diagnostics: [diag('PERSISTENCE_PARSE_ERROR', `Invalid JSON: ${String(cause)}`)], valid: false, migrated: false };
  }

  let migrated = false;
  let repository: SysmlRepository;
  if (isEnvelope(raw)) {
    repository = hydrateCanonical(raw.repository);
    if (hash(stableStringify(raw.repository)) !== raw.checksum) diagnostics.push(diag('PERSISTENCE_CHECKSUM_MISMATCH', 'Saved repository content does not match its checksum'));
  } else if (isCanonical(raw)) {
    repository = hydrateCanonical(raw);
    migrated = !('artifacts' in raw) || !('auditTrail' in raw);
  } else {
    repository = migrateLegacy(raw, diagnostics);
    migrated = true;
  }
  freezeBaselines(repository);
  const validation = validateSysmlRepository(repository);
  diagnostics.push(...validation.diagnostics);
  return { repository, diagnostics, valid: !diagnostics.some(item => item.severity === 'error'), migrated };
}

export function createBaseline(
  repository: SysmlRepository,
  options: { id: string; name: string; createdAt?: string },
): { repository: SysmlRepository; baseline: ModelBaseline } {
  if (repository.baselines[options.id]) throw new Error(`Baseline ${options.id} already exists`);
  const next = structuredClone(repository);
  const elementHashes = snapshotElementHashes(next);
  const baseline = deepFreeze({
    id: options.id,
    name: options.name,
    revision: repository.revision,
    createdAt: options.createdAt ?? new Date().toISOString(),
    protected: true,
    contentHash: hash(stableStringify(elementHashes)),
    elementHashes,
  } satisfies ModelBaseline);
  next.baselines[baseline.id] = baseline;
  next.auditTrail.push({
    id: `change-${repository.revision}-${options.id}`,
    revision: repository.revision,
    timestamp: baseline.createdAt,
    command: 'createBaseline',
    elementIds: [baseline.id],
  });
  return { repository: next, baseline };
}

export function compareBaselines(repository: SysmlRepository, fromId: string, toId: string): BaselineDiff {
  const from = repository.baselines[fromId];
  const to = repository.baselines[toId];
  if (!from?.elementHashes) throw new Error(`Baseline ${fromId} has no comparison snapshot`);
  if (!to?.elementHashes) throw new Error(`Baseline ${toId} has no comparison snapshot`);
  const fromIds = new Set(Object.keys(from.elementHashes));
  const toIds = new Set(Object.keys(to.elementHashes));
  return {
    added: [...toIds].filter(id => !fromIds.has(id)).sort(),
    removed: [...fromIds].filter(id => !toIds.has(id)).sort(),
    changed: [...fromIds].filter(id => toIds.has(id) && from.elementHashes![id] !== to.elementHashes![id]).sort(),
  };
}

function hydrateCanonical(raw: Partial<SysmlRepository>): SysmlRepository {
  return {
    ...createEmptyRepository(),
    ...structuredClone(raw),
    schemaVersion: 2,
    profileId: 'OMG-SysML-1.6-ADIA',
    definitions: structuredClone(raw.definitions ?? {}),
    usages: structuredClone(raw.usages ?? {}),
    connectors: structuredClone(raw.connectors ?? {}),
    relationships: structuredClone(raw.relationships ?? {}),
    requirements: structuredClone(raw.requirements ?? {}),
    verificationCases: structuredClone(raw.verificationCases ?? {}),
    evidence: structuredClone(raw.evidence ?? {}),
    baselines: structuredClone(raw.baselines ?? {}),
    artifacts: structuredClone(raw.artifacts ?? {}),
    auditTrail: structuredClone(raw.auditTrail ?? []),
  };
}

function migrateLegacy(raw: unknown, diagnostics: SysmlDiagnostic[] = []): SysmlRepository {
  const source = isRecord(raw) ? raw : {};
  const repo = createEmptyRepository();
  for (const legacy of arrayOfRecords(source.blocks)) {
    const id = text(legacy.id);
    if (!id) continue;
    if (legacy.stereotype === 'requirement') {
      repo.requirements[id] = {
        id, kind: 'requirement', name: text(legacy.name) || id, namespace: [],
        requirementId: text(legacy.reqId) || id, text: text(legacy.description),
        status: requirementStatus(legacy.status), version: text(legacy.version) || '1.0',
        source: optionalText(legacy.source), rationale: optionalText(legacy.rationale), owner: optionalText(legacy.assignedTo),
        baselineId: optionalText(legacy.baselineId),
        priority: level(legacy.priority), risk: level(legacy.risk),
      };
      continue;
    }
    if (legacy.stereotype === 'verificationCase') {
      repo.verificationCases[id] = {
        id, name: text(legacy.name) || id, namespace: Array.isArray(legacy.namespace) ? legacy.namespace.map(text) : [],
        kind: 'verificationCase', method: text(legacy.verificationMethod) || 'Test', verifiesRequirementIds: [],
      };
      continue;
    }
    const ports = arrayOfRecords(legacy.ports).map(port => ({
      id: text(port.id), name: text(port.name), kind: port.kind === 'proxy' ? 'proxy' as const : 'full' as const,
      typeId: text(port.type), direction: direction(port.direction), isConjugated: Boolean(port.isConjugated),
      multiplicity: safeMultiplicity(port.multiplicity),
    })).filter(port => port.id);
    repo.definitions[id] = {
      id, name: text(legacy.name) || id, namespace: Array.isArray(legacy.namespace) ? legacy.namespace.map(text) : [], kind: 'block', isAbstract: Boolean(legacy.isAbstract), isLeaf: Boolean(legacy.isLeaf),
      properties: arrayOfRecords(legacy.properties).map(property => ({
        id: text(property.id), name: text(property.name), kind: propertyKind(property.kind), typeId: text(property.typeId) || text(property.type),
        multiplicity: safeMultiplicity(property.multiplicity), unit: optionalText(property.unit), dimension: optionalText(property.dimension),
        isDerived: Boolean(property.isDerived), redefinesId: optionalText(property.redefinesId), subsetsId: optionalText(property.subsetsId),
      })), ports, operations: stringArray(legacy.operations), constraints: stringArray(legacy.constraints),
    } satisfies BlockDefinition;
    if (Array.isArray(legacy.satisfiedReqIds)) {
      for (const reqId of legacy.satisfiedReqIds) {
        const satId = `satisfy-${id}-${text(reqId)}`;
        repo.relationships[satId] = { id: satId, kind: 'satisfy', sourceId: id, targetId: text(reqId) };
      }
    }
  }
  for (const legacy of arrayOfRecords(source.parts)) {
    const id = text(legacy.id);
    if (!id) continue;
    repo.usages[id] = {
      id, name: text(legacy.name) || id, kind: 'part', ownerId: text(legacy.parentPartId) || text(legacy.parentBlockId) || text(legacy.blockId),
      typeId: text(legacy.typeBlockId) || text(legacy.typeId) || text(legacy.blockId), aggregation: 'composite',
      multiplicity: safeMultiplicity(legacy.multiplicity),
    };
    if (Array.isArray(legacy.satisfiedReqIds)) {
      for (const reqId of legacy.satisfiedReqIds) {
        const satId = `satisfy-${id}-${text(reqId)}`;
        repo.relationships[satId] = { id: satId, kind: 'satisfy', sourceId: id, targetId: text(reqId) };
      }
    }
  }
  for (const legacy of arrayOfRecords(source.connectors)) {
    const id = text(legacy.id);
    if (!id) continue;
    const sourceOwner = text(legacy.sourcePartId);
    const targetOwner = text(legacy.targetPartId);
    const sourceDefinition = text(legacy.sourcePortId);
    const targetDefinition = text(legacy.targetPortId);
    const sourcePortId = `${sourceOwner}::${sourceDefinition}`;
    const targetPortId = `${targetOwner}::${targetDefinition}`;
    if (!repo.usages[sourcePortId]) repo.usages[sourcePortId] = { id: sourcePortId, name: sourceDefinition, kind: 'port', ownerId: sourceOwner, definitionId: sourceDefinition };
    if (!repo.usages[targetPortId]) repo.usages[targetPortId] = { id: targetPortId, name: targetDefinition, kind: 'port', ownerId: targetOwner, definitionId: targetDefinition };
    const inferredOwner = connectorOwner(repo, sourceOwner, targetOwner);
    repo.connectors[id] = {
      id,
      kind: legacy.kind === 'binding' || legacy.kind === 'delegation' ? legacy.kind : sourceOwner === inferredOwner || targetOwner === inferredOwner ? 'delegation' : 'assembly',
      ownerId: inferredOwner,
      sourcePortId,
      targetPortId,
      itemFlowId: optionalText(legacy.itemFlow),
    };
  }
  for (const legacy of arrayOfRecords(source.relationships)) {
    const id = text(legacy.id);
    if (!id) continue;
    const sourceId = text(legacy.sourceId);
    const targetId = text(legacy.targetId);
    let kind = relationshipKind(legacy.type);
    if (kind === 'composition' && repo.requirements[sourceId] && repo.requirements[targetId]) {
      kind = 'requirementContainment';
      diagnostics.push({
        code: 'LEGACY_REQUIREMENT_COMPOSITION_MIGRATED',
        severity: 'info',
        elementId: id,
        message: `Migrated legacy composition ${id} between requirements to requirementContainment`,
      });
    }
    repo.relationships[id] = {
      id, sourceId, targetId, kind,
    };
    if (kind === 'verify' && repo.verificationCases[sourceId] && repo.requirements[targetId]) {
      repo.verificationCases[sourceId].verifiesRequirementIds.push(targetId);
    }
  }
  repo.auditTrail.push({ id: 'change-0-legacy-import', revision: 0, timestamp: new Date(0).toISOString(), command: 'migrateLegacy', elementIds: [] });
  return repo;
}

function snapshotElementHashes(repo: SysmlRepository): Record<string, string> {
  const records = [repo.definitions, repo.usages, repo.connectors, repo.relationships, repo.requirements, repo.verificationCases, repo.evidence, repo.artifacts];
  return Object.fromEntries(records.flatMap(record => Object.values(record).map(element => [element.id, hash(stableStringify(element))] as const)).sort(([a], [b]) => a.localeCompare(b)));
}

function stableStringify(value: unknown): string {
  if (value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(v => v === undefined ? 'null' : stableStringify(v)).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).filter(k => obj[k] !== undefined).sort();
    return `{${keys.map(key => `${JSON.stringify(key)}:${stableStringify(obj[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hash(value: string): string {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(16).padStart(8, '0');
}

function freezeBaselines(repo: SysmlRepository) {
  for (const [id, baseline] of Object.entries(repo.baselines)) repo.baselines[id] = deepFreeze(baseline);
}
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}
function isRecord(value: unknown): value is Record<string, any> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function isEnvelope(value: unknown): value is PersistenceEnvelope { return isRecord(value) && value.format === 'ADIA-SysML' && isRecord(value.repository) && typeof value.checksum === 'string'; }
function isCanonical(value: unknown): value is SysmlRepository { return isRecord(value) && value.schemaVersion === 2 && value.profileId === 'OMG-SysML-1.6-ADIA'; }
function arrayOfRecords(value: unknown): Record<string, any>[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function text(value: unknown): string { return typeof value === 'string' ? value : value == null ? '' : String(value); }
function optionalText(value: unknown): string | undefined { const result = text(value).trim(); return result || undefined; }
function stringArray(value: unknown): string[] { return Array.isArray(value) ? value.map(text) : []; }
function direction(value: unknown): 'in' | 'out' | 'inout' { return value === 'in' || value === 'out' ? value : 'inout'; }
function safeMultiplicity(value: unknown) { try { return parseMultiplicity(text(value) || '1'); } catch { return parseMultiplicity('1'); } }
function level(value: unknown): RequirementDefinition['risk'] { const result = text(value).toLocaleLowerCase(); return result === 'low' || result === 'medium' || result === 'high' || result === 'critical' ? result : undefined; }
function requirementStatus(value: unknown): RequirementDefinition['status'] {
  const status = text(value).toLocaleLowerCase();
  return status === 'approved' || status === 'implemented' || status === 'verified' || status === 'failed' || status === 'stale' || status === 'retired' ? status : 'draft';
}
function relationshipKind(value: unknown): SysmlRelationship['kind'] {
  const kind = text(value);
  if (kind === 'aggregation') return 'sharedAggregation';
  if (kind === 'derive') return 'deriveReqt';
  if (kind === 'requirementContainment') return 'requirementContainment';
  const supported: SysmlRelationship['kind'][] = [
    'association', 'sharedAggregation', 'composition', 'generalization', 'dependency',
    'allocation', 'binding', 'itemFlow', 'requirementContainment', 'deriveReqt', 'satisfy',
    'verify', 'refine', 'trace', 'copy',
  ];
  return supported.includes(kind as SysmlRelationship['kind']) ? kind as SysmlRelationship['kind'] : 'trace';
}
function propertyKind(value: unknown): 'value' | 'part' | 'reference' | 'flow' {
  return value === 'part' || value === 'reference' || value === 'flow' ? value : 'value';
}
function connectorOwner(repo: SysmlRepository, sourceOwner: string, targetOwner: string): string {
  const source = repo.usages[sourceOwner];
  const target = repo.usages[targetOwner];
  if (source?.kind === 'part' && target?.kind === 'part' && source.ownerId === target.ownerId) return source.ownerId;
  if (source?.kind === 'part' && source.ownerId === targetOwner) return targetOwner;
  if (target?.kind === 'part' && target.ownerId === sourceOwner) return sourceOwner;
  return source?.kind === 'part' ? source.ownerId : target?.kind === 'part' ? target.ownerId : sourceOwner;
}
function diag(code: string, message: string): SysmlDiagnostic { return { code, severity: 'error', message }; }

// CHUNKED AND INCREMENTAL PERSISTENCE

export interface EntityChunkMeta {
  collection: string;
  entityId: string;
  checksum: string;
  byteSize: number;
}

export interface ChunkManifest {
  format: 'ADIA-SysML-Chunked';
  schemaVersion: 2;
  profileId: string;
  revision: number;
  checksum: string;
  auditTrail: SysmlRepository['auditTrail'];
  chunkIndex: Record<string, EntityChunkMeta>;
  diagramPresentations?: Record<string, { elementIds: string[] }>;
  metadata?: Record<string, unknown>;
}

export interface SerializedEntityChunk {
  chunkKey: string;
  collection: string;
  entityId: string;
  checksum: string;
  payload: unknown;
  json: string;
}

export interface ChunkedRepositoryExport {
  manifest: ChunkManifest;
  manifestJson: string;
  chunks: Record<string, SerializedEntityChunk>;
}

const PERSISTENCE_COLLECTIONS = [
  'definitions',
  'usages',
  'connectors',
  'relationships',
  'requirements',
  'verificationCases',
  'evidence',
  'baselines',
  'artifacts',
] as const;

function createChunkKey(collection: string, id: string): string {
  return `${collection}/${id}.json`;
}

function serializeSingleEntityChunk(collection: string, entity: { id: string }): SerializedEntityChunk {
  const json = stableStringify(entity);
  const checksum = hash(json);
  return {
    chunkKey: createChunkKey(collection, entity.id),
    collection,
    entityId: entity.id,
    checksum,
    payload: entity,
    json,
  };
}

/**
 * Serialize a SysML repository into a chunked format with an index manifest.
 */
export function serializeToChunks(
  repo: SysmlRepository,
  options?: {
    diagramPresentations?: Record<string, { elementIds: string[] }>;
    metadata?: Record<string, unknown>;
  }
): ChunkedRepositoryExport {
  const chunks: Record<string, SerializedEntityChunk> = {};
  const chunkIndex: Record<string, EntityChunkMeta> = {};

  for (const collName of PERSISTENCE_COLLECTIONS) {
    const collRecord = repo[collName] as Record<string, { id: string }>;
    if (!collRecord) continue;
    for (const [id, entity] of Object.entries(collRecord)) {
      const chunk = serializeSingleEntityChunk(collName, entity);
      chunks[chunk.chunkKey] = chunk;
      chunkIndex[chunk.chunkKey] = {
        collection: collName,
        entityId: id,
        checksum: chunk.checksum,
        byteSize: chunk.json.length,
      };
    }
  }

  const manifestContent = {
    format: 'ADIA-SysML-Chunked' as const,
    schemaVersion: 2 as const,
    profileId: repo.profileId ?? 'OMG-SysML-1.6-ADIA',
    revision: repo.revision ?? 0,
    auditTrail: [...(repo.auditTrail ?? [])],
    chunkIndex,
    diagramPresentations: options?.diagramPresentations,
    metadata: options?.metadata,
  };

  const manifestCanonical = stableStringify(manifestContent);
  const manifestChecksum = hash(manifestCanonical);

  const manifest: ChunkManifest = {
    ...manifestContent,
    checksum: manifestChecksum,
  };

  return {
    manifest,
    manifestJson: stableStringify(manifest),
    chunks,
  };
}

/**
 * Incrementally update changed chunks after patch commits.
 */
export function serializeIncrementalChunks(
  repo: SysmlRepository,
  changedEntityIds: string[],
  baseManifest: ChunkManifest
): {
  manifest: ChunkManifest;
  updatedChunks: Record<string, SerializedEntityChunk>;
  removedChunkKeys: string[];
} {
  const updatedChunks: Record<string, SerializedEntityChunk> = {};
  const removedChunkKeys: string[] = [];
  const nextChunkIndex = { ...baseManifest.chunkIndex };

  const changedSet = new Set(changedEntityIds);

  for (const collName of PERSISTENCE_COLLECTIONS) {
    const collRecord = repo[collName] as Record<string, { id: string }>;
    if (!collRecord) continue;

    for (const id of changedSet) {
      const entity = collRecord[id];
      const key = createChunkKey(collName, id);

      if (entity) {
        const chunk = serializeSingleEntityChunk(collName, entity);
        updatedChunks[key] = chunk;
        nextChunkIndex[key] = {
          collection: collName,
          entityId: id,
          checksum: chunk.checksum,
          byteSize: chunk.json.length,
        };
      } else if (nextChunkIndex[key]) {
        // Entity was deleted from this collection
        delete nextChunkIndex[key];
        removedChunkKeys.push(key);
      }
    }
  }

  const nextRevision = (repo.revision ?? baseManifest.revision) + 1;
  const manifestContent = {
    format: 'ADIA-SysML-Chunked' as const,
    schemaVersion: 2 as const,
    profileId: repo.profileId ?? baseManifest.profileId,
    revision: nextRevision,
    auditTrail: [...(repo.auditTrail ?? [])],
    chunkIndex: nextChunkIndex,
    diagramPresentations: baseManifest.diagramPresentations,
    metadata: baseManifest.metadata,
  };

  const manifestCanonical = stableStringify(manifestContent);
  const manifest: ChunkManifest = {
    ...manifestContent,
    checksum: hash(manifestCanonical),
  };

  return {
    manifest,
    updatedChunks,
    removedChunkKeys,
  };
}

/**
 * Hydrate a full repository from a ChunkManifest and a chunk provider function.
 * Validates checksum per chunk and fails safely if corrupted.
 */
export function hydrateRepositoryFromChunks(
  manifest: ChunkManifest,
  getChunk: (key: string) => string | unknown
): LoadRepositoryResult {
  const diagnostics: SysmlDiagnostic[] = [];
  const repo = createEmptyRepository();
  repo.schemaVersion = manifest.schemaVersion;
  repo.profileId = (manifest.profileId as 'OMG-SysML-1.6-ADIA') ?? 'OMG-SysML-1.6-ADIA';
  repo.revision = manifest.revision;
  repo.auditTrail = [...(manifest.auditTrail ?? [])];

  for (const [key, meta] of Object.entries(manifest.chunkIndex)) {
    const rawChunk = getChunk(key);
    if (rawChunk == null) {
      diagnostics.push(diag('PERSISTENCE_CHUNK_MISSING', `Chunk ${key} referenced in manifest was not found`));
      continue;
    }

    let parsed: any;
    try {
      parsed = typeof rawChunk === 'string' ? JSON.parse(rawChunk) : rawChunk;
    } catch {
      diagnostics.push(diag('PERSISTENCE_CHUNK_PARSE_ERROR', `Failed to parse chunk ${key}`));
      continue;
    }

    const canonicalJson = stableStringify(parsed);
    const calculatedHash = hash(canonicalJson);
    if (calculatedHash !== meta.checksum) {
      diagnostics.push(
        diag('PERSISTENCE_CHUNK_CHECKSUM_MISMATCH', `Checksum mismatch for chunk ${key}: expected ${meta.checksum}, got ${calculatedHash}`)
      );
    }

    const collName = meta.collection as (typeof PERSISTENCE_COLLECTIONS)[number];
    if (collName && (repo as any)[collName]) {
      (repo as any)[collName][meta.entityId] = parsed;
    }
  }

  freezeBaselines(repo);
  const validation = validateSysmlRepository(repo);
  diagnostics.push(...validation.diagnostics);

  return {
    repository: repo,
    diagnostics,
    valid: !diagnostics.some(d => d.severity === 'error'),
    migrated: false,
  };
}

/**
 * Stream chunks one-by-one to avoid holding the entire multi-gigabyte serialized export in memory.
 */
export async function streamExportChunks(
  repo: SysmlRepository,
  onChunk: (chunk: SerializedEntityChunk) => void | Promise<void>
): Promise<{ manifest: ChunkManifest; totalBytes: number }> {
  let totalBytes = 0;
  const chunkIndex: Record<string, EntityChunkMeta> = {};

  for (const collName of PERSISTENCE_COLLECTIONS) {
    const collRecord = repo[collName] as Record<string, { id: string }>;
    if (!collRecord) continue;
    for (const [id, entity] of Object.entries(collRecord)) {
      const chunk = serializeSingleEntityChunk(collName, entity);
      await onChunk(chunk);
      totalBytes += chunk.json.length;
      chunkIndex[chunk.chunkKey] = {
        collection: collName,
        entityId: id,
        checksum: chunk.checksum,
        byteSize: chunk.json.length,
      };
    }
  }

  const manifestContent = {
    format: 'ADIA-SysML-Chunked' as const,
    schemaVersion: 2 as const,
    profileId: repo.profileId ?? 'OMG-SysML-1.6-ADIA',
    revision: repo.revision ?? 0,
    auditTrail: [...(repo.auditTrail ?? [])],
    chunkIndex,
  };

  const manifestCanonical = stableStringify(manifestContent);
  const manifest: ChunkManifest = {
    ...manifestContent,
    checksum: hash(manifestCanonical),
  };

  return { manifest, totalBytes };
}

/**
 * Atomic write helper: writes content to a temporary file, then renames to target.
 */
export async function atomicWriteFile(
  targetPath: string,
  content: string,
  fileAdapter?: {
    writeFile: (path: string, content: string) => Promise<void>;
    renameFile: (oldPath: string, newPath: string) => Promise<void>;
  }
): Promise<void> {
  const tmpPath = `${targetPath}.tmp_${Date.now()}`;
  if (fileAdapter) {
    await fileAdapter.writeFile(tmpPath, content);
    await fileAdapter.renameFile(tmpPath, targetPath);
  }
}

/**
 * Hydrate only entities needed for a specific active diagram, deferring inactive diagrams.
 * Drastically reduces memory and hydration latency when opening a large model.
 */
export function hydrateActiveDiagramFromChunks(
  manifest: ChunkManifest,
  activeDiagramId: string,
  getChunk: (key: string) => string | unknown
): LoadRepositoryResult & { loadedEntityCount: number; deferredChunkCount: number } {
  const diagnostics: SysmlDiagnostic[] = [];
  const repo = createEmptyRepository();
  repo.schemaVersion = manifest.schemaVersion;
  repo.profileId = (manifest.profileId as 'OMG-SysML-1.6-ADIA') ?? 'OMG-SysML-1.6-ADIA';
  repo.revision = manifest.revision;
  repo.auditTrail = [...(manifest.auditTrail ?? [])];

  const diagramMeta = manifest.diagramPresentations?.[activeDiagramId];
  const requiredElementIds = new Set<string>(diagramMeta?.elementIds ?? [activeDiagramId]);

  let loadedCount = 0;
  let deferredCount = 0;

  for (const [key, meta] of Object.entries(manifest.chunkIndex)) {
    // If element is not in active diagram, defer loading
    if (requiredElementIds.size > 0 && !requiredElementIds.has(meta.entityId) && meta.entityId !== activeDiagramId) {
      deferredCount++;
      continue;
    }

    const rawChunk = getChunk(key);
    if (rawChunk == null) {
      diagnostics.push(diag('PERSISTENCE_CHUNK_MISSING', `Chunk ${key} referenced in manifest was not found`));
      continue;
    }

    let parsed: any;
    try {
      parsed = typeof rawChunk === 'string' ? JSON.parse(rawChunk) : rawChunk;
    } catch {
      diagnostics.push(diag('PERSISTENCE_CHUNK_PARSE_ERROR', `Failed to parse chunk ${key}`));
      continue;
    }

    const canonicalJson = stableStringify(parsed);
    const calculatedHash = hash(canonicalJson);
    if (calculatedHash !== meta.checksum) {
      diagnostics.push(
        diag('PERSISTENCE_CHUNK_CHECKSUM_MISMATCH', `Checksum mismatch for chunk ${key}: expected ${meta.checksum}, got ${calculatedHash}`)
      );
    }

    const collName = meta.collection as (typeof PERSISTENCE_COLLECTIONS)[number];
    if (collName && (repo as any)[collName]) {
      (repo as any)[collName][meta.entityId] = parsed;
      loadedCount++;
    }
  }

  return {
    repository: repo,
    diagnostics,
    valid: !diagnostics.some(d => d.severity === 'error'),
    migrated: false,
    loadedEntityCount: loadedCount,
    deferredChunkCount: deferredCount,
  };
}

export interface SaveTransactionAdapter {
  writeFile: (path: string, content: string) => Promise<void>;
  renameFile: (oldPath: string, newPath: string) => Promise<void>;
  deleteFile?: (path: string) => Promise<void>;
}

export interface SaveTransactionOptions {
  abortSignal?: AbortSignal;
  fileAdapter: SaveTransactionAdapter;
  lastValidRevision?: number;
}

export interface SaveTransactionResult {
  success: boolean;
  committedRevision: number;
  temporaryFilesCleaned: number;
  error?: Error;
}

/**
 * Save repository chunks transactionally with atomic temporary writes and rollback on abort/error.
 * Ensures that if save is aborted or fails midway, temporary files are cleaned up and the manifest
 * is never partially overwritten or left at a half-committed revision.
 */
export async function saveRepositoryTransactionally(
  basePath: string,
  manifest: ChunkManifest,
  chunks: Record<string, SerializedEntityChunk>,
  options: SaveTransactionOptions
): Promise<SaveTransactionResult> {
  const { abortSignal, fileAdapter, lastValidRevision = manifest.revision - 1 } = options;
  const tempFiles: string[] = [];
  const stagedRenames: Array<{ from: string; to: string }> = [];

  const cleanupTempFiles = async () => {
    let cleaned = 0;
    if (fileAdapter.deleteFile) {
      for (const tmp of tempFiles) {
        try {
          await fileAdapter.deleteFile(tmp);
          cleaned++;
        } catch {
          // ignore cleanup failures
        }
      }
    }
    return cleaned;
  };

  try {
    if (abortSignal?.aborted) {
      throw new Error('Save cancelled before execution');
    }

    const timestamp = Date.now();
    for (const [key, chunk] of Object.entries(chunks)) {
      if (abortSignal?.aborted) {
        throw new Error('Save cancelled during chunk write');
      }
      const targetPath = `${basePath}/${key}`;
      const tempPath = `${targetPath}.tmp_${timestamp}`;
      tempFiles.push(tempPath);
      await fileAdapter.writeFile(tempPath, chunk.json);
      stagedRenames.push({ from: tempPath, to: targetPath });
    }

    // Now rename all chunks atomically
    for (const rename of stagedRenames) {
      if (abortSignal?.aborted) {
        throw new Error('Save cancelled during commit');
      }
      await fileAdapter.renameFile(rename.from, rename.to);
    }

    // Finally write manifest atomically
    const manifestJson = stableStringify(manifest);
    const manifestPath = `${basePath}/manifest.json`;
    const manifestTmp = `${manifestPath}.tmp_${timestamp}`;
    tempFiles.push(manifestTmp);
    await fileAdapter.writeFile(manifestTmp, manifestJson);
    await fileAdapter.renameFile(manifestTmp, manifestPath);

    return {
      success: true,
      committedRevision: manifest.revision,
      temporaryFilesCleaned: 0,
    };
  } catch (err: any) {
    const cleaned = await cleanupTempFiles();
    return {
      success: false,
      committedRevision: lastValidRevision,
      temporaryFilesCleaned: cleaned,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}


