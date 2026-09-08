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
    repository = migrateLegacy(raw);
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

function migrateLegacy(raw: unknown): SysmlRepository {
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
  }
  for (const legacy of arrayOfRecords(source.parts)) {
    const id = text(legacy.id);
    if (!id) continue;
    repo.usages[id] = {
      id, name: text(legacy.name) || id, kind: 'part', ownerId: text(legacy.parentPartId) || text(legacy.parentBlockId) || text(legacy.blockId),
      typeId: text(legacy.typeBlockId) || text(legacy.typeId) || text(legacy.blockId), aggregation: 'composite',
      multiplicity: safeMultiplicity(legacy.multiplicity),
    };
  }
  for (const legacy of arrayOfRecords(source.relationships)) {
    const id = text(legacy.id);
    if (!id) continue;
    repo.relationships[id] = {
      id, sourceId: text(legacy.sourceId), targetId: text(legacy.targetId), kind: relationshipKind(legacy.type),
    };
    if (relationshipKind(legacy.type) === 'verify' && repo.verificationCases[text(legacy.sourceId)] && repo.requirements[text(legacy.targetId)]) {
      repo.verificationCases[text(legacy.sourceId)].verifiesRequirementIds.push(text(legacy.targetId));
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
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>).sort().map(key => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`).join(',')}}`;
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
  const supported: SysmlRelationship['kind'][] = ['association', 'sharedAggregation', 'composition', 'generalization', 'dependency', 'allocation', 'binding', 'itemFlow', 'deriveReqt', 'satisfy', 'verify', 'refine', 'trace', 'copy'];
  return supported.includes(kind as SysmlRelationship['kind']) ? kind as SysmlRelationship['kind'] : 'trace';
}
function propertyKind(value: unknown): 'value' | 'part' | 'reference' | 'flow' {
  return value === 'part' || value === 'reference' || value === 'flow' ? value : 'value';
}
function diag(code: string, message: string): SysmlDiagnostic { return { code, severity: 'error', message }; }
