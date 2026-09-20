/**
 * src/agent/toolAdapters/xbridgesAdapter.ts
 *
 * Implements XbridgesApplicationDelegate by wrapping the live
 * globalXBridgesNodes / globalXBridgesEdges state from App.tsx.
 *
 * Rules enforced here:
 * - Block type must exist in BLOCK_LIBRARY; unknown types are rejected.
 * - connectPorts validates that source port is an output and target port is an
 *   input on their respective nodes before appending the edge.
 * - updateParameters immutably merges params, preserving all other node data.
/**
 * src/agent/toolAdapters/xbridgesAdapter.ts
 *
 * Implements XbridgesApplicationDelegate by wrapping the live
 * globalXBridgesNodes / globalXBridgesEdges state from App.tsx.
 *
 * Rules enforced here:
 * - Block type must exist in BLOCK_LIBRARY; unknown types are rejected.
 * - connectPorts validates that source port is an output and target port is an
 *   input on their respective nodes before appending the edge.
 * - updateParameters immutably merges params, preserving all other node data.
 * - save() calls the onSave callback passed from App.tsx (handleXBridgesSave).
 *
 * This adapter never modifies the BLOCK_LIBRARY or defines new block types.
 * All model rules remain in the engine layer.
 */

import { v4 as uuidv4 } from 'uuid';
import { BLOCK_LIBRARY } from '../../engine/xbridges/BlockDefinitions';
import { computeModelFingerprint } from '../../engine/opm/canonicalHash';
import type {
  ApprovedAction,
  ToolAdapter,
  ToolResult,
  InspectionResult,
} from '../actionContracts';
import type {
  XbridgesApplicationDelegate,
  XbridgesNode,
  XbridgesEdge,
} from '../applicationDelegates';

// ---------------------------------------------------------------------------
// Types mirroring the React Flow node/edge shape used in XbridgesWorkspace
// ---------------------------------------------------------------------------

/** Minimal React Flow node shape as stored in globalXBridgesNodes. */
export interface ReactFlowXbridgesNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: {
    id: string;
    type: string;
    params: Record<string, unknown>;
    inputs: Array<{ id: string; direction: 'input' | 'output' }>;
    outputs: Array<{ id: string; direction: 'input' | 'output' }>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/** Minimal React Flow edge shape as stored in globalXBridgesEdges. */
export interface ReactFlowXbridgesEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class XbridgesAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'XbridgesAdapterError';
    Object.setPrototypeOf(this, XbridgesAdapterError.prototype);
  }
}

// ---------------------------------------------------------------------------
// Adapter implementation
// ---------------------------------------------------------------------------

export interface XbridgesAdapterOptions {
  /** Snapshot of current nodes; the adapter reads from this. */
  getNodes: () => ReactFlowXbridgesNode[];
  /** Snapshot of current edges; the adapter reads from this. */
  getEdges: () => ReactFlowXbridgesEdge[];
  /** Called to update the global nodes array after a mutation. */
  setNodes: (updater: (prev: ReactFlowXbridgesNode[]) => ReactFlowXbridgesNode[]) => void;
  /** Called to update the global edges array after a mutation. */
  setEdges: (updater: (prev: ReactFlowXbridgesEdge[]) => ReactFlowXbridgesEdge[]) => void;
  /**
   * Called to persist the current workspace state.
   * Matches the signature of handleXBridgesSave in App.tsx:
   * (nodes, edges, mappings) => void
   */
  onSave: (nodes: ReactFlowXbridgesNode[], edges: ReactFlowXbridgesEdge[], mappings: readonly never[]) => void;
}

export interface MutableStateRef<T> {
  current: T;
}

/**
 * Keep a long-lived delegate synchronized with React state. Active agent
 * transactions retain their delegate while React may create newer renders,
 * so its reads must not close over a particular render's arrays.
 */
