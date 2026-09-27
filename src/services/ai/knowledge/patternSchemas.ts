import { z } from 'zod';
import { canonicalJson, sha256Hex } from '../../../engine/opm/canonicalHash';

export const PatternProvenanceSchema = z.object({
  source: z.string().min(1),
  author: z.string().min(1),
  license: z.string().min(1),
  licenseApproved: z.boolean(),
  ingestedAt: z.number(),
  originalSourceHash: z.string().optional()
}).strict();

export const PatternLifecycleSchema = z.enum([
  'quarantined',
  'reviewed',
  'verified',
  'deprecated'
]);

export const PatternRequirementsSchema = z.object({
  targetSystem: z.string().min(1),
  targetBehaviors: z.array(z.string()),
  requiredInputs: z.array(z.string()),
  requiredOutputs: z.array(z.string()),
  operatingRanges: z.record(z.string(), z.object({
    min: z.number().optional(),
    max: z.number().optional(),
    unit: z.string().optional()
  }).strict()).optional()
}).strict();

export const PatternTopologyBlockSchema = z.object({
  blockId: z.string().min(1),
  role: z.string().min(1),
  defaultParams: z.record(z.string(), z.unknown()).optional()
}).strict();

export const PatternTopologyConnectionSchema = z.object({
  sourceBlockRole: z.string().min(1),
  sourcePort: z.string().min(1),
  targetBlockRole: z.string().min(1),
  targetPort: z.string().min(1)
}).strict();

export const PatternTopologySchema = z.object({
  blocks: z.array(PatternTopologyBlockSchema),
  connections: z.array(PatternTopologyConnectionSchema)
}).strict();

export const PatternSimulationContractSchema = z.object({
  minDuration: z.number().positive(),
  stepSize: z.number().positive(),
  expectedObservables: z.array(z.string()),
  tolerance: z.record(z.string(), z.number()).optional()
}).strict();

export const PatternEvidenceSchema = z.object({
  proofStatus: z.enum(['proved', 'unproved', 'failed']),
  catalogFingerprint: z.string().min(1),
  engineRunId: z.string().optional(),
  measuredAt: z.number().optional(),
  qualityScore: z.number().min(0).max(1)
}).strict();

export const EngineeringPatternSchema = z.object({
  version: z.number().int().positive(),
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  domain: z.string().min(1),
  provenance: PatternProvenanceSchema,
  lifecycle: PatternLifecycleSchema,
  requirements: PatternRequirementsSchema,
  topology: PatternTopologySchema,
  exactMappings: z.record(z.string(), z.string()),
  simulationContract: PatternSimulationContractSchema,
  evidence: PatternEvidenceSchema,
  contentHash: z.string().length(64)
}).strict();

export type EngineeringPattern = z.infer<typeof EngineeringPatternSchema>;

export const PatternManifestEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.number(),
  lifecycle: PatternLifecycleSchema,
  contentHash: z.string().length(64),
  qualityScore: z.number(),
  filePath: z.string().min(1)
}).strict();

export const PatternManifestSchema = z.object({
  formatVersion: z.literal('1.0.0'),
  manifestHash: z.string().min(1),
  updatedAt: z.number(),
  patterns: z.record(z.string(), PatternManifestEntrySchema)
}).strict();

export type PatternManifest = z.infer<typeof PatternManifestSchema>;

/**
 * Computes canonical SHA-256 hash over pattern payload excluding id and contentHash.
 */
export function computePatternContentHash(
  payload: Omit<EngineeringPattern, 'contentHash' | 'id'>
): string {
  return sha256Hex(canonicalJson(payload));
}

/**
 * Derives stable content-addressed ID with content hash suffix.
 */
export function derivePatternId(name: string, contentHash: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const prefix = slug || 'pattern';
  return `pat_${prefix}_${contentHash.slice(0, 16)}`;
}
