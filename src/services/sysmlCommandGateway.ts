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
  EnumerationDefinition,
  SignalDefinition,
  QuantityKindDefinition,
  UnitDefinition,
  ViewDefinition,
  ViewpointDefinition,
  StakeholderDefinition,
  ConstraintBlockDefinition,
  ActivityDefinition,
  InteractionDefinition,
} from '../engine/sysml/model';
import { createEmptyRepository, isDefinitionKind } from '../engine/sysml/model';
import { resolvedPropertyUnitSymbol } from '../engine/sysml/units';
import { allocationNamesByElement } from '../engine/sysml/allocation';
import { stakeholdersOf, viewpointConcernTexts } from '../engine/sysml/views';
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
import { activityNestedIds, findInActivity } from '../engine/sysml/activity';
import { interactionNestedIds, planOperationRenames } from '../engine/sysml/interaction';
import { serializeRepository, loadRepository, rekeyPresentationState, serializeSysmlProjectState, type V5UpgradeReport } from '../engine/sysml/persistence';
import { isOccurrenceInContext, resolveOccurrenceKey, resolvePartLike } from '../engine/sysml/partOccurrences';
import { buildFeatureUpdateCommand } from './sysmlPropertyCommands';
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
import { packageRelationshipKeyword } from '../features/sysml/packageRelationshipNotation';
import {
  collectDerivedParts,
  pathEndpointOf,
  type DerivedPathPart,
} from '../features/sysml/pathConnectorProjection';
import { fitPackageAroundMembers, layoutMembersInside } from '../features/sysml/packageNestingLayout';
import { containmentRelationshipId } from '../engine/sysml/services/requirementOwnership';

import { resolveType } from '../engine/sysml/services/typeResolution';
import {
  migrateContextualEditingPayload,
  type PersistedSysmlPayload,
} from '../engine/sysml/persistence/migrateContextualEditing';
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
  | EnumerationDefinition
  | SignalDefinition
  | ConstraintBlockDefinition
  | QuantityKindDefinition
  | UnitDefinition
  | ViewDefinition
  | ViewpointDefinition
  | StakeholderDefinition
  | ActivityDefinition
  | InteractionDefinition
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
  | { type: 'createOwnedPort'; ownerBlockId: string; portKind: any; typeId?: string; name?: string; diagramId?: string; presentation?: PresentationCoordinates }
  | { type: 'updateElement'; elementId: string; patch: Record<string, unknown>; coalesceKey?: string }
  | { type: 'deleteElements'; elementIds: string[]; confirmedImpactHash?: string; authorizedBaselineIds?: string[] }
  | { type: 'removeFromDiagram'; diagramId: string; elementIds: string[] }
  | { type: 'updatePresentation'; diagramId: string; elementId: string; presentation: PresentationCoordinates; style?: DiagramElementPresentation['style']; portLayouts?: DiagramElementPresentation['portLayouts']; coalesceKey?: string }
  | { type: 'moveElements'; elementIds: string[]; targetOwnerId: string; confirmedImpactHash?: string }
  | { type: 'createDiagram'; diagram: ModelDiagramDefinition }
  | { type: 'showPackageContents'; diagramId: string; packageId: string; mode: 'direct' | 'packages' | 'packageable' | 'recursive' }
  | {
      type: 'addToDiagram'; diagramId: string; elementIds: string[]; coordinates?: Record<string, PresentationCoordinates>;
      /** Bounds for elements already on the diagram (e.g. a Package grown to fit shown contents), applied in the same transaction. */
      updateBounds?: Record<string, PresentationCoordinates>;
    };

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

/**
 * When true, a command is rejected only for errors it *introduces*. Errors the
 * repository already had before the command (a file saved with a dangling
 * reference, a rule tightened since) are still reported in the result but no
 * longer make every unrelated edit fail. Switch it off with
 * `setRejectOnlyIntroducedErrors(false)` to restore the old "any error in the
 * staged repository rejects the command" contract.
 */
let rejectOnlyIntroducedErrors = true;
export function setRejectOnlyIntroducedErrors(enabled: boolean): void { rejectOnlyIntroducedErrors = enabled; }
export function isRejectingOnlyIntroducedErrors(): boolean { return rejectOnlyIntroducedErrors; }

const baselineErrorKeys = new WeakMap<SysmlRepository, Set<string>>();
// Array indices are dropped from the path (`messages.2.signatureId` -> `messages.signatureId`) so an
// error that already existed is not mistaken for a new one when an earlier item is removed.
const diagnosticKey = (d: SysmlDiagnostic) => `${d.code}|${d.elementId ?? ''}|${(d.propertyPath ?? '').replace(/(^|\.)\d+(?=\.|$)/g, '')}`;

/** Remembers the errors of a repository that was just validated so the next command need not re-validate it. */
function seedBaselineErrors(repository: SysmlRepository, diagnostics: SysmlDiagnostic[]): void {
  baselineErrorKeys.set(repository, new Set(diagnostics.filter(d => d.severity === 'error').map(diagnosticKey)));
}

