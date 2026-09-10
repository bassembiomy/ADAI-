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
  TraceArtifact,
  Multiplicity,
  SysmlEntityCollection,
  SysmlEntity,
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
};

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
  | ModelBaseline
  | TraceArtifact;

export interface DiagramPresentation {
  diagramId: string;
  elementIds: string[];
}

export interface PresentationSnapshot {
  coordinates: Record<string, PresentationCoordinates>;
  diagramPresentations: Record<string, { elementIds: string[] }>;
}

export type SysmlEditorCommand =
  | { type: 'createElement'; element: SysmlElement; presentation?: PresentationCoordinates; coalesceKey?: string }
  | { type: 'updateElement'; elementId: string; patch: Record<string, unknown>; coalesceKey?: string }
  | { type: 'deleteElements'; elementIds: string[]; confirmedImpactHash?: string }
  | { type: 'removeFromDiagram'; diagramId: string; elementIds: string[] }
  | { type: 'updatePresentation'; elementId: string; presentation: PresentationCoordinates; coalesceKey?: string }
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

function getCollectionFromElement(element: SysmlElement): SysmlEntityCollection {
  if ('kind' in element) {
    if (element.kind === 'block' || element.kind === 'valueType' || element.kind === 'interface') return 'definitions';
    if (element.kind === 'part' || element.kind === 'port') return 'usages';
    if (element.kind === 'assembly' || element.kind === 'delegation' || element.kind === 'binding') return 'connectors';
    if (element.kind === 'requirement') return 'requirements';
    if (element.kind === 'verificationCase') return 'verificationCases';
  }
  if ('sourceId' in element && 'targetId' in element) return 'relationships';
  if ('verificationCaseId' in element && 'status' in element) return 'evidence';
  if ('protected' in element && 'contentHash' in element) return 'baselines';
  if ('uri' in element && 'kind' in element) return 'artifacts';
  return 'definitions';
}

