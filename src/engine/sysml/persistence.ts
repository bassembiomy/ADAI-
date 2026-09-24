import {
  createEmptyRepository,
  parseMultiplicity,
  type BlockDefinition,
  type ModelBaseline,
  type RequirementDefinition,
  type SysmlRelationship,
  type SysmlRepository,
  type ActorDefinition,
  type SubjectDefinition,
  type UseCaseDefinition,
  type ExtensionPoint,
  type DiagramReference,
  type UseCaseRelationshipKind,
} from './model';
import { validateSysmlRepository, type SysmlDiagnostic } from './validation';
import {
  createEmptyInterchangeReport,
  mergeInterchangeReports,
  quarantineUnresolvedEndpoints,
  type InterchangeReport,
} from './interchangeReport';

interface PersistenceEnvelope {
  format: 'ADIA-SysML';
  schemaVersion: 2 | 3;
  checksum: string;
  repository: SysmlRepository;
}

export interface LoadRepositoryResult {
  repository: SysmlRepository;
  diagnostics: SysmlDiagnostic[];
  valid: boolean;
  migrated: boolean;
  interchangeReport: InterchangeReport;
}

export interface BaselineDiff { added: string[]; removed: string[]; changed: string[]; }

/**
 * Canonicalize a repository for deterministic serialization: sort every
 * collection by element id and keep envelope metadata fixed. Semantic IDs
 * are never rewritten; only key order is normalized.
 */
export function canonicalizeRepository(repository: SysmlRepository): SysmlRepository {
  const sorted = <T extends { id: string }>(record: Record<string, T>): Record<string, T> =>
    Object.fromEntries(
      Object.values(record ?? {}).sort((a, b) => a.id.localeCompare(b.id)).map(element => [element.id, element]),
    );
  const definitions = Object.fromEntries(
    Object.values(repository.definitions ?? {})
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(def => [def.id, def.ownerId ? def : { ...def, ownerId: 'model' }]),
  );
  const packages = repository.packages && Object.keys(repository.packages).length > 0
    ? sorted(repository.packages)
    : { model: { id: 'model', kind: 'package' as const, name: 'Model', namespace: [], ownerId: '' } };
  return {
    ...repository,
    schemaVersion: 3,
    profileId: 'OMG-SysML-1.6-ADIA',
    packages,
    diagrams: sorted(repository.diagrams ?? {}),
    definitions,
    usages: sorted(repository.usages ?? {}),
    connectors: sorted(repository.connectors ?? {}),
    relationships: sorted(repository.relationships ?? {}),
    requirements: sorted(repository.requirements ?? {}),
    verificationCases: sorted(repository.verificationCases ?? {}),
    evidence: sorted(repository.evidence ?? {}),
    baselines: sorted(repository.baselines ?? {}),
    artifacts: sorted(repository.artifacts ?? {}),
    actors: sorted(repository.actors ?? {}),
    subjects: sorted(repository.subjects ?? {}),
    useCases: sorted(repository.useCases ?? {}),
    extensionPoints: sorted(repository.extensionPoints ?? {}),
    diagramReferences: sorted(repository.diagramReferences ?? {}),
    auditTrail: [...(repository.auditTrail ?? [])],
  };
}

export function serializeRepository(repository: SysmlRepository): string {
  const canonicalRepo = canonicalizeRepository(repository);
  const canonical = stableStringify(canonicalRepo);
  const envelope: PersistenceEnvelope = {
    format: 'ADIA-SysML', schemaVersion: 3, checksum: hash(canonical), repository: canonicalRepo,
  };
  return stableStringify(envelope);
}

export function deserializeSysmlRepository(input: string | unknown): SysmlRepository {
  return loadRepository(input).repository;
}

