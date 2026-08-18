import { PlanEnvelope, PlanEnvelopeSchema } from './planSchemas';
import { CapabilityRegistry } from '../contracts/capabilityRegistry';
import { DependencyGraph } from './dependencyGraph';
import { Diagnostic } from '../contracts/diagnostics';

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
        diagnostics: parseResult.error.errors.map(e => ({
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
        payloadCheck.error.errors.forEach(e => {
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
}