export function createLiveXbridgesStateAccessors(
  nodesRef: MutableStateRef<ReactFlowXbridgesNode[]>,
  edgesRef: MutableStateRef<ReactFlowXbridgesEdge[]>,
  commitNodes: (nodes: ReactFlowXbridgesNode[]) => void,
  commitEdges: (edges: ReactFlowXbridgesEdge[]) => void,
): Pick<XbridgesAdapterOptions, 'getNodes' | 'getEdges' | 'setNodes' | 'setEdges'> {
  return {
    getNodes: () => nodesRef.current,
    getEdges: () => edgesRef.current,
    setNodes: (updater) => {
      const previous = nodesRef.current;
      const next = updater(nodesRef.current);
      nodesRef.current = next;
      try {
        commitNodes(next);
      } catch (error) {
        nodesRef.current = previous;
        throw error;
      }
    },
    setEdges: (updater) => {
      const previous = edgesRef.current;
      const next = updater(edgesRef.current);
      edgesRef.current = next;
      try {
        commitEdges(next);
      } catch (error) {
        edgesRef.current = previous;
        throw error;
      }
    },
  };
}

/**
 * Create an XbridgesApplicationDelegate backed by live React state.
 *
 * The returned delegate captures `getNodes`, `getEdges`, `setNodes`, `setEdges`,
 * and `onSave` at construction time. App.tsx should reconstruct the delegate
 * via `useMemo` when the active workspace or state setters change.
 */
