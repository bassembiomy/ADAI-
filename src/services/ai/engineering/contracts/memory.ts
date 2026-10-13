import { z } from 'zod';

export const DialogueTurnSchema = z.object({
  id: z.string().min(1),
  timestamp: z.number(),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
  resolvedReferences: z.record(z.string(), z.string()).optional()
}).strict();
export type DialogueTurn = z.infer<typeof DialogueTurnSchema>;

export const ConversationMemorySnapshotSchema = z.object({
  sessionId: z.string().min(1),
  turns: z.array(DialogueTurnSchema),
  activeConceptIds: z.array(z.string()),
  lastActiveAt: z.number()
}).strict();
export type ConversationMemorySnapshot = z.infer<typeof ConversationMemorySnapshotSchema>;

export const ProjectDecisionRecordSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  decisionKey: z.string().min(1),
  title: z.string().min(1),
  value: z.unknown(),
  rationale: z.string(),
  approvedBy: z.string().min(1),
  approvedAt: z.number(),
  supersedes: z.string().optional(),
  supersededAt: z.number().optional(),
  status: z.enum(['active', 'superseded', 'revoked']),
  provenance: z.object({
    source: z.enum(['user_approval', 'spec_engine', 'agent_proposal']),
    sourceId: z.string().optional()
  }).strict()
}).strict();
export type ProjectDecisionRecord = z.infer<typeof ProjectDecisionRecordSchema>;

export const ProjectMemorySnapshotSchema = z.object({
  projectId: z.string().min(1),
  projectName: z.string(),
  decisions: z.array(ProjectDecisionRecordSchema),
  assumptions: z.array(z.object({ id: z.string(), statement: z.string(), source: z.string() })),
  resolvedSlots: z.record(z.string(), z.unknown()),
  createdAt: z.number(),
  updatedAt: z.number()
}).strict();
export type ProjectMemorySnapshot = z.infer<typeof ProjectMemorySnapshotSchema>;

export const ModelSnapshotRecordSchema = z.object({
  modelId: z.string().min(1),
  projectId: z.string().min(1),
  revision: z.number().int().nonnegative(),
  name: z.string().min(1),
  targetDomain: z.string().min(1),
  timestamp: z.number(),
  modelPlanFingerprint: z.string().optional(),
  modelIrHash: z.string().optional()
}).strict();
export type ModelSnapshotRecord = z.infer<typeof ModelSnapshotRecordSchema>;

export const ModelMemorySnapshotSchema = z.object({
  modelId: z.string().min(1),
  projectId: z.string().min(1),
  activeRevision: z.number().int().nonnegative(),
  revisions: z.array(ModelSnapshotRecordSchema),
  lastSavedAt: z.number()
}).strict();
export type ModelMemorySnapshot = z.infer<typeof ModelMemorySnapshotSchema>;
