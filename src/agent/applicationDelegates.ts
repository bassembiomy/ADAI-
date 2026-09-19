/**
 * src/agent/applicationDelegates.ts
 *
 * Application delegate interfaces for the ADIA agent integration.
 *
 * These interfaces define the contracts that bridge the approval-gated
 * AgentOrchestrator to the real ADIA application state. Every mutation
 * method requires a live delegate — missing delegates fail closed via
 * DelegateUnavailableError.
 *
 * IMPORTANT: These are pure interface definitions. No application logic
 * or mutation rules are encoded here; all rules remain in the existing
 * ADIA workspace and command gateway layers.
 */

// ---------------------------------------------------------------------------
// Shared domain types
// ---------------------------------------------------------------------------

/** Minimal node representation used by the agent layer. */
export type XbridgesNode = {
  id: string;
  type: string;
  data: Record<string, unknown>;
  position?: { x: number; y: number };
};

/** Minimal edge representation used by the agent layer. */
export type XbridgesEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
};

/** Read-only SysML model snapshot. */
export type SysmlSnapshot = {
  revision: number;
  blockCount: number;
  requirementCount: number;
};

/**
 * A single mutation command dispatched through the existing SysML command
 * gateway. The `revision` field must match the current model revision to
 * prevent stale mutations.
 */
export type SysmlAgentCommand = {
  kind: string;
  payload: Record<string, unknown>;
  /** Must equal the current model revision at the time of dispatch. */
  revision: number;
};

/** Result returned by the SysML command gateway. */
export type SysmlCommandResult = {
  success: boolean;
  newRevision: number;
  changedElementIds: string[];
  diagnostics: string[];
};

/** Result of running SysML integrity validation. */
export type SysmlValidationResult = {
  valid: boolean;
  diagnostics: string[];
};

/** Input to the report generation pipeline. */
export type ReportSnapshot = {
  projectId: string;
  format: 'docx' | 'pdf';
  template?: string;
  evidenceIds: string[];
  modelRevision?: number;
  engineRunId?: string;
  simulationStatus?: string;
};

/** Artifact produced by the real report exporter — must be verified before returning. */
export type ReportArtifact = {
  path: string;
  format: 'docx' | 'pdf';
  /** SHA-256 hex digest of the artifact file. */
  contentHash: string;
  snapshotId: string;
  evidenceIds: string[];
  sizeBytes: number;
};

/** A lightweight snapshot of the overall project model state. */
export type ProjectModelSnapshot = {
  projectId: string;
  workspace: string;
  revision: number;
  snapshotId: string;
  /** Unix ms timestamp when snapshot was captured. */
  capturedAt: number;
};

// ---------------------------------------------------------------------------
// Delegate interfaces
// ---------------------------------------------------------------------------

/**
 * Bridges the agent to the live X-BRIDGES React Flow workspace.
 *
 * Read methods (`getNodes`, `getEdges`, `getRevisionFingerprint`) may be called at any time.
 * Mutation methods must only be called after an approved action token has been validated.
 */
export interface XbridgesApplicationDelegate {
  /** Return a read-only snapshot of current nodes. */
  getNodes(): Promise<readonly XbridgesNode[]>;
  /** Return a read-only snapshot of current edges. */
  getEdges(): Promise<readonly XbridgesEdge[]>;
  /**
   * Add a block of the given type to the workspace.
   * Must use the existing ADIA block catalog factory — never invents new block
   * types.
   */
  addBlock(type: string, params: Record<string, unknown>): Promise<XbridgesNode>;
  /**
   * Remove a block and all connected edges from the workspace.
   */
  removeBlock(nodeId: string): Promise<{ removedNodeId: string; removedEdgeIds: string[] }>;
  /**
   * Move a block to a new canvas position.
   */
  moveBlock(nodeId: string, position: { x: number; y: number }): Promise<XbridgesNode>;
  /**
   * Rename a block label/instanceName.
   */
  renameBlock(nodeId: string, newName: string): Promise<XbridgesNode>;
  /**
   * Connect two ports with a new edge.
   * Validates source/target compatibility using existing X-BRIDGES port rules
   * before appending the edge.
   */
  connectPorts(
    sourceNodeId: string,
    sourcePortId: string,
    targetNodeId: string,
    targetPortId: string,
  ): Promise<XbridgesEdge>;
  /**
   * Disconnect ports between two blocks or remove by edge ID.
   */
  disconnectPorts(
    connection: string | { sourceNodeId: string; sourcePortId: string; targetNodeId: string; targetPortId: string }
  ): Promise<{ disconnectedEdgeId: string }>;
  /**
   * Immutably update the parameter map of an existing node.
   * All other node metadata must be preserved.
   */
  updateParameters(nodeId: string, params: Record<string, unknown>): Promise<XbridgesNode>;
  /**
   * Run model integrity validation against active blocks and connections.
   */
  validate(): Promise<{ valid: boolean; diagnostics: Array<{ code: string; message: string; severity?: string }> }>;
  /** Persist the current workspace state through the existing save callback. */
  save(): Promise<void>;
  /**
   * Persist current workspace state and return read-back nodes, edges, and fingerprint.
   */
  saveAndReadBack(): Promise<{ nodes: readonly XbridgesNode[]; edges: readonly XbridgesEdge[]; fingerprint: string }>;
  /**
   * Return the canonical revision fingerprint of the current workspace state.
   */
  getRevisionFingerprint(): Promise<string>;
  /** Restore exact nodes and edges to the workspace state (used for atomic rollback/undo). */
  restoreSnapshot?(nodes: readonly XbridgesNode[], edges: readonly XbridgesEdge[]): Promise<void>;
}

