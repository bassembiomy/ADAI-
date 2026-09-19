import { AdiaBlockCatalog } from '../../../agent/adiaBlockCatalog';
import { searchCatalogBlocks, getCanonicalBlockDefinition } from '../retrieval/blockSearch';
import {
  ToolResult,
  createSuccessToolResult,
  createFailureToolResult,
  createRequiresApprovalToolResult
} from '../contracts/toolResults';
import {
  SearchBlocksInputSchema,
  GetBlockDefinitionInputSchema,
  InspectModelInputSchema,
  GetModelSummaryInputSchema,
  ReadDiagnosticsInputSchema,
  CreateModelInputSchema,
  AddBlockInputSchema,
  RemoveBlockInputSchema,
  MoveBlockInputSchema,
  RenameBlockInputSchema,
  SetParameterInputSchema,
  ConnectPortsInputSchema,
  DisconnectPortsInputSchema,
  ValidateModelInputSchema,
  SimulateModelInputSchema,
  UndoTransactionInputSchema
} from './engineeringToolSchemas';
import { XbridgesApplicationDelegate } from '../../../agent/applicationDelegates';
import { LiveXbridgesModelAdapter } from '../adapters/liveXbridgesModelAdapter';

export interface ApprovalTokenBinding {
  readonly token: string;
  readonly projectId: string;
  readonly baseRevision: number;
  readonly toolName?: string;
  readonly parameters?: Record<string, unknown>;
}

export interface ProjectExecutionContext {
  readonly projectId: string;
  readonly currentRevision: number;
  readonly validTokens: Set<string> | Map<string, ApprovalTokenBinding>;
  readonly xbridgesDelegate?: XbridgesApplicationDelegate;
  readonly liveModelAdapter?: LiveXbridgesModelAdapter;
  readonly diagnostics?: any[];
  readonly consumeToken?: (token: string, details: { toolName: string; projectId: string; revision: number }) => boolean;
}

export type ContextProvider = () => ProjectExecutionContext;

export class EngineeringToolDispatcher {
  constructor(private contextProvider: ContextProvider) {
    if (!contextProvider || typeof contextProvider !== 'function') {
      throw new Error('Application context provider is required; default synthetic context is disabled.');
    }
  }

  private getContext(): ProjectExecutionContext {
    const ctx = this.contextProvider();
    if (!ctx || !ctx.projectId) {
      throw new Error('Context provider returned invalid project context.');
    }
    return ctx;
  }