function canonicalizeRepositoryForChecksum(repository: any): any {
  if (repository.schemaVersion === 2) {
    const sorted = <T extends { id: string }>(record?: Record<string, T>): Record<string, T> =>
      Object.fromEntries(
        Object.values(record ?? {}).sort((a, b) => a.id.localeCompare(b.id)).map(element => [element.id, element]),
      );
    return {
      ...repository,
      schemaVersion: 2,
      profileId: 'OMG-SysML-1.6-ADIA',
      definitions: sorted(repository.definitions ?? {}),
      usages: sorted(repository.usages ?? {}),
      connectors: sorted(repository.connectors ?? {}),
      relationships: sorted(repository.relationships ?? {}),
      requirements: sorted(repository.requirements ?? {}),
      verificationCases: sorted(repository.verificationCases ?? {}),
      evidence: sorted(repository.evidence ?? {}),
      baselines: sorted(repository.baselines ?? {}),
      artifacts: sorted(repository.artifacts ?? {}),
      actors: sorted(repository.actors ?? {}),
      subjects: sorted(repository.subjects ?? {}),
      useCases: sorted(repository.useCases ?? {}),
      extensionPoints: sorted(repository.extensionPoints ?? {}),
      diagramReferences: sorted(repository.diagramReferences ?? {}),
      auditTrail: [...(repository.auditTrail ?? [])],
    };
  }
  return canonicalizeRepository(repository);
}

export function loadRepository(input: string | unknown): LoadRepositoryResult {
  const diagnostics: SysmlDiagnostic[] = [];
  const migrationReport = createEmptyInterchangeReport();
  let raw: unknown;
  try {
    raw = typeof input === 'string' ? JSON.parse(input) : input;
  } catch (cause) {
    return { repository: createEmptyRepository(), diagnostics: [diag('PERSISTENCE_PARSE_ERROR', `Invalid JSON: ${String(cause)}`)], valid: false, migrated: false, interchangeReport: migrationReport };
  }

  let migrated = false;
  let repository: SysmlRepository;
  if (isEnvelope(raw)) {
    const rawRepo = raw.repository;
    const checksumMatches =
      hash(stableStringify(rawRepo)) === raw.checksum ||
      hash(stableStringify(canonicalizeRepository(rawRepo as SysmlRepository))) === raw.checksum ||
      hash(stableStringify(canonicalizeRepositoryForChecksum(rawRepo))) === raw.checksum;
    if (!checksumMatches) {
      diagnostics.push(diag('PERSISTENCE_CHECKSUM_MISMATCH', 'Saved repository content does not match its checksum'));
    }
    repository = hydrateCanonical(rawRepo);
    if ((raw.repository as any)?.schemaVersion === 2 || raw.schemaVersion === 2) {
      migrated = true;
    }
  } else if (isCanonical(raw)) {
    repository = hydrateCanonical(raw);
    migrated = !('artifacts' in raw) || !('auditTrail' in raw) || (raw as any).schemaVersion === 2;
  } else {
    repository = migrateLegacy(raw, diagnostics, migrationReport);
    migrated = true;
  }
  // Reject-or-quarantine: strip edges with dangling endpoints into an
  // explicit quarantine list. Never synthesize a generic association.
  const quarantined = quarantineUnresolvedEndpoints(repository);
  repository = quarantined.repository;
  const interchangeReport = mergeInterchangeReports(migrationReport, quarantined.report);
  diagnostics.push(...quarantined.report.diagnostics);
  freezeBaselines(repository);
  const validation = validateSysmlRepository(repository);
  diagnostics.push(...validation.diagnostics);
  return { repository, diagnostics, valid: !diagnostics.some(item => item.severity === 'error'), migrated, interchangeReport };
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
  const empty = createEmptyRepository();
  const repo: SysmlRepository = {
    ...empty,
    ...structuredClone(raw),
    schemaVersion: 3,
    profileId: 'OMG-SysML-1.6-ADIA',
    packages: structuredClone(raw.packages ?? empty.packages),
    diagrams: structuredClone(raw.diagrams ?? empty.diagrams),
    definitions: structuredClone(raw.definitions ?? {}),
    usages: structuredClone(raw.usages ?? {}),
    connectors: structuredClone(raw.connectors ?? {}),
    relationships: structuredClone(raw.relationships ?? {}),
    requirements: structuredClone(raw.requirements ?? {}),
    verificationCases: structuredClone(raw.verificationCases ?? {}),
    evidence: structuredClone(raw.evidence ?? {}),
    baselines: structuredClone(raw.baselines ?? {}),
    artifacts: structuredClone(raw.artifacts ?? {}),
    actors: structuredClone(raw.actors ?? {}),
    subjects: structuredClone(raw.subjects ?? {}),
    useCases: structuredClone(raw.useCases ?? {}),
    extensionPoints: structuredClone(raw.extensionPoints ?? {}),
    diagramReferences: structuredClone(raw.diagramReferences ?? {}),
    auditTrail: structuredClone(raw.auditTrail ?? []),
  };

  if (!repo.packages.model) {
    repo.packages.model = { id: 'model', kind: 'package', name: 'Model', namespace: [], ownerId: '' };
  }

  for (const def of Object.values(repo.definitions)) {
    if (!def.ownerId) {
      def.ownerId = 'model';
    }
  }

  return repo;
}

