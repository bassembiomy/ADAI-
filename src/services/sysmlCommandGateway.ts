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
  impactSeverity,
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
import type { SemanticEndpointContext } from '../engine/sysml/semanticEndpointIndex';
import { resolveSemanticEndpoint } from '../engine/sysml/semanticEndpointIndex';
import { classifyRelationship, parsePolicyDiagnostic, policyDiagnosticsToSysml } from '../engine/sysml/policy';
import type { BlockData, ConnectorData, PackageData, PartData, RelationshipData, PortData } from '../types/sysml_types';

import { resolveType } from '../engine/sysml/services/typeResolution';
import {
  normalizeDiagramPresentations,
  stableDiagramPresentationId,
  type DiagramElementPresentation,
  type DiagramPresentation,
  type DiagramPresentationInput,
  type PresentationCoordinates,
} from '../engine/sysml/presentationState';
export type { DiagramElementPresentation, DiagramPresentation, PresentationCoordinates } from '../engine/sysml/presentationState';
export { resolveType, type ResolvedTypeOutcome, type TypeResolutionOptions } from '../engine/sysml/services/typeResolution';
import { isTypeNotFound, type TypeNotFoundResult, type CreateNewTypeAction, type TypeCandidate } from '../engine/sysml/commands/commandResult';
export { isTypeNotFound, type TypeNotFoundResult, type CreateNewTypeAction, type TypeCandidate } from '../engine/sysml/commands/commandResult';
export * from '../engine/sysml/commands/presentationCommands';
import type { OwnedFeatureIntent } from './sysmlOwnedFeatureCommands';
import { createPortDefinitionFromIntent, createPropertyDefinitionFromIntent } from './sysmlOwnedFeatureCommands';
export type { OwnedFeatureIntent } from './sysmlOwnedFeatureCommands';
export {
  dispatchSysmlCommand,
  createTransactionManager,
  type TransactionManager,
  type CommandContext,
  type CommandResult as CanonicalCommandResult,
  type SysmlCommand,
  type CreateElementCommand,
  type UpdateElementCommand,
  type RenameElementCommand,
  type MoveElementCommand,
  type DeleteElementCommand,
  type CreateRelationshipCommand,
  type UpdateRelationshipCommand,
  type DeleteRelationshipCommand,
} from '../engine/sysml/commands/dispatcher';
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

export interface LegacySysmlView {
  packages: PackageData[];
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

export interface PresentationSnapshot {
  coordinates: Record<string, PresentationCoordinates>;
  diagramPresentations: Record<string, DiagramPresentation>;
}

export type SysmlMutationCommand =
  | { type: 'createElement'; element: SysmlElement; presentation?: PresentationCoordinates; coalesceKey?: string }
  | { type: 'createAndPresent'; element: SysmlElement; diagramId: string; presentation: PresentationCoordinates }
  | { type: 'createOwnedFeature'; intent: OwnedFeatureIntent; diagramId?: string; presentation?: PresentationCoordinates; coalesceKey?: string }
  | { type: 'updateElement'; elementId: string; patch: Record<string, unknown>; coalesceKey?: string }
  | { type: 'deleteElements'; elementIds: string[]; confirmedImpactHash?: string; authorizedBaselineIds?: string[] }
  | { type: 'removeFromDiagram'; diagramId: string; elementIds: string[] }
  | { type: 'updatePresentation'; diagramId: string; elementId: string; presentation: PresentationCoordinates; style?: DiagramElementPresentation['style']; portLayouts?: DiagramElementPresentation['portLayouts']; coalesceKey?: string }
  | { type: 'moveElements'; elementIds: string[]; targetOwnerId: string; confirmedImpactHash?: string }
  | { type: 'createDiagram'; diagram: ModelDiagramDefinition }
  | { type: 'showPackageContents'; diagramId: string; packageId: string; mode: 'direct' | 'packages' | 'packageable' | 'recursive' }
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
  diagramPresentations?: Record<string, DiagramPresentation>;
  presentationHistory?: {
    past: PresentationSnapshot[];
    future: PresentationSnapshot[];
  };
  actionStack?: Array<'semantic' | 'presentation'>;
  redoStack?: Array<'semantic' | 'presentation'>;
  context?: SemanticEndpointContext;
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
  diagramPresentations: Record<string, DiagramPresentation>;
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
  initialDiagramPresentations?: Record<string, DiagramPresentationInput>,
  budgetOptions?: HistoryBudgetOptions,
  context?: SemanticEndpointContext,
): SysmlGatewayState {
  const repo = initialRepo ?? createEmptyRepository();
  const coords = initialCoordinates ?? {};
  const diagrams = normalizeDiagramPresentations(initialDiagramPresentations ?? {}, coords);
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
    context,
  };
}

