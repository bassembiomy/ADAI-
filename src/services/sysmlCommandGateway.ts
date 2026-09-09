import type {
  SysmlRepository,
  BlockDefinition,
  ValueTypeDefinition,
  InterfaceDefinition,
  PartUsage,
  PortUsage,
  ConnectorUsage,
  SysmlRelationship,
  RequirementDefinition,
  VerificationCase,
  VerificationEvidence,
  ModelBaseline,
  Multiplicity,
} from '../engine/sysml/model';
import { createEmptyRepository } from '../engine/sysml/model';
import {
  analyzeMutation,
  applyCommand,
  createHistory,
  undo as historyUndo,
  redo as historyRedo,
  type MutationImpact,
  type MutationHistory,
} from '../engine/sysml/mutations';
import { validateSysmlRepository, type SysmlDiagnostic } from '../engine/sysml/validation';
import { serializeRepository, loadRepository } from '../engine/sysml/persistence';
import { requiresDeletionConfirmation } from './sysmlTransactionAdapter';
import type { BlockData, ConnectorData, PartData, RelationshipData, PortData } from '../types/sysml_types';

export interface PresentationCoordinates {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface LegacySysmlView {
  blocks: BlockData[];
  relationships: RelationshipData[];
  parts: PartData[];
  connectors: ConnectorData[];
}

export type SysmlElement =
  | BlockDefinition
  | ValueTypeDefinition
  | InterfaceDefinition
  | PartUsage
  | PortUsage
  | ConnectorUsage
  | SysmlRelationship
  | RequirementDefinition
  | VerificationCase
  | VerificationEvidence
  | ModelBaseline;

export type SysmlEditorCommand =
  | { type: 'createElement'; element: SysmlElement; presentation?: PresentationCoordinates }
  | { type: 'updateElement'; elementId: string; patch: Record<string, unknown> }
  | { type: 'deleteElements'; elementIds: string[]; confirmedImpactHash?: string }
  | { type: 'undo' }
  | { type: 'redo' };

export interface SysmlGatewayState {
  repository: SysmlRepository;
  history: MutationHistory;
  coordinates: Record<string, PresentationCoordinates>;
}

export interface SysmlCommandResult {
  repository: SysmlRepository;
  view: LegacySysmlView;
  diagnostics: SysmlDiagnostic[];
  impact?: MutationImpact;
  committed: boolean;
  history: MutationHistory;
  coordinates: Record<string, PresentationCoordinates>;
}

export function createSysmlGatewayState(
  initialRepo?: SysmlRepository,
  initialCoordinates?: Record<string, PresentationCoordinates>,
): SysmlGatewayState {
  const repo = initialRepo ?? createEmptyRepository();
  return {
    repository: repo,
    history: createHistory(repo),
    coordinates: initialCoordinates ?? {},
  };
}

export function computeImpactHash(impact: MutationImpact): string {
  const key = JSON.stringify({
    req: [...impact.requestedElementIds].sort(),
    del: [...impact.deletedElementIds].sort(),
    unres: [...impact.unresolvedUsageIds].sort(),
    inval: [...impact.invalidatedEvidenceIds].sort(),
    affReq: [...impact.affectedRequirementIds].sort(),
    affBase: [...impact.affectedBaselineIds].sort(),
  });
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function formatMultiplicityText(m?: Multiplicity): string {
  if (!m) return '1';
  if (m.lower === m.upper) return String(m.lower);
  return `${m.lower}..${m.upper === Infinity ? '*' : m.upper}`;
}

export function projectLegacyDiagram(
  repository: SysmlRepository,
  coordinates: Record<string, PresentationCoordinates> = {},
): LegacySysmlView {
  const blocks: BlockData[] = [];
  const parts: PartData[] = [];
  const relationships: RelationshipData[] = [];
  const connectors: ConnectorData[] = [];

  // Project definitions (blocks, valueTypes, interfaces)
  for (const def of Object.values(repository.definitions)) {
    const coords = coordinates[def.id] ?? {};
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
  }

  // Project requirements
  for (const req of Object.values(repository.requirements)) {
    const coords = coordinates[req.id] ?? {};
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
  }

  // Project verification cases
  for (const vc of Object.values(repository.verificationCases)) {
    const coords = coordinates[vc.id] ?? {};
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
  }

  // Project usages as parts
  for (const usage of Object.values(repository.usages)) {
    if (usage.kind === 'part') {
      const coords = coordinates[usage.id] ?? {};
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
  }

  // Project connectors
  for (const conn of Object.values(repository.connectors)) {
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
  }

  // Project relationships
  for (const rel of Object.values(repository.relationships)) {
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
  }

  return { blocks, relationships, parts, connectors };
}

function storeElementInRepository(repo: SysmlRepository, element: SysmlElement): void {
  if ('kind' in element) {
    if (element.kind === 'block' || element.kind === 'valueType' || element.kind === 'interface') {
      repo.definitions[element.id] = element as BlockDefinition | ValueTypeDefinition | InterfaceDefinition;
      return;
    }
    if (element.kind === 'part' || element.kind === 'port') {
      repo.usages[element.id] = element as PartUsage | PortUsage;
      return;
    }
    if (element.kind === 'assembly' || element.kind === 'delegation' || element.kind === 'binding') {
      repo.connectors[element.id] = element as ConnectorUsage;
      return;
    }
    if (element.kind === 'requirement') {
      repo.requirements[element.id] = element as RequirementDefinition;
      return;
    }
    if (element.kind === 'verificationCase') {
      repo.verificationCases[element.id] = element as VerificationCase;
      return;
    }
  }
  if ('sourceId' in element && 'targetId' in element) {
    repo.relationships[element.id] = element as SysmlRelationship;
    return;
  }
  if ('verificationCaseId' in element && 'status' in element) {
    repo.evidence[element.id] = element as VerificationEvidence;
    return;
  }
  if ('protected' in element && 'contentHash' in element) {
    repo.baselines[element.id] = element as ModelBaseline;
    return;
  }
  if ('sourcePortId' in element && 'targetPortId' in element) {
    repo.connectors[element.id] = element as ConnectorUsage;
    return;
  }
  // Fallback to definitions
  repo.definitions[element.id] = element as any;
}

function findAndPatchElement(repo: SysmlRepository, elementId: string, patch: Record<string, unknown>): boolean {
  if (repo.definitions[elementId]) {
    repo.definitions[elementId] = { ...repo.definitions[elementId], ...patch } as any;
    return true;
  }
  if (repo.usages[elementId]) {
    repo.usages[elementId] = { ...repo.usages[elementId], ...patch } as any;
    return true;
  }
  if (repo.connectors[elementId]) {
    repo.connectors[elementId] = { ...repo.connectors[elementId], ...patch } as any;
    return true;
  }
  if (repo.relationships[elementId]) {
    repo.relationships[elementId] = { ...repo.relationships[elementId], ...patch } as any;
    return true;
  }
  if (repo.requirements[elementId]) {
    repo.requirements[elementId] = { ...repo.requirements[elementId], ...patch } as any;
    return true;
  }
  if (repo.verificationCases[elementId]) {
    repo.verificationCases[elementId] = { ...repo.verificationCases[elementId], ...patch } as any;
    return true;
  }
  if (repo.evidence[elementId]) {
    repo.evidence[elementId] = { ...repo.evidence[elementId], ...patch } as any;
    return true;
  }
  if (repo.baselines[elementId]) {
    repo.baselines[elementId] = { ...repo.baselines[elementId], ...patch } as any;
    return true;
  }
  return false;
}

export function executeSysmlCommand(
  state: SysmlGatewayState,
  command: SysmlEditorCommand,
): SysmlCommandResult {
  const coordinates = { ...state.coordinates };

  if (command.type === 'undo') {
    const nextHistory = historyUndo(state.history);
    const repo = nextHistory.present;
    const validation = validateSysmlRepository(repo);
    const view = projectLegacyDiagram(repo, coordinates);
    return {
      repository: repo,
      view,
      diagnostics: validation.diagnostics,
      committed: true,
      history: nextHistory,
      coordinates,
    };
  }

  if (command.type === 'redo') {
    const nextHistory = historyRedo(state.history);
    const repo = nextHistory.present;
    const validation = validateSysmlRepository(repo);
    const view = projectLegacyDiagram(repo, coordinates);
    return {
      repository: repo,
      view,
      diagnostics: validation.diagnostics,
      committed: true,
      history: nextHistory,
      coordinates,
    };
  }

  if (command.type === 'createElement') {
    const nextRepo: SysmlRepository = structuredClone(state.repository);
    nextRepo.revision += 1;
    storeElementInRepository(nextRepo, command.element);
    if (command.presentation) {
      coordinates[command.element.id] = { ...command.presentation };
    }
    nextRepo.auditTrail.push({
      id: `change-${nextRepo.revision}-${command.element.id}`,
      revision: nextRepo.revision,
      timestamp: new Date().toISOString(),
      command: 'createElement',
      elementIds: [command.element.id],
    });

    const nextHistory: MutationHistory = {
      past: [...state.history.past, structuredClone(state.repository)],
      present: structuredClone(nextRepo),
      future: [],
    };
    const validation = validateSysmlRepository(nextRepo);
    const view = projectLegacyDiagram(nextRepo, coordinates);

    return {
      repository: nextRepo,
      view,
      diagnostics: validation.diagnostics,
      committed: true,
      history: nextHistory,
      coordinates,
    };
  }

  if (command.type === 'updateElement') {
    const nextRepo: SysmlRepository = structuredClone(state.repository);
    const patched = findAndPatchElement(nextRepo, command.elementId, command.patch);
    if (!patched) {
      const view = projectLegacyDiagram(state.repository, coordinates);
      return {
        repository: state.repository,
        view,
        diagnostics: [{ code: 'ELEMENT_NOT_FOUND', severity: 'error', message: `Element ${command.elementId} not found` }],
        committed: false,
        history: state.history,
        coordinates,
      };
    }
    nextRepo.revision += 1;
    nextRepo.auditTrail.push({
      id: `change-${nextRepo.revision}-${command.elementId}`,
      revision: nextRepo.revision,
      timestamp: new Date().toISOString(),
      command: 'updateElement',
      elementIds: [command.elementId],
    });

    const nextHistory: MutationHistory = {
      past: [...state.history.past, structuredClone(state.repository)],
      present: structuredClone(nextRepo),
      future: [],
    };
    const validation = validateSysmlRepository(nextRepo);
    const view = projectLegacyDiagram(nextRepo, coordinates);

    return {
      repository: nextRepo,
      view,
      diagnostics: validation.diagnostics,
      committed: true,
      history: nextHistory,
      coordinates,
    };
  }

  if (command.type === 'deleteElements') {
    const impact = analyzeMutation(state.repository, { kind: 'deleteElements', elementIds: command.elementIds });
    const needsConfirmation = requiresDeletionConfirmation(impact);

    if (needsConfirmation) {
      const expectedHash = computeImpactHash(impact);
      if (command.confirmedImpactHash !== expectedHash) {
        const view = projectLegacyDiagram(state.repository, coordinates);
        return {
          repository: state.repository,
          view,
          diagnostics: [],
          impact,
          committed: false,
          history: state.history,
          coordinates,
        };
      }
    }

    const mutationResult = applyCommand(state.repository, { kind: 'deleteElements', elementIds: command.elementIds });
    const nextRepo = mutationResult.repository;

    for (const delId of impact.deletedElementIds) {
      delete coordinates[delId];
    }

    nextRepo.auditTrail.push({
      id: `change-${nextRepo.revision}-deletion`,
      revision: nextRepo.revision,
      timestamp: new Date().toISOString(),
      command: 'deleteElements',
      elementIds: impact.deletedElementIds,
    });

    const nextHistory: MutationHistory = {
      past: [...state.history.past, structuredClone(state.repository)],
      present: structuredClone(nextRepo),
      future: [],
    };
    const view = projectLegacyDiagram(nextRepo, coordinates);

    return {
      repository: nextRepo,
      view,
      diagnostics: mutationResult.validation.diagnostics,
      impact,
      committed: true,
      history: nextHistory,
      coordinates,
    };
  }

  const exhaustiveCheck: never = command;
  throw new Error(`Unhandled command: ${JSON.stringify(exhaustiveCheck)}`);
}

export function buildCanonicalSysmlProjectPayload(
  state: SysmlGatewayState,
  metadata: { version: string; projectName: string; [key: string]: unknown },
): Record<string, unknown> {
  const serializedRepo = serializeRepository(state.repository);
  return {
    ...metadata,
    sysmlRepository: serializedRepo,
    sysmlCoordinates: state.coordinates,
    timestamp: new Date().toISOString(),
  };
}

export function loadCanonicalSysmlProject(payload: Record<string, unknown>): {
  repository: SysmlRepository;
  view: LegacySysmlView;
  coordinates: Record<string, PresentationCoordinates>;
  valid: boolean;
  diagnostics: SysmlDiagnostic[];
} {
  const rawRepo = payload.sysmlRepository;
  if (!rawRepo) {
    // Fallback: migrate legacy payload
    const loadRes = loadRepository(payload);
    const coordinates = (payload.sysmlCoordinates as Record<string, PresentationCoordinates>) ?? {};
    const view = projectLegacyDiagram(loadRes.repository, coordinates);
    return {
      repository: loadRes.repository,
      view,
      coordinates,
      valid: loadRes.valid,
      diagnostics: loadRes.diagnostics,
    };
  }

  const loadRes = loadRepository(rawRepo);
  const coordinates = (payload.sysmlCoordinates as Record<string, PresentationCoordinates>) ?? {};
  const view = projectLegacyDiagram(loadRes.repository, coordinates);

  return {
    repository: loadRes.repository,
    view,
    coordinates,
    valid: loadRes.valid,
    diagnostics: loadRes.diagnostics,
  };
}
