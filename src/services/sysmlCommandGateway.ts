import type {
  SysmlRepository,
  SysmlDefinition,
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
  TraceArtifact,
  ActorDefinition,
  SubjectDefinition,
  UseCaseDefinition,
  ExtensionPoint,
  DiagramReference,
  Multiplicity,
  SysmlEntityCollection,
  SysmlEntity,
  PackageDefinition,
  ModelDiagramDefinition,
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
import {
  assessLegacyProjectionLoss,
  assessOpmInterchangeLoss,
  type InterchangeReport,
} from '../engine/sysml/interchangeReport';
import { projectSysmlToOpm } from '../engine/sysml/opmAdapter';
import { requiresDeletionConfirmation } from './sysmlTransactionAdapter';
import {
  classifyCanonicalDeletionTarget,
  validateCanonicalBlockDefinition,
  validateCanonicalBlockUpdate,
  validateCanonicalConnectorCandidate,
  validateCanonicalRelationshipCandidate,
} from './sysmlCreationRules';
import { policyDiagnosticsToSysml } from '../engine/sysml/policy';
import type { BlockData, ConnectorData, PartData, RelationshipData, PortData } from '../types/sysml_types';

export { resolveType, type ResolvedTypeOutcome, type TypeResolutionOptions } from '../engine/sysml/services/typeResolution';
export { isTypeNotFound, type TypeNotFoundResult, type CreateNewTypeAction, type TypeCandidate } from '../engine/sysml/commands/commandResult';
import {
  type NormalizedSysmlStore,
  fromRepository,
  toRepository,
  projectNormalizedDiagram,
  upsertEntity,
  removeEntity,
  getById as getEntityById,
  getCollectionForId,
  getCachedLegacyView,
  clearLegacyViewCache,
  selectEntityById,
  selectBlockById,
  selectDefinitionById,
  selectRequirementById,
  selectUsagesByOwner,
  selectConnectorsByOwner,
  selectRelationshipsByEndpoint,
  selectEvidenceForRequirement,
  selectSuspectLinks,
  selectVisibleElementIds,
  selectActiveDiagramElementIds,
  targetedUpdateEntity,
  targetedUpdatePresentation,
  selectVisibleBlocks,
  selectVisibleParts,
  selectRelationshipsForVisibleNodes,
  selectConnectorsForVisibleParts,
} from '../engine/sysml/normalizedStore';
import {
  type PatchHistoryState,
  type SysmlPatch,
  type HistoryBudgetOptions,
  createPatchHistory,
  pushPatch,
  undoPatch,
  redoPatch,
  createSysmlPatch,
} from '../engine/sysml/patches';

export {
  fromRepository,
  toRepository,
  getCachedLegacyView,
  clearLegacyViewCache,
  selectEntityById,
  selectBlockById,
  selectDefinitionById,
  selectRequirementById,
  selectUsagesByOwner,
  selectConnectorsByOwner,
  selectRelationshipsByEndpoint,
  selectEvidenceForRequirement,
  selectSuspectLinks,
  selectVisibleElementIds,
  selectActiveDiagramElementIds,
  selectVisibleBlocks,
  selectVisibleParts,
  selectRelationshipsForVisibleNodes,
  selectConnectorsForVisibleParts,
  targetedUpdateEntity,
  targetedUpdatePresentation,
};

import { SysmlWorkerClient } from './sysmlWorkerClient';
export { SysmlWorkerClient };
export * from '../engine/sysml/workerProtocol';
export {
  classifyDeletionTarget,
  classifyRelationship,
  resolveInheritance,
} from '../engine/sysml/policy';

let defaultWorkerClient: SysmlWorkerClient | null = null;
export function getDefaultSysmlWorkerClient(): SysmlWorkerClient {
  if (!defaultWorkerClient) {
    defaultWorkerClient = new SysmlWorkerClient();
  }
  return defaultWorkerClient;
}

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
  | PackageDefinition
  | ModelDiagramDefinition
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
  | ModelBaseline
  | TraceArtifact
  | ActorDefinition
  | SubjectDefinition
  | UseCaseDefinition
  | ExtensionPoint
  | DiagramReference;

export interface DiagramPresentation {
  diagramId: string;
  elementIds: string[];
}

export interface PresentationSnapshot {
  coordinates: Record<string, PresentationCoordinates>;
  diagramPresentations: Record<string, { elementIds: string[] }>;
}

export type SysmlMutationCommand =
  | { type: 'createElement'; element: SysmlElement; presentation?: PresentationCoordinates; coalesceKey?: string }
  | { type: 'updateElement'; elementId: string; patch: Record<string, unknown>; coalesceKey?: string }
  | { type: 'deleteElements'; elementIds: string[]; confirmedImpactHash?: string; authorizedBaselineIds?: string[] }
  | { type: 'removeFromDiagram'; diagramId: string; elementIds: string[] }
  | { type: 'updatePresentation'; elementId: string; presentation: PresentationCoordinates; coalesceKey?: string }
  | { type: 'moveElements'; elementIds: string[]; targetOwnerId: string; confirmedImpactHash?: string }
  | { type: 'createDiagram'; diagram: ModelDiagramDefinition }
  | { type: 'addToDiagram'; diagramId: string; elementIds: string[]; coordinates?: Record<string, PresentationCoordinates> };

export type SysmlEditorCommand =
  | SysmlMutationCommand
  | { type: 'batch'; commands: SysmlMutationCommand[]; coalesceKey?: string }
  | { type: 'undo' }
  | { type: 'redo' };

export interface SysmlGatewayState {
  repository: SysmlRepository;
  history: MutationHistory;
  store?: NormalizedSysmlStore;
  patchHistory?: PatchHistoryState;
  coordinates: Record<string, PresentationCoordinates>;
  diagramPresentations?: Record<string, { elementIds: string[] }>;
  presentationHistory?: {
    past: PresentationSnapshot[];
    future: PresentationSnapshot[];
  };
  actionStack?: Array<'semantic' | 'presentation'>;
  redoStack?: Array<'semantic' | 'presentation'>;
}

export interface SysmlCommandResult {
  repository: SysmlRepository;
  view: LegacySysmlView;
  diagnostics: SysmlDiagnostic[];
  impact?: MutationImpact;
  committed: boolean;
  history: MutationHistory;
  store?: NormalizedSysmlStore;
  patchHistory?: PatchHistoryState;
  coordinates: Record<string, PresentationCoordinates>;
  diagramPresentations: Record<string, { elementIds: string[] }>;
  presentationHistory?: {
    past: PresentationSnapshot[];
    future: PresentationSnapshot[];
  };
  actionStack?: Array<'semantic' | 'presentation'>;
  redoStack?: Array<'semantic' | 'presentation'>;
}

export function createSysmlGatewayState(
  initialRepo?: SysmlRepository,
  initialCoordinates?: Record<string, PresentationCoordinates>,
  initialDiagramPresentations?: Record<string, { elementIds: string[] }>,
  budgetOptions?: HistoryBudgetOptions,
): SysmlGatewayState {
  const repo = initialRepo ?? createEmptyRepository();
  const coords = initialCoordinates ?? {};
  const diagrams = initialDiagramPresentations ?? {};
  const store = fromRepository(repo, coords, diagrams);
  const patchHistory = createPatchHistory(budgetOptions);

  return {
    repository: repo,
    history: createHistory(repo),
    store,
    patchHistory,
    coordinates: coords,
    diagramPresentations: diagrams,
    presentationHistory: {
      past: [],
      future: [],
    },
    actionStack: [],
    redoStack: [],
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
    blocked: [...(impact.blockedBaselineIds ?? [])].sort(),
    severity: (impact as { severity?: string }).severity ?? 'review',
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
  diagramPresentations: Record<string, { elementIds: string[] }> = {},
  diagramId?: string,
): LegacySysmlView {
  const blocks: BlockData[] = [];
  const parts: PartData[] = [];
  const relationships: RelationshipData[] = [];
  const connectors: ConnectorData[] = [];

  const visibleFilter = diagramId && diagramPresentations[diagramId]
    ? new Set(diagramPresentations[diagramId].elementIds)
    : null;
  const isVisible = (id: string) => visibleFilter === null || visibleFilter.has(id);

  // Project definitions (blocks, valueTypes, interfaces)
  for (const def of Object.values(repository.definitions)) {
    if (!isVisible(def.id)) continue;
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
    if (!isVisible(req.id)) continue;
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
    if (!isVisible(vc.id)) continue;
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
      if (!isVisible(usage.id)) continue;
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
    if (!isVisible(conn.id)) {
      const sp = conn.sourcePortId.split('::')[0];
      const tp = conn.targetPortId.split('::')[0];
      if (!isVisible(sp) || !isVisible(tp)) continue;
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
  }

  // Project relationships
  for (const rel of Object.values(repository.relationships)) {
    if (!isVisible(rel.id)) {
      if (!isVisible(rel.sourceId) || !isVisible(rel.targetId)) continue;
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
      label: rel.name ?? '',
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
    if (element.kind === 'actor') {
      repo.actors[element.id] = element as ActorDefinition;
      return;
    }
    if (element.kind === 'subject') {
      repo.subjects[element.id] = element as SubjectDefinition;
      return;
    }
    if (element.kind === 'useCase') {
      repo.useCases[element.id] = element as UseCaseDefinition;
      return;
    }
    if (element.kind === 'extensionPoint') {
      repo.extensionPoints[element.id] = element as ExtensionPoint;
      return;
    }
  }
  if ('sourceElementId' in element && 'diagramId' in element && 'role' in element) {
    repo.diagramReferences[element.id] = element as DiagramReference;
    return;
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
  if (repo.actors?.[elementId]) {
    repo.actors[elementId] = { ...repo.actors[elementId], ...patch } as any;
    return true;
  }
  if (repo.subjects?.[elementId]) {
    repo.subjects[elementId] = { ...repo.subjects[elementId], ...patch } as any;
    return true;
  }
  if (repo.useCases?.[elementId]) {
    repo.useCases[elementId] = { ...repo.useCases[elementId], ...patch } as any;
    return true;
  }
  if (repo.extensionPoints?.[elementId]) {
    repo.extensionPoints[elementId] = { ...repo.extensionPoints[elementId], ...patch } as any;
    return true;
  }
  if (repo.diagramReferences?.[elementId]) {
    repo.diagramReferences[elementId] = { ...repo.diagramReferences[elementId], ...patch } as any;
    return true;
  }
  return false;
}

function getCollectionFromElement(element: SysmlElement): SysmlEntityCollection {
  if ('kind' in element) {
    if (element.kind === 'package') return 'packages';
    if (element.kind === 'diagram') return 'diagrams';
    if (element.kind === 'block' || element.kind === 'valueType' || element.kind === 'interface') return 'definitions';
    if (element.kind === 'part' || element.kind === 'port') return 'usages';
    if (element.kind === 'assembly' || element.kind === 'delegation' || element.kind === 'binding') return 'connectors';
    if (element.kind === 'requirement') return 'requirements';
    if (element.kind === 'verificationCase') return 'verificationCases';
    if (element.kind === 'actor') return 'actors';
    if (element.kind === 'subject') return 'subjects';
    if (element.kind === 'useCase') return 'useCases';
    if (element.kind === 'extensionPoint') return 'extensionPoints';
  }
  if ('sourceElementId' in element && 'diagramId' in element && 'role' in element) return 'diagramReferences';
  if ('sourceId' in element && 'targetId' in element) return 'relationships';
  if ('verificationCaseId' in element && 'status' in element) return 'evidence';
  if ('protected' in element && 'contentHash' in element) return 'baselines';
  if ('uri' in element && 'kind' in element) return 'artifacts';
  return 'definitions';
}

// ---------------------------------------------------------------------------
// Task 2 semantic policy gates (gateway boundary, before mutation).
// Canonical create/update/connect/delete commands are admitted through the
// central typed policy (policy.ts single source via sysmlCreationRules) so
// failures carry typed diagnostic codes (INVALID_GENERALIZATION_ENDPOINTS,
// INVALID_COMPOSITION_ENDPOINTS, MISSING_RELATIONSHIP_ENDPOINT,
// DUPLICATE_RELATIONSHIP/CONNECTOR, INVALID_CONNECTOR_CONTEXT,
// INCOMPATIBLE_PORT_DIRECTION, LEAF_SPECIALIZATION, ...) instead of generic
// invalid-operation / ELEMENT_NOT_FOUND-only errors. Rejection leaves
// revision, auditTrail, patchHistory, and transaction IDs untouched.
// ---------------------------------------------------------------------------

function isRelationshipElement(element: SysmlElement): element is SysmlRelationship {
  return 'sourceId' in element && 'targetId' in element;
}

function isConnectorElement(element: SysmlElement): element is ConnectorUsage {
  return 'sourcePortId' in element && 'targetPortId' in element;
}

function isBlockElement(element: SysmlElement): element is BlockDefinition | ValueTypeDefinition | InterfaceDefinition {
  return 'kind' in element && (element.kind === 'block' || element.kind === 'valueType' || element.kind === 'interface');
}

function toGateDiagnostics(elementId: string, codes: readonly string[], subject: string): SysmlDiagnostic[] {
  return policyDiagnosticsToSysml(elementId, codes).map(diagnostic => ({
    ...diagnostic,
    message: `${subject} ${elementId} rejected by semantic policy: ${diagnostic.code}`,
  }));
}

function elementExistsInRepository(repo: SysmlRepository, id: string): boolean {
  return Boolean(
    repo.definitions[id] ||
    repo.usages[id] ||
    repo.connectors[id] ||
    repo.relationships[id] ||
    repo.requirements[id] ||
    repo.verificationCases[id] ||
    repo.evidence[id] ||
    repo.baselines[id] ||
    repo.artifacts[id] ||
    repo.actors?.[id] ||
    repo.subjects?.[id] ||
    repo.useCases?.[id] ||
    repo.extensionPoints?.[id] ||
    repo.diagramReferences?.[id]
  );
}

function gateCreateElement(repo: SysmlRepository, element: SysmlElement): SysmlDiagnostic[] | null {
  if (elementExistsInRepository(repo, element.id)) {
    return [{
      code: 'DUPLICATE_ELEMENT_ID',
      severity: 'error' as const,
      elementId: element.id,
      message: `Element ${element.id} rejected: DUPLICATE_ELEMENT_ID (already exists)`,
    }];
  }
  if (isRelationshipElement(element)) {
    const verdict = validateCanonicalRelationshipCandidate(repo, element);
    if (!verdict.valid) {
      return verdict.codes.map(code => ({
        code, severity: 'error' as const, elementId: element.id,
        message: `Relationship ${element.id} rejected: ${code}`,
      }));
    }
    return null;
  }
  if (isConnectorElement(element)) {
    const verdict = validateCanonicalConnectorCandidate(repo, element);
    if (!verdict.valid) {
      return verdict.codes.map(code => ({
        code, severity: 'error' as const, elementId: element.id,
        message: `Connector ${element.id} rejected: ${code}`,
      }));
    }
    return null;
  }
  if (isBlockElement(element) && element.kind === 'block') {
    const verdict = validateCanonicalBlockDefinition(repo, element);
    if (!verdict.valid) {
      return toGateDiagnostics(element.id, verdict.codes, 'Block');
    }
    return null;
  }
  return null;
}

function gateUpdateElement(
  repo: SysmlRepository, elementId: string, patch: Record<string, unknown>,
): SysmlDiagnostic[] | null {
  const definition = repo.definitions[elementId];
  if (definition && definition.kind === 'block') {
    const verdict = validateCanonicalBlockUpdate(repo, elementId, patch);
    if (!verdict.valid) {
      return toGateDiagnostics(
        elementId,
        verdict.codes.filter(code => code !== 'ELEMENT_NOT_FOUND'),
        'Block',
      );
    }
    return null;
  }
  const relationship = repo.relationships[elementId];
  if (relationship) {
    const candidate = { ...relationship, ...patch } as SysmlRelationship;
    const staged: SysmlRepository = {
      ...repo, relationships: { ...repo.relationships, [elementId]: candidate },
    };
    // Re-validate endpoints/direction on the staged candidate, ignoring the
    // candidate itself for duplicate detection.
    const { [elementId]: _ignored, ...rest } = staged.relationships;
    const verdict = validateCanonicalRelationshipCandidate({ ...staged, relationships: rest }, candidate);
    if (!verdict.valid) {
      return verdict.codes.map(code => ({
        code, severity: 'error' as const, elementId,
        message: `Relationship ${elementId} update rejected: ${code}`,
      }));
    }
    return null;
  }
  const connector = repo.connectors[elementId];
  if (connector) {
    const candidate = { ...connector, ...patch } as ConnectorUsage;
    const { [elementId]: _ignored, ...rest } = repo.connectors;
    const verdict = validateCanonicalConnectorCandidate({ ...repo, connectors: rest }, candidate);
    if (!verdict.valid) {
      return verdict.codes.map(code => ({
        code, severity: 'error' as const, elementId,
        message: `Connector ${elementId} update rejected: ${code}`,
      }));
    }
    return null;
  }
  return null;
}

export function validateOwnershipMove(
  repo: SysmlRepository,
  elementId: string,
  targetOwnerId: string
): SysmlDiagnostic | null {
  if (elementId === 'model') {
    return {
      code: 'ROOT_PACKAGE_MOVE_PROHIBITED',
      severity: 'error',
      elementId,
      message: 'The root model package cannot be moved',
    };
  }

  if (elementId === targetOwnerId) {
    return {
      code: 'CIRCULAR_OWNERSHIP',
      severity: 'error',
      elementId,
      message: `Cannot move element ${elementId} into itself`,
    };
  }

  // Descendant check
  let curr: string | undefined = targetOwnerId;
  while (curr && curr !== 'model') {
    const parentPkg: PackageDefinition | undefined = repo.packages?.[curr];
    const parentDef: SysmlDefinition | undefined = repo.definitions?.[curr];
    const parentReq: RequirementDefinition | undefined = repo.requirements?.[curr];
    const nextParent: string | undefined = parentPkg?.ownerId ?? parentDef?.ownerId ?? parentReq?.ownerId;
    if (nextParent === elementId) {
      return {
        code: 'CIRCULAR_OWNERSHIP',
        severity: 'error',
        elementId,
        message: `Cannot move element ${elementId} into its own descendant`,
      };
    }
    curr = nextParent;
  }

  // Metatype compatibility check
  const targetPkg = targetOwnerId === 'model' ? repo.packages.model : repo.packages?.[targetOwnerId];
  const targetDef = repo.definitions?.[targetOwnerId];
  const targetReq = repo.requirements?.[targetOwnerId];

  // Determine source element kind
  const sourceDef = repo.definitions?.[elementId];
  const sourcePkg = repo.packages?.[elementId];
  const sourceDiag = repo.diagrams?.[elementId];
  const sourceReq = repo.requirements?.[elementId];
  const sourceUsage = repo.usages?.[elementId];
  const sourceVC = repo.verificationCases?.[elementId];

  const sourceKind =
    sourcePkg ? 'package' :
    sourceDiag ? 'diagram' :
    sourceDef ? sourceDef.kind :
    sourceReq ? 'requirement' :
    sourceUsage ? sourceUsage.kind :
    sourceVC ? 'verificationCase' :
    'unknown';

  if (targetOwnerId === 'model' || Boolean(targetPkg)) {
    // Model or package target
    const allowed = ['package', 'diagram', 'block', 'valueType', 'interface', 'requirement', 'verificationCase', 'stateMachine'];
    if (!allowed.includes(sourceKind)) {
      return {
        code: 'DISALLOWED_OWNERSHIP',
        severity: 'error',
        elementId,
        message: `Target package '${targetOwnerId}' cannot contain element '${elementId}' of kind '${sourceKind}'`,
      };
    }
    return null;
  }

  if (targetDef && targetDef.kind === 'block') {
    // Block target: can contain parts, ports, properties, constraints
    const allowed = ['part', 'reference', 'shared', 'port', 'property', 'constraint'];
    if (!allowed.includes(sourceKind)) {
      return {
        code: 'DISALLOWED_OWNERSHIP',
        severity: 'error',
        elementId,
        message: `Target block '${targetOwnerId}' cannot contain element '${elementId}' of kind '${sourceKind}'`,
      };
    }
    return null;
  }

  if (targetReq) {
    if (sourceKind !== 'requirement') {
      return {
        code: 'DISALLOWED_OWNERSHIP',
        severity: 'error',
        elementId,
        message: `Target requirement '${targetOwnerId}' cannot contain element '${elementId}' of kind '${sourceKind}'`,
      };
    }
    return null;
  }

  return {
    code: 'DISALLOWED_OWNERSHIP',
    severity: 'error',
    elementId,
    message: `Target '${targetOwnerId}' cannot contain element '${elementId}'`,
  };
}

export function executeSysmlCommand(
  state: SysmlGatewayState,
  command: SysmlEditorCommand,
  activeDiagramId?: string,
): SysmlCommandResult {
  const coordinates = { ...state.coordinates };
  const diagramPresentations: Record<string, { elementIds: string[] }> = { ...(state.diagramPresentations ?? {}) };
  const store = state.store ?? fromRepository(state.repository, coordinates, diagramPresentations);
  const patchHistory = state.patchHistory ?? createPatchHistory();

  const getView = (
    repo: SysmlRepository,
    coords: Record<string, PresentationCoordinates>,
    diagrams: Record<string, { elementIds: string[] }>,
    diagramIdOverride?: string,
  ): LegacySysmlView => {
    const diagId = diagramIdOverride ?? activeDiagramId;
    if (store) {
      return getCachedLegacyView(store, diagId);
    }
    return projectLegacyDiagram(repo, coords, diagrams, diagId);
  };

  if (command.type === 'undo') {
    const actionStack = [...(state.actionStack ?? [])];
    const lastAction = actionStack.pop();

    if (patchHistory.past.length > 0) {
      const undoRes = undoPatch(patchHistory, store);
      if (undoRes) {
        store.revision = Math.max(0, undoRes.appliedPatch.revision - 1);
        const repo = toRepository(store);
        const nextCoords = Object.fromEntries(store.coordinates);
        const nextDiagrams = Object.fromEntries(store.diagramPresentations);
        const validation = validateSysmlRepository(repo);
        const view = getView(repo, nextCoords, nextDiagrams);
        const nextHistory: MutationHistory = {
          past: [],
          present: repo,
          future: [],
        };
        return {
          repository: repo,
          store,
          patchHistory,
          view,
          diagnostics: validation.diagnostics,
          committed: true,
          history: nextHistory,
          coordinates: nextCoords,
          diagramPresentations: nextDiagrams,
          presentationHistory: state.presentationHistory,
          actionStack,
          redoStack: [lastAction ?? 'semantic', ...(state.redoStack ?? [])],
        };
      }
    }

    if (lastAction === 'presentation' || (lastAction === undefined && (state.presentationHistory?.past?.length ?? 0) > 0)) {
      if ((state.presentationHistory?.past?.length ?? 0) > 0) {
        const past = [...(state.presentationHistory?.past ?? [])];
        const prev = past.pop();
        if (prev) {
          const currentSnapshot: PresentationSnapshot = {
            coordinates: { ...state.coordinates },
            diagramPresentations: { ...diagramPresentations },
          };
          const nextPresentationHistory = {
            past,
            future: [currentSnapshot, ...(state.presentationHistory?.future ?? [])],
          };
          for (const id of store.coordinates.keys()) {
            if (!prev.coordinates[id]) store.coordinates.delete(id);
          }
          for (const [id, c] of Object.entries(prev.coordinates)) {
            store.coordinates.set(id, c);
          }
          store.diagramPresentations = new Map(Object.entries(prev.diagramPresentations));
          store.revision += 1;
          const validation = validateSysmlRepository(state.repository);
          const view = getView(state.repository, prev.coordinates, prev.diagramPresentations);
          return {
            repository: state.repository,
            store,
            patchHistory,
            view,
            diagnostics: validation.diagnostics,
            committed: true,
            history: state.history,
            coordinates: prev.coordinates,
            diagramPresentations: prev.diagramPresentations,
            presentationHistory: nextPresentationHistory,
            actionStack,
            redoStack: ['presentation', ...(state.redoStack ?? [])],
          };
        }
      }
    }

    const nextHistory = historyUndo(state.history);
    const repo = nextHistory.present;
    store.revision = repo.revision;
    store.coordinates = new Map(Object.entries(coordinates));
    store.diagramPresentations = new Map(Object.entries(diagramPresentations));

    const validation = validateSysmlRepository(repo);
    const view = getView(repo, coordinates, diagramPresentations);
    return {
      repository: repo,
      store,
      patchHistory,
      view,
      diagnostics: validation.diagnostics,
      committed: true,
      history: nextHistory,
      coordinates,
      diagramPresentations,
      presentationHistory: state.presentationHistory,
      actionStack,
      redoStack: lastAction ? [lastAction, ...(state.redoStack ?? [])] : state.redoStack,
    };
  }

  if (command.type === 'redo') {
    const redoStack = [...(state.redoStack ?? [])];
    const nextAction = redoStack.shift();

    if (patchHistory.future.length > 0) {
      const redoRes = redoPatch(patchHistory, store);
      if (redoRes) {
        store.revision = redoRes.appliedPatch.revision;
        const repo = toRepository(store);
        const nextCoords = Object.fromEntries(store.coordinates);
        const nextDiagrams = Object.fromEntries(store.diagramPresentations);
        const validation = validateSysmlRepository(repo);
        const view = getView(repo, nextCoords, nextDiagrams);
        const nextHistory: MutationHistory = {
          past: [],
          present: repo,
          future: [],
        };
        return {
          repository: repo,
          store,
          patchHistory,
          view,
          diagnostics: validation.diagnostics,
          committed: true,
          history: nextHistory,
          coordinates: nextCoords,
          diagramPresentations: nextDiagrams,
          presentationHistory: state.presentationHistory,
          actionStack: [...(state.actionStack ?? []), nextAction ?? 'semantic'],
          redoStack,
        };
      }
    }

    if (nextAction === 'presentation') {
      if ((state.presentationHistory?.future?.length ?? 0) > 0) {
        const future = [...(state.presentationHistory?.future ?? [])];
        const next = future.shift();
        if (next) {
          const currentSnapshot: PresentationSnapshot = {
            coordinates: { ...state.coordinates },
            diagramPresentations: { ...diagramPresentations },
          };
          const nextPresentationHistory = {
            past: [...(state.presentationHistory?.past ?? []), currentSnapshot],
            future,
          };
          for (const id of store.coordinates.keys()) {
            if (!next.coordinates[id]) store.coordinates.delete(id);
          }
          for (const [id, c] of Object.entries(next.coordinates)) {
            store.coordinates.set(id, c);
          }
          store.diagramPresentations = new Map(Object.entries(next.diagramPresentations));
          store.revision += 1;
          const validation = validateSysmlRepository(state.repository);
          const view = getView(state.repository, next.coordinates, next.diagramPresentations);
          return {
            repository: state.repository,
            store,
            patchHistory,
            view,
            diagnostics: validation.diagnostics,
            committed: true,
            history: state.history,
            coordinates: next.coordinates,
            diagramPresentations: next.diagramPresentations,
            presentationHistory: nextPresentationHistory,
            actionStack: [...(state.actionStack ?? []), 'presentation'],
            redoStack,
          };
        }
      }
    }

    const nextHistory = historyRedo(state.history);
    const repo = nextHistory.present;
    store.revision = repo.revision;
    store.coordinates = new Map(Object.entries(coordinates));
    store.diagramPresentations = new Map(Object.entries(diagramPresentations));

    const validation = validateSysmlRepository(repo);
    const view = getView(repo, coordinates, diagramPresentations);
    return {
      repository: repo,
      store,
      patchHistory,
      view,
      diagnostics: validation.diagnostics,
      committed: true,
      history: nextHistory,
      coordinates,
      diagramPresentations,
      presentationHistory: state.presentationHistory,
      actionStack: nextAction ? [...(state.actionStack ?? []), nextAction] : state.actionStack,
      redoStack,
    };
  }

  if (command.type === 'updatePresentation') {
    const prevCoords = store.coordinates.get(command.elementId) ?? coordinates[command.elementId] ?? {};
    store.coordinates.set(command.elementId, { ...command.presentation });
    coordinates[command.elementId] = { ...command.presentation };
    store.revision += 1;

    const patch = createSysmlPatch({
      revision: state.repository.revision,
      coalesceKey: command.coalesceKey,
      forward: [{ op: 'replace', collection: 'coordinates', id: command.elementId, oldValue: prevCoords, value: command.presentation }],
      inverse: [{ op: 'replace', collection: 'coordinates', id: command.elementId, oldValue: command.presentation, value: prevCoords }],
      description: 'updatePresentation',
    });
    pushPatch(patchHistory, patch, store);

    const validation = validateSysmlRepository(state.repository);
    const view = getView(state.repository, coordinates, diagramPresentations);
    return {
      repository: state.repository,
      store,
      patchHistory,
      view,
      diagnostics: validation.diagnostics,
      committed: true,
      history: state.history,
      coordinates,
      diagramPresentations,
      presentationHistory: state.presentationHistory,
      actionStack: [...(state.actionStack ?? []), 'presentation'],
      redoStack: [],
    };
  }

  if (command.type === 'createElement') {
    const gateDiagnostics = gateCreateElement(state.repository, command.element);
    if (gateDiagnostics) {
      const view = getView(state.repository, coordinates, diagramPresentations);
      return {
        repository: state.repository,
        store,
        patchHistory,
        view,
        diagnostics: gateDiagnostics,
        committed: false,
        history: state.history,
        coordinates,
        diagramPresentations,
        presentationHistory: state.presentationHistory,
        actionStack: state.actionStack,
        redoStack: state.redoStack,
      };
    }
    const collection = getCollectionFromElement(command.element);
    upsertEntity(store, collection, command.element as any);
    if (command.presentation) {
      coordinates[command.element.id] = { ...command.presentation };
      store.coordinates.set(command.element.id, { ...command.presentation });
    }

    const nextRepo: SysmlRepository = {
      ...state.repository,
      revision: state.repository.revision + 1,
      packages: collection === 'packages' ? { ...state.repository.packages, [command.element.id]: command.element as any } : (state.repository.packages || {}),
      diagrams: collection === 'diagrams' ? { ...state.repository.diagrams, [command.element.id]: command.element as any } : (state.repository.diagrams || {}),
      definitions: collection === 'definitions' ? { ...state.repository.definitions, [command.element.id]: command.element as any } : state.repository.definitions,
      usages: collection === 'usages' ? { ...state.repository.usages, [command.element.id]: command.element as any } : state.repository.usages,
      connectors: collection === 'connectors' ? { ...state.repository.connectors, [command.element.id]: command.element as any } : state.repository.connectors,
      relationships: collection === 'relationships' ? { ...state.repository.relationships, [command.element.id]: command.element as any } : state.repository.relationships,
      requirements: collection === 'requirements' ? { ...state.repository.requirements, [command.element.id]: command.element as any } : state.repository.requirements,
      verificationCases: collection === 'verificationCases' ? { ...state.repository.verificationCases, [command.element.id]: command.element as any } : state.repository.verificationCases,
      evidence: collection === 'evidence' ? { ...state.repository.evidence, [command.element.id]: command.element as any } : state.repository.evidence,
      baselines: collection === 'baselines' ? { ...state.repository.baselines, [command.element.id]: command.element as any } : state.repository.baselines,
      artifacts: collection === 'artifacts' ? { ...state.repository.artifacts, [command.element.id]: command.element as any } : state.repository.artifacts,
      actors: collection === 'actors' ? { ...(state.repository.actors || {}), [command.element.id]: command.element as any } : (state.repository.actors || {}),
      subjects: collection === 'subjects' ? { ...(state.repository.subjects || {}), [command.element.id]: command.element as any } : (state.repository.subjects || {}),
      useCases: collection === 'useCases' ? { ...(state.repository.useCases || {}), [command.element.id]: command.element as any } : (state.repository.useCases || {}),
      extensionPoints: collection === 'extensionPoints' ? { ...(state.repository.extensionPoints || {}), [command.element.id]: command.element as any } : (state.repository.extensionPoints || {}),
      diagramReferences: collection === 'diagramReferences' ? { ...(state.repository.diagramReferences || {}), [command.element.id]: command.element as any } : (state.repository.diagramReferences || {}),
      auditTrail: [
        ...state.repository.auditTrail,
        {
          id: `change-${state.repository.revision + 1}-${command.element.id}`,
          revision: state.repository.revision + 1,
          timestamp: new Date().toISOString(),
          command: 'createElement',
          elementIds: [command.element.id],
        },
      ],
    };

    const forwardOps: import('../engine/sysml/patches').PatchOperation[] = [
      { op: 'add', collection, id: command.element.id, value: command.element },
    ];
    const inverseOps: import('../engine/sysml/patches').PatchOperation[] = [
      { op: 'remove', collection, id: command.element.id, oldValue: command.element },
    ];
    if (command.presentation) {
      forwardOps.push({ op: 'add', collection: 'coordinates', id: command.element.id, value: command.presentation });
      inverseOps.push({ op: 'remove', collection: 'coordinates', id: command.element.id, oldValue: command.presentation });
    }
    const patch = createSysmlPatch({
      revision: nextRepo.revision,
      coalesceKey: command.coalesceKey,
      forward: forwardOps,
      inverse: inverseOps,
      description: 'createElement',
    });
    pushPatch(patchHistory, patch, store);

    const nextHistory: MutationHistory = {
      past: [],
      present: nextRepo,
      future: [],
    };
    const validation = validateSysmlRepository(nextRepo);
    const view = getView(nextRepo, coordinates, diagramPresentations);

    return {
      repository: nextRepo,
      store,
      patchHistory,
      view,
      diagnostics: validation.diagnostics,
      committed: true,
      history: nextHistory,
      coordinates,
      diagramPresentations,
      presentationHistory: state.presentationHistory,
      actionStack: [...(state.actionStack ?? []), 'semantic'],
      redoStack: [],
    };
  }

  if (command.type === 'updateElement') {
    const existing = getEntityById(store, command.elementId) ?? (
      state.repository.definitions[command.elementId] ||
      state.repository.usages[command.elementId] ||
      state.repository.connectors[command.elementId] ||
      state.repository.relationships[command.elementId] ||
      state.repository.requirements[command.elementId] ||
      state.repository.verificationCases[command.elementId] ||
      state.repository.evidence[command.elementId] ||
      state.repository.baselines[command.elementId]
    );
    if (!existing) {
      const view = getView(state.repository, coordinates, diagramPresentations);
      return {
        repository: state.repository,
        store,
        patchHistory,
        view,
        diagnostics: [{ code: 'ELEMENT_NOT_FOUND', severity: 'error', message: `Element ${command.elementId} not found` }],
        committed: false,
        history: state.history,
        coordinates,
        diagramPresentations,
        presentationHistory: state.presentationHistory,
        actionStack: state.actionStack,
        redoStack: state.redoStack,
      };
    }

    const collection = getCollectionForId(store, command.elementId) ?? getCollectionFromElement(existing);
    const updateGate = gateUpdateElement(state.repository, command.elementId, command.patch);
    if (updateGate) {
      const view = getView(state.repository, coordinates, diagramPresentations);
      return {
        repository: state.repository,
        store,
        patchHistory,
        view,
        diagnostics: updateGate,
        committed: false,
        history: state.history,
        coordinates,
        diagramPresentations,
        presentationHistory: state.presentationHistory,
        actionStack: state.actionStack,
        redoStack: state.redoStack,
      };
    }
    const nextElement = { ...existing, ...command.patch } as SysmlEntity;
    upsertEntity(store, collection, nextElement);

    const nextRepo: SysmlRepository = {
      ...state.repository,
      revision: state.repository.revision + 1,
      [collection]: {
        ...state.repository[collection],
        [command.elementId]: nextElement,
      },
      auditTrail: [
        ...state.repository.auditTrail,
        {
          id: `change-${state.repository.revision + 1}-${command.elementId}`,
          revision: state.repository.revision + 1,
          timestamp: new Date().toISOString(),
          command: 'updateElement',
          elementIds: [command.elementId],
        },
      ],
    };

    const patch = createSysmlPatch({
      revision: nextRepo.revision,
      coalesceKey: command.coalesceKey,
      forward: [{ op: 'replace', collection, id: command.elementId, oldValue: existing, value: nextElement }],
      inverse: [{ op: 'replace', collection, id: command.elementId, oldValue: nextElement, value: existing }],
      description: 'updateElement',
    });
    pushPatch(patchHistory, patch, store);

    const nextHistory: MutationHistory = {
      past: [],
      present: nextRepo,
      future: [],
    };
    const validation = validateSysmlRepository(nextRepo);
    const view = getView(nextRepo, coordinates, diagramPresentations);

    return {
      repository: nextRepo,
      store,
      patchHistory,
      view,
      diagnostics: validation.diagnostics,
      committed: true,
      history: nextHistory,
      coordinates,
      diagramPresentations,
      presentationHistory: state.presentationHistory,
      actionStack: [...(state.actionStack ?? []), 'semantic'],
      redoStack: [],
    };
  }

  if (command.type === 'deleteElements') {
    if (command.elementIds.includes('model')) {
      const view = getView(state.repository, coordinates, diagramPresentations);
      return {
        repository: state.repository,
        store,
        patchHistory,
        view,
        diagnostics: [{
          code: 'ROOT_PACKAGE_DELETION_PROHIBITED',
          severity: 'error' as const,
          elementId: 'model',
          message: 'The root model package cannot be deleted',
        }],
        committed: false,
        history: state.history,
        coordinates,
        diagramPresentations,
        presentationHistory: state.presentationHistory,
        actionStack: state.actionStack,
        redoStack: state.redoStack,
      };
    }
    // Policy boundary: classify every requested deletion target through the
    // central policy. Unknown ids are rejected with a typed code before any
    // impact analysis or mutation; known targets flow into analyzeMutation
    // (which itself drives its cascade closure through classifyDeletionTarget).
    const unknownTargets = [...new Set(command.elementIds)].filter(
      id => classifyCanonicalDeletionTarget(state.repository, id).targetKind === 'unknown',
    );
    if (unknownTargets.length > 0) {
      const view = getView(state.repository, coordinates, diagramPresentations);
      return {
        repository: state.repository,
        store,
        patchHistory,
        view,
        diagnostics: unknownTargets.map(id => ({
          code: 'ELEMENT_NOT_FOUND',
          severity: 'error' as const,
          elementId: id,
          message: `Element ${id} not found; deletion rejected`,
        })),
        committed: false,
        history: state.history,
        coordinates,
        diagramPresentations,
        presentationHistory: state.presentationHistory,
        actionStack: state.actionStack,
        redoStack: state.redoStack,
      };
    }
    const impact = analyzeMutation(state.repository, { kind: 'deleteElements', elementIds: command.elementIds });
    const authorized = new Set(command.authorizedBaselineIds ?? []);
    const unauthorizedBaselines = impact.affectedBaselineIds.filter(id => !authorized.has(id));

    // Protected-baseline gate: destructive mutations touching frozen baseline
    // content never proceed silently. The caller must clone the baseline into
    // an unprotected working copy or present explicit authorization alongside
    // the confirmed impact hash. Rejection leaves revision, auditTrail,
    // patchHistory, and transaction IDs untouched.
    if (unauthorizedBaselines.length > 0) {
      const view = getView(state.repository, coordinates, diagramPresentations);
      return {
        repository: state.repository,
        store,
        patchHistory,
        view,
        diagnostics: unauthorizedBaselines.map(id => ({
          code: 'PROTECTED_BASELINE_REQUIRES_AUTHORIZATION',
          severity: 'error' as const,
          elementId: id,
          message: `Protected baseline ${id} forbids deletion of ${command.elementIds.join(', ') || 'none'}; clone the baseline or authorize explicitly before retrying`,
        })),
        impact: { ...impact, blockedBaselineIds: unauthorizedBaselines, severity: 'blocked' },
        committed: false,
        history: state.history,
        coordinates,
        diagramPresentations,
        presentationHistory: state.presentationHistory,
        actionStack: state.actionStack,
        redoStack: state.redoStack,
      };
    }
    const needsConfirmation = requiresDeletionConfirmation(impact);

    if (needsConfirmation) {
      const expectedHash = computeImpactHash(impact);
      if (command.confirmedImpactHash !== expectedHash) {
        const view = getView(state.repository, coordinates, diagramPresentations);
        return {
          repository: state.repository,
          store,
          patchHistory,
          view,
          diagnostics: [],
          impact,
          committed: false,
          history: state.history,
          coordinates,
          diagramPresentations,
          presentationHistory: state.presentationHistory,
          actionStack: state.actionStack,
          redoStack: state.redoStack,
        };
      }
    }

    const mutationResult = applyCommand(
      state.repository,
      { kind: 'deleteElements', elementIds: command.elementIds },
      { authorizedBaselineIds: [...authorized] },
    );
    if (!mutationResult.applied) {
      const view = getView(state.repository, coordinates, diagramPresentations);
      return {
        repository: state.repository,
        store,
        patchHistory,
        view,
        diagnostics: (mutationResult.diagnostics ?? []).map(d => ({ ...d, severity: 'error' as const })),
        impact: mutationResult.impact,
        committed: false,
        history: state.history,
        coordinates,
        diagramPresentations,
        presentationHistory: state.presentationHistory,
        actionStack: state.actionStack,
        redoStack: state.redoStack,
      };
    }
    const nextRepo = mutationResult.repository;

    const forwardOps = [...(mutationResult.forwardPatch?.forward ?? [])];
    const inverseOps = [...(mutationResult.forwardPatch?.inverse ?? [])];

    for (const delId of impact.deletedElementIds) {
      if (coordinates[delId]) {
        forwardOps.push({ op: 'remove', collection: 'coordinates', id: delId, oldValue: coordinates[delId] });
        inverseOps.push({ op: 'add', collection: 'coordinates', id: delId, value: coordinates[delId] });
      }
      delete coordinates[delId];
      removeEntity(store, delId);
    }
    const nextDiagramPresentations: Record<string, { elementIds: string[] }> = {};
    for (const [dId, pres] of Object.entries(diagramPresentations)) {
      const nextIds = pres.elementIds.filter(id => !impact.deletedElementIds.includes(id));
      nextDiagramPresentations[dId] = { elementIds: nextIds };
      store.diagramPresentations.set(dId, nextDiagramPresentations[dId]);
    }

    const deletePatch = createSysmlPatch({
      revision: nextRepo.revision,
      forward: forwardOps,
      inverse: inverseOps,
      description: 'deleteElements',
    });
    pushPatch(patchHistory, deletePatch, store);

    nextRepo.auditTrail.push({
      id: `change-${nextRepo.revision}-deletion`,
      revision: nextRepo.revision,
      timestamp: new Date().toISOString(),
      command: 'deleteElements',
      elementIds: impact.deletedElementIds,
    });

    const nextHistory: MutationHistory = {
      past: [],
      present: nextRepo,
      future: [],
    };
    const view = getView(nextRepo, coordinates, nextDiagramPresentations);

    return {
      repository: nextRepo,
      store,
      patchHistory,
      view,
      diagnostics: mutationResult.validation.diagnostics,
      impact,
      committed: true,
      history: nextHistory,
      coordinates,
      diagramPresentations: nextDiagramPresentations,
      presentationHistory: state.presentationHistory,
      actionStack: [...(state.actionStack ?? []), 'semantic'],
      redoStack: [],
    };
  }

  if (command.type === 'removeFromDiagram') {
    const currentPresentation = diagramPresentations[command.diagramId] ?? { elementIds: [] };
    const nextPresentation = {
      elementIds: currentPresentation.elementIds.filter(id => !command.elementIds.includes(id)),
    };
    const nextDiagramPresentations: Record<string, { elementIds: string[] }> = {
      ...diagramPresentations,
      [command.diagramId]: nextPresentation,
    };
    store.diagramPresentations.set(command.diagramId, nextPresentation);

    const patch = createSysmlPatch({
      revision: store.revision + 1,
      forward: [{
        op: 'replace',
        collection: 'diagramPresentations',
        id: command.diagramId,
        oldValue: currentPresentation,
        value: nextPresentation,
      }],
      inverse: [{
        op: 'replace',
        collection: 'diagramPresentations',
        id: command.diagramId,
        oldValue: nextPresentation,
        value: currentPresentation,
      }],
      description: 'removeFromDiagram',
    });
    pushPatch(patchHistory, patch, store);

    const nextPresentationHistory = {
      past: state.presentationHistory?.past ?? [],
      future: [],
    };
    const nextActionStack: Array<'semantic' | 'presentation'> = [...(state.actionStack ?? []), 'presentation'];

    const validation = validateSysmlRepository(state.repository);
    const view = getView(state.repository, coordinates, nextDiagramPresentations, command.diagramId);

    return {
      repository: state.repository,
      store,
      patchHistory,
      view,
      diagnostics: validation.diagnostics,
      committed: true,
      history: state.history,
      coordinates,
      diagramPresentations: nextDiagramPresentations,
      presentationHistory: nextPresentationHistory,
      actionStack: nextActionStack,
      redoStack: [],
    };
  }

  if (command.type === 'moveElements') {
    const targetOwnerId = command.targetOwnerId;
    const targetPkg = state.repository.packages?.[targetOwnerId];
    const targetDef = state.repository.definitions?.[targetOwnerId];
    const targetReq = state.repository.requirements?.[targetOwnerId];
    const targetExists = targetOwnerId === 'model' || Boolean(targetPkg) || Boolean(targetDef) || Boolean(targetReq);
    if (!targetExists) {
      const view = getView(state.repository, coordinates, diagramPresentations);
      return {
        repository: state.repository,
        store,
        patchHistory,
        view,
        diagnostics: [{ code: 'TARGET_OWNER_NOT_FOUND', severity: 'error', message: `Target owner ${targetOwnerId} not found` }],
        committed: false,
        history: state.history,
        coordinates,
        diagramPresentations,
        presentationHistory: state.presentationHistory,
        actionStack: state.actionStack,
        redoStack: state.redoStack,
      };
    }

    for (const elemId of command.elementIds) {
      const diag = validateOwnershipMove(state.repository, elemId, targetOwnerId);
      if (diag) {
        const view = getView(state.repository, coordinates, diagramPresentations);
        return {
          repository: state.repository,
          store,
          patchHistory,
          view,
          diagnostics: [diag],
          committed: false,
          history: state.history,
          coordinates,
          diagramPresentations,
          presentationHistory: state.presentationHistory,
          actionStack: state.actionStack,
          redoStack: state.redoStack,
        };
      }
    }

    const forwardOps: import('../engine/sysml/patches').PatchOperation[] = [];
    const inverseOps: import('../engine/sysml/patches').PatchOperation[] = [];
    const nextRepo: SysmlRepository = {
      ...state.repository,
      revision: state.repository.revision + 1,
      definitions: { ...(state.repository.definitions || {}) },
      packages: { ...(state.repository.packages || {}) },
      diagrams: { ...(state.repository.diagrams || {}) },
      requirements: { ...(state.repository.requirements || {}) },
      usages: { ...(state.repository.usages || {}) },
      auditTrail: [...(state.repository.auditTrail || [])],
    };

    for (const elemId of command.elementIds) {
      if (nextRepo.definitions[elemId]) {
        const prevDef = nextRepo.definitions[elemId];
        const updatedDef = { ...prevDef, ownerId: targetOwnerId };
        nextRepo.definitions[elemId] = updatedDef;
        upsertEntity(store, 'definitions', updatedDef);
        forwardOps.push({ op: 'replace', collection: 'definitions', id: elemId, oldValue: prevDef, value: updatedDef });
        inverseOps.unshift({ op: 'replace', collection: 'definitions', id: elemId, oldValue: updatedDef, value: prevDef });
      } else if (nextRepo.packages[elemId]) {
        const prevPkg = nextRepo.packages[elemId];
        const updatedPkg = { ...prevPkg, ownerId: targetOwnerId };
        nextRepo.packages[elemId] = updatedPkg;
        upsertEntity(store, 'packages', updatedPkg);
        forwardOps.push({ op: 'replace', collection: 'packages', id: elemId, oldValue: prevPkg, value: updatedPkg });
        inverseOps.unshift({ op: 'replace', collection: 'packages', id: elemId, oldValue: updatedPkg, value: prevPkg });
      } else if (nextRepo.diagrams[elemId]) {
        const prevDiag = nextRepo.diagrams[elemId];
        const updatedDiag = { ...prevDiag, ownerId: targetOwnerId };
        nextRepo.diagrams[elemId] = updatedDiag;
        upsertEntity(store, 'diagrams', updatedDiag);
        forwardOps.push({ op: 'replace', collection: 'diagrams', id: elemId, oldValue: prevDiag, value: updatedDiag });
        inverseOps.unshift({ op: 'replace', collection: 'diagrams', id: elemId, oldValue: updatedDiag, value: prevDiag });
      } else if (nextRepo.requirements[elemId]) {
        const prevReq = nextRepo.requirements[elemId];
        const updatedReq = { ...prevReq, ownerId: targetOwnerId, owner: targetOwnerId };
        nextRepo.requirements[elemId] = updatedReq;
        upsertEntity(store, 'requirements', updatedReq);
        forwardOps.push({ op: 'replace', collection: 'requirements', id: elemId, oldValue: prevReq, value: updatedReq });
        inverseOps.unshift({ op: 'replace', collection: 'requirements', id: elemId, oldValue: updatedReq, value: prevReq });
      } else if (nextRepo.usages[elemId]) {
        const prevUsage = nextRepo.usages[elemId];
        const updatedUsage = { ...prevUsage, ownerId: targetOwnerId };
        nextRepo.usages[elemId] = updatedUsage;
        upsertEntity(store, 'usages', updatedUsage);
        forwardOps.push({ op: 'replace', collection: 'usages', id: elemId, oldValue: prevUsage, value: updatedUsage });
        inverseOps.unshift({ op: 'replace', collection: 'usages', id: elemId, oldValue: updatedUsage, value: prevUsage });
      }
    }

    const patch = createSysmlPatch({
      revision: nextRepo.revision,
      forward: forwardOps,
      inverse: inverseOps,
      description: `moveElements to ${targetOwnerId}`,
    });
    pushPatch(patchHistory, patch, store);

    nextRepo.auditTrail.push({
      id: `change-${nextRepo.revision}-move`,
      revision: nextRepo.revision,
      timestamp: new Date().toISOString(),
      command: 'moveElements',
      elementIds: command.elementIds,
    });

    const nextHistory: MutationHistory = {
      past: [...state.history.past, state.repository],
      present: nextRepo,
      future: [],
    };

    const validation = validateSysmlRepository(nextRepo);
    const view = getView(nextRepo, coordinates, diagramPresentations);
    return {
      repository: nextRepo,
      store,
      patchHistory,
      view,
      diagnostics: validation.diagnostics,
      committed: true,
      history: nextHistory,
      coordinates,
      diagramPresentations,
      presentationHistory: state.presentationHistory,
      actionStack: [...(state.actionStack ?? []), 'semantic'],
      redoStack: [],
    };
  }

  if (command.type === 'createDiagram') {
    const diagram = command.diagram;
    const nextRepo: SysmlRepository = {
      ...state.repository,
      revision: state.repository.revision + 1,
      diagrams: {
        ...(state.repository.diagrams || {}),
        [diagram.id]: diagram,
      },
      auditTrail: [...(state.repository.auditTrail || [])],
    };
    upsertEntity(store, 'diagrams', diagram);
    const nextDiagramPresentations = {
      ...diagramPresentations,
      [diagram.id]: { elementIds: [] },
    };
    store.diagramPresentations.set(diagram.id, { elementIds: [] });

    const patch = createSysmlPatch({
      revision: nextRepo.revision,
      forward: [{ op: 'add', collection: 'diagrams', id: diagram.id, value: diagram }],
      inverse: [{ op: 'remove', collection: 'diagrams', id: diagram.id, oldValue: diagram }],
      description: `createDiagram ${diagram.name}`,
    });
    pushPatch(patchHistory, patch, store);

    nextRepo.auditTrail.push({
      id: `change-${nextRepo.revision}-createDiagram`,
      revision: nextRepo.revision,
      timestamp: new Date().toISOString(),
      command: 'createDiagram',
      elementIds: [diagram.id],
    });

    const nextHistory: MutationHistory = {
      past: [...state.history.past, state.repository],
      present: nextRepo,
      future: [],
    };

    const validation = validateSysmlRepository(nextRepo);
    const view = getView(nextRepo, coordinates, nextDiagramPresentations);
    return {
      repository: nextRepo,
      store,
      patchHistory,
      view,
      diagnostics: validation.diagnostics,
      committed: true,
      history: nextHistory,
      coordinates,
      diagramPresentations: nextDiagramPresentations,
      presentationHistory: state.presentationHistory,
      actionStack: [...(state.actionStack ?? []), 'semantic'],
      redoStack: [],
    };
  }

  if (command.type === 'addToDiagram') {
    const currentPres = diagramPresentations[command.diagramId] ?? { elementIds: [] };
    const existingSet = new Set(currentPres.elementIds);
    const alreadyPresent = command.elementIds.filter(id => existingSet.has(id));
    if (alreadyPresent.length > 0 && alreadyPresent.length === command.elementIds.length) {
      const view = getView(state.repository, coordinates, diagramPresentations);
      return {
        repository: state.repository,
        store,
        patchHistory,
        view,
        diagnostics: [{ code: 'PRESENTATION_ALREADY_EXISTS', severity: 'warning', message: `Element(s) already presented in diagram` }],
        committed: false,
        history: state.history,
        coordinates,
        diagramPresentations,
        presentationHistory: state.presentationHistory,
        actionStack: state.actionStack,
        redoStack: state.redoStack,
      };
    }

    const addedIds = command.elementIds.filter(id => !existingSet.has(id));
    const nextPres = {
      elementIds: [...currentPres.elementIds, ...addedIds],
    };
    const nextDiagramPresentations = {
      ...diagramPresentations,
      [command.diagramId]: nextPres,
    };
    store.diagramPresentations.set(command.diagramId, nextPres);

    const nextCoords = { ...coordinates };
    if (command.coordinates) {
      for (const [id, coord] of Object.entries(command.coordinates)) {
        nextCoords[id] = { ...coord };
        store.coordinates.set(id, { ...coord });
      }
    }

    const patch = createSysmlPatch({
      revision: store.revision + 1,
      forward: [{ op: 'replace', collection: 'diagramPresentations', id: command.diagramId, oldValue: currentPres, value: nextPres }],
      inverse: [{ op: 'replace', collection: 'diagramPresentations', id: command.diagramId, oldValue: nextPres, value: currentPres }],
      description: `addToDiagram ${command.diagramId}`,
    });
    pushPatch(patchHistory, patch, store);

    const validation = validateSysmlRepository(state.repository);
    const view = getView(state.repository, nextCoords, nextDiagramPresentations, command.diagramId);
    return {
      repository: state.repository,
      store,
      patchHistory,
      view,
      diagnostics: validation.diagnostics,
      committed: true,
      history: state.history,
      coordinates: nextCoords,
      diagramPresentations: nextDiagramPresentations,
      presentationHistory: state.presentationHistory,
      actionStack: [...(state.actionStack ?? []), 'presentation'],
      redoStack: [],
    };
  }

  if (command.type === 'batch') {
    if (command.commands.length === 0) {
      const view = getView(state.repository, coordinates, diagramPresentations);
      return {
        repository: state.repository,
        store,
        patchHistory,
        view,
        diagnostics: [],
        committed: true,
        history: state.history,
        coordinates,
        diagramPresentations,
        presentationHistory: state.presentationHistory,
        actionStack: state.actionStack,
        redoStack: state.redoStack,
      };
    }
    let currentState: SysmlGatewayState = state;
    let lastResult: SysmlCommandResult | undefined;
    for (const subCmd of command.commands) {
      const res = executeSysmlCommand(currentState, subCmd);
      if (!res.committed || res.diagnostics.some(d => d.severity === 'error')) {
        const view = getView(state.repository, coordinates, diagramPresentations);
        return {
          repository: state.repository,
          store,
          patchHistory,
          view,
          diagnostics: res.diagnostics,
          committed: false,
          history: state.history,
          coordinates,
          diagramPresentations,
          presentationHistory: state.presentationHistory,
          actionStack: state.actionStack,
          redoStack: state.redoStack,
        };
      }
      lastResult = res;
      currentState = res;
    }
    return {
      ...lastResult!,
      actionStack: [...(state.actionStack ?? []), 'semantic'],
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
    diagramPresentations: state.diagramPresentations ?? {},
    timestamp: new Date().toISOString(),
  };
}

export function loadCanonicalSysmlProject(payload: Record<string, unknown>): {
  repository: SysmlRepository;
  store: NormalizedSysmlStore;
  view: LegacySysmlView;
  coordinates: Record<string, PresentationCoordinates>;
  diagramPresentations: Record<string, { elementIds: string[] }>;
  valid: boolean;
  diagnostics: SysmlDiagnostic[];
  interchangeReport: InterchangeReport;
  quarantinedRelationshipIds: string[];
  quarantinedConnectorIds: string[];
} {
  const coordinates = (payload.sysmlCoordinates as Record<string, PresentationCoordinates>) ?? {};
  const diagramPresentations = (payload.diagramPresentations as Record<string, { elementIds: string[] }>) ?? {};
  const rawRepo = payload.sysmlRepository;

  if (!rawRepo) {
    // Fallback: migrate legacy payload
    const loadRes = loadRepository(payload);
    const store = fromRepository(loadRes.repository, coordinates, diagramPresentations);
    const view = getCachedLegacyView(store);
    return {
      repository: loadRes.repository,
      store,
      view,
      coordinates,
      diagramPresentations,
      valid: loadRes.valid,
      diagnostics: loadRes.diagnostics,
      interchangeReport: loadRes.interchangeReport,
      quarantinedRelationshipIds: loadRes.interchangeReport.quarantinedRelationshipIds,
      quarantinedConnectorIds: loadRes.interchangeReport.quarantinedConnectorIds,
    };
  }

  const loadRes = loadRepository(rawRepo);
  const store = fromRepository(loadRes.repository, coordinates, diagramPresentations);
  const view = getCachedLegacyView(store);

  return {
    repository: loadRes.repository,
    store,
    view,
    coordinates,
    diagramPresentations,
    valid: loadRes.valid,
    diagnostics: loadRes.diagnostics,
    interchangeReport: loadRes.interchangeReport,
    quarantinedRelationshipIds: loadRes.interchangeReport.quarantinedRelationshipIds,
    quarantinedConnectorIds: loadRes.interchangeReport.quarantinedConnectorIds,
  };
}

/**
 * Task 7: loss-reporting legacy projection. The view itself is unchanged
 * (projection-only); the report records every canonical construct that has
 * no legacy-diagram element so imports/exports never silently drop evidence,
 * baselines, artifacts, port usages, inheritance, or verification links.
 */
export function projectLegacyViewWithInterchangeReport(
  repository: SysmlRepository,
  coordinates: Record<string, PresentationCoordinates> = {},
  diagramPresentations: Record<string, { elementIds: string[] }> = {},
  diagramId?: string,
): { view: LegacySysmlView; interchangeReport: InterchangeReport } {
  return {
    view: projectLegacyDiagram(repository, coordinates, diagramPresentations, diagramId),
    interchangeReport: assessLegacyProjectionLoss(repository),
  };
}

/**
 * Task 7: loss-reporting OPM interchange. One-directional SysML -> OPM
 * projection; the report qualifies every conceptual-only / unsupported
 * mapping with an explicit loss entry.
 */
export function projectOpmWithInterchangeReport(repository: SysmlRepository) {
  return { projection: projectSysmlToOpm(repository), interchangeReport: assessOpmInterchangeLoss(repository) };
}
