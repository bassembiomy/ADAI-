import { z } from 'zod';

export const KnowledgeReviewEvidenceChecksSchema = z.object({
  licenseApproved: z.boolean(),
  sourceReliabilityPassed: z.boolean(),
  conflictCheckPassed: z.boolean(),
  validationPassed: z.boolean()
}).strict();
export type KnowledgeReviewEvidenceChecks = z.infer<typeof KnowledgeReviewEvidenceChecksSchema>;

export const KnowledgeReviewDecisionSchema = z.object({
  reviewerId: z.string().min(1),
  reviewedAt: z.number(),
  status: z.enum(['approved', 'rejected']),
  targetLifecycle: z.enum(['reviewed', 'verified', 'deprecated']),
  notes: z.string().min(1),
  evidenceChecks: KnowledgeReviewEvidenceChecksSchema
}).strict();
export type KnowledgeReviewDecision = z.infer<typeof KnowledgeReviewDecisionSchema>;