  public async execute(toolName: string, input: unknown): Promise<ToolResult> {
    const startTime = Date.now();
    const ctx = this.getContext();

    try {
      switch (toolName) {
        // --- READ TOOLS ---
        case 'search_blocks': {
          const parsed = SearchBlocksInputSchema.safeParse(input);
          if (!parsed.success) {
            return createFailureToolResult(toolName, `Validation failed: ${parsed.error.message}`, undefined, ctx.currentRevision, Date.now() - startTime);
          }
          const matches = searchCatalogBlocks(parsed.data.query, {
            domainFilter: parsed.data.domainFilter,
            categoryFilter: parsed.data.categoryFilter,
            limit: parsed.data.limit
          });
          return createSuccessToolResult(toolName, { matches, total: matches.length }, ctx.currentRevision, `Found ${matches.length} matching blocks`, Date.now() - startTime);
        }

        case 'get_block_definition': {
          const parsed = GetBlockDefinitionInputSchema.safeParse(input);
          if (!parsed.success) {
            return createFailureToolResult(toolName, `Validation failed: ${parsed.error.message}`, undefined, ctx.currentRevision, Date.now() - startTime);
          }
          const block = getCanonicalBlockDefinition(parsed.data.blockDefinitionId);
          if (!block) {
            return createFailureToolResult(
              toolName,
              `Block definition '${parsed.data.blockDefinitionId}' not found in ADIA catalog.`,
              [{
                category: 'TOPOLOGY',
                code: 'UNKNOWN_BLOCK_DEFINITION',
                severity: 'ERROR',
                message: `Block definition '${parsed.data.blockDefinitionId}' not found in canonical catalog.`
              }],
              ctx.currentRevision,
              Date.now() - startTime
            );
          }
          return createSuccessToolResult(toolName, { block }, ctx.currentRevision, `Retrieved block definition for '${block.id}'`, Date.now() - startTime);
        }

        case 'inspect_model': {
          const parsed = InspectModelInputSchema.safeParse(input);
          if (!parsed.success) {
            return createFailureToolResult(toolName, `Validation failed: ${parsed.error.message}`, undefined, ctx.currentRevision, Date.now() - startTime);
          }
          if (parsed.data.projectId !== ctx.projectId) {
            return createFailureToolResult(toolName, `Access denied: Requested project '${parsed.data.projectId}' does not match active project '${ctx.projectId}'.`, undefined, ctx.currentRevision, Date.now() - startTime);
          }

          if (ctx.liveModelAdapter) {
            const snapshot = await ctx.liveModelAdapter.inspect();
            return createSuccessToolResult(toolName, {
              projectId: snapshot.projectId,
              revision: snapshot.revision,
              domain: parsed.data.domain || 'xbridges',
              blocks: snapshot.nodes,
              connections: snapshot.edges,
              stateHash: snapshot.stateHash
            }, snapshot.revision, 'Live model inspected', Date.now() - startTime);
          }

          if (ctx.xbridgesDelegate) {
            const nodes = await ctx.xbridgesDelegate.getNodes();
            const edges = await ctx.xbridgesDelegate.getEdges();
            return createSuccessToolResult(toolName, {
              projectId: ctx.projectId,
              revision: ctx.currentRevision,
              domain: parsed.data.domain || 'xbridges',
              blocks: nodes,
              connections: edges
            }, ctx.currentRevision, 'Live model inspected from delegate', Date.now() - startTime);
          }

          return createFailureToolResult(toolName, 'Active workspace delegate is not connected.', [{
            category: 'ENGINEERING',
            code: 'DELEGATE_UNAVAILABLE',
            severity: 'ERROR',
            message: 'Active workspace delegate is not connected.'
          }], ctx.currentRevision, Date.now() - startTime);
        }

        case 'get_model_summary': {
          const parsed = GetModelSummaryInputSchema.safeParse(input);
          if (!parsed.success) {
            return createFailureToolResult(toolName, `Validation failed: ${parsed.error.message}`, undefined, ctx.currentRevision, Date.now() - startTime);
          }
          if (parsed.data.projectId !== ctx.projectId) {
            return createFailureToolResult(toolName, `Access denied: Requested project '${parsed.data.projectId}' does not match active project '${ctx.projectId}'.`, undefined, ctx.currentRevision, Date.now() - startTime);
          }

          if (ctx.liveModelAdapter) {
            const snapshot = await ctx.liveModelAdapter.inspect();
            return createSuccessToolResult(toolName, {
              projectId: snapshot.projectId,
              revision: snapshot.revision,
              blockCount: snapshot.nodes.length,
              connectionCount: snapshot.edges.length,
              stateHash: snapshot.stateHash,
              isComplete: true
            }, snapshot.revision, 'Summary retrieved from live model', Date.now() - startTime);
          }

          if (ctx.xbridgesDelegate) {
            const nodes = await ctx.xbridgesDelegate.getNodes();
            const edges = await ctx.xbridgesDelegate.getEdges();
            return createSuccessToolResult(toolName, {
              projectId: ctx.projectId,
              revision: ctx.currentRevision,
              blockCount: nodes.length,
              connectionCount: edges.length,
              isComplete: true
            }, ctx.currentRevision, 'Summary retrieved from delegate', Date.now() - startTime);
          }

          return createFailureToolResult(toolName, 'Active workspace delegate is not connected.', [{
            category: 'ENGINEERING',
            code: 'DELEGATE_UNAVAILABLE',
            severity: 'ERROR',
            message: 'Active workspace delegate is not connected.'
          }], ctx.currentRevision, Date.now() - startTime);
        }

        case 'read_diagnostics': {
          const parsed = ReadDiagnosticsInputSchema.safeParse(input);
          if (!parsed.success) {
            return createFailureToolResult(toolName, `Validation failed: ${parsed.error.message}`, undefined, ctx.currentRevision, Date.now() - startTime);
          }
          if (parsed.data.projectId !== ctx.projectId) {
            return createFailureToolResult(toolName, `Access denied: Requested project '${parsed.data.projectId}' does not match active project '${ctx.projectId}'.`, undefined, ctx.currentRevision, Date.now() - startTime);
          }
          return createSuccessToolResult(toolName, {
            projectId: parsed.data.projectId,
            diagnostics: ctx.diagnostics || []
          }, ctx.currentRevision, 'Diagnostics retrieved', Date.now() - startTime);
        }

        // --- MUTATION INTENTS ---
        case 'create_model': {
          const parsed = CreateModelInputSchema.safeParse(input);
          if (!parsed.success) {
            return createFailureToolResult(toolName, `Validation failed: ${parsed.error.message}`, undefined, ctx.currentRevision, Date.now() - startTime);
          }
          return createFailureToolResult(toolName, 'Creating a project model is not supported by the active workspace delegate.', undefined, ctx.currentRevision, Date.now() - startTime);
        }

        case 'add_block': {
          const parsed = AddBlockInputSchema.safeParse(input);
          if (!parsed.success) {
            return createFailureToolResult(toolName, `Validation failed: ${parsed.error.message}`, undefined, ctx.currentRevision, Date.now() - startTime);
          }

          // Catalog presence check
          if (!AdiaBlockCatalog.isExistingBlockId(parsed.data.blockDefinitionId)) {
            return createFailureToolResult(
              toolName,
              `Block definition '${parsed.data.blockDefinitionId}' not found in catalog.`,
              [{
                category: 'TOPOLOGY',
                code: 'UNKNOWN_BLOCK_DEFINITION',
                severity: 'ERROR',
                message: `Block definition '${parsed.data.blockDefinitionId}' not found in catalog.`
              }],
              ctx.currentRevision,
              Date.now() - startTime
            );
          }

          const validationError = this.validateAndConsumeMutationToken(toolName, parsed.data, ctx);
          if (validationError) return validationError;

          const delegate = ctx.xbridgesDelegate;
          if (!delegate) {
            return createFailureToolResult(toolName, 'Active workspace delegate is not connected.', [{
              category: 'ENGINEERING',
              code: 'DELEGATE_UNAVAILABLE',
              severity: 'ERROR',
              message: 'Active workspace delegate is not connected.'
            }], ctx.currentRevision, Date.now() - startTime);
          }

          const node = await delegate.addBlock(parsed.data.blockDefinitionId, {
            id: parsed.data.blockId,
            instanceName: parsed.data.name || parsed.data.blockId,
            domain: parsed.data.domain
          });
          await delegate.save();

          return createSuccessToolResult(toolName, {
            blockId: node.id,
            blockDefinitionId: parsed.data.blockDefinitionId,
            name: parsed.data.name,
            domain: parsed.data.domain,
            added: true
          }, ctx.currentRevision, `Block '${parsed.data.blockId}' added to live model`, Date.now() - startTime);
        }

        case 'remove_block': {
          const parsed = RemoveBlockInputSchema.safeParse(input);
          if (!parsed.success) {
            return createFailureToolResult(toolName, `Validation failed: ${parsed.error.message}`, undefined, ctx.currentRevision, Date.now() - startTime);
          }
          const delegate = ctx.xbridgesDelegate;
          if (!delegate?.restoreSnapshot) {
            return createFailureToolResult(toolName, 'Active workspace delegate is not connected.', [{
              category: 'ENGINEERING',
              code: 'DELEGATE_UNAVAILABLE',
              severity: 'ERROR',
              message: 'Active workspace delegate is not connected.'
            }], ctx.currentRevision, Date.now() - startTime);
          }

          const currentNodes = await delegate.getNodes();
          if (!currentNodes.some(n => n.id === parsed.data.blockId)) {
            return createFailureToolResult(toolName, `Block '${parsed.data.blockId}' does not exist.`, undefined, ctx.currentRevision, Date.now() - startTime);
          }
          const validationError = this.validateAndConsumeMutationToken(toolName, parsed.data, ctx);
          if (validationError) return validationError;
          const currentEdges = await delegate.getEdges();
          const updatedNodes = currentNodes.filter(n => n.id !== parsed.data.blockId);
          const updatedEdges = currentEdges.filter(e => e.source !== parsed.data.blockId && e.target !== parsed.data.blockId);
          await delegate.restoreSnapshot(updatedNodes, updatedEdges);
          await delegate.save();

          return createSuccessToolResult(toolName, {
            blockId: parsed.data.blockId,
            removed: true
          }, ctx.currentRevision, `Block '${parsed.data.blockId}' removed`, Date.now() - startTime);
        }

        case 'move_block': {
          const parsed = MoveBlockInputSchema.safeParse(input);
          if (!parsed.success) {
            return createFailureToolResult(toolName, `Validation failed: ${parsed.error.message}`, undefined, ctx.currentRevision, Date.now() - startTime);
          }
          return createFailureToolResult(toolName, 'Moving blocks is not supported by the active workspace delegate.', undefined, ctx.currentRevision, Date.now() - startTime);
        }

        case 'rename_block': {
          const parsed = RenameBlockInputSchema.safeParse(input);
          if (!parsed.success) {
            return createFailureToolResult(toolName, `Validation failed: ${parsed.error.message}`, undefined, ctx.currentRevision, Date.now() - startTime);
          }
          const validationError = this.validateAndConsumeMutationToken(toolName, parsed.data, ctx);
          if (validationError) return validationError;

          const delegate = ctx.xbridgesDelegate;
          if (delegate) {
            await delegate.updateParameters(parsed.data.blockId, { instanceName: parsed.data.newName });
            await delegate.save();
          }

          return createSuccessToolResult(toolName, {
            blockId: parsed.data.blockId,
            newName: parsed.data.newName
          }, ctx.currentRevision, `Block '${parsed.data.blockId}' renamed to '${parsed.data.newName}'`, Date.now() - startTime);
        }

        case 'set_parameter': {
          const parsed = SetParameterInputSchema.safeParse(input);
          if (!parsed.success) {
            return createFailureToolResult(toolName, `Validation failed: ${parsed.error.message}`, undefined, ctx.currentRevision, Date.now() - startTime);
          }
          const validationError = this.validateAndConsumeMutationToken(toolName, parsed.data, ctx);
          if (validationError) return validationError;

          const delegate = ctx.xbridgesDelegate;
          if (!delegate) {
            return createFailureToolResult(toolName, 'Active workspace delegate is not connected.', [{
              category: 'ENGINEERING',
              code: 'DELEGATE_UNAVAILABLE',
              severity: 'ERROR',
              message: 'Active workspace delegate is not connected.'
            }], ctx.currentRevision, Date.now() - startTime);
          }

          const updatedNode = await delegate.updateParameters(parsed.data.blockId, {
            [parsed.data.parameterName]: parsed.data.value
          });
          await delegate.save();

          return createSuccessToolResult(toolName, {
            blockId: updatedNode.id,
            parameterName: parsed.data.parameterName,
            value: parsed.data.value,
            unit: parsed.data.unit
          }, ctx.currentRevision, `Parameter '${parsed.data.parameterName}' updated on block '${parsed.data.blockId}'`, Date.now() - startTime);
        }

        case 'connect_ports': {
          const parsed = ConnectPortsInputSchema.safeParse(input);
          if (!parsed.success) {
            return createFailureToolResult(toolName, `Validation failed: ${parsed.error.message}`, undefined, ctx.currentRevision, Date.now() - startTime);
          }
          const validationError = this.validateAndConsumeMutationToken(toolName, parsed.data, ctx);
          if (validationError) return validationError;

          const delegate = ctx.xbridgesDelegate;
          if (!delegate) {
            return createFailureToolResult(toolName, 'Active workspace delegate is not connected.', [{
              category: 'ENGINEERING',
              code: 'DELEGATE_UNAVAILABLE',
              severity: 'ERROR',
              message: 'Active workspace delegate is not connected.'
            }], ctx.currentRevision, Date.now() - startTime);
          }

          const edge = await delegate.connectPorts(
            parsed.data.fromBlockId,
            parsed.data.fromPortId,
            parsed.data.toBlockId,
            parsed.data.toPortId
          );
          await delegate.save();

          return createSuccessToolResult(toolName, {
            connectionId: edge.id,
            fromBlockId: parsed.data.fromBlockId,
            fromPortId: parsed.data.fromPortId,
            toBlockId: parsed.data.toBlockId,
            toPortId: parsed.data.toPortId,
            domain: parsed.data.domain,
            connected: true
          }, ctx.currentRevision, `Connected '${parsed.data.fromBlockId}:${parsed.data.fromPortId}' -> '${parsed.data.toBlockId}:${parsed.data.toPortId}'`, Date.now() - startTime);
        }

        case 'disconnect_ports': {
          const parsed = DisconnectPortsInputSchema.safeParse(input);
          if (!parsed.success) {
            return createFailureToolResult(toolName, `Validation failed: ${parsed.error.message}`, undefined, ctx.currentRevision, Date.now() - startTime);
          }
          const delegate = ctx.xbridgesDelegate;
          if (!delegate?.restoreSnapshot) {
            return createFailureToolResult(toolName, 'Active workspace delegate cannot disconnect ports.', undefined, ctx.currentRevision, Date.now() - startTime);
          }
          const currentEdges = await delegate.getEdges();
          if (!currentEdges.some(e => e.id === parsed.data.connectionId)) {
            return createFailureToolResult(toolName, `Connection '${parsed.data.connectionId}' does not exist.`, undefined, ctx.currentRevision, Date.now() - startTime);
          }
          const validationError = this.validateAndConsumeMutationToken(toolName, parsed.data, ctx);
          if (validationError) return validationError;
          const currentNodes = await delegate.getNodes();
          const updatedEdges = currentEdges.filter(e => e.id !== parsed.data.connectionId);
          await delegate.restoreSnapshot(currentNodes, updatedEdges);
          await delegate.save();

          return createSuccessToolResult(toolName, {
            connectionId: parsed.data.connectionId,
            disconnected: true
          }, ctx.currentRevision, `Connection '${parsed.data.connectionId}' disconnected`, Date.now() - startTime);
        }

        case 'validate_model': {
          const parsed = ValidateModelInputSchema.safeParse(input);
          if (!parsed.success) {
            return createFailureToolResult(toolName, `Validation failed: ${parsed.error.message}`, undefined, ctx.currentRevision, Date.now() - startTime);
          }
          return createFailureToolResult(toolName, 'Validation is unavailable through this dispatcher; no engine validation was run.', undefined, ctx.currentRevision, Date.now() - startTime);
        }

        case 'simulate_model': {
          const parsed = SimulateModelInputSchema.safeParse(input);
          if (!parsed.success) {
            return createFailureToolResult(toolName, `Validation failed: ${parsed.error.message}`, undefined, ctx.currentRevision, Date.now() - startTime);
          }
          return createFailureToolResult(toolName, 'Simulation is unavailable through this dispatcher; no engine run was performed.', undefined, ctx.currentRevision, Date.now() - startTime);
        }

        case 'undo_transaction': {
          const parsed = UndoTransactionInputSchema.safeParse(input);
          if (!parsed.success) {
            return createFailureToolResult(toolName, `Validation failed: ${parsed.error.message}`, undefined, ctx.currentRevision, Date.now() - startTime);
          }
          return createFailureToolResult(toolName, 'Undo is unavailable through this dispatcher; no transaction was reverted.', undefined, ctx.currentRevision, Date.now() - startTime);
        }

        default:
          return createFailureToolResult(
            toolName,
            `Unknown or disallowed tool '${toolName}'.`,
            undefined,
            ctx.currentRevision,
            Date.now() - startTime
          );
      }
    } catch (err: any) {
      return createFailureToolResult(toolName, `Execution error: ${err.message || String(err)}`, undefined, ctx.currentRevision, Date.now() - startTime);
    }
  }

