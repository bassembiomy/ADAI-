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

/**
 * Create an XbridgesApplicationDelegate backed by live React state.
 *
 * The returned delegate captures `getNodes`, `getEdges`, `setNodes`, `setEdges`,
 * and `onSave` at construction time. App.tsx should reconstruct the delegate
 * via `useMemo` when the active workspace or state setters change.
 */
export function createXbridgesDelegate(opts: XbridgesAdapterOptions): XbridgesApplicationDelegate {
  const { getNodes, getEdges, setNodes, setEdges, onSave } = opts;

  /**
   * Convert a ReactFlow node to the lean XbridgesNode shape the agent layer
   * uses. The agent never receives internal React Flow-specific fields.
   */
  function toAgentNode(n: ReactFlowXbridgesNode): XbridgesNode {
    return { id: n.id, type: String(n.data?.type ?? n.type), data: { ...(n.data as Record<string, unknown>) } };
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
      const blockDef = factory(id, params);

      const newNode: ReactFlowXbridgesNode = {
        id: blockDef.id,
        type: 'xblock',
        position: { x: 200, y: 200 }, // default position; caller may later move it
        data: {
          ...blockDef,
          instanceName: (params?.instanceName as string) || id,
          selected: false,
        } as ReactFlowXbridgesNode['data'],
      };

      // Capture the created node for the return value before the async update.
      const agentNode = toAgentNode(newNode);

      // Update state synchronously via the setter; React batches this.
      setNodes((prev) => [...prev, newNode]);

      return agentNode;
    },

    async connectPorts(
      sourceNodeId: string,
      sourcePortId: string,
      targetNodeId: string,
      targetPortId: string,
    ): Promise<XbridgesEdge> {
      const nodes = getNodes();

      const sourceNode = nodes.find(
        (n) => n.id === sourceNodeId || (n.data as any)?.instanceName === sourceNodeId || (n.data as any)?.id === sourceNodeId
      );
      if (!sourceNode) {
        throw new XbridgesAdapterError(`Source node "${sourceNodeId}" not found.`);
      }

      const targetNode = nodes.find(
        (n) => n.id === targetNodeId || (n.data as any)?.instanceName === targetNodeId || (n.data as any)?.id === targetNodeId
      );
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

      // updatedNode is set synchronously by the map above.
      return toAgentNode(updatedNode ?? existing);
    },

    async save(): Promise<void> {
      // Capture current state at call time and hand it to the existing
      // handleXBridgesSave callback, which calls setGlobalXBridgesNodes/Edges
      // and any other persistence logic.
      const nodes = getNodes();
      const edges = getEdges();
      onSave(nodes, edges, []);
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
      if (action.kind === 'instantiate_block') {
        const blockType = (payload.blockType ?? payload.type) as string;
        const nestedParams = (payload.parameters ?? payload.params ?? {}) as Record<string, unknown>;
        const params = { ...payload, ...nestedParams };

        if (!blockType) {
          return {
            success: false,
            changedArtifacts: [],
            evidence: {},
            durationMs: Date.now() - startTime,
            error: 'Missing required blockType in instantiate_block action params',
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

      if (action.kind === 'connect_ports') {
        const sourceNodeId = (payload.sourceNodeId ?? payload.sourceNode) as string;
        const sourcePortId = (payload.sourcePortId ?? payload.sourcePort) as string;
        const targetNodeId = (payload.targetNodeId ?? payload.targetNode) as string;
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

      if (action.kind === 'configure_parameters') {
        const nodeId = (payload.nodeId ?? payload.blockId ?? payload.instanceName) as string;
        const params = (payload.parameters ?? payload.params ?? {}) as Record<string, unknown>;

        if (!nodeId) {
          return {
            success: false,
            changedArtifacts: [],
            evidence: {},
            durationMs: Date.now() - startTime,
            error: 'configure_parameters requires nodeId or blockId',
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
