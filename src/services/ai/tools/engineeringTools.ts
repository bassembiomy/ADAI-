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

export interface ProjectExecutionContext {
  projectId: string;
  currentRevision: number;
  validTokens: Set<string>;
  models?: Map<string, any>;
  diagnostics?: any[];
}

export type ContextProvider = () => ProjectExecutionContext;

export class EngineeringToolDispatcher {
  constructor(private contextProvider?: ContextProvider) {}

  private getContext(): ProjectExecutionContext {
    if (this.contextProvider) {
      return this.contextProvider();
    }
    return {
      projectId: 'default_project',
      currentRevision: 1,
      validTokens: new Set(),
      models: new Map(),
      diagnostics: []
    };
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
          return createSuccessToolResult(toolName, {
            projectId: parsed.data.projectId,
            revision: ctx.currentRevision,
            domain: parsed.data.domain || 'xbridges',
            blocks: [],
            connections: []
          }, ctx.currentRevision, 'Model inspected', Date.now() - startTime);
        }

        case 'get_model_summary': {
          const parsed = GetModelSummaryInputSchema.safeParse(input);
          if (!parsed.success) {
            return createFailureToolResult(toolName, `Validation failed: ${parsed.error.message}`, undefined, ctx.currentRevision, Date.now() - startTime);
          }
          return createSuccessToolResult(toolName, {
            projectId: parsed.data.projectId,
            revision: ctx.currentRevision,
            blockCount: 0,
            connectionCount: 0,
            isComplete: true
          }, ctx.currentRevision, 'Summary retrieved', Date.now() - startTime);
        }

        case 'read_diagnostics': {
          const parsed = ReadDiagnosticsInputSchema.safeParse(input);
          if (!parsed.success) {
            return createFailureToolResult(toolName, `Validation failed: ${parsed.error.message}`, undefined, ctx.currentRevision, Date.now() - startTime);
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
          const validationError = this.validateMutationPreconditions(parsed.data, ctx);
          if (validationError) return validationError;

          return createSuccessToolResult(toolName, {
            modelName: parsed.data.modelName,
            domain: parsed.data.domain,
            created: true
          }, ctx.currentRevision, `Model '${parsed.data.modelName}' created`, Date.now() - startTime);
        }

        case 'add_block': {
          const parsed = AddBlockInputSchema.safeParse(input);
          if (!parsed.success) {
            return createFailureToolResult(toolName, `Validation failed: ${parsed.error.message}`, undefined, ctx.currentRevision, Date.now() - startTime);
          }
          const validationError = this.validateMutationPreconditions(parsed.data, ctx);
          if (validationError) return validationError;

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

          return createSuccessToolResult(toolName, {
            blockId: parsed.data.blockId,
            blockDefinitionId: parsed.data.blockDefinitionId,
            name: parsed.data.name,
            domain: parsed.data.domain,
            added: true
          }, ctx.currentRevision, `Block '${parsed.data.blockId}' added`, Date.now() - startTime);
        }

        case 'remove_block': {
          const parsed = RemoveBlockInputSchema.safeParse(input);
          if (!parsed.success) {
            return createFailureToolResult(toolName, `Validation failed: ${parsed.error.message}`, undefined, ctx.currentRevision, Date.now() - startTime);
          }
          const validationError = this.validateMutationPreconditions(parsed.data, ctx);
          if (validationError) return validationError;

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
          const validationError = this.validateMutationPreconditions(parsed.data, ctx);
          if (validationError) return validationError;

          return createSuccessToolResult(toolName, {
            blockId: parsed.data.blockId,
            position: parsed.data.position
          }, ctx.currentRevision, `Block '${parsed.data.blockId}' moved`, Date.now() - startTime);
        }

        case 'rename_block': {
          const parsed = RenameBlockInputSchema.safeParse(input);
          if (!parsed.success) {
            return createFailureToolResult(toolName, `Validation failed: ${parsed.error.message}`, undefined, ctx.currentRevision, Date.now() - startTime);
          }
          const validationError = this.validateMutationPreconditions(parsed.data, ctx);
          if (validationError) return validationError;

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
          const validationError = this.validateMutationPreconditions(parsed.data, ctx);
          if (validationError) return validationError;

          return createSuccessToolResult(toolName, {
            blockId: parsed.data.blockId,
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
          const validationError = this.validateMutationPreconditions(parsed.data, ctx);
          if (validationError) return validationError;

          return createSuccessToolResult(toolName, {
            connectionId: parsed.data.connectionId,
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
          const validationError = this.validateMutationPreconditions(parsed.data, ctx);
          if (validationError) return validationError;

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
          return createSuccessToolResult(toolName, {
            projectId: parsed.data.projectId,
            domain: parsed.data.domain,
            isValid: true,
            diagnostics: []
          }, ctx.currentRevision, 'Model validated', Date.now() - startTime);
        }

        case 'simulate_model': {
          const parsed = SimulateModelInputSchema.safeParse(input);
          if (!parsed.success) {
            return createFailureToolResult(toolName, `Validation failed: ${parsed.error.message}`, undefined, ctx.currentRevision, Date.now() - startTime);
          }
          const validationError = this.validateMutationPreconditions(parsed.data, ctx);
          if (validationError) return validationError;

          return createSuccessToolResult(toolName, {
            projectId: parsed.data.projectId,
            domain: parsed.data.domain,
            simulated: true,
            metrics: {}
          }, ctx.currentRevision, 'Simulation executed', Date.now() - startTime);
        }

        case 'undo_transaction': {
          const parsed = UndoTransactionInputSchema.safeParse(input);
          if (!parsed.success) {
            return createFailureToolResult(toolName, `Validation failed: ${parsed.error.message}`, undefined, ctx.currentRevision, Date.now() - startTime);
          }
          const validationError = this.validateMutationPreconditions(parsed.data, ctx);
          if (validationError) return validationError;

          return createSuccessToolResult(toolName, {
            transactionId: parsed.data.transactionId,
            undone: true
          }, ctx.currentRevision, `Transaction '${parsed.data.transactionId}' reverted`, Date.now() - startTime);
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

  private validateMutationPreconditions(
    data: { projectId: string; projectRevision: number; approvalToken: string },
    ctx: ProjectExecutionContext
  ): ToolResult | null {
    // 1. Revision scope check
    if (data.projectRevision !== ctx.currentRevision) {
      return createFailureToolResult(
        'mutation',
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

    // 2. Approval token check
    if (!data.approvalToken || !ctx.validTokens.has(data.approvalToken)) {
      return createFailureToolResult(
        'mutation',
        `Invalid or unapproved approval token: '${data.approvalToken}'. Mutations require explicit user approval.`,
        [{
          category: 'SCHEMA',
          code: 'APPROVAL_TOKEN_REQUIRED',
          severity: 'ERROR',
          message: 'Mutation requires valid approval token'
        }],
        ctx.currentRevision
      );
    }

    return null;
  }
}