export function executeSysmlCommand(
  state: SysmlGatewayState,
  command: SysmlEditorCommand,
  activeDiagramId?: string,
): SysmlCommandResult {
  const coordinates = { ...state.coordinates };
  const diagramPresentations = structuredClone(state.diagramPresentations ?? {});
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

    if (lastAction === 'presentation' || (lastAction === undefined && (state.presentationHistory?.past?.length ?? 0) > 0)) {
      if ((state.presentationHistory?.past?.length ?? 0) > 0) {
        const past = [...(state.presentationHistory?.past ?? [])];
        const prev = past.pop();
        if (prev) {
          const currentSnapshot: PresentationSnapshot = {
            coordinates: structuredClone(state.coordinates),
            diagramPresentations: structuredClone(diagramPresentations),
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
      if (patchHistory.past.length > 0) {
        const undoRes = undoPatch(patchHistory, store);
        if (undoRes) {
          const nextCoords = Object.fromEntries(store.coordinates);
          const nextDiagrams = Object.fromEntries(store.diagramPresentations);
          const view = getView(state.repository, nextCoords, nextDiagrams);
          return {
            repository: state.repository,
            store,
            patchHistory,
            view,
            diagnostics: [],
            committed: true,
            history: state.history,
            coordinates: nextCoords,
            diagramPresentations: nextDiagrams,
            presentationHistory: state.presentationHistory,
            actionStack,
            redoStack: ['presentation', ...(state.redoStack ?? [])],
          };
        }
      }
    }

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
          past: state.history.past.slice(0, -1),
          present: repo,
          future: [state.history.present, ...state.history.future],
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

    if (nextAction === 'presentation') {
      if ((state.presentationHistory?.future?.length ?? 0) > 0) {
        const future = [...(state.presentationHistory?.future ?? [])];
        const next = future.shift();
        if (next) {
          const currentSnapshot: PresentationSnapshot = {
            coordinates: structuredClone(state.coordinates),
            diagramPresentations: structuredClone(diagramPresentations),
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
      if (patchHistory.future.length > 0) {
        const redoRes = redoPatch(patchHistory, store);
        if (redoRes) {
          const nextCoords = Object.fromEntries(store.coordinates);
          const nextDiagrams = Object.fromEntries(store.diagramPresentations);
          const view = getView(state.repository, nextCoords, nextDiagrams);
          return {
            repository: state.repository,
            store,
            patchHistory,
            view,
            diagnostics: [],
            committed: true,
            history: state.history,
            coordinates: nextCoords,
            diagramPresentations: nextDiagrams,
            presentationHistory: state.presentationHistory,
            actionStack: [...(state.actionStack ?? []), 'presentation'],
            redoStack,
          };
        }
      }
    }

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
          past: [...state.history.past, state.history.present],
          present: repo,
          future: state.history.future.slice(1),
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
    const nextRepo: SysmlRepository = structuredClone(state.repository);
    nextRepo.revision += 1;
    storeElementInRepository(nextRepo, command.element);
    if (command.presentation) {
      coordinates[command.element.id] = { ...command.presentation };
      store.coordinates.set(command.element.id, { ...command.presentation });
    }
    nextRepo.auditTrail.push({
      id: `change-${nextRepo.revision}-${command.element.id}`,
      revision: nextRepo.revision,
      timestamp: new Date().toISOString(),
      command: 'createElement',
      elementIds: [command.element.id],
    });

    const collection = getCollectionFromElement(command.element);
    upsertEntity(store, collection, command.element as any);

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

    const nextHistoryPast = [...state.history.past, structuredClone(state.repository)];
    while (nextHistoryPast.length > 20) nextHistoryPast.shift();
    const nextHistory: MutationHistory = {
      past: nextHistoryPast,
      present: structuredClone(nextRepo),
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
    const nextRepo: SysmlRepository = structuredClone(state.repository);
    const patched = findAndPatchElement(nextRepo, command.elementId, command.patch);
    if (!patched || !existing) {
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
    nextRepo.revision += 1;
    nextRepo.auditTrail.push({
      id: `change-${nextRepo.revision}-${command.elementId}`,
      revision: nextRepo.revision,
      timestamp: new Date().toISOString(),
      command: 'updateElement',
      elementIds: [command.elementId],
    });

    const collection = getCollectionForId(store, command.elementId) ?? getCollectionFromElement(existing);
    const nextElement = { ...existing, ...command.patch } as SysmlEntity;
    upsertEntity(store, collection, nextElement);

    const patch = createSysmlPatch({
      revision: nextRepo.revision,
      coalesceKey: command.coalesceKey,
      forward: [{ op: 'replace', collection, id: command.elementId, oldValue: existing, value: nextElement }],
      inverse: [{ op: 'replace', collection, id: command.elementId, oldValue: nextElement, value: existing }],
      description: 'updateElement',
    });
    pushPatch(patchHistory, patch, store);

    const nextHistoryPast = [...state.history.past, structuredClone(state.repository)];
    while (nextHistoryPast.length > 20) nextHistoryPast.shift();
    const nextHistory: MutationHistory = {
      past: nextHistoryPast,
      present: structuredClone(nextRepo),
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
    const impact = analyzeMutation(state.repository, { kind: 'deleteElements', elementIds: command.elementIds });
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

    const mutationResult = applyCommand(state.repository, { kind: 'deleteElements', elementIds: command.elementIds });
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
    const nextDiagramPresentations = structuredClone(diagramPresentations);
    for (const dId of Object.keys(nextDiagramPresentations)) {
      nextDiagramPresentations[dId].elementIds = nextDiagramPresentations[dId].elementIds.filter(
        id => !impact.deletedElementIds.includes(id)
      );
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

    const nextHistoryPast = [...state.history.past, structuredClone(state.repository)];
    while (nextHistoryPast.length > 20) nextHistoryPast.shift();
    const nextHistory: MutationHistory = {
      past: nextHistoryPast,
      present: structuredClone(nextRepo),
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
    const nextDiagramPresentations = {
      ...diagramPresentations,
      [command.diagramId]: nextPresentation,
    };
    store.diagramPresentations.set(command.diagramId, nextPresentation);

    const pastPresentation: PresentationSnapshot = {
      coordinates: structuredClone(state.coordinates),
      diagramPresentations: structuredClone(diagramPresentations),
    };
    const nextPresentationHistory = {
      past: [...(state.presentationHistory?.past ?? []), pastPresentation],
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
  };
}
