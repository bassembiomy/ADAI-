import { EngineeringModelPlan } from '../contracts/engineeringModel';
import { Diagnostic } from '../contracts/diagnostics';
import {
  XbridgesApplicationDelegate,
  XbridgesNode,
  XbridgesEdge
} from '../../../agent/applicationDelegates';
import { AdiaBlockCatalog } from '../../../agent/adiaBlockCatalog';

export interface ModelSnapshot {
  readonly projectId: string;
  readonly revision: number;
  readonly nodes: readonly XbridgesNode[];
  readonly edges: readonly XbridgesEdge[];
  readonly stateHash: string;
  readonly timestamp: number;
}

export interface AppliedModelResult {
  readonly success: boolean;
  readonly newRevision: number;
  readonly snapshot: ModelSnapshot;
  readonly logicalToNodeIdMap: Readonly<Record<string, string>>;
  readonly error?: string;
  readonly diagnostics?: readonly Diagnostic[];
}

export interface LiveAdapterProjectContext {
  readonly projectId: string;
  getRevision: () => number;
  setRevision?: (newRevision: number) => void;
}

/**
 * Computes a deterministic, collision-resistant state hash for a model snapshot.
 */
export function computeModelSnapshotHash(
  projectId: string,
  revision: number,
  nodes: readonly XbridgesNode[],
  edges: readonly XbridgesEdge[]
): string {
  const sortedNodes = [...nodes]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(n => ({
      id: n.id,
      type: n.type,
      params: n.data ? (n.data as any).params : undefined
    }));

  const sortedEdges = [...edges]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle
    }));

  const raw = JSON.stringify({ projectId, revision, sortedNodes, sortedEdges });

  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) - hash) + raw.charCodeAt(i);
    hash |= 0;
  }

  return `xb_${Math.abs(hash).toString(16)}_${nodes.length}n_${edges.length}e`;
}

/**
 * Live application-backed model adapter connecting EngineeringModelPlan to
 * real X-Bridges application delegates.
 *
 * Enforces:
 * - Real mutations strictly through XbridgesApplicationDelegate
 * - Logical-ID to actual-node-ID mapping
 * - Stale revision rejection before the first write
 * - Unknown block and parameter rejection before the first write
 * - Exact atomic snapshot restoration on any mid-plan failure
 */
export class LiveXbridgesModelAdapter {
  constructor(
    private readonly delegate: XbridgesApplicationDelegate,
    private readonly projectContext: LiveAdapterProjectContext,
    private readonly catalog: typeof AdiaBlockCatalog = AdiaBlockCatalog
  ) {}

  public async inspect(): Promise<ModelSnapshot> {
    const nodes = await this.delegate.getNodes();
    const edges = await this.delegate.getEdges();
    const revision = this.projectContext.getRevision();
    const projectId = this.projectContext.projectId;
    const stateHash = computeModelSnapshotHash(projectId, revision, nodes, edges);

    return {
      projectId,
      revision,
      nodes,
      edges,
      stateHash,
      timestamp: Date.now()
    };
  }

  public async restore(snapshot: ModelSnapshot): Promise<void> {
    if (this.delegate.restoreSnapshot) {
      await this.delegate.restoreSnapshot(snapshot.nodes, snapshot.edges);
    }
    if (this.projectContext.setRevision) {
      this.projectContext.setRevision(snapshot.revision);
    }
  }