export function cloneGatewayStateForTransaction(state: SysmlGatewayState): SysmlGatewayState {
  const coordinates = structuredClone(state.coordinates);
  const diagramPresentations = structuredClone(state.diagramPresentations ?? {});
  return {
    ...state,
    history: structuredClone(state.history),
    patchHistory: state.patchHistory ? structuredClone(state.patchHistory) : undefined,
    coordinates,
    diagramPresentations,
    presentationHistory: state.presentationHistory ? structuredClone(state.presentationHistory) : undefined,
    actionStack: [...(state.actionStack ?? [])],
    redoStack: [...(state.redoStack ?? [])],
    store: fromRepository(state.repository, coordinates, diagramPresentations),
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
    affPres: [...(impact.affectedPresentationIds ?? [])].sort(),
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

/**
 * Presentation-layer deletion impact: `diagramId:elementId` entries for every
 * diagram presentation removed alongside the deleted semantic elements. This
 * mirrors the presentation list the explorer adapter projects for the impact
 * dialog, so the confirmation gate and the dialog agree on what is affected.
 * `removeFromDiagram` never flows through here, so presentation removal alone
 * stays confirmation-free by construction.
 */
export function collectAffectedPresentationIds(
  deletedElementIds: readonly string[],
  diagramPresentations: Record<string, DiagramPresentationInput> | undefined,
): string[] {
  const deleted = new Set(deletedElementIds);
  const affected = new Set<string>();
  for (const [diagramId, presentation] of Object.entries(diagramPresentations ?? {})) {
    for (const elementId of presentation?.elementIds ?? []) {
      if (deleted.has(elementId)) affected.add(`${diagramId}:${elementId}`);
    }
  }
  return [...affected].sort();
}

function formatMultiplicityText(m?: Multiplicity): string {
  if (!m) return '1';
  if (m.lower === m.upper) return String(m.lower);
  return `${m.lower}..${m.upper === Infinity ? '*' : m.upper}`;
}

export function projectLegacyDiagram(
  repository: SysmlRepository,
  coordinates: Record<string, PresentationCoordinates> = {},
  diagramPresentations: Record<string, DiagramPresentationInput> = {},
  diagramId?: string,
): LegacySysmlView {
  const packages: PackageData[] = [];
  const blocks: BlockData[] = [];
  const parts: PartData[] = [];
  const relationships: RelationshipData[] = [];
  const connectors: ConnectorData[] = [];
  const satisfiedReqIdsBySource = new Map<string, string[]>();
  for (const relationship of Object.values(repository.relationships)) {
    if (relationship.kind !== 'satisfy') continue;
    const requirementIds = satisfiedReqIdsBySource.get(relationship.sourceId) ?? [];
    requirementIds.push(relationship.targetId);
    satisfiedReqIdsBySource.set(relationship.sourceId, requirementIds);
  }

  const visibleFilter = diagramId
    ? new Set(diagramPresentations[diagramId]?.elementIds ?? [])
    : null;
  const hiddenFilter = diagramId
    ? new Set(diagramPresentations[diagramId]?.hiddenElementIds ?? [])
    : null;
  const isVisible = (id: string) => visibleFilter === null || visibleFilter.has(id);
  const coordinatesFor = (semanticElementId: string): PresentationCoordinates =>
    (diagramId ? diagramPresentations[diagramId]?.presentations?.[semanticElementId]?.bounds : undefined)
      ?? coordinates[semanticElementId]
      ?? {};

  // Project UML Packages as their own presentation kind. A package shown on
  // a SysML diagram remains the same repository Package; it is never converted
  // into or duplicated as a Block.
  for (const pkg of Object.values(repository.packages)) {
    if (pkg.id === 'model' || !isVisible(pkg.id)) continue;
    const coords = coordinatesFor(pkg.id);
    packages.push({
      id: pkg.id,
      name: pkg.name,
      ownerId: pkg.ownerId,
      namespace: pkg.namespace,
      x: coords.x ?? 0,
      y: coords.y ?? 0,
      width: coords.width ?? 220,
      height: coords.height ?? 140,
    });
  }

  // Project definitions (blocks, valueTypes, interfaces)
  for (const def of Object.values(repository.definitions)) {
    if (!isVisible(def.id)) continue;
    const coords = coordinatesFor(def.id);
    if (def.kind === 'block') {
      const b = def as BlockDefinition;
      const legacyPorts: PortData[] = (b.ports ?? []).map(p => ({
        id: p.id,
        name: p.name,
        direction: p.direction,
        type: p.typeId,
        kind: p.kind,
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
          type: repository.definitions[prop.typeId]?.name ?? prop.typeId,
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
        satisfiedReqIds: satisfiedReqIdsBySource.get(b.id) ?? [],
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
    const coords = coordinatesFor(req.id);
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
    const coords = coordinatesFor(vc.id);
    blocks.push({
      id: vc.id,
      name: vc.name,
      // SysML v1.6 normative stereotype is 'testCase' (ADIA_EXTENSION maps legacy repository verificationCases to testCase)
      stereotype: 'testCase',
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
    const coords = coordinatesFor(usage.id);
      parts.push({
        id: usage.id,
        propertyId: usage.propertyId,
        name: usage.name,
        blockId: usage.ownerId,
        parentBlockId: usage.ownerId,
        typeId: usage.typeId,
        typeBlockId: usage.typeId,
        multiplicity: formatMultiplicityText(usage.multiplicity),
        satisfiedReqIds: satisfiedReqIdsBySource.get(usage.id) ?? [],
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
      const usage = repository.usages[portUsageId];
      if (usage && usage.kind === 'port') {
        return { partId: usage.ownerId, portId: usage.definitionId };
      }
      if (portUsageId.includes('::')) {
        const [partId, portId] = portUsageId.split('::');
        return { partId, portId };
      }
      return { partId: conn.ownerId, portId: portUsageId };
    };
    const src = parseEndpoint(conn.sourcePortId);
    const tgt = parseEndpoint(conn.targetPortId);

    if (!isVisible(conn.id)) {
      if (!isVisible(src.partId) || !isVisible(tgt.partId)) continue;
    }

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
    if (hiddenFilter?.has(rel.id)) continue;
    if (!isVisible(rel.id)) {
      if (!isVisible(rel.sourceId) || !isVisible(rel.targetId)) continue;
    }
    let legacyType: RelationshipData['type'] = 'trace';
    if (rel.kind === 'deriveReqt') legacyType = 'derive';
    else if (rel.kind === 'sharedAggregation') legacyType = 'aggregation';
    else if (
      rel.kind === 'packageImport' ||
      rel.kind === 'elementImport' ||
      rel.kind === 'packageMerge' ||
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
      label: rel.kind === 'packageImport' ? (rel.visibility === 'private' ? '«access»' : '«import»')
        : rel.kind === 'elementImport' ? `«elementImport»${rel.alias ? ` ${rel.alias}` : ''}`
        : rel.kind === 'packageMerge' ? '«merge»' : rel.name ?? '',
      sourceMultiplicity: rel.sourceMultiplicity ? formatMultiplicityText(rel.sourceMultiplicity) : undefined,
      targetMultiplicity: rel.targetMultiplicity ? formatMultiplicityText(rel.targetMultiplicity) : undefined,
    });
  }

  return { packages, blocks, relationships, parts, connectors };
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
    repo.packages[id] ||
    repo.diagrams[id] ||
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

function isLegacyDiagramId(id: string): boolean {
  // Mode-only pseudo-IDs predate exact-ID diagrams (navigation treats the
  // same set — 'bdd', 'requirements', 'rtm', 'package' — as non-diagrams).
  // 'ibd' is retained: block-context commands address the literal mode tab.
  return id === 'bdd' || id === 'requirements' || id === 'rtm' || id === 'ibd' || id === 'package';
}

function repositoryHasSemanticId(repo: SysmlRepository, id: string): boolean {
  if (elementExistsInRepository(repo, id)) return true;
  return Object.values(repo.definitions).some(definition => definition.kind === 'block'
    && [...definition.properties, ...definition.ports].some(feature => feature.id === id));
}

// ---------------------------------------------------------------------------
// Task 4 §3.4 preflight enrichment (Finding 2 review fix).
//
// Direction-code mapping across layers for the same defect (verdict is always
// "reject"; only the code/message shape differs by layer):
// - Admission/preflight (this gate, via validateCanonicalRelationshipCandidate
//   → classifyRelationship → evaluateSysmlConnection in connectionPolicy.ts)
//   emits the specific policy code, e.g. INVALID_SATISFY_DIRECTION for a
//   reversed Requirement-to-State satisfy.
// - The validation layer's generic direction check (validation.ts
//   checkRelationshipDirection) reports the same defect as
//   INVALID_RELATIONSHIP_DIRECTION, with kind, source id+family, target
//   id+family, reason, and corrective action in the message.
// - policy.ts requirementDirectionValid appends the secondary
//   INVALID_REQUIREMENT_RELATION_DIRECTION for RTM kinds (also emitted by
//   requirements.ts for containment relations).
// The gate re-attaches those same five structured elements below so
// preflight rejections carry what validation carries. Admission behavior is
// unchanged: rejection, no mutation. Reason text is re-queried from
// classifyRelationship (single source of truth); only the corrective-action
// strings are mirrored here because they are dropped when the policy
// stringifies diagnostics to `CODE: message` (see connectionPolicy.ts).
// ---------------------------------------------------------------------------

function admissionEndpointFamily(
  repo: SysmlRepository, id: string, context?: SemanticEndpointContext,
): string {
  if (repo.requirements[id]) return 'requirement';
  if (repo.verificationCases[id]) return 'verificationCase';
  return resolveSemanticEndpoint(repo, id, context)?.family ?? 'unknown';
}

function relationshipCorrectiveAction(
  code: string, sourceFamily: string, targetFamily: string,
): string {
  switch (code) {
    case 'INVALID_SATISFY_DIRECTION':
      return sourceFamily === 'requirement' && targetFamily === 'state'
        ? 'Connect the State to the Requirement, not the Requirement to the State.'
        : 'Connect the design element, Part, or State to a Requirement.';
    case 'INVALID_VERIFY_DIRECTION':
      return 'Connect a Verification Case or State to the Requirement it verifies.';
    case 'INVALID_REFINE_DIRECTION':
      return 'Connect a model element to the Requirement it refines.';
    case 'INVALID_REQUIREMENT_RELATION_DIRECTION':
    case 'INVALID_REQUIREMENT_CONTAINMENT_ENDPOINT':
      return 'Connect the appropriate Requirement endpoints.';
    case 'INVALID_TRACE_ENDPOINTS':
      return 'Connect one endpoint to a Requirement.';
    default:
      return 'Choose endpoints legal for this relationship kind.';
  }
}

function enrichedRelationshipRejection(
  repo: SysmlRepository,
  candidate: SysmlRelationship,
  codes: readonly string[],
  context: SemanticEndpointContext | undefined,
  verb: 'rejected' | 'update rejected',
): SysmlDiagnostic[] {
  const staged: SysmlRepository = {
    ...repo, relationships: { ...repo.relationships, [candidate.id]: candidate },
  };
  const reasonByCode = new Map<string, string>();
  for (const entry of classifyRelationship(staged, candidate.id, context).diagnostics) {
    const { code, message } = parsePolicyDiagnostic(entry);
    if (!reasonByCode.has(code)) reasonByCode.set(code, message);
  }
  const sourceFamily = admissionEndpointFamily(repo, candidate.sourceId, context);
  const targetFamily = admissionEndpointFamily(repo, candidate.targetId, context);
  return codes.map(code => {
    const reason = reasonByCode.get(code) ?? code;
    const action = relationshipCorrectiveAction(code, sourceFamily, targetFamily);
    return {
      code,
      severity: 'error' as const,
      elementId: candidate.id,
      message:
        `Relationship ${candidate.id} ${verb}: ${code} — ` +
        `${candidate.kind} source ${candidate.sourceId} (${sourceFamily}) to ` +
        `target ${candidate.targetId} (${targetFamily}). ${reason} ${action}`,
    };
  });
}

function gateCreateElement(repo: SysmlRepository, element: SysmlElement, context?: SemanticEndpointContext): SysmlDiagnostic[] | null {
  if (elementExistsInRepository(repo, element.id)) {
    return [{
      code: 'DUPLICATE_ELEMENT_ID',
      severity: 'error' as const,
      elementId: element.id,
      message: `Element ${element.id} rejected: DUPLICATE_ELEMENT_ID (already exists)`,
    }];
  }
  if (isRelationshipElement(element)) {
    const verdict = validateCanonicalRelationshipCandidate(repo, element, context);
    if (!verdict.valid) {
      return enrichedRelationshipRejection(repo, element, verdict.codes, context, 'rejected');
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
  repo: SysmlRepository, elementId: string, patch: Record<string, unknown>, context?: SemanticEndpointContext,
): SysmlDiagnostic[] | null {
  if ('ownerId' in patch) {
    const existing = repo.definitions[elementId] || repo.packages[elementId] || repo.requirements[elementId] || repo.diagrams[elementId] || repo.usages[elementId] || repo.connectors[elementId] || repo.relationships[elementId] || repo.verificationCases[elementId];
    if (existing && 'ownerId' in existing && patch.ownerId !== (existing as any).ownerId) {
      return [{
        code: 'OWNERSHIP_CHANGE_REQUIRES_MOVE',
        severity: 'error' as const,
        elementId,
        message: 'Direct modification of ownerId via updateElement is not allowed. Use the explicit moveElements command to change ownership.',
      }];
    }
  }
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
    const verdict = validateCanonicalRelationshipCandidate({ ...staged, relationships: rest }, candidate, context);
    if (!verdict.valid) {
      return enrichedRelationshipRejection(repo, candidate, verdict.codes, context, 'update rejected');
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
  context?: SemanticEndpointContext,
): SysmlCommandResult {
  const endpointContext = context ?? state.context;
  const coordinates = { ...state.coordinates };
  const diagramPresentations = normalizeDiagramPresentations(state.diagramPresentations ?? {}, coordinates);
  const store = state.store ?? fromRepository(state.repository, coordinates, diagramPresentations);
  store.coordinates = new Map(Object.entries(coordinates));
  store.diagramPresentations = new Map(Object.entries(diagramPresentations));
  store.indexes.diagramId.clear();
  for (const [diagramId, presentation] of Object.entries(diagramPresentations)) {
    store.indexes.diagramId.set(diagramId, new Set(presentation.elementIds));
  }
  const patchHistory = state.patchHistory ?? createPatchHistory();

  const getView = (
    repo: SysmlRepository,
    coords: Record<string, PresentationCoordinates>,
    diagrams: Record<string, DiagramPresentation>,
    diagramIdOverride?: string,
  ): LegacySysmlView => {
    const diagId = diagramIdOverride ?? activeDiagramId;
    if (store) {
      return getCachedLegacyView(store, diagId);
    }
    return projectLegacyDiagram(repo, coords, diagrams, diagId);
  };

  const reject = (code: string, message: string, elementId?: string): SysmlCommandResult => ({
    repository: state.repository,
    store,
    patchHistory,
    view: getView(state.repository, coordinates, diagramPresentations),
    diagnostics: [{ code, severity: 'error', message, elementId }],
    committed: false,
    history: state.history,
    coordinates,
    diagramPresentations,
    presentationHistory: state.presentationHistory,
    actionStack: state.actionStack,
    redoStack: state.redoStack,
  });

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
        const validation = validateSysmlRepository(repo, endpointContext);
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
          const validation = validateSysmlRepository(state.repository, endpointContext);
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

    const validation = validateSysmlRepository(repo, endpointContext);
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
        const validation = validateSysmlRepository(repo, endpointContext);
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
          const validation = validateSysmlRepository(state.repository, endpointContext);
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

    const validation = validateSysmlRepository(repo, endpointContext);
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
    let targetDiagramId = command.diagramId;
    let currentDiagram = diagramPresentations[targetDiagramId];
    const fallbackDiagramId = targetDiagramId === 'adia-default-bdd' ? 'bdd'
      : targetDiagramId === 'bdd' ? 'adia-default-bdd'
      : targetDiagramId === 'adia-default-requirements' ? 'requirements'
      : targetDiagramId === 'requirements' ? 'adia-default-requirements'
      : undefined;

    if (fallbackDiagramId && (!currentDiagram || !currentDiagram.elementIds.includes(command.elementId)) && diagramPresentations[fallbackDiagramId]?.elementIds.includes(command.elementId)) {
      targetDiagramId = fallbackDiagramId;
      currentDiagram = diagramPresentations[targetDiagramId];
    }

    if (!targetDiagramId || (!currentDiagram && !state.repository.definitions?.[targetDiagramId])) {
      return {
        repository: state.repository,
        store,
        patchHistory,
        view: getView(state.repository, coordinates, diagramPresentations),
        diagnostics: [{
          code: 'DIAGRAM_NOT_FOUND',
          severity: 'error',
          elementId: command.elementId,
          message: 'A valid active diagram is required to update a presentation.',
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
    if (!currentDiagram) {
      currentDiagram = { elementIds: [targetDiagramId], presentations: {} };
    }
    const isContextBlock = command.elementId === targetDiagramId;
    if (!currentDiagram.elementIds.includes(command.elementId) && !isContextBlock) {
      return {
        repository: state.repository,
        store,
        patchHistory,
        view: getView(state.repository, coordinates, diagramPresentations, targetDiagramId),
        diagnostics: [{
          code: 'PRESENTATION_NOT_FOUND',
          severity: 'error',
          elementId: command.elementId,
          message: `Element '${command.elementId}' is not presented on diagram '${targetDiagramId}'.`,
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
    if (isContextBlock && !currentDiagram.elementIds.includes(command.elementId)) {
      currentDiagram = {
        ...currentDiagram,
        elementIds: [...currentDiagram.elementIds, command.elementId],
      };
    }
    const previousDiagram = currentDiagram;
    const existingPresentation = currentDiagram.presentations[command.elementId] ?? {
      id: stableDiagramPresentationId(targetDiagramId, command.elementId),
      diagramId: targetDiagramId,
      semanticElementId: command.elementId,
      bounds: { ...(coordinates[command.elementId] ?? {}) },
    };
    const nextPresentation: DiagramElementPresentation = {
      ...existingPresentation,
      bounds: { ...existingPresentation.bounds, ...command.presentation },
      style: command.style ?? existingPresentation.style,
      portLayouts: command.portLayouts ?? existingPresentation.portLayouts,
    };
    const nextDiagram: DiagramPresentation = {
      ...currentDiagram,
      presentations: { ...currentDiagram.presentations, [command.elementId]: nextPresentation },
    };
    const nextDiagramPresentations = { ...diagramPresentations, [targetDiagramId]: nextDiagram };
    store.diagramPresentations.set(targetDiagramId, nextDiagram);
    if (command.diagramId && command.diagramId !== targetDiagramId) {
      const pairedDiagram = diagramPresentations[command.diagramId] ?? { elementIds: [], presentations: {} };
      const nextPaired: DiagramPresentation = {
        ...pairedDiagram,
        elementIds: pairedDiagram.elementIds.includes(command.elementId) ? pairedDiagram.elementIds : [...pairedDiagram.elementIds, command.elementId],
        presentations: { ...pairedDiagram.presentations, [command.elementId]: nextPresentation },
      };
      nextDiagramPresentations[command.diagramId] = nextPaired;
      store.diagramPresentations.set(command.diagramId, nextPaired);
    }
    store.revision += 1;

    const patch = createSysmlPatch({
      revision: state.repository.revision,
      coalesceKey: command.coalesceKey,
      forward: [{ op: 'replace', collection: 'diagramPresentations', id: targetDiagramId, oldValue: previousDiagram, value: nextDiagram }],
      inverse: [{ op: 'replace', collection: 'diagramPresentations', id: targetDiagramId, oldValue: nextDiagram, value: previousDiagram }],
      description: 'updatePresentation',
    });
    pushPatch(patchHistory, patch, store);

    const validation = validateSysmlRepository(state.repository, endpointContext);
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
      presentationHistory: state.presentationHistory,
      actionStack: [...(state.actionStack ?? []), 'presentation'],
      redoStack: [],
    };
  }

  if (command.type === 'createAndPresent') {
    if (!command.diagramId) {
      const view = getView(state.repository, coordinates, diagramPresentations);
      return {
        repository: state.repository,
        store,
        patchHistory,
        view,
        diagnostics: [{
          code: 'DIAGRAM_NOT_FOUND',
          severity: 'error',
          elementId: command.element.id,
          message: 'An active diagram is required for createAndPresent',
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
    const isBlockIbdContext = state.repository.definitions[command.diagramId]?.kind === 'block';
    if (!['bdd', 'requirements', 'ibd', 'rtm'].includes(command.diagramId) && !state.repository.diagrams[command.diagramId] && !isBlockIbdContext) {
      const view = getView(state.repository, coordinates, diagramPresentations);
      return {
        repository: state.repository, store, patchHistory, view,
        diagnostics: [{ code: 'DIAGRAM_NOT_FOUND', severity: 'error', elementId: command.element.id, message: `Diagram '${command.diagramId}' does not exist.` }],
        committed: false, history: state.history, coordinates, diagramPresentations,
        presentationHistory: state.presentationHistory, actionStack: state.actionStack, redoStack: state.redoStack,
      };
    }
    return executeSysmlCommand(state, {
      type: 'batch',
      commands: [
        { type: 'createElement', element: command.element },
        {
          type: 'addToDiagram',
          diagramId: command.diagramId,
          elementIds: [command.element.id],
          coordinates: { [command.element.id]: command.presentation },
        },
      ],
    }, command.diagramId, endpointContext);
  }

  if (command.type === 'createOwnedFeature') {
    const { intent } = command;
    const owner = state.repository.definitions[intent.ownerBlockId] as BlockDefinition | undefined;
    if (!owner || owner.kind !== 'block') {
      return reject('ELEMENT_NOT_FOUND', `Owner block "${intent.ownerBlockId}" does not exist.`, intent.ownerBlockId);
    }

    if (command.diagramId) {
      const isBlockIbdContext = state.repository.definitions[command.diagramId]?.kind === 'block';
      if (isBlockIbdContext && command.diagramId !== intent.ownerBlockId) {
        return reject('OWNER_CONTEXT_MISMATCH', `Part owner '${intent.ownerBlockId}' does not match active IBD context '${command.diagramId}'.`, intent.ownerBlockId);
      }
      const isKnownDiagram =
        ['bdd', 'requirements', 'ibd', 'rtm', 'package'].includes(command.diagramId) ||
        Boolean(state.repository.diagrams[command.diagramId]) ||
        Boolean(diagramPresentations[command.diagramId]) ||
        isBlockIbdContext;
      if (!isKnownDiagram) {
        return reject('DIAGRAM_NOT_FOUND', `Diagram '${command.diagramId}' does not exist.`, command.diagramId);
      }
    }

    // -----------------------------------------------------------------------
    // Task 3 atomic admission: every semantic ID is checked before staging.
    // Both generated and caller-provided feature and usage IDs are checked
    // against every canonical repository collection (packages, diagrams,
    // definitions, usages, connectors, relationships, requirements,
    // verificationCases, evidence, baselines, artifacts, actors, subjects,
    // useCases, extensionPoints, diagramReferences via
    // repositoryHasSemanticId) plus nested block feature namespaces
    // (properties/ports). Nothing is staged or mutated below until all IDs
    // are admitted. Rejection leaves repository, history, store,
    // presentation, and projections untouched with committed: false.
    // -----------------------------------------------------------------------
    const featureId =
      intent.featureId ||
      `${intent.featureKind === 'port' ? 'port' : 'prop'}-${Math.random().toString(36).slice(2, 9)}`;

    if (repositoryHasSemanticId(state.repository, featureId)) {
      return reject('DUPLICATE_SEMANTIC_ID', `Feature ID '${featureId}' is already used in the repository.`, featureId);
    }

    // The companion usage record for part/reference properties shares the
    // global semantic ID namespace, so its generated (`part-<featureId>`)
    // or caller-provided ID is admitted up front as well, including
    // self-collision with the staged feature ID itself.
    const pendingUsageId =
      intent.featureKind === 'property' && (intent.propertyKind === 'part' || intent.propertyKind === 'reference')
        ? intent.usageId || `part-${featureId}`
        : undefined;
    if (pendingUsageId) {
      if (pendingUsageId === featureId || repositoryHasSemanticId(state.repository, pendingUsageId)) {
        return reject('DUPLICATE_USAGE_ID', `Usage ID '${pendingUsageId}' is already used in the repository.`, pendingUsageId);
      }
    }

    let nextCandidateBlock: BlockDefinition;

    let createdUsage: PartUsage | undefined;

    if (intent.featureKind === 'port') {
      if (!intent.typeId && intent.portKind !== 'umlPort') {
        return reject('TYPE_NOT_FOUND', `A compatible type is required for ${intent.portKind}.`, intent.ownerBlockId);
      }
      const typeDef = intent.typeId ? state.repository.definitions[intent.typeId] : undefined;
      if (intent.typeId && !typeDef) {
        return reject('TYPE_NOT_FOUND', `Type "${intent.typeId}" not found in repository.`, intent.ownerBlockId);
      }
      if (intent.portKind === 'proxyPort') {
        const isInterfaceBlock =
          typeDef &&
          (typeDef.kind === 'interface' ||
            (typeDef as any).metaclass === 'InterfaceBlock' ||
            (typeDef as any).stereotype === 'interfaceBlock');
        if (!isInterfaceBlock) {
          return reject(
            'INVALID_PROXY_PORT_TYPE',
            `ProxyPort must be typed by an InterfaceBlock, but "${typeDef?.name ?? 'unknown'}" is a ${typeDef?.kind ?? 'unknown'}.`,
            intent.ownerBlockId,
          );
        }
      }
      if (intent.portKind === 'fullPort') {
        const isBlockOrValue =
          typeDef &&
          (typeDef.kind === 'block' ||
            typeDef.kind === 'valueType' ||
            (typeDef as any).metaclass === 'Block' ||
            (typeDef as any).metaclass === 'ValueType');
        if (!isBlockOrValue) {
          return reject('INVALID_FULL_PORT_TYPE', `FullPort must be typed by a Block or ValueType.`, intent.ownerBlockId);
        }
      }

      const port = createPortDefinitionFromIntent(owner, { ...intent, featureId });
      nextCandidateBlock = {
        ...owner,
        ports: [...(owner.ports ?? []), port],
      };
    } else {
      if (!intent.typeId) {
        return reject(
          'TYPE_NOT_FOUND',
          `A compatible type is required for ${intent.propertyKind} property.`,
          intent.ownerBlockId,
        );
      }
      const typeDef = state.repository.definitions[intent.typeId];
      if (!typeDef) {
        return reject('TYPE_NOT_FOUND', `Type "${intent.typeId}" not found in repository.`, intent.ownerBlockId);
      }
      if ((intent.propertyKind === 'part' || intent.propertyKind === 'reference') && typeDef.kind !== 'block') {
        return reject(
          'INVALID_PROPERTY_TYPE',
          `${intent.propertyKind} property must be typed by a Block, but "${typeDef.name}" is a ${typeDef.kind}.`,
          intent.ownerBlockId,
        );
      }
      if (intent.propertyKind === 'value' && typeDef.kind !== 'valueType') {
        return reject(
          'INVALID_PROPERTY_TYPE',
          `Value property must be typed by a ValueType, but "${typeDef.name}" is a ${typeDef.kind}.`,
          intent.ownerBlockId,
        );
      }

      const property = createPropertyDefinitionFromIntent(owner, { ...intent, featureId });
      nextCandidateBlock = {
        ...owner,
        properties: [...(owner.properties ?? []), property],
      };

      if (intent.propertyKind === 'part' || intent.propertyKind === 'reference') {
        // pendingUsageId was admitted against every repo namespace above.
        const usageId = pendingUsageId ?? `part-${featureId}`;
        createdUsage = {
          id: usageId,
          propertyId: featureId,
          kind: 'part',
          name: intent.name || featureId,
          ownerId: owner.id,
          typeId: intent.typeId,
          aggregation: intent.propertyKind === 'reference' ? 'reference' : 'composite',
          multiplicity: property.multiplicity ?? { lower: 1, upper: 1, ordered: false, unique: true },
        };
      }
    }

    const stagedRepo: SysmlRepository = {
      ...state.repository,
      definitions: {
        ...state.repository.definitions,
        [owner.id]: nextCandidateBlock,
      },
      usages: createdUsage
        ? {
            ...state.repository.usages,
            [createdUsage.id]: createdUsage,
          }
        : state.repository.usages,
    };
    // -----------------------------------------------------------------------
    // Task 3 staged validation: the complete staged repository receives full
    // semantic validation plus Port/property constraints BEFORE store,
    // history, persistence, or projection state is touched. Any error
    // returns committed: false with the original revision and state; only a
    // clean staged repo proceeds to the single atomic transaction below.
    // validateSysmlRepository already includes validateRepositoryPorts, so no
    // separate port pass is appended here (that would double-count port
    // diagnostics).
    // -----------------------------------------------------------------------
    const stagedValidation = validateSysmlRepository(stagedRepo, endpointContext);
    const stagedErrors = stagedValidation.diagnostics.filter(d => d.severity === 'error');
    if (stagedErrors.length > 0) {
      const view = getView(state.repository, coordinates, diagramPresentations);
      return {
        repository: state.repository,
        store,
        patchHistory,
        view,
        diagnostics: stagedErrors,
        committed: false,
        history: state.history,
        coordinates,
        diagramPresentations,
        presentationHistory: state.presentationHistory,
        actionStack: state.actionStack,
        redoStack: state.redoStack,
      };
    }

    // Pure presentation staging: no store/history mutation yet.
    const nextCoordinates = { ...coordinates };
    let nextDiagramPresentations = { ...diagramPresentations };

    if (command.presentation) {
      nextCoordinates[featureId] = { ...command.presentation };
      const isIbdBlockContext = Boolean(
        command.diagramId && state.repository.definitions[command.diagramId]?.kind === 'block',
      );
      if (createdUsage && isIbdBlockContext) {
        // PartProperty is represented semantically by both its owned feature
        // and a PartUsage projection. IBD renders the usage, so persist its
        // own presentation record and bounds in the same atomic command.
        nextCoordinates[createdUsage.id] = { ...command.presentation };
      }
      if (command.diagramId) {
        const diagPres = nextDiagramPresentations[command.diagramId] ?? {
          elementIds: [owner.id],
          presentations: {},
        };
        const ownerPres = diagPres.presentations[owner.id] ?? {
          id: stableDiagramPresentationId(command.diagramId, owner.id),
          diagramId: command.diagramId,
          semanticElementId: owner.id,
          bounds: { ...(nextCoordinates[owner.id] ?? {}) },
        };
        const updatedOwnerPres = {
          ...ownerPres,
          featureLayouts: {
            ...(ownerPres.featureLayouts ?? {}),
            [featureId]: { ...command.presentation },
          },
        };
        const isIbdBlockContext = state.repository.definitions[command.diagramId]?.kind === 'block';
        const nextElementIds = createdUsage && isIbdBlockContext
          ? [...new Set([...diagPres.elementIds, createdUsage.id])]
          : diagPres.elementIds;
        const nextPresentations = {
          ...diagPres.presentations,
          [owner.id]: updatedOwnerPres,
          ...(createdUsage && isIbdBlockContext ? {
            [createdUsage.id]: {
              id: stableDiagramPresentationId(command.diagramId, createdUsage.id),
              diagramId: command.diagramId,
              semanticElementId: createdUsage.id,
              bounds: { ...command.presentation },
            },
          } : {}),
        };
        nextDiagramPresentations = {
          ...nextDiagramPresentations,
          [command.diagramId]: {
            ...diagPres,
            elementIds: nextElementIds,
            presentations: nextPresentations,
          },
        };
      }
    }

    const nextRepo: SysmlRepository = {
      ...stagedRepo,
      revision: state.repository.revision + 1,
      auditTrail: [
        ...state.repository.auditTrail,
        {
          id: `change-${state.repository.revision + 1}-${featureId}`,
          revision: state.repository.revision + 1,
          timestamp: new Date().toISOString(),
          command: 'createOwnedFeature',
          elementIds: [owner.id, featureId, ...(createdUsage ? [createdUsage.id] : [])],
        },
      ],
    };

    // Final guard on the exact committed revision: a successful result can
    // never carry error-severity diagnostics. Any error aborts with the
    // original revision and state before repository, presentation,
    // persistence, or history is applied.
    const finalValidation = validateSysmlRepository(nextRepo, endpointContext);
    if (finalValidation.diagnostics.some(d => d.severity === 'error')) {
      const view = getView(state.repository, coordinates, diagramPresentations);
      return {
        repository: state.repository,
        store,
        patchHistory,
        view,
        diagnostics: finalValidation.diagnostics.filter(d => d.severity === 'error'),
        committed: false,
        history: state.history,
        coordinates,
        diagramPresentations,
        presentationHistory: state.presentationHistory,
        actionStack: state.actionStack,
        redoStack: state.redoStack,
      };
    }

    // Single atomic transaction: repository, store projection, presentation,
    // persistence records, and exactly one undo entry.
    upsertEntity(store, 'definitions', nextCandidateBlock);
    if (createdUsage) {
      upsertEntity(store, 'usages', createdUsage);
    }
    if (command.presentation) {
      store.coordinates.set(featureId, { ...command.presentation });
      if (command.diagramId) {
        store.diagramPresentations.set(command.diagramId, nextDiagramPresentations[command.diagramId]);
        const isIbdBlockContext = state.repository.definitions[command.diagramId]?.kind === 'block';
        if (createdUsage && isIbdBlockContext) {
          store.coordinates.set(createdUsage.id, { ...command.presentation });
          store.indexes.diagramId.set(command.diagramId, new Set(nextDiagramPresentations[command.diagramId].elementIds));
        }
      }
    }

    const forwardOps: import('../engine/sysml/patches').PatchOperation[] = [
      { op: 'replace', collection: 'definitions', id: owner.id, oldValue: owner, value: nextCandidateBlock },
    ];
    const inverseOps: import('../engine/sysml/patches').PatchOperation[] = [
      { op: 'replace', collection: 'definitions', id: owner.id, oldValue: nextCandidateBlock, value: owner },
    ];
    if (createdUsage) {
      forwardOps.push({ op: 'add', collection: 'usages', id: createdUsage.id, value: createdUsage });
      inverseOps.push({ op: 'remove', collection: 'usages', id: createdUsage.id, oldValue: createdUsage });
    }
    if (command.presentation) {
      forwardOps.push({ op: 'add', collection: 'coordinates', id: featureId, value: command.presentation });
      inverseOps.push({ op: 'remove', collection: 'coordinates', id: featureId, oldValue: command.presentation });
      const isIbdBlockContext = Boolean(
        command.diagramId && state.repository.definitions[command.diagramId]?.kind === 'block',
      );
      if (createdUsage && isIbdBlockContext) {
        forwardOps.push({ op: 'add', collection: 'coordinates', id: createdUsage.id, value: command.presentation });
        inverseOps.push({ op: 'remove', collection: 'coordinates', id: createdUsage.id, oldValue: command.presentation });
      }
      if (command.diagramId) {
        const prevDiag = diagramPresentations[command.diagramId];
        const nextDiag = nextDiagramPresentations[command.diagramId];
        if (prevDiag) {
          forwardOps.push({
            op: 'replace',
            collection: 'diagramPresentations',
            id: command.diagramId,
            oldValue: prevDiag,
            value: nextDiag,
          });
          inverseOps.push({
            op: 'replace',
            collection: 'diagramPresentations',
            id: command.diagramId,
            oldValue: nextDiag,
            value: prevDiag,
          });
        } else {
          forwardOps.push({ op: 'add', collection: 'diagramPresentations', id: command.diagramId, value: nextDiag });
          inverseOps.push({
            op: 'remove',
            collection: 'diagramPresentations',
            id: command.diagramId,
            oldValue: nextDiag,
          });
        }
      }
    }

    const patch = createSysmlPatch({
      revision: nextRepo.revision,
      coalesceKey: (command as any).coalesceKey,
      forward: forwardOps,
      inverse: inverseOps,
      description: `createOwnedFeature (${intent.featureKind} ${featureId})`,
    });
    pushPatch(patchHistory, patch, store);

    const nextHistory: MutationHistory = {
      past: [],
      present: nextRepo,
      future: [],
    };
    const view = getView(nextRepo, nextCoordinates, nextDiagramPresentations, command.diagramId);

    return {
      repository: nextRepo,
      store,
      patchHistory,
      view,
      diagnostics: finalValidation.diagnostics,
      committed: true,
      history: nextHistory,
      coordinates: nextCoordinates,
      diagramPresentations: nextDiagramPresentations,
      presentationHistory: state.presentationHistory,
      actionStack: [...(state.actionStack ?? []), 'semantic'],
      redoStack: [],
    };
  }

  if (command.type === 'createElement') {
    const gateDiagnostics = gateCreateElement(state.repository, command.element, endpointContext);
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

    // Stage-first atomicity (Finding 1 review fix, Task-3 createOwnedFeature
    // pattern): build the staged repository and coordinates as pure values.
    // Store, patch history, and presentation maps stay untouched until staged
    // validation passes; any error returns committed: false with the original
    // state.
    const nextCoordinates = command.presentation
      ? { ...coordinates, [command.element.id]: { ...command.presentation } }
      : { ...coordinates };

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
    // Full semantic validation runs on the staged state BEFORE any mutation.
    // Any error aborts with the original repository/history/coordinates and
    // untouched store/patchHistory, so a success never carries errors.
    const stagedValidation = validateSysmlRepository(nextRepo, endpointContext);
    const stagedErrors = stagedValidation.diagnostics.filter(d => d.severity === 'error');
    if (stagedErrors.length > 0) {
      const view = getView(state.repository, coordinates, diagramPresentations);
      return {
        repository: state.repository,
        store,
        patchHistory,
        view,
        diagnostics: stagedErrors,
        committed: false,
        history: state.history,
        coordinates,
        diagramPresentations,
        presentationHistory: state.presentationHistory,
        actionStack: state.actionStack,
        redoStack: state.redoStack,
      };
    }

    // Single atomic transaction: store projection, persistence records, and
    // exactly one history entry.
    upsertEntity(store, collection, command.element as any);
    if (command.presentation) {
      store.coordinates.set(command.element.id, { ...command.presentation });
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
    const view = getView(nextRepo, nextCoordinates, diagramPresentations);

    return {
      repository: nextRepo,
      store,
      patchHistory,
      view,
      diagnostics: stagedValidation.diagnostics,
      committed: true,
      history: nextHistory,
      coordinates: nextCoordinates,
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
    const updateGate = gateUpdateElement(state.repository, command.elementId, command.patch, endpointContext);
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
    // Stage-first atomicity (Finding 1 review fix): the merged element is
    // staged into a pure repository value first; the store stays untouched
    // until staged validation passes.
    const nextElement = { ...existing, ...command.patch } as SysmlEntity;

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

    // Full semantic validation runs on the staged state BEFORE any mutation.
    // Any error aborts with the original repository/history and untouched
    // store/patchHistory, so a success never carries errors.
    const stagedValidation = validateSysmlRepository(nextRepo, endpointContext);
    const stagedErrors = stagedValidation.diagnostics.filter(d => d.severity === 'error');
    if (stagedErrors.length > 0) {
      const view = getView(state.repository, coordinates, diagramPresentations);
      return {
        repository: state.repository,
        store,
        patchHistory,
        view,
        diagnostics: stagedErrors,
        committed: false,
        history: state.history,
        coordinates,
        diagramPresentations,
        presentationHistory: state.presentationHistory,
        actionStack: state.actionStack,
        redoStack: state.redoStack,
      };
    }

    // Single atomic transaction: store projection, persistence records, and
    // exactly one history entry.
    upsertEntity(store, collection, nextElement);
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
    const view = getView(nextRepo, coordinates, diagramPresentations);

    return {
      repository: nextRepo,
      store,
      patchHistory,
      view,
      diagnostics: stagedValidation.diagnostics,
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
    const analyzed = analyzeMutation(state.repository, { kind: 'deleteElements', elementIds: command.elementIds });
    // Presentation-layer impact threads into the confirmation gate: a TestCase
    // (or any element) with diagram presentations but zero relationships must
    // still require impact confirmation (spec §4.5). The engine owns no
    // presentation state, so the gateway enriches the impact here and
    // re-derives severity before gating.
    const affectedPresentationIds = collectAffectedPresentationIds(analyzed.deletedElementIds, diagramPresentations);
    const impact: MutationImpact = {
      ...analyzed,
      affectedPresentationIds,
      severity: impactSeverity({ ...analyzed, affectedPresentationIds }),
    };
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

    // Task 4 note (Finding 3 deferred): direct engine callers of applyCommand
    // bypass gateway compensation and get context-blind validation. This
    // gateway delete path is the supported path for State-aware deletion.
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
    const nextDiagramPresentations: Record<string, DiagramPresentation> = {};
    for (const [dId, pres] of Object.entries(diagramPresentations)) {
      if (impact.deletedElementIds.includes(dId)) {
        forwardOps.push({ op: 'remove', collection: 'diagramPresentations', id: dId, oldValue: pres });
        inverseOps.unshift({ op: 'add', collection: 'diagramPresentations', id: dId, value: pres });
        store.diagramPresentations.delete(dId);
        store.indexes.diagramId.delete(dId);
        continue;
      }
      const nextIds = pres.elementIds.filter(id => !impact.deletedElementIds.includes(id));
      const nextRecord = Object.fromEntries(Object.entries(pres.presentations)
        .filter(([semanticElementId]) => !impact.deletedElementIds.includes(semanticElementId)));
      nextDiagramPresentations[dId] = { elementIds: nextIds, presentations: nextRecord };
      if (nextIds.length !== pres.elementIds.length) {
        forwardOps.push({ op: 'replace', collection: 'diagramPresentations', id: dId, oldValue: pres, value: nextDiagramPresentations[dId] });
        inverseOps.unshift({ op: 'replace', collection: 'diagramPresentations', id: dId, oldValue: nextDiagramPresentations[dId], value: pres });
      }
      store.diagramPresentations.set(dId, nextDiagramPresentations[dId]);
      store.indexes.diagramId.set(dId, new Set(nextIds));
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
    // Post-commit validation resolves through the same endpoint context as
    // admission, so an unrelated deletion cannot invalidate a valid
    // State-to-Requirement link whose State lives outside the repository.
    const postDeleteValidation = validateSysmlRepository(nextRepo, endpointContext);

    return {
      repository: nextRepo,
      store,
      patchHistory,
      view,
      diagnostics: postDeleteValidation.diagnostics,
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
    const currentPresentation = diagramPresentations[command.diagramId] ?? { elementIds: [], presentations: {} };
    const nextIds = currentPresentation.elementIds.filter(id => !command.elementIds.includes(id));
    const nextPresentations = Object.fromEntries(Object.entries(currentPresentation.presentations)
      .filter(([semanticElementId]) => !command.elementIds.includes(semanticElementId)));
    const hiddenElementIds = [...new Set([
      ...(currentPresentation.hiddenElementIds ?? []),
      ...command.elementIds.filter(id => Boolean(state.repository.relationships[id])),
    ])];
    const nextPresentation = {
      elementIds: nextIds,
      presentations: nextPresentations,
      ...(hiddenElementIds.length > 0 ? { hiddenElementIds } : {}),
    };
    const nextDiagramPresentations: Record<string, DiagramPresentation> = {
      ...diagramPresentations,
      [command.diagramId]: nextPresentation,
    };
    store.diagramPresentations.set(command.diagramId, nextPresentation);
    store.indexes.diagramId.set(command.diagramId, new Set(nextIds));
    store.revision += 1;

    const patch = createSysmlPatch({
      revision: store.revision,
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

    const validation = validateSysmlRepository(state.repository, endpointContext);
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

    // Stage-first atomicity (Finding 1 review fix): stage owner changes into
    // a pure repository value. The store stays untouched until staged
    // validation below passes.
    for (const elemId of command.elementIds) {
      if (nextRepo.definitions[elemId]) {
        const prevDef = nextRepo.definitions[elemId];
        const updatedDef = { ...prevDef, ownerId: targetOwnerId };
        nextRepo.definitions[elemId] = updatedDef;
        forwardOps.push({ op: 'replace', collection: 'definitions', id: elemId, oldValue: prevDef, value: updatedDef });
        inverseOps.unshift({ op: 'replace', collection: 'definitions', id: elemId, oldValue: updatedDef, value: prevDef });
      } else if (nextRepo.packages[elemId]) {
        const prevPkg = nextRepo.packages[elemId];
        const updatedPkg = { ...prevPkg, ownerId: targetOwnerId };
        nextRepo.packages[elemId] = updatedPkg;
        forwardOps.push({ op: 'replace', collection: 'packages', id: elemId, oldValue: prevPkg, value: updatedPkg });
        inverseOps.unshift({ op: 'replace', collection: 'packages', id: elemId, oldValue: updatedPkg, value: prevPkg });
      } else if (nextRepo.diagrams[elemId]) {
        const prevDiag = nextRepo.diagrams[elemId];
        const updatedDiag = { ...prevDiag, ownerId: targetOwnerId };
        nextRepo.diagrams[elemId] = updatedDiag;
        forwardOps.push({ op: 'replace', collection: 'diagrams', id: elemId, oldValue: prevDiag, value: updatedDiag });
        inverseOps.unshift({ op: 'replace', collection: 'diagrams', id: elemId, oldValue: updatedDiag, value: prevDiag });
      } else if (nextRepo.requirements[elemId]) {
        const prevReq = nextRepo.requirements[elemId];
        const updatedReq = { ...prevReq, ownerId: targetOwnerId, owner: targetOwnerId };
        nextRepo.requirements[elemId] = updatedReq;
        forwardOps.push({ op: 'replace', collection: 'requirements', id: elemId, oldValue: prevReq, value: updatedReq });
        inverseOps.unshift({ op: 'replace', collection: 'requirements', id: elemId, oldValue: updatedReq, value: prevReq });
      } else if (nextRepo.usages[elemId]) {
        const prevUsage = nextRepo.usages[elemId];
        const updatedUsage = { ...prevUsage, ownerId: targetOwnerId };
        nextRepo.usages[elemId] = updatedUsage;
        forwardOps.push({ op: 'replace', collection: 'usages', id: elemId, oldValue: prevUsage, value: updatedUsage });
        inverseOps.unshift({ op: 'replace', collection: 'usages', id: elemId, oldValue: updatedUsage, value: prevUsage });
      }
    }

    nextRepo.auditTrail.push({
      id: `change-${nextRepo.revision}-move`,
      revision: nextRepo.revision,
      timestamp: new Date().toISOString(),
      command: 'moveElements',
      elementIds: command.elementIds,
    });

    // Full semantic validation runs on the staged state BEFORE any store or
    // history mutation. Any error aborts with the original state and untouched
    // store/patchHistory, so a success never carries errors.
    const stagedValidation = validateSysmlRepository(nextRepo, endpointContext);
    const stagedErrors = stagedValidation.diagnostics.filter(d => d.severity === 'error');
    if (stagedErrors.length > 0) {
      const view = getView(state.repository, coordinates, diagramPresentations);
      return {
        repository: state.repository,
        store,
        patchHistory,
        view,
        diagnostics: stagedErrors,
        committed: false,
        history: state.history,
        coordinates,
        diagramPresentations,
        presentationHistory: state.presentationHistory,
        actionStack: state.actionStack,
        redoStack: state.redoStack,
      };
    }

    // Single atomic transaction: store projection, persistence records, and
    // exactly one history entry.
    for (const elemId of command.elementIds) {
      if (nextRepo.definitions[elemId]) upsertEntity(store, 'definitions', nextRepo.definitions[elemId]);
      else if (nextRepo.packages[elemId]) upsertEntity(store, 'packages', nextRepo.packages[elemId]);
      else if (nextRepo.diagrams[elemId]) upsertEntity(store, 'diagrams', nextRepo.diagrams[elemId]);
      else if (nextRepo.requirements[elemId]) upsertEntity(store, 'requirements', nextRepo.requirements[elemId]);
      else if (nextRepo.usages[elemId]) upsertEntity(store, 'usages', nextRepo.usages[elemId]);
    }

    const patch = createSysmlPatch({
      revision: nextRepo.revision,
      forward: forwardOps,
      inverse: inverseOps,
      description: `moveElements to ${targetOwnerId}`,
    });
    pushPatch(patchHistory, patch, store);

    const nextHistory: MutationHistory = {
      past: [...state.history.past, state.repository],
      present: nextRepo,
      future: [],
    };

    const view = getView(nextRepo, coordinates, diagramPresentations);
    return {
      repository: nextRepo,
      store,
      patchHistory,
      view,
      diagnostics: stagedValidation.diagnostics,
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
    const diagram = { ...command.diagram, ownerId: command.diagram.ownerId || 'model' };
    if (!diagram.id?.trim()) return reject('INVALID_DIAGRAM_ID', 'A diagram must have a stable semantic ID.');
    if (repositoryHasSemanticId(state.repository, diagram.id)) {
      return reject('DUPLICATE_ELEMENT_ID', `Diagram ID '${diagram.id}' is already used by a model element.`, diagram.id);
    }
    const ownerId = diagram.ownerId;
    if (!elementExistsInRepository(state.repository, ownerId)) {
      return reject('OWNER_NOT_FOUND', `Diagram owner '${ownerId}' does not exist.`, ownerId);
    }
    if (diagram.diagramKind === 'package' && !state.repository.packages[ownerId]) {
      return reject('INVALID_DIAGRAM_OWNER', 'A Package Diagram must be owned by the Model or a Package.', ownerId);
    }
    // Stage-first atomicity (Finding 1 review fix): stage the diagram and its
    // presentation as pure values. Store and patch history stay untouched
    // until staged validation below passes.
    const nextRepo: SysmlRepository = {
      ...state.repository,
      revision: state.repository.revision + 1,
      diagrams: {
        ...(state.repository.diagrams || {}),
        [diagram.id]: diagram,
      },
      auditTrail: [...(state.repository.auditTrail || [])],
    };
    const nextDiagramPresentations = {
      ...diagramPresentations,
      [diagram.id]: { elementIds: [], presentations: {} },
    };
    nextRepo.auditTrail.push({
      id: `change-${nextRepo.revision}-createDiagram`,
      revision: nextRepo.revision,
      timestamp: new Date().toISOString(),
      command: 'createDiagram',
      elementIds: [diagram.id],
    });

    // Full semantic validation runs on the staged state BEFORE any mutation.
    // Any error aborts with the original state and untouched
    // store/patchHistory, so a success never carries errors.
    const stagedValidation = validateSysmlRepository(nextRepo, endpointContext);
    const stagedErrors = stagedValidation.diagnostics.filter(d => d.severity === 'error');
    if (stagedErrors.length > 0) {
      const view = getView(state.repository, coordinates, diagramPresentations);
      return {
        repository: state.repository,
        store,
        patchHistory,
        view,
        diagnostics: stagedErrors,
        committed: false,
        history: state.history,
        coordinates,
        diagramPresentations,
        presentationHistory: state.presentationHistory,
        actionStack: state.actionStack,
        redoStack: state.redoStack,
      };
    }

    // Single atomic transaction: store projection, persistence records, and
    // exactly one history entry.
    upsertEntity(store, 'diagrams', diagram);
    store.diagramPresentations.set(diagram.id, { elementIds: [], presentations: {} });
    store.indexes.diagramId.set(diagram.id, new Set());

    const patch = createSysmlPatch({
      revision: nextRepo.revision,
      forward: [{ op: 'add', collection: 'diagrams', id: diagram.id, value: diagram }],
      inverse: [{ op: 'remove', collection: 'diagrams', id: diagram.id, oldValue: diagram }],
      description: `createDiagram ${diagram.name}`,
    });
    pushPatch(patchHistory, patch, store);

    const nextHistory: MutationHistory = {
      past: [...state.history.past, state.repository],
      present: nextRepo,
      future: [],
    };

    const view = getView(nextRepo, coordinates, nextDiagramPresentations);
    return {
      repository: nextRepo,
      store,
      patchHistory,
      view,
      diagnostics: stagedValidation.diagnostics,
      committed: true,
      history: nextHistory,
      coordinates,
      diagramPresentations: nextDiagramPresentations,
      presentationHistory: state.presentationHistory,
      actionStack: [...(state.actionStack ?? []), 'semantic'],
      redoStack: [],
    };
  }

  if (command.type === 'showPackageContents') {
    if (state.repository.diagrams[command.diagramId]?.diagramKind !== 'package') {
      return reject('INVALID_DIAGRAM', 'Show Contents requires an existing Package Diagram.', command.diagramId);
    }
    if (!state.repository.packages[command.packageId]) {
      return reject('ELEMENT_NOT_FOUND', `Package '${command.packageId}' does not exist.`, command.packageId);
    }
    const memberIds: string[] = [];
    const visited = new Set<string>();
    const collect = (packageId: string) => {
      if (visited.has(packageId)) return;
      visited.add(packageId);
      const ownedPackages = Object.values(state.repository.packages)
        .filter(pkg => pkg.id !== 'model' && pkg.ownerId === packageId);
      const ownedElements = [
        ...Object.values(state.repository.definitions),
        ...Object.values(state.repository.requirements),
        ...Object.values(state.repository.verificationCases),
      ].filter(element => element.ownerId === packageId);
      memberIds.push(...ownedPackages.map(pkg => pkg.id));
      if (command.mode !== 'packages') memberIds.push(...ownedElements.map(element => element.id));
      if (command.mode === 'recursive') ownedPackages.forEach(pkg => collect(pkg.id));
    };
    collect(command.packageId);
    const alreadyShown = new Set(diagramPresentations[command.diagramId]?.elementIds ?? []);
    const newIds = memberIds.filter(id => !alreadyShown.has(id));
    if (newIds.length === 0) return reject('NO_CONTENTS_TO_SHOW', 'All matching Package contents are already shown.', command.packageId);
    const start = alreadyShown.size;
    return executeSysmlCommand(state, {
      type: 'addToDiagram', diagramId: command.diagramId, elementIds: newIds,
      coordinates: Object.fromEntries(newIds.map((id, index) => [id, {
        x: 80 + ((start + index) % 4) * 260,
        y: 80 + Math.floor((start + index) / 4) * 170,
      }])),
    }, command.diagramId);
  }

  if (command.type === 'addToDiagram') {
    const ibdContext = state.repository.definitions[command.diagramId];
    const isBlockIbdContext = ibdContext?.kind === 'block';
    if (!command.diagramId || (!isLegacyDiagramId(command.diagramId) && !state.repository.diagrams[command.diagramId] && !isBlockIbdContext)) {
      return reject('DIAGRAM_NOT_FOUND', `Diagram '${command.diagramId}' does not exist.`, command.diagramId);
    }
    const diagramKind = state.repository.diagrams[command.diagramId]?.diagramKind
      ?? (isLegacyDiagramId(command.diagramId)
        ? command.diagramId
        : isBlockIbdContext ? 'ibd' : undefined);
    const requestedElementIds: string[] = [];
    const presentedIds = new Set(diagramPresentations[command.diagramId]?.elementIds ?? []);
    for (const elementId of command.elementIds) {
      if (!repositoryHasSemanticId(state.repository, elementId)) {
        return reject('ELEMENT_NOT_FOUND', `Element '${elementId}' does not exist and cannot be presented.`, elementId);
      }
      const packageRelationship = state.repository.relationships[elementId];
      const isPackageRelationship = packageRelationship && (
        packageRelationship.kind === 'packageImport' || packageRelationship.kind === 'elementImport' ||
        packageRelationship.kind === 'packageMerge' || packageRelationship.kind === 'dependency' ||
        packageRelationship.kind === 'generalization'
      );
      if (diagramKind === 'package' && isPackageRelationship &&
        (!presentedIds.has(packageRelationship.sourceId) || !presentedIds.has(packageRelationship.targetId))) {
        return reject('RELATIONSHIP_ENDPOINT_NOT_PRESENTED', 'Both relationship endpoints must be shown on the Package Diagram first.', elementId);
      }
      if (diagramKind === 'package' && !(
        (elementId !== 'model' && state.repository.packages[elementId]) ||
        state.repository.definitions[elementId] ||
        state.repository.requirements[elementId] ||
        state.repository.verificationCases[elementId] ||
        isPackageRelationship
      )) {
        return reject('INVALID_DIAGRAM_ELEMENT', `Element '${elementId}' cannot be rendered on a Package Diagram.`, elementId);
      }
      const isPackage = Boolean(state.repository.packages[elementId]);
      if (isPackage && !['bdd', 'requirements', 'package'].includes(diagramKind ?? '')) {
        const view = getView(state.repository, coordinates, diagramPresentations);
        return {
          repository: state.repository, store, patchHistory, view,
          diagnostics: [{
            code: 'INVALID_DIAGRAM_ELEMENT', severity: 'error', elementId,
            message: 'Package symbols are supported on Block Definition, Requirement, and Package diagrams.',
          }],
          committed: false, history: state.history, coordinates, diagramPresentations,
          presentationHistory: state.presentationHistory, actionStack: state.actionStack, redoStack: state.redoStack,
        };
      }
      const usage = state.repository.usages[elementId];
      const connector = state.repository.connectors[elementId];
      const isConnectorInContext = connector && connector.ownerId === command.diagramId;
      const isPartInContext = usage?.kind === 'part' && usage.ownerId === command.diagramId;
      const isPortInContext = usage?.kind === 'port' && (usage.ownerId === command.diagramId || state.repository.usages[usage.ownerId]?.ownerId === command.diagramId);

      if (isBlockIbdContext && !isPartInContext && !isConnectorInContext && !isPortInContext) {
        return reject('INVALID_DIAGRAM_ELEMENT', `Only PartProperties and Connectors owned by Block '${command.diagramId}' can be presented on its IBD.`, elementId);
      }
      if ((diagramKind === 'bdd' || diagramKind === 'requirements' || diagramKind === 'rtm') && usage?.kind === 'part') {
        if (!requestedElementIds.includes(usage.ownerId)) requestedElementIds.push(usage.ownerId);
      } else if (!requestedElementIds.includes(elementId)) {
        requestedElementIds.push(elementId);
      }
    }
    const currentPres = diagramPresentations[command.diagramId] ?? { elementIds: [], presentations: {} };
    const existingSet = new Set(currentPres.elementIds);
    const alreadyPresent = requestedElementIds.filter(id => existingSet.has(id));
    if (alreadyPresent.length > 0 && alreadyPresent.length === requestedElementIds.length) {
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

    const addedIds = requestedElementIds.filter(id => !existingSet.has(id));
    const newRecords = Object.fromEntries(addedIds.map(semanticElementId => {
      const explicit = command.coordinates?.[semanticElementId];
      const existing = coordinates[semanticElementId] ?? currentPres.presentations[semanticElementId]?.bounds;
      const bounds = {
        x: explicit?.x ?? existing?.x ?? 80,
        y: explicit?.y ?? existing?.y ?? 80,
        width: explicit?.width ?? existing?.width ?? 160,
        height: explicit?.height ?? existing?.height ?? 100,
      };
      return [semanticElementId, {
        id: stableDiagramPresentationId(command.diagramId, semanticElementId),
        diagramId: command.diagramId,
        semanticElementId,
        bounds,
      }];
    }));
    const nextPres: DiagramPresentation = {
      elementIds: [...currentPres.elementIds, ...addedIds],
      presentations: { ...currentPres.presentations, ...newRecords },
      ...(() => {
        const hiddenElementIds = (currentPres.hiddenElementIds ?? []).filter(id => !requestedElementIds.includes(id));
        return hiddenElementIds.length > 0 ? { hiddenElementIds } : {};
      })(),
    };
    const nextDiagramPresentations = {
      ...diagramPresentations,
      [command.diagramId]: nextPres,
    };
    store.diagramPresentations.set(command.diagramId, nextPres);
    store.indexes.diagramId.set(command.diagramId, new Set(nextPres.elementIds));
    store.revision += 1;

    const patch = createSysmlPatch({
      revision: store.revision,
      forward: [
        { op: 'replace', collection: 'diagramPresentations', id: command.diagramId, oldValue: currentPres, value: nextPres },
      ],
      inverse: [
        { op: 'replace', collection: 'diagramPresentations', id: command.diagramId, oldValue: nextPres, value: currentPres },
      ],
      description: `addToDiagram ${command.diagramId}`,
    });
    pushPatch(patchHistory, patch, store);

    const validation = validateSysmlRepository(state.repository, endpointContext);
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
    const txState = cloneGatewayStateForTransaction(state);
    let currentState: SysmlGatewayState = txState;
    let lastResult: SysmlCommandResult | undefined;
    const initialPastLength = txState.patchHistory?.past.length ?? 0;

    for (const subCmd of command.commands) {
      const res = executeSysmlCommand(currentState, subCmd, undefined, endpointContext);
      if (!res.committed || res.diagnostics.some(d => d.severity === 'error')) {
        const view = getView(state.repository, coordinates, diagramPresentations);
        return {
          repository: state.repository,
          store,
          patchHistory: state.patchHistory ?? patchHistory,
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

    if (lastResult?.patchHistory && lastResult.patchHistory.past.length > initialPastLength) {
      const addedPatches = lastResult.patchHistory.past.splice(initialPastLength);
      const forwardOps = addedPatches.flatMap(p => p.forward);
      const inverseOps = addedPatches.slice().reverse().flatMap(p => p.inverse);
      const compositePatch = createSysmlPatch({
        revision: lastResult.repository.revision,
        coalesceKey: command.coalesceKey,
        forward: forwardOps,
        inverse: inverseOps,
        description: `batch (${addedPatches.map(p => p.description).join(', ')})`,
      });
      lastResult.patchHistory.past.push(compositePatch);
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

export function loadCanonicalSysmlProject(
  payload: Record<string, unknown>,
  context?: SemanticEndpointContext,
): {
  repository: SysmlRepository;
  store: NormalizedSysmlStore;
  view: LegacySysmlView;
  coordinates: Record<string, PresentationCoordinates>;
  diagramPresentations: Record<string, DiagramPresentation>;
  valid: boolean;
  diagnostics: SysmlDiagnostic[];
  interchangeReport: InterchangeReport;
  quarantinedRelationshipIds: string[];
  quarantinedConnectorIds: string[];
} {
  const coordinates = (payload.sysmlCoordinates as Record<string, PresentationCoordinates>) ?? {};
  const diagramPresentations = normalizeDiagramPresentations(
    (payload.diagramPresentations as Record<string, DiagramPresentationInput>) ?? {},
    coordinates,
  );
  const rawRepo = payload.sysmlRepository;

  if (!rawRepo) {
    // Fallback: migrate legacy payload
    const loadRes = loadRepository(payload, context);
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

  const loadRes = loadRepository(rawRepo, context);
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
  diagramPresentations: Record<string, DiagramPresentationInput> = {},
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

export interface TypedUsageInput {
  ownerId: string;
  name: string;
  typeId: string;
  kind: 'part' | 'sharedPart' | 'reference';
}

export type TypedUsageOutcome =
  | {
      ok: true;
      command: SysmlEditorCommand;
      type: SysmlDefinition | import('../engine/sysml/domain/base').SemanticElement;
    }
  | {
      ok: false;
      code: 'TYPE_NOT_FOUND';
      message: string;
      candidates: TypeCandidate[];
      action: CreateNewTypeAction;
    };

export function createTypedUsageCommand(
  repo: SysmlRepository,
  input: TypedUsageInput
): TypedUsageOutcome {
  const outcome = resolveType(input.typeId, repo, { expectedMetaclasses: ['Block'] });
  if (!outcome.found) {
    return {
      ok: false,
      code: 'TYPE_NOT_FOUND',
      message: `Type '${input.typeId}' not found.`,
      candidates: outcome.candidates,
      action: outcome.action,
    };
  }

  const part: PartUsage = {
    id: `part-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: input.name,
    ownerId: input.ownerId,
    typeId: outcome.element.id,
    kind: 'part',
    aggregation: input.kind === 'reference' ? 'reference' : input.kind === 'sharedPart' ? 'shared' : 'composite',
    multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
  };

  return {
    ok: true,
    command: { type: 'createElement', element: part },
    type: outcome.element,
  };
}
