/**
 * src/agent/toolAdapters/sysmlAdapter.ts
 *
 * Implements SysmlApplicationDelegate and SysmlAdapter by connecting
 * the agent layer to the canonical SysML model and the existing
 * sysmlCommandGateway.
 *
 * Rules enforced:
 * - Approved agent actions are mapped to SysML editor commands; never directly
 *   mutates model arrays.
 * - Stale revisions are rejected before dispatch; failed commands leave model
 *   revision, history, and store unchanged.
 * - Command gateway enforces ownership, endpoint policy, relationship kinds,
 *   and duplicate ID constraints.
 * - Returns updated revision, changed element IDs, and validation evidence.
 * - SysmlAdapter fails closed when the SysML delegate is unavailable.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  executeSysmlCommand,
  type SysmlGatewayState,
  type SysmlCommandResult as GatewayCommandResult,
  type SysmlEditorCommand,
  type SysmlElement,
  type PresentationCoordinates,
} from '../../services/sysmlCommandGateway';
import { validateSysmlRepository } from '../../engine/sysml/validation';
import type {
  BlockDefinition,
  RequirementDefinition,
  SysmlRelationship,
  ConnectorUsage,
} from '../../engine/sysml/model';
import type {
  SysmlApplicationDelegate,
  SysmlSnapshot,
  SysmlAgentCommand,
  SysmlCommandResult,
  SysmlValidationResult,
} from '../applicationDelegates';

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class SysmlAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SysmlAdapterError';
    Object.setPrototypeOf(this, SysmlAdapterError.prototype);
  }
}

// ---------------------------------------------------------------------------
// Delegate Options & Factory
// ---------------------------------------------------------------------------

export interface SysmlAdapterOptions {
  /** Returns the current gateway state snapshot. */
  getState: () => SysmlGatewayState;
  /** Sets the new gateway state when a mutation command commits. */
  setState: (nextState: SysmlGatewayState) => void;
  /** Optional callback invoked after a command is processed. */
  onStateChange?: (result: GatewayCommandResult) => void;
}

function toNamespace(ns: unknown): string[] {
  if (Array.isArray(ns)) {
    return ns.map(String);
  }
  if (typeof ns === 'string' && ns.trim()) {
    return ns.split('::').map((s) => s.trim()).filter(Boolean);
  }
  return ['Root'];
}

/**
 * Maps a SysmlAgentCommand to a SysmlEditorCommand understood by
 * the sysmlCommandGateway.
 */
