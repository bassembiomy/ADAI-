import { z } from 'zod';

export const IRParameterBaseSchema = z.object({
  name: z.string().min(1),
  value: z.unknown().optional(),
  unit: z.string().optional(),
  source: z.enum(['user', 'inferred', 'defaulted', 'catalog']),
  confidence: z.number().min(0).max(1),
  resolutionState: z.enum(['resolved', 'unresolved'])
}).strict();

export const IRParameterSchema = IRParameterBaseSchema.superRefine((data, ctx) => {
  if (data.resolutionState === 'resolved' && data.value === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Parameter '${data.name}' is marked 'resolved' but its value is undefined`,
      path: ['value']
    });
  }
});
export type IRParameter = z.infer<typeof IRParameterSchema>;

export const CapabilityBindingSchema = z.object({
  catalogBlockId: z.string().min(1),
  catalogBlockType: z.string().min(1),
  parameterMapping: z.record(z.string(), z.string()),
  portMapping: z.record(z.string(), z.string())
}).strict();
export type CapabilityBinding = z.infer<typeof CapabilityBindingSchema>;

export const SemanticComponentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  conceptId: z.string().min(1),
  subsystemId: z.string().min(1),
  parameters: z.array(IRParameterSchema),
  capabilityBinding: CapabilityBindingSchema.optional()
}).strict();
export type SemanticComponent = z.infer<typeof SemanticComponentSchema>;

export const SemanticPortSchema = z.object({
  id: z.string().min(1),
  componentId: z.string().min(1),
  name: z.string().min(1),
  direction: z.enum(['in', 'out', 'inout']),
  domain: z.string().min(1),
  dataType: z.string().min(1),
  unit: z.string().optional()
}).strict();
export type SemanticPort = z.infer<typeof SemanticPortSchema>;

export const SemanticConnectionSchema = z.object({
  id: z.string().min(1),
  fromPortId: z.string().min(1),
  toPortId: z.string().min(1),
  semanticType: z.string().min(1)
}).strict();
export type SemanticConnection = z.infer<typeof SemanticConnectionSchema>;

export const IRSubsystemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  parentSubsystemId: z.string().optional(),
  description: z.string().optional()
}).strict();
export type IRSubsystem = z.infer<typeof IRSubsystemSchema>;

export const IRValidationRuleSchema = z.object({
  ruleId: z.string().min(1),
  description: z.string().min(1),
  severity: z.enum(['error', 'warning', 'info'])
}).strict();
export type IRValidationRule = z.infer<typeof IRValidationRuleSchema>;

export const IRTraceLinkSchema = z.object({
  irEntityId: z.string().min(1),
  architectureElementId: z.string().min(1),
  rationale: z.string().optional()
}).strict();
export type IRTraceLink = z.infer<typeof IRTraceLinkSchema>;

export const EngineeringModelIRSchema = z.object({
  schemaVersion: z.literal('1.0.0'),
  modelId: z.string().min(1),
  name: z.string().min(1),
  targetDomain: z.string().min(1),
  baseRevision: z.number().int().nonnegative(),
  subsystems: z.array(IRSubsystemSchema),
  components: z.array(SemanticComponentSchema),
  ports: z.array(SemanticPortSchema),
  connections: z.array(SemanticConnectionSchema),
  assumptions: z.array(z.string()),
  unresolvedParameters: z.array(z.string()),
  validationRules: z.array(IRValidationRuleSchema),
  traceLinks: z.array(IRTraceLinkSchema),
  rationale: z.string()
}).strict();
export type EngineeringModelIR = z.infer<typeof EngineeringModelIRSchema>;

export const BoundEngineeringModelIRSchema = EngineeringModelIRSchema.superRefine((data, ctx) => {
  for (let i = 0; i < data.components.length; i++) {
    const comp = data.components[i];
    if (!comp.capabilityBinding) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Component '${comp.id}' must have a capabilityBinding in BoundEngineeringModelIR`,
        path: ['components', i, 'capabilityBinding']
      });
    }
  }
});
export type BoundEngineeringModelIR = z.infer<typeof BoundEngineeringModelIRSchema>;

export interface ModelIrIntegrityResult {
  valid: boolean;
  errors: string[];
}

export function validateModelIrIntegrity(ir: EngineeringModelIR): ModelIrIntegrityResult {
  const errors: string[] = [];
  const subsystemIds = new Set(ir.subsystems.map(s => s.id));
  const componentIds = new Set(ir.components.map(c => c.id));
  const portIds = new Set(ir.ports.map(p => p.id));

  for (const sub of ir.subsystems) {
    if (sub.parentSubsystemId && !subsystemIds.has(sub.parentSubsystemId)) {
      errors.push(`Subsystem '${sub.id}' references non-existent parentSubsystemId '${sub.parentSubsystemId}'`);
    }
  }

  for (const comp of ir.components) {
    if (!subsystemIds.has(comp.subsystemId)) {
      errors.push(`Component '${comp.id}' references non-existent subsystemId '${comp.subsystemId}'`);
    }
  }

  for (const port of ir.ports) {
    if (!componentIds.has(port.componentId)) {
      errors.push(`Port '${port.id}' references non-existent componentId '${port.componentId}'`);
    }
  }

  for (const conn of ir.connections) {
    if (!portIds.has(conn.fromPortId)) {
      errors.push(`Connection '${conn.id}' references non-existent fromPortId '${conn.fromPortId}'`);
    }
    if (!portIds.has(conn.toPortId)) {
      errors.push(`Connection '${conn.id}' references non-existent toPortId '${conn.toPortId}'`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
