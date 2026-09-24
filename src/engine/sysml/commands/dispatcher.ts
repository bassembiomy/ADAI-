import type { SysmlRepositoryV4 } from '../domain';
import type {
  CommandContext,
  CommandResult,
  SysmlCommand,
  AuditRecord,
} from './types';
import {
  handleCreateElement,
  handleUpdateElement,
  handleRenameElement,
  handleMoveElement,
  handleDeleteElement,
} from './elementCommands';
import {
  handleCreateRelationship,
  handleUpdateRelationship,
  handleDeleteRelationship,
} from './relationshipCommands';
import {
  executeDisplayExistingElement,
  executeRemovePresentation,
  executeMovePresentation,
  executeResizePresentation,
} from './presentationCommands';

export * from './types';
export * from './elementCommands';
export * from './relationshipCommands';

export function dispatchSysmlCommand(
  state: SysmlRepositoryV4,
  command: SysmlCommand,
  context: CommandContext
): CommandResult {
  const timestamp = context.timestamp ?? Date.now();
  let result: {
    success: boolean;
    code?: string;
    message?: string;
    nextState: SysmlRepositoryV4;
    affectedIds?: string[];
  };

  switch (command.type) {
    case 'CreateElement':
      result = handleCreateElement(state, command);
      break;
    case 'UpdateElement':
      result = handleUpdateElement(state, command);
      break;
    case 'RenameElement':
      result = handleRenameElement(state, command);
      break;
    case 'MoveElement':
      result = handleMoveElement(state, command);
      break;
    case 'DeleteElement':
      result = handleDeleteElement(state, command);
      break;

    case 'CreateRelationship':
      result = handleCreateRelationship(state, command);
      break;
    case 'UpdateRelationship':
      result = handleUpdateRelationship(state, command);
      break;
    case 'DeleteRelationship':
      result = handleDeleteRelationship(state, command);
      break;

    case 'DisplayExistingElement': {
      try {
        const repoCopy = structuredClone(state);
        // Ensure diagram exists in repoCopy
        if (!repoCopy.diagrams[command.presentation.diagramId]) {
          repoCopy.diagrams[command.presentation.diagramId] = {
            id: command.presentation.diagramId,
            name: command.presentation.diagramId,
            metaclass: 'Diagram',
            diagramKind: 'bdd',
            namespace: [],
            ownerId: 'pkg-root',
            presentationIds: [],
          };
        }
        executeDisplayExistingElement(repoCopy, {
          type: 'DisplayExistingElement',
          diagramId: command.presentation.diagramId,
          semanticElementId: command.presentation.semanticElementId,
          id: command.presentation.id,
          bounds: command.presentation.bounds,
          visibleCompartments: command.presentation.visibleCompartments,
          style: command.presentation.style,
          zIndex: command.presentation.zIndex,
        });
        repoCopy.revision = state.revision + 1;
        result = {
          success: true,
          nextState: repoCopy,
          affectedIds: [command.presentation.id],
        };
      } catch (err: any) {
        result = {
          success: false,
          code: 'PRESENTATION_ERROR',
          message: err?.message || String(err),
          nextState: state,
        };
      }
      break;
    }
    case 'RemovePresentation': {
      try {
        const repoCopy = structuredClone(state);
        executeRemovePresentation(repoCopy, {
          type: 'RemovePresentation',
          presentationId: command.presentationId,
        });
        repoCopy.revision = state.revision + 1;
        result = {
          success: true,
          nextState: repoCopy,
          affectedIds: [command.presentationId],
        };
      } catch (err: any) {
        result = {
          success: false,
          code: 'PRESENTATION_ERROR',
          message: err?.message || String(err),
          nextState: state,
        };
      }
      break;
    }
    case 'MovePresentation': {
      try {
        const repoCopy = structuredClone(state);
        executeMovePresentation(repoCopy, {
          type: 'MovePresentation',
          presentationId: command.presentationId,
          x: command.x,
          y: command.y,
        });
        repoCopy.revision = state.revision + 1;
        result = {
          success: true,
          nextState: repoCopy,
          affectedIds: [command.presentationId],
        };
      } catch (err: any) {
        result = {
          success: false,
          code: 'PRESENTATION_ERROR',
          message: err?.message || String(err),
          nextState: state,
        };
      }
      break;
    }
    case 'ResizePresentation': {
      try {
        const repoCopy = structuredClone(state);
        executeResizePresentation(repoCopy, {
          type: 'ResizePresentation',
          presentationId: command.presentationId,
          width: command.width,
          height: command.height,
        });
        repoCopy.revision = state.revision + 1;
        result = {
          success: true,
          nextState: repoCopy,
          affectedIds: [command.presentationId],
        };
      } catch (err: any) {
        result = {
          success: false,
          code: 'PRESENTATION_ERROR',
          message: err?.message || String(err),
          nextState: state,
        };
      }
      break;
    }

    default: {
      const exhaustiveCheck: never = command;
      return {
        success: false,
        code: 'UNKNOWN_COMMAND',
        message: `Unknown command type ${(exhaustiveCheck as SysmlCommand).type}`,
        revision: state.revision,
        state,
      };
    }
  }

  if (!result.success) {
    return {
      success: false,
      code: result.code,
      message: result.message,
      revision: state.revision,
      state,
    };
  }

  const auditRecord: AuditRecord = {
    command: command.type,
    source: context.source,
    actor: context.actor,
    timestamp,
    details: { command },
  };

  return {
    success: true,
    revision: result.nextState.revision,
    state: result.nextState,
    auditRecord,
    affectedIds: result.affectedIds,
  };
}

export interface TransactionManager {
  getState(): SysmlRepositoryV4;
  dispatch(command: SysmlCommand, context: CommandContext): CommandResult;
  canUndo(): boolean;
  canRedo(): boolean;
  undo(): boolean;
  redo(): boolean;
  clearHistory(): void;
}

export function createTransactionManager(
  initialState: SysmlRepositoryV4,
  maxHistorySize = 50
): TransactionManager {
  let currentState = initialState;
  const undoStack: SysmlRepositoryV4[] = [];
  const redoStack: SysmlRepositoryV4[] = [];

  return {
    getState: () => currentState,
    dispatch: (command: SysmlCommand, context: CommandContext): CommandResult => {
      const res = dispatchSysmlCommand(currentState, command, context);
      if (res.success) {
        undoStack.push(currentState);
        if (undoStack.length > maxHistorySize) {
          undoStack.shift();
        }
        redoStack.length = 0; // Clear redo on new action
        currentState = res.state;
      }
      return res;
    },
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
    undo: (): boolean => {
      if (undoStack.length === 0) return false;
      const prev = undoStack.pop()!;
      redoStack.push(currentState);
      currentState = prev;
      return true;
    },
    redo: (): boolean => {
      if (redoStack.length === 0) return false;
      const next = redoStack.pop()!;
      undoStack.push(currentState);
      currentState = next;
      return true;
    },
    clearHistory: () => {
      undoStack.length = 0;
      redoStack.length = 0;
    },
  };
}