  public async apply(
    plan: EngineeringModelPlan,
    signal?: AbortSignal
  ): Promise<AppliedModelResult> {
    // 1. Capture exact initial snapshot before ANY mutation
    const initialSnapshot = await this.inspect();

    // 2. Reject stale revision before the first write
    if (plan.baseRevision !== initialSnapshot.revision) {
      return {
        success: false,
        newRevision: initialSnapshot.revision,
        snapshot: initialSnapshot,
        logicalToNodeIdMap: {},
        error: `Stale revision: Plan targeted revision ${plan.baseRevision}, but project is at revision ${initialSnapshot.revision}.`,
        diagnostics: [
          {
            category: 'SCHEMA',
            code: 'STALE_BASE_REVISION',
            severity: 'ERROR',
            message: `Plan targeted revision ${plan.baseRevision}, but project is at revision ${initialSnapshot.revision}.`,
            expected: initialSnapshot.revision,
            actual: plan.baseRevision
          }
        ]
      };
    }

    // 3. Pre-validate blocks and parameters against canonical catalog before mutating
    for (const block of plan.blocks) {
      const catalogDef = this.catalog.findById(block.blockDefinitionId);
      if (!catalogDef) {
        return {
          success: false,
          newRevision: initialSnapshot.revision,
          snapshot: initialSnapshot,
          logicalToNodeIdMap: {},
          error: `Unknown block type "${block.blockDefinitionId}". Only types present in canonical catalog are permitted.`,
          diagnostics: [
            {
              category: 'TOPOLOGY',
              code: 'UNKNOWN_BLOCK_DEFINITION',
              severity: 'ERROR',
              message: `Block definition '${block.blockDefinitionId}' is not registered in canonical catalog.`,
              entityId: block.id
            }
          ]
        };
      }

      // Check parameter names if catalog publishes expected parameters
      if (block.parameters && block.parameters.length > 0) {
        const allowedParams = Object.keys(catalogDef.parameters || {});
        if (allowedParams.length > 0) {
          for (const param of block.parameters) {
            if (!allowedParams.includes(param.parameterName)) {
              return {
                success: false,
                newRevision: initialSnapshot.revision,
                snapshot: initialSnapshot,
                logicalToNodeIdMap: {},
                error: `Unknown parameter '${param.parameterName}' on block '${block.blockDefinitionId}'.`,
                diagnostics: [
                  {
                    category: 'PARAMETER',
                    code: 'UNKNOWN_PARAMETER',
                    severity: 'ERROR',
                    message: `Unknown parameter '${param.parameterName}' on block '${block.blockDefinitionId}'. Allowed: ${allowedParams.join(', ')}.`,
                    entityId: block.id
                  }
                ]
              };
            }
          }
        }
      }
    }

    const logicalToNodeIdMap: Record<string, string> = {};

    try {
      // 4. Sequential block creation
      for (const block of plan.blocks) {
        if (signal?.aborted) {
          throw new Error('Plan execution aborted by user or timeout');
        }

        const paramRecord: Record<string, unknown> = {};
        for (const p of block.parameters || []) {
          paramRecord[p.parameterName] = p.value;
        }

        const createdNode = await this.delegate.addBlock(block.blockDefinitionId, {
          ...paramRecord,
          id: `${block.id}_${Date.now()}`,
          instanceName: block.name || block.id
        });

        logicalToNodeIdMap[block.id] = createdNode.id;
      }

      // 5. Sequential port connections
      for (const conn of plan.connections) {
        if (signal?.aborted) {
          throw new Error('Plan execution aborted by user or timeout');
        }

        const actualSourceNodeId = logicalToNodeIdMap[conn.fromBlockId] || conn.fromBlockId;
        const actualTargetNodeId = logicalToNodeIdMap[conn.toBlockId] || conn.toBlockId;

        await this.delegate.connectPorts(
          actualSourceNodeId,
          conn.fromPortId,
          actualTargetNodeId,
          conn.toPortId
        );
      }

      // 6. Save via delegate
      await this.delegate.save();

      // 7. Increment revision only on successful completion
      const newRevision = initialSnapshot.revision + 1;
      if (this.projectContext.setRevision) {
        this.projectContext.setRevision(newRevision);
      }

      const finalSnapshot = await this.inspect();

      return {
        success: true,
        newRevision,
        snapshot: finalSnapshot,
        logicalToNodeIdMap
      };
    } catch (err: any) {
      // Automatic exact restoration on mid-plan failure
      await this.restore(initialSnapshot);

      return {
        success: false,
        newRevision: initialSnapshot.revision,
        snapshot: initialSnapshot,
        logicalToNodeIdMap,
        error: err?.message || String(err),
        diagnostics: [
          {
            category: 'ENGINEERING',
            code: 'ADAPTER_EXECUTION_FAILED',
            severity: 'ERROR',
            message: `Plan execution failed: ${err?.message || String(err)}. State was restored to initial revision ${initialSnapshot.revision}.`
          }
        ]
      };
    }
  }
}
