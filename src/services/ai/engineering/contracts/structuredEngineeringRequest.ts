import { z } from 'zod';

export const RequestUnderstandingStatusSchema = z.enum([
  'ready',
  'clarification_required',
  'unsupported',
  'invalid'
]);
export type RequestUnderstandingStatus = z.infer<typeof RequestUnderstandingStatusSchema>;

export const ExtractedValueKindSchema = z.enum([
  'number',
  'unit_value',
  'enum',
  'text',
  'reference'
]);
export type ExtractedValueKind = z.infer<typeof ExtractedValueKindSchema>;

export const ExtractedValueSchema = z.object({
  id: z.string().min(1),
  kind: ExtractedValueKindSchema,
  sourceText: z.string().min(1),
  normalizedValue: z.unknown(),
  unit: z.string().optional(),
  confidence: z.number().min(0).max(1)
}).strict();
export type ExtractedValue = z.infer<typeof ExtractedValueSchema>;

export const RequestEntitySchema = z.object({
  id: z.string().min(1),
  semanticType: z.string().min(1),
  sourceText: z.string().min(1),
  catalogBlockId: z.string().optional(),
  confidence: z.number().min(0).max(1)
}).strict();
export type RequestEntity = z.infer<typeof RequestEntitySchema>;

export const RequestRelationshipTypeSchema = z.enum([
  'feeds',
  'controls',
  'observes',
  'feedback',
  'references'
]);
export type RequestRelationshipType = z.infer<typeof RequestRelationshipTypeSchema>;

export const RequestRelationshipSchema = z.object({
  id: z.string().min(1),
  type: RequestRelationshipTypeSchema,
  sourceEntityId: z.string().min(1),
  targetEntityId: z.string().min(1),
  sourceText: z.string().min(1)
}).strict();
export type RequestRelationship = z.infer<typeof RequestRelationshipSchema>;

export const RequirementClassificationSchema = z.enum([
  'REQUIRED',
  'OPTIONAL',
  'INFERABLE',
  'DEFAULTABLE'
]);
export type RequirementClassification = z.infer<typeof RequirementClassificationSchema>;

export const UnresolvedRequirementSchema = z.object({
  id: z.string().min(1),
  slotName: z.string().min(1),
  classification: RequirementClassificationSchema,
  valueSchema: z.string().min(1),
  prompt: z.string().min(1),
  reason: z.string().min(1),
  affectedDecisionIds: z.array(z.string()),
  status: z.enum(['unresolved', 'resolved']),
  resolvedValue: z.unknown().optional()
}).strict();
export type UnresolvedRequirement = z.infer<typeof UnresolvedRequirementSchema>;

export const RequestIntentKindSchema = z.enum([
  'create',
  'modify',
  'inspect',
  'validate',
  'simulate',
  'optimize'
]);
export type RequestIntentKind = z.infer<typeof RequestIntentKindSchema>;

export const RequestEvidenceSchema = z.object({
  source: z.enum(['user', 'catalog', 'memory']),
  description: z.string().min(1)
}).strict();
export type RequestEvidence = z.infer<typeof RequestEvidenceSchema>;

export const StructuredEngineeringRequestSchema = z.object({
  schemaVersion: z.literal('1.0.0'),
  requestId: z.string().min(1),
  originalText: z.string().min(1),
  normalizedText: z.string().min(1),
  intent: RequestIntentKindSchema,
  operations: z.array(z.string()),
  entities: z.array(RequestEntitySchema),
  values: z.array(ExtractedValueSchema),
  relationships: z.array(RequestRelationshipSchema),
  requestedOutputs: z.array(z.string()),
  constraints: z.array(z.string()),
  unresolvedRequirements: z.array(UnresolvedRequirementSchema),
  confidence: z.number().min(0).max(1),
  evidence: z.array(RequestEvidenceSchema)
}).strict();
export type StructuredEngineeringRequest = z.infer<typeof StructuredEngineeringRequestSchema>;

export const ActiveRequestSessionStateSchema = z.enum([
  'understanding',
  'clarifying',
  'planning',
  'awaiting_approval',
  'completed',
  'cancelled'
]);
export type ActiveRequestSessionState = z.infer<typeof ActiveRequestSessionStateSchema>;

export const ActiveRequestSessionSchema = z.object({
  sessionId: z.string().min(1),
  projectId: z.string().min(1),
  request: StructuredEngineeringRequestSchema,
  architecturePlanId: z.string().optional(),
  activeSlotId: z.string().optional(),
  answeredSlotIds: z.array(z.string()),
  state: ActiveRequestSessionStateSchema,
  revision: z.number().int().min(0)
}).strict();
export type ActiveRequestSession = z.infer<typeof ActiveRequestSessionSchema>;

export const RequestUnderstandingResultSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ready'),
    request: StructuredEngineeringRequestSchema
  }).strict(),
  z.object({
    status: z.literal('clarification_required'),
    request: StructuredEngineeringRequestSchema,
    blockingRequirement: UnresolvedRequirementSchema
  }).strict(),
  z.object({
    status: z.literal('unsupported'),
    reason: z.string().min(1),
    request: StructuredEngineeringRequestSchema.optional()
  }).strict(),
  z.object({
    status: z.literal('invalid'),
    errors: z.array(z.string()),
    request: StructuredEngineeringRequestSchema.optional()
  }).strict()
]);
export type RequestUnderstandingResult = z.infer<typeof RequestUnderstandingResultSchema>;