function mapAgentCommandToEditorCommand(
  cmd: SysmlAgentCommand,
): SysmlEditorCommand | { error: string } {
  const { kind, payload } = cmd;

  switch (kind) {
    case 'createElement': {
      if (!payload.element) {
        return { error: 'createElement requires an "element" in payload' };
      }
      return {
        type: 'createElement',
        element: payload.element as SysmlElement,
        presentation: payload.presentation as PresentationCoordinates | undefined,
      };
    }

    case 'create_block':
    case 'createBlock':
    case 'instantiate_block': {
      const id = (payload.id as string) || `blk_${uuidv4().substring(0, 8)}`;
      const name = (payload.name as string) || id;
      const element: BlockDefinition = {
        id,
        kind: 'block',
        name,
        namespace: toNamespace(payload.namespace),
        isAbstract: Boolean(payload.isAbstract),
        isLeaf: Boolean(payload.isLeaf),
        properties: (payload.properties as any) || [],
        ports: (payload.ports as any) || [],
        operations: (payload.operations as any) || [],
        constraints: (payload.constraints as any) || [],
      };
      return {
        type: 'createElement',
        element,
        presentation: payload.presentation as PresentationCoordinates | undefined,
      };
    }

    case 'create_requirement':
    case 'createRequirement': {
      const id = (payload.id as string) || `req_${uuidv4().substring(0, 8)}`;
      const name = (payload.name as string) || id;
      const element: RequirementDefinition = {
        id,
        kind: 'requirement',
        name,
        namespace: toNamespace(payload.namespace),
        requirementId: (payload.requirementId as string) || `REQ-${id}`,
        text: (payload.text as string) || '',
        status: (payload.status as any) || 'draft',
        version: (payload.version as string) || '1.0',
        priority: (payload.priority as any) || 'medium',
      };
      return {
        type: 'createElement',
        element,
        presentation: payload.presentation as PresentationCoordinates | undefined,
      };
    }

    case 'create_relationship':
    case 'createRelationship':
    case 'connect_elements': {
      if (!payload.sourceId || !payload.targetId) {
        return { error: 'create_relationship requires sourceId and targetId' };
      }
      const id = (payload.id as string) || `rel_${uuidv4().substring(0, 8)}`;
      const element: SysmlRelationship = {
        id,
        kind: (payload.relationshipKind ?? payload.kind ?? 'satisfy') as any,
        sourceId: String(payload.sourceId),
        targetId: String(payload.targetId),
      };
      return {
        type: 'createElement',
        element,
      };
    }

    case 'create_connector':
    case 'createConnector':
    case 'connect_ports': {
      if (!payload.sourcePortId || !payload.targetPortId) {
        return { error: 'create_connector requires sourcePortId and targetPortId' };
      }
      const id = (payload.id as string) || `conn_${uuidv4().substring(0, 8)}`;
      const element: ConnectorUsage = {
        id,
        kind: (payload.connectorKind ?? 'assembly') as any,
        ownerId: String(payload.ownerId ?? payload.ownerBlockId ?? payload.contextBlockId ?? ''),
        sourcePortId: String(payload.sourcePortId),
        targetPortId: String(payload.targetPortId),
      };
      return {
        type: 'createElement',
        element,
      };
    }

    case 'update_element':
    case 'updateElement': {
      if (!payload.elementId) {
        return { error: 'updateElement requires elementId' };
      }
      return {
        type: 'updateElement',
        elementId: String(payload.elementId),
        patch: (payload.patch as Record<string, unknown>) || {},
      };
    }

    case 'delete_elements':
    case 'deleteElements': {
      const elementIds = (payload.elementIds as string[]) || (payload.elementId ? [String(payload.elementId)] : []);
      if (!elementIds.length) {
        return { error: 'deleteElements requires elementIds' };
      }
      return {
        type: 'deleteElements',
        elementIds,
        confirmedImpactHash: payload.confirmedImpactHash as string | undefined,
        authorizedBaselineIds: payload.authorizedBaselineIds as string[] | undefined,
      };
    }

    case 'updatePresentation': {
      if (!payload.elementId || !payload.presentation) {
        return { error: 'updatePresentation requires elementId and presentation' };
      }
      return {
        type: 'updatePresentation',
        elementId: String(payload.elementId),
        presentation: payload.presentation as PresentationCoordinates,
      };
    }

    default:
      return { error: `Unsupported SysML command kind: "${kind}"` };
  }
}

/**
 * Creates a SysmlApplicationDelegate connected to the live SysML command gateway.
 */
export function createSysmlDelegate(opts: SysmlAdapterOptions): SysmlApplicationDelegate {
  const { getState, setState, onStateChange } = opts;

  return {
    async inspect(): Promise<SysmlSnapshot> {
      const state = getState();
      const repo = state.repository;
      const blockCount = Object.values(repo.definitions).filter((d) => d.kind === 'block').length;
      const requirementCount = Object.keys(repo.requirements).length;

      return {
        revision: repo.revision,
        blockCount,
        requirementCount,
      };
    },

    async executeCommand(cmd: SysmlAgentCommand): Promise<SysmlCommandResult> {
      const currentState = getState();
      const currentRevision = currentState.repository.revision;

      // Stale revision guard: command revision must equal current model revision
      if (cmd.revision !== currentRevision) {
        return {
          success: false,
          newRevision: currentRevision,
          changedElementIds: [],
          diagnostics: [
            `Stale revision: command revision ${cmd.revision} does not match model revision ${currentRevision}`,
          ],
        };
      }

      // Map to editor command
      const mapped = mapAgentCommandToEditorCommand(cmd);
      if ('error' in mapped) {
        return {
          success: false,
          newRevision: currentRevision,
          changedElementIds: [],
          diagnostics: [mapped.error],
        };
      }

      // Execute via the SysML command gateway
      const result = executeSysmlCommand(currentState, mapped);

      if (result.committed) {
        const nextState: SysmlGatewayState = {
          repository: result.repository,
          history: result.history,
          store: result.store,
          patchHistory: result.patchHistory,
          coordinates: result.coordinates,
          diagramPresentations: result.diagramPresentations,
          presentationHistory: result.presentationHistory,
          actionStack: result.actionStack,
          redoStack: result.redoStack,
        };

        setState(nextState);
        onStateChange?.(result);

        const changedElementIds =
          mapped.type === 'createElement' && mapped.element?.id
            ? [mapped.element.id]
            : mapped.type === 'updateElement' && mapped.elementId
              ? [mapped.elementId]
              : mapped.type === 'deleteElements' && mapped.elementIds
                ? mapped.elementIds
                : [];

        return {
          success: true,
          newRevision: result.repository.revision,
          changedElementIds,
          diagnostics: result.diagnostics.map((d) => d.message),
        };
      } else {
        // Not committed; model remains completely untouched
        return {
          success: false,
          newRevision: currentRevision,
          changedElementIds: [],
          diagnostics: result.diagnostics.map((d) => d.message),
        };
      }
    },

    async validate(): Promise<SysmlValidationResult> {
      const state = getState();
      const validation = validateSysmlRepository(state.repository);
      const errors = validation.diagnostics.filter((d) => d.severity === 'error');

      return {
        valid: errors.length === 0,
        diagnostics: validation.diagnostics.map((d) => d.message),
      };
    },
  };
}

