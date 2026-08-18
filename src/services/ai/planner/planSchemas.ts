import { z } from 'zod';

export const RiskClassEnum = z.enum([
  'READ_ONLY',
  'REVERSIBLE_MUTATION',
  'DESTRUCTIVE_MUTATION',
  'EXTERNAL_FILE_EXPORT',
  'CODE_COMPILATION',
  'HARDWARE_COMMUNICATION',
  'HARDWARE_ACTUATION'
]);

export const ActionEnvelopeSchema = z.object({
  actionId: z.string().min(1),
  actionSchemaVersion: z.string().min(1).default('1.0.0'),
  idempotencyKey: z.string().min(1),
  type: z.string().min(1),
  targetModule: z.string().min(1),
  risk: RiskClassEnum,
  dependsOn: z.array(z.string()),
  onFailure: z.enum(['ROLLBACK_PLAN', 'CONTINUE_WITH_WARNING', 'HALT_AND_ASK']),
  preconditions: z.array(z.record(z.string(), z.unknown())).optional(),
  expectedPostconditions: z.array(z.record(z.string(), z.unknown())).optional(),
  payload: z.record(z.string(), z.unknown())
}).strict();

export const PlanEnvelopeSchema = z.object({
  schemaVersion: z.literal('1.0.0'),
  planId: z.string().min(1),
  projectId: z.string().min(1),
  baseRevision: z.number().int().nonnegative(),
  userMessage: z.string(),
  designRationale: z.string(),
  assumptions: z.array(z.string()),
  warnings: z.array(z.string()),
  actions: z.array(ActionEnvelopeSchema)
}).strict();

export type PlanEnvelope = z.infer<typeof PlanEnvelopeSchema>;
export type ActionEnvelope = z.infer<typeof ActionEnvelopeSchema>;