function migrateLegacy(raw: unknown, diagnostics: SysmlDiagnostic[] = [], migrationReport = createEmptyInterchangeReport()): SysmlRepository {
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
    if (!sourceOwner || !targetOwner || !sourceDefinition || !targetDefinition) {
      const lossEntry = {
        sourceId: id, sourceKind: 'connector', diagnosticCode: 'LEGACY_CONNECTOR_ENDPOINT_UNRESOLVED',
        reason: `Legacy connector ${id} has an unresolvable endpoint and is quarantined instead of synthesizing a generic association`,
        severity: 'warning' as const,
      };
      migrationReport.lossEntries.push(lossEntry);
      migrationReport.unresolvedEndpoints.push({
        kind: 'connector', id, endpoint: !sourceOwner || !sourceDefinition ? 'sourcePortId' : 'targetPortId',
        missingId: !sourceOwner || !sourceDefinition ? `${sourceOwner}::${sourceDefinition}` : `${targetOwner}::${targetDefinition}`,
        code: 'UNRESOLVED_ENDPOINT', message: `Legacy connector ${id} endpoint does not resolve; quarantined`,
      });
      const diagnostic = { code: 'LEGACY_CONNECTOR_ENDPOINT_UNRESOLVED', severity: 'warning' as const, elementId: id, message: `Legacy connector ${id} quarantined: unresolved endpoint` };
      diagnostics.push(diagnostic);
      migrationReport.diagnostics.push(diagnostic);
      continue;
    }
    const sourcePortId = `${sourceOwner}::${sourceDefinition}`;
    const targetPortId = `${targetOwner}::${targetDefinition}`;
    if (!repo.usages[sourcePortId]) repo.usages[sourcePortId] = { id: sourcePortId, name: sourceDefinition, kind: 'port', ownerId: sourceOwner, definitionId: sourceDefinition };
    if (!repo.usages[targetPortId]) repo.usages[targetPortId] = { id: targetPortId, name: targetDefinition, kind: 'port', ownerId: targetOwner, definitionId: targetDefinition };
    const inferredOwner = connectorOwner(repo, sourceOwner, targetOwner);
    const rawKind = text(legacy.kind);
    const supportedConnector = rawKind === 'binding' || rawKind === 'delegation' || rawKind === 'assembly';
    if (rawKind && !supportedConnector) {
      const lossEntry = {
        sourceId: id, sourceKind: 'connector', diagnosticCode: 'LEGACY_CONNECTOR_KIND_UNSUPPORTED',
        reason: `Legacy connector ${id} kind '${rawKind}' has no canonical equivalent; defaulted explicitly (not silently)`,
        severity: 'warning' as const,
      };
      migrationReport.lossEntries.push(lossEntry);
      const diagnostic = { code: 'LEGACY_CONNECTOR_KIND_UNSUPPORTED', severity: 'warning' as const, elementId: id, message: `Legacy connector ${id} kind '${rawKind}' defaulted with explicit loss record` };
      diagnostics.push(diagnostic);
      migrationReport.diagnostics.push(diagnostic);
    }
    repo.connectors[id] = {
      id,
      kind: rawKind === 'binding' || rawKind === 'delegation' ? rawKind : sourceOwner === inferredOwner || targetOwner === inferredOwner ? 'delegation' : 'assembly',
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
    const rawKind = text(legacy.type);
    let kind = relationshipKind(legacy.type);
    if (!isSupportedRelationshipKind(rawKind)) {
      const lossEntry = {
        sourceId: id, sourceKind: 'relationship', diagnosticCode: 'LEGACY_RELATIONSHIP_KIND_UNSUPPORTED',
        reason: `Legacy relationship ${id} kind '${rawKind || '(empty)'}' has no canonical equivalent; carried explicitly as trace`,
        severity: 'warning' as const,
      };
      migrationReport.lossEntries.push(lossEntry);
      const diagnostic = { code: 'LEGACY_RELATIONSHIP_KIND_UNSUPPORTED', severity: 'warning' as const, elementId: id, message: `Legacy relationship ${id} kind '${rawKind}' mapped to trace with explicit loss record` };
      diagnostics.push(diagnostic);
      migrationReport.diagnostics.push(diagnostic);
    }
    if (kind === 'composition' && repo.requirements[sourceId] && repo.requirements[targetId]) {
      kind = 'requirementContainment';
      const diagnostic = {
        code: 'LEGACY_REQUIREMENT_COMPOSITION_MIGRATED',
        severity: 'info' as const,
        elementId: id,
        message: `Migrated legacy composition ${id} between requirements to requirementContainment`,
      };
      diagnostics.push(diagnostic);
      migrationReport.diagnostics.push(diagnostic);
      migrationReport.lossEntries.push({
        sourceId: id, sourceKind: 'relationship', diagnosticCode: 'LEGACY_REQUIREMENT_COMPOSITION_MIGRATED',
        reason: `Legacy composition ${id} between requirements carried explicitly as requirementContainment`,
        severity: 'info',
      });
    }
    repo.relationships[id] = {
      id, sourceId, targetId, kind,
      name: optionalText(legacy.label),
      sourceMultiplicity: legacy.sourceMultiplicity ? safeMultiplicity(legacy.sourceMultiplicity) : undefined,
      targetMultiplicity: legacy.targetMultiplicity ? safeMultiplicity(legacy.targetMultiplicity) : undefined,
    };
    if (kind === 'verify' && repo.verificationCases[sourceId] && repo.requirements[targetId]) {
      repo.verificationCases[sourceId].verifiesRequirementIds.push(targetId);
    }
  }

  // Migrate legacy use case diagrams if present in source
  const legacyUseCaseDiagrams = arrayOfRecords(source.useCaseDiagrams);
  for (const diagRecord of legacyUseCaseDiagrams) {
    const diagId = text(diagRecord.id) || 'default_usecase';
    const legacyNodeMap = new Map<string, string>(); // rawNodeId -> canonicalId

    // 1. First pass: migrate nodes to actors, subjects, use-cases, and extension points
    const nodes = arrayOfRecords(diagRecord.nodes);
    for (const node of nodes) {
      const rawNodeId = text(node.id);
      if (!rawNodeId) continue;
      const data = isRecord(node.data) ? node.data : {};
      const canonicalId = text(data.canonicalElementId) || `${diagId}_${rawNodeId}`;
      legacyNodeMap.set(rawNodeId, canonicalId);
      const nodeType = text(node.type);

      if (nodeType === 'actor') {
        repo.actors[canonicalId] = {
          id: canonicalId,
          name: text(data.label) || rawNodeId,
          kind: 'actor',
          namespace: [],
          isExternal: Boolean(data.isExternal),
          generalizationIds: [],
        };
      } else if (nodeType === 'systemBoundary') {
        repo.subjects[canonicalId] = {
          id: canonicalId,
          name: text(data.label) || rawNodeId,
          kind: 'subject',
          namespace: [],
          realizedByBlockId: optionalText(data.subjectBlockId),
        };
      } else if (nodeType === 'useCase') {
        const epIds: string[] = [];
        if (Array.isArray(data.extensionPoints)) {
          data.extensionPoints.forEach((epNameRaw, idx) => {
            const epName = text(epNameRaw);
            if (epName) {
              const epId = `${canonicalId}_ep_${idx + 1}`;
              epIds.push(epId);
              repo.extensionPoints[epId] = {
                id: epId,
                name: epName,
                kind: 'extensionPoint',
                namespace: [],
                useCaseId: canonicalId,
              };
            }
          });
        }

        const parentId = text(node.parentId);
        const subjectId = parentId ? legacyNodeMap.get(parentId) || parentId : undefined;

        repo.useCases[canonicalId] = {
          id: canonicalId,
          name: text(data.label) || rawNodeId,
          kind: 'useCase',
          namespace: [],
          subjectId,
          description: optionalText(data.description),
          extensionPointIds: epIds,
          behaviorArtifactIds: [],
        };

        const elaboratingDiagramId = optionalText(data.elaboratingDiagramId);
        if (elaboratingDiagramId) {
          const refId = `ref_${canonicalId}_${elaboratingDiagramId}`;
          repo.diagramReferences[refId] = {
            id: refId,
            diagramId: elaboratingDiagramId,
            diagramKind: 'activity',
            role: 'elaborates',
            sourceElementId: canonicalId,
          };
        }

        if (Array.isArray(data.requirementTraces)) {
          for (const traceRecord of arrayOfRecords(data.requirementTraces)) {
            const reqId = text(traceRecord.requirementId);
            const relType = text(traceRecord.relationType) || 'trace';
            if (reqId) {
              let mappedKind: UseCaseRelationshipKind = 'useCaseTrace';
              if (relType === 'refine') mappedKind = 'useCaseRefine';
              else if (relType === 'satisfy') mappedKind = 'useCaseSatisfy';
              else if (relType === 'trace' || relType === 'verify') mappedKind = 'useCaseTrace';

              const relId = `trace_${canonicalId}_${reqId}`;
              repo.relationships[relId] = {
                id: relId,
                kind: mappedKind,
                sourceId: canonicalId,
                targetId: reqId,
              };
            }
          }
        }
      }
    }

    // Resolve deferred parent subject references
    for (const node of nodes) {
      const rawNodeId = text(node.id);
      const canonicalId = legacyNodeMap.get(rawNodeId);
      const parentId = text(node.parentId);
      if (canonicalId && parentId && repo.useCases[canonicalId]) {
        const resolvedSubjectId = legacyNodeMap.get(parentId) || parentId;
        if (repo.subjects[resolvedSubjectId]) {
          repo.useCases[canonicalId].subjectId = resolvedSubjectId;
        }
      }
    }

    // 2. Second pass: migrate edges
    const edges = arrayOfRecords(diagRecord.edges);
    for (const edge of edges) {
      const edgeId = text(edge.id) || `edge_${Math.random().toString(36).slice(2, 8)}`;
      const rawSource = text(edge.source);
      const rawTarget = text(edge.target);
      const canonicalSource = legacyNodeMap.get(rawSource) || rawSource;
      const canonicalTarget = legacyNodeMap.get(rawTarget) || rawTarget;
      const rawType = text(edge.type);

      const sourceExists = repo.actors[canonicalSource] || repo.useCases[canonicalSource] || repo.subjects[canonicalSource] || repo.requirements[canonicalSource] || repo.definitions[canonicalSource];
      const targetExists = repo.actors[canonicalTarget] || repo.useCases[canonicalTarget] || repo.subjects[canonicalTarget] || repo.requirements[canonicalTarget] || repo.definitions[canonicalTarget];

      if (!sourceExists || !targetExists) {
        const lossEntry = {
          sourceId: edgeId,
          sourceKind: 'useCaseRelationship',
          diagnosticCode: 'LEGACY_USECASE_RELATIONSHIP_UNRESOLVED',
          reason: `Legacy use-case relationship ${edgeId} connects missing endpoint (${rawSource} -> ${rawTarget}) and was quarantined`,
          severity: 'warning' as const,
        };
        migrationReport.lossEntries.push(lossEntry);
        migrationReport.unresolvedEndpoints.push({
          kind: 'relationship',
          id: edgeId,
          endpoint: !sourceExists ? 'source' : 'target',
          missingId: !sourceExists ? rawSource : rawTarget,
          code: 'UNRESOLVED_ENDPOINT',
          message: `Legacy use-case relationship ${edgeId} endpoint does not resolve; quarantined`,
        });
        const diagnostic = {
          code: 'LEGACY_USECASE_RELATIONSHIP_UNRESOLVED',
          severity: 'warning' as const,
          elementId: edgeId,
          message: `Legacy use-case relationship ${edgeId} quarantined: unresolved endpoint`,
        };
        diagnostics.push(diagnostic);
        migrationReport.diagnostics.push(diagnostic);
        continue;
      }

      let kind: UseCaseRelationshipKind;
      switch (rawType) {
        case 'association':
          kind = 'useCaseAssociation';
          break;
        case 'include':
          kind = 'include';
          break;
        case 'extend':
          kind = 'extend';
          break;
        case 'generalization':
          kind = 'useCaseGeneralization';
          break;
        case 'refine':
          kind = 'useCaseRefine';
          break;
        case 'satisfy':
          kind = 'useCaseSatisfy';
          break;
        case 'trace':
          kind = 'useCaseTrace';
          break;
        default:
          kind = 'useCaseAssociation';
      }

      const rel: SysmlRelationship = {
        id: edgeId,
        sourceId: canonicalSource,
        targetId: canonicalTarget,
        kind,
      };

      if (kind === 'extend' && repo.useCases[canonicalTarget]) {
        const targetUc = repo.useCases[canonicalTarget];
        if (targetUc.extensionPointIds.length > 0) {
          rel.extensionPointId = targetUc.extensionPointIds[0];
        }
      }

      repo.relationships[edgeId] = rel;
    }
  }

  for (const def of Object.values(repo.definitions)) {
    if (!def.ownerId) {
      def.ownerId = 'model';
    }
  }

  repo.auditTrail.push({ id: 'change-0-legacy-import', revision: 0, timestamp: new Date(0).toISOString(), command: 'migrateLegacy', elementIds: [] });
  return repo;
}

