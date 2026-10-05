import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { canonicalJson, sha256Hex } from '../../../../engine/opm/canonicalHash';
import { EngineeringConcept, ConceptLifecycle } from '../contracts/engineeringKnowledge';
import { EngineeringFact } from '../contracts/engineeringKnowledge';
import { ConceptRelationship, ConceptRelationType } from '../contracts/conceptGraph';

export const MAX_RECORD_BYTES = 5 * 1024 * 1024; // 5 MB

export function assertSafeRecordId(id: string): void {
  if (!id || typeof id !== 'string') {
    throw new Error('INVALID_ID: Record ID must be a non-empty string');
  }
  if (id.includes('..') || id.includes('/') || id.includes('\\') || id.includes('\0')) {
    throw new Error(`PATH_TRAVERSAL_DETECTED: Invalid ID '${id}' contains path traversal or forbidden characters`);
  }
}

export function atomicWriteFileSync(targetPath: string, content: string): void {
  const dir = path.dirname(targetPath);
  fs.mkdirSync(dir, { recursive: true });
  const tempPath = `${targetPath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  fs.writeFileSync(tempPath, content, 'utf8');
  try {
    fs.renameSync(tempPath, targetPath);
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === 'EPERM' || code === 'EEXIST') {
      try {
        if (fs.existsSync(targetPath)) {
          fs.unlinkSync(targetPath);
        }
        fs.renameSync(tempPath, targetPath);
      } catch {
        fs.copyFileSync(tempPath, targetPath);
        try {
          fs.unlinkSync(tempPath);
        } catch {
          // ignore cleanup error
        }
      }
    } else {
      throw err;
    }
  }
}

export const ManifestEntrySchema = z.object({
  id: z.string().min(1),
  version: z.number().optional(),
  lifecycle: z.string().optional(),
  contentHash: z.string().length(64),
  filePath: z.string().min(1)
}).strict();
export type ManifestEntry = z.infer<typeof ManifestEntrySchema>;

export const StoreManifestSchema = z.object({
  formatVersion: z.literal('1.0.0'),
  manifestHash: z.string(),
  updatedAt: z.number(),
  entries: z.record(z.string(), ManifestEntrySchema)
}).strict();
export type StoreManifest = z.infer<typeof StoreManifestSchema>;

export interface ConceptFilter {
  lifecycle?: ConceptLifecycle;
  domain?: string;
}

export interface ConceptRepository {
  init(): Promise<void>;
  get(id: string): Promise<EngineeringConcept>;
  put(concept: EngineeringConcept): Promise<EngineeringConcept>;
  list(filter?: ConceptFilter): Promise<EngineeringConcept[]>;
  has(id: string): Promise<boolean>;
}

export interface FactFilter {
  subjectConceptId?: string;
  verified?: boolean;
}

export interface FactRepository {
  init(): Promise<void>;
  get(id: string): Promise<EngineeringFact>;
  put(fact: EngineeringFact): Promise<EngineeringFact>;
  list(filter?: FactFilter): Promise<EngineeringFact[]>;
  has(id: string): Promise<boolean>;
}

export interface RelationshipFilter {
  sourceConceptId?: string;
  targetConceptId?: string;
  relationType?: ConceptRelationType;
  verified?: boolean;
}

export interface RelationshipRepository {
  init(): Promise<void>;
  get(id: string): Promise<ConceptRelationship>;
  put(rel: ConceptRelationship): Promise<ConceptRelationship>;
  list(filter?: RelationshipFilter): Promise<ConceptRelationship[]>;
  has(id: string): Promise<boolean>;
}
