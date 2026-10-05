import { z } from 'zod';
import { canonicalJson, sha256Hex } from '../../../../engine/opm/canonicalHash';

export const ConceptRelationTypeEnum = z.enum([
  'requires',
  'uses',
  'controls',
  'measures',
  'produces',
  'accepts',
  'alternative_to',
  'specializes',
  'composed_of',
  'implemented_by'
]);
export type ConceptRelationType = z.infer<typeof ConceptRelationTypeEnum>;

export const ConceptCardinalityEnum = z.enum([
  'one_to_one',
  'one_to_many',
  'many_to_one',
  'many_to_many'
]);
export type ConceptCardinality = z.infer<typeof ConceptCardinalityEnum>;

export const ConceptRelationshipBaseSchema = z.object({
  schemaVersion: z.literal('1.0.0'),
  id: z.string().min(1),
  sourceConceptId: z.string().min(1),
  relationType: ConceptRelationTypeEnum,
  targetConceptId: z.string().min(1),
  cardinality: ConceptCardinalityEnum.optional(),
  conditions: z.array(z.string()),
  priority: z.number(),
  confidence: z.number().min(0).max(1),
  verified: z.boolean(),
  sourceId: z.string().min(1),
  documentId: z.string().min(1),
  sectionLocator: z.string().min(1),
  contentHash: z.string().length(64)
}).strict();

export const ConceptRelationshipSchema = ConceptRelationshipBaseSchema.superRefine((data, ctx) => {
  if (data.sourceConceptId === data.targetConceptId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Relationship ${data.id} cannot be self-referencing: source and target are both '${data.sourceConceptId}'`,
      path: ['targetConceptId']
    });
  }
});
export type ConceptRelationship = z.infer<typeof ConceptRelationshipBaseSchema>;

export function computeRelationshipHash(rel: Record<string, unknown>): string {
  const { contentHash: _ignored, ...hashable } = rel;
  return sha256Hex(canonicalJson(hashable));
}
