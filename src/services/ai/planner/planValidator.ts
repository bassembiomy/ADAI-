import { PlanEnvelope, PlanEnvelopeSchema } from './planSchemas';
import { CapabilityRegistry } from '../contracts/capabilityRegistry';
import { DependencyGraph } from './dependencyGraph';
import { Diagnostic } from '../contracts/diagnostics';
import {
  validateEngineeringModelPlan as validateBasic,
  EngineeringModelPlanSchema
} from '../contracts/engineeringModel';


export interface PlanValidationContext {
  existingEntityIds: Set<string>;
}

export class PlanValidator {
  public static validate(rawPlan: any, registry: CapabilityRegistry, context: PlanValidationContext): { isValid: boolean; sortedActionIds: string[]; diagnostics: Diagnostic[] } {
    const parseResult = PlanEnvelopeSchema.safeParse(rawPlan);
    if (!parseResult.success) {
      return {
        isValid: false,
        sortedActionIds: [],
        diagnostics: parseResult.error.issues.map((e: any) => ({
          code: 'SCHEMA_PARSE_ERROR',
          severity: 'ERROR',
          message: e.message,
          fieldPath: e.path.join('.')
        }))
      };
    }

    const plan = parseResult.data;
    const diagnostics: Diagnostic[] = [];
    const seenActionIds = new Set<string>();
    const seenIdempotencyKeys = new Set<string>();

    for (const action of plan.actions) {
      if (seenActionIds.has(action.actionId)) {
        diagnostics.push({ code: 'DUPLICATE_ACTION_ID', severity: 'ERROR', message: `Duplicate action ID '${action.actionId}'`, actionId: action.actionId });
      }
      seenActionIds.add(action.actionId);

      if (seenIdempotencyKeys.has(action.idempotencyKey)) {
        diagnostics.push({ code: 'DUPLICATE_IDEMPOTENCY_KEY', severity: 'ERROR', message: `Duplicate idempotency key '${action.idempotencyKey}'`, actionId: action.actionId });
      }
      seenIdempotencyKeys.add(action.idempotencyKey);

      const cap = registry.get(action.type, action.actionSchemaVersion);
      if (!cap) {
        diagnostics.push({ code: 'UNREGISTERED_ACTION_TYPE', severity: 'ERROR', message: `Action '${action.type}' (v${action.actionSchemaVersion}) is not registered.`, actionId: action.actionId });
        continue;
      }

      if (cap.riskClass !== action.risk) {
        diagnostics.push({ code: 'RISK_CLASS_MISMATCH', severity: 'ERROR', message: `Action declared risk '${action.risk}' does not match registered capability risk '${cap.riskClass}'.`, actionId: action.actionId });
      }

      const payloadCheck = cap.payloadSchema.safeParse(action.payload);
      if (!payloadCheck.success) {
        payloadCheck.error.issues.forEach((e: any) => {
          diagnostics.push({
            code: 'INVALID_ACTION_PAYLOAD',
            severity: 'ERROR',
            message: e.message,
            actionId: action.actionId,
            fieldPath: e.path.join('.')
          });
        });
      }
    }

    const { sortedIds, diagnostics: dagDiagnostics } = DependencyGraph.analyzeAndSort(plan.actions);
    diagnostics.push(...dagDiagnostics);

    if (diagnostics.length > 0) {
      return { isValid: false, sortedActionIds: [], diagnostics };
    }

    const availableEntities = new Set<string>(context.existingEntityIds);
    const actionMap = new Map(plan.actions.map(a => [a.actionId, a]));

    for (const actionId of sortedIds) {
      const action = actionMap.get(actionId)!;
      const cap = registry.get(action.type, action.actionSchemaVersion);

      if (cap?.entityLifecycle?.reads) {
        const reads = cap.entityLifecycle.reads(action.payload);
        for (const rId of reads) {
          if (!availableEntities.has(rId)) {
            diagnostics.push({
              code: 'UNRESOLVED_ENTITY_REFERENCE',
              severity: 'ERROR',
              message: `Action '${action.actionId}' reads uncreated or deleted entity '${rId}'.`,
              actionId: action.actionId,
              entityId: rId
            });
          }
        }
      }

      if (cap?.entityLifecycle?.creates) {
        const creates = cap.entityLifecycle.creates(action.payload);
        creates.forEach(cId => availableEntities.add(cId));
      }

      if (cap?.entityLifecycle?.deletes) {
        const deletes = cap.entityLifecycle.deletes(action.payload);
        deletes.forEach(dId => availableEntities.delete(dId));
      }
    }

    return {
      isValid: diagnostics.length === 0,
      sortedActionIds: sortedIds,
      diagnostics
    };
  }

