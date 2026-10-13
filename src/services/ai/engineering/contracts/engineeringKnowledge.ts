import { z } from 'zod';
import { canonicalJson, sha256Hex } from '../../../../engine/opm/canonicalHash';

export const ConceptLifecycleEnum = z.enum([
  'quarantined',
  'reviewed',
  'verified',
  'deprecated'
]);
export type ConceptLifecycle = z.infer<typeof ConceptLifecycleEnum>;

export const ConceptPortVariableSchema = z.object({
  name: z.string().min(1),
  type: z.string().optional(),
  domain: z.string().optional(),
  description: z.string().optional(),
  unit: z.string().optional()
}).strict();
export type ConceptPortVariable = z.infer<typeof ConceptPortVariableSchema>;

export const ConceptDesignParameterSchema = z.object({
  name: z.string().min(1),
  type: z.string().optional(),
  unit: z.string().optional(),
  description: z.string().optional(),
  defaultValue: z.unknown().optional(),
  required: z.boolean().optional()
}).strict();
export type ConceptDesignParameter = z.infer<typeof ConceptDesignParameterSchema>;

export const EngineeringConceptSchema = z.object({
  schemaVersion: z.literal('1.0.0'),
  id: z.string().min(1),
  canonicalName: z.string().min(1),
  aliases: z.array(z.string()),
  domain: z.string().min(1),
  description: z.string(),
  functionalRoles: z.array(z.string()),
  requiredConcepts: z.array(z.string()),
  optionalConcepts: z.array(z.string()),
  alternatives: z.array(z.string()),
  inputs: z.array(ConceptPortVariableSchema),
  outputs: z.array(ConceptPortVariableSchema),
  designParameters: z.array(ConceptDesignParameterSchema),
  constraints: z.array(z.string()),
  assumptions: z.array(z.string()),
  applicableMethods: z.array(z.string()),
  validationRuleIds: z.array(z.string()),
  referenceIds: z.array(z.string()),
  lifecycle: ConceptLifecycleEnum,
  confidence: z.number().min(0).max(1),
  provenanceIds: z.array(z.string()),
  contentHash: z.string().length(64)
}).strict();
export type EngineeringConcept = z.infer<typeof EngineeringConceptSchema>;

export const FactObjectSchema = z.object({
  type: z.enum(['string', 'number', 'boolean', 'concept_ref', 'json']),
  value: z.unknown()
}).strict();
export type FactObject = z.infer<typeof FactObjectSchema>;

export const FactExtractionMethodEnum = z.enum([
  'rule',
  'llm_extracted',
  'human_verified',
  'catalog_derived'
]);
export type FactExtractionMethod = z.infer<typeof FactExtractionMethodEnum>;

export const FactReviewSchema = z.object({
  reviewerId: z.string().optional(),
  reviewedAt: z.number().optional(),
  notes: z.string().optional(),
  status: z.enum(['pending', 'approved', 'rejected'])
}).strict();
export type FactReview = z.infer<typeof FactReviewSchema>;

export const EngineeringFactSchema = z.object({
  schemaVersion: z.literal('1.0.0'),
  id: z.string().min(1),
  subjectConceptId: z.string().min(1),
  predicate: z.string().min(1),
  object: FactObjectSchema,
  conditions: z.array(z.string()),
  units: z.string().optional(),
  confidence: z.number().min(0).max(1),
  verified: z.boolean(),
  sourceId: z.string().min(1),
  documentId: z.string().min(1),
  sectionLocator: z.string().min(1),
  extractionMethod: FactExtractionMethodEnum,
  review: FactReviewSchema,
  version: z.number().int().positive(),
  validFrom: z.number(),
  supersedes: z.string().optional(),
  contentHash: z.string().length(64)
}).strict();
export type EngineeringFact = z.infer<typeof EngineeringFactSchema>;

export function computeConceptHash(concept: Record<string, unknown>): string {
  const { contentHash: _ignored, ...hashable } = concept;
  return sha256Hex(canonicalJson(hashable));
}

export function computeFactHash(fact: Record<string, unknown>): string {
  const { contentHash: _ignored, ...hashable } = fact;
  return sha256Hex(canonicalJson(hashable));
}