/** The staged errors that the repository did not already have before the command. */
function introducedErrors(
  before: SysmlRepository,
  stagedDiagnostics: SysmlDiagnostic[],
  context: Parameters<typeof validateSysmlRepository>[1],
): SysmlDiagnostic[] {
  const errors = stagedDiagnostics.filter(d => d.severity === 'error');
  if (!rejectOnlyIntroducedErrors || errors.length === 0) return errors;
  let known = baselineErrorKeys.get(before);
  if (!known) {
    known = new Set(validateSysmlRepository(before, context).diagnostics.filter(d => d.severity === 'error').map(diagnosticKey));
    baselineErrorKeys.set(before, known);
  }
  return errors.filter(d => !known!.has(diagnosticKey(d)));
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
    affInt: [...(impact.affectedBehaviorElementIds ?? [])].sort(),
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
  const allocationNames = allocationNamesByElement(repository);
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
      ...(pkg.stereotype ? { stereotype: pkg.stereotype } : {}),
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
          unit: resolvedPropertyUnitSymbol(repository, prop.typeId) ?? (prop as any).unit,
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
        ...(allocationNames.get(b.id)?.allocatedFrom.length ? { allocatedFrom: allocationNames.get(b.id)!.allocatedFrom } : {}),
        ...(allocationNames.get(b.id)?.allocatedTo.length ? { allocatedTo: allocationNames.get(b.id)!.allocatedTo } : {}),
      });
    } else if (def.kind === 'view' || def.kind === 'viewpoint' || def.kind === 'stakeholder') {
      // SysML 1.6 §7.3.2: View / Viewpoint / Stakeholder are Class-based; drawn as
      // classifier boxes with a «keyword» header. A Viewpoint adds a compartment.
      const viewpointText = def.kind === 'viewpoint'
        ? {
            viewpointPurpose: def.purpose,
            viewpointStakeholders: stakeholdersOf(repository, def.id).map(stakeholder => stakeholder.name),
            viewpointConcerns: viewpointConcernTexts(repository, def.id),
          }
        : {};
      blocks.push({
        id: def.id,
        name: def.name,
        stereotype: def.kind,
        ...viewpointText,
        x: coords.x ?? 0,
        y: coords.y ?? 0,
        width: coords.width ?? (def.kind === 'viewpoint' ? 200 : 150),
        height: coords.height ?? (def.kind === 'viewpoint' ? 120 : 70),
        properties: [],
        operations: [],
        constraints: [],
        classes: [],
        ports: [],
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

  // Parts that no PartUsage record represents (format 5) are derived from Block properties (id = path string).
  const pushDerivedPart = (part: DerivedPathPart, contextId: string) => {
    const coords = coordinatesFor(part.id);
    parts.push({
      id: part.id,
      propertyId: part.propertyId,
      name: part.name,
      blockId: part.parentId,
      parentBlockId: part.parentId,
      ...(part.parentId !== contextId ? { parentPartId: part.parentId } : {}),
      typeId: part.typeId,
      typeBlockId: part.typeId,
      aggregation: part.aggregation,
      multiplicity: formatMultiplicityText(part.multiplicity),
      satisfiedReqIds: satisfiedReqIdsBySource.get(part.propertyId) ?? [],
      x: coords.x ?? 0,
      y: coords.y ?? 0,
      width: coords.width ?? 150,
      height: coords.height ?? 100,
    });
  };
  for (const { part, contextId } of collectDerivedParts(repository, {
    isVisible,
    visibleIds: visibleFilter,
    diagramContextId: diagramId
      ? (repository.diagrams[diagramId]?.contextElementId ?? (repository.definitions[diagramId] ? diagramId : undefined))
      : undefined,
  })) pushDerivedPart(part, contextId);

  // Project connectors
  for (const conn of Object.values(repository.connectors)) {
    const parseEndpoint = (portUsageId: string) => {
      const usage = repository.usages[portUsageId];
      if (usage && usage.kind === 'port') {
        return { partId: usage.ownerId, portId: usage.definitionId };
      }
      // A part end: the connector attaches to the part itself (empty port).
      if (usage && usage.kind === 'part') {
        return { partId: usage.id, portId: '' };
      }
      if (portUsageId.includes('::')) {
        const [partId, portId] = portUsageId.split('::');
        return { partId, portId };
      }
      return { partId: conn.ownerId, portId: portUsageId };
    };
    const src = pathEndpointOf(repository, conn, 'source') ?? parseEndpoint(conn.sourcePortId);
    const tgt = pathEndpointOf(repository, conn, 'target') ?? parseEndpoint(conn.targetPortId);

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
      rel.kind === 'requirementContainment' ||
      rel.kind === 'conform' ||
      rel.kind === 'expose'
    ) {
      legacyType = rel.kind;
    }

    relationships.push({
      id: rel.id,
      sourceId: rel.sourceId,
      targetId: rel.targetId,
      type: legacyType,
      label: packageRelationshipKeyword(rel) ?? rel.name ?? '',
      name: rel.name,
      sourceMultiplicity: rel.sourceMultiplicity ? formatMultiplicityText(rel.sourceMultiplicity) : undefined,
      targetMultiplicity: rel.targetMultiplicity ? formatMultiplicityText(rel.targetMultiplicity) : undefined,
      // The property panel's controlled inputs read these back from this
      // projection; omitting them makes every edit snap back to empty.
      sourceRole: rel.sourceRole,
      targetRole: rel.targetRole,
      sourceNavigable: rel.sourceNavigable,
      targetNavigable: rel.targetNavigable,
      sourceAggregation: rel.sourceAggregation,
      targetAggregation: rel.targetAggregation,
    });
  }

  return { packages, blocks, relationships, parts, connectors };
}

function getCollectionFromElement(element: SysmlElement): SysmlEntityCollection {
  if ('kind' in element) {
    if (element.kind === 'package') return 'packages';
    if (element.kind === 'diagram') return 'diagrams';
    if (isDefinitionKind(element.kind)) return 'definitions';
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

/** Block name for a part's auto-created type: `engine` -> `Engine`. */
function blockNameForPart(partName: string): string {
  const trimmed = partName.trim() || 'Part';
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function uniqueDefinitionName(repo: SysmlRepository, baseName: string): string {
  const taken = new Set(Object.values(repo.definitions).map(definition => definition.name));
  if (!taken.has(baseName)) return baseName;
  let index = 2;
  while (taken.has(`${baseName}_${index}`)) index += 1;
  return `${baseName}_${index}`;
}

function repositoryHasSemanticId(repo: SysmlRepository, id: string): boolean {
  if (elementExistsInRepository(repo, id)) return true;
  // Format 5: a nested part is addressed by its property path.
  if (id.includes('/') && resolveOccurrenceKey(repo, id)) return true;
  return Object.values(repo.definitions).some(definition =>
    (definition.kind === 'block' && [...definition.properties, ...definition.ports].some(feature => feature.id === id))
    // Activity nodes and partitions carry diagram positions keyed by their own id.
    || (definition.kind === 'activity' && activityNestedIds(definition).includes(id))
    || (definition.kind === 'interaction' && interactionNestedIds(definition).includes(id)));
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
  // Format 5: parts and ports are Block properties/ports; a session never holds PartUsage/PortUsage records.
  if ('kind' in element && (element.kind === 'part' || element.kind === 'port')) {
    return [{
      code: 'USAGE_RECORD_NOT_SUPPORTED',
      severity: 'error' as const,
      elementId: element.id,
      message: `A ${element.kind} is a ${element.kind === 'part' ? 'property' : 'port'} of its Block; create it with createOwnedFeature instead of a ${element.kind === 'part' ? 'PartUsage' : 'PortUsage'} record.`,
    }];
  }
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
    const allowed = ['package', 'diagram', 'block', 'valueType', 'interface', 'requirement', 'verificationCase', 'stateMachine', 'view', 'viewpoint', 'stakeholder', 'activity', 'interaction'];
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
    const allowed = ['part', 'reference', 'shared', 'port', 'property', 'constraint', 'activity', 'interaction'];
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

const PACKAGE_SYMBOL_SIZE = { width: 220, height: 140 };
const MEMBER_SYMBOL_SIZE = { width: 160, height: 100 };

/**
 * Show Contents with UML nesting: each shown member is placed inside the
 * symbol of its owning Package (recursively), and the already-presented root
 * Package grows to fit. One addToDiagram transaction, so one undo.
 */
function showContentsNestedInPackage(
  state: SysmlGatewayState,
  presentation: DiagramPresentation,
  diagramId: string,
  packageId: string,
  newIds: string[],
  endpointContext?: SemanticEndpointContext,
): SysmlCommandResult {
  const repo = state.repository;
  const ownerOf = (id: string): string | undefined =>
    repo.packages[id]?.ownerId ?? repo.definitions[id]?.ownerId ?? repo.requirements[id]?.ownerId ?? repo.verificationCases[id]?.ownerId;
  const newSet = new Set(newIds);
  const childrenOf = (ownerId: string) => newIds.filter(id => ownerOf(id) === ownerId);

  const sizeCache = new Map<string, { width: number; height: number }>();
  const measure = (id: string): { width: number; height: number } => {
    const cached = sizeCache.get(id);
    if (cached) return cached;
    const base = repo.packages[id] ? PACKAGE_SYMBOL_SIZE : MEMBER_SYMBOL_SIZE;
    const children = repo.packages[id] ? childrenOf(id) : [];
    const origin = { x: 0, y: 0, ...base };
    const placed = layoutMembersInside(origin, children.map(child => ({ id: child, ...measure(child) })));
    const fitted = fitPackageAroundMembers(origin, Object.values(placed));
    const size = { width: fitted.width, height: fitted.height };
    sizeCache.set(id, size);
    return size;
  };

  const coordinates: Record<string, PresentationCoordinates> = {};
  const place = (ownerId: string, ownerRect: { x: number; y: number; width: number; height: number }, existingCount: number) => {
    const children = childrenOf(ownerId);
    const placed = layoutMembersInside(ownerRect, children.map(child => ({ id: child, ...measure(child) })), existingCount);
    for (const child of children) {
      coordinates[child] = placed[child];
      if (repo.packages[child]) place(child, placed[child], 0);
    }
    return Object.values(placed);
  };

  const rootBounds = presentation.presentations[packageId].bounds;
  const rootRect = {
    x: rootBounds.x ?? 0,
    y: rootBounds.y ?? 0,
    width: rootBounds.width ?? PACKAGE_SYMBOL_SIZE.width,
    height: rootBounds.height ?? PACKAGE_SYMBOL_SIZE.height,
  };
  // Leave room for members of this package that are already shown.
  const existingMembers = presentation.elementIds.filter(id => !newSet.has(id) && ownerOf(id) === packageId).length;
  const rootMembers = place(packageId, rootRect, existingMembers);
  const grown = fitPackageAroundMembers(rootRect, rootMembers);
  // Members whose owner was already shown (outside this placement chain)
  // go inside that owner's existing symbol.
  for (const id of newIds) {
    if (coordinates[id]) continue;
    const ownerBounds = presentation.presentations[ownerOf(id) ?? '']?.bounds;
    if (ownerBounds?.x === undefined || ownerBounds.y === undefined) continue;
    const ownerRect = { x: ownerBounds.x, y: ownerBounds.y, width: ownerBounds.width ?? PACKAGE_SYMBOL_SIZE.width, height: ownerBounds.height ?? PACKAGE_SYMBOL_SIZE.height };
    coordinates[id] = layoutMembersInside(ownerRect, [{ id, ...measure(id) }])[id];
  }

  return executeSysmlCommand(state, {
    type: 'addToDiagram', diagramId, elementIds: newIds, coordinates,
    ...(grown.width !== rootRect.width || grown.height !== rootRect.height
      ? { updateBounds: { [packageId]: { width: grown.width, height: grown.height } } }
      : {}),
  }, diagramId, endpointContext);
}

/**
 * Requirement nesting is ownership (decision D3). A command that changes
 * what a containment line or an ownership change means is completed with the
 * matching follow-up, inside the same atomic transaction (one undo step):
 *   - creating a containment line makes the child owned by the parent;
 *   - deleting a containment line returns the child to the parent's owner;
 *   - moving a requirement into/out of a requirement adds/removes its line.
 * Commands that do not touch requirement nesting run unchanged.
 */
function requirementOwnershipFollowUps(
  before: SysmlRepository,
  after: SysmlRepository,
  command: SysmlEditorCommand,
): Array<{ command: SysmlEditorCommand; confirmDelete?: boolean }> {
  const followUps: Array<{ command: SysmlEditorCommand; confirmDelete?: boolean }> = [];

  if ((command.type === 'createElement' || command.type === 'createAndPresent')
    && 'kind' in command.element && command.element.kind === 'requirementContainment') {
    const relationship = command.element as SysmlRelationship;
    const child = after.requirements[relationship.targetId];
    if (child && after.requirements[relationship.sourceId] && child.ownerId !== relationship.sourceId) {
      followUps.push({ command: { type: 'moveElements', elementIds: [child.id], targetOwnerId: relationship.sourceId } });
    }
  }

  if (command.type === 'deleteElements') {
    for (const id of command.elementIds) {
      const relationship = before.relationships[id];
      if (relationship?.kind !== 'requirementContainment' || after.relationships[id]) continue;
      const child = after.requirements[relationship.targetId];
      const parent = after.requirements[relationship.sourceId];
      if (child && parent && child.ownerId === parent.id) {
        followUps.push({ command: { type: 'moveElements', elementIds: [child.id], targetOwnerId: parent.ownerId || 'model' } });
      }
    }
  }

  if (command.type === 'moveElements') {
    const staleLines: string[] = [];
    for (const id of command.elementIds) {
      const was = before.requirements[id];
      const now = after.requirements[id];
      if (!was || !now) continue;
      if (was.ownerId && before.requirements[was.ownerId] && now.ownerId !== was.ownerId) {
        staleLines.push(...Object.values(after.relationships)
          .filter(r => r.kind === 'requirementContainment' && r.sourceId === was.ownerId && r.targetId === id)
          .map(r => r.id));
      }
    }
    if (staleLines.length > 0) followUps.push({ command: { type: 'deleteElements', elementIds: staleLines }, confirmDelete: true });
    for (const id of command.elementIds) {
      const now = after.requirements[id];
      if (!now?.ownerId || !after.requirements[now.ownerId]) continue;
      const hasLine = Object.values(after.relationships).some(r => r.kind === 'requirementContainment' && r.targetId === id);
      if (!hasLine || staleLines.length > 0) {
        followUps.push({ command: { type: 'createElement', element: {
          id: containmentRelationshipId(now.ownerId, id), kind: 'requirementContainment', sourceId: now.ownerId, targetId: id,
        } } });
      }
    }
  }
  return followUps;
}

function touchesRequirementNesting(repo: SysmlRepository, command: SysmlEditorCommand): boolean {
  switch (command.type) {
    case 'createElement':
    case 'createAndPresent':
      return 'kind' in command.element && command.element.kind === 'requirementContainment';
    case 'deleteElements':
      return command.elementIds.some(id => repo.relationships[id]?.kind === 'requirementContainment');
    case 'moveElements':
      return command.elementIds.some(id => repo.requirements[id])
        || Boolean(repo.requirements[command.targetOwnerId]);
    default:
      return false;
  }
}

export function executeSysmlCommand(
  state: SysmlGatewayState,
  command: SysmlEditorCommand,
  activeDiagramId?: string,
  context?: SemanticEndpointContext,
): SysmlCommandResult {
  if (!touchesRequirementNesting(state.repository, command)) {
    return executeSysmlCommandCore(state, command, activeDiagramId, context);
  }
  // A dry run on a clone proves the whole chain succeeds (all-or-nothing); only
  // then is it applied to the real state, which commands mutate in place.
  const dry = runOwnershipChain(cloneGatewayStateForTransaction(state), state, command, activeDiagramId, context);
  if (!dry.ok) {
    return dry.passthrough ? executeSysmlCommandCore(state, command, activeDiagramId, context) : dry.failure!;
  }
  const real = runOwnershipChain(state, state, command, activeDiagramId, context);
  return real.ok ? real.result : (real.failure ?? executeSysmlCommandCore(state, command, activeDiagramId, context));
}

type OwnershipChain =
  | { ok: true; result: SysmlCommandResult }
  | { ok: false; passthrough: boolean; failure?: SysmlCommandResult };

/** Runs a command plus its ownership follow-ups against `base`, merged into one undo step. */
function runOwnershipChain(
  base: SysmlGatewayState,
  original: SysmlGatewayState,
  command: SysmlEditorCommand,
  activeDiagramId?: string,
  context?: SemanticEndpointContext,
): OwnershipChain {
  const initialPastLength = base.patchHistory?.past.length ?? 0;
  const first = executeSysmlCommandCore(base, command, activeDiagramId, context);
  if (!first.committed) return { ok: false, passthrough: true };
  let current: SysmlCommandResult = first;
  for (const followUp of requirementOwnershipFollowUps(original.repository, first.repository, command)) {
    let result = executeSysmlCommandCore(current, followUp.command, activeDiagramId, context);
    if (!result.committed && followUp.confirmDelete && result.impact) {
      result = executeSysmlCommandCore(current, { ...followUp.command, confirmedImpactHash: computeImpactHash(result.impact) } as SysmlEditorCommand, activeDiagramId, context);
    }
    if (!result.committed) {
      return {
        ok: false, passthrough: false,
        failure: {
          repository: original.repository,
          store: original.store ?? fromRepository(original.repository, original.coordinates, original.diagramPresentations ?? {}),
          patchHistory: original.patchHistory ?? createPatchHistory(),
          view: projectLegacyDiagram(original.repository, original.coordinates, original.diagramPresentations ?? {}),
          diagnostics: result.diagnostics,
          committed: false,
          history: original.history,
          coordinates: original.coordinates,
          diagramPresentations: original.diagramPresentations ?? {},
          presentationHistory: original.presentationHistory,
          actionStack: original.actionStack,
          redoStack: original.redoStack,
        },
      };
    }
    current = result;
  }
  // One undo step for the primary command plus its ownership follow-ups: the
  // legacy history and action stack record only the primary command, exactly
  // as if it had run alone.
  if (current !== first) {
    current = {
      ...current,
      history: { ...first.history, present: current.repository, future: [] },
      actionStack: first.actionStack,
    };
  }
  if (current.patchHistory && current.patchHistory.past.length > initialPastLength + 1) {
    const added = current.patchHistory.past.splice(initialPastLength);
    current.patchHistory.past.push(createSysmlPatch({
      revision: current.repository.revision,
      forward: added.flatMap(p => p.forward),
      inverse: added.slice().reverse().flatMap(p => p.inverse),
      description: `${command.type} + requirement ownership`,
    }));
  }
  return { ok: true, result: current };
}

function executeSysmlCommandCore(
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

  if (command.type === 'createOwnedPort') {
    const rawKind = command.portKind;
    const canonicalPortKind =
      rawKind === 'standardPort' || rawKind === 'standard' || rawKind === 'umlPort'
        ? 'umlPort'
        : rawKind === 'proxyPort' || rawKind === 'proxy'
        ? 'proxyPort'
        : rawKind === 'fullPort' || rawKind === 'full'
        ? 'fullPort'
        : rawKind === 'flowPort' || rawKind === 'flow'
        ? 'flowPort'
        : rawKind;
    return executeSysmlCommand(
      state,
      {
        type: 'createOwnedFeature',
        intent: {
          featureKind: 'port',
          ownerBlockId: command.ownerBlockId,
          portKind: canonicalPortKind,
          ...(command.typeId ? { typeId: command.typeId } : {}),
          ...(command.name ? { name: command.name } : {}),
        },
        diagramId: command.diagramId,
        presentation: command.presentation,
      },
      command.diagramId,
      endpointContext
    );
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

    // Format 5: a part/reference property is the part. No PartUsage record is
    // created; the IBD derives the part from the property (id = property id).
    const isStructuralFeature =
      intent.featureKind === 'property' && (intent.propertyKind === 'part' || intent.propertyKind === 'reference');

    let nextCandidateBlock: BlockDefinition;

    // Block created on the fly as the type of an untyped part/reference
    // property; committed in the same transaction as the feature.
    let createdTypeBlock: BlockDefinition | undefined;

    if (intent.featureKind === 'port') {
      // Ports of every kind may be created untyped; kind-specific type
      // constraints apply only once a type is given.
      const typeDef = intent.typeId ? state.repository.definitions[intent.typeId] : undefined;
      if (intent.typeId && !typeDef) {
        return reject('TYPE_NOT_FOUND', `Type "${intent.typeId}" not found in repository.`, intent.ownerBlockId);
      }
      if (intent.portKind === 'proxyPort' && typeDef) {
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
      if (intent.portKind === 'fullPort' && typeDef) {
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
      let typeId = intent.typeId;
      if (!typeId && (intent.propertyKind === 'part' || intent.propertyKind === 'reference')) {
        // A part needs a Block type: create a dedicated one next to the
        // owner instead of asking the user to choose.
        const blockId = `blk-${Math.random().toString(36).slice(2, 10)}`;
        if (repositoryHasSemanticId(state.repository, blockId)) {
          return reject('DUPLICATE_SEMANTIC_ID', `Type ID '${blockId}' is already used in the repository.`, blockId);
        }
        createdTypeBlock = {
          id: blockId,
          name: uniqueDefinitionName(state.repository, blockNameForPart(intent.name || featureId)),
          kind: 'block',
          isAbstract: false,
          isLeaf: false,
          properties: [],
          ports: [],
          operations: [],
          constraints: [],
          namespace: owner.namespace ?? [],
          ...(owner.ownerId ? { ownerId: owner.ownerId } : {}),
        };
        typeId = blockId;
      }
      const typeDef = typeId ? createdTypeBlock ?? state.repository.definitions[typeId] : undefined;
      if (typeId && !typeDef) {
        return reject('TYPE_NOT_FOUND', `Type "${intent.typeId}" not found in repository.`, intent.ownerBlockId);
      }
      if (typeDef && (intent.propertyKind === 'part' || intent.propertyKind === 'reference') && typeDef.kind !== 'block') {
        return reject(
          'INVALID_PROPERTY_TYPE',
          `${intent.propertyKind} property must be typed by a Block, but "${typeDef.name}" is a ${typeDef.kind}.`,
          intent.ownerBlockId,
        );
      }
      if (typeDef && intent.propertyKind === 'value' && typeDef.kind !== 'valueType') {
        return reject(
          'INVALID_PROPERTY_TYPE',
          `Value property must be typed by a ValueType, but "${typeDef.name}" is a ${typeDef.kind}.`,
          intent.ownerBlockId,
        );
      }

      const property = createPropertyDefinitionFromIntent(owner, { ...intent, typeId, featureId });
      nextCandidateBlock = {
        ...owner,
        properties: [...(owner.properties ?? []), property],
      };
    }

    const stagedRepo: SysmlRepository = {
      ...state.repository,
      definitions: {
        ...state.repository.definitions,
        [owner.id]: nextCandidateBlock,
        ...(createdTypeBlock ? { [createdTypeBlock.id]: createdTypeBlock } : {}),
      },
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
    const stagedErrors = introducedErrors(state.repository, stagedValidation.diagnostics, endpointContext);
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
        // The IBD presents the part under its property id (the depth-1 path key).
        const nextElementIds = isStructuralFeature && isIbdBlockContext
          ? [...new Set([...diagPres.elementIds, featureId])]
          : diagPres.elementIds;
        const nextPresentations = {
          ...diagPres.presentations,
          [owner.id]: updatedOwnerPres,
          ...(isStructuralFeature && isIbdBlockContext ? {
            [featureId]: {
              id: stableDiagramPresentationId(command.diagramId, featureId),
              diagramId: command.diagramId,
              semanticElementId: featureId,
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
          elementIds: [
            owner.id,
            featureId,
            ...(createdTypeBlock ? [createdTypeBlock.id] : []),
          ],
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
    if (createdTypeBlock) {
      upsertEntity(store, 'definitions', createdTypeBlock);
    }
    if (command.presentation) {
      store.coordinates.set(featureId, { ...command.presentation });
      if (command.diagramId) {
        store.diagramPresentations.set(command.diagramId, nextDiagramPresentations[command.diagramId]);
        const isIbdBlockContext = state.repository.definitions[command.diagramId]?.kind === 'block';
        if (isStructuralFeature && isIbdBlockContext) {
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
    if (createdTypeBlock) {
      forwardOps.push({ op: 'add', collection: 'definitions', id: createdTypeBlock.id, value: createdTypeBlock });
      inverseOps.push({ op: 'remove', collection: 'definitions', id: createdTypeBlock.id, oldValue: createdTypeBlock });
    }
    if (command.presentation) {
      forwardOps.push({ op: 'add', collection: 'coordinates', id: featureId, value: command.presentation });
      inverseOps.push({ op: 'remove', collection: 'coordinates', id: featureId, oldValue: command.presentation });
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
    const stagedErrors = introducedErrors(state.repository, stagedValidation.diagnostics, endpointContext);
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
    seedBaselineErrors(nextRepo, stagedValidation.diagnostics);
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
      // Format 5: a part is a property of its Block, so updating it updates that Block.
      const featureUpdate = buildFeatureUpdateCommand(state.repository, command.elementId, command.patch);
      if (featureUpdate) return executeSysmlCommandCore(state, featureUpdate, activeDiagramId, context);
    }
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

    // Renaming an operation of a Block rewrites the calls that name it, in the
    // same atomic step, so no message is left calling an operation that is gone.
    const operationRewrites = (existing as { kind?: string }).kind === 'block' && Array.isArray((command.patch as { operations?: unknown }).operations)
      ? planOperationRenames(
          state.repository,
          command.elementId,
          (existing as BlockDefinition).operations ?? [],
          (command.patch as { operations: string[] }).operations,
        )
      : [];
    const rewrittenInteractions: Array<{ before: SysmlDefinition; after: SysmlDefinition }> = [];
    for (const rewrite of operationRewrites) {
      const before = state.repository.definitions[rewrite.interactionId];
      if (before?.kind !== 'interaction') continue;
      const after = { ...before, messages: rewrite.messages };
      nextRepo.definitions = { ...nextRepo.definitions, [before.id]: after };
      rewrittenInteractions.push({ before, after });
    }

    // Full semantic validation runs on the staged state BEFORE any mutation.
    // Any error aborts with the original repository/history and untouched
    // store/patchHistory, so a success never carries errors.
    const stagedValidation = validateSysmlRepository(nextRepo, endpointContext);
    const stagedErrors = introducedErrors(state.repository, stagedValidation.diagnostics, endpointContext);
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
    seedBaselineErrors(nextRepo, stagedValidation.diagnostics);
    upsertEntity(store, collection, nextElement);
    for (const { after } of rewrittenInteractions) upsertEntity(store, 'definitions', after);
    const patch = createSysmlPatch({
      revision: nextRepo.revision,
      coalesceKey: command.coalesceKey,
      forward: [
        { op: 'replace', collection, id: command.elementId, oldValue: existing, value: nextElement },
        ...rewrittenInteractions.map(({ before, after }) => ({ op: 'replace' as const, collection: 'definitions' as const, id: before.id, oldValue: before, value: after })),
      ],
      inverse: [
        ...rewrittenInteractions.slice().reverse().map(({ before, after }) => ({ op: 'replace' as const, collection: 'definitions' as const, id: before.id, oldValue: after, value: before })),
        { op: 'replace', collection, id: command.elementId, oldValue: nextElement, value: existing },
      ],
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
    // A deleted part or port is removed from its Block, so the store copy of that Block changes too.
    for (const op of mutationResult.forwardPatch?.forward ?? []) {
      if (op.op === 'replace' && op.collection === 'definitions' && nextRepo.definitions[op.id]) {
        upsertEntity(store, 'definitions', nextRepo.definitions[op.id]);
      }
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
      verificationCases: { ...(state.repository.verificationCases || {}) },
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
        // `owner` is the person responsible for the requirement, not its
        // namespace owner; only `ownerId` changes when the element moves.
        const updatedReq = { ...prevReq, ownerId: targetOwnerId };
        nextRepo.requirements[elemId] = updatedReq;
        forwardOps.push({ op: 'replace', collection: 'requirements', id: elemId, oldValue: prevReq, value: updatedReq });
        inverseOps.unshift({ op: 'replace', collection: 'requirements', id: elemId, oldValue: updatedReq, value: prevReq });
      } else if (nextRepo.verificationCases[elemId]) {
        const prevVc = nextRepo.verificationCases[elemId];
        const updatedVc = { ...prevVc, ownerId: targetOwnerId };
        nextRepo.verificationCases[elemId] = updatedVc;
        forwardOps.push({ op: 'replace', collection: 'verificationCases', id: elemId, oldValue: prevVc, value: updatedVc });
        inverseOps.unshift({ op: 'replace', collection: 'verificationCases', id: elemId, oldValue: updatedVc, value: prevVc });
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
    const stagedErrors = introducedErrors(state.repository, stagedValidation.diagnostics, endpointContext);
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
    seedBaselineErrors(nextRepo, stagedValidation.diagnostics);
    for (const elemId of command.elementIds) {
      if (nextRepo.definitions[elemId]) upsertEntity(store, 'definitions', nextRepo.definitions[elemId]);
      else if (nextRepo.packages[elemId]) upsertEntity(store, 'packages', nextRepo.packages[elemId]);
      else if (nextRepo.diagrams[elemId]) upsertEntity(store, 'diagrams', nextRepo.diagrams[elemId]);
      else if (nextRepo.requirements[elemId]) upsertEntity(store, 'requirements', nextRepo.requirements[elemId]);
      else if (nextRepo.verificationCases[elemId]) upsertEntity(store, 'verificationCases', nextRepo.verificationCases[elemId]);
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
    // An Activity Diagram's context is always the Activity that owns it.
    if (diagram.diagramKind === 'activity' && !diagram.contextElementId) diagram.contextElementId = diagram.ownerId;
    // Likewise a Sequence Diagram's context is the Interaction that owns it.
    if (diagram.diagramKind === 'sequence' && !diagram.contextElementId) diagram.contextElementId = diagram.ownerId;
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
    if (diagram.diagramKind === 'useCase' && !state.repository.packages[ownerId]) {
      return reject('INVALID_DIAGRAM_OWNER', 'A Use Case Diagram must be owned by the Model or a Package.', ownerId);
    }
    if (diagram.diagramKind === 'activity' && state.repository.definitions[ownerId]?.kind !== 'activity') {
      return reject('INVALID_DIAGRAM_OWNER', 'An Activity Diagram must be owned by an Activity.', ownerId);
    }
    if (diagram.diagramKind === 'sequence' && state.repository.definitions[ownerId]?.kind !== 'interaction') {
      return reject('INVALID_DIAGRAM_OWNER', 'A Sequence Diagram must be owned by an Interaction.', ownerId);
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
    const stagedErrors = introducedErrors(state.repository, stagedValidation.diagnostics, endpointContext);
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
    seedBaselineErrors(nextRepo, stagedValidation.diagnostics);
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
    const currentPresentation = diagramPresentations[command.diagramId];
    const alreadyShown = new Set(currentPresentation?.elementIds ?? []);
    const newIds = memberIds.filter(id => !alreadyShown.has(id));
    if (newIds.length === 0) return reject('NO_CONTENTS_TO_SHOW', 'All matching Package contents are already shown.', command.packageId);
    const packageBounds = currentPresentation?.presentations?.[command.packageId]?.bounds;
    if (!alreadyShown.has(command.packageId) || packageBounds?.x === undefined || packageBounds.y === undefined) {
      // Package symbol not on the diagram: lay members out as a free grid.
      const start = alreadyShown.size;
      return executeSysmlCommand(state, {
        type: 'addToDiagram', diagramId: command.diagramId, elementIds: newIds,
        coordinates: Object.fromEntries(newIds.map((id, index) => [id, {
          x: 80 + ((start + index) % 4) * 260,
          y: 80 + Math.floor((start + index) / 4) * 170,
        }])),
      }, command.diagramId);
    }
    // UML notation: members shown inside their owning Package symbol, which
    // grows to fit. Nested packages (recursive mode) nest inside their owners.
    return showContentsNestedInPackage(state, currentPresentation!, command.diagramId, command.packageId, newIds, endpointContext);
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
      // Any relationship path renders on a Package Diagram once both ends are
      // shown (the canvas draws every path between shown elements; this lets
      // Display Paths re-show one that was removed from the diagram).
      const relationship = state.repository.relationships[elementId];
      if (diagramKind === 'package' && relationship &&
        (!presentedIds.has(relationship.sourceId) || !presentedIds.has(relationship.targetId))) {
        return reject('RELATIONSHIP_ENDPOINT_NOT_PRESENTED', 'Both relationship endpoints must be shown on the Package Diagram first.', elementId);
      }
      if (diagramKind === 'package' && !(
        (elementId !== 'model' && state.repository.packages[elementId]) ||
        state.repository.definitions[elementId] ||
        state.repository.requirements[elementId] ||
        state.repository.verificationCases[elementId] ||
        // Diagram shortcut symbol (navigation map); never a shortcut to itself.
        (state.repository.diagrams[elementId] && elementId !== command.diagramId) ||
        relationship
      )) {
        return reject('INVALID_DIAGRAM_ELEMENT', `Element '${elementId}' cannot be rendered on a Package Diagram.`, elementId);
      }
      if (diagramKind === 'useCase' && !(
        state.repository.actors?.[elementId] ||
        state.repository.subjects?.[elementId] ||
        state.repository.useCases?.[elementId] ||
        state.repository.requirements[elementId] ||
        relationship
      )) {
        return reject('INVALID_DIAGRAM_ELEMENT', `Element '${elementId}' cannot be rendered on a Use Case Diagram.`, elementId);
      }
      if (diagramKind === 'activity') {
        // An Activity Diagram presents the nodes and swimlanes of the one
        // Activity that owns it; their positions are keyed by the nested id.
        const owner = state.repository.diagrams[command.diagramId]?.ownerId;
        const activity = owner ? state.repository.definitions[owner] : undefined;
        const nested = activity?.kind === 'activity'
          ? findInActivity(activity, elementId)
          : undefined;
        if (!nested || (nested.elementKind !== 'node' && nested.elementKind !== 'partition')) {
          return reject('INVALID_DIAGRAM_ELEMENT', `Element '${elementId}' cannot be rendered on this Activity Diagram.`, elementId);
        }
      }
      if (diagramKind === 'sequence') {
        // A Sequence Diagram always shows the whole Interaction that owns it;
        // lifelines and messages are laid out from the model, not placed.
        return reject('INVALID_DIAGRAM_ELEMENT', 'A Sequence Diagram shows every lifeline and message of its Interaction; elements are not added one by one.', elementId);
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
      // Format 5: a part with no usage record is a Block property (or property path) of the context.
      const derivedPart = !usage && isBlockIbdContext && isOccurrenceInContext(state.repository, command.diagramId, elementId);
      const isPartInContext = (usage?.kind === 'part' && usage.ownerId === command.diagramId) || derivedPart;
      const isPortInContext = usage?.kind === 'port' && (usage.ownerId === command.diagramId || state.repository.usages[usage.ownerId]?.ownerId === command.diagramId);

      if (isBlockIbdContext && !isPartInContext && !isConnectorInContext && !isPortInContext) {
        return reject('INVALID_DIAGRAM_ELEMENT', `Only PartProperties and Connectors owned by Block '${command.diagramId}' can be presented on its IBD.`, elementId);
      }
      const propertyPart = !usage && !elementId.includes('/') ? resolvePartLike(state.repository, elementId) : undefined;
      if ((diagramKind === 'bdd' || diagramKind === 'requirements' || diagramKind === 'rtm') && (usage?.kind === 'part' || propertyPart?.kind === 'part')) {
        const ownerBlockId = (usage ?? propertyPart!).ownerId;
        if (!requestedElementIds.includes(ownerBlockId)) requestedElementIds.push(ownerBlockId);
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
    const updatedRecords = Object.fromEntries(Object.entries(command.updateBounds ?? {})
      .filter(([semanticElementId]) => Boolean(currentPres.presentations[semanticElementId]))
      .map(([semanticElementId, bounds]) => {
        const record = currentPres.presentations[semanticElementId];
        return [semanticElementId, { ...record, bounds: { ...record.bounds, ...bounds } }];
      }));
    const nextPres: DiagramPresentation = {
      elementIds: [...currentPres.elementIds, ...addedIds],
      presentations: { ...currentPres.presentations, ...updatedRecords, ...newRecords },
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
      if (!res.committed || introducedErrors(currentState.repository, res.diagnostics, endpointContext).length > 0) {
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
  // Format 5 stores parts only as Block properties; presentations keyed by part
  // records follow the new keys so what the diagrams show survives the save.
  const saved = serializeSysmlProjectState(state.repository, (state.diagramPresentations ?? {}) as Record<string, DiagramPresentation>, state.coordinates);
  return {
    ...metadata,
    schemaVersion: 4,
    sysmlRepository: saved.sysmlRepository,
    sysmlCoordinates: saved.sysmlCoordinates,
    diagramPresentations: saved.diagramPresentations,
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
  /** Present when the file was written by an older format and has been upgraded in memory; the caller must show it. */
  upgradeReport?: V5UpgradeReport;
} {
  const migration = migrateContextualEditingPayload(payload as PersistedSysmlPayload, context);
  const activePayload = (migration.migrated ? migration.payload : payload) as Record<string, unknown>;
  const migrationDiagnostics: SysmlDiagnostic[] = (migration.diagnostics || []).map((d) => ({
    code: 'CONTEXTUAL_EDITING_MIGRATION',
    severity: d.severity,
    message: d.message,
    source: 'SysML',
    elementId: d.elementId,
  }));

  let coordinates = (activePayload.sysmlCoordinates as Record<string, PresentationCoordinates>) ?? {};
  let diagramPresentations = normalizeDiagramPresentations(
    (activePayload.diagramPresentations as Record<string, DiagramPresentationInput>) ?? {},
    coordinates,
  );
  const rawRepo = activePayload.sysmlRepository;

  // The report of the upgrade that happened while loading this payload: either
  // the contextual migration's (it already re-keyed the presentations) or this load's own.
  const withUpgrade = (loadRes: ReturnType<typeof loadRepository>) => {
    let upgradeReport = migration.upgradeReport ?? loadRes.upgradeReport;
    if (!migration.upgradeReport && loadRes.upgradeReport && Object.keys(loadRes.upgradeReport.keyMap).length > 0) {
      const rekeyed = rekeyPresentationState(
        diagramPresentations,
        coordinates,
        loadRes.upgradeReport.keyMap,
        id => loadRes.repository.diagrams[id]?.name ?? loadRes.repository.definitions[id]?.name ?? id,
      );
      diagramPresentations = rekeyed.presentations;
      coordinates = rekeyed.coordinates;
      loadRes.upgradeReport.changes.push(...rekeyed.changes);
      loadRes.upgradeReport.changed = loadRes.upgradeReport.changes.length > 0;
      upgradeReport = loadRes.upgradeReport;
    }
    return upgradeReport;
  };

  if (!rawRepo) {
    // Fallback: migrate legacy payload
    const loadRes = loadRepository(activePayload, context, { upgrade: 'always' });
    const upgradeReport = withUpgrade(loadRes);
    const store = fromRepository(loadRes.repository, coordinates, diagramPresentations);
    const view = getCachedLegacyView(store);
    return {
      repository: loadRes.repository,
      store,
      view,
      coordinates,
      diagramPresentations,
      valid: loadRes.valid,
      diagnostics: [...migrationDiagnostics, ...loadRes.diagnostics],
      interchangeReport: loadRes.interchangeReport,
      quarantinedRelationshipIds: loadRes.interchangeReport.quarantinedRelationshipIds,
      quarantinedConnectorIds: loadRes.interchangeReport.quarantinedConnectorIds,
      ...(upgradeReport ? { upgradeReport } : {}),
    };
  }

  const loadRes = loadRepository(rawRepo, context);
  const upgradeReport = withUpgrade(loadRes);
  const store = fromRepository(loadRes.repository, coordinates, diagramPresentations);
  const view = getCachedLegacyView(store);

  return {
    repository: loadRes.repository,
    store,
    view,
    coordinates,
    diagramPresentations,
    valid: loadRes.valid,
    diagnostics: [...migrationDiagnostics, ...loadRes.diagnostics],
    interchangeReport: loadRes.interchangeReport,
    quarantinedRelationshipIds: loadRes.interchangeReport.quarantinedRelationshipIds,
    quarantinedConnectorIds: loadRes.interchangeReport.quarantinedConnectorIds,
    ...(upgradeReport ? { upgradeReport } : {}),
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

  // Format 5: a typed part is a part/reference property of its owner Block, not a PartUsage record.
  return {
    ok: true,
    command: {
      type: 'createOwnedFeature',
      intent: {
        featureKind: 'property',
        ownerBlockId: input.ownerId,
        propertyKind: input.kind === 'reference' ? 'reference' : 'part',
        typeId: outcome.element.id,
        name: input.name,
      },
    },
    type: outcome.element,
  };
}
