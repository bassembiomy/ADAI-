import type { SysmlRepository } from '../../../engine/sysml/model';
import { createEmptyRepository } from '../../../engine/sysml/model';
import type { NormalizedSysmlStore } from '../../../engine/sysml/normalizedStore';
import { fromRepository } from '../../../engine/sysml/normalizedStore';
import type {
  SysmlEditorCommand,
  SysmlGatewayState,
  SysmlCommandResult,
  SysmlElement,
} from '../../../services/sysmlCommandGateway';
import {
  executeSysmlCommand,
  createSysmlGatewayState,
} from '../../../services/sysmlCommandGateway';
import type {
  DiagramPresentationInput,
  PresentationCoordinates,
} from '../../../engine/sysml/presentationState';

export interface SysmlEditorRevisions {
  readonly entityRevision: number;
  readonly membershipRevision: number;
  readonly presentationRevision: number;
  readonly activeViewRevision: number;
  readonly selectionRevision: number;
  readonly historyRevision: number;
}

export interface SysmlEditorState {
  readonly repository: SysmlRepository;
  readonly store: NormalizedSysmlStore;
  readonly activeDiagramId: string;
  readonly selectedIds: readonly string[];
  readonly coordinates: Record<string, Record<string, PresentationCoordinates>>;
  readonly diagramPresentations: Record<string, DiagramPresentationInput>;
  readonly undoStack: readonly any[];
  readonly redoStack: readonly any[];
  readonly revisions: SysmlEditorRevisions;
  readonly gatewayState: SysmlGatewayState;
}

export type SysmlEditorAction =
  | {
      type: 'executeCommand';
      command:
        | SysmlEditorCommand
        | { type: 'renameElement'; elementId: string; name: string }
        | { type: 'createElement'; elementKind: string; ownerId: string; name?: string };
    }
  | { type: 'setActiveDiagram'; diagramId: string }
  | { type: 'setSelectedIds'; selectedIds: readonly string[] }
  | {
      type: 'updateCoordinates';
      diagramId: string;
      elementId: string;
      coordinates: PresentationCoordinates;
    }
  | { type: 'updatePresentation'; diagramId: string; presentation: DiagramPresentationInput }
  | { type: 'undo' }
  | { type: 'redo' }
  | {
      type: 'reset';
      repository: SysmlRepository;
      store?: NormalizedSysmlStore;
      coordinates?: Record<string, Record<string, PresentationCoordinates>>;
      diagramPresentations?: Record<string, DiagramPresentationInput>;
      activeDiagramId?: string;
    };

export interface CreateSysmlEditorStoreOptions {
  repository?: SysmlRepository;
  store?: NormalizedSysmlStore;
  activeDiagramId?: string;
  selectedIds?: readonly string[];
  coordinates?: Record<string, Record<string, PresentationCoordinates>>;
  diagramPresentations?: Record<string, DiagramPresentationInput>;
}

export interface SysmlEditorStore {
  getState: () => SysmlEditorState;
  subscribe: (listener: () => void) => () => void;
  dispatch: (action: SysmlEditorAction) => void;
}