  private validateAndConsumeMutationToken(
    toolName: string,
    data: { projectId: string; projectRevision: number; approvalToken: string },
    ctx: ProjectExecutionContext
  ): ToolResult | null {
    if (data.projectId !== ctx.projectId) {
      return createFailureToolResult(toolName, `Access denied: action project '${data.projectId}' does not match active project '${ctx.projectId}'.`, undefined, ctx.currentRevision);
    }
    // 1. Revision scope check
    if (data.projectRevision !== ctx.currentRevision) {
      return createFailureToolResult(
        toolName,
        `Revision mismatch: Action targeted revision ${data.projectRevision}, but current project revision is ${ctx.currentRevision}.`,
        [{
          category: 'SCHEMA',
          code: 'STALE_BASE_REVISION',
          severity: 'ERROR',
          message: `Stale revision: ${data.projectRevision} vs current ${ctx.currentRevision}`
        }],
        ctx.currentRevision
      );
    }

    // 2. Approval token existence check
    const token = data.approvalToken;
    if (!token) {
      return createFailureToolResult(
        toolName,
        'Mutation requires explicit user approval token.',
        [{
          category: 'SCHEMA',
          code: 'APPROVAL_TOKEN_REQUIRED',
          severity: 'ERROR',
          message: 'Mutation requires valid approval token'
        }],
        ctx.currentRevision
      );
    }

    let isTokenValid = false;

    if (ctx.validTokens instanceof Map) {
      const binding = ctx.validTokens.get(token);
      if (binding) {
        if (binding.projectId === data.projectId && binding.baseRevision === data.projectRevision) {
          if (!binding.toolName || binding.toolName === toolName) {
            isTokenValid = true;
          }
        }
      }
    } else if (ctx.validTokens instanceof Set) {
      isTokenValid = ctx.validTokens.has(token);
    }

    if (!isTokenValid) {
      return createFailureToolResult(
        toolName,
        `Invalid, expired, or mismatched approval token: '${token}'.`,
        [{
          category: 'SCHEMA',
          code: 'APPROVAL_TOKEN_REQUIRED',
          severity: 'ERROR',
          message: 'Mutation requires valid approval token bound to exact project and revision'
        }],
        ctx.currentRevision
      );
    }

    // 3. Consume token so it cannot be reused!
    if (ctx.consumeToken) {
      const consumed = ctx.consumeToken(token, {
        toolName,
        projectId: data.projectId,
        revision: data.projectRevision
      });
      if (!consumed) {
        return createFailureToolResult(
          toolName,
          `Approval token '${token}' has already been consumed and cannot be reused.`,
          [{
            category: 'SCHEMA',
            code: 'TOKEN_ALREADY_CONSUMED',
            severity: 'ERROR',
            message: 'Approval token has already been consumed'
          }],
          ctx.currentRevision
        );
      }
    } else {
      (ctx.validTokens as any).delete(token);
    }

    return null;
  }
}