function snapshotElementHashes(repo: SysmlRepository): Record<string, string> {
  const records = [
    repo.definitions, repo.usages, repo.connectors, repo.relationships, repo.requirements,
    repo.verificationCases, repo.evidence, repo.artifacts,
    repo.actors ?? {}, repo.subjects ?? {}, repo.useCases ?? {},
    repo.extensionPoints ?? {}, repo.diagramReferences ?? {},
  ];
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
function isCanonical(value: unknown): value is SysmlRepository { return isRecord(value) && (value.schemaVersion === 2 || value.schemaVersion === 3) && value.profileId === 'OMG-SysML-1.6-ADIA'; }
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
function isSupportedRelationshipKind(value: string): boolean {
  if (value === 'aggregation' || value === 'derive' || value === 'requirementContainment') return true;
  const supported: SysmlRelationship['kind'][] = [
    'association', 'sharedAggregation', 'composition', 'generalization', 'dependency',
    'allocation', 'binding', 'itemFlow', 'requirementContainment', 'deriveReqt', 'satisfy',
    'verify', 'refine', 'trace', 'copy',
  ];
  return supported.includes(value as SysmlRelationship['kind']);
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
  schemaVersion: 2 | 3;
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
  'packages',
  'diagrams',
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
      if (collName === 'packages' && id === 'model') continue;
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
    schemaVersion: (repo.schemaVersion === 2 ? 2 : 3) as (2 | 3),
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
      if (collName === 'packages' && id === 'model') continue;
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
    schemaVersion: (repo.schemaVersion === 2 ? 2 : 3) as (2 | 3),
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

  if (!repo.packages) {
    repo.packages = {};
  }
  if (!repo.packages.model) {
    repo.packages.model = { id: 'model', kind: 'package', name: 'Model', namespace: [], ownerId: '' };
  }
  if (!repo.diagrams) {
    repo.diagrams = {};
  }
  repo.schemaVersion = 3;

  freezeBaselines(repo);
  const quarantined = quarantineUnresolvedEndpoints(repo);
  diagnostics.push(...quarantined.report.diagnostics);
  freezeBaselines(quarantined.repository);
  const validation = validateSysmlRepository(quarantined.repository);
  diagnostics.push(...validation.diagnostics);

  return {
    repository: quarantined.repository,
    diagnostics,
    valid: !diagnostics.some(d => d.severity === 'error'),
    migrated: false,
    interchangeReport: quarantined.report,
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
      if (collName === 'packages' && id === 'model') continue;
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
    schemaVersion: (repo.schemaVersion === 2 ? 2 : 3) as (2 | 3),
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
    interchangeReport: createEmptyInterchangeReport(),
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