/**
 * Bridges the agent to the canonical SysML model and command gateway.
 *
 * The `executeCommand` method routes through the existing `executeSysmlCommand`
 * gateway, which owns all validation, ownership checks, and revision
 * management.
 */
export interface SysmlApplicationDelegate {
  /** Return a read-only snapshot of the current model revision and counts. */
  inspect(): Promise<SysmlSnapshot>;
  /**
   * Dispatch ONE mutation command through the existing SysML command gateway.
   * Rejects stale revisions. Returns real gateway diagnostics.
   */
  executeCommand(cmd: SysmlAgentCommand): Promise<SysmlCommandResult>;
  /** Run the existing SysML integrity service and return diagnostics. */
  validate(): Promise<SysmlValidationResult>;
}

/**
 * Bridges the agent to the ADIA report export pipeline.
 *
 * The implementation must invoke the existing DOCX/PDF exporters from
 * `src/features/reporting/`. A report artifact is only returned after
 * the file has been verified to exist, is non-empty, and its content hash
 * has been computed.
 */
export interface ReportApplicationDelegate {
  /**
   * Generate a report artifact from the given snapshot.
   * Returns only after the artifact has been verified (exists, non-empty,
   * hash computed). Throws if export fails or verification fails.
   */
  generateReport(snapshot: ReportSnapshot): Promise<ReportArtifact>;
}

/**
 * Bridges the agent to project-level identity and persistence operations.
 */
export interface ProjectApplicationDelegate {
  /** Return the active project ID. */
  getProjectId(): string;
  /**
   * Return the identifier of the currently active workspace.
   * One of: 'xbridges' | 'sysml' | 'vlab' | 'hil' | 'entropy' | 'plantuml' | 'statemachine'
   */
  getActiveWorkspace(): string;
  /** Capture a lightweight snapshot of the current model state. */
  getModelSnapshot(): Promise<ProjectModelSnapshot>;
  /** Trigger a persistence refresh (e.g. after an import or save). */
  refreshPersistence(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Bundle
// ---------------------------------------------------------------------------

/**
 * The complete set of application delegates available to the agent.
 *
 * `project` is always required. Mutation delegates (`xbridges`, `sysml`,
 * `report`) are optional — they are only present when the corresponding
 * workspace is active and the state setters are available in App.tsx.
 *
 * An adapter MUST call `assertMutationReady` (or check `isMutationReady`)
 * before attempting a mutation. Missing mutation delegates MUST fail closed —
 * no silent no-ops.
 */
export interface AgentApplicationDelegates {
  project: ProjectApplicationDelegate;
  /** Present only when the X-BRIDGES workspace is active. */
  xbridges?: XbridgesApplicationDelegate;
  /** Present only when the SysML diagram editor is active. */
  sysml?: SysmlApplicationDelegate;
  /** Present only when the reporting pipeline is available. */
  report?: ReportApplicationDelegate;
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

/**
 * Thrown by `assertMutationReady` when a required delegate is absent.
 * The `workspace` field identifies which delegate is missing.
 */
export class DelegateUnavailableError extends Error {
  public readonly workspace: string;

  constructor(workspace: string) {
    super(`Delegate unavailable for workspace: ${workspace}`);
    this.name = 'DelegateUnavailableError';
    this.workspace = workspace;
    // Maintain correct prototype chain in transpiled ES5
    Object.setPrototypeOf(this, DelegateUnavailableError.prototype);
  }
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

/** Workspace keys that have optional mutation delegates. */
type MutationWorkspace = 'xbridges' | 'sysml' | 'report';

/** Map from workspace key to its delegate interface. */
type DelegateForWorkspace<W extends MutationWorkspace> =
  W extends 'xbridges' ? XbridgesApplicationDelegate :
  W extends 'sysml'    ? SysmlApplicationDelegate :
  W extends 'report'   ? ReportApplicationDelegate :
  never;

/** Bundle type that guarantees the specified delegate is present. */
type ReadyDelegates<W extends MutationWorkspace> =
  AgentApplicationDelegates & Record<W, DelegateForWorkspace<W>>;

/**
 * Returns `true` if the delegate for the given workspace is present.
 *
 * @example
 * if (isMutationReady(delegates, 'xbridges')) {
 *   await delegates.xbridges.addBlock(...);
 * }
 */
export function isMutationReady<W extends MutationWorkspace>(
  delegates: AgentApplicationDelegates,
  workspace: W,
): delegates is ReadyDelegates<W> {
  return delegates[workspace] !== undefined;
}

/**
 * Asserts that the delegate for the given workspace is present.
 * Throws `DelegateUnavailableError` if absent.
 *
 * @example
 * assertMutationReady(delegates, 'sysml'); // throws if sysml absent
 * await delegates.sysml!.executeCommand(...);
 */
export function assertMutationReady<W extends MutationWorkspace>(
  delegates: AgentApplicationDelegates,
  workspace: W,
): asserts delegates is ReadyDelegates<W> {
  if (!isMutationReady(delegates, workspace)) {
    throw new DelegateUnavailableError(workspace);
  }
}