export function createXbridgesDelegate(opts: XbridgesAdapterOptions): XbridgesApplicationDelegate {
  const { getNodes, getEdges, setNodes, setEdges, onSave } = opts;
  const recentlyCreatedNodes = new Map<string, ReactFlowXbridgesNode>();

  function resolveNode(nodeId: string): ReactFlowXbridgesNode | undefined {
    return getNodes().find(
      (n) => n.id === nodeId || (n.data as any)?.instanceName === nodeId || (n.data as any)?.id === nodeId
    ) || recentlyCreatedNodes.get(nodeId);
  }

  /**
   * Convert a ReactFlow node to the lean XbridgesNode shape the agent layer
   * uses. The agent never receives internal React Flow-specific fields.
   */
  function toAgentNode(n: ReactFlowXbridgesNode): XbridgesNode {
    return {
      ...n,
      id: n.id,
      type: String(n.data?.type ?? n.type),
      position: n.position ? { x: n.position.x, y: n.position.y } : undefined,
      data: { ...(n.data as Record<string, unknown>) }
    };
  }

  /**
   * Convert a ReactFlow edge to the lean XbridgesEdge shape.
   */
  function toAgentEdge(e: ReactFlowXbridgesEdge): XbridgesEdge {
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
    };
  }

  return {
    // ----- Read-only -------------------------------------------------------

    async getNodes(): Promise<readonly XbridgesNode[]> {
      return getNodes().map(toAgentNode);
    },

    async getEdges(): Promise<readonly XbridgesEdge[]> {
      return getEdges().map(toAgentEdge);
    },

    async getRevisionFingerprint(): Promise<string> {
      const nodes = getNodes().map(toAgentNode).sort((a, b) => a.id.localeCompare(b.id));
      const edges = getEdges().map(toAgentEdge).sort((a, b) => a.id.localeCompare(b.id));
      return computeModelFingerprint({ nodes, edges });
    },

    async validate(): Promise<{ valid: boolean; diagnostics: Array<{ code: string; message: string; severity?: string }> }> {
      const nodes = getNodes();
      const edges = getEdges();
      const diagnostics: Array<{ code: string; message: string; severity?: string }> = [];

      const nodeMap = new Map<string, ReactFlowXbridgesNode>();
      for (const n of nodes) {
        nodeMap.set(n.id, n);
        const blockType = String(n.data?.type ?? n.type);
        if (!BLOCK_LIBRARY[blockType]) {
          diagnostics.push({
            code: 'UNKNOWN_BLOCK_TYPE',
            message: `Block "${n.id}" has unregistered type "${blockType}".`,
            severity: 'ERROR',
          });
        }
      }

      const edgeSet = new Set<string>();
      for (const e of edges) {
        const key = `${e.source}:${e.sourceHandle ?? ''}->${e.target}:${e.targetHandle ?? ''}`;
        if (edgeSet.has(key)) {
          diagnostics.push({
            code: 'DUPLICATE_EDGE',
            message: `Duplicate connection detected: ${key}`,
            severity: 'ERROR',
          });
        }
        edgeSet.add(key);

        const sourceNode = nodeMap.get(e.source);
        const targetNode = nodeMap.get(e.target);

        if (!sourceNode || !targetNode) {
          diagnostics.push({
            code: 'DANGLING_EDGE',
            message: `Edge "${e.id}" connects nonexistent node(s): source=${e.source}, target=${e.target}`,
            severity: 'ERROR',
          });
          continue;
        }

        if (e.sourceHandle) {
          const outPort = (sourceNode.data?.outputs ?? []).find((p: any) => p.id === e.sourceHandle);
          if (!outPort) {
            diagnostics.push({
              code: 'INVALID_SOURCE_PORT',
              message: `Source port "${e.sourceHandle}" not found in block "${e.source}".`,
              severity: 'ERROR',
            });
          }
        }

        if (e.targetHandle) {
          const inPort = (targetNode.data?.inputs ?? []).find((p: any) => p.id === e.targetHandle);
          if (!inPort) {
            diagnostics.push({
              code: 'INVALID_TARGET_PORT',
              message: `Target port "${e.targetHandle}" not found in block "${e.target}".`,
              severity: 'ERROR',
            });
          }
        }
      }

      return {
        valid: diagnostics.length === 0,
        diagnostics,
      };
    },

    // ----- Mutations -------------------------------------------------------

    async addBlock(type: string, params: Record<string, unknown>): Promise<XbridgesNode> {
      // RULE: block type must exist in BLOCK_LIBRARY; never invent new types.
      const factory = BLOCK_LIBRARY[type];
      if (!factory) {
        throw new XbridgesAdapterError(
          `Unknown block type "${type}". Only types present in BLOCK_LIBRARY are permitted.`,
        );
      }

      const id = (params?.id as string) || (params?.instanceName as string) || `${type}-${uuidv4()}`;

      // Duplicate prevention
      const existing = getNodes().find(
        (n) => n.id === id || (n.data as any)?.instanceName === id || (n.data as any)?.id === id
      );
      if (existing) {
        throw new XbridgesAdapterError(`Block with ID or instanceName "${id}" already exists.`);
      }

      const blockDef = factory(id, params);
      const position = (params?.position as { x: number; y: number }) || { x: 200, y: 200 };

      const newNode: ReactFlowXbridgesNode = {
        id: blockDef.id,
        type: 'xblock',
        position,
        data: {
          ...blockDef,
          instanceName: (params?.instanceName as string) || id,
          selected: false,
        } as ReactFlowXbridgesNode['data'],
      };

      const agentNode = toAgentNode(newNode);
      setNodes((prev) => [...prev, newNode]);
      recentlyCreatedNodes.set(id, newNode);

      return agentNode;
    },

    async removeBlock(nodeId: string): Promise<{ removedNodeId: string; removedEdgeIds: string[] }> {
      const currentNodes = getNodes();
      const targetNode = currentNodes.find(
        (n) => n.id === nodeId || (n.data as any)?.instanceName === nodeId || (n.data as any)?.id === nodeId
      );
      if (!targetNode) {
        throw new XbridgesAdapterError(`Block "${nodeId}" not found.`);
      }

      const currentEdges = getEdges();
      const connectedEdges = currentEdges.filter(
        (e) => e.source === targetNode.id || e.target === targetNode.id
      );
      const removedEdgeIds = connectedEdges.map((e) => e.id);

      setNodes((prev) => prev.filter((n) => n.id !== targetNode.id));
      setEdges((prev) => prev.filter((e) => e.source !== targetNode.id && e.target !== targetNode.id));

      return {
        removedNodeId: targetNode.id,
        removedEdgeIds,
      };
    },

    async moveBlock(nodeId: string, position: { x: number; y: number }): Promise<XbridgesNode> {
      const nodes = getNodes();
      const targetNode = nodes.find(
        (n) => n.id === nodeId || (n.data as any)?.instanceName === nodeId || (n.data as any)?.id === nodeId
      );
      if (!targetNode) {
        throw new XbridgesAdapterError(`Block "${nodeId}" not found.`);
      }

      if (targetNode.position && targetNode.position.x === position.x && targetNode.position.y === position.y) {
        throw new XbridgesAdapterError(`Block "${nodeId}" is already at position (${position.x}, ${position.y}). Unchanged state.`);
      }

      let updatedNode: ReactFlowXbridgesNode | null = null;
      setNodes((prev) =>
        prev.map((n) => {
          if (n.id !== targetNode.id) return n;
          const moved: ReactFlowXbridgesNode = {
            ...n,
            position: { x: position.x, y: position.y },
          };
          updatedNode = moved;
          return moved;
        })
      );

      return toAgentNode(updatedNode ?? targetNode);
    },

    async renameBlock(nodeId: string, newName: string): Promise<XbridgesNode> {
      const nodes = getNodes();
      const targetNode = nodes.find(
        (n) => n.id === nodeId || (n.data as any)?.instanceName === nodeId || (n.data as any)?.id === nodeId
      );
      if (!targetNode) {
        throw new XbridgesAdapterError(`Block "${nodeId}" not found.`);
      }

      const currentName = String((targetNode.data as any)?.instanceName ?? targetNode.id);
      if (currentName === newName) {
        throw new XbridgesAdapterError(`Block "${nodeId}" already has name "${newName}". Unchanged state.`);
      }

      let updatedNode: ReactFlowXbridgesNode | null = null;
      setNodes((prev) =>
        prev.map((n) => {
          if (n.id !== targetNode.id) return n;
          const renamed: ReactFlowXbridgesNode = {
            ...n,
            data: {
              ...n.data,
              instanceName: newName,
            },
          };
          updatedNode = renamed;
          return renamed;
        })
      );

      return toAgentNode(updatedNode ?? targetNode);
    },

    async connectPorts(
      sourceNodeId: string,
      sourcePortId: string,
      targetNodeId: string,
      targetPortId: string,
    ): Promise<XbridgesEdge> {
      const sourceNode = resolveNode(sourceNodeId);
      if (!sourceNode) {
        throw new XbridgesAdapterError(`Source node "${sourceNodeId}" not found.`);
      }

      const targetNode = resolveNode(targetNodeId);
      if (!targetNode) {
        throw new XbridgesAdapterError(`Target node "${targetNodeId}" not found.`);
      }

      // Validate that the source port is an output port.
      const sourcePort = (sourceNode.data?.outputs ?? []).find(
        (p: { id: string; direction: string }) => p.id === sourcePortId,
      );
      if (!sourcePort) {
        throw new XbridgesAdapterError(
          `Source port "${sourcePortId}" not found in outputs of node "${sourceNodeId}".`,
        );
      }

      // Validate that the target port is an input port.
      const targetPort = (targetNode.data?.inputs ?? []).find(
        (p: { id: string; direction: string }) => p.id === targetPortId,
      );
      if (!targetPort) {
        throw new XbridgesAdapterError(
          `Target port "${targetPortId}" not found in inputs of node "${targetNodeId}".`,
        );
      }

      // Duplicate connection check
      const currentEdges = getEdges();
      const duplicate = currentEdges.find(
        (e) => e.source === sourceNode.id && e.sourceHandle === sourcePortId && e.target === targetNode.id && e.targetHandle === targetPortId
      );
      if (duplicate) {
        throw new XbridgesAdapterError(`Connection between "${sourceNode.id}:${sourcePortId}" and "${targetNode.id}:${targetPortId}" already exists.`);
      }

      const edgeId = `e-${sourceNode.id}-${sourcePortId}-${targetNode.id}-${targetPortId}`;

      const newEdge: ReactFlowXbridgesEdge = {
        id: edgeId,
        source: sourceNode.id,
        sourceHandle: sourcePortId,
        target: targetNode.id,
        targetHandle: targetPortId,
        type: 'default',
        style: { stroke: '#4caf50', strokeWidth: 3 },
      };

      const agentEdge = toAgentEdge(newEdge);
      setEdges((prev) => [...prev, newEdge]);

      return agentEdge;
    },

    async disconnectPorts(
      connection: string | { sourceNodeId: string; sourcePortId: string; targetNodeId: string; targetPortId: string }
    ): Promise<{ disconnectedEdgeId: string }> {
      const currentEdges = getEdges();
      let targetEdge: ReactFlowXbridgesEdge | undefined;

      if (typeof connection === 'string') {
        targetEdge = currentEdges.find((e) => e.id === connection);
      } else {
        const nodes = getNodes();
        const sourceNode = nodes.find((n) => n.id === connection.sourceNodeId || (n.data as any)?.instanceName === connection.sourceNodeId);
        const targetNode = nodes.find((n) => n.id === connection.targetNodeId || (n.data as any)?.instanceName === connection.targetNodeId);
        const srcId = sourceNode ? sourceNode.id : connection.sourceNodeId;
        const tgtId = targetNode ? targetNode.id : connection.targetNodeId;

        targetEdge = currentEdges.find(
          (e) =>
            e.source === srcId &&
            e.sourceHandle === connection.sourcePortId &&
            e.target === tgtId &&
            e.targetHandle === connection.targetPortId
        );
      }

      if (!targetEdge) {
        throw new XbridgesAdapterError(`Edge not found: ${typeof connection === 'string' ? connection : JSON.stringify(connection)}`);
      }

      const edgeId = targetEdge.id;
      setEdges((prev) => prev.filter((e) => e.id !== edgeId));

      return { disconnectedEdgeId: edgeId };
    },

    async updateParameters(
      nodeId: string,
      params: Record<string, unknown>,
    ): Promise<XbridgesNode> {
      const nodes = getNodes();
      const existing = nodes.find(
        (n) => n.id === nodeId || (n.data as any)?.instanceName === nodeId || (n.data as any)?.id === nodeId
      );
      if (!existing) {
        throw new XbridgesAdapterError(`Node "${nodeId}" not found.`);
      }

      let updatedNode: ReactFlowXbridgesNode | null = null;

      setNodes((prev) =>
        prev.map((n) => {
          if (n.id !== existing.id) return n;
          const merged: ReactFlowXbridgesNode = {
            ...n,
            data: {
              ...n.data,
              params: { ...(n.data.params ?? {}), ...params },
            },
          };
          updatedNode = merged;
          return merged;
        }),
      );

      return toAgentNode(updatedNode ?? existing);
    },

    async save(): Promise<void> {
      const nodes = getNodes();
      const edges = getEdges();
      onSave(nodes, edges, []);
    },

    async saveAndReadBack(): Promise<{ nodes: readonly XbridgesNode[]; edges: readonly XbridgesEdge[]; fingerprint: string }> {
      await this.save();
      const nodes = await this.getNodes();
      const edges = await this.getEdges();
      const fingerprint = await this.getRevisionFingerprint();
      return { nodes, edges, fingerprint };
    },

    async restoreSnapshot(nodes: readonly XbridgesNode[], edges: readonly XbridgesEdge[]): Promise<void> {
      setNodes(() => nodes.map(n => ({
        ...n,
        id: n.id,
        type: n.position ? 'xblock' : n.type,
        position: n.position || { x: 200, y: 200 },
        data: {
          ...n.data,
          id: n.id,
          type: n.type,
        }
      } as unknown as ReactFlowXbridgesNode)));

      setEdges(() => edges.map(e => ({
        ...e,
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle
      } as ReactFlowXbridgesEdge)));
    },
  };
}