  public static validateEngineeringModelPlan(
    rawPlan: unknown,
    catalog?: {
      findById(id: string): {
        id: string;
        domain: string;
        ports?: readonly { id: string; domain?: string }[];
        parameters?: Readonly<Record<string, { value: number | string; unit?: string }>>;
      } | undefined;
    },
    options?: {
      expectedRevision?: number;
      allowedBridgePairs?: Array<{ fromDomain: any; toDomain: any }>;
    }
  ): { isValid: boolean; diagnostics: Diagnostic[] } {
    // First run structural and topological base validation
    const baseResult = validateBasic(rawPlan, options?.allowedBridgePairs);
    const diagnostics: Diagnostic[] = [...baseResult.diagnostics];


    const parseResult = EngineeringModelPlanSchema.safeParse(rawPlan);
    if (!parseResult.success) {
      return {
        isValid: false,
        diagnostics
      };
    }

    const plan = parseResult.data;

    // Check revision if expectedRevision is provided
    if (options?.expectedRevision !== undefined && plan.baseRevision !== options.expectedRevision) {
      diagnostics.push({
        category: 'SCHEMA',
        code: 'STALE_BASE_REVISION',
        severity: 'ERROR',
        message: `Plan base revision ${plan.baseRevision} does not match expected project revision ${options.expectedRevision}.`,
        expected: options.expectedRevision,
        actual: plan.baseRevision
      });
    }

    // Catalog-level validation
    if (catalog) {
      const blockDefMap = new Map<string, any>();

      for (const block of plan.blocks) {
        const def = catalog.findById(block.blockDefinitionId);
        if (!def) {
          diagnostics.push({
            category: 'TOPOLOGY',
            code: 'UNKNOWN_BLOCK_DEFINITION',
            severity: 'ERROR',
            message: `Block definition '${block.blockDefinitionId}' was not found in catalog for block '${block.id}'.`,
            entityId: block.id
          });
          continue;
        }

        blockDefMap.set(block.id, def);

        // Parameter checks
        if (def.parameters && Object.keys(def.parameters).length > 0) {
          for (const param of block.parameters) {
            if (!(param.parameterName in def.parameters)) {
              diagnostics.push({
                category: 'PARAMETER',
                code: 'INVALID_PARAMETER_NAME',
                severity: 'ERROR',
                message: `Parameter '${param.parameterName}' is not valid for block definition '${block.blockDefinitionId}'.`,
                entityId: block.id,
                fieldPath: `parameters.${param.parameterName}`
              });
            }
          }
        }
      }

      // Connection port checks
      for (const conn of plan.connections) {
        const fromDef = blockDefMap.get(conn.fromBlockId);
        const toDef = blockDefMap.get(conn.toBlockId);

        if (fromDef && Array.isArray(fromDef.ports) && fromDef.ports.length > 0) {
          const hasPort = fromDef.ports.some((p: any) => p.id === conn.fromPortId);
          if (!hasPort) {
            diagnostics.push({
              category: 'TOPOLOGY',
              code: 'UNKNOWN_PORT',
              severity: 'ERROR',
              message: `Port '${conn.fromPortId}' not found on source block '${conn.fromBlockId}' (${fromDef.id}).`,
              entityId: conn.id,
              portId: conn.fromPortId
            });
          }
        }

        if (toDef && Array.isArray(toDef.ports) && toDef.ports.length > 0) {
          const hasPort = toDef.ports.some((p: any) => p.id === conn.toPortId);
          if (!hasPort) {
            diagnostics.push({
              category: 'TOPOLOGY',
              code: 'UNKNOWN_PORT',
              severity: 'ERROR',
              message: `Port '${conn.toPortId}' not found on target block '${conn.toBlockId}' (${toDef.id}).`,
              entityId: conn.id,
              portId: conn.toPortId
            });
          }
        }
      }
    }

    return {
      isValid: diagnostics.length === 0,
      diagnostics
    };
  }
}

