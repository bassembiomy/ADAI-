import { z } from 'zod';
import { EngineeringPatternSchema } from '../patternSchemas';

export const PERMISSIVE_SPDX_LICENSES = [
  'MIT',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  'CC0-1.0',
  'CC-BY-4.0',
  'Unlicense'
] as const;

export const SourceCandidateSchema = z.object({
  sourceUrl: z.string().min(1),
  origin: z.string().min(1),
  title: z.string().min(1),
  content: z.string(),
  contentType: z.enum(['text/plain', 'application/json', 'application/xml', 'text/markdown']),
  checksum: z.string().length(64),
  license: z.string().min(1),
  author: z.string().min(1),
  retrievedAt: z.number().int().positive(),
  isUserOwned: z.boolean().optional(),
  requiresAuth: z.boolean().optional(),
  isPaywalled: z.boolean().optional(),
  hasMacros: z.boolean().optional(),
  isExecutable: z.boolean().optional()
}).strict();

export type SourceCandidate = z.infer<typeof SourceCandidateSchema>;

export const PolicyEvaluationVerdictSchema = z.enum([
  'accept_quarantine',
  'reject'
]);

export const PolicyEvaluationResultSchema = z.object({
  verdict: PolicyEvaluationVerdictSchema,
  reason: z.string(),
  violations: z.array(z.string()),
  effectiveLicense: z.string(),
  isPermissive: z.boolean()
}).strict();

export type PolicyEvaluationResult = z.infer<typeof PolicyEvaluationResultSchema>;

export const QuarantinedPatternSchema = EngineeringPatternSchema.extend({
  lifecycle: z.literal('quarantined'),
  quarantineMetadata: z.object({
    sourceCandidateChecksum: z.string().length(64),
    sourceUrl: z.string().min(1),
    evaluatedAt: z.number().int().positive(),
    policyVerdict: PolicyEvaluationVerdictSchema,
    rawLicense: z.string()
  }).strict()
}).strict();

export type QuarantinedPattern = z.infer<typeof QuarantinedPatternSchema>;

export const PromotionReviewSchema = z.object({
  reviewer: z.string().min(1),
  reviewedAt: z.number().int().positive(),
  approvedTargetLifecycle: z.enum(['reviewed', 'verified']),
  notes: z.string().min(1),
  proofEvidenceRunId: z.string().min(1),
  catalogFingerprint: z.string().min(1)
}).strict();

export type PromotionReview = z.infer<typeof PromotionReviewSchema>;