// ---------------------------------------------------------------------------
// ToolAdapter implementation for Agent ToolGateway
// ---------------------------------------------------------------------------

export type XbridgesToolResult = ToolResult;
export type XbridgesInspectionResult = InspectionResult;

export interface XbridgesApprovedAction {
  kind: string;
  projectId?: string;
  payload?: Record<string, unknown>;
  params?: Record<string, unknown>;
}

export class XbridgesAdapter implements ToolAdapter {
  constructor(private delegate?: XbridgesApplicationDelegate) {}

  public isAvailable(): boolean {
    return Boolean(this.delegate);
  }

  public async inspect(params: Record<string, unknown> = {}): Promise<InspectionResult> {
    if (!this.delegate) {
      return {
        success: false,
        data: {},
        error: 'X-BRIDGES delegate is unavailable; workspace is not connected.',
      };
    }

    try {
      const nodes = await this.delegate.getNodes();
      const edges = await this.delegate.getEdges();
      return {
        success: true,
        data: {
          workspace: 'xbridges',
          nodeCount: nodes.length,
          edgeCount: edges.length,
          nodes,
          edges,
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

  public async execute(action: ApprovedAction | XbridgesApprovedAction): Promise<ToolResult> {
    const startTime = Date.now();

    if (!this.delegate) {
      return {
        success: false,
        changedArtifacts: [],
        evidence: {},
        durationMs: Date.now() - startTime,
        error: 'X-BRIDGES delegate is not connected; no model change was made.',
      };
    }

    const rawPayload = 'payload' in action ? action.payload : undefined;
    const payload = (rawPayload ?? action.params ?? {}) as Record<string, unknown>;

    try {
      if (action.kind === 'instantiate_block' || action.kind === 'add_block') {
        const blockType = (payload.blockType ?? payload.type ?? payload.blockDefinitionId) as string;
        const nestedParams = (payload.parameters ?? payload.params ?? {}) as Record<string, unknown>;
        const params = { ...payload, ...nestedParams };

        if (!blockType) {
          return {
            success: false,
            changedArtifacts: [],
            evidence: {},
            durationMs: Date.now() - startTime,
            error: 'Missing required blockType in instantiate_block/add_block action params',
          };
        }

        const node = await this.delegate.addBlock(blockType, params);
        return {
          success: true,
          changedArtifacts: [node.id],
          evidence: {
            nodeId: node.id,
            blockType: node.type,
            data: node.data,
          },
          durationMs: Date.now() - startTime,
        };
      }

      if (action.kind === 'remove_block') {
        const blockId = (payload.blockId ?? payload.nodeId) as string;
        if (!blockId) {
          return {
            success: false,
            changedArtifacts: [],
            evidence: {},
            durationMs: Date.now() - startTime,
            error: 'remove_block requires blockId or nodeId',
          };
        }
        const result = await this.delegate.removeBlock(blockId);
        return {
          success: true,
          changedArtifacts: [result.removedNodeId, ...result.removedEdgeIds],
          evidence: result,
          durationMs: Date.now() - startTime,
        };
      }

      if (action.kind === 'move_block') {
        const blockId = (payload.blockId ?? payload.nodeId) as string;
        const position = payload.position as { x: number; y: number };
        if (!blockId || !position) {
          return {
            success: false,
            changedArtifacts: [],
            evidence: {},
            durationMs: Date.now() - startTime,
            error: 'move_block requires blockId and position { x, y }',
          };
        }
        const node = await this.delegate.moveBlock(blockId, position);
        return {
          success: true,
          changedArtifacts: [node.id],
          evidence: { nodeId: node.id, position: node.position },
          durationMs: Date.now() - startTime,
        };
      }

      if (action.kind === 'rename_block') {
        const blockId = (payload.blockId ?? payload.nodeId) as string;
        const newName = (payload.newName ?? payload.newLabel) as string;
        if (!blockId || !newName) {
          return {
            success: false,
            changedArtifacts: [],
            evidence: {},
            durationMs: Date.now() - startTime,
            error: 'rename_block requires blockId and newName',
          };
        }
        const node = await this.delegate.renameBlock(blockId, newName);
        return {
          success: true,
          changedArtifacts: [node.id],
          evidence: { nodeId: node.id, newName },
          durationMs: Date.now() - startTime,
        };
      }

      if (action.kind === 'connect_ports') {
        const sourceNodeId = (payload.sourceNodeId ?? payload.sourceNode ?? payload.sourceBlockId) as string;
        const sourcePortId = (payload.sourcePortId ?? payload.sourcePort) as string;
        const targetNodeId = (payload.targetNodeId ?? payload.targetNode ?? payload.targetBlockId) as string;
        const targetPortId = (payload.targetPortId ?? payload.targetPort) as string;

        if (!sourceNodeId || !sourcePortId || !targetNodeId || !targetPortId) {
          return {
            success: false,
            changedArtifacts: [],
            evidence: {},
            durationMs: Date.now() - startTime,
            error: 'connect_ports requires sourceNodeId, sourcePortId, targetNodeId, and targetPortId',
          };
        }

        const edge = await this.delegate.connectPorts(sourceNodeId, sourcePortId, targetNodeId, targetPortId);
        return {
          success: true,
          changedArtifacts: [edge.id],
          evidence: {
            edgeId: edge.id,
            source: edge.source,
            sourceHandle: edge.sourceHandle,
            target: edge.target,
            targetHandle: edge.targetHandle,
          },
          durationMs: Date.now() - startTime,
        };
      }

      if (action.kind === 'disconnect_ports') {
        const connectionId = (payload.connectionId ?? payload.edgeId) as string | undefined;
        const sourceNodeId = (payload.sourceNodeId ?? payload.sourceBlockId) as string | undefined;
        const sourcePortId = payload.sourcePortId as string | undefined;
        const targetNodeId = (payload.targetNodeId ?? payload.targetBlockId) as string | undefined;
        const targetPortId = payload.targetPortId as string | undefined;

        let result: { disconnectedEdgeId: string };
        if (connectionId) {
          result = await this.delegate.disconnectPorts(connectionId);
        } else if (sourceNodeId && sourcePortId && targetNodeId && targetPortId) {
          result = await this.delegate.disconnectPorts({ sourceNodeId, sourcePortId, targetNodeId, targetPortId });
        } else {
          return {
            success: false,
            changedArtifacts: [],
            evidence: {},
            durationMs: Date.now() - startTime,
            error: 'disconnect_ports requires connectionId or endpoints',
          };
        }

        return {
          success: true,
          changedArtifacts: [result.disconnectedEdgeId],
          evidence: result,
          durationMs: Date.now() - startTime,
        };
      }

      if (action.kind === 'configure_parameters' || action.kind === 'set_parameter') {
        const nodeId = (payload.nodeId ?? payload.blockId ?? payload.instanceName) as string;
        let params: Record<string, unknown> = {};
        if (action.kind === 'set_parameter') {
          const paramName = payload.parameterName as string;
          params = { [paramName]: payload.value };
        } else {
          params = (payload.parameters ?? payload.params ?? {}) as Record<string, unknown>;
        }

        if (!nodeId) {
          return {
            success: false,
            changedArtifacts: [],
            evidence: {},
            durationMs: Date.now() - startTime,
            error: 'configure_parameters/set_parameter requires nodeId or blockId',
          };
        }

        const updated = await this.delegate.updateParameters(nodeId, params);
        return {
          success: true,
          changedArtifacts: [updated.id],
          evidence: {
            nodeId: updated.id,
            params: updated.data.params,
          },
          durationMs: Date.now() - startTime,
        };
      }

      if (action.kind === 'validate') {
        const valResult = await this.delegate.validate();
        return {
          success: valResult.valid,
          changedArtifacts: [],
          evidence: { diagnostics: valResult.diagnostics },
          durationMs: Date.now() - startTime,
        };
      }

      if (action.kind === 'save_and_read_back') {
        const res = await this.delegate.saveAndReadBack();
        return {
          success: true,
          changedArtifacts: [],
          evidence: { nodeCount: res.nodes.length, edgeCount: res.edges.length, fingerprint: res.fingerprint },
          durationMs: Date.now() - startTime,
        };
      }

      return {
        success: false,
        changedArtifacts: [],
        evidence: {},
        durationMs: Date.now() - startTime,
        error: `Unsupported X-BRIDGES action kind: "${action.kind}"`,
      };
    } catch (err: unknown) {
      return {
        success: false,
        changedArtifacts: [],
        evidence: {},
        durationMs: Date.now() - startTime,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