export function createSysmlEditorStore(
  initial: CreateSysmlEditorStoreOptions = {},
): SysmlEditorStore {
  const repository = initial.repository ?? createEmptyRepository();
  const coordinates = initial.coordinates ?? {};
  const diagramPresentations = initial.diagramPresentations ?? {};
  const store = initial.store ?? fromRepository(repository, coordinates as any, diagramPresentations);
  const activeDiagramId = initial.activeDiagramId ?? 'model';
  const selectedIds = initial.selectedIds ?? [];

  const gatewayState = createSysmlGatewayState(
    repository,
    coordinates as any,
    diagramPresentations,
  );
  gatewayState.store = store;

  let state: SysmlEditorState = {
    repository,
    store,
    activeDiagramId,
    selectedIds,
    coordinates,
    diagramPresentations,
    undoStack: [],
    redoStack: [],
    revisions: {
      entityRevision: 0,
      membershipRevision: 0,
      presentationRevision: 0,
      activeViewRevision: 0,
      selectionRevision: 0,
      historyRevision: 0,
    },
    gatewayState,
  };

  const listeners = new Set<() => void>();

  function notify(): void {
    for (const listener of listeners) {
      listener();
    }
  }

  function dispatch(action: SysmlEditorAction): void {
    switch (action.type) {
      case 'setActiveDiagram': {
        if (state.activeDiagramId === action.diagramId) return;
        state = {
          ...state,
          activeDiagramId: action.diagramId,
          revisions: {
            ...state.revisions,
            activeViewRevision: state.revisions.activeViewRevision + 1,
          },
        };
        notify();
        break;
      }

      case 'setSelectedIds': {
        state = {
          ...state,
          selectedIds: action.selectedIds,
          revisions: {
            ...state.revisions,
            selectionRevision: state.revisions.selectionRevision + 1,
          },
        };
        notify();
        break;
      }

      case 'updateCoordinates': {
        const nextDiagCoords = {
          ...(state.coordinates[action.diagramId] ?? {}),
          [action.elementId]: action.coordinates,
        };
        const nextCoords = {
          ...state.coordinates,
          [action.diagramId]: nextDiagCoords,
        };
        state = {
          ...state,
          coordinates: nextCoords,
          revisions: {
            ...state.revisions,
            presentationRevision: state.revisions.presentationRevision + 1,
          },
        };
        notify();
        break;
      }

      case 'updatePresentation': {
        const nextPresentations = {
          ...state.diagramPresentations,
          [action.diagramId]: action.presentation,
        };
        state = {
          ...state,
          diagramPresentations: nextPresentations,
          revisions: {
            ...state.revisions,
            presentationRevision: state.revisions.presentationRevision + 1,
          },
        };
        notify();
        break;
      }

      case 'executeCommand': {
        let cmd: SysmlEditorCommand;
        let isMembership = false;
        let isEntity = false;
        let isPresentation = false;

        const raw = action.command;
        if (raw.type === 'renameElement') {
          cmd = {
            type: 'updateElement',
            elementId: raw.elementId,
            patch: { name: raw.name },
          };
          isEntity = true;
        } else if (raw.type === 'createElement') {
          if ('element' in raw) {
            cmd = raw as SysmlEditorCommand;
          } else {
            const newId = `${raw.elementKind}-${Date.now()}`;
            const newElement: SysmlElement = {
              id: newId,
              name: raw.name ?? raw.elementKind,
              kind: raw.elementKind as any,
              ownerId: raw.ownerId,
              namespace: [raw.ownerId],
              ...(raw.elementKind === 'block'
                ? {
                    isAbstract: false,
                    isLeaf: false,
                    properties: [],
                    ports: [],
                    operations: [],
                    constraints: [],
                  }
                : {}),
            } as any;
            cmd = {
              type: 'createElement',
              element: newElement,
            };
          }
          isMembership = true;
          isEntity = true;
        } else {
          cmd = raw as SysmlEditorCommand;
          if (
            cmd.type === 'createElement' ||
            cmd.type === 'deleteElements' ||
            cmd.type === 'moveElements' ||
            cmd.type === 'createDiagram'
          ) {
            isMembership = true;
            isEntity = true;
          } else if (cmd.type === 'updateElement') {
            isEntity = true;
          } else if (
            cmd.type === 'updatePresentation' ||
            cmd.type === 'addToDiagram' ||
            cmd.type === 'removeFromDiagram'
          ) {
            isPresentation = true;
          }
        }

        const result: SysmlCommandResult = executeSysmlCommand(
          state.gatewayState,
          cmd,
          state.activeDiagramId,
        );

        if (result.committed) {
          state.gatewayState.repository = result.repository;
          state.gatewayState.history = result.history;
          state.gatewayState.store = result.store;
          state.gatewayState.coordinates = result.coordinates;
          state.gatewayState.diagramPresentations = result.diagramPresentations;

          state = {
            ...state,
            repository: result.repository,
            store: result.store ?? fromRepository(result.repository, result.coordinates as any, result.diagramPresentations),
            coordinates: (result.coordinates as any) ?? state.coordinates,
            diagramPresentations: (result.diagramPresentations as any) ?? state.diagramPresentations,
            revisions: {
              ...state.revisions,
              entityRevision: isEntity ? state.revisions.entityRevision + 1 : state.revisions.entityRevision,
              membershipRevision: isMembership ? state.revisions.membershipRevision + 1 : state.revisions.membershipRevision,
              presentationRevision: isPresentation ? state.revisions.presentationRevision + 1 : state.revisions.presentationRevision,
              historyRevision: state.revisions.historyRevision + 1,
            },
          };
          notify();
        }
        break;
      }

      case 'undo': {
        const result: SysmlCommandResult = executeSysmlCommand(
          state.gatewayState,
          { type: 'undo' },
          state.activeDiagramId,
        );
        if (result.committed) {
          state.gatewayState.repository = result.repository;
          state.gatewayState.history = result.history;
          state.gatewayState.store = result.store;
          state.gatewayState.coordinates = result.coordinates;
          state.gatewayState.diagramPresentations = result.diagramPresentations;

          state = {
            ...state,
            repository: result.repository,
            store: result.store ?? fromRepository(result.repository, result.coordinates as any, result.diagramPresentations),
            coordinates: (result.coordinates as any) ?? state.coordinates,
            diagramPresentations: (result.diagramPresentations as any) ?? state.diagramPresentations,
            revisions: {
              ...state.revisions,
              entityRevision: state.revisions.entityRevision + 1,
              membershipRevision: state.revisions.membershipRevision + 1,
              presentationRevision: state.revisions.presentationRevision + 1,
              historyRevision: state.revisions.historyRevision + 1,
            },
          };
          notify();
        }
        break;
      }

      case 'redo': {
        const result: SysmlCommandResult = executeSysmlCommand(
          state.gatewayState,
          { type: 'redo' },
          state.activeDiagramId,
        );
        if (result.committed) {
          state.gatewayState.repository = result.repository;
          state.gatewayState.history = result.history;
          state.gatewayState.store = result.store;
          state.gatewayState.coordinates = result.coordinates;
          state.gatewayState.diagramPresentations = result.diagramPresentations;

          state = {
            ...state,
            repository: result.repository,
            store: result.store ?? fromRepository(result.repository, result.coordinates as any, result.diagramPresentations),
            coordinates: (result.coordinates as any) ?? state.coordinates,
            diagramPresentations: (result.diagramPresentations as any) ?? state.diagramPresentations,
            revisions: {
              ...state.revisions,
              entityRevision: state.revisions.entityRevision + 1,
              membershipRevision: state.revisions.membershipRevision + 1,
              presentationRevision: state.revisions.presentationRevision + 1,
              historyRevision: state.revisions.historyRevision + 1,
            },
          };
          notify();
        }
        break;
      }

      case 'reset': {
        const nextRepo = action.repository;
        const nextCoords = action.coordinates ?? {};
        const nextPres = action.diagramPresentations ?? {};
        const nextStore = action.store ?? fromRepository(nextRepo, nextCoords as any, nextPres);
        const nextGateway = createSysmlGatewayState(nextRepo, nextCoords as any, nextPres);
        nextGateway.store = nextStore;

        state = {
          ...state,
          repository: nextRepo,
          store: nextStore,
          coordinates: nextCoords,
          diagramPresentations: nextPres,
          activeDiagramId: action.activeDiagramId ?? state.activeDiagramId,
          gatewayState: nextGateway,
          revisions: {
            entityRevision: state.revisions.entityRevision + 1,
            membershipRevision: state.revisions.membershipRevision + 1,
            presentationRevision: state.revisions.presentationRevision + 1,
            activeViewRevision: state.revisions.activeViewRevision + 1,
            selectionRevision: state.revisions.selectionRevision + 1,
            historyRevision: state.revisions.historyRevision + 1,
          },
        };
        notify();
        break;
      }
    }
  }

  return {
    getState: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispatch,
  };
}
