import { z } from 'zod';

export const IntentKindEnum = z.enum([
  'create',
  'modify',
  'inspect',
  'validate',
  'simulate',
  'optimize'
]);
export type IntentKind = z.infer<typeof IntentKindEnum>;

export const RequestedFidelityEnum = z.enum([
  'low',
  'medium',
  'high',
  'symbolic',
  'dynamic'
]);
export type RequestedFidelity = z.infer<typeof RequestedFidelityEnum>;

export const SemanticOperationSchema = z.object({
  type: z.string().min(1),
  parameters: z.record(z.string(), z.unknown()).optional(),
  targetConceptId: z.string().optional()
}).strict();
export type SemanticOperation = z.infer<typeof SemanticOperationSchema>;

export const IntentEvidenceSchema = z.object({
  sourceId: z.string().min(1),
  description: z.string(),
  score: z.number().min(0).max(1).optional()
}).strict();
export type IntentEvidence = z.infer<typeof IntentEvidenceSchema>;

export const EngineeringIntentSchema = z.object({
  schemaVersion: z.literal('1.0.0'),
  id: z.string().min(1),
  intent: IntentKindEnum,
  objective: z.string().min(1),
  domainCandidates: z.array(z.string()),
  systemConceptIds: z.array(z.string()),
  operations: z.array(SemanticOperationSchema),
  controlledVariables: z.array(z.string()),
  actuators: z.array(z.string()),
  plants: z.array(z.string()),
  sensors: z.array(z.string()),
  inputs: z.array(z.string()),
  outputs: z.array(z.string()),
  constraints: z.array(z.string()),
  requestedFidelity: RequestedFidelityEnum,
  references: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  unknownTerms: z.array(z.string()),
  unresolvedReferences: z.array(z.string()),
  evidence: z.array(IntentEvidenceSchema)
}).strict();
export type EngineeringIntent = z.infer<typeof EngineeringIntentSchema>;