// ---------------------------------------------------------------------------
// ToolAdapter implementation for Agent ToolGateway
// ---------------------------------------------------------------------------

export interface SysmlInspectionResult {
  success: boolean;
  data: Record<string, unknown>;
  error?: string;
}

export interface SysmlApprovedAction {
  id?: string;
  kind: string;
  projectId?: string;
  targetWorkspace?: string;
  params?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  blockIds?: string[];
  approvalId?: string;
  revision?: number;
}

export interface SysmlToolResult {
  success: boolean;
  changedArtifacts: string[];
  evidence: Record<string, unknown>;
  durationMs: number;
  error?: string;
}

export class SysmlAdapter {
  constructor(private delegate?: SysmlApplicationDelegate) {}

  public isAvailable(): boolean {
    return Boolean(this.delegate);
  }

  public async inspect(params: Record<string, unknown> = {}): Promise<SysmlInspectionResult> {
    if (!this.delegate) {
      return {
        success: false,
        data: {},
        error: 'SysML delegate is unavailable; command gateway is not connected.',
      };
    }

    try {
      const snapshot = await this.delegate.inspect();
      return {
        success: true,
        data: {
          workspace: 'sysml',
          revision: snapshot.revision,
          blockCount: snapshot.blockCount,
          requirementCount: snapshot.requirementCount,
          params,
        },
      };
    } catch (err: unknown) {
      return {
        success: false,
        data: {},
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  public async execute(action: SysmlApprovedAction): Promise<SysmlToolResult> {
    const startTime = Date.now();

    if (!this.delegate) {
      return {
        success: false,
        changedArtifacts: [],
        evidence: {},
        durationMs: Date.now() - startTime,
        error: 'SysML mutation delegate is not connected; no model change was made.',
      };
    }

    // Inspect current snapshot to verify revision
    const currentSnapshot = await this.delegate.inspect();
    const actionRevision =
      action.revision ??
      (action.params?.revision as number | undefined) ??
      currentSnapshot.revision;

    if (action.revision !== undefined && action.revision !== currentSnapshot.revision) {
      return {
        success: false,
        changedArtifacts: [],
        evidence: {
          requestedRevision: action.revision,
          currentRevision: currentSnapshot.revision,
        },
        durationMs: Date.now() - startTime,
        error: `Stale revision: action revision ${action.revision} does not match current model revision ${currentSnapshot.revision}`,
      };
    }

    const cmd: SysmlAgentCommand = {
      kind: action.kind,
      payload: (action.payload ?? action.params ?? {}) as Record<string, unknown>,
      revision: actionRevision,
    };

    const cmdResult = await this.delegate.executeCommand(cmd);
    if (!cmdResult.success) {
      return {
        success: false,
        changedArtifacts: [],
        evidence: {
          revision: cmdResult.newRevision,
          diagnostics: cmdResult.diagnostics,
        },
        durationMs: Date.now() - startTime,
        error: `SysML command rejected: ${cmdResult.diagnostics.join('; ') || 'Operation failed'}`,
      };
    }

    // Capture validation evidence
    const validation = await this.delegate.validate();

    return {
      success: true,
      changedArtifacts: cmdResult.changedElementIds,
      evidence: {
        newRevision: cmdResult.newRevision,
        changedElementIds: cmdResult.changedElementIds,
        diagnostics: cmdResult.diagnostics,
        validation: {
          valid: validation.valid,
          diagnostics: validation.diagnostics,
        },
      },
      durationMs: Date.now() - startTime,
    };
  }
}
