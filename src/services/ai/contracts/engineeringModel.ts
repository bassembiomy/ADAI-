import { z } from 'zod';
import { Diagnostic } from './diagnostics';

export type EngineeringDomain = 'vlab' | 'xbridges' | 'sysml';
export const EngineeringDomainEnum = z.enum(['vlab', 'xbridges', 'sysml']);

export const DiagnosticCategoryEnum = z.enum([
  'SCHEMA',
  'TOPOLOGY',
  'PARAMETER',
  'ENGINEERING',
  'COMPILE',
  'SIMULATION'
]);
export type DiagnosticCategory = z.infer<typeof DiagnosticCategoryEnum>;

export const StructuredDiagnosticSchema = z.object({
  category: DiagnosticCategoryEnum,
  code: z.string().min(1),
  severity: z.enum(['ERROR', 'WARNING', 'INFO']),
  message: z.string().min(1),
  entityId: z.string().optional(),
  portId: z.string().optional(),
  fieldPath: z.string().optional(),
  expected: z.unknown().optional(),
  actual: z.unknown().optional(),
  remediation: z.string().optional()
}).strict();
export type StructuredDiagnostic = z.infer<typeof StructuredDiagnosticSchema>;

export const ParameterIntentSchema = z.object({
  blockId: z.string().min(1),
  parameterName: z.string().min(1),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.unknown()), z.record(z.string(), z.unknown())]),
  unit: z.string().optional()
}).strict();
export type ParameterIntent = z.infer<typeof ParameterIntentSchema>;

export const LogicalBlockSchema = z.object({
  id: z.string().min(1),
  blockDefinitionId: z.string().min(1),
  domain: EngineeringDomainEnum,
  name: z.string().min(1),
  parameters: z.array(ParameterIntentSchema)
}).strict();
export type LogicalBlock = z.infer<typeof LogicalBlockSchema>;

export const LogicalConnectionSchema = z.object({
  id: z.string().min(1),
  fromBlockId: z.string().min(1),
  fromPortId: z.string().min(1),
  toBlockId: z.string().min(1),
  toPortId: z.string().min(1),
  domain: EngineeringDomainEnum
}).strict();
export type LogicalConnection = z.infer<typeof LogicalConnectionSchema>;

export const ValidationCriterionSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  metric: z.string().min(1),
  operator: z.enum(['==', '!=', '<', '<=', '>', '>=']),
  targetValue: z.union([z.string(), z.number(), z.boolean()]),
  unit: z.string().optional()
}).strict();
export type ValidationCriterion = z.infer<typeof ValidationCriterionSchema>;

export const EngineeringModelPlanSchema = z.object({
  schemaVersion: z.literal('1.0.0'),
  planId: z.string().min(1),
  projectId: z.string().min(1),
  baseRevision: z.number().int().nonnegative(),
  targetDomain: EngineeringDomainEnum,
  designRationale: z.string(),
  assumptions: z.array(z.string()),
  blocks: z.array(LogicalBlockSchema),
  connections: z.array(LogicalConnectionSchema),
  validationCriteria: z.array(ValidationCriterionSchema)
}).strict();
export type EngineeringModelPlan = z.infer<typeof EngineeringModelPlanSchema>;

export interface PlanValidationResult {
  isValid: boolean;
  diagnostics: StructuredDiagnostic[];
}

export function validateEngineeringModelPlan(
  rawPlan: unknown,
  allowedBridgePairs: Array<{ fromDomain: EngineeringDomain; toDomain: EngineeringDomain; bridgeBlockDefinitionId?: string }> = []
): PlanValidationResult {
  const parsed = EngineeringModelPlanSchema.safeParse(rawPlan);
  if (!parsed.success) {
    return {
      isValid: false,
      diagnostics: parsed.error.issues.map(issue => ({
        category: 'SCHEMA',
        code: 'SCHEMA_PARSE_ERROR',
        severity: 'ERROR',
        message: issue.message,
        fieldPath: issue.path.join('.')
      }))
    };
  }

  const plan = parsed.data;
  const diagnostics: StructuredDiagnostic[] = [];

  // Check unique block IDs
  const blockIds = new Set<string>();
  const blockDomainMap = new Map<string, EngineeringDomain>();
  for (const block of plan.blocks) {
    if (blockIds.has(block.id)) {
      diagnostics.push({
        category: 'TOPOLOGY',
        code: 'DUPLICATE_BLOCK_ID',
        severity: 'ERROR',
        message: `Duplicate block ID: '${block.id}'`,
        entityId: block.id
      });
    }
    blockIds.add(block.id);
    blockDomainMap.set(block.id, block.domain);
  }

  // Check unique connection IDs
  const connectionIds = new Set<string>();
  for (const conn of plan.connections) {
    if (connectionIds.has(conn.id)) {
      diagnostics.push({
        category: 'TOPOLOGY',
        code: 'DUPLICATE_CONNECTION_ID',
        severity: 'ERROR',
        message: `Duplicate connection ID: '${conn.id}'`,
        entityId: conn.id
      });
    }
    connectionIds.add(conn.id);

    // Endpoint existence
    const fromDomain = blockDomainMap.get(conn.fromBlockId);
    const toDomain = blockDomainMap.get(conn.toBlockId);

    if (!fromDomain || !toDomain) {
      diagnostics.push({
        category: 'TOPOLOGY',
        code: 'UNKNOWN_CONNECTION_ENDPOINT',
        severity: 'ERROR',
        message: `Connection '${conn.id}' references unknown block '${!fromDomain ? conn.fromBlockId : conn.toBlockId}'`,
        entityId: conn.id
      });
      continue;
    }

    // Self-connection detection (connecting block/port to itself)
    if (conn.fromBlockId === conn.toBlockId && conn.fromPortId === conn.toPortId) {
      diagnostics.push({
        category: 'TOPOLOGY',
        code: 'SELF_CONNECTION',
        severity: 'ERROR',
        message: `Self-connection detected on block '${conn.fromBlockId}' port '${conn.fromPortId}'`,
        entityId: conn.id,
        portId: conn.fromPortId
      });
    }

    // Cross-domain connection check
    if (fromDomain !== toDomain) {
      const hasBridge = allowedBridgePairs.some(
        b => b.fromDomain === fromDomain && b.toDomain === toDomain
      );
      if (!hasBridge) {
        diagnostics.push({
          category: 'ENGINEERING',
          code: 'UNBRIDGED_CROSS_DOMAIN_CONNECTION',
          severity: 'ERROR',
          message: `Connection '${conn.id}' crosses domain '${fromDomain}' to '${toDomain}' without a registered bridge.`,
          entityId: conn.id
        });
      }
    }
  }

  return {
    isValid: diagnostics.length === 0,
    diagnostics
  };
}
